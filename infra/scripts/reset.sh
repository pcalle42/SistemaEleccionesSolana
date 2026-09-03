#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
shift
if [[ "${1:-}" == '--' ]]; then
  shift
fi

[[ "$#" -eq 1 && "$1" == '--force' ]] ||
  fail 'reset destroys the environment volume; rerun with --force'

require_docker
compose_cmd config --quiet
print_context
printf 'Destroying containers and volumes for project %s.\n' "${VOTACIONES_PROJECT_NAME}"
compose_cmd down --volumes --remove-orphans
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
compose_cmd ps
