// Standalone emote animation harness (see emote-demo.html).
// Loads the same fixtures the Rust pipeline produces (umodel .psk + .md5anim)
// and runs the exact same EmoteSkeleton + EmoteControls used by the app's
// right-side viewer — so this proves the animation, timeline and play/pause
// end-to-end without needing a mod selected in the app.
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState } from 'react';
import { buildEmoteData, createEmoteClock, EmoteSkeleton, type EmoteClockState, type EmoteData } from './emote';
import { EmoteControls } from './EmoteControls';

const FIXTURES = {
  psk: '/fixtures/SK_Ch000_Default_00.psk',
  anim: '/fixtures/em001_EmotionAct001.md5anim',
};

export default function EmoteDemo() {
  const [data, setData] = useState<EmoteData | null>(null);
  const [err, setErr] = useState('');
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const clock = useRef<EmoteClockState>(createEmoteClock());

  useEffect(() => {
    let cancelled = false;
    const t0 = performance.now();
    (async () => {
      try {
        const [pskBuf, animText] = await Promise.all([
          fetch(FIXTURES.psk).then(r => {
            if (!r.ok) throw new Error('failed to fetch .psk (HTTP ' + r.status + ')');
            return r.arrayBuffer();
          }),
          fetch(FIXTURES.anim).then(r => {
            if (!r.ok) throw new Error('failed to fetch .md5anim (HTTP ' + r.status + ')');
            return r.text();
          }),
        ]);
        if (cancelled) return;
        const d = buildEmoteData(pskBuf, animText);
        if (cancelled) return;
        clock.current = createEmoteClock();
        setData(d);
        setLoadMs(performance.now() - t0);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ height: '100vh', background: '#0b0f14', color: '#e5e7eb', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, "Segoe UI", sans-serif' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <strong style={{ color: '#facc15', fontSize: 13, letterSpacing: 1 }}>EMOTE PREVIEW TEST</strong>
        <span style={{ color: '#9ca3af' }}>
          SK_Ch000_Default_00.psk + em001_EmotionAct001.md5anim
        </span>
        {data && (
          <span style={{ color: '#6ee7b7', marginLeft: 'auto', fontFamily: 'ui-monospace, monospace' }}>
            {data.bones.length} bones · {data.numFrames} frames @ {data.fps.toFixed(2)} fps · loaded {loadMs ? Math.round(loadMs) + 'ms' : ''}
          </span>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {err ? (
          <div style={{ padding: 24, fontFamily: 'ui-monospace, monospace', color: '#f87171' }}>
            <strong>EMOTE LOAD ERROR</strong><br />{err}
          </div>
        ) : !data ? (
          <div style={{ padding: 24, color: '#9ca3af' }}>
            Loading fixture animation (19.5 MB md5anim — parsing 312 frames × 856 joints)…
          </div>
        ) : (
          <>
            <Canvas
              shadows
              gl={{ alpha: true, antialias: true }}
              camera={{ position: [0, 0, 5], fov: 45 }}
              style={{ width: '100%', height: '100%' }}
            >
              <ambientLight intensity={0.7} />
              <directionalLight position={[5, 5, 5]} intensity={1.2} />
              <pointLight position={[-10, -10, -10]} intensity={1} color="#facc15" />
              <Suspense fallback={null}>
                <EmoteSkeleton data={data} clock={clock} />
              </Suspense>
              <OrbitControls makeDefault target={[0, 1.0, 0]} enablePan enableZoom />
            </Canvas>
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                right: 16,
                background: 'rgba(0,0,0,0.72)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <EmoteControls data={data} clock={clock} />
              <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                ▶/⏸ play &amp; pause · drag the timeline to scrub · ⏮ restart · drag empty space to orbit, wheel to zoom
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
