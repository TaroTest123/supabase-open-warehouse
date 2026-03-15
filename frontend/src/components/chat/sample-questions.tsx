"use client";

import { Button } from "@/components/ui/button";

const SAMPLES = [
	"直近30日間の日次ピーク需要の推移をグラフで見せて",
	"月別の平均需要と最高気温の推移を比較して",
	"供給予備率が最も低かった日は？",
	"太陽光発電量の月別推移は？",
	"需要予測の精度はどのくらい？",
	"猛暑日（35°C以上）の需要傾向は？",
];

interface SampleQuestionsProps {
	onSelect: (question: string) => void;
}

export function SampleQuestions({ onSelect }: SampleQuestionsProps) {
	return (
		<div className="flex flex-col items-center gap-3">
			<p className="text-sm text-muted-foreground">
				電力需要・気象データについて質問してください
			</p>
			<div className="flex flex-wrap justify-center gap-2">
				{SAMPLES.map((q) => (
					<Button
						key={q}
						variant="outline"
						size="sm"
						className="text-xs"
						onClick={() => onSelect(q)}
					>
						{q}
					</Button>
				))}
			</div>
		</div>
	);
}
