import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const workflows = [
  'pull-request.yml',
  'main.yml',
  'security.yml',
  'release-candidate.yml',
  'promote.yml',
];

async function workflow(name: string): Promise<string> {
  return readFile(resolve(repositoryRoot, '.github/workflows', name), 'utf8');
}

describe('CI/CD policy', () => {
  it('pins every external action to a full commit SHA', async () => {
    for (const name of workflows) {
      const source = await workflow(name);
      const actions = [...source.matchAll(/^\s*- uses: ([^\s#]+)(?:\s+#.*)?$/gmu)].map(
        (match) => match[1]!,
      );
      expect(actions.length, name).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action, `${name}: ${action}`).toMatch(/^[^@]+@[a-f0-9]{40}$/u);
      }
    }
  });

  it('keeps critical gates blocking and frozen installs mandatory', async () => {
    for (const name of workflows) {
      const source = await workflow(name);
      expect(source, name).toContain('pnpm install --frozen-lockfile');
      expect(source, name).not.toContain('continue-on-error');
    }
    expect(await workflow('pull-request.yml')).toContain('pnpm ci:validate');
    expect(await workflow('main.yml')).toContain('pnpm ci:main');
    expect(await workflow('release-candidate.yml')).toContain('pnpm ci:release');
  });

  it('promotes downloaded digests without rebuilding and requires an explicit environment', async () => {
    const promotion = await workflow('promote.yml');
    expect(promotion).toContain('environment: ${{ inputs.target }}');
    expect(promotion).toContain('actions/download-artifact@');
    expect(promotion).not.toMatch(/docker (?:build|buildx)/u);
    expect(promotion).not.toContain(':latest');
  });
});
