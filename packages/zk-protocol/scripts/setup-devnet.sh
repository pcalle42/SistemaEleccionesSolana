#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

R1CS="$ARTIFACT_DIR/anonymous-single-choice-v1.r1cs"
PTAU_0="$CACHE_DIR/devnet-pot14-0000.ptau"
PTAU_1="$CACHE_DIR/devnet-pot14-0001.ptau"
PTAU_FINAL="$ARTIFACT_DIR/devnet-pot14-final.ptau"
ZKEY_0="$CACHE_DIR/devnet-initial.zkey"
ZKEY_FINAL="$ARTIFACT_DIR/devnet-final.zkey"
VK="$ARTIFACT_DIR/verification_key.json"

if [[ ! -f "$R1CS" ]]; then
  echo "Missing R1CS. Run pnpm zk:compile first." >&2
  exit 1
fi

if [[ -f "$ZKEY_FINAL" && -f "$PTAU_FINAL" ]]; then
  echo "Existing V1 zkey will not be replaced. Verifying frozen artifacts instead."
  node "$PACKAGE_DIR/scripts/verify-artifacts.mjs"
  exit 0
fi

echo "DEVNET / NOT FOR PRODUCTION: single-party setup; never promote these artifacts."

pnpm exec snarkjs powersoftau new bn128 14 "$PTAU_0"
pnpm exec snarkjs powersoftau contribute "$PTAU_0" "$PTAU_1" \
  --name="Votaciones public devnet contribution" \
  --entropy="VOTACIONES_DEVNET_NOT_FOR_PRODUCTION_POWERS_OF_TAU_V1"
pnpm exec snarkjs powersoftau prepare phase2 "$PTAU_1" "$PTAU_FINAL"
pnpm exec snarkjs powersoftau verify "$PTAU_FINAL"
pnpm exec snarkjs groth16 setup "$R1CS" "$PTAU_FINAL" "$ZKEY_0"
pnpm exec snarkjs zkey contribute "$ZKEY_0" "$ZKEY_FINAL" \
  --name="Votaciones public devnet phase 2" \
  --entropy="VOTACIONES_DEVNET_NOT_FOR_PRODUCTION_PHASE2_V1"
pnpm exec snarkjs zkey verify "$R1CS" "$PTAU_FINAL" "$ZKEY_FINAL"
pnpm exec snarkjs zkey export verificationkey "$ZKEY_FINAL" "$VK"

node "$PACKAGE_DIR/scripts/generate-manifest.mjs"
node "$PACKAGE_DIR/scripts/verify-artifacts.mjs"
