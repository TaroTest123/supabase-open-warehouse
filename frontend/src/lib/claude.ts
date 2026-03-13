import { SQL_GENERATION_PROMPT, SUMMARIZE_PROMPT } from "@/lib/constants";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function generateSQL(
	question: string,
): Promise<{ sql: string } | { text: string }> {
	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1024,
		system: SQL_GENERATION_PROMPT,
		messages: [{ role: "user", content: question }],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";

	const sqlMatch = text.match(/```sql\s*([\s\S]*?)```/);
	if (sqlMatch) {
		return { sql: sqlMatch[1].trim() };
	}

	const trimmedText = text.trim();
	const upper = trimmedText.toUpperCase();
	if (upper.startsWith("SELECT") || upper.startsWith("WITH")) {
		return { sql: trimmedText };
	}

	return { text: trimmedText };
}

export async function summarizeResults(
	question: string,
	sql: string,
	results: Record<string, unknown>[],
): Promise<string> {
	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1024,
		system: SUMMARIZE_PROMPT,
		messages: [
			{
				role: "user",
				content: `## ユーザーの質問
${question}

## 実行した SQL
\`\`\`sql
${sql}
\`\`\`

## 実行結果 (JSON)
\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\``,
			},
		],
	});

	return response.content[0].type === "text" ? response.content[0].text : "";
}
