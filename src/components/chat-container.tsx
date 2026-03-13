"use client";

import { ChatInput } from "@/components/chat-input";
import { ChatMessage } from "@/components/chat-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	ChatMessage as ChatMessageType,
	ChatResponse,
} from "@/types/chat";
import { useEffect, useRef, useState } from "react";

export function ChatContainer() {
	const [messages, setMessages] = useState<ChatMessageType[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);

	const messageCount = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message/loading changes
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messageCount, isLoading]);

	async function handleSend(content: string) {
		const userMessage: ChatMessageType = {
			id: crypto.randomUUID(),
			role: "user",
			content,
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: content }),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || "リクエストに失敗しました");
			}

			const data: ChatResponse = await res.json();

			const assistantMessage: ChatMessageType = {
				id: crypto.randomUUID(),
				role: "assistant",
				content: data.content,
				sqlQuery: data.sqlQuery,
				sqlResults: data.sqlResults,
				timestamp: new Date(),
			};

			setMessages((prev) => [...prev, assistantMessage]);
		} catch (error) {
			const errorContent =
				error instanceof Error
					? error.message
					: "エラーが発生しました。もう一度お試しください。";

			const errorMessage: ChatMessageType = {
				id: crypto.randomUUID(),
				role: "assistant",
				content: `エラー: ${errorContent}`,
				timestamp: new Date(),
			};

			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="border-b px-6 py-4">
				<CardTitle>TEPCO 電力需要チャット</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-4 p-0">
				<ScrollArea className="flex-1 px-6 py-4">
					<div className="flex flex-col gap-4">
						{messages.length === 0 && (
							<p className="text-center text-sm text-muted-foreground">
								電力需要データについて質問してください。
								<br />
								例: 「7月の最大電力需要は？」「時間帯別の平均需要を教えて」
							</p>
						)}
						{messages.map((msg) => (
							<ChatMessage key={msg.id} message={msg} />
						))}
						{isLoading && (
							<div className="flex gap-3">
								<Skeleton className="h-8 w-8 rounded-full" />
								<div className="flex flex-col gap-2">
									<Skeleton className="h-4 w-48" />
									<Skeleton className="h-4 w-32" />
								</div>
							</div>
						)}
						<div ref={bottomRef} />
					</div>
				</ScrollArea>
				<div className="border-t px-6 py-4">
					<ChatInput onSend={handleSend} isLoading={isLoading} />
				</div>
			</CardContent>
		</Card>
	);
}
