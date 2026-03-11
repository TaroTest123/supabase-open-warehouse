-- readonly_user: AI 生成 SQL を安全に実行するための読み取り専用ロール

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_user') THEN
        CREATE ROLE readonly_user LOGIN PASSWORD 'readonly_pass';
    END IF;
END
$$;

-- statement_timeout をロールレベルで設定
ALTER ROLE readonly_user SET statement_timeout = '10s';

-- public スキーマの使用権限
GRANT USAGE ON SCHEMA public TO readonly_user;

-- mart テーブルに SELECT 権限を付与するヘルパー関数
-- dbt run 後に呼び出して使う
CREATE OR REPLACE FUNCTION grant_readonly_on_mart_tables()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'mart_%'
    LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO readonly_user', tbl);
    END LOOP;
END;
$$;

COMMENT ON FUNCTION grant_readonly_on_mart_tables() IS 'mart_* テーブルに readonly_user への SELECT 権限を付与';
