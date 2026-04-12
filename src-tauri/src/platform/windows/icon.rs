use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{ImageBuffer, Rgba};
use std::ffi::OsStr;
use std::io::Cursor;
use std::os::windows::ffi::OsStrExt;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectA, ReleaseDC, BITMAP,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, GetClassLongPtrW, GetIconInfo, SendMessageTimeoutW, GCLP_HICON, GCLP_HICONSM,
    HICON, ICON_BIG, ICON_SMALL, ICON_SMALL2, SMTO_ABORTIFHUNG, SMTO_BLOCK, WM_GETICON,
};

pub fn get_icon_base64(exe_path: &str) -> Option<String> {
    unsafe {
        let path_wide: Vec<u16> = OsStr::new(exe_path).encode_wide().chain(Some(0)).collect();

        let mut icon_large = HICON::default();
        let mut icon_small = HICON::default();

        let extracted = ExtractIconExW(
            windows::core::PCWSTR(path_wide.as_ptr()),
            0,
            Some(&mut icon_large),
            Some(&mut icon_small),
            1,
        );

        if extracted == 0 || extracted == u32::MAX {
            return None;
        }

        let hicon = if !icon_large.is_invalid() {
            icon_large
        } else if !icon_small.is_invalid() {
            icon_small
        } else {
            return None;
        };

        let result = hicon_to_base64(hicon);
        let _ = DestroyIcon(icon_large);
        let _ = DestroyIcon(icon_small);
        result
    }
}

pub fn get_window_icon_base64(hwnd_text: &str) -> Option<String> {
    let hwnd = parse_hwnd(hwnd_text)?;
    unsafe {
        let hicon = query_window_icon_handle(hwnd)?;
        hicon_to_base64(hicon)
    }
}

fn parse_hwnd(hwnd_text: &str) -> Option<HWND> {
    let trimmed = hwnd_text.trim();
    if trimmed.is_empty() {
        return None;
    }

    let raw_value = if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        usize::from_str_radix(hex, 16).ok()?
    } else {
        trimmed.parse::<usize>().ok()?
    };

    if raw_value == 0 {
        None
    } else {
        Some(HWND(raw_value as *mut core::ffi::c_void))
    }
}

unsafe fn query_window_icon_handle(hwnd: HWND) -> Option<HICON> {
    for icon_type in [ICON_BIG, ICON_SMALL2, ICON_SMALL] {
        let mut message_result = 0usize;
        let response = SendMessageTimeoutW(
            hwnd,
            WM_GETICON,
            WPARAM(icon_type as usize),
            LPARAM(0),
            SMTO_BLOCK | SMTO_ABORTIFHUNG,
            100,
            Some(&mut message_result),
        );

        if response.0 != 0 && message_result != 0 {
            return Some(HICON(message_result as *mut core::ffi::c_void));
        }
    }

    let class_icon = GetClassLongPtrW(hwnd, GCLP_HICON) as usize;
    if class_icon != 0 {
        return Some(HICON(class_icon as *mut core::ffi::c_void));
    }

    let class_small_icon = GetClassLongPtrW(hwnd, GCLP_HICONSM) as usize;
    if class_small_icon != 0 {
        return Some(HICON(class_small_icon as *mut core::ffi::c_void));
    }

    None
}

unsafe fn hicon_to_base64(hicon: HICON) -> Option<String> {
    let mut icon_info = std::mem::zeroed();
    if GetIconInfo(hicon, &mut icon_info).is_err() {
        return None;
    }

    // GetObjectA works for BITMAP (no string fields, identical to W variant)
    let mut bm: BITMAP = std::mem::zeroed();
    let got = GetObjectA(
        icon_info.hbmColor.into(),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut _ as *mut _),
    );
    if got == 0 {
        let _ = DeleteObject(icon_info.hbmColor.into());
        let _ = DeleteObject(icon_info.hbmMask.into());
        return None;
    }

    let width = bm.bmWidth as u32;
    let height = bm.bmHeight.abs() as u32;
    if width == 0 || height == 0 {
        let _ = DeleteObject(icon_info.hbmColor.into());
        let _ = DeleteObject(icon_info.hbmMask.into());
        return None;
    }

    let hdc = GetDC(None);
    let mem_dc = CreateCompatibleDC(Some(hdc));

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..std::mem::zeroed()
        },
        ..std::mem::zeroed()
    };

    let mut pixels: Vec<u8> = vec![0u8; (width * height * 4) as usize];
    let lines = GetDIBits(
        mem_dc,
        icon_info.hbmColor,
        0,
        height,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );

    let _ = DeleteDC(mem_dc);
    let _ = ReleaseDC(None, hdc);
    let _ = DeleteObject(icon_info.hbmColor.into());
    let _ = DeleteObject(icon_info.hbmMask.into());

    if lines == 0 {
        return None;
    }

    for chunk in pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }

    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, pixels)?;
    let mut png_bytes = Cursor::new(Vec::new());
    img.write_to(&mut png_bytes, image::ImageFormat::Png).ok()?;

    let b64 = STANDARD.encode(png_bytes.into_inner());
    Some(format!("data:image/png;base64,{}", b64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_hwnd_accepts_hex_and_decimal() {
        let hex = parse_hwnd("0x100").unwrap();
        let dec = parse_hwnd("256").unwrap();
        assert_eq!(hex.0 as usize, 0x100);
        assert_eq!(dec.0 as usize, 256);
    }

    #[test]
    fn parse_hwnd_rejects_invalid_or_zero() {
        assert!(parse_hwnd("").is_none());
        assert!(parse_hwnd("0x0").is_none());
        assert!(parse_hwnd("not-a-hwnd").is_none());
    }
}
