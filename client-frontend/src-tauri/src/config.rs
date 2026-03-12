//! Configuration constants for FreeTodo
//!
//! Centralized configuration management for ports, timeouts, and paths.
//!
//! ## Window Modes
//!
//! The application supports two window modes (matching Electron):
//! - **Web**: Standard window (1200x800, with decorations)
//! - **Island**: Transparent floating window (separate build config)

use std::env;

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

/// Process configuration
pub mod process {
    /// Backend executable name (platform-specific)
    #[cfg(windows)]
    pub const BACKEND_EXEC_NAME: &str = "lifetrace.exe";

    #[cfg(not(windows))]
    pub const BACKEND_EXEC_NAME: &str = "lifetrace";

    /// Backend data directory name
    pub const BACKEND_DATA_DIR: &str = "lifetrace-data";
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
    format!("http://127.0.0.1:{}", get_backend_port())
}

/// Get frontend URL
pub fn get_frontend_url() -> String {
    format!("http://localhost:{}", get_frontend_port())
}
