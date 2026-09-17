// Shared emote playback controls: play/pause, restart, and a scrubbable
// timeline with a frame/time readout.
//
// The component reads/writes the shared `EmoteClockState` directly (no React
// state for the playhead), and mirrors it into the DOM via requestAnimationFrame
// so scrubbing and playback both feel instant without 60fps re-renders.
//
// Uses inline styles so it works both inside the Tailwind app and in the
// standalone emote-demo page.
import { useEffect, useRef, useState } from 'react';
import { Focus, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { EmoteClockState, EmoteData } from './emote';

const ACCENT = '#facc15';

/// Plays the emote's bundled audio (e.g. dance music) in sync with the shared
/// emote clock: follows play/pause, restarts when the animation loops back to
/// frame 0, and repositions when the user scrubs the timeline.
///
/// The <audio> element is created in JS (no DOM node needed), which works both
/// in the Tauri webview and the standalone demo page. Autoplay may be blocked
/// until the first user gesture; the rAF loop retries with a cooldown, so the
/// next button press (a real gesture) starts the audio immediately.
export function EmoteAudio({ src, clock, data, volume }: {
  src: string;
  clock: { current: EmoteClockState };
  data: EmoteData;
  volume: number; // 0..1 — 0 = muted
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true; // the emote itself loops; keep the music with it
    audio.volume = volume;
    audio.preload = 'auto';
    audioRef.current = audio;

    let raf = 0;
    let lastTime = clock.current.time;
    let lastPlayTry = 0;

    const tick = () => {
      const c = clock.current;
      if (c.scrubbing) {
        // Reposition (not play) while the user drags the timeline.
        audio.pause();
        if (isFinite(audio.duration) && audio.duration > 0) {
          const t = Math.max(0, Math.min((c.time / Math.max(1, data.numFrames)) * audio.duration, audio.duration));
          try { audio.currentTime = t; } catch { /* not seekable yet */ }
        }
      } else if (c.playing) {
        // Animation wrapped (time jumped back near 0) — restart the music.
        if (c.time < lastTime - 1 && !audio.paused) {
          audio.currentTime = 0;
        }
        if (audio.paused) {
          const now = performance.now();
          if (now - lastPlayTry > 500) {
            lastPlayTry = now;
            audio.play().catch(() => { /* autoplay blocked or no codec — ignored */ });
          }
        }
      } else {
        audio.pause();
      }
      lastTime = c.time;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      audio.pause();
      audioRef.current = null;
    };
    // clock is a stable ref; data (numFrames) is fixed once the emote loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return null;
}

export function EmoteControls({ data, clock, onResetView, volume, onVolumeChange }: {
  data: EmoteData;
  clock: { current: EmoteClockState };
  onResetView?: () => void;
  volume?: number; // 0..1; when onVolumeChange is set, the volume button appears
  onVolumeChange?: (v: number) => void;
}) {
  const [playing, setPlaying] = useState(clock.current.playing);
  const [volHover, setVolHover] = useState(false); // popover open while hovering the volume button
  const sliderRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const hasVolume = onVolumeChange !== undefined;

  const last = data.numFrames - 1;
  const fps = Math.max(1, data.fps); // for the seconds readout
  const totalSec = last / fps;

  // Mirror the playhead into the slider + label unless the user is scrubbing.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = clock.current;
      if (!c.scrubbing) {
        if (sliderRef.current) sliderRef.current.value = String(c.time);
        if (labelRef.current) {
          labelRef.current.textContent =
            `${(c.time / fps).toFixed(1)}s / ${totalSec.toFixed(1)}s`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // clock is a stable ref; data (and last) are fixed once the emote loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const togglePlay = () => {
    const c = clock.current;
    c.playing = !c.playing;
    setPlaying(c.playing);
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    clock.current.time = parseFloat(e.target.value);
  };

  const buttonStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(250, 204, 21, 0.12)',
    border: '1px solid rgba(250, 204, 21, 0.35)',
    borderRadius: 6,
    color: ACCENT,
    cursor: 'pointer',
    flex: '0 0 auto',
    padding: 0,
  };

  // Static skeleton (numFrames <= 1): the mod bundled a .psk but no
  // .md5anim, so there's nothing to play. Show a note instead of a useless
  // timeline. Hooks above still run (the rAF loop is a no-op — refs are null).
  if (data.numFrames <= 1) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
        fontWeight: 700,
        color: '#d1d5db',
        letterSpacing: '0.05em',
      }}>
        <span style={{ color: ACCENT }}>⏸</span>
        STATIC SKELETON — NO ANIMATION IN THIS MOD (SHOWING REST POSE)
      </div>
    );
  }

  // Volume slider popover: a horizontal range input rotated -90° so it sits
  // vertically (up = louder). Shown while hovering the volume button; the
  // popover lives inside the same hover zone, so dragging stays smooth.
  const volumeControl = hasVolume ? (
    <div
      style={{ position: 'relative', display: 'flex', flex: '0 0 auto' }}
      onMouseEnter={() => setVolHover(true)}
      onMouseLeave={() => setVolHover(false)}
    >
      <button
        style={{
          ...buttonStyle,
          background: (volume ?? 0) > 0 ? 'rgba(250, 204, 21, 0.25)' : buttonStyle.background,
        }}
        title={(volume ?? 0) > 0 ? 'Volume — hover to adjust' : 'Muted — hover to adjust'}
        onClick={() => onVolumeChange!((volume ?? 0) > 0 ? 0 : 0.9)}
        type="button"
      >
        {(volume ?? 0) > 0 ? <Volume2 size={16} strokeWidth={2.5} /> : <VolumeX size={16} strokeWidth={2.5} />}
      </button>
      {volHover && (
        // Invisible bridge: the 10px gap between button and popover must be part
        // of the hover zone, or the popover dies the moment the mouse crosses
        // the gap (this bit us — users couldn't reach the slider).
        <div
          style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: 10 }}
          aria-hidden
        />
      )}
      {volHover && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 40,
          padding: '10px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(17, 24, 39, 0.97)',
          border: '1px solid rgba(250, 204, 21, 0.4)',
          borderRadius: 8,
          zIndex: 30,
          // NOTE: CSS transforms don't affect layout — the rotated input's 80px
          // extent must be reserved by a real-height container or it overflows
          // the popover (this bit us once: the bar poked through the % label
          // and up over the title).
          overflow: 'visible',
        }}>
          <div style={{ width: 24, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume ?? 0}
              onChange={e => onVolumeChange!(parseFloat(e.target.value))}
              aria-label="Emote audio volume"
              style={{
                width: 80,
                height: 16,
                accentColor: ACCENT,
                cursor: 'pointer',
                transform: 'rotate(-90deg)',
                transformOrigin: '50% 50%',
              }}
            />
          </div>
          <span style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            fontWeight: 700,
            color: '#d1d5db',
            lineHeight: 1,
          }}>
            {Math.round((volume ?? 0) * 100)}%
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <button
        style={{ ...buttonStyle, background: playing ? 'rgba(250, 204, 21, 0.25)' : buttonStyle.background }}
        title={playing ? 'Pause' : 'Play'}
        onClick={togglePlay}
        type="button"
      >
        {playing ? <Pause size={16} strokeWidth={2.5} /> : <Play size={16} strokeWidth={2.5} />}
      </button>
      {volumeControl}
      {onResetView && (
        <button style={buttonStyle} title="Reset view" onClick={onResetView} type="button">
          <Focus size={16} strokeWidth={2.5} />
        </button>
      )}
      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={last}
        step={1}
        defaultValue={0}
        aria-label="Animation timeline"
        onChange={onScrub}
        onPointerDown={() => { clock.current.scrubbing = true; }}
        onPointerUp={() => { clock.current.scrubbing = false; }}
        onLostPointerCapture={() => { clock.current.scrubbing = false; }}
        onKeyDown={() => { clock.current.scrubbing = true; }}
        onKeyUp={() => { clock.current.scrubbing = false; }}
        style={{
          flex: '1 1 auto',
          minWidth: 120,
          accentColor: ACCENT,
          cursor: 'pointer',
          height: 20,
        }}
      />
      <span
        ref={labelRef}
        style={{
          flex: '0 0 auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          fontWeight: 700,
          color: '#d1d5db',
          whiteSpace: 'nowrap',
        }}
      >
        0.0s / {totalSec.toFixed(1)}s
      </span>
    </div>
  );
}
