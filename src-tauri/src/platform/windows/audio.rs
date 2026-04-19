use crate::domain::tracking::{
    signal_matches_window, sustained_participation_app_identity,
    SustainedParticipationSignalSnapshot, SustainedParticipationSignalSource,
};
use crate::platform::windows::foreground::{self, WindowInfo};
use windows::core::Interface;
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::Media::Audio::{
    AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
    MMDeviceEnumerator, eMultimedia, eRender,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};

pub async fn get_sustained_participation_signal(
    window: &WindowInfo,
) -> SustainedParticipationSignalSnapshot {
    if window.exe_name.trim().is_empty() {
        return SustainedParticipationSignalSnapshot::default();
    }

    match query_matching_audio_session(window).await {
        Ok(Some(signal)) => signal,
        Ok(None) => SustainedParticipationSignalSnapshot::default(),
        Err(error) => {
            eprintln!("[audio] failed to resolve audio session signal: {error}");
            SustainedParticipationSignalSnapshot::default()
        }
    }
}

async fn query_matching_audio_session(
    window: &WindowInfo,
) -> Result<Option<SustainedParticipationSignalSnapshot>, String> {
    let _com = ComGuard::initialize()?;
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|error| format!("creating audio device enumerator failed: {error}"))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|error| format!("loading default audio endpoint failed: {error}"))?;
        let manager = device
            .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
            .map_err(|error| format!("activating audio session manager failed: {error}"))?;
        let session_enumerator = manager
            .GetSessionEnumerator()
            .map_err(|error| format!("loading audio sessions failed: {error}"))?;
        let session_count = session_enumerator
            .GetCount()
            .map_err(|error| format!("reading audio session count failed: {error}"))?;

        for index in 0..session_count {
            let session = session_enumerator
                .GetSession(index)
                .map_err(|error| format!("reading audio session at {index} failed: {error}"))?;
            let session = session
                .cast::<IAudioSessionControl2>()
                .map_err(|error| format!("casting audio session at {index} failed: {error}"))?;
            let state = session
                .GetState()
                .map_err(|error| format!("reading audio session state at {index} failed: {error}"))?;
            if state != AudioSessionStateActive {
                continue;
            }

            let process_id = session
                .GetProcessId()
                .map_err(|error| format!("reading audio session process at {index} failed: {error}"))?;
            let process_exe_name = foreground::get_process_exe_name(process_id);
            let process_path = foreground::get_process_path(process_id);
            let source_identity =
                sustained_participation_app_identity(&process_exe_name, &process_path);

            let signal = SustainedParticipationSignalSnapshot {
                is_available: true,
                is_active: true,
                signal_source: Some(SustainedParticipationSignalSource::AudioSession),
                source_app_id: Some(process_exe_name),
                source_app_identity: source_identity,
                playback_type: None,
            };

            if signal_matches_window(&window.exe_name, &window.process_path, &signal) {
                return Ok(Some(signal));
            }
        }
    }

    Ok(None)
}

struct ComGuard {
    should_uninitialize: bool,
}

impl ComGuard {
    fn initialize() -> Result<Self, String> {
        let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if result.is_ok() {
            return Ok(Self {
                should_uninitialize: true,
            });
        }

        if result == RPC_E_CHANGED_MODE {
            return Ok(Self {
                should_uninitialize: false,
            });
        }

        Err(format!("initializing COM failed: {result}"))
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninitialize {
            unsafe { CoUninitialize() };
        }
    }
}
