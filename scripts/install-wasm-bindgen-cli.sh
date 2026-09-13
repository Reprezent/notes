#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

wasm_bindgen_version="$(
  cargo metadata --locked --format-version 1 |
    python3 -c 'import json, sys; versions = [pkg["version"] for pkg in json.load(sys.stdin)["packages"] if pkg["name"] == "wasm-bindgen"]; assert len(versions) == 1, versions; print(versions[0])'
)"

cargo install --locked wasm-bindgen-cli --version "${wasm_bindgen_version}"
