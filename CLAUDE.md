# CLAUDE.md — Supabase Open Warehouse

このファイルは Claude Code がリポジトリで作業する際のガイドラインです。

## プロジェクト概要

TEPCO（東京電力）の電力需要データを Supabase 上の Open Warehouse Architecture で管理し、
Gen AI チャットインターフェースから自然言語で問い合わせできるアプリケーション。

- **データソース**: TEPCO でんき予報 CSV（日次）+ 月別 ZIP（5分間隔データ）
- **DWH**: Supabase (PostgreSQL) + dbt による ELT パイプライン
- **フロントエンド**: Next.js App Router によるチャット UI
- **AI**: Claude API で自然言語 → SQL 変換 → 結果の要約

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | Next.js 15 (App Router), React, Tailwind CSS |
| Hosting | Vercel (Next.js デプロイ) |
| Backend | Supabase (PostgreSQL, Edge Functions, Auth) |
| Data Transform | dbt-core + dbt-postgres |
| AI | Claude API (Anthropic SDK) |
| Linter / Formatter | Biome |
| Package Manager | pnpm (frontend), uv (Python/dbt) |
| Language | TypeScript (strict), SQL (PostgreSQL), Python (dbt) |

## アーキテクチャ方針

- **ORM は使わない** — `supabase-js` + `supabase gen types typescript` で型安全を確保
- **AI 生成 SQL は READ ONLY ロールで実行** — `readonly_user` ロールを使い SELECT のみ許可
- **Phase 1-2 は Iceberg に依存しない** — PostgreSQL のみで完結。Phase 3 で Iceberg/OLAP 統合
- **dbt の 3 レイヤーモデル** — raw → staging → mart
- **CSV/ZIP 自動取り込み** — Edge Function (CSV/ZIP 取得・パース・upsert) + GitHub Actions cron (日次 CSV + 月次 ZIP) + バックフィルワークフロー。詳細は [ADR-0002](docs/adr/0002-tepco-csv-ingestion.md)

## ディレクトリ構成

```
supabase-open-warehouse/
├── frontend/               # Next.js アプリケーション
│   ├── src/
│   │   ├── app/            # App Router ページ・API Routes
│   │   ├── components/
│   │   │   ├── chat/       # チャット機能コンポーネント
│   │   │   └── ui/         # 共通 UI (shadcn/ui)
│   │   ├── lib/            # ユーティリティ
│   │   └── types/          # TypeScript 型定義
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── postcss.config.mjs
├── supabase/               # Supabase プロジェクト
│   ├── migrations/         # SQL マイグレーション
│   ├── functions/
│   │   └── ingest-tepco-csv/  # TEPCO CSV 取り込み Edge Function
│   └── seed.sql            # シードデータ
├── dbt/                    # dbt プロジェクト
│   ├── models/
│   │   ├── raw/            # ソースデータ定義
│   │   ├── staging/        # クレンジング・型変換
│   │   └── mart/           # 分析用集計テーブル
│   ├── tests/              # dbt テスト
│   └── dbt_project.yml
├── .devcontainer/          # Dev Container 設定
├── .github/workflows/      # GitHub Actions CI/CD
├── docs/                   # ドキュメント
│   ├── deployment.md       # デプロイガイド（Supabase / Vercel / GitHub Actions）
│   └── adr/                # Architecture Decision Records
├── biome.json              # Biome (linter/formatter) 設定
├── CLAUDE.md               # このファイル
└── README.md
```

## コーディング規約

### TypeScript
- `strict: true` を必ず有効にする
- `any` は使わない。型が不明な場合は `unknown` を使う
- インポートは相対パスではなく `@/` エイリアスを使う
- コンポーネントは `frontend/src/components/` に配置、1ファイル1コンポーネント

### SQL
- テーブル名・カラム名は `snake_case`
- マイグレーションファイルはタイムスタンプ付き（Supabase CLI が自動生成）
- dbt モデルの命名: `raw_*`, `stg_*`, `mart_*`

### スタイル
- Tailwind CSS を使用。カスタム CSS は最小限にする
- レスポンシブ対応はモバイルファーストで

### DB スキーマ（3 レイヤー）
- **raw**: CSV データをそのまま格納（`raw_tepco_demand` など）
- **staging**: 型変換・クレンジング・dedup（`stg_tepco_demand`）
- **mart**: 分析用の集計テーブル（`mart_daily_demand` など）

## よく使うコマンド

### Frontend (pnpm)
```bash
cd frontend && pnpm dev          # 開発サーバー起動
cd frontend && pnpm build        # プロダクションビルド
cd frontend && pnpm check        # Biome lint + format チェック
cd frontend && pnpm check:fix    # Biome lint + format 自動修正
cd frontend && pnpm test         # Vitest 実行
```

### Supabase
```bash
supabase start              # ローカル Supabase 起動
supabase db reset           # DB リセット（マイグレーション再適用）
supabase gen types typescript --local > frontend/src/types/database.ts  # 型生成
supabase functions serve    # Edge Functions ローカル実行
supabase functions deploy ingest-tepco-csv  # Edge Function デプロイ
# Edge Function ローカルテスト（POST で呼び出し、?url= で CSV URL 指定可）
curl -X POST http://localhost:54321/functions/v1/ingest-tepco-csv \
  -H "Authorization: Bearer <service-role-key>"
```

### dbt
```bash
cd dbt && uv run dbt run    # モデル実行
cd dbt && uv run dbt test   # テスト実行
cd dbt && uv run dbt docs generate  # ドキュメント生成
```

### Documentation (tbls / Liam ERD / dbt docs)
```bash
tbls doc                                          # tbls スキーマドキュメント生成
npx @liam-hq/cli erd build --format tbls \
  --input docs-generated/schema/schema.json \
  --output-dir docs-generated/erd                 # Liam ERD 生成
```

## MCP サーバー & Skills

### 公式 MCP サーバー（`.mcp.json` で管理）

| MCP サーバー | 提供元 | 用途 |
|-------------|--------|------|
| Supabase MCP | Supabase 公式 | テーブル管理、SQL 実行、RLS、Docs |
| dbt MCP | dbt Labs 公式 | モデル実行・テスト、メタデータ参照 |
| Vercel MCP | Vercel 公式 | デプロイ管理、ログ分析 |
| GitHub MCP | GitHub 公式 | PR/Issue 管理、コードレビュー |

### 公式 Agent Skills

- **supabase-postgres-best-practices** — PostgreSQL 最適化ガイダンス自動適用（[supabase/agent-skills](https://github.com/supabase/agent-skills)）

### カスタム Skills

- `/typegen` — `supabase gen types typescript` で TypeScript 型定義を生成
- `/migrate` — `supabase migration new` でマイグレーションファイルを作成

## ADR（Architecture Decision Records）

- 技術的な意思決定時には `docs/adr/` に ADR を作成する
- フォーマット: MADR (Markdown Any Decision Records)
- ファイル命名: `NNNN-<slug>.md`（例: `0001-hosting-vercel.md`）
- 既存の ADR:
  - [0001-hosting-vercel.md](docs/adr/0001-hosting-vercel.md) — Vercel をホスティングに採用
  - [0002-tepco-csv-ingestion.md](docs/adr/0002-tepco-csv-ingestion.md) — TEPCO CSV 自動取り込みに Edge Function + GitHub Actions cron を採用
  - [0003-ci-postgres-service-container.md](docs/adr/0003-ci-postgres-service-container.md) — CI の dbt ジョブで PostgreSQL サービスコンテナを採用

## ワークフロー

- **PR 作成前に `/simplify` を実行する** — コミット後・PR 作成前に必ず `/simplify` でコード品質・効率・再利用性をレビューし、問題があれば修正してから PR を出す

## セキュリティルール

- **SQL インジェクション防止**: AI 生成 SQL はパラメータ化クエリで実行しない（SQL 自体を生成するため）。代わりに READ ONLY ロール + `statement_timeout` で制御
- **READ ONLY ロール**: `readonly_user` は SELECT 権限のみ。INSERT/UPDATE/DELETE/DDL 不可
- **statement_timeout**: AI 生成 SQL には `SET statement_timeout = '10s'` を適用
- **RLS**: ユーザーデータがある場合は必ず Row Level Security を有効にする
- **環境変数**: シークレットは `frontend/.env.local` に格納、Git にコミットしない（Next.js は `frontend/` をルートとして読み込む）
