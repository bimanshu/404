/**
 * The ground: the slab and the marks on it, the hoarding round the back and both sides, and the busy
 * site inside: the raised block yard by the left gate, the stock along the back hoarding, the skip and
 * the scaffold, the right wing round the mixer, and the sand pile, the bag pallet, the cones and the
 * mixer the crew work at. All of it is drawn once; only the mixer's drum moves, and only the items'
 * keys take part in the depth sort.
 */
function siteGround(ctx) {
  const {
    rrect, circ, run, hull, poly, open, lerp, rad, mk, sA, cA, VIEW, depth, front, TAU, GROUND,
    PILE, MIXER, PALLET, P, P3, ground, layer, item, setD, rring, moved, v3, hash, toneOf, facesRight, boxFaces, makeShadow,
  } = ctx;

  // ---------------------------------------------------------------- drawing helpers
  /** Box tones, [shade, lit side, top]: stone and steel read darker, timber and white panels lighter. */
  const STONE = ["t2", "t3", "t5"], TIMBER = ["t3", "t4", "t6"], STEEL = ["t1", "t2", "t4"], WHITE = ["t3", "t5", "t6"];
  const path = (g, cls, d) => (d ? mk("path", { class: cls, d }, g) : null);
  /**
   * While flat is set, a new group lies on the ground layer, in the order made, with its shadow under it, and stays out of the
   * depth sort: for what nothing that moves ever passes in front of or behind.
   */
  let flat = null;
  const group = (key) => { const g = mk("g", {}, flat ? flat.props : layer); if (!flat) item(g, key); return g; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** Local to screen on a frame turned by th about (x, y): u along th, v to its left, z up. */
  const onto = (x, y, th) => { const c = Math.cos(th), s = Math.sin(th); return (u, v, z) => P(x + u * c - v * s, y + u * s + v * c, z); };
  /** Open polylines through local points, one subpath each. */
  const lines = (W, ...ls) => ls.map((l) => open(l.map((p) => W(p[0], p[1], p[2])))).join("");
  const quad = (W, ...ps) => poly(ps.map((p) => W(p[0], p[1], p[2])));
  /** Whether an upright face with this outward normal faces the viewer. */
  const sees = (nx, ny) => nx * sA + ny * cA > 0.03;
  /** The end (a u) and the side (a v) of a box turned by th that face the viewer, or null when turned away. */
  function seen(th, u0, v0, u1, v1) {
    const c = Math.cos(th), s = Math.sin(th);
    return [sees(c, s) ? u1 : sees(-c, -s) ? u0 : null, sees(-s, c) ? v1 : sees(s, -c) ? v0 : null];
  }
  /** A shaded box: its shade, lit side and top as fills, its outline, and a crease b inside the top when asked. */
  function box(g, x, y, th, u0, v0, u1, v1, z0, z1, tones = STONE, r = 0.35, b = 0) {
    const inner = b ? rring(x, y, th, u0 + b, v0 + b, u1 - b, v1 - b, Math.max(0.2, r - b), 2) : null;
    const f = boxFaces(rring(x, y, th, u0, v0, u1, v1, r, 2), z0, z1, inner);
    path(g, "fo " + tones[0], f.sil); path(g, "fo " + tones[1], f.left); path(g, "fo " + tones[2], f.top); path(g, "nf sil", f.sil);
    if (b) path(g, "nf", f.crease);
    return f;
  }
  /** Small boxes that never overlap on screen, merged by tone: four paths however many. q = [x, y, th, u0, v0, u1, v1, z0, z1]. */
  function boxes(g, list, tones = STONE) {
    const d = ["", "", ""];
    for (const q of list) { const f = boxFaces(rring(q[0], q[1], q[2], q[3], q[4], q[5], q[6], 0.25, 1), q[7], q[8]); d[0] += f.sil; d[1] += f.left; d[2] += f.top; }
    path(g, "fo " + tones[0], d[0]); path(g, "fo " + tones[1], d[1]); path(g, "fo " + tones[2], d[2]); path(g, "nf sil", d[0]);
  }
  /** A soft contact shadow, on the ground or (z) on the pad: radii rx, ry about (x, y) turned by th, strength k. */
  function shadow(x, y, rx, ry, th = 0, k = 0.42, z = 0, parent) {
    const s = makeShadow(parent || (flat ? flat.shade : undefined));
    s.set(x, y, rx, ry, th, k);
    if (z) {
      const c = Math.cos(th), sn = Math.sin(th), pts = [];
      for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, u = rx * Math.cos(a), v = ry * Math.sin(a); pts.push(P(x + u * c - v * sn, y + u * sn + v * c, z)); }
      setD(s.el, poly(pts));
    }
    return s;
  }
  /** The shadow under a footprint w by d, a little away from the light. */
  const under = (x, y, th, w, d, z = 0, k = 0.42) => shadow(x + 0.7, y - 0.25, w * 0.62 + 1.8, d * 0.62 + 2, th, k, z);

  /**
   * The faces between two rings of world points sampled alike round a body (A below, B above), in runs
   * of one tone by their normals: { t3: d, ... }. Faces turned away are left out; shift darkens.
   */
  function toneRuns(A, B, shift = 0, out = {}) {
    const n = A.length;
    const tone = (i) => {
      const q = v3.norm(cross(v3.sub(A[(i + 1) % n], A[i]), v3.sub(B[i], A[i])));
      return dot(q, VIEW) > 0 ? "t" + Math.max(1, +toneOf(q).slice(1) - shift) : null;
    };
    let s = 0;
    while (s < n && tone(s)) s++;
    let cur = null, a = [], b = [];
    const flush = () => { if (cur && a.length > 1) out[cur] = (out[cur] || "") + poly(a.concat(b.reverse())); a = []; b = []; };
    for (let k = 0; k < n; k++) {
      const i = (s + k) % n, j = (i + 1) % n, t = tone(i);
      if (t !== cur) { flush(); cur = t; }
      if (t) { if (!a.length) { a.push(P3(A[i])); b.push(P3(B[i])); } a.push(P3(A[j])); b.push(P3(B[j])); }
    }
    flush();
    return out;
  }
  const paint = (g, runs) => { for (const t of ["t1", "t2", "t3", "t4", "t5", "t6"]) path(g, "fo " + t, runs[t]); };
  /** An upright body of revolution at (x, y), profile [[r, z], ...] from the foot up: shade, tone bands and a top cap. Returns its outline. */
  function lathe(g, x, y, prof, shift = 0, n = 24) {
    const rings = prof.map(([r, z]) => Array.from({ length: n }, (_, i) => [x + r * Math.cos((i / n) * TAU), y + r * Math.sin((i / n) * TAU), z]));
    const runs = {};
    for (let k = 0; k + 1 < rings.length; k++) toneRuns(rings[k], rings[k + 1], shift, runs);
    const sil = poly(hull(rings.flat().map(P3)));
    path(g, "fo " + (Object.keys(runs).sort()[0] || "t2"), sil);
    paint(g, runs);
    path(g, "fo t" + Math.max(1, 5 - shift), poly(rings[rings.length - 1].map(P3)));
    return sil;
  }
  /** The arc of a ring at height z that faces the viewer. */
  const arc = (x, y, r, z, n = 24) => open(run(moved(circ(r, n), x, y), front).map((q) => P(q.u, q.v, z)));

  // ---------------------------------------------------------------- the slab and the marks on it
  const PAD = { x0: -117, y0: -14, x1: -80, y1: 74, h: 2.5 };
  {
    const [x0, y0, x1, y1] = GROUND;
    const outer = rrect(x0, y0, x1, y1, 36, 14), inner = rrect(x0 + 2.4, y0 + 2.4, x1 - 2.4, y1 - 2.4, 33.6, 14);
    // a soft drop shadow under the slab: long soft bands along the edges we see, a little to the right of the light
    for (const [sx, sy, rx, ry, deg, k] of [[92, y1 + 1.5, 236, 9, 0, 0.42], [x1 - 1, 48, 96, 4.6, 90, 0.36], [x1 - 21, y1 - 17, 34, 6.5, -45, 0.32], [x0 + 24, y1 - 13, 34, 8, 45, 0.24]]) {
      shadow(sx + 3, sy, rx, ry, rad(deg), k, -7, ground);
    }
    const f = boxFaces(outer, -6, 0, inner);
    path(ground, "fo t2", f.right); path(ground, "fo t3", f.left); path(ground, "fo", f.top); path(ground, "nf sil", f.sil); path(ground, "nf lo", f.crease);

    // saw-cut joints: across the slab between the digits, and along it behind the landing area and the barrow lane
    let d = "";
    for (const x of [-42, 55, 118, 212]) d += open([P(x, -39, 0), P(x, 133, 0)]);
    d += open([P(-119, 30, 0), P(293, 30, 0)]) + open([P(-121, 104, 0), P(293, 104, 0)]);
    path(ground, "nf lo", d);

    // a wet patch where the mixer is washed out, and sand spilled where the barrow is loaded
    shadow(252, 64, 9, 4.5, rad(-30), 0.12, 0, ground);
    let grit = "";
    for (let i = 0; i < 26; i++) {
      const a = hash(i + 7) * TAU, r = Math.sqrt(hash(i + 31)), x = -18 + 9 * r * Math.cos(a), y = 113 + 4 * r * Math.sin(a), d = 0.35 + 0.4 * hash(i + 57);
      grit += open([P(x - d, y, 0), P(x + d, y + d * 0.4, 0)]);
    }
    path(ground, "nf lo", grit);

    // the worn barrow lane, from the sand pile to the mixer
    path(ground, "nf lo dash", open([P(-21, 116, 0), P(-6, 116, 0), P(120, 120, 0), P(234, 80, 0), P(248, 75, 0)]));

    // rebar mesh laid for the next pour, on its chairs
    let m = "";
    for (let i = 0; i <= 10; i++) { const x = 236 + i * 2.8; m += open([P(x, 107, 0.4), P(x, 129, 0.4)]); }
    for (let j = 0; j <= 7; j++) { const y = 108 + (j * 20) / 7; m += open([P(235, y, 0.4), P(265, y, 0.4)]); }
    for (const [x, y] of [[240.2, 111], [259.8, 111], [240.2, 125], [259.8, 125]]) m += open([P(x - 0.7, y, 0), P(x, y, 0.4), P(x + 0.7, y, 0)]);
    path(ground, "nf", m);

    // the stock yard's raised pad
    const pr = rrect(PAD.x0, PAD.y0, PAD.x1, PAD.y1, 4, 4);
    const pf = boxFaces(pr, 0, PAD.h, rrect(PAD.x0 + 0.9, PAD.y0 + 0.9, PAD.x1 - 0.9, PAD.y1 - 0.9, 3.1, 4));
    path(ground, "fo t2", pf.sil); path(ground, "fo t3", pf.left); path(ground, "fo t5", pf.top); path(ground, "nf sil", pf.sil); path(ground, "nf lo", pf.crease);
  }

  // ---------------------------------------------------------------- the hoarding
  const FH = 22, FT = 0.6, MID = [88, 45];
  /**
   * White hoarding along a chain of points, panels about 16 long: the face we see toned by its normal
   * (never darker than t2), the capping rail's top, the panel joints, the capping crease and the kicker
   * line, and a concrete foot at every joint on the side we see.
   */
  function hoarding(g, pts) {
    const faces = {}, top = [], sil = [], ln = [], feet = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / L, ty = (by - ay) / L;
      let nx = -ty, ny = tx;
      if (nx * (MID[0] - ax) + ny * (MID[1] - ay) < 0) nx = -nx, ny = -ny;
      if (!sees(nx, ny)) nx = -nx, ny = -ny;
      const W = (s, o, z) => P(ax + tx * s + nx * o, ay + ty * s + ny * o, z), h = FT / 2;
      const t = "t" + Math.max(2, +toneOf([nx, ny, 0]).slice(1));
      faces[t] = (faces[t] || "") + poly([W(0, h, 0), W(L, h, 0), W(L, h, FH), W(0, h, FH)]);
      top.push(poly([W(0, -h, FH), W(L, -h, FH), W(L, h, FH), W(0, h, FH)]));
      sil.push(poly(hull([0, L].flatMap((s) => [-h, h].flatMap((o) => [W(s, o, 0), W(s, o, FH)])))));
      ln.push(open([W(0, h, FH - 0.9), W(L, h, FH - 0.9)]), open([W(0, h, 1.6), W(L, h, 1.6)]));
      const n = Math.max(1, Math.round(L / 16)), f = Math.atan2(ny, nx);
      for (let k = 0; k <= n; k++) {
        const s = (L * k) / n;
        if (k > 0 && k < n) ln.push(open([W(s, h, 0.3), W(s, h, FH - 0.3)]));
        if (k < n || i === pts.length - 2) feet.push([ax + tx * s, ay + ty * s, f, h, -1, 3.2, 1, 0, 1.5]);
      }
    }
    for (const t in faces) path(g, "fo " + t, faces[t]);
    path(g, "fo t6", top.join("")); path(g, "nf", ln.join("")); path(g, "nf sil", sil.join(""));
    boxes(g, feet, STONE);
  }
  /** A gate post with its cap. */
  const post = (g, x, y) => { box(g, x, y, 0, -1.3, -1.3, 1.3, 1.3, 0, 26, WHITE, 0.3); box(g, x, y, 0, -1.7, -1.7, 1.7, 1.7, 26, 26.9, STONE, 0.3); };
  /** Round the back, from the left gate to the right side: it stands behind everything inside. */
  function backHoarding() {
    const g = group(-1e4);
    shadow(-117.5, 45, 56, 4.5, rad(90), 0.3);
    shadow(88, -40.5, 180, 3, 0, 0.2);
    hoarding(g, [[-122, 100], [-122, -10], [-117.6, -26.5], [-105.5, -38.6], [-89, -43], [264, -43], [280.5, -38.6], [292.6, -26.5], [297, -10]]);
    post(g, -122, 100);
  }
  /** The right side, seen from outside, in two halves so what stands near it inside paints first; the site board on the far half, the gate post on the near one. */
  function sideHoarding(near) {
    const g = group(depth(297, near ? 42.5 : 7.5) + 6);
    hoarding(g, near ? [[297, 25], [297, 60]] : [[297, -10], [297, 25]]);
    if (near) return post(g, 297, 60);
    const S = (y, z) => P(297.8, y, z), board = poly([S(22, 6), S(4, 6), S(4, 17), S(22, 17)]);
    path(g, "fo t4", board);
    path(g, "fo t1", poly([S(22, 14.4), S(4, 14.4), S(4, 17), S(22, 17)]) + poly([S(8.6, 7.4), S(5.4, 7.4), S(5.4, 10.6), S(8.6, 10.6)]));
    path(g, "nf", [[12.6, 15], [11.2, 12], [9.4, 13]].map(([w, z], i) => open([S(20.6, z - i * 1.5 - 0.5), S(20.6 - w, z - i * 1.5 - 0.5)])).join("") + open([S(20.6, 7.6), S(13, 7.6)]));
    path(g, "nf sil", board);
  }

  // ---------------------------------------------------------------- the stock
  /** A slatted pallet, half sizes U by V and 2 high: the fork gaps dark between its runner blocks, board lines. Returns [lines, gaps]. */
  function pallet(g, x, y, th, z0, U, V, tones = TIMBER) {
    const W = onto(x, y, th), [eu, ev] = seen(th, -U, -V, U, V), lo = z0 + 0.45, hi = z0 + 1.55;
    // it is low and mostly under its load: one filled outline in its side tone
    path(g, "sil " + tones[0], boxFaces(rring(x, y, th, -U, -V, U, V, 0.2, 2), z0, z0 + 2).sil);
    let gap = "", ln = "";
    if (ev !== null) {
      for (const [a, b] of [[-U + 2, -1], [1, U - 2]]) gap += quad(W, [a, ev, lo], [b, ev, lo], [b, ev, hi], [a, ev, hi]);
      ln += lines(W, [[-U, ev, lo], [U, ev, lo]], [[-U, ev, hi], [U, ev, hi]]);
    }
    if (eu !== null) {
      for (const [a, b] of [[-V + 1.6, -0.8], [0.8, V - 1.6]]) gap += quad(W, [eu, a, lo], [eu, b, lo], [eu, b, hi], [eu, a, hi]);
      ln += lines(W, [[eu, -V, lo], [eu, V, lo]], [[eu, -V, hi], [eu, V, hi]]);
      for (let k = 1; k < 5; k++) { const v = -V + (2 * V * k) / 5; ln += lines(W, [[eu, v, hi], [eu, v, z0 + 2]]); }
    }
    return [ln, gap];
  }
  const CH = 3.2;
  /** Two hollow cores on the top of a block, along its longer side. */
  function cores(x, y, th, cu, cv, hu, hv, z) {
    const long = hv > hu, d = [];
    for (const s of [-1, 1]) {
      const ou = long ? 0 : (s * hu) / 2, ov = long ? (s * hv) / 2 : 0, a = long ? hu * 0.5 : hu * 0.32, b = long ? hv * 0.32 : hv * 0.5;
      const W = onto(x, y, th), u = cu + ou, v = cv + ov;
      d.push(quad(W, [u - a, v - b, z], [u + a, v - b, z], [u + a, v + b, z], [u - a, v + b, z]));
    }
    return d.join("");
  }
  /**
   * A pallet of blocks: a slatted pallet with three courses of blocks on it, staggered joints on the
   * faces we see and the top, hollow cores on top, two straps. two stacks a second one, a little askew;
   * used leaves the top course on the back half only, its straps cut and one end hanging.
   */
  function blockPallet(x, y, deg, z0, o = {}) {
    const g = group(depth(x, y)), U = 7.5, V = 6, u = U - 0.4, v = V - 0.4;
    under(x, y, rad(deg), 15, 12, z0);
    for (let L = 0; L < (o.two ? 2 : 1); L++) {
      const X = x + L * 0.5, Y = y + L * 0.3, th = rad(deg + L * 2), Z = z0 + L * (2 + 3 * CH), W = onto(X, Y, th);
      let [ln, cd] = pallet(g, X, Y, th, Z, U, V);
      const s0 = Z + 2, top = s0 + 3 * CH, cut = o.used && L === (o.two ? 1 : 0), [eu, ev] = seen(th, -u, -v, u, v);
      const back = ev === -v ? [0, v] : [-v, 0], fv = cut ? (ev === null ? null : back[ev === v ? 1 : 0]) : ev;
      if (cut) { box(g, X, Y, th, -u, -v, u, v, s0, s0 + 2 * CH); box(g, X, Y, th, -u, back[0], u, back[1], s0 + 2 * CH, top); }
      else box(g, X, Y, th, -u, -v, u, v, s0, top);
      // courses and head joints on the faces we see
      for (let k = 0; k < 3; k++) {
        const za = s0 + k * CH, zb = za + CH, top3 = k === 2 && cut, sv = top3 ? fv : ev;
        if (k > 0 && !(cut && k === 2)) { if (ev !== null) ln += lines(W, [[-u, ev, za], [u, ev, za]]); if (eu !== null) ln += lines(W, [[eu, -v, za], [eu, v, za]]); }
        if (sv !== null) for (const ju of k % 2 ? [0] : [-u / 3, u / 3]) ln += lines(W, [[ju, sv, za], [ju, sv, zb]]);
        if (eu !== null) for (const jv of k % 2 ? [-v / 3, v / 3] : [0]) if (!top3 || (jv > back[0] && jv < back[1])) ln += lines(W, [[eu, jv, za], [eu, jv, zb]]);
      }
      // the top: the joints of the top course and its cores; where it is used, the course below shows
      const [va, vb] = cut ? back : [-v, v];
      for (const ju of [-u / 3, u / 3]) ln += lines(W, [[ju, va, top], [ju, vb, top]]);
      if (!cut) ln += lines(W, [[-u, 0, top], [u, 0, top]]);
      for (const cu of [(-2 * u) / 3, 0, (2 * u) / 3]) for (const cv of [-v / 2, v / 2]) if (cv > va && cv < vb) cd += cores(X, Y, th, cu, cv, u / 3, v / 2, top);
      if (cut) {
        const fr = back[0] === 0 ? [-v, 0] : [0, v], jv = back[0] === 0 ? -v / 3 : v / 3, zc = s0 + 2 * CH;
        ln += lines(W, [[0, fr[0], zc], [0, fr[1], zc]], [[-u, jv, zc], [u, jv, zc]]);
        for (const cu of [-u / 2, u / 2]) for (const cv of back[0] === 0 ? [-2 * v / 3] : [2 * v / 3]) cd += cores(X, Y, th, cu, cv, u / 2, v / 3, zc);
        if (ev !== null) { const su = u * 0.55; ln += lines(W, [[su, ev, zc], [su + 0.5, ev, zc - 1.4], [su - 0.2, ev, zc - 2.6], [su + 0.3, ev, zc - 3.4]]); }
      } else {
        for (const su of [-u * 0.55, u * 0.55]) { ln += lines(W, [[su, -v, top], [su, v, top]]); if (ev !== null) ln += lines(W, [[su, ev, top], [su, ev, s0]]); }
      }
      path(g, "fo t1", cd);
      path(g, "nf", ln);
    }
  }
  /** Loose blocks: [u, v, yaw, z] in the item's frame, each L by D by H with its cores on top; drawn far to near. */
  function looseBlocks(x, y, deg, z0, list, L, D, H = 3.2) {
    const g = group(depth(x, y)), th = rad(deg), c = Math.cos(th), s = Math.sin(th);
    under(x, y, th, 11, 7, z0, 0.38);
    const at = list.map(([u, v, yaw, z]) => ({ x: x + u * c - v * s, y: y + u * s + v * c, th: th + rad(yaw), z: z0 + z }));
    at.sort((a, b) => a.z - b.z || depth(a.x, a.y) - depth(b.x, b.y));
    for (const b of at) {
      box(g, b.x, b.y, b.th, -L / 2, -D / 2, L / 2, D / 2, b.z, b.z + H, STONE, 0.3);
      path(g, "fo t1", cores(b.x, b.y, b.th, 0, 0, L / 2, D / 2, b.z + H));
    }
  }
  /** Bearers under a load: small timber boxes across it at the given u. */
  const bearers = (g, x, y, th, us, half, z0, h) => boxes(g, us.map((u) => [x, y, th, u - 0.8, -half, u + 0.8, half, z0, z0 + h]), TIMBER);
  /** A bundle of planks on three bearers: the plank ends a staggered grid on the end we see, layer lines along the side, two steel straps. */
  function timber(x, y, deg, z0, L, D, H, layers = 3, planks = 4) {
    const g = group(depth(x, y)), th = rad(deg), W = onto(x, y, th), [eu, ev] = seen(th, -L / 2, -D / 2, L / 2, D / 2), b = z0 + 1.5, top = b + H;
    under(x, y, th, L, D, z0);
    bearers(g, x, y, th, [-L / 2 + 3, 0, L / 2 - 3], D / 2 + 0.7, z0, 1.5);
    box(g, x, y, th, -L / 2, -D / 2, L / 2, D / 2, b, top, TIMBER, 0.2);
    let ln = "";
    for (let k = 1; k < layers; k++) {
      const z = b + (H * k) / layers;
      if (ev !== null) ln += lines(W, [[-L / 2, ev, z], [L / 2, ev, z]]);
      if (eu !== null) ln += lines(W, [[eu, -D / 2, z], [eu, D / 2, z]]);
    }
    if (eu !== null) for (let k = 0; k < layers; k++) {
      const za = b + (H * k) / layers, zb = b + (H * (k + 1)) / layers, off = k % 2 ? 0.5 : 0;
      for (let p = 1; p < planks + 1; p++) { const v = -D / 2 + (D * (p - off)) / planks; if (v > -D / 2 + 0.4 && v < D / 2 - 0.4) ln += lines(W, [[eu, v, za], [eu, v, zb]]); }
    }
    let st = "";
    for (const su of [-L * 0.28, L * 0.28]) { st += lines(W, [[su, -D / 2, top], [su, D / 2, top]]); if (ev !== null) st += lines(W, [[su, ev, top], [su, ev, b]]); }
    path(g, "nf", ln); path(g, "nf sil", st);
  }
  /** Bundles of bar on timber bearers: bars along the top and side, their ends as small rings on the end we see, a few standing proud, wire ties. */
  function rebar(x, y, deg, L, D, H, n = 1, nb = 3) {
    const g = group(depth(x, y)), th = rad(deg), W = onto(x, y, th), b = 1.5, top = b + H, span = n * D + (n - 1);
    const [eu, ev] = seen(th, -L / 2, -span / 2, L / 2, span / 2);
    under(x, y, th, L, span);
    bearers(g, x, y, th, nb === 3 ? [-L / 2 + 3, 0, L / 2 - 3] : [-L / 2 + 4, L / 2 - 4], span / 2 + 0.8, 0, b);
    const order = Array.from({ length: n }, (_, j) => -span / 2 + D / 2 + j * (D + 1));
    if (ev !== null && ev < 0) order.reverse();
    for (const vc of order) {
      box(g, x, y, th, -L / 2, vc - D / 2, L / 2, vc + D / 2, b, top, STEEL, 1);
      let ln = "", ends = "";
      for (const f of [-0.28, 0, 0.28]) ln += lines(W, [[-L / 2 + 0.8, vc + f * D, top], [L / 2 - 0.8, vc + f * D, top]]);
      const sv = ev === null ? null : vc + Math.sign(ev) * D / 2;
      if (sv !== null) for (const f of [0.35, 0.7]) ln += lines(W, [[-L / 2 + 0.8, sv, b + f * H], [L / 2 - 0.8, sv, b + f * H]]);
      if (eu !== null) {
        for (const zf of [0.3, 0.72]) for (const vf of [-0.36, -0.12, 0.12, 0.36]) {
          const pts = [];
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; pts.push(W(eu, vc + vf * D + 0.32 * Math.cos(a), b + zf * H + 0.32 * Math.sin(a))); }
          ends += poly(pts);
        }
        const out = Math.sign(eu);
        for (const [vf, zf, k] of [[-0.24, 0.72, 1.6], [0.12, 0.3, 0.9], [0.36, 0.72, 2.3]]) ln += lines(W, [[eu, vc + vf * D, b + zf * H], [eu + out * k, vc + vf * D, b + zf * H]]);
      }
      for (const tu of [-L * 0.24, L * 0.26]) { ln += lines(W, [[tu, vc - D / 2, top], [tu, vc + D / 2, top]]); if (sv !== null) ln += lines(W, [[tu, sv, top], [tu, sv, b], [tu + 0.6, sv + Math.sign(ev) * 0.6, b + 0.4]]); }
      path(g, "nf sil", ln); path(g, "nf", ends);
    }
  }
  /** Three planks: two lying side by side and a third across them, just pulled from the bundle. */
  function planks(x, y, deg) {
    const g = group(depth(x, y)), th = rad(deg), c = Math.cos(th), s = Math.sin(th);
    under(x, y, th, 22, 7, 0, 0.32);
    for (const v of [-1.7, 1.7]) box(g, x - v * s, y + v * c, th, -11, -1.1, 11, 1.1, 0, 0.8, TIMBER, 0.1);
    box(g, x + 1.5 * c, y + 1.5 * s, th + rad(20), -11, -1.1, 11, 1.1, 0.8, 1.6, TIMBER, 0.1);
  }

  // ---------------------------------------------------------------- the back strip and its corners
  /** A scaffold bay: two lifts with board decks, end frames, ledgers, cross braces on the far face, guard rails and a toe board. */
  function scaffoldBay(x, y, deg) {
    const g = group(depth(x, y)), th = rad(deg), W = onto(x, y, th), U = 7, V = 4, L1 = 14, L2 = 28, R1 = 31, R2 = 34;
    const [eu, ev] = seen(th, -U, -V, U, V), fu = eu === null ? -U : eu, fv = ev === null ? V : ev, bu = -fu, bv = -fv;
    under(x, y, th, 14, 8, 0, 0.4);
    boxes(g, [-U, U].map((u) => [x, y, th, u - 0.8, -V - 1.3, u + 0.8, V + 1.3, 0, 0.6]), TIMBER);
    const tube = (...ls) => lines(W, ...ls);
    let far = tube([[-U, bv, 0.6], [-U, bv, R2]], [[U, bv, 0.6], [U, bv, R2]], [[bu, fv, 0.6], [bu, fv, R2]]);
    for (const z of [L1, L2]) far += tube([[-U, bv, z], [U, bv, z]], [[bu, -V, z], [bu, V, z]]);
    for (const [za, zb] of [[0.6, L1], [L1, L2]]) far += tube([[-U, bv, za], [U, bv, zb]], [[U, bv, za], [-U, bv, zb]]);
    far += tube([[bu, -V, 0.6], [bu, V, L1]], [[bu, -V, L1], [bu, V, L2]], [[bu, -V, R1], [bu, V, R1]], [[bu, -V, R2], [bu, V, R2]]);
    path(g, "nf", far);
    for (const z of [L1, L2]) {
      box(g, x, y, th, -U, -V, U, V, z - 0.8, z, TIMBER, 0.1);
      path(g, "nf", tube([[-U, -V / 3, z], [U, -V / 3, z]], [[-U, V / 3, z], [U, V / 3, z]]));
    }
    path(g, "fo t4", quad(W, [-U, fv, L2], [U, fv, L2], [U, fv, L2 + 1.3], [-U, fv, L2 + 1.3]));
    let near = tube([[-U, fv, 0.6], [-U, fv, R2]], [[U, fv, 0.6], [U, fv, R2]], [[fu, bv, 0.6], [fu, bv, R2]], [[-U, fv, L2 + 1.3], [U, fv, L2 + 1.3]]);
    for (const z of [L1, L2, R1, R2]) near += tube([[-U, fv, z], [U, fv, z]], [[fu, -V, z], [fu, V, z]]);
    near += tube([[fu, -V, 0.6], [fu, V, L1]], [[fu, V, L1], [fu, -V, L2]]);
    path(g, "nf sil", near);
  }
  /** A steel skip: sloped sides, ribs and lifting lugs, heaped with rubble, a broken block and a plank end. */
  function skip(x, y) {
    const g = group(depth(x, y)), W = onto(x, y, 0);
    under(x, y, 0, 26, 12, 0, 0.46);
    const lug = (s) => { const pts = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; for (const u of [13.4, 15]) pts.push(W(s * u, Math.cos(a), 8 + Math.sin(a))); } return poly(hull(pts)); };
    path(g, "sil t2", lug(-1));
    const base = rring(x, y, 0, -11, -5, 11, 5, 0.6, 1).map((q) => P(q.u, q.v, 0.5)), rim = rring(x, y, 0, -14, -7, 14, 7, 0.6, 1).map((q) => P(q.u, q.v, 11));
    const sil = poly(hull(base.concat(rim)));
    path(g, "fo t1", sil);
    path(g, "fo t2", quad(W, [-11, 5, 0.5], [11, 5, 0.5], [14, 7, 11], [-14, 7, 11]));
    path(g, "fo t1", quad(W, [-13.2, -6.2, 11], [13.2, -6.2, 11], [13.2, 6.2, 11], [-13.2, 6.2, 11]));
    path(g, "nf sil", sil);
    // the rubble, heaped above the rim at the back
    const heap = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; heap.push(W(12.4 * Math.cos(a) * (0.9 + 0.1 * hash(i + 3)), 5.4 * Math.sin(a), 10.7)); }
    for (const [u, v, z] of [[-9, -2, 12.6], [-5, 0.5, 13.8], [-1, -1.5, 14.2], [3, 1, 13.4], [7, -2.5, 13.9], [10.5, -0.5, 12.2], [-11, 1.5, 11.6]]) heap.push(W(u, v, z));
    path(g, "t3", poly(hull(heap)));
    path(g, "nf", lines(W, [[-8, 1, 12.1], [-6.4, 2.6, 11.6], [-4.4, 2, 12.2]], [[1, 2.4, 12.4], [2.6, 3.8, 11.6], [4.6, 3, 12.1]], [[-3, -2.6, 13.4], [-1.4, -1.4, 13.9]], [[8.2, 1.6, 12.4], [9.8, 2.8, 11.6]]));
    box(g, x - 4.8, y + 2.2, rad(24), -2.5, -1.5, 2.5, 1.5, 11.2, 14.2, STONE, 0.2);
    path(g, "sil t4", quad(W, [5.4, -0.6, 12.6], [6.4, 0.4, 12.6], [16.4, -3.6, 17.2], [15.4, -4.6, 17.2]));
    path(g, "nf sil", lines(W, [[-14, 7, 11], [14, 7, 11], [14, -7, 11]], [[-11, 5, 0.5], [11, 5, 0.5], [11, -5, 0.5]]));
    let ribs = lines(W, [[-13.7, 6.85, 10], [13.7, 6.85, 10], [13.7, -6.85, 10]], [[11, 0, 0.5], [14, 0, 11]]);
    for (const f of [-0.5, 0, 0.5]) ribs += lines(W, [[f * 11, 5, 0.5], [f * 14, 7, 11]]);
    path(g, "nf", ribs);
    path(g, "sil t2", lug(1));
  }
  /** Ladder frames leaning on the back hoarding, fanned: the near one whole, the others only their top rail and outer upright. */
  function leaningFrames(x, y) {
    const g = group(depth(x, y));
    shadow(x + 2, y + 2.6, 10, 2.6, 0, 0.32);
    let far = "", near = "";
    for (let i = 0; i < 4; i++) {
      const x0 = x - 7 + 1.2 * i - 1.8, fy = -34.5 + 0.8 * i - 1.2, ty = -42.4 + 0.5 * i, tz = 17 - 0.3 * i;
      const A = (s, f) => P(x0 + s * 12, lerp(fy, ty, f), f * tz);
      if (i < 3) { far += open([A(0, 1), A(1, 1)]) + open([A(1, 0), A(1, 1)]); continue; }
      near += open([A(0, 0), A(0, 1)]) + open([A(1, 0), A(1, 1)]) + open([A(0, 0.06), A(1, 0.5)]);
      for (const z of [5, 11, 16.6]) near += open([A(0, z / tz), A(1, z / tz)]);
    }
    path(g, "nf", far); path(g, "nf sil", near);
  }
  /** A stack of formwork panels on two bearers, with two aluminium soldiers across the top. */
  function formwork(x, y) {
    const g = group(depth(x, y)), W = onto(x, y, 0);
    under(x, y, 0, 20, 10);
    bearers(g, x, y, 0, [-7, 7], 5.6, 0, 1.5);
    box(g, x, y, 0, -10, -5, 10, 5, 1.5, 6, TIMBER, 0.15);
    let ln = "";
    for (let k = 1; k < 4; k++) { const z = 1.5 + (k * 4.5) / 4; ln += lines(W, [[-10, 5, z], [10, 5, z], [10, -5, z]]); }
    path(g, "nf", ln);
    boxes(g, [-5, 5].map((u) => [x, y, 0, u - 1, -6, u + 1, 6, 6, 7]), WHITE);
    path(g, "nf", lines(W, [[-5, -6, 7], [-5, 6, 7]], [[5, -6, 7], [5, 6, 7]]));
  }
  /** Two oil drums, rolling hoops, lids and bungs. */
  function drums(x, y) {
    const g = group(depth(x, y));
    shadow(x + 0.8, y - 0.3, 8.6, 4.8, 0, 0.42);
    for (const u of [-3.1, 3.1]) {
      const cx = x + u, cy = y + (u < 0 ? -0.4 : 0.4), sil = lathe(g, cx, cy, [[3.1, 0], [3.1, 8.5]], 1);
      path(g, "nf", arc(cx, cy, 3.2, 2.8) + arc(cx, cy, 3.2, 5.6) + poly(moved(circ(2.6, 20), cx, cy).map((q) => P(q.u, q.v, 8.5))) + poly(moved(circ(0.45, 10), cx + 1.3, cy - 0.9).map((q) => P(q.u, q.v, 8.5))));
      path(g, "nf sil", sil);
    }
  }
  /** A stack of mesh sheets: layer lines on the sides, the top sheet's bars, their ends standing proud. */
  function meshStack(x, y) {
    const g = group(depth(x, y)), W = onto(x, y, 0);
    under(x, y, 0, 20, 8, 0, 0.38);
    box(g, x, y, 0, -10, -4, 10, 4, 0, 3, STEEL, 0.1);
    let ln = "";
    for (let k = 1; k < 6; k++) { const z = k * 0.5; ln += lines(W, [[-10, 4, z], [10, 4, z], [10, -4, z]]); }
    for (let u = -9; u <= 9; u += 3) ln += lines(W, [[u, -4, 3], [u, 4.8, 3]]);
    for (const v of [-3, 0, 3]) ln += lines(W, [[-10, v, 3], [10.8, v, 3]]);
    path(g, "nf", ln);
  }

  // ---------------------------------------------------------------- the right wing
  /** A water tank (IBC): a pallet base, the white tank in its steel cage, a filler cap on top and a tap at the bottom. */
  function ibc(x, y, deg) {
    const g = group(depth(x, y)), th = rad(deg), W = onto(x, y, th), U = 5.5, V = 4.5, [eu, ev] = seen(th, -U, -V, U, V);
    under(x, y, th, 11, 9);
    const [pl, pg] = pallet(g, x, y, th, 0, U, V, STEEL);
    path(g, "fo t1", pg); path(g, "nf", pl);
    box(g, x, y, th, -U + 0.4, -V + 0.4, U - 0.4, V - 0.4, 2, 10.6, WHITE, 1.5);
    path(g, "t5", poly(moved(circ(1.8, 18), 0, 0).map((q) => W(q.u, q.v, 10.7))));
    let cg = lines(W, [[-U, -V, 11], [U, -V, 11], [U, V, 11], [-U, V, 11], [-U, -V, 11]], [[-U / 3, -V, 11], [-U / 3, V, 11]], [[U / 3, -V, 11], [U / 3, V, 11]]);
    if (ev !== null) { for (const u of [-U, -U / 3, U / 3, U]) cg += lines(W, [[u, ev, 2], [u, ev, 11]]); for (const z of [4.5, 8]) cg += lines(W, [[-U, ev, z], [U, ev, z]]); }
    if (eu !== null) { for (const v of [-V, 0, V]) cg += lines(W, [[eu, v, 2], [eu, v, 11]]); for (const z of [4.5, 8]) cg += lines(W, [[eu, -V, z], [eu, V, z]]); }
    path(g, "nf sil", cg);
    if (eu !== null) {
      const o = Math.sign(eu);
      boxes(g, [[x + Math.cos(th) * (eu + o * 0.7), y + Math.sin(th) * (eu + o * 0.7), th, -0.7, -0.9, 0.7, 0.9, 2.2, 3.6]], STEEL);
      path(g, "nf sil", lines(W, [[eu + o * 1.4, 0, 2.9], [eu + o * 2.2, 0, 2.9], [eu + o * 2.2, 0, 2.3]]));
    }
  }
  /** A tow-behind compressor: the body with its lid seam, louvres and service door, road wheels and mudguards, the drawbar with its jockey wheel, and the hose lying in coils. */
  function compressor(x, y, deg) {
    const g = group(depth(x, y)), th = rad(deg), W = onto(x, y, th), side = sees(-Math.sin(th), Math.cos(th)) ? 1 : -1;
    shadow(x + 0.8, y - 0.2, 20, 9, th, 0.44);
    const tyre = (v, cls) => {
      const pts = [];
      for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; for (const dv of [-0.8, 0.8]) pts.push(W(-4.5 + 3.4 * Math.cos(a), v + dv, 3.4 + 3.4 * Math.sin(a))); }
      path(g, cls, poly(hull(pts)));
    };
    const disk = (u, v, z, r, n = 18) => poly(Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; return W(u + r * Math.cos(a), v, z + r * Math.sin(a)); }));
    tyre(-side * 6.2, "sil t1");
    box(g, x, y, th, -13.5, -5, 4.5, 5, 3.5, 12.5, STONE, 2.5, 1);
    const ring = rring(x, y, th, -13.5, -5, 4.5, 5, 2.5, 3), sv = side * 5;
    let ln = open(run(ring, front).map((q) => P(q.u, q.v, 10.5)));
    let slots = "";
    for (let k = 0; k < 5; k++) { const u = -11.6 + k * 1.7; slots += quad(W, [u, sv, 5.6], [u + 0.7, sv, 5.6], [u + 0.7, sv, 9.4], [u, sv, 9.4]); }
    ln += quad(W, [-2.6, sv, 4.6], [2.8, sv, 4.6], [2.8, sv, 9.8], [-2.6, sv, 9.8]) + lines(W, [[2, sv, 7.6], [2, sv, 6.4]]);
    path(g, "fo t1", slots); path(g, "nf", ln);
    // the hose: from its outlet down to the ground, two loose coils and a tail with its coupling
    const hose = [W(3, sv, 6), W(3.6, sv - side * 1.2, 3.2), P(284.6, 95, 0.5)];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = 0.4 + t * 4 * Math.PI, r = 4 - 0.6 * t, cx = 267.6 - 1.2 * t, cy = 100 + 0.4 * t;
      if (i === 0) hose.push(P(276, 98.6, 0.5));
      hose.push(P(cx + r * Math.cos(a), cy + r * 0.8 * Math.sin(a), 0.5));
    }
    hose.push(P(264, 103.4, 0.5), P(259.6, 104.6, 0.5));
    path(g, "nf sil", open(hose) + open([P(259.4, 103.6, 0.5), P(259.8, 105.6, 0.5)]) + open([P(259.6, 104.6, 0.5), P(258.2, 105, 0.5)]));
    // the drawbar, its hitch eye and the jockey wheel
    let bar = lines(W, [[4.5, -3, 5], [13.5, 0, 3.5], [4.5, 3, 5]], [[11, 0, 4.4], [11, 0, 2.6]]);
    bar += poly(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return W(14.3 + 0.8 * Math.cos(a), 0.8 * Math.sin(a), 3.5); }));
    path(g, "nf sil", bar);
    path(g, "sil t2", disk(11, 0, 1.4, 1.4, 14));
    // the near wheel with its rim and hub, under its mudguard
    tyre(side * 6.2, "sil t1");
    path(g, "t4", disk(-4.5, side * 7.05, 3.4, 2.1));
    path(g, "nf sil", disk(-4.5, side * 7.1, 3.4, 0.6, 10));
    const guard = [];
    for (let i = 0; i <= 12; i++) { const a = rad(10 + (160 * i) / 12); guard.push([-4.5 + 4.3 * Math.cos(a), 3.4 + 4.3 * Math.sin(a)]); }
    path(g, "sil t3", poly(guard.map(([u, z]) => W(u, side * 5.4, z)).concat(guard.slice().reverse().map(([u, z]) => W(u, side * 7.4, z)))));
  }
  /** A column cage lying on two bearers: four corner bars and the stirrups round them. */
  function cage(x, y, deg) {
    const g = group(depth(x, y)), th = rad(deg), W = onto(x, y, th), [, ev] = seen(th, -12, -2.5, 12, 2.5), fv = ev === null ? 2.5 : ev, bv = -fv, z0 = 1, z1 = 6;
    under(x, y, th, 24, 6.5, 0, 0.36);
    bearers(g, x, y, th, [-8, 8], 4, 0, 1);
    let far = lines(W, [[-12, bv, z0], [12, bv, z0]]), near = lines(W, [[-12, fv, z0], [12, fv, z0]], [[-12, fv, z1], [12, fv, z1]], [[-12, bv, z1], [12, bv, z1]]);
    for (let u = -10.5; u <= 10.6; u += 3.5) { far += lines(W, [[u, bv, z0], [u, bv, z1]], [[u, bv, z0], [u, fv, z0]]); near += lines(W, [[u, bv, z1], [u, fv, z1], [u, fv, z0]]); }
    path(g, "nf", far); path(g, "nf sil", near);
  }

  // ---------------------------------------------------------------- the props the crew work at
  /** The sand pile: a slumped cone shaded by its slopes, ripples and runnels, and the bite the shoveler takes from its right side. */
  function sandPile([x, y]) {
    const g = group(depth(x, y)), n = 36;
    shadow(x + 1.5, y - 0.6, 20.5, 16.5, 0, 0.4);
    const wob = (a) => 1 + 0.07 * Math.sin(a * 3 + 1) + 0.03 * Math.sin(a * 7 + 2);
    const PROF = [[1, 0, 0], [0.76, 2.6, 0.2], [0.5, 7.6, 0.55], [0.3, 10.8, 0.8], [0.15, 12.4, 0.95]];
    const at = (k, a) => { const [s, z, m] = PROF[k], w = wob(a); return [x - 3 * m + 17 * s * w * Math.cos(a), y - m + 14 * s * w * Math.sin(a), z]; };
    const rings = PROF.map((_, k) => Array.from({ length: n }, (__, i) => at(k, (i / n) * TAU)));
    const runs = {};
    for (let k = 0; k + 1 < rings.length; k++) toneRuns(rings[k], rings[k + 1], 0, runs);
    const sil = poly(hull(rings.flat().map(P3)));
    path(g, "fo t3", sil); paint(g, runs); path(g, "fo t5", poly(rings[4].map(P3)));
    // ripples across the slope and runnels down it, on the faces we see
    const on = (s, a, z) => { const w = wob(a), m = (z / 12.4) * 0.95; return P(x - 3 * m + 17 * s * w * Math.cos(a), y - m + 14 * s * w * Math.sin(a), z); };
    const sAt = (z) => (z < 2.6 ? 1 - (0.24 * z) / 2.6 : z < 7.6 ? 0.76 - (0.26 * (z - 2.6)) / 5 : 0.5 - (0.2 * (z - 7.6)) / 3.2);
    let tex = "";
    for (const [a0, a1, z] of [[1.6, 2.3, 3.6], [2.0, 2.5, 6.2], [0.9, 1.4, 5], [2.6, 3.0, 2.2], [1.2, 1.7, 8.4], [1.9, 2.2, 9.6]]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const a = a0 + ((a1 - a0) * i) / 6; pts.push(on(sAt(z) + 0.02 * Math.sin(i * 1.7), a, z)); }
      tex += open(pts);
    }
    for (const [a, za, zb] of [[1.75, 1, 5.2], [2.35, 0.6, 3.4], [1.15, 6.2, 9.4]]) tex += open([on(sAt(zb), a, zb), on(sAt((za + zb) / 2), a + 0.05, (za + zb) / 2), on(sAt(za), a + 0.02, za)]);
    // the shovel's bite, facing the shoveler
    const bite = [], floor = [];
    for (let i = 0; i <= 8; i++) {
      const a = -0.18 + (0.62 * i) / 8, e = 1 - ((i - 4) / 4) ** 2;
      bite.push(on(sAt(6.4 - 1.2 * e) , a, 6.4 - 1.2 * e));
      floor.push(on(sAt(2.2) - 0.12 * e, a, 2.2 + 0.3 * e));
    }
    path(g, "fo t2", poly(bite.concat(floor.slice().reverse())));
    tex += open(bite) + open([bite[3], floor[3]]) + open([bite[5], floor[5]]);
    path(g, "nf", tex);
    path(g, "nf sil", sil);
  }
  /**
   * A cement sack: a rounded box whose sides bulge and whose top sags to its corners, shaded like a box,
   * with its folded end and the printed panel on top.
   */
  function sack(g, x, y, th, u0, v0, u1, v1, z0, z1) {
    const W = onto(x, y, th), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, hu = (u1 - u0) / 2, hv = (v1 - v0) / 2, h = z1 - z0, c = Math.cos(th), s = Math.sin(th);
    const ring = rrect(u0, v0, u1, v1, Math.min(hu, hv) * 0.8, 4);
    const at = (q, k, z) => W(cu + (q.u - cu) * k, cv + (q.v - cv) * k, z);
    const sag = (q) => z1 - h * 0.17 * (((q.u - cu) / hu) ** 2 + ((q.v - cv) / hv) ** 2);
    const bot = ring.map((q) => at(q, 0.93, z0)), belly = ring.map((q) => at(q, 1, z0 + h * 0.42)), top = ring.map((q) => at(q, 0.9, sag(q)));
    const sil = poly(hull(bot.concat(belly, top)));
    const wn = (q) => ({ nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c });
    const idx = ring.map((q, i) => i), lit = run(idx, (i) => { const q = wn(ring[i]); return front(q) && !facesRight(q); });
    path(g, "fo t2", sil);
    if (lit.length > 1) path(g, "fo t3", poly(lit.map((i) => top[i]).concat(lit.map((i) => belly[i]).reverse())));
    path(g, "fo t5", poly(top));
    path(g, "nf sil", sil);
    const long = hu > hv, e = long ? hu : hv, fold = (k) => (long ? [cu + k * e, cv - hv * 0.8] : [cu - hu * 0.8, cv + k * e]), fold2 = (k) => (long ? [cu + k * e, cv + hv * 0.8] : [cu + hu * 0.8, cv + k * e]);
    const zt = (p) => z1 - h * 0.17 * (((p[0] - cu) / hu) ** 2 + ((p[1] - cv) / hv) ** 2) + 0.05;
    const L = (p) => W(p[0], p[1], zt(p));
    const pa = long ? [[cu - e * 0.32, cv - hv * 0.42], [cu + e * 0.32, cv - hv * 0.42], [cu + e * 0.32, cv + hv * 0.42], [cu - e * 0.32, cv + hv * 0.42]] : [[cu - hu * 0.42, cv - e * 0.32], [cu + hu * 0.42, cv - e * 0.32], [cu + hu * 0.42, cv + e * 0.32], [cu - hu * 0.42, cv + e * 0.32]];
    path(g, "nf", open([L(fold(0.74)), L(fold2(0.74))]) + poly(pa.map(L)));
  }
  /** The cement bags on their pallet: three across, two along on top. */
  function bagPallet([x, y]) {
    const g = group(depth(x, y));
    under(x, y, 0, 26, 20);
    const [pl, pg] = pallet(g, x, y, 0, 0, 13, 10);
    path(g, "fo t1", pg); path(g, "nf", pl);
    for (const u of [-8.4, 0, 8.4]) sack(g, x + u, y, 0, -3.9, -9.2, 3.9, 9.2, 2, 6);
    for (const v of [-4.6, 4.6]) sack(g, x, y + v, 0, -12.4, -4.3, 12.4, 4.3, 6, 10.2);
  }
  /** A traffic cone: a rubber base, the cone shaded by its slope, a reflective collar. */
  function cone(x, y) {
    const g = group(depth(x, y));
    shadow(x + 0.7, y - 0.2, 5, 5, 0, 0.4);
    box(g, x, y, 0, -3.4, -3.4, 3.4, 3.4, 0, 0.9, STEEL, 0.9);
    const sil = lathe(g, x, y, [[2.5, 0.9], [0.55, 9.2]], 2, 20);
    const r = (z) => 2.5 - (1.95 * (z - 0.9)) / 8.3, f = run(circ(1, 20), front);
    const band = (z) => f.map((q) => P(x + r(z) * q.u, y + r(z) * q.v, z));
    path(g, "fo hv", poly(band(4.2).concat(band(5.9).reverse())));
    path(g, "nf sil", sil);
  }

  // ---------------------------------------------------------------- the mixer
  /** The site mixer: a drum turning on its cradle, its blades seen through the mouth, the motor housing, chassis, two wheels and the tow bar. */
  function makeMixer([x, y], psi) {
    const g = group(depth(x, y)), tilt = rad(26);
    const a = [Math.cos(psi) * Math.cos(tilt), Math.sin(psi) * Math.cos(tilt), Math.sin(tilt)];
    const e1 = [-Math.sin(psi), Math.cos(psi), 0], e2 = cross(a, e1);
    const O = [x - a[0] * 5, y - a[1] * 5, 12.5];
    const dir = (b) => v3.add(v3.mul(e1, Math.cos(b)), v3.mul(e2, Math.sin(b)));
    const at = (t, R, b) => v3.add(v3.add(O, v3.mul(a, t)), v3.mul(dir(b), R));
    const W = onto(x, y, psi), side = sees(-Math.sin(psi), Math.cos(psi)) ? 1 : -1, nearB = side > 0 ? 0 : Math.PI;
    const PROF = [[-3.6, 6.4], [0, 8.8], [8, 8.8], [15, 4.8]];
    const R = (t) => { for (let k = 0; k + 1 < PROF.length; k++) { const [ta, ra] = PROF[k], [tb, rb] = PROF[k + 1]; if (t <= tb) return ra + ((rb - ra) * (t - ta)) / (tb - ta); } return 4.8; };
    const normal = (t, b) => { const k = t < 0 ? 0 : t < 8 ? 1 : 2, [ta, ra] = PROF[k], [tb, rb] = PROF[k + 1]; return v3.norm(v3.sub(v3.mul(dir(b), tb - ta), v3.mul(a, rb - ra))); };
    const vis = (t, b) => dot(normal(t, b), VIEW) > 0;
    const ringP = (t, r, n = 40) => Array.from({ length: n }, (_, i) => P3(at(t, r, (i / n) * TAU)));
    const curve = (fn, n = 48) => { let d = "", pts = []; for (let i = 0; i <= n; i++) { const p = fn(i / n); if (p) pts.push(p); else { if (pts.length > 1) d += open(pts); pts = []; } } return pts.length > 1 ? d + open(pts) : d; };
    const wheel = (v) => { const pts = []; for (let i = 0; i < 20; i++) { const b = (i / 20) * TAU; for (const dv of [-0.8, 0.8]) pts.push(W(-3 + 3.6 * Math.cos(b), v + dv, 3.6 + 3.6 * Math.sin(b))); } return poly(hull(pts)); };
    const disk = (u, v, z, r, n = 18) => poly(Array.from({ length: n }, (_, i) => { const b = (i / n) * TAU; return W(u + r * Math.cos(b), v, z + r * Math.sin(b)); }));
    const trunnion = (sgn) => P3(at(3, 9.8, sgn > 0 ? 0 : Math.PI));

    shadow(x + 1, y - 0.4, 17, 10.5, psi, 0.46);
    // behind the drum: the far wheel and arm, the chassis, the motor and the tow bar
    path(g, "sil t1", wheel(-side * 6.6));
    path(g, "nf sil", open([W(-2, -side * 3.6, 5.4), trunnion(-side), W(6, -side * 3.6, 5.4)]));
    box(g, x, y, psi, -12, -4, 9, 4, 3.4, 5.6, STEEL, 0.6);
    box(g, x, y, psi, -13, -4.4, -6.5, 4.4, 5.6, 12.5, STONE, 1.2, 0.6);
    const [, mv] = seen(psi, -13, -4.4, -6.5, 4.4);
    let vents = "";
    if (mv !== null) for (let k = 0; k < 4; k++) vents += lines(W, [[-12, mv, 7.4 + k * 1.1], [-9, mv, 7.4 + k * 1.1]]);
    path(g, "nf", vents + lines(W, [[-13.4, 0, 12.5], [-13.4, 0, 13.4]]));
    path(g, "nf sil", lines(W, [[9, -2.6, 4.4], [17, 0, 2.2], [9, 2.6, 4.4]], [[14, 0, 3], [14, 0, 0.4]], [[13, -0.9, 0.4], [15, 0.9, 0.4]]) + poly(Array.from({ length: 10 }, (_, i) => { const b = (i / 10) * TAU; return W(17.8 + 0.8 * Math.cos(b), 0.8 * Math.sin(b), 2.2); })));
    // the drum, shaded by its normals
    const N = 48, rings = PROF.map(([t, r]) => Array.from({ length: N }, (_, i) => at(t, r, (i / N) * TAU)));
    const runs = {};
    for (let k = 0; k + 1 < rings.length; k++) toneRuns(rings[k], rings[k + 1], 0, runs);
    const sil = poly(hull(rings.flat().map(P3)));
    path(g, "fo t1", sil); paint(g, runs);
    path(g, "nf", [0, 8].map((t) => curve((u) => { const b = u * TAU; return vis(t + 0.01, b) || vis(t - 0.01, b) ? P3(at(t, R(t), b)) : null; })).join(""));
    path(g, "nf sil", [-2.1, -1.1].map((t) => curve((u) => { const b = u * TAU; return vis(t, b) ? P3(at(t, R(t) + 0.25, b)) : null; })).join(""));
    const seams = mk("path", { class: "nf" }, g), teeth = mk("path", { class: "nf sil" }, g);
    path(g, "nf sil", sil);
    // the mouth: its lip, the dark inside, and the blades turning in it
    const mouthOpen = dot(a, VIEW) > 0, hole = ringP(15.05, 3.9);
    let blades = null;
    if (mouthOpen) {
      path(g, "fo t4", poly(ringP(15, 4.8)));
      path(g, "fo t1", poly(hole));
      blades = mk("path", { class: "nf sil" }, g);
      path(g, "nf sil", poly(ringP(15, 4.8)));
      path(g, "nf", poly(hole));
    }
    const inHole = (p) => { let sgn = 0; for (let i = 0; i < hole.length; i++) { const q = hole[i], r = hole[(i + 1) % hole.length], c = (r[0] - q[0]) * (p[1] - q[1]) - (r[1] - q[1]) * (p[0] - q[0]); if (c) { if (sgn && Math.sign(c) !== sgn) return false; sgn = Math.sign(c); } } return true; };
    // in front: the near arm and its trunnion, the tipping handwheel, the near wheel and its hub
    const tn = trunnion(side), hub = at(3, 11.2, nearB), hw = [];
    for (let i = 0; i < 20; i++) { const b = (i / 20) * TAU; hw.push(P3(v3.add(v3.add(hub, v3.mul(a, 2.4 * Math.cos(b))), [0, 0, 2.4 * Math.sin(b)]))); }
    let spokes = "";
    for (let k = 0; k < 3; k++) { const b = (k / 3) * TAU + 0.5; spokes += open([P3(hub), P3(v3.add(v3.add(hub, v3.mul(a, 2.4 * Math.cos(b))), [0, 0, 2.4 * Math.sin(b)]))]); }
    path(g, "nf sil", open([W(-2, side * 3.6, 5.4), tn, W(6, side * 3.6, 5.4)]) + open([tn, P3(hub)]) + poly(hw) + spokes);
    path(g, "sil t1", wheel(side * 6.6));
    path(g, "t4", disk(-3, side * 7.45, 3.6, 2.2));
    path(g, "nf sil", disk(-3, side * 7.5, 3.6, 0.6, 10));

    const m = { spin: 0, last: null };
    m.draw = () => {
      if (m.spin === m.last) return;
      m.last = m.spin;
      let d = "";
      for (let k = 0; k < 3; k++) d += curve((u) => { const t = u * 14.2, b = m.spin + (k * TAU) / 3 + t * 0.2; return vis(t, b) ? P3(at(t, R(t) + 0.05, b)) : null; }, 36);
      setD(seams, d);
      let e = "";
      for (let i = 0; i < 30; i++) { const b = m.spin + (i * TAU) / 30; if (vis(-1.6, b)) e += open([P3(at(-2.1, 7.95, b)), P3(at(-1.1, 7.95, b))]); }
      setD(teeth, e);
      if (blades) {
        let bl = "";
        for (let k = 0; k < 2; k++) for (const dr of [2.6, 0.2]) bl += curve((u) => { const t = 14.8 - u * 13, b = m.spin + k * Math.PI + (15 - t) * 0.42, p = P3(at(t, R(t) - dr, b)); return inHole(p) ? p : null; }, 40);
        setD(blades, bl);
      }
    };
    return m;
  }

  // ---------------------------------------------------------------- the site, as the plan lays it out
  const Z = PAD.h, at = (x, y, fn, key = depth(x, y)) => ({ key, fn });
  // Behind the 404, in the yard and round the right wing, nothing that moves ever comes near: drawn flat, back to front.
  flat = { shade: mk("g", {}, ground), props: mk("g", {}, ground) };
  backHoarding();
  [
    // the stock yard on its pad, and a fresh delivery by the left gate
    at(-108, -5, () => blockPallet(-108, -5, 0, Z, { two: true })),
    at(-90, -5, () => blockPallet(-90, -5, 0, Z)),
    at(-108, 10, () => blockPallet(-108, 10, 0, Z)),
    at(-90, 10, () => blockPallet(-90, 10, 0, Z, { used: true })),
    at(-108, 33, () => blockPallet(-108, 33, 0, Z, { two: true })),
    at(-90, 33, () => blockPallet(-90, 33, 0, Z)),
    at(-108, 48, () => blockPallet(-108, 48, 0, Z)),
    at(-90, 48, () => blockPallet(-90, 48, 0, Z, { two: true })),
    at(-99, 66, () => timber(-99, 66, 0, Z, 32, 9, 5)),
    at(-110, 21.5, () => looseBlocks(-110, 21.5, 6, Z, [[-1.4, 0, -4, 0], [1.4, 0.2, 5, 0], [0, 0, 84, 3.2]], 5, 2.6)),
    at(-106, 90, () => blockPallet(-106, 90, 0, 0, { two: true })),
    at(-88, 92, () => blockPallet(-88, 92, 6, 0)),
    at(-100, 116, () => cone(-100, 116)),
    at(-84, 126, () => cone(-84, 126)),
    // south of the left crane, and left of the 404: everything moving there is nearer
    at(-65, 70, () => planks(-65, 70, -4)),
    at(-74, 80, () => cone(-74, 80)),
    at(-30, 5, () => blockPallet(-30, 5, 8, 0)),
    at(-12, 14, () => looseBlocks(-12, 14, -14, 0, [[-5.6, 0, 6, 0], [0, 0.3, -5, 0], [5.6, -0.2, 4, 0], [2.8, 0, 90, 3.2]], 5, 3)),
    // the back strip
    at(-104, -25, () => scaffoldBay(-104, -25, -45)),
    at(-50, -28, () => skip(-50, -28)),
    at(-22, -37, () => leaningFrames(-22, -37)),
    at(18, -24, () => timber(18, -24, 0, 0, 30, 8, 3.5, 2)),
    at(150, -23, () => rebar(150, -23, 0, 40, 4, 2.5, 2)),
    at(184, -32, () => blockPallet(184, -32, 0, 0, { two: true })),
    at(201, -32, () => blockPallet(201, -32, 0, 0)),
    at(184, -17, () => blockPallet(184, -17, 0, 0)),
    at(201, -17, () => blockPallet(201, -17, 0, 0, { used: true })),
    at(249, -29, () => formwork(249, -29)),
    at(274, -27, () => drums(274, -27)),
    at(197, 14, () => meshStack(197, 14)),
    // the right wing: the bag pallet, the water tank, the right side of the hoarding and its gate
    at(PALLET[0], PALLET[1], () => bagPallet(PALLET)),
    at(278, 21, () => ibc(278, 21, 90)),
    at(0, 0, () => sideHoarding(false), depth(297, 7.5) + 6),
    at(0, 0, () => sideHoarding(true), depth(297, 42.5) + 6),
    at(290, 67, () => cone(290, 67)),
  ].sort((p, q) => p.key - q.key).forEach((p) => p.fn());
  flat = null;
  // beside the crane footings and where the crew walk: in the depth sort
  timber(-67, 44, 90, 0, 32, 9, 5);
  rebar(-57, 43, 90, 36, 4.5, 2.5);
  cage(230, 35, -6);
  rebar(232, 46, -6, 26, 4.5, 2.5, 1, 2);
  compressor(279, 87, 90);
  sandPile(PILE);
  const mixer = makeMixer(MIXER, rad(140));

  return { mixer, update(dt) { mixer.spin += dt * 1.6; }, draw() { mixer.draw(); } };
}
