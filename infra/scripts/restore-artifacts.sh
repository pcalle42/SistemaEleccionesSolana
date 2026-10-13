#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

if [[ "${1:-}" == '--' ]]; then
  shift
fi
archive_path="${1:-}"
target_directory="${2:-}"
[[ -f "${archive_path}" && -s "${archive_path}" && -n "${target_directory}" ]] ||
  fail 'usage: restore-artifacts.sh <archive.tar.gz> <new-empty-target-directory>'
[[ ! -e "${target_directory}" ]] || fail 'artifact restore target must not exist'
node "${REPOSITORY_ROOT}/scripts/operations/verify-backup.mjs" \
  --archive "${archive_path}" --kind verification-artifacts
if tar -tzf "${archive_path}" | awk '/^\// || /(^|\/)\.\.($|\/)/ { found=1 } END { exit !found }'; then
  fail 'artifact archive contains an unsafe path'
fi
if tar -tvzf "${archive_path}" | awk 'substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { found=1 } END { exit !found }'; then
  fail 'artifact archive contains links or special files'
fi
mkdir -p "${target_directory}"
tar -xzf "${archive_path}" -C "${target_directory}"
printf 'Verification artifacts restored by verified digest: %s\n' "${target_directory}"
