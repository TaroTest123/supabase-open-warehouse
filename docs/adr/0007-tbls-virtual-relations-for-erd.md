# ADR-0007: tbls 仮想リレーション + FK 制約注入で Liam ERD にリレーションを表示

- **Status**: Accepted
- **Date**: 2026-03-16
- **Deciders**: Project team

## Context and Problem Statement

PostgreSQL に FK 制約がゼロのため、tbls / Liam ERD が生成する ERD ドキュメントにリレーションラインが表示されない。dbt の table materialization は DROP + CREATE するため、dbt post-hook で FK を追加しても毎回消える。ERD にデータリネージ（raw → staging → mart）を視覚的に表現する方法が必要。

## Decision Drivers

- ERD にリレーションラインを表示し、テーブル間のデータフローを可視化したい
- dbt の table materialization と共存できる方法が必要
- CI（GitHub Actions）で自動生成される ERD に反映される必要がある
- 実行時パフォーマンスに影響を与えない（FK 制約は実データに対するチェックを伴う）

## Considered Options

1. **tbls 仮想リレーション (`.tbls.yml` の `relations`) + CI で FK 制約注入**
2. **dbt post-hook で ALTER TABLE ADD CONSTRAINT** — table materialization が DROP + CREATE するため毎回消える
3. **dim_date ディメンションテーブル** — AI 生成 SQL の複雑性が上がり、現時点ではオーバーエンジニアリング
4. **PostgreSQL に実 FK 制約を追加** — dbt が管理するテーブルでは維持できない

## Decision Outcome

**Option 1: tbls 仮想リレーション + CI で FK 制約注入を採用**。

`.tbls.yml` に仮想リレーションを定義し、CI の docs ワークフローで `schema.json` を後処理して Liam ERD が認識する FK 制約形式に変換する。

### 実装上の注意点

調査で判明した 2 つの落とし穴:

1. **`tbls doc --dsn` のみでは `.tbls.yml` が読み込まれない** — `--config .tbls.yml` を必ず併用する必要がある。`--dsn` フラグだけを渡すと、仮想リレーション・include・comments が全て無視される。

2. **Liam ERD の tbls パーサーは `relations` 配列を処理しない** — `@liam-hq/cli` の `parseTblsSchema` 関数はテーブル・カラム・制約・インデックス・enum のみを処理し、tbls の `relations` 配列は無視する。リレーションはテーブルの `constraints` 内の `FOREIGN KEY` エントリからのみ描画される。そのため CI で `schema.json` を後処理し、`relations` を各テーブルの `constraints` に FK 制約として注入するステップが必要。

### CI ワークフローの構成

```yaml
# 1. tbls docs 生成（--config で .tbls.yml を読み込み）
- run: tbls doc --config .tbls.yml --dsn "..."

# 2. schema.json を後処理（relations → constraints に変換）
- run: python3 -c "..."  # virtual relations を FK constraints として注入

# 3. Liam ERD 生成（後処理済み schema.json を入力）
- run: npx @liam-hq/cli erd build --format tbls --input schema.json
```

### Positive Consequences

- ERD にリレーションライン（raw → staging → mart）が表示される
- dbt の table materialization に干渉しない（DB 側に FK 制約を作らない）
- dbt `relationships` テストでデータリネージの整合性も CI で検証できる

### Negative Consequences

- CI に Python 後処理ステップが増える（Liam ERD が tbls の relations をサポートすれば不要になる）
- `.tbls.yml` と dbt `schema.yml` の両方でリレーション定義を管理する必要がある

## Links

- [PR #20](../../pull/20) — `.tbls.yml` 仮想リレーション + dbt relationships テスト追加
- [PR #25](../../pull/25) — CI の tbls --config 修正 + FK 制約注入ステップ追加
