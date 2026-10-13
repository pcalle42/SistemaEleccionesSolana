CREATE TABLE "app"."schema_compatibility" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"migration_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_compatibility_singleton_check" CHECK ("app"."schema_compatibility"."singleton" = true)
);
--> statement-breakpoint
INSERT INTO "app"."schema_compatibility" ("singleton", "migration_version")
VALUES (true, '0011_release_schema_compatibility.sql');
--> statement-breakpoint
GRANT SELECT ON TABLE "app"."schema_compatibility" TO "votaciones_runtime";
