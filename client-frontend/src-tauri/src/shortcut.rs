//! Global Shortcut Management
//!
//! This module handles global keyboard shortcuts for the application,
//! providing quick access to common functions from anywhere in the system.
//!
//! Note: Currently designed for Web mode. Island mode may require different shortcuts.

use log::{error, info, warn};
use tauri::{App, AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Default shortcut configurations
pub struct ShortcutConfig {
    /// Toggle window visibility shortcut
    pub toggle_window: &'static str,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            toggle_window: "CommandOrControl+Shift+I",
        }
    }
}

/// Setup global shortcuts
pub fn setup_shortcuts(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    info!("Setting up global shortcuts...");

    let config = ShortcutConfig::default();
    let handle = app.handle().clone();

    // Register toggle window shortcut
    register_toggle_shortcut(&handle, config.toggle_window)?;

    info!("Global shortcuts registered successfully");

    Ok(())
}

/// Register the toggle window shortcut
fn register_toggle_shortcut(
    app: &AppHandle,
    accelerator: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut: Shortcut = accelerator.parse()?;

    let app_handle = app.clone();
    let accel_string = accelerator.to_string();

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                info!("Toggle shortcut triggered: {}", accel_string);
                toggle_window(&app_handle);
            }
        })?;

    info!("Registered shortcut: {} - Toggle Window", accelerator);

    Ok(())
}

/// Toggle main window visibility
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                if let Err(e) = window.hide() {
                    error!("Failed to hide window: {}", e);
                } else {
                    info!("Window hidden via shortcut");
                }
            }
            Ok(false) => {
                if let Err(e) = window.show() {
                    error!("Failed to show window: {}", e);
                } else if let Err(e) = window.set_focus() {
                    warn!("Failed to focus window: {}", e);
                } else {
                    info!("Window shown via shortcut");
                }
            }
            Err(e) => {
                error!("Failed to check window visibility: {}", e);
            }
        }
    } else {
        error!("Main window not found");
    }
}

/// Unregister all shortcuts
#[allow(dead_code)]
pub fn unregister_all(app: &AppHandle) {
    if let Err(e) = app.global_shortcut().unregister_all() {
        error!("Failed to unregister shortcuts: {}", e);
    } else {
        info!("All shortcuts unregistered");
    }
}

/// Update a shortcut with a new accelerator
#[allow(dead_code)]
pub fn update_shortcut(
    app: &AppHandle,
    old_accelerator: &str,
    new_accelerator: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Unregister old shortcut
    let old_shortcut: Shortcut = old_accelerator.parse()?;
    app.global_shortcut().unregister(old_shortcut)?;

    // Register new shortcut
    register_toggle_shortcut(app, new_accelerator)?;

    info!(
        "Shortcut updated from {} to {}",
        old_accelerator, new_accelerator
    );

    Ok(())
}

/// Check if a shortcut is registered
#[allow(dead_code)]
pub fn is_registered(app: &AppHandle, accelerator: &str) -> bool {
    match accelerator.parse::<Shortcut>() {
        Ok(shortcut) => app.global_shortcut().is_registered(shortcut),
        Err(_) => false,
    }
}
