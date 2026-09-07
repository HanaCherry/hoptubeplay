const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function harness() {
  const routes = new Map(), disk = new Map(), requests = [];
  const app = { use() {}, listen() {}, disable() {} };
  for (const method of ["get", "post", "put", "delete"]) app[method] = (url, handler) => routes.set(`${method} ${url}`, handler);
  const express = Object.assign(() => app, { json: () => () => {}, urlencoded: () => () => {}, static: () => () => {} });
  let clock = 1000000, pearStatus = 0;
  let pearBody = null;
  class Clock extends Date { static now() { return clock; } }
  const context = vm.createContext({
    require: (name) => name === "express" ? express : name === "fs" ? {
      existsSync: (p) => disk.has(p), mkdirSync() {}, readFileSync: (p) => disk.get(p), writeFileSync: (p, data) => disk.set(p, data),
    } : name === "./package.json" ? { version: "test" } : require(name),
    __dirname: path.resolve(__dirname, ".."), Buffer, URL, URLSearchParams, AbortSignal,
    Date: Clock, console, setTimeout, process: { env: {}, pid: 1, on() {} },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (!pearStatus) throw new Error("fetch failed");
      const body = pearBody;
      return {
        ok: pearStatus >= 200 && pearStatus < 300,
        status: pearStatus,
        json: async () => body,
      };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../server.js"), "utf8"), context);
  return {
    run: (code) => vm.runInContext(code, context),
    requests,
    advance: (ms) => { clock += ms; },
    pear: (status, body) => { pearStatus = status; pearBody = body; },
    async command(action, value, origin) {
      const res = { code: 200, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; } };
      await routes.get("post /api/player/:action")({ params: { action }, body: { value }, headers: { host: "127.0.0.1:3001", origin }, socket: { remoteAddress: "127.0.0.1" } }, res);
      return res;
    },
    async nowPlaying() {
      const res = { code: 200, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; } };
      await routes.get("get /api/now-playing")({}, res);
      return res.data;
    },
  };
}

test("demo preserves pause position, seeks to zero, resumes and changes tracks", async () => {
  const h = harness();
  h.run("demoNowPlaying()"); h.advance(15000);
  await h.command("pause"); h.advance(5000);
  assert.equal(h.run("demoNowPlaying().progress_ms"), 15000);
  await h.command("seek", 0);
  assert.equal(h.run("demoNowPlaying().progress_ms"), 0);
  await h.command("play"); h.advance(1000);
  assert.equal(h.run("demoNowPlaying().progress_ms"), 1000);
  await h.command("next"); assert.equal(h.run("demoNowPlaying().item.id"), "demo-city");
  await h.command("previous"); assert.equal(h.run("demoNowPlaying().item.id"), "demo-sunflower");
});

test("demo repeat, shuffle and end of queue follow shared state", async () => {
  const h = harness(); h.run("demoNowPlaying()");
  await h.command("repeat", "track"); h.advance(159000);
  assert.equal(h.run("demoNowPlaying().progress_ms"), 1000);
  await h.command("repeat", "off"); await h.command("previous");
  h.run("demoNowPlaying()"); h.advance(300000);
  assert.equal(h.run("demoNowPlaying().is_playing"), false);
  await h.command("shuffle", true);
  assert.equal(h.run("publicNowPlaying(demoNowPlaying()).shuffle_state"), true);
});

test("Amuse /query payload maps to HopTubePlay now-playing", () => {
  const h = harness();
  const mapped = h.run(`fromAmuse({
    player: { hasSong: true, isPaused: false, seekbarCurrentPosition: 12 },
    track: { title: "Blinding Lights", author: "The Weeknd", cover: "https://i.ytimg.com/vi/4NRXx6U8AB/hqdefault.jpg", duration: 200, url: "https://music.youtube.com/watch?v=4NRXx6U8AB", id: "4NRXx6U8AB", isAdvertisement: false }
  })`);
  assert.equal(mapped.title, "Blinding Lights");
  assert.equal(mapped.artist, "The Weeknd");
  assert.equal(mapped.is_playing, true);
  assert.equal(mapped.progress_ms, 12000);
  assert.equal(mapped.duration_ms, 200000);
  assert.equal(mapped.trackId, "4NRXx6U8AB");
  assert.equal(mapped.videoId, "4NRXx6U8AB");
  assert.equal(mapped.source, "youtube");
});

test("Pear API Server commands use /api/v1 routes", async () => {
  const h = harness();
  h.run('saveConfig({pearHost:"127.0.0.1",pearPort:26538,pearMode:"apiserver"})');
  h.pear(200, { title: "Test", artist: "A", videoId: "abc", songDuration: 180, elapsedSeconds: 10, isPaused: false });
  for (const [action, value, method, path] of [
    ["play", undefined, "POST", "/api/v1/play"],
    ["pause", undefined, "POST", "/api/v1/pause"],
    ["next", undefined, "POST", "/api/v1/next"],
    ["previous", undefined, "POST", "/api/v1/previous"],
    ["seek", 42000, "POST", "/api/v1/seek-to"],
  ]) {
    h.requests.length = 0;
    const res = await h.command(action, value);
    assert.equal(res.code, 200);
    const cmd = h.requests.find((r) => String(r.url).includes("/api/v1/") && !String(r.url).includes("/song"));
    assert.ok(cmd, `missing command for ${action}`);
    assert.equal(cmd.method, method);
    assert.ok(String(cmd.url).endsWith(path));
  }
});

test("invalid commands and cross-origin requests never reach Pear", async () => {
  const h = harness();
  for (const [action, value] of [["seek", -1], ["seek", "10"], ["shuffle", "true"], ["repeat", "invalid"], ["delete", null]]) {
    assert.equal((await h.command(action, value)).code, 400);
  }
  assert.equal((await h.command("play", undefined, "https://example.com")).code, 403);
  assert.equal(h.requests.length, 0);
});
