//! Python runtime helpers for backend bootstrap

use futures_util::StreamExt;
use serde::Deserialize;
use std::fs;
use std::io;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

const UV_PYTHON_VERSION: &str = "3.12";

enum UvArchiveKind {
    Zip,
    TarGz,
}

#[derive(Deserialize)]
struct PythonInfo {
    version: String,
    executable: String,
}

pub fn get_venv_python_path(venv_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        return venv_dir.join("Scripts").join("python.exe");
    }
    venv_dir.join("bin").join("python3")
}

fn get_venv_uv_path(venv_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        return venv_dir.join("Scripts").join("uv.exe");
    }
    venv_dir.join("bin").join("uv")
}

fn is_mainland_china() -> bool {
    if let Ok(value) = std::env::var("FREETODO_REGION") {
        let normalized = value.to_lowercase();
        if normalized == "cn" {
            return true;
        }
        if normalized == "global" || normalized == "intl" {
            return false;
        }
    }
    if let Ok(lang) = std::env::var("LANG") {
        if lang.to_lowercase().starts_with("zh_cn") {
            return true;
        }
    }
    false
}

fn build_uv_env() -> Vec<(String, String)> {
    if is_mainland_china() {
        vec![
            (
                "UV_INDEX_URL".to_string(),
                "https://pypi.tuna.tsinghua.edu.cn/simple".to_string(),
            ),
            (
                "UV_EXTRA_INDEX_URL".to_string(),
                "https://pypi.org/simple".to_string(),
            ),
            (
                "PIP_INDEX_URL".to_string(),
                "https://pypi.tuna.tsinghua.edu.cn/simple".to_string(),
            ),
            (
                "PIP_EXTRA_INDEX_URL".to_string(),
                "https://pypi.org/simple".to_string(),
            ),
        ]
    } else {
        vec![
            (
                "UV_INDEX_URL".to_string(),
                "https://pypi.org/simple".to_string(),
            ),
            (
                "PIP_INDEX_URL".to_string(),
                "https://pypi.org/simple".to_string(),
            ),
        ]
    }
}

pub fn uv_env_pairs() -> Vec<(String, String)> {
    build_uv_env()
}

pub fn get_runtime_uv_path(runtime_root: &Path) -> PathBuf {
    if cfg!(windows) {
        return runtime_root.join("uv").join("uv.exe");
    }
    runtime_root.join("uv").join("uv")
}

pub struct DownloadProgress {
    pub received_bytes: u64,
    pub total_bytes: Option<u64>,
}

fn uv_archive_kind() -> Result<UvArchiveKind, String> {
    if cfg!(windows) {
        return Ok(UvArchiveKind::Zip);
    }
    if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
        return Ok(UvArchiveKind::TarGz);
    }
    Err("Unsupported OS for uv download".to_string())
}

fn uv_download_url() -> Result<&'static str, String> {
    if cfg!(windows) {
        if cfg!(target_arch = "x86_64") {
            return Ok(
                "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip",
            );
        }
        if cfg!(target_arch = "aarch64") {
            return Ok(
                "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-pc-windows-msvc.zip",
            );
        }
        return Err("Unsupported Windows architecture for uv download".to_string());
    }
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "x86_64") {
            return Ok(
                "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-apple-darwin.tar.gz",
            );
        }
        if cfg!(target_arch = "aarch64") {
            return Ok(
                "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-apple-darwin.tar.gz",
            );
        }
        return Err("Unsupported macOS architecture for uv download".to_string());
    }
    if cfg!(target_os = "linux") {
        if cfg!(target_arch = "x86_64") {
            return Ok(
                "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz",
            );
        }
        if cfg!(target_arch = "aarch64") {
            return Ok(
                "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-unknown-linux-gnu.tar.gz",
            );
        }
        return Err("Unsupported Linux architecture for uv download".to_string());
    }
    Err("Unsupported OS for uv download".to_string())
}

fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = dest_dir.join(entry.mangled_name());
        if entry.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let decompressor = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);
    archive.unpack(dest_dir).map_err(|e| e.to_string())?;
    Ok(())
}

fn find_uv_binary(root: &Path) -> Option<PathBuf> {
    let filename = if cfg!(windows) { "uv.exe" } else { "uv" };
    let direct = root.join(filename);
    if direct.exists() {
        return Some(direct);
    }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_dir() {
            let nested = path.join(filename);
            if nested.exists() {
                return Some(nested);
            }
        }
    }
    None
}

async fn download_with_progress<F>(
    url: &str,
    archive_path: &Path,
    mut progress: F,
) -> Result<(), String>
where
    F: FnMut(DownloadProgress) + Send,
{
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download uv: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download uv (status {})",
            response.status()
        ));
    }

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file =
        fs::File::create(archive_path).map_err(|e| format!("Failed to save uv archive: {}", e))?;
    let mut received: u64 = 0;
    let mut last_percent: Option<u8> = None;
    let mut last_emit_bytes: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Failed to read uv archive: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write uv archive: {}", e))?;
        received += chunk.len() as u64;

        let percent = total.map(|t| ((received * 100) / t).min(100) as u8);
        let should_emit = match percent {
            Some(value) => last_percent != Some(value),
            None => received.saturating_sub(last_emit_bytes) >= 1_048_576,
        };
        if should_emit {
            progress(DownloadProgress {
                received_bytes: received,
                total_bytes: total,
            });
            last_percent = percent;
            last_emit_bytes = received;
        }
    }

    progress(DownloadProgress {
        received_bytes: received,
        total_bytes: total,
    });

    Ok(())
}

pub async fn ensure_uv_binary_with_progress<F>(
    runtime_root: &Path,
    progress: F,
) -> Result<PathBuf, String>
where
    F: FnMut(DownloadProgress) + Send,
{
    let uv_path = get_runtime_uv_path(runtime_root);
    if uv_path.exists() {
        return Ok(uv_path);
    }

    let uv_dir = uv_path
        .parent()
        .ok_or("Invalid uv path for runtime directory")?;
    fs::create_dir_all(uv_dir).map_err(|e| format!("Failed to create uv dir: {}", e))?;

    let url = uv_download_url()?;
    let archive_kind = uv_archive_kind()?;
    let archive_path = match archive_kind {
        UvArchiveKind::Zip => uv_dir.join("uv.zip"),
        UvArchiveKind::TarGz => uv_dir.join("uv.tar.gz"),
    };

    download_with_progress(url, &archive_path, progress).await?;

    match archive_kind {
        UvArchiveKind::Zip => extract_zip(&archive_path, uv_dir)?,
        UvArchiveKind::TarGz => extract_tar_gz(&archive_path, uv_dir)?,
    }
    let _ = fs::remove_file(&archive_path);

    let uv_path = if uv_path.exists() {
        uv_path
    } else {
        find_uv_binary(uv_dir).ok_or("uv binary not found after extraction")?
    };

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&uv_path)
            .map_err(|e| format!("Failed to read uv permissions: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&uv_path, perms)
            .map_err(|e| format!("Failed to set uv permissions: {}", e))?;
    }

    Ok(uv_path)
}

fn run_command(command: &str, args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = Command::new(command);
    cmd.args(args);
    for (key, value) in envs {
        cmd.env(key, value);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn get_python_info(command: &str, args: &[&str]) -> Option<PythonInfo> {
    let mut full_args = args.to_vec();
    full_args.extend_from_slice(&[
        "-c",
        "import json, sys; print(json.dumps({'version': f'{sys.version_info[0]}.{sys.version_info[1]}', 'executable': sys.executable}))",
    ]);
    let output = run_command(command, &full_args, &[]).ok()?;
    let line = output.lines().next()?.trim();
    serde_json::from_str(line).ok()
}

pub fn find_python312() -> Option<PathBuf> {
    let mut candidates: Vec<(&str, Vec<&str>)> = Vec::new();
    if cfg!(windows) {
        candidates.push(("py", vec!["-3.12"]));
        candidates.push(("python3.12", vec![]));
        candidates.push(("python", vec![]));
    } else {
        candidates.push(("python3.12", vec![]));
        candidates.push(("python3", vec![]));
        candidates.push(("python", vec![]));
    }

    for (command, args) in candidates {
        if let Some(info) = get_python_info(command, &args) {
            if info.version == "3.12" && !info.executable.is_empty() {
                return Some(PathBuf::from(info.executable));
            }
        }
    }
    None
}

pub fn ensure_venv(python_path: &Path, venv_dir: &Path) -> Result<PathBuf, String> {
    let venv_python = get_venv_python_path(venv_dir);
    if venv_python.exists() {
        return Ok(venv_python);
    }
    std::fs::create_dir_all(venv_dir).map_err(|e| format!("Failed to create venv dir: {}", e))?;
    run_command(
        python_path.to_str().ok_or("Invalid python path")?,
        &["-m", "venv", venv_dir.to_str().ok_or("Invalid venv path")?],
        &[],
    )?;
    if venv_python.exists() {
        Ok(venv_python)
    } else {
        Err("Failed to create virtual environment".to_string())
    }
}

pub fn ensure_uv(venv_python: &Path, venv_dir: &Path) -> Result<PathBuf, String> {
    let uv_path = get_venv_uv_path(venv_dir);
    if uv_path.exists() {
        return Ok(uv_path);
    }
    run_command(
        venv_python.to_str().ok_or("Invalid venv python path")?,
        &["-m", "pip", "install", "--upgrade", "uv"],
        &[],
    )?;
    if uv_path.exists() {
        Ok(uv_path)
    } else {
        Err("Failed to install uv in virtual environment".to_string())
    }
}

pub fn ensure_uv_python(uv_path: &Path) -> Result<(), String> {
    let env_pairs = build_uv_env();
    let env_refs: Vec<(&str, &str)> = env_pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    run_command(
        uv_path.to_str().ok_or("Invalid uv path")?,
        &["python", "install", UV_PYTHON_VERSION],
        &env_refs,
    )?;
    Ok(())
}

pub fn ensure_uv_venv(uv_path: &Path, venv_dir: &Path) -> Result<PathBuf, String> {
    let venv_python = get_venv_python_path(venv_dir);
    if venv_python.exists() {
        return Ok(venv_python);
    }
    fs::create_dir_all(venv_dir).map_err(|e| format!("Failed to create venv dir: {}", e))?;
    let env_pairs = build_uv_env();
    let env_refs: Vec<(&str, &str)> = env_pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    run_command(
        uv_path.to_str().ok_or("Invalid uv path")?,
        &[
            "venv",
            venv_dir.to_str().ok_or("Invalid venv path")?,
            "--python",
            UV_PYTHON_VERSION,
        ],
        &env_refs,
    )?;
    if venv_python.exists() {
        Ok(venv_python)
    } else {
        Err("Failed to create virtual environment with uv".to_string())
    }
}

pub fn install_requirements(
    uv_path: &Path,
    venv_python: &Path,
    requirements_path: &Path,
) -> Result<(), String> {
    let env_pairs = build_uv_env();
    let env_refs: Vec<(&str, &str)> = env_pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    run_command(
        uv_path.to_str().ok_or("Invalid uv path")?,
        &[
            "pip",
            "install",
            "-r",
            requirements_path
                .to_str()
                .ok_or("Invalid requirements path")?,
            "--python",
            venv_python.to_str().ok_or("Invalid venv python path")?,
        ],
        &env_refs,
    )?;
    Ok(())
}
