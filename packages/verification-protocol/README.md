# Verification Protocol V1

Formato público y verificador offline para elecciones `SINGLE_CHOICE` V1. No depende de NestJS ni
de acceso a PostgreSQL. La especificación normativa de bytes es:

- JSON canónico UTF-8, claves ordenadas lexicográficamente, strings NFC, enteros seguros y LF final;
- JSONL con una línea canónica por registro, LF final y votos ordenados por valor numérico del
  nullifier;
- SHA-256 en hexadecimal minúsculo;
- el digest del vote set aplica domain separation sobre los bytes JSONL completos;
- receipts públicos contienen nullifier/commitment, nunca la selección;
- no se incluyen timestamps de aceptación, identidad, credential, commitment de identidad, IP,
  user-agent ni request IDs.

El verifier comienza en `verification-package-manifest.json`. Su lista `files[]` está ordenada por
`logicalPath` e incluye digest y tamaño. `evidenceDigest` identifica los archivos de evidencia sin
`result.json`; de ese modo `result.json` puede referenciar la evidencia sin crear un hash circular.
`packageContentDigest` identifica después el conjunto completo, incluido el resultado.

`tallyDigest` excluye `computedAt`: mismo manifest y mismo conjunto congelado producen el mismo
contenido electoral. `resultContentDigest` cubre counts, opciones congeladas, tally y versión;
`publicationDigest` cubre además timestamp, referencia de evidencia y resultado anterior.

```bash
pnpm verify:election --package ./path/to/verification-package
```

Exit code `0` significa que todos los checks pasaron. Cualquier otro valor indica fallo y el reporte
enumera digests, manifest binding, proofs, unicidad, tally y checkpoints por separado. El package no
afirma autenticidad frente a un operador con control total: esa propiedad requiere publicar los
checkpoints fuera del sistema. V1 tampoco afirma receipt-freeness ni coercion resistance.
