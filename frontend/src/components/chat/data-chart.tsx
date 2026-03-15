"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useMemo } from "react";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const COLORS = [
	"#2563eb",
	"#dc2626",
	"#16a34a",
	"#d97706",
	"#7c3aed",
	"#db2777",
	"#0891b2",
	"#65a30d",
];

const DATE_COLUMN_NAMES = new Set([
	"demand_date",
	"weather_date",
	"month_start",
	"year_month",
]);

const EXCLUDED_COLUMNS = new Set(["record_count", "forecast_count"]);

interface DataChartProps {
	rows: Record<string, unknown>[];
}

function isNumeric(value: unknown): boolean {
	if (typeof value === "number") return true;
	if (typeof value === "string") return !Number.isNaN(Number(value));
	return false;
}

function detectColumns(rows: Record<string, unknown>[]) {
	const keys = Object.keys(rows[0]);

	const xColumn =
		keys.find((k) => DATE_COLUMN_NAMES.has(k)) ||
		keys.find((k) => k.includes("date") || k.includes("month")) ||
		keys[0];

	const numericColumns = keys.filter(
		(k) =>
			k !== xColumn &&
			!EXCLUDED_COLUMNS.has(k) &&
			rows.some((r) => r[k] != null && isNumeric(r[k])),
	);

	return { xColumn, numericColumns };
}

function formatXLabel(value: string): string {
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		return value.slice(5, 10);
	}
	return String(value);
}

export function DataChart({ rows }: DataChartProps) {
	const chartData = useMemo(() => {
		if (rows.length < 2) return null;

		const { xColumn, numericColumns } = detectColumns(rows);
		if (numericColumns.length === 0) return null;

		const displayColumns = numericColumns.slice(0, 6);

		const data = rows.map((row) => {
			const point: Record<string, unknown> = {
				[xColumn]: String(row[xColumn] ?? ""),
			};
			for (const col of displayColumns) {
				point[col] = row[col] != null ? Number(row[col]) : null;
			}
			return point;
		});

		return { xColumn, displayColumns, data, showDots: rows.length <= 31 };
	}, [rows]);

	if (!chartData) return null;

	const { xColumn, displayColumns, data, showDots } = chartData;

	return (
		<Card>
			<CardContent className="p-3">
				<ResponsiveContainer width="100%" height={280}>
					<LineChart
						data={data}
						margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
					>
						<CartesianGrid strokeDasharray="3 3" />
						<XAxis
							dataKey={xColumn}
							tickFormatter={formatXLabel}
							tick={{ fontSize: 11 }}
						/>
						<YAxis tick={{ fontSize: 11 }} />
						<Tooltip />
						<Legend wrapperStyle={{ fontSize: 12 }} />
						{displayColumns.map((col, i) => (
							<Line
								key={col}
								type="monotone"
								dataKey={col}
								stroke={COLORS[i % COLORS.length]}
								dot={showDots}
								strokeWidth={1.5}
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
