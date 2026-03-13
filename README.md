# Supabase Open Warehouse — TEPCO 電力需要分析

TEPCO（東京電力）の電力需要データを **Supabase** 上に構築した Open Warehouse Architecture で管理し、
**Gen AI チャット**から自然言語で問い合わせ・分析できるアプリケーションです。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  User                                                   │
│  ┌───────────────┐                                      │
│  │  Chat UI      │ ← Next.js App Router                 │
│  │  (自然言語)    │                                      │
│  └───────┬───────┘                                      │
│          │                                              │
│          ▼                                              │
│  ┌───────────────┐    ┌───────────────┐                 │
│  │  Claude API   │───▶│  SQL 生成      │                │
│  │  (Anthropic)  │    │  (READ ONLY)  │                 │
│  └───────────────┘    └───────┬───────┘                 │
│                               │                         │
│          ┌────────────────────┼────────────────────┐    │
│          ▼                    ▼                    ▼    │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Supabase (PostgreSQL)                │   │
│  │  ┌─────────┐  ┌───────────┐  ┌────────────────┐  │   │
│  │  │   raw   │─▶│  staging  │─▶│      mart      │  │   │
│  │  │  (CSV)  │  │  (clean)  │  │  (aggregated)  │  │   │
│  │  └─────────┘  └───────────┘  └────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│          ▲                                              │
│          │                                              │
│  ┌───────┴───────┐                                      │
│  │  dbt ELT      │ ← raw → staging → mart              │
│  │  Pipeline     │                                      │
│  └───────┬───────┘                                      │
│          ▲                                              │
│  ┌───────┴───────┐                                      │
│  │  TEPCO CSV    │ ← でんき予報データ（日次）             │
│  │  (データ取込)  │                                      │
│  └───────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

## 技術スタック

| レイヤー | 技術 | 用途 |
|---------|------|------|
| Frontend | Next.js 15 (App Router) | チャット UI |
| Styling | Tailwind CSS | スタイリング |
| Hosting | Vercel | Next.js デプロイ |
| Backend | Supabase (PostgreSQL) | データベース・認証・Edge Functions |
| Data Transform | dbt-core + dbt-postgres | ELT パイプライン |
| AI | Claude API (Anthropic SDK) | 自然言語 → SQL 変換・結果要約 |
| Linter / Formatter | Biome | TypeScript / JSON の lint + format |
| Package Manager | pnpm / uv | JS / Python 依存管理 |

## Getting Started

### 前提条件

> **Dev Container 対応**: VS Code + Dev Containers 拡張機能があれば、以下の前提条件は自動でセットアップされます。
> 「Reopen in Container」で開くだけで開発を始められます。

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.200+
- [uv](https://docs.astral.sh/uv/) (Python パッケージマネージャ)
- [dbt-core](https://docs.getdbt.com/) + dbt-postgres

### セットアップ

```bash
# 1. リポジトリのクローン
git clone https://github.com/your-org/supabase-open-warehouse.git
cd supabase-open-warehouse

# 2. 環境変数の設定
cp .env.local.example .env.local
# .env.local を編集して API キーを設定

# 3. フロントエンド依存のインストール
pnpm install

# 4. Supabase ローカル環境の起動
supabase start

# 5. DB マイグレーション & シード
supabase db reset

# 6. dbt 環境のセットアップ
cd dbt
uv sync
uv run dbt run
cd ..

# 7. 開発サーバーの起動
pnpm dev
```

開発サーバーが起動したら http://localhost:3000 にアクセスしてください。

## ディレクトリ構成

```
supabase-open-warehouse/
├── src/                        # Next.js アプリケーション
│   ├── app/                    #   App Router ページ・レイアウト
│   ├── components/             #   React コンポーネント
│   ├── lib/                    #   ユーティリティ・API クライアント
│   └── types/                  #   TypeScript 型定義（DB 型含む）
├── supabase/                   # Supabase プロジェクト設定
│   ├── migrations/             #   SQL マイグレーション
│   ├── functions/              #   Edge Functions
│   └── seed.sql                #   シードデータ
├── dbt/                        # dbt プロジェクト
│   ├── models/                 #   SQL モデル（raw/staging/mart）
│   ├── tests/                  #   データテスト
│   └── dbt_project.yml         #   dbt 設定
├── docs/                       # ドキュメント
│   ├── architecture.md         #   アーキテクチャ詳細
│   └── data-sources.md         #   データソース仕様
├── .devcontainer/              # Dev Container 設定
│   ├── devcontainer.json       #   コンテナ・拡張機能定義
│   └── post-create.sh          #   セットアップスクリプト
├── .env.local.example          # 環境変数テンプレート
├── biome.json                  # Biome (linter/formatter) 設定
├── CLAUDE.md                   # Claude Code 用ガイドライン
└── README.md                   # このファイル
```

## 開発フェーズ

### Phase 1: MVP — データ取込 + チャット ← 現在

- TEPCO CSV データの取込パイプライン構築
- dbt による raw → staging → mart 変換
- Claude API を使った自然言語 → SQL チャット UI
- Supabase (PostgreSQL) のみで完結

### Phase 2: 運用強化

- データ取込の自動化（Supabase Edge Functions + pg_cron）
- エラーハンドリング・監視の強化
- チャット UX の改善（グラフ表示など）

### Phase 3: Iceberg / OLAP 統合

- Supabase の Iceberg サポートを活用した OLAP 分離
- 大規模データ対応・パフォーマンス最適化

## AI 開発ツール（MCP & Skills）

本プロジェクトは [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) を活用し、
AI アシスタントから各サービスを直接操作できます。

### 公式 MCP サーバー

| サーバー | 用途 | 設定 |
|---------|------|------|
| [Supabase MCP](https://supabase.com/docs/guides/getting-started/mcp) | テーブル管理・SQL 実行・RLS・Docs | OAuth（自動認証） |
| [dbt MCP](https://github.com/dbt-labs/dbt-mcp) | モデル実行・テスト・メタデータ | `uvx dbt-mcp`（ローカル） |
| [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp) | デプロイ管理・ログ分析 | OAuth（自動認証） |
| [GitHub MCP](https://github.com/github/github-mcp-server) | PR/Issue・コードレビュー | OAuth（自動認証） |

### 公式 Agent Skills

- [supabase-postgres-best-practices](https://github.com/supabase/agent-skills) — PostgreSQL 最適化ガイダンス

### MCP セットアップ

```bash
# Claude Code で MCP を認証
claude
/mcp
```

設定は `.mcp.json`（Git 管理）に記載されています。

## フロントエンド開発

### shadcn/ui コンポーネント追加

```bash
pnpm dlx shadcn@latest add [component-name]
```

コンポーネントは `src/components/ui/` に生成されます。
このディレクトリは Biome の lint 対象外です。

### 開発ワークフロー

```bash
pnpm dev          # 開発サーバー起動 (http://localhost:3000)
pnpm build        # プロダクションビルド
pnpm check        # Biome lint + format チェック
pnpm check:fix    # Biome lint + format 自動修正
```

## 参考リンク

- [TEPCO でんき予報](https://www.tepco.co.jp/forecast/) — データソース
- [TEPCO CSV データ](https://www.tepco.co.jp/forecast/html/images/juyo-d-j.csv) — 当日実績 CSV
- [Supabase Docs](https://supabase.com/docs) — Supabase 公式ドキュメント
- [dbt Docs](https://docs.getdbt.com/) — dbt 公式ドキュメント
- [Claude API](https://docs.anthropic.com/en/docs) — Anthropic API ドキュメント

## ライセンス

MIT
