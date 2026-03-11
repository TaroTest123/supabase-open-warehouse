-- mart_daily_demand: 日次需要サマリ

select
    demand_date,
    max(demand_mw) as max_demand_mw,
    min(demand_mw) as min_demand_mw,
    round(avg(demand_mw), 1) as avg_demand_mw,
    max(usage_pct) as max_usage_pct,
    count(*) as record_count
from {{ ref('stg_tepco_demand') }}
group by demand_date
