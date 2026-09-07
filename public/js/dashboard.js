(() => {
  const $ = (id) => document.getElementById(id);
  let settings = null;
  let status = null;

  function showSection() {
    const ids = ["apparence", "visibilite", "youtube", "obs"];
    const current = ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : "apparence";
    ids.forEach(id => { document.getElementById(id).hidden = id !== current; });
    document.querySelectorAll(".sidebar nav a").forEach(a => {
      const active = a.hash === "#" + current;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", showSection);
  showSection();
  const fields = [
    "coverGlow",
    "playerGlow",
    "magicColors",
    "coverBlur",
    "hideVisualizer",
    "hideOnPause",
    "songChangeOnly",
  ];

  function fillLangSelect() {
    const sel = $("lang-select");
    if (!sel || sel.options.length) return;
    const current = localStorage.getItem("hoptubeplay-lang") || (navigator.language || "en").slice(0, 2);
    (window.HOPTUBEPLAY_LANGS || []).forEach(([code, label]) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = label;
      if (code === current || (code === "en" && !window.HOPTUBEPLAY_I18N[current] && !sel.value)) opt.selected = true;
      sel.appendChild(opt);
    });
    if (window.HOPTUBEPLAY_I18N[current]) sel.value = current;
    sel.addEventListener("change", () => {
      localStorage.setItem("hoptubeplay-lang", sel.value);
      window.hoptubeplayApplyI18n();
      render();
    });
  }

  function makeStars() {
    const el = document.getElementById("stars");
    if (!el || el.childElementCount) return;
    for (let i = 0; i < 90; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      const size = 1 + Math.random() * 2.2;
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.animationDelay = Math.random() * 4 + "s";
      s.style.animationDuration = 2 + Math.random() * 3 + "s";
      el.appendChild(s);
    }
  }

  async function load() {
    makeStars();
    fillLangSelect();
    window.hoptubeplayApplyI18n();
    const [s, st] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
    ]);
    settings = s;
    status = st;
    render();
    if (!window.__hoptubeplayUpdateChecked) {
      window.__hoptubeplayUpdateChecked = true;
      checkUpdate();
    } else {
      const ver = $("app-version");
      if (ver && status.version) ver.textContent = `${window.hoptubeplayT("currentVersion")} ${status.version}`;
    }
  }

  function currentProfile() {
    return settings.profiles.find((p) => p.id === settings.activeProfile) || settings.profiles[0];
  }

  function render() {
    const p = currentProfile();
    const select = $("profile-select");
    select.innerHTML = settings.profiles
      .map((x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${escapeHtml(x.name)}</option>`)
      .join("");
    $("profile-name").value = p.name;

    document.querySelectorAll(".player-styles button").forEach((b) => {
      b.classList.toggle("active", b.dataset.player === p.player);
    });
    document.querySelectorAll("#cover-styles button").forEach((b) => {
      const cover = p.cover === "canvas" ? "clip" : p.cover;
      b.classList.toggle("active", b.dataset.cover === cover);
    });
    document.querySelectorAll("#place-grid button").forEach((b) => {
      b.classList.toggle("active", b.dataset.place === (p.placement || "bl"));
    });

    $("playerScale").value = p.playerScale ?? (p.player === "galaxybunny" ? 65 : 100);
    $("playerScaleValue").textContent = $("playerScale").value + " %";
    fields.forEach((k) => {
      const el = $(k);
      if (el) el.checked = !!p[k];
    });
    $("hideOnPauseDelay").value = p.hideOnPauseDelay;
    $("songChangeDuration").value = p.songChangeDuration;
    $("appearDuration").value = p.appearDuration ?? 0.7;
    $("hideDuration").value = p.hideDuration ?? 0.45;
    $("appearDelay").value = p.appearDelay ?? 0.05;
    document.querySelectorAll("#fade-styles button").forEach((b) => {
      b.classList.toggle("active", b.dataset.fx === (p.appearEffect || "slide"));
    });
    $("theme").value = p.theme;
    $("accentColor").value = p.accentColor || "#ff0033";
    $("color-row").style.opacity = p.magicColors ? "0.4" : "1";

    $("pearHost").value = status.pearHost || "127.0.0.1";
    $("pearPort").value = status.pearPort || 9863;
    $("pearMode").value = status.pearMode || "auto";
    $("widget-url").textContent = widgetUrl(p.id);
    const previewSrc = `/widget.html?preview=1&profile=${encodeURIComponent(p.id)}`;
    const iframe = $("preview");
    if (!iframe.getAttribute("src") || !iframe.getAttribute("src").includes(`profile=${p.id}`)) {
      iframe.src = previewSrc;
    }

    const badge = $("conn-badge");
    const banner = $("auth-banner");
    if (status.connected) {
      badge.textContent = window.hoptubeplayT("connected");
      badge.classList.remove("off");
      banner.classList.add("hidden");
    } else {
      badge.textContent = window.hoptubeplayT("demoMode");
      badge.classList.add("off");
      banner.classList.remove("hidden");
    }

    const params = new URLSearchParams(location.search);
    const msg = $("youtube-msg");
    if (status.connected) {
      msg.textContent = window.hoptubeplayT("youtubeConnected");
      msg.classList.remove("err");
    } else if (status.pearError && status.pearError !== "disconnected" && status.source === "pear") {
      msg.textContent = status.pearError;
      msg.classList.add("err");
    }
    if (params.get("pear") === "error") {
      msg.textContent = params.get("message") || window.hoptubeplayT("youtubeError");
      msg.classList.add("err");
    }
  }

  function widgetUrl(profileId) {
    return `http://127.0.0.1:${location.port || 3001}/widget.html?token=${status.widgetToken}&profile=${profileId}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  async function saveProfile(patch) {
    const p = { ...currentProfile(), ...patch };
    settings.activeProfile = p.id;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: p, activeProfile: p.id }),
    });
    await load();
  }

  $("profile-select").addEventListener("change", async (e) => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeProfile: e.target.value }),
    });
    await load();
  });

  $("profile-name").addEventListener("change", () => saveProfile({ name: $("profile-name").value }));

  $("btn-add-profile").addEventListener("click", async () => {
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: window.hoptubeplayT("newProfile") }),
    });
    await load();
  });

  $("btn-del-profile").addEventListener("click", async () => {
    const p = currentProfile();
    await fetch(`/api/profiles/${p.id}`, { method: "DELETE" });
    await load();
  });

  const videoPlayers = ["cinema", "filmstrip", "vhs", "covercard", "gallery", "polaroid", "arcade", "poster", "sticky", "kawaii", "sakura"];
  document.querySelectorAll(".player-styles button").forEach((b) => {
    b.addEventListener("click", () => {
      const player = b.dataset.player;
      const patch = { player };
      if (videoPlayers.includes(player) && currentProfile().cover !== "clip") patch.cover = "clip";
      if (!videoPlayers.includes(player) && currentProfile().cover === "clip") patch.cover = "square";
      saveProfile(patch);
    });
  });
  document.querySelectorAll("#cover-styles button").forEach((b) => {
    b.addEventListener("click", () => saveProfile({ cover: b.dataset.cover }));
  });
  document.querySelectorAll("#place-grid button").forEach((b) => {
    b.addEventListener("click", () => saveProfile({ placement: b.dataset.place }));
  });

  fields.forEach((k) => {
    $(k).addEventListener("change", () => saveProfile({ [k]: $(k).checked }));
  });
  $("playerScale").addEventListener("input", () => {
    $("playerScaleValue").textContent = $("playerScale").value + " %";
  });
  $("playerScale").addEventListener("change", () => saveProfile({ playerScale: Number($("playerScale").value) }));
  $("hideOnPauseDelay").addEventListener("change", () => saveProfile({ hideOnPauseDelay: Number($("hideOnPauseDelay").value) }));
  $("songChangeDuration").addEventListener("change", () => saveProfile({ songChangeDuration: Number($("songChangeDuration").value) }));
  $("appearDuration").addEventListener("change", () => saveProfile({ appearDuration: Number($("appearDuration").value) }));
  $("hideDuration").addEventListener("change", () => saveProfile({ hideDuration: Number($("hideDuration").value) }));
  $("appearDelay").addEventListener("change", () => saveProfile({ appearDelay: Number($("appearDelay").value) }));
  document.querySelectorAll("#fade-styles button").forEach((b) => {
    b.addEventListener("click", () => saveProfile({ appearEffect: b.dataset.fx }));
  });
  $("theme").addEventListener("change", () => saveProfile({ theme: $("theme").value }));
  $("accentColor").addEventListener("input", () => saveProfile({ accentColor: $("accentColor").value }));

  $("btn-detect").addEventListener("click", async () => {
    const msg = $("youtube-msg");
    msg.textContent = window.hoptubeplayT("verifying");
    msg.classList.remove("err");
    const res = await fetch("/api/youtube/auto", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      msg.textContent = json.error || "Erreur";
      msg.classList.add("err");
    } else {
      msg.textContent = window.hoptubeplayT("credsOk");
      msg.classList.remove("err");
      await load();
    }
  });

  $("btn-save-pear").addEventListener("click", async () => {
    const msg = $("youtube-msg");
    msg.textContent = window.hoptubeplayT("verifying");
    msg.classList.remove("err");
    const res = await fetch("/api/pear/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: $("pearHost").value.trim(),
        port: Number($("pearPort").value),
        mode: $("pearMode").value,
        token: $("pearToken").value.trim(),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      msg.textContent = json.error || "Erreur";
      msg.classList.add("err");
    } else {
      msg.textContent = window.hoptubeplayT("credsOk");
      msg.classList.remove("err");
      await load();
    }
  });

  $("btn-disconnect").addEventListener("click", async () => {
    await fetch("/api/pear/disconnect", { method: "POST" });
    await load();
  });
  $("btn-copy-url").addEventListener("click", () => {
    navigator.clipboard.writeText($("widget-url").textContent);
  });
  $("btn-demo-next").addEventListener("click", async () => {
    await fetch("/api/demo/next", { method: "POST" });
    await load();
  });
  $("btn-regen").addEventListener("click", async () => {
    await fetch("/api/token/regenerate", { method: "POST" });
    await load();
  });
  async function checkUpdate() {
    try {
      const info = await fetch("/api/update/check").then((r) => r.json());
      const ver = $("app-version");
      if (ver) ver.textContent = `${window.hoptubeplayT("currentVersion")} ${info.current || ""}`;
      const banner = $("update-banner");
      const details = $("update-info");
      if (info.updateAvailable) {
        banner.classList.remove("hidden");
        details.textContent = ` ${info.current} → ${info.latest}`;
      } else {
        banner.classList.add("hidden");
      }
    } catch {}
  }

  $("btn-update").addEventListener("click", async () => {
    const btn = $("btn-update");
    btn.disabled = true;
    btn.textContent = window.hoptubeplayT("updating");
    try {
      const res = await fetch("/api/update/apply", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "update failed");
      btn.textContent = window.hoptubeplayT("updateDone");
      setTimeout(() => location.reload(), 3500);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = window.hoptubeplayT("updateNow");
      alert(err.message);
    }
  });

  $("btn-stop").addEventListener("click", async () => {
    if (!confirm(window.hoptubeplayT("stopConfirm"))) return;
    try {
      await fetch("/api/stop", { method: "POST" });
    } catch {}
    document.body.innerHTML = `<main style="padding:48px;max-width:520px"><h1>HopTubePlay</h1><p>${window.hoptubeplayT("serverStopped")}</p><p class="sub">${window.hoptubeplayT("startAgain")}</p></main>`;
  });


  load();
})();
