# Pruebas E2E

La suite transversal usa Chromium real para `admin-web` y `voter-web`. El flujo
del votante ejecuta Web Crypto, descarga y valida artefactos, genera un proof
Groth16 en Web Worker, lo verifica localmente, inspecciona el payload `CastVote`
y recupera un resultado desconocido mediante retry.

```bash
pnpm exec playwright install chromium
pnpm test:browser
```

No se guardan trace, video ni screenshots porque podrían contener fixtures
criptográficos. Los valores usados son exclusivamente `TEST ONLY`.
