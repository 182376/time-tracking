import {
  assert,
  buildNormalizedAppStats,
  compileSessions,
  buildHistoryReadModel,
  makeSession,
  ProcessMapper,
  resolveCanonicalDisplayName,
  resolveCanonicalExecutable,
  resolveTrackerHealth,
  runTest,
  shouldTrackProcess,
} from "./shared.ts";

export function runProcessMapperTests() {
  runTest("system windows processes are excluded from tracking", () => {
    assert.equal(ProcessMapper.shouldTrack("SearchHost.exe"), false);
    assert.equal(ProcessMapper.shouldTrack("ShellExperienceHost.exe"), false);
    assert.equal(ProcessMapper.shouldTrack("Consent.exe"), false);
    assert.equal(ProcessMapper.shouldTrack("PickerHost.exe"), false);
    assert.equal(ProcessMapper.shouldTrack("Antigravity.exe"), true);
  });

  runTest("process mapper can exclude an app from tracking via override", () => {
    ProcessMapper.clearUserOverrides();
    assert.equal(ProcessMapper.shouldTrack("QQ.exe"), true);

    ProcessMapper.setUserOverride("QQ.exe", {
      track: false,
      enabled: true,
      updatedAt: Date.now(),
    });

    assert.equal(ProcessMapper.shouldTrack("QQ.exe"), false);
    ProcessMapper.clearUserOverrides();
  });

  runTest("process mapper can disable title capture per app without affecting tracking", () => {
    ProcessMapper.clearUserOverrides();
    assert.equal(ProcessMapper.shouldTrack("QQ.exe"), true);

    ProcessMapper.setUserOverride("QQ.exe", {
      captureTitle: false,
      enabled: true,
      updatedAt: Date.now(),
    });

    const override = ProcessMapper.getUserOverride("QQ.exe");
    assert.equal(override?.captureTitle, false);
    assert.equal(ProcessMapper.shouldTrack("QQ.exe"), true);

    const persisted = ProcessMapper.toOverrideStorageValue({
      captureTitle: false,
      enabled: true,
      updatedAt: Date.now(),
    });
    const parsed = ProcessMapper.fromOverrideStorageValue(persisted);
    assert.equal(parsed?.captureTitle, false);

    ProcessMapper.clearUserOverrides();
  });

  runTest("process mapper resolves known alias executables to canonical app identity", () => {
    const mapped = ProcessMapper.map("DouYin_Tray.exe");

    assert.equal(mapped.name, "\u6296\u97f3");
    assert.equal(mapped.category, "video");
  });

  runTest("process mapper user override can reclassify an unknown app", () => {
    ProcessMapper.clearUserOverrides();
    const before = ProcessMapper.map("atlas.exe");
    assert.equal(before.category, "other");

    ProcessMapper.setUserOverride("atlas.exe", {
      category: "utility",
      enabled: true,
      updatedAt: Date.now(),
    });

    const after = ProcessMapper.map("atlas.exe");
    assert.equal(after.category, "utility");
    assert.equal(after.source, "override");

    ProcessMapper.clearUserOverrides();
  });

  runTest("process mapper allows assigning custom category", () => {
    ProcessMapper.clearUserOverrides();

    ProcessMapper.setUserOverride("atlas.exe", {
      category: "custom:\u4e13\u6ce8",
      enabled: true,
      updatedAt: Date.now(),
    });

    const mapped = ProcessMapper.map("atlas.exe");
    assert.equal(mapped.category, "custom:%E4%B8%93%E6%B3%A8");
    assert.equal(mapped.source, "override");
    assert.equal(
      ProcessMapper.getCategoryLabel("custom:\u4e13\u6ce8"),
      "\u4e13\u6ce8",
    );

    ProcessMapper.clearUserOverrides();
  });

  runTest("process mapper category snapshot remains stable for key desktop apps", () => {
    ProcessMapper.clearUserOverrides();
    const cases: Array<{ exeName: string; appName: string; expectedCategory: string }> = [
      { exeName: "vscodium.exe", appName: "VSCodium", expectedCategory: "development" },
      { exeName: "alma.exe", appName: "Alma", expectedCategory: "ai" },
      { exeName: "zotero.exe", appName: "Zotero", expectedCategory: "browser" },
      { exeName: "ToDesk.exe", appName: "ToDesk", expectedCategory: "utility" },
      { exeName: "HoYoPlay.exe", appName: "HoYoPlay", expectedCategory: "game" },
      { exeName: "atlas.exe", appName: "Atlas", expectedCategory: "other" },
    ];

    for (const item of cases) {
      const mapped = ProcessMapper.map(item.exeName, { appName: item.appName });
      assert.equal(mapped.category, item.expectedCategory);
    }
  });

  runTest("display name overrides propagate into compiled app stats", () => {
    ProcessMapper.clearUserOverrides();
    ProcessMapper.setUserOverride("vscodium.exe", {
      displayName: "CodeLab",
      enabled: true,
      updatedAt: Date.now(),
    });

    const compiled = compileSessions([
      makeSession({
        id: 1,
        exeName: "vscodium.exe",
        appName: "VSCodium",
        startTime: 0,
        endTime: 60_000,
        duration: 60_000,
      }),
    ], {
      startMs: 0,
      endMs: 120_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].appName, "CodeLab");
    ProcessMapper.clearUserOverrides();
  });

  runTest("history read model applies display name overrides globally", () => {
    ProcessMapper.clearUserOverrides();
    ProcessMapper.setUserOverride("vscodium.exe", {
      displayName: "CodeLab",
      enabled: true,
      updatedAt: Date.now(),
    });

    const trackerHealth = resolveTrackerHealth(120_000, 120_000, 8_000);
    const historyView = buildHistoryReadModel({
      daySessions: [
        makeSession({
          id: 1,
          exeName: "vscodium.exe",
          appName: "VSCodium",
          startTime: 0,
          endTime: 60_000,
          duration: 60_000,
        }),
      ],
      weeklySessions: [],
      selectedDate: new Date(0),
      trackerHealth,
      nowMs: 120_000,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(historyView.appSummary.length, 1);
    assert.equal(historyView.appSummary[0].appName, "CodeLab");
    assert.equal(historyView.timelineSessions.length, 1);
    assert.equal(historyView.timelineSessions[0].displayName, "CodeLab");
    ProcessMapper.clearUserOverrides();
  });

  runTest("history read model excludes apps marked as not tracked", () => {
    ProcessMapper.clearUserOverrides();
    ProcessMapper.setUserOverride("qq.exe", {
      track: false,
      enabled: true,
      updatedAt: Date.now(),
    });

    const trackerHealth = resolveTrackerHealth(120_000, 120_000, 8_000);
    const historyView = buildHistoryReadModel({
      daySessions: [
        makeSession({
          id: 1,
          exeName: "QQ.exe",
          appName: "QQ",
          startTime: 0,
          endTime: 60_000,
          duration: 60_000,
        }),
        makeSession({
          id: 2,
          exeName: "chrome.exe",
          appName: "Google Chrome",
          startTime: 65_000,
          endTime: 125_000,
          duration: 60_000,
        }),
      ],
      weeklySessions: [],
      selectedDate: new Date(0),
      trackerHealth,
      nowMs: 120_000,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(historyView.appSummary.length, 1);
    assert.equal(historyView.appSummary[0].exeName.toLowerCase(), "chrome.exe");
    assert.equal(historyView.timelineSessions.length, 1);
    assert.equal(historyView.timelineSessions[0].exeName.toLowerCase(), "chrome.exe");
    ProcessMapper.clearUserOverrides();
  });

  runTest("process mapper color output stays stable for same app key", () => {
    ProcessMapper.clearUserOverrides();
    const first = ProcessMapper.map("vscodium.exe", { appName: "VSCodium" });
    const second = ProcessMapper.map("vscodium.exe", { appName: "VSCodium" });
    assert.equal(first.color, second.color);
  });

  runTest("canonical normalization resolves aliases and filters PickerHost", () => {
    assert.equal(resolveCanonicalExecutable("Douyin_tray.exe"), "douyin.exe");
    assert.equal(resolveCanonicalExecutable("Douyin_widget"), "douyin.exe");
    assert.equal(resolveCanonicalExecutable("steamwebhelper.exe"), "steam.exe");
    assert.equal(resolveCanonicalExecutable("alma-0.0.750-win-x64.exe"), "alma.exe");
    assert.equal(resolveCanonicalExecutable("cursor-updater.exe"), "cursor.exe");
    assert.equal(resolveCanonicalExecutable("setup-notion.exe"), "notion.exe");
    assert.equal(resolveCanonicalExecutable("obsidian-uninstall.exe"), "obsidian.exe");
    assert.equal(resolveCanonicalDisplayName("douyin.exe"), "\u6296\u97f3");
    assert.equal(shouldTrackProcess("PickerHost.exe"), false);
    assert.equal(shouldTrackProcess("pickerhost"), false);
    assert.equal(shouldTrackProcess("uninstall.exe"), false);
    assert.equal(shouldTrackProcess("unins000.exe"), false);
    assert.equal(shouldTrackProcess("obsidian-setup.exe"), false);
    assert.equal(shouldTrackProcess("cursor-installer.exe"), false);
    assert.equal(shouldTrackProcess("cursor-updater.exe"), false);
    assert.equal(shouldTrackProcess("maintenancetool.exe"), false);
    assert.equal(shouldTrackProcess("alma-0.0.750-win-x64.exe", {
      appName: "AI Provider Management Desktop App",
      windowTitle: "Alma \u5b89\u88c5",
    }), false);
    assert.equal(shouldTrackProcess("alma-0.0.750-win-x64.exe", {
      appName: "AI Provider Management Desktop App",
      windowTitle: "Alma",
    }), true);
    assert.equal(shouldTrackProcess("Antigravity.exe"), true);
  });
}
