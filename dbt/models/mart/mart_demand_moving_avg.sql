-- mart_demand_moving_avg: 移動平均による需要トレンド分析（日次粒度）
-- mart_daily_demand の日次集計を再利用し、7日/30日の移動平均を算出

select
    demand_date,
    max_demand_mw as peak_demand_mw,
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
    round(avg(max_demand_mw) over (
        order by demand_date
        rows between 6 preceding and current row
    ), 1) as peak_demand_7d_ma,
    round(avg(max_demand_mw) over (
        order by demand_date
        rows between 29 preceding and current row
    ), 1) as peak_demand_30d_ma
from {{ ref('mart_daily_demand') }}
