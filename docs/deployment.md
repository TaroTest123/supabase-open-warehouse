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

ダッシュボード上部の **「Connect」ボタン** から API キーと DB 接続情報を確認できます。
また **Settings → API Keys** でも確認可能です。

| 項目 | 確認場所 | 備考 |
|------|---------|------|
| Project URL | Connect ダイアログ / Settings → API Keys | `https://<project-ref>.supabase.co` |
| Publishable key (`sb_publishable_...`) | Settings → API Keys | クライアント側で使用（旧 `anon` key） |
| Secret key (`sb_secret_...`) | Settings → API Keys | **秘密鍵 — 外部に公開しない**（旧 `service_role` key） |
| DB Host | Connect ダイアログ | `db.<project-ref>.supabase.co` |
| DB Port | Connect ダイアログ | 通常 `5432` |

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
  -H "Authorization: Bearer <secret_key>"
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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key | `sb_secret_...` |
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

### 4.1 GitHub Environments の作成

本番 Secrets は **GitHub Environment** にスコープすることで、PR ワークフローからの意図しないアクセスを防ぎます。

GitHub リポジトリ → **Settings** → **Environments** で以下の 2 環境を作成:

| 環境 | 用途 | 推奨の保護ルール |
|------|------|-----------------|
| `production` | 本番 Supabase への接続・デプロイ | Deployment branch: `main` のみ |
| `preview` | プレビュー環境（将来用） | 制限なし |

### 4.2 Secrets の設定

本番 Secrets は `production` 環境に設定します。

**Settings** → **Environments** → **production** → **Environment secrets** で以下を追加:

| Secret | 用途 | 値の取得元 |
|--------|------|-----------|
| `SUPABASE_URL` | Edge Function 呼び出し URL | Connect ダイアログ / Settings → API Keys → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function 認証 | Settings → API Keys → Secret key (`sb_secret_...`) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 認証（Edge Function デプロイ） | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) で生成 |
| `SUPABASE_PROJECT_REF` | Supabase プロジェクト参照 ID | ダッシュボード URL の `project/<project-ref>` 部分 |
| `SUPABASE_DB_HOST` | dbt から DB に接続 | Connect ダイアログ (`db.<project-ref>.supabase.co`) |
| `SUPABASE_DB_USER` | dbt DB ユーザー | `postgres` |
| `SUPABASE_DB_PASSWORD` | dbt DB パスワード | プロジェクト作成時のパスワード |

> **注意**: 既存のリポジトリレベル Secrets から `production` 環境に移行する場合は、リポジトリレベルの同名 Secrets を削除してください（環境 Secrets が優先されますが、混乱を避けるため）。

### 4.3 使用するワークフロー

| ワークフロー | Environment | 使用する Secrets | トリガー |
|-------------|-------------|-----------------|---------|
| `ci.yml` | なし | なし（PostgreSQL サービスコンテナを使用） | PR / main push |
| `deploy-functions.yml` | `production` / `preview` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | main push・PR (`supabase/functions/**` 変更時) / 手動 |
| `ingest-tepco.yml` | `production` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_*` | 毎日 00:00 JST / 手動 |
| `docs.yml` | なし | なし（PostgreSQL サービスコンテナを使用） | main push |

### 動作確認

Secrets 設定後:

1. **Edge Function デプロイ**: GitHub Actions → `Deploy Edge Functions` → **Run workflow** で手動実行
2. **日次取り込み**: GitHub Actions → `Ingest TEPCO CSV` → **Run workflow** で手動実行
   - **ingest** ジョブ: Edge Function を呼び出し、CSV を取り込み
   - **dbt-refresh** ジョブ: dbt run → dbt test → `grant_readonly_on_mart_tables()` 実行

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

- `Authorization: Bearer <secret_key>` ヘッダーが正しいか確認
- Secret key (`sb_secret_...`) を使用しているか確認（Publishable key ではない）

### Edge Function が CSV 取得に失敗する (404)

- TEPCO の当日実績 CSV (`juyo-d-j.csv`) は営業日のみ更新される場合があります
- 年次 CSV (`juyo-YYYY.csv`) で動作確認してください

### GitHub Actions の dbt-refresh が接続エラー

- `SUPABASE_DB_HOST` が `db.<project-ref>.supabase.co` の形式か確認
- `SUPABASE_DB_PASSWORD` がプロジェクト作成時のパスワードと一致するか確認
- Supabase ダッシュボード → Connect ダイアログで接続情報を確認

### Vercel でチャットが動作しない

- `SUPABASE_READONLY_DB_URL` が正しいか確認（[readonly-db-setup.md](readonly-db-setup.md) 参照）
- `ANTHROPIC_API_KEY` が有効か確認
- Vercel Functions のログ（ダッシュボード → Logs）でエラーを確認
