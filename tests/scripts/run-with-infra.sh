#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${VOTACIONES_TEST_ENV_FILE:-${REPOSITORY_ROOT}/infra/test/.env.example}"
SUITE="${1:-integration}"

case "${SUITE}" in
  integration | concurrency | valkey | verification) ;;
  *) printf 'error: unknown infrastructure suite: %s\n' "${SUITE}" >&2; exit 1 ;;
esac

cleanup() {
  "${REPOSITORY_ROOT}/infra/scripts/test-infra.sh" down >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

"${REPOSITORY_ROOT}/infra/scripts/test-infra.sh" up
set -a
# This file contains synthetic TEST ONLY credentials and is guarded by test-infra.sh.
source "${ENV_FILE}"
set +a

cd "${REPOSITORY_ROOT}"
pnpm build
pnpm --filter @votaciones/api db:migrate:test

case "${SUITE}" in
  integration)
    pnpm --filter @votaciones/api exec vitest run --config vitest.integration.config.ts
    ;;
  concurrency)
    pnpm --filter @votaciones/api exec vitest run --config vitest.integration.config.ts \
      src/modules/audit/audit.integration.spec.ts \
      src/modules/elections/elections.integration.spec.ts \
      src/modules/eligibility/eligibility.integration.spec.ts \
      src/modules/verification/verification.integration.spec.ts \
      src/modules/voting/voting.integration.spec.ts
    ;;
  valkey)
    pnpm --filter @votaciones/api exec vitest run --config vitest.integration.config.ts \
      src/valkey/valkey.integration.spec.ts
    "${REPOSITORY_ROOT}/tests/scripts/valkey-restart.sh"
    ;;
  verification)
    pnpm --filter @votaciones/api exec vitest run --config vitest.integration.config.ts \
      src/modules/verification/verification.integration.spec.ts
    ;;
esac
