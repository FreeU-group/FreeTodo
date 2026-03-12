//! Backend logging helpers

use crate::backend_python::DownloadProgress;
use log::info;
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Emitter};

pub fn emit_backend_log(app: &AppHandle, message: impl Into<String>) {
    let message = message.into();
    info!("backend-log: {}", message);
    let _ = app.emit("backend-log", message);
}

pub fn spawn_log_reader(
    app: AppHandle,
    stream: impl std::io::Read + Send + 'static,
    label: &'static str,
) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            emit_backend_log(&app, format!("[{}] {}", label, line));
        }
    });
}

pub fn format_download_progress(progress: &DownloadProgress) -> String {
    match progress.total_bytes {
        Some(total) if total > 0 => {
            let percent = ((progress.received_bytes * 100) / total).min(100);
            format!(
                "Downloading uv: {}% ({} / {})",
                percent,
                format_bytes(progress.received_bytes),
                format_bytes(total)
            )
        }
        _ => format!("Downloading uv: {}", format_bytes(progress.received_bytes)),
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let value = bytes as f64;
    if value >= GB {
        format!("{:.1} GB", value / GB)
    } else if value >= MB {
        format!("{:.1} MB", value / MB)
    } else if value >= KB {
        format!("{:.1} KB", value / KB)
    } else {
        format!("{} B", bytes)
    }
}
