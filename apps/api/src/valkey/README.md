# Valkey: cache y coordinación efímera

Este módulo es el único boundary de acceso de la API a Valkey. El cliente no se
expone a consumidores: se construye una vez mediante `createValkeyModule` y se
comparte `ValkeyService` durante el ciclo de vida del proceso.

Valkey nunca es fuente de verdad electoral. No almacena primariamente elecciones,
elegibilidad, votos, nullifiers, resultados ni auditoría.

## Configuración

Se admite `VALKEY_URL` (`redis://` o `rediss://`) o la combinación
`VALKEY_HOST`, `VALKEY_PORT`, `VALKEY_USERNAME`, `VALKEY_PASSWORD` y
`VALKEY_DB`. Los timeouts y reintentos están acotados por:

- `VALKEY_CONNECT_TIMEOUT_MS`;
- `VALKEY_COMMAND_TIMEOUT_MS`;
- `VALKEY_MAX_RECONNECT_ATTEMPTS`.

La cola offline y el reenvío de comandos pendientes están desactivados. La
contraseña nunca forma parte de errores emitidos por el módulo. El protocolo se
fija en RESP2 para mantener una superficie compatible con el Valkey actual.

## Namespaces registrados

Todas las keys comienzan por `votaciones:<env>:v1:` y solo pueden construirse
mediante `ValkeyKeyFactory`.

| Namespace                             | Propósito                                              | Fuente de verdad       | TTL        | Política ante fallo                         |
| ------------------------------------- | ------------------------------------------------------ | ---------------------- | ---------- | ------------------------------------------- |
| `auth:login-rate:<subject-digest>`    | Infraestructura futura de rate limiting administrativo | N/A                    | 15 min     | La etapa de auth definirá el rechazo seguro |
| `cache:election-public:<election-id>` | Cache pública reconstruible                            | PostgreSQL             | 30 s       | Fallback a PostgreSQL                       |
| `challenge:temporary:<challenge-id>`  | Challenge temporal single-use                          | Protocolo que lo emita | 5 min      | Fallar la operación que exige challenge     |
| `test:probe:<probe-id>`               | Pruebas de integración y pérdida total                 | N/A                    | 5 s máximo | Solo tests, nunca runtime funcional         |

El subject de rate limiting debe ser un digest hexadecimal de 256 bits; la
factory rechaza email, IP u otra PII cruda. Un cambio incompatible requiere una
nueva versión de prefijo, no un vaciado global.

## Políticas de fallo

- `getOrLoadString`: cache-aside con validador obligatorio; descarta valores que
  no cumplen el formato esperado y, si Valkey falla, consulta la fuente
  autoritativa y marca el resultado como degradado.
- `setTemporary`, `setIfAbsent` y `consumeTemporary`: fallan con
  `ValkeyUnavailableError`; no simulan éxito.
- `consumeTemporary` usa `GETDEL`, por lo que el consumo es atómico.
- `setIfAbsent` usa `SET ... NX EX`; es solo coordinación auxiliar y no puede
  proteger por sí sola un voto, nullifier o cambio de estado electoral.

No existen llamadas runtime a `FLUSHALL`, `FLUSHDB`, `KEYS`, Pub/Sub o Streams.
La prueba de pérdida reinicia el contenedor efímero y reconstruye una key exacta
desde PostgreSQL.

## Observabilidad

`ValkeyObserver` permite observar cambios de conexión y operaciones agregadas con
resultado y latencia. No recibe keys, valores, challenges, sujetos ni
credenciales. El consumidor decide cómo integrar esas métricas en la etapa de
observabilidad.

## Comandos

```bash
pnpm infra:up
pnpm valkey:health
pnpm test:integration
pnpm valkey:verify:loss
```
