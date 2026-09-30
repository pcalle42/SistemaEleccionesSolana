CREATE TABLE "election"."election_configuration_versions" (
	"election_id" uuid NOT NULL,
	"frozen_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "election_configuration_versions_election_id_version_pk" PRIMARY KEY("election_id","version"),
	CONSTRAINT "election_configuration_versions_version_check" CHECK ("election"."election_configuration_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "election"."election_options" (
	"description" varchar(1000),
	"display_order" integer NOT NULL,
	"election_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label" varchar(200) NOT NULL,
	CONSTRAINT "election_options_display_order_check" CHECK ("election"."election_options"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "election"."election_state_event" (
	"actor_admin_id" uuid NOT NULL,
	"configuration_version" integer NOT NULL,
	"election_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"new_state" varchar(24) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"previous_state" varchar(24) NOT NULL,
	"reason" text,
	"request_id" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "election"."elections" (
	"cancellation_reason" text,
	"circuit_version" varchar(64),
	"closes_at" timestamp with time zone NOT NULL,
	"configuration_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"description" varchar(2000),
	"eligibility_configuration_ref" varchar(128),
	"id" uuid PRIMARY KEY NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"protocol_version" varchar(64),
	"row_version" integer DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
	"title" varchar(200) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"voting_method" varchar(32) DEFAULT 'SINGLE_CHOICE' NOT NULL,
	CONSTRAINT "elections_voting_window_check" CHECK ("election"."elections"."opens_at" < "election"."elections"."closes_at"),
	CONSTRAINT "elections_configuration_version_check" CHECK ("election"."elections"."configuration_version" >= 0),
	CONSTRAINT "elections_row_version_check" CHECK ("election"."elections"."row_version" >= 0),
	CONSTRAINT "elections_status_check" CHECK ("election"."elections"."status" IN ('DRAFT', 'READY', 'OPEN', 'CLOSED', 'COUNTING', 'RESULTS_PUBLISHED', 'CANCELLED')),
	CONSTRAINT "elections_voting_method_check" CHECK ("election"."elections"."voting_method" = 'SINGLE_CHOICE')
);
--> statement-breakpoint
ALTER TABLE "election"."election_configuration_versions" ADD CONSTRAINT "election_configuration_versions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election"."election_options" ADD CONSTRAINT "election_options_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election"."election_state_event" ADD CONSTRAINT "election_state_event_actor_admin_id_admin_account_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "admin"."admin_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election"."election_state_event" ADD CONSTRAINT "election_state_event_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "election_options_election_order_unique" ON "election"."election_options" USING btree ("election_id","display_order");--> statement-breakpoint
CREATE INDEX "election_options_election_idx" ON "election"."election_options" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "election_state_event_election_time_idx" ON "election"."election_state_event" USING btree ("election_id","occurred_at");--> statement-breakpoint
CREATE INDEX "elections_status_time_idx" ON "election"."elections" USING btree ("status","opens_at","closes_at");--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "election"."election_configuration_versions" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "election"."election_options" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "election"."election_state_event" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "election"."elections" TO "votaciones_runtime";
