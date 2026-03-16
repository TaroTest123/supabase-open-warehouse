-- mart_weekly_pattern: 曜日・季節パターン分析（日次粒度）

select
    demand_date,
    extract(isodow from demand_date)::int as day_of_week,
    to_char(demand_date, 'Dy') as day_name,
    case
        when extract(month from demand_date) in (3, 4, 5) then 'spring'
        when extract(month from demand_date) in (6, 7, 8) then 'summer'
        when extract(month from demand_date) in (9, 10, 11) then 'autumn'
        else 'winter'
    end as season,
    max(demand_mw) as peak_demand_mw,
    min(demand_mw) as min_demand_mw,
    round(avg(demand_mw), 1) as avg_demand_mw,
    max(usage_pct) as max_usage_pct,
    round(avg(usage_pct), 1) as avg_usage_pct,
    count(*) as record_count
from {{ ref('stg_tepco_demand') }}
group by
    demand_date,
    extract(isodow from demand_date),
    to_char(demand_date, 'Dy'),
    case
        when extract(month from demand_date) in (3, 4, 5) then 'spring'
        when extract(month from demand_date) in (6, 7, 8) then 'summer'
        when extract(month from demand_date) in (9, 10, 11) then 'autumn'
        else 'winter'
    end
