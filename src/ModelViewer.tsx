import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Float } from '@react-three/drei';
import { Suspense, useEffect, useState, useRef, Component, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

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

type ExtractionStatus = 'idle' | 'extracting' | 'loading' | 'ready' | 'error';

export default function ModelViewer({ selectedMod }: { selectedMod: any }) {
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const extractionRef = useRef(0); // to cancel stale extractions

  useEffect(() => {
    const thisId = ++extractionRef.current;

    if (!selectedMod) {
      setLoadedScene(null);
      setStatus('idle');
      setErrorMsg('');
      return;
    }

    setStatus('extracting');
    setLoadedScene(null);
    setErrorMsg('');

    invoke("extract_mod_preview", {
      modId: selectedMod.id,
      folderPath: selectedMod.folder_path
    })
      .then((gltfPath: any) => {
        if (extractionRef.current !== thisId) return;

        setStatus('loading');

        // Normalize path separators
        const normalizedPath = gltfPath.replace(/\\/g, '/');

        // Extract the directory path before conversion to preserve correct slashes
        const lastSlash = normalizedPath.lastIndexOf('/');
        const dirPath = normalizedPath.substring(0, lastSlash + 1);

        // Convert both the file path and the directory path to safe Tauri asset URLs
        const assetUrl = convertFileSrc(normalizedPath);
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
      case 'ready': return '3D PREVIEW ACTIVE — DRAG TO ROTATE';
      case 'error': return errorMsg || 'EXTRACTION FAILED';
    }
  };

  return (
    <ViewerErrorBoundary>
      <div className="w-full h-full relative overflow-hidden">
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
            {status === 'ready' && loadedScene ? (
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
            makeDefault
            target={(status === 'ready' && loadedScene) ? [0, 1.0, 0] : [0, 0, 0]}
            enablePan={true}
            minPolarAngle={0}
            maxPolarAngle={Math.PI}
            autoRotate={status === 'ready'}
            autoRotateSpeed={1.5}
            enableZoom={true}
          />
        </Canvas>

        {/* Bottom overlay */}
        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-sm p-3">
            <h3 className="text-lg font-black italic text-white truncate">
              {selectedMod ? selectedMod.name : "NO MOD SELECTED"}
            </h3>
            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${status === 'error' ? 'text-red-400' : 'text-hero-primary'}`}>
              {statusText()}
            </p>
          </div>
        </div>
      </div>
    </ViewerErrorBoundary>
  );
}
