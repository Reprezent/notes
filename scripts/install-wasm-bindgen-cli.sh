#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

wasm_bindgen_version="$(
  cargo metadata --locked --format-version 1 |
    jq -r '.packages[] | select(.name == "wasm-bindgen") | .version'
)"

cargo install --locked wasm-bindgen-cli --version "${wasm_bindgen_version}"
