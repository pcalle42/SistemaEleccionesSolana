CREATE TABLE "voting"."accepted_votes" (
	"accepted_at" timestamp with time zone NOT NULL,
	"circuit_version" varchar(64) NOT NULL,
	"configuration_version" integer NOT NULL,
	"election_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"nullifier" varchar(80) NOT NULL,
	"protocol_version" varchar(64) NOT NULL,
	"receipt_commitment" varchar(64) NOT NULL,
	"receipt_version" varchar(64) NOT NULL,
	"submission_fingerprint" varchar(64) NOT NULL,
	"vote_encoding" integer NOT NULL,
	CONSTRAINT "accepted_votes_configuration_version_check" CHECK ("voting"."accepted_votes"."configuration_version" > 0),
	CONSTRAINT "accepted_votes_vote_encoding_check" CHECK ("voting"."accepted_votes"."vote_encoding" >= 0),
	CONSTRAINT "accepted_votes_nullifier_canonical_check" CHECK ("voting"."accepted_votes"."nullifier" ~ '^(0|[1-9][0-9]{0,76})$'),
	CONSTRAINT "accepted_votes_submission_fingerprint_check" CHECK ("voting"."accepted_votes"."submission_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "accepted_votes_receipt_commitment_check" CHECK ("voting"."accepted_votes"."receipt_commitment" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "voting"."vote_proof_evidence" (
	"created_at" timestamp with time zone NOT NULL,
	"proof" jsonb NOT NULL,
	"proof_digest" varchar(64) NOT NULL,
	"public_signals" jsonb NOT NULL,
	"public_signals_digest" varchar(64) NOT NULL,
	"schema_version" varchar(64) NOT NULL,
	"vote_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "vote_proof_evidence_proof_digest_check" CHECK ("voting"."vote_proof_evidence"."proof_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "vote_proof_evidence_public_signals_digest_check" CHECK ("voting"."vote_proof_evidence"."public_signals_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "voting"."accepted_votes" ADD CONSTRAINT "accepted_votes_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voting"."vote_proof_evidence" ADD CONSTRAINT "vote_proof_evidence_vote_id_accepted_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "voting"."accepted_votes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accepted_votes_election_protocol_nullifier_unique" ON "voting"."accepted_votes" USING btree ("election_id","protocol_version","nullifier");--> statement-breakpoint
CREATE INDEX "accepted_votes_election_configuration_idx" ON "voting"."accepted_votes" USING btree ("election_id","configuration_version");--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "voting"."accepted_votes" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "voting"."vote_proof_evidence" FROM "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "voting"."accepted_votes" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "voting"."vote_proof_evidence" TO "votaciones_runtime";
