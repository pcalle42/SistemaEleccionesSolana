# Error rate alto

## Síntomas

Aumentan 5xx o rechazos fuera del baseline.

## Impacto

SEV1/SEV2 durante `OPEN` según clase.

## Alertas

Status/result/reason classes agregadas.

## Checks seguros

Correlacionar release, dependencies y route template, nunca IDs.

## Contención y recuperación

Detener rollout y aplicar forward-fix o rollback compatible.

## Verificación

Rates normales y elección sintética verificada.

## Escalamiento

Incident commander, servicio afectado y seguridad.

## Acciones prohibidas

No relajar validación ni registrar payloads para depurar.

## Evidencia a preservar

Series agregadas, release, alertas y logs sanitizados.
