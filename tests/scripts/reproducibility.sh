#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/votaciones-repro.XXXXXX")"

cleanup() {
  rm -rf -- "${SNAPSHOT_ROOT}"
}
trap cleanup EXIT INT TERM

cd "${REPOSITORY_ROOT}"
git ls-files --cached --others --exclude-standard -z |
  tar --null --files-from=- --create --file=- |
  tar --extract --file=- --directory="${SNAPSHOT_ROOT}"

cd "${SNAPSHOT_ROOT}"

pnpm install --frozen-lockfile
pnpm build
pnpm zk:verify-artifacts
docker build --file apps/admin-web/Dockerfile --tag votaciones-admin-repro:test .
docker build --file apps/voter-web/Dockerfile --tag votaciones-voter-repro:test .

printf 'Reproducibility build completed from a clean temporary source snapshot.\n'
