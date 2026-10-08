# Threat model vivo

## Alcance y objetivos

El modelo cubre admin/voter web, API NestJS, PostgreSQL, Valkey, artefactos ZK,
paquetes de verificación, CI e infraestructura contenedorizada. Protege la configuración y padrón
congelados, credenciales privadas, separación identidad-voto, unicidad, votos aceptados, auditoría,
conteo y publicación reproducibles.

## Assets

| Clase | Assets | Impacto principal |
|---|---|---|
| Secretos | password/session admin, `voterSecret`, tokens de activación, credenciales DB/Valkey, claves futuras, entropía de ceremonia | suplantación, voto indebido, pérdida de privacidad |
| Integridad | configuración versionada, root de elegibilidad, registry/VK, nullifiers, votos, audit chain, snapshot final, tally, resultado, package | elección o evidencia manipulada |
| Disponibilidad | API, verificador, PostgreSQL, publicación y artefactos | imposibilidad de votar o verificar |
| Privacidad | identidad administrativa/electoral, IP/timing y material Merkle privado | correlación o revelación de identidad |

Los nullifiers, proofs y resultados pueden ser públicos, pero siguen requiriendo integridad.

## Actores y capacidades

- El atacante externo controla bodies, versiones, proofs, public signals, concurrencia y timing de
  requests. Puede abusar parsers y consumir CPU, pero no se presupone acceso directo a DB.
- Un votante con credential conoce su secreto y puede crear múltiples proofs/opciones. No puede
  cambiar el nullifier para el mismo contexto sin romper el circuito.
- Un admin comprometido puede invocar todas sus facultades legítimas; state machine, freeze y audit
  limitan y evidencian el daño, pero un único admin no aporta four-eyes.
- Un operador de DB/infra con privilegios puede superar controles de aplicación. Sin anchoring
  externo no se garantiza detectar una reescritura interna coherente.
- Un atacante de supply chain puede alterar dependencias, actions, imágenes o artefactos.
- Un dispositivo del votante comprometido puede robar la credential o cambiar la selección antes
  de probarla. CSP no corrige un host totalmente comprometido.

## STRIDE y abuse cases

| Amenaza | Control | Evidencia | Riesgo residual |
|---|---|---|---|
| Spoofing admin | Argon2id, rate limit, sesión opaca/expirable, cookie segura, CSRF | auth unit/integration/E2E | compromiso del dispositivo/admin |
| Credential replay | proof de conocimiento + root/context + nullifier UNIQUE | ZK negative, API replay, PostgreSQL concurrency | credential compartida voluntariamente |
| Tampering de configuración/root | versionado, freeze, state machine, manifest digest, audit | domain/integration/tamper | superuser puede reescribir evidencia interna |
| Fake proof/VK | DTO estricto, registry local, digest y Groth16 verify | ZK/API/artifact tests | bug no descubierto en circuito/verificador |
| Doble voto/cambio de voto | nullifier determinista, UNIQUE y transacción | race tests | disponibilidad bajo ataque sostenido |
| Voto tras cierre | reloj y estado revalidados dentro de transacción | boundary y vote/close/cancel races | drift de reloj operacional |
| Repudiación admin | audit hash-chain/checkpoints sin secretos | audit integration | ausencia de firma/anchoring externo V1 |
| Fuga de secretos | minimización, log allowlist, CSP/storage policy | canary, privacy/browser E2E | malware/observador global |
| Proof DoS | body/proof limits, cheap checks, rate y semaphore local | adversarial/unit/API E2E | DDoS distribuido superior a capacidad |
| Fake totals/resultados | snapshot final, tally determinista, package/verifier | full election/tamper/offline verify | publicación institucional aún no firmada |
| Delete/overwrite vote | sin endpoint, permisos runtime y triggers | DB integration | operador migration/superuser |
| Valkey loss | cache auxiliar; PostgreSQL autoritativo | flush/restart tests | degradación temporal de auth/rate control |
| Supply-chain change | lockfile, digests, audit/secret/container scans | security workflow | compromise upstream o de CI autorizado |

## Revisión

Actualizar este documento ante un nuevo boundary, protocolo, dato sensible, actor privilegiado,
dependencia crítica o incidente. Toda invariancia nueva necesita una prueba o un gate manual explícito.
