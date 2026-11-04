# Cierre técnico de producción — etapa 21

**Estado: NO-GO para elecciones reales.** Solo hay artifacts ZK devnet en el
registro. Faltan ceremonia y revisión independientes, pentest, proveedor y
aprobaciones P1–P8 con evidencia del release exacto.

Este directorio contiene un **inventario inicial**, no una auditoría terminada.
`traceability.v1.json` agrupa los 18 criterios DoD de la etapa 21 y añade 12
controles locales acotados con evidencia. Las referencias de los criterios
agregados son candidatas para revisión; no certifican cobertura exhaustiva de
00–20. Hay 12 PASS locales, 1 FAIL por setup no productivo y 17 NOT_TESTED
agregados con evidencia parcial. Las pruebas locales no bastan para aprobar
controles electorales completos.

Los contratos JSON Schema disponibles son `TraceabilityMatrixV1`, `RiskRegisterV1`,
`GoNoGoRecordV1`, `ElectionReadinessRecordV1` y `ElectionRehearsalReportV1`.
Los campos de release/evidencia desconocidos son `null` en decisiones pendientes;
no se usan hashes inventados ni se asigna una autoridad humana ficticia.

Generar un snapshot en un directorio **nuevo**, cuyo padre ya exista:

```bash
pnpm production:readiness -- --output production-readiness/review-001
pnpm production:readiness -- --verify production-readiness/review-001
```

Ambos comandos retornan **2** para NO-GO/INCOMPLETE; **1** indica error de
validación. Nunca producen GO. El comando verifica schemas, referencias locales,
IDs duplicados y ausencia de waivers críticos. PASS exige referencias de código,
pruebas y evidencia existentes, pero eso por sí solo no autentica su contenido.

Cada snapshot conserva matriz, riesgos, decisión, commit base, hashes de entradas
y hashes de sus archivos. Se rechaza sobrescribir un directorio existente. La
verificación detecta cambios accidentales: quien controle el bundle puede
reescribir también los hashes. Para custodia independiente se requiere firma o
anclaje externo. Un snapshot del working tree no equivale a un release inmutable.
El registro fuente no incluye secretos, variables de entorno ni diff del código.

Antes de cerrar la etapa:

1. Desglosar y revisar todos los requisitos críticos de 00–20 con responsables
   nominales, referencias precisas y evidencia vinculada al candidato exacto.
2. Ejecutar PostgreSQL/Valkey reales, concurrencia, navegador con ZK real,
   privacidad, tamper y clean-room usando las suites existentes.
3. Completar ceremonia productiva, auditoría ZK y pentest independientes. Adjuntar
   informes y resolver Critical/High relevantes; registrar decisiones humanas.
4. Aprobar proveedor, TLS/DNS, IAM/MFA, secrets, capacity con pico y margen,
   RPO/RTO/PITR, restore aislado, alertas/reloj y game day en el entorno objetivo.
5. Emitir `ElectionRehearsalReportV1` con los escenarios de la sección 13 del
   documento 21 y artifacts/digests del release exacto.
6. Adjuntar manifest de release verificado y evidencias, completar handoff y
   registrar decisión de autoridad. Este generador inicial no autoriza GO.
7. Antes de cada elección, emitir `ElectionReadinessRecordV1` con configuración,
   snapshot, root, artifacts, ventana y checks de P8. Aprobar software no aprueba
   automáticamente una elección.

No editar votos, borrar nullifiers, sobrescribir resultados/artifacts ni extender
improvisadamente la ventana. Recuperación y escalamiento siguen los
[runbooks operativos](../docs/operations/README.md).

El [informe local](local-review-2026-11-04.md) registra lo ejecutado y los límites.

La [continuación con Docker](docker-review-2026-11-04.md) registra integración, navegador conectado, recuperación, restore y correcciones encontradas. Conserva separadas las evidencias anteriores y posteriores a los cambios.

Último snapshot de esta revisión: [`review-2026-11-04-002`](review-2026-11-04-002/decision.v1.json), verificado con salida 2 esperada (NO-GO). La evidencia Docker conserva 42 archivos con hashes verificados.
