# ADR-0003: CI の dbt ジョブで Supabase CLI の代わりに PostgreSQL サービスコンテナを使用

- **Status**: Accepted
- **Date**: 2026-03-13
- **Deciders**: Project team

## Context and Problem Statement

CI (`ci.yml`, `docs.yml`) の dbt ジョブでは `supabase start` により Supabase フルスタック（PostgreSQL, Auth, Storage, Studio 等 10+ コンテナ）を起動していた。dbt が必要とするのは PostgreSQL のみだが、フルスタック起動に 3〜5 分かかり、CI 全体の実行時間の大部分を占めていた。

## Decision Drivers

- CI 実行時間の短縮（開発者フィードバックループの改善）
- GitHub Actions 無料枠（2,000 分/月）の節約
- 本番環境との互換性の維持
- マイグレーションの正確な検証

## Considered Options

1. **PostgreSQL サービスコンテナ** — GitHub Actions の `services:` で PostgreSQL のみ起動し、`psql` でマイグレーションを適用
2. **本番 Supabase に直接接続** — CI から本番 DB に接続して dbt run/test を実行
3. **ステージング用 Supabase プロジェクト** — CI 専用の Supabase プロジェクトを用意
4. **現状維持** — `supabase start` を継続

## Decision Outcome

**PostgreSQL サービスコンテナを採用**。

### Positive Consequences

- DB 起動が数秒で完了し、ジョブ全体で 3〜5 分の短縮
- Supabase CLI のセットアップステップも不要になり、さらに簡素化
- `supabase/postgres` Docker イメージを使用するため、本番と同じ PostgreSQL 拡張・設定が利用可能
- マイグレーションを `psql` で順次適用するため、SQL の正確性を検証できる
- `supabase stop` のクリーンアップステップも不要

### Negative Consequences

- Supabase CLI の `supabase db reset` が提供するシード・拡張の自動セットアップが使えない（`psql` で手動適用）
- Edge Functions や Auth に依存するマイグレーションを将来追加した場合、追加対応が必要
- ローカル開発（`supabase start`）と CI の DB セットアップ方法が異なる

## Comparison

| 観点 | PostgreSQL サービスコンテナ | 本番 Supabase 接続 | ステージング Supabase | 現状維持 |
|------|--------------------------|-------------------|---------------------|---------|
| **起動時間** | 数秒 | 不要 | 不要 | 3〜5 分 |
| **本番への影響** | なし | PR で本番 DB が変更されるリスク | なし | なし |
| **互換性** | 同じ PostgreSQL イメージ | 完全一致 | 完全一致 | 完全一致 |
| **管理コスト** | 低い | 低い（ただしリスク高） | 中（追加プロジェクト管理） | 低い |
| **Secrets 依存** | なし | 必要 | 必要 | なし |
| **並行実行の安全性** | 安全（ジョブごとに独立） | 競合リスクあり | 競合リスクあり | 安全 |

## Notes

- 現在のマイグレーション（`raw_tepco_demand`, `readonly_user`, `ingestion_log`）はすべて純粋な SQL で、Supabase 固有の機能には依存していない
- `ci.yml` と `docs.yml` の両方に同じ変更を適用
- `ingest-tepco.yml` の `dbt-refresh` ジョブは本番 DB に接続する必要があるため、変更対象外
