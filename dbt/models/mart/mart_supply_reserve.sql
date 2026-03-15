-- mart_supply_reserve: 日次の供給予備率・逼迫度分析

select
    demand_date,
    max(demand_mw) as peak_demand_mw,
    max(supply_capacity_mw) as max_supply_capacity_mw,
    round(
        (max(supply_capacity_mw) - max(demand_mw)) / nullif(max(supply_capacity_mw), 0) * 100,
        1
    ) as reserve_margin_pct,
    min(
        (supply_capacity_mw - demand_mw) / nullif(supply_capacity_mw, 0) * 100
    )::numeric(5,1) as min_reserve_margin_pct,
    max(usage_pct) as max_usage_pct,
    round(avg(usage_pct), 1) as avg_usage_pct,
    count(*) as record_count
from {{ ref('stg_tepco_demand') }}
where supply_capacity_mw is not null
group by demand_date
