// Vendored from the 3D match prototype (artifact MNaf1ynwKFD8nP1UrC9aon, v6, keeper.js).
// Keep it in step with the prototype: animation fixes land there first.
// Goalkeeper: Meshy rig (kaleci-v2) + procedural dives. The ready stance and the high catch
// come from Meshy clips; side dives are posed per frame on top of the stance: the body rolls
// around the hips along a jump arc, both arms reach the ball by IK, the lead knee tucks,
// the push leg trails, and the head tracks the ball. He does not stay down: after a moment on
// the turf he gets up (the get-up of a Meshy clip, taken over from the landed pose) and goes
// back to his stance, with the ball in his arms when he held it.
import * as THREE from 'three';
import { rigInfo, subclip, mirror, rotateWorld, PoseGuard, PoseBlend, makeLimb, limbIK, reachIK, GroundClamp, FootLock } from './rig.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, t) => { const u = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const easeOut = (u) => 1 - Math.pow(1 - THREE.MathUtils.clamp(u, 0, 1), 3);
// closest distance between segments p1q1 and p2q2
function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let sc = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0, tc = (b * sc + f) / e;
  if (tc < 0) { tc = 0; sc = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (tc > 1) { tc = 1; sc = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  return p1.clone().addScaledVector(d1, sc).distanceTo(p2.clone().addScaledVector(d2, tc));
}
const CHEST_CLEAR = 0.17;   // forearm axis to spine axis: chest half-depth + forearm radius
const HEAD_CLEAR = 0.15;    // forearm axis to the neck-crown axis

export class Keeper {
  /**
   * model: rigged keeper scene; leap: the Leap_Right_and_Catch clip on the same rig; getup: a
   * clip on the same rig that starts lying on the left side and ends standing (optional).
   */
  constructor(model, leap, getup = null) {
    this.root = new THREE.Group();            // placed in the world; faces −Z of the world
    this.model = model;
    // rest data in model space: measure before the model is parented and turned
    this.rig = rigInfo(this.model);
    this.b = this.rig.bones;
    this.blend = new PoseBlend(this.rig);
    const getupR = getup && mirror(getup, this.rig, 'getupR');   // sampled on the bare model, before it is turned
    this.root.add(this.model);
    this.root.rotation.y = Math.PI;
    // elbows flex forward, knees backward; IK keeps each joint on that hinge
    const fwd = V(0, 0, 1), back = V(0, 0, -1);
    this.limb = {
      LeftArm: makeLimb(this.rig, 'LeftArm', 'LeftForeArm', 'LeftHand', fwd),
      RightArm: makeLimb(this.rig, 'RightArm', 'RightForeArm', 'RightHand', fwd),
      LeftLeg: makeLimb(this.rig, 'LeftUpLeg', 'LeftLeg', 'LeftFoot', back),
      RightLeg: makeLimb(this.rig, 'RightUpLeg', 'RightLeg', 'RightFoot', back),
    };
    this.mixer = new THREE.AnimationMixer(this.model);
    this.guard = new PoseGuard(this.model);   // dives pose on top of the clip every frame
    this.ground = new GroundClamp(this.model); // landing never sinks him into the turf
    this.feet = new FootLock(this.rig);        // the stance sways on planted boots
    const RP = this.rig.pos;
    this.legLen = RP.LeftUpLeg.distanceTo(RP.LeftLeg) + RP.LeftLeg.distanceTo(RP.LeftFoot);
    this.A = {
      ready: this.mixer.clipAction(subclip(leap, 0.0, 0.25, 'ready')),
      leap: this.mixer.clipAction(leap),
    };
    this.A.ready.setLoop(THREE.LoopPingPong, Infinity); this.A.ready.timeScale = 0.35;
    this.A.leap.setLoop(THREE.LoopOnce, 1); this.A.leap.clampWhenFinished = true;
    if (getup) for (const [k, c] of [['getupL', getup], ['getupR', getupR]]) { this.A[k] = this.mixer.clipAction(c); this.A[k].setLoop(THREE.LoopOnce, 1); this.A[k].clampWhenFinished = true; }
    this.A.ready.play();
    this.mode = 'ready';      // ready | dive | leap | rise (getting up) | up (back on his feet)
    this.t = 0; this.sway = 0;
    this.d = null;
    // hips → wrist with the arms straight over the head, measured on this rig
    const P = (n) => this.b[n].getWorldPosition(V());
    // face direction in the head bone's frame (the rig is bound facing +Z)
    this.faceLocal = V(0, 0, 1).applyQuaternion(this.rig.world.Head.clone().invert());
    this.armLen = P('LeftArm').distanceTo(P('LeftForeArm')) + P('LeftForeArm').distanceTo(P('LeftHand'));
    this.reach = P('Hips').distanceTo(P('LeftArm')) + this.armLen + 0.04;
    this.headEnd = this.model.getObjectByName('head_end') || this.b.Head;
  }

  /** Stand at (x, z) facing the world point `face`. */
  reset(x, z, face) {
    // already standing: keep the stance going (a reset would snap it); after a save, start over
    if (this.mode !== 'ready' || !this.A.ready.isRunning()) { this.mixer.stopAllAction(); this.A.ready.reset().play(); }
    this.mode = 'ready'; this.d = null; this.rise = null; this.t = 0; this.hopT = -1; this.lookW = 0; this.lookP = null;
    for (const k in this.limb) this.limb[k].lastP = null;
    this.feet.reset(); this.lastFeet = null;
    this.model.position.set(0, 0, 0); this.model.quaternion.identity();
    this.root.position.set(x, 0, z); this.baseX = x;
    this.root.rotation.set(0, face ? Math.atan2(face.x - x, face.z - z) : Math.PI, 0);
  }

  /** Split step as the shooter strikes. */
  hop() { this.hopT = 0; }

  /** World point → keeper space (x = keeper's left, y up, z toward the shooter). */
  toK(p) { return this.root.worldToLocal(p.clone()); }
  toW(p) { return this.root.localToWorld(p.clone()); }

  /**
   * Plan a save attempt at world point `target`, reached `tc` seconds after start.
   * kind: 'dive' (side) | 'leap' (high central catch) — chosen from the target.
   * opts.catch: he holds the ball; opts.beaten: it is a goal (he stays down a little longer).
   */
  start(target, tc, opts = {}) {
    this.root.updateMatrixWorld(true);
    for (const k in this.limb) this.limb[k].lastP = null;
    const B = this.toK(target);
    const hips0 = this.toK(this.b.Hips.getWorldPosition(V()));
    const dx = B.x - hips0.x;
    if (Math.abs(dx) < 0.55 && B.y > 1.35 && !opts.forceDive) {
      this.mode = 'leap'; this.t = 0;
      this.A.leap.reset().play(); this.A.ready.crossFadeTo(this.A.leap, 0.12, false);
      this.A.leap.time = 0.25; this.A.leap.timeScale = 1.25;
      this.d = { B, catch: opts.catch, tc };
      return;
    }
    const s = Math.sign(dx) || 1;
    // body angle and hips at full stretch so the hands reach the ball
    let th = Math.atan2(Math.abs(dx), Math.max(0.05, B.y - 0.85));
    th = THREE.MathUtils.clamp(th, 0, 1.5);
    const REACH = this.reach;
    let hs = V(B.x - s * Math.sin(th) * REACH, B.y - Math.cos(th) * REACH, Math.min(0.45, B.z * 0.6 + 0.2));
    if (hs.y < 0.24) { hs.y = 0.24; th = Math.atan2(Math.abs(B.x - hs.x), Math.max(0.02, B.y - hs.y)); }
    if (hs.y > 1.4) hs.y = 1.4;
    const near = Math.abs(dx) < 0.7 && B.y < 1.25;            // crouch/smother, no real dive
    tc = THREE.MathUtils.clamp(tc, 0.26, 0.62);
    this.d = { s, B, th: near ? Math.min(th, 0.35) : th, hs, h0: hips0, tc, near, catch: opts.catch, beaten: opts.beaten, hit: false, fallFrom: null };
    this.mode = 'dive'; this.t = 0; this.rise = null;
  }

  update(dt, time, ballWorld) {
    this.t += dt;
    if (this.mode === 'ready') {
      // small weight shifts while the shooter lines up
      this.root.position.x = this.baseX + Math.sin(time * 1.3) * 0.12 + Math.sin(time * 0.45) * 0.06;
      this.guard.restore(); this.mixer.update(dt); this.guard.capture();
      this.model.position.y = -0.015 + Math.sin(time * 2.6) * 0.008;
      if (this.hopT >= 0) { this.hopT += dt; const u = this.hopT / 0.28; this.model.position.y += u < 1 ? Math.sin(Math.PI * u) * 0.07 : 0; if (u >= 1) this.hopT = -1; }
      this.model.updateMatrixWorld(true); this.stance(1); this.feet.apply(dt);
      this.lastFeet = { Left: this.b.LeftFoot.getWorldPosition(V()), Right: this.b.RightFoot.getWorldPosition(V()) }; // where the boots are drawn
      this.ground.apply();
      return;
    }
    this.guard.restore(); this.mixer.update(dt); this.guard.capture();
    if (this.mode === 'rise' || this.mode === 'up') { this.getUp(dt, ballWorld); this.ground.apply(); return; }
    if (this.mode === 'leap') {
      this.root.updateMatrixWorld(true);
      // drift toward the ball and pull the hands onto it at the top of the jump
      const d = this.d; const u = smooth(0, d.tc, this.t);
      this.stance(1 - smooth(0, 0.2, this.t));
      this.model.position.x = THREE.MathUtils.lerp(0, d.B.x * 0.9, easeOut(u)); this.model.position.y = 0;
      this.model.updateMatrixWorld(true);
      const w = smooth(0.1, d.tc, this.t) * (1 - smooth(d.tc + 0.35, d.tc + 0.8, this.t));
      if (w > 0) this.armsTo(this.toW(d.B), 0.1, w, this.W(V(0, 1, 0)), this.W(V(0, 0, 1)));
      this.lookTo(ballWorld, ballWorld ? 0.6 : 0, dt);
      this.ground.apply();
      return;
    }
    const tLand = this.pose(dt, ballWorld);
    this.ground.apply();
    // down for a moment (longer when he is beaten, long enough to gather a ball he holds), then up
    if (this.t > tLand + (this.d.near ? 0.3 : this.d.catch ? 0.4 : this.d.beaten ? 0.45 : 0.2)) this.startRise();
  }

  /**
   * The set position, on top of the clip's standing pose (which hangs the arms straight down):
   * he sits into his knees with the boots where they are, leans in, and carries his hands in
   * front of him, elbows bent, ready to go either way. Weight w.
   */
  stance(w) {
    if (w <= 0) return;
    const b = this.b, up = V(0, 1, 0), fwd = this.W(V(0, 0, 1)), side = this.W(V(1, 0, 0));
    const legs = ['Left', 'Right'].map((s) => ({ U: b[s + 'UpLeg'], L: b[s + 'Leg'], E: b[s + 'Foot'], at: b[s + 'Foot'].getWorldPosition(V()), q: b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion()) }));
    const hips = b.Hips.getWorldPosition(V()); hips.y -= 0.05 * w; hips.addScaledVector(fwd, -0.02 * w);
    b.Hips.position.copy(b.Hips.parent.worldToLocal(hips)); b.Hips.updateMatrixWorld(true);
    for (const l of legs) {
      reachIK(l.U, l.L, l.E, l.at);
      l.E.quaternion.copy(l.E.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(l.q)); l.E.updateMatrixWorld(true);
    }
    rotateWorld(b.Spine02, side, 0.07 * w); rotateWorld(b.neck, side, -0.05 * w);
    for (const [s, sg] of [['Left', 1], ['Right', -1]]) {
      const sh = b[s + 'Arm'].getWorldPosition(V());
      const hand = sh.clone().addScaledVector(side, sg * 0.2).addScaledVector(fwd, 0.27).addScaledVector(up, -0.24);
      const pole = sh.clone().addScaledVector(side, sg * 0.6).addScaledVector(up, -0.5).addScaledVector(fwd, -0.1);
      limbIK(this.limb[s + 'Arm'], hand, pole, w, fwd);
    }
  }

  // ------------------------------------------------------------- getting up
  /** Model-space point of a bone (the model itself may be turned and moved). */
  inModel(bone) { return this.model.worldToLocal(bone.getWorldPosition(V())); }

  startRise() {
    const d = this.d, K = (n) => this.toK(this.b[n].getWorldPosition(V()));
    const from = this.blend.capture();
    const hips = K('Hips'), axis = K('neck').sub(hips);            // where he lies and which way his head points
    // from a dive: the get-up clip of that side; from a crouch or a near save he is on his feet already
    const act = d.near || !this.A.getupL ? this.A.ready : this.A[d.s > 0 ? 'getupL' : 'getupR'];
    const clip = act !== this.A.ready;
    this.mixer.stopAllAction(); act.reset().play(); act.timeScale = clip ? 0.92 : this.A.ready.timeScale;
    this.guard.restore(); this.mixer.update(0); this.guard.capture();
    this.model.position.set(0, 0, 0); this.model.quaternion.identity(); this.model.updateMatrixWorld(true);
    const h0 = this.inModel(this.b.Hips).setY(0), a0 = this.inModel(this.b.neck).sub(this.inModel(this.b.Hips));
    // turn the clip so that it starts lying the way he lies; the turn is taken out again as he gets up
    const yaw0 = clip ? Math.atan2(axis.x, axis.z) - Math.atan2(a0.x, a0.z) : 0;
    this.rise = { t: 0, from, act, clip, h0, yaw0, pivot: hips.setY(0), dur: clip ? act.getClip().duration / act.timeScale : 0.5, fade: clip ? 0.32 : 0.5, handT: -1, hE: null };
    this.mode = 'rise';
    this.getUp(0, null);
  }

  getUp(dt, ballWorld) {
    const r = this.rise; r.t += dt;
    // the last steps of the clip hand over to the stance; the stance stands on the model's own
    // spot, so the model moves under him while they cross (he stays where he got up)
    if (r.clip && r.handT < 0 && r.t >= r.dur - 0.3) { r.handT = r.t; r.hE = this.b.Hips.position.clone(); this.A.ready.reset().play(); r.act.crossFadeTo(this.A.ready, 0.35, false); }
    const yaw = r.yaw0 * (1 - smooth(r.dur * 0.2, r.dur * 0.75, r.t));
    this.model.quaternion.setFromAxisAngle(V(0, 1, 0), yaw);
    this.model.position.set(0, 0, 0); this.model.updateMatrixWorld(true);
    const off = r.h0.clone();
    if (r.handT >= 0) {
      const u = smooth(r.handT, r.handT + 0.35, r.t), hip = this.b.Hips, keep = hip.position.clone();
      // model-space hips of the clip's end minus those of the stance, taken on as the stance takes over
      hip.position.copy(r.hE); hip.updateMatrixWorld(true); const e = this.inModel(hip);
      hip.position.copy(this.rig.hipsRest); hip.updateMatrixWorld(true); const s = this.inModel(hip);
      hip.position.copy(keep); hip.updateMatrixWorld(true);
      off.addScaledVector(s.sub(e).setY(0), u);
    }
    this.model.position.copy(r.pivot).sub(off.applyQuaternion(this.model.quaternion)).setY(0);
    this.model.updateMatrixWorld(true);
    // back in the stance as the clip hands over (a crouch goes straight back to it)
    if (!this.d.catch) this.stance(r.clip ? (r.handT >= 0 ? smooth(r.handT, r.handT + 0.35, r.t) : 0) : 1);
    this.blend.apply(r.from, smooth(0, r.fade, r.t));
    if (this.d.catch) this.hug();
    this.lookTo(ballWorld, 0, dt);
    if (this.mode === 'rise' && r.t >= r.dur + 0.1) this.mode = 'up';
  }

  /** Both arms round a ball held in front of the chest, whatever the body is doing. */
  hug() {
    const hips = this.b.Hips.getWorldPosition(V()), up = this.b.neck.getWorldPosition(V()).sub(hips).normalize();
    const side = this.b.LeftArm.getWorldPosition(V()).sub(this.b.RightArm.getWorldPosition(V())).normalize();
    const fwd = side.clone().cross(up).normalize();
    const at = this.b.Spine.getWorldPosition(V()).addScaledVector(up, 0.04).addScaledVector(fwd, 0.3);
    this.armsTo(at, 0.11, 1, up, fwd);
  }

  // ------------------------------------------------------------- side dive
  pose(dt, ballWorld) {
    const d = this.d, t = this.t, s = d.s;
    this.stance(1 - smooth(0, 0.2, t));                              // out of the set position
    const tc = d.tc, tLand = tc + (d.near ? 0.25 : 0.32 + d.hs.y * 0.18);
    // roll angle around the forward axis
    let th;
    const even = (u) => THREE.MathUtils.lerp(u, easeOut(u), 0.3);    // a full ease-out is level long before the ball: it hangs in the air
    if (t < tc) th = THREE.MathUtils.lerp(0, d.th, even(smooth(0.05, tc, t)) ** 1.2);
    else th = THREE.MathUtils.lerp(d.th, d.near ? d.th : Math.max(d.th, 1.42), smooth(tc, tLand, t));
    // hips path: dip to load, jump arc to the stretch point, fall to the ground
    const H = V();
    const load = smooth(0, 0.09, t) * (1 - smooth(0.09, 0.2, t));
    if (t < tc) {
      const u = smooth(0.06, tc, t), e = even(u);
      H.x = THREE.MathUtils.lerp(d.h0.x, d.hs.x, e);
      H.z = THREE.MathUtils.lerp(d.h0.z, d.hs.z, e);
      const apex = d.near ? 0 : 0.12 + 0.1 * Math.sin(d.th);
      H.y = THREE.MathUtils.lerp(d.h0.y, d.hs.y, e) + Math.sin(Math.PI * u) * apex - load * 0.12;
    } else {
      const u = smooth(tc, tLand, t);
      const g = u * u;                                   // falls faster and faster
      const yL = d.near ? Math.max(0.42, d.hs.y - 0.1) : 0.2;
      H.x = d.hs.x + s * 0.22 * u; H.z = d.hs.z + 0.05 * u;
      H.y = THREE.MathUtils.lerp(d.hs.y, yL, g);
      if (t > tLand) H.y = yL + Math.max(0, Math.sin((t - tLand) * 10) * 0.05 * Math.exp(-(t - tLand) * 6)); // small bounce
    }
    // place the model so the hips sit on H with the body rolled by th toward s
    const R = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -s * th);
    this.model.quaternion.copy(R); this.model.position.set(0, 0, 0);
    this.model.updateMatrixWorld(true);
    const hipsNow = this.root.worldToLocal(this.b.Hips.getWorldPosition(V()));
    this.model.position.copy(H).sub(hipsNow);
    this.model.updateMatrixWorld(true);

    // body frame in keeper space
    const U = V(s * Math.sin(th), Math.cos(th), 0);          // body up
    const Dn = V(s * Math.cos(th), -Math.sin(th), 0);         // toward the ground side as he lies
    const F = V(0, 0, 1);
    const W = (v) => v.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const P = (v) => this.toW(v);

    // spine bends toward the ball, head watches it
    const wD = smooth(0.0, 0.14, t);
    rotateWorld(this.b.Spine01, W(F), -s * 0.12 * wD);
    rotateWorld(this.b.Spine, W(F), -s * 0.08 * wD);

    // arms: from the stance to the ball; after the save they come back to the chest
    const reachW = smooth(0.04, tc * 0.9, t);
    const chest = this.toK(this.b.Spine.getWorldPosition(V()));
    let target = d.B.clone();
    let rest = null;
    if (t > tc) { // caught: the ball comes in to the chest; missed: the arms come to rest as he lands
      const pull = smooth(tc + 0.08, tLand + 0.1, t);
      if (d.catch) target.lerp(chest.clone().addScaledVector(U, 0.04).addScaledVector(F, 0.3), pull);
      else rest = { w: pull, lead: s > 0 ? 'Left' : 'Right', lie: smooth(0.5, 1.1, th) };
    }
    this.armsTo(P(target), 0.11, reachW, W(U), W(F), 0.16 * (1 - smooth(tc, tc + 0.15, t)), W(Dn), rest);

    // legs: the dive-side foot steps out and pushes off, the far knee drives up; a boot on
    // the turf stays where it was put (a near save steps again rather than sliding)
    const lead = s > 0 ? 'Left' : 'Right', far = s > 0 ? 'Right' : 'Left';
    const wl = 1;                                                    // targets start on the drawn boots
    const hipL = this.toK(this.b[lead + 'UpLeg'].getWorldPosition(V()));
    const hipF = this.toK(this.b[far + 'UpLeg'].getWorldPosition(V()));
    const air = d.near ? 0 : 1 - smooth(tc, tLand, t);              // boots off the turf in flight
    const flyL = hipL.clone().addScaledVector(U, -0.86).addScaledVector(Dn, 0.06).addScaledVector(F, -0.04);
    const flyF = hipF.clone().addScaledVector(U, -0.5).addScaledVector(F, 0.3).addScaledVector(Dn, 0.1);
    if (t > tc) flyF.lerp(hipF.clone().addScaledVector(U, -0.72).addScaledVector(F, 0.34).addScaledVector(Dn, 0.12), smooth(tc, tLand + 0.2, t));
    if (!d.feet) {
      // start from where the boots were drawn last frame (the stance pins them)
      const at = (side) => this.toK(this.lastFeet ? this.lastFeet[side] : this.b[side + 'Foot'].getWorldPosition(V()));
      const L0 = at(lead), F0 = at(far);
      d.feet = {
        L: { at: L0, from: L0.clone(), to: V(d.h0.x + s * 0.32, L0.y, d.h0.z + 0.08), t0: 0, dur: 0.1, rel: -1, y0: L0.y },
        F: { at: F0, from: null, to: null, t0: 0, dur: 0, rel: d.near ? -1 : 0.14, y0: F0.y },
      };
    }
    // a released boot travels to its flying spot on an arc round the hip (a straight line
    // would pass under the hip joint and whip the leg round)
    const arc = (hip, a, b, k) => {
      const da = a.clone().sub(hip), db = b.clone().sub(hip), la = da.length(), lb = db.length();
      if (la < 1e-4 || lb < 1e-4) return a.clone().lerp(b, k);
      const q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(da.clone().normalize(), db.clone().normalize()), k);
      return hip.clone().addScaledVector(da.normalize().applyQuaternion(q), THREE.MathUtils.lerp(la, lb, k));
    };
    const foot = (st, fly, hip, pushEnd, stand) => {
      if (st.to) { // stepping: lift, carry, put down
        const u = smooth(st.t0, st.t0 + st.dur, t);
        st.at = st.from.clone().lerp(st.to, u); st.at.y = st.y0 + Math.sin(Math.PI * u) * 0.08;
        if (u >= 1) { st.at.copy(st.to); st.to = null; }
      } else if (st.rel < 0 && hip.distanceTo(st.at) > this.legLen * 1.02) {
        if (d.near) { st.from = st.at.clone(); st.to = V(stand.x, st.y0, stand.z); st.t0 = t; st.dur = 0.16; } // step under the body
        else st.rel = t;
      }
      if (st.rel < 0 && !d.near && pushEnd && t > pushEnd) st.rel = t;
      if (st.rel < 0) return st.at.clone();
      const out = arc(hip, st.at, fly, smooth(st.rel, st.rel + 0.2, t));
      out.y = Math.max(out.y, 0.07 + 0.2 * air * smooth(st.rel, st.rel + 0.15, t));
      return out;
    };
    // a near save re-steps a boot under its own hip, a little wide, so the legs never cross
    const standL = hipL.clone().addScaledVector(U, -0.85).addScaledVector(Dn, 0.15), standF = hipF.clone().addScaledVector(U, -0.85).addScaledVector(Dn, -0.12);
    const footL = foot(d.feet.L, flyL, hipL, 0.2, standL), footF = foot(d.feet.F, flyF, hipF, 0, standF);
    footL.y = Math.max(0.07, footL.y); footF.y = Math.max(0.07, footF.y);
    const kneePole = (hip) => P(hip.clone().addScaledVector(F, 0.9).addScaledVector(U, -0.3));
    limbIK(this.limb[lead + 'Leg'], P(footL), kneePole(hipL), wl);
    limbIK(this.limb[far + 'Leg'], P(footF), kneePole(hipF), wl);

    this.lookTo(ballWorld, t < tLand ? 0.75 * wD : 0, dt);
    return tLand;
  }

  /** Keeper-space direction → world direction. */
  W(v) { return v.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())); }

  /**
   * Both hands to a ball at world point `p` (spread by `gap`), weight w. `up` and `fwd` are
   * the body's up (toward the head) and facing in world space. Elbows point out and down
   * the body, never back, so raised arms stay in front of the head.
   * `rest` ({ w, lead, lie }) blends each hand to where it comes to rest after a dive that did
   * not hold the ball: lying on his side (lie 1) the ground-side arm stays long on the turf
   * past the head and the top hand comes down on the turf in front of the chest; on his feet
   * or knees (lie 0) both arms drop in front of the thighs.
   */
  armsTo(p, gap, w, up, fwd, extend = 0, spreadDown, rest = null) {
    if (w <= 0) return;
    const sideW = this.b.LeftArm.getWorldPosition(V()).sub(this.b.RightArm.getWorldPosition(V())).normalize();
    const down = spreadDown || up.clone().negate();
    const hips = this.b.Hips.getWorldPosition(V()), neck = this.b.neck.getWorldPosition(V()), head = this.headEnd.getWorldPosition(V());
    for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
      const sh = this.b[side + 'Arm'].getWorldPosition(V());
      const tgt = p.clone().addScaledVector(sideW, sg * gap * 0.8).addScaledVector(down, gap * 0.4);
      tgt.addScaledVector(sh.clone().sub(tgt).normalize(), 0.07 - extend);
      // at rest each hand has its own place (both hands on one point past the head hooked
      // the arms into a ring round it)
      if (rest && rest.w > 0) {
        const dir = (u, f, dn, sd) => up.clone().multiplyScalar(u).addScaledVector(fwd, f).addScaledVector(down, dn).addScaledVector(sideW, sg * sd).normalize();
        let lying;
        if (side === rest.lead) { lying = sh.clone().addScaledVector(dir(0.9, 0.35, 0, 0), this.armLen * 0.95); lying.y = 0.06; }
        else { lying = sh.clone().addScaledVector(fwd, 0.38).addScaledVector(up, 0.08); lying.y = 0.07; }
        const standing = sh.clone().addScaledVector(dir(-0.8, 0.45, 0, 0.12), this.armLen * 0.9);
        tgt.lerp(standing.lerp(lying, rest.lie), rest.w);
      }
      tgt.y = Math.max(0.06, tgt.y);
      // never let the hands go behind the shoulders' plane
      const ahead = tgt.clone().sub(sh).dot(fwd);
      if (ahead < 0.12) tgt.addScaledVector(fwd, 0.12 - ahead);
      // overhead reach: the collarbone shrugs and takes part of the raise, so the upper arm
      // alone does not wring the shoulder skin
      const clav = this.b[side + 'Shoulder'];
      if (clav) {
        const dir = tgt.clone().sub(sh).normalize();
        const lift = THREE.MathUtils.clamp((dir.angleTo(up.clone().negate()) - 1.4) * 0.45, 0, 0.5) * Math.min(1, w * 2);
        const axis = sh.clone().sub(clav.getWorldPosition(V())).normalize().cross(dir);
        if (lift > 0 && axis.lengthSq() > 1e-4) { rotateWorld(clav, axis.normalize(), lift); sh.copy(this.b[side + 'Arm'].getWorldPosition(V())); }
      }
      const pole = sh.clone().addScaledVector(sideW, sg * 0.55).addScaledVector(up, -0.4).addScaledVector(fwd, 0.12);
      // the top arm of a keeper on his side folds forward onto the turf (an elbow that points at the sky reads as a raised arm)
      // the arm he lies on bends a little forward on the turf (an elbow dug into the ground lifts the hand)
      if (rest && rest.w > 0 && side === rest.lead) pole.lerp(sh.clone().addScaledVector(fwd, 0.6).addScaledVector(up, 0.25), rest.w * rest.lie);
      if (rest && rest.w > 0 && side !== rest.lead) pole.lerp(sh.clone().addScaledVector(fwd, 0.7).addScaledVector(up, -0.25).addScaledVector(sideW, sg * 0.08), rest.w * rest.lie);
      const limb = this.limb[side + 'Arm'];
      const q0 = limb.U.quaternion.clone(), q1 = limb.L.quaternion.clone(), p0 = limb.lastP && limb.lastP.clone(), d0 = limb.lastDir && limb.lastDir.clone();
      limbIK(limb, tgt, pole, w, fwd);
      // a reach across the body must pass in front of the chest and face, not through them
      for (let k = 0; k < 3; k++) {
        const el = limb.L.getWorldPosition(V()), ha = limb.E.getWorldPosition(V());
        const short = Math.max(CHEST_CLEAR - segDist(el, ha, hips, neck), HEAD_CLEAR - segDist(el, ha, neck, head));
        if (short <= 0) break;
        limb.U.quaternion.copy(q0); limb.L.quaternion.copy(q1); limb.lastP = p0 && p0.clone(); limb.lastDir = d0 && d0.clone(); limb.U.updateMatrixWorld(true);
        const push = (short + 0.02) / Math.max(w, 0.3);
        tgt.addScaledVector(fwd, push); pole.addScaledVector(fwd, push);
        limbIK(limb, tgt, pole, w, fwd);
      }
    }
  }

  /** Head tracking with a weight that eases in and out (never snaps when the ball goes away). */
  lookTo(p, want, dt) {
    if (p) this.lookP = (this.lookP || p.clone()).copy(p);
    this.lookW = (this.lookW || 0) + (want - (this.lookW || 0)) * (1 - Math.exp(-7 * dt));
    if (this.lookP && this.lookW > 0.01) this.look(this.lookP, this.lookW);
  }

  /** Turn the head toward world point p (at most ~70°), weight w. */
  look(p, w) {
    if (w <= 0) return;
    const h = this.b.Head;
    const hq = h.getWorldQuaternion(new THREE.Quaternion());
    const face = this.faceLocal.clone().applyQuaternion(hq);
    const want = p.clone().sub(h.getWorldPosition(V())).normalize();
    const ang = face.angleTo(want);
    // a ball behind the head is let go gradually (turning toward it is ill-defined and flips)
    w *= THREE.MathUtils.clamp((2.5 - ang) / 0.8, 0, 1); if (w <= 0) return;
    const rot = new THREE.Quaternion().setFromUnitVectors(face, want);
    const k = w * Math.min(1, 1.2 / Math.max(ang, 1e-3));
    rot.slerp(new THREE.Quaternion(), 1 - Math.min(1, k));
    const pq = h.parent.getWorldQuaternion(new THREE.Quaternion());
    h.quaternion.copy(pq.invert().multiply(rot.multiply(hq)));
    h.updateMatrixWorld(true);
  }

  /**
   * Keep a free ball out of the keeper's body: a beaten keeper lands near the net and the ball
   * must roll round him, never through. Moves `p` (world, ball radius r) out of the nearest
   * capsule and returns the push direction, or null when nothing touched it.
   */
  pushOut(p, r) {
    const CAPS = [['Hips', 'Spine', 0.19], ['Spine', 'neck', 0.17], ['neck', 'Head', 0.13],
      ['LeftArm', 'LeftForeArm', 0.07], ['LeftForeArm', 'LeftHand', 0.06], ['RightArm', 'RightForeArm', 0.07], ['RightForeArm', 'RightHand', 0.06],
      ['LeftUpLeg', 'LeftLeg', 0.1], ['LeftLeg', 'LeftFoot', 0.08], ['RightUpLeg', 'RightLeg', 0.1], ['RightLeg', 'RightFoot', 0.08]];
    let moved = null;
    for (const [an, bn, rad] of CAPS) {
      const a = this.b[an].getWorldPosition(V()), c = this.b[bn].getWorldPosition(V()), ac = c.clone().sub(a);
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ac) / Math.max(ac.lengthSq(), 1e-6), 0, 1);
      const q = a.addScaledVector(ac, t), n = p.clone().sub(q), d = n.length(), need = rad + r;
      if (d >= need) continue;
      if (d < 1e-4) n.set(0, 1, 0); else n.multiplyScalar(1 / d);
      p.copy(q).addScaledVector(n, need);
      moved = n;
    }
    return moved;
  }

  /** World position between the hands (for a caught ball). */
  handsWorld() { return this.b.LeftHand.getWorldPosition(V()).add(this.b.RightHand.getWorldPosition(V())).multiplyScalar(0.5); }
}
