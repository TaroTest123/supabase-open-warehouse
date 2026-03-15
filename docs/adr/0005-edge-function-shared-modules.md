# ADR-0005: Edge Functions の共有モジュールパターンを採用

- **Status**: Accepted
- **Date**: 2026-03-15
- **Deciders**: Project team

## Context and Problem Statement

`ingest-tepco-csv` と `ingest-weather` の 2 つの Edge Function で、ingestion ログ記録・JSON レスポンス生成・リクエストガード・ステータス判定のコードが重複していた。今後さらに Edge Function が増える可能性がある中で、共通ロジックの重複を排除し保守性を向上させる必要がある。

## Decision Drivers

- コードの DRY 原則（重複排除）
- 型安全性の一貫性（`IngestionStatus` 型の共有）
- Deno Deploy / Supabase Edge Functions のモジュール解決制約
- 変更時の影響範囲の最小化

## Considered Options

1. **`_shared/` ディレクトリによる相対インポート** — `supabase/functions/_shared/` に共有モジュールを配置し、各 Edge Function から `../\_shared/` で参照
2. **各 Edge Function 内にコピー** — 現状維持（コピペ）
3. **npm パッケージとして公開** — 共有コードを npm パッケージ化

## Decision Outcome

**`_shared/` ディレクトリによる相対インポートを採用**。

Supabase Edge Functions は `supabase/functions/_shared/` ディレクトリを共有モジュール用の規約ディレクトリとして公式にサポートしている。各 Edge Function から `../\_shared/ingestion.ts` のように相対パスでインポートする。

### Positive Consequences

- `logIngestion`, `jsonResponse`, `guardRequest`, `deriveStatus`, `getSupabaseEnv` を 1 箇所で管理
- `IngestionStatus` 型を共有し、stringly-typed なバグを防止
- 新しい Edge Function 追加時のボイラープレートを大幅に削減
- Supabase 公式の規約に準拠しており、追加設定不要

### Negative Consequences

- `_shared/` の変更が全 Edge Function に影響するため、変更時は全 Function のテストが必要

### 不採用理由

- **コピペ**: DRY 違反。型の不一致（`string` vs `IngestionStatus`）が実際に発生していた
- **npm パッケージ**: 2 Function 程度の規模ではオーバーエンジニアリング

## Implementation

```
supabase/functions/
├── _shared/
│   └── ingestion.ts          # logIngestion, jsonResponse, guardRequest, deriveStatus, getSupabaseEnv
├── ingest-tepco-csv/
│   └── index.ts              # import from "../_shared/ingestion.ts"
└── ingest-weather/
    └── index.ts              # import from "../_shared/ingestion.ts"
```

## Links

- [Supabase Edge Functions: Sharing Code](https://supabase.com/docs/guides/functions/quickstart#sharing-code)
