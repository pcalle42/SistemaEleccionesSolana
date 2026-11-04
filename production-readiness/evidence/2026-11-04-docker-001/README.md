# Evidencia Docker local — 2026-11-04

`before-fixes/` conserva las ejecuciones iniciales y el restore bloqueado (exit
143 por SIGTERM). `after-fixes/` contiene la repetición sobre dependencias HTTP
corregidas y el CLI offline corregido, con restore exitoso. Los resultados
incluyen comandos, tiempos y códigos reales; el audit exit 1 permanece como
hallazgo pendiente (2 Moderate, 1 Low), no como prueba pasada.

`source-inputs.json` enumera hashes de los archivos del working tree capturados
para cada etapa, excluyendo production-readiness y archivos ignorados.
`runtime-images.json` registra los IDs de imagen y las versiones HTTP leídas
dentro del contenedor reconstruido. No son un ReleaseManifestV1 aprobado.
Cambios posteriores de informes/inventario no modifican el código electoral.

Los logs `.txt` son los originales con el path local del repositorio reemplazado
por `<repository>`. Los resultados conservan `logSha256` del original privado;
`hashes.v1.json` contiene los hashes de los archivos publicados. No se copian el
dump, credenciales sintéticas ni el paquete con proofs al bundle versionable.
El dump y el paquete usados permanecen en `.artifacts/readiness-2026-11-04-patched/`.
Los metadatos agregados del backup no contienen identidades de votantes.

La integración inicial de 35 tests se observó directamente en la sesión y no
cuenta con log persistido completo. La repetición posterior sí conserva log y
resultado. Los conteos se solapan entre comandos; no sumar como tests únicos.
El build clean-room es una copia limpia de fuentes del working tree, con install
frozen y sin dist/node_modules heredados; no prueba reproducibilidad bit a bit de
imágenes ni instalación desde un commit publicado e inmutable.

Comandos de devnet, con un archivo temporal derivado exclusivamente de
`infra/devnet/.env.example`, `POSTGRES_HOST_PORT=55433`, y
`VOTACIONES_PROJECT_NAME=votaciones-devnet-readiness-20261104`:

```bash
# Build con infra/docker/compose.yml + compose.devnet.yml y ese proyecto/env.
pnpm devnet:bootstrap
pnpm devnet:e2e
pnpm db:backup -- .artifacts/readiness-2026-11-04-patched/synthetic.dump
pnpm db:restore:drill -- .artifacts/readiness-2026-11-04-patched/synthetic.dump .artifacts/readiness-2026-11-04-patched/verification-package
```

El restore usa su propio proyecto `votaciones-test-restore-*` y tmpfs. Comparó
el estado lógico restaurado con el metadata del backup y verificó offline el
paquete exportado; no se reexportó un nuevo package desde la base restaurada.
No se midieron ni aprobaron RPO/RTO/PITR ni capacidad pico del entorno productivo.

Los hashes no sustituyen firma, custodia independiente ni revisión humana. Esta
evidencia local no autoriza una elección real.
