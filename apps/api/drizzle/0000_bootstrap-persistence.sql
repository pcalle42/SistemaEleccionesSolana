CREATE SCHEMA IF NOT EXISTS "app";
CREATE SCHEMA IF NOT EXISTS "admin";
CREATE SCHEMA IF NOT EXISTS "identity";
CREATE SCHEMA IF NOT EXISTS "election";
CREATE SCHEMA IF NOT EXISTS "eligibility";
CREATE SCHEMA IF NOT EXISTS "voting";
CREATE SCHEMA IF NOT EXISTS "audit";
CREATE SCHEMA IF NOT EXISTS "result";
--> statement-breakpoint
DO $migration$
DECLARE
  schema_name text;
  runtime_role constant text := 'votaciones_runtime';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    RAISE EXCEPTION 'Required runtime database role is missing';
  END IF;

  FOREACH schema_name IN ARRAY ARRAY[
    'app',
    'admin',
    'identity',
    'election',
    'eligibility',
    'voting',
    'audit',
    'result'
  ]
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, runtime_role);
  END LOOP;
END
$migration$;
