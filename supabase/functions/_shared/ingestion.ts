import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type IngestionStatus = "success" | "error" | "partial";

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function logIngestion(
  supabase: SupabaseClient,
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

export function deriveStatus(
  errors: string[],
  totalUpserted: number,
): IngestionStatus {
  if (errors.length === 0) return "success";
  return totalUpserted > 0 ? "partial" : "error";
}

export function guardRequest(req: Request): Response | null {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }
  return null;
}

export function getSupabaseEnv(): { url: string; serviceRoleKey: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return { url, serviceRoleKey };
}
