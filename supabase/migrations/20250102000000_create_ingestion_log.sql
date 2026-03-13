-- ingestion_log: CSV 取り込みの実行ログを記録するテーブル

CREATE TABLE IF NOT EXISTS ingestion_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
    rows_fetched INT,
    rows_upserted INT,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ingestion_log_started_at ON ingestion_log (started_at DESC);

COMMENT ON TABLE ingestion_log IS 'TEPCO CSV 取り込みの実行ログ';
