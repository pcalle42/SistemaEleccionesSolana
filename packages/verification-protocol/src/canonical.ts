import { createHash } from 'node:crypto';

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export class VerificationProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'VerificationProtocolError';
  }
}

function serialize(value: CanonicalValue): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new VerificationProtocolError(
        'NON_CANONICAL_VALUE',
        'Canonical numbers must be safe integers.',
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  const object = value as { readonly [key: string]: CanonicalValue };
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key.normalize('NFC'))}:${serialize(object[key]!)}`)
    .join(',')}}`;
}

export function canonicalizeV1(value: CanonicalValue): string {
  return serialize(value);
}

export function canonicalizeForAuditV1(fields: readonly CanonicalValue[]): Buffer {
  const parts: Buffer[] = [Buffer.from('votaciones/audit-canonical/v1\0', 'utf8')];
  for (const field of fields) {
    const bytes = Buffer.from(canonicalizeV1(field), 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalDigestV1(domain: string, value: CanonicalValue): string {
  return sha256Hex(canonicalizeForAuditV1([domain.normalize('NFC'), value]));
}

export function canonicalJsonFileV1(value: CanonicalValue): string {
  return `${canonicalizeV1(value)}\n`;
}

export function canonicalJsonLinesV1(values: readonly CanonicalValue[]): string {
  return values.map((value) => canonicalizeV1(value)).join('\n') + (values.length > 0 ? '\n' : '');
}
