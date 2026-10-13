# Digest de artefacto no coincide

## Síntomas

Registry, package o verification key no coincide con su digest.

## Impacto

SEV1 de integridad; readiness/release falla cerrado.

## Alertas

Artifact verification y package verifier.

## Checks seguros

Comparar registry, manifest, storage y release sin modificar archivos.

## Contención y recuperación

Aislar copia, restaurar exactamente el objeto aprobado por digest.

## Verificación

ZK registry, manifest y offline verifier completos.

## Escalamiento

Seguridad, criptografía y custodio de artefactos.

## Acciones prohibidas

No reemplazar contenido bajo la misma versión ni aceptar mismatch.

## Evidencia a preservar

Objetos aislados, hashes, origen, release y accesos.
