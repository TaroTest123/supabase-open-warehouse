# ADR-0004: 気象データソースに Open-Meteo Historical Weather API を採用

- **Status**: Accepted
- **Date**: 2026-03-15
- **Deciders**: Project team

## Context and Problem Statement

電力需要は気温・日射量と強い相関がある。TEPCO 電力需要データと気象データを結合分析することで、需要パターンの要因分析や異常検知の精度を向上させたい。東京エリアの 1 時間間隔気象データを自動的に取得・蓄積する仕組みが必要。

## Decision Drivers

- TEPCO データ (1 時間 / 5 分間隔) と結合可能な粒度
- 自動取り込みの容易さ（API / CSV / スクレイピング）
- 必要な気象変数（気温、湿度、日射量、風速、降水量、雲量、気圧）の網羅性
- コスト（非商用・教育用途）
- データの信頼性・科学的裏付け

## Considered Options

1. **Open-Meteo Historical Weather API** — REST API、ERA5 再解析データベース、1 時間粒度
2. **気象庁 (JMA) 過去の気象データ** — HTML スクレイピング、10 分 / 1 時間粒度、公式観測値
3. **Meteostat** — Python ライブラリ + CSV バルクダウンロード、1 時間粒度
4. **NOAA ISD** — バルクダウンロード（固定長テキスト）、1〜3 時間粒度

## Decision Outcome

**Open-Meteo Historical Weather API を採用**。

### Positive Consequences

- API キー不要の REST API で自動化が容易。既存の Edge Function + GitHub Actions cron アーキテクチャにそのまま統合可能
- 日射量 (`shortwave_radiation`) を含む 50 以上の気象変数が利用可能。太陽光発電データとの相関分析にも対応
- ERA5 再解析データに基づき、科学的に信頼性が高い。1940 年以降のデータが利用可能
- 1 時間粒度が TEPCO 1 時間データと直接 JOIN 可能
- 1 回の API コールで 1 年分のデータを取得可能（バックフィルも効率的）
- 非商用利用は無料 (CC BY 4.0)

### Negative Consequences

- 5 分間隔データは提供されないため、TEPCO 5 分データとの直接結合はできない（日次集計での結合は可能）
- グリッド解像度 ≈ 10 km のため、特定地点の観測値ではなくモデル推定値
- Open-Meteo サービスへの依存。ただしデータは ERA5 がソースなので、Copernicus CDS から直接取得するフォールバックパスがある

### 不採用理由

- **JMA**: 公式 API がなく HTML スクレイピングが必要。自動化が脆弱で、構造変更で破損するリスクが高い。バックフィルには有用だが日次 cron には不適
- **Meteostat**: 日射量データがない。電力需要 × 太陽光発電の分析に不可欠な変数が欠落
- **NOAA ISD**: 固定長テキスト形式でパーサーが必要。観測間隔が不定（1〜3 時間）で時系列結合が煩雑

## Implementation

- `raw_weather_tokyo` テーブル: Open-Meteo から取得した生データを `TIMESTAMPTZ` 型で格納
- `ingest-weather` Edge Function: Open-Meteo API を呼び出し、JSON → upsert
- `stg_weather_tokyo`: JST 日付/時刻分離、dedup
- `mart_demand_weather`: 需要 × 気象の日次結合分析テーブル
- GitHub Actions (`ingest-weather.yml`): 日次 cron (21:00 UTC = 06:00 JST) で前日分を取得

## Links

- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
- [ERA5 (Copernicus)](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels)
- ADR-0002: TEPCO CSV 自動取り込みアーキテクチャ
