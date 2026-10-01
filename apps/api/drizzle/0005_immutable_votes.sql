REVOKE ALL PRIVILEGES ON TABLE "voting"."accepted_votes" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "voting"."vote_proof_evidence" FROM "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "voting"."accepted_votes" TO "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "voting"."vote_proof_evidence" TO "votaciones_runtime";
