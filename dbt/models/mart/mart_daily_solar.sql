-- mart_daily_solar: 日次太陽光発電サマリ

select
    demand_date,
    max(solar_mw) as max_solar_mw,
    min(solar_mw) as min_solar_mw,
    round(avg(solar_mw), 1) as avg_solar_mw,
    round(sum(solar_mw) / 12.0, 1) as total_solar_mwh,
    max(solar_pct) as max_solar_pct,
    round(avg(solar_pct), 1) as avg_solar_pct,
    round(avg(demand_mw), 1) as avg_demand_mw,
    count(*) as record_count
from {{ ref('stg_tepco_demand_5min') }}
where solar_mw is not null
group by demand_date
