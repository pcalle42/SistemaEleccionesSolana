CREATE OR REPLACE FUNCTION "audit"."create_checkpoint"(p_stream_id text)
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
$$;
