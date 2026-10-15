# Topología y trust boundaries

```mermaid
flowchart TB
  U[Internet] -->|HTTPS 443| E[DNS / DDoS / TLS edge]
  E --> AW[admin-web]
  E --> VW[voter-web]
  E -->|trusted proxy| API[API stateless]
  API -->|runtime DML identity| PG[(PostgreSQL autoritativo)]
  API -->|auxiliar| VK[(Valkey)]
  API -->|content-addressed writes| AS[(Artifact storage privado)]
  AS --> PUB[Public verification plane / CDN]
  MJ[Migration job] -->|separate DDL identity| PG
  BR[Backup / restore jobs] --> PG
  BR --> AS
  CI[CI deploy identity] -->|digests approved| E
```

| Boundary | Confianza y regla |
| --- | --- |
| Internet → edge | datos hostiles; TLS, límites, timeouts y abuso antes de la API |
| edge → aplicación | solo proxies/CIDR aprobados; conservar bytes criptográficos |
| aplicación → datos | red privada; identidades distintas por runtime/migration/backup |
| aplicación → artifacts | escritura inmutable por digest; público y privado separados |
| humano/CI → management | cuentas nominales, MFA, least privilege y audit |

Solo el edge tiene ingress público. PostgreSQL, Valkey, métricas y artefactos
internos no publican puertos. `CastVote` no necesita egress irrestricto. No se
declara HA ni multi-región hasta aprobar RPO/RTO y probar failover.
