-- mart_hourly_demand: 日×時間帯の需要分析

select
    demand_date,
    extract(hour from demand_time)::int as hour_of_day,
    round(avg(demand_mw), 1) as avg_demand_mw,
    max(demand_mw) as max_demand_mw,
    round(avg(usage_pct), 1) as avg_usage_pct
from {{ ref('stg_tepco_demand') }}
group by demand_date, extract(hour from demand_time)
