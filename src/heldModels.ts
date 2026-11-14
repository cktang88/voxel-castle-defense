// Imported (GLB) models for held weapons. The box-built model from gunModel() shows straight away and
// stays as the fallback; once the GLB has loaded (once per file, shared by every clone) it replaces
// the boxes inside the same group, so callers never wait.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface HeldModelSpec {
  /** file under public/models */
  file: string;
  /** longest side of the model, in the gun group's units (before gunModel's own 1.5 scale) */
  length: number;
  /** model position inside the gun group */
  offset: [number, number, number];
  /** yaw so the barrel points along +Z */
  yaw: number;
  /** pitch (about X, after the yaw) levelling a model generated slightly tilted */
  pitch?: number;
}

/** Tripo3D text-to-model, see docs/ASSET_PROVENANCE.md */
export const HELD_MODELS: Record<string, HeldModelSpec> = {
  pistol: { file: 'tripo-pistol.glb', length: 0.6, offset: [0, -0.02, 0.08], yaw: Math.PI },
  smg: { file: 'tripo-smg.glb', length: 1.0, offset: [0, -0.03, 0.08], yaw: 0, pitch: 0.22 },
  shotgun: { file: 'tripo-shotgun.glb', length: 1.3, offset: [0, 0, 0.07], yaw: 0 },
  rocket: { file: 'tripo-rocket.glb', length: 1.15, offset: [0, 0.02, 0.1], yaw: -Math.PI / 2 },
  grenade: { file: 'tripo-grenade.glb', length: 0.42, offset: [0, 0, 0.1], yaw: 0 },
  cutter: { file: 'tripo-cutter.glb', length: 0.8, offset: [0, -0.02, 0.16], yaw: 0 },
};

// The generated textures are dark metal that only reads with specular highlights and reflections (how
// Tripo's previews are lit). The world has no environment map, so held models get their own: a small
// studio room, prefiltered once on the first load.
let studio: THREE.Texture | null = null;
function studioEnv(): THREE.Texture | null {
  if (studio) return studio;
  const r = (window as unknown as { game?: { renderer?: THREE.WebGLRenderer } }).game?.renderer;
  if (!r) return null;
  const pm = new THREE.PMREMGenerator(r);
  studio = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return studio;
}

const cache = new Map<string, Promise<THREE.Object3D | null>>();

function load(spec: HeldModelSpec): Promise<THREE.Object3D | null> {
  let p = cache.get(spec.file);
  if (!p) {
    p = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${spec.file}`).then((gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const k = spec.length / Math.max(size.x, size.y, size.z);
      // satin metal under the studio environment, so edges and flats catch highlights like the previews.
      // No ink outline (unlike the box models): an inverted hull pokes through these models' thin panels.
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.MeshStandardMaterial;
        m.material = new THREE.MeshStandardMaterial({ map: src.map, metalness: 0.4, roughness: 0.5, envMap: studioEnv(), envMapIntensity: 0.6 });
        m.castShadow = true;
      });
      const pivot = new THREE.Group();
      root.position.copy(c).multiplyScalar(-1);
      pivot.add(root);
      pivot.scale.setScalar(k);
      pivot.rotation.set(spec.pitch ?? 0, spec.yaw, 0, 'XYZ');
      pivot.position.set(...spec.offset);
      pivot.name = 'imported';
      return pivot;
    }).catch((e) => { console.warn(`held model ${spec.file} failed to load, keeping the box model`, e); return null; });
    cache.set(spec.file, p);
  }
  return p;
}

/** Swap the box parts of `group` for the imported model of `kind` once it has loaded (no-op without one). */
export function attachHeldModel(group: THREE.Group, kind: string): void {
  const spec = HELD_MODELS[kind];
  if (!spec || typeof window === 'undefined') return;
  void load(spec).then((model) => {
    if (!model) return;
    for (const c of group.children) c.visible = false;
    group.add(model.clone());
  });
}
