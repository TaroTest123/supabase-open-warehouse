import { generateSQL, summarizeResults } from "@/lib/claude";
import type { ChatResponse } from "@/types/chat";
import { type NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

function validateSQL(sql: string): void {
	const normalized = sql.trim().toUpperCase();

	if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
		throw new Error("SELECT または WITH で始まるクエリのみ許可されています");
	}

	const forbidden = [
		"INSERT",
		"UPDATE",
		"DELETE",
		"DROP",
		"ALTER",
		"CREATE",
		"TRUNCATE",
		"GRANT",
		"REVOKE",
		"EXEC",
		"EXECUTE",
	];
	for (const keyword of forbidden) {
		const pattern = new RegExp(`\\b${keyword}\\b`, "i");
		if (pattern.test(sql)) {
			throw new Error(`禁止キーワード "${keyword}" が含まれています`);
		}
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const message = body.message;

		if (!message || typeof message !== "string") {
			return NextResponse.json(
				{ error: "message は必須です" },
				{ status: 400 },
			);
		}

		const dbUrl = process.env.SUPABASE_READONLY_DB_URL;
		if (!dbUrl) {
			return NextResponse.json(
				{ error: "SUPABASE_READONLY_DB_URL が設定されていません" },
				{ status: 500 },
			);
		}

		const result = await generateSQL(message);

		if ("text" in result) {
			const response: ChatResponse = {
				content: result.text,
			};
			return NextResponse.json(response);
		}

		const sqlQuery = result.sql;
		validateSQL(sqlQuery);

		const readonlySql = postgres(dbUrl);

		try {
			await readonlySql.unsafe("SET statement_timeout = '10s'");
			const sqlResults = await readonlySql.unsafe(sqlQuery);
			const rows = sqlResults as unknown as Record<string, unknown>[];

			const content = await summarizeResults(message, sqlQuery, rows);

			const response: ChatResponse = {
				content,
				sqlQuery,
				sqlResults: rows,
			};

			return NextResponse.json(response);
		} finally {
			await readonlySql.end();
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "不明なエラーが発生しました";
		return NextResponse.json({ error: errorMessage }, { status: 500 });
	}
}
