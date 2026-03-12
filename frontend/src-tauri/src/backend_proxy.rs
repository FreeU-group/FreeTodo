//! Backend proxy server for stable frontend ports.

use axum::{
    body::{to_bytes, Body},
    extract::State,
    http::{header, Request, StatusCode},
    response::Response,
    Router,
};
use log::warn;
use reqwest::Client;
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, AtomicU16, Ordering},
    Arc,
};
use std::time::Duration;

#[derive(Clone)]
pub struct ProxyState {
    backend_port: Arc<AtomicU16>,
    ready: Arc<AtomicBool>,
    client: Client,
}

impl ProxyState {
    pub fn new(backend_port: Arc<AtomicU16>, ready: Arc<AtomicBool>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self {
            backend_port,
            ready,
            client,
        }
    }
}

pub async fn start_proxy_server(port: u16, state: ProxyState) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("Failed to bind proxy port {}: {}", port, e))?;

    let app = Router::new().fallback(proxy_handler).with_state(state);

    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            warn!("Proxy server exited: {}", err);
        }
    });

    Ok(())
}

async fn proxy_handler(State(state): State<ProxyState>, req: Request<Body>) -> Response<Body> {
    let path = req.uri().path();
    if path == "/ready" {
        let backend_port = state.backend_port.load(Ordering::Relaxed);
        let ready = state.ready.load(Ordering::Relaxed);
        return ready_response(ready, backend_port);
    }

    let backend_port = state.backend_port.load(Ordering::Relaxed);
    let ready = state.ready.load(Ordering::Relaxed);
    if backend_port == 0 || !ready {
        return ready_response(false, backend_port);
    }

    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/");
    let url = format!("http://127.0.0.1:{}{}", backend_port, path_and_query);

    let (parts, body) = req.into_parts();
    let mut builder = state.client.request(parts.method, &url);
    for (name, value) in parts.headers.iter() {
        if should_skip_request_header(name) {
            continue;
        }
        builder = builder.header(name, value);
    }

    let body_bytes = match to_bytes(body, usize::MAX).await {
        Ok(bytes) => bytes,
        Err(err) => {
            warn!("Proxy body read failed: {}", err);
            return ready_response(false, backend_port);
        }
    };

    match builder.body(body_bytes).send().await {
        Ok(response) => {
            let status = response.status();
            let headers = response.headers().clone();
            let bytes = match response.bytes().await {
                Ok(body) => body,
                Err(err) => {
                    warn!("Proxy response read failed: {}", err);
                    return ready_response(false, backend_port);
                }
            };

            let mut builder = Response::builder().status(status);
            for (name, value) in headers.iter() {
                if should_skip_response_header(name) {
                    continue;
                }
                builder = builder.header(name, value);
            }
            builder = builder.header(header::CONTENT_LENGTH, bytes.len().to_string());
            builder
                .body(Body::from(bytes))
                .unwrap_or_else(|_| ready_response(false, backend_port))
        }
        Err(err) => {
            warn!("Proxy request failed: {}", err);
            ready_response(false, backend_port)
        }
    }
}

fn ready_response(ready: bool, backend_port: u16) -> Response<Body> {
    let payload = if ready {
        json!({
            "status": "ready",
            "backend_port": backend_port,
        })
    } else {
        json!({
            "status": "starting",
        })
    };

    let mut response = Response::new(Body::from(payload.to_string()));
    *response.status_mut() = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    response
}

fn should_skip_request_header(name: &header::HeaderName) -> bool {
    *name == header::HOST || *name == header::CONTENT_LENGTH || *name == header::CONNECTION
}

fn should_skip_response_header(name: &header::HeaderName) -> bool {
    *name == header::CONTENT_LENGTH
        || *name == header::TRANSFER_ENCODING
        || *name == header::CONTENT_ENCODING
        || *name == header::CONNECTION
}
