# API NestJS

Base HTTP del sistema Votaciones. Esta etapa integra NestJS con PostgreSQL y
Valkey, pero no contiene autenticación, lógica electoral ni procesamiento ZK.

## Requisitos

- Node.js y pnpm en las versiones fijadas por el repositorio.
- Docker para las pruebas de integración y la ejecución con infraestructura.
- Dependencias instaladas con `pnpm install --frozen-lockfile` desde la raíz.

## Configuración

La API carga `infra/<entorno>/.env` y, si no existe, usa la plantilla
`infra/<entorno>/.env.example`. `VOTACIONES_ENV_FILE` permite seleccionar otra
ruta. Los entornos admitidos son `local`, `test`, `devnet` y `production`.

La configuración se valida antes de arrancar y se expone internamente mediante
inyección de dependencias. Las variables propias del servidor son:

| Variable                  | Valor local                 | Descripción                                 |
| ------------------------- | --------------------------- | ------------------------------------------- |
| `APP_HOST`                | `127.0.0.1`                 | Interfaz de escucha                         |
| `APP_PORT`                | `3000`                      | Puerto HTTP                                 |
| `HTTP_BODY_LIMIT_BYTES`   | `262144`                    | Límite global de body, entre 1 KiB y 2 MiB  |
| `HTTP_REQUEST_TIMEOUT_MS` | `15000`                     | Timeout HTTP, entre 1 s y 120 s             |
| `HTTP_CORS_ORIGINS`       | orígenes locales explícitos | Allowlist separada por comas; no admite `*` |
| `LOG_LEVEL`               | `debug`                     | Nivel Pino                                  |
| `OPENAPI_ENABLED`         | `true`                      | Swagger UI y documento OpenAPI              |

Producción exige una allowlist CORS no vacía y no habilita OpenAPI por defecto.
Las variables de PostgreSQL y Valkey están en las plantillas de `infra/`. Nunca
se deben imprimir ni versionar URLs con credenciales.

## Ejecución

```bash
pnpm infra:up
pnpm db:migrate
pnpm api:dev
```

Para ejecutar lo compilado:

```bash
pnpm --filter @votaciones/api build
pnpm api:start
```

Las rutas de aplicación futuras usarán `/api/v1`. Health queda deliberadamente
fuera del prefijo.

## Contratos y seguridad HTTP

La aplicación activa validación runtime global con allowlist estricta,
transformación controlada y rechazo de propiedades desconocidas. Los errores
públicos mantienen este contrato:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "requestId": "..."
  }
}
```

El filtro global no devuelve stacks, SQL, rutas internas ni secretos. Cada
request recibe `x-request-id`; solo se reutilizan IDs de cliente con formato
seguro. Pino registra JSON estructurado con método, plantilla de ruta, status,
duración e ID, sin bodies ni cabeceras. También se habilitan headers de
seguridad, CORS por allowlist, límite de body y timeouts.

## Health

```text
GET /health/live
GET /health/ready
```

`live` comprueba solo el proceso. `ready` consulta PostgreSQL y Valkey:
PostgreSQL caído produce `503`; Valkey caído mantiene `200` con estado global
`degraded`, porque Valkey no es fuente de verdad. La respuesta no incluye hosts,
queries ni detalles de conexión.

## OpenAPI

Con `OPENAPI_ENABLED=true`:

- Swagger UI: `http://127.0.0.1:3000/docs`
- JSON: `http://127.0.0.1:3000/docs/openapi.json`

La documentación se genera con la integración oficial de NestJS y no incorpora
configuración runtime ni secretos. Déjela deshabilitada en producción salvo una
decisión operativa explícita.

## PostgreSQL y Valkey

PostgreSQL se inyecta mediante tokens explícitos y su pool se cierra durante el
shutdown. Consulte [`src/database/README.md`](src/database/README.md) para
migraciones, roles, backup y restore.

Valkey se usa solo para datos efímeros reconstruibles. Una falla de conexión no
impide arrancar la API y queda visible como degradación de readiness. Consulte
[`src/valkey/README.md`](src/valkey/README.md) para namespaces, TTLs y políticas.

En el perfil devnet, Valkey pertenece a la red interna de Compose. Una API
ejecutada directamente en el host arrancará, pero mostrará Valkey como
`unavailable`; para integración completa debe ejecutarse dentro de esa red.

## Tests y build

```bash
pnpm --filter @votaciones/api test:unit
pnpm test:e2e
pnpm infra:up
pnpm test:integration
pnpm --filter @votaciones/api typecheck
pnpm --filter @votaciones/api build
```

Los E2E sustituyen únicamente los boundaries de infraestructura. Las pruebas de
integración usan PostgreSQL y Valkey reales y verifican que `app.close()` libere
ambas conexiones. Para reproducir el shutdown por señal, arranque la compilación
con `pnpm api:start`, compruebe health y envíe `SIGTERM` al proceso Node; los
hooks de Nest ejecutan el mismo cierre de recursos.

## Troubleshooting

- **La API aborta al iniciar:** revise el nombre del entorno y los rangos/tipos
  de las variables; el mensaje nunca incluye el valor secreto.
- **Readiness devuelve 503:** ejecute `pnpm db:health`, `pnpm db:status` y revise
  las migraciones.
- **Readiness está degraded:** ejecute `pnpm valkey:health`; en devnet recuerde
  que Valkey no publica un puerto al host.
- **Puerto ocupado:** cambie `APP_PORT` en el `.env` privado del perfil.
- **Swagger devuelve 404:** confirme `OPENAPI_ENABLED=true`; producción lo
  deshabilita por defecto.
