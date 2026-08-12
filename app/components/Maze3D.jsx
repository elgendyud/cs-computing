"use client";

import { useEffect, useRef, useState } from "react";

const GRID = 8; // maze is GRID x GRID cells
const CELL = 2.2; // world units per cell
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.18;
const EYE_HEIGHT = 1.1;
const PLAYER_RADIUS = 0.28;
const MOVE_SPEED = 3.2; // units/sec
const LOOK_SENSITIVITY = 0.0032;
const MAX_PITCH = 1.2;

const shaderCode = /* wgsl */ `
struct Uniforms { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(
  @location(0) localPos: vec3f,
  @location(1) shade: f32,
  @location(2) instPos: vec3f,
  @location(3) instScale: vec3f,
  @location(4) instColor: vec3f
) -> VSOut {
  var out: VSOut;
  let world = localPos * instScale + instPos;
  out.pos = uniforms.viewProj * vec4f(world, 1.0);
  out.color = instColor * shade;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
`;

// ---------- tiny column-major mat4 helpers (WebGPU clip space z in [0,1]) ----------
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ]);
}

function lookAt(eye, target, up) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// ---------- cube geometry with a fake per-face shade baked in ----------
function buildCubeGeometry() {
  const corners = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const faces = [
    { idx: [0, 1, 2, 3], shade: 0.72 }, // back
    { idx: [5, 4, 7, 6], shade: 0.72 }, // front
    { idx: [4, 0, 3, 7], shade: 0.55 }, // left
    { idx: [1, 5, 6, 2], shade: 0.55 }, // right
    { idx: [4, 5, 1, 0], shade: 0.35 }, // bottom
    { idx: [3, 2, 6, 7], shade: 1.0 },  // top
  ];
  const verts = [];
  for (const f of faces) {
    const [a, b, c, d] = f.idx.map((i) => corners[i]);
    for (const p of [a, b, c, a, c, d]) {
      verts.push(p[0], p[1], p[2], f.shade);
    }
  }
  return new Float32Array(verts);
}

// ---------- maze generation: randomized recursive backtracker ----------
function generateMaze(n) {
  const cells = Array.from({ length: n * n }, () => ({
    top: true, right: true, bottom: true, left: true, visited: false,
  }));
  const idx = (r, c) => r * n + c;
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const stack = [];
  let current = 0;
  cells[current].visited = true;
  let visited = 1;

  while (visited < n * n) {
    const r = Math.floor(current / n);
    const c = current % n;
    const options = [];
    if (r > 0 && !cells[idx(r - 1, c)].visited) options.push({ dir: "top", next: idx(r - 1, c) });
    if (c < n - 1 && !cells[idx(r, c + 1)].visited) options.push({ dir: "right", next: idx(r, c + 1) });
    if (r < n - 1 && !cells[idx(r + 1, c)].visited) options.push({ dir: "bottom", next: idx(r + 1, c) });
    if (c > 0 && !cells[idx(r, c - 1)].visited) options.push({ dir: "left", next: idx(r, c - 1) });

    if (options.length > 0) {
      const pick = options[Math.floor(Math.random() * options.length)];
      cells[current][pick.dir] = false;
      cells[pick.next][opposite[pick.dir]] = false;
      stack.push(current);
      cells[pick.next].visited = true;
      visited++;
      current = pick.next;
    } else if (stack.length) {
      current = stack.pop();
    } else break;
  }
  return cells;
}

function buildWalls(cells, n) {
  const walls = [];
  const color = [0.36, 0.42, 0.58];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = cells[r * n + c];
      const cx = (c + 0.5) * CELL;
      const cz = (r + 0.5) * CELL;
      if (cell.top) {
        walls.push({ pos: [cx, WALL_HEIGHT / 2, r * CELL], scale: [CELL + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS], color });
      }
      if (cell.left) {
        walls.push({ pos: [c * CELL, WALL_HEIGHT / 2, cz], scale: [WALL_THICKNESS, WALL_HEIGHT, CELL + WALL_THICKNESS], color });
      }
      if (r === n - 1 && cell.bottom) {
        walls.push({ pos: [cx, WALL_HEIGHT / 2, (r + 1) * CELL], scale: [CELL + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS], color });
      }
      if (c === n - 1 && cell.right) {
        walls.push({ pos: [(c + 1) * CELL, WALL_HEIGHT / 2, cz], scale: [WALL_THICKNESS, WALL_HEIGHT, CELL + WALL_THICKNESS], color });
      }
    }
  }
  return walls;
}

function collideAxis(x, z, walls) {
  for (const w of walls) {
    const minX = w.pos[0] - w.scale[0] / 2 - PLAYER_RADIUS;
    const maxX = w.pos[0] + w.scale[0] / 2 + PLAYER_RADIUS;
    const minZ = w.pos[2] - w.scale[2] / 2 - PLAYER_RADIUS;
    const maxZ = w.pos[2] + w.scale[2] / 2 + PLAYER_RADIUS;
    if (x > minX && x < maxX && z > minZ && z < maxZ) return true;
  }
  return false;
}

function resizeCanvasIfNeeded(gpu, canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (w === gpu.canvasWidth && h === gpu.canvasHeight) return;

  canvas.width = w;
  canvas.height = h;
  gpu.depthTexture.destroy?.();
  gpu.depthTexture = gpu.device.createTexture({
    size: [w, h],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  gpu.canvasWidth = w;
  gpu.canvasHeight = h;
}

export default function Maze3D() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const gpuRef = useRef(null);
  const rafRef = useRef(null);

  const wallsRef = useRef([]);
  const posRef = useRef([CELL * 0.5, EYE_HEIGHT, CELL * 0.5]);
  const yawRef = useRef(Math.PI / 4);
  const pitchRef = useRef(0);
  const keysRef = useRef({});
  const joystickRef = useRef(null); // {pointerId, startX, startY, dx, dy}
  const lookPointerRef = useRef(null);
  const lastLookRef = useRef({ x: 0, y: 0 });

  const [status, setStatus] = useState("checking");
  const [solved, setSolved] = useState(false);
  const [genTick, setGenTick] = useState(0);
  const [showJoystick, setShowJoystick] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const joyKnobRef = useRef(null);
  const containerRef = useRef(null);

  // regenerate maze + reset player whenever genTick changes
  useEffect(() => {
    const cells = generateMaze(GRID);
    wallsRef.current = buildWalls(cells, GRID);
    posRef.current = [CELL * 0.5, EYE_HEIGHT, CELL * 0.5];
    yawRef.current = Math.PI / 4;
    pitchRef.current = 0;
    setSolved(false);

    const gpu = gpuRef.current;
    if (gpu) writeInstances(gpu);
  }, [genTick]);

  function writeInstances(gpu) {
    const { device, instanceBuffer } = gpu;
    const walls = wallsRef.current;
    const floorColor = [0.14, 0.17, 0.24];
    const ceilColor = [0.08, 0.1, 0.15];
    const exitColor = [0.95, 0.72, 0.25];
    const mazeSize = GRID * CELL;

    const all = [
      { pos: [mazeSize / 2, 0, mazeSize / 2], scale: [mazeSize, 0.1, mazeSize], color: floorColor },
      { pos: [mazeSize / 2, WALL_HEIGHT, mazeSize / 2], scale: [mazeSize, 0.1, mazeSize], color: ceilColor },
      { pos: [mazeSize - CELL / 2, WALL_HEIGHT / 2, mazeSize - CELL / 2], scale: [0.5, WALL_HEIGHT * 0.6, 0.5], color: exitColor },
      ...walls,
    ];

    const data = new Float32Array(all.length * 9);
    all.forEach((inst, i) => {
      const b = i * 9;
      data.set(inst.pos, b);
      data.set(inst.scale, b + 3);
      data.set(inst.color, b + 6);
    });

    if (gpu.instanceCapacity < all.length) {
      instanceBuffer.destroy?.();
      gpu.instanceBuffer = device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      gpu.instanceCapacity = all.length;
    }
    device.queue.writeBuffer(gpu.instanceBuffer, 0, data);
    gpu.instanceCount = all.length;
  }

  // one-time WebGPU init
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!navigator.gpu) {
        setStatus("unsupported");
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setStatus("unsupported");
        return;
      }
      const device = await adapter.requestDevice();
      if (cancelled) return;

      const canvas = canvasRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;

      const context = canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "opaque" });

      const depthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      const cubeGeo = buildCubeGeometry();
      const cubeBuffer = device.createBuffer({
        size: cubeGeo.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(cubeBuffer, 0, cubeGeo);

      const instanceBuffer = device.createBuffer({
        size: 9 * 4 * 64,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      const uniformBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const module = device.createShaderModule({ code: shaderCode });
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module,
          entryPoint: "vs",
          buffers: [
            {
              arrayStride: 16,
              stepMode: "vertex",
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" },
                { shaderLocation: 1, offset: 12, format: "float32" },
              ],
            },
            {
              arrayStride: 36,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 2, offset: 0, format: "float32x3" },
                { shaderLocation: 3, offset: 12, format: "float32x3" },
                { shaderLocation: 4, offset: 24, format: "float32x3" },
              ],
            },
          ],
        },
        fragment: { module, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      gpuRef.current = {
        device, context, format, pipeline, cubeBuffer, instanceBuffer,
        instanceCapacity: 64, instanceCount: 0, uniformBuffer, bindGroup, depthTexture,
        canvasWidth: canvas.width, canvasHeight: canvas.height,
      };

      writeInstances(gpuRef.current);
      setStatus("ready");
    }

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // input listeners
  useEffect(() => {
    function onKeyDown(e) { keysRef.current[e.key.toLowerCase()] = true; }
    function onKeyUp(e) { keysRef.current[e.key.toLowerCase()] = false; }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const canvas = canvasRef.current;
    function onPointerDown(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      canvas.setPointerCapture(e.pointerId);
      if (x < rect.width / 2) {
        joystickRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 };
        setShowJoystick(true);
        if (overlayRef.current) {
          overlayRef.current.style.left = `${x}px`;
          overlayRef.current.style.top = `${e.clientY - rect.top}px`;
        }
      } else {
        lookPointerRef.current = e.pointerId;
        lastLookRef.current = { x: e.clientX, y: e.clientY };
      }
    }
    function onPointerMove(e) {
      if (joystickRef.current && e.pointerId === joystickRef.current.pointerId) {
        const j = joystickRef.current;
        j.dx = e.clientX - j.startX;
        j.dy = e.clientY - j.startY;
        const maxR = 42;
        const len = Math.hypot(j.dx, j.dy) || 1;
        const clampedLen = Math.min(len, maxR);
        const kx = (j.dx / len) * clampedLen;
        const ky = (j.dy / len) * clampedLen;
        if (joyKnobRef.current) {
          joyKnobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
        }
      } else if (e.pointerId === lookPointerRef.current) {
        const dx = e.clientX - lastLookRef.current.x;
        const dy = e.clientY - lastLookRef.current.y;
        yawRef.current -= dx * LOOK_SENSITIVITY * 16;
        pitchRef.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitchRef.current - dy * LOOK_SENSITIVITY * 16));
        lastLookRef.current = { x: e.clientX, y: e.clientY };
      }
    }
    function onPointerUp(e) {
      if (joystickRef.current && e.pointerId === joystickRef.current.pointerId) {
        joystickRef.current = null;
        setShowJoystick(false);
        if (joyKnobRef.current) joyKnobRef.current.style.transform = "translate(0px, 0px)";
      }
      if (e.pointerId === lookPointerRef.current) lookPointerRef.current = null;
    }

    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointermove", onPointerMove);
    canvas?.addEventListener("pointerup", onPointerUp);
    canvas?.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas?.removeEventListener("pointermove", onPointerMove);
      canvas?.removeEventListener("pointerup", onPointerUp);
      canvas?.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  // render / simulation loop
  useEffect(() => {
    if (status !== "ready") return;
    let last = performance.now();

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      let forwardInput = 0;
      let strafeInput = 0;
      const k = keysRef.current;
      if (k["w"] || k["arrowup"]) forwardInput += 1;
      if (k["s"] || k["arrowdown"]) forwardInput -= 1;
      if (k["d"] || k["arrowright"]) strafeInput += 1;
      if (k["a"] || k["arrowleft"]) strafeInput -= 1;

      if (joystickRef.current) {
        const j = joystickRef.current;
        forwardInput += -j.dy / 42;
        strafeInput += j.dx / 42;
      }
      forwardInput = Math.max(-1, Math.min(1, forwardInput));
      strafeInput = Math.max(-1, Math.min(1, strafeInput));

      const yaw = yawRef.current;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);

      const moveX = (fx * forwardInput + rx * strafeInput) * MOVE_SPEED * dt;
      const moveZ = (fz * forwardInput + rz * strafeInput) * MOVE_SPEED * dt;

      const [px, py, pz] = posRef.current;
      const walls = wallsRef.current;
      let nx = px, nz = pz;
      if (!collideAxis(px + moveX, pz, walls)) nx = px + moveX;
      if (!collideAxis(nx, pz + moveZ, walls)) nz = pz + moveZ;
      posRef.current = [nx, py, nz];

      const cellCol = Math.floor(nx / CELL);
      const cellRow = Math.floor(nz / CELL);
      if (cellCol === GRID - 1 && cellRow === GRID - 1) setSolved(true);

      const gpu = gpuRef.current;
      if (gpu) {
        resizeCanvasIfNeeded(gpu, canvasRef.current);

        const pitch = pitchRef.current;
        const forward = [
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        ];
        const eye = [nx, py, nz];
        const target = [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]];
        const view = lookAt(eye, target, [0, 1, 0]);
        const aspect = gpu.canvasWidth / gpu.canvasHeight;
        const proj = perspective((60 * Math.PI) / 180, aspect, 0.05, 60);
        const viewProj = multiply(proj, view);
        gpu.device.queue.writeBuffer(gpu.uniformBuffer, 0, viewProj);

        const encoder = gpu.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: gpu.context.getCurrentTexture().createView(),
            clearValue: { r: 0.05, g: 0.06, b: 0.09, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          }],
          depthStencilAttachment: {
            view: gpu.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        pass.setPipeline(gpu.pipeline);
        pass.setBindGroup(0, gpu.bindGroup);
        pass.setVertexBuffer(0, gpu.cubeBuffer);
        pass.setVertexBuffer(1, gpu.instanceBuffer);
        pass.draw(36, gpu.instanceCount);
        pass.end();
        gpu.device.queue.submit([encoder.finish()]);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status]);

  function newMaze() {
    setGenTick((t) => t + 1);
  }

  // keep isFullscreen in sync if the user exits via Esc, back gesture, etc.
  useEffect(() => {
    function onFsChange() {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl) setIsFullscreen(false);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  // prevent the page behind from scrolling while the CSS fullscreen overlay is up
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!isFullscreen) {
      // best-effort: real Fullscreen API (hides browser chrome on desktop/Android).
      // iOS Safari/Chrome don't support it on plain elements — the CSS overlay
      // below still gives a fullscreen-looking view there, just with the
      // address bar present, since WebKit only allows true fullscreen on <video>.
      try {
        if (el?.requestFullscreen) await el.requestFullscreen();
        else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (e) {
        // ignore — CSS overlay still applies
      }
      setIsFullscreen(true);
    } else {
      try {
        if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch (e) {
        // ignore
      }
      setIsFullscreen(false);
    }
  }

  if (status === "unsupported") {
    return (
      <div className="panel game-wrap">
        <p className="game-status">
          WebGPU isn't available in this browser/device. Try a recent Chrome, Edge, or
          Safari with WebGPU enabled, served over HTTPS.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`panel game-wrap${isFullscreen ? " maze-fullscreen" : ""}`}
    >
      <p className={`game-status ${solved ? "win" : ""}`}>
        {status !== "ready"
          ? "Initializing WebGPU…"
          : solved
          ? "You reached the exit 🎉"
          : "Find the glowing exit — drag left half to move, right half to look (or WASD + arrows)"}
      </p>
      <div className="canvas-stage" style={{ aspectRatio: "4 / 3", touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ touchAction: "none" }} />
        <div
          ref={overlayRef}
          style={{
            position: "absolute",
            width: 84,
            height: 84,
            marginLeft: -42,
            marginTop: -42,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.35)",
            display: showJoystick ? "flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            ref={joyKnobRef}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.55)",
            }}
          />
        </div>
      </div>
      <div className="game-controls">
        <button className="small-btn" onClick={newMaze}>
          New Maze
        </button>
        <button className="small-btn" onClick={toggleFullscreen}>
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
}
