# Runbooks operativos

Índice mínimo de respuesta segura:

- [API indisponible](api-unavailable.md)
- [PostgreSQL indisponible](postgres-unavailable.md)
- [Presión de disco PostgreSQL](postgres-disk-pressure.md)
- [Valkey indisponible](valkey-unavailable.md)
- [Fallo verifier ZK](zk-verifier-failure.md)
- [Digest de artefacto](artifact-digest-mismatch.md)
- [Clock drift](clock-drift.md)
- [Backup](backup-failure.md), [restore](restore.md) y [PITR](pitr.md)
- [Latencia](high-latency.md) y [error rate](high-error-rate.md)
- [Seguridad](security-incident.md) y [rollback](release-rollback.md)
- [Incidente durante OPEN](election-open-incident.md)
- [Verificación post-electoral](post-election-verification-failure.md)

Todos preservan evidencia, escalan decisiones electorales y prohíben reparar
mediante mutación destructiva del historial de votos.
