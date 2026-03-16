import { generateSQL, summarizeResults } from "@/lib/claude";
import type { ChatResponse } from "@/types/chat";
import { type NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

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

	const BLOCKED_SCHEMAS = [
		"pg_catalog",
		"information_schema",
		"pg_tables",
		"pg_roles",
		"pg_stat",
	];
	for (const schema of BLOCKED_SCHEMAS) {
		if (normalized.includes(schema.toUpperCase())) {
			throw new Error("システムテーブルへのアクセスは許可されていません");
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

export function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const message = body.message;

		if (!message || typeof message !== "string") {
			return NextResponse.json(
				{ error: "message は必須です" },
				{ status: 400, headers: CORS_HEADERS },
			);
		}

		if (message.length > 1000) {
			return NextResponse.json(
				{ error: "メッセージは1000文字以内で入力してください" },
				{ status: 400, headers: CORS_HEADERS },
			);
		}

		const result = await generateSQL(message);

		if ("text" in result) {
			const response: ChatResponse = {
				content: result.text,
			};
			return NextResponse.json(response, { headers: CORS_HEADERS });
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

		return NextResponse.json(response, { headers: CORS_HEADERS });
	} catch (error) {
		console.error("[chat/route] Error:", error);

		let userMessage =
			"サーバーエラーが発生しました。しばらく経ってからお試しください。";
		if (error instanceof Error) {
			if (
				error.message.includes("禁止キーワード") ||
				error.message.includes("のみ許可されています")
			) {
				userMessage = error.message;
			} else if (error.message.includes("SUPABASE_READONLY_DB_URL")) {
				userMessage = "データベースの設定が完了していません。";
			} else if (
				"code" in error &&
				(error as Record<string, unknown>).code === "42702"
			) {
				userMessage =
					"SQLのカラム名が曖昧でした。質問を少し変えて再度お試しください。";
			}
		}

		return NextResponse.json(
			{ error: userMessage },
			{ status: 500, headers: CORS_HEADERS },
		);
	}
}
