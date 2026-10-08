# Matriz de invariantes ejecutables

| Invariante                                                    | Suite y evidencia                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Solo `OPEN` acepta voto y la ventana es `[opensAt, closesAt)` | unit election/cast-vote, PostgreSQL voting integration y API E2E               |
| Una credencial deriva commitment/nullifier deterministas      | ZK protocol y golden vector V1                                                 |
| Un nullifier produce como máximo un voto                      | PostgreSQL concurrency con ocho conexiones lógicas concurrentes                |
| Retry lógico devuelve el mismo receipt                        | voting integration, API E2E y browser unknown-outcome                          |
| Votos distintos con el mismo nullifier no revelan selección   | voting integration y API E2E                                                   |
| Vote vs close/cancel tiene un orden único                     | PostgreSQL voting integration con row lock real                                |
| Proof ligado a elección, root, encoding y versión             | ZK negative tests y API replay E2E                                             |
| Voto y evidencia son atómicos                                 | PostgreSQL rollback por fallo de evidencia                                     |
| `accepted_votes` no relaciona identidad                       | guard estructural de columnas PostgreSQL y privacy browser E2E                 |
| Valkey no es autoridad                                        | Valkey integration: unavailable, TTL, flush y restart con recarga autoritativa |
| Snapshot, tally y publicación son únicos/idempotentes         | verification integration concurrente                                           |
| Tally es determinista, total y no negativo                    | verification unit + fast-check property suite                                  |
| Audit append es secuencial y obligatorio                      | audit PostgreSQL concurrency/rollback                                          |
| Package alterado no se publica                                | verification tamper integration y verifier offline                             |
| Frontend no persiste secretos ni contacta terceros            | Chromium storage/origin/privacy E2E                                            |
| XSS, CSP, CSRF, CORS y headers permanecen activos             | Chromium admin/voter y API security E2E                                        |

Cuando se añade una invariancia crítica debe agregarse aquí la prueba que falla
si la propiedad se elimina.
