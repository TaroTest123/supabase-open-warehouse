-- mart_supply_reserve: 日次の供給予備率・逼迫度分析
-- ピーク需要時の供給力を使って予備率を算出

with hourly as (
    select
        demand_date,
        demand_mw,
        supply_capacity_mw,
        usage_pct,
        row_number() over (
            partition by demand_date
            order by demand_mw desc
        ) as peak_rank
    from {{ ref('stg_tepco_demand') }}
    where supply_capacity_mw is not null
)

select
    demand_date,
    max(demand_mw) as peak_demand_mw,
    max(case when peak_rank = 1 then supply_capacity_mw end) as peak_supply_capacity_mw,
    round(
        max(case when peak_rank = 1
            then (supply_capacity_mw - demand_mw) / nullif(supply_capacity_mw, 0) * 100
        end),
        1
    ) as reserve_margin_pct,
    min(
        (supply_capacity_mw - demand_mw) / nullif(supply_capacity_mw, 0) * 100
    )::numeric(5,1) as min_reserve_margin_pct,
    max(usage_pct) as max_usage_pct,
    round(avg(usage_pct), 1) as avg_usage_pct,
    count(*) as record_count
from hourly
group by demand_date
