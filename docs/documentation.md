# ドキュメント自動生成 & GitHub Pages ホスティング

## 概要

main ブランチへの push 時に GitHub Actions（`.github/workflows/docs.yml`）が自動実行され、
3 種類のドキュメントを生成して GitHub Pages にデプロイする。

**GitHub Pages URL**: `https://<user>.github.io/supabase-open-warehouse/`

## サイト構成

```
https://<user>.github.io/supabase-open-warehouse/
├── index.html          ← ランディングページ（docs/index.html）
├── schema/             ← tbls スキーマドキュメント（HTML + SVG）
├── erd/                ← Liam ERD インタラクティブ ER 図
└── dbt/                ← dbt docs（target/ をそのまま配信）
```

## 各ドキュメントの詳細

### 1. Schema Docs（tbls）

| 項目 | 値 |
|------|-----|
| ツール | [tbls](https://github.com/k1LoW/tbls) |
| 設定ファイル | `.tbls.yml`（プロジェクトルート） |
| 生成先 | `docs-generated/schema/` |
| 配信形式 | Markdown → pandoc で HTML 変換 |

tbls は PostgreSQL に直接接続してテーブル定義（カラム型・制約・インデックス）を Markdown + SVG で出力する。
dbt が作るビュー/テーブルには `COMMENT ON` がないため、`.tbls.yml` の `comments` セクションで補完している。

CI では pandoc でダークテーマの HTML に変換し、`README.html` → `index.html` にリネームして配信する。

**対象テーブル/ビュー**（`.tbls.yml` の `include` で制御）:

- `public.raw_tepco_demand` — 生データ格納テーブル
- `public.stg_tepco_demand` — ステージングビュー
- `public.mart_daily_demand` — 日次サマリ
- `public.mart_hourly_demand` — 時間帯別分析
- `public.mart_monthly_stats` — 月次統計

テーブルを追加した場合は `.tbls.yml` の `include` と `comments` を更新する。

### 2. ER Diagram（Liam ERD）

| 項目 | 値 |
|------|-----|
| ツール | [@liam-hq/cli](https://github.com/liam-hq/liam) |
| 入力 | tbls が生成する `schema.json` |
| 生成先 | `docs-generated/erd/` |
| 配信形式 | インタラクティブ HTML（そのまま配信） |

tbls の `schema.json` を入力として、ブラウザ上で操作可能な ER 図を生成する。
tbls の対象テーブルがそのまま ER 図に反映されるため、個別の設定は不要。

### 3. dbt Docs

| 項目 | 値 |
|------|-----|
| ツール | dbt-core |
| 生成コマンド | `dbt docs generate` |
| 生成先 | `dbt/target/` |
| 配信形式 | `target/` ディレクトリをそのまま配信 |

dbt docs は `index.html` が同一ディレクトリの `manifest.json` / `catalog.json` を `fetch()` で読み込む。
同一オリジンから配信するため、JSON のインライン化は不要（参考: [dbt-core-init-project](https://github.com/TaroTest123/dbt-core-init-project)）。

## CI パイプライン

```
Checkout → ツールセットアップ → Supabase start → DB reset
→ dbt run → tbls doc → pandoc 変換 → Liam ERD → dbt docs generate
→ _site/ にアセンブル → GitHub Pages デプロイ → Supabase stop
```

### 使用する GitHub Actions

| Action | 用途 |
|--------|------|
| `actions/checkout@v4` | リポジトリチェックアウト |
| `actions/setup-node@v4` | Node.js 20（Liam ERD 用） |
| `astral-sh/setup-uv@v4` | uv（dbt の Python 依存管理） |
| `supabase/setup-cli@v1` | Supabase CLI |
| `k1low/setup-tbls@v1` | tbls |
| `actions/upload-pages-artifact@v3` | Pages アーティファクトアップロード |
| `actions/deploy-pages@v4` | GitHub Pages デプロイ |

### 必要な permissions

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

## 初期セットアップ

リポジトリの **Settings → Pages → Source** を **"GitHub Actions"** に変更する（初回のみ）。

## ローカルでの確認方法

```bash
# 前提: supabase start 済み、dbt run 済み

# 1. tbls ドキュメント生成
tbls doc
ls docs-generated/schema/

# 2. Liam ERD 生成
npx @liam-hq/cli erd build --format tbls \
  --input docs-generated/schema/schema.json \
  --output-dir docs-generated/erd

# 3. dbt docs 生成
cd dbt && uv run dbt docs generate --profiles-dir .
cd ..

# 4. サイト組み立て & ローカル確認
mkdir -p _site/schema _site/erd
cp docs/index.html _site/
cp docs-generated/schema/*.html docs-generated/schema/*.svg docs-generated/schema/*.json _site/schema/
cp -r docs-generated/erd/* _site/erd/
cp -r dbt/target _site/dbt
npx serve _site
```

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| schema/ が 404 | tbls 出力が Markdown のまま | pandoc 変換ステップを確認 |
| dbt docs が空白 | `manifest.json` / `catalog.json` が未配信 | `target/` ごとコピーされているか確認 |
| tbls に新テーブルが反映されない | `.tbls.yml` の `include` に未追加 | `include` と `comments` を更新 |
| CI で Supabase start が遅い | Docker pull に時間がかかる | 初回は 2-3 分かかるのは正常 |
