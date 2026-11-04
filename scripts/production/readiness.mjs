import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  currentGitCommit,
  fileDigest,
  invariant,
  objectDigest,
  parseArguments,
  readJson,
  repositoryRoot,
  validateSchema,
} from '../release/lib.mjs';

// Repository references are evidence locations, never shell commands.
export async function verifyReference(reference, root = repositoryRoot) {
  invariant(
    typeof reference === 'string' && !isAbsolute(reference),
    'Expected relative reference.',
  );
  const actualRoot = await realpath(root);
  const path = await realpath(resolve(actualRoot, reference));
  const local = relative(actualRoot, path);
  invariant(
    local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local),
    'Reference escapes repository.',
  );
  return path;
}

export async function verifyTraceability(matrix, root = repositoryRoot) {
  await validateSchema(matrix, 'production-readiness/schemas/TraceabilityMatrixV1.schema.json');
  const ids = new Set();
  for (const requirement of matrix.requirements) {
    invariant(!ids.has(requirement.requirementId), 'Duplicate requirement ID.');
    ids.add(requirement.requirementId);
    for (const reference of [
      requirement.sourceDocument,
      ...requirement.implementationRefs,
      ...requirement.testRefs,
      ...requirement.evidenceRefs,
    ]) {
      await verifyReference(reference, root);
    }
    if (requirement.status === 'PASS') {
      for (const key of ['implementationRefs', 'testRefs', 'evidenceRefs']) {
        invariant(requirement[key].length > 0, `PASS requires ${key}.`);
      }
    }
    if (requirement.criticality === 'critical') {
      invariant(
        !['NOT_APPLICABLE', 'RISK_ACCEPTED'].includes(requirement.status),
        'Critical electoral controls cannot be waived.',
      );
    }
  }
  return matrix;
}

export async function verifyElectionReadiness(record) {
  await validateSchema(
    record,
    'production-readiness/schemas/ElectionReadinessRecordV1.schema.json',
  );
  invariant(
    Number.isFinite(Date.parse(record.opensAt)) && Number.isFinite(Date.parse(record.closesAt)),
    'Invalid election dates.',
  );
  invariant(Date.parse(record.opensAt) < Date.parse(record.closesAt), 'Invalid election window.');
  const ids = record.readinessChecks.map((check) => check.requirementId);
  invariant(new Set(ids).size === ids.length, 'Duplicate election readiness check.');
  if (record.decision === 'GO') {
    invariant(
      record.readinessChecks.every(
        (check) => check.status === 'PASS' && check.evidenceRefs.length > 0,
      ),
      'Election GO requires evidenced PASS checks.',
    );
    // Structural validation is never an authorization or evidence authentication.
    for (const check of record.readinessChecks) {
      for (const reference of check.evidenceRefs) await verifyReference(reference);
    }
  }
  return record;
}

export async function createReadinessSnapshot(output) {
  const matrix = await verifyTraceability(
    await readJson(resolve(repositoryRoot, 'production-readiness/traceability.v1.json')),
  );
  const risks = await readJson(resolve(repositoryRoot, 'production-readiness/risks.v1.json'));
  await validateSchema(risks, 'production-readiness/schemas/RiskRegisterV1.schema.json');
  const registry = await readJson(resolve(repositoryRoot, 'release/zk/registry.v1.json'));
  const productionArtifacts = registry.entries.some(
    (entry) => entry.classification === 'production' && entry.productionSafe === true,
  );
  const record = {
    schemaVersion: 'GoNoGoRecordV1',
    releaseVersion: (await readJson(resolve(repositoryRoot, 'package.json'))).version,
    releaseManifestDigest: null,
    protocolVersions: [...new Set(registry.entries.map((entry) => entry.protocolVersion))],
    criticalGateSummary: matrix.requirements
      .filter((entry) => entry.criticality === 'critical')
      .map(({ requirementId, status }) => ({ requirementId, status })),
    traceabilityDigest: objectDigest(matrix),
    securityReviewRefs: [],
    zkReviewRefs: [],
    pentestRefs: [],
    restoreTestRef: null,
    capacityTestRef: null,
    rehearsalRef: null,
    residualRiskRegisterDigest: objectDigest(risks),
    decision: productionArtifacts ? 'INCOMPLETE' : 'NO-GO',
    decisionReason: productionArtifacts
      ? 'Inventario inicial sin evidencia completa del release exacto ni aprobaciones externas.'
      : 'No hay artifacts ZK productivos seguros registrados. Evidencia del release exacto y aprobaciones externas incompletas.',
    decidedAt: new Date().toISOString(),
    decisionAuthority:
      'Evaluación técnica automática; no sustituye autoridad electoral ni aprobación humana.',
  };
  await validateSchema(record, 'production-readiness/schemas/GoNoGoRecordV1.schema.json');
  // mkdir without recursive deliberately refuses to overwrite an existing snapshot.
  const target = resolve(output);
  await mkdir(target);
  const files = {
    'traceability.v1.json': matrix,
    'risks.v1.json': risks,
    'decision.v1.json': record,
    'source.v1.json': {
      schemaVersion: 'ReadinessSourceV1',
      gitCommit: currentGitCommit(),
      scope: 'Working-tree snapshot, not an immutable release. No test execution implied.',
      inputs: await Promise.all(
        [
          'production-readiness/traceability.v1.json',
          'production-readiness/risks.v1.json',
          'release/zk/registry.v1.json',
          'deploy/production-profile.template.json',
        ].map(async (path) => ({ path, sha256: await fileDigest(resolve(repositoryRoot, path)) })),
      ),
    },
  };
  const inventory = [];
  for (const [name, value] of Object.entries(files)) {
    const content = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(resolve(target, name), content, { flag: 'wx' });
    inventory.push({ path: name, sha256: await fileDigest(resolve(target, name)) });
  }
  await writeFile(resolve(target, 'hashes.v1.json'), `${JSON.stringify(inventory, null, 2)}\n`, {
    flag: 'wx',
  });
  return record;
}

export async function verifyReadinessSnapshot(directory) {
  const root = resolve(directory);
  const hashes = await readJson(resolve(root, 'hashes.v1.json'));
  const required = ['traceability.v1.json', 'risks.v1.json', 'decision.v1.json', 'source.v1.json'];
  invariant(
    Array.isArray(hashes) && hashes.length === required.length,
    'Invalid snapshot inventory.',
  );
  invariant(
    new Set(hashes.map((entry) => entry.path)).size === required.length,
    'Duplicate snapshot entry.',
  );
  for (const entry of hashes) {
    invariant(required.includes(entry.path), 'Unexpected snapshot file.');
    invariant(
      (await fileDigest(await verifyReference(entry.path, root))) === entry.sha256,
      'Snapshot digest mismatch.',
    );
  }
  const matrix = await readJson(resolve(root, 'traceability.v1.json'));
  const risks = await readJson(resolve(root, 'risks.v1.json'));
  const record = await readJson(resolve(root, 'decision.v1.json'));
  await validateSchema(matrix, 'production-readiness/schemas/TraceabilityMatrixV1.schema.json');
  await validateSchema(risks, 'production-readiness/schemas/RiskRegisterV1.schema.json');
  await validateSchema(record, 'production-readiness/schemas/GoNoGoRecordV1.schema.json');
  invariant(record.traceabilityDigest === objectDigest(matrix), 'Traceability digest mismatch.');
  invariant(
    record.residualRiskRegisterDigest === objectDigest(risks),
    'Risk register digest mismatch.',
  );
  invariant(record.decision !== 'GO', 'Initial snapshots cannot authorize production.');
  invariant(
    JSON.stringify(record.criticalGateSummary) ===
      JSON.stringify(
        matrix.requirements
          .filter((entry) => entry.criticality === 'critical')
          .map(({ requirementId, status }) => ({ requirementId, status })),
      ),
    'Gate summary mismatch.',
  );
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const result = args.verify
      ? await verifyReadinessSnapshot(args.verify)
      : await createReadinessSnapshot(
          args.output ??
            (() => {
              throw new Error('--output is required.');
            })(),
        );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // A valid inventory is not a passing production gate.
    process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
