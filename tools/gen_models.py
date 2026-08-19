#!/usr/bin/env python3
"""Bake external CC-BY .glb meshes into js/models.js (geometry only).

The game ships from file://, where fetch/XHR is blocked, so a .glb file next to
index.html could never be loaded by GLTFLoader. Instead this script reads the
source models offline, keeps ONLY the geometry (materials and textures stay
procedural, see CLAUDE.md), splits it into animatable parts with pivots, and
emits a quantized, base64-packed data file that the game decodes from memory.

Run:  python3 tools/gen_models.py
In:   assets_src/*.glb   Out: js/models.js
"""

import base64, json, math, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src')
OUT = os.path.join(ROOT, 'js', 'models.js')

# ---------------------------------------------------------------- glTF reader

CTYPE = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2),
         5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    d = open(path, 'rb').read()
    magic, ver, _ = struct.unpack_from('<III', d, 0)
    if magic != 0x46546C67:
        raise SystemExit('not a glb: ' + path)
    off, js, binc = 12, None, None
    while off < len(d):
        clen, ctype = struct.unpack_from('<II', d, off)
        off += 8
        chunk = d[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binc = chunk
    return js, binc


def accessor(g, binc, idx):
    """Return a list of tuples (one per element), honouring byteStride."""
    a = g['accessors'][idx]
    n = NCOMP[a['type']]
    fmt, size = CTYPE[a['componentType']]
    bv = g['bufferViews'][a.get('bufferView', 0)]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or n * size
    out = []
    for i in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, binc, base + i * stride))
    return out


# ------------------------------------------------------------- 4x4 math (col-major, like glTF)

def m_ident():
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def m_mul(a, b):
    """a * b (column-major: applies b first)."""
    o = [0.0] * 16
    for c in range(4):
        for r in range(4):
            o[c * 4 + r] = sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
    return o


def m_from_trs(t, q, s):
    x, y, z, w = q
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    sx, sy, sz = s
    return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
            (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
            (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
            t[0], t[1], t[2], 1]


def m_node(n):
    if 'matrix' in n:
        return list(n['matrix'])
    return m_from_trs(n.get('translation', [0, 0, 0]),
                      n.get('rotation', [0, 0, 0, 1]),
                      n.get('scale', [1, 1, 1]))


def m_inv(m):
    """General 4x4 inverse (Gauss-Jordan on the column-major layout)."""
    a = [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    inv = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    for i in range(4):
        p = max(range(i, 4), key=lambda r: abs(a[r][i]))
        if abs(a[p][i]) < 1e-12:
            raise SystemExit('singular matrix')
        a[i], a[p] = a[p], a[i]
        inv[i], inv[p] = inv[p], inv[i]
        d = a[i][i]
        a[i] = [v / d for v in a[i]]
        inv[i] = [v / d for v in inv[i]]
        for r in range(4):
            if r == i:
                continue
            f = a[r][i]
            if f:
                a[r] = [av - f * bv for av, bv in zip(a[r], a[i])]
                inv[r] = [av - f * bv for av, bv in zip(inv[r], inv[i])]
    return [inv[r][c] for c in range(4) for r in range(4)]


def m_transpose(m):
    return [m[c * 4 + r] for r in range(4) for c in range(4)]


def xf_point(m, p):
    x, y, z = p
    return (m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14])


def xf_dir(m, v):
    x, y, z = v
    return (m[0] * x + m[4] * y + m[8] * z,
            m[1] * x + m[5] * y + m[9] * z,
            m[2] * x + m[6] * y + m[10] * z)


def m_rot_x(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]


def m_rot_y(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]


def m_rot_z(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def m_axis_angle(axis, deg):
    """Rodrigues rotation as a column-major mat4."""
    L = math.sqrt(sum(c * c for c in axis)) or 1.0
    x, y, z = (c / L for c in axis)
    a = math.radians(deg)
    c, s_, t = math.cos(a), math.sin(a), 1 - math.cos(a)
    return [t * x * x + c, t * x * y + s_ * z, t * x * z - s_ * y, 0,
            t * x * y - s_ * z, t * y * y + c, t * y * z + s_ * x, 0,
            t * x * z + s_ * y, t * y * z - s_ * x, t * z * z + c, 0,
            0, 0, 0, 1]


def m_pivot_rot(pivot, axis, deg):
    """Rotate about `axis` through the point `pivot`."""
    return m_mul(m_translate(pivot),
                 m_mul(m_axis_angle(axis, deg),
                       m_translate([-c for c in pivot])))


def m_scale(s):
    return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]


def m_translate(t):
    m = m_ident()
    m[12], m[13], m[14] = t
    return m


# ------------------------------------------------------------------ extraction

def world_matrices(g):
    """node index -> world matrix"""
    out = {}
    scene = g['scenes'][g.get('scene', 0)]

    def walk(i, parent):
        m = m_mul(parent, m_node(g['nodes'][i]))
        out[i] = m
        for c in g['nodes'][i].get('children', []):
            walk(c, m)
    for i in scene['nodes']:
        walk(i, m_ident())
    return out


class Part:
    def __init__(self, name):
        self.name = name
        self.verts = []      # (x,y,z)
        self.norms = []      # (x,y,z)
        self.tris = []       # (i0,i1,i2, material_name)
        self.pivot = (0.0, 0.0, 0.0)


def extract(g, binc, cfg, pose=None):
    """Split a glTF into named parts. Skinned models split by dominant joint,
    static ones by node name.

    Skinned vertices are normally taken raw (bind pose == mesh space, which is
    what the sentinel rig ships). Rigs whose inverse-bind matrices do NOT
    cancel against the node graph (e.g. the Mossberg: armature scale + Z-up
    rotation live in jointWorld*IBM) set cfg['bindWorld'] and get each vertex
    pushed through its dominant joint's jointWorld*IBM instead - that is the
    transform a skinning renderer would apply at bind pose."""
    wm = world_matrices(g)
    matname = [m.get('name', 'mat%d' % i) for i, m in enumerate(g.get('materials', []))]
    parts = {}
    bind_world = cfg.get('bindWorld', False)

    def part(name):
        if name not in parts:
            parts[name] = Part(name)
        return parts[name]

    joint_part = cfg.get('joints')          # dict: joint name -> part name
    node_part = cfg.get('nodes')            # dict: node name -> part name

    for ni, node in enumerate(g['nodes']):
        if 'mesh' not in node:
            continue
        skinned = 'skin' in node and joint_part is not None
        M = wm[ni]
        NM = m_transpose(m_inv(M))
        jnames = []
        bindmats = bind_nms = None
        if skinned:
            skin = g['skins'][node['skin']]
            jnames = [g['nodes'][j].get('name', '') for j in skin['joints']]
            if bind_world:
                ibm = accessor(g, binc, skin['inverseBindMatrices'])
                bindmats = [m_mul(wm[j], list(ibm[k]))
                            for k, j in enumerate(skin['joints'])]
                bind_nms = [m_transpose(m_inv(m)) for m in bindmats]
        for prim in g['meshes'][node['mesh']]['primitives']:
            att = prim['attributes']
            pos = accessor(g, binc, att['POSITION'])
            nor = accessor(g, binc, att['NORMAL']) if 'NORMAL' in att else [(0, 1, 0)] * len(pos)
            idx = [i[0] for i in accessor(g, binc, prim['indices'])] if 'indices' in prim \
                else list(range(len(pos)))
            mname = matname[prim['material']] if 'material' in prim else 'default'
            if skinned:
                # bind pose: skin matrix is identity, so raw positions are already
                # in scene space - only the joint decides which part a vertex is on
                jo = accessor(g, binc, att['JOINTS_0'])
                we = accessor(g, binc, att['WEIGHTS_0'])
                vpart, P, N = [], list(pos), list(nor)
                for k in range(len(pos)):
                    best, bw = 0, -1
                    for c in range(4):
                        if we[k][c] > bw:
                            bw, best = we[k][c], jo[k][c]
                    name = jnames[best]
                    vpart.append(joint_part.get(name, cfg['fallback']))
                    if bindmats:
                        P[k] = xf_point(bindmats[best], pos[k])
                        N[k] = xf_dir(bind_nms[best], nor[k])
                    pm = pose.get(name) if pose else None
                    if pm:
                        # curl poses COMPOSE with bindWorld (the arms rig);
                        # without bindWorld they replace the raw position
                        pmn = m_transpose(m_inv(pm))
                        P[k] = xf_point(pm, P[k] if bindmats else pos[k])
                        N[k] = xf_dir(pmn, N[k] if bindmats else nor[k])
            else:
                vpart = None
                P = [xf_point(M, p) for p in pos]
                N = [xf_dir(NM, n) for n in nor]
            # triangles land in one part: majority vote keeps seams closed
            remap = {}
            for t in range(0, len(idx), 3):
                tri = idx[t:t + 3]
                if vpart:
                    names = [vpart[i] for i in tri]
                    pname = max(set(names), key=names.count)
                else:
                    pname = node_part.get(node.get('name', ''), cfg['fallback'])
                p = part(pname)
                out = []
                for i in tri:
                    key = (pname, i)
                    if key not in remap:
                        remap[key] = len(p.verts)
                        p.verts.append(P[i])
                        p.norms.append(N[i])
                    out.append(remap[key])
                p.tris.append((out[0], out[1], out[2], mname))
    return parts


def build_curl(g, binc, cfg):
    """Explicit finger curl for bindWorld rigs (the FPS arms): rotate each
    bone chain about a given world axis through the bones' NODE-GRAPH pivots
    (that is the space bindWorld vertices land in), composing down the chain.
    Returns joint name -> 4x4, same contract as build_pose."""
    spec = cfg.get('curl')
    if not spec or 'skins' not in g:
        return {}
    wm = world_matrices(g)
    skin = g['skins'][0]
    piv = {}
    for j in skin['joints']:
        n = g['nodes'][j]
        piv[n.get('name', '')] = (wm[j][12], wm[j][13], wm[j][14])
    out = {}
    for chain in spec:
        axis = chain['axis']
        M = m_ident()
        for bone, deg in zip(chain['bones'], chain['deg']):
            M = m_mul(M, m_pivot_rot(piv[bone], axis, deg))
            out[bone] = M
    return out


def build_pose(g, binc, cfg):
    """Bake a finger curl into the geometry.

    The source hands are splayed open, which looks absurd around a pistol grip.
    The fingers only ever need this one pose, so instead of shipping extra
    animatable parts (more meshes per bot, and bots spawn by the dozen) each
    finger bone is rotated here and frozen into the vertices.

    Returns joint name -> 4x4 in the same space the vertex positions live in
    (bind pose, i.e. inverse of the inverse-bind matrix — the node graph is NOT
    usable here, the armature carries its own scale).
    """
    pose_cfg = cfg.get('pose')
    if not pose_cfg or 'skins' not in g:
        return {}
    skin = g['skins'][0]
    ibm = accessor(g, binc, skin['inverseBindMatrices'])
    P = {}
    for k, j in enumerate(skin['joints']):
        w = m_inv(list(ibm[k]))
        P[g['nodes'][j].get('name', '')] = (w[12], w[13], w[14])

    out = {}
    for hand in pose_cfg:
        axis = [b - a for a, b in zip(P[hand['axis'][0]], P[hand['axis'][1]])]
        for chain in hand['chains']:
            # The attractor must sit OFF the knuckle axis, or both signs come
            # out equally close and the hand bends backwards. In this rig the
            # fingers AND the thumb sit in one row along that axis, so neither
            # works as a reference; the torso does, because the arms hang at
            # the sides with the palms facing in.
            toward = P[chain['toward']]
            bones, angles = chain['bones'], chain['angles']
            p0, p1 = P[bones[0]], P[bones[1]]
            d = [b - a for a, b in zip(p0, p1)]
            tip = [b + v for b, v in zip(p1, d)]      # distal bone runs straight on
            best, best_d = 1, None
            for sign in (1, -1):
                m0 = m_pivot_rot(p0, axis, sign * angles[0])
                m1 = m_mul(m0, m_pivot_rot(p1, axis, sign * angles[1]))
                t = xf_point(m1, tip)
                dist = sum((a - b) ** 2 for a, b in zip(t, toward))
                if best_d is None or dist < best_d:
                    best_d, best = dist, sign
            # the sign that pulls the fingertip toward the palm is the one that
            # closes the hand — no need to know which way the rig was authored
            m0 = m_pivot_rot(p0, axis, best * angles[0])
            out[bones[0]] = m0
            out[bones[1]] = m_mul(m0, m_pivot_rot(p1, axis, best * angles[1]))
    return out


def joint_centroids(g, binc, cfg, groups, pose=None):
    """Centroid of the vertices a set of joints owns - the joint origin sits at
    the wrist, which is a poor place to hang a weapon; the palm is where the
    geometry actually is. Under cfg['bindWorld'] the vertices go through the
    same jointWorld*IBM transform extract() uses, then the pose on top."""
    if 'skins' not in g or not groups:
        return {}
    wm = world_matrices(g) if cfg.get('bindWorld') else None
    out = {}
    for ni, node in enumerate(g['nodes']):
        if 'mesh' not in node or 'skin' not in node:
            continue
        skin = g['skins'][node['skin']]
        jnames = [g['nodes'][j].get('name', '') for j in skin['joints']]
        bindmats = None
        if wm:
            ibm = accessor(g, binc, skin['inverseBindMatrices'])
            bindmats = [m_mul(wm[j], list(ibm[k]))
                        for k, j in enumerate(skin['joints'])]
        for prim in g['meshes'][node['mesh']]['primitives']:
            att = prim['attributes']
            pos = accessor(g, binc, att['POSITION'])
            jo = accessor(g, binc, att['JOINTS_0'])
            we = accessor(g, binc, att['WEIGHTS_0'])
            for k in range(len(pos)):
                best, bw = 0, -1
                for c in range(4):
                    if we[k][c] > bw:
                        bw, best = we[k][c], jo[k][c]
                name = jnames[best]
                v = pos[k]
                if bindmats:
                    v = xf_point(bindmats[best], v)
                if pose and name in pose:
                    v = xf_point(pose[name], v)
                for sock, wanted in groups.items():
                    if name in wanted:
                        acc = out.setdefault(sock, [0.0, 0.0, 0.0, 0])
                        acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]
                        acc[3] += 1
    return {k: (v[0] / v[3], v[1] / v[3], v[2] / v[3]) for k, v in out.items() if v[3]}


def joint_pivots(g, binc, cfg, table=None, first_only=True):
    """Bind-pose world position of joints, keyed by the mapped name.

    inv(IBM) gives the joint origin in the same space the raw vertices live
    in; under cfg['bindWorld'] the vertices are instead moved into node-graph
    world space, so the pivot must come from the node graph too."""
    if 'skins' not in g or not cfg.get('joints'):
        return {}
    skin = g['skins'][0]
    ibm = accessor(g, binc, skin['inverseBindMatrices'])
    wm = world_matrices(g) if cfg.get('bindWorld') else None
    lookup = table if table is not None else cfg['joints']
    piv, seen = {}, set()
    for k, j in enumerate(skin['joints']):
        name = g['nodes'][j].get('name', '')
        pname = lookup.get(name)
        if pname is None or (first_only and pname in seen):
            continue
        w = wm[j] if wm else m_inv(list(ibm[k]))
        piv[pname] = (w[12], w[13], w[14])
        seen.add(pname)
    return piv


# ------------------------------------------------------------------- packing

def b64(fmt, values):
    return base64.b64encode(struct.pack('<%d%s' % (len(values), fmt), *values)).decode('ascii')


def pack(parts, order):
    out = []
    for name in order:
        p = parts[name]
        xs = [v[0] for v in p.verts]
        ys = [v[1] for v in p.verts]
        zs = [v[2] for v in p.verts]
        lo = (min(xs), min(ys), min(zs))
        hi = (max(xs), max(ys), max(zs))
        span = max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6)
        qs = span / 32000.0
        qpos = []
        for v in p.verts:
            for c in range(3):
                qpos.append(max(-32768, min(32767, int(round((v[c] - lo[c]) / qs)) - 16000)))
        qnor = []
        for n in p.norms:
            L = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
            for c in range(3):
                qnor.append(max(-127, min(127, int(round(n[c] / L * 127)))))
        # sort triangles by material so each material becomes one draw group
        p.tris.sort(key=lambda t: t[3])
        idx, groups = [], []
        cur, start = None, 0
        for t in p.tris:
            if t[3] != cur:
                if cur is not None:
                    groups.append({'mat': cur, 'start': start, 'count': len(idx) - start})
                cur, start = t[3], len(idx)
            idx.extend(t[:3])
        if cur is not None:
            groups.append({'mat': cur, 'start': start, 'count': len(idx) - start})
        big = len(p.verts) > 65535
        out.append({
            'name': name,
            'pivot': [round(v, 5) for v in p.pivot],
            'qo': [round(lo[c] + 16000 * qs, 6) for c in range(3)],
            'qs': qs,
            'nv': len(p.verts),
            'pos': b64('h', qpos),
            'nor': b64('b', qnor),
            'idx': b64('I' if big else 'H', idx),
            'i32': big,
            'groups': groups,
        })
    return out


def build_skinned(key, cfg):
    """Bake a REAL skin: one mesh plus the bone tree, instead of splitting the
    geometry into rigid parts.

    Rigid splitting (build() above) assigns every triangle to its dominant
    joint, so the mesh CRACKS along every seam as soon as two parts rotate
    apart - visible as holes in the fingers and a hollow, open cross-section
    wherever a joint was dropped. A skinned mesh has neither problem: the
    vertices follow the bones by weight, and nothing has to be cut away.

    Output keeps the vertices in the source mesh node's space; the runtime
    hangs the whole rig under a group carrying `xform` (orientation + the
    scale that normalizes `normPair` to `length`).
    """
    g, binc = read_glb(os.path.join(SRC, cfg['file']))
    skin = g['skins'][0]
    joints = skin['joints']
    jname = [g['nodes'][j].get('name', '') for j in joints]
    jindex = {n: k for k, n in enumerate(jname)}
    ibm = accessor(g, binc, skin['inverseBindMatrices'])

    # bone tree, in skin-joint order (the index space JOINTS_0 refers to)
    parent_of = {}
    for i, n in enumerate(g['nodes']):
        for c in n.get('children', []):
            parent_of[c] = i
    bones = []
    for k, j in enumerate(joints):
        n = g['nodes'][j]
        pj = parent_of.get(j)
        # -1 for a chain root: the arm roots hang off 'Armature', which is a
        # plain node, NOT a joint - a null here reads as 0 in JS and reparents
        # both arms onto the first bone
        pn = g['nodes'][pj].get('name', '') if pj is not None else None
        bones.append({
            'name': jname[k],
            'parent': jindex.get(pn, -1) if pn is not None else -1,
            'pos': [round(v, 6) for v in n.get('translation', [0, 0, 0])],
            'rot': [round(v, 6) for v in n.get('rotation', [0, 0, 0, 1])],
            'scl': [round(v, 6) for v in n.get('scale', [1, 1, 1])],
        })

    wm = world_matrices(g)
    mesh_node = next(i for i, n in enumerate(g['nodes']) if n.get('skin') is not None)
    # bindMatrix stays IDENTITY on purpose. Verified against this file:
    # jointWorld * IBM * v already lands a raw POSITION in scene space, i.e.
    # the skin matrices carry the mesh node's own transform (which glTF says
    # to ignore for skinned meshes). Feeding the node matrix in as the bind
    # matrix applies that transform a second time and collapses the mesh.

    verts, norms, jidx, jwgt, tris = [], [], [], [], []
    for prim in g['meshes'][g['nodes'][mesh_node]['mesh']]['primitives']:
        at = prim['attributes']
        pos = accessor(g, binc, at['POSITION'])
        nor = accessor(g, binc, at['NORMAL']) if 'NORMAL' in at else [(0, 1, 0)] * len(pos)
        ji = accessor(g, binc, at['JOINTS_0'])
        jw = accessor(g, binc, at['WEIGHTS_0'])
        mat = g['materials'][prim['material']].get('name', 'mat')
        base = len(verts)
        verts.extend(pos)
        norms.extend(nor)
        jidx.extend(ji)
        jwgt.extend(jw)
        ind = [i[0] for i in accessor(g, binc, prim['indices'])]
        for t in range(0, len(ind), 3):
            tris.append((base + ind[t], base + ind[t + 1], base + ind[t + 2], mat))

    # Bind pose in scene space, computed the way the GPU will: sum the skin
    # matrices (jointWorld * IBM) by weight and apply them to the raw POSITION.
    # Do NOT assume the raw positions are already scene space - that holds for
    # the FPS arms (their IBMs cancel against the node graph) but NOT for the
    # Ross rig, whose positions sit in the mesh node's own space, a factor ~100
    # off. Measuring the bbox on raw positions made the drone ~100x too tall.
    skinmat = []
    for k, j in enumerate(joints):
        skinmat.append(m_mul(wm[j], list(ibm[k])))
    bindv = []
    for v, ji, jw in zip(verts, jidx, jwgt):
        acc = [0.0, 0.0, 0.0]
        tot = 0.0
        for c in range(4):
            w = jw[c]
            if w != w or w <= 0:
                continue
            q = xf_point(skinmat[int(ji[c])], v)
            acc = [acc[i] + q[i] * w for i in range(3)]
            tot += w
        bindv.append(tuple(a / tot for a in acc) if tot > 0
                     else xf_point(skinmat[int(ji[0])], v))

    R = m_ident()
    for axis, deg in cfg.get('rot', []):
        R = m_mul({'x': m_rot_x, 'y': m_rot_y, 'z': m_rot_z}[axis](deg), R)
    rv = [xf_point(R, v) for v in bindv]
    blo = [min(v[c] for v in rv) for c in range(3)]
    bhi = [max(v[c] for v in rv) for c in range(3)]

    if 'normPair' in cfg:
        # scale by the distance between two bind-pose joint origins, for rigs
        # where the bbox lies: the FPS arms ship the shoulder, which never
        # reaches the screen, so a bbox would shrink what actually does
        a, b = cfg['normPair']
        pa = wm[joints[jindex[a]]]
        pb = wm[joints[jindex[b]]]
        d = math.sqrt(sum((pa[12 + c] - pb[12 + c]) ** 2 for c in range(3)))
        s = cfg['length'] / d
    elif 'height' in cfg:
        s = cfg['height'] / (bhi[1] - blo[1])
    elif 'length' in cfg:
        s = cfg['length'] / (bhi[2] - blo[2])
    else:
        s = 1.0

    G = m_mul(m_scale(s), R)
    if cfg.get('ground'):
        G = m_mul(m_translate([0, -blo[1] * s, 0]), G)
    elif cfg.get('center'):
        G = m_mul(m_translate([-(blo[c] + bhi[c]) / 2 * s for c in range(3)]), G)
    # The chain roots hang off 'Armature', a plain node that carries the rig's
    # own scale (188 here). Only the joints ship, so that transform has to be
    # folded into the group the runtime hangs the skeleton under - without it
    # every bone translation collapses to a fraction of its real length.
    root_j = next(k for k, b in enumerate(bones) if b['parent'] < 0)
    pj = parent_of.get(joints[root_j])
    G = m_mul(G, wm[pj] if pj is not None else m_ident())

    # quantize over the whole mesh (one part, so one range)
    lo = [min(v[c] for v in verts) for c in range(3)]
    hi = [max(v[c] for v in verts) for c in range(3)]
    span = max(hi[c] - lo[c] for c in range(3)) or 1e-6
    qs = span / 32000.0
    qpos = []
    for v in verts:
        for c in range(3):
            qpos.append(max(-32768, min(32767, int(round((v[c] - lo[c]) / qs)) - 16000)))
    qnor = []
    for n in norms:
        L = math.sqrt(sum(c * c for c in n)) or 1.0
        for c in range(3):
            qnor.append(max(-127, min(127, int(round(n[c] / L * 127)))))
    # FBX2glTF leaves unweighted vertices as NaN (180 of them in the Ross rig,
    # all pointing at joint slot 0). NaN survives normalization and poisons the
    # quantizer, so those fall back to full weight on their first joint.
    qji, qjw = [], []
    for ji, jw in zip(jidx, jwgt):
        jw = [w if w == w else 0.0 for w in jw]
        tot = sum(jw)
        if tot <= 0:
            jw, tot = [1.0, 0.0, 0.0, 0.0], 1.0
        for c in range(4):
            qji.append(int(ji[c]))
            qjw.append(max(0, min(255, int(round(jw[c] / tot * 255)))))

    # Headshot zone. A skin is ONE mesh, so the old per-mesh `userData.isHead`
    # flag has nothing to hang on: instead every triangle is classified by the
    # bone carrying most of its weight, head triangles are sorted to the end of
    # their material group, and the runtime gets the face ranges (a handful of
    # them) to test a raycast's faceIndex against.
    hb = {jindex[n] for n in cfg.get('headBones', []) if n in jindex}
    def is_head(t):
        if not hb:
            return 0
        acc = {}
        for vi in t[:3]:
            for j, w in zip(jidx[vi], jwgt[vi]):
                acc[int(j)] = acc.get(int(j), 0.0) + (w if w == w else 0.0)
        return 1 if max(acc, key=acc.get) in hb else 0

    tris = [(t[0], t[1], t[2], t[3], is_head(t)) for t in tris]
    tris.sort(key=lambda t: (t[3], t[4]))
    idx, groups, cur, start = [], [], None, 0
    for t in tris:
        if t[3] != cur:
            if cur is not None:
                groups.append({'mat': cur, 'start': start, 'count': len(idx) - start})
            cur, start = t[3], len(idx)
        idx.extend(t[:3])
    groups.append({'mat': cur, 'start': start, 'count': len(idx) - start})
    # head triangles now form one contiguous run per material group
    head, run = [], None
    for f, t in enumerate(tris):
        if t[4] and run is None:
            run = f
        elif not t[4] and run is not None:
            head.append([run, f - run]); run = None
    if run is not None:
        head.append([run, len(tris) - run])
    big = len(verts) > 65535

    return {'credit': cfg['credit'], 'skin': {
        'qo': [round(lo[c] + 16000 * qs, 6) for c in range(3)],
        'qs': qs,
        'nv': len(verts),
        'pos': b64('h', qpos),
        'nor': b64('b', qnor),
        'ji': b64('B', qji),
        'jw': b64('B', qjw),
        'idx': b64('I' if big else 'H', idx),
        'i32': big,
        'groups': groups,
        'head': head,
        'bones': bones,
        'ibm': [round(v, 6) for m in ibm for v in m],
        'xform': [round(v, 6) for v in G],
    }}


def probe_skinned(key, cfg):
    """--probe for a skinned bake: bone tree, span and bind-pose extents."""
    d = build_skinned(key, cfg)['skin']
    print('-- %s (skinned) verts %d  tris %d' % (
        key, d['nv'], sum(g['count'] for g in d['groups']) // 3))
    print('   materials:', sorted({g['mat'] for g in d['groups']}))
    x = d['xform']
    sc = math.sqrt(x[0] ** 2 + x[1] ** 2 + x[2] ** 2)
    print('   xform scale %.5f' % sc)
    for i, b in enumerate(d['bones']):
        print('   %2d %-28s parent %s' % (i, b['name'], b['parent']))
    # Bind-pose joint origins in FINAL space (metres), so the numbers match the
    # units the game poses in. The skeleton hangs under `xform`, but the source
    # joint world matrices include the Armature node that `xform` also carries -
    # divide it back out or every origin comes back scaled by the rig's ~350x.
    g, binc = read_glb(os.path.join(SRC, cfg['file']))
    wm = world_matrices(g)
    skin = g['skins'][0]
    parent_of = {}
    for i, n in enumerate(g['nodes']):
        for c in n.get('children', []):
            parent_of[c] = i
    root_j = next(j for j in skin['joints']
                  if g['nodes'][parent_of[j]].get('name', '') not in
                  {g['nodes'][x].get('name', '') for x in skin['joints']})
    A = wm[parent_of[root_j]]
    M = m_mul(d['xform'], m_inv(A))
    print('   bind-pose joint origins (final space, metres):')
    for k, j in enumerate(skin['joints']):
        w = wm[j]
        p = xf_point(M, (w[12], w[13], w[14]))
        print('     %-28s [%+.4f %+.4f %+.4f]' % (
            g['nodes'][j].get('name', '?'), p[0], p[1], p[2]))


# --------------------------------------------------------------------- models

MODELS = {
    # LSPD drone body (PATROL). Baked as a REAL SKIN, not as rigid parts
    # (2026-08-19, user call): the rigid split cracked open at every seam once
    # two limbs rotated apart, and the baked-in finger curl froze one pose into
    # the geometry. A skin deforms with the bones and stays closed, and the
    # rig ships in its NEUTRAL BIND POSE - every stance and animation is now
    # runtime work (js/enemies.js), nothing is baked.
    'sentinel': {
        'file': 'Ross by joney_lol - mNvWmEA4O4.glb',
        'credit': 'Ross by joney_lol [CC-BY] via Poly Pizza',
        'skin': True,
        # no 'rot': unlike the weapon meshes, this rig's own mesh node already
        # carries the Z-up -> Y-up conversion, and the bake now measures the
        # real bind pose (skin matrices applied), which comes out Y-up already
        'height': 2.15,           # total height in metres after scaling
        'ground': True,           # drop feet to y = 0
        # a skin is one mesh, so headshots ride on baked triangle ranges
        'headBones': ['head'],
    },
    # service pistol
    'glock': {
        'file': 'Glock by J-Toastie - q3lsX3tSta.glb',
        'credit': 'Glock by J-Toastie [CC-BY] via Poly Pizza',
        'fallback': 'body',
        'nodes': {'Body': 'body', 'Trigger': 'body', 'Mag': 'body',
                  'Chamber': 'body', 'Bullet': 'body',
                  'Slide': 'slide', 'Barrel': 'slide'},
        'rot': [('y', 90)],
        'length': 0.30,           # barrel axis runs along local -Z
        'center': True,
        'order': ['body', 'slide'],
    },
    # SMG (weapon slot 2); Quaternius guns pack, muzzle at +X
    'smg': {
        'file': 'Submachine Gun by Quaternius - nsP3JukU73.glb',
        'credit': 'Submachine Gun by Quaternius [CC0] via Poly Pizza',
        'fallback': 'body',
        'nodes': {},
        'rot': [('y', 90)],
        'length': 1.00,
        'center': True,
        'order': ['body'],
    },
    # pump shotgun (weapon slot 3); Quaternius guns pack, muzzle at +X
    'shotgun': {
        'file': 'Shotgun by Quaternius - DcNE0HVdW8.glb',
        'credit': 'Shotgun by Quaternius [CC0] via Poly Pizza',
        'fallback': 'body',
        'nodes': {},
        'rot': [('y', 90)],
        'length': 1.45,
        'center': True,
        'order': ['body'],
    },
    # automatic rifle (weapon slot 4); static low-poly, muzzle at +X
    'rifle': {
        'file': 'Assault Rifle by Quaternius - Bgvuu4CUMV.glb',
        'credit': 'Assault Rifle by Quaternius [CC0] via Poly Pizza',
        'fallback': 'body',
        'nodes': {},
        'rot': [('y', 90)],
        'length': 1.05,
        'center': True,
        'order': ['body'],
    },
    # sniper rifle (weapon slot 5); static low-poly, muzzle at +X
    'sniper': {
        'file': 'Sniper Rifle by Quaternius - ASOMZIErq3.glb',
        'credit': 'Sniper Rifle by Quaternius [CC0] via Poly Pizza',
        'fallback': 'body',
        'nodes': {},
        'rot': [('y', 90)],
        'length': 1.58,
        'center': True,
        'order': ['body'],
    },
    # first-person arms for the player viewmodels (BRON-2); one skinned mesh
    # with both arms. Split into ANIMATABLE parts: forearm+palm per side plus
    # every finger segment as its own part with a knuckle pivot - the finger
    # CURL is applied at RUNTIME per weapon (js/hands.js), because every gun is
    # held differently (pistol grip vs pump vs handguard vs trigger finger).
    # The UPPER arms are cut (mapped to a part outside 'order'): a viewmodel
    # arm ends mid-forearm off-frame like every FPS - the shoulder mass would
    # fill half the screen from this close.
    # bindWorld: the armature carries scale 188 vs the mesh node's 56, so the
    # IBMs do not cancel against the node graph (same story as the Mossberg).
    # first-person arms for the player viewmodels (BRON-2); one skinned mesh
    # with both arms. Baked as a REAL SKIN (bones + weights), not as rigid
    # parts: splitting a skinned mesh by dominant joint cracks open along every
    # seam the moment two parts rotate apart, and dropping the upper arm left a
    # hollow, open cross-section at the elbow. Both were visible as holes.
    # The whole arm ships, shoulder included - the near plane clips whatever
    # ends up behind the camera, which is how first-person arms are meant to
    # work anyway.
    'arms': {
        'file': 'Rigged Fps Arms by J-Toastie - XdHWM8uSAO.glb',
        'credit': 'Rigged FPS Arms by J-Toastie [CC-BY] via Poly Pizza',
        'skin': True,
        # source arms run along +X; the game wants fingers down -Z (barrel axis)
        'rot': [('y', 90)],
        # scale by a BONE SPAN, not the bbox: the shoulder now ships, so a bbox
        # would shrink the part that is actually on screen
        'normPair': ('LowerArm.R.001', 'IndexTip.R.001'),
        'length': 0.42,           # elbow -> index fingertip joint
    },
}


def build(key, cfg, probe=False):
    g, binc = read_glb(os.path.join(SRC, cfg['file']))
    pose = build_pose(g, binc, cfg)
    pose.update(build_curl(g, binc, cfg))
    parts = extract(g, binc, cfg, pose)
    piv = joint_pivots(g, binc, cfg)
    sock_tbl = {j: s for s, j in cfg.get('sockets', {}).items()}
    socks = joint_pivots(g, binc, cfg, sock_tbl) if sock_tbl else {}
    socks.update(joint_centroids(g, binc, cfg, cfg.get('vertexSockets', {}), pose))
    # global transform: orient -> scale -> ground/center
    G = m_ident()
    for axis, deg in cfg.get('rot', []):
        G = m_mul({'x': m_rot_x, 'y': m_rot_y, 'z': m_rot_z}[axis](deg), G)
    # bbox over the parts that are actually SHIPPED (cfg['order']) - a part
    # mapped outside 'order' is dropped by pack(), so letting it size the
    # model normalizes 'length'/'height' against geometry nobody ever sees
    # (the arms rig: 'cut' upper arms made the visible forearm ~2x too big)
    shipped = [parts[n] for n in cfg['order'] if n in parts]
    allv = [xf_point(G, v) for p in shipped for v in p.verts]
    lo = [min(v[c] for v in allv) for c in range(3)]
    hi = [max(v[c] for v in allv) for c in range(3)]
    if 'height' in cfg:
        s = cfg['height'] / (hi[1] - lo[1])
    elif 'length' in cfg:
        s = cfg['length'] / (hi[2] - lo[2])
    else:
        s = 1.0
    G = m_mul(m_scale(s), G)
    lo = [v * s for v in lo]
    hi = [v * s for v in hi]
    shift = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -(lo[2] + hi[2]) / 2]
    if cfg.get('ground'):
        shift[1] = -lo[1]
    if not cfg.get('center') and not cfg.get('ground'):
        shift = [0, 0, 0]
    G = m_mul(m_translate(shift), G)
    NG = m_transpose(m_inv(G))
    socks = {k: xf_point(G, v) for k, v in socks.items()}
    for name, p in parts.items():
        p.verts = [xf_point(G, v) for v in p.verts]
        p.norms = [xf_dir(NG, n) for n in p.norms]
        if name in piv:
            p.pivot = xf_point(G, piv[name])
        else:
            p.pivot = (0.0, 0.0, 0.0)
        # geometry is stored relative to its pivot so the runtime can rotate it
        px, py, pz = p.pivot
        p.verts = [(v[0] - px, v[1] - py, v[2] - pz) for v in p.verts]
    if probe:
        print('--', key, 'scale %.5f' % s)
        for name in cfg['order']:
            p = parts[name]
            xs = [v[0] + p.pivot[0] for v in p.verts]
            ys = [v[1] + p.pivot[1] for v in p.verts]
            zs = [v[2] + p.pivot[2] for v in p.verts]
            print('   %-6s tris %5d  piv %s  x[%.3f %.3f] y[%.3f %.3f] z[%.3f %.3f]' % (
                name, len(p.tris), tuple(round(v, 3) for v in p.pivot),
                min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
        mats = sorted({t[3] for p in parts.values() for t in p.tris})
        print('   materials:', mats)
        for k, v in socks.items():
            print('   socket %-6s %s' % (k, tuple(round(c, 3) for c in v)))
        missing = set(parts) - set(cfg['order'])
        if missing:
            print('   !! parts not in order:', missing)
        return None
    packed = pack(parts, cfg['order'])
    out = {'credit': cfg['credit'], 'parts': packed}
    if socks:
        out['sockets'] = {k: [round(c, 4) for c in v] for k, v in socks.items()}
    return out


def main():
    probe = '--probe' in sys.argv
    out = {}
    for key, cfg in MODELS.items():
        if cfg.get('skin'):
            if probe:
                probe_skinned(key, cfg)
                continue
            out[key] = build_skinned(key, cfg)
            continue
        r = build(key, cfg, probe)
        if r:
            out[key] = r
    if probe:
        return
    body = ',\n'.join('  %s: %s' % (k, json.dumps(v, separators=(',', ':')))
                      for k, v in out.items())
    src = ("'use strict';\n"
           "/* GENERATED by tools/gen_models.py - do not edit by hand.\n"
           "   Geometry only (quantized, base64): positions int16 + normals int8,\n"
           "   split into parts with pivots. Materials stay procedural.\n"
           "   Sources (CC-BY, see README):\n"
           + ''.join('     %s\n' % v['credit'] for v in out.values())
           + "*/\n\nconst MODEL_DATA = {\n" + body + "\n};\n")
    open(OUT, 'w').write(src)
    print('wrote %s (%.0f KB)' % (OUT, len(src) / 1024))


main()
