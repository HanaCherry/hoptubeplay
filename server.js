const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const APP_VERSION = require("./package.json").version;
const GITHUB_REPO = "HanaCherry/hoptubeplay";

const PORT = Number(process.env.PORT) || 3001;
const HOST = "127.0.0.1";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const PEAR_AMUSE_PORT = 9863;
const PEAR_API_PORT = 26538;
const PEAR_TIMEOUT_MS = 2000;

const DEMO_TRACKS = [
  {
    id: "demo-sunflower",
    videoId: "ApXoWvfEYVU",
    name: "Sunflower (Spider-Man: Into the Spider-Verse)",
    artists: [{ name: "Post Malone" }, { name: "Swae Lee" }],
    album: {
      name: "Spider-Man: Into the Spider-Verse",
      images: [{ url: "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg" }],
    },
    duration_ms: 158000,
    external_urls: { youtube: "https://www.youtube.com/watch?v=ApXoWvfEYVU" },
  },
  {
    id: "demo-city",
    name: "The City (with Quinn XCII)",
    artists: [{ name: "Louis The Child" }, { name: "Quinn XCII" }],
    album: {
      name: "The City",
      images: [{ url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=640&q=80" }],
    },
    duration_ms: 186000,
    external_urls: { youtube: "https://music.youtube.com" },
  },
  {
    id: "demo-steps",
    name: "Steps",
    artists: [{ name: "dryhope" }],
    album: {
      name: "Study Session",
      images: [{ url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=640&q=80" }],
    },
    duration_ms: 150000,
    external_urls: { youtube: "https://music.youtube.com" },
  },
  {
    id: "demo-medusa",
    name: "Medusa",
    artists: [{ name: "GRiZ" }],
    album: {
      name: "Medusa",
      images: [{ url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=640&q=80" }],
    },
    duration_ms: 190000,
    external_urls: { youtube: "https://music.youtube.com" },
  },
  {
    id: "demo-alone",
    name: "Better Off Alone",
    artists: [{ name: "Kai Wachi" }],
    album: {
      name: "Better Off Alone",
      images: [{ url: "https://images.unsplash.com/photo-1459749411177-04aa50016ec1?w=640&q=80" }],
    },
    videoId: "CcsUYu0PVxY",
    duration_ms: 291000,
    external_urls: { youtube: "https://www.youtube.com/watch?v=CcsUYu0PVxY" },
  },
];

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function defaultProfile(id, name) {
  return {
    id,
    name,
    player: "cinema",
    cover: "clip",
    coverGlow: true,
    playerGlow: true,
    magicColors: true,
    accentColor: "#ff0033",
    theme: "dark",
    hideOnPause: false,
    hideOnPauseDelay: 5,
    songChangeOnly: false,
    songChangeDuration: 8,
    coverBlur: true,
    hideVisualizer: false,
    placement: "bl",
    appearEffect: "slide",
    appearDuration: 0.7,
    hideDuration: 0.45,
    appearDelay: 0.05,
  };
}

function defaultSettings() {
  return {
    activeProfile: "default",
    demoTrack: 0,
    demoPlaying: true,
    profiles: [defaultProfile("default", "Principal")],
  };
}

function defaultConfig() {
  return {
    pearHost: "127.0.0.1",
    pearPort: PEAR_AMUSE_PORT,
    pearMode: "auto",
    pearToken: "",
    forceDemo: false,
    widgetToken: crypto.randomBytes(24).toString("hex"),
  };
}

function getConfig() {
  const cfg = { ...defaultConfig(), ...readJson(CONFIG_FILE, {}) };
  if (!cfg.widgetToken) cfg.widgetToken = crypto.randomBytes(24).toString("hex");
  if (!cfg.pearHost) cfg.pearHost = "127.0.0.1";
  if (!cfg.pearMode) cfg.pearMode = "auto";
  if (!Number(cfg.pearPort)) cfg.pearPort = PEAR_AMUSE_PORT;
  return cfg;
}

function saveConfig(cfg) {
  writeJson(CONFIG_FILE, cfg);
}

function getSettings() {
  const s = { ...defaultSettings(), ...readJson(SETTINGS_FILE, {}) };
  if (!Array.isArray(s.profiles) || !s.profiles.length) {
    s.profiles = defaultSettings().profiles;
  }
  s.profiles = s.profiles.map((p) => ({ ...defaultProfile(p.id, p.name), ...p }));
  if (!s.profiles.find((p) => p.id === s.activeProfile)) {
    s.activeProfile = s.profiles[0].id;
  }
  return s;
}

function saveSettings(s) {
  writeJson(SETTINGS_FILE, s);
}

const SMTC_SCRIPT = path.join(ROOT, "smtc.ps1");
const SMTC_COVER = path.join(DATA_DIR, "smtc-cover.bin");
let lastSmtc = { at: 0, raw: null };
let smtcProc = null;
let smtcRestartTimer = null;

function startSmtcWatcher() {
  if (smtcProc) return;
  try {
    smtcProc = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy", "Bypass",
      "-File", SMTC_SCRIPT,
      SMTC_COVER,
      "watch",
    ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let buf = "";
    smtcProc.stdout.setEncoding("utf8");
    smtcProc.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          lastSmtc = { at: Date.now(), raw: JSON.parse(line) };
        } catch {}
      }
    });
    smtcProc.on("exit", () => {
      smtcProc = null;
      if (smtcRestartTimer) return;
      smtcRestartTimer = setTimeout(() => {
        smtcRestartTimer = null;
        startSmtcWatcher();
      }, 800);
    });
  } catch {
    smtcProc = null;
  }
}

function readSmtc() {
  if (lastSmtc.raw) return lastSmtc.raw;
  try {
    const r = spawnSync("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy", "Bypass",
      "-File", SMTC_SCRIPT,
      SMTC_COVER,
    ], { encoding: "utf8", windowsHide: true, timeout: 2500 });
    const line = String(r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
    const raw = line ? JSON.parse(line) : { ok: false };
    lastSmtc = { at: Date.now(), raw };
    return raw;
  } catch {
    lastSmtc = { at: Date.now(), raw: { ok: false } };
    return lastSmtc.raw;
  }
}

function fromSmtc(raw) {
  if (!raw || !raw.ok || !raw.title) return null;
  let image = "";
  if (raw.hasThumb && fs.existsSync(SMTC_COVER)) {
    try {
      image = `/api/smtc-cover?t=${fs.statSync(SMTC_COVER).mtimeMs}`;
    } catch {}
  }
  const key = `${raw.appId || ""}|${raw.title}|${raw.artist || ""}`;
  return {
    is_playing: String(raw.status) === "Playing",
    shuffle_state: false,
    repeat_state: "off",
    progress_ms: Number(raw.progressMs) || 0,
    duration_ms: Number(raw.durationMs) || 0,
    title: String(raw.title || ""),
    artist: String(raw.artist || ""),
    album: String(raw.album || ""),
    image,
    trackId: `smtc-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 12)}`,
    videoId: "",
    url: "",
    demo: false,
    source: "youtube",
    appId: String(raw.appId || ""),
  };
}

const YT_ID_FILE = path.join(DATA_DIR, "yt-ids.json");
let ytIdCache = readJson(YT_ID_FILE, {});
const ytResolving = new Map();

function cachedYt(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry ? { id: entry, embeddable: null } : null;
  if (entry.id) return entry;
  return null;
}

function ytSearchQuery(title, artist) {
  const clean = (s) => String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [clean(title), clean(artist)].filter(Boolean).join(" ");
}

async function isYoutubeEmbeddable(id) {
  if (!id) return false;
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(2500),
      }
    );
    return r.ok;
  } catch {
    return false;
  }
}

async function resolveYoutubeId(title, artist) {
  const key = `${title || ""}\n${artist || ""}`.trim().toLowerCase();
  if (!title) return { id: "", embeddable: false };
  const hit = cachedYt(ytIdCache[key]);
  if (hit && hit.id && hit.embeddable === true) return hit;
  if (hit && hit.id && hit.embeddable === false) return hit;
  if (ytResolving.has(key)) return ytResolving.get(key);
  const job = (async () => {
    try {
      const q = encodeURIComponent(ytSearchQuery(title, artist) || title);
      const r = await fetch(`https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%3D%3D`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!r.ok) return { id: hit?.id || "", embeddable: false };
      const html = await r.text();
      const ids = [...new Set([
        ...[...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]),
        ...[...html.matchAll(/watch\?v=([A-Za-z0-9_-]{11})/g)].map((m) => m[1]),
      ])].slice(0, 6);
      const checks = await Promise.all(ids.map(async (id) => ({ id, embeddable: await isYoutubeEmbeddable(id) })));
      const playable = checks.find((c) => c.embeddable) || { id: ids[0] || "", embeddable: false };
      if (playable.id) {
        ytIdCache[key] = playable;
        writeJson(YT_ID_FILE, ytIdCache);
      }
      return playable;
    } catch {
      return { id: hit?.id || "", embeddable: false };
    } finally {
      ytResolving.delete(key);
    }
  })();
  ytResolving.set(key, job);
  return job;
}

async function enrichSmtc(np) {
  if (!np) return null;
  const key = `${np.title || ""}\n${np.artist || ""}`.trim().toLowerCase();
  const hit = cachedYt(ytIdCache[key]);
  if (hit && hit.id) {
    np.videoId = hit.id;
    np.embeddable = hit.embeddable === true;
    np.url = `https://www.youtube.com/watch?v=${hit.id}`;
    if (!np.image) np.image = `https://i.ytimg.com/vi/${hit.id}/hqdefault.jpg`;
    return np;
  }
  resolveYoutubeId(np.title, np.artist).catch(() => {});
  return np;
}

async function markEmbeddable(np) {
  if (!np || !np.videoId) return np;
  if (typeof np.embeddable === "boolean") return np;
  np.embeddable = await isYoutubeEmbeddable(np.videoId);
  return np;
}

function pearBase(host, port) {
  return `http://${host}:${port}`;
}

function pearHeaders(cfg, kind) {
  const headers = { Accept: "application/json" };
  if (kind === "apiserver" && cfg.pearToken) {
    headers.Authorization = `Bearer ${cfg.pearToken}`;
  }
  return headers;
}

function pearTargets(cfg) {
  const host = cfg.pearHost || "127.0.0.1";
  const port = Number(cfg.pearPort) || PEAR_AMUSE_PORT;
  const mode = cfg.pearMode || "auto";
  const targets = [];
  if (mode === "amuse") {
    targets.push({ host, port, path: "/query", kind: "amuse" });
    targets.push({ host, port, path: "/api", kind: "amuse" });
  } else if (mode === "apiserver") {
    targets.push({ host, port, path: "/api/v1/song", kind: "apiserver" });
    targets.push({ host, port, path: "/api/v1/song-info", kind: "apiserver" });
  } else {
    targets.push({ host, port, path: "/query", kind: "amuse" });
    targets.push({ host, port, path: "/api", kind: "amuse" });
    const apiPort = port === PEAR_AMUSE_PORT ? PEAR_API_PORT : port;
    targets.push({ host, port: apiPort, path: "/api/v1/song", kind: "apiserver" });
    if (port !== PEAR_AMUSE_PORT) {
      targets.push({ host, port: PEAR_AMUSE_PORT, path: "/query", kind: "amuse" });
    }
    if (apiPort !== PEAR_API_PORT) {
      targets.push({ host, port: PEAR_API_PORT, path: "/api/v1/song", kind: "apiserver" });
    }
  }
  const seen = new Set();
  return targets.filter((t) => {
    const key = `${t.host}:${t.port}${t.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fromAmuse(json) {
  if (!json || typeof json !== "object") return null;
  const track = json.track || {};
  const player = json.player || {};
  if (!player.hasSong && !track.title) return null;
  const videoId = track.id || "";
  const cover = track.cover || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
  return {
    is_playing: !player.isPaused,
    shuffle_state: false,
    repeat_state: "off",
    progress_ms: Math.max(0, Number(player.seekbarCurrentPosition || 0) * 1000),
    duration_ms: Math.max(0, Number(track.duration || 0) * 1000),
    title: track.title || "",
    artist: track.author || "",
    album: "",
    image: cover,
    trackId: videoId,
    videoId,
    url: track.url || (videoId ? `https://music.youtube.com/watch?v=${videoId}` : ""),
    demo: false,
    source: "youtube",
    isAdvertisement: !!track.isAdvertisement,
  };
}

function fromApiServer(json) {
  if (!json || typeof json !== "object") return null;
  if (!json.title && !json.videoId) return null;
  const videoId = json.videoId || "";
  const cover = json.imageSrc || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
  return {
    is_playing: !json.isPaused,
    shuffle_state: false,
    repeat_state: "off",
    progress_ms: Math.max(0, Number(json.elapsedSeconds || 0) * 1000),
    duration_ms: Math.max(0, Number(json.songDuration || 0) * 1000),
    title: json.title || "",
    artist: json.artist || "",
    album: json.album || "",
    image: cover,
    trackId: videoId,
    videoId,
    url: json.url || (videoId ? `https://music.youtube.com/watch?v=${videoId}` : ""),
    demo: false,
    source: "youtube",
    isAdvertisement: false,
  };
}

let lastPear = { ok: false, source: null, port: null, error: "", at: 0 };
let lastGoodTrack = null;
let pearClock = { id: "", progressMs: 0, at: Date.now(), playing: false };

function interpolateProgress(np) {
  if (!np || !np.trackId) return np;
  if (np.trackId !== pearClock.id) {
    pearClock = {
      id: np.trackId,
      progressMs: np.progress_ms || 0,
      at: Date.now(),
      playing: !!np.is_playing,
    };
    return np;
  }
  const incoming = np.progress_ms || 0;
  if (incoming > pearClock.progressMs + 350 || incoming < pearClock.progressMs - 900) {
    pearClock.progressMs = incoming;
    pearClock.at = Date.now();
  }
  pearClock.playing = !!np.is_playing;
  if (np.is_playing) {
    np.progress_ms = Math.min(
      np.duration_ms || incoming,
      pearClock.progressMs + (Date.now() - pearClock.at)
    );
  } else {
    np.progress_ms = incoming;
    pearClock.progressMs = incoming;
    pearClock.at = Date.now();
  }
  return np;
}

async function fetchPearNowPlaying(cfg) {
  let lastErr = "";
  for (const t of pearTargets(cfg)) {
    try {
      const r = await fetch(`${pearBase(t.host, t.port)}${t.path}`, {
        headers: pearHeaders(cfg, t.kind),
        signal: AbortSignal.timeout(PEAR_TIMEOUT_MS),
      });
      if (r.status === 204) {
        lastPear = { ok: true, source: t.kind, port: t.port, error: "", at: Date.now() };
        return { empty: true, source: t.kind, port: t.port };
      }
      if (r.status === 401 || r.status === 403) {
        lastErr = "Pear Desktop demande une autorisation. Autorise HopTubePlay dans l'app, ou désactive l'auth du plugin API Server.";
        continue;
      }
      if (!r.ok) {
        lastErr = `HTTP ${r.status}`;
        continue;
      }
      const json = await r.json();
      const mapped = t.kind === "amuse" ? fromAmuse(json) : fromApiServer(json);
      if (!mapped) {
        lastErr = "Réponse Pear vide";
        continue;
      }
      lastPear = { ok: true, source: t.kind, port: t.port, error: "", at: Date.now() };
      return { now: mapped, source: t.kind, port: t.port };
    } catch (err) {
      lastErr = err.message || "unreachable";
    }
  }
  lastPear = { ok: false, source: null, port: null, error: lastErr || "unreachable", at: Date.now() };
  return { error: lastErr || "unreachable" };
}

let demoClock = { track: -1, playing: false, position: 0, at: Date.now() };
function demoNowPlaying() {
  const s = getSettings();
  if (demoClock.track !== s.demoTrack) {
    demoClock = { track: s.demoTrack, playing: s.demoPlaying, position: 0, at: Date.now() };
  }
  if (demoClock.playing !== s.demoPlaying) {
    demoClock.position += demoClock.playing ? Date.now() - demoClock.at : 0;
    demoClock.at = Date.now();
    demoClock.playing = s.demoPlaying;
  }
  const track = DEMO_TRACKS[s.demoTrack % DEMO_TRACKS.length];
  const duration = track.duration_ms;
  let progress = demoClock.position + (s.demoPlaying ? Date.now() - demoClock.at : 0);
  if (progress >= duration) {
    if (s.demoRepeat === "track") {
      demoClock.position = progress % duration;
      demoClock.at = Date.now();
      progress = demoClock.position;
    } else if (s.demoTrack < DEMO_TRACKS.length - 1 || s.demoRepeat === "context" || s.demoShuffle) {
      s.demoTrack = s.demoShuffle ? (s.demoTrack + 1 + Math.floor(Math.random() * (DEMO_TRACKS.length - 1))) % DEMO_TRACKS.length : (s.demoTrack + 1) % DEMO_TRACKS.length;
      saveSettings(s);
      return demoNowPlaying();
    } else {
      s.demoPlaying = false;
      saveSettings(s);
      demoClock = { track: s.demoTrack, playing: false, position: duration, at: Date.now() };
      progress = duration;
    }
  }
  return {
    is_playing: !!s.demoPlaying,
    shuffle_state: !!s.demoShuffle,
    repeat_state: s.demoRepeat || "off",
    progress_ms: progress,
    item: track,
    currently_playing_type: "track",
    demo: true,
  };
}

function publicNowPlaying(raw) {
  if (!raw || !raw.item) {
    return { is_playing: false, item: null, progress_ms: 0, demo: !!raw?.demo };
  }
  const item = raw.item;
  const images = item.album?.images || [];
  const image = images[0]?.url || images[1]?.url || "";
  return {
    is_playing: !!raw.is_playing,
    shuffle_state: !!raw.shuffle_state,
    repeat_state: raw.repeat_state || "off",
    progress_ms: raw.progress_ms || 0,
    duration_ms: item.duration_ms || 0,
    title: item.name || "",
    artist: (item.artists || []).map((a) => a.name).join(", "),
    album: item.album?.name || "",
    image,
    trackId: item.id || "",
    videoId: item.videoId || "",
    url: item.external_urls?.youtube || "",
    demo: !!raw.demo,
    source: raw.demo ? "demo" : "youtube",
  };
}

function pearCommandSpec(action, value) {
  if (action === "play") return { method: "POST", path: "/api/v1/play" };
  if (action === "pause") return { method: "POST", path: "/api/v1/pause" };
  if (action === "next") return { method: "POST", path: "/api/v1/next" };
  if (action === "previous") return { method: "POST", path: "/api/v1/previous" };
  if (action === "seek") {
    return { method: "POST", path: "/api/v1/seek-to", body: { seconds: Math.max(0, Number(value) / 1000) } };
  }
  if (action === "shuffle") return { method: "POST", path: "/api/v1/shuffle" };
  if (action === "repeat") return { method: "POST", path: "/api/v1/switch-repeat", body: { iteration: 1 } };
  return null;
}

async function sendPearCommand(cfg, action, value) {
  const spec = pearCommandSpec(action, value);
  if (!spec) return { ok: false, status: 400, error: "Commande invalide." };
  const host = cfg.pearHost || "127.0.0.1";
  const ports = [];
  if (cfg.pearMode === "apiserver") ports.push(Number(cfg.pearPort) || PEAR_API_PORT);
  else if (cfg.pearMode === "auto") {
    ports.push(PEAR_API_PORT);
    if (Number(cfg.pearPort) && Number(cfg.pearPort) !== PEAR_API_PORT) ports.push(Number(cfg.pearPort));
  } else {
    ports.push(PEAR_API_PORT);
  }
  let lastErr = "Pear Desktop API Server injoignable.";
  for (const port of ports) {
    try {
      const r = await fetch(`${pearBase(host, port)}${spec.path}`, {
        method: spec.method,
        headers: {
          ...pearHeaders(cfg, "apiserver"),
          ...(spec.body ? { "Content-Type": "application/json" } : {}),
        },
        body: spec.body ? JSON.stringify(spec.body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 204 || r.ok) return { ok: true, port };
      lastErr = `HTTP ${r.status}`;
    } catch (err) {
      lastErr = err.message;
    }
  }
  return { ok: false, status: 502, error: lastErr };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(express.static(PUBLIC_DIR));

app.get("/api/status", async (_req, res) => {
  const cfg = getConfig();
  const smtcNow = cfg.forceDemo ? null : await enrichSmtc(fromSmtc(readSmtc()));
  if (!lastPear.at || Date.now() - lastPear.at > 4000) {
    await fetchPearNowPlaying(cfg);
  }
  const source = smtcNow ? "windows" : lastPear.ok ? "pear" : "demo";
  res.json({
    connected: !!(smtcNow || lastPear.ok),
    source,
    smtcApp: smtcNow ? smtcNow.appId : "",
    pearHost: cfg.pearHost,
    pearPort: cfg.pearPort,
    pearMode: cfg.pearMode,
    pearToken: cfg.pearToken ? "set" : "",
    pearSource: lastPear.source,
    pearError: lastPear.ok ? "" : lastPear.error,
    widgetToken: cfg.widgetToken,
    widgetUrl: `http://${HOST}:${PORT}/widget.html?token=${cfg.widgetToken}`,
    version: APP_VERSION,
  });
});

app.post("/api/youtube/auto", async (_req, res) => {
  const cfg = getConfig();
  cfg.forceDemo = false;
  saveConfig(cfg);
  const smtcNow = await enrichSmtc(fromSmtc(readSmtc()));
  if (smtcNow) {
    return res.json({
      ok: true,
      connected: true,
      source: "windows",
      title: smtcNow.title,
      artist: smtcNow.artist,
      appId: smtcNow.appId,
      videoId: smtcNow.videoId || "",
    });
  }
  return res.status(400).json({
    ok: false,
    error: "Rien de détecté. Lance un titre sur YouTube ou YouTube Music dans Chrome ou Edge.",
  });
});

app.post("/api/pear/config", async (req, res) => {
  const host = String(req.body.host || req.body.pearHost || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(req.body.port || req.body.pearPort) || PEAR_AMUSE_PORT;
  const mode = String(req.body.mode || req.body.pearMode || "auto");
  if (!["auto", "amuse", "apiserver"].includes(mode)) {
    return res.status(400).json({ error: "Mode invalide. Utilise auto, amuse ou apiserver." });
  }
  if (port < 1 || port > 65535) {
    return res.status(400).json({ error: "Port invalide." });
  }
  const cfg = getConfig();
  cfg.pearHost = host;
  cfg.pearPort = port;
  cfg.pearMode = mode;
  if (typeof req.body.token === "string" || typeof req.body.pearToken === "string") {
    cfg.pearToken = String(req.body.token || req.body.pearToken || "").trim();
  }
  cfg.forceDemo = false;
  saveConfig(cfg);
  const result = await fetchPearNowPlaying(cfg);
  if (result.error) {
    return res.status(400).json({
      ok: false,
      error: `Pear Desktop injoignable (${result.error}). Installe Pear, active le plugin Amuse (port 9863) ou API Server (port 26538), et lance un titre.`,
      pearHost: cfg.pearHost,
      pearPort: cfg.pearPort,
      pearMode: cfg.pearMode,
    });
  }
  res.json({
    ok: true,
    connected: true,
    source: result.source,
    port: result.port,
    empty: !!result.empty,
  });
});

app.post("/api/pear/disconnect", (_req, res) => {
  const cfg = getConfig();
  cfg.forceDemo = true;
  saveConfig(cfg);
  lastPear = { ok: false, source: null, port: null, error: "disconnected", at: Date.now() };
  lastGoodTrack = null;
  res.json({ ok: true });
});

app.post("/api/token/regenerate", (_req, res) => {
  const cfg = getConfig();
  cfg.widgetToken = crypto.randomBytes(24).toString("hex");
  saveConfig(cfg);
  res.json({
    widgetToken: cfg.widgetToken,
    widgetUrl: `http://${HOST}:${PORT}/widget.html?token=${cfg.widgetToken}`,
  });
});

app.post("/api/player/:action", async (req, res) => {
  if (!isLocal(req) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
    return res.status(403).json({ error: "Origine non autorisée." });
  }
  const action = req.params.action;
  const value = req.body?.value;
  if (!["play", "pause", "previous", "next", "shuffle", "repeat", "seek"].includes(action) ||
      (action === "shuffle" && typeof value !== "boolean") ||
      (action === "repeat" && !["off", "context", "track"].includes(value)) ||
      (action === "seek" && (!Number.isSafeInteger(value) || value < 0))) {
    return res.status(400).json({ error: "Commande invalide." });
  }
  const cfg = getConfig();
  const pear = await fetchPearNowPlaying(cfg);
  if (pear.now || pear.empty) {
    const result = await sendPearCommand(cfg, action, value);
    if (!result.ok) {
      return res.status(result.status || 502).json({
        error: result.error || "Active le plugin API Server dans Pear Desktop pour contrôler la lecture.",
      });
    }
    return res.json({ ok: true, source: "youtube" });
  }
  try {
    const current = demoNowPlaying();
    const s = getSettings();
    demoClock.position = current.progress_ms;
    demoClock.at = Date.now();
    if (action === "play" || action === "pause") {
      s.demoPlaying = action === "play";
      demoClock.playing = s.demoPlaying;
      if (s.demoPlaying && demoClock.position >= current.item.duration_ms) demoClock.position = 0;
    }
    if (action === "next" || action === "previous") {
      const step = action === "previous" ? -1 : s.demoShuffle ? 1 + Math.floor(Math.random() * (DEMO_TRACKS.length - 1)) : 1;
      s.demoTrack = (s.demoTrack + step + DEMO_TRACKS.length) % DEMO_TRACKS.length;
    }
    if (action === "seek") demoClock.position = Math.min(value, current.item.duration_ms);
    if (action === "shuffle") s.demoShuffle = value;
    if (action === "repeat") s.demoRepeat = value;
    saveSettings(s);
    return res.json({ ok: true, demo: true });
  } catch {
    res.status(502).json({ error: "Commande impossible. Réessaie dans un instant." });
  }
});

app.get("/api/smtc-cover", (_req, res) => {
  if (!fs.existsSync(SMTC_COVER)) return res.status(404).end();
  const buf = fs.readFileSync(SMTC_COVER);
  const type = buf[0] === 0x89 ? "image/png" : buf[0] === 0x47 ? "image/gif" : "image/jpeg";
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.send(buf);
});

app.get("/api/now-playing", async (_req, res) => {
  const cfg = getConfig();
  if (!cfg.forceDemo) {
    const smtcNow = await enrichSmtc(fromSmtc(readSmtc()));
    if (smtcNow) return res.json(interpolateProgress(smtcNow));
  }
  const pear = await fetchPearNowPlaying(cfg);
  if (pear.now) {
    if (pear.now.isAdvertisement && lastGoodTrack) {
      return res.json({ ...lastGoodTrack, is_playing: false });
    }
    const track = await markEmbeddable(pear.now);
    if (!pear.now.isAdvertisement) lastGoodTrack = track;
    return res.json(interpolateProgress(track));
  }
  if (pear.empty) {
    return res.json({
      is_playing: false,
      item: null,
      progress_ms: 0,
      demo: false,
      source: "youtube",
      message: "Rien en lecture. Lance une musique dans Pear Desktop.",
    });
  }
  res.json(await markEmbeddable(publicNowPlaying(demoNowPlaying())));
});

app.get("/api/canvas/:id", (_req, res) => {
  res.json({ url: null });
});

app.get("/api/image", async (req, res) => {
  const url = String(req.query.url || "");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).end();
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === "i.ytimg.com" ||
    host === "img.youtube.com" ||
    host.endsWith(".ytimg.com") ||
    host.endsWith(".ggpht.com") ||
    host.endsWith(".googleusercontent.com") ||
    host === "images.unsplash.com";
  if (!allowed) return res.status(400).end();
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).end();
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).end();
  }
});

app.get("/api/settings", (req, res) => {
  const s = getSettings();
  const profileId = String(req.query.profile || s.activeProfile);
  const profile = s.profiles.find((p) => p.id === profileId) || s.profiles[0];
  res.json({ ...s, profile });
});

app.put("/api/settings", (req, res) => {
  const s = getSettings();
  const incoming = req.body || {};
  if (incoming.profile && incoming.profile.id) {
    const idx = s.profiles.findIndex((p) => p.id === incoming.profile.id);
    if (idx >= 0) {
      s.profiles[idx] = { ...s.profiles[idx], ...incoming.profile };
    }
  }
  if (incoming.activeProfile) s.activeProfile = incoming.activeProfile;
  if (typeof incoming.demoTrack === "number") s.demoTrack = incoming.demoTrack;
  if (typeof incoming.demoPlaying === "boolean") s.demoPlaying = incoming.demoPlaying;
  saveSettings(s);
  res.json(s);
});

app.post("/api/profiles", (req, res) => {
  const s = getSettings();
  if (s.profiles.length >= 5) {
    return res.status(400).json({ error: "Maximum 5 profiles." });
  }
  const id = crypto.randomBytes(6).toString("hex");
  const name = String(req.body.name || `Profil ${s.profiles.length + 1}`);
  const base = s.profiles.find((p) => p.id === s.activeProfile) || s.profiles[0];
  const profile = { ...base, id, name };
  s.profiles.push(profile);
  s.activeProfile = id;
  saveSettings(s);
  res.json(s);
});

app.delete("/api/profiles/:id", (req, res) => {
  const s = getSettings();
  if (s.profiles.length <= 1) {
    return res.status(400).json({ error: "Il faut au moins un profil." });
  }
  s.profiles = s.profiles.filter((p) => p.id !== req.params.id);
  if (s.activeProfile === req.params.id) s.activeProfile = s.profiles[0].id;
  saveSettings(s);
  res.json(s);
});

app.post("/api/demo/next", (_req, res) => {
  const s = getSettings();
  s.demoTrack = (s.demoTrack + 1) % DEMO_TRACKS.length;
  saveSettings(s);
  res.json(s);
});

app.get("/widget", (_req, res) => {
  res.redirect("/widget.html");
});

function isLocal(req) {
  const ip = req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function parseVer(v) {
  return String(v || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}
function isNewer(remote, local) {
  const a = parseVer(remote);
  const b = parseVer(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}
async function fetchLatestRelease() {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { "User-Agent": "HopTubePlay", Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const json = await r.json();
  const tag = json.tag_name || "";
  return {
    tag,
    version: tag.replace(/^v/i, ""),
    notes: json.body || "",
    url: json.html_url,
    zip: `https://github.com/${GITHUB_REPO}/archive/refs/tags/${encodeURIComponent(tag)}.zip`,
  };
}
function copyUpdate(from, to) {
  const skip = new Set(["data", "node_modules", ".git"]);
  for (const name of fs.readdirSync(from)) {
    if (skip.has(name)) continue;
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, dest, { recursive: true, force: true });
    else fs.copyFileSync(src, dest);
  }
}
function restartApp() {
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    detached: true,
    stdio: "ignore",
    cwd: ROOT,
    windowsHide: true,
  });
  child.unref();
  process.exit(0);
}

let updating = false;

app.get("/api/update/check", async (_req, res) => {
  try {
    const latest = await fetchLatestRelease();
    res.json({
      current: APP_VERSION,
      latest: latest.version,
      tag: latest.tag,
      notes: latest.notes,
      url: latest.url,
      updateAvailable: isNewer(latest.version, APP_VERSION),
    });
  } catch (err) {
    res.json({ current: APP_VERSION, updateAvailable: false, error: err.message });
  }
});

app.post("/api/update/apply", async (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: "Local only." });
  if (updating) return res.status(409).json({ error: "Update already running." });
  updating = true;
  try {
    const latest = await fetchLatestRelease();
    if (!isNewer(latest.version, APP_VERSION)) {
      updating = false;
      return res.json({ ok: true, updated: false, current: APP_VERSION });
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hoptubeplay-"));
    const zipPath = path.join(tmp, "update.zip");
    const zipRes = await fetch(latest.zip, { headers: { "User-Agent": "HopTubePlay" }, redirect: "follow" });
    if (!zipRes.ok) throw new Error(`Download ${zipRes.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));
    const extractDir = path.join(tmp, "src");
    fs.mkdirSync(extractDir);
    await new Promise((resolve, reject) => {
      const ps = spawn("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ], { windowsHide: true });
      ps.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("unzip failed"))));
      ps.on("error", reject);
    });
    const unpacked = fs.readdirSync(extractDir)
      .map((n) => path.join(extractDir, n))
      .find((p) => fs.statSync(p).isDirectory());
    if (!unpacked) throw new Error("Empty archive");
    copyUpdate(unpacked, ROOT);
    res.json({ ok: true, updated: true, version: latest.version, restarting: true });
    setTimeout(() => restartApp(), 900);
  } catch (err) {
    updating = false;
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stop", (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: "Local only." });
  res.json({ ok: true, stopped: true });
  setTimeout(() => {
    try { if (smtcProc) smtcProc.kill(); } catch {}
    try {
      const pidFile = path.join(DATA_DIR, "hoptubeplay.pid");
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    } catch {}
    process.exit(0);
  }, 200);
});

ensureDir();
if (!fs.existsSync(CONFIG_FILE)) saveConfig(defaultConfig());
if (!fs.existsSync(SETTINGS_FILE)) saveSettings(defaultSettings());
fs.writeFileSync(path.join(DATA_DIR, "hoptubeplay.pid"), String(process.pid));

app.listen(PORT, HOST, () => {
  startSmtcWatcher();
  console.log("");
  console.log("  HopTubePlay  ·  GalaxyBunny Studio");
  console.log(`  Dashboard : http://${HOST}:${PORT}`);
  console.log(`  Overlay   : http://${HOST}:${PORT}/widget.html`);
  console.log("  Source    : YouTube auto-detect (Windows)");
  console.log("");
});

process.on("exit", () => {
  try {
    const pidFile = path.join(DATA_DIR, "hoptubeplay.pid");
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  } catch {}
});
