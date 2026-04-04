use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::os::windows::prelude::OsStringExt;
use std::sync::atomic::{AtomicU64, Ordering};
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    GA_ROOTOWNER,
};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowInfo {
    pub hwnd: String,
    pub root_owner_hwnd: String,
    pub process_id: u32,
    pub window_class: String,
    pub title: String,
    pub exe_name: String,
    pub process_path: String,
    pub is_afk: bool,
    pub idle_time_ms: u32,
}

static AFK_TIMEOUT_SECS: AtomicU64 = AtomicU64::new(300);

pub fn has_meaningful_change(previous: Option<&WindowInfo>, next: &WindowInfo) -> bool {
    let Some(previous) = previous else {
        return true;
    };

    previous.title != next.title
        || previous.exe_name != next.exe_name
        || previous.process_path != next.process_path
        || previous.hwnd != next.hwnd
        || previous.root_owner_hwnd != next.root_owner_hwnd
        || previous.process_id != next.process_id
        || previous.window_class != next.window_class
        || previous.is_afk != next.is_afk
}

#[tauri::command]
pub fn cmd_set_afk_timeout(timeout_secs: u64) {
    AFK_TIMEOUT_SECS.store(timeout_secs, Ordering::Relaxed);
}

pub fn get_active_window() -> WindowInfo {
    unsafe {
        // AFK Detection (5 minutes = 300,000 ms)
        let mut last_input = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        let idle_time = if GetLastInputInfo(&mut last_input).ok().is_ok() {
            GetTickCount().wrapping_sub(last_input.dwTime)
        } else {
            0
        };

        let afk_threshold_ms = (AFK_TIMEOUT_SECS.load(Ordering::Relaxed) as u32) * 1000;
        let is_afk = idle_time > afk_threshold_ms;

        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return WindowInfo {
                hwnd: String::new(),
                root_owner_hwnd: String::new(),
                process_id: 0,
                window_class: String::new(),
                title: String::new(),
                exe_name: String::new(),
                process_path: String::new(),
                is_afk: true, // Treat no window as AFK/Inactive
                idle_time_ms: idle_time,
            };
        }

        let root_owner_hwnd = get_root_owner_window(hwnd);
        let title = get_window_title(hwnd);
        let window_class = get_window_class(hwnd);
        let (process_id, exe_name, process_path) = get_process_info(root_owner_hwnd);

        WindowInfo {
            hwnd: format_hwnd(hwnd),
            root_owner_hwnd: format_hwnd(root_owner_hwnd),
            process_id,
            window_class,
            title,
            exe_name,
            process_path,
            is_afk,
            idle_time_ms: idle_time,
        }
    }
}

fn format_hwnd(hwnd: HWND) -> String {
    format!("0x{:X}", hwnd.0 as usize)
}

unsafe fn get_root_owner_window(hwnd: HWND) -> HWND {
    let root_owner = GetAncestor(hwnd, GA_ROOTOWNER);
    if root_owner.0.is_null() {
        hwnd
    } else {
        root_owner
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

unsafe fn get_window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut buffer);
    if len > 0 {
        OsString::from_wide(&buffer[..len as usize])
            .to_string_lossy()
            .into_owned()
    } else {
        String::new()
    }
}

unsafe fn get_process_info(hwnd: HWND) -> (u32, String, String) {
    let mut process_id = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    if process_id == 0 {
        return (0, String::new(), String::new());
    }

    let fallback_exe_name = get_process_name_from_snapshot(process_id).unwrap_or_default();

    let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
        Ok(h) => h,
        Err(_) => return (process_id, fallback_exe_name, String::new()),
    };

    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
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
            .filter(|n| !n.is_empty())
            .unwrap_or(fallback_exe_name);

        (process_id, exe_name, path)
    } else {
        (process_id, fallback_exe_name, String::new())
    }
}

unsafe fn get_process_name_from_snapshot(process_id: u32) -> Option<String> {
    let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;

    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    let mut exe_name = None;

    if Process32FirstW(snapshot, &mut entry).is_ok() {
        loop {
            if entry.th32ProcessID == process_id {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&ch| ch == 0)
                    .unwrap_or(entry.szExeFile.len());

                exe_name = Some(
                    OsString::from_wide(&entry.szExeFile[..len])
                        .to_string_lossy()
                        .into_owned(),
                );
                break;
            }

            if Process32NextW(snapshot, &mut entry).is_err() {
                break;
            }
        }
    }

    let _ = CloseHandle(snapshot);
    exe_name
}

#[tauri::command]
pub fn get_current_active_window() -> WindowInfo {
    get_active_window()
}
