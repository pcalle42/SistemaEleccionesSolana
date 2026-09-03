# Infraestructura local y devnet

Esta etapa ejecuta únicamente PostgreSQL y Valkey mediante Docker Compose. Las
aplicaciones, migraciones, seeds, circuitos y componentes Solana se incorporarán
en etapas posteriores.

## Versiones fijadas

| Servicio   | Imagen                            |
| ---------- | --------------------------------- |
| PostgreSQL | `postgres:17.11-alpine3.23`       |
| Valkey     | `valkey/valkey:8.1.10-alpine3.24` |

Los archivos Compose incluyen además el digest multi-arquitectura comprobado al
implementar esta etapa. Las imágenes publican variantes `amd64` y `arm64`.

PostgreSQL usa un volumen nombrado persistente. Valkey es deliberadamente
efímero: no tiene volumen, snapshots ni AOF porque todavía no almacena estado
electoral y nunca debe ser la fuente de verdad.

## Modos

### Local

- proyecto Compose: `votaciones-local`;
- PostgreSQL: `127.0.0.1:5432` por defecto;
- Valkey: `127.0.0.1:6379` por defecto;
- credenciales conocidas y exclusivamente locales;
- red interna de servicios y una red de acceso local separada;
- volumen: `votaciones-local_postgres_data`.

Los puertos pueden cambiarse creando `infra/local/.env` a partir de
`.env.example`. Ese archivo está ignorado por Git.

### Devnet

- proyecto Compose: `votaciones-devnet`;
- PostgreSQL y Valkey solo son accesibles desde `votaciones-devnet_internal`;
- no publica puertos al host;
- credenciales conocidas y exclusivamente de integración;
- volumen: `votaciones-devnet_postgres_data`.

Devnet no está endurecido para exposición a internet y no puede tratarse como
producción cambiando únicamente variables.

## Comandos local

```bash
pnpm infra:config
pnpm infra:up
pnpm infra:status
pnpm infra:smoke
pnpm infra:verify:persistence
pnpm infra:logs
pnpm infra:logs -- postgres
pnpm infra:down
pnpm infra:reset -- --force
```

`infra:down` conserva PostgreSQL. `infra:reset` destruye el volumen del proyecto,
recrea los servicios y requiere `--force`.

## Comandos devnet

Los equivalentes usan el prefijo `devnet`, por ejemplo:

```bash
pnpm devnet:config
pnpm devnet:up
pnpm devnet:smoke
pnpm devnet:verify:persistence
pnpm devnet:down
pnpm devnet:reset -- --force
```

## Configuración personalizada

Los scripts usan la plantilla segura del entorno cuando no existe un `.env`
local. Para sobrescribir valores:

```bash
cp infra/local/.env.example infra/local/.env
```

También aceptan:

- `VOTACIONES_ENV_FILE`: ruta de un archivo de entorno alternativo;
- `VOTACIONES_PROJECT_NAME`: nombre aislado que debe comenzar por
  `votaciones-local` o `votaciones-devnet` según corresponda;
- `VOTACIONES_HEALTH_TIMEOUT`: espera máxima de health en segundos.

No se debe commitear ningún `.env` real.

## Persistencia y reset

`verify-persistence.sh` crea una tabla estrictamente infraestructural, detiene
Compose sin borrar volúmenes, vuelve a levantarlo, verifica el marcador y elimina
la tabla. No crea esquema de aplicación.

El reset:

1. valida Docker, entorno y prefijo del proyecto;
2. rechaza cualquier ejecución sin `--force`;
3. ejecuta `compose down --volumes --remove-orphans` solo para ese proyecto;
4. recrea los servicios y espera sus health checks.

Los datos eliminados por reset no son recuperables salvo que exista un backup.
Los procedimientos formales de backup/restore pertenecen a la etapa 04.

## Logs

Los dos servicios usan el driver `json-file`, rotación de 10 MiB y un máximo de
tres archivos. `infra:logs` devuelve las últimas 200 líneas y puede limitarse a
`postgres` o `valkey`.

## Troubleshooting

### Docker no disponible

Ejecute `docker info`. Los scripts fallan antes de cambiar el entorno si el daemon
no responde.

### Puerto ocupado

Local publica puertos solo sobre loopback. Copie `infra/local/.env.example` a
`infra/local/.env`, cambie `POSTGRES_HOST_PORT` o `VALKEY_HOST_PORT` y vuelva a
ejecutar `pnpm infra:up`.

### PostgreSQL unhealthy

```bash
pnpm infra:status
pnpm infra:logs -- postgres
```

Compruebe espacio disponible y que el volumen corresponda a PostgreSQL 17. No
cambie el major de imagen sobre un volumen existente.

### Valkey unhealthy

```bash
pnpm infra:status
pnpm infra:logs -- valkey
```

Valkey es efímero en esta etapa; reiniciarlo no debe afectar estado durable.

### Recreación completa

Use `pnpm infra:reset -- --force`. La eliminación manual de volúmenes debe ser el
último recurso y solo puede apuntar al nombre exacto mostrado por
`docker volume ls --filter name=votaciones-local`.
