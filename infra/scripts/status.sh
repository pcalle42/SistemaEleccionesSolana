#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
require_docker
print_context
compose_cmd ps --all
if [[ "${VOTACIONES_ENVIRONMENT}" == 'devnet' ]] &&
  [[ -n "$(compose_cmd ps --quiet api)" ]]; then
  compose_cmd exec --no-TTY api node dist/database/cli.js status
  compose_cmd exec --no-TTY api node scripts/devnet/status.mjs
fi
