use crate::domain::tracking::{
    signal_matches_window, source_app_id_identity, SustainedParticipationSignalSnapshot,
    SustainedParticipationSignalSource, SystemMediaPlaybackType,
};
use crate::platform::windows::foreground::WindowInfo;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Media::MediaPlaybackType;

pub async fn get_sustained_participation_signal(
    window: &WindowInfo,
) -> SustainedParticipationSignalSnapshot {
    if window.exe_name.trim().is_empty() {
        return SustainedParticipationSignalSnapshot::default();
    }

    match query_matching_media_session(window).await {
        Ok(Some(signal)) => signal,
        Ok(None) => SustainedParticipationSignalSnapshot::default(),
        Err(error) => {
            eprintln!("[media] failed to resolve system media signal: {error}");
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

    for index in 0..session_count {
        let session = sessions
            .GetAt(index)
            .map_err(|error| format!("reading media session at {index} failed: {error}"))?;
        if let Some(signal) = build_signal_snapshot(window, &session)? {
            return Ok(Some(signal));
        }
    }

    Ok(None)
}

fn build_signal_snapshot(
    window: &WindowInfo,
    session: &GlobalSystemMediaTransportControlsSession,
) -> Result<Option<SustainedParticipationSignalSnapshot>, String> {
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
        is_active: playback_status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing,
        signal_source: Some(SustainedParticipationSignalSource::SystemMedia),
        source_app_id: Some(source_app_id),
        source_app_identity,
        playback_type,
    };

    if signal_matches_window(&window.exe_name, &window.process_path, &signal) {
        return Ok(Some(signal));
    }

    Ok(None)
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
