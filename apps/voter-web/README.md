# Voter Web

Portal independiente para credencial local, papeleta, proof Groth16, CastVote, receipt y
verificación pública.

```bash
cp apps/voter-web/.env.example apps/voter-web/.env.local
pnpm --filter @votaciones/voter-web dev
```

## Privacidad

- `voterSecret` se genera con Web Crypto y vive en memoria salvo descarga/importación explícita.
- No se usa localStorage, IndexedDB, Service Worker, analytics, CDN ni error reporting externo.
- La activación exporta sólo `identityCommitment`; CastVote envía únicamente protocolo, proof y
  señales públicas.
- Un timeout pasa a `UNKNOWN_OUTCOME`; el retry reutiliza el mismo proof/voto lógico.
- La aplicación no promete anonimato absoluto ni zeroization física de memoria.

## Proof y artefactos

El build copia WASM, zkey, verification key y protocol manifest devnet a una ruta versionada. El
Worker compara protocol/circuit y SHA-256 antes de generar, verifica el proof localmente y sólo
entonces habilita el envío. La generación requiere material de elegibilidad provisionado fuera del
canal de voto; el backend todavía no define un endpoint de activación pública.

Compatibilidad mínima: navegador evergreen con ES2023, Web Crypto, Web Workers, WASM, Blob URLs y
Fetch. En los artefactos actuales: WASM ~2.1 MiB, zkey ~3.5 MiB; los tiempos y memoria dependen del
dispositivo y deben medirse en hardware modesto antes de fijar budgets.

El runtime Docker es no root y aplica CSP sin scripts inline, `worker-src 'self' blob:` y
`script-src 'self' 'wasm-unsafe-eval'`, además de `nosniff`, `no-referrer`, anti-framing y
Permissions Policy restrictiva.
