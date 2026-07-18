use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
const WASM_INITIAL_MEMORY_BYTES: usize = 64 * 1024 * 1024;
const WASM_MAX_MEMORY_BYTES: usize = 512 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactManifest {
    core_version: String,
    artifacts: BTreeMap<String, ArtifactEntry>,
}

#[derive(Serialize, Deserialize)]
struct ArtifactEntry {
    sha256: String,
}

fn main() -> Result<()> {
    let command = env::args().nth(1).unwrap_or_default();
    match command.as_str() {
        "build-all" => build_all(),
        "build-android" => build_android(),
        "build-web" => build_web(),
        "verify-artifacts" => verify_artifacts(),
        "verify-web" => verify_web_artifacts(),
        _ => bail!(
            "usage: cargo xtask <build-all|build-android|build-web|verify-artifacts|verify-web>"
        ),
    }
}

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask is in the workspace root")
        .to_path_buf()
}

fn artifacts_dir() -> PathBuf {
    workspace_root().join("modules/expo-local-vectorizer/artifacts")
}

fn run(command: &mut Command) -> Result<()> {
    let status = command
        .status()
        .with_context(|| format!("failed to start {command:?}"))?;
    if !status.success() {
        bail!("command failed with {status}: {command:?}");
    }
    Ok(())
}

fn run_with_tool_hint(command: &mut Command, missing_tool_hint: &str) -> Result<()> {
    match command.status() {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => bail!("command failed with {status}: {command:?}"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            bail!("{}", missing_tool_hint)
        }
        Err(error) => Err(error).with_context(|| format!("failed to start {command:?}")),
    }
}

fn cargo_build(target: &str) -> Result<()> {
    run(Command::new("cargo").current_dir(workspace_root()).args([
        "build",
        "--release",
        "-p",
        "tracer-ffi",
        "--target",
        target,
    ]))
}

fn copy_file(source: impl AsRef<Path>, destination: impl AsRef<Path>) -> Result<()> {
    let source = source.as_ref();
    let destination = destination.as_ref();
    fs::create_dir_all(
        destination
            .parent()
            .context("artifact destination has no parent directory")?,
    )?;
    fs::copy(source, destination)
        .with_context(|| format!("copying {} to {}", source.display(), destination.display()))?;
    Ok(())
}

fn build_all() -> Result<()> {
    test_workspace()?;

    let artifact_dir = artifacts_dir();
    if artifact_dir.exists() {
        fs::remove_dir_all(&artifact_dir)
            .with_context(|| format!("removing {}", artifact_dir.display()))?;
    }
    fs::create_dir_all(&artifact_dir)?;
    copy_file(
        workspace_root().join("crates/tracer-ffi/include/tracer_ffi.h"),
        artifact_dir.join("include/tracer_ffi.h"),
    )?;

    build_web_artifact(&artifact_dir)?;
    build_apple_artifacts(&artifact_dir)?;
    build_android_artifacts(&artifact_dir)?;
    write_manifest(&artifact_dir)?;
    verify_artifacts()
}

fn build_web() -> Result<()> {
    test_workspace()?;

    let artifact_dir = artifacts_dir();
    fs::create_dir_all(&artifact_dir)?;
    build_web_artifact(&artifact_dir)?;
    verify_web_artifacts()
}

fn build_android() -> Result<()> {
    test_workspace()?;
    build_android_artifacts(&artifacts_dir())
}

fn test_workspace() -> Result<()> {
    run(Command::new("cargo").current_dir(workspace_root()).args([
        "test",
        "-p",
        "tracer-core",
        "-p",
        "tracer-ffi",
        "-p",
        "tracer-wasm",
    ]))
}

fn build_web_artifact(artifact_dir: &Path) -> Result<()> {
    let root = workspace_root();
    let rustflags = format!(
        "-C link-arg=--initial-memory={WASM_INITIAL_MEMORY_BYTES} \
         -C link-arg=--max-memory={WASM_MAX_MEMORY_BYTES}"
    );
    let mut cargo = Command::new("cargo");
    cargo
        .current_dir(&root)
        .args([
            "build",
            "--release",
            "-p",
            "tracer-wasm",
            "--target",
            "wasm32-unknown-unknown",
        ])
        .env("RUSTFLAGS", rustflags);
    run(&mut cargo)?;

    let web_dir = artifact_dir.join("web");
    fs::create_dir_all(&web_dir)?;
    let wasm = root.join("target/wasm32-unknown-unknown/release/tracer_wasm.wasm");
    run_with_tool_hint(
        Command::new("wasm-bindgen").args([
            "--target",
            "web",
            "--out-name",
            "trace",
            "--out-dir",
            web_dir
                .to_str()
                .context("web artifact directory is not valid UTF-8")?,
            wasm.to_str()
                .context("wasm output path is not valid UTF-8")?,
        ]),
        "wasm-bindgen CLI is required to build web artifacts. Install it with `cargo install wasm-bindgen-cli`.",
    )?;

    let generated_wasm = web_dir.join("trace_bg.wasm");
    let bundled_wasm = web_dir.join("trace.wasm");
    fs::rename(&generated_wasm, &bundled_wasm)
        .with_context(|| format!("renaming {}", generated_wasm.display()))?;
    let loader = web_dir.join("trace.js");
    let source = fs::read_to_string(&loader)?;
    let source = source
        .replace(
            "import * as import1 from \"env\"\n\n",
            "const import1 = { now: () => Date.now() };\n\n",
        )
        .replace("trace_bg.wasm", "trace.wasm");
    fs::write(&loader, source)?;
    Ok(())
}

fn build_apple_artifacts(artifact_dir: &Path) -> Result<()> {
    if env::consts::OS != "macos" {
        bail!("iOS artifacts require macOS and installed Xcode toolchains");
    }

    cargo_build("aarch64-apple-ios")?;
    cargo_build("aarch64-apple-ios-sim")?;
    cargo_build("x86_64-apple-ios")?;
    let root = workspace_root();
    copy_file(
        root.join("target/aarch64-apple-ios/release/libtracer_ffi.a"),
        artifact_dir.join("ios/iphoneos/libtracer_ffi.a"),
    )?;

    let simulator = artifact_dir.join("ios/iphonesimulator/libtracer_ffi.a");
    fs::create_dir_all(
        simulator
            .parent()
            .context("simulator artifact destination has no parent")?,
    )?;
    run(Command::new("lipo").args([
        "-create",
        root.join("target/aarch64-apple-ios-sim/release/libtracer_ffi.a")
            .to_str()
            .context("Apple simulator library path is not valid UTF-8")?,
        root.join("target/x86_64-apple-ios/release/libtracer_ffi.a")
            .to_str()
            .context("Apple simulator library path is not valid UTF-8")?,
        "-output",
        simulator
            .to_str()
            .context("Apple simulator output path is not valid UTF-8")?,
    ]))?;
    Ok(())
}

fn android_ndk() -> Result<PathBuf> {
    let ndk = env::var_os("ANDROID_NDK_HOME")
        .or_else(|| env::var_os("ANDROID_NDK_ROOT"))
        .context("Android artifacts require ANDROID_NDK_HOME or ANDROID_NDK_ROOT")?;
    Ok(PathBuf::from(ndk))
}

fn android_host_tag() -> Result<&'static str> {
    match (env::consts::OS, env::consts::ARCH) {
        ("windows", _) => Ok("windows-x86_64"),
        ("linux", "x86_64") => Ok("linux-x86_64"),
        ("macos", "aarch64") => Ok("darwin-arm64"),
        ("macos", _) => Ok("darwin-x86_64"),
        _ => bail!("unsupported Android NDK host platform"),
    }
}

fn build_android_artifacts(artifact_dir: &Path) -> Result<()> {
    let ndk = android_ndk()?;
    let bin = ndk
        .join("toolchains/llvm/prebuilt")
        .join(android_host_tag()?)
        .join("bin");
    let root = workspace_root();
    let targets = [
        (
            "aarch64-linux-android",
            "aarch64-linux-android24-clang",
            "arm64-v8a",
        ),
        (
            "armv7-linux-androideabi",
            "armv7a-linux-androideabi24-clang",
            "armeabi-v7a",
        ),
        (
            "x86_64-linux-android",
            "x86_64-linux-android24-clang",
            "x86_64",
        ),
        ("i686-linux-android", "i686-linux-android24-clang", "x86"),
    ];

    for (target, linker, abi) in targets {
        let linker_path = bin.join(format!("{linker}{}", env::consts::EXE_SUFFIX));
        if !linker_path.exists() {
            bail!("missing Android NDK linker {}", linker_path.display());
        }
        let linker_variable = format!(
            "CARGO_TARGET_{}_LINKER",
            target.to_ascii_uppercase().replace('-', "_")
        );
        run(Command::new("cargo")
            .current_dir(&root)
            .args(["build", "--release", "-p", "tracer-ffi", "--target", target])
            .env(linker_variable, linker_path))?;
        copy_file(
            root.join(format!("target/{target}/release/libtracer_ffi.a")),
            artifact_dir.join(format!("android/{abi}/libtracer_ffi.a")),
        )?;
    }
    Ok(())
}

fn required_artifacts() -> [&'static str; 8] {
    [
        "include/tracer_ffi.h",
        "web/trace.js",
        "web/trace.wasm",
        "ios/iphoneos/libtracer_ffi.a",
        "ios/iphonesimulator/libtracer_ffi.a",
        "android/arm64-v8a/libtracer_ffi.a",
        "android/armeabi-v7a/libtracer_ffi.a",
        "android/x86/libtracer_ffi.a",
    ]
}

fn write_manifest(artifact_dir: &Path) -> Result<()> {
    let mut artifacts = BTreeMap::new();
    for relative_path in required_artifacts()
        .into_iter()
        .chain(["android/x86_64/libtracer_ffi.a"].into_iter())
    {
        let artifact = artifact_dir.join(relative_path);
        artifacts.insert(
            relative_path.to_owned(),
            ArtifactEntry {
                sha256: sha256(&artifact)?,
            },
        );
    }
    let manifest = ArtifactManifest {
        core_version: CORE_VERSION.to_owned(),
        artifacts,
    };
    let manifest_path = artifact_dir.join("manifest.json");
    fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)?;
    fs::write(
        artifact_dir.join("checksums.sha256"),
        manifest
            .artifacts
            .iter()
            .map(|(path, entry)| format!("{}  {path}", entry.sha256))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n",
    )?;
    Ok(())
}

fn verify_artifacts() -> Result<()> {
    let artifact_dir = artifacts_dir();
    let manifest_path = artifact_dir.join("manifest.json");
    let manifest: ArtifactManifest = serde_json::from_slice(
        &fs::read(&manifest_path)
            .with_context(|| format!("missing artifact manifest {}", manifest_path.display()))?,
    )?;
    if manifest.core_version != CORE_VERSION {
        bail!(
            "artifact manifest core version {} does not match {}",
            manifest.core_version,
            CORE_VERSION
        );
    }

    for required in required_artifacts()
        .into_iter()
        .chain(["android/x86_64/libtracer_ffi.a"].into_iter())
    {
        let entry = manifest
            .artifacts
            .get(required)
            .with_context(|| format!("manifest is missing {required}"))?;
        let artifact = artifact_dir.join(required);
        if sha256(&artifact)? != entry.sha256 {
            bail!("checksum mismatch for {}", artifact.display());
        }
        if required.ends_with(".wasm") || required.ends_with(".a") {
            let bytes = fs::read(&artifact)?;
            if !bytes
                .windows(CORE_VERSION.len())
                .any(|window| window == CORE_VERSION.as_bytes())
            {
                bail!(
                    "{} does not contain core version {}",
                    artifact.display(),
                    CORE_VERSION
                );
            }
        }
    }

    verify_web_artifacts()
}

fn verify_web_artifacts() -> Result<()> {
    let artifact_dir = artifacts_dir();
    let loader = fs::read_to_string(artifact_dir.join("web/trace.js"))?;
    if !loader.contains("WebAssembly.instantiateStreaming")
        || !loader.contains("trace.wasm")
        || loader.contains("from \"env\"")
        || !artifact_dir.join("web/trace.wasm").is_file()
    {
        bail!("generated web loader does not resolve the bundled WASM asset");
    }
    Ok(())
}

fn sha256(path: &Path) -> Result<String> {
    let bytes = fs::read(path).with_context(|| format!("missing artifact {}", path.display()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
