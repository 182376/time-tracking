export interface AppInfo {
  name: string;
  icon?: string;
  category: "work" | "entertainment" | "social" | "system" | "other";
  color: string;
}

const NON_TRACKABLE_EXE_NAMES = new Set([
  "time_tracker.exe",
  "searchhost.exe",
  "searchapp.exe",
  "searchindexer.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "applicationframehost.exe",
  "textinputhost.exe",
  "runtimebroker.exe",
  "taskhostw.exe",
  "consent.exe",
  "lockapp.exe",
  "logonui.exe",
  "sihost.exe",
  "dwm.exe",
  "ctfmon.exe",
  "fontdrvhost.exe",
  "securityhealthsystray.exe",
  "smartscreen.exe",
  "winlogon.exe",
  "userinit.exe",
]);

const MAPPINGS: Record<string, AppInfo> = {
  "chrome.exe": { name: "Google Chrome", category: "work", color: "#4285F4" },
  "msedge.exe": { name: "Microsoft Edge", category: "work", color: "#0078D4" },
  "firefox.exe": { name: "Firefox", category: "work", color: "#FF7139" },
  "opera.exe": { name: "Opera", category: "work", color: "#FF1B2D" },
  "brave.exe": { name: "Brave", category: "work", color: "#FB542B" },
  "vivaldi.exe": { name: "Vivaldi", category: "work", color: "#EF3939" },
  "arc.exe": { name: "Arc", category: "work", color: "#5B5EA6" },

  "code.exe": { name: "Codex", category: "work", color: "#007ACC" },
  "codex.exe": { name: "Codex", category: "work", color: "#007ACC" },
  "cursor.exe": { name: "Cursor", category: "work", color: "#000000" },
  "antigravity.exe": { name: "Antigravity", category: "work", color: "#6366F1" },
  "idea64.exe": { name: "IntelliJ IDEA", category: "work", color: "#FE315D" },
  "pycharm64.exe": { name: "PyCharm", category: "work", color: "#21D789" },
  "webstorm64.exe": { name: "WebStorm", category: "work", color: "#07C3F2" },
  "clion64.exe": { name: "CLion", category: "work", color: "#23D18B" },
  "goland64.exe": { name: "GoLand", category: "work", color: "#82AAFF" },
  "rider64.exe": { name: "Rider", category: "work", color: "#C90F5E" },
  "devenv.exe": { name: "Visual Studio", category: "work", color: "#68217A" },
  "sublime_text.exe": { name: "Sublime Text", category: "work", color: "#FF9800" },
  "notepad++.exe": { name: "Notepad++", category: "work", color: "#80BD01" },
  "vim.exe": { name: "Vim", category: "work", color: "#019733" },
  "nvim.exe": { name: "Neovim", category: "work", color: "#57A143" },

  "powershell.exe": { name: "PowerShell", category: "system", color: "#012456" },
  "pwsh.exe": { name: "PowerShell 7", category: "system", color: "#012456" },
  "cmd.exe": { name: "命令提示符", category: "system", color: "#4D4D4D" },
  "windowsterminal.exe": { name: "Windows Terminal", category: "system", color: "#0C0C0C" },
  "wt.exe": { name: "Windows Terminal", category: "system", color: "#0C0C0C" },

  "wechat.exe": { name: "微信", category: "social", color: "#07C160" },
  "weixin.exe": { name: "微信", category: "social", color: "#07C160" },
  "qq.exe": { name: "QQ", category: "social", color: "#12B7F5" },
  "qqnt.exe": { name: "QQ", category: "social", color: "#12B7F5" },
  "discord.exe": { name: "Discord", category: "social", color: "#5865F2" },
  "slack.exe": { name: "Slack", category: "social", color: "#4A154B" },
  "telegram.exe": { name: "Telegram", category: "social", color: "#2CA5E0" },
  "lark.exe": { name: "飞书", category: "social", color: "#2B5EF5" },
  "dingtalk.exe": { name: "钉钉", category: "social", color: "#1677FF" },
  "teams.exe": { name: "Microsoft Teams", category: "social", color: "#6264A7" },
  "zoom.exe": { name: "Zoom", category: "social", color: "#2D8CFF" },

  "wps.exe": { name: "WPS Office", category: "work", color: "#D93025" },
  "wpsoffice.exe": { name: "WPS Office", category: "work", color: "#D93025" },
  "et.exe": { name: "WPS 表格", category: "work", color: "#1BA784" },
  "wpp.exe": { name: "WPS 演示", category: "work", color: "#F96400" },
  "winword.exe": { name: "Word", category: "work", color: "#2B579A" },
  "excel.exe": { name: "Excel", category: "work", color: "#217346" },
  "powerpnt.exe": { name: "PowerPoint", category: "work", color: "#B7472A" },
  "onenote.exe": { name: "OneNote", category: "work", color: "#80397B" },
  "obsidian.exe": { name: "Obsidian", category: "work", color: "#7C3AED" },
  "notion.exe": { name: "Notion", category: "work", color: "#000000" },
  "typora.exe": { name: "Typora", category: "work", color: "#404040" },

  "spotify.exe": { name: "Spotify", category: "entertainment", color: "#1DB954" },
  "vlc.exe": { name: "VLC Player", category: "entertainment", color: "#FF8800" },
  "steam.exe": { name: "Steam", category: "entertainment", color: "#1B2838" },
  "epicgameslauncher.exe": { name: "Epic Games", category: "entertainment", color: "#313131" },
  "leagueclient.exe": { name: "League of Legends", category: "entertainment", color: "#C69B3A" },
  "valorant.exe": { name: "Valorant", category: "entertainment", color: "#FF4655" },
  "csgo.exe": { name: "CS:GO", category: "entertainment", color: "#F5A623" },
  "cs2.exe": { name: "CS2", category: "entertainment", color: "#F5A623" },
  "bilibili.exe": { name: "哔哩哔哩", category: "entertainment", color: "#00AEEC" },
  "qqmusic.exe": { name: "QQ音乐", category: "entertainment", color: "#FFBE00" },
  "neteasemusic.exe": { name: "网易云音乐", category: "entertainment", color: "#CC0000" },

  "explorer.exe": { name: "文件资源管理器", category: "system", color: "#FBC02D" },
  "taskmgr.exe": { name: "任务管理器", category: "system", color: "#0078D4" },
  "regedit.exe": { name: "注册表编辑器", category: "system", color: "#4D4D4D" },
  "mmc.exe": { name: "管理控制台", category: "system", color: "#4D4D4D" },
  "control.exe": { name: "控制面板", category: "system", color: "#0078D4" },
  "searchhost.exe": { name: "Windows 搜索", category: "system", color: "#4D4D4D" },
  "shellexperiencehost.exe": { name: "Windows Shell", category: "system", color: "#4D4D4D" },
  "consent.exe": { name: "UAC 权限确认", category: "system", color: "#4D4D4D" },
  "startmenuexperiencehost.exe": { name: "开始菜单", category: "system", color: "#4D4D4D" },
  "applicationframehost.exe": { name: "应用框架宿主", category: "system", color: "#4D4D4D" },
  "textinputhost.exe": { name: "文本输入宿主", category: "system", color: "#4D4D4D" },
  "runtimebroker.exe": { name: "运行时代理", category: "system", color: "#4D4D4D" },
  "taskhostw.exe": { name: "任务宿主", category: "system", color: "#4D4D4D" },
  "lockapp.exe": { name: "锁屏界面", category: "system", color: "#4D4D4D" },
  "logonui.exe": { name: "登录界面", category: "system", color: "#4D4D4D" },
  "dwm.exe": { name: "桌面窗口管理器", category: "system", color: "#4D4D4D" },

  "time_tracker.exe": { name: "Time Tracker", category: "work", color: "#6366F1" },
};

export class ProcessMapper {
  static map(exeName: string): AppInfo {
    const lowerName = exeName.toLowerCase();

    if (MAPPINGS[lowerName]) {
      return MAPPINGS[lowerName];
    }

    if (lowerName.includes("browser") || lowerName.includes("chrome") || lowerName.includes("safari")) {
      return { name: "Web Browser", category: "work", color: "#757575" };
    }
    if (lowerName.startsWith("wps")) {
      return { name: "WPS Office", category: "work", color: "#D93025" };
    }
    if (lowerName.includes("game") || lowerName.includes("play") || lowerName.includes("unity") || lowerName.includes("unreal")) {
      return { name: "Game / Engine", category: "entertainment", color: "#E91E63" };
    }
    if (lowerName.includes("code") || lowerName.includes("studio") || lowerName.includes("idea")) {
      return { name: "IDE / Editor", category: "work", color: "#607D8B" };
    }

    const cleanName = exeName.replace(/\.exe$/i, "");
    return {
      name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
      category: "other",
      color: "#9E9E9E",
    };
  }

  static shouldTrack(exeName: string): boolean {
    const lowerName = exeName.toLowerCase();
    if (NON_TRACKABLE_EXE_NAMES.has(lowerName)) {
      return false;
    }

    return this.map(lowerName).category !== "system";
  }

  static getCategoryColor(category: AppInfo["category"]): string {
    const colors: Record<AppInfo["category"], string> = {
      work: "#4F46E5",
      entertainment: "#EC4899",
      social: "#10B981",
      system: "#F59E0B",
      other: "#6B7280",
    };
    return colors[category];
  }
}
