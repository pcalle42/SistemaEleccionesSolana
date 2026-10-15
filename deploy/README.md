# Contrato de despliegue productivo

Este directorio es vendor-neutral. `ProductionProfileV1` une una release inmutable
con la topología, controles y evidencia P1–P8 del entorno que la recibirá.

```bash
cp deploy/production-profile.template.json /ruta/segura/production-profile.json
pnpm production:profile:verify -- --profile /ruta/segura/production-profile.json
```

La plantilla está deliberadamente en estado `pending` y debe fallar. No contiene
secretos. Un perfil real se aprueba por revisión, referencia ADR/evidencia y usa
las mismas referencias de imagen por digest que `ReleaseManifestV1`. El preflight
productivo exige ambos documentos y comprueba que digest de release e imágenes
coincidan.

Los contratos en `contracts/` enumeran flujos de red y nombres de secretos, nunca
valores. La selección de proveedor e IaC se realiza mediante ADR posterior.
