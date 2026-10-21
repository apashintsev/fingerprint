/**
 * Учебный сбор клиентских fingerprint-сигналов.
 * Не претендует на точность коммерческих антифрод-систем.
 */

const FONT_PROBE = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Comic Sans MS",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Impact",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Microsoft Sans Serif",
  "Palatino Linotype",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Roboto",
  "Ubuntu",
  "Menlo",
  "Monaco",
  "Consolas",
];

/** Простой детерминированный хеш (для file://, где subtle может быть недоступен). */
function fallbackHash(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 13);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0")
  );
}

async function sha256Hex(text) {
  if (globalThis.crypto?.subtle && globalThis.isSecureContext !== false) {
    try {
      const data = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(hash)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      /* fall through */
    }
  }
  return fallbackHash(text);
}

function safe(fn, fallback = "n/a") {
  try {
    const value = fn();
    return value == null || value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { hash: "unsupported", raw: "" };

    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 8, 120, 28);
    ctx.fillStyle = "#069";
    ctx.fillText("Fingerprint Lab 🦊", 12, 12);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Fingerprint Lab 🦊", 14, 28);
    ctx.beginPath();
    ctx.arc(200, 30, 18, 0, Math.PI * 2);
    ctx.strokeStyle = "#3ecf8e";
    ctx.stroke();

    const raw = canvas.toDataURL();
    return { raw, preview: raw.slice(0, 64) + "…" };
  } catch {
    return { hash: "blocked", raw: "", preview: "blocked" };
  }
}

function getWebGLInfo() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return { vendor: "n/a", renderer: "n/a", version: "n/a" };

    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR),
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } catch {
    return { vendor: "blocked", renderer: "blocked", version: "blocked" };
  }
}

async function getAudioFingerprint() {
  try {
    const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioCtx) return { hash: "unsupported", sample: "n/a" };

    const ctx = new AudioCtx(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
    const sample = sum.toString();
    return { sample, preview: sample.slice(0, 18) };
  } catch {
    return { hash: "blocked", sample: "blocked", preview: "blocked" };
  }
}

function detectFonts() {
  const baseFonts = ["monospace", "sans-serif", "serif"];
  const testString = "mmmmmmmmmmlli";
  const testSize = "72px";
  const body = document.body;
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = "-9999px";
  span.style.fontSize = testSize;
  span.style.fontStyle = "normal";
  span.style.fontWeight = "normal";
  span.style.letterSpacing = "normal";
  span.style.lineHeight = "normal";
  span.textContent = testString;
  body.appendChild(span);

  const defaults = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    defaults[base] = { w: span.offsetWidth, h: span.offsetHeight };
  }

  const found = [];
  for (const font of FONT_PROBE) {
    let detected = false;
    for (const base of baseFonts) {
      span.style.fontFamily = `'${font}', ${base}`;
      const w = span.offsetWidth;
      const h = span.offsetHeight;
      if (w !== defaults[base].w || h !== defaults[base].h) {
        detected = true;
        break;
      }
    }
    if (detected) found.push(font);
  }

  body.removeChild(span);
  return found;
}

function getStorageFlags() {
  const check = (name, fn) => {
    try {
      return fn() ? "yes" : "no";
    } catch {
      return "blocked";
    }
  };

  return {
    cookies: check("cookies", () => navigator.cookieEnabled),
    localStorage: check("ls", () => {
      localStorage.setItem("__fp", "1");
      localStorage.removeItem("__fp");
      return true;
    }),
    sessionStorage: check("ss", () => {
      sessionStorage.setItem("__fp", "1");
      sessionStorage.removeItem("__fp");
      return true;
    }),
    indexedDB: check("idb", () => !!window.indexedDB),
  };
}

async function collectFingerprint() {
  const canvas = getCanvasFingerprint();
  const webgl = getWebGLInfo();
  const audio = await getAudioFingerprint();
  const fonts = detectFonts();
  const storage = getStorageFlags();

  const canvasHash = canvas.raw
    ? (await sha256Hex(canvas.raw)).slice(0, 16)
    : canvas.hash || "n/a";
  const audioHash = audio.sample && audio.sample !== "blocked"
    ? (await sha256Hex(audio.sample)).slice(0, 16)
    : audio.hash || "n/a";

  const nav = {
    userAgent: safe(() => navigator.userAgent),
    language: safe(() => navigator.language),
    languages: safe(() => (navigator.languages || []).join(", ")),
    platform: safe(() => navigator.platform),
    vendor: safe(() => navigator.vendor),
    hardwareConcurrency: safe(() => navigator.hardwareConcurrency),
    deviceMemory: safe(() => navigator.deviceMemory ?? "n/a"),
    maxTouchPoints: safe(() => navigator.maxTouchPoints),
    cookieEnabled: safe(() => navigator.cookieEnabled),
    doNotTrack: safe(() => navigator.doNotTrack ?? "n/a"),
    webdriver: safe(() => navigator.webdriver),
    pdfViewerEnabled: safe(() => navigator.pdfViewerEnabled ?? "n/a"),
  };

  const screenInfo = {
    width: safe(() => screen.width),
    height: safe(() => screen.height),
    availWidth: safe(() => screen.availWidth),
    availHeight: safe(() => screen.availHeight),
    colorDepth: safe(() => screen.colorDepth),
    pixelDepth: safe(() => screen.pixelDepth),
    devicePixelRatio: safe(() => window.devicePixelRatio),
    innerWidth: safe(() => window.innerWidth),
    innerHeight: safe(() => window.innerHeight),
    outerWidth: safe(() => window.outerWidth),
    outerHeight: safe(() => window.outerHeight),
  };

  const intl = {
    timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    timezoneOffset: safe(() => new Date().getTimezoneOffset()),
    locale: safe(() => Intl.DateTimeFormat().resolvedOptions().locale),
    dateSample: safe(() => new Date().toLocaleString()),
  };

  const media = {
    colorScheme: safe(() =>
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    ),
    reducedMotion: safe(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference"
    ),
    hover: safe(() => (matchMedia("(hover: hover)").matches ? "hover" : "none")),
    pointer: safe(() =>
      matchMedia("(pointer: fine)").matches
        ? "fine"
        : matchMedia("(pointer: coarse)").matches
          ? "coarse"
          : "none"
    ),
  };

  let connection = { type: "n/a", downlink: "n/a", rtt: "n/a", saveData: "n/a" };
  if (navigator.connection) {
    connection = {
      type: navigator.connection.effectiveType ?? "n/a",
      downlink: navigator.connection.downlink ?? "n/a",
      rtt: navigator.connection.rtt ?? "n/a",
      saveData: navigator.connection.saveData ?? "n/a",
    };
  }

  const plugins = safe(() =>
    [...(navigator.plugins || [])].map((p) => p.name).join(", ") || "(пусто)"
  );

  const mimeTypes = safe(() =>
    [...(navigator.mimeTypes || [])].map((m) => m.type).join(", ") || "(пусто)"
  );

  const groups = [
    {
      title: "Браузер и ОС",
      rows: Object.entries(nav).map(([key, value]) => ({ key, value })),
    },
    {
      title: "Экран и окно",
      rows: Object.entries(screenInfo).map(([key, value]) => ({ key, value })),
    },
    {
      title: "Локаль и время",
      rows: Object.entries(intl).map(([key, value]) => ({ key, value })),
    },
    {
      title: "Media / CSS preferences",
      rows: Object.entries(media).map(([key, value]) => ({ key, value })),
    },
    {
      title: "Canvas",
      rows: [
        { key: "hash", value: canvasHash },
        { key: "dataURL (начало)", value: canvas.preview || "n/a", long: true },
      ],
    },
    {
      title: "WebGL (GPU)",
      rows: Object.entries(webgl).map(([key, value]) => ({ key, value })),
    },
    {
      title: "AudioContext",
      rows: [
        { key: "hash", value: audioHash },
        { key: "sample", value: audio.preview || "n/a" },
      ],
    },
    {
      title: "Шрифты (detected)",
      rows: [
        { key: "count", value: fonts.length },
        { key: "list", value: fonts.join(", ") || "(не найдено)", long: true },
      ],
    },
    {
      title: "Хранилища",
      rows: Object.entries(storage).map(([key, value]) => ({ key, value })),
    },
    {
      title: "Сеть (Network Information API)",
      rows: Object.entries(connection).map(([key, value]) => ({ key, value })),
    },
    {
      title: "Плагины и MIME",
      rows: [
        { key: "plugins", value: plugins, long: true },
        { key: "mimeTypes", value: mimeTypes, long: true },
      ],
    },
  ];

  // Стабильный набор для ID — без размеров окна (они часто меняются)
  const idPayload = {
    ua: nav.userAgent,
    lang: nav.languages,
    platform: nav.platform,
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    touch: nav.maxTouchPoints,
    screen: `${screenInfo.width}x${screenInfo.height}x${screenInfo.colorDepth}`,
    dpr: screenInfo.devicePixelRatio,
    tz: intl.timezone,
    offset: intl.timezoneOffset,
    canvas: canvasHash,
    webgl: `${webgl.vendor}|${webgl.renderer}`,
    audio: audioHash,
    fonts: fonts.join(","),
    colorScheme: media.colorScheme,
  };

  const visitorId = (await sha256Hex(JSON.stringify(idPayload))).slice(0, 20);
  const signalCount = groups.reduce((n, g) => n + g.rows.length, 0);

  // Грубая оценка: больше различимых сигналов → выше «энтропия» демо
  const entropyBits = Math.round(
    Math.log2(
      Math.max(
        2,
        fonts.length *
          (Number(nav.hardwareConcurrency) || 1) *
          (Number(screenInfo.devicePixelRatio) || 1) *
          8
      )
    ) + (canvasHash !== "n/a" ? 12 : 0) + (audioHash !== "n/a" ? 8 : 0)
  );

  return {
    visitorId,
    signalCount,
    entropyBits,
    groups,
    raw: {
      ...idPayload,
      screenFull: screenInfo,
      webgl,
      storage,
      connection,
    },
  };
}

function render(result) {
  document.getElementById("visitor-id").textContent = result.visitorId;
  document.getElementById("signal-count").textContent = String(result.signalCount);
  document.getElementById("entropy").textContent = `~${result.entropyBits} бит`;

  const root = document.getElementById("groups");
  root.innerHTML = "";

  for (const [index, group] of result.groups.entries()) {
    const details = document.createElement("details");
    details.className = "group";
    if (index < 3) details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = group.title;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "group-body";

    for (const row of group.rows) {
      const el = document.createElement("div");
      el.className = "row";
      el.innerHTML = `
        <div class="key">${escapeHtml(row.key)}</div>
        <div class="val${row.long ? " long" : ""}">${escapeHtml(String(row.value))}</div>
      `;
      body.appendChild(el);
    }

    details.appendChild(body);
    root.appendChild(details);
  }

  const copyBtn = document.getElementById("copy-btn");
  copyBtn.onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify(result.raw, null, 2));
    copyBtn.textContent = "Скопировано";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Скопировать JSON";
      copyBtn.classList.remove("copied");
    }, 1600);
  };
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

collectFingerprint()
  .then(render)
  .catch((err) => {
    document.getElementById("visitor-id").textContent = "ошибка";
    document.getElementById("groups").innerHTML =
      `<p class="loading">Не удалось собрать сигналы: ${escapeHtml(err.message)}</p>`;
  });
