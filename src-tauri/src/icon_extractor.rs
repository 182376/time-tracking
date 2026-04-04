use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{ImageBuffer, Rgba};
use std::ffi::OsStr;
use std::io::Cursor;
use std::os::windows::ffi::OsStrExt;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectA, ReleaseDC, BITMAP,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON};

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

        let mut icon_info = std::mem::zeroed();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            let _ = DestroyIcon(icon_large);
            let _ = DestroyIcon(icon_small);
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
            let _ = DestroyIcon(icon_large);
            let _ = DestroyIcon(icon_small);
            return None;
        }

        let width = bm.bmWidth as u32;
        let height = bm.bmHeight.abs() as u32;
        if width == 0 || height == 0 {
            let _ = DeleteObject(icon_info.hbmColor.into());
            let _ = DeleteObject(icon_info.hbmMask.into());
            let _ = DestroyIcon(icon_large);
            let _ = DestroyIcon(icon_small);
            return None;
        }

        let hdc = GetDC(None);
        let mem_dc = CreateCompatibleDC(Some(hdc));

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // negative = top-down rows
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
        let _ = DestroyIcon(icon_large);
        let _ = DestroyIcon(icon_small);

        if lines == 0 {
            return None;
        }

        // GDI returns BGRA → convert to RGBA
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, pixels)?;
        let mut png_bytes = Cursor::new(Vec::new());
        img.write_to(&mut png_bytes, image::ImageFormat::Png).ok()?;

        let b64 = STANDARD.encode(png_bytes.into_inner());
        Some(format!("data:image/png;base64,{}", b64))
    }
}
