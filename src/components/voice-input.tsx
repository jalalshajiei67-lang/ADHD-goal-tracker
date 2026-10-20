"use client";

import { useState, useSyncExternalStore } from "react";
import { btn } from "./ui";

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

const noSubscribe = () => () => {};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Dictation on browsers that support it (Chrome/Android). Hidden elsewhere. */
export function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const supported = useSyncExternalStore(
    noSubscribe,
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);

  if (!supported) return null;

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor || listening) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i][0].transcript,
      ).join(" ");
      onText(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={listening}
      className={btn.quiet}
      aria-label="Dictate a goal"
    >
      {listening ? "Listening…" : "Speak"}
    </button>
  );
}
