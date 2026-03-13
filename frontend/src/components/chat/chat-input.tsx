"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

interface ChatInputProps {
	onSend: (message: string) => void;
	isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
	const [input, setInput] = useState("");

	function handleSend() {
		const trimmed = input.trim();
		if (!trimmed || isLoading) return;
		onSend(trimmed);
		setInput("");
	}

	function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="flex gap-2">
			<Input
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="電力需要について質問してください..."
				disabled={isLoading}
				className="flex-1"
			/>
			<Button onClick={handleSend} disabled={isLoading || !input.trim()}>
				<Send className="h-4 w-4" />
			</Button>
		</div>
	);
}
