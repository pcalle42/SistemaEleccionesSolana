# Respuesta a incidentes

## Activación y severidad

Abrir incidente ante compromiso de credential/admin/secreto, anomalía DB/audit, vulnerabilidad ZK,
artifact mismatch, fuga de privacidad, outage, drift temporal, fallo de verificación o supply chain.
Severidad crítica si puede alterar aceptación, anonimato, tally, publicación o evidencia histórica.

## Procedimiento

1. Nombrar responsable y registrar timestamps UTC, alcance conocido y decisiones.
2. Preservar logs, audit/checkpoints, packages, manifests, digests, imágenes y snapshot/backup; no
   editar votos/resultados para “limpiar”.
3. Contener por red, revocación/rotación o transición legítima auditada (cierre/cancelación). No hay
   kill switch oculto.
4. Comparar DB, final vote set, tally y packages con el verifier offline y copias independientes.
5. Evaluar ventana de exposición, elecciones/usuarios afectados y riesgo de correlación.
6. Recuperar desde artefactos verificados; ensayar antes. Toda corrección de resultado crea versión.
7. Documentar causa raíz, evidencia, comunicación, controles y prueba de regresión.

## Casos especiales

- Vulnerabilidad de circuito antes de `OPEN`: retirar versión, nueva versión/artefactos y regenerar.
- Después de `OPEN`: incidente formal; no sustituir artefactos bajo la misma versión.
- Edit DB excepcional: autorización explícita, backup, script versionado, razón y digests before/after.
- Reloj: preservar timestamps; no reescribir historia. Determinar qué boundary fue afectado.
- Fuga de secreto: seguir además [secret-rotation.md](secret-rotation.md).
