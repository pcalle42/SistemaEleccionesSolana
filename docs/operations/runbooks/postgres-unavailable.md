# PostgreSQL indisponible

## Síntomas

Readiness falla y conexiones DB no completan.

## Impacto

SEV1; el voting path debe fallar cerrado.

## Alertas

DB availability, pool, latencia y errores.

## Checks seguros

Estado del primary, red, TLS, storage, locks y credenciales sin imprimirlas.

## Contención y recuperación

Detener tráfico de voto; seguir failover/recovery aprobado.

## Verificación

Schema compatible, evidencia lógica, audit y votos committed.

## Escalamiento

DBA, seguridad e incident commander.

## Acciones prohibidas

No promover una copia antigua ni usar Valkey como fuente.

## Evidencia a preservar

WAL position, backup ID, release, timeline y logs sanitizados.
