use crate::domain::tracking::{
    evaluate_sustained_participation_signal, signal_origin_matches_window, source_app_id_identity,
    SustainedParticipationSignalMatchResult, SustainedParticipationSignalSnapshot,
    SustainedParticipationSignalSource, SystemMediaPlaybackType,
};
use crate::platform::windows::foreground::WindowInfo;
use tokio::time::{timeout, Duration};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Media::MediaPlaybackType;

const MEDIA_SESSION_QUERY_TIMEOUT_SECS: u64 = 2;

pub async fn get_sustained_participation_signal(
    window: &WindowInfo,
) -> SustainedParticipationSignalSnapshot {
    if window.exe_name.trim().is_empty() {
        return SustainedParticipationSignalSnapshot::default();
    }

    match timeout(
        Duration::from_secs(MEDIA_SESSION_QUERY_TIMEOUT_SECS),
        query_matching_media_session(window),
    )
    .await
    {
        Ok(Ok(Some(signal))) => signal,
        Ok(Ok(None)) => SustainedParticipationSignalSnapshot::default(),
        Ok(Err(error)) => {
            eprintln!("[media] failed to resolve system media signal: {error}");
            SustainedParticipationSignalSnapshot::default()
        }
        Err(_) => {
            eprintln!(
                "[media] timed out resolving system media signal after {MEDIA_SESSION_QUERY_TIMEOUT_SECS}s"
            );
            SustainedParticipationSignalSnapshot::default()
        }
    }
}

async fn query_matching_media_session(
    window: &WindowInfo,
) -> Result<Option<SustainedParticipationSignalSnapshot>, String> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|error| format!("requesting media session manager failed: {error}"))?
        .await
        .map_err(|error| format!("awaiting media session manager failed: {error}"))?;
    let sessions = manager
        .GetSessions()
        .map_err(|error| format!("loading media sessions failed: {error}"))?;
    let session_count = sessions
        .Size()
        .map_err(|error| format!("reading media session count failed: {error}"))?;

    let mut matching_inactive: Option<SustainedParticipationSignalSnapshot> = None;
    let mut fallback_active: Option<SustainedParticipationSignalSnapshot> = None;
    let mut fallback_available: Option<SustainedParticipationSignalSnapshot> = None;

    for index in 0..session_count {
        let session = sessions
            .GetAt(index)
            .map_err(|error| format!("reading media session at {index} failed: {error}"))?;
        let signal = build_signal_snapshot(&session)?;
        if signal_origin_matches_window(&window.exe_name, &window.process_path, &signal)
            && signal.is_available
            && !signal.is_active
        {
            if matching_inactive.is_none() {
                matching_inactive = Some(signal);
            }
            continue;
        }

        match evaluate_sustained_participation_signal(
            &window.exe_name,
            &window.process_path,
            &signal,
        )
        .match_result
        {
            SustainedParticipationSignalMatchResult::Matched => return Ok(Some(signal)),
            SustainedParticipationSignalMatchResult::Inactive => {
                if fallback_available.is_none() {
                    fallback_available = Some(signal);
                }
            }
            SustainedParticipationSignalMatchResult::IdentityMismatch => {
                if signal.is_active && fallback_active.is_none() {
                    fallback_active = Some(signal);
                } else if fallback_available.is_none() {
                    fallback_available = Some(signal);
                }
            }
            SustainedParticipationSignalMatchResult::Unavailable => {}
        }
    }

    Ok(matching_inactive.or(fallback_active).or(fallback_available))
}

fn build_signal_snapshot(
    session: &GlobalSystemMediaTransportControlsSession,
) -> Result<SustainedParticipationSignalSnapshot, String> {
    let source_app_id = session
        .SourceAppUserModelId()
        .map_err(|error| format!("reading media source app id failed: {error}"))?
        .to_string_lossy();
    let playback_info = session
        .GetPlaybackInfo()
        .map_err(|error| format!("reading media playback info failed: {error}"))?;
    let playback_status = playback_info
        .PlaybackStatus()
        .map_err(|error| format!("reading media playback status failed: {error}"))?;
    let playback_type = playback_info
        .PlaybackType()
        .ok()
        .and_then(|value| value.Value().ok())
        .map(map_playback_type);

    let source_app_identity = source_app_id_identity(&source_app_id);
    let signal = SustainedParticipationSignalSnapshot {
        is_available: true,
        is_active: playback_status
            == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing,
        signal_source: Some(SustainedParticipationSignalSource::SystemMedia),
        source_app_id: Some(source_app_id),
        source_app_identity,
        playback_type,
    };

    Ok(signal)
}

fn map_playback_type(value: MediaPlaybackType) -> SystemMediaPlaybackType {
    if value == MediaPlaybackType::Video {
        return SystemMediaPlaybackType::Video;
    }

    if value == MediaPlaybackType::Music {
        return SystemMediaPlaybackType::Audio;
    }

    if value == MediaPlaybackType::Image {
        return SystemMediaPlaybackType::Image;
    }

    SystemMediaPlaybackType::Unknown
}

#[cfg(test)]
mod tests {
    use super::map_playback_type;
    use crate::domain::tracking::SystemMediaPlaybackType;
    use windows::Media::MediaPlaybackType;

    #[test]
    fn media_playback_type_mapping_preserves_expected_categories() {
        assert_eq!(
            map_playback_type(MediaPlaybackType::Video),
            SystemMediaPlaybackType::Video
        );
        assert_eq!(
            map_playback_type(MediaPlaybackType::Music),
            SystemMediaPlaybackType::Audio
        );
        assert_eq!(
            map_playback_type(MediaPlaybackType::Image),
            SystemMediaPlaybackType::Image
        );
        assert_eq!(
            map_playback_type(MediaPlaybackType::Unknown),
            SystemMediaPlaybackType::Unknown
        );
    }
}
