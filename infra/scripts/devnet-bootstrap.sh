#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context devnet
require_docker
require_command git
export DEVNET_GIT_COMMIT="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
export GIT_COMMIT="${DEVNET_GIT_COMMIT}"

compose_cmd config --quiet
print_context
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}" postgres valkey
compose_cmd run --rm --no-deps artifact-init
compose_cmd run --rm --no-deps api node scripts/devnet/verify-zk-artifacts.mjs
compose_cmd run --rm --no-deps api node dist/database/cli.js migrate

admin_count="$(compose_cmd exec --no-TTY postgres psql \
  --username "$(env_value POSTGRES_USER)" \
  --dbname "$(env_value POSTGRES_DB)" \
  --no-align --tuples-only --set ON_ERROR_STOP=1 \
  --command 'SELECT count(*) FROM admin.admin_account')"
if [[ "${admin_count##*$'\n'}" == '0' ]]; then
  admin_password="$(env_value DEVNET_ADMIN_PASSWORD)"
  [[ -n "${admin_password}" ]] || fail 'DEVNET_ADMIN_PASSWORD is required'
  printf '%s\n' "${admin_password}" | compose_cmd run --rm --no-deps --no-TTY \
    --env "ADMIN_CREATE_USERNAME=$(env_value DEVNET_ADMIN_USERNAME)" \
    api node dist/modules/auth/infrastructure/admin-cli.js create
elif [[ "${admin_count##*$'\n'}" != '1' ]]; then
  fail 'devnet must contain exactly one administrative account'
fi

compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
compose_cmd exec --no-TTY api node scripts/devnet/bootstrap.mjs
"${INFRA_ROOT}/scripts/smoke.sh" devnet
printf 'Devnet bootstrap completed.\n'
