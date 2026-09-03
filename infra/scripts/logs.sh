#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
shift
if [[ "${1:-}" == '--' ]]; then
  shift
fi

[[ "$#" -le 1 ]] || fail 'logs accepts at most one service name'

service="${1:-}"
case "${service}" in
  '' | postgres | valkey) ;;
  *) fail "unknown service: ${service}" ;;
esac

require_docker
print_context

if [[ -n "${service}" ]]; then
  compose_cmd logs --no-color --tail 200 "${service}"
else
  compose_cmd logs --no-color --tail 200
fi
