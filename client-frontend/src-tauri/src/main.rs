//! FreeTodo - Main Entry Point
//!
//! This is the main entry point for the FreeTodo Tauri application.
//! It initializes the application and starts all required services.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    free_todo::run();
}
