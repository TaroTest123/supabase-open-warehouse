# ADR-0006: CI で mart テーブル整合性チェック + dbt モデル変更時の自動デプロイ

- **Status**: Accepted
- **Date**: 2026-03-16
- **Deciders**: Project team

## Context and Problem Statement

新しい dbt mart モデル（例: `mart_demand_moving_avg`）を追加すると、フロントエンドの `MART_TABLE_SCHEMAS`（Claude API へのシステムプロンプト）には反映されるが、本番 DB にテーブルが作成されないまま Vercel にデプロイされることがあった。結果、チャット UI でユーザーが質問すると AI が存在しないテーブルへの SQL を生成し、`relation "mart_demand_moving_avg" does not exist` エラーが発生していた。

根本原因は以下の3つのデプロイパスが独立しており、同期されていなかったこと:

1. **Supabase migrations** (`deploy-supabase.yml`) — raw テーブルの DDL のみ
2. **Vercel deploy** — フロントエンド（`MART_TABLE_SCHEMAS` 含む）を自動デプロイ
3. **dbt run** (`dbt-refresh.yml`) — mart テーブル作成。データ取り込み時のみ実行

## Decision Drivers

- 新しい mart モデル追加時の「テーブルが存在しない」エラーの再発防止
- フロントエンドと dbt モデルの整合性の自動検証
- マイグレーション → dbt run の実行順序保証
- dbt のみの変更時に不要なマイグレーションデプロイをスキップ

## Decision

### 1. CI に mart テーブル整合性チェックを追加 (`ci.yml`)

PR 時に `constants.ts` の `MART_TABLE_SCHEMAS` に記載されたテーブル名と `dbt/models/mart/*.sql` のファイル名を突合する `schema-consistency` ジョブを追加:

- **constants.ts にあるが dbt モデルがない** → `::error` で CI 失敗
- **dbt モデルはあるが constants.ts にない** → `::warning`（内部用モデルがあり得るため）
- **どちらかの抽出結果が空** → `::error` で CI 失敗（パターン変更による無言の通過を防止）

### 2. dbt デプロイを `deploy-supabase.yml` に統合

別ワークフロー（`deploy-dbt.yml`）だとマイグレーション完了前に `dbt run` が走る可能性があるため、`deploy-supabase.yml` に統合:

```
main にマージ
  ↓
deploy-supabase.yml がトリガー
  ↓
changes (dorny/paths-filter でパス検出)
  ↓
migrate (supabase db push) ── supabase 変更がある場合のみ実行
  ├── deploy-functions (並列)
  └── dbt-refresh (needs: migrate で順序保証)
```

- `dorny/paths-filter` で `supabase/**` と `dbt/**` の変更を検出
- `migrate` は supabase ファイル変更時のみ実行（dbt のみの変更時はスキップ）
- `dbt-refresh` は `needs: [changes, migrate]` + `if: always() && needs.migrate.result != 'failure'` で、migrate が skipped でも実行、failure なら停止

## Considered Options

1. **dbt デプロイを別ワークフローにする** — 実装は簡単だがマイグレーションとの実行順序が保証できない
2. **dbt デプロイを `deploy-supabase.yml` に統合する** — 順序保証可能、パスフィルタで無駄な実行もスキップ
3. **Vercel のデプロイフックで dbt run をトリガーする** — Vercel 依存が増え、複雑化する

## Decision Outcome

**Option 2 を採用**。単一ワークフロー内の `needs` で実行順序を保証し、`dorny/paths-filter` で不要なジョブをスキップする。

### Positive Consequences

- 新しい mart モデル追加時に本番 DB への自動デプロイが保証される
- フロントエンドが参照するテーブルが dbt に存在するか CI で自動検証される
- マイグレーション → dbt run の実行順序が `needs` で保証される
- dbt のみの変更時にマイグレーションデプロイが不要にスキップされる

### Negative Consequences

- `deploy-supabase.yml` の複雑度が増加（`changes` ジョブ + 条件分岐）
- `dorny/paths-filter` への外部依存が追加される
- `schema-consistency` の grep パターンが `constants.ts` のマークダウンフォーマットに依存（空結果ガードで軽減済み）

## Notes

- `schema-consistency` ジョブは他のジョブ（`frontend`, `dbt`）と並列で実行され、CI 時間への影響はない
- `deploy-functions` は `migrate` に `needs` 依存しているため、supabase 変更がなくても実行される（既存の動作を維持）
- `dbt-refresh.yml` は既存のリユーザブルワークフローをそのまま使用
