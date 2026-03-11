-- demand_mw は正の値であること
select
    demand_date,
    demand_time,
    demand_mw
from {{ ref('stg_tepco_demand') }}
where demand_mw <= 0
