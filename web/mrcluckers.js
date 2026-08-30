/* Mr. Cluckers for three.js.
 *
 * Wraps the GLB in a small character API: an orthographic side-on rig that
 * matches the baked sprites, cross-faded animation states, and a turn that
 * pivots him rather than snapping.
 *
 *   import { Cluckers, SIDE_VIEW } from './mrcluckers.js';
 *   const bird = await Cluckers.load('../assets/model/mrcluckers.glb');
 *   scene.add(bird.root);
 *   bird.play('walk');
 *   // in your loop:
 *   bird.update(dt);
 *
 * The model is one unit tall with its feet on y = 0, so world units and the
 * sprite metadata's `characterHeightPx` describe the same character.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Yaw that puts him side-on facing screen-right, matching the sprite sheet. */
export const SIDE_VIEW = Math.PI / 2;

/** Clips that play once and then hold their last frame. */
const ONE_SHOT = new Set(['jump', 'land', 'crouch', 'peck', 'crow', 'hurt',
                          'squeak']);

/** Default blend time per state. Impacts snap; ambient states ease. */
const FADE = {
  jump: 0.04, land: 0.05, hurt: 0.04, peck: 0.06, squeak: 0.05,
  crouch: 0.07, fall: 0.10, run: 0.12, walk: 0.12, idle: 0.20, tumble: 0.08
};

export class Cluckers {
  constructor(gltf) {
    this.gltf = gltf;

    // An outer group carries world position; the inner one carries facing,
    // so turning never fights the character controller's translation.
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = SIDE_VIEW;
    this.pivot.add(gltf.scene);
    this.root.add(this.pivot);

    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this.actions = {};
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip);
      if (ONE_SHOT.has(clip.name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[clip.name] = action;
    }

    this.current = null;
    this.facing = 1;
    this._targetYaw = SIDE_VIEW;
    this.turnSpeed = 14;          // radians per second
    this.onFinished = null;

    this.mixer.addEventListener('finished', (e) => {
      const name = e.action.getClip().name;
      if (this.onFinished) this.onFinished(name);
    });

    this.play('idle', { fade: 0 });
  }

  static async load(url, { loader } = {}) {
    const gltf = await (loader || new GLTFLoader()).loadAsync(url);
    return new Cluckers(gltf);
  }

  /** Parse an already-fetched GLB (ArrayBuffer). Useful when the file is inlined. */
  static parse(buffer, { loader } = {}) {
    return new Promise((resolve, reject) => {
      (loader || new GLTFLoader()).parse(buffer, '',
        (gltf) => resolve(new Cluckers(gltf)), reject);
    });
  }

  get clipNames() {
    return Object.keys(this.actions);
  }

  /** Cross-fade to a state. Re-requesting the current state is a no-op. */
  play(name, { fade = null, restart = false } = {}) {
    const next = this.actions[name];
    if (!next) throw new Error(`unknown clip: ${name}`);
    if (this.current === next && !restart) return this;

    const blend = fade === null ? (FADE[name] ?? 0.12) : fade;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();

    if (this.current && blend > 0) {
      this.current.crossFadeTo(next, blend, false);
    } else if (this.current) {
      this.current.stop();
    }
    this.current = next;
    return this;
  }

  /** 1 faces screen-right, -1 screen-left. He turns rather than flipping. */
  setFacing(dir) {
    if (dir === 0 || dir === this.facing) return;
    this.facing = dir;
    this._targetYaw = dir > 0 ? SIDE_VIEW : -SIDE_VIEW;
  }

  update(dt) {
    this.mixer.update(dt);
    const yaw = this.pivot.rotation.y;
    const delta = this._targetYaw - yaw;
    if (Math.abs(delta) > 1e-4) {
      const step = Math.sign(delta) * Math.min(Math.abs(delta),
                                               this.turnSpeed * dt);
      this.pivot.rotation.y = yaw + step;
    }
  }

  /** Free GPU resources when the character is discarded. */
  dispose() {
    this.mixer.stopAllAction();
    this.gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of ['map', 'normalMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    });
  }
}

/**
 * Orthographic camera framed in world units, so the character keeps a fixed
 * on-screen size regardless of canvas size -- the 3D equivalent of the
 * sprite sheet's fixed cell.
 */
export function sideCamera(aspect, viewHeight = 4.5) {
  const h = viewHeight / 2;
  const w = h * aspect;
  const cam = new THREE.OrthographicCamera(-w, w, h, -h, -50, 50);
  cam.position.set(0, 0, 10);
  return cam;
}

export function resizeSideCamera(cam, aspect, viewHeight = 4.5) {
  const h = viewHeight / 2;
  cam.top = h;
  cam.bottom = -h;
  cam.left = -h * aspect;
  cam.right = h * aspect;
  cam.updateProjectionMatrix();
}

/**
 * Lighting picked to flatter a grey plush toy: a broad sky/ground bounce so
 * the fur never goes black, one warm key, and a cool back light that catches
 * the fuzzy silhouette.
 */
export function plushLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xdfe7ee, 0x6b6257, 2.0);
  const key = new THREE.DirectionalLight(0xfff6e8, 2.2);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0xbfd4e8, 1.1);
  rim.position.set(-3, 2, -4);
  scene.add(hemi, key, rim);
  return { hemi, key, rim };
}
