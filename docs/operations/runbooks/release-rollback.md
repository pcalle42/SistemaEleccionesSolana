# Rollback de release

## Síntomas

El release actual produce degradación o fallo.

## Impacto

Variable; puede afectar disponibilidad o compatibilidad.

## Alertas

Error/latency, readiness, schema y artifact mismatch.

## Checks seguros

Verificar compatibilidad DB/protocolo y digest de imagen anterior.

## Contención y recuperación

Promover imagen anterior solo si sigue compatible; preferir forward-fix.

## Verificación

Readiness, versión, votos existentes y package verifier.

## Escalamiento

Release approver, DBA e incident commander.

## Acciones prohibidas

No revertir DB sobre votos nuevos ni cambiar protocolo de elección abierta.

## Evidencia a preservar

Manifests, digests, migration status, decisiones y tiempos.
