import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate";

const DEFAULT_CSV_URL =
  "https://www.tepco.co.jp/forecast/html/images/juyo-d1-j.csv";
const BATCH_SIZE = 1000;

type IngestionStatus = "success" | "error" | "partial";

type TepcoRow = {
  date_str: string;
  time_str: string;
  demand_mw_str: string | null;
  forecast_mw_str: string | null;
  supply_capacity_mw_str: string | null;
  usage_pct_str: string | null;
};

type Tepco5minRow = {
  date_str: string;
  time_str: string;
  demand_mw_str: string | null;
  solar_mw_str: string | null;
  solar_pct_str: string | null;
};

type ParsedCsvResult = {
  hourlyRows: TepcoRow[];
  fiveMinRows: Tepco5minRow[];
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
    // Fetch data
    const dataResponse = await fetch(csvUrl);
    if (!dataResponse.ok) {
      throw new Error(
        `Failed to fetch data: ${dataResponse.status} ${dataResponse.statusText}`,
      );
    }

    const buffer = await dataResponse.arrayBuffer();
    const isZip = csvUrl.toLowerCase().endsWith(".zip");

    // Parse rows from ZIP or CSV
    const parsed: ParsedCsvResult = isZip
      ? parseZip(new Uint8Array(buffer))
      : parseCsv(decodeShiftJis(buffer));

    const hourlyCount = parsed.hourlyRows.length;
    const fiveMinCount = parsed.fiveMinRows.length;
    const totalFetched = hourlyCount + fiveMinCount;

    if (totalFetched === 0) {
      return await errorResult(supabase, csvUrl, startedAt, "No data rows found in CSV");
    }

    // Upsert hourly rows into raw_tepco_demand
    let totalUpserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < parsed.hourlyRows.length; i += BATCH_SIZE) {
      const batch = parsed.hourlyRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("raw_tepco_demand")
        .upsert(batch, { onConflict: "date_str,time_str" });

      if (error) {
        errors.push(`Hourly batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
      } else {
        totalUpserted += batch.length;
      }
    }

    // Upsert 5-min rows into raw_tepco_demand_5min
    let fiveMinUpserted = 0;

    if (parsed.fiveMinRows.length > 0) {
      for (let i = 0; i < parsed.fiveMinRows.length; i += BATCH_SIZE) {
        const batch = parsed.fiveMinRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from("raw_tepco_demand_5min")
          .upsert(batch, { onConflict: "date_str,time_str" });

        if (error) {
          errors.push(`5min batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
        } else {
          fiveMinUpserted += batch.length;
        }
      }
    }

    const status: IngestionStatus =
      errors.length > 0
        ? totalUpserted > 0 || fiveMinUpserted > 0
          ? "partial"
          : "error"
        : "success";

    await logIngestion(supabase, {
      sourceUrl: csvUrl,
      status,
      rowsFetched: totalFetched,
      rowsUpserted: totalUpserted + fiveMinUpserted,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      startedAt,
    });

    return jsonResponse({
      status,
      hourly_rows: totalUpserted,
      five_min_rows: fiveMinUpserted,
      rows_fetched: totalFetched,
      rows_upserted: totalUpserted + fiveMinUpserted,
      url: csvUrl,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return await errorResult(supabase, csvUrl, startedAt, errorMessage, 500);
  }
});

function decodeShiftJis(buffer: ArrayBuffer): string {
  return new TextDecoder("shift_jis").decode(buffer);
}

/**
 * Extract all CSV files from a ZIP archive and parse them into rows.
 */
function parseZip(zipBytes: Uint8Array): ParsedCsvResult {
  const entries = unzipSync(zipBytes);
  const result: ParsedCsvResult = { hourlyRows: [], fiveMinRows: [] };

  for (const [name, data] of Object.entries(entries)) {
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const csvText = decodeShiftJis(data.buffer);
    const parsed = parseCsv(csvText);
    result.hourlyRows.push(...parsed.hourlyRows);
    result.fiveMinRows.push(...parsed.fiveMinRows);
  }

  return result;
}

const DATE_PATTERN = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

/**
 * Parse TEPCO CSV text into hourly and 5-min row objects.
 *
 * CSV structure: metadata lines, then one or two sections each starting with
 * a header row containing "DATE". The header text determines the section type:
 *   - Contains "５分間隔" → 5-min section (date, time, demand, solar, solar_pct)
 *   - Otherwise → hourly section. If header contains "予測値", the CSV has
 *     6 columns (ZIP format): date, time, demand, forecast, supply_capacity, usage_pct.
 *     Otherwise 5 columns (daily CSV): date, time, demand, supply_capacity, usage_pct.
 */
function parseCsv(text: string): ParsedCsvResult {
  const lines = text.split(/\r?\n/);
  const hourlyRows: TepcoRow[] = [];
  const fiveMinRows: Tepco5minRow[] = [];

  let currentSection: "hourly" | "5min" | null = null;
  let hasForecast = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect header row starting with "DATE"
    if (trimmed.toUpperCase().startsWith("DATE")) {
      if (trimmed.includes("５分間隔")) {
        currentSection = "5min";
      } else {
        currentSection = "hourly";
        hasForecast = trimmed.includes("予測値");
      }
      continue;
    }

    if (!currentSection) continue;

    // Parse data row — only rows where first field matches date pattern
    const fields = trimmed.split(",");
    if (fields.length < 2) continue;

    const dateStr = fields[0].trim();
    if (!DATE_PATTERN.test(dateStr)) continue;

    const timeStr = fields[1].trim();
    if (!timeStr) continue;

    if (currentSection === "5min") {
      fiveMinRows.push({
        date_str: dateStr,
        time_str: timeStr,
        demand_mw_str: emptyToNull(fields[2]),
        solar_mw_str: emptyToNull(fields[3]),
        solar_pct_str: emptyToNull(fields[4]),
      });
    } else {
      if (hasForecast) {
        // ZIP hourly: date, time, demand, forecast, supply_capacity, usage_pct
        hourlyRows.push({
          date_str: dateStr,
          time_str: timeStr,
          demand_mw_str: emptyToNull(fields[2]),
          forecast_mw_str: emptyToNull(fields[3]),
          supply_capacity_mw_str: emptyToNull(fields[4]),
          usage_pct_str: emptyToNull(fields[5]),
        });
      } else {
        // Daily CSV: date, time, demand, supply_capacity, usage_pct
        hourlyRows.push({
          date_str: dateStr,
          time_str: timeStr,
          demand_mw_str: emptyToNull(fields[2]),
          forecast_mw_str: null,
          supply_capacity_mw_str: emptyToNull(fields[3]),
          usage_pct_str: emptyToNull(fields[4]),
        });
      }
    }
  }

  return { hourlyRows, fiveMinRows };
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
