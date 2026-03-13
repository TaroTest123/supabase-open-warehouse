// このファイルは `supabase gen types typescript --local` で自動生成されます。
// Supabase ローカル環境が起動していない場合のプレースホルダーです。
//
// 生成コマンド:
//   supabase gen types typescript --local > src/types/database.ts

export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export interface Database {
	public: {
		Tables: {
			raw_tepco_demand: {
				Row: {
					id: number;
					date_str: string;
					time_str: string;
					demand_mw_str: string | null;
					supply_mw_str: string | null;
					usage_pct_str: string | null;
					source_url: string | null;
					loaded_at: string;
				};
				Insert: {
					id?: never;
					date_str: string;
					time_str: string;
					demand_mw_str?: string | null;
					supply_mw_str?: string | null;
					usage_pct_str?: string | null;
					source_url?: string | null;
					loaded_at?: string;
				};
				Update: {
					id?: never;
					date_str?: string;
					time_str?: string;
					demand_mw_str?: string | null;
					supply_mw_str?: string | null;
					usage_pct_str?: string | null;
					source_url?: string | null;
					loaded_at?: string;
				};
			};
		};
		Views: Record<string, never>;
		Functions: {
			grant_readonly_on_mart_tables: {
				Args: Record<string, never>;
				Returns: undefined;
			};
		};
		Enums: Record<string, never>;
	};
}
