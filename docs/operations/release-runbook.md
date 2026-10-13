# Runbook de release y promoción

## 1. Preparar el candidato

1. Confirmar `main` verde y sin tests críticos flaky conocidos.
2. Actualizar `release/app-version.json`, release notes y compatibility matrix.
3. Clasificar toda migration nueva en `release/migrations/registry.v1.json`.
4. Si cambia el circuito, crear nueva versión y artefactos; nunca reemplazarlos
   bajo una versión existente.
5. Ejecutar `pnpm ci:release` y el clean-room de etapa 17.
6. Lanzar `release-candidate` con `MAJOR.MINOR.PATCH-rc.N`. `devnet` valida el
   mecanismo; `production` exige registry ZK productivo aprobado.

El workflow publica en GHCR las tres imágenes con tag de RC y `git-<sha>`, y
preserva un bundle con manifest, SBOMs, scans y provenance. Una etiqueta/tag
existente no se sobrescribe; cualquier cambio crea un RC nuevo.

## 2. Staging

1. Ejecutar `promote-release` con target explícito `staging` y el run ID del RC.
2. El job descarga el bundle y ejecuta `release:verify` y `release:preflight`.
3. La plataforma futura debe desplegar exactamente `image@sha256`, inyectar
   configuración/secrets runtime y suministrar el digest del manifest a la API.
4. Ensayar migraciones con datos sintéticos/sanitizados y roles equivalentes.
5. Ejecutar elección sintética completa sin desactivar proof verification.
6. Ejecutar `release:post-deploy`; archivar el promotion record.

## 3. Producción

Requiere el environment protegido `production` y aprobación humana. Antes de
aprobar deben existir: staging verde, backup/restore readiness, migration plan,
forward-fix, registry ZK productivo y release manifest final. El target nunca se
infiere por defecto.

La API entra en tráfico solo con readiness compatible. No realizar rolling
deployment si old/new no comparten rango de schema y protocolo.

## 4. Rollback y forward-fix

- Volver a una imagen anterior solo si schema y artefactos siguen compatibles.
- Preferir forward-fix para migrations ya aplicadas.
- Restaurar una DB puede eliminar votos posteriores: es DR/incidente, no rollback.
- Nunca borrar votos, reescribir nullifiers ni cambiar el protocolo de una
  elección `OPEN`.
- Una corrección de resultados crea una versión/publicación nueva; conserva la
  historia anterior.

## 5. Fallos

- Test o gate de seguridad fallido: no promover.
- Scanner obligatorio indisponible: gate incompleto, no “cero hallazgos”.
- Registry/artefacto no disponible: no reconstruir ni regenerar para continuar.
- Digest distinto: detener y abrir investigación de supply chain.
- Tag RC existente: incrementar `rc.N`; nunca moverlo.
