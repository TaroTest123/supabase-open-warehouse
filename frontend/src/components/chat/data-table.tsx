import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface DataTableProps {
	columns: string[];
	rows: Record<string, unknown>[];
}

export function DataTable({ columns, rows }: DataTableProps) {
	if (rows.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">データがありません。</p>
		);
	}

	return (
		<div className="overflow-x-auto rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((col) => (
							<TableHead key={col}>{col}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, i) => (
						<TableRow
							key={`row-${columns.map((c) => String(row[c] ?? "")).join("-")}-${i}`}
						>
							{columns.map((col) => (
								<TableCell key={col}>{String(row[col] ?? "")}</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
