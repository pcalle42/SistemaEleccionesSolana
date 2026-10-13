# Contrato de release

La identidad de una entrega se expresa mediante `ReleaseManifestV1`. El manifest
liga commit, lockfile, toolchain, imágenes OCI por digest, migration set,
protocolos/circuitos, artefactos ZK, evidencia de tests/scans, SBOM y provenance.
Su `manifestDigest` es SHA-256 del JSON canónico excluyendo únicamente el propio
campo `manifestDigest`; el sidecar `.sha256` debe coincidir.

## Comandos

```bash
pnpm ci:validate
pnpm ci:main
pnpm ci:release
pnpm release:migrations:verify
pnpm release:zk:verify -- --classification devnet
pnpm release:manifest -- --version 0.1.0-rc.1 --classification devnet \
  --inputs release/fixtures/devnet-inputs.json --output /tmp/release-manifest.json
pnpm release:verify -- --manifest /tmp/release-manifest.json
```

La fixture usa digests sintéticos y solo prueba el contrato. Un RC oficial usa
digests producidos por Buildx y publicados en GHCR. `latest` está prohibido. Los
tags de versión y `git-<sha>` son inmutables; el workflow aborta si ya existe el
tag de versión.

## Clasificaciones ZK

El registry versionado contiene hoy únicamente el setup `devnet`, marcado
`productionSafe: false`. Un RC productivo falla cerrado hasta incorporar, por
revisión explícita, artefactos de ceremonia aprobada y una entrada
`productionSafe: true`. Ningún workflow genera trusted setup productivo.

## Promoción

`release-candidate.yml` construye una vez y publica imágenes por digest, scans,
SBOM SPDX, provenance in-toto y el manifest. `promote.yml` descarga ese bundle
por run ID y reutiliza los mismos digests; no recompila. Los ambientes GitHub
`staging` y `production` deben existir, y `production` debe exigir reviewers.

No hay proveedor de despliegue seleccionado. Por eso la promoción actual produce
un handoff verificable y ejecuta post-deploy solo cuando se entrega una URL. La
integración futura con cloud debe consumir esos digests, sin cambiar esta cadena.
