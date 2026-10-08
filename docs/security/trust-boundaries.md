# Trust boundaries

```text
Admin Browser -- cookie HttpOnly + CSRF --> Admin API
Voter Browser -- manifest/proof/receipt --> Public Voting API -- trusted registry --> ZK artifacts
                                         |
                                         v
                                      NestJS
                                      /    \
                             PostgreSQL    Valkey (auxiliar)
                                  |
                        immutable/versioned packages
                                  |
                            offline verifier
```

## Reglas por boundary

| Entrada | No confiable | Validación/limitación | Secretos permitidos |
|---|---|---|---|
| Admin browser -> API | cookies, Origin, CSRF, DTO, IDs | auth server-side, origin allowlist, CSRF, DTO whitelist, state machine | password sólo en login/change; nunca logs |
| Voter browser -> API | election ID, protocol, proof, signals | 64 KiB voting body, shape/range/context/root, bounded verification | ninguno; `voterSecret`/path no salen del browser |
| API -> PostgreSQL | parámetros y estado concurrente | queries parametrizadas, constraints, row locks, runtime role | credencial runtime vía secret management |
| API -> Valkey | keys/TTL/cache values | namespace, TTL, fail-open sólo para cache; fail-closed para sesión | sesión opaca hasheada; no credential electoral |
| Registry -> verifier | manifests/VK | versión cerrada y SHA-256 antes de parsear | ninguno |
| CI -> artefactos/imágenes | source/dependencies/actions | frozen lock, scans, digests, permisos read-only | ningún secreto productivo en PRs |

## Red y proxies

PostgreSQL y Valkey permanecen en red privada. Los overlays local/test sólo publican en
`127.0.0.1`; producción debe exponer únicamente el edge. Express ignora `X-Forwarded-*` por defecto.
`HTTP_TRUST_PROXY_ADDRESSES` acepta exclusivamente IP/CIDR del proxy controlado y sólo debe
habilitarse si el acceso directo a la API está bloqueado por red.

El `requestId` es aleatorio/operativo; no se reutiliza un identificador de provisioning en CastVote.
