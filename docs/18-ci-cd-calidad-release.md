# 18 — CI/CD, Calidad y Release

## Propósito

Define la cadena de integración, construcción, verificación, release y promoción de Votaciones.

Regla central:

```text
build once
-> verify
-> promote the same immutable artifacts
```

Un release debe identificar exactamente código, dependencias, migrations, imágenes, protocolo ZK, artifacts criptográficos y evidencia de pruebas.

No se define todavía un proveedor cloud ni una plataforma productiva concreta.

---

## 1. Principios

- ningún deploy productivo depende de builds manuales desde una laptop;
- scripts críticos viven en el repo y CI los invoca;
- PR, main, release candidate y producción tienen gates distintos;
- devnet/test/staging/production usan secretos y datos separados;
- staging y producción promueven los mismos artifacts aprobados;
- una vez construido un release candidate, no se modifica;
- fallar un gate crítico bloquea promoción.

## 2. Scripts canónicos

CI debe reutilizar comandos ejecutables localmente, por ejemplo:

```text
pnpm ci:validate
pnpm test:all
pnpm build
pnpm release:verify
```

No duplicar la lógica del proyecto únicamente dentro del YAML del proveedor CI.

---

# Parte I — Pull Requests

## 3. Pipeline PR

Como mínimo:

```text
checkout
frozen install
format check
lint
typecheck
unit
contract
build
```

Cuando sea razonable:

```text
PostgreSQL integration
Valkey integration
ZK protocol tests
```

## 4. Paths críticos

Cambios en:

```text
zk/
voting/
eligibility/
auth/
migrations/
audit/
verification/
counting/
results/
canonicalization/
infra/security/
```

deben ejecutar suite ampliada.

Los path filters no pueden ser la única barrera porque pueden omitir dependencias indirectas.

## 5. Secretos en PR

Código no confiable/forks nunca recibe:

```text
production secrets
production DB credentials
signing keys
deployment credentials
```

## 6. Build check

PR debe demostrar que compilan:

```text
api
admin-web
voter-web
shared packages
ZK protocol packages
offline verifier
```

No se publica release oficial desde PR.

---

# Parte II — Main

## 7. Pipeline main

Debe incluir:

```text
lint
typecheck
unit
contract
PostgreSQL integration
Valkey integration
ZK tests
concurrency
security
privacy
E2E core
verification tamper tests
build
```

## 8. Clean-room

Ejecutar el flujo de etapa 17 en runner limpio:

```text
fresh environment
-> devnet bootstrap
-> full synthetic election
-> offline verification
```

Sin volúmenes anteriores.

## 9. Gates críticos

Suites electorales, criptográficas y de seguridad no pueden usar:

```text
continue-on-error
allowed-to-fail
permanent skip
```

---

# Parte III — Versionado

## 10. App version

Usar SemVer:

```text
MAJOR.MINOR.PATCH
```

con RCs:

```text
v1.4.2-rc.1
v1.4.2
```

## 11. Versiones independientes

Nunca confundir:

```text
appVersion
protocolVersion
circuitVersion
migration/schema version
```

Ejemplo:

```text
appVersion = 1.4.2
protocolVersion = anonymous-single-choice-v1
circuitVersion = AnonymousSingleChoiceVoteV1
```

Una actualización de UI puede cambiar `appVersion` sin cambiar protocolo.

## 12. Election compatibility

Una elección OPEN permanece ligada a su protocolo/configuración/artifacts.

Un deploy no puede migrarla silenciosamente a una nueva versión criptográfica.

---

# Parte IV — Build Reproducible

## 13. Inputs fijados

El build se deriva de:

```text
git commit
pnpm-lock.yaml
pinned Node/pnpm
pinned base images
pinned ZK toolchain
release configuration
```

## 14. Frozen install

```text
pnpm install --frozen-lockfile
```

Un lockfile inconsistente falla.

## 15. Toolchain

No usar:

```text
node:latest
unpinned package manager
latest ZK toolchain
```

como identidad de release.

## 16. Secretos

No introducir secretos en:

```text
frontend build
Docker ARG
image layer
generated static bundle
```

Toda variable del frontend se considera pública.

## 17. Rebuild

Cuando sea viable, dos builds desde los mismos inputs deben producir outputs equivalentes.

Si algún artifact no es bit-reproducible, preservar y promover el digest exacto del artifact que pasó los gates.

---

# Parte V — Container Images

## 18. Imágenes

Como mínimo:

```text
votaciones-api
votaciones-admin-web
votaciones-voter-web
```

Jobs CLI pueden compartir imagen cuando esté justificado.

## 19. Tags y digests

Tags:

```text
v1.4.2
git-<sha>
```

Promoción autoritativa por:

```text
registry/image@sha256:<digest>
```

`latest` nunca identifica un release productivo.

## 20. Hardening

Verificar:

```text
non-root
minimal runtime
no secrets
no privileged
no Docker socket
minimal writable paths
```

## 21. Vulnerability scan

Política:

- Critical relevante: bloquea;
- High relevante: bloquea o excepción formal;
- Medium/Low: triage.

Una excepción debe documentar riesgo, owner y revisión/expiración.

---

# Parte VI — ZK Artifacts

## 22. Separación

CI normal puede compilar circuitos y verificar artifacts.

No debe inventar automáticamente un trusted setup productivo.

## 23. Devnet

Artifacts devnet:

```text
productionSafe = false
```

Nunca se promueven a producción.

## 24. Producción

Artifacts productivos incluyen, según protocolo:

```text
r1cs
wasm
final zkey
verification_key.json
protocol manifest
artifact digests
```

y provienen del procedimiento/ceremonia aprobado.

## 25. Registry

Mantener registry versionado:

```text
protocolVersion
circuitVersion
environment/classification
artifact digests
verificationKeyDigest
source/reference
productionSafe
```

## 26. Gate ZK

Release verifica:

```text
artifacts exist
digests match
protocol manifest matches
VK matches
production release does not reference devnet artifacts
```

Si falta un `.zkey` productivo:

```text
FAIL
```

Nunca regenerarlo silenciosamente.

## 27. Circuit changes

Cambiar constraints/source relevante exige evaluar:

```text
new circuitVersion
new artifacts
full ZK suite
setup/ceremony implications
registry update
```

Nunca reemplazar artifacts bajo la misma versión.

---

# Parte VII — Migrations

## 28. Versionadas

Migrations Drizzle son:

```text
committed
reviewed
tested
identified
```

No schema auto-sync productivo.

## 29. Tests

Probar:

```text
empty DB -> latest
supported previous schema -> latest
```

cuando existan releases anteriores.

## 30. Clasificación

Cada migration productiva relevante se clasifica:

```text
safe additive
requires coordination
data migration
destructive
```

## 31. Expand/contract

Para cambios incompatibles preferir:

```text
expand
-> deploy compatible code
-> migrate/backfill
-> verify
-> contract later
```

## 32. Roles

Migration job usa rol específico.

API runtime no necesita DDL/schema-owner.

## 33. Backup precondition

Una migration de riesgo no inicia sin backup/restore readiness.

## 34. Rollback DB

No asumir que toda migration puede revertirse.

Cada release declara:

```text
application rollback compatibility
DB strategy
forward-fix strategy
```

Restaurar un backup que elimine votos nuevos no es rollback normal.

---

# Parte VIII — ReleaseManifestV1

## 35. Schema

Generar artifact machine-readable con al menos:

```text
schemaVersion
releaseVersion
gitCommit
buildTimestamp
nodeVersion
pnpmVersion
lockfileDigest
apiImageDigest
adminWebImageDigest
voterWebImageDigest
migrationSetDigest
protocolVersions
circuitVersions
zkArtifactDigests
verificationKeyDigests
testEvidenceRefs
securityScanRefs
sbomRefs
sourceRepository
```

Sin secretos.

## 36. Digest

```text
releaseManifestDigest =
SHA-256(canonical(ReleaseManifestV1))
```

## 37. Inmutabilidad

Un release final no se sobrescribe.

Una corrección produce nueva versión.

## 38. Release notes

Además del manifest:

- cambios;
- migrations;
- protocol changes;
- security notes;
- known limitations;
- upgrade;
- rollback constraints.

---

# Parte IX — SBOM y Provenance

## 39. SBOM

Generar SBOM cuando tooling seleccionado lo soporte de forma fiable:

```text
SPDX
o
CycloneDX
```

## 40. Provenance

Registrar:

```text
source commit
builder/pipeline
inputs
artifact digests
```

Puede adoptarse SLSA/in-toto compatible si aporta valor.

## 41. Signing

Firmar imágenes/manifests solo cuando exista key management aprobado.

No crear private signing keys improvisadas dentro de CI.

---

# Parte X — Security Gates

## 42. Gates heredados

Release pasa S1–S10 de etapa 16.

## 43. Secret scan

Escanear repo/build context/artifacts apropiados.

Un secreto confirmado bloquea.

## 44. Dependency scan

Hallazgos se triagean, no se ignoran automáticamente.

## 45. Privacy gate

Bloquear ante:

```text
voterSecret leak
identity in CastVote
PII in public package
sensitive canary in logs
```

## 46. Verification gate

Full devnet election + offline verifier deben pasar.

## 47. ZK gate

Bloquear ante:

```text
unknown circuitVersion
artifact digest mismatch
devnet zkey
VK mismatch
negative ZK test failure
```

---

# Parte XI — Release Candidate

## 48. Trigger

RC nace de commit/tag protegido o workflow autorizado.

Nunca de working tree local.

## 49. Pipeline

```text
full tests
clean-room devnet
security gates
container builds
container scans
migration verification
ZK registry verification
SBOM
ReleaseManifestV1
```

## 50. Artifacts RC

Publicar:

```text
container images
release manifest
SBOMs
test summaries
digest lists
release notes draft
```

## 51. RC immutable

No sobrescribir:

```text
v1.4.2-rc.1
```

Un cambio genera:

```text
v1.4.2-rc.2
```

---

# Parte XII — Promotion

## 52. Build once

Correcto:

```text
RC digest
-> staging
-> approval
-> same digest
-> production
```

Incorrecto:

```text
build staging
-> rebuild production
```

## 53. Runtime differences

Entre ambientes solo cambian:

```text
runtime config
secrets
URLs/domains
DB endpoints
observability endpoints
```

No el artifact aprobado.

## 54. ZK

Producción solo usa artifacts:

```text
productionSafe = true
```

Staging puede validar los mismos artifacts productivos.

## 55. Promotion record

Registrar:

```text
releaseVersion
releaseManifestDigest
environment
image digests
protocol/artifact digests
deployedAt
actor/automation
migration status
```

---

# Parte XIII — Staging

## 56. Propósito

Aproximar producción en:

```text
TLS
proxy behavior
secret injection
DB roles
CORS
cookies
artifact delivery
```

## 57. Datos

Solo datos sintéticos.

No copiar padrón/PII productivo.

## 58. E2E

Ejecutar elección sintética completa con release candidato.

No desactivar proof verification.

## 59. Migration rehearsal

Para migrations relevantes:

```text
representative sanitized schema/data
-> migrate
-> validate
-> measure locks/duration
```

---

# Parte XIV — Producción

## 60. Manual approval gate

No continuous deployment automático de `main` a producción.

Requiere aprobación explícita.

## 61. Evidencia previa

Antes de promover:

```text
RC passed
staging E2E passed
security gates passed
migration plan approved
backup/restore ready
ZK artifacts verified
release manifest finalized
rollback/forward-fix plan ready
```

## 62. Separation of duties

Cuando el equipo lo permita, separar revisión/deploy del rol de admin electoral.

---

# Parte XV — Deployment Safety

## 63. Preflight

Antes de deploy:

```text
target environment
current release
target release
release digest
DB migration status
protocol compatibility
artifact registry
backup status
```

## 64. Wrong-environment guard

Producción debe especificarse explícitamente.

Nunca inferir target crítico por default.

## 65. Schema compatibility

Una instancia no recibe tráfico hasta que schema requerido sea compatible.

## 66. Readiness

Usar readiness para tráfico.

## 67. Multi-instance

Rolling deployment solo si old/new release son compatibles temporalmente con schema/protocolo.

De lo contrario, estrategia coordinada.

---

# Parte XVI — Rollback

## 68. Principio

Rollback de software nunca significa:

```text
delete votes
restore old DB over newer accepted votes
rewrite results
```

## 69. App rollback

Volver a imagen anterior solo si:

```text
schema compatible
protocol artifacts available
accepted votes remain valid
migration plan allows it
```

## 70. DB recovery

Restaurar DB puede perder votos posteriores al backup.

Eso es procedimiento de incidente/DR, no rollback rutinario.

Preferir forward-fix.

## 71. Protocol rollback

No cambiar `protocolVersion` de una elección OPEN.

Una vulnerabilidad exige detener/cancelar según procedimiento de incidente, no downgrade silencioso.

## 72. Results

No borrar publicación histórica.

Corrección crea nueva versión.

---

# Parte XVII — Repository Protection

## 73. Main

Configurar cuando la plataforma lo soporte:

```text
protected branch
required reviews
required checks
restricted direct push
restricted force push
```

## 74. Critical ownership

Evaluar CODEOWNERS/review adicional para:

```text
zk/
migrations/
auth/
voting/
verification/
infra/
security/
```

## 75. Tags

No mover un release tag final a otro commit.

---

# Parte XVIII — CI Security

## 76. Least privilege

Tokens CI con permisos mínimos.

## 77. Temporary credentials

Cuando plataforma futura lo permita, preferir OIDC/credenciales temporales sobre cloud secrets estáticos.

## 78. Third-party actions

Pinnear versión/commit/digest cuando sea posible.

Revisar especialmente las acciones que reciben secretos.

## 79. Untrusted code

Código no confiable no se ejecuta con credenciales privilegiadas.

## 80. Artifact retention

Definir retención para:

```text
test reports
SBOM
release manifests
scan reports
build logs
```

sin secretos.

---

# Parte XIX — Quality Gate

## 81. Requisitos

Release candidato:

```text
format clean
lint clean
typecheck clean
build clean
tests green
no critical flaky tests
migrations verified
docs updated
```

## 82. TODOs

Un TODO crítico que invalida una propiedad declarada bloquea release.

TODO cosmético no necesariamente.

## 83. Warnings

Warnings relevantes deben triagearse.

No perseguir “zero warnings” de herramientas externas a costa de ignorar señales útiles.

---

# Parte XX — Compatibility Matrix

## 84. Matriz

Mantener:

```text
appVersion
compatible schema range
protocolVersions
circuitVersions
artifact registry version
frontend compatibility
```

## 85. Startup fail-closed

API no pasa readiness ante:

```text
incompatible schema
missing required artifact
unsupported protocol registry
```

---

# Parte XXI — Release Verification

## 86. Comando

Crear:

```text
pnpm release:verify --manifest <path>
```

Comprueba:

```text
schema
manifest digest
image refs/digests
migration digest
ZK artifact digests
protocol registry
required test/security evidence refs
```

## 87. Post-deploy

Comprobar:

```text
health/readiness
version endpoint
release identity
DB compatibility
artifact registry
public manifest availability
safe synthetic checks
```

No emitir voto de prueba en una elección real.

---

# Parte XXII — Version Endpoint

## 88. Metadata pública

Endpoint puede exponer:

```text
appVersion
gitCommit según policy
releaseManifestDigest
supportedProtocolVersions
```

Nunca:

```text
secrets
internal paths
DB host
credentials
```

---

# Parte XXIII — Release Observability

## 89. Startup log

Registrar una vez:

```text
appVersion
releaseManifestDigest
environment
```

sin secretos.

## 90. Metrics

Puede incluir release estable para diagnóstico, controlando cardinalidad.

---

# Parte XXIV — Failure Policy

## 91. Fallos

Distinguir:

```text
test failure
security failure
CI infrastructure failure
```

Ninguno autoriza release automático.

## 92. Scanner unavailable

Scanner obligatorio no ejecutado:

```text
gate incomplete
```

No significa cero vulnerabilidades.

## 93. Registry unavailable

No reconstruir artifacts localmente para saltar una caída.

---

# Parte XXV — Ejemplo ReleaseManifestV1

## 94. Forma conceptual

```json
{
  "schemaVersion": "ReleaseManifestV1",
  "releaseVersion": "1.0.0-rc.1",
  "gitCommit": "<sha>",
  "images": {
    "api": "registry/...@sha256:<digest>",
    "adminWeb": "registry/...@sha256:<digest>",
    "voterWeb": "registry/...@sha256:<digest>"
  },
  "migrations": {
    "setDigest": "sha256:<digest>"
  },
  "protocols": [
    {
      "protocolVersion": "anonymous-single-choice-v1",
      "circuitVersion": "AnonymousSingleChoiceVoteV1",
      "productionSafe": true,
      "verificationKeyDigest": "sha256:<digest>",
      "artifactManifestDigest": "sha256:<digest>"
    }
  ]
}
```

El schema final debe validarse y canonicalizarse.

---

# Parte XXVI — Pipelines Resumidos

## 95. PR

```text
checkout
-> frozen install
-> format/lint/typecheck
-> unit/contract
-> integration/ZK as required
-> build
```

## 96. Main

```text
checkout
-> full validation
-> integration
-> ZK
-> concurrency
-> security/privacy
-> clean-room devnet E2E
-> verification
-> build
```

## 97. Release Candidate

```text
protected source
-> full gates
-> immutable images
-> scans
-> production ZK registry verification
-> migration tests
-> SBOM
-> ReleaseManifestV1
-> publish RC
```

## 98. Promotion

```text
RC digests
-> staging
-> E2E/migration rehearsal
-> approval
-> same digests
-> production
-> post-deploy verification
```

---

# Parte XXVII — Criterios de Aceptación

## 99. La etapa se aprueba cuando

- existe pipeline PR;
- existe pipeline main;
- existe pipeline RC;
- tests críticos son required;
- PR no recibe secretos productivos;
- frozen lockfile se exige;
- imágenes tienen versiones y digests;
- `latest` no es autoridad;
- image scans existen;
- app/protocol/circuit version están separados;
- migrations se prueban;
- artifacts ZK productivos no se regeneran automáticamente;
- registry separa devnet/production;
- `ReleaseManifestV1` existe;
- manifest tiene digest canónico;
- clean-room E2E es gate;
- SBOM/provenance están implementados o definidos por ADR;
- staging promueve los mismos digests;
- producción requiere aprobación;
- rollback no elimina votos;
- branch/release protections están documentadas;
- CI usa least privilege;
- `release:verify` existe;
- post-deploy verification está definida.

---

# Parte XXVIII — Definition of Done

## 100. Checklist

```text
[ ] PR workflow
[ ] main workflow
[ ] RC workflow
[ ] required checks
[ ] no prod secrets on untrusted PRs
[ ] frozen pnpm install
[ ] pinned Node/pnpm
[ ] pinned base-image policy
[ ] reusable CI scripts
[ ] API image
[ ] admin-web image
[ ] voter-web image
[ ] image digests
[ ] image scans
[ ] runtime hardening checks
[ ] app SemVer
[ ] protocol version separation
[ ] circuit version separation
[ ] migration set identification
[ ] migration empty-DB test
[ ] migration upgrade test
[ ] migration risk classification
[ ] production ZK registry
[ ] devnet artifact rejection
[ ] no automatic production setup
[ ] ReleaseManifestV1 schema
[ ] canonical manifest digest
[ ] release notes template
[ ] SBOM
[ ] provenance metadata
[ ] secret scan
[ ] dependency scan
[ ] privacy gate
[ ] ZK gate
[ ] verification gate
[ ] clean-room devnet gate
[ ] immutable RC
[ ] staging promotion
[ ] staging E2E
[ ] migration rehearsal
[ ] production approval gate
[ ] deployment preflight
[ ] app rollback rules
[ ] DB forward-fix/recovery rules
[ ] protocol rollback prohibition
[ ] result correction versioning
[ ] protected main
[ ] protected release tags
[ ] critical review policy
[ ] CI least privilege
[ ] third-party CI pinning
[ ] compatibility matrix
[ ] release:verify
[ ] version endpoint
[ ] post-deploy verification
[ ] release runbook
```

---

# Parte XXIX — Prohibiciones

## 101. Codex no debe

- desplegar producción desde laptop;
- recompilar una versión diferente para producción;
- usar `latest` como identidad productiva;
- introducir secretos en frontend build;
- pasar secretos como Docker build args;
- dar production secrets a PR no confiable;
- regenerar production zkey automáticamente;
- promover artifacts ZK devnet;
- reemplazar artifact bajo misma versión;
- ejecutar migration destructiva sin plan;
- asumir rollback DB siempre posible;
- restaurar backup sobre votos nuevos como rollback normal;
- borrar votos para revertir release;
- cambiar protocolo de elección OPEN;
- sobrescribir RC/tag final;
- permitir suites críticas como allowed-to-fail;
- interpretar scanner caído como éxito;
- ignorar digest mismatch;
- crear signing keys improvisadas en CI;
- acoplar toda lógica al YAML del proveedor;
- copiar PII real a staging;
- hacer CD automático a producción sin aprobación;
- saltar preflight/staging salvo procedimiento formal de incidente.

---

# Parte XXX — Orden para Codex

## 102. Implementación

1. Leer `00`–`17`.
2. Inventariar scripts.
3. Crear scripts CI reutilizables.
4. Crear PR workflow.
5. Crear main workflow.
6. Integrar etapa 15.
7. Integrar gates etapa 16.
8. Integrar clean-room etapa 17.
9. Pinnear Node/pnpm.
10. Construir imágenes.
11. Hardening y scans.
12. Definir app versioning.
13. Identificar migration set.
14. Migration tests.
15. ZK registry verification.
16. Guard devnet/production artifacts.
17. Definir `ReleaseManifestV1`.
18. Canonical digest.
19. SBOM.
20. Provenance.
21. Crear RC workflow.
22. Publicar por digest.
23. Definir staging promotion.
24. Crear preflight.
25. Production approval.
26. Rollback/forward-fix.
27. Branch/release protection.
28. Compatibility matrix.
29. `release:verify`.
30. Version endpoint.
31. Post-deploy verification.
32. Release runbook.
33. Ejecutar RC completo de prueba.

---

# Parte XXXI — Siguiente Documento

## 103. Documento siguiente

```text
19-observabilidad-operacion-backup-recuperacion.md
```

Debe definir:

- logs;
- metrics;
- traces donde aporten valor;
- health/readiness;
- alerting;
- SLI/SLO basados en medición;
- dashboards mínimos;
- backup;
- restore;
- PITR;
- disaster recovery;
- time synchronization;
- runbooks;
- capacity;
- mantenimiento;
- operación durante una elección;
- respuesta a fallos sin comprometer privacidad.

---

# Parte XXXII — Instrucción Final

## 104. Regla de cierre

Un release debe poder representarse como:

```text
source commit
+
lockfile
+
container image digests
+
migration set
+
protocol/circuit versions
+
ZK artifact digests
+
verification key digests
+
test/security evidence
+
ReleaseManifestV1 digest
```

Ese mismo conjunto es el que se prueba en staging y, tras aprobación, se promueve a producción.

La pipeline no está completa si desplegar exige volver a construir, regenerar criptografía o tomar decisiones manuales no documentadas.
