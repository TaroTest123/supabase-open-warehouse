-- mart_monthly_stats: 月次統計

select
    date_trunc('month', demand_date)::date as month_start,
    to_char(demand_date, 'YYYY-MM') as year_month,
    max(demand_mw) as max_demand_mw,
    min(demand_mw) as min_demand_mw,
    round(avg(demand_mw), 1) as avg_demand_mw,
    max(usage_pct) as max_usage_pct,
    round(avg(usage_pct), 1) as avg_usage_pct,
    count(*) as record_count,
    count(distinct demand_date) as days_with_data
from {{ ref('stg_tepco_demand') }}
group by date_trunc('month', demand_date), to_char(demand_date, 'YYYY-MM')
