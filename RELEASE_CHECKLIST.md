# Release Checklist

Date: 2026-04-05  
Version: v0.1.0  
Operator: Codex + SYBao

## 1. Build

- [x] `npm run build` passed
- [x] `cargo test` passed
- [x] `npm run tauri build` passed

## 2. Core Regression

- [ ] Active window tracking works
- [ ] AFK cutoff behavior is correct
- [ ] Lock / suspend seals active session
- [ ] Focus timeline latest session appears in time
- [ ] Minimum timeline duration only filters display

## 3. Settings & Desktop Behavior

- [ ] Close behavior works (`exit` / `tray`)
- [ ] Minimize behavior works (`taskbar` / `tray`)
- [ ] Launch at login works
- [ ] Start minimized on autostart works

## 4. Data Safety

- [ ] Export backup works
- [ ] Preview backup summary shows correctly
- [ ] Incompatible backup is blocked with reason
- [x] Restore rollback safety verified (automated test passing)
- [ ] Export diagnostic bundle works

## 5. Packaging Smoke Test

- [ ] Fresh install succeeds
- [ ] First launch succeeds
- [ ] Upgrade install keeps data
- [ ] Uninstall succeeds

## 6. Release Info

- [ ] Version in settings is correct
- [ ] Release notes URL is correct
- [ ] Feedback URL is correct

## 7. Go / No-Go

- [ ] Go
- [ ] No-Go

Notes:

- `npm run tauri build` 已产出 MSI 与 NSIS 安装包。
- `identifier` 已改为 `com.timetracker`，打包无 `.app` 结尾警告。
