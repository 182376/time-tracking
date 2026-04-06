#[tauri::command]
pub fn get_icon(exe_path: String) -> Option<String> {
    crate::platform::windows::icon::get_icon_base64(&exe_path)
}
