DROP INDEX "result"."verification_packages_election_config_unique";--> statement-breakpoint
ALTER TABLE "result"."accepted_vote_set_snapshots" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."accepted_vote_set_snapshots" ADD COLUMN "protocol_version" varchar(64);--> statement-breakpoint
UPDATE "result"."accepted_vote_set_snapshots" snapshot
   SET protocol_version = election.protocol_version
  FROM election.elections election WHERE election.id = snapshot.election_id;--> statement-breakpoint
ALTER TABLE "result"."accepted_vote_set_snapshots" ALTER COLUMN "protocol_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD COLUMN "accepted_vote_count" integer;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD COLUMN "protocol_version" varchar(64);--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD COLUMN "status" varchar(16) DEFAULT 'COMPUTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD COLUMN "tally_digest" varchar(64);--> statement-breakpoint
UPDATE "result"."tally_manifests" tally
   SET accepted_vote_count = COALESCE((tally.tally->>'acceptedVoteCount')::integer, 0),
       protocol_version = election.protocol_version,
       tally_digest = encode(sha256(convert_to(tally.tally::text, 'UTF8')), 'hex')
  FROM election.elections election WHERE election.id = tally.election_id;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ALTER COLUMN "accepted_vote_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ALTER COLUMN "protocol_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ALTER COLUMN "tally_digest" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD COLUMN "evidence_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD COLUMN "result_version" integer;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD COLUMN "status" varchar(16) DEFAULT 'GENERATED' NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "result"."verification_packages"
   SET evidence_digest = content_digest, result_version = 1, size_bytes = 1,
       verified_at = created_at,
       status = CASE WHEN verification_report->>'valid' = 'true' THEN 'VERIFIED' ELSE 'FAILED' END;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ALTER COLUMN "evidence_digest" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ALTER COLUMN "result_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ALTER COLUMN "size_bytes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ALTER COLUMN "verified_at" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tally_manifests_digest_unique" ON "result"."tally_manifests" USING btree ("tally_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_packages_election_result_unique" ON "result"."verification_packages" USING btree ("election_id","result_version");--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD CONSTRAINT "tally_manifests_accepted_count_check" CHECK ("result"."tally_manifests"."accepted_vote_count" >= 0);--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD CONSTRAINT "tally_manifests_status_check" CHECK ("result"."tally_manifests"."status" IN ('COMPUTED', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED'));--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD CONSTRAINT "verification_packages_result_version_check" CHECK ("result"."verification_packages"."result_version" > 0);--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD CONSTRAINT "verification_packages_size_check" CHECK ("result"."verification_packages"."size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD CONSTRAINT "verification_packages_status_check" CHECK ("result"."verification_packages"."status" IN ('GENERATED', 'VERIFIED', 'PUBLISHED', 'FAILED'));
