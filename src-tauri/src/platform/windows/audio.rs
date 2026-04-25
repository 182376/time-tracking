use crate::domain::tracking::{
    evaluate_sustained_participation_signal, sustained_participation_app_identity,
    SustainedParticipationSignalMatchResult, SustainedParticipationSignalSnapshot,
    SustainedParticipationSignalSource,
};
use crate::platform::windows::foreground::{self, WindowInfo};
use tokio::{
    task::spawn_blocking,
    time::{timeout, Duration},
};
use windows::core::Interface;
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2,
    IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};

const AUDIO_SESSION_QUERY_TIMEOUT_SECS: u64 = 2;

pub async fn get_sustained_participation_signal(
    window: &WindowInfo,
) -> SustainedParticipationSignalSnapshot {
    if window.exe_name.trim().is_empty() {
        return SustainedParticipationSignalSnapshot::default();
    }

    let window = window.clone();
    let query = spawn_blocking(move || query_matching_audio_session(&window));

    match timeout(Duration::from_secs(AUDIO_SESSION_QUERY_TIMEOUT_SECS), query).await {
        Ok(Ok(Ok(Some(signal)))) => signal,
        Ok(Ok(Ok(None))) => SustainedParticipationSignalSnapshot::default(),
        Ok(Ok(Err(error))) => {
            eprintln!("[audio] failed to resolve audio session signal: {error}");
            SustainedParticipationSignalSnapshot::default()
        }
        Ok(Err(error)) => {
            eprintln!("[audio] audio session query task failed: {error}");
            SustainedParticipationSignalSnapshot::default()
        }
        Err(_) => {
            eprintln!(
                "[audio] timed out resolving audio session signal after {AUDIO_SESSION_QUERY_TIMEOUT_SECS}s"
            );
            SustainedParticipationSignalSnapshot::default()
        }
    }
}

fn query_matching_audio_session(
    window: &WindowInfo,
) -> Result<Option<SustainedParticipationSignalSnapshot>, String> {
    let _com = ComGuard::initialize()?;
    let mut fallback_active: Option<SustainedParticipationSignalSnapshot> = None;

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
            let state = session.GetState().map_err(|error| {
                format!("reading audio session state at {index} failed: {error}")
            })?;
            if state != AudioSessionStateActive {
                continue;
            }

            let process_id = session.GetProcessId().map_err(|error| {
                format!("reading audio session process at {index} failed: {error}")
            })?;
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

            match evaluate_sustained_participation_signal(
                &window.exe_name,
                &window.process_path,
                &signal,
            )
            .match_result
            {
                SustainedParticipationSignalMatchResult::Matched => return Ok(Some(signal)),
                SustainedParticipationSignalMatchResult::IdentityMismatch
                | SustainedParticipationSignalMatchResult::Inactive => {
                    if fallback_active.is_none() {
                        fallback_active = Some(signal);
                    }
                }
                SustainedParticipationSignalMatchResult::Unavailable => {}
            }
        }
    }

    Ok(fallback_active)
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
