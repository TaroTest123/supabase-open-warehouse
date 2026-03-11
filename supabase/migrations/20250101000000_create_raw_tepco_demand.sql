-- raw_tepco_demand: TEPCO CSV データをそのまま保持するテーブル
-- 全カラム TEXT で CSV の生データを格納

CREATE TABLE IF NOT EXISTS raw_tepco_demand (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    date_str TEXT NOT NULL,           -- 例: "2024/7/1"
    time_str TEXT NOT NULL,           -- 例: "10:00"
    demand_mw_str TEXT,               -- 万kW 単位の需要実績
    supply_capacity_mw_str TEXT,      -- 万kW 単位の供給力
    usage_pct_str TEXT,               -- 使用率 (%)
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_raw_tepco_date_time UNIQUE (date_str, time_str)
);

-- dbt dedup 用の複合インデックス
CREATE INDEX idx_raw_tepco_demand_dedup
    ON raw_tepco_demand (date_str, time_str, loaded_at DESC);

COMMENT ON TABLE raw_tepco_demand IS 'TEPCO でんき予報 CSV の生データ格納テーブル';
