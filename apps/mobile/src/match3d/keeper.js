// Vendored from the 3D match prototype (artifact MNaf1ynwKFD8nP1UrC9aon, v6, keeper.js).
// Keep it in step with the prototype: animation fixes land there first.
// Goalkeeper: Meshy rig (kaleci-v2) + procedural dives. The ready stance and the high catch
// come from Meshy clips; side dives are posed per frame on top of the stance: the body rolls
// around the hips along a jump arc, both arms reach the ball by IK, the lead knee tucks,
// the push leg trails, and the head tracks the ball.
import * as THREE from 'three';
import { rigInfo, subclip, rotateWorld, PoseGuard, makeLimb, limbIK, GroundClamp, FootLock } from './rig.js';

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
  /** model: rigged keeper scene; leap: the Leap_Right_and_Catch clip on the same rig. */
  constructor(model, leap) {
    this.root = new THREE.Group();            // placed in the world; faces −Z of the world
    this.model = model;
    // rest data in model space: measure before the model is parented and turned
    this.rig = rigInfo(this.model);
    this.b = this.rig.bones;
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
    this.A.ready.play();
    this.mode = 'ready';      // ready | dive | leap
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
    this.mode = 'ready'; this.d = null; this.t = 0; this.hopT = -1; this.lookW = 0; this.lookP = null;
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
    this.d = { s, B, th: near ? Math.min(th, 0.35) : th, hs, h0: hips0, tc, near, catch: opts.catch, hit: false, fallFrom: null };
    this.mode = 'dive'; this.t = 0;
  }

  update(dt, time, ballWorld) {
    this.t += dt;
    if (this.mode === 'ready') {
      // small weight shifts while the shooter lines up
      this.root.position.x = this.baseX + Math.sin(time * 1.3) * 0.12 + Math.sin(time * 0.45) * 0.06;
      this.guard.restore(); this.mixer.update(dt); this.guard.capture();
      this.model.position.y = -0.015 + Math.sin(time * 2.6) * 0.008;
      if (this.hopT >= 0) { this.hopT += dt; const u = this.hopT / 0.28; this.model.position.y += u < 1 ? Math.sin(Math.PI * u) * 0.07 : 0; if (u >= 1) this.hopT = -1; }
      this.model.updateMatrixWorld(true); this.feet.apply(dt);
      this.lastFeet = { Left: this.b.LeftFoot.getWorldPosition(V()), Right: this.b.RightFoot.getWorldPosition(V()) }; // where the boots are drawn
      this.ground.apply();
      return;
    }
    this.guard.restore(); this.mixer.update(dt); this.guard.capture();
    if (this.mode === 'leap') {
      this.root.updateMatrixWorld(true);
      // drift toward the ball and pull the hands onto it at the top of the jump
      const d = this.d; const u = smooth(0, d.tc, this.t);
      this.model.position.x = THREE.MathUtils.lerp(0, d.B.x * 0.9, easeOut(u)); this.model.position.y = 0;
      this.model.updateMatrixWorld(true);
      const w = smooth(0.1, d.tc, this.t) * (1 - smooth(d.tc + 0.35, d.tc + 0.8, this.t));
      if (w > 0) this.armsTo(this.toW(d.B), 0.1, w, this.W(V(0, 1, 0)), this.W(V(0, 0, 1)));
      this.lookTo(ballWorld, ballWorld ? 0.6 : 0, dt);
      this.ground.apply();
      return;
    }
    this.pose(dt, ballWorld);
    this.ground.apply();
  }

  // ------------------------------------------------------------- side dive
  pose(dt, ballWorld) {
    const d = this.d, t = this.t, s = d.s;
    const tc = d.tc, tLand = tc + (d.near ? 0.25 : 0.32 + d.hs.y * 0.18);
    // roll angle around the forward axis
    let th;
    if (t < tc) th = THREE.MathUtils.lerp(0, d.th, easeOut(smooth(0.05, tc, t) * 1.0) ** 1.2);
    else th = THREE.MathUtils.lerp(d.th, d.near ? d.th : Math.max(d.th, 1.42), smooth(tc, tLand, t));
    // hips path: dip to load, jump arc to the stretch point, fall to the ground
    const H = V();
    const load = smooth(0, 0.09, t) * (1 - smooth(0.09, 0.2, t));
    if (t < tc) {
      const u = smooth(0.06, tc, t), e = easeOut(u);
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
    let relax = 0;
    if (t > tc) { // caught: the ball comes in to the chest; missed: the arms stay long past the head
      const pull = smooth(tc + 0.08, tLand + 0.1, t);
      if (d.catch) target.lerp(chest.clone().addScaledVector(U, 0.22).addScaledVector(F, 0.3), pull);
      else relax = pull;
    }
    this.armsTo(P(target), 0.11, reachW, W(U), W(F), 0.16 * (1 - smooth(tc, tc + 0.15, t)), W(Dn), relax);

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
  }

  /** Keeper-space direction → world direction. */
  W(v) { return v.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())); }

  /**
   * Both hands to a ball at world point `p` (spread by `gap`), weight w. `up` and `fwd` are
   * the body's up (toward the head) and facing in world space. Elbows point out and down
   * the body, never back, so raised arms stay in front of the head.
   */
  armsTo(p, gap, w, up, fwd, extend = 0, spreadDown, relax = 0) {
    if (w <= 0) return;
    const sideW = this.b.LeftArm.getWorldPosition(V()).sub(this.b.RightArm.getWorldPosition(V())).normalize();
    const down = spreadDown || up.clone().negate();
    const hips = this.b.Hips.getWorldPosition(V()), neck = this.b.neck.getWorldPosition(V()), head = this.headEnd.getWorldPosition(V());
    for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
      const sh = this.b[side + 'Arm'].getWorldPosition(V());
      const tgt = p.clone().addScaledVector(sideW, sg * gap * 0.8).addScaledVector(down, gap * 0.4);
      tgt.addScaledVector(sh.clone().sub(tgt).normalize(), 0.07 - extend);
      // relaxed: each arm lies straight out from its own shoulder past the head, a little
      // toward the turf (both hands on one point would hook the top arm over the head)
      if (relax > 0) tgt.lerp(sh.clone().addScaledVector(up.clone().multiplyScalar(0.8).addScaledVector(fwd, 0.5).addScaledVector(down, 0.12).normalize(), this.armLen * 0.99), relax);
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

  /** World position between the hands (for a caught ball). */
  handsWorld() { return this.b.LeftHand.getWorldPosition(V()).add(this.b.RightHand.getWorldPosition(V())).multiplyScalar(0.5); }
}
