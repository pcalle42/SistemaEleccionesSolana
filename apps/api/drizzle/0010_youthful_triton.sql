CREATE TABLE "result"."election_results" (
	"accepted_vote_set_digest" varchar(64) NOT NULL,
	"configuration_version" integer NOT NULL,
	"election_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"previous_result_digest" varchar(64),
	"protocol_version" varchar(64) NOT NULL,
	"publication_digest" varchar(64) NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"result" jsonb NOT NULL,
	"result_content_digest" varchar(64) NOT NULL,
	"result_schema_version" varchar(48) NOT NULL,
	"result_version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'VALIDATED' NOT NULL,
	"tally_digest" varchar(64) NOT NULL,
	"total_accepted_votes" integer NOT NULL,
	"verification_package_digest" varchar(64) NOT NULL,
	CONSTRAINT "election_results_version_check" CHECK ("result"."election_results"."result_version" > 0),
	CONSTRAINT "election_results_total_check" CHECK ("result"."election_results"."total_accepted_votes" >= 0),
	CONSTRAINT "election_results_status_check" CHECK ("result"."election_results"."status" IN ('VALIDATED', 'PUBLISHED', 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "result"."result_publications" (
	"created_at" timestamp with time zone NOT NULL,
	"election_id" uuid NOT NULL,
	"failure_code" varchar(80),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_content_digest" varchar(64),
	"result_version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'GENERATED' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "result_publications_version_check" CHECK ("result"."result_publications"."result_version" > 0),
	CONSTRAINT "result_publications_status_check" CHECK ("result"."result_publications"."status" IN ('GENERATED', 'VERIFIED', 'PUBLISHING', 'PUBLISHED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "result"."election_results" ADD CONSTRAINT "election_results_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result"."result_publications" ADD CONSTRAINT "result_publications_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "election_results_election_version_unique" ON "result"."election_results" USING btree ("election_id","result_version");--> statement-breakpoint
CREATE UNIQUE INDEX "election_results_content_digest_unique" ON "result"."election_results" USING btree ("result_content_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "election_results_publication_digest_unique" ON "result"."election_results" USING btree ("publication_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "result_publications_election_version_unique" ON "result"."result_publications" USING btree ("election_id","result_version");--> statement-breakpoint
REVOKE ALL ON TABLE "result"."election_results", "result"."result_publications" FROM "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "result"."election_results", "result"."result_publications" TO "votaciones_runtime";--> statement-breakpoint
GRANT UPDATE (status) ON TABLE "result"."election_results", "result"."tally_manifests", "result"."verification_packages" TO "votaciones_runtime";--> statement-breakpoint
GRANT UPDATE (status, failure_code, updated_at) ON TABLE "result"."result_publications" TO "votaciones_runtime";
