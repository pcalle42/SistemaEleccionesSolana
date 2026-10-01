import { BN254_SCALAR_FIELD } from './constants.js';

const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/u;

export class ZkProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ZkProtocolError';
  }
}

export function parseFieldElement(value: string, name = 'field element'): bigint {
  if (!CANONICAL_DECIMAL.test(value)) {
    throw new ZkProtocolError(
      'INVALID_FIELD_ELEMENT',
      `${name} must use canonical decimal encoding.`,
    );
  }
  const parsed = BigInt(value);
  if (parsed >= BN254_SCALAR_FIELD) {
    throw new ZkProtocolError(
      'INVALID_FIELD_ELEMENT',
      `${name} is outside the BN254 scalar field.`,
    );
  }
  return parsed;
}

export function encodeFieldElement(value: bigint): string {
  if (value < 0n || value >= BN254_SCALAR_FIELD) {
    throw new ZkProtocolError('INVALID_FIELD_ELEMENT', 'Value is outside the BN254 scalar field.');
  }
  return value.toString(10);
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(length * 8)) {
    throw new ZkProtocolError(
      'INVALID_INTEGER_ENCODING',
      'Integer does not fit the requested width.',
    );
  }
  const output = new Uint8Array(length);
  let remaining = value;
  for (let index = length - 1; index >= 0; index--) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}
