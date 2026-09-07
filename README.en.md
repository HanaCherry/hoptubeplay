<p align="center">
  <img src="public/brand/studio-logo.png" alt="GalaxyBunny Studio" width="120">
</p>

<h1 align="center">HopTubePlay</h1>
<p align="center"><strong>GalaxyBunny Studio</strong> · YouTube now-playing overlay</p>

<p align="center">
  Local overlay for <strong>OBS</strong> and <strong>Streamlabs</strong> — title, artist, muted YouTube clip, Galaxy Bunny skins.<br>
  Automatic Windows detection. Demo mode with no account. Sound stays on your real player.
</p>

<p align="center">
  <a href="https://hanacherry.github.io/hoptubeplay/?lang=en"><img src="https://img.shields.io/badge/site-multilingual-ff4d6d?style=for-the-badge" alt="Site"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-c9bcff?style=for-the-badge" alt="MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge" alt="Node.js 18+"></a>
  <a href="https://github.com/HanaCherry/hoptubeplay/releases/latest"><img src="https://img.shields.io/badge/release-v1.0.0-c9bcff?style=for-the-badge" alt="v1.0.0"></a>
</p>

<p align="center">
  <a href="README.md">Français</a> ·
  <a href="README.en.md">English</a> ·
  <a href="https://hanacherry.github.io/hoptubeplay/?lang=en">All languages on the site</a>
</p>

<p align="center">
  <a href="https://hanacherry.github.io/hoptubeplay/?lang=en">Presentation site</a>
  ·
  <a href="https://github.com/HanaCherry/hoptubeplay/releases/latest">Latest release</a>
  ·
  <a href="https://github.com/HanaCherry/hopplay">HopPlay (Spotify)</a>
</p>

<p align="center">
  <img src="docs/assets/hero-banner.png" alt="HopTubePlay — cinema player" width="900">
</p>

## The clip, on stream

HopTubePlay is a **YouTube now-playing overlay** for streamers: local dashboard, 56 skins including **Cinema** and **Galaxy Bunny**, transparent OBS / Streamlabs source, up to 5 profiles.

This is a **clip player**, not an audio-only overlay. Video skins play the **muted** YouTube clip inside the player. Sound comes from your real YouTube tab. The thumbnail stays underneath if the clip cannot embed.

**Demo mode** works with no account. Nothing is sent to a GalaxyBunny server.

## Preview

<p align="center">
  <img src="docs/assets/dashboard.png" alt="HopTubePlay Studio dashboard" width="900">
</p>

<p align="center">
  <img src="docs/assets/overlay.png" alt="HopTubePlay cinema overlay" width="720">
</p>

## Features

- **56 skins** — music players and video players (Cinema, Film, VHS, Galaxy Bunny, kawaii, sakura…)
- **Muted YouTube clip** — the player shows the clip; sound stays on your real player
- **Windows detection** — YouTube or YouTube Music in Chrome / Edge, no extra app required
- **OBS / Streamlabs overlay** — Browser source, transparent background, 9 positions
- **Look** — magic colors, glow, blur, thumbnail / video / vinyl
- **5 profiles** — separate OBS URL and size
- **Private by design** — the server listens on `127.0.0.1`; `data/` is never published

## Quick start

Install [Node.js 18+](https://nodejs.org), then:

```sh
git clone https://github.com/HanaCherry/hoptubeplay.git
cd hoptubeplay
npm install
npm start
```

Open `http://127.0.0.1:3001`. Demo mode works immediately.

On Windows, `start.bat` also starts the server. `stop.bat` stops it.

HopTubePlay uses port **3001** (HopPlay stays on **3000**).

## OBS / Streamlabs

1. Start HopTubePlay and leave it running during the stream.
2. Copy the overlay URL from the dashboard.
3. Add a **Browser** source.
4. Paste the URL. Transparent background.

Suggested size: **1920 × 1080**.

Play a YouTube video in Chrome or Edge: the overlay follows Windows now-playing.

## YouTube (advanced, optional)

Windows detection is enough in most cases. [Pear Desktop](https://github.com/pear-devs/pear-desktop) remains an advanced option (Amuse plugin `9863` / API Server `26538`) if you need it.

Never commit secrets. They stay in `data/` (gitignored).

## License

MIT © GalaxyBunny Studio

HopTubePlay is an independent project. YouTube, YouTube Music and OBS belong to their owners. Not affiliated.
