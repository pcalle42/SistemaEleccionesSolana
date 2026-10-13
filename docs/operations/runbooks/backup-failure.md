# Fallo de backup

## Síntomas

Dump, digest, upload o validación falla.

## Impacto

SEV2 y bloqueo pre-OPEN según política.

## Alertas

Edad/resultado de backup y storage durability.

## Checks seguros

Espacio, permisos, DB health, archive list y sidecars.

## Contención y recuperación

Corregir causa y crear un backup nuevo; ejecutar restore drill.

## Verificación

Digest, metadata, evidencia lógica e invariantes restauradas.

## Escalamiento

DBA, storage y seguridad.

## Acciones prohibidas

No declarar éxito solo porque existe un archivo.

## Evidencia a preservar

Backup ID, digest, errores, duración y restore report.
