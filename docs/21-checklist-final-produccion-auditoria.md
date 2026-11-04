# 21 — Checklist Final de Producción y Auditoría

**Proyecto:** Votaciones  
**Etapa:** 21/21  
**Audiencia:** Codex, seguridad, auditoría y operaciones  
**Dependencias:** Documentos 00–20

## 1. Propósito y alcance

Este documento cierra el plan maestro 00–21 del sistema Votaciones. No agrega arquitectura nueva: valida mediante evidencia la implementación, seguridad, privacidad, verificabilidad, operación y aptitud de un release para una elección real. **Sin evidencia no hay PASS.** Los estados de cada control son PASS, FAIL, NOT_TESTED, NOT_APPLICABLE (justificado) y RISK_ACCEPTED (con aprobación explícita; nunca para invalidar una propiedad electoral fundamental).

## 2. Matriz de trazabilidad

Crear `TraceabilityMatrixV1` con `requirementId`, `sourceDocument`, `requirement`, `criticality`, `implementationRefs`, `testRefs`, `evidenceRefs`, `status`, `owner`, `notes`. Usar IDs estables DOM, ELG, ZK, VOTE, AUD, RES, UI, SEC, OPS, INF. Todo requisito crítico exige referencias reales a código, pruebas y evidencia y estado PASS. No aceptar declaraciones verbales como evidencia.

## 3. Invariantes electorales

Verificar que solo OPEN dentro de `[opensAt, closesAt)` permite votar; CLOSED, CANCELLED y RESULTS_PUBLISHED no regresan a OPEN; READY congela configuración y OPEN mantiene inmutables versión, opciones, encoding, snapshot, root y protocolo. Probar carreras CastVote/Close/Cancel con transacciones PostgreSQL reales y resultados deterministas. No permitir mutación silenciosa de votos aceptados.

## 4. Elegibilidad y privacidad estructural

`voterSecret` debe originarse en CSPRNG y no derivarse de PII. No persistirlo en plaintext en backend ni logs. Congelar snapshot Merkle determinista, sin leaves duplicadas. `accepted_votes` no debe tener FK a persona, credential ni snapshot member, ni guardar commitment, leaf index o IP. Separar provisioning de CastVote, incluso en trazas y sesiones.

## 5. Criptografía ZK

Revisar `AnonymousSingleChoiceVoteV1`: Poseidon, Merkle membership, booleanidad de path indices, dominio de commitment y nullifier, electionContext, rango de voteChoice, señales públicas/privadas, ausencia de underconstraints y aliasing. Comparar vectores entre Circom, TypeScript, navegador, backend y verificador offline. Probar secret/path/root/context/opción/VK/proof alterados, y replay entre elecciones. Verificar digests de fuentes, R1CS, WASM, zkey, verification_key.json y manifest. Backend usa únicamente verification keys confiables del registro interno.

## 6. Setup Groth16 productivo

Ningún artifact devnet puede promoverse a producción. Documentar fuente de Powers of Tau, fase 2, contribuciones/procedimiento, artifact final, hashes, verificación de la ceremonia y revisión independiente. No conservar toxic waste. Un cambio de circuito que invalide setup o revisión bloquea GO hasta repetirlos y versionar artifacts.

## 7. Protocolo de voto y atomicidad

CastVote valida esquema y tamaño, verifica proof y revalida elección/root/context/ventana dentro de transacción breve. PostgreSQL impone `UNIQUE(election_id, protocol_version, nullifier)` o equivalente aprobado. Reintento del mismo voto lógico retorna recibo consistente; mismo nullifier con selección diferente rechaza sin revelar selección anterior. Probar timeout posterior al commit, concurrencia real y caída de DB. No bufferizar votos en Valkey, memoria ni archivos.

## 8. Auditoría y verificación pública

Verificar audit chain (`sequence`, `previousHash`, `eventHash`, canonicalización), checkpoints, manifest electoral, artifacts publicados y verificador offline independiente. Probar detección de omisiones, duplicados, alteraciones, sustitución de artifacts, resultados y checkpoints. Documentar límite de una hash chain dentro de una DB controlada por un operador privilegiado. No afirmar inmutabilidad absoluta sin anclaje externo.

## 9. Conteo y publicación

El conteo deriva exclusivamente del set final de accepted_votes congelado después de CLOSED. Debe ser determinista: suma de opciones igual a total aceptado; digest reproducible; zero votes válido; empates sin inventar ganador. Publicación requiere generación, verificación, almacenamiento inmutable, comprobación de digests y transición RESULTS_PUBLISHED. Correcciones generan nueva versión sin sobrescribir la anterior.

## 10. Frontends

Confirmar aislamiento de admin-web/voter-web, WebCrypto CSPRNG, generación real de prueba ZK en navegador/Web Worker, validación de manifests/artifact digests, manejo de UNKNOWN_OUTCOME y retry seguro, recibo sin voterSecret, CSP, CSRF admin y accesibilidad WCAG 2.2 AA como objetivo. Prohibidos analytics de terceros en el flujo del votante.

## 11. Pruebas y seguridad

Exigir unit, contract, integration, PostgreSQL real, Valkey, ZK, property-based, concurrencia, browser E2E, privacidad, adversarial, tamper, clean-room devnet, restore y carga. No usar SQLite ni mocks como prueba final de propiedades transaccionales o criptográficas. Threat model actualizado, revisión de auth/session/CSRF, límites HTTP, roles DB, contenedores non-root, supply chain, scans y pruebas canary de logs. Pentest independiente apropiado: auth, authz, XSS, CORS, CSRF, rate limiting, APIs, artifacts y despliegue. Critical abierto es NO-GO; High relevante abierto es NO-GO por defecto.

## 12. Infraestructura y operación

Exigir gates P1–P8 del documento 20: topología, TLS/DNS con certificados reales, PostgreSQL privado y autoridad, Valkey auxiliar, artifacts confiables, secrets manager, IAM/MFA, observabilidad, capacity, release y readiness de elección. Backup probado mediante restore aislado, validación de invariantes y verificador offline. PITR/RPO/RTO decididos, drift horario monitoreado, runbooks SEV1/SEV2 y game day completado. Nunca restaurar DB vieja sobre votos nuevos como rollback rutinario.

## 13. Capacidad y simulacro electoral

Benchmark del release candidato exacto para proof generation/verification, throughput de CastVote, commits DB, publicación y backup/restore. Probar pico esperado con margen y saturación controlada. Ejecutar elección sintética integral: deploy, admin, elegibilidad, freeze, READY, OPEN, votos válidos, duplicados, proofs inválidos, carreras, CLOSED, COUNTING, tally, package, verificación offline, publicación, inclusión de recibo, backup y restore. Inyectar reinicio API/Valkey, timeout post-commit y artifact mismatch. Emitir `ElectionRehearsalReportV1` con digests, métricas y hallazgos.

## 14. Riesgos residuales y límites V1

Crear `RiskRegisterV1` con ID, propiedad, severidad, probabilidad cualitativa, mitigación, evidencia, responsable y decisión. Explicar que V1 permite al backend conocer la selección anónima en claro; no garantiza secreto de papeleta frente al backend, coercion resistance, receipt-freeness ni anonimato de red global. Administración/provisioning puede conocer persona→commitment. La auditoría hash en una sola DB no evita reescritura por administrador total. Evaluar estas limitaciones contra requisitos jurídicos y electorales antes de GO.

## 15. GO / NO-GO / INCOMPLETE

**GO** solo con invariantes críticos PASS, trazabilidad completa, revisión ZK independiente, setup productivo verificable, pentest sin Critical ni High relevantes abiertos, P1–P8 PASS, restore y offline verifier PASS, capacity PASS, simulacro PASS, release inmutable aprobado y handoff operativo. **NO-GO** ante nullifier duplicable, replay entre elecciones, voto fuera de ventana, vínculo identidad-voto, tally irreproducible, package no verificable, filtración crítica, artifacts devnet, certificados/secretos inseguros, capacidad insuficiente o release distinto del probado. **INCOMPLETE** si faltan tareas humanas o externas: pentest, auditoría, ceremonia, proveedor, certificados o ensayos. Nunca fabricar evidencia.

## 16. Registro de decisión y evidencias

Crear `GoNoGoRecordV1`: schemaVersion, releaseVersion, releaseManifestDigest, protocolVersions, criticalGateSummary, traceabilityDigest, securityReviewRefs, zkReviewRefs, pentestRefs, restoreTestRef, capacityTestRef, rehearsalRef, residualRiskRegisterDigest, decision, decisionReason, decidedAt, decisionAuthority. Guardar un bundle `production-readiness/` con matriz, release manifest, hashes, ceremony record, auditorías, pentest, reportes de carga, restore, rehearsal y riesgos. No incluir PII ni secretos. Decisiones y versiones históricas no se sobrescriben.

## 17. Readiness por elección

Cada elección real requiere `ElectionReadinessRecordV1`: electionId, configurationVersion, snapshotVersion, merkleRoot, protocolVersion, circuitVersion, manifestDigest, artifactDigests, releaseManifestDigest, opensAt, closesAt, readinessChecks, decision y decidedAt. La aprobación del software no aprueba automáticamente cada elección.

## 18. Documentación y handoff

Actualizar README, índice de arquitectura, docs 00–21, ADR, schemas, guías, runbooks, deployment, backup/restore, incident response, verification guide, limitaciones y release notes. Operadores deben conocer alertas, pre-OPEN, OPEN, close/count/publish, escalamiento y acciones prohibidas: edición manual de votos, borrado de nullifiers, overwrite de resultados, reemplazo de artifacts ZK o extensión improvisada de ventana.

## 19. Orden de ejecución para Codex

1. Leer 00–20 y revisar código real. 2. Construir matriz de trazabilidad. 3. Ejecutar suites y registrar comandos/reportes. 4. Auditar invariantes y límites. 5. Verificar artifacts/digests/release. 6. Identificar actividades externas pendientes. 7. Ejecutar simulacro, restore y carga en entorno apropiado. 8. Crear RiskRegisterV1 y evidence bundle. 9. Emitir PASS/NO-GO/INCOMPLETE con blockers y referencias. No marcar PASS sin evidencia ni cambiar protocolo para pasar un checklist.

## 20. Definition of Done

- [ ] Matriz de trazabilidad con evidencia para cada requisito crítico
- [ ] Lifecycle/freeze/ventana y concurrencia PASS
- [ ] Identidad y voto separados estructuralmente
- [ ] Nullifier único por elección/protocolo y retries PASS
- [ ] Circuit constraints, vectores, negativos y replay PASS
- [ ] Setup Groth16 productivo y revisión independiente completos
- [ ] Trusted VK/artifact digests verificados
- [ ] Audit chain, checkpoints y offline verifier PASS
- [ ] Conteo y publicación reproducibles PASS
- [ ] Browser E2E real y privacidad frontend PASS
- [ ] Suite completa, hardening, pentest y auditoría completos
- [ ] P1–P8, TLS, secrets y release exacto PASS
- [ ] Backup, restore aislado, PITR/RPO/RTO y clock revisados
- [ ] Capacity/peak test y simulacro electoral PASS
- [ ] RiskRegisterV1 y limitaciones V1 publicados según acceso
- [ ] Handoff operativo y documentación actualizados
- [ ] ElectionReadinessRecordV1 definido
- [ ] GoNoGoRecordV1 y evidence bundle generados

## 21. Cierre

La V1 solo puede considerarse candidata a producción si demuestra credencial elegible anónima, contexto electoral congelado, proof ZK válido, nullifier determinista por elección, aceptación atómica en PostgreSQL, ausencia de relación estructural identidad→voto, set final inmutable, tally determinista, publicación verificable independientemente, recuperación probada y release exacto auditado. Ante falta de evidencia, emitir INCOMPLETE o NO-GO, nunca una aprobación ficticia.
