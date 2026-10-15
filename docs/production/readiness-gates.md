# Gates P1–P8 y revisión de readiness

`ProductionProfileV1` convierte cada gate en evidencia revisable. Todos deben
estar `approved`; un solo `pending` es NO-GO.

| Gate | Evidencia mínima | Estado actual |
| --- | --- | --- |
| P1 Architecture | ADR proveedor, topología y trust boundaries | pendiente proveedor |
| P2 TLS/DNS | dominio, CA, renovación y expiry alert probados | pendiente |
| P3 Data | roles, cifrado, backup/restore, PITR, RPO/RTO | RPO/RTO pendientes |
| P4 Crypto | artifacts `productionSafe`, registry y verifier | bloqueado: solo devnet |
| P5 Security | stage 16, secrets, MFA, IAM y red | proveedor pendiente |
| P6 Operations | alertas, reloj, capacidad y on-call | staging pendiente |
| P7 Release | manifest production, ensayo y rollback | pipeline listo, evidencia pendiente |
| P8 Election | snapshot/config/ventana/checklist congelados | depende de elección |

Revisión 2026-10-13: **NO-GO para elección real**. Los límites y verificadores
están implementados, pero no se inventan proveedor, certificados, RPO/RTO,
capacidad, artefactos ZK productivos ni aprobaciones. La plantilla debe fallar:

```bash
pnpm production:profile:verify -- --profile deploy/production-profile.template.json
```
