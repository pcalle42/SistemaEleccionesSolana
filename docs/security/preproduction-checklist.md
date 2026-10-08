# Gate de preproducción S1–S10

Cada ítem requiere responsable, fecha y enlace a evidencia. Un `BLOCKED` impide producción.

| Gate | Evidencia mínima | Estado de implementación |
|---|---|---|
| S1 Arquitectura | assets, boundaries, adversarios, límites/residuales revisados | automatización/documentos disponibles |
| S2 Identity/Admin | auth negatives, Argon2, sesión/CSRF/rate/authz/audit | suites disponibles |
| S3 Voting | proof real, nullifier UNIQUE, atomicidad, races/replay, sin identity FK | suites disponibles |
| S4 ZK | revisión independiente, negative tests, digests y ceremonia productiva | tests/procedimiento disponibles; revisión/ceremonia BLOCKED hasta release real |
| S5 Data | roles separados, red privada, restore ensayado, política inmutable | controles disponibles; restore productivo BLOCKED hasta ensayo |
| S6 Web | CSP, no terceros, XSS/CORS/cookies/headers/storage | Chromium E2E disponible |
| S7 Supply chain | frozen lock, dependency/secret/container scans, branch/release protection | workflow disponible; protección se configura en GitHub |
| S8 Verification | tally/package/offline verifier/tamper/versiones | suites disponibles |
| S9 Operations | monitoring, time sync, incident/rotation, RPO/RTO y recovery | runbooks disponibles; operación productiva BLOCKED hasta definición |
| S10 Release | todos los anteriores aprobados y evidencia firmada/versionada | BLOCKED por defecto |

## Bloqueadores absolutos

- vulnerabilidad crítica conocida o test crítico fallando;
- artefactos ZK productivos no revisados/verificados;
- restore no ensayado, credenciales default o DB/Valkey público;
- verifier de resultado fallando;
- secreto productivo en repo/image/log;
- branch sin required checks/review o posibilidad de force-push no autorizada;
- CORS wildcard con credentials, proxy no delimitado o reloj sin monitorización.

## Registro de release

Guardar commit/tag, SBOM/scans, digests de imágenes y artefactos, versiones de protocolo/circuito,
resultado de suite, restore drill, configuración pública no secreta, aprobaciones y riesgos aceptados.
