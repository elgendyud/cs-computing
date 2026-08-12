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
      <p >AASTMT - intro to Computing - Spring 2026</p>
      <h2>By: Mohamed Bakr - Ashraf Sabry</h2>
      <h2>Submitted for: Prof. Dr. Hatem Khater</h2>


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
        Some data might fails to fetched due to Device Restrictions
      </p>
    </main>
  );
}
