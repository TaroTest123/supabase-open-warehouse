import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_CSV_URL =
  "https://www.tepco.co.jp/forecast/html/images/juyo-d1-j.csv";
const BATCH_SIZE = 1000;

type IngestionStatus = "success" | "error" | "partial";

type TepcoRow = {
  date_str: string;
  time_str: string;
  demand_mw_str: string | null;
  supply_capacity_mw_str: string | null;
  usage_pct_str: string | null;
};

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get CSV URL from query parameter or use default
  const url = new URL(req.url);
  const csvUrl = url.searchParams.get("url") || DEFAULT_CSV_URL;

  const startedAt = new Date().toISOString();

  try {
    // Fetch CSV
    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      throw new Error(
        `Failed to fetch CSV: ${csvResponse.status} ${csvResponse.statusText}`,
      );
    }

    // Decode Shift_JIS to UTF-8
    const buffer = await csvResponse.arrayBuffer();
    const decoder = new TextDecoder("shift_jis");
    const csvText = decoder.decode(buffer);

    // Parse CSV
    const rows = parseCsv(csvText);
    const rowsFetched = rows.length;

    if (rowsFetched === 0) {
      return await errorResult(supabase, csvUrl, startedAt, "No data rows found in CSV");
    }

    // Upsert in batches
    let totalUpserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("raw_tepco_demand")
        .upsert(batch, { onConflict: "date_str,time_str" });

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
      } else {
        totalUpserted += batch.length;
      }
    }

    const status: IngestionStatus =
      errors.length > 0
        ? totalUpserted > 0
          ? "partial"
          : "error"
        : "success";

    await logIngestion(supabase, {
      sourceUrl: csvUrl,
      status,
      rowsFetched,
      rowsUpserted: totalUpserted,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      startedAt,
    });

    return jsonResponse({
      status,
      rows_fetched: rowsFetched,
      rows_upserted: totalUpserted,
      url: csvUrl,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return await errorResult(supabase, csvUrl, startedAt, errorMessage, 500);
  }
});

/**
 * Parse TEPCO CSV text into row objects.
 * CSV format: metadata lines, then a header row containing "DATE",
 * followed by data rows: date, time, demand_mw, supply_capacity_mw, usage_pct
 */
function parseCsv(text: string): TepcoRow[] {
  const lines = text.split(/\r?\n/);
  const rows: TepcoRow[] = [];

  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Look for header row starting with "DATE"
    if (!headerFound) {
      if (trimmed.toUpperCase().startsWith("DATE")) {
        headerFound = true;
      }
      continue;
    }

    // Parse data row
    const fields = trimmed.split(",");
    if (fields.length < 2) continue;

    const dateStr = fields[0].trim();
    const timeStr = fields[1].trim();
    if (!dateStr || !timeStr) continue;

    rows.push({
      date_str: dateStr,
      time_str: timeStr,
      demand_mw_str: emptyToNull(fields[2]),
      supply_capacity_mw_str: emptyToNull(fields[3]),
      usage_pct_str: emptyToNull(fields[4]),
    });
  }

  return rows;
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function errorResult(
  supabase: ReturnType<typeof createClient>,
  csvUrl: string,
  startedAt: string,
  errorMessage: string,
  httpStatus = 200,
): Promise<Response> {
  await logIngestion(supabase, {
    sourceUrl: csvUrl,
    status: "error",
    rowsFetched: 0,
    rowsUpserted: 0,
    errorMessage,
    startedAt,
  });
  return jsonResponse(
    { status: "error", rows_fetched: 0, rows_upserted: 0, url: csvUrl, error: errorMessage },
    httpStatus,
  );
}

async function logIngestion(
  supabase: ReturnType<typeof createClient>,
  params: {
    sourceUrl: string;
    status: IngestionStatus;
    rowsFetched: number;
    rowsUpserted: number;
    errorMessage: string | null;
    startedAt: string;
  },
): Promise<void> {
  await supabase.from("ingestion_log").insert({
    source_url: params.sourceUrl,
    status: params.status,
    rows_fetched: params.rowsFetched,
    rows_upserted: params.rowsUpserted,
    error_message: params.errorMessage,
    started_at: params.startedAt,
    completed_at: new Date().toISOString(),
  });
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
