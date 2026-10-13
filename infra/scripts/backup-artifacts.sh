#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

if [[ "${1:-}" == '--' ]]; then
  shift
fi
source_directory="${1:-}"
output_path="${2:-}"
environment="${3:-devnet}"
[[ -d "${source_directory}" && -n "${output_path}" ]] ||
  fail 'usage: backup-artifacts.sh <source-directory> <output.tar.gz> [environment]'
[[ "${environment}" =~ ^[a-z0-9_-]+$ ]] || fail 'invalid environment label'
[[ ! -e "${output_path}" && ! -e "${output_path}.metadata.json" && ! -e "${output_path}.sha256" ]] ||
  fail "artifact backup already exists: ${output_path}"
if find "${source_directory}" -type l -print -quit | grep -q .; then
  fail 'artifact backup refuses symbolic links'
fi
mkdir -p "$(dirname -- "${output_path}")"
umask 077
tar -czf "${output_path}" -C "${source_directory}" .
[[ -s "${output_path}" ]] || fail 'artifact backup is empty'
node "${REPOSITORY_ROOT}/scripts/operations/backup-metadata.mjs" \
  --archive "${output_path}" --environment "${environment}" --kind verification-artifacts
printf 'Verification artifact backup created: %s\n' "${output_path}"
