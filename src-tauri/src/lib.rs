// Tauri 2 entry: registers the fs, dialog, and clipboard plugins that
// src/platform/files.ts uses for in-place save and Excel/Sheets paste (R12).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
