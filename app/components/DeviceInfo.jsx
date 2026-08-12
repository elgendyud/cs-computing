"use client";

import { useEffect, useState } from "react";

// Best-effort GPU detection: try WebGPU's structured adapter info first
// (it's the technology this project is built on), fall back to the
// older WebGL debug-renderer trick, which is less structured but far
// more widely supported. Neither is guaranteed — some browsers return
// generic/blank strings on purpose to resist fingerprinting.
async function detectGPU() {
  const result = {
    method: "unavailable",
    vendor: null,
    architecture: null,
    device: null,
    description: null,
  };

  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter && adapter.requestAdapterInfo) {
        const info = await adapter.requestAdapterInfo();
        result.method = "webgpu";
        result.vendor = info.vendor || "unspecified";
        result.architecture = info.architecture || "unspecified";
        result.device = info.device || "unspecified";
        result.description = info.description || "";
      } else if (adapter) {
        result.method = "webgpu (adapter present, info blocked)";
      }
    } catch (e) {
      // adapter request can throw/reject on unsupported hardware
    }
  }

  if (result.method === "unavailable") {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
      if (gl && dbg) {
        result.method = "webgl-fallback";
        result.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        result.description = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
    } catch (e) {
      // ignore
    }
  }

  return result;
}

function bytesToGiB(bytes) {
  if (!bytes && bytes !== 0) return null;
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

export default function DeviceInfo({ onReady }) {
  const [info, setInfo] = useState(null);
  const [gpu, setGpu] = useState(null);
  const [ip, setIp] = useState(null);
  const [geo, setGeo] = useState({ status: "idle", data: null });
  const [ipGeo, setIpGeo] = useState(null);

  useEffect(() => {
    const nav = navigator;
    const scr = window.screen;

    const base = {
      browser: (() => {
        const ua = nav.userAgent;
        if (ua.includes("Edg/")) return "Microsoft Edge";
        if (ua.includes("Chrome/") && !ua.includes("Chromium")) return "Chrome";
        if (ua.includes("Firefox/")) return "Firefox";
        if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
        return "Unknown";
      })(),
      userAgent: nav.userAgent,
      platform: nav.platform || "unspecified",
      languages: (nav.languages || [nav.language]).join(", "),
      cores: nav.hardwareConcurrency || null,
      ram: nav.deviceMemory ? `~${nav.deviceMemory} GB (Chromium estimate, capped)` : null,
      touchPoints: nav.maxTouchPoints ?? 0,
      screen: `${scr.width}×${scr.height} @${window.devicePixelRatio || 1}x`,
      colorDepth: `${scr.colorDepth}-bit`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookiesEnabled: nav.cookieEnabled,
      online: nav.onLine,
      connection: nav.connection
        ? `${nav.connection.effectiveType || "?"} · ~${nav.connection.downlink ?? "?"}Mbps`
        : null,
      webgpuSupported: !!nav.gpu,
      deviceModel: null,
    };

    // High-entropy client hints (mostly Chromium on Android/desktop) —
    // this is the closest thing to a "device model" the web exposes,
    // and it's opt-in / gated by the browser, not always present.
    if (nav.userAgentData && nav.userAgentData.getHighEntropyValues) {
      nav.userAgentData
        .getHighEntropyValues(["model", "platformVersion", "fullVersionList"])
        .then((hv) => {
          setInfo((prev) => ({
            ...prev,
            deviceModel: hv.model || null,
            platformVersion: hv.platformVersion || null,
          }));
        })
        .catch(() => {});
    }

    setInfo(base);

    detectGPU().then(setGpu);

    fetch("/api/ip")
      .then((r) => r.json())
      .then((d) => setIp(d.ip))
      .catch(() => setIp("unavailable"));

    // Precise location needs an explicit permission prompt — this is
    // the one field we cannot fetch silently, by design.
    if (nav.geolocation) {
      setGeo({ status: "requesting", data: null });
      nav.geolocation.getCurrentPosition(
        (pos) => {
          setGeo({
            status: "granted",
            data: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(
              pos.coords.accuracy
            )}m)`,
          });
        },
        () => setGeo({ status: "denied", data: null }),
        { timeout: 8000 }
      );
    } else {
      setGeo({ status: "unsupported", data: null });
    }
  }, []);

  // Coarse IP-based location as a fallback/complement to GPS — best
  // effort, rate-limited public API, never blocks the rest of the UI.
  useEffect(() => {
    if (!ip || ip === "unavailable") return;
    fetch(`https://ipapi.co/${ip}/json/`)
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setIpGeo(`${d.city || "?"}, ${d.region || "?"}, ${d.country_name || "?"}`);
        }
      })
      .catch(() => {});
  }, [ip]);

  useEffect(() => {
    if (info && gpu) onReady?.();
  }, [info, gpu, onReady]);

  if (!info) {
    return <p className="play-hint">Reading device signals…</p>;
  }

  const Field = ({ k, v, tone }) => (
    <div className="field">
      <p className="k">{k}</p>
      <p className={`v ${tone || ""}`}>{v ?? "—"}</p>
    </div>
  );

  return (
    <>
      <div className="section-title">Software</div>
      <div className="grid-cols">
        <Field k="Browser" v={info.browser} />
        <Field k="User agent" v={info.userAgent} />
        <Field k="Platform" v={info.platform} />
        <Field k="Languages" v={info.languages} />
        <Field k="Timezone" v={info.timezone} />
        <Field k="Cookies enabled" v={String(info.cookiesEnabled)} />
        <Field k="Online" v={String(info.online)} tone={info.online ? "ok" : "warn"} />
        <Field k="WebGPU support" v={info.webgpuSupported ? "Yes" : "No"} tone={info.webgpuSupported ? "ok" : "warn"} />
      </div>

      <div className="section-title">Hardware</div>
      <div className="grid-cols">
        <Field
          k="Device name"
          v="Not exposed by browsers (privacy)"
          tone="dim"
        />
        <Field k="Device model" v={info.deviceModel || "Not exposed by this browser"} tone={info.deviceModel ? "" : "dim"} />
        <Field k="CPU cores (logical)" v={info.cores} />
        <Field
          k="RAM"
          v={info.ram || "Not exposed by this browser"}
          tone={info.ram ? "" : "dim"}
        />
        <Field k="Screen" v={info.screen} />
        <Field k="Color depth" v={info.colorDepth} />
        <Field k="Touch points" v={info.touchPoints} />
        <Field k="Network" v={info.connection || "Not exposed by this browser"} tone={info.connection ? "" : "dim"} />
        <Field
          k="GPU"
          v={
            gpu
              ? gpu.description || gpu.device || (gpu.method === "unavailable" ? "Not detected" : "Detected, name withheld")
              : "Detecting…"
          }
        />
        <Field k="GPU detection method" v={gpu?.method || "…"} tone="dim" />
      </div>

      <div className="section-title">Network &amp; location</div>
      <div className="grid-cols">
        <Field k="Public IP" v={ip || "Loading…"} />
        <Field
          k="Approx. location (via IP)"
          v={ipGeo || "Looking up…"}
          tone={ipGeo ? "" : "dim"}
        />
        <Field
          k="Precise location (GPS)"
          v={
            geo.status === "granted"
              ? geo.data
              : geo.status === "denied"
              ? "Permission denied"
              : geo.status === "unsupported"
              ? "Not supported by this browser"
              : "Requesting permission…"
          }
          tone={geo.status === "granted" ? "ok" : "dim"}
        />
      </div>
    </>
  );
}
