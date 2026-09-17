import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Float } from '@react-three/drei';
import { Suspense, useEffect, useState, useRef, Component, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { buildEmoteData, buildStaticSkeleton, buildEmoteAnimOnly, EmoteSkeleton, createEmoteClock, type EmoteClockState, type EmoteData } from './emote';
import { EmoteControls, EmoteAudio } from './EmoteControls';

// Error boundary to catch Three.js/WebGL crashes
class ViewerErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-black text-white mb-2">3D VIEWER ERROR</h3>
          <p className="text-xs text-hero-muted max-w-xs">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="mt-4 px-4 py-2 bg-hero-primary/20 border border-hero-primary/30 text-hero-primary text-xs font-bold rounded-sm hover:bg-hero-primary/30 transition-colors"
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Beautiful floating wireframe placeholder
function AbstractPlaceholder() {
  return (
    <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
      <mesh>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#facc15" wireframe emissive="#facc15" emissiveIntensity={0.5} />
      </mesh>
      <mesh scale={0.8}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
      </mesh>
    </Float>
  );
}

// Loading spinner mesh
function LoadingSpinner() {
  const ref = useRef<THREE.Mesh>(null);

  return (
    <Float speed={4} rotationIntensity={3} floatIntensity={1}>
      <mesh ref={ref}>
        <torusGeometry args={[1, 0.15, 16, 40]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} wireframe />
      </mesh>
    </Float>
  );
}

// Renders a loaded GLTF scene perfectly centered and uniformly scaled, ignoring invisible bones
function LoadedModel({ scene }: { scene: THREE.Group }) {
  const clonedScene = scene.clone(true);

  // Force update world matrices so bounding boxes are accurate
  clonedScene.updateMatrixWorld(true);

  // 1. Compute true bounding box of ONLY visible meshes
  const box = new THREE.Box3();
  box.makeEmpty();
  clonedScene.traverse((child: any) => {
    if ((child.isMesh || child.isSkinnedMesh) && child.visible) {
      const meshBox = new THREE.Box3().setFromObject(child);
      box.union(meshBox);
    }
  });

  // Fallback to arbitrary scale if the box is empty (no meshes found)
  if (box.isEmpty() || !isFinite(box.max.x)) {
    return <group scale={0.02} position={[0, -2.0, 0]}><primitive object={clonedScene} /></group>;
  }

  // 2. Get true center and dimensions
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // 3. Normalize scale so the largest dimension (usually height) is exactly 3.5 units
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 3.5 / maxDim : 1.0;

  // 4. Wrap in a group that shifts the model vertically to center it, but respects original X/Z origin
  return (
    <group scale={scale}>
      <group position={[0, -center.y, 0]}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

// Camera framing per mode. The emote skeleton is fit so its bounding-box
// center sits EXACTLY at the origin (body spans -1.75..+1.75), so the shared
// default camera at z=5 reads tighter than the skin framing — where the body
// stands above the floor and the target is raised. Pull the camera back to
// z=7.5 for emotes so the character sits at the same comfortable distance as
// the skin preview; restore the default framing for skins/placeholder.
const EMOTE_CAM = new THREE.Vector3(0, 0, 7.5);
const DEFAULT_CAM = new THREE.Vector3(0, 0, 5);
const SKIN_TARGET = new THREE.Vector3(0, 1.0, 0);
const ORIGIN_TARGET = new THREE.Vector3(0, 0, 0);

function CameraFraming({ mode }: { mode: 'emote' | 'skin' | 'other' }) {
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as any;
  useEffect(() => {
    if (!controls) return;
    const cam = mode === 'emote' ? EMOTE_CAM : DEFAULT_CAM;
    const tgt = mode === 'skin' ? SKIN_TARGET : ORIGIN_TARGET;
    camera.position.copy(cam);
    controls.target.copy(tgt);
    // Keep the saved defaults in sync so OrbitControls.reset() (the emote
    // "Reset view" button) returns to THIS framing, not the mount-time one.
    if (controls.position0) controls.position0.copy(cam);
    if (controls.target0) controls.target0.copy(tgt);
    controls.update();
  }, [mode, camera, controls]);
  return null;
}

type ExtractionStatus = 'idle' | 'extracting' | 'loading' | 'ready' | 'error';

export default function ModelViewer({ selectedMod }: { selectedMod: any }) {
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const [emoteData, setEmoteData] = useState<EmoteData | null>(null);
  // Shared emote playback state (time in frames). Mutated by the render loop
  // and the timeline controls; not React state so scrubbing stays at 60fps.
  const emoteClockRef = useRef<EmoteClockState>(createEmoteClock());
  // OrbitControls handle — used by the emote "Reset view" button to snap the
  // camera back to the default head-on framing (position0/target0 captured at
  // mount: camera (0,0,5), target (0,0,0) — the emote's standing view).
  const controlsRef = useRef<any>(null);
  // Bundled emote audio (e.g. dance music) as a Tauri asset URL, or null.
  const [emoteAudio, setEmoteAudio] = useState<string | null>(null);
  // Emote audio volume 0..1 (0 = muted). Default 0.9 — same as before the
  // slider landed, so nothing suddenly gets quieter or louder.
  const [audioVolume, setAudioVolume] = useState(0.9);
  const [noTextures, setNoTextures] = useState(false);
  const [texturePreview, setTexturePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const extractionRef = useRef(0); // to cancel stale extractions

  useEffect(() => {
    const thisId = ++extractionRef.current;

    if (!selectedMod) {
      setLoadedScene(null);
      setTexturePreview(null);
      setStatus('idle');
      setErrorMsg('');
      return;
    }

    setStatus('extracting');
    setLoadedScene(null);
    setEmoteData(null);
    setEmoteAudio(null);
    setNoTextures(false);
    setTexturePreview(null);
    setErrorMsg('');

    invoke("extract_mod_preview", {
      modId: selectedMod.id,
      folderPath: selectedMod.folder_path
    })
      .then(async (result: any) => {
        if (extractionRef.current !== thisId) return;

        setStatus('loading');

        // Emote mods return "EMOTE::<psk>|<md5anim>" — load the skeleton +
        // animation files and play the emote in the 3D viewer.
        if (typeof result === 'string' && result.startsWith('EMOTE::')) {
          // Token is "EMOTE::<psk>|<anim>" — either slot may be empty:
          //   both present  -> animated skeleton (psk parenting + md5anim frames)
          //   psk only      -> static rest-pose skeleton (no animation in mod)
          //   anim only     -> animated but flat (no bundled skeleton mesh)
          // Token is "EMOTE::<psk>|<anim>|<audio>" — either slot may be empty
          const parts = result.slice('EMOTE::'.length).split('|');
          const pskPath = (parts[0] || '').trim();
          const animPath = (parts[1] || '').trim();
          const audioPath = (parts[2] || '').trim();
          const toUrl = (p: string) => convertFileSrc(p.replace(/\\/g, '/'));
          const readPsk = (p: string) => fetch(toUrl(p)).then(r => {
            if (!r.ok) throw new Error('failed to read .psk (' + r.status + ')');
            return r.arrayBuffer() as Promise<ArrayBuffer>;
          });
          const readAnim = (p: string) => fetch(toUrl(p)).then(r => {
            if (!r.ok) throw new Error('failed to read .md5anim (' + r.status + ')');
            return r.text();
          });
          try {
            let data: EmoteData;
            if (pskPath && animPath) {
              const [pskBuf, animText] = await Promise.all([readPsk(pskPath), readAnim(animPath)]);
              data = buildEmoteData(pskBuf, animText);
            } else if (pskPath) {
              data = buildStaticSkeleton(await readPsk(pskPath));
            } else if (animPath) {
              data = buildEmoteAnimOnly(await readAnim(animPath));
            } else {
              throw new Error('emote token had no files');
            }
            emoteClockRef.current = createEmoteClock(); // reset: time 0, playing
            setEmoteData(data);
            setEmoteAudio(audioPath ? toUrl(audioPath) : null);
            setStatus('ready');
          } catch (e) {
            console.error('Emote load error:', e);
            setStatus('error');
            setErrorMsg('Failed to load emote animation: ' + String(e));
          }
          return;
        }

        // Normalize path separators
        const normalizedPath = result.replace(/\\/g, '/');
        const assetUrl = convertFileSrc(normalizedPath);

        // Handle texture mods seamlessly
        if (normalizedPath.toLowerCase().endsWith('.png')) {
          setTexturePreview(assetUrl);
          setStatus('ready');
          return;
        }

        // Extract the directory path before conversion to preserve correct slashes
        const lastSlash = normalizedPath.lastIndexOf('/');
        const dirPath = normalizedPath.substring(0, lastSlash + 1);

        // Convert the directory path to safe Tauri asset URLs
        const dirUrl = convertFileSrc(dirPath);

        const loader = new GLTFLoader();
        // Set the resource path so .bin buffers are loaded from the correct directory URL
        loader.setResourcePath(dirUrl);

        console.log("[ModelViewer] Loading GLTF from:", assetUrl);
        console.log("[ModelViewer] Resource path:", dirUrl);

        loader.load(
          assetUrl,
          (gltf) => {
            if (extractionRef.current !== thisId) return;

            // Fix materials: UE4 often packs weird data in vertex colors which look like bright green/pink.
            // If the mod didn't include custom textures (reusing base game ones), we'll make it look like a nice clay render.
            gltf.scene.traverse((child: any) => {
              if (child.isMesh && child.material) {
                const processMaterial = (mat: any) => {
                  mat.vertexColors = false; // Disable ugly vertex colors

                  // If there is no texture map, make it a nice flat "clay" material
                  if (!mat.map) {
                    mat.color.setHex(0xe5e7eb); // Light gray clay
                    mat.roughness = 0.8;
                    mat.metalness = 0.1;
                  } else {
                    // umodel writes arbitrary placeholder baseColorFactors (a 0.3/0.9
                    // palette) that glTF multiplies into the texture, tinting the
                    // preview (grayed-out/bluish/yellowish). Neutralize the factor so
                    // the texture shows its true colors — this also fixes models that
                    // were cached and extracted before the backend fix.
                    mat.color.setHex(0xffffff);
                  }

                  // Fix transparent materials sometimes rendering weirdly
                  if (mat.transparent) {
                    mat.alphaTest = 0.5;
                  }
                  mat.needsUpdate = true;
                };

                if (Array.isArray(child.material)) {
                  child.material.forEach(processMaterial);
                } else {
                  processMaterial(child.material);
                }
              }
            });

            // Diagnostic: if the model loaded but has zero textured materials,
            // the viewer will show the clay fallback — say so instead of
            // leaving the user staring at a gray model.
            let textured = 0;
            let total = 0;
            gltf.scene.traverse((c: any) => {
              if (c.isMesh && c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach((m: any) => { total++; if (m.map) textured++; });
              }
            });
            if (total > 0 && textured === 0) {
              console.warn('[ModelViewer] Model loaded with no textures — clay preview. glTF:', assetUrl);
              setNoTextures(true);
            }

            setLoadedScene(gltf.scene);
            setStatus('ready');
          },
          undefined,
          (err: any) => {
            if (extractionRef.current !== thisId) return;
            console.error("GLTF load error:", err);
            setStatus('error');
            setErrorMsg('Failed to parse 3D model: ' + (err.message || String(err)));
          }
        );
      })
      .catch((e: any) => {
        if (extractionRef.current !== thisId) return;
        console.warn("Extraction failed:", e);
        setStatus('error');
        setErrorMsg(String(e));
      });
  }, [selectedMod?.id]);

  const statusText = () => {
    switch (status) {
      case 'idle': return 'SELECT A MOD TO PREVIEW';
      case 'extracting': return 'EXTRACTING MODEL ASSETS...';
      case 'loading': return 'LOADING 3D MODEL...';
      case 'ready':
        if (texturePreview) return '2D TEXTURE PREVIEW ACTIVE';
        if (emoteData) {
          return emoteData.numFrames > 1
            ? 'EMOTE ANIMATION PREVIEW — DRAG TO ROTATE, USE THE TIMELINE BELOW'
            : 'STATIC SKELETON PREVIEW (NO ANIMATION IN THIS MOD) — DRAG TO ROTATE';
        }
        return '3D PREVIEW ACTIVE — DRAG TO ROTATE';
      case 'error': return errorMsg || 'EXTRACTION FAILED';
    }
  };

  return (
    <ViewerErrorBoundary>
      <div className="w-full h-full relative overflow-hidden bg-black/20 flex flex-col items-center justify-center">
        {texturePreview && status === 'ready' ? (
          <div className="w-full h-full p-12 flex flex-col items-center justify-center relative">
            <div className="absolute inset-0 bg-hero-bg/50 backdrop-blur-sm -z-10" />
            <img 
              src={texturePreview} 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl ring-2 ring-hero-accent/50" 
              alt="Texture Mod" 
            />
          </div>
        ) : (
        <Canvas
          shadows
          gl={{ alpha: true, antialias: true }}
          camera={{ position: [0, 0, 5], fov: 45 }}
          style={{ width: '100%', height: '100%' }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <ambientLight intensity={0.6} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />
          <pointLight position={[-10, -10, -10]} intensity={1} color="#facc15" />
          <directionalLight position={[5, 5, 5]} intensity={0.5} />

          <Suspense fallback={null}>
            {status === 'ready' && emoteData ? (
              <EmoteSkeleton data={emoteData} clock={emoteClockRef} />
            ) : status === 'ready' && loadedScene ? (
              <LoadedModel scene={loadedScene} />
            ) : status === 'extracting' || status === 'loading' ? (
              <LoadingSpinner />
            ) : (
              <AbstractPlaceholder />
            )}
            <Environment preset="city" />
            <ContactShadows position={[0, -1.75, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />
          </Suspense>

          <OrbitControls
            ref={controlsRef}
            makeDefault
            // Emote skeletons are fit so their bounding-box center is EXACTLY the
            // origin (floor always at y = -1.75) — orbit around the origin so the
            // character sits centered in the viewer. GLTF models stand with their
            // body center near y = 1, so they keep the raised target.
            target={status === 'ready' && emoteData ? [0, 0, 0] : status === 'ready' && loadedScene ? [0, 1.0, 0] : [0, 0, 0]}
            enablePan={true}
            // Emotes: the character stands on the grid, so clamp the orbit to a
            // band around the horizon. Free 0..PI orbit lets the camera swing
            // directly overhead (or below the floor), where the standing figure
            // foreshortens into a flat "starburst" that reads as lying down.
            // GLTF models keep the full range (some look better from below).
            minPolarAngle={status === 'ready' && emoteData ? 0.2 : 0}
            maxPolarAngle={status === 'ready' && emoteData ? 1.5 : Math.PI}
            autoRotate={status === 'ready' && !emoteData}
            autoRotateSpeed={1.5}
            enableZoom={true}
          />
          <CameraFraming
            mode={status === 'ready' && emoteData ? 'emote' : status === 'ready' && loadedScene ? 'skin' : 'other'}
          />
        </Canvas>
        )}

        {/* Bottom overlay */}
        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-sm p-3">
            <h3 className="text-lg font-black italic text-white truncate">
              {selectedMod ? selectedMod.name : "NO MOD SELECTED"}
            </h3>
            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${status === 'error' ? 'text-red-400' : 'text-hero-primary'}`}>
              {statusText()}
            </p>
            {status === 'ready' && noTextures && !texturePreview && (
              <p className="text-[11px] font-bold text-amber-300 mt-1">
                ⚠ NO TEXTURES FOUND IN THIS MODEL — SHOWING CLAY PREVIEW
              </p>
            )}
            {status === 'ready' && emoteData && (
              <div className="mt-3 pt-3 border-t border-white/10 pointer-events-auto">
                {emoteAudio && (
                  <EmoteAudio src={emoteAudio} clock={emoteClockRef} data={emoteData} volume={audioVolume} />
                )}
                <EmoteControls
                  data={emoteData}
                  clock={emoteClockRef}
                  onResetView={() => controlsRef.current?.reset()}
                  volume={emoteAudio ? audioVolume : undefined}
                  onVolumeChange={emoteAudio ? (v) => setAudioVolume(v) : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </ViewerErrorBoundary>
  );
}
