//! Backend path resolution helpers

use crate::config::{process, ServerMode};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Get backend executable path for PyInstaller runtime
pub fn get_backend_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let packaged_backend = resource_path
        .join("backend")
        .join(process::BACKEND_EXEC_NAME);
    if packaged_backend.exists() {
        return Ok(packaged_backend);
    }

    let packaged_dist = resource_path
        .join("dist-backend")
        .join(process::BACKEND_EXEC_NAME);
    if packaged_dist.exists() {
        return Ok(packaged_dist);
    }

    // Development mode: try dist-backend
    let dev_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get current dir: {}", e))?
        .parent()
        .ok_or("Failed to get parent dir")?
        .join("dist-backend")
        .join(process::BACKEND_EXEC_NAME);

    if dev_path.exists() {
        Ok(dev_path)
    } else {
        Err(format!(
            "Backend executable not found at {:?} or {:?} or {:?}",
            packaged_backend, packaged_dist, dev_path
        ))
    }
}

/// Locate backend script root (for script runtime)
pub fn get_backend_script_root(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let candidates = [
        resource_path.join("backend"),
        resource_path.join("lifetrace"),
    ];

    for candidate in candidates {
        let script_path = candidate
            .join("lifetrace")
            .join("scripts")
            .join("start_backend.py");
        if script_path.exists() {
            return Ok(candidate);
        }
        let direct_script = candidate.join("scripts").join("start_backend.py");
        if direct_script.exists() {
            return Ok(candidate);
        }
    }

    // Development fallback
    let dev_root = std::env::current_dir()
        .map_err(|e| format!("Failed to get current dir: {}", e))?
        .parent()
        .ok_or("Failed to get parent dir")?
        .to_path_buf();
    if dev_root
        .join("lifetrace")
        .join("scripts")
        .join("start_backend.py")
        .exists()
    {
        return Ok(dev_root);
    }

    Err("Backend script not found in resources".to_string())
}

pub fn get_backend_script_entry(root: &Path) -> PathBuf {
    let nested = root
        .join("lifetrace")
        .join("scripts")
        .join("start_backend.py");
    if nested.exists() {
        return nested;
    }
    root.join("scripts").join("start_backend.py")
}

pub fn get_requirements_path(root: &Path) -> PathBuf {
    let nested = root.join("requirements-runtime.txt");
    if nested.exists() {
        return nested;
    }
    if let Some(parent) = root.parent() {
        let parent_req = parent.join("requirements-runtime.txt");
        if parent_req.exists() {
            return parent_req;
        }
    }
    let fallback = root.join("backend").join("requirements-runtime.txt");
    if fallback.exists() {
        return fallback;
    }
    nested
}

pub fn get_runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let runtime_dir = data_dir.join("runtime");
    if !runtime_dir.exists() {
        std::fs::create_dir_all(&runtime_dir)
            .map_err(|e| format!("Failed to create runtime dir: {}", e))?;
    }
    Ok(runtime_dir)
}

/// Get data directory for backend
pub fn get_data_dir(app: &AppHandle, mode: ServerMode) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let legacy_dir = app_data_dir.join(process::BACKEND_DATA_DIR);
    let mode_suffix = match mode {
        ServerMode::Dev => "dev",
        ServerMode::Build => "build",
    };
    let mode_dir = app_data_dir.join(format!("{}-{}", process::BACKEND_DATA_DIR, mode_suffix));

    let data_dir = if mode == ServerMode::Build && legacy_dir.exists() {
        legacy_dir
    } else {
        mode_dir
    };

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;
    }

    Ok(data_dir)
}
