#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
require_docker
compose_cmd config --quiet
print_context
printf 'Compose configuration is valid.\n'
