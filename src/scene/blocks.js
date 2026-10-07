/** The 404's blocks: in place, falling, on the ground or carried; their cracks, the dashed gaps, and where fallen blocks land. */
function siteBlocks(ctx) {
  const {
    hull, poly, seg, clamp, mk, spring, stepS, depth, TAU, wrap, smooth, SZ, SD, JIB, PILE, MIXER, PALLET, DUMP, LOAD,
    slots, slotAt, P, S, VIEW, LIGHT, layer, item, setD, flag, rring, ringAt, hash, makeShadow, story, still,
  } = ctx;

  // ---------------------------------------------------------------- a block, as a solid
  // A precast concrete block, SZ across, SD deep and SZ tall, with a small chamfer cut on every edge. In its
  // own frame it is centred on the origin: u across, v deep, w up. Each corner of the box is cut into three
  // points, one on each face it touches, so the solid has 6 faces, 12 chamfers and 8 corner facets.
  const HA = SZ / 2, HB = SD / 2, HC = SZ / 2, CH = 0.85, HALF = [HA, HB, HC];
  const VS = [];
  for (let c = 0; c < 8; c++) {
    const a = c & 4 ? 1 : -1, b = c & 2 ? 1 : -1, w = c & 1 ? 1 : -1;
    VS.push([a * HA, b * (HB - CH), w * (HC - CH)], [a * (HA - CH), b * HB, w * (HC - CH)], [a * (HA - CH), b * (HB - CH), w * HC]);
  }
  const at = (a, b, w, f) => ((a > 0 ? 4 : 0) | (b > 0 ? 2 : 0) | (w > 0 ? 1 : 0)) * 3 + f;
  const FACES = [], MAIN = {};
  for (const s of [-1, 1]) {
    MAIN["u" + s] = FACES.push({ n: [s, 0, 0], v: [at(s, -1, -1, 0), at(s, 1, -1, 0), at(s, 1, 1, 0), at(s, -1, 1, 0)] }) - 1;
    MAIN["v" + s] = FACES.push({ n: [0, s, 0], v: [at(-1, s, -1, 1), at(1, s, -1, 1), at(1, s, 1, 1), at(-1, s, 1, 1)] }) - 1;
    MAIN["w" + s] = FACES.push({ n: [0, 0, s], v: [at(-1, -1, s, 2), at(1, -1, s, 2), at(1, 1, s, 2), at(-1, 1, s, 2)] }) - 1;
  }
  const R2 = Math.SQRT1_2, R3 = 1 / Math.sqrt(3);
  // each chamfer knows the two faces it joins and the edge it shares with each: the chamfer's crisp lines
  for (const p of [-1, 1]) for (const q of [-1, 1]) {
    FACES.push({ n: [p * R2, q * R2, 0], v: [at(p, q, -1, 0), at(p, q, -1, 1), at(p, q, 1, 1), at(p, q, 1, 0)],
      adj: [[MAIN["u" + p], at(p, q, -1, 0), at(p, q, 1, 0)], [MAIN["v" + q], at(p, q, -1, 1), at(p, q, 1, 1)]] });
    FACES.push({ n: [p * R2, 0, q * R2], v: [at(p, -1, q, 0), at(p, 1, q, 0), at(p, 1, q, 2), at(p, -1, q, 2)],
      adj: [[MAIN["u" + p], at(p, -1, q, 0), at(p, 1, q, 0)], [MAIN["w" + q], at(p, -1, q, 2), at(p, 1, q, 2)]] });
    FACES.push({ n: [0, p * R2, q * R2], v: [at(-1, p, q, 1), at(1, p, q, 1), at(1, p, q, 2), at(-1, p, q, 2)],
      adj: [[MAIN["v" + p], at(-1, p, q, 1), at(1, p, q, 1)], [MAIN["w" + q], at(-1, p, q, 2), at(1, p, q, 2)]] });
  }
  for (let c = 0; c < 8; c++) FACES.push({ n: [(c & 4 ? 1 : -1) * R3, (c & 2 ? 1 : -1) * R3, (c & 1 ? 1 : -1) * R3], v: [c * 3, c * 3 + 1, c * 3 + 2] });

  /** A turn as a 3×3 matrix by rows: yaw about z, then pitch about the block's own u axis, then roll about its v axis. */
  function turn(yaw, pitch = 0, roll = 0) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const m3 = sp * sr, m4 = cp, m5 = -sp * cr;
    return [cy * cr - sy * m3, -sy * m4, cy * sr - sy * m5, sy * cr + cy * m3, cy * m4, sy * sr + cy * m5, -cp * sr, sp, cp * cr];
  }
  const mul = (A, B) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
  const app = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  /** How far a turned block reaches below its centre: its lowest corner. */
  const lowest = (R) => { let m = 0; for (const v of VS) { const d = -(R[6] * v[0] + R[7] * v[1] + R[8] * v[2]); if (d > m) m = d; } return m; };
  /** Lit from above and the viewer's left: 3 a face toward the light, 2 a side, 1 in shade (the block's base fill). */
  const toneB = (n) => { const l = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]; return l >= 0.62 ? 3 : l >= 0.15 ? 2 : 1; };
  // the camera as an affine map: world (x, y, z) lands on the screen at O + (AX, AY)·(x, y, z)
  const O = P(0, 0, 0), AX = [0, 1, 2].map((k) => P(+(k === 0), +(k === 1), +(k === 2))[0] - O[0]), AY = [0, 1, 2].map((k) => P(+(k === 0), +(k === 1), +(k === 2))[1] - O[1]);

  /** Fine pores and aggregate specks, fixed to each face of one block: [face, grit?, points as u, v, w runs]. */
  function specksFor(seed) {
    const out = [];
    for (let fi = 0; fi < 6; fi++) {
      const n = FACES[fi].n, ax = n[0] ? 0 : n[1] ? 1 : 2, [e0, e1] = [0, 1, 2].filter((i) => i !== ax);
      const area = HALF[e0] * HALF[e1], pores = Math.round(area / 6.5), grits = Math.round(area / 15);
      for (let i = 0; i < pores + grits; i++) {
        const h = (k) => hash(seed * 7.13 + fi * 41.7 + i * 13.37 + k * 3.11);
        const grit = i >= pores, r = grit ? 0.22 + 0.14 * h(3) : 0.12 + 0.15 * h(3), c = [0, 0, 0];
        c[ax] = n[ax] * HALF[ax];
        c[e0] = (h(1) * 2 - 1) * (HALF[e0] - CH - 0.7);
        c[e1] = (h(2) * 2 - 1) * (HALF[e1] - CH - 0.7);
        const pts = [];
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * TAU + h(4) * 3, rr = r * (0.6 + 0.7 * h(5 + j)), p = c.slice();
          p[e0] += Math.cos(a) * rr; p[e1] += Math.sin(a) * rr;
          pts.push(...p);
        }
        out.push([fi, grit, pts]);
      }
    }
    return out;
  }

  /**
   * The faces of a block whose centre is C, turned by R, that the viewer sees: its outline (the hull), the
   * lit and the side faces (the shaded ones are the base fill under them), the chamfers' crisp lines, and
   * its pores and specks.
   */
  function solidPaths(b, C, R) {
    // the camera is a parallel projection, so the block's frame maps to the screen by one 2×3 matrix and an offset
    const mx = [0, 1, 2].map((k) => AX[0] * R[k] + AX[1] * R[3 + k] + AX[2] * R[6 + k]);
    const my = [0, 1, 2].map((k) => AY[0] * R[k] + AY[1] * R[3 + k] + AY[2] * R[6 + k]);
    const tx = O[0] + AX[0] * C[0] + AX[1] * C[1] + AX[2] * C[2], ty = O[1] + AY[0] * C[0] + AY[1] * C[1] + AY[2] * C[2];
    const Q = VS.map((v) => [tx + mx[0] * v[0] + mx[1] * v[1] + mx[2] * v[2], ty + my[0] * v[0] + my[1] * v[1] + my[2] * v[2]]);
    const tone = [], facing = [];
    for (const f of FACES) {
      const n = app(R, f.n), d = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
      tone.push(d > 1e-3 ? toneB(n) : 0); facing.push(d);
    }
    let mid = "", top = "", cr = "", pore = "", grit = "";
    FACES.forEach((f, i) => {
      if (tone[i] === 2) mid += poly(f.v.map((j) => Q[j]));
      else if (tone[i] === 3) top += poly(f.v.map((j) => Q[j]));
      if (f.adj && tone[i]) for (const [m, i0, i1] of f.adj) if (tone[m]) cr += seg(Q[i0], Q[i1]);
    });
    // pores and specks, on faces not seen edge-on, to a tenth of a unit; a block tumbling through the air is a blur of them
    for (const [fi, isGrit, pts] of b.pose && b.pose.fast && b.state === "falling" ? [] : b.specks) {
      if (facing[fi] < 0.25) continue;
      let d = "M";
      for (let j = 0; j < pts.length; j += 3) {
        const u = pts[j], v = pts[j + 1], w = pts[j + 2];
        d += (j ? "L" : "") + Math.round((tx + mx[0] * u + mx[1] * v + mx[2] * w) * 10) / 10 + " " + Math.round((ty + my[0] * u + my[1] * v + my[2] * w) * 10) / 10;
      }
      if (isGrit) grit += d + "Z"; else pore += d + "Z";
    }
    return { sil: poly(hull(Q)), mid, top, cr, pore, grit };
  }

  // ---------------------------------------------------------------- cracks
  /**
   * A fracture on a face, in that face's own coordinates (x across, y up): a jagged trunk from (x, y) heading a,
   * L long and w wide at its root, narrowing to nothing at its tip, with a branch or two. Returns outlines.
   */
  function fracture(seed, x, y, a, L, w, branches = 2) {
    const out = [];
    const limb = (x, y, a, L, w, n, sd) => {
      const pts = [[x, y]], ws = [w];
      let dev = 0;
      for (let i = 1; i <= n; i++) {
        // it wanders, keeping some of its last turn, with a kink now and then
        dev = 0.5 * dev + (hash(sd + i * 1.7) - 0.5) * 0.95;
        const ang = a + dev, st = (L / n) * (0.7 + 0.6 * hash(sd + i * 2.3));
        pts.push([pts[i - 1][0] + Math.cos(ang) * st, pts[i - 1][1] + Math.sin(ang) * st]);
        ws.push(w * Math.pow(1 - i / n, 1.25));
      }
      const l1 = [], l2 = [];
      for (let i = 0; i <= n; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n, i + 1)];
        let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        l1.push([pts[i][0] - (dy * ws[i]) / 2, pts[i][1] + (dx * ws[i]) / 2]);
        l2.push([pts[i][0] + (dy * ws[i]) / 2, pts[i][1] - (dx * ws[i]) / 2]);
      }
      out.push(l1.concat(l2.reverse()));
      return { pts, ws };
    };
    const t = limb(x, y, a, L, w, 7, seed);
    if (branches > 0) {
      const j = 3 + Math.floor(hash(seed + 9) * 2), side = hash(seed + 11) < 0.5 ? -1 : 1;
      limb(t.pts[j][0], t.pts[j][1], a + side * (0.55 + 0.35 * hash(seed + 12)), L * 0.36, t.ws[j] * 0.9, 3, seed + 50);
      if (branches > 1 && hash(seed + 13) < 0.6) limb(t.pts[j - 2][0], t.pts[j - 2][1], a - side * 0.7, L * 0.22, t.ws[j - 2] * 0.7, 2, seed + 80);
    }
    return out;
  }
  // a face's coordinates into the block's frame: the front (v = +HB), the top (w = +HC), the right end (u = +HA)
  const onFront = (pg) => pg.map(([x, y]) => [x, HB + 0.02, y]);
  const onTop = (pg) => pg.map(([x, y]) => [x, y, HC + 0.02]);
  const onEnd = (pg) => pg.map(([x, y]) => [HA + 0.02, x, y]);
  /** The cracks beside a missing neighbour, in the block's frame, by the side it is missing on: "t" above, "l" and "r". */
  function crackShapes(s, side) {
    const sd = s.col * 53 + s.lvl * 19 + (side === "t" ? 0 : side === "l" ? 300 : 600), h = (k) => hash(sd + k * 7.7);
    if (side === "t") {
      const x = (h(1) - 0.5) * (HA - 3);
      return [
        ...fracture(sd, x, HC, -Math.PI / 2 + (h(2) - 0.5) * 0.5, 9 + 2.5 * h(3), 0.75).map(onFront),
        // it runs on over the edge and across the top
        ...fracture(sd + 5, x, HB, -Math.PI / 2 + (h(4) - 0.5) * 0.6, HB + 0.5, 0.5, 0).map(onTop),
      ];
    }
    const dir = side === "l" ? 1 : -1, y = (h(1) * 0.55 - 0.15) * HC;
    const shapes = fracture(sd, -dir * HA, y, (dir > 0 ? 0 : Math.PI) + (h(2) - 0.5) * 0.7, 6.5 + 2.5 * h(3), 0.75).map(onFront);
    if (side === "r") shapes.push(...fracture(sd + 5, HB, y, Math.PI + (h(4) - 0.5) * 0.5, HB + 0.5, 0.55, 0).map(onEnd));
    return shapes;
  }

  // ---------------------------------------------------------------- the 404
  const out = (q) => q && q.block.state !== "slot";
  /** Which of a block's faces show a crack: "t" when the one above is out, "l" and "r" for its sides. */
  const crackFlags = (b) => {
    if (b.state !== "slot") return "";
    const s = b.slot;
    return (out(s.up) ? "t" : "") + (out(s.left) ? "l" : "") + (out(s.right) ? "r" : "");
  };
  const below = new Map(slots.map((s) => [s, slotAt(s.col, s.lvl - 1)]));

  const blocks = slots.map((s) => {
    // the solid moves as one (a translate), and its paths are worked out again only when it turns; its dust stays put beside it
    const g = mk("g", {}, layer), body = mk("g", {}, g), el = { g, body, fx: mk("g", {}, g) };
    el.base = mk("path", { class: "fo blk-shade" }, body);
    el.mid = mk("path", { class: "fo blk" }, body);
    el.top = mk("path", { class: "fo blk-top" }, body);
    el.pore = mk("path", { class: "fo t1" }, body);
    el.grit = mk("path", { class: "fo t5" }, body);
    el.cr = mk("path", { class: "nf" }, body);
    el.crack = mk("path", { class: "sil t1" }, body);
    el.line = mk("path", { class: "nf sil" }, body);
    const b = { slot: s, x: s.cx, y: s.cy, z: s.z0, yaw: 0, state: "slot", el, it: item(g), drawn: "", nudge: spring(0, { eps: 0.02 }) };
    b.flip = 0; b.specks = specksFor(s.col * 17 + s.lvl * 5 + 3); b.cracks = {}; b.sh = makeShadow(); b.was = "slot"; b.inp = [];
    s.block = b;
    if (s.spot) { b.x = s.spot[0]; b.y = s.spot[1]; b.z = 0; b.yaw = ctx.rad(s.spot[2]); b.state = b.was = "ground"; }
    // where the pointer finds it: its rest pose, which never moves
    const ring = rring(s.cx, s.cy, 0, -SZ / 2, -SD / 2, SZ / 2, SD / 2, 2.4);
    s.hit = hull(ringAt(P, ring, s.z0).concat(ringAt(P, ring, s.z0 + SZ)));
    s.mid = P(s.cx, s.cy, s.z0 + SZ / 2);
    s.key = depth(s.cx, s.cy) + s.z0 * 1e-3;
    return b;
  });
  // A dashed outline wherever a block is out.
  const ghosts = slots.map((s) => {
    const g = mk("g", {}, layer);
    const d = poly(hull(VS.map((v) => P(s.cx + v[0], s.cy + v[1], s.z0 + HC + v[2]))));
    return { s, d, el: mk("path", { class: "nf dash hi" }, g), it: item(g, s.key - 1e-4) };
  });

  /** Draws block b; dx, dz are the shake and the wave. A loose block, one a press would knock out, slides a little toward the viewer and rises a little. */
  function drawBlock(b, dx = 0, dz = 0) {
    const n = b.nudge.x, flipP = b.flip ? -Math.PI : 0, flags = crackFlags(b), po = b.pose, tk = b.trk;
    b.it.key = depth(b.x, b.y) + b.z * 1e-3;
    // most blocks stand still: compare what places them before working anything out
    const m = b.inp, same = (i, v) => (m[i] === v ? 0 : ((m[i] = v), 1));
    const changed = same(0, b.state) + same(1, b.x) + same(2, b.y) + same(3, b.z) + same(4, b.yaw) + same(5, n) + same(6, dx) + same(7, dz) + same(8, b.seat ? seatOff(b) : 0) +
      same(9, b.flip) + same(10, flags) + same(11, po) + same(12, tk ? tk.tilt[0] : 0) + same(13, tk ? tk.tilt[1] : 0) + same(14, b.hover);
    if (!changed) return;
    // its turn, in steps of a 150th of a radian: they move a corner less than a fifth of a pixel
    const q = (a) => Math.round(a * 150) / 150;
    let C, R, ang;
    if (b.state === "falling" && po) ang = [b.yaw, po.pitch, po.roll, 0, 0];
    else if (b.state === "carried") ang = [b.yaw, flipP, 0, tk ? tk.tilt[0] : 0, tk ? tk.tilt[1] : 0];
    else ang = [b.yaw, flipP, 0, 0, 0];
    ang = ang.map(q);
    R = turn(ang[0], ang[1], ang[2]);
    if (ang[3] || ang[4]) R = mul(turn(0, ang[3], ang[4]), R);
    if (b.state === "falling" && po) C = [b.x, b.y + n, po.cz];
    else if (b.state === "carried") {
      // hung from the slings at its top, tipped a little by its swing
      const up = app(R, [0, 0, HC]);
      C = [b.x - up[0], b.y + n - up[1], b.z + SZ + (b.hover || 0) - up[2]];
    } else C = [b.x + dx, b.y + n, b.z + dz + n * 0.4 + seatOff(b) + HC];
    const shape = ang.join(",") + flags;
    if (shape !== b.drawn) {
      b.drawn = shape; b.C0 = C;
      const f = solidPaths(b, C, R);
      setD(b.el.base, f.sil); setD(b.el.mid, f.mid); setD(b.el.top, f.top); setD(b.el.cr, f.cr);
      setD(b.el.pore, f.pore); setD(b.el.grit, f.grit); setD(b.el.line, f.sil);
      let cd = "";
      for (const side of flags) {
        const shapes = b.cracks[side] || (b.cracks[side] = crackShapes(b.slot, side));
        for (const pg of shapes) cd += poly(pg.map((p) => P(C[0] + p[0], C[1] + p[1], C[2] + p[2])));
      }
      setD(b.el.crack, cd);
    }
    moveTo(b.el.body, b.C0, C);
    shadowOf(b, C, R, ang[0]);
  }
  /** Sets el's translate to carry what was drawn at world point A over to world point B. */
  function moveTo(el, A, B) {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const sx = Math.round((AX[0] * dx + AX[1] * dy + AX[2] * dz) * 100) / 100, sy = Math.round((AY[0] * dx + AY[1] * dy + AY[2] * dz) * 100) / 100;
    const t = sx || sy ? `translate(${sx} ${sy})` : "";
    if (el.__tr !== t) { el.__tr = t; if (t) el.setAttribute("transform", t); else el.removeAttribute("transform"); }
  }

  /** A soft shadow under each block: along the 404's foot, faint under the 4's arms, and smaller and fainter the higher a block flies. */
  function shadowOf(b, C, R, yaw) {
    const r1 = (v) => Math.round(v * 10) / 10;
    let x, y, rx, ry, th = 0, k;
    if (b.state === "slot") {
      const s = b.slot, h = s.z0;
      if (below.get(s)) k = 0, x = y = rx = ry = 0;
      else x = C[0] + 0.8, y = C[1] + 0.3, rx = HA + 2.4 + h * 0.08, ry = HB + 2.8 + h * 0.08, k = h ? 0.1 : 0.5;
    } else {
      const c = Math.cos(yaw), sn = Math.sin(yaw), ext = (dx, dy) => HALF.reduce((a, H, j) => a + H * Math.abs(dx * R[j] + dy * R[3 + j]), 0);
      const zl = b.state === "ground" ? 0 : Math.max(0, b.z), h = clamp(zl / 80, 0, 1), sc = 1 - 0.35 * h;
      x = C[0] + 0.4; y = C[1] + 0.2;
      rx = r1((ext(c, sn) + 2.2) * sc); ry = r1((ext(-sn, c) + 2.5) * sc); th = Math.round(yaw * 60) / 60; k = 0.46 * (1 - 0.8 * h);
    }
    // drawn about the origin and carried to its place, so a moving block only moves its shadow
    b.sh.set(0, 0, rx, ry, th, k);
    moveTo(b.sh.el, [0, 0, 0], [x, y, 0]);
  }

  const isIn = (s) => s.block.state === "slot";
  /** Out of the 404: on the ground, falling, or on a hook. Only the still mode's put-back reads it. */
  const isOut = (s) => s.block.state !== "slot";
  /** A slot can take its block only once every slot below it in its column is filled, so nothing is ever set above a gap. */
  const placeable = (s) => slots.every((o) => o.col !== s.col || o.lvl >= s.lvl || o.block.state === "slot");

  // ---------------------------------------------------------------- where blocks land
  /** Ground already spoken for: blocks lying there or falling there, and loads on their way down. */
  function taken() {
    const t = [];
    for (const b of blocks) {
      if (b.state === "ground") t.push([b.x, b.y]);
      else if (b.state === "falling") t.push([b.fall.x1, b.fall.y1]);
    }
    for (const k of ctx.cranes) if (k.spot) t.push(k.spot);
    return t;
  }
  const GAP = 20.5;
  const clear = (x, y, t) => t.every(([tx, ty]) => Math.hypot(x - tx, y - ty) >= GAP);
  /**
   * The room findSpot keeps: a little more than clear() asks, because a load a crane sets down lands where its
   * hook has swung to, a few tenths off its mark.
   */
  const ROOM = GAP + 1.2;
  const KEEP = [[...PILE, 28], [...MIXER, 26], [...PALLET, 22], [124, 100, 14], [180, 100, 14], [206, 90, 14], [...DUMP, 18]];
  /** The barrow's runs, from the pile to its turn and on to the mixer: no block may land on them. */
  const RUNS = [[LOAD, [120, 120]], [[120, 120], DUMP]];
  const offRun = (x, y, [[ax, ay], [bx, by]]) => {
    const dx = bx - ax, dy = by - ay, u = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(x - ax - u * dx, y - ay - u * dy);
  };

  /**
   * Where a block from slot s can land: clear ground in front of the 404, in reach of its crane, near its column.
   * Every spot it gives keeps ROOM from every block lying, falling or being set down; when the front is full it
   * looks beside the 404, and only when there is truly no room does it take the roomiest spot.
   */
  function findSpot(s, k) {
    const t = taken();
    const keep = [...KEEP, ...ctx.cranes.map((c) => [c.x, c.y, 28])];
    const yaw = ((story.seq * 47) % 50) - 25;
    let best = null, roomiest = null;
    const consider = (x, y, extra) => {
      const d = Math.hypot(x - k.x, y - k.y);
      // in the crane's reach (a trolley can't run past the jib's end or into the mast) and clear of the props and paths
      if (d < 32 || d > JIB - 12 || keep.some(([kx, ky, r]) => Math.hypot(x - kx, y - ky) < r) || RUNS.some((r) => offRun(x, y, r) < 15)) return;
      let room = 1e9;
      for (const [tx, ty] of t) room = Math.min(room, Math.hypot(x - tx, y - ty));
      if (room >= ROOM) {
        const score = Math.abs(x - s.cx) + Math.abs(y - 44) * 1.6 + extra;
        if (!best || score < best[3]) best = [x, y, yaw, score];
      } else if (!roomiest || room > roomiest[3]) roomiest = [x, y, yaw, room];
    };
    for (let x = -44; x <= 206; x += 3.5) for (let y = 30; y <= 100; y += 3.5) consider(x, y, 0);
    // the front is full: beside the 404, at either end
    if (!best) for (let x = -44; x <= 212; x += 3.5) for (let y = -30; y < 30; y += 3.5) if (x < -16 || x > 189) consider(x, y, 80);
    return (best || roomiest || [s.cx, 22, 0, 0]).slice(0, 3);
  }

  // ---------------------------------------------------------------- the fall
  // A knocked block is pushed out of the wall, tips over its edge and tumbles a half turn forward on a
  // ballistic arc, lands on an edge, slaps flat with a small bounce, skids and rocks to rest. A half turn
  // about its own axis leaves a box as it was, so it settles standing, the way a crane can sling it.
  const G = 140;       // gravity: 1 unit is about 7 cm
  const tipE = (u, u0 = 0.35) => (u < u0 ? (u * u) / (2 * u0) : u - u0 / 2) / (1 - u0 / 2);
  const easeOut = (u) => 1 - (1 - u) * (1 - u);

  function plan(b) {
    const f = b.fall, s = b.slot, seed = s.col * 31 + s.lvl * 17 + Math.round(f.x1 * 3 + f.y1 * 5);
    f.seed = seed;
    f.p0 = b.flip ? -Math.PI : 0;
    // the yaw it settles at: the spot's slight turn (a half turn more or less looks the same on a box)
    let ye = wrap(f.yaw);
    if (ye > Math.PI / 2) ye -= Math.PI; else if (ye < -Math.PI / 2) ye += Math.PI;
    f.ye = ye;
    f.tA = 0.2; f.pA = 3.5;
    f.Pf = f.p0 - Math.PI;
    f.P1 = f.Pf + 0.52 + 0.14 * hash(seed);        // it meets the ground on an edge, a little short of flat
    f.rho = (hash(seed + 1) - 0.5) * 0.8;           // and rolls a little as it goes
    const hI = lowest(turn(0, f.P1, f.rho * Math.sin(0.85 * Math.PI))), Tmin = 0.55;
    f.zc0 = f.z0 + HC;
    // a block low in the wall is knocked up into a hop, so even it has the time to turn over
    f.vz0 = Math.max(5, ((G * Tmin * Tmin) / 2 + hI - f.zc0) / Tmin);
    f.T = (f.vz0 + Math.sqrt(f.vz0 * f.vz0 + 2 * G * (f.zc0 - hI))) / G;
    f.vI = G * f.T - f.vz0;                          // how fast it comes down
    f.vb = Math.max(0.2 * f.vI, G * 0.06);           // a heavy, dull bounce
    f.T2 = (2 * f.vb) / G;
    f.Ts = f.T2 + 0.3;                               // the skid after it lands
    f.TR = 0.5;                                      // the rocking
    const sx = f.x0, sy = f.y0 + f.pA, dx = f.x1 - sx, dy = f.y1 - sy, D = Math.hypot(dx, dy);
    Object.assign(f, { sx, sy, D, ux: D ? dx / D : 0, uy: D ? dy / D : 1 });
    // the speed it leaves with carries it to its spot: the flight, then a skid at 0.4 of that speed
    f.vh = D / (f.T + (0.4 * f.Ts) / 2);
    f.sI = f.vh * f.T;
    f.end = f.tA + f.T + Math.max(f.T2 + f.TR, f.Ts);
  }

  function fall(b, dt) {
    const f = b.fall;
    f.t += dt;
    if (f.t < 0) return;
    if (f.T == null) plan(b);
    const t = f.t;
    if (t >= f.end) {
      Object.assign(b, { state: "ground", x: f.x1, y: f.y1, z: 0, yaw: f.ye, fall: null, pose: null, flip: b.flip ^ 1 });
      return;
    }
    if (t < f.tA) {
      // the push: it slides out of its course, gathering speed
      const u = t / f.tA;
      Object.assign(b, { x: f.x0, y: f.y0 + f.pA * u * u, z: f.z0, yaw: 0, pose: { pitch: f.p0, roll: 0, cz: f.zc0 } });
      return;
    }
    const tf = t - f.tA, yaw = f.ye * smooth(clamp(tf / (f.T + f.T2), 0, 1));
    let s, pitch, roll, cz, zl;
    if (tf < f.T) {
      // the flight: its centre on a parabola, turning over
      const u = tf / f.T;
      s = f.vh * tf;
      pitch = f.p0 + (f.P1 - f.p0) * tipE(u);
      roll = f.rho * Math.sin(0.85 * Math.PI * u);
      cz = f.zc0 + f.vz0 * tf - (G * tf * tf) / 2;
      zl = Math.max(0, cz - lowest(turn(0, pitch, roll)));
    } else {
      const t2 = tf - f.T;
      if (!f.hit) { f.hit = 1; burst(b, f.sx + f.ux * f.sI, f.sy + f.uy * f.sI, 0, yaw, clamp(f.vI / 130, 0.3, 1), 0); }
      s = f.sI + (f.D - f.sI) * easeOut(clamp(t2 / f.Ts, 0, 1));
      if (t2 < f.T2) {
        // the bounce: it slaps over onto its face and lifts a little
        const k = (1 - t2 / f.T2) ** 2;
        pitch = f.Pf + (f.P1 - f.Pf) * k;
        roll = f.rho * Math.sin(0.85 * Math.PI) * k;
        zl = Math.max(0, f.vb * t2 - (G * t2 * t2) / 2);
      } else {
        if (f.hit === 1) { f.hit = 2; if (f.vb > 12) burst(b, f.sx + f.ux * s, f.sy + f.uy * s, 0, yaw, 0.25, 1); }
        // the rock: on past flat the way it turned, then back, and still
        const t3 = t2 - f.T2, d = Math.exp(-7 * t3) * Math.sin(17 * t3);
        pitch = f.Pf - 0.07 * d;
        roll = -0.035 * Math.sign(f.rho) * d;
        zl = 0;
      }
      cz = zl + lowest(turn(0, pitch, roll));
    }
    Object.assign(b, { x: f.sx + f.ux * s, y: f.sy + f.uy * s, z: zl, yaw, pose: { pitch, roll, cz, fast: tf < f.T + f.T2 } });
  }

  /** A carried block tips with its swing: the cable leans the way the load is pushed, read from its own motion. */
  function carry(b, dt) {
    const s = b.slot;
    if (!b.trk) b.trk = { p: [b.x, b.y], v: null, a: [0, 0], tilt: [0, 0] };
    const k = b.trk, v = [(b.x - k.p[0]) / dt, (b.y - k.p[1]) / dt], lp = 1 - Math.exp(-dt / 0.14);
    if (k.v) for (const i of [0, 1]) k.a[i] += (clamp((v[i] - k.v[i]) / dt, -300, 300) - k.a[i]) * lp;
    k.p = [b.x, b.y]; k.v = v;
    const want = [clamp((-0.5 * k.a[1]) / G, -0.06, 0.06), clamp((0.5 * k.a[0]) / G, -0.06, 0.06)];
    for (const i of [0, 1]) k.tilt[i] += (want[i] - k.tilt[i]) * lp;
    // nearly home: it hangs a hair above its bed, then drops onto it when the hook lets go
    b.hover = 0.6 * clamp(1 - (b.z - s.z0) / 10, 0, 1) * clamp(1 - Math.hypot(b.x - s.cx, b.y - s.cy) / 3, 0, 1);
  }
  /** Set down: into its slot it drops the last hair onto its bed and puffs; onto the ground it just puffs. */
  function settle(b) {
    b.seat = { t: 0, h: b.state === "slot" ? b.hover || 0 : 0, hit: false };
  }
  function seatOff(b) {
    const q = b.seat;
    if (!q || b.state !== "slot") return 0;
    const t1 = Math.sqrt((2 * q.h) / G);
    return q.t < t1 ? q.h - (G * q.t * q.t) / 2 : q.t < t1 + 0.09 ? 0.1 * Math.sin((Math.PI * (q.t - t1)) / 0.09) : 0;
  }

  // ---------------------------------------------------------------- dust and chips
  const fx = [];
  /** Dust squeezed out from under a block that hits (kind 0), bounces (1) or is set down (2), and chips from a hard hit. */
  function burst(b, x, y, z, yaw, power, kind) {
    const seed = b.slot.col * 7 + b.slot.lvl * 3 + Math.round(x * 2 + y), g = b.el.fx, n = kind === 0 ? 6 : 3;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    if (z < 0.5) fx.push({ scuff: makeShadow(), x, y, yaw, life: 0, dur: 0.9, k: kind === 0 ? 0.16 + 0.14 * power : 0.12 });
    for (let i = 0; i < n; i++) {
      const h = (k) => hash(seed + i * 5.3 + k * 1.9);
      // from the edge of the block's foot, outward
      const a = ((i + 0.3 + 0.5 * h(1)) / n) * TAU, lu = Math.cos(a) * (HA + 0.4), lv = Math.sin(a) * (HB + 0.6);
      const dx = c * lu - sn * lv, dy = sn * lu + c * lv, l = Math.hypot(dx, dy), sp = (kind === 2 ? 7 : 14) + 22 * power * (0.6 + 0.6 * h(2));
      fx.push({
        el: billow(g, seed + i), x: x + dx, y: y + dy, z: z + 0.4, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: 2 + 5 * h(3),
        r0: 1.2 + 0.6 * h(4), r1: (kind === 2 ? 3 : 5.5) + 4 * power * (0.6 + 0.6 * h(5)), life: 0, dur: 1 + 0.6 * h(6), o: Math.min(1, 0.7 + 0.3 * power), seed: seed + i,
      });
    }
    if (kind) return;
    for (let i = 0; i < 3 + Math.round(2 * power); i++) {
      const h = (k) => hash(seed + 40 + i * 3.7 + k * 2.3), a = yaw + h(1) * TAU, sp = 14 + 22 * h(2) * power;
      fx.push({
        chip: mk("path", { class: "sil blk" }, g), x: x + Math.cos(a) * HA * 0.8, y: y + Math.sin(a) * HB, z: 0.8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        vz: 16 + 20 * h(3) * power, r: 0.45 + 0.4 * h(4), spin: (h(5) - 0.5) * 18, life: 0, dur: 1.5 + 0.4 * h(6), seed: seed + 40 + i,
      });
    }
  }
  /** A puff of dust: three nested lumpy discs of unit size, which its transform swells and moves; nested, they give it a soft edge. */
  function billow(parent, seed) {
    const pg = mk("g", {}, parent);
    for (let k = 0; k < 3; k++) {
      const pts = [], rk = 1 - k * 0.3;
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * TAU, rr = rk * (0.88 + 0.2 * hash(seed * 3.1 + j + k * 17));
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.78 + k * rk * 0.08]);
      }
      mk("path", { class: "fo t4", d: poly(pts) }, pg);
    }
    return pg;
  }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const d = fx[i];
      d.life += dt;
      if (d.el) {
        const drag = Math.exp(-4.5 * dt);
        d.vx *= drag; d.vy *= drag; d.vz *= Math.exp(-1.5 * dt);
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      } else if (d.chip && !d.rest) {
        d.vz -= G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.z <= 0) {
          d.z = 0; d.vz = -d.vz * 0.3; d.vx *= 0.45; d.vy *= 0.45; d.spin *= 0.4;
          if (d.vz < 5) d.rest = true;
        }
      }
      if (d.life >= d.dur) { (d.el || d.chip || d.scuff.el).remove(); fx.splice(i, 1); }
    }
  }
  function drawFx() {
    for (const d of fx) {
      const u = clamp(d.life / d.dur, 0, 1);
      if (d.scuff) {
        const e = easeOut(u);
        d.scuff.set(d.x, d.y, HA + 2 + 8 * e, HB + 2.5 + 7 * e, d.yaw, d.k * (1 - u) * (1 - u));
      } else if (d.el) {
        // a soft billow: it swells, rises a little and thins away
        const r = (d.r0 + (d.r1 - d.r0) * easeOut(u)) * S, [cx, cy] = P(d.x, d.y, d.z + (r / S) * 0.35);
        const o = String(Math.round(((d.o * (1 - u) ** 1.3 * Math.min(1, d.life / 0.05)) / 2.4) * 1000) / 1000);
        const t = `translate(${Math.round(cx * 100) / 100} ${Math.round(cy * 100) / 100}) scale(${Math.round(r * 100) / 100})`;
        if (d.el.__t !== t) { d.el.__t = t; d.el.setAttribute("transform", t); }
        if (d.el.__o !== o) { d.el.__o = o; d.el.setAttribute("fill-opacity", o); }
      } else {
        const [cx, cy] = P(d.x, d.y, d.z + d.r * 0.5), r = d.r * S * Math.min(1, (d.dur - d.life) / 0.3), a0 = d.spin * Math.min(d.life, 0.6), pts = [];
        for (let j = 0; j < 4; j++) {
          const a = a0 + (j / 4) * TAU + hash(d.seed + j) * 0.9, rr = r * (0.6 + 0.6 * hash(d.seed * 1.3 + j));
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75]);
        }
        setD(d.chip, r > 0.05 ? poly(pts) : "");
      }
    }
  }

  function update(dt) {
    for (const b of blocks) {
      if (b.state === "falling") fall(b, dt);
      if (b.state === "carried") carry(b, dt); else { b.trk = null; b.hover = 0; }
      if (b.was === "carried" && b.state !== "carried") settle(b);
      if (b.state !== "slot" && b.state !== "ground") b.seat = null;
      const q = b.seat;
      if (q) {
        q.t += dt;
        const t1 = Math.sqrt((2 * q.h) / G);
        if (!q.hit && q.t >= t1) {
          q.hit = true;
          const s = b.slot;
          burst(b, b.state === "slot" ? s.cx : b.x, b.state === "slot" ? s.cy : b.y, b.state === "slot" ? s.z0 : 0, b.state === "slot" ? 0 : b.yaw, 0.3, 2);
        }
        if (q.t > t1 + 0.2) b.seat = null;
      }
      b.was = b.state;
      stepS(b.nudge, dt);
    }
    stepFx(dt);
  }

  /** on: the slot under the pointer or picked with the keys, or null. */
  function draw(on) {
    const { phase, pt } = story, shaking = phase === "shake", lit = phase === "fixed";
    // what a press on the marked block would bring down: it and every block standing on it
    const loose = on && isIn(on) ? (q) => q.col === on.col && q.lvl >= on.lvl : () => false;
    for (const b of blocks) {
      const picked = b.state === "slot" && loose(b.slot);
      b.nudge.t = picked ? 3 : 0;
      if (still()) b.nudge.x = b.nudge.t;
      const dx = shaking && b.state === "slot" ? Math.sin(pt * 70 + b.slot.col * 1.7) * 0.9 * (1 - pt / 0.8) : 0;
      const w = pt - 0.2 - b.slot.col * 0.06, dz = lit && w > 0 && w < 0.5 ? 3.2 * Math.sin((w / 0.5) * Math.PI) : 0;
      drawBlock(b, dx, dz);
      flag(b.el.line, "hi", b.state !== "ground");
      flag(b.el.g, "loose", picked);
    }
    for (const g of ghosts) setD(g.el, g.s.block.state === "slot" ? "" : g.d);
    drawFx();
  }

  return { blocks, ghosts, isIn, isOut, placeable, taken, clear, findSpot, update, draw };
}
