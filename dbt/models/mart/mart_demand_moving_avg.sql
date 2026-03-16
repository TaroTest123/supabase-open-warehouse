-- mart_demand_moving_avg: 移動平均による需要トレンド分析（日次粒度）

with daily as (
    select
        demand_date,
        max(demand_mw) as peak_demand_mw,
        round(avg(demand_mw), 1) as avg_demand_mw,
        max(usage_pct) as max_usage_pct
    from {{ ref('stg_tepco_demand') }}
    group by demand_date
)

select
    demand_date,
    peak_demand_mw,
    avg_demand_mw,
    max_usage_pct,
    round(avg(avg_demand_mw) over (
        order by demand_date
        rows between 6 preceding and current row
    ), 1) as avg_demand_7d_ma,
    round(avg(avg_demand_mw) over (
        order by demand_date
        rows between 29 preceding and current row
    ), 1) as avg_demand_30d_ma,
    round(avg(peak_demand_mw) over (
        order by demand_date
        rows between 6 preceding and current row
    ), 1) as peak_demand_7d_ma,
    round(avg(peak_demand_mw) over (
        order by demand_date
        rows between 29 preceding and current row
    ), 1) as peak_demand_30d_ma
from daily
