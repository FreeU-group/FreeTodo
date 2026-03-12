//! Backend helper utilities (health checks, port selection, detection).

use crate::config::{self, ServerMode};
use log::info;
use rand::Rng;
use reqwest::Client;
use serde::Deserialize;
use std::net::TcpListener;
use std::time::Duration;

/// Health check response structure
#[derive(Deserialize, Debug)]
struct HealthResponse {
    app: Option<String>,
    server_mode: Option<String>,
}

fn backend_port_range(mode: ServerMode) -> (u16, u16) {
    match mode {
        ServerMode::Dev => (
            config::ports::DEV_BACKEND_RANGE_START,
            config::ports::DEV_BACKEND_RANGE_END,
        ),
        ServerMode::Build => (
            config::ports::BUILD_BACKEND_RANGE_START,
            config::ports::BUILD_BACKEND_RANGE_END,
        ),
    }
}

pub async fn is_lifetrace_backend(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{}/health", port);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                if let Ok(health) = response.json::<HealthResponse>().await {
                    return health.app.as_deref() == Some("lifetrace");
                }
            }
            false
        }
        Err(_) => false,
    }
}

pub async fn check_backend_health(
    port: u16,
    timeout_ms: u64,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let url = format!("http://127.0.0.1:{}/health", port);
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()?;

    match client.get(&url).send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

pub async fn detect_running_backend_port(mode: ServerMode) -> Option<u16> {
    let (start_port, end_port) = backend_port_range(mode);

    for port in start_port..=end_port {
        if is_lifetrace_backend(port).await {
            info!("Detected backend running on port: {}", port);
            return Some(port);
        }
    }

    None
}

fn port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

pub fn pick_backend_port(mode: ServerMode) -> Result<u16, String> {
    let (start_port, end_port) = backend_port_range(mode);
    let mut rng = rand::rng();

    for _ in 0..10 {
        let port = rng.random_range(start_port..=end_port);
        if port_available(port) {
            return Ok(port);
        }
    }

    for port in start_port..=end_port {
        if port_available(port) {
            return Ok(port);
        }
    }

    Err(format!(
        "No available backend port in range {}-{}",
        start_port, end_port
    ))
}

pub async fn wait_for_backend(
    port: u16,
    timeout_secs: u64,
    health_timeout_ms: u64,
    retry_ms: u64,
) -> Result<(), String> {
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);
    let retry_interval = Duration::from_millis(retry_ms);

    while start.elapsed() < timeout {
        if check_backend_health(port, health_timeout_ms)
            .await
            .unwrap_or(false)
        {
            return Ok(());
        }
        tokio::time::sleep(retry_interval).await;
    }

    Err("Backend did not start in time".to_string())
}

pub async fn verify_backend_mode(port: u16, expected_mode: &str) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/health", port);
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(&url).send().await {
        Ok(response) => {
            if let Ok(health) = response.json::<HealthResponse>().await {
                if health.app.as_deref() != Some("lifetrace") {
                    return Err(format!(
                        "Backend at port {} is not a LifeTrace server",
                        port
                    ));
                }
                if let Some(mode) = health.server_mode {
                    if mode != expected_mode {
                        log::warn!(
                            "Backend mode mismatch: expected '{}', got '{}'",
                            expected_mode,
                            mode
                        );
                    }
                }
            }
            Ok(())
        }
        Err(e) => {
            log::warn!("Could not verify backend mode: {}", e);
            Ok(())
        }
    }
}
