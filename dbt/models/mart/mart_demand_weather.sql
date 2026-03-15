-- mart_demand_weather: 電力需要 × 気象データの結合分析（日次）

with daily_demand as (
    select
        demand_date,
        max(demand_mw) as peak_demand_mw,
        min(demand_mw) as min_demand_mw,
        round(avg(demand_mw), 1) as avg_demand_mw,
        max(usage_pct) as max_usage_pct
    from {{ ref('stg_tepco_demand') }}
    group by demand_date
),

daily_weather as (
    select
        weather_date,
        round(max(temperature_c), 1) as max_temperature_c,
        round(min(temperature_c), 1) as min_temperature_c,
        round(avg(temperature_c), 1) as avg_temperature_c,
        round(avg(relative_humidity_pct), 1) as avg_humidity_pct,
        round(sum(precipitation_mm), 1) as total_precipitation_mm,
        round(avg(shortwave_radiation_wm2), 1) as avg_radiation_wm2,
        round(max(shortwave_radiation_wm2), 1) as max_radiation_wm2,
        round(avg(wind_speed_ms), 1) as avg_wind_speed_ms,
        round(avg(cloud_cover_pct), 1) as avg_cloud_cover_pct
    from {{ ref('stg_weather_tokyo') }}
    group by weather_date
)

select
    d.demand_date,
    d.peak_demand_mw,
    d.min_demand_mw,
    d.avg_demand_mw,
    d.max_usage_pct,
    w.max_temperature_c,
    w.min_temperature_c,
    w.avg_temperature_c,
    w.avg_humidity_pct,
    w.total_precipitation_mm,
    w.avg_radiation_wm2,
    w.max_radiation_wm2,
    w.avg_wind_speed_ms,
    w.avg_cloud_cover_pct
from daily_demand d
inner join daily_weather w
    on d.demand_date = w.weather_date
