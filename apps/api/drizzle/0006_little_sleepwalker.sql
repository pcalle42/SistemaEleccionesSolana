CREATE TABLE "result"."accepted_vote_set_snapshots" (
	"canonical_digest" varchar(64) NOT NULL,
	"configuration_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"election_id" uuid NOT NULL,
	"record_count" integer NOT NULL,
	"snapshot_version" varchar(48) NOT NULL,
	CONSTRAINT "accepted_vote_set_record_count_check" CHECK ("result"."accepted_vote_set_snapshots"."record_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_chain_head" (
	"head_hash" varchar(64) NOT NULL,
	"sequence" bigint NOT NULL,
	"stream_id" varchar(160) PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_checkpoint" (
	"checkpoint_version" varchar(48) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"from_sequence" bigint NOT NULL,
	"head_hash" varchar(64) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" varchar(160) NOT NULL,
	"to_sequence" bigint NOT NULL,
	CONSTRAINT "audit_checkpoint_range_check" CHECK ("audit"."audit_checkpoint"."from_sequence" > 0 AND "audit"."audit_checkpoint"."to_sequence" >= "audit"."audit_checkpoint"."from_sequence"),
	CONSTRAINT "audit_checkpoint_head_hash_check" CHECK ("audit"."audit_checkpoint"."head_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_event" (
	"actor_id" uuid,
	"actor_type" varchar(16) NOT NULL,
	"aggregate_id" uuid,
	"aggregate_type" varchar(48),
	"event_hash" varchar(64) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"event_version" integer NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_digest" varchar(64) NOT NULL,
	"previous_hash" varchar(64) NOT NULL,
	"sequence" bigserial NOT NULL,
	"stream_id" varchar(160) NOT NULL,
	CONSTRAINT "audit_event_actor_type_check" CHECK ("audit"."audit_event"."actor_type" IN ('ADMIN', 'SYSTEM', 'ANONYMOUS')),
	CONSTRAINT "audit_event_event_version_check" CHECK ("audit"."audit_event"."event_version" > 0),
	CONSTRAINT "audit_event_payload_digest_check" CHECK ("audit"."audit_event"."payload_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "audit_event_previous_hash_check" CHECK ("audit"."audit_event"."previous_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "audit_event_event_hash_check" CHECK ("audit"."audit_event"."event_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "audit_event_anonymous_actor_check" CHECK ("audit"."audit_event"."actor_type" <> 'ANONYMOUS' OR "audit"."audit_event"."actor_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "result"."election_manifests" (
	"configuration_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"election_id" uuid NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_digest" varchar(64) NOT NULL,
	"manifest_version" varchar(48) NOT NULL,
	"publication_state" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "election_manifests_config_check" CHECK ("result"."election_manifests"."configuration_version" > 0),
	CONSTRAINT "election_manifests_publication_state_check" CHECK ("result"."election_manifests"."publication_state" IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "result"."tally_manifests" (
	"accepted_vote_set_digest" varchar(64) NOT NULL,
	"configuration_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"election_id" uuid NOT NULL,
	"tally" jsonb NOT NULL,
	"tally_version" varchar(48) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result"."verification_packages" (
	"configuration_version" integer NOT NULL,
	"content_digest" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"election_id" uuid NOT NULL,
	"package_path" varchar(1000) NOT NULL,
	"package_version" varchar(48) NOT NULL,
	"verification_report" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "result"."accepted_vote_set_snapshots" ADD CONSTRAINT "accepted_vote_set_snapshots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result"."election_manifests" ADD CONSTRAINT "election_manifests_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result"."tally_manifests" ADD CONSTRAINT "tally_manifests_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result"."verification_packages" ADD CONSTRAINT "verification_packages_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "election"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accepted_vote_set_election_config_unique" ON "result"."accepted_vote_set_snapshots" USING btree ("election_id","configuration_version");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_checkpoint_stream_head_unique" ON "audit"."audit_checkpoint" USING btree ("stream_id","to_sequence","head_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_event_sequence_unique" ON "audit"."audit_event" USING btree ("sequence");--> statement-breakpoint
CREATE INDEX "audit_event_stream_sequence_idx" ON "audit"."audit_event" USING btree ("stream_id","sequence");--> statement-breakpoint
CREATE INDEX "audit_event_aggregate_idx" ON "audit"."audit_event" USING btree ("aggregate_type","aggregate_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "election_manifests_election_config_unique" ON "result"."election_manifests" USING btree ("election_id","configuration_version");--> statement-breakpoint
CREATE UNIQUE INDEX "election_manifests_digest_unique" ON "result"."election_manifests" USING btree ("manifest_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "tally_manifests_election_config_unique" ON "result"."tally_manifests" USING btree ("election_id","configuration_version");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_packages_election_config_unique" ON "result"."verification_packages" USING btree ("election_id","configuration_version");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_packages_content_digest_unique" ON "result"."verification_packages" USING btree ("content_digest");--> statement-breakpoint
CREATE FUNCTION "audit"."compute_event_hash"(
  p_sequence bigint,
  p_event_type text,
  p_event_version integer,
  p_occurred_at timestamptz,
  p_actor_type text,
  p_actor_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload_digest text,
  p_previous_hash text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT encode(
    sha256(
      convert_to(
        jsonb_build_array(
          'audit-chain-v1', p_sequence, p_event_type, p_event_version,
          to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          p_actor_type, p_actor_id::text, p_aggregate_type, p_aggregate_id::text,
          p_payload_digest, p_previous_hash
        )::text,
        'UTF8'
      )
    ),
    'hex'
  )
$$;--> statement-breakpoint
CREATE FUNCTION "audit"."append_event"(
  p_stream_id text,
  p_event_type text,
  p_event_version integer,
  p_actor_type text,
  p_actor_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_payload_digest text
) RETURNS TABLE(sequence bigint, event_hash text, occurred_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_previous_hash text;
  v_sequence bigint;
  v_occurred_at timestamptz;
  v_event_hash text;
BEGIN
  IF p_stream_id !~ '^[A-Za-z0-9:_-]{1,160}$'
     OR p_event_type !~ '^[a-z0-9_]{1,80}$'
     OR p_event_version < 1
     OR p_actor_type NOT IN ('ADMIN', 'SYSTEM', 'ANONYMOUS')
     OR (p_actor_type = 'ANONYMOUS' AND p_actor_id IS NOT NULL)
     OR p_payload_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid audit event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO audit.audit_chain_head (stream_id, sequence, head_hash, updated_at)
  VALUES (p_stream_id, 0, repeat('0', 64), clock_timestamp())
  ON CONFLICT (stream_id) DO NOTHING;

  SELECT head.sequence, head.head_hash
    INTO v_sequence, v_previous_hash
    FROM audit.audit_chain_head head
   WHERE head.stream_id = p_stream_id
   FOR UPDATE;

  v_sequence := nextval(pg_get_serial_sequence('audit.audit_event', 'sequence'));
  v_occurred_at := clock_timestamp();
  v_event_hash := audit.compute_event_hash(
    v_sequence, p_event_type, p_event_version, v_occurred_at, p_actor_type,
    p_actor_id, p_aggregate_type, p_aggregate_id, p_payload_digest, v_previous_hash
  );

  INSERT INTO audit.audit_event (
    sequence, stream_id, event_type, event_version, occurred_at, actor_type, actor_id,
    aggregate_type, aggregate_id, payload, payload_digest, previous_hash, event_hash
  ) VALUES (
    v_sequence, p_stream_id, p_event_type, p_event_version, v_occurred_at, p_actor_type,
    p_actor_id, p_aggregate_type, p_aggregate_id, p_payload, p_payload_digest,
    v_previous_hash, v_event_hash
  );

  UPDATE audit.audit_chain_head
     SET sequence = v_sequence, head_hash = v_event_hash, updated_at = v_occurred_at
   WHERE stream_id = p_stream_id;

  RETURN QUERY SELECT v_sequence, v_event_hash, v_occurred_at;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "audit"."create_checkpoint"(p_stream_id text)
RETURNS TABLE(
  id uuid,
  stream_id text,
  from_sequence bigint,
  to_sequence bigint,
  head_hash text,
  created_at timestamptz,
  checkpoint_version text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_head audit.audit_chain_head%ROWTYPE;
  v_from bigint;
BEGIN
  SELECT * INTO v_head FROM audit.audit_chain_head
   WHERE audit.audit_chain_head.stream_id = p_stream_id FOR UPDATE;
  IF NOT FOUND OR v_head.sequence = 0 THEN
    RAISE EXCEPTION 'audit stream is empty' USING ERRCODE = 'P0002';
  END IF;
  SELECT min(event.sequence) INTO v_from FROM audit.audit_event event
   WHERE event.stream_id = p_stream_id;
  INSERT INTO audit.audit_checkpoint (
    stream_id, from_sequence, to_sequence, head_hash, created_at, checkpoint_version
  ) VALUES (
    p_stream_id, v_from, v_head.sequence, v_head.head_hash, clock_timestamp(),
    'audit-checkpoint-v1'
  ) ON CONFLICT DO NOTHING;
  RETURN QUERY
    SELECT checkpoint.id, checkpoint.stream_id::text, checkpoint.from_sequence,
           checkpoint.to_sequence, checkpoint.head_hash::text, checkpoint.created_at,
           checkpoint.checkpoint_version::text
      FROM audit.audit_checkpoint checkpoint
     WHERE checkpoint.stream_id = p_stream_id
       AND checkpoint.to_sequence = v_head.sequence
       AND checkpoint.head_hash = v_head.head_hash;
END;
$$;--> statement-breakpoint
REVOKE ALL ON TABLE "audit"."audit_chain_head" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON TABLE "audit"."audit_event" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON TABLE "audit"."audit_checkpoint" FROM "votaciones_runtime";--> statement-breakpoint
GRANT SELECT ON TABLE "audit"."audit_chain_head", "audit"."audit_event", "audit"."audit_checkpoint" TO "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON FUNCTION "audit"."compute_event_hash"(bigint,text,integer,timestamptz,text,uuid,text,uuid,text,text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "audit"."append_event"(text,text,integer,text,uuid,text,uuid,jsonb,text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "audit"."create_checkpoint"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "audit"."compute_event_hash"(bigint,text,integer,timestamptz,text,uuid,text,uuid,text,text) TO "votaciones_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "audit"."append_event"(text,text,integer,text,uuid,text,uuid,jsonb,text) TO "votaciones_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "audit"."create_checkpoint"(text) TO "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON TABLE "result"."election_manifests" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON TABLE "result"."accepted_vote_set_snapshots" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON TABLE "result"."tally_manifests" FROM "votaciones_runtime";--> statement-breakpoint
REVOKE ALL ON TABLE "result"."verification_packages" FROM "votaciones_runtime";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "result"."election_manifests", "result"."accepted_vote_set_snapshots", "result"."tally_manifests", "result"."verification_packages" TO "votaciones_runtime";
