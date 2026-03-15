-- mart_forecast_accuracy: 需要予測 vs 実績の精度分析（日次）

select
    demand_date,
    count(*) as record_count,
    count(forecast_mw) as forecast_count,
    round(avg(demand_mw), 1) as avg_demand_mw,
    round(avg(forecast_mw), 1) as avg_forecast_mw,
    round(avg(forecast_mw - demand_mw), 1) as avg_error_mw,
    round(avg(abs(forecast_mw - demand_mw)), 1) as mae_mw,
    round(
        avg(abs(forecast_mw - demand_mw) / nullif(demand_mw, 0)) * 100,
        2
    ) as mape_pct
from {{ ref('stg_tepco_demand') }}
where forecast_mw is not null
group by demand_date
