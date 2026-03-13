-- usage_pct の範囲チェック（NULL は年次 CSV で発生するため除外）
-- TEPCO の使用率は供給力対比のため 100% 超もありうる
-- config: severity warn
{{ config(severity='warn') }}
select
    demand_date,
    demand_time,
    usage_pct
from {{ ref('stg_tepco_demand') }}
where usage_pct is not null
  and (usage_pct < 0 or usage_pct > 100)
