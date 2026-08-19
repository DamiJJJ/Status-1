/* STATUS 1 - first-person arms for the player viewmodels (BRON-2)
   Baked "Rigged FPS Arms" by J-Toastie [CC-BY] (tools/gen_models.py, entry
   'arms').

   The arms ride on the SOURCE RIG: a THREE.SkinnedMesh with the original bone
   tree (UpperArm -> LowerArm -> Hand -> three finger chains per side). The
   earlier take cut the mesh into rigid parts, which cracked open along every
   seam once two parts rotated apart and left a hollow elbow where the upper
   arm had been dropped - the holes and see-through. Skinning has neither
   problem, and it hands us the WRIST for free, which is the joint that decides
   where the forearm goes.

   Posing is by bone, in four independent controls per hand (all of them are
   HANDS fields in weapons.js, all of them editable in DEVRIG):
     pos      where the closed fist lands, in gun-model space
     channel  + palm: the orientation of the HAND bone (grip frame)
     fore     the forearm direction, elbow -> wrist
     upper    the upper-arm direction, shoulder -> elbow
   `fore` and `upper` are what the rigid version could not express: there the
   forearm was locked perpendicular to the fist, so an arm that gripped the gun
   properly had to point its cut end straight at the camera.

   The arms hang INSIDE the gun's model root, so ADS, sway, recoil and the
   reload gun-pose carry the hands for free.
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html (before weapons.js). */
'use strict';

/* materials are OURS (resolver like quatMat, never source colors):
   gloves stay black (user call 2026-08-18), sleeves are police-uniform navy */
const vmMatGlove = new THREE.MeshStandardMaterial({
  color: 0x171921, roughness: 0.85, metalness: 0.05, flatShading: true });
const vmMatSleeve = new THREE.MeshStandardMaterial({
  color: 0x1d2b52, roughness: 0.8, metalness: 0.05, flatShading: true });
const vmMatSkin = new THREE.MeshStandardMaterial({
  color: 0xb08260, roughness: 0.9, metalness: 0, flatShading: true });

function armsMat(src) {
  switch (src) {
    case 'Shirt': return vmMatSleeve;
    case 'Skin': return vmMatSkin;
    default: return vmMatGlove; // 'Glove'
  }
}

/* bone names as the source rig spells them, per side. f = the paired
   middle/ring fingers, i = index (the trigger finger), t = thumb; the three
   segments run proximal -> distal. */
const ARM_BONES = {
  L: {
    upper: 'UpperArm.L', fore: 'LowerArm.L', hand: 'Hand.L',
    f: ['DoubleFingersBeginning', 'DoubleFingers.L', 'DoubleFingersTip.L'],
    i: ['IndexBeginning.L', 'Index.L', 'IndexTip.L'],
    t: ['ThumbBeginning.L', 'Thumb.L', 'ThumbTip.L'],
  },
  R: {
    upper: 'UpperArm.R.001', fore: 'LowerArm.R.001', hand: 'Hand.R.001',
    f: ['DoubleFingersBeginning.001', 'DoubleFingers.R.001', 'DoubleFingersTip.R.001'],
    i: ['IndexBeginning.R.001', 'Index.R.001', 'IndexTip.R.001'],
    t: ['ThumbBeginning.R.001', 'Thumb.R.001', 'ThumbTip.R.001'],
  },
};
const FINGER_CHAINS = ['f', 'i', 't'];

/* Every direction in HANDS is expressed in GUN-MODEL space - the space the
   grip anchors are measured in - so that is the reference frame everything
   here converts through. (The arms root is NOT it: the bake hands over its own
   orientation, so a direction read as arms-root local comes out turned.)

   Hinge axes are NOT assumed - they are measured off the rig (see
   fingerHinges): a finger folds about its own direction crossed with the palm
   normal, so a positive curl closes it. Reading them out of the chain's first
   segment instead is what made the fingers splay sideways and scissor through
   each other - that segment runs from the wrist to the knuckle, across the
   fold, not along it. */

const _hV = new THREE.Vector3();
const _hV2 = new THREE.Vector3();
const _hQ = new THREE.Quaternion();
const _hQ2 = new THREE.Quaternion();
const _hM = new THREE.Matrix4();

/* Hand orientation from a grip FRAME instead of guessed Eulers: give the
   direction the fist CHANNEL should point (the axis of the hole through the
   closed fist, i.e. the knuckle line, which is where the grip runs) plus the
   direction the BACK of the hand should face. Returns the ABSOLUTE
   orientation in gun-model space.

   The two land on the hand bone's OWN axes, which were measured off this rig
   (both hands share them): local Z is the knuckle line, local X points out of
   the palm, local Y runs down the fingers. Mapping `channel` onto local X
   instead - which is what the first version did - meant the "channel" slider
   was really tilting the palm normal and the "palm" one was aiming the
   fingers, so every label in the editor lied about what it moved. */
function handFrame(channel, palm) {
  // Degenerate input must NEVER reach makeBasis: a zero axis (or a palm
  // parallel to the channel, which carries no roll) collapses the basis and
  // setFromRotationMatrix hands back a NON-UNIT quaternion, which then shears
  // the hand instead of rotating it. Fall back to a stable frame instead.
  const z = new THREE.Vector3().fromArray(channel);
  if (z.lengthSq() < 1e-10) z.set(1, 0, 0);
  z.normalize();
  const x = new THREE.Vector3().fromArray(palm).multiplyScalar(-1);
  x.addScaledVector(z, -x.dot(z));            // re-orthogonalize
  if (x.lengthSq() < 1e-8) {
    x.set(0, 1, 0).addScaledVector(z, -z.y);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(z, -z.x);
  }
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(_hM.makeBasis(x, y, z));
}

/* Aim a bone so the direction to its child matches `target` (arms-root space).
   The bone's own roll is left alone, which is what a limb wants: only where it
   points is being asked for. */
function aimBone(hand, bone, child, target) {
  hand.root.updateMatrixWorld(true);
  bone.getWorldPosition(_hV);
  child.getWorldPosition(_hV2);
  const cur = _hV2.sub(_hV).normalize();
  const t = new THREE.Vector3().fromArray(target);
  if (t.lengthSq() < 1e-10) return;   // no direction asked for: stay at bind
  t.transformDirection(hand.gunRoot.matrixWorld).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(cur, t);
  bone.parent.getWorldQuaternion(_hQ);
  bone.getWorldQuaternion(_hQ2);
  bone.quaternion.copy(_hQ.invert()).multiply(q).multiply(_hQ2);
  bone.updateMatrixWorld(true);
}

/* Set a bone's orientation outright (used for the hand). `frame` is the
   ABSOLUTE orientation wanted in gun-model space, not a delta: handFrame()
   already builds the basis the hand's own axes have to land on, so composing
   it with the bind orientation on top would apply that turn TWICE - which is
   exactly what bent every wrist by 120 deg and kinked the skin across it. */
function orientBone(hand, bone, frame) {
  hand.root.updateMatrixWorld(true);
  hand.gunRoot.getWorldQuaternion(_hQ);       // gun space -> world
  _hQ.multiply(frame);                        // desired world orientation
  bone.parent.getWorldQuaternion(_hQ2);
  bone.quaternion.copy(_hQ2.invert()).multiply(_hQ);
  bone.updateMatrixWorld(true);
}

/* Flexion axis per finger chain, measured off the rig. All three joints of a
   finger fold about parallel axes and both finger chains share one knuckle
   line, so one axis drives them all; the thumb folds in its own plane.
     palm normal  the hand bone's own local +X, which is where this rig points
                  the palm (verified on both hands, and the thumb tip sits on
                  that side of the palm plane in the bind pose). It is a plain
                  direction, so it comes out the same for both hands - the two
                  arms are mirrored across x, which leaves it untouched.
     flexion      dir x palmNormal: a positive angle about it sweeps the
                  fingertip toward the palm, which is what closing means. Both
                  factors are plain directions, so their cross product flips
                  with the mirror on its own and one positive angle closes
                  either hand - no per-side sign anywhere.
   Reading the axis off the FIRST segment instead (p1-p0) is what used to
   break this: bone 0 of every chain sits at the wrist centre and its offset
   to the knuckle runs sideways along the knuckle line, so p0->p1->p2 spans
   the SPREAD plane, not the bend plane. Its normal is then the palm normal,
   90 deg off the fold - and it flips sign between the index and the paired
   fingers, because they fan out to opposite sides. That is what scissored the
   two chains through each other instead of closing them into a fist.
   Returns the axes in gun-model space plus the palm normal. */
function fingerHinges(hand, gunRoot) {
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const dir = {}, seg = {};
  hand.root.updateMatrixWorld(true);
  for (const c of FINGER_CHAINS) {
    for (let i = 0; i < 3; i++) {
      hand.fingers[c][i].getWorldPosition(p[i]);
      gunRoot.worldToLocal(p[i]);
    }
    dir[c] = p[2].clone().sub(p[1]);          // knuckle -> tip, the finger itself
    if (dir[c].lengthSq() < 1e-12) dir[c].set(0, 0, -1);
    dir[c].normalize();
    // per-bone segments, which the thumb poses about one at a time; the last
    // bone has no child to measure, so it reuses the one above it
    if (c === 't') seg.t = [p[1].clone().sub(p[0]), dir.t.clone(), dir.t.clone()];
  }
  // palm normal, straight off the hand bone, in gun-model space
  hand.bones.hand.getWorldQuaternion(_hQ);
  gunRoot.getWorldQuaternion(_hQ2);
  const palmNormal = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(_hQ2.invert().multiply(_hQ)).normalize();
  // the two finger chains fold about one axis: average them before crossing,
  // so a fanned-out index cannot pull its own knuckle line out of true
  const fDir = dir.f.clone().add(dir.i).normalize();
  const axis = new THREE.Vector3().crossVectors(fDir, palmNormal);
  if (axis.lengthSq() < 1e-12) axis.crossVectors(dir.f, palmNormal);  // degenerate
  axis.normalize();
  // The thumb does NOT share the knuckle line: its joints swing in their own
  // planes, so every thumb bone folds about its OWN segment crossed with the
  // palm normal. One shared axis bends the metacarpal - which lies nearly
  // along the palm - sideways out of the hand instead of in toward it.
  const tAxis = seg.t.map(s => {
    const a = new THREE.Vector3().crossVectors(s, palmNormal);
    return a.lengthSq() < 1e-12 ? axis.clone() : a.normalize();
  });
  return { f: { axis }, i: { axis }, t: { axis: tAxis }, palmNormal };
}

/* Apply a grip pose to the fingers. `curl` is { f, i, t, tAdd } in radians,
   one angle per segment (proximal -> distal). Every segment hinges about the
   knuckle axis stored in its OWN bind frame, so the angles stay meaningful no
   matter how the wrist above them is turned. `tAdd` sweeps the thumb across
   the closed fingers, which is what actually locks a grip. */
function poseFingers(hand, curl) {
  // the palm normal is a plain direction and the two arms are mirrored, so it
  // comes out the same on both hands - the sweep across it has to flip. The
  // curl axes are cross products, which flip with the mirror by themselves.
  const tAdd = (curl.tAdd || 0) * (hand.side === 'R' ? 1 : -1);
  for (const c of FINGER_CHAINS) {
    const angles = curl[c] || [];
    for (let n = 0; n < 3; n++) {
      const b = hand.fingers[c][n];
      b.quaternion.copy(b.userData.bindLocal)
        .multiply(_hQ.setFromAxisAngle(b.userData.curlAxis, angles[n] || 0));
      if (c === 't' && n === 0) {
        b.quaternion.multiply(_hQ.setFromAxisAngle(b.userData.addAxis, tAdd));
      }
    }
  }
  hand.root.updateMatrixWorld(true);
}

/* Where the closed fist's channel ends up, measured on the CURRENT pose: the
   mean of the FINGER joint origins past the knuckle (the proximal joints sit
   ON the knuckle line, not inside the hole), in gun-model space. The thumb is
   left out on purpose - it swings far more than the fingers between grips.
   This one follows the fingers, so it is what a magazine held in the fist
   rides on - NOT what the arm is placed by, see gripAnchor. */
function fistAnchor(hand, out) {
  out.set(0, 0, 0);
  let n = 0;
  for (const c of FINGER_CHAINS) {
    if (c === 't') continue;
    for (let i = 1; i < 3; i++) {
      hand.fingers[c][i].getWorldPosition(_hV);
      out.add(hand.gunRoot.worldToLocal(_hV));
      n++;
    }
  }
  return out.divideScalar(n || 1);
}

/* The point in the hand that `pos` places, in gun-model space. It is the same
   measurement as fistAnchor, but taken ONCE off the rig's bind hand and kept
   in the hand bone's own frame, so it rides the wrist and nothing else.
   Placing the arm by the LIVE anchor instead - which is what this did first -
   means the fist hole moves as soon as a finger bends, and the solver drags
   the whole arm after it: dialling a curl slider by 0.3 rad slid the wrist a
   centimetre across the gun, and zeroing a curl slid it three. Fingers must
   close inside a hand that stays put. */
function gripAnchor(hand, out) {
  hand.root.updateMatrixWorld(true);
  out.copy(hand.gripLocal);
  hand.bones.hand.localToWorld(out);
  return hand.gunRoot.worldToLocal(out);
}

/* Slide the whole arm (by its shoulder, which is the root of the chain) so the
   grip anchor lands on `pos` in gun-model space. Rotations are already set by
   then, so this is a pure translation - no IK, no solving. */
function placeArm(hand, pos) {
  hand.root.updateMatrixWorld(true);
  gripAnchor(hand, _hV2);
  // the delta is in gun-model space; the shoulder bone lives in arms-root
  // space, so take it through the root's inverse scale/rotation
  _hV.set(pos[0] - _hV2.x, pos[1] - _hV2.y, pos[2] - _hV2.z);
  _hV.applyQuaternion(_hQ.copy(hand.root.quaternion).invert())
    .divideScalar(hand.root.scale.x);   // gun space -> arms-root space
  hand.bones.upper.position.add(_hV);
  hand.root.updateMatrixWorld(true);
}

/* Move the wrist's TWIST up into the forearm, which is where it belongs: a
   forearm pronates (the radius rolls over the ulna), a wrist does not. The
   forearm is aimed by direction only - aimBone leaves its roll at bind - so
   without this every degree of hand roll piled up in the wrist and sheared
   the skin across the joint. Rolling the arm was simply not expressible.

   The axis runs elbow -> wrist, i.e. through the bone's own origin AND the
   wrist, so the hand does not move: only the twist changes hands. Whatever
   the wrist keeps after this is pure bend, which is what the editor's readout
   flags. */
function rollForearm(hand) {
  const b = hand.bones;
  const local = b.hand.quaternion.clone()
    .multiply(_hQ.copy(b.hand.userData.bindLocal).invert());
  hand.root.updateMatrixWorld(true);
  b.fore.getWorldPosition(_hV);
  b.hand.getWorldPosition(_hV2);
  b.fore.getWorldQuaternion(_hQ2);
  const ax = _hV2.sub(_hV).applyQuaternion(_hQ2.invert());
  hand.foreTwist = 0;
  if (ax.lengthSq() < 1e-12) return;
  ax.normalize();
  // swing-twist: keep only the part of the wrist rotation about that axis
  const d = local.x * ax.x + local.y * ax.y + local.z * ax.z;
  const twist = new THREE.Quaternion(ax.x * d, ax.y * d, ax.z * d, local.w);
  if (twist.lengthSq() < 1e-12) return;
  twist.normalize();
  b.fore.quaternion.multiply(twist);
  b.fore.updateMatrixWorld(true);
  hand.foreTwist = 2 * Math.acos(Math.min(1, Math.abs(twist.w)));
}

/* Pose one arm from its HANDS entry: fingers first (the anchor depends on
   them), then the chain from the shoulder down, then slide it into place. */
function poseArm(hand, sd) {
  // Restart from the BIND pose every time. aimBone() rotates from whatever
  // direction the bone currently points, so without this reset the leftover
  // roll from the previous edit rides along and the same numbers stop meaning
  // the same pose - which is what made sliders feel unpredictable.
  for (const k of ['upper', 'fore', 'hand']) {
    hand.bones[k].quaternion.copy(hand.bones[k].userData.bindLocal);
  }
  hand.root.updateMatrixWorld(true);
  poseFingers(hand, sd.curl);
  if (sd.upper) aimBone(hand, hand.bones.upper, hand.bones.fore, sd.upper);
  if (sd.fore) aimBone(hand, hand.bones.fore, hand.bones.hand, sd.fore);
  const frame = handFrame(sd.channel, sd.palm);
  orientBone(hand, hand.bones.hand, frame);
  rollForearm(hand);                  // pronation belongs to the forearm
  orientBone(hand, hand.bones.hand, frame);   // re-solve against the new roll
  hand.basePos = sd.pos.slice();
  hand.bones.upper.position.copy(hand.shoulderRest);
  placeArm(hand, hand.basePos);
}

/* Lerp an arm's grip point between its base pose and `pos` by w (0..1) -
   called per frame during reloads; the orientation stays as posed. */
function blendArm(hand, pos, w) {
  _hV2.set(
    hand.basePos[0] + (pos[0] - hand.basePos[0]) * w,
    hand.basePos[1] + (pos[1] - hand.basePos[1]) * w,
    hand.basePos[2] + (pos[2] - hand.basePos[2]) * w);
  hand.bones.upper.position.copy(hand.shoulderRest);
  hand.root.updateMatrixWorld(true);
  placeArm(hand, [_hV2.x, _hV2.y, _hV2.z]);
}

/* Build one pair of arms and hang them under a gun's model root.
   spec: { scale, r: {pos, channel, palm, fore, upper, curl}, l: {…} } in
   gun-model space. Returns { model, L, R } with per-hand bone state. */
function attachArms(gunRoot, spec) {
  const m = buildSkinnedModel('arms', armsMat);
  const s = spec.scale || 1;
  // the bake hands over its own normalization scale; HANDS.scale rides on top
  const baseScale = m.root.scale.clone();
  m.root.scale.multiplyScalar(s);
  gunRoot.add(m.root);
  m.mesh.castShadow = false;
  m.mesh.receiveShadow = false;
  const rig = { model: m, baseScale, L: null, R: null };
  for (const key of ['L', 'R']) {
    const names = ARM_BONES[key];
    const bones = { upper: m.bones[names.upper], fore: m.bones[names.fore],
                    hand: m.bones[names.hand] };
    const fingers = {};
    for (const c of FINGER_CHAINS) fingers[c] = names[c].map(n => m.bones[n]);
    const hand = {
      side: key,
      root: m.root,
      gunRoot,
      bones,
      fingers,
      scale: s,
      basePos: spec[key.toLowerCase()].pos.slice(),
      shoulderRest: bones.upper.position.clone(),
      bindHand: new THREE.Quaternion(),
      gripLocal: null,                // grip anchor, hand-bone space (frozen)
      foreTwist: 0,                   // pronation the forearm took, radians
      gripOff: new THREE.Vector3(),   // where it landed, gun-model space
    };
    // bind-pose reference, captured BEFORE anything is posed: the hand's
    // orientation in arms-root space, and the hinge axes in each finger
    // bone's own frame (so a curl angle survives the wrist turning)
    m.root.updateMatrixWorld(true);
    for (const k of ['upper', 'fore', 'hand']) {
      bones[k].userData.bindLocal = bones[k].quaternion.clone();
    }
    bones.hand.getWorldQuaternion(_hQ);
    gunRoot.getWorldQuaternion(_hQ2);
    hand.bindHand.copy(_hQ2.invert()).multiply(_hQ);
    for (const c of FINGER_CHAINS) {
      for (const b of fingers[c]) b.userData.bindLocal = b.quaternion.clone();
    }
    // the anchor `pos` places the arm by, frozen here on the BIND hand and
    // held in the hand bone's frame so no finger can ever move it
    hand.gripLocal = new THREE.Vector3();
    fistAnchor(hand, hand.gripLocal);
    gunRoot.localToWorld(hand.gripLocal);
    bones.hand.worldToLocal(hand.gripLocal);
    const hinge = fingerHinges(hand, gunRoot);
    hand.palmNormal = hinge.palmNormal.clone();
    for (const c of FINGER_CHAINS) {
      fingers[c].forEach((b, i) => {
        b.getWorldQuaternion(_hQ);
        gunRoot.getWorldQuaternion(_hQ2);
        const inv = _hQ2.invert().multiply(_hQ).invert(); // gun -> bone local
        const ax = Array.isArray(hinge[c].axis) ? hinge[c].axis[i] : hinge[c].axis;
        b.userData.curlAxis = ax.clone().applyQuaternion(inv).normalize();
        b.userData.addAxis = hinge.palmNormal.clone().applyQuaternion(inv).normalize();
      });
    }
    rig[key] = hand;
  }
  regripArms(rig, spec);
  return rig;
}

/* Re-apply a whole spec to arms that are ALREADY built. The editor
   (devrig.js) calls this on every slider frame, and attachArms() would
   allocate a fresh skeleton and mesh per drag. */
function regripArms(rig, spec) {
  const s = spec.scale || 1;
  rig.model.root.scale.copy(rig.baseScale).multiplyScalar(s);
  for (const key of ['L', 'R']) {
    const hand = rig[key];
    hand.scale = s;
    poseArm(hand, spec[key.toLowerCase()]);
    gripAnchor(hand, hand.gripOff);   // == spec.pos once the arm is placed
  }
}

/* Park an object in the closed fist (the magazine / shell carried during a
   reload). It is parented to the HAND BONE so it rides the hand for free.
   The scale has to be undone: prop geometry is authored in gun-model units,
   while the bone carries the bake's own scale on top of the arms root. */
const _fitS = new THREE.Vector3();
const _fitS2 = new THREE.Vector3();
function attachToFist(hand, obj) {
  const bone = hand.bones.hand;
  hand.root.updateMatrixWorld(true);
  if (obj.parent !== bone) bone.add(obj);
  fistAnchor(hand, _hV);
  hand.gunRoot.localToWorld(_hV);
  bone.worldToLocal(_hV);
  obj.position.copy(_hV);
  hand.gunRoot.matrixWorld.decompose(_hV2, _hQ, _fitS);
  bone.matrixWorld.decompose(_hV2, _hQ, _fitS2);
  obj.scale.set(_fitS.x / _fitS2.x, _fitS.y / _fitS2.y, _fitS.z / _fitS2.z);
}
