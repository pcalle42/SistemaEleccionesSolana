# ADR 0002 — SBOM, provenance y firma de releases

## Estado

Aceptado.

## Decisión

- Generar un SBOM SPDX JSON por imagen con Syft/Anchore en el workflow RC.
- Generar provenance compatible con in-toto/SLSA que liga commit, lockfile,
  manifest e imágenes.
- Retener bundle RC 90 días y promotion records 365 días.
- No firmar aún imágenes/manifests: no existe key management aprobado.

Cuando exista OIDC/keyless signing o un KMS institucional, una ADR posterior
definirá identidad, trust root, rotación, verificación y respuesta a compromiso.
CI nunca generará una private signing key improvisada.
