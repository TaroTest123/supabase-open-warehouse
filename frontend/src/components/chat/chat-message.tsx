import { DataTable } from "@/components/chat/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ChatMessage as ChatMessageType } from "@/types/chat";
import { Bot, User } from "lucide-react";
import { Suspense, lazy } from "react";
import ReactMarkdown from "react-markdown";

const DataChart = lazy(() =>
	import("@/components/chat/data-chart").then((m) => ({
		default: m.DataChart,
	})),
);

interface ChatMessageProps {
	message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
	const isUser = message.role === "user";

	return (
		<div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
			<Avatar className="h-8 w-8 shrink-0">
				<AvatarFallback
					className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}
				>
					{isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
				</AvatarFallback>
			</Avatar>

			<div
				className={`flex max-w-[80%] flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
			>
				<Card className={isUser ? "bg-primary text-primary-foreground" : ""}>
					<CardContent className="p-3">
						{isUser ? (
							<p className="whitespace-pre-wrap text-sm">{message.content}</p>
						) : (
							<div className="prose prose-sm dark:prose-invert max-w-none">
								<ReactMarkdown>{message.content}</ReactMarkdown>
							</div>
						)}
					</CardContent>
				</Card>

				{message.sqlQuery && (
					<div className="flex w-full flex-col gap-2">
						<Badge variant="outline" className="w-fit">
							SQL
						</Badge>
						<pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
							<code>{message.sqlQuery}</code>
						</pre>
					</div>
				)}

				{message.sqlResults && message.sqlResults.length > 0 && (
					<div className="flex w-full flex-col gap-2">
						<Suspense fallback={null}>
							<DataChart rows={message.sqlResults} />
						</Suspense>
						<DataTable
							columns={Object.keys(message.sqlResults[0])}
							rows={message.sqlResults}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
