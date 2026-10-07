import { cp, mkdir } from 'node:fs/promises';

const source = new URL(
  '../../../packages/zk-protocol/artifacts/anonymous-single-choice-v1/',
  import.meta.url,
);
const manifest = new URL(
  '../../../packages/zk-protocol/manifests/anonymous-single-choice-v1.json',
  import.meta.url,
);
const destination = new URL('../public/artifacts/anonymous-single-choice-v1/', import.meta.url);
await mkdir(destination, { recursive: true });
await Promise.all([
  cp(
    new URL('anonymous-single-choice-v1.wasm', source),
    new URL('anonymous-single-choice-v1.wasm', destination),
  ),
  cp(new URL('devnet-final.zkey', source), new URL('devnet-final.zkey', destination)),
  cp(new URL('verification_key.json', source), new URL('verification_key.json', destination)),
  cp(manifest, new URL('protocol-manifest.json', destination)),
]);
