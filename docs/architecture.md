# アーキテクチャ詳細

## データフロー

```
TEPCO CSV (Shift_JIS)
    │
    ▼
┌─────────────────────┐
│  データ取込スクリプト   │  CSV ダウンロード → UTF-8 変換 → パース
│  (Edge Function)     │
└─────────┬───────────┘
          │ INSERT
          ▼
┌─────────────────────┐
│  raw_tepco_demand    │  生データをそのまま格納
│  (raw レイヤー)       │  dedup キー: date + time + area
└─────────┬───────────┘
          │ dbt run
          ▼
┌─────────────────────┐
│  stg_tepco_demand    │  型変換・クレンジング・dedup
│  (staging レイヤー)   │  万kW → MW 変換、タイムゾーン正規化
└─────────┬───────────┘
          │ dbt run
          ▼
┌─────────────────────┐
│  mart_daily_demand   │  日次集計（最大/最小/平均）
│  mart_hourly_demand  │  時間帯別需要
│  mart_monthly_stats  │  月次統計
│  (mart レイヤー)      │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  Claude API          │  mart テーブルのスキーマを System Prompt に含め
│  (SQL 生成)          │  ユーザーの質問から SELECT クエリを生成
└─────────┬───────────┘
          │ READ ONLY で実行
          ▼
┌─────────────────────┐
│  チャット UI          │  結果をテーブル/グラフで表示
│  (Next.js)           │  Claude が結果を自然言語で要約
└─────────────────────┘
```

## データモデル設計

### RAW レイヤー

```sql
CREATE TABLE raw_tepco_demand (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    date_str        TEXT NOT NULL,        -- "2024/7/24" (元データのまま)
    time_str        TEXT NOT NULL,        -- "14:00" (元データのまま)
    demand_mw_str   TEXT,                 -- "4567" (万kW、文字列のまま)
    supply_mw_str   TEXT,                 -- 供給力
    usage_pct_str   TEXT,                 -- 使用率
    source_url      TEXT,                 -- 取込元 URL
    loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (date_str, time_str)
);
```

### STAGING レイヤー（dbt モデル）

```sql
-- stg_tepco_demand.sql
SELECT
    TO_DATE(date_str, 'YYYY/MM/DD')           AS demand_date,
    time_str::TIME                             AS demand_time,
    (demand_mw_str::NUMERIC * 10)              AS demand_mw,   -- 万kW → MW
    (supply_mw_str::NUMERIC * 10)              AS supply_mw,
    usage_pct_str::NUMERIC                     AS usage_pct,
    loaded_at
FROM {{ source('raw', 'raw_tepco_demand') }}
WHERE demand_mw_str IS NOT NULL
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY date_str, time_str
    ORDER BY loaded_at DESC
) = 1
```

### MART レイヤー（dbt モデル）

```sql
-- mart_daily_demand.sql
SELECT
    demand_date,
    MAX(demand_mw)  AS peak_demand_mw,
    MIN(demand_mw)  AS min_demand_mw,
    AVG(demand_mw)  AS avg_demand_mw,
    MAX(usage_pct)  AS peak_usage_pct
FROM {{ ref('stg_tepco_demand') }}
GROUP BY demand_date
ORDER BY demand_date
```

## OLTP / OLAP の役割分担

### Phase 1-2: PostgreSQL のみ

- OLTP/OLAP 両方を Supabase PostgreSQL で担当
- データ量が限定的（TEPCO データは 1 日 48 レコード ≈ 年間 17,520 行）なので問題なし
- インデックスとマテリアライズドビューで十分な性能を確保

### Phase 3: Iceberg / OLAP 分離

- Supabase の Iceberg テーブルサポートを活用
- 大量の履歴データを Iceberg (S3/object storage) に格納
- OLAP クエリは Iceberg テーブル経由で実行
- OLTP（リアルタイム取込）は引き続き PostgreSQL

## Claude API の SQL 生成設計

### System Prompt の構造

```
あなたは電力需要データの分析アシスタントです。

## 利用可能なテーブル

{mart テーブルのスキーマ情報を動的に挿入}

## ルール
- SELECT 文のみ生成してください
- DELETE, UPDATE, INSERT, DROP, ALTER は絶対に生成しないでください
- テーブル名は mart_ プレフィックスのものだけ使用してください
- 日付は 'YYYY-MM-DD' 形式で指定してください
- 結果は最大 100 行に制限してください (LIMIT 100)

## 出力形式
SQL クエリを ```sql ブロックで返してください。
クエリの意図を日本語で簡潔に説明してください。
```

### セキュリティ対策

1. **READ ONLY ロール**: `readonly_user` で SQL を実行。SELECT 以外は DB レベルで拒否
2. **statement_timeout**: `SET statement_timeout = '10s'` で長時間クエリを防止
3. **テーブル制限**: mart レイヤーのテーブルのみにアクセス権限を付与
4. **結果行数制限**: LIMIT 句を強制付与（アプリケーションレベル）
