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

```bash
pnpm verify:election --package ./path/to/verification-package
```

Exit code `0` significa que todos los checks pasaron. Cualquier otro valor indica fallo y el reporte
enumera digests, manifest binding, proofs, unicidad, tally y checkpoints por separado. El package no
afirma autenticidad frente a un operador con control total: esa propiedad requiere publicar los
checkpoints fuera del sistema. V1 tampoco afirma receipt-freeness ni coercion resistance.
