import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const PACKAGE_LOCK_PATH = path.join(ROOT, "package-lock.json");
const TAURI_CONFIG_PATH = path.join(ROOT, "src-tauri", "tauri.conf.json");
const CARGO_TOML_PATH = path.join(ROOT, "src-tauri", "Cargo.toml");

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?$/;

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function assertVersion(version) {
  if (!version) {
    fail("missing version");
  }

  if (!VERSION_PATTERN.test(version)) {
    fail(`invalid SemVer version "${version}"`);
  }
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function updateJsonVersion(filePath, version, updateLockRoot = false) {
  const json = JSON.parse(await readText(filePath));
  json.version = version;

  if (updateLockRoot && json.packages?.[""]) {
    json.packages[""].version = version;
  }

  await writeJson(filePath, json);
}

async function syncVersion(version) {
  assertVersion(version);

  await updateJsonVersion(PACKAGE_JSON_PATH, version);
  await updateJsonVersion(PACKAGE_LOCK_PATH, version, true);

  const tauriConfig = JSON.parse(await readText(TAURI_CONFIG_PATH));
  tauriConfig.version = version;
  tauriConfig.bundle = {
    ...tauriConfig.bundle,
    createUpdaterArtifacts: true,
  };
  tauriConfig.plugins = {
    ...tauriConfig.plugins,
    updater: {
      ...tauriConfig.plugins?.updater,
      active: true,
      dialog: false,
      endpoints: ["https://raw.githubusercontent.com/182376/time-tracking/updates/latest.json"],
    },
  };
  await writeJson(TAURI_CONFIG_PATH, tauriConfig);

  const cargoToml = await readText(CARGO_TOML_PATH);
  const updatedCargoToml = cargoToml.replace(
    /(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
    `$1${version}$2`,
  );

  if (updatedCargoToml === cargoToml) {
    fail("could not find [package] version in src-tauri/Cargo.toml");
  }

  await writeFile(CARGO_TOML_PATH, updatedCargoToml, "utf8");
}

function findVersionSection(changelog, version) {
  const headingPattern = new RegExp(
    `^## \\[${escapeRegExp(version)}\\] - (\\d{4}-\\d{2}-\\d{2})\\s*$`,
    "m",
  );
  const heading = headingPattern.exec(changelog);

  if (!heading) {
    fail(`CHANGELOG.md is missing "## [${version}] - YYYY-MM-DD"`);
  }

  const sectionStart = heading.index + heading[0].length;
  const rest = changelog.slice(sectionStart);
  const nextHeading = rest.search(/^## \[/m);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  return {
    date: heading[1],
    body: body.trim(),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldValue(sectionBody, field) {
  const match = new RegExp(`^${field}:\\s*(.+?)\\s*$`, "m").exec(sectionBody);
  return match?.[1]?.trim() ?? "";
}

function assertFinalField(field, value, version) {
  if (!value) {
    fail(`CHANGELOG.md ${version} is missing "${field}:"`);
  }

  if (/^(待定|TBD|TODO)\.?$/i.test(value)) {
    fail(`CHANGELOG.md ${version} has unfinished "${field}: ${value}"`);
  }
}

function sectionBullets(sectionBody, heading) {
  const match = new RegExp(`^### ${heading}\\s*$`, "m").exec(sectionBody);
  if (!match) {
    return [];
  }

  const contentStart = match.index + match[0].length;
  const rest = sectionBody.slice(contentStart);
  const nextHeading = rest.search(/^### /m);
  const content = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .filter((line) => !/^-\s*暂无。?$/.test(line));
}

async function parseChangelog(version) {
  assertVersion(version);

  const changelog = await readText(CHANGELOG_PATH);
  const section = findVersionSection(changelog, version);
  const release = fieldValue(section.body, "Release");
  const appNote = fieldValue(section.body, "App note");

  return {
    ...section,
    release,
    appNote,
    bullets: ["Added", "Changed", "Fixed", "Removed"].flatMap((heading) =>
      sectionBullets(section.body, heading),
    ),
  };
}

async function validateChangelog(version) {
  const parsed = await parseChangelog(version);
  assertFinalField("Release", parsed.release, version);
  assertFinalField("App note", parsed.appNote, version);

  if (parsed.release.length > 100) {
    fail(`CHANGELOG.md ${version} Release is too long; keep it short`);
  }

  if (parsed.appNote.length > 40) {
    fail(`CHANGELOG.md ${version} App note is too long; keep it lighter`);
  }
}

async function writeReleaseNotes(version, outputPath) {
  const parsed = await parseChangelog(version);
  await validateChangelog(version);

  const visibleBullets = parsed.bullets.slice(0, 6);
  const lines = [parsed.release, ""];

  if (visibleBullets.length > 0) {
    lines.push("### 主要变化", "", ...visibleBullets, "");
  }

  lines.push("### 下载", "", "- Windows 安装包：请下载本页附件中的 `.exe` 安装包。", "");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, lines.join("\n"), "utf8");
}

async function writeLatestJson(version, assetUrl, signature, outputPath, target = "windows-x86_64") {
  const parsed = await parseChangelog(version);
  await validateChangelog(version);

  if (!assetUrl) {
    fail("missing updater asset URL");
  }

  if (!signature) {
    fail("missing updater signature");
  }

  const latest = {
    version,
    notes: parsed.appNote,
    pub_date: new Date().toISOString(),
    platforms: {
      [target]: {
        signature,
        url: assetUrl,
      },
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeJson(outputPath, latest);
}

function help() {
  console.log(`Usage:
  node scripts/release.mjs sync-version <version>
  node scripts/release.mjs validate-changelog <version>
  node scripts/release.mjs write-release-notes <version> <output>
  node scripts/release.mjs write-latest-json <version> <asset-url> <signature> <output> [target]
`);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "sync-version":
    await syncVersion(args[0]);
    break;
  case "validate-changelog":
    await validateChangelog(args[0]);
    break;
  case "write-release-notes":
    await writeReleaseNotes(args[0], args[1]);
    break;
  case "write-latest-json":
    await writeLatestJson(args[0], args[1], args[2], args[3], args[4]);
    break;
  default:
    help();
    process.exit(command ? 1 : 0);
}
