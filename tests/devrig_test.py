# -*- coding: utf-8 -*-
"""DEVRIG grip editor (js/devrig.js) verification.

Checks (http://localhost:8137):
  1. entry: H on the dev range opens the editor, own state/scene, HUD hidden,
     controls generated from the live HANDS entry (not a hard-coded list)
  2. editing: sliders write HANDS and re-pose BOTH the preview and the live
     viewmodel; the shared CURL_* constants are isolated per weapon first
  3. frame mode: switching channel <-> forearm rewrites the right field
  4. JSON: export round-trips through import; "przywróć" restores file values
  5. hygiene: dev-only, no gameplay state touched, close returns to the range
"""
import json, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        fails.append(name)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/?test=play")
    time.sleep(4)

    # --- 1. entry -----------------------------------------------------------
    page.evaluate("startDevMap()")
    time.sleep(1.2)
    check("range: dev flag on", page.evaluate("__test.dev") is True)
    # the editor must refuse to open outside the range
    page.evaluate("game.dev = false; openDevRig()")
    check("guard: closed outside the dev range",
          page.evaluate("__test.state") != 'devrig')
    page.evaluate("game.dev = true")

    page.evaluate("devKey('KeyH')")   # the real key path, not openDevRig()
    time.sleep(1.0)
    check("open: own state", page.evaluate("__test.state") == 'devrig',
          page.evaluate("__test.state"))
    check("open: screen visible", page.evaluate(
        "document.getElementById('screen-devrig').classList.contains('visible')"))
    check("open: HUD hidden behind the transparent screen",
          page.evaluate("document.body.classList.contains('devrig')"))
    check("open: own scene rendered",
          page.evaluate("renderPass.scene === DevRig.scene"))
    check("open: pointer lock released",
          page.evaluate("__test.pointerLock") is False)
    check("open: diagnostics", page.evaluate("__test.devrig") == 'pistol:R',
          page.evaluate("__test.devrig"))

    # controls are generated from the spec, so the count follows the fields:
    # 3 pos + 2 channel angles + 1 roll + 2 fore + 2 upper + 9 curl + tAdd +
    # scale = 21 sliders, plus the two read-only joint-angle rows
    rows = page.evaluate("document.querySelectorAll('#devrig-controls .dr-row').length")
    check("open: controls generated from HANDS", rows == 23, rows)

    # every slider has to MOVE something - directions are edited as angles
    # exactly because three XYZ sliders carry two degrees of freedom and the
    # palm component along the channel was silently discarded
    inert = page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms;
        const snap = () => {
          const o = [];
          const w = b => o.push(b.quaternion.toArray().join(','),
                                b.position.toArray().join(','));
          ['upper','fore','hand'].forEach(k => w(rig.R.bones[k]));
          ['f','i','t'].forEach(c => rig.R.fingers[c].forEach(w));
          return o.join('|');
        };
        const dead = [];
        for (const r of document.querySelectorAll('#devrig-controls .dr-row')) {
          const rng = r.querySelector('input[type=range]');
          if (!rng) continue;
          const before = snap(), old = parseFloat(rng.value);
          const lo = parseFloat(rng.min), hi = parseFloat(rng.max);
          const nv = old + (hi - lo) * 0.15 <= hi ? old + (hi - lo) * 0.15
                                                  : old - (hi - lo) * 0.15;
          rng.value = nv; rng.dispatchEvent(new Event('input', {bubbles: true}));
          if (snap() === before) dead.push(r.querySelector('.dr-lab').textContent);
          rng.value = old; rng.dispatchEvent(new Event('input', {bubbles: true}));
        }
        return dead;
    })()""")
    check("controls: no inert slider", inert == [], str(inert))

    # ...and none of them may JUMP. Dragging a slider one step must move the
    # pose by about one step: a reference axis chosen by a threshold used to
    # flip 90 deg mid-drag, which read as the hand snapping for no reason.
    jumps = page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms;
        const gunRoot = viewmodels[0].children[0];
        const orient = () => {
          rig.R.root.updateMatrixWorld(true);
          const q = new THREE.Quaternion(), gq = new THREE.Quaternion();
          rig.R.bones.hand.getWorldQuaternion(q); gunRoot.getWorldQuaternion(gq);
          return gq.clone().invert().multiply(q);
        };
        const bad = [];
        for (const r of document.querySelectorAll('#devrig-controls .dr-row')) {
          const rng = r.querySelector('input[type=range]');
          if (!rng) continue;
          const label = r.querySelector('.dr-lab').textContent;
          const lo = parseFloat(rng.min), hi = parseFloat(rng.max);
          const step = Math.max(parseFloat(rng.step), (hi - lo) / 360);
          const old = parseFloat(rng.value);
          let prev = null, worst = 0;
          for (let v = lo; v <= hi; v += step) {
            rng.value = v; rng.dispatchEvent(new Event('input', {bubbles: true}));
            const q = orient();
            if (prev) {
              const d = 2*Math.acos(Math.min(1, Math.abs(prev.dot(q))))*180/Math.PI;
              if (d > worst) worst = d;
            }
            prev = q;
          }
          // a full-range sweep in 360 steps: no single step may swing the hand
          // more than a few degrees
          if (worst > 10) bad.push(label + ' ' + worst.toFixed(0) + 'deg');
          rng.value = old; rng.dispatchEvent(new Event('input', {bubbles: true}));
        }
        return bad;
    })()""")
    check("controls: no jump while dragging", jumps == [], str(jumps))
    page.evaluate("devRigReset()")
    time.sleep(0.4)

    # the rig itself: a real skin, with the wrist as its own bone
    check("rig: skinned mesh, not rigid parts",
          page.evaluate("!!viewmodels[0].userData.arms.model.mesh.isSkinnedMesh"))
    check("rig: full bone tree", page.evaluate(
          "Object.keys(viewmodels[0].userData.arms.model.bones).length") == 24)
    check("rig: wrist bone exposed", page.evaluate(
          "!!viewmodels[0].userData.arms.R.bones.hand"))
    check("rig: upper arm ships (no open elbow)", page.evaluate(
          "!!viewmodels[0].userData.arms.model.bones['UpperArm.R.001']"))

    # --- 2. editing ---------------------------------------------------------
    # the CURL_* constants are shared by four weapons in the file; the editor
    # has to clone them or one edit would silently re-pose the others
    smg_before = page.evaluate("JSON.stringify(HANDS.smg.r.curl)")
    page.evaluate("devRigSelectWeapon(3)")          # karabin
    page.evaluate("HANDS.rifle.r.curl.f[0] = 1.55; devRigApply()")
    time.sleep(0.3)
    check("curl: shared constants isolated per weapon",
          page.evaluate("JSON.stringify(HANDS.smg.r.curl)") == smg_before)

    # a slider edit must reach the LIVE viewmodel, not just the preview
    live_before = page.evaluate(
        "viewmodels[3].userData.arms.R.bones.upper.position.toArray().join(',')")
    page.evaluate("HANDS.rifle.r.pos[1] -= 0.05; devRigApply()")
    time.sleep(0.3)
    live_after = page.evaluate(
        "viewmodels[3].userData.arms.R.bones.upper.position.toArray().join(',')")
    check("edit: live viewmodel re-posed", live_before != live_after)
    check("edit: preview re-posed too", page.evaluate(
        "DevRig.current().rig.R.basePos[1] === HANDS.rifle.r.pos[1]"))
    # the anchor solver must actually land the fist where pos says
    # the arm is slid by its shoulder until the measured fist anchor lands on
    # pos - that solve is the whole placement, so it has to be exact
    check("edit: grip anchor lands on pos", page.evaluate("""(() => {
        const h = viewmodels[3].userData.arms.R, t = HANDS.rifle.r.pos;
        return Math.hypot(h.gripOff.x - t[0], h.gripOff.y - t[1],
                          h.gripOff.z - t[2]) < 1e-4;
    })()"""))

    # --- 3. wrist / elbow (the DOF the rigid rig could not express) ---
    page.evaluate("devRigSelectHand('L')")
    time.sleep(0.3)
    fore_before = page.evaluate(
        "viewmodels[3].userData.arms.L.bones.fore.quaternion.toArray().join(',')")
    hand_before = page.evaluate(
        "viewmodels[3].userData.arms.L.bones.hand.quaternion.toArray().join(',')")
    page.evaluate("HANDS.rifle.l.fore = [0.5, -0.6, -0.62]; devRigApply()")
    time.sleep(0.3)
    check("forearm: its own control moves the forearm bone", page.evaluate(
        "viewmodels[3].userData.arms.L.bones.fore.quaternion.toArray().join(',')")
        != fore_before)
    # and the wrist keeps the grip frame it was given, independently
    page.evaluate("HANDS.rifle.l.channel = [0.3, 0.9, -0.3]; devRigApply()")
    time.sleep(0.3)
    check("wrist: grip frame is independent of the forearm", page.evaluate(
        "viewmodels[3].userData.arms.L.bones.hand.quaternion.toArray().join(',')")
        != hand_before)
    up_before = page.evaluate(
        "viewmodels[3].userData.arms.L.bones.upper.quaternion.toArray().join(',')")
    page.evaluate("HANDS.rifle.l.upper = [-0.6, 0.5, -0.62]; devRigApply()")
    time.sleep(0.3)
    check("elbow: upper-arm control moves the shoulder bone", page.evaluate(
        "viewmodels[3].userData.arms.L.bones.upper.quaternion.toArray().join(',')")
        != up_before)

    # THE decisive one: the hand must actually reach the orientation asked
    # for. handFrame() builds the ABSOLUTE basis the hand's axes land on, so
    # composing it with the bind orientation applied the same turn twice and
    # left every wrist bent ~120 deg - the "twisted hands".
    check("wrist: hand reaches the orientation it was asked for",
          page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms;
        const gunRoot = viewmodels[0].children[0], h = rig.R;
        const want = { channel: [0, -1, 0.3], palm: [0.2, 0, 1] };
        Object.assign(HANDS.pistol.r, want);
        regripArms(rig, HANDS.pistol);
        h.root.updateMatrixWorld(true);
        const q = new THREE.Quaternion(), gq = new THREE.Quaternion();
        h.bones.hand.getWorldQuaternion(q); gunRoot.getWorldQuaternion(gq);
        const posed = gq.clone().invert().multiply(q);
        // channel rides the hand bone's local Z (the knuckle line) and the
        // back of the hand its local -X, which is where the remap put them
        const gotC = new THREE.Vector3(0, 0, 1).applyQuaternion(posed);
        const gotP = new THREE.Vector3(-1, 0, 0).applyQuaternion(posed);
        const wantC = new THREE.Vector3(...want.channel).normalize();
        // palm is only defined up to the component perpendicular to channel
        const wantP = new THREE.Vector3(...want.palm)
          .addScaledVector(wantC, -new THREE.Vector3(...want.palm).dot(wantC))
          .normalize();
        return gotC.dot(wantC) > 0.999 && gotP.dot(wantP) > 0.999;
    })()"""))
    # the labels have to be TRUE: `channel` is the knuckle line the grip runs
    # through. It used to land on the hand bone's local X, which is the palm
    # normal on this rig, so the slider called "kanał" really tilted the palm.
    check("wrist: channel really is the knuckle line", page.evaluate("""(() => {
        return WEAPONS.every((w, i) => {
          const vm = viewmodels[i], rig = vm.userData.arms;
          const gunRoot = vm.children[0];
          regripArms(rig, HANDS[w.id]);
          return ['R','L'].every(s => {
            const h = rig[s];
            h.root.updateMatrixWorld(true);
            const at = c => { const v = new THREE.Vector3();
              h.fingers[c][1].getWorldPosition(v); return gunRoot.worldToLocal(v); };
            const knuckles = at('f').sub(at('i')).normalize();
            const ch = new THREE.Vector3(...HANDS[w.id][s.toLowerCase()].channel)
              .normalize();
            // an axis, not an arrow: the two hands are mirrored, so the sign
            // flips between them
            return Math.abs(knuckles.dot(ch)) > 0.9;
          });
        });
    })()"""))
    # and the shipped neutral IS the rig's bind pose, so a reset leaves a
    # dead-straight arm with nothing for the wrist to absorb
    check("wrist: neutral values leave the wrist straight",
          page.evaluate("""(() => {
        HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));
        const rig = viewmodels[0].userData.arms;
        regripArms(rig, HANDS.pistol);
        const d = handFrame(HANDS.pistol.r.channel, HANDS.pistol.r.palm)
          .multiply(rig.R.bindHand.clone().invert());
        return 2 * Math.acos(Math.min(1, Math.abs(d.w))) * 180 / Math.PI < 2;
    })()"""))

    # curl has to CLOSE the hand: the first build read the hinge off the
    # chain's first segment, which on this rig runs sideways from the wrist to
    # the knuckle - so the axis came out 90 deg off the fold AND flipped sign
    # between the index and the paired fingers, scissoring them through each
    # other instead of closing them.
    check("curl: every chain closes toward the palm, on both hands",
          page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms, spec = HANDS.pistol;
        const tips = h => { h.root.updateMatrixWorld(true);
          const o = {}; for (const c of ['f','i','t']) { const v = new THREE.Vector3();
            h.fingers[c][2].getWorldPosition(v); o[c] = h.gunRoot.worldToLocal(v).clone(); }
          return o; };
        const set = v => { for (const s of ['l','r']) { spec[s].curl =
            { f:[v,v,v], i:[v,v,v], t:[v,v,v], tAdd:0 }; } regripArms(rig, spec); };
        set(0); const A = { R: tips(rig.R), L: tips(rig.L) };
        set(1.2); const B = { R: tips(rig.R), L: tips(rig.L) };
        return ['R','L'].every(s => {
          const n = rig[s].palmNormal;
          const mv = c => B[s][c].clone().sub(A[s][c]);
          const f = mv('f'), i = mv('i');
          // every chain travels toward the palm, and the two finger chains
          // travel TOGETHER - opposite senses is the scissor
          return [f, i, mv('t')].every(d => d.dot(n) > 0.002)
              && f.clone().normalize().dot(i.clone().normalize()) > 0.8;
        });
    })()"""))
    # the palm normal is a plain direction and the arms are mirrored, so it
    # reads the same on both hands - the thumb sweep across it must flip
    check("curl: thumb sweeps toward the fingers on both hands",
          page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms, spec = HANDS.pistol;
        const tip = (h, c) => { h.root.updateMatrixWorld(true);
          const v = new THREE.Vector3(); h.fingers[c][2].getWorldPosition(v);
          return h.gunRoot.worldToLocal(v).clone(); };
        const set = ta => { for (const s of ['l','r']) { spec[s].curl =
            { f:[0,0,0], i:[0,0,0], t:[0,0,0], tAdd:ta }; } regripArms(rig, spec); };
        set(0); const A = { R: tip(rig.R,'t'), L: tip(rig.L,'t') },
                     F = { R: tip(rig.R,'f'), L: tip(rig.L,'f') };
        set(0.8); const B = { R: tip(rig.R,'t'), L: tip(rig.L,'t') };
        return ['R','L'].every(s => B[s].clone().sub(A[s]).normalize()
            .dot(F[s].clone().sub(A[s]).normalize()) > 0.3);
    })()"""))
    page.evaluate("HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));"
                  "devRigReposeAll()")

    # the wrist readout has to measure the JOINT. Reading the grip frame
    # against the rig's bind orientation instead only agreed while the forearm
    # sat at bind: swinging the forearm slider through 124 deg of real wrist
    # bend never moved the number off 0, so the one control that fixes a
    # twisted wrist gave no feedback.
    check("wrist: readout follows the joint, not the bind pose",
          page.evaluate("""(() => {
        devRigSelectWeapon(0); devRigSelectHand('R');
        HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));
        devRigApply();
        const read = () => parseFloat(el('devrig-wrist').textContent);
        const straight = read();
        HANDS.pistol.r.fore = [0.866, 0, -0.5];   // swing the forearm out
        devRigApply();
        const bent = read();
        // measure the same joint independently: hand bone against its own
        // bind rotation, which is expressed in the forearm's frame
        const h = DevRig.current().rig.R;
        const q = h.bones.hand.quaternion.clone()
          .multiply(h.bones.hand.userData.bindLocal.clone().invert());
        const joint = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;
        HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));
        devRigApply();
        return straight < 5 && bent > 45 && Math.abs(bent - joint) < 5;
    })()"""))

    # bending fingers must NOT drag the arm. The arm is slid until a measured
    # anchor lands on `pos`, and that anchor used to be re-measured on the
    # posed fist - so a curl slider moved the fist hole and the solver walked
    # the whole arm after it (0.3 rad slid the wrist a centimetre, zeroing a
    # curl slid it three).
    check("curl: closing the fingers leaves the arm where it is",
          page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms, spec = HANDS.pistol;
        const wrist = h => { h.root.updateMatrixWorld(true);
          const v = new THREE.Vector3(); h.bones.hand.getWorldPosition(v);
          return h.gunRoot.worldToLocal(v).clone(); };
        regripArms(rig, spec);
        const before = { R: wrist(rig.R), L: wrist(rig.L) };
        const bent = JSON.parse(JSON.stringify(spec));
        for (const s of ['r','l']) bent[s].curl =
          { f:[1.4,1.4,1.4], i:[1.4,1.4,1.4], t:[1.4,1.4,1.4], tAdd:1.0 };
        regripArms(rig, bent);
        const moved = ['R','L'].map(s => wrist(rig[s]).sub(before[s]).length());
        regripArms(rig, spec);
        return moved.every(d => d < 1e-6);
    })()"""))

    # the pose must be a pure function of the three hand sliders. Carrying the
    # roll along with the axis (a minimal rotation applied to `palm`) is
    # parallel transport on a sphere: wandering away and back on the SAME
    # numbers left the hand rolled a few degrees off, so the same drag did
    # something different every time.
    check("controls: hand pose is a pure function of its sliders",
          page.evaluate("""(() => {
        const sd = HANDS.pistol.r, rig = viewmodels[0].userData.arms;
        const snap = () => { regripArms(rig, HANDS.pistol);
          return rig.R.bones.hand.quaternion.clone(); };
        const read = () => [drAz(drHandDir(sd)), drEl(drHandDir(sd)), drHandRoll(sd)];
        drSetHand(sd, 20, -30, 45); const a = snap(), av = read();
        drSetHand(sd, -150, 60, -120); snap();     // wander off
        drSetHand(sd, 80, 10, 170); snap();
        drSetHand(sd, 20, -30, 45); const b = snap(), bv = read();
        const deg = 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;
        HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));
        regripArms(rig, HANDS.pistol);
        return deg < 0.5 && av.every((v, i) => Math.abs(v - bv[i]) < 0.5);
    })()"""))

    # rolling the hand has to roll the FOREARM: pronation happens along the
    # forearm, not at the wrist. Without that transfer every degree of roll
    # piled up in the wrist joint and sheared the skin across it - the hand
    # could not be turned over at all.
    check("wrist: the forearm takes the roll, not the joint",
          page.evaluate("""(() => {
        const sd = HANDS.pistol.r, rig = viewmodels[0].userData.arms;
        const out = [-90, -45, 45, 90].map(roll => {
          drSetHand(sd, 0, 0, roll);
          regripArms(rig, HANDS.pistol);
          const h = rig.R;
          const q = h.bones.hand.quaternion.clone()
            .multiply(h.bones.hand.userData.bindLocal.clone().invert());
          return { bend: 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI,
                   twist: h.foreTwist * 180 / Math.PI, roll: Math.abs(roll) };
        });
        HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));
        regripArms(rig, HANDS.pistol);
        return out.every(r => r.bend < 15 && Math.abs(r.twist - r.roll) < 2);
    })()"""))

    # --- 3b. the two faults reported on the first build --------------------
    # (a) the pose must be a pure function of the values: aimBone rotates from
    #     the CURRENT direction, so without a reset to bind the leftover roll
    #     rode along and the same numbers stopped meaning the same pose
    check("pose: same values twice give the same pose", page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms;
        const snap = () => ['upper','fore','hand'].map(k =>
          rig.R.bones[k].quaternion.toArray().map(v => +v.toFixed(5)).join(',')).join('|');
        const A = JSON.parse(JSON.stringify(HANDS.pistol.r));
        const B = { channel:[0.4,-0.8,0.2], palm:[-0.6,0.3,0.7],
                    fore:[0.5,-0.3,-0.8], upper:[-0.4,0.6,-0.7],
                    pos:A.pos, curl:A.curl };
        const put = o => { HANDS.pistol.r = JSON.parse(JSON.stringify(o));
                           regripArms(rig, HANDS.pistol); };
        put(A); const a1 = snap();
        put(B); put(A); const a2 = snap();
        return a1 === a2;
    })()"""))
    # (b) degenerate input (everything dragged to zero) must not shear the
    #     mesh: a collapsed basis used to yield a NON-UNIT quaternion
    bad = page.evaluate("""(() => {
        const rig = viewmodels[0].userData.arms, sd = HANDS.pistol.r;
        sd.channel=[0,0,0]; sd.palm=[0,0,0]; sd.fore=[0,0,0]; sd.upper=[0,0,0];
        sd.pos=[0,0,0]; sd.curl={f:[0,0,0],i:[0,0,0],t:[0,0,0],tAdd:0};
        regripArms(rig, HANDS.pistol);
        return rig.model.skeleton.bones.filter(b => {
          const q = b.quaternion;
          return ![q.x,q.y,q.z,q.w].every(isFinite)
              || Math.abs(Math.hypot(q.x,q.y,q.z,q.w) - 1) > 1e-3;
        }).map(b => b.name);
    })()""")
    check("pose: all-zero input stays a valid rotation", bad == [], str(bad))
    # restore ONLY the pistol - the rifle still carries the edit the JSON
    # round-trip below checks for
    page.evaluate("HANDS.pistol = JSON.parse(JSON.stringify(devRigBase.pistol));"
                  "devRigReposeAll(); devRigSelectWeapon(3)")
    time.sleep(0.4)

    # --- 4. JSON round-trip -------------------------------------------------
    exported = page.evaluate("el('devrig-json').value")
    try:
        parsed = json.loads(exported)
        ok = all(w in parsed for w in
                 ["pistol", "smg", "shotgun", "rifle", "sniper"])
    except Exception:
        ok = False
    check("json: exports every weapon", ok)
    check("json: carries the edit",
          abs(parsed["rifle"]["r"]["curl"]["f"][0] - 1.55) < 1e-6)

    # import a hand-modified payload
    parsed["rifle"]["r"]["curl"]["f"][0] = 0.4
    page.evaluate("v => { el('devrig-json').value = v; devRigPaste(); }",
                  json.dumps(parsed))
    time.sleep(0.5)
    check("json: import applied",
          abs(page.evaluate("HANDS.rifle.r.curl.f[0]") - 0.4) < 1e-6)
    check("json: import re-posed the live viewmodel", page.evaluate("""(() => {
        // the curl rides on a quaternion now; compare against the same angle
        // rebuilt from the bone's own hinge axis
        const b = viewmodels[3].userData.arms.R.fingers.f[0];
        const want = b.userData.bindLocal.clone().multiply(
          new THREE.Quaternion().setFromAxisAngle(b.userData.curlAxis, 0.4));
        return b.quaternion.angleTo(want) < 1e-4;
    })()"""))

    # malformed JSON must not throw, just report
    page.evaluate("el('devrig-json').value = '{nope'; devRigPaste()")
    time.sleep(0.3)
    check("json: bad input reported, not thrown",
          'JSON' in page.evaluate("el('devrig-msg').textContent"))

    # --- 5. reset + close ---------------------------------------------------
    page.evaluate("devRigReset()")
    time.sleep(0.5)
    check("reset: file values restored",
          abs(page.evaluate("HANDS.rifle.r.curl.f[0]") - 0.95) < 1e-6)

    score_before = page.evaluate("game.score")
    page.evaluate("closeDevRig()")
    time.sleep(1.0)
    check("close: back in the range", page.evaluate("__test.state") == 'playing',
          page.evaluate("__test.state"))
    check("close: HUD class cleared",
          page.evaluate("document.body.classList.contains('devrig')") is False)
    check("close: world scene rendered again",
          page.evaluate("renderPass.scene === scene"))
    check("close: gameplay untouched", page.evaluate("game.score") == score_before)
    check("close: diagnostics cleared", page.evaluate("__test.devrig") is None)

    check("no errors", errs == [] and page.evaluate("__test.errors") == [],
          str(errs) + str(page.evaluate("__test.errors")))

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL DEVRIG CHECKS PASSED")
