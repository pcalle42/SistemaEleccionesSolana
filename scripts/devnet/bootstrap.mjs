import {
  assert,
  createReadyElection,
  fixtureCommitments,
  loadFixture,
  login,
  provisionVoters,
  jsonRequest,
} from './lib.mjs';

const session = await login();
const fixture = await loadFixture();
const elections = await jsonRequest('/admin/elections', {}, session);
const existing = elections.find((election) => election.title === fixture.demoElection.title);

if (existing) {
  assert(
    existing.status === 'READY',
    `Demo election exists in incompatible state ${existing.status}`,
  );
  process.stdout.write(`Demo election already READY: ${existing.id}\n`);
} else {
  const voters = await provisionVoters(session, fixture.voters);
  const commitments = await fixtureCommitments(fixture);
  assert(
    fixture.voters.every((voter, index) => voter.identityCommitment === commitments[index]),
    'Fixture manifest identity commitments do not match its voter secrets',
  );
  const tree = await import('@votaciones/zk-protocol').then(({ buildMerkleTreeV1 }) =>
    buildMerkleTreeV1(commitments),
  );
  assert(
    fixture.expectedMerkleRoot === tree.root,
    'Fixture manifest expectedMerkleRoot does not match its voter secrets',
  );
  const now = Date.now();
  const { election } = await createReadyElection(
    session,
    {
      closesAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      description: 'Synthetic DEVNET ONLY election; not for real voting.',
      opensAt: new Date(now - 60 * 60 * 1000).toISOString(),
      options: fixture.demoElection.options,
      title: fixture.demoElection.title,
    },
    voters.map((voter) => voter.identityCommitment),
  );
  process.stdout.write(`Demo election READY: ${election.id}\n`);
}
