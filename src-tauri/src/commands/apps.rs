#[tauri::command]
pub fn get_icon(exe_path: String) -> Option<String> {
    crate::icon_extractor::get_icon_base64(&exe_path)
}
