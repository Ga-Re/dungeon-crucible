//! Native side of Dungeon Crucible: monitor discovery and the table window.
//!
//! The table window shows only `PlayerFrame`s sent by the DM window (see
//! `src/core/projection.ts`). It is borderless, fullscreen on the chosen
//! monitor, never takes focus and hides the mouse cursor.

mod campaign;
mod monitors;

use monitors::{monitor_infos, MonitorInfo};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const TABLE_LABEL: &str = "table";

fn place_on_monitor(window: &WebviewWindow, index: usize, fullscreen: bool) -> Result<MonitorInfo, String> {
    let infos = monitor_infos(window.available_monitors().map_err(|e| e.to_string())?);
    let target = infos
        .into_iter()
        .find(|m| m.index == index)
        .ok_or_else(|| format!("Monitor {index} not found"))?;
    // Leave fullscreen first: most platforms ignore moves of fullscreen windows.
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(target.x, target.y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(target.width, target.height))
        .map_err(|e| e.to_string())?;
    if fullscreen {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    }
    Ok(target)
}

/// Lists all connected monitors with position, size and scale.
#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let main = app.get_webview_window("main").ok_or("Main window missing")?;
    Ok(monitor_infos(main.available_monitors().map_err(|e| e.to_string())?))
}

/// Opens (or reuses) the table window fullscreen on the given monitor.
#[tauri::command]
fn open_table_window(app: AppHandle, monitor_index: usize) -> Result<MonitorInfo, String> {
    let window = match app.get_webview_window(TABLE_LABEL) {
        Some(w) => w,
        None => WebviewWindowBuilder::new(&app, TABLE_LABEL, WebviewUrl::App("table.html".into()))
            .title("Dungeon Crucible – Table")
            .decorations(false)
            .resizable(false)
            .focused(false)
            .skip_taskbar(true)
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?,
    };
    let info = place_on_monitor(&window, monitor_index, true)?;
    let _ = window.set_cursor_visible(false);
    window.show().map_err(|e| e.to_string())?;
    // Keep keyboard focus on the DM window.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(info)
}

/// Moves any app window (table, or a popped-out panel) to another monitor.
#[tauri::command]
fn move_window_to_monitor(app: AppHandle, label: String, monitor_index: usize) -> Result<MonitorInfo, String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Window '{label}' not found"))?;
    let fullscreen = label == TABLE_LABEL;
    place_on_monitor(&window, monitor_index, fullscreen)
}

#[tauri::command]
fn close_table_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(TABLE_LABEL) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(campaign::CampaignState::default())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            open_table_window,
            move_window_to_monitor,
            close_table_window,
            campaign::pick_campaign_folder,
            campaign::open_campaign_folder,
            campaign::read_text,
            campaign::write_text,
            campaign::list_files,
            campaign::absolute_path,
            campaign::import_map_file
        ])
        .on_window_event(|window, event| {
            // Closing the DM window also closes the table window.
            if window.label() == "main" {
                if let tauri::WindowEvent::Destroyed = event {
                    if let Some(t) = window.app_handle().get_webview_window(TABLE_LABEL) {
                        let _ = t.close();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Dungeon Crucible");
}
