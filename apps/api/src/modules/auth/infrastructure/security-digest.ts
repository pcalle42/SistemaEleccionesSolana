import { createHash } from 'node:crypto';

export function securityDigest(domain: string, value: string): string {
  return createHash('sha256')
    .update(`votaciones:${domain}:v1\0`, 'utf8')
    .update(value)
    .digest('hex');
}
