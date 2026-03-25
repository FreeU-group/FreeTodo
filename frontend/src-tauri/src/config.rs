//! Configuration constants for FreeTodo
//!
//! Centralized configuration management for ports, timeouts, and paths.
//!
//! This desktop shell uses a single Web window configuration.

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Server mode (development or production)
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ServerMode {
    Dev,
    Build,
}

impl ServerMode {
    /// Get current server mode based on build configuration
    pub fn current() -> Self {
        if let Ok(mode) = env::var("SERVER_MODE") {
            if mode.eq_ignore_ascii_case("dev") {
                return ServerMode::Dev;
            }
            if mode.eq_ignore_ascii_case("build") {
                return ServerMode::Build;
            }
        }
        if cfg!(debug_assertions) {
            ServerMode::Dev
        } else {
            ServerMode::Build
        }
    }
}

/// Port configuration based on server mode
pub mod ports {
    use super::ServerMode;

    /// Dev mode ports
    pub const DEV_FRONTEND_PORT: u16 = 3001;
    pub const DEV_BACKEND_PORT: u16 = 8001;
    pub const DEV_BACKEND_RANGE_START: u16 = 8002;
    pub const DEV_BACKEND_RANGE_END: u16 = 8099;

    /// Build mode ports
    pub const BUILD_FRONTEND_PORT: u16 = 3100;
    pub const BUILD_BACKEND_PORT: u16 = 8100;
    pub const BUILD_BACKEND_RANGE_START: u16 = 8101;
    pub const BUILD_BACKEND_RANGE_END: u16 = 8199;

    /// Get frontend port for current mode
    pub fn frontend_port(mode: ServerMode) -> u16 {
        match mode {
            ServerMode::Dev => DEV_FRONTEND_PORT,
            ServerMode::Build => BUILD_FRONTEND_PORT,
        }
    }

    /// Get backend port for current mode
    pub fn backend_port(mode: ServerMode) -> u16 {
        match mode {
            ServerMode::Dev => DEV_BACKEND_PORT,
            ServerMode::Build => BUILD_BACKEND_PORT,
        }
    }
}

/// Timeout configuration (in milliseconds)
pub mod timeouts {
    /// Backend ready timeout (3 minutes)
    pub const BACKEND_READY: u64 = 180_000;

    /// Frontend ready timeout (30 seconds)
    pub const FRONTEND_READY: u64 = 30_000;

    /// Health check timeout (5 seconds)
    pub const HEALTH_CHECK: u64 = 5_000;

    /// Health check retry interval (500ms)
    pub const HEALTH_CHECK_RETRY: u64 = 500;
}

/// Health check intervals (in milliseconds)
pub mod health_check {
    /// Frontend health check interval (10 seconds)
    pub const FRONTEND_INTERVAL: u64 = 10_000;

    /// Backend health check interval (30 seconds)
    pub const BACKEND_INTERVAL: u64 = 30_000;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    pub api_base_url: String,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            api_base_url: "http://127.0.0.1:8001".to_string(),
        }
    }
}

const DEFAULT_DESKTOP_CONFIG_JSON: &str = "{\n  \"apiBaseUrl\": \"http://127.0.0.1:8001\"\n}\n";

fn bundled_desktop_config(app: &AppHandle) -> Option<String> {
    let resource_dir = app.path().resource_dir().ok()?;
    let bundled_path = resource_dir.join("desktop-config.default.json");
    fs::read_to_string(bundled_path).ok()
}

pub fn get_desktop_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create app config dir: {}", e))?;
    }
    Ok(config_dir.join("config.json"))
}

pub fn ensure_desktop_config(app: &AppHandle) -> Result<DesktopConfig, String> {
    let config_path = get_desktop_config_path(app)?;

    if !config_path.exists() {
        let template =
            bundled_desktop_config(app).unwrap_or_else(|| DEFAULT_DESKTOP_CONFIG_JSON.to_string());
        fs::write(&config_path, template)
            .map_err(|e| format!("Failed to write desktop config: {}", e))?;
    }

    let raw = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read desktop config: {}", e))?;
    let parsed: DesktopConfig =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse desktop config: {}", e))?;
    let api_base_url = parsed.api_base_url.trim().trim_end_matches('/').to_string();
    if api_base_url.is_empty() {
        return Err(format!(
            "Desktop config is missing apiBaseUrl: {:?}",
            config_path
        ));
    }

    Ok(DesktopConfig { api_base_url })
}

pub fn get_remote_backend_url(app: &AppHandle) -> Result<String, String> {
    Ok(ensure_desktop_config(app)?.api_base_url)
}

pub fn get_local_proxy_url() -> String {
    format!("http://127.0.0.1:{}", get_backend_port())
}

/// Get the default backend port based on environment or mode
pub fn get_backend_port() -> u16 {
    if let Ok(port) = env::var("BACKEND_PORT") {
        if let Ok(p) = port.parse() {
            return p;
        }
    }
    ports::backend_port(ServerMode::current())
}

/// Get the default frontend port based on environment or mode
pub fn get_frontend_port() -> u16 {
    if let Ok(port) = env::var("PORT") {
        if let Ok(p) = port.parse() {
            return p;
        }
    }
    ports::frontend_port(ServerMode::current())
}

/// Get backend URL
pub fn get_backend_url() -> String {
    get_local_proxy_url()
}

/// Get frontend URL
pub fn get_frontend_url() -> String {
    format!("http://localhost:{}", get_frontend_port())
}
