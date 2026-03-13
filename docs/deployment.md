# デプロイガイド

本プロジェクトのデプロイに必要な手順をまとめます。

## 前提

| サービス | 用途 |
|---------|------|
| Vercel | Next.js フロントエンドのホスティング |
| Supabase | PostgreSQL データベース + Edge Functions |
| GitHub Actions | CI/CD + TEPCO CSV 日次取り込み |

## 1. Supabase プロジェクトのセットアップ

### 1.1 プロジェクト作成

1. [Supabase ダッシュボード](https://supabase.com/dashboard) で新規プロジェクトを作成
2. リージョンは **Northeast Asia (Tokyo)** を選択（Vercel Functions と同リージョンにすることでレイテンシを最小化）
3. データベースパスワードを控えておく

### 1.2 マイグレーションの適用

Supabase CLI を使ってリモートにマイグレーションを適用します。

```bash
# Supabase プロジェクトにリンク
supabase link --project-ref <project-ref>

# マイグレーションを適用
supabase db push
```

これにより以下が作成されます:

- `raw_tepco_demand` テーブル（CSV 生データ格納）
- `readonly_user` ロール + `grant_readonly_on_mart_tables()` 関数
- `ingestion_log` テーブル（取り込み履歴）

### 1.3 dbt モデルの実行

```bash
cd dbt
export DBT_HOST=db.<project-ref>.supabase.co
export DBT_PORT=5432
export DBT_USER=postgres
export DBT_PASSWORD=<データベースパスワード>
export DBT_DBNAME=postgres

uv sync
uv run dbt run --profiles-dir .
uv run dbt test --profiles-dir .
```

### 1.4 readonly_user のセットアップ

[readonly-db-setup.md](readonly-db-setup.md) の「本番環境（Supabase ホスティング）」セクションに従って設定してください。

### 1.5 接続情報の確認

Supabase ダッシュボード → **Settings** → **API** で以下を確認し控えておきます:

| 項目 | 確認場所 |
|------|---------|
| Project URL | `https://<project-ref>.supabase.co` |
| `anon` key | API Settings → Project API keys |
| `service_role` key | API Settings → Project API keys（**秘密鍵 — 外部に公開しない**）|

ダッシュボード → **Settings** → **Database** で以下も確認:

| 項目 | 確認場所 |
|------|---------|
| Host | `db.<project-ref>.supabase.co` |
| Port | `5432` |

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
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json"
```

成功時のレスポンス例:

```json
{
  "status": "success",
  "rows_fetched": 48,
  "rows_upserted": 48,
  "url": "https://www.tepco.co.jp/forecast/html/images/juyo-d-j.csv"
}
```

### 2.3 年次データのバックフィル（任意）

過去データを一括取り込む場合は `?url=` パラメータで年次 CSV を指定:

```bash
# 2024年のデータ (~8,784行)
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/ingest-tepco-csv?url=https://www.tepco.co.jp/forecast/html/images/juyo-2024.csv" \
  -H "Authorization: Bearer <service_role_key>"
```

> **注意**: 年次 CSV は 3 列 (DATE, TIME, 実績) のみで、供給力・使用率は含まれません。

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | `eyJ...` |
| `SUPABASE_READONLY_DB_URL` | readonly_user の接続 URL | `postgresql://readonly_user:...` |
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

GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions** で以下を追加:

### 必須 Secrets

| Secret | 用途 | 値の取得元 |
|--------|------|-----------|
| `SUPABASE_URL` | Edge Function 呼び出し URL | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function 認証 | Supabase → Settings → API → `service_role` key |
| `SUPABASE_DB_HOST` | dbt から DB に接続 | `db.<project-ref>.supabase.co` |
| `SUPABASE_DB_USER` | dbt DB ユーザー | `postgres` |
| `SUPABASE_DB_PASSWORD` | dbt DB パスワード | プロジェクト作成時のパスワード |

### 使用するワークフロー

| ワークフロー | 使用する Secrets | トリガー |
|-------------|-----------------|---------|
| `ci.yml` | なし（ローカル Supabase を使用） | PR / main push |
| `ingest-tepco.yml` | 全 5 つ | 毎日 00:00 JST / 手動 |
| `docs.yml` | なし（ローカル Supabase を使用） | main push |

### 動作確認

Secrets 設定後、GitHub Actions → `Ingest TEPCO CSV` → **Run workflow** で手動実行して確認:

1. **ingest** ジョブ: Edge Function を呼び出し、CSV を取り込み
2. **dbt-refresh** ジョブ: dbt run → dbt test → `grant_readonly_on_mart_tables()` 実行

---

## 5. デプロイ後のチェックリスト

- [ ] Supabase マイグレーションが適用されている (`raw_tepco_demand`, `ingestion_log` テーブルが存在)
- [ ] `readonly_user` ロールが作成され、mart テーブルに SELECT 権限がある
- [ ] Edge Function `ingest-tepco-csv` がデプロイされ、curl で動作確認済み
- [ ] Vercel にフロントエンドがデプロイされ、チャット UI にアクセス可能
- [ ] Vercel 環境変数がすべて設定されている
- [ ] GitHub Actions Secrets が設定され、手動実行で ingest + dbt-refresh が成功
- [ ] チャット UI から質問して SQL 実行 → 結果表示まで動作する

## トラブルシューティング

### Edge Function が 401 を返す

- `Authorization: Bearer <service_role_key>` ヘッダーが正しいか確認
- `service_role` key（`anon` key ではない）を使用しているか確認

### Edge Function が CSV 取得に失敗する (404)

- TEPCO の当日実績 CSV (`juyo-d-j.csv`) は営業日のみ更新される場合があります
- 年次 CSV (`juyo-YYYY.csv`) で動作確認してください

### GitHub Actions の dbt-refresh が接続エラー

- `SUPABASE_DB_HOST` が `db.<project-ref>.supabase.co` の形式か確認
- `SUPABASE_DB_PASSWORD` がプロジェクト作成時のパスワードと一致するか確認
- Supabase ダッシュボード → Settings → Database → Connection info で確認

### Vercel でチャットが動作しない

- `SUPABASE_READONLY_DB_URL` が正しいか確認（[readonly-db-setup.md](readonly-db-setup.md) 参照）
- `ANTHROPIC_API_KEY` が有効か確認
- Vercel Functions のログ（ダッシュボード → Logs）でエラーを確認
