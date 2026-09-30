CREATE SCHEMA IF NOT EXISTS "eligibility";--> statement-breakpoint
GRANT USAGE ON SCHEMA "eligibility" TO "votaciones_runtime";--> statement-breakpoint
CREATE TABLE "eligibility"."electoral_credentials" (
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"eligible_voter_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_commitment" varchar(256) NOT NULL,
	"revoked_at" timestamp with time zone,
	"row_version" integer DEFAULT 0 NOT NULL,
	"scheme_version" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "electoral_credentials_row_version_check" CHECK ("eligibility"."electoral_credentials"."row_version" >= 0),
	CONSTRAINT "electoral_credentials_status_check" CHECK ("eligibility"."electoral_credentials"."status" IN ('PENDING', 'ACTIVE', 'REVOKED', 'ROTATED'))
);
--> statement-breakpoint
CREATE TABLE "audit"."eligibility_event" (
	"actor_admin_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"event" varchar(64) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "eligibility"."eligibility_snapshot_members" (
	"credential_id" uuid NOT NULL,
	"leaf_index" integer NOT NULL,
	"leaf_value" varchar(256) NOT NULL,
	"snapshot_id" uuid NOT NULL,
	CONSTRAINT "eligibility_snapshot_members_snapshot_id_credential_id_pk" PRIMARY KEY("snapshot_id","credential_id"),
	CONSTRAINT "eligibility_snapshot_members_leaf_index_check" CHECK ("eligibility"."eligibility_snapshot_members"."leaf_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "eligibility"."eligibility_snapshots" (
	"commitment_scheme_version" varchar(64) NOT NULL,
	"configuration_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"election_id" uuid NOT NULL,
	"frozen_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"leaf_count" integer NOT NULL,
	"merkle_root" varchar(256) NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'BUILDING' NOT NULL,
	"tree_depth" integer NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "eligibility_snapshots_configuration_version_check" CHECK ("eligibility"."eligibility_snapshots"."configuration_version" > 0),
	CONSTRAINT "eligibility_snapshots_version_check" CHECK ("eligibility"."eligibility_snapshots"."version" > 0),
	CONSTRAINT "eligibility_snapshots_leaf_count_check" CHECK ("eligibility"."eligibility_snapshots"."leaf_count" > 0),
	CONSTRAINT "eligibility_snapshots_tree_depth_check" CHECK ("eligibility"."eligibility_snapshots"."tree_depth" > 0),
	CONSTRAINT "eligibility_snapshots_row_version_check" CHECK ("eligibility"."eligibility_snapshots"."row_version" >= 0),
	CONSTRAINT "eligibility_snapshots_status_check" CHECK ("eligibility"."eligibility_snapshots"."status" IN ('BUILDING', 'FROZEN', 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "eligibility"."eligible_voters" (
	"created_at" timestamp with time zone NOT NULL,
	"display_name" varchar(200),
	"external_reference" varchar(128),
	"id" uuid PRIMARY KEY NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "eligible_voters_row_version_check" CHECK ("eligibility"."eligible_voters"."row_version" >= 0),
	CONSTRAINT "eligible_voters_status_check" CHECK ("eligibility"."eligible_voters"."status" IN ('ACTIVE', 'INACTIVE', 'REVOKED'))
);
--> statement-breakpoint
ALTER TABLE "eligibility"."electoral_credentials" ADD CONSTRAINT "electoral_credentials_eligible_voter_id_eligible_voters_id_fk" FOREIGN KEY ("eligible_voter_id") REFERENCES "eligibility"."eligible_voters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."eligibility_event" ADD CONSTRAINT "eligibility_event_actor_admin_id_admin_account_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "admin"."admin_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility"."eligibility_snapshot_members" ADD CONSTRAINT "eligibility_snapshot_members_credential_id_electoral_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "eligibility"."electoral_credentials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility"."eligibility_snapshot_members" ADD CONSTRAINT "eligibility_snapshot_members_snapshot_id_eligibility_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "eligibility"."eligibility_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility"."eligibility_snapshots" ADD CONSTRAINT "eligibility_snapshots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "electoral_credentials_commitment_scheme_unique" ON "eligibility"."electoral_credentials" USING btree ("identity_commitment","scheme_version");--> statement-breakpoint
CREATE UNIQUE INDEX "electoral_credentials_one_active_per_voter" ON "eligibility"."electoral_credentials" USING btree ("eligible_voter_id") WHERE "eligibility"."electoral_credentials"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "electoral_credentials_status_commitment_idx" ON "eligibility"."electoral_credentials" USING btree ("status","scheme_version","identity_commitment");--> statement-breakpoint
CREATE INDEX "eligibility_event_entity_time_idx" ON "audit"."eligibility_event" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_snapshot_members_leaf_index_unique" ON "eligibility"."eligibility_snapshot_members" USING btree ("snapshot_id","leaf_index");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_snapshot_members_leaf_value_unique" ON "eligibility"."eligibility_snapshot_members" USING btree ("snapshot_id","leaf_value");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_snapshots_election_config_version_unique" ON "eligibility"."eligibility_snapshots" USING btree ("election_id","configuration_version","version");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_snapshots_one_frozen_per_config" ON "eligibility"."eligibility_snapshots" USING btree ("election_id","configuration_version") WHERE "eligibility"."eligibility_snapshots"."status" = 'FROZEN';--> statement-breakpoint
CREATE INDEX "eligibility_snapshots_election_status_idx" ON "eligibility"."eligibility_snapshots" USING btree ("election_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "eligible_voters_external_reference_unique" ON "eligibility"."eligible_voters" USING btree ("external_reference") WHERE "eligibility"."eligible_voters"."external_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eligible_voters_status_idx" ON "eligibility"."eligible_voters" USING btree ("status");--> statement-breakpoint
CREATE FUNCTION "eligibility"."enforce_snapshot_member_building"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_snapshot uuid;
  snapshot_status varchar(16);
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_snapshot := OLD.snapshot_id;
  ELSE
    target_snapshot := NEW.snapshot_id;
  END IF;
  SELECT status INTO snapshot_status
  FROM eligibility.eligibility_snapshots
  WHERE id = target_snapshot;
  IF snapshot_status IS DISTINCT FROM 'BUILDING' THEN
    RAISE EXCEPTION 'snapshot members are immutable after freeze' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "eligibility_snapshot_members_building_only"
BEFORE INSERT OR UPDATE OR DELETE ON "eligibility"."eligibility_snapshot_members"
FOR EACH ROW EXECUTE FUNCTION "eligibility"."enforce_snapshot_member_building"();--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "eligibility"."eligible_voters" TO "votaciones_runtime";--> statement-breakpoint
GRANT UPDATE ("display_name", "row_version", "status", "updated_at") ON TABLE "eligibility"."eligible_voters" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "eligibility"."electoral_credentials" TO "votaciones_runtime";--> statement-breakpoint
GRANT UPDATE ("revoked_at", "row_version", "status") ON TABLE "eligibility"."electoral_credentials" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "eligibility"."eligibility_snapshots" TO "votaciones_runtime";--> statement-breakpoint
GRANT UPDATE ("frozen_at", "row_version", "status") ON TABLE "eligibility"."eligibility_snapshots" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "eligibility"."eligibility_snapshot_members" TO "votaciones_runtime";--> statement-breakpoint
GRANT INSERT ON TABLE "audit"."eligibility_event" TO "votaciones_runtime";
