-- stg_tepco_demand: 型変換・クレンジング・dedup
-- QUALIFY は PostgreSQL 未サポートのため CTE + ROW_NUMBER() を使用

with deduplicated as (
    select
        *,
        row_number() over (
            partition by date_str, time_str
            order by loaded_at desc
        ) as row_num
    from {{ source('raw', 'raw_tepco_demand') }}
    where demand_mw_str is not null
)

select
    id,
    to_date(date_str, 'YYYY/MM/DD') as demand_date,
    time_str::time as demand_time,
    demand_mw_str::numeric * 10 as demand_mw,
    case when forecast_mw_str is not null and forecast_mw_str != ''
         then forecast_mw_str::numeric * 10
    end as forecast_mw,
    supply_capacity_mw_str::numeric * 10 as supply_capacity_mw,
    usage_pct_str::numeric as usage_pct,
    loaded_at
from deduplicated
where row_num = 1
