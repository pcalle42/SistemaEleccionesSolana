# Pruebas E2E

La suite transversal usa Chromium real para `admin-web` y `voter-web`. El flujo
del votante ejecuta Web Crypto, descarga y valida artefactos, genera un proof
Groth16 en Web Worker, lo verifica localmente, inspecciona el payload `CastVote`
y recupera un resultado desconocido mediante retry.

```bash
pnpm exec playwright install chromium
pnpm test:browser
```

El escenario conectado al stack Docker real se ejecuta desde un devnet
inicializado:

```bash
pnpm devnet:bootstrap
pnpm devnet:e2e
pnpm devnet:verify
```

`tests/browser-devnet/connected.e2e.spec.ts` usa un navegador administrativo y
otro de votante contra la API real. El runner posterior cubre proofs reales,
retry/doble voto, proof inválido, voto tardío, conteo, package, tamper y reinicios.
Cada ejecución usa elección y credenciales sintéticas únicas; estas últimas se
revocan al terminar.

No se guardan trace, video ni screenshots porque podrían contener fixtures
criptográficos. Los valores usados son exclusivamente `TEST ONLY`.
