# Electoral domain

This module owns the election aggregate and administrative lifecycle specified by
`docs/08-dominio-electoral.md`.

## Invariants

- New elections always start in `DRAFT`; the generic patch endpoint never accepts status.
- `SINGLE_CHOICE` requires at least two stable option IDs before `READY`.
- `opensAt < closesAt`, and vote admission uses the half-open interval `[opensAt, closesAt)`.
- `READY` freezes a numbered configuration snapshot. `READY -> DRAFT -> READY` creates the next
  `configurationVersion`.
- PostgreSQL is authoritative. Transitions compare expected state and `row_version` in one
  transaction together with the snapshot and state-change audit event.
- `CLOSED` and `CANCELLED` cannot return to `OPEN`.

## Boundaries for later stages

`ElectionReadinessVerifier` is the explicit seam for eligibility and ZK/protocol checks. Stage 09
now verifies a compatible frozen eligibility snapshot in PostgreSQL; the protocol/circuit check
remains provisional until stage 10. The aggregate contains no voter identity, proof, nullifier,
vote, or result rows.

The domain exposes `assertCanAcceptVote(clock)` for stage 11. It checks state and time only; it does
not authorize a vote by itself.

## Administrative API

All routes require the administrative session. Mutations additionally require the session-bound
CSRF token.

```text
POST   /api/v1/admin/elections
GET    /api/v1/admin/elections
GET    /api/v1/admin/elections/:id
PATCH  /api/v1/admin/elections/:id
POST   /api/v1/admin/elections/:id/ready
POST   /api/v1/admin/elections/:id/reopen-draft
POST   /api/v1/admin/elections/:id/open
POST   /api/v1/admin/elections/:id/close
POST   /api/v1/admin/elections/:id/cancel
```

Counting and result-publication endpoints are intentionally deferred.
