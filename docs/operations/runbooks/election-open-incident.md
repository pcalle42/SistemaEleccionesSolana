# Incidente durante elección OPEN

## Síntomas

Cualquier SEV1/SEV2 mientras la elección acepta votos.

## Impacto

Disponibilidad, integridad, privacidad o confianza electoral.

## Alertas

API, DB, verifier, artifacts, clock, disk y persistence anomaly.

## Checks seguros

Confirmar estado/release y preservar evidencia antes de cambios.

## Contención y recuperación

Fail closed donde peligre correctness; recuperar y evaluar impacto.

## Verificación

Ventana/estado, accepted set, audit, digests y voto sintético aislado.

## Escalamiento

Incident commander y autoridad autorizan continuación o cancelación.

## Acciones prohibidas

No editar votos/nullifiers, revelar tally ni extender automáticamente.

## Evidencia a preservar

Timeline UTC, alerts, release, checkpoints, backups y acciones.
