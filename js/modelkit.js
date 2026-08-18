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
