-- mart_demand_anomaly: Z-score ベースの異常値検出（日次粒度）

with daily as (
    select
        demand_date,
        max(demand_mw) as peak_demand_mw,
        round(avg(demand_mw), 1) as avg_demand_mw,
        max(usage_pct) as max_usage_pct
    from {{ ref('stg_tepco_demand') }}
    group by demand_date
),

stats as (
    select
        avg(avg_demand_mw) as global_avg_demand,
        stddev(avg_demand_mw) as stddev_avg_demand,
        avg(peak_demand_mw) as global_avg_peak,
        stddev(peak_demand_mw) as stddev_peak
    from daily
)

select
    d.demand_date,
    d.peak_demand_mw,
    d.avg_demand_mw,
    d.max_usage_pct,
    round(
        (d.avg_demand_mw - s.global_avg_demand)
        / nullif(s.stddev_avg_demand, 0),
        2
    ) as avg_demand_zscore,
    round(
        (d.peak_demand_mw - s.global_avg_peak)
        / nullif(s.stddev_peak, 0),
        2
    ) as peak_demand_zscore,
    abs(
        (d.avg_demand_mw - s.global_avg_demand)
        / nullif(s.stddev_avg_demand, 0)
    ) > 2
    or abs(
        (d.peak_demand_mw - s.global_avg_peak)
        / nullif(s.stddev_peak, 0)
    ) > 2 as is_anomaly
from daily d
cross join stats s
