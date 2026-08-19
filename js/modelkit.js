'use strict';

/* Runtime side of tools/gen_models.py: turns the quantized geometry in
   MODEL_DATA into Three.js parts. Nothing is fetched - the data is a plain
   const in js/models.js, so this works from file:// as well.

   Materials stay ours: buildModel() asks a resolver for a material per source
   material name, so one mesh can wear any palette (bot livery per type). */

function _b64buf(s) {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return buf;
}

/* geometries are shared by every instance - bots spawn by the dozen, so a
   fresh BufferGeometry per bot would be pure waste (and a VRAM leak) */
const _modelGeoCache = new Map();

function modelPartGeo(modelName, part) {
  const key = `${modelName}:${part.name}`;
  let hit = _modelGeoCache.get(key);
  if (hit) return hit;
  const q = new Int16Array(_b64buf(part.pos));
  const pos = new Float32Array(q.length);
  const qo = part.qo, qs = part.qs;
  for (let i = 0; i < q.length; i += 3) {
    pos[i] = qo[0] + q[i] * qs;
    pos[i + 1] = qo[1] + q[i + 1] * qs;
    pos[i + 2] = qo[2] + q[i + 2] * qs;
  }
  const qn = new Int8Array(_b64buf(part.nor));
  const nor = new Float32Array(qn.length);
  for (let i = 0; i < qn.length; i++) nor[i] = qn[i] / 127;
  const idx = part.i32 ? new Uint32Array(_b64buf(part.idx))
                       : new Uint16Array(_b64buf(part.idx));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mats = [];
  part.groups.forEach((gr, i) => { geo.addGroup(gr.start, gr.count, i); mats.push(gr.mat); });
  geo.computeBoundingSphere();
  hit = { geo, mats };
  _modelGeoCache.set(key, hit);
  return hit;
}

/* Build one instance. `matFor(sourceMaterialName)` returns a THREE material.
   Every part hangs in its own Group placed at the part's pivot (hip, shoulder,
   neck…) so rotating that group animates the limb. */
function buildModel(name, matFor) {
  const def = MODEL_DATA[name];
  if (!def) throw new Error('unknown model ' + name);
  const root = new THREE.Group();
  const parts = {};
  for (const p of def.parts) {
    const { geo, mats } = modelPartGeo(name, p);
    const mesh = new THREE.Mesh(geo, mats.map(m => matFor(m, p.name)));
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
    g.add(mesh);
    root.add(g);
    parts[p.name] = g;
  }
  const sockets = {};
  for (const [k, v] of Object.entries(def.sockets || {})) {
    sockets[k] = new THREE.Vector3(v[0], v[1], v[2]);
  }
  return { root, parts, sockets };
}

/* Socket position expressed in a part group's local space (the group sits at
   its pivot), so children attached there follow the limb when it rotates. */
function socketLocal(model, socketName, partName) {
  const s = model.sockets[socketName];
  const p = model.parts[partName];
  return new THREE.Vector3(s.x - p.position.x, s.y - p.position.y, s.z - p.position.z);
}

/* ==================== skinned models ==================== */

/* Some rigs must not be cut into rigid parts: the FPS arms crack open along
   every seam as soon as two parts rotate apart, and any joint left out leaves
   a hollow cross-section. Those are baked as a real skin instead (bones +
   weights, see build_skinned in tools/gen_models.py) and driven here as a
   THREE.SkinnedMesh, so the geometry deforms with the bones and stays closed.

   Geometry is shared like the rigid path; the skeleton is per instance,
   because posing is what every instance does differently. */
const _skinGeoCache = new Map();

function skinnedGeo(name) {
  let hit = _skinGeoCache.get(name);
  if (hit) return hit;
  const d = MODEL_DATA[name].skin;
  const q = new Int16Array(_b64buf(d.pos));
  const pos = new Float32Array(q.length);
  const qo = d.qo, qs = d.qs;
  for (let i = 0; i < q.length; i += 3) {
    pos[i] = qo[0] + q[i] * qs;
    pos[i + 1] = qo[1] + q[i + 1] * qs;
    pos[i + 2] = qo[2] + q[i + 2] * qs;
  }
  const qn = new Int8Array(_b64buf(d.nor));
  const nor = new Float32Array(qn.length);
  for (let i = 0; i < qn.length; i++) nor[i] = qn[i] / 127;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('skinIndex',
    new THREE.BufferAttribute(new Uint8Array(_b64buf(d.ji)), 4));
  // weights ride as normalized bytes - 1/255 is far finer than the eye needs
  geo.setAttribute('skinWeight',
    new THREE.BufferAttribute(new Uint8Array(_b64buf(d.jw)), 4, true));
  geo.setIndex(new THREE.BufferAttribute(
    d.i32 ? new Uint32Array(_b64buf(d.idx)) : new Uint16Array(_b64buf(d.idx)), 1));
  const mats = [];
  d.groups.forEach((gr, i) => { geo.addGroup(gr.start, gr.count, i); mats.push(gr.mat); });
  geo.computeBoundingSphere();
  hit = { geo, mats };
  _skinGeoCache.set(name, hit);
  return hit;
}

const _skinV = new THREE.Vector3();
const _skinQ = new THREE.Quaternion();
const _skinS = new THREE.Vector3();

/* Build one skinned instance. Returns { root, mesh, skeleton, bones } where
   `bones` is keyed by the SOURCE bone name - posing means writing to
   bones['Hand.R.001'].quaternion and friends. */
function buildSkinnedModel(name, matFor) {
  const d = MODEL_DATA[name].skin;
  const { geo, mats } = skinnedGeo(name);
  const list = d.bones.map(b => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.pos);
    bone.quaternion.fromArray(b.rot);
    bone.scale.fromArray(b.scl);
    return bone;
  });
  const bones = {};
  d.bones.forEach((b, i) => {
    bones[b.name] = list[i];
    if (b.parent >= 0) list[b.parent].add(list[i]);
  });
  const inverses = [];
  for (let i = 0; i < list.length; i++) {
    inverses.push(new THREE.Matrix4().fromArray(d.ibm, i * 16));
  }
  const mesh = new THREE.SkinnedMesh(geo, mats.map(m => matFor(m)));
  mesh.frustumCulled = false;   // the bones move; a baked sphere would pop it
  // A skin is one mesh, so `userData.isHead` has nothing to hang on. The bake
  // sorts head triangles into contiguous runs and ships their face ranges;
  // hitFaceIsHead() below turns a raycast faceIndex back into a headshot.
  if (d.head && d.head.length) mesh.userData.headFaces = d.head;
  const root = new THREE.Group();
  // the bake leaves vertices in source space and hands the orientation+scale
  // over as one matrix; decompose it so the group stays a normal transform
  new THREE.Matrix4().fromArray(d.xform).decompose(_skinV, _skinQ, _skinS);
  root.position.copy(_skinV);
  root.quaternion.copy(_skinQ);
  root.scale.copy(_skinS);
  d.bones.forEach((b, i) => { if (b.parent < 0) root.add(list[i]); });
  root.add(mesh);
  // identity bind matrix - the baked inverse-bind matrices already carry the
  // source mesh node's transform (see build_skinned in tools/gen_models.py)
  mesh.bind(new THREE.Skeleton(list, inverses), new THREE.Matrix4());
  return { root, mesh, skeleton: mesh.skeleton, bones };
}

/* Headshot test for a raycast hit. Rigid models flag the whole head mesh;
   skinned ones carry baked face ranges instead (see buildSkinnedModel). */
function hitFaceIsHead(hit) {
  const o = hit.object;
  if (o.userData.isHead) return true;
  const r = o.userData.headFaces;
  if (!r || hit.faceIndex == null) return false;
  for (let i = 0; i < r.length; i++) {
    if (hit.faceIndex >= r[i][0] && hit.faceIndex < r[i][0] + r[i][1]) return true;
  }
  return false;
}
