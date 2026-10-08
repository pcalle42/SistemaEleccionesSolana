# Estrategia de pruebas

Las suites convierten las invariantes electorales, criptográficas, de
persistencia y privacidad en gates reproducibles. PostgreSQL y Valkey usan
contenedores exclusivos; Groth16 usa los artefactos reales de devnet y el E2E
frontend usa Chromium, WASM y Web Worker reales.

## Comandos

```bash
pnpm test:unit
pnpm test:contract
pnpm test:property
pnpm test:integration
pnpm test:valkey
pnpm test:zk
pnpm test:concurrency
pnpm test:e2e
pnpm test:security
pnpm test:verification
pnpm test:performance
pnpm test:all
```

`test:integration`, `test:concurrency`, `test:valkey` y `test:verification`
levantan y detienen su infraestructura automáticamente. La base usa el puerto
`55432`, Valkey `56379` y un proyecto Compose cuyo nombre comienza por
`votaciones-test-`.

## Seguridad destructiva

El guard de `infra/scripts/test-infra.sh` exige simultáneamente:

- `VOTACIONES_ENV=test`;
- nombre PostgreSQL terminado en `_test`;
- URLs sobre `127.0.0.1` y base `_test`;
- proyecto Compose `votaciones-test-*`;
- `--force` para reset.

Una comprobación fallida aborta antes de invocar Docker. Para validar el guard:

```bash
pnpm test:infra:config
pnpm test:infra:reset -- --force
pnpm test:infra:down
```

## Troubleshooting

- Instale Chromium una vez con `pnpm exec playwright install chromium`.
- Compruebe Docker con `docker info` si falla una suite de integración.
- Use `pnpm test:infra:down` para retirar contenedores huérfanos sin tocar local/devnet.
- No cambie los puertos test por `5432/6379`: la separación es deliberada.
- Los artefactos de navegador están deshabilitados para evitar capturar secretos
  de fixtures. Los logs de CI sólo contienen nombres de pruebas y errores.

La matriz mantenida está en [INVARIANT_MATRIX.md](INVARIANT_MATRIX.md).
