# Restore aislado

## Síntomas

Se requiere validar o recuperar un backup.

## Impacto

La promoción prematura puede perder votos posteriores.

## Alertas

Restore success/duration e invariantes.

## Checks seguros

Validar digest/metadata y seleccionar entorno aislado sin PII adicional.

## Contención y recuperación

Ejecutar `db:restore:drill`, comparar evidencia y offline verifier.

## Verificación

Schema, nullifiers, audit, result digests y package válido.

## Escalamiento

DBA, auditor e incident commander antes de promover.

## Acciones prohibidas

No sobrescribir el primary como prueba ni fusionar historias automáticamente.

## Evidencia a preservar

Backup ID, comandos, tiempos, digests y reportes.
