#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context devnet
if [[ "${1:-}" == '--' ]]; then shift; fi
[[ "$#" -le 2 ]] || fail 'usage: devnet:verify [-- --package <path>]'
require_docker
compose_cmd exec --no-TTY api node scripts/devnet/verify.mjs "$@"
