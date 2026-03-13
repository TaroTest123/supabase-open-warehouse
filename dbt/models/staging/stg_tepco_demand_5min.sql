-- stg_tepco_demand_5min: 5分間隔データの型変換・クレンジング・dedup

with deduplicated as (
    select
        *,
        row_number() over (
            partition by date_str, time_str
            order by loaded_at desc
        ) as row_num
    from {{ source('raw', 'raw_tepco_demand_5min') }}
    where demand_mw_str is not null
)

select
    id,
    to_date(date_str, 'YYYY/MM/DD') as demand_date,
    time_str::time as demand_time,
    demand_mw_str::numeric * 10 as demand_mw,
    solar_mw_str::numeric * 10 as solar_mw,
    solar_pct_str::numeric as solar_pct,
    loaded_at
from deduplicated
where row_num = 1
