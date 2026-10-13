SELECT json_build_object(
  'acceptedVoteCount', (SELECT count(*)::integer FROM voting.accepted_votes),
  'acceptedVoteDigest', COALESCE((
    SELECT encode(sha256(convert_to(string_agg(
      election_id::text || ':' || protocol_version || ':' || nullifier || ':' ||
      configuration_version::text || ':' || vote_encoding::text || ':' || receipt_commitment,
      '|' ORDER BY election_id, protocol_version, nullifier
    ), 'UTF8')), 'hex') FROM voting.accepted_votes
  ), repeat('0', 64)),
  'auditHeadDigest', COALESCE((
    SELECT encode(sha256(convert_to(string_agg(
      stream_id || ':' || sequence::text || ':' || head_hash,
      '|' ORDER BY stream_id
    ), 'UTF8')), 'hex') FROM audit.audit_chain_head
  ), repeat('0', 64)),
  'electionCount', (SELECT count(*)::integer FROM election.elections),
  'schemaVersion', (SELECT migration_version FROM app.schema_compatibility WHERE singleton = true),
  'tallyResultDigest', COALESCE((
    SELECT encode(sha256(convert_to(string_agg(record, '|' ORDER BY record), 'UTF8')), 'hex')
    FROM (
      SELECT election_id::text || ':tally:' || configuration_version::text || ':' ||
             accepted_vote_set_digest || ':' || tally_digest AS record
      FROM result.tally_manifests
      UNION ALL
      SELECT election_id::text || ':result:' || result_version::text || ':' ||
             result_content_digest || ':' || publication_digest AS record
      FROM result.election_results
    ) evidence_records
  ), repeat('0', 64)),
  'verificationPackageDigest', COALESCE((
    SELECT encode(sha256(convert_to(string_agg(
      election_id::text || ':' || configuration_version::text || ':' || content_digest,
      '|' ORDER BY election_id, configuration_version
    ), 'UTF8')), 'hex') FROM result.verification_packages
  ), repeat('0', 64))
)::text;
