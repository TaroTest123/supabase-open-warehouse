-- usage_pct は 0〜100 の範囲内であること（NULL は年次 CSV で発生するため除外）
select
    demand_date,
    demand_time,
    usage_pct
from {{ ref('stg_tepco_demand') }}
where usage_pct is not null
  and (usage_pct < 0 or usage_pct > 100)
