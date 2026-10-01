#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

pnpm zk:compile
pnpm zk:inspect
pnpm zk:setup
pnpm build
pnpm exec vitest run
