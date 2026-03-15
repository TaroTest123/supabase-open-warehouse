-- stg_weather_tokyo: 気象データの型変換・日付/時刻分離
-- recorded_at (TIMESTAMPTZ) から JST の日付・時刻を抽出

with deduplicated as (
    select
        *,
        row_number() over (
            partition by recorded_at
            order by loaded_at desc
        ) as row_num
    from {{ source('raw', 'raw_weather_tokyo') }}
)

select
    id,
    (recorded_at at time zone 'Asia/Tokyo')::date as weather_date,
    (recorded_at at time zone 'Asia/Tokyo')::time as weather_time,
    temperature_c,
    relative_humidity_pct,
    precipitation_mm,
    shortwave_radiation_wm2,
    wind_speed_ms,
    wind_direction_deg,
    cloud_cover_pct,
    pressure_hpa,
    loaded_at
from deduplicated
where row_num = 1
