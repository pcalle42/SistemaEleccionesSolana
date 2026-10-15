# Runbook de despliegue productivo

1. Confirmar ventana fuera de `OPEN`, operador, incident commander y target.
2. Aprobar y verificar `ReleaseManifestV1` de clasificación `production`.
3. Verificar `ProductionProfileV1`; debe coincidir manifest e imágenes por digest.
4. Confirmar backup/restore, RPO/RTO, reloj, capacidad, alertas y on-call.
5. Verificar registry/VK/artifacts `productionSafe` por digest.
6. Ejecutar migration job con identidad DDL separada; API no recibe esa credencial.
7. Desplegar exactamente `image@sha256`, con secrets inyectados en runtime.
8. Esperar liveness/readiness antes de habilitar tráfico.
9. Ejecutar smoke no destructivo y comprobar versión/manifest digest.
10. Habilitar tráfico progresivamente, observar errores/latencia/saturación.
11. Registrar actor, tiempo UTC, profile, digests, migraciones y resultado.

Comandos de contrato:

```bash
pnpm release:verify -- --manifest <ReleaseManifestV1.json>
pnpm production:profile:verify -- --profile <ProductionProfileV1.json>
pnpm release:preflight -- --target production --manifest <manifest> \
  --production-profile <profile> --backup-status <evidence> \
  --migration-plan <evidence>
pnpm release:post-deploy -- --base-url <https-api> \
  --expected-version <semver> --expected-manifest-digest <sha256>
```

Rollback solo usa imagen compatible aprobada; cambios DB siguen forward-fix o el
plan ensayado. Nunca restaura una DB antigua sobre votos nuevos ni cambia artifacts
silenciosamente. Emergency deploy sigue incident runbook y preserva evidencia.
