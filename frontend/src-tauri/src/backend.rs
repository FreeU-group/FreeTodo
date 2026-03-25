//! Remote backend proxy management for the desktop app.

use crate::backend_proxy::{start_proxy_server, ProxyState};
use crate::config::{self, ServerMode};
use log::info;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

struct BackendState {
    proxy_started: AtomicBool,
    ready: AtomicBool,
    proxy_port: AtomicU16,
    remote_api_url: Mutex<Option<String>>,
}

static STATE: OnceLock<BackendState> = OnceLock::new();

fn state() -> &'static BackendState {
    STATE.get_or_init(|| BackendState {
        proxy_started: AtomicBool::new(false),
        ready: AtomicBool::new(false),
        proxy_port: AtomicU16::new(0),
        remote_api_url: Mutex::new(None),
    })
}

fn server_mode() -> ServerMode {
    ServerMode::current()
}

pub fn get_backend_url() -> String {
    let port = state().proxy_port.load(Ordering::Relaxed);
    if port == 0 {
        config::get_local_proxy_url()
    } else {
        format!("http://127.0.0.1:{}", port)
    }
}

pub fn get_remote_backend_url() -> Option<String> {
    state()
        .remote_api_url
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

pub async fn check_backend_health(
    _port: u16,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    Ok(state().ready.load(Ordering::Relaxed))
}

pub async fn start_backend(
    app: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let remote_api_url = config::get_remote_backend_url(app)?;
    let proxy_port = config::ports::backend_port(server_mode());
    let proxy_url = format!("http://127.0.0.1:{}", proxy_port);

    state().proxy_port.store(proxy_port, Ordering::Relaxed);
    state().ready.store(true, Ordering::Relaxed);
    if let Ok(mut guard) = state().remote_api_url.lock() {
        *guard = Some(remote_api_url.clone());
    }

    if !state().proxy_started.swap(true, Ordering::Relaxed) {
        start_proxy_server(proxy_port, ProxyState::new(remote_api_url.clone())).await?;
    }

    info!("Remote backend target: {}", remote_api_url);
    info!("Local API proxy listening at {}", proxy_url);
    Ok(())
}

pub fn stop_backend() {}

pub fn cleanup() {}
