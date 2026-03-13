-- Add forecast column to raw_tepco_demand (ZIP hourly section has forecast values)
ALTER TABLE raw_tepco_demand
ADD COLUMN IF NOT EXISTS forecast_mw_str TEXT;

-- Create 5-minute interval data table
CREATE TABLE IF NOT EXISTS raw_tepco_demand_5min (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date_str TEXT NOT NULL,
  time_str TEXT NOT NULL,
  demand_mw_str TEXT,
  solar_mw_str TEXT,
  solar_pct_str TEXT,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date_str, time_str)
);

-- Index for dedup / upsert performance
CREATE INDEX IF NOT EXISTS idx_raw_tepco_demand_5min_date_time
  ON raw_tepco_demand_5min (date_str, time_str);

COMMENT ON TABLE raw_tepco_demand_5min IS 'TEPCO 月別 ZIP の5分間隔セクションの生データ';
COMMENT ON COLUMN raw_tepco_demand_5min.date_str IS '日付文字列 (YYYY/M/D)';
COMMENT ON COLUMN raw_tepco_demand_5min.time_str IS '時刻文字列 (H:MM)';
COMMENT ON COLUMN raw_tepco_demand_5min.demand_mw_str IS '需要実績 (万kW, TEXT)';
COMMENT ON COLUMN raw_tepco_demand_5min.solar_mw_str IS '太陽光発電実績 (万kW, TEXT)';
COMMENT ON COLUMN raw_tepco_demand_5min.solar_pct_str IS '太陽光発電割合 (%, TEXT)';
COMMENT ON COLUMN raw_tepco_demand.forecast_mw_str IS '予測値 (万kW, TEXT) — ZIP 1時間セクションのみ';
