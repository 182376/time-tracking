use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::os::windows::prelude::OsStringExt;
use std::time::Duration;
use tokio::time::sleep;
use std::sync::atomic::{AtomicU64, Ordering};
use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_NAME_WIN32
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::System::SystemInformation::GetTickCount;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowInfo {
    pub title: String,
    pub exe_name: String,
    pub process_path: String,
    pub is_afk: bool,
}

static AFK_TIMEOUT_SECS: AtomicU64 = AtomicU64::new(300);

#[tauri::command]
pub fn cmd_set_afk_timeout(timeout_secs: u64) {
    AFK_TIMEOUT_SECS.store(timeout_secs, Ordering::Relaxed);
}

pub fn get_active_window() -> Option<WindowInfo> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let title = get_window_title(hwnd);
        let (exe_name, process_path) = get_process_info(hwnd);

        // AFK Detection (5 minutes = 300,000 ms)
        let mut last_input = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut last_input).ok().is_err() {
            return None;
        }
        let current_tick = GetTickCount();
        let idle_time = current_tick - last_input.dwTime;
        let afk_threshold_ms = (AFK_TIMEOUT_SECS.load(Ordering::Relaxed) as u32) * 1000;
        let is_afk = idle_time > afk_threshold_ms;

        Some(WindowInfo {
            title,
            exe_name,
            process_path,
            is_afk,
        })
    }
}

unsafe fn get_window_title(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut buffer);
    if len > 0 {
        OsString::from_wide(&buffer[..len as usize])
            .to_string_lossy()
            .into_owned()
    } else {
        String::new()
    }
}

unsafe fn get_process_info(hwnd: HWND) -> (String, String) {
    let mut process_id = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
        Ok(h) => h,
        Err(_) => return (String::new(), String::new()),
    };

    let mut buffer = [0u16; MAX_PATH as usize];
    let mut size = MAX_PATH as u32;
    let success = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_WIN32,
        windows::core::PWSTR(buffer.as_mut_ptr()),
        &mut size,
    );
    let _ = CloseHandle(handle);

    if success.is_ok() {
        let path = OsString::from_wide(&buffer[..size as usize])
            .to_string_lossy()
            .into_owned();
        
        // Extract just the exe name from the full path
        let exe_name = std::path::Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
            
        (exe_name, path)
    } else {
        (String::new(), String::new())
    }
}

#[tauri::command]
pub fn get_current_active_window() -> Option<WindowInfo> {
    get_active_window()
}
