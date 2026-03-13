# ADR-0001: フロントエンドホスティングに Vercel を採用

- **Status**: Accepted
- **Date**: 2026-03-13
- **Deciders**: Project team

## Context and Problem Statement

Next.js 15 チャット UI のデプロイ先を決定する必要がある。
候補は **Vercel** と **Cloudflare Pages/Workers**。

## Decision Drivers

- Next.js App Router との互換性
- Supabase (PostgreSQL) への TCP 接続が必要（`postgres` パッケージ使用）
- Claude API (`@anthropic-ai/sdk`) の動作保証
- 開発体験（DX）: MCP 連携、PR プレビュー
- コスト

## Considered Options

1. **Vercel** — Next.js 開発元が提供するホスティング
2. **Cloudflare Pages/Workers** — Edge runtime ベースのホスティング

## Decision Outcome

**Vercel を採用**。コード変更ゼロでデプロイ可能であり、既存アーキテクチャとの整合性が最も高い。

### Positive Consequences

- `postgres` パッケージによる TCP 接続がそのまま動作
- `@anthropic-ai/sdk` が Node.js ランタイムで確実に動作
- Vercel Integration による Supabase 環境変数の自動同期
- PR ごとのプレビューデプロイが自動生成
- `.mcp.json` に Vercel MCP が設定済み

### Negative Consequences

- Hobby プランの Function 最大実行時間は 60 秒（現状は十分）
- 有料プランは $20/user/mo（Cloudflare の $5/mo より高い）
- ベンダーロックインのリスク（ただし Next.js 自体はオープンソース）

## Comparison

| 観点 | Vercel | Cloudflare Pages/Workers |
|------|--------|--------------------------|
| **互換性** | 完全互換（変更不要） | `postgres` パッケージが動作しない（TCP 不可） |
| **コスト (Free)** | 100 GB-hrs / 100 GB 帯域 | 100K req/day / 帯域無制限 |
| **コスト (有料)** | $20/user/mo | $5/mo |
| **コールドスタート** | ~200-500ms | ~50ms |
| **Next.js サポート** | 公式・全機能対応 | `opennextjs-cloudflare` 経由・一部制限あり |
| **Supabase 連携** | 公式 Integration あり | HTTP ベースに書き換え必要 |
| **DX** | MCP 設定済み、PR プレビュー自動 | wrangler 設定追加、MCP 未設定 |

## Cloudflare に移行する場合の必要変更（参考）

Cloudflare Workers は edge runtime (V8 isolate) で TCP ソケットが使えないため、以下の変更が必要:

1. `postgres` パッケージを削除
2. Supabase に `execute_readonly_query(sql text)` DB function を作成（マイグレーション追加）
3. `route.ts` を `supabase-js` の `.rpc()` 経由に書き換え
4. `route.ts` に `export const runtime = 'edge'` 追加
5. `@anthropic-ai/sdk` の edge 互換性を検証（`nodejs_compat` v2 フラグ必要の可能性）
6. `wrangler.toml` / `@cloudflare/next-on-pages` の設定追加

→ コストが問題になった場合に再検討する。

## Deployment Notes

### 環境変数（Vercel ダッシュボードで設定）

```
ANTHROPIC_API_KEY=sk-ant-xxx
SUPABASE_READONLY_DB_URL=postgresql://readonly_user:readonly_pass@<supabase-host>:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

### Root Directory 設定

- Vercel ダッシュボード → Settings → General → Root Directory → `frontend` に設定
- フロントエンドが `frontend/` サブディレクトリに分離されたため必須

### リージョン設定

- Vercel ダッシュボード → Settings → Functions → Region → Tokyo (`hnd1`)
- Supabase DB が東京リージョンの場合、ネットワークレイテンシ最小化
