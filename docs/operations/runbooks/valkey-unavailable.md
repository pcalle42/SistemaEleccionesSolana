# Valkey indisponible

## Síntomas

Readiness degradada y cache/rate limit temporal no disponible.

## Impacto

SEV2/SEV3; PostgreSQL continúa autoritativo.

## Alertas

Valkey health, errores, conexiones, memoria y evictions.

## Checks seguros

Ping, recursos, red y logs sin inspeccionar payload electoral.

## Contención y recuperación

Reiniciar/recrear Valkey y reconstruir cache desde PostgreSQL.

## Verificación

Health healthy y `valkey:verify:loss` sin pérdida durable.

## Escalamiento

Operación si la degradación persiste durante `OPEN`.

## Acciones prohibidas

No reconstruir votos desde cache ni vaciar DB PostgreSQL.

## Evidencia a preservar

Ventana de caída, comandos operativos y métricas agregadas.
