CREATE TABLE "admin"."admin_account" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password_hash" text NOT NULL,
	"singleton_key" boolean DEFAULT true NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" varchar(64) NOT NULL,
	CONSTRAINT "admin_account_singleton_key_check" CHECK ("admin"."admin_account"."singleton_key" = true),
	CONSTRAINT "admin_account_status_check" CHECK ("admin"."admin_account"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "audit"."admin_auth_event" (
	"admin_id" uuid,
	"event" varchar(48) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" varchar(24) NOT NULL,
	"request_id" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "audit"."admin_auth_event" ADD CONSTRAINT "admin_auth_event_admin_id_admin_account_id_fk" FOREIGN KEY ("admin_id") REFERENCES "admin"."admin_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_account_singleton_key_unique" ON "admin"."admin_account" USING btree ("singleton_key");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_account_username_unique" ON "admin"."admin_account" USING btree ("username");--> statement-breakpoint
CREATE INDEX "admin_auth_event_admin_time_idx" ON "audit"."admin_auth_event" USING btree ("admin_id","occurred_at");--> statement-breakpoint
CREATE INDEX "admin_auth_event_event_time_idx" ON "audit"."admin_auth_event" USING btree ("event","occurred_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "admin"."admin_account" TO "votaciones_runtime";--> statement-breakpoint
GRANT INSERT ON TABLE "audit"."admin_auth_event" TO "votaciones_runtime";
