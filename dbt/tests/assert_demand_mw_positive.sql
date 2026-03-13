-- demand_mw は正の値であること（0 は深夜帯等で発生しうるため許容）
select
    demand_date,
    demand_time,
    demand_mw
from {{ ref('stg_tepco_demand') }}
where demand_mw < 0
