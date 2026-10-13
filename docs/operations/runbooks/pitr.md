# Point-in-time recovery

## Síntomas

Se evalúa recuperar a un instante anterior.

## Impacto

Puede excluir votos legítimos posteriores al punto.

## Alertas

Incidente DB/WAL y brecha frente a RPO.

## Checks seguros

Restaurar aislado y comparar WAL, counts, audit y packages.

## Contención y recuperación

Mantener histories separadas hasta decisión formal autorizada.

## Verificación

Invariantes, diferencia de votos y offline verifier documentados.

## Escalamiento

Incident commander, DBA, auditor y autoridad electoral.

## Acciones prohibidas

No usar PITR como rollback de aplicación ni hacer merge automático.

## Evidencia a preservar

Timeline, LSN, punto objetivo, diferencias y aprobaciones.
