export const repositoryRoot: string;

export function invariant(condition: unknown, message: string): asserts condition;
export function readJson(path: string): Promise<unknown>;
export function parseArguments(argv: string[]): Record<string, string>;
export function canonicalize(value: unknown): string;
export function sha256(value: string | Buffer): string;
export function fileDigest(path: string): Promise<string>;
export function objectDigest(value: unknown): string;
export function manifestPayload(manifest: Record<string, unknown>): Record<string, unknown>;
export function assertSemver(version: string): void;
export function assertDigest(digest: string, label: string): void;
export function currentGitCommit(): string;
export function currentPnpmVersion(): string;
export function migrationSet(): Promise<{
  count: number;
  latest: string | undefined;
  registry: unknown;
  setDigest: string;
}>;
export function verifiedZkRegistry(classification: string): Promise<{
  registry: unknown;
  selected: unknown[];
}>;
export function validateSchema(document: unknown, schemaRelativePath: string): Promise<void>;
