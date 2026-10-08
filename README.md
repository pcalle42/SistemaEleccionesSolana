# Sistema de Elecciones

Monorepo en construcción para una plataforma electoral verificable con
separación entre identidad y voto.

> Estado: infraestructura local/devnet, backend electoral, elegibilidad,
> protocolo ZK Groth16 V1 y aceptación atómica de votos anónimos. Los artifacts
> ZK actuales son de devnet y este repositorio no debe utilizarse en producción.

## Requisitos

- Node.js 22.22.3 (consulte `.nvmrc`)
- pnpm 10.9.0
- Git

Docker es necesario para la infraestructura y para compilar Circom de forma
reproducible. Solana se incorporará en sus etapas posteriores.

## Instalación

```bash
corepack enable
corepack prepare pnpm@10.9.0 --activate
pnpm install --frozen-lockfile
```

## Validación

```bash
pnpm check
```

También se pueden ejecutar los gates por separado:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

La validación intensiva dispone de suites contract, property, PostgreSQL,
Valkey, ZK, concurrencia, navegador, privacidad y tampering:

```bash
pnpm test:all
```

Consulte [`tests/README.md`](tests/README.md) y la
[`matriz de invariantes`](tests/INVARIANT_MATRIX.md). Las suites con estado usan
infraestructura Docker aislada y protegida contra resets fuera de test.

`pnpm clean` elimina únicamente `dist`, `build`, `coverage` y `.cache` dentro de
los workspaces conocidos. No elimina fuentes, configuración, datos ni artefactos
ZK preservados.

La API técnica puede ejecutarse, después de levantar infraestructura y aplicar
migraciones, con:

```bash
pnpm infra:up
pnpm db:migrate
pnpm api:dev
```

Expone liveness/readiness, OpenAPI, operaciones administrativas y el endpoint público de voto.
Consulte [`apps/api/README.md`](apps/api/README.md) para configuración, contratos,
tests y troubleshooting.

Después de migrar la base, cree la única cuenta administrativa mediante
`pnpm admin:create`. La contraseña se solicita sin eco y no existe credencial
productiva por defecto. Consulte
[`apps/api/src/modules/auth/README.md`](apps/api/src/modules/auth/README.md).

## Infraestructura

PostgreSQL y Valkey pueden levantarse en modo local con:

```bash
pnpm infra:up
pnpm infra:smoke
```

Use `pnpm infra:down` para detenerlos sin borrar PostgreSQL. Consulte
[`infra/README.md`](infra/README.md) para devnet, configuración, persistencia,
logs y reset protegido.

## Persistencia PostgreSQL

La API integra Drizzle ORM sobre `pg`, con un rol administrativo exclusivo para
migraciones y un rol runtime sin privilegios de superusuario. El flujo local es:

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:status
pnpm db:health
pnpm test:integration
```

Los comandos `db:reset`, `db:restore` e `infra:reset` son destructivos y exigen
`--force`. Consulte [`apps/api/src/database/README.md`](apps/api/src/database/README.md)
para configuración, migraciones, pruebas, backup y restore.

## Valkey

Valkey se usa únicamente para cache reconstruible y primitivas temporales de
coordinación. PostgreSQL continúa siendo la fuente de verdad.

```bash
pnpm infra:up
pnpm valkey:health
pnpm test:integration
pnpm valkey:verify:loss
```

Consulte [`apps/api/src/valkey/README.md`](apps/api/src/valkey/README.md) para
namespaces, TTLs y políticas ante indisponibilidad.

## Estructura

- `apps/`: procesos desplegables futuros: API, administración y votación.
- `packages/`: configuración y código estrictamente compartido.
- `packages/zk-protocol/`: protocolo, circuito, scripts, artefactos y pruebas ZK.
- `infra/`: infraestructura de local y devnet.
- `tests/`: escenarios transversales y fixtures ficticios.
- `docs/`: arquitectura, construcción, seguridad, operación y ADRs.

## Documentación rectora

1. [`docs/00-consolidado-arquitectura.md`](docs/00-consolidado-arquitectura.md)
2. [`docs/01-plan-maestro-construccion.md`](docs/01-plan-maestro-construccion.md)
3. [`docs/02-bootstrap-repositorio.md`](docs/02-bootstrap-repositorio.md)
4. [`docs/03-infraestructura-local-devnet.md`](docs/03-infraestructura-local-devnet.md)
5. [`docs/04-postgresql-modelo-persistencia.md`](docs/04-postgresql-modelo-persistencia.md)
6. [`docs/05-valkey-cache-coordinacion.md`](docs/05-valkey-cache-coordinacion.md)
7. [`docs/06-backend-nestjs-base.md`](docs/06-backend-nestjs-base.md)
8. [`docs/07-autenticacion-administrativa.md`](docs/07-autenticacion-administrativa.md)
9. [`docs/08-dominio-electoral.md`](docs/08-dominio-electoral.md)
10. [`docs/09-elegibilidad-identidad-electoral.md`](docs/09-elegibilidad-identidad-electoral.md)
11. [`docs/10-zk-circom-snarkjs.md`](docs/10-zk-circom-snarkjs.md)
12. [`docs/11-protocolo-voto-nullifier-atomicidad.md`](docs/11-protocolo-voto-nullifier-atomicidad.md)

## Zero-knowledge

El protocolo `anonymous-single-choice-v1` usa Groth16/BN254, Poseidon y un árbol
depth-20. Los artefactos actuales son exclusivamente de devnet y proceden de un
setup de una sola parte.

```bash
pnpm zk:verify-artifacts
pnpm --filter @votaciones/zk-protocol test
pnpm zk:benchmark
```

Consulte [`packages/zk-protocol/README.md`](packages/zk-protocol/README.md) para
el protocolo, privacidad, build y trusted setup.

## Votación anónima

La aceptación de voto combina el proof con el contexto congelado, la ventana autoritativa de
PostgreSQL y un `INSERT` con nullifier único. Voto y evidencia hacen commit atómico; un retry
equivalente recupera el mismo receipt. Consulte
[`apps/api/src/modules/voting/README.md`](apps/api/src/modules/voting/README.md).

## Seguridad

No se deben incluir contraseñas, tokens, claves privadas, seed phrases,
keypairs, witnesses, proofs ni datos personales en Git. Los archivos `.env`
reales están ignorados; solo se versionan plantillas con valores ficticios.

## Licencia

La licencia está pendiente de decisión del propietario. Consulte `LICENSE`.
