//! Native side of Dungeon Crucible.
//!
//! Windows are created and placed from the UI via the Tauri window API
//! (`src/platform/displays.ts`, ported from Dungeon-Manager). This crate boots the
//! app, ties the table window's lifetime to the DM window, tells the DM window when
//! the table window has loaded, and gives the DM window access to the campaign folder.

mod campaign;

use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WindowEvent};

const DM_WINDOW: &str = "main";
const TABLE_WINDOW: &str = "table";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(campaign::CampaignState::default())
        .invoke_handler(tauri::generate_handler![
            campaign::pick_campaign_folder,
            campaign::open_campaign_folder,
            campaign::read_text,
            campaign::write_text,
            campaign::list_files,
            campaign::absolute_path,
            campaign::import_map_file
        ])
        .on_page_load(|webview, payload| {
            // The table window has no permission to ask for data; the DM window resends the
            // current frame when it hears this. Like every global event it carries no data.
            if webview.label() == TABLE_WINDOW && payload.event() == PageLoadEvent::Finished {
                let _ = webview.app_handle().emit_to(DM_WINDOW, "table-ready", ());
            }
        })
        .on_window_event(|window, event| {
            // The table window has no controls; closing the DM window quits the whole app so
            // nothing is left on the TV.
            if window.label() == DM_WINDOW && matches!(event, WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Dungeon Crucible");
}
