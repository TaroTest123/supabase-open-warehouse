export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	sqlQuery?: string;
	sqlResults?: Record<string, unknown>[];
	timestamp: Date;
}

export interface ChatRequest {
	message: string;
}

export interface ChatResponse {
	content: string;
	sqlQuery?: string;
	sqlResults?: Record<string, unknown>[];
}
