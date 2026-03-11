-- stg_tepco_demand の (demand_date, demand_time) は一意であること（dedup 検証）
select
    demand_date,
    demand_time,
    count(*) as row_count
from {{ ref('stg_tepco_demand') }}
group by demand_date, demand_time
having count(*) > 1
