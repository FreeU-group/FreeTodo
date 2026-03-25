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
use std::sync::{Arc, RwLock};
use std::time::Duration;

#[derive(Clone)]
pub struct ProxyState {
    remote_base_url: Arc<RwLock<String>>,
    client: Client,
}

impl ProxyState {
    pub fn new(remote_base_url: Arc<RwLock<String>>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self {
            remote_base_url,
            client,
        }
    }

    fn target_url(&self) -> String {
        self.remote_base_url
            .read()
            .map(|value| value.clone())
            .unwrap_or_else(|_| String::new())
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
    let target_url = state.target_url();
    let path = req.uri().path();
    if path == "/ready" {
        return ready_response(&target_url);
    }

    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/");
    let url = format!("{}{}", target_url, path_and_query);

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
            return bad_gateway_response(err.to_string());
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
                    return bad_gateway_response(err.to_string());
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
                .unwrap_or_else(|_| bad_gateway_response("Invalid proxy response".to_string()))
        }
        Err(err) => {
            warn!("Proxy request failed: {}", err);
            bad_gateway_response(err.to_string())
        }
    }
}

fn ready_response(remote_base_url: &str) -> Response<Body> {
    let payload = json!({
        "status": "ready",
        "target": remote_base_url,
    });

    let mut response = Response::new(Body::from(payload.to_string()));
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    response
}

fn bad_gateway_response(message: String) -> Response<Body> {
    let payload = json!({
        "status": "error",
        "message": message,
    });

    let mut response = Response::new(Body::from(payload.to_string()));
    *response.status_mut() = StatusCode::BAD_GATEWAY;
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
