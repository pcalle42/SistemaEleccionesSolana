#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
CLASSIFICATION="${RELEASE_CLASSIFICATION:-devnet}"
cd "${REPOSITORY_ROOT}"

pnpm ci:main
pnpm test:reproducibility
pnpm test:performance
pnpm release:zk:verify -- --classification "${CLASSIFICATION}"
