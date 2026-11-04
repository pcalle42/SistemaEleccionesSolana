import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createReadinessSnapshot,
  verifyReadinessSnapshot,
  verifyReference,
  verifyTraceability,
} from '../../scripts/production/readiness.mjs';

async function matrix() {
  return JSON.parse(await readFile('production-readiness/traceability.v1.json', 'utf8'));
}

describe('initial production readiness inventory', () => {
  it('resolves implementation, test and evidence references for the current inventory', async () => {
    const value = await matrix();
    await expect(verifyTraceability(value)).resolves.toEqual(value);
  });

  it('rejects duplicate IDs, unsupported PASS and critical waivers', async () => {
    const duplicate = await matrix();
    duplicate.requirements.push(duplicate.requirements[0]);
    await expect(verifyTraceability(duplicate)).rejects.toThrow(/Duplicate/u);
    const pass = await matrix();
    pass.requirements[0].status = 'PASS';
    pass.requirements[0].evidenceRefs = [];
    await expect(verifyTraceability(pass)).rejects.toThrow(/evidenceRefs/u);
    for (const status of ['RISK_ACCEPTED', 'NOT_APPLICABLE']) {
      const waived = await matrix();
      waived.requirements[0].status = status;
      await expect(verifyTraceability(waived)).rejects.toThrow(/cannot be waived/u);
    }
  });

  it('rejects traversal and missing references', async () => {
    await expect(verifyReference('/etc/passwd')).rejects.toThrow(/relative/u);
    await expect(verifyReference('../../../../../../etc/passwd')).rejects.toThrow();
    await expect(verifyReference('production-readiness/nonexistent.json')).rejects.toThrow();
  });

  it('preserves history, binds digests and detects snapshot tampering', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'readiness-'));
    const output = join(temporary, 'snapshot');
    try {
      const record = await createReadinessSnapshot(output);
      expect(record.decision).toBe('NO-GO');
      expect(record.releaseManifestDigest).toBeNull();
      await expect(verifyReadinessSnapshot(output)).resolves.toEqual(record);
      await expect(createReadinessSnapshot(output)).rejects.toThrow();
      await writeFile(join(output, 'risks.v1.json'), '{}\n');
      await expect(verifyReadinessSnapshot(output)).rejects.toThrow(/digest mismatch/u);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
