# デプロイガイド

本プロジェクトのデプロイに必要な手順をまとめます。

## 前提

| サービス | 用途 |
|---------|------|
| Vercel | Next.js フロントエンドのホスティング |
| Supabase | PostgreSQL データベース + Edge Functions |
| GitHub Actions | CI/CD + TEPCO CSV 日次/月次取り込み |

## 1. Supabase プロジェクトのセットアップ

### 1.1 プロジェクト作成

1. [Supabase ダッシュボード](https://supabase.com/dashboard) で新規プロジェクトを作成
2. リージョンは **Northeast Asia (Tokyo)** を選択（Vercel Functions と同リージョンにすることでレイテンシを最小化）
3. データベースパスワードを控えておく

### 1.2 マイグレーションの適用

マイグレーションは `main` ブランチへの push 時に GitHub Actions (`deploy-supabase.yml`) で自動適用されます。

初回セットアップ時は手動で適用してください:

```bash
# Supabase プロジェクトにリンク
supabase link --project-ref <project-ref>

# マイグレーションを適用
supabase db push
```

これにより以下が作成されます:

- `raw_tepco_demand` テーブル（CSV 生データ格納 — 1時間間隔、`forecast_mw_str` カラム含む）
- `raw_tepco_demand_5min` テーブル（ZIP 5分間隔データ格納）
- `readonly_user` ロール + `grant_readonly_on_mart_tables()` 関数
- `ingestion_log` テーブル（取り込み履歴）

### 1.3 dbt モデルの実行

```bash
cd dbt
# Connection Pooler (Session mode) のホスト名を使用
export DBT_HOST=aws-0-ap-northeast-1.pooler.supabase.com  # リージョンに応じて変更
export DBT_PORT=5432
export DBT_USER=postgres.<project-ref>  # Pooler 形式
export DBT_PASSWORD=<データベースパスワード>
export DBT_DBNAME=postgres

uv sync
uv run dbt run --profiles-dir .
uv run dbt test --profiles-dir .
```

### 1.4 readonly_user のセットアップ

[readonly-db-setup.md](readonly-db-setup.md) の「本番環境（Supabase ホスティング）」セクションに従って設定してください。

### 1.5 接続情報の確認

ダッシュボード上部の **「Connect」ボタン** から API キーと DB 接続情
報を確認できます。
また **Settings → API Keys** でも確認可能です。

| 項目 | 確認場所 | 備考 |
|------|---------|------|
| Project URL | Connect ダイアログ / Settings → API Keys | `https://<project-ref>.supabase.co` |
| Publishable key (`sb_publishable_...`) | Settings → API Keys | クライアント側で使用（旧 `anon` key） |
| Secret key (`sb_secret_...`) | Settings → API Keys | **秘密鍵 — 外部に公開しない**（旧 `service_role` key） |
| Pooler Host | Connect → Connection Pooler | `aws-0-ap-northeast-1.pooler.supabase.com` 等 |
| DB Port | Connect → Connection Pooler | Session mode: `5432` / Transaction mode: `6543` |

> **キー形式**: Supabase は従来の JWT ベースの `anon` / `service_role` キーから、`sb_publishable_...` / `sb_secret_...` 形式に移行しています。どちらの形式も利用可能です。

---

## 2. Supabase Edge Function のデプロイ

`ingest-tepco-csv` Edge Function を Supabase にデプロイします。

### 2.1 デプロイ

```bash
# Supabase プロジェクトにリンク済みであること
supabase functions deploy ingest-tepco-csv
```

### 2.2 動作確認

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/ingest-tepco-csv" \
  -H "Authorization: Bearer <secret_key>" \
  -H "Content-Type: application/json"
```

> `<secret_key>` には `sb_secret_...` 形式の Secret key を使用します。

成功時のレスポンス例（日次 CSV）:

```json
{
  "status": "success",
  "hourly_rows": 48,
  "five_min_rows": 0,
  "rows_fetched": 48,
  "rows_upserted": 48,
  "url": "https://www.tepco.co.jp/forecast/html/images/juyo-d-j.csv"
}
```

### 2.3 データのバックフィル（任意）

#### 年次 CSV（2022年以前）

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/ingest-tepco-csv?url=https://www.tepco.co.jp/forecast/html/images/juyo-2024.csv" \
  -H "Authorization: Bearer <secret_key>"
```

> **注意**: 年次 CSV は 1 時間間隔・3 列 (DATE, TIME, 実績) のみで、供給力・使用率は含まれません。

#### 月別 ZIP（2022年4月以降）

TEPCO は 2022年4月以降、月別 ZIP (`YYYYMM_power_usage.zip`) で5分間隔データを公開しています。ZIP には供給力・使用率も含まれます。

```bash
# 単月の手動取り込み
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/ingest-tepco-csv?url=https://www.tepco.co.jp/forecast/html/images/202501_power_usage.zip" \
  -H "Authorization: Bearer <secret_key>"
```

#### GitHub Actions によるバッチバックフィル

`backfill-tepco.yml` ワークフローで指定期間の ZIP を一括取り込みできます:

1. GitHub Actions → **Backfill TEPCO ZIP** → **Run workflow**
2. `start_month`: `202401`, `end_month`: `202512` のように指定
3. 全月の取り込み完了後、dbt-refresh が自動実行されます

### 2.4 dbt の再実行

データ取り込み後、staging/mart テーブルを更新:

```bash
cd dbt
uv run dbt run --profiles-dir .
```

mart テーブル更新後、readonly_user に SELECT 権限を付与:

```sql
SELECT grant_readonly_on_mart_tables();
```

---

## 3. Vercel のデプロイ

### 3.1 プロジェクト設定

Vercel ダッシュボードで GitHub リポジトリをインポート後、以下を設定:

| 設定項目 | 値 | 場所 |
|---------|-----|------|
| Root Directory | `frontend` | Settings → General |
| Framework Preset | Next.js | （自動検出） |
| Functions Region | Tokyo (`hnd1`) | Settings → Functions |

> **Root Directory**: フロントエンドが `frontend/` サブディレクトリにあるため必須です。

### 3.2 環境変数

Settings → Environment Variables に以下を設定:

| Key | 説明 | 例 |
|-----|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key | `sb_secret_...` |
| `SUPABASE_READONLY_DB_URL` | readonly_user の接続 URL | `postgresql://readonly_user.<ref>:<pass>@<pooler-host>:5432/postgres`（[詳細](readonly-db-setup.md)） |
| `ANTHROPIC_API_KEY` | Claude API キー | `sk-ant-...` |

> **セキュリティ**: `SUPABASE_SERVICE_ROLE_KEY` と `ANTHROPIC_API_KEY` は **Production** 環境のみに設定し、Preview には含めないことを推奨します。

### 3.3 デプロイ

`main` ブランチへの push で自動デプロイされます。手動トリガーも可能:

```bash
# Vercel CLI でデプロイ
vercel --prod
```

技術的な判断理由の詳細は [ADR-0001](adr/0001-hosting-vercel.md) を参照してください。

---

## 4. GitHub Actions Secrets の設定

日次 CSV 取り込みワークフロー (`ingest-tepco.yml`) と CI で使用する secrets を設定します。

### 4.1 GitHub Environments の作成

本番 Secrets は **GitHub Environment** にスコープすることで、PR ワークフローからの意図しないアクセスを防ぎます。

GitHub リポジトリ → **Settings** → **Environments** で以下の 2 環境を作成:

| 環境 | 用途 | 推奨の保護ルール |
|------|------|-----------------|
| `Production` | 本番 Supabase への接続・デプロイ | Deployment branch: `main` のみ |
| `Preview` | プレビュー環境（将来用） | 制限なし |

### 4.2 Secrets の設定

本番 Secrets は `Production` 環境に設定します。

**Settings** → **Environments** → **Production** → **Environment secrets** で以下を追加:

| Secret | 用途 | 値の取得元 |
|--------|------|-----------|
| `SUPABASE_URL` | Edge Function 呼び出し URL | Connect ダイアログ / Settings → API Keys → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function 認証 | Settings → API Keys → Secret key (`sb_secret_...`) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 認証（Edge Function デプロイ） | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) で生成 |
| `SUPABASE_PROJECT_REF` | Supabase プロジェクト参照 ID | ダッシュボード URL の `project/<project-ref>` 部分 |
| `SUPABASE_DB_HOST` | dbt から DB に接続 | Connect → Connection pooler (Session mode) のホスト名（例: `aws-0-ap-northeast-1.pooler.supabase.com`） |
| `SUPABASE_DB_USER` | dbt DB ユーザー | `postgres.<project-ref>`（pooler 形式） |
| `SUPABASE_DB_PASSWORD` | dbt DB パスワード | プロジェクト作成時のパスワード |

> **注意**: Direct connection (`db.<project-ref>.supabase.co`) は IPv6 のみに解決される場合があり、GitHub Actions ランナー（IPv4 のみ）から接続できません。必ず **Connection pooler** のホスト名を使用してください。

> **注意**: 既存のリポジトリレベル Secrets から `Production` 環境に移行する場合は、リポジトリレベルの同名 Secrets を削除してください（環境 Secrets が優先されますが、混乱を避けるため）。

### 4.3 使用するワークフロー

| ワークフロー | Environment | 使用する Secrets | トリガー |
|-------------|-------------|-----------------|---------|
| `ci.yml` | なし | なし（PostgreSQL サービスコンテナを使用） | PR / main push |
| `deploy-supabase.yml` | `Production` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_*` | main push (`supabase/**` or `dbt/models/**` 変更時) / 手動 |
| `ingest-tepco.yml` | `Production` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_*` | 毎日 00:00 JST + 毎月3日 03:00 JST / 手動 |
| `backfill-tepco.yml` | `Production` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_*` | 手動（`workflow_dispatch`） |
| `docs.yml` | なし | なし（PostgreSQL サービスコンテナを使用） | main push |

### 動作確認

Secrets 設定後:

1. **Edge Function デプロイ**: GitHub Actions → `Deploy Edge Functions` → **Run workflow** で手動実行
2. **日次取り込み**: GitHub Actions → `Ingest TEPCO CSV` → **Run workflow** で手動実行
   - **ingest** ジョブ: Edge Function を呼び出し、CSV/ZIP を取り込み
   - **dbt-refresh** ジョブ: dbt run → dbt test → `grant_readonly_on_mart_tables()` 実行
3. **バックフィル**: GitHub Actions → `Backfill TEPCO ZIP` → **Run workflow** で手動実行
   - `start_month` / `end_month` を指定して過去の月別 ZIP を一括取り込み

---

## 5. CI/CD パイプラインの構成

### 5.1 CI (`ci.yml`) — PR / main push

```
schema-consistency ─── frontend (lint & build) ─── dbt (test)
     │                        │                        │
     │  constants.ts と       │  Biome + tsc           │  PostgreSQL サービス
     │  dbt モデルの整合性    │  + Next.js build       │  コンテナで dbt run/test
     ▼                        ▼                        ▼
  (並列実行)
```

- **schema-consistency**: `constants.ts` の `MART_TABLE_SCHEMAS` に書かれたテーブル名と `dbt/models/mart/*.sql` のファイル名が一致するか検証。不一致は CI 失敗。詳細は [ADR-0006](adr/0006-ci-mart-schema-consistency-and-dbt-auto-deploy.md)

### 5.2 CD (`deploy-supabase.yml`) — main push

```
changes (dorny/paths-filter)
  │
  ├── supabase 変更あり → migrate (supabase db push)
  │                          ├── deploy-functions (並列)
  │                          └── dbt-refresh (needs: migrate)
  │
  └── dbt のみ変更 → migrate スキップ
                          └── dbt-refresh (直接実行)
```

- **パスフィルタ**: `dorny/paths-filter` で `supabase/**` と `dbt/**` の変更を検出
- **実行順序保証**: `dbt-refresh` は `needs: migrate` でマイグレーション完了後に実行
- **スキップ**: dbt のみの変更時は `migrate` / `deploy-functions` をスキップ
- **dbt-refresh**: `dbt run` → `dbt test` → `grant_readonly_on_mart_tables()`

### 5.3 新しい mart モデルを追加する際の手順

1. `dbt/models/mart/mart_xxx.sql` を作成
2. `dbt/models/mart/schema.yml` にテストを追加
3. `frontend/src/lib/constants.ts` の `MART_TABLE_SCHEMAS` にスキーマ定義を追加
4. PR を作成 → CI の `schema-consistency` が整合性を検証
5. main にマージ → `deploy-supabase.yml` が自動で `dbt run` を実行し本番テーブルを作成

> **注意**: 手順 1 と 3 を別の PR で行うと、`schema-consistency` が CI 失敗します。必ず同じ PR に含めてください。

---

## 6. デプロイ後のチェックリスト

- [ ] Supabase マイグレーションが適用されている (`raw_tepco_demand`, `raw_tepco_demand_5min`, `ingestion_log` テーブルが存在)
- [ ] `readonly_user` ロールが作成され、mart テーブルに SELECT 権限がある
- [ ] Edge Function `ingest-tepco-csv` がデプロイされ、curl で動作確認済み
- [ ] Vercel にフロントエンドがデプロイされ、チャット UI にアクセス可能
- [ ] Vercel 環境変数がすべて設定されている
- [ ] GitHub Actions Secrets が設定され、手動実行で ingest + dbt-refresh が成功
- [ ] チャット UI から質問して SQL 実行 → 結果表示まで動作する

## トラブルシューティング

### Edge Function が 401 を返す

- `Authorization: Bearer <secret_key>` ヘッダーが正しいか確認
- Secret key (`sb_secret_...`) を使用しているか確認（Publishable key ではない）

### Edge Function が CSV 取得に失敗する (404)

- TEPCO の当日実績 CSV (`juyo-d-j.csv`) は営業日のみ更新される場合があります
- 年次 CSV (`juyo-YYYY.csv`) で動作確認してください

### GitHub Actions の dbt-refresh が接続エラー

- `SUPABASE_DB_HOST` が **Connection Pooler** のホスト名か確認（`db.<project-ref>.supabase.co` ではなく `aws-0-ap-northeast-1.pooler.supabase.com` 等）
- `SUPABASE_DB_USER` が Pooler 形式（`postgres.<project-ref>`）か確認
- `SUPABASE_DB_PASSWORD` がプロジェクト作成時のパスワードと一致するか確認
- Supabase ダッシュボード → **Connect** ボタン → **Connection Pooler** で接続情報を確認

### Vercel / GitHub Actions で DNS エラー (`ENOTFOUND`)

- Direct connection（`db.<project-ref>.supabase.co`）は IPv6 のみに解決される場合があり、IPv4 環境から接続できません
- 必ず **Connection Pooler** のホスト名を使用してください
- Vercel の環境変数に改行が含まれていないか確認（コピペ時に混入しやすい）
- Supabase プロジェクトが pause されていないか確認（ダッシュボードから Restore 可能）

### チャットで `relation "mart_xxx" does not exist` エラー

- 本番 DB に mart テーブルが作成されていない可能性があります
- GitHub Actions → `Deploy Supabase` → 最新の実行結果で `dbt-refresh` ジョブが成功しているか確認
- 失敗している場合は **Run workflow** で手動再実行
- 新しい mart モデルを追加した場合、`constants.ts` の `MART_TABLE_SCHEMAS` と `dbt/models/mart/` の両方に変更が含まれているか確認（[ADR-0006](adr/0006-ci-mart-schema-consistency-and-dbt-auto-deploy.md)）

### Scalar UI から API を呼び出すと CORS エラーになる

GitHub Pages 上の Scalar UI (`*.github.io`) から Vercel の Chat API (`*.vercel.app`) や Supabase Edge Functions (`*.supabase.co`) を呼ぶと、ブラウザのクロスオリジンポリシーによりリクエストがブロックされます。

**原因**: ブラウザは異なるオリジン間の fetch を行う際、まず OPTIONS プリフライトリクエストを送信し、サーバーから `Access-Control-Allow-Origin` ヘッダーが返されなければ本リクエストをブロックします。Chat API と Edge Functions の両方に CORS ヘッダーがなかった。

**対応**:

| 対象 | 修正ファイル | 内容 |
|------|-------------|------|
| Chat API | `frontend/src/app/api/chat/route.ts` | `OPTIONS` ハンドラ + 全レスポンスに CORS ヘッダー |
| Edge Functions | `supabase/functions/_shared/ingestion.ts` | `corsPreflightResponse()` + `guardRequest` で OPTIONS 対応 + `jsonResponse` に CORS ヘッダー |

**新しいエンドポイントを追加する際の注意**:

- **Next.js API Route**: `OPTIONS` エクスポートと `CORS_HEADERS` を各レスポンスに追加（`route.ts` を参照）
- **Edge Function**: `_shared/ingestion.ts` の `guardRequest` / `jsonResponse` を使えば自動で CORS 対応される。新しい共有モジュールを作る場合は同様に CORS ヘッダーを含めること

### Vercel でチャットが動作しない

- `SUPABASE_READONLY_DB_URL` が正しいか確認（[readonly-db-setup.md](readonly-db-setup.md) 参照）
- `ANTHROPIC_API_KEY` が有効か確認
- Vercel Functions のログ（ダッシュボード → Logs）でエラーを確認
