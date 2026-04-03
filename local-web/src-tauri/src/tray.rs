//! System Tray Management
//!
//! This module handles the system tray icon and context menu,
//! providing quick access to common application functions.
//!
//! Note: Currently designed for Web mode. Island mode features are placeholders.

use log::{error, info};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};

/// Setup the system tray
pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    info!("Setting up system tray...");

    let handle = app.handle();

    // Create menu items
    let show_hide = MenuItem::with_id(
        handle,
        "show_hide",
        "Show/Hide Window",
        true,
        Some("CmdOrCtrl+Shift+I"),
    )?;

    let separator1 = PredefinedMenuItem::separator(handle)?;

    let recording_menu = create_recording_submenu(handle)?;
    let screenshot_menu = create_screenshot_submenu(handle)?;

    let separator2 = PredefinedMenuItem::separator(handle)?;

    let preferences =
        MenuItem::with_id(handle, "preferences", "Preferences...", true, None::<&str>)?;

    let separator3 = PredefinedMenuItem::separator(handle)?;

    let quit = MenuItem::with_id(handle, "quit", "Quit FreeTodo", true, Some("CmdOrCtrl+Q"))?;

    // Build the menu
    let menu = Menu::with_items(
        handle,
        &[
            &show_hide,
            &separator1,
            &recording_menu,
            &screenshot_menu,
            &separator2,
            &preferences,
            &separator3,
            &quit,
        ],
    )?;

    // Get tray icon
    let icon = get_tray_icon(app)?;

    // Create tray icon
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("FreeTodo - Dynamic Island")
        .on_menu_event(move |app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            handle_tray_event(tray.app_handle(), event);
        })
        .build(app)?;

    info!("System tray created successfully");

    Ok(())
}

/// Create recording submenu
fn create_recording_submenu(
    handle: &AppHandle,
) -> Result<tauri::menu::Submenu<tauri::Wry>, tauri::Error> {
    let start_recording = MenuItem::with_id(
        handle,
        "start_recording",
        "Start Recording",
        false,
        None::<&str>,
    )?;
    let stop_recording = MenuItem::with_id(
        handle,
        "stop_recording",
        "Stop Recording",
        false,
        None::<&str>,
    )?;

    tauri::menu::Submenu::with_items(
        handle,
        "Recording",
        true,
        &[&start_recording, &stop_recording],
    )
}

/// Create screenshot submenu
fn create_screenshot_submenu(
    handle: &AppHandle,
) -> Result<tauri::menu::Submenu<tauri::Wry>, tauri::Error> {
    let take_screenshot = MenuItem::with_id(
        handle,
        "take_screenshot",
        "Take Screenshot",
        false,
        None::<&str>,
    )?;
    let view_screenshots = MenuItem::with_id(
        handle,
        "view_screenshots",
        "View Recent...",
        false,
        None::<&str>,
    )?;

    tauri::menu::Submenu::with_items(
        handle,
        "Screenshots",
        true,
        &[&take_screenshot, &view_screenshots],
    )
}

/// Get tray icon image
fn get_tray_icon(_app: &App) -> Result<Image<'static>, Box<dyn std::error::Error>> {
    // Load embedded icon (using PNG decoder)
    let icon_bytes = include_bytes!("../icons/icon.png");

    // Decode PNG to get RGBA data
    let decoder = png::Decoder::new(std::io::Cursor::new(icon_bytes));
    let mut reader = decoder.read_info()?;
    let buf_size = reader.output_buffer_size().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "PNG output buffer size overflow",
        )
    })?;
    let mut buf = vec![0; buf_size];
    let info = reader.next_frame(&mut buf)?;

    // Convert to RGBA if necessary
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            // Convert RGB to RGBA
            let rgb = &buf[..info.buffer_size()];
            let mut rgba = Vec::with_capacity((rgb.len() / 3) * 4);
            for chunk in rgb.chunks(3) {
                rgba.extend_from_slice(chunk);
                rgba.push(255);
            }
            rgba
        }
        _ => {
            error!("Unsupported color type: {:?}", info.color_type);
            return Err("Unsupported color type".into());
        }
    };

    Ok(Image::new_owned(rgba, info.width, info.height))
}

/// Handle menu item click events
fn handle_menu_event(app: &AppHandle, menu_id: &str) {
    info!("Menu event: {}", menu_id);

    match menu_id {
        "show_hide" => {
            toggle_window(app);
        }
        "preferences" => {
            // Show preferences (for now, just show window)
            show_window(app);
            info!("Preferences clicked - feature not yet implemented");
        }
        "quit" => {
            info!("Quit requested from tray menu");
            app.exit(0);
        }
        "start_recording" => {
            info!("Start recording - feature not yet implemented");
        }
        "stop_recording" => {
            info!("Stop recording - feature not yet implemented");
        }
        "take_screenshot" => {
            info!("Take screenshot - feature not yet implemented");
        }
        "view_screenshots" => {
            info!("View screenshots - feature not yet implemented");
        }
        _ => {
            info!("Unknown menu event: {}", menu_id);
        }
    }
}

/// Handle tray icon events (click, double-click, etc.)
fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } => {
            info!("Tray icon left-clicked");
            toggle_window(app);
        }
        TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => {
            info!("Tray icon double-clicked");
            show_window(app);
        }
        _ => {}
    }
}

/// Toggle main window visibility
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
                info!("Window hidden");
            }
            Ok(false) => {
                let _ = window.show();
                let _ = window.set_focus();
                info!("Window shown");
            }
            Err(e) => {
                error!("Failed to check window visibility: {}", e);
            }
        }
    } else {
        error!("Main window not found");
    }
}

/// Show main window
fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        info!("Window shown and focused");
    }
}

/// Hide main window
#[allow(dead_code)]
fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        info!("Window hidden");
    }
}

/// Update tray tooltip based on window state
#[allow(dead_code)]
pub fn update_tray_tooltip(_app: &AppHandle, visible: bool) {
    // Tray tooltip update would be implemented here
    // Currently Tauri 2.x doesn't have a direct API for updating tooltip after creation
    info!(
        "Tray state updated: Window is {}",
        if visible { "visible" } else { "hidden" }
    );
}
