# 読み取り専用データベース接続のセットアップ

AI 生成 SQL を安全に実行するため、本プロジェクトでは `readonly_user` ロールを使用します。
このドキュメントでは、ローカル開発環境と本番（Supabase ホスティング）環境それぞれのセットアップ手順を説明します。

## 背景

チャット UI から Claude API が生成した SQL を直接実行するため、以下の 3 層防御を採用しています。

| レイヤー | 対策 | 目的 |
|---------|------|------|
| アプリケーション | SQL バリデーション（`validateSQL()`） | SELECT 以外のキーワードを事前拒否 |
| データベースロール | `readonly_user`（SELECT 権限のみ） | DB レベルで書き込みを防止 |
| タイムアウト | `statement_timeout = 10s` | 長時間クエリによるリソース枯渇を防止 |

詳細は [architecture.md](architecture.md) のセキュリティ対策セクションを参照してください。

## 環境変数

```
SUPABASE_READONLY_DB_URL=postgresql://readonly_user:<パスワード>@<ホスト>:<ポート>/postgres
```

この URL は [API Route](../frontend/src/app/api/chat/route.ts) が AI 生成 SQL を実行する際に使用します。

## ローカル開発環境

ローカルではマイグレーションが自動的にロールを作成するため、手動操作は不要です。

### 手順

1. **Supabase を起動**

   ```bash
   supabase start
   ```

2. **DB リセットでマイグレーションを適用**

   ```bash
   supabase db reset
   ```

   これにより [`20250101000001_create_readonly_user.sql`](../supabase/migrations/20250101000001_create_readonly_user.sql) が実行され、以下が作成されます:

   - `readonly_user` ロール（パスワード: `readonly_pass`）
   - `statement_timeout = 10s`（ロールレベル）
   - `public` スキーマの USAGE 権限
   - ヘルパー関数 `grant_readonly_on_mart_tables()`

3. **dbt でテーブルを作成**

   ```bash
   cd dbt && uv run dbt run
   ```

4. **mart テーブルに SELECT 権限を付与**

   Supabase SQL Editor またはコマンドラインから実行:

   ```sql
   SELECT grant_readonly_on_mart_tables();
   ```

   > この関数は `mart_*` テーブルすべてに対して `readonly_user` への SELECT 権限を一括付与します。
   > dbt で新しい mart テーブルを追加した場合は、再度実行してください。

5. **環境変数を設定**

   `.env.local` に以下を追加（`.env.local.example` からコピー）:

   ```
   SUPABASE_READONLY_DB_URL=postgresql://readonly_user:readonly_pass@127.0.0.1:54322/postgres
   ```

## 本番環境（Supabase ホスティング）

本番では手動でロールを作成し、接続 URL を組み立てます。

> **注意**: Supabase ダッシュボードの Roles 一覧に表示される `supabase_read_only_user` は Supabase 内部管理用ロールです。
> パスワードや権限を自分で制御できないため、アプリケーション用には使用しないでください。

### 手順

1. **DB 接続情報を確認**

   Supabase ダッシュボード → **Settings** → **Database** → **Connection string** で以下を確認:

   - ホスト名（例: `db.xxxxxxxxxxxx.supabase.co`）
   - ポート（通常 `5432`、Connection Pooling 使用時は `6543`）

2. **SQL Editor でロールを作成**

   ダッシュボード → **SQL Editor** で以下を実行:

   ```sql
   -- 1. ロール作成（パスワードは必ず強固なものに変更すること）
   CREATE ROLE readonly_user LOGIN PASSWORD 'ここに強いパスワードを設定';

   -- 2. タイムアウト設定
   ALTER ROLE readonly_user SET statement_timeout = '10s';

   -- 3. スキーマ使用権限
   GRANT USAGE ON SCHEMA public TO readonly_user;

   -- 4. mart テーブルに SELECT 権限を付与
   DO $$
   DECLARE tbl TEXT;
   BEGIN
       FOR tbl IN
           SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND tablename LIKE 'mart_%'
       LOOP
           EXECUTE format('GRANT SELECT ON public.%I TO readonly_user', tbl);
       END LOOP;
   END;
   $$;
   ```

3. **接続 URL を組み立てる**

   ```
   postgresql://readonly_user:<パスワード>@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```



4. **環境変数を設定**

   Vercel ダッシュボード → **Settings** → **Environment Variables** に追加:

   | Key | Value |
   |-----|-------|
   | `SUPABASE_READONLY_DB_URL` | 上記で組み立てた URL |

   > **セキュリティ**: パスワードは Vercel の環境変数として管理し、コードにハードコードしないでください。

### mart テーブル追加時の対応

dbt で新しい `mart_*` テーブルを追加した場合、SELECT 権限の付与が必要です。

**ローカル**:

```sql
SELECT grant_readonly_on_mart_tables();
```

**本番**（ヘルパー関数がない場合）:

```sql
GRANT SELECT ON public.mart_新テーブル名 TO readonly_user;
```

## トラブルシューティング

### 接続エラー: `password authentication failed for user "readonly_user"`

- ロールが作成されているか確認: `SELECT rolname FROM pg_roles WHERE rolname = 'readonly_user';`
- パスワードが正しいか確認
- ローカルの場合は `supabase db reset` で再作成

### 権限エラー: `permission denied for table mart_*`

- SELECT 権限が付与されているか確認:
  ```sql
  SELECT grantee, table_name, privilege_type
  FROM information_schema.table_privileges
  WHERE grantee = 'readonly_user';
  ```
- ローカルの場合は `SELECT grant_readonly_on_mart_tables();` を再実行

### クエリがタイムアウトする

- `statement_timeout` のデフォルトは 10 秒です
- 複雑なクエリの場合は、dbt で事前集計した mart テーブルの利用を検討してください
