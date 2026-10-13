# Catálogo de métricas, SLIs y SLO

## Aplicación

| Métrica | Tipo | Dimensiones permitidas |
| --- | --- | --- |
| `http_requests_total` | counter | `service`, `route`, `status_class` |
| `http_request_duration_seconds` | summary | `service`, `route` |
| `vote_requests_total` | counter | `result_class` |
| `vote_rejected_total` | counter | `reason_class` |
| `vote_duplicate_total` | counter | ninguna |
| `vote_proof_verification_duration_seconds` | summary | ninguna |
| `vote_accept_transaction_duration_seconds` | summary | ninguna |
| `proof_verification_inflight` | gauge | ninguna |
| `proof_verification_timeout_total` | counter | ninguna |
| `postgres_connections` | gauge | `state` |
| `postgres_health_check_duration_seconds` | summary | ninguna |
| `postgres_health_total` | counter | `result` |
| `valkey_health_check_duration_seconds` | summary | ninguna |
| `valkey_health_total` | counter | `result` |

## SLIs

- disponibilidad API y PostgreSQL;
- éxito de requests de voto válidos, separado de rechazos esperados;
- latencia de aceptación y proof verification;
- éxito de publication/offline verifier;
- backup con digest válido;
- restore aislado con invariantes y verifier válidos.

No hay SLO numérico todavía. Se define después de baseline representativo,
requisitos electorales, RPO/RTO y capacidad aprobada. Correctness siempre gana:
un proof no verificado jamás se acepta para mejorar disponibilidad.
