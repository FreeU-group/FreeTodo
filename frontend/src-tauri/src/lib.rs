//! FreeTodo - Tauri Application Library
//!
//! This module contains the core functionality for the FreeTodo desktop application,
//! including API proxying, Next.js server management, system tray, and global shortcuts.
//!
//! The application currently ships a single Web mode desktop shell.

pub mod backend;
mod backend_proxy;
pub mod config;
pub mod nextjs;
pub mod shortcut;
pub mod tray;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use log::info;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Initialize the Tauri application with all required plugins and setup
/// Note: Currently only Web mode is supported
pub fn run() {
    // Initialize logger
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Starting FreeTodo application...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            info!("Application setup starting...");

            // Start the local API proxy that forwards to the configured remote backend.
            let backend_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = backend::start_backend(&backend_handle).await {
                    log::error!("Failed to start backend: {}", e);
                }
            });

            // Start the bundled Next.js standalone server (only in release mode).
            #[cfg(not(debug_assertions))]
            {
                let nextjs_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = nextjs::start_nextjs(&nextjs_handle).await {
                        log::error!("Failed to start Next.js: {}", e);
                    }
                });
            }

            // Setup system tray
            tray::setup_tray(app)?;

            // Setup global shortcuts
            shortcut::setup_shortcuts(app)?;

            info!("Application setup completed");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            get_backend_status,
            toggle_window,
            show_window,
            hide_window,
            preview_read_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Get the backend server URL
#[tauri::command]
fn get_backend_url() -> String {
    backend::get_backend_url()
}

/// Get backend server health status
#[tauri::command]
async fn get_backend_status() -> Result<bool, String> {
    backend::check_backend_health(config::get_backend_port())
        .await
        .map_err(|e| e.to_string())
}

/// Toggle main window visibility
#[tauri::command]
fn toggle_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Show main window
#[tauri::command]
fn show_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hide main window
#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewReadResponse {
    ok: bool,
    path: Option<String>,
    name: Option<String>,
    size: Option<u64>,
    modified_at: Option<u64>,
    text: Option<String>,
    base64: Option<String>,
    error: Option<String>,
}

fn preview_file_name(path: &Path) -> Option<String> {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
}

#[tauri::command]
fn preview_read_file(path: String, mode: String, max_bytes: Option<u64>) -> PreviewReadResponse {
    let resolved = PathBuf::from(path.clone());
    let name = preview_file_name(&resolved);
    let metadata = match fs::metadata(&resolved) {
        Ok(meta) => meta,
        Err(err) => {
            return PreviewReadResponse {
                ok: false,
                path: Some(path),
                name,
                size: None,
                modified_at: None,
                text: None,
                base64: None,
                error: Some(err.to_string()),
            }
        }
    };

    if !metadata.is_file() {
        return PreviewReadResponse {
            ok: false,
            path: Some(path),
            name,
            size: None,
            modified_at: None,
            text: None,
            base64: None,
            error: Some("Path is not a file".to_string()),
        };
    }

    let size = metadata.len();
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    let default_limit = if mode == "text" {
        2 * 1024 * 1024
    } else {
        50 * 1024 * 1024
    };
    let limit = max_bytes.unwrap_or(default_limit);
    if size > limit {
        return PreviewReadResponse {
            ok: false,
            path: Some(path),
            name,
            size: Some(size),
            modified_at,
            text: None,
            base64: None,
            error: Some("File exceeds preview size limit".to_string()),
        };
    }

    if mode == "text" {
        match fs::read_to_string(&resolved) {
            Ok(text) => PreviewReadResponse {
                ok: true,
                path: Some(path),
                name,
                size: Some(size),
                modified_at,
                text: Some(text),
                base64: None,
                error: None,
            },
            Err(err) => PreviewReadResponse {
                ok: false,
                path: Some(path),
                name,
                size: Some(size),
                modified_at,
                text: None,
                base64: None,
                error: Some(err.to_string()),
            },
        }
    } else {
        match fs::read(&resolved) {
            Ok(bytes) => PreviewReadResponse {
                ok: true,
                path: Some(path),
                name,
                size: Some(size),
                modified_at,
                text: None,
                base64: Some(STANDARD.encode(bytes)),
                error: None,
            },
            Err(err) => PreviewReadResponse {
                ok: false,
                path: Some(path),
                name,
                size: Some(size),
                modified_at,
                text: None,
                base64: None,
                error: Some(err.to_string()),
            },
        }
    }
}
