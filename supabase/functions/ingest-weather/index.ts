import { createClient } from "jsr:@supabase/supabase-js@2";

// Open-Meteo Historical Weather API — Tokyo (35.69, 139.69)
const LATITUDE = 35.6894;
const LONGITUDE = 139.6917;
const HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "shortwave_radiation",
  "wind_speed_10m",
  "wind_direction_10m",
  "cloud_cover",
  "pressure_msl",
].join(",");

const BATCH_SIZE = 500;

type WeatherRow = {
  recorded_at: string;
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  precipitation_mm: number | null;
  shortwave_radiation_wm2: number | null;
  wind_speed_ms: number | null;
  wind_direction_deg: number | null;
  cloud_cover_pct: number | null;
  pressure_hpa: number | null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");

  if (!startDate || !endDate) {
    return jsonResponse(
      { error: "start_date and end_date query parameters are required (YYYY-MM-DD)" },
      400,
    );
  }

  const startedAt = new Date().toISOString();

  try {
    const apiUrl = buildApiUrl(startDate, endDate);
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Open-Meteo API error: ${response.status} — ${body}`);
    }

    const data = await response.json();

    if (!data.hourly?.time?.length) {
      throw new Error("No hourly data returned from Open-Meteo");
    }

    const rows = mapToRows(data.hourly);
    let totalUpserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("raw_weather_tokyo")
        .upsert(batch, { onConflict: "recorded_at" });

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
      } else {
        totalUpserted += batch.length;
      }
    }

    const status = errors.length > 0
      ? totalUpserted > 0 ? "partial" : "error"
      : "success";

    await logIngestion(supabase, {
      sourceUrl: apiUrl,
      status,
      rowsFetched: rows.length,
      rowsUpserted: totalUpserted,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      startedAt,
    });

    return jsonResponse({
      status,
      rows_fetched: rows.length,
      rows_upserted: totalUpserted,
      start_date: startDate,
      end_date: endDate,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await logIngestion(supabase, {
      sourceUrl: `open-meteo:${startDate}~${endDate}`,
      status: "error",
      rowsFetched: 0,
      rowsUpserted: 0,
      errorMessage,
      startedAt,
    });

    return jsonResponse(
      { status: "error", error: errorMessage, start_date: startDate, end_date: endDate },
      500,
    );
  }
});

function buildApiUrl(startDate: string, endDate: string): string {
  const params = new URLSearchParams({
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    start_date: startDate,
    end_date: endDate,
    hourly: HOURLY_VARIABLES,
    timezone: "Asia/Tokyo",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params}`;
}

function mapToRows(hourly: Record<string, (number | null)[]>): WeatherRow[] {
  const times: string[] = hourly.time;
  return times.map((time, i) => ({
    recorded_at: `${time}:00+09:00`,
    temperature_c: hourly.temperature_2m[i] ?? null,
    relative_humidity_pct: hourly.relative_humidity_2m[i] ?? null,
    precipitation_mm: hourly.precipitation[i] ?? null,
    shortwave_radiation_wm2: hourly.shortwave_radiation[i] ?? null,
    wind_speed_ms: hourly.wind_speed_10m[i] ?? null,
    wind_direction_deg: hourly.wind_direction_10m[i] ?? null,
    cloud_cover_pct: hourly.cloud_cover[i] ?? null,
    pressure_hpa: hourly.pressure_msl[i] ?? null,
  }));
}

async function logIngestion(
  supabase: ReturnType<typeof createClient>,
  params: {
    sourceUrl: string;
    status: string;
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
