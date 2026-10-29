// Types for scene.js (plain JS so it stays in step with the prototype it was ported from).
import type { AnimationClip, Group, Object3D } from 'three';

import type { SfxId } from '../audio/audio.ts';
import type { Tint } from '../ui/Model3D.tsx';

export interface Gltf { scene: Group; animations: AnimationClip[] }

export type ScenePhase =
  | 'menu' | 'intro' | 'aim' | 'runup' | 'kick' | 'flight' | 'resolved' | 'celebrate' | 'done'
  | 'pass-intro' | 'pass' | 'passing' | 'defend-intro' | 'defend' | 'tackle';

export type ShotGrade = 'perfect' | 'good' | 'over' | 'weak';
export type DefenseGrade = 'perfect' | 'timed' | 'early' | 'late';

export type SceneResult =
  | { kind: 'goal' | 'save' | 'post' | 'miss'; by: 'us' | 'mate' | 'them'; q: ShotGrade; central: boolean; perfect: boolean }
  | { kind: 'stopped'; by: 'us' }
  | { kind: 'lost'; by: 'us'; marked: boolean };

export interface SceneMoment {
  kind: 'shot' | 'freekick' | 'pass' | 'defense';
  attackSide?: 'left' | 'right';
  openSide?: 'left' | 'right';
  /** Defense only: what happens if the player never slides. */
  skip?: 'stopped' | 'conceded' | 'survived';
}

export interface MatchEnv {
  host: HTMLElement;
  G: {
    hero: Gltf; keeper: Gltf; rival: Gltf; ball: Gltf; mates: Gltf[];
    /** More of their players (lime-kit models the scene dresses in graphite). */
    opps?: Gltf[];
    /** the fan models (fan1-4.glb): the terraces and the fans by the fences */
    fans?: Gltf[];
    'anim-street-idle': Gltf; 'anim-kick': Gltf; 'anim-cheer': Gltf; 'anim-run': Gltf; 'anim-slide': Gltf; 'anim-leap': Gltf;
  };
  /** Recolours a model's kit: our colours when `tint` is left out. */
  tint(root: Object3D, tint?: Tint): void;
  /** Text on the advertising boards and our banner. */
  board: string;
  /** Our kit colour (#rrggbb), for the crowd and the banners. */
  kit?: string;
  /** Their name, for their banner. */
  away?: string;
  on: {
    phase(p: ScenePhase): void;
    /** The player touched the goal for the first time in this moment. */
    aimed(): void;
    /** The defense or pass ring, 0..1. */
    ring(p: number): void;
    grade(q: ShotGrade | DefenseGrade): void;
    result(r: SceneResult): void;
    /** A defense moment ran out without a slide. */
    skipped(): void;
    /** The moment has been acted out. */
    done(): void;
  };
  sfx(id: SfxId, gain?: number): void;
}

export interface MatchScene {
  start(m: SceneMoment): void;
  phase(): ScenePhase;
  /** The aim in engine units. */
  aim(): { aim: number; lift: number };
  setCharging(v: boolean): void;
  shoot(s: { power: number; outcome: 'goal' | 'saved' | 'wide' | 'over'; x: number; y: number; perfect: boolean; assisted: boolean }): void;
  /** Timing of the defense or pass ring right now, 0..1000. */
  timing(): number;
  tackle(side: 1 | -1, timing: number, outcome: 'stopped' | 'conceded' | 'survived'): void;
  passTo(side: 'left' | 'right', outcome: 'assist' | 'lost'): void;
  setPaused(p: boolean): void;
  /** Resolves once every shader is compiled and the scene is drawing. */
  ready: Promise<void>;
  /** Test hook: steps the game clock and draws once. */
  sim(sec: number): void;
  /** Test hook: what the last frame drew. */
  stats(): { calls: number; triangles: number; programs: number; textures: number; geometries: number };
  dispose(): void;
}

export function createMatch(env: MatchEnv): MatchScene;
