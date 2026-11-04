# Revisión con Docker — 2026-11-04

**NO-GO para elecciones reales.** Docker 29.5.3 permitió avanzar los ensayos locales.
Esta revisión amplía el informe inicial; no sustituye auditoría independiente,
ceremonia productiva, pentest ni aprobación P1–P8.

Se usaron datos sintéticos y el proyecto aislado
`votaciones-devnet-readiness-20261104`, con PostgreSQL en 55433. Las suites usan
`votaciones-test-default` en 55432/56379. No se restauraron datos sobre devnet,
local ni producción: el restore se ejecuta en un PostgreSQL separado sin puertos
publicados y con datos en tmpfs.

| Verificación                              | Resultado observado                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Integración PostgreSQL/Valkey             | 35 pruebas pasaron antes y después de las correcciones                                             |
| Suite de concurrencia inicial             | 24 pruebas pasaron; este subconjunto también está en integración                                   |
| Valkey y recuperación de caché            | 6 pruebas y ensayo de reinicio pasaron antes y después                                             |
| Verificación inicial                      | 1 escenario real de proof → freeze → tally → package → publicación pasó                            |
| ZK inicial                                | 8 pruebas pasaron y artifacts devnet verificados                                                   |
| Seguridad tras correcciones               | 20 pruebas de política, 34 de contrato, 24 API E2E y 2 Chromium pasaron                            |
| Contratos de producción tras correcciones | 10 pruebas pasaron                                                                                 |
| Copia limpia tras correcciones            | Install frozen, build, verificación ZK y build de imágenes frontend pasaron                        |
| Devnet tras correcciones                  | Voto conectado, publicación, reinicios de API/Valkey/PostgreSQL y verificación offline pasaron     |
| Restore aislado tras correcciones         | Backup con votos, restore en tmpfs, invariantes, comparación de digests y verifier offline pasaron |

Los conteos se solapan: no representan una suma de casos únicos. El navegador
normal usa rutas API interceptadas y prueba WebCrypto/WASM/Worker reales,
UNKNOWN_OUTCOME, privacidad y headers. El navegador devnet adicional cruza la API
real y PostgreSQL real. Ninguno acredita WCAG 2.2 AA completo ni pentest.

Se corrigieron dos hallazgos:

- `body-parser` 2.3.0 → 2.4.0 y `multer` 2.4.0 → 2.5.0 resuelven los dos avisos
  High del escaneo inicial. También se actualizó `qs` 6.16.0 → 6.16.1 por su aviso
  Moderate. Se fijaron overrides y lockfile, conservando protocolo y circuito.
  Referencias: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828),
  [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) y
  [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).
- El CLI offline reportaba `valid: true` pero quedaba vivo por workers de
  snarkjs, bloqueando el restore. Ahora termina tras vaciar stdout con el código
  correspondiente. La integración ejecuta un subproceso con proof real y exige
  éxito acotado para paquete válido y exit 1 para paquete alterado. El intento
  anterior se detuvo con SIGTERM y se conserva como ejecución fallida, no PASS.

El escaneo posterior `pnpm audit --prod --json` retorna **1**, porque todavía
reporta **2 Moderate y 1 Low**, aunque ya no reporta Critical/High. Son dos rutas
transitivas de `minimatch` y una de `elliptic`. No se creó excepción ni aceptación
de riesgo; permanecen en el registro. El escaneo no demuestra alcanzabilidad ni
sustituye análisis de seguridad. No se forzó un salto incompatible de major en
minimatch ni un cambio criptográfico para ocultar avisos.

Evidencias finales: [bundle Docker](evidence/2026-11-04-docker-001/README.md).
Se separan las fuentes y ejecuciones anteriores y posteriores a las correcciones.
Los hashes detectan alteraciones accidentales; no prueban custodia independiente.
Los logs publicados sustituyen solo el path local del repositorio por
`<repository>` y conservan el hash del original en el inventario.

Continúan pendientes: trazabilidad exhaustiva de 00–20, auditoría de constraints,
ceremonia productiva/revisión independiente, pentest, proveedor/TLS/IAM/secrets,
capacity con pico y margen, PITR/RPO/RTO aprobados y handoff. Los ensayos locales
no son el simulacro aprobado de un release productivo inmutable. No se emite un
`ElectionRehearsalReportV1` con un releaseManifestDigest ficticio.

El backup restaurado contiene 6 votos aceptados y 7 elecciones sintéticas. Los tiempos de backup/restore observados son locales y no constituyen un RTO aprobado. El cierre adicional pasó typecheck y 100 unit tests. Un test del inventario necesitó actualizar su fixture negativo para eliminar explícitamente las referencias de evidencia, que ahora existen; su repetición final se registra separadamente.
