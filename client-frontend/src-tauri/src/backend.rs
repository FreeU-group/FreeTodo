//! Python Backend Sidecar Management
//!
//! This module handles the lifecycle of the Python backend server,
//! including starting, health checking, proxying, and stopping the process.

use crate::backend_log::{emit_backend_log, format_download_progress, spawn_log_reader};
use crate::backend_paths::{
    get_backend_path, get_backend_script_entry, get_backend_script_root, get_data_dir,
    get_requirements_path, get_runtime_root,
};
use crate::backend_proxy::{start_proxy_server, ProxyState};
use crate::backend_python::{
    ensure_uv, ensure_uv_binary_with_progress, ensure_uv_python, ensure_uv_venv, ensure_venv,
    find_python312, install_requirements, uv_env_pairs,
};
use crate::backend_support::{
    check_backend_health as check_backend_health_with_timeout, detect_running_backend_port,
    is_lifetrace_backend, pick_backend_port, verify_backend_mode, wait_for_backend,
};
use crate::config::{self, timeouts, ServerMode};
use log::{error, info, warn};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

struct BackendState {
    backend_port: Arc<AtomicU16>,
    ready: Arc<AtomicBool>,
    proxy_port: AtomicU16,
    stopping: AtomicBool,
    proxy_started: AtomicBool,
    process: Mutex<Option<Child>>,
    uv_synced: AtomicBool,
}

static STATE: OnceLock<BackendState> = OnceLock::new();

fn state() -> &'static BackendState {
    STATE.get_or_init(|| BackendState {
        backend_port: Arc::new(AtomicU16::new(0)),
        ready: Arc::new(AtomicBool::new(false)),
        proxy_port: AtomicU16::new(0),
        stopping: AtomicBool::new(false),
        proxy_started: AtomicBool::new(false),
        process: Mutex::new(None),
        uv_synced: AtomicBool::new(false),
    })
}

/// Backend runtime type
#[derive(Debug, Clone, Copy, PartialEq)]
enum BackendRuntime {
    Uv,
    Script,
    PyInstaller,
}

/// Determine backend runtime from env or build-time default
fn get_backend_runtime() -> BackendRuntime {
    if let Ok(value) = std::env::var("FREETODO_BACKEND_RUNTIME") {
        let normalized = value.to_lowercase();
        if normalized == "uv" || normalized == "uv-run" || normalized == "uvrun" {
            return BackendRuntime::Uv;
        }
        if normalized == "pyinstaller" {
            return BackendRuntime::PyInstaller;
        }
        if normalized == "script" {
            return BackendRuntime::Script;
        }
    }

    if let Some(value) = option_env!("FREETODO_BACKEND_RUNTIME") {
        if value.eq_ignore_ascii_case("pyinstaller") {
            return BackendRuntime::PyInstaller;
        }
        if value.eq_ignore_ascii_case("script") {
            return BackendRuntime::Script;
        }
        if value.eq_ignore_ascii_case("uv") || value.eq_ignore_ascii_case("uv-run") {
            return BackendRuntime::Uv;
        }
    }

    BackendRuntime::Uv
}

fn run_uv_sync_if_needed(backend_root: &Path) -> Result<(), String> {
    let state = state();
    if state.uv_synced.load(Ordering::Relaxed) {
        return Ok(());
    }

    let mut cmd = Command::new("uv");
    cmd.arg("sync").current_dir(backend_root);
    for (key, value) in uv_env_pairs() {
        cmd.env(key, value);
    }

    let status = cmd
        .status()
        .map_err(|e| format!("Failed to run uv sync: {}", e))?;
    if status.success() {
        state.uv_synced.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err(format!("uv sync failed with status {}", status))
    }
}

fn server_mode() -> ServerMode {
    ServerMode::current()
}

fn mode_label(mode: ServerMode) -> &'static str {
    match mode {
        ServerMode::Dev => "dev",
        ServerMode::Build => "build",
    }
}

const BACKEND_LOG_LABEL: &str = "backend";

/// Get the backend URL (proxy port)
pub fn get_backend_url() -> String {
    let port = state().proxy_port.load(Ordering::Relaxed);
    let port = if port == 0 {
        config::ports::backend_port(server_mode())
    } else {
        port
    };
    format!("http://127.0.0.1:{}", port)
}

/// Check backend health
pub async fn check_backend_health(
    port: u16,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    check_backend_health_with_timeout(port, timeouts::HEALTH_CHECK).await
}

/// Start the Python backend server (with proxy)
pub async fn start_backend(
    app: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = state();
    let mode = server_mode();
    let proxy_port = config::ports::backend_port(mode);

    state.stopping.store(false, Ordering::Relaxed);
    state.backend_port.store(0, Ordering::Relaxed);
    state.ready.store(false, Ordering::Relaxed);
    state.proxy_port.store(proxy_port, Ordering::Relaxed);

    if !state.proxy_started.swap(true, Ordering::Relaxed) {
        let proxy_state = ProxyState::new(state.backend_port.clone(), state.ready.clone());
        if let Err(err) = start_proxy_server(proxy_port, proxy_state).await {
            state.proxy_started.store(false, Ordering::Relaxed);
            if is_lifetrace_backend(proxy_port).await {
                warn!(
                    "Proxy port {} already has a backend instance, using it directly",
                    proxy_port
                );
                state.backend_port.store(proxy_port, Ordering::Relaxed);
                state.ready.store(true, Ordering::Relaxed);
            } else {
                return Err(err.into());
            }
        }
    }

    let app_handle = app.clone();
    tokio::spawn(async move {
        if let Err(err) = backend_supervisor(app_handle, mode).await {
            error!("Backend supervisor exited: {}", err);
        }
    });

    Ok(())
}

async fn backend_supervisor(app: AppHandle, mode: ServerMode) -> Result<(), String> {
    let state = state();
    let mut backoff = Duration::from_millis(500);
    let max_backoff = Duration::from_secs(10);
    let interval = Duration::from_millis(config::health_check::BACKEND_INTERVAL);

    loop {
        if state.stopping.load(Ordering::Relaxed) {
            break;
        }

        let mut exited = false;
        let mut managed = false;
        {
            let mut guard = state.process.lock().unwrap();
            if let Some(child) = guard.as_mut() {
                managed = true;
                match child.try_wait() {
                    Ok(Some(status)) => {
                        warn!("Backend exited: {}", status);
                        *guard = None;
                        exited = true;
                    }
                    Ok(None) => {}
                    Err(err) => {
                        warn!("Failed to check backend status: {}", err);
                    }
                }
            }
        }

        if exited {
            state.ready.store(false, Ordering::Relaxed);
            state.backend_port.store(0, Ordering::Relaxed);
        }

        let backend_port = state.backend_port.load(Ordering::Relaxed);

        if managed {
            if backend_port != 0 {
                let healthy = check_backend_health(backend_port).await.unwrap_or(false);
                state.ready.store(healthy, Ordering::Relaxed);
                if !healthy {
                    warn!("Backend health check failed");
                }
            }
            tokio::time::sleep(interval).await;
            continue;
        }

        if backend_port != 0 {
            let healthy = check_backend_health(backend_port).await.unwrap_or(false);
            if healthy {
                state.ready.store(true, Ordering::Relaxed);
                tokio::time::sleep(interval).await;
                continue;
            }
            state.ready.store(false, Ordering::Relaxed);
            state.backend_port.store(0, Ordering::Relaxed);
        }

        if let Some(port) = detect_running_backend_port(mode).await {
            state.backend_port.store(port, Ordering::Relaxed);
            state.ready.store(true, Ordering::Relaxed);
            backoff = Duration::from_millis(500);
            tokio::time::sleep(interval).await;
            continue;
        }

        match start_backend_process(&app, mode).await {
            Ok(port) => {
                state.backend_port.store(port, Ordering::Relaxed);
                state.ready.store(true, Ordering::Relaxed);
                backoff = Duration::from_millis(500);
                emit_backend_log(&app, format!("Backend ready on port {}", port));
            }
            Err(err) => {
                state.ready.store(false, Ordering::Relaxed);
                warn!("Failed to start backend: {}", err);
                emit_backend_log(&app, format!("Backend start failed: {}", err));
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(max_backoff);
            }
        }

        tokio::time::sleep(interval).await;
    }

    Ok(())
}

async fn start_backend_process(app: &AppHandle, mode: ServerMode) -> Result<u16, String> {
    let state = state();
    let backend_runtime = get_backend_runtime();
    let port = pick_backend_port(mode)?;
    let mode_label = mode_label(mode);

    state.ready.store(false, Ordering::Relaxed);

    let backend_path = if backend_runtime == BackendRuntime::PyInstaller {
        get_backend_path(app).map_err(|e| {
            warn!("Backend executable not found: {}", e);
            e
        })?
    } else {
        let backend_root = get_backend_script_root(app)?;
        get_backend_script_entry(&backend_root)
    };

    let data_dir = get_data_dir(app, mode)?;
    let mut backend_workdir = backend_path.parent().unwrap_or(&backend_path).to_path_buf();

    let mut command = if backend_runtime == BackendRuntime::Uv {
        emit_backend_log(app, "Starting backend with uv runtime...");
        let backend_root = get_backend_script_root(app)?;
        backend_workdir = backend_root;
        run_uv_sync_if_needed(&backend_workdir)?;
        let mut cmd = Command::new("uv");
        cmd.args([
            "run",
            "python",
            "-m",
            "lifetrace.server",
            "--port",
            &port.to_string(),
            "--mode",
            mode_label,
        ]);
        for (key, value) in uv_env_pairs() {
            cmd.env(key, value);
        }
        cmd
    } else if backend_runtime == BackendRuntime::Script {
        emit_backend_log(app, "Preparing script runtime environment...");
        let runtime_root = get_runtime_root(app)?;
        let venv_dir = runtime_root.join("python-venv");
        let backend_root = get_backend_script_root(app)?;
        let requirements_path = get_requirements_path(&backend_root);
        if !requirements_path.exists() {
            return Err(format!(
                "Requirements file not found at {:?}",
                requirements_path
            ));
        }
        let mut venv_python = None;

        emit_backend_log(app, "Ensuring uv binary is available...");
        match ensure_uv_binary_with_progress(&runtime_root, |progress| {
            emit_backend_log(app, format_download_progress(&progress));
        })
        .await
        {
            Ok(uv_path) => {
                emit_backend_log(app, format!("uv ready at {}", uv_path.display()));
                emit_backend_log(app, "Ensuring Python 3.12 via uv...");
                if let Err(err) = ensure_uv_python(uv_path.as_path()) {
                    emit_backend_log(app, format!("uv python install failed: {}", err));
                } else {
                    emit_backend_log(app, "uv Python install completed.");
                    emit_backend_log(app, "Creating virtual environment with uv...");
                    match ensure_uv_venv(uv_path.as_path(), venv_dir.as_path()) {
                        Ok(path) => {
                            emit_backend_log(app, "uv venv created.");
                            emit_backend_log(app, "Installing backend dependencies with uv...");
                            if let Err(err) = install_requirements(
                                uv_path.as_path(),
                                path.as_path(),
                                requirements_path.as_path(),
                            ) {
                                emit_backend_log(
                                    app,
                                    format!("uv dependency install failed: {}", err),
                                );
                            } else {
                                emit_backend_log(app, "uv dependency install completed.");
                                venv_python = Some(path);
                            }
                        }
                        Err(err) => {
                            emit_backend_log(app, format!("uv venv creation failed: {}", err));
                        }
                    }
                }
            }
            Err(err) => {
                emit_backend_log(app, format!("uv download failed: {}", err));
            }
        }

        if venv_python.is_none() {
            emit_backend_log(app, "Falling back to system Python 3.12...");
            let system_python = find_python312().ok_or("Python 3.12 not found")?;
            let fallback_python = ensure_venv(system_python.as_path(), venv_dir.as_path())?;
            emit_backend_log(app, "Installing uv in virtual environment...");
            let uv_path = ensure_uv(fallback_python.as_path(), venv_dir.as_path())?;
            emit_backend_log(app, "Installing backend dependencies with uv...");
            install_requirements(
                uv_path.as_path(),
                fallback_python.as_path(),
                requirements_path.as_path(),
            )?;
            emit_backend_log(app, "uv dependency install completed.");
            venv_python = Some(fallback_python);
        }

        let venv_python = venv_python.ok_or("Failed to prepare Python runtime")?;
        if !venv_python.exists() {
            return Err("Virtual environment python not found".to_string());
        }

        backend_workdir = backend_root;
        let mut cmd = Command::new(venv_python);
        cmd.arg(&backend_path);
        cmd
    } else {
        Command::new(&backend_path)
    };

    if backend_runtime != BackendRuntime::Uv {
        command.args([
            "--port",
            &port.to_string(),
            "--data-dir",
            data_dir.to_str().unwrap_or(""),
            "--mode",
            mode_label,
        ]);
    }

    command
        .current_dir(backend_workdir)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONUTF8", "1")
        .env("LIFETRACE_DATA_DIR", data_dir.to_str().unwrap_or(""))
        .env("LIFETRACE__OBSERVABILITY__ENABLED", "false")
        .env("LIFETRACE__SERVER__DEBUG", "false");

    info!("Starting backend server on port {}", port);
    info!("Backend runtime: {:?}", backend_runtime);
    info!("Backend path: {:?}", backend_path);
    info!("Data directory: {:?}", data_dir);
    info!("Server mode: {}", mode_label);

    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start backend: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(app.clone(), stdout, BACKEND_LOG_LABEL);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(app.clone(), stderr, BACKEND_LOG_LABEL);
    }

    {
        let mut guard = state.process.lock().unwrap();
        *guard = Some(child);
    }

    info!("Waiting for backend server to be ready...");
    if let Err(err) = wait_for_backend(
        port,
        timeouts::BACKEND_READY / 1000,
        timeouts::HEALTH_CHECK,
        timeouts::HEALTH_CHECK_RETRY,
    )
    .await
    {
        stop_managed_backend();
        emit_backend_log(app, format!("Backend failed to become ready: {}", err));
        return Err(err);
    }
    info!("Backend server is ready at http://127.0.0.1:{}", port);

    if let Err(err) = verify_backend_mode(port, mode_label).await {
        stop_managed_backend();
        return Err(err);
    }

    Ok(port)
}

fn stop_managed_backend() {
    let state = state();
    let mut guard = state.process.lock().unwrap();
    if let Some(child) = guard.take() {
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(child.id() as i32, libc::SIGTERM);
            }
        }

        #[cfg(windows)]
        {
            let mut child = child;
            let _ = child.kill();
        }
    }
}

/// Stop the backend server
pub fn stop_backend() {
    let state = state();
    state.stopping.store(true, Ordering::Relaxed);
    state.ready.store(false, Ordering::Relaxed);

    let mut guard = state.process.lock().unwrap();
    if let Some(mut child) = guard.take() {
        info!("Stopping backend server...");

        // Try graceful shutdown first
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(child.id() as i32, libc::SIGTERM);
            }
        }

        #[cfg(windows)]
        {
            let _ = child.kill();
        }

        // Wait a bit for graceful shutdown
        std::thread::sleep(Duration::from_secs(2));

        // Force kill if still running
        match child.try_wait() {
            Ok(Some(_)) => {
                info!("Backend server stopped gracefully");
            }
            Ok(None) => {
                warn!("Backend server did not stop gracefully, forcing kill");
                let _ = child.kill();
            }
            Err(e) => {
                error!("Error checking backend status: {}", e);
                let _ = child.kill();
            }
        }
    }
}

/// Cleanup on application exit
pub fn cleanup() {
    stop_backend();
}
