-- Create weather data table for Tokyo area (Open-Meteo Historical Weather API)
CREATE TABLE IF NOT EXISTS raw_weather_tokyo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL,
  temperature_c NUMERIC(4,1),
  relative_humidity_pct NUMERIC(4,1),
  precipitation_mm NUMERIC(5,1),
  shortwave_radiation_wm2 NUMERIC(6,1),
  wind_speed_ms NUMERIC(5,1),
  wind_direction_deg NUMERIC(4,0),
  cloud_cover_pct NUMERIC(4,1),
  pressure_hpa NUMERIC(6,1),
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_raw_weather_tokyo_recorded_at
  ON raw_weather_tokyo (recorded_at);

COMMENT ON TABLE raw_weather_tokyo IS 'Open-Meteo Historical Weather API による東京エリアの気象データ (1時間間隔)';
COMMENT ON COLUMN raw_weather_tokyo.recorded_at IS '観測日時 (UTC → JST で利用)';
COMMENT ON COLUMN raw_weather_tokyo.temperature_c IS '気温 (°C)';
COMMENT ON COLUMN raw_weather_tokyo.relative_humidity_pct IS '相対湿度 (%)';
COMMENT ON COLUMN raw_weather_tokyo.precipitation_mm IS '降水量 (mm)';
COMMENT ON COLUMN raw_weather_tokyo.shortwave_radiation_wm2 IS '短波放射 / 日射量 (W/m²)';
COMMENT ON COLUMN raw_weather_tokyo.wind_speed_ms IS '風速 (m/s)';
COMMENT ON COLUMN raw_weather_tokyo.wind_direction_deg IS '風向 (°)';
COMMENT ON COLUMN raw_weather_tokyo.cloud_cover_pct IS '雲量 (%)';
COMMENT ON COLUMN raw_weather_tokyo.pressure_hpa IS '海面気圧 (hPa)';
