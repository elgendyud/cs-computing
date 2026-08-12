"use client";

import { useState } from "react";
import DeviceInfo from "./components/DeviceInfo";
import Maze3D from "./components/Maze3D";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  return (
    <main className="page">
      <p className="eyebrow">System Readout</p>
      <h1>What this device tells the browser</h1>
      <p className="sub">
        Everything below comes straight from your own browser's APIs — nothing is sent
        anywhere except the public-IP lookup, which needs a server round trip by
        definition.
      </p>

      <DeviceInfo onReady={() => setReady(true)} />

      <div className="play-row">
        <button
          className="play-btn"
          disabled={!ready}
          onClick={() => {
            setPlaying(true);
            setGameKey((k) => k + 1);
          }}
        >
          {playing ? "Restart" : "Play"}
        </button>
        {!ready && <span className="play-hint">Reading device signals…</span>}
        {ready && !playing && (
          <span className="play-hint">Launches a WebGPU-rendered first-person 3D maze</span>
        )}
      </div>

      {playing && <Maze3D key={gameKey} />}

      <p className="footnote">
        Device name isn't shown because no browser API exposes it — that's a deliberate
        privacy boundary, not a bug here. RAM, GPU, and network type are best-effort:
        some browsers withhold or approximate them for the same reason.
      </p>
    </main>
  );
}
