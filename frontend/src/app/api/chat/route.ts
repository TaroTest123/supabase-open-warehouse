import { generateSQL, summarizeResults } from "@/lib/claude";
import type { ChatResponse } from "@/types/chat";
import { type NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const FORBIDDEN_PATTERNS = [
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
].map((keyword) => ({
	keyword,
	pattern: new RegExp(`\\b${keyword}\\b`, "i"),
}));

function validateSQL(sql: string): void {
	const normalized = sql.trim().toUpperCase();

	if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
		throw new Error("SELECT または WITH で始まるクエリのみ許可されています");
	}

	for (const { keyword, pattern } of FORBIDDEN_PATTERNS) {
		if (pattern.test(sql)) {
			throw new Error(`禁止キーワード "${keyword}" が含まれています`);
		}
	}
}

const MAX_RESULT_ROWS = 100;

function getReadonlyPool() {
	const dbUrl = process.env.SUPABASE_READONLY_DB_URL;
	if (!dbUrl) {
		throw new Error("SUPABASE_READONLY_DB_URL が設定されていません");
	}
	return postgres(dbUrl, {
		max: 5,
		idle_timeout: 20,
		connection: { statement_timeout: 10000 },
	});
}

let readonlyPool: ReturnType<typeof postgres> | null = null;

function getPool() {
	if (!readonlyPool) {
		readonlyPool = getReadonlyPool();
	}
	return readonlyPool;
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

		const result = await generateSQL(message);

		if ("text" in result) {
			const response: ChatResponse = {
				content: result.text,
			};
			return NextResponse.json(response);
		}

		const sqlQuery = result.sql;
		validateSQL(sqlQuery);

		const sql = getPool();
		const sqlResults = await sql.unsafe(sqlQuery);
		const rows = (sqlResults as unknown as Record<string, unknown>[]).slice(
			0,
			MAX_RESULT_ROWS,
		);

		const content = await summarizeResults(message, sqlQuery, rows);

		const response: ChatResponse = {
			content,
			sqlQuery,
			sqlResults: rows,
		};

		return NextResponse.json(response);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "不明なエラーが発生しました";
		return NextResponse.json({ error: errorMessage }, { status: 500 });
	}
}
