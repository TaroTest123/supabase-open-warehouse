# ADR-0002: TEPCO CSV 自動取り込みに Edge Function + GitHub Actions cron を採用

- **Status**: Accepted
- **Date**: 2026-03-13
- **Deciders**: Project team

## Context and Problem Statement

TEPCO でんき予報 CSV を日次で自動取り込みし、dbt パイプラインを通じて mart テーブルを更新する仕組みが必要。現状はシードデータによる手動投入のみ。

## Decision Drivers

- DB 近傍での CSV 取得・パース・upsert の効率性
- dbt run との統合の容易さ
- 実行ログの可視性・デバッグ容易性
- 手動バックフィルの対応
- 将来の pg_cron 移行パス

## Considered Options

1. **Edge Function + GitHub Actions cron** — Edge Function で CSV 取得・upsert、GitHub Actions でスケジューリング + dbt run
2. **pg_cron + pg_net** — PostgreSQL 拡張でスケジューリングと HTTP 取得をすべて DB 内で完結
3. **GitHub Actions のみ** — Actions 内で CSV 取得・DB 接続・upsert をすべて実行

## Decision Outcome

**Edge Function + GitHub Actions cron を採用**。

### Positive Consequences

- Edge Function は Supabase インフラ内で実行されるため、DB への upsert がネットワーク的に近い
- GitHub Actions の cron + `workflow_dispatch` で、定期実行と手動バックフィルの両方に対応
- GitHub Actions のログ UI で実行結果を容易に確認・デバッグ可能
- dbt run を同じワークフロー内で `needs:` チェーンにより自然に統合
- `ingestion_log` テーブルでアプリケーション側からも取り込み履歴を参照可能

### Negative Consequences

- GitHub Actions の cron は正確なタイミングが保証されない（数分〜数十分の遅延あり）
- Edge Function と GitHub Actions の 2 箇所にロジックが分散する
- GitHub Actions の無料枠（2,000 分/月）を消費する

## Comparison

| 観点 | Edge Function + GitHub Actions | pg_cron + pg_net | GitHub Actions のみ |
|------|-------------------------------|------------------|-------------------|
| **DB 近接性** | Edge Function が Supabase 内で実行 | DB 内で完結 | Actions ランナーから外部接続 |
| **ログ可視性** | GitHub Actions UI + ingestion_log | pg_cron のログのみ（参照しづらい） | GitHub Actions UI |
| **dbt 統合** | 同一ワークフローで自然に連携 | 別途トリガーが必要 | 同一ワークフローで自然に連携 |
| **手動実行** | workflow_dispatch で容易 | SQL 手動実行 | workflow_dispatch で容易 |
| **Shift_JIS 対応** | Deno の TextDecoder で対応 | pg_net では困難 | Node.js の iconv 等で対応 |
| **将来移行** | pg_cron への段階的移行が可能 | — | Edge Function への移行が必要 |

## Migration Path

将来的に pg_cron + pg_net に移行する場合:

1. `pg_cron` 拡張を有効化
2. Edge Function の URL を `pg_net` の `http_post()` で呼び出す cron ジョブを作成
3. GitHub Actions の cron トリガーを削除（dbt run は別途トリガー）
4. dbt run のトリガーは Database Webhook → Edge Function → GitHub Actions API で実現可能
