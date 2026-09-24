# Sistema de Elecciones

Monorepo en construcción para una plataforma electoral verificable con
separación entre identidad y voto.

> Estado: infraestructura local/devnet, persistencia PostgreSQL y boundary
> efímero Valkey. Todavía no existe un flujo electoral funcional ni este
> repositorio debe utilizarse en producción.

## Requisitos

- Node.js 22.22.3 (consulte `.nvmrc`)
- pnpm 10.9.0
- Git

Docker es necesario para ejecutar la infraestructura. Circom y Solana se
incorporarán y documentarán en sus etapas correspondientes.

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

`pnpm clean` elimina únicamente `dist`, `build`, `coverage` y `.cache` dentro de
los workspaces conocidos. No elimina fuentes, configuración, datos ni artefactos
ZK preservados.

No existe todavía un comando `dev`: las aplicaciones aún no son ejecutables.

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
- `zk/`: circuitos, scripts, artefactos y pruebas ZK.
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

## Seguridad

No se deben incluir contraseñas, tokens, claves privadas, seed phrases,
keypairs, witnesses, proofs ni datos personales en Git. Los archivos `.env`
reales están ignorados; solo se versionan plantillas con valores ficticios.

## Licencia

La licencia está pendiente de decisión del propietario. Consulte `LICENSE`.
