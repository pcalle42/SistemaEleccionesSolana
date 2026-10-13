#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPOSITORY_ROOT}"

pnpm test:property
pnpm test:zk
pnpm test:integration
pnpm test:concurrency
pnpm test:valkey
pnpm test:security
pnpm test:verification
pnpm test:operations
pnpm release:migrations:verify
pnpm release:zk:verify -- --classification devnet
