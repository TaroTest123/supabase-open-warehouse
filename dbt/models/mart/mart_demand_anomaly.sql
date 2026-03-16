-- mart_demand_anomaly: Z-score ベースの異常値検出（日次粒度）
-- mart_daily_demand の日次集計を再利用し、全体統計との乖離度を算出

with stats as (
    select
        avg(avg_demand_mw) as global_avg_demand,
        stddev(avg_demand_mw) as stddev_avg_demand,
        avg(max_demand_mw) as global_avg_peak,
        stddev(max_demand_mw) as stddev_peak
    from {{ ref('mart_daily_demand') }}
)

select
    d.demand_date,
    d.max_demand_mw as peak_demand_mw,
    d.avg_demand_mw,
    d.max_usage_pct,
    round(
        (d.avg_demand_mw - s.global_avg_demand)
        / nullif(s.stddev_avg_demand, 0),
        2
    ) as avg_demand_zscore,
    round(
        (d.max_demand_mw - s.global_avg_peak)
        / nullif(s.stddev_peak, 0),
        2
    ) as peak_demand_zscore,
    abs(
        (d.avg_demand_mw - s.global_avg_demand)
        / nullif(s.stddev_avg_demand, 0)
    ) > 2
    or abs(
        (d.max_demand_mw - s.global_avg_peak)
        / nullif(s.stddev_peak, 0)
    ) > 2 as is_anomaly
from {{ ref('mart_daily_demand') }} d
cross join stats s
