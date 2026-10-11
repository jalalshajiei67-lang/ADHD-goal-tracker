"use client";

import { useEffect, useRef, useState } from "react";
import { btn } from "./ui";

const VIBRATE = [500, 250, 500, 250, 500];

/**
 * Rings (looping beeps + vibration, screen kept awake) while `ringing`. Browsers may block
 * sound until the page has been touched, so a big silence button doubles as the unlock.
 */
export function Alarm({ ringing, onSilence }: { ringing: boolean; onSilence: () => void }) {
  const [blocked, setBlocked] = useState(false);
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!ringing) return;
    const audio = new AudioContext();
    ctx.current = audio;
    let wake: WakeLockSentinel | null = null;
    navigator.wakeLock?.request("screen").then((w) => (wake = w), () => {});

    function beep() {
      if (audio.state !== "running") {
        setBlocked(true);
        audio.resume().then(() => setBlocked(false), () => {});
        return;
      }
      setBlocked(false);
      // Three short high beeps, like a digital alarm clock.
      for (let i = 0; i < 3; i++) {
        const t = audio.currentTime + i * 0.25;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "square";
        osc.frequency.value = 988;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      }
      navigator.vibrate?.(VIBRATE);
    }

    beep();
    const id = setInterval(beep, 1500);
    const unlock = () => audio.resume();
    window.addEventListener("pointerdown", unlock);

    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", unlock);
      navigator.vibrate?.(0);
      wake?.release().catch(() => {});
      audio.close().catch(() => {});
      ctx.current = null;
    };
  }, [ringing]);

  if (!ringing) return null;
  return (
    <button className={btn.secondary} onClick={onSilence}>
      {blocked ? "🔔 Tap to start the alarm" : "🔕 Silence alarm"}
    </button>
  );
}
