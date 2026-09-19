// Emote (AnimSequence) preview: parses umodel's .psk skeleton + .md5anim
// frames and plays the animation as an animated skeleton in the 3D viewer.
//
// Verified recipe (see notes.md / handoff):
//  - .psk bone table (120 B/entry) supplies the CORRECT parenting.
//  - .md5anim supplies per-frame local transforms (name-mapped; its own
//    hierarchy parents are broken).
//  - World transform: W(i) = W(parent) * L(i). Quaternions in md5anim drop
//    w; recover with w = -sqrt(1 - x^2 - y^2 - z^2) — UE Viewer's exporter
//    convention stores NEGATIVE w (its own .psk rest pose confirms this,
//    e.g. root quat (-0.707, 0, 0, -0.707)). Using +w renders the character
//    upside-down / off-balance.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface PskBone {
  name: string;
  parent: number;
  restPos: [number, number, number];
  restQuat: [number, number, number, number];
}

export interface EmoteData {
  bones: PskBone[];
  numFrames: number;
  fps: number;
  // Per bone: Float32Array(numFrames * 6) of "px py pz qx qy qz", or null if
  // the bone has no animated data (fall back to its .psk rest transform).
  frames: (Float32Array | null)[];
  // Sign of the w component dropped by the md5anim exporter. UE Viewer stores
  // negative-w quaternions, so animated w is recovered as
  // wSign * sqrt(1 - x^2 - y^2 - z^2). Rest-pose (.psk) quaternions carry a
  // full w already and never use this.
  wSign: 1 | -1;
}

const ENTRY = 120;

function nameAt(bytes: Uint8Array, o: number): string | null {
  let len = 0;
  for (let i = 0; i < 64; i++) {
    const c = bytes[o + i];
    if (c === 0) break;
    if (c < 32 || c > 126) return null;
    len++;
  }
  return len ? bytes.subarray(o, o + len).reduce((s, c) => s + String.fromCharCode(c), '') : null;
}

function validBoneEntry(dv: DataView, bytes: Uint8Array, o: number, n: number): boolean {
  if (o + ENTRY > n) return false;
  if (!nameAt(bytes, o)) return false;
  const parent = dv.getUint32(o + 72, true);
  if (parent > 4096) return false;
  for (let k = 76; k <= 108; k += 4) {
    const f = dv.getFloat32(o + k, true);
    if (!isFinite(f) || Math.abs(f) > 1e5) return false;
  }
  return true;
}

/// Locate the bone table by scanning for the longest run of plausible
/// 120-byte entries (works regardless of where the table sits in the file).
export function parsePsk(buffer: ArrayBuffer): PskBone[] {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const n = buffer.byteLength;

  let bestStart = -1;
  let bestLen = 0;
  let bestIsRoot = false;
  let o = 0;
  while (o + ENTRY <= n) {
    let len = 0;
    while (o + ENTRY * len <= n && validBoneEntry(dv, bytes, o + ENTRY * len, n)) len++;
    if (len >= 8) {
      const first = nameAt(bytes, o) ?? '';
      const isRoot = first.toLowerCase() === 'root' || dv.getUint32(o + 72, true) === 0;
      if (isRoot && (!bestIsRoot || len > bestLen)) { bestStart = o; bestLen = len; bestIsRoot = true; }
      else if (!bestIsRoot && len > bestLen) { bestStart = o; bestLen = len; }
    }
    o += len > 1 ? ENTRY : 4;
  }

  if (bestStart < 0 || bestLen < 8) throw new Error('Could not find bone table in .psk');

  const bones: PskBone[] = [];
  for (let i = 0; i < bestLen; i++) {
    const b = bestStart + ENTRY * i;
    bones.push({
      name: nameAt(bytes, b) ?? `bone${i}`,
      parent: dv.getUint32(b + 72, true),
      restPos: [dv.getFloat32(b + 92, true), dv.getFloat32(b + 96, true), dv.getFloat32(b + 100, true)],
      restQuat: [dv.getFloat32(b + 76, true), dv.getFloat32(b + 80, true), dv.getFloat32(b + 84, true), dv.getFloat32(b + 88, true)],
    });
  }
  return bones;
}

/// Recover the dropped w component of a unit quaternion from x/y/z, with the
/// exporter's sign convention (UE Viewer: negative w).
function recoverW(x: number, y: number, z: number, sign: number): number {
  return sign * Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
}

/// Parse md5anim, keeping only the frames for the requested bone names
/// (matched case-insensitively). Returns per-bone Float32Arrays aligned with
/// the requested name list (null for names not present in the animation).
export function parseMd5animFrames(text: string, boneNames: string[], numFrames: number): (Float32Array | null)[] {
  const lines = text.split(/\r?\n/);

  // Hierarchy: "name" parent base offset, one line per joint, until '}'.
  let hi = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    if (lines[i].trim().startsWith('hierarchy')) { hi = i; break; }
  }
  if (hi < 0) throw new Error('No hierarchy block in .md5anim');
  const names: string[] = [];
  for (let i = hi + 1; i < lines.length && lines[i].trim() !== '}'; i++) {
    const m = lines[i].match(/"([^"]*)"/);
    if (m) names.push(m[1]);
  }

  const wanted = boneNames.map(nm => {
    const idx = names.indexOf(nm);
    if (idx >= 0) return idx;
    const lower = nm.toLowerCase();
    const li = names.findIndex(x => x.toLowerCase() === lower);
    return li;
  });

  const frames: (Float32Array | null)[] = boneNames.map((_, b) =>
    wanted[b] >= 0 ? new Float32Array(numFrames * 6) : null);

  // Frames: each "frame N {" is followed by one line per joint.
  let f = 0;
  for (let i = 0; i < lines.length && f < numFrames; i++) {
    const line = lines[i].trim();
    if (!/^frame\s+\d+\s*\{$/.test(line)) continue;
    const data: number[][] = [];
    let fi = i + 1;
    while (data.length < names.length && fi < lines.length) {
      if (lines[fi].trim() === '}') break;
      const p = lines[fi].trim().split(/\s+/).map(Number);
      if (p.length >= 6 && p.slice(0, 6).every(isFinite)) data.push(p);
      else break;
      fi++;
    }
    if (data.length < names.length) break;
    for (let b = 0; b < boneNames.length; b++) {
      if (!frames[b] || wanted[b] < 0) continue;
      const d = data[wanted[b]];
      const o = f * 6;
      frames[b]!.set([d[0], d[1], d[2], d[3], d[4], d[5]], o);
    }
    i = fi;
    f++;
  }

  if (f === 0) throw new Error('No frames found in .md5anim');
  return frames;
}

export function buildEmoteData(pskBuffer: ArrayBuffer, animText: string): EmoteData {
  const mFrames = animText.match(/numFrames\s+(\d+)/);
  const mRate = animText.match(/frameRate\s+([\d.]+)/);
  const numFrames = mFrames ? parseInt(mFrames[1], 10) : 0;
  const fps = mRate ? parseFloat(mRate[1]) : 30;
  if (!numFrames) throw new Error('No numFrames in .md5anim');

  const bones = parsePsk(pskBuffer);
  const frames = parseMd5animFrames(animText, bones.map(b => b.name), numFrames);
  return { bones, numFrames, fps, frames, wSign: -1 };
}

/// Static rest-pose skeleton from a .psk alone (no .md5anim). Used for emote
/// mods that bundle a SkeletalMesh but no AnimSequence. numFrames=1 → the
/// skeleton renders the rest pose and the timeline controls disable themselves.
export function buildStaticSkeleton(pskBuffer: ArrayBuffer): EmoteData {
  const bones = parsePsk(pskBuffer);
  // Rest-pose quaternions carry a full w, so wSign is never consulted here;
  // -1 matches the exporter convention regardless.
  return { bones, numFrames: 1, fps: 1, frames: bones.map(() => null), wSign: -1 };
}

/// Animated preview from a .md5anim alone (no .psk). UE Viewer's md5anim
/// hierarchy is flat (every joint's parent is 0), so the joints are built from
/// the hierarchy itself: the pose still animates, just without true parent/
/// child nesting. Used for emote mods that bundle an AnimSequence but not the
/// character mesh.
export function buildEmoteAnimOnly(animText: string): EmoteData {
  const mFrames = animText.match(/numFrames\s+(\d+)/);
  const mRate = animText.match(/frameRate\s+([\d.]+)/);
  const numFrames = mFrames ? parseInt(mFrames[1], 10) : 0;
  const fps = mRate ? parseFloat(mRate[1]) : 30;
  if (!numFrames) throw new Error('No numFrames in .md5anim');

  const lines = animText.split(/\r?\n/);
  let hi = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    if (lines[i].trim().startsWith('hierarchy')) { hi = i; break; }
  }
  if (hi < 0) throw new Error('No hierarchy block in .md5anim');
  const bones: PskBone[] = [];
  for (let i = hi + 1; i < lines.length && lines[i].trim() !== '}'; i++) {
    const m = lines[i].match(/"([^"]*)"\s+(-?\d+)/);
    if (!m) continue;
    bones.push({ name: m[1], parent: parseInt(m[2], 10), restPos: [0, 0, 0], restQuat: [0, 0, 0, 1] });
  }
  if (bones.length === 0) throw new Error('No joints in .md5anim hierarchy');
  const frames = parseMd5animFrames(animText, bones.map(b => b.name), numFrames);
  return { bones, numFrames, fps, frames, wSign: -1 };
}

// ---------- composition helpers ----------

function qMul(a: number[], b: number[]): number[] {
  return [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function qRotate(q: number[], v: number[]): number[] {
  const t = [
    2 * (q[1] * v[2] - q[2] * v[1]),
    2 * (q[2] * v[0] - q[0] * v[2]),
    2 * (q[0] * v[1] - q[1] * v[0]),
  ];
  return [
    v[0] + q[3] * t[0] + (q[1] * t[2] - q[2] * t[1]),
    v[1] + q[3] * t[1] + (q[2] * t[0] - q[0] * t[2]),
    v[2] + q[3] * t[2] + (q[0] * t[1] - q[1] * t[0]),
  ];
}

function slerp(a: number[], b: number[], t: number): number[] {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) {
    const out = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    return out.map(x => x / l);
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, d)));
  const sa = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sa;
  const wb = Math.sin(t * theta) / sa;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

/// Local transform of bone b at (possibly fractional) frame f.
function localAt(data: EmoteData, b: number, f: number): { p: number[]; q: number[] } {
  const bone = data.bones[b];
  const fd = data.frames[b];
  if (!fd) return { p: bone.restPos, q: bone.restQuat };
  const f0 = Math.floor(f) % data.numFrames;
  const f1 = (f0 + 1) % data.numFrames;
  const a = f - Math.floor(f);
  if (a < 1e-6) {
    const o = f0 * 6;
    return { p: [fd[o], fd[o + 1], fd[o + 2]], q: [fd[o + 3], fd[o + 4], fd[o + 5], recoverW(fd[o + 3], fd[o + 4], fd[o + 5], data.wSign)] };
  }
  const o0 = f0 * 6, o1 = f1 * 6;
  const p = [
    fd[o0] + (fd[o1] - fd[o0]) * a,
    fd[o0 + 1] + (fd[o1 + 1] - fd[o0 + 1]) * a,
    fd[o0 + 2] + (fd[o1 + 2] - fd[o0 + 2]) * a,
  ];
  const q = slerp(
    [fd[o0 + 3], fd[o0 + 4], fd[o0 + 5], recoverW(fd[o0 + 3], fd[o0 + 4], fd[o0 + 5], data.wSign)],
    [fd[o1 + 3], fd[o1 + 4], fd[o1 + 5], recoverW(fd[o1 + 3], fd[o1 + 4], fd[o1 + 5], data.wSign)],
    a,
  );
  return { p, q };
}

/// World positions of all bones at frame f (bone i's parent is always an
/// earlier index, so a single forward pass composes everything).
function worldAt(data: EmoteData, f: number): number[][] {
  const n = data.bones.length;
  const wp: number[][] = new Array(n);
  const wq: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const { p, q } = localAt(data, i, f);
    const pi = data.bones[i].parent;
    if (pi >= 0 && pi < i) {
      wq[i] = qMul(wq[pi], q);
      const r = qRotate(wq[pi], p);
      wp[i] = [wp[pi][0] + r[0], wp[pi][1] + r[1], wp[pi][2] + r[2]];
    } else {
      wq[i] = q;
      wp[i] = p;
    }
  }
  return wp;
}

// ---------- viewer component ----------

/// Shared playback state, mutated directly (no React re-renders) so the
/// render loop and the timeline UI stay in sync at 60 fps.
/// `time` is the current frame as a float (wraps at `numFrames`).
export interface EmoteClockState {
  time: number;
  playing: boolean;
  scrubbing: boolean; // true while the user is dragging the timeline
}

export const createEmoteClock = (): EmoteClockState => ({ time: 0, playing: true, scrubbing: false });

/// The emote viewer tab stays mounted (hidden via CSS) when you switch tabs,
/// so playback must be gated on this flag: the render loop and the emote audio
/// both pause while the viewer is not on screen, and resume when it is.
let viewerVisible = true;
export const setViewerVisible = (v: boolean) => { viewerVisible = v; };
export const isViewerVisible = () => viewerVisible;

// ---------- presentation helpers ----------

/// Pure attachment/utility bones (they overlap other bones or dangle to the
/// ground) are hidden so the skeleton reads cleanly. `root` is the rig's
/// floor-placed anchor pivot: it is not anatomy, its long segment to the
/// hips draws a dominant diagonal "pole" through the figure, and it drags
/// the fit box / floor below the feet.
const UTILITY_BONE_RE = /_ex$|(^|_)grab(_|$)|(^|_)weapon(_|$)|rawweights|^root$/i;

/// The `root` anchor specifically (case-insensitive, exact name — does not
/// match `jointroot`). Used to hide segments that end on it even when the
/// other endpoint is a visible bone.
const ROOT_ANCHOR_RE = /^root$/i;

/// Color a bone by body part so the skeleton reads clearly at a glance.
function bonePartColor(name: string): string {
  const s = name.toLowerCase();
  if (/collar|clavicle|upperarm|_arm(_|$)|elbow|forearm|_hand(_|$)|finger|thumb|wrist/.test(s)) return '#38bdf8'; // arms
  if (/(^|_)hip(_$|_)|_leg(_|$)|_knee(_|$)|calf|shin|_ankle(_|$)|_toe(_|$)|(^|_)foot(_$|_)/.test(s)) return '#4ade80'; // legs
  if (/(^|_)(head|neck|face|skull|eye|eyelid|eyebrow|nose|cheek|lip|teeth|jaw|tongue)(_|$)/.test(s)) return '#f87171'; // head
  if (/(^|_)(root|jointroot|cog|waist|spine|chest|torso|pelvis|hips)(_|$)/.test(s)) return '#cbd5e1'; // torso
  return '#facc15'; // fallback
}

/// Detect the character's "up" axis from the DISPLAYED animation at frame 0
/// (torso base -> neck/head). Must come from the animation, not the rest
/// pose: the .psk and .md5anim are exported from different bind poses, so the
/// rest-pose spine direction does not match the animated figure's. (For
/// static rest-pose skeletons, worldAt(0) IS the rest pose, so this still
/// works.) Returns null when the naming doesn't match, in which case the raw
/// orientation is kept as-is.
function detectUpVector(data: EmoteData): [number, number, number] | null {
  const n = data.bones.length;
  const lower = data.bones.map(b => b.name.toLowerCase());
  const baseRe = /(^|_)(root|jointroot|cog|waist|hip|pelvis|hips)(_|$)/;
  const topRe = /(^|_)(neck|head)(_|$)/;
  let bx = 0, by = 0, bz = 0, bc = 0, tx = 0, ty = 0, tz = 0, tc = 0;
  const wp = worldAt(data, 0);
  for (let i = 0; i < n; i++) {
    const nm = lower[i];
    if (baseRe.test(nm)) { bx += wp[i][0]; by += wp[i][1]; bz += wp[i][2]; bc++; }
    else if (topRe.test(nm)) { tx += wp[i][0]; ty += wp[i][1]; tz += wp[i][2]; tc++; }
  }
  if (!bc || !tc) return null;
  const vx = tx / tc - bx / bc;
  const vy = ty / tc - by / bc;
  const vz = tz / tc - bz / bc;
  const l = Math.hypot(vx, vy, vz);
  if (!isFinite(l) || l < 1e-6) return null;
  return [vx / l, vy / l, vz / l];
}

// Scratch objects shared by the render loop (single-threaded, safe).
const _UP = new THREE.Vector3(0, 1, 0);
const _alignQuat = new THREE.Quaternion();

export function EmoteSkeleton({ data, clock }: { data: EmoteData; clock: { current: EmoteClockState } }) {
  const n = data.bones.length;

  // Visible bone segments (child -> parent); utility bones and the root
  // anchor excluded (the anchor's long floor-to-hip segment reads as a
  // tilted pole and misleads the fit box).
  const segs = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const b = data.bones[i];
      if (UTILITY_BONE_RE.test(b.name)) continue;
      const pi = b.parent;
      if (pi >= 0 && pi < n && pi !== i && !ROOT_ANCHOR_RE.test(data.bones[pi].name)) out.push([i, pi]);
    }
    return out;
  }, [data, n]);
  const segCount = segs.length;

  // Visible joint dots.
  const jointIdx = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (!UTILITY_BONE_RE.test(data.bones[i].name)) out.push(i);
    return out;
  }, [data, n]);
  const jointCount = jointIdx.length;

  const boneGeo = useMemo(() => new THREE.CylinderGeometry(0.8, 1, 1, 8, 1), []);
  const jointGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);

  const boneRef = useRef<THREE.InstancedMesh>(null);
  const jointRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const dirV = useMemo(() => new THREE.Vector3(), []);

  // SELF-ORIENT + FIT: rotate the character's rest-pose up axis onto world +Y,
  // then frame the whole animation. The floor ends up exactly at the lowest
  // point (the feet), so the character stands on it.
  // Fit is computed over a SAMPLE OF FRAMES, not just frame 0: emotes contain
  // extreme poses (arm sweeps, jumps) and a frame-0-only box would leave the
  // character partially out of view for the rest of the animation.
  const { scale, offset, orientQ, floorY, boneR, jointR } = useMemo(() => {
    const up = detectUpVector(data);
    const orientQ = up
      ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(up[0], up[1], up[2]), new THREE.Vector3(0, 1, 0))
      : new THREE.Quaternion();
    const v = new THREE.Vector3();
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const sampleCount = Math.max(1, Math.min(24, data.numFrames));
    for (let s = 0; s < sampleCount; s++) {
      const f = sampleCount === 1 ? 0 : Math.floor(s * (data.numFrames - 1) / (sampleCount - 1));
      const pos = worldAt(data, f);
      for (let i = 0; i < n; i++) {
        // Utility/attachment bones (grab points, weapon sockets) can dangle
        // far below the feet and would distort the fit box — exclude them.
        if (UTILITY_BONE_RE.test(data.bones[i].name)) continue;
        const p = pos[i];
        v.set(p[0], p[1], p[2]).applyQuaternion(orientQ);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
      }
    }
    if (!isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 1; }
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const scale = 3.5 / maxDim;
    const offset = [-(minX + maxX) / 2, -(minY + maxY) / 2, -(minZ + maxZ) / 2];
    // Lowest point of the oriented character, in final (scaled) space.
    // Bounded by the fit box above, which excludes utility bones — otherwise
    // a `grab`/attachment bone dangling to the ground would drag the floor
    // below the feet and leave them floating.
    const floorY = scale * (offset[1] + minY);
    // Body-relative radii (in raw asset units) so the skeleton reads as real
    // bones of a consistent thickness no matter the asset's raw scale.
    const boneR = maxDim * 0.02;
    const jointR = maxDim * 0.035;
    return { scale, offset, orientQ, floorY, boneR, jointR };
  }, [data]);

  // Static per-instance colors (body parts), set once.
  useEffect(() => {
    const c = new THREE.Color();
    const white = new THREE.Color('#ffffff');
    const bm = boneRef.current;
    if (bm) {
      for (let k = 0; k < segCount; k++) bm.setColorAt(k, c.set(bonePartColor(data.bones[segs[k][0]].name)));
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    }
    const jm = jointRef.current;
    if (jm) {
      for (let k = 0; k < jointCount; k++) {
        jm.setColorAt(k, c.set(bonePartColor(data.bones[jointIdx[k]].name)).clone().lerp(white, 0.35));
      }
      if (jm.instanceColor) jm.instanceColor.needsUpdate = true;
    }
  }, [data, segs, jointIdx, segCount, jointCount]);

  useFrame((_, delta) => {
    const c = clock.current;
    if (c.playing && !c.scrubbing && isViewerVisible()) {
      // Clamp delta so a backgrounded tab / long frame doesn't jump the animation.
      c.time = (c.time + Math.min(delta, 0.1) * data.fps) % data.numFrames;
    }
    const wp = worldAt(data, c.time);

    // Orient raw skeleton space -> view space (self-orientation).
    const op: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      tmpV.set(wp[i][0], wp[i][1], wp[i][2]).applyQuaternion(orientQ);
      op[i] = [tmpV.x, tmpV.y, tmpV.z];
    }

    // Bones: tapered cylinder between child and parent joint.
    const bm = boneRef.current;
    if (bm) {
      for (let k = 0; k < segCount; k++) {
        const ci = segs[k][0], pi = segs[k][1];
        const a = op[ci], b = op[pi];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-4) {
          // Zero-length attachment bone: collapse it instead of dividing by 0.
          dummy.position.set(a[0], a[1], a[2]);
          dummy.quaternion.identity();
          dummy.scale.setScalar(1e-4);
        } else {
          dummy.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
          dirV.set(dx / len, dy / len, dz / len);
          dummy.quaternion.copy(_alignQuat.setFromUnitVectors(_UP, dirV));
          dummy.scale.set(boneR, len, boneR);
        }
        dummy.updateMatrix();
        bm.setMatrixAt(k, dummy.matrix);
      }
      bm.instanceMatrix.needsUpdate = true;
    }

    // Joint dots: spheres sitting on the bone ends.
    const jm = jointRef.current;
    if (jm) {
      for (let k = 0; k < jointCount; k++) {
        const p = op[jointIdx[k]];
        dummy.position.set(p[0], p[1], p[2]);
        dummy.quaternion.identity();
        dummy.scale.setScalar(jointR);
        dummy.updateMatrix();
        jm.setMatrixAt(k, dummy.matrix);
      }
      jm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Floor: sits exactly at the character's lowest point (the feet). */}
      <group position={[0, floorY, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[4.2, 48]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.55} />
        </mesh>
        <gridHelper args={[8, 16, '#475569', '#1e293b']} />
      </group>

      {/* Character: scaled + centered on origin. The self-orientation is applied
          once, in useFrame, where each bone point is rotated by orientQ before it
          lands in the instance matrices. Do NOT add a quaternion={orientQ} group
          here — that applied the orientation a SECOND time (orientQ^2 = 180° flip
          for the Z-up rigs), laying the figure on its back and misaligning the
          floor/centering. */}
      <group scale={scale}>
        <group position={[offset[0], offset[1], offset[2]]}>
          <instancedMesh ref={boneRef} args={[boneGeo, undefined, segCount]} frustumCulled={false}>
            <meshStandardMaterial roughness={0.4} metalness={0.1} emissive="#111827" emissiveIntensity={0.6} />
          </instancedMesh>
          <instancedMesh ref={jointRef} args={[jointGeo, undefined, jointCount]} frustumCulled={false}>
            <meshStandardMaterial roughness={0.35} metalness={0.15} emissive="#111827" emissiveIntensity={0.6} />
          </instancedMesh>
        </group>
      </group>
    </group>
  );
}
