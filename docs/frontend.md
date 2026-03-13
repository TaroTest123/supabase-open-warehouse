# フロントエンド設計ドキュメント

## 概要

Next.js 15 (App Router) + shadcn/ui によるチャット UI。
自然言語で TEPCO 電力需要データを問い合わせ、結果をテーブル表示する。

## 技術選定

| 技術 | 理由 |
|------|------|
| Next.js 15 App Router | React Server Components、API Routes、TypeScript ネイティブ対応 |
| shadcn/ui | コンポーネント所有権（コピーベース）、Tailwind ネイティブ、高いカスタマイズ性 |
| Tailwind CSS v4 | ユーティリティファースト、shadcn/ui との統合 |
| postgres (npm) | `readonly_user` で AI 生成 SQL を直接実行（ORM 不使用方針に準拠） |

## コンポーネント構成

```
frontend/src/
├── app/
│   ├── layout.tsx          # ルートレイアウト（Inter フォント、メタデータ）
│   ├── page.tsx            # ホームページ → ChatContainer 描画
│   ├── globals.css         # Tailwind v4 + shadcn/ui テーマ変数
│   └── api/chat/
│       └── route.ts        # チャット API エンドポイント
├── components/
│   ├── ui/                 # shadcn/ui コンポーネント（CLI 生成）
│   └── chat/               # チャット機能コンポーネント
│       ├── chat-container.tsx  # チャット全体の状態管理
│       ├── chat-message.tsx    # メッセージバブル表示
│       ├── chat-input.tsx      # 入力フォーム
│       └── data-table.tsx      # SQL 結果テーブル表示
├── lib/
│   ├── utils.ts            # cn() ユーティリティ
│   ├── supabase/server.ts  # Supabase サーバークライアント
│   ├── claude.ts           # Claude API ラッパー
│   └── constants.ts        # プロンプト・スキーマ定義
└── types/
    ├── chat.ts             # チャット関連型定義
    └── database.ts         # DB 型定義（自動生成）
```

### コンポーネント責務

| コンポーネント | 責務 | Props |
|-------------|------|-------|
| `ChatContainer` | メッセージ状態管理、API 通信、自動スクロール | なし（Client Component） |
| `ChatMessage` | メッセージ表示（テキスト、SQL、結果テーブル） | `message: ChatMessage` |
| `ChatInput` | テキスト入力、送信ハンドリング | `onSend`, `isLoading` |
| `DataTable` | SQL 結果のテーブル表示 | `columns`, `rows` |

## API 設計

### POST /api/chat

**リクエスト:**
```json
{ "message": "7月の最大電力需要は？" }
```

**レスポンス (成功):**
```json
{
  "content": "7月の最大電力需要は 4,567 MW でした。",
  "sqlQuery": "SELECT max_demand_mw FROM mart_daily_demand WHERE ...",
  "sqlResults": [{ "max_demand_mw": 4567 }]
}
```

**レスポンス (エラー):**
```json
{ "error": "エラーメッセージ" }
```

## データフロー

```
ユーザー入力
    │
    ▼
ChatContainer (fetch /api/chat)
    │
    ▼
API Route (route.ts)
    ├── 1. generateSQL() → Claude Sonnet で SQL 生成
    ├── 2. validateSQL() → SELECT/WITH のみ許可
    ├── 3. postgres.unsafe() → readonly_user で実行
    └── 4. summarizeResults() → Claude で日本語要約
    │
    ▼
ChatMessage + DataTable で表示
```

## セキュリティ — 3 層防御

1. **アプリ層 (validateSQL)**
   - SELECT/WITH で始まるクエリのみ許可
   - INSERT, UPDATE, DELETE, DROP, ALTER 等のキーワードを拒否

2. **DB ロール層 (readonly_user)**
   - `mart_*` テーブルの SELECT 権限のみ
   - DDL/DML は DB レベルで拒否

3. **DB タイムアウト層**
   - `statement_timeout = 10s`（ロールレベル設定）
   - 重いクエリの自動キャンセル

## 環境変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | - |
| `SUPABASE_READONLY_DB_URL` | readonly_user の接続 URL | `postgresql://readonly_user:readonly_pass@127.0.0.1:54322/postgres` |
| `ANTHROPIC_API_KEY` | Claude API キー | `sk-ant-xxx` |

## 開発ガイド

### shadcn/ui コンポーネント追加

```bash
cd frontend && pnpm dlx shadcn@latest add [component-name]
```

`frontend/src/components/ui/` に生成される。このディレクトリは Biome の lint 対象外。

### Biome (Linter/Formatter)

```bash
cd frontend
pnpm check        # チェックのみ
pnpm check:fix    # 自動修正
```
