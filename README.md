# Device Readout + WebGPU 3D Maze

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use a WebGPU-capable browser (recent Chrome/Edge, or
Firefox with WebGPU enabled) to see the game — the dashboard itself works everywhere.

## What's real vs. best-effort

- **IP address** — read server-side in `app/api/ip/route.js` from request headers.
  Reliable.
- **Approx. location (via IP)** — client calls `ipapi.co` with the IP. Free tier is
  rate-limited; swap in your own geo-IP provider for production use.
- **Precise location** — `navigator.geolocation`, gated behind a real permission
  prompt. Will show "denied" if the user declines — that's expected, not a bug.
- **RAM** — `navigator.deviceMemory`. Chromium-only, and the spec caps it (anything
  ≥8GB reports as exactly `8`) specifically to limit fingerprinting.
- **GPU** — tries `navigator.gpu` (WebGPU) adapter info first, falls back to the
  WebGL `WEBGL_debug_renderer_info` extension. Some browsers/platforms return
  generic strings for either, again for fingerprinting resistance.
- **Device name** — not shown. No web API exposes it; browsers treat it as private
  by design, and there's no reliable workaround worth building.
- **Device model** — only populated on browsers/platforms that support the
  `userAgentData.getHighEntropyValues(['model'])` Client Hints API (mainly
  Chromium on Android).

## Structure

```
app/
  api/ip/route.js     -> server-side IP + request-header lookup
  components/
    DeviceInfo.jsx     -> gathers + renders all device/software/network fields
    Maze3D.jsx          -> raw WebGPU pipeline, first-person 3D maze
  page.js               -> dashboard + Play button
  layout.js, globals.css
```

## Maze controls

- **Touch:** drag the left half of the canvas to move (virtual joystick), drag the
  right half to look around.
- **Desktop:** WASD or arrow keys to move, drag anywhere to look.
- Reach the glowing gold pillar to win. "New Maze" regenerates a fresh layout — the
  generator is a randomized recursive-backtracker, so every maze is guaranteed
  solvable.
