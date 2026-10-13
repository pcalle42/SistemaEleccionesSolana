#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context devnet
require_docker
require_command git
export DEVNET_GIT_COMMIT="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
export GIT_COMMIT="${DEVNET_GIT_COMMIT}"

compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
set -a
source "${VOTACIONES_ENV_FILE}"
set +a
cd "${REPOSITORY_ROOT}"
pnpm exec playwright test --config playwright.devnet.config.ts
compose_cmd exec --no-TTY api node scripts/devnet/e2e.mjs

# Availability recovery checks operate only through the namespaced devnet project.
compose_cmd restart api
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}" api
compose_cmd exec --no-TTY valkey valkey-cli FLUSHDB >/dev/null
compose_cmd restart valkey
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}" valkey api
compose_cmd restart postgres
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}" postgres api
compose_cmd exec --no-TTY api node scripts/devnet/verify.mjs >/dev/null
printf 'API, Valkey flush/restart, PostgreSQL restart, and offline verification passed.\n'
