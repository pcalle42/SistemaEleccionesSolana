const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: string | Uint8Array): Promise<string> {
  const input = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer)));
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export function canonicalize(value: CanonicalValue): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('NON_CANONICAL_VALUE');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as { readonly [key: string]: CanonicalValue };
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(object[key]!)}`)
    .join(',')}}`;
}

export async function canonicalDigest(domain: string, value: CanonicalValue): Promise<string> {
  const fields = [domain.normalize('NFC'), value] as const;
  const parts: Uint8Array[] = [encoder.encode('votaciones/audit-canonical/v1\0')];
  for (const field of fields) {
    const bytes = encoder.encode(canonicalize(field));
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length);
    parts.push(length, bytes);
  }
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return sha256Hex(combined);
}
