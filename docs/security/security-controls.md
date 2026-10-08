# Controles y evidencia

## Aplicación y datos

| Control | Asset/atacante | Implementación | Verificación |
|---|---|---|---|
| Auth y sesión | administración / externo | Argon2id, tokens aleatorios server-side, idle+absolute TTL, revocación, HttpOnly/SameSite/production Secure | `auth*.spec.ts` |
| CSRF y autorización | administración / web malicioso | Origin allowlist, token ligado a sesión y guards en servidor | auth/API/browser E2E |
| Input hardening | API/CPU / externo | ValidationPipe whitelist, DTO estrictos, parsers de field/proof, límites body/proof | malformed/adversarial E2E |
| Verificación acotada | CPU / DoS | rate por señal de red y máximo concurrente configurable medido | `valkey-vote-admission.spec.ts` |
| Proxy boundary | rate/log metadata / externo | confianza desactivada; allowlist IP/CIDR explícita | config unit tests |
| Privacidad de logs | secretos/PII / externo-operador | serializers allowlist y redaction defensiva | logging canary test |
| Persistencia | votos/resultados / app comprometida | roles migration/runtime, constraints, grants/triggers y transacciones | database/voting/audit integration |
| Valkey auxiliar | correctness / caída cache | no contiene verdad electoral | unavailable/TTL/flush/restart tests |
| ZK registry | elección / fake VK | registry local por protocolo+circuito, digest y no input VK | artifact/ZK/API tests |
| Frontend | credential / XSS-supply chain | CSP, sin scripts terceros, Worker/WASM con digest, storage efímero | Chromium E2E |

## Supply chain

- `pnpm-lock.yaml` y `pnpm install --frozen-lockfile` son obligatorios.
- `pnpm.onlyBuiltDependencies` es la allowlist de scripts nativos necesarios; cualquier cambio se
  revisa como seguridad.
- CI ejecuta auditoría de dependencias productivas, Gitleaks y Trivy sobre las dos imágenes web.
- Imágenes base y de datos se fijan; un release registra commit, protocolo y digests de artefactos e
  imágenes. Las acciones externas usan releases versionadas y permisos mínimos.
- PRs de forks/no confiables no usan `pull_request_target` ni reciben secretos productivos.

## Contenedores

Los frontends son multi-stage, ejecutan como `node`, y Compose aplica filesystem read-only,
`cap_drop: ALL` y `no-new-privileges`. No existe `privileged` ni montaje de Docker socket. PostgreSQL
y Valkey requieren escritura en sus áreas de datos/runtime y permanecen en red interna.

## Backups y tiempo

`db:backup` produce y valida un archive; `db:restore` requiere `--force` y prueba el rol runtime.
Antes de producción se fija retención, cifrado, ACL, RPO/RTO y se ejecuta una restauración ensayada.
El host y PostgreSQL requieren sincronización UTC monitorizada y alarma de drift; nunca se corrige
historia electoral en silencio.
