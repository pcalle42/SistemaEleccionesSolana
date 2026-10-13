DO $validation$
BEGIN
  IF (SELECT migration_version FROM app.schema_compatibility WHERE singleton = true)
       <> '0011_release_schema_compatibility.sql' THEN
    RAISE EXCEPTION 'incompatible restored schema';
  END IF;

  IF EXISTS (
    SELECT 1 FROM voting.accepted_votes
    GROUP BY election_id, protocol_version, nullifier HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate accepted-vote nullifier';
  END IF;

  IF EXISTS (
    SELECT 1 FROM audit.audit_event event
    WHERE event.event_hash <> audit.compute_event_hash(
      event.sequence, event.event_type, event.event_version, event.occurred_at,
      event.actor_type, event.actor_id, event.aggregate_type, event.aggregate_id,
      event.payload_digest, event.previous_hash
    )
  ) THEN
    RAISE EXCEPTION 'audit event hash mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT stream_id, sequence, previous_hash,
             lag(event_hash, 1, repeat('0', 64)) OVER (PARTITION BY stream_id ORDER BY sequence) expected
      FROM audit.audit_event
    ) chain WHERE chain.previous_hash <> chain.expected
  ) THEN
    RAISE EXCEPTION 'audit chain link mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM audit.audit_chain_head head
    LEFT JOIN audit.audit_event event
      ON event.stream_id = head.stream_id AND event.sequence = head.sequence
    WHERE (head.sequence = 0 AND head.head_hash <> repeat('0', 64))
       OR (head.sequence > 0 AND event.event_hash IS DISTINCT FROM head.head_hash)
  ) THEN
    RAISE EXCEPTION 'audit head mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM audit.audit_checkpoint checkpoint
    LEFT JOIN audit.audit_event event
      ON event.stream_id = checkpoint.stream_id AND event.sequence = checkpoint.to_sequence
    WHERE event.event_hash IS DISTINCT FROM checkpoint.head_hash
  ) THEN
    RAISE EXCEPTION 'audit checkpoint mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM result.accepted_vote_set_snapshots snapshot
    WHERE snapshot.record_count <> (
      SELECT count(*) FROM voting.accepted_votes vote
      WHERE vote.election_id = snapshot.election_id
        AND vote.configuration_version = snapshot.configuration_version
    )
  ) THEN
    RAISE EXCEPTION 'accepted vote-set count mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM result.tally_manifests tally
    LEFT JOIN result.accepted_vote_set_snapshots snapshot
      ON snapshot.election_id = tally.election_id
     AND snapshot.configuration_version = tally.configuration_version
    WHERE snapshot.id IS NULL
       OR tally.accepted_vote_count <> snapshot.record_count
       OR tally.accepted_vote_set_digest <> snapshot.canonical_digest
       OR tally.protocol_version <> snapshot.protocol_version
  ) THEN
    RAISE EXCEPTION 'tally does not match the frozen accepted vote set';
  END IF;

  IF EXISTS (
    SELECT 1 FROM result.election_results election_result
    LEFT JOIN result.tally_manifests tally
      ON tally.election_id = election_result.election_id
     AND tally.configuration_version = election_result.configuration_version
    WHERE tally.id IS NULL
       OR election_result.total_accepted_votes <> tally.accepted_vote_count
       OR election_result.accepted_vote_set_digest <> tally.accepted_vote_set_digest
       OR election_result.tally_digest <> tally.tally_digest
       OR election_result.protocol_version <> tally.protocol_version
  ) THEN
    RAISE EXCEPTION 'published result does not match its tally';
  END IF;

  IF EXISTS (
    SELECT 1 FROM result.election_results current_result
    LEFT JOIN result.election_results previous_result
      ON previous_result.election_id = current_result.election_id
     AND previous_result.result_version = current_result.result_version - 1
    WHERE (current_result.result_version = 1 AND current_result.previous_result_digest IS NOT NULL)
       OR (current_result.result_version > 1 AND
           current_result.previous_result_digest IS DISTINCT FROM previous_result.result_content_digest)
  ) THEN
    RAISE EXCEPTION 'result version chain mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM result.verification_packages package
    LEFT JOIN result.election_results election_result
      ON election_result.election_id = package.election_id
     AND election_result.result_version = package.result_version
    WHERE election_result.id IS NULL
       OR election_result.verification_package_digest <> package.evidence_digest
  ) THEN
    RAISE EXCEPTION 'verification package does not match its result';
  END IF;

  IF EXISTS (
    SELECT 1 FROM result.result_publications publication
    LEFT JOIN result.verification_packages package
      ON package.election_id = publication.election_id
     AND package.result_version = publication.result_version
    WHERE publication.package_content_digest IS NOT NULL
      AND publication.package_content_digest IS DISTINCT FROM package.content_digest
  ) THEN
    RAISE EXCEPTION 'publication does not match its verification package';
  END IF;
END
$validation$;
