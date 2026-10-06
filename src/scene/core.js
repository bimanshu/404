/**
 * The site's shared ground: the camera and its framing, the layout of the 404,
 * the cranes and the crew's places, the drawing layers, and the helpers every
 * part draws with. siteCore(svg, opts) returns them as one ctx.
 */
function siteCore(svg, opts) {
  const {
    Cam, proj, fit, rrect, circ, prism, ringAt, run, hull, poly, open, seg, clamp, lerp, rad, r2,
    mk, solid, place, spring, stepS, reducedMotion,
  } = HL;

  // ---------------------------------------------------------------- camera
  const VW = 800, AZ = 20, K = 0.45, CORE = opts.frame === "core";
  const sA = Math.sin(rad(AZ)), cA = Math.cos(rad(AZ)), ZF = Math.sqrt(1 - K * K);
  /** Toward the viewer, for normals that are not horizontal. */
  const VIEW = [sA * ZF, cA * ZF, K];
  /** Larger is nearer: the painter's key on the ground. */
  const depth = (x, y) => x * sA + y * cA;
  const front = (q) => q.nu * sA + q.nv * cA >= -1e-6;
  const TAU = Math.PI * 2;
  const wrap = (a) => (((a + Math.PI) % TAU) + TAU) % TAU - Math.PI;
  const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerpA = (a, b, t) => a + wrap(b - a) * t;

  // ---------------------------------------------------------------- the site
  /** A block is SZ wide and tall and SD deep, so the digits read as glyphs with some thickness. */
  const SZ = 15, SD = 8, PITCH = 15.8, SL = 7, SAFE = 116, HOOK_GROUND = SZ + 2 + SL, JIB = 178;
  const GROUND = [-125, -46, 300, 136];
  const FOUR = ["X.X", "X.X", "XXX", "..X", "..X"], ZERO = ["XXX", "X.X", "X.X", "X.X", "XXX"];
  /** The blocks that break, by "column,level", and where each lands: x, y, yaw in degrees. */
  const BROKEN = {
    "0,4": [-4, 42, 14], "2,4": [40, 40, -12], "5,4": [82, 60, 18],
    "6,3": [116, 40, -10], "6,4": [134, 62, 16], "10,4": [176, 44, 6],
  };
  const CRANES = [
    { x: -62, y: 4, H: 138, park: rad(16), take: (col) => col <= 5, home: [22, 84] },
    { x: 236, y: 4, H: 154, park: rad(164), take: (col) => col >= 6, home: [196, 82] },
  ];
  const PILE = [-50, 96], MIXER = [272, 52], PALLET = [276, -8];
  /** Where the barrow is loaded and tipped, and where the manager stands. */
  const LOAD = [-6, 116], DUMP = [234, 80], BOSS = [124, 100];

  const slots = [];
  [FOUR, ZERO, FOUR].forEach((digit, d) => digit.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== "X") return;
    const col = d * 4 + c, lvl = 4 - r;
    slots.push({ col, lvl, x0: col * PITCH, z0: lvl * PITCH, cx: col * PITCH + SZ / 2, cy: SD / 2, spot: BROKEN[col + "," + lvl] });
  })));
  const slotAt = (col, lvl) => slots.find((s) => s.col === col && s.lvl === lvl);
  for (const s of slots) { s.up = slotAt(s.col, s.lvl + 1); s.left = slotAt(s.col - 1, s.lvl); s.right = slotAt(s.col + 1, s.lvl); }
  const broken = slots.filter((s) => s.spot);

  // Frame the camera. "full" holds the ground, the crane heads, and every pose the
  // jibs reach. "core" holds the 404, both masts and the crew in front, and lets
  // the ground and the jibs run off the edges, so a tall screen gets a big site.
  // The viewBox is 800 wide and as tall as what it holds.
  const C = Cam(AZ, K, 1), fitPts = [], MARGIN = CORE ? 6 : 12;
  if (CORE) {
    for (const k of CRANES) fitPts.push([k.x - 14, k.y - 14, 0], [k.x + 14, k.y + 14, 0], [k.x, k.y, k.H + 34], [k.x, 124, 0]);
    fitPts.push([0, 0, 5 * PITCH], [10 * PITCH + SZ, SD, 0]);
  } else {
    for (const x of [GROUND[0], GROUND[2]]) for (const y of [GROUND[1], GROUND[3]]) fitPts.push([x, y, -6]);
    for (const k of CRANES) {
      fitPts.push([k.x, k.y, k.H + 34]);
      for (const s of broken.filter((s) => k.take(s.col))) for (const [x, y] of [[s.cx, s.cy], s.spot]) {
        const a = Math.atan2(y - k.y, x - k.x);
        fitPts.push([k.x + JIB * Math.cos(a), k.y + JIB * Math.sin(a), k.H + 9], [k.x - 58 * Math.cos(a), k.y - 58 * Math.sin(a), k.H + 9]);
      }
    }
  }
  let VH;
  {
    const P1 = proj(C);
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const p of fitPts) { const q = P1(p[0], p[1], p[2]); a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
    C.S = (VW - 2 * MARGIN) / (b - a);
    VH = Math.round((d - c) * C.S + 2 * MARGIN);
    fit(C, fitPts, VW / 2, VH / 2);
  }
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  const P = proj(C), S = C.S;
  const P3 = (p) => P(p[0], p[1], p[2]);

  // ---------------------------------------------------------------- drawing helpers
  // Layers, back to front: the ground, soft shadows on it, everything standing (sorted by depth), the crane tops.
  const defs = mk("defs", {}, svg), ground = mk("g", {}, svg), shadows = mk("g", {}, svg), layer = mk("g", {}, svg), tops = mk("g", {}, svg);
  /** Everything that stands on the ground is an item, repainted in depth order. */
  const items = [];
  const item = (g, key = 0) => { const it = { g, key }; items.push(it); return it; };
  const setD = (el, d) => { if (el.__d !== d) { el.__d = d; el.setAttribute("d", d); } };
  const flag = (el, cls, on) => { const k = "__" + cls; if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); } };
  const putC = (el, s) => { setD(el.sil, s.sil); setD(el.cr, s.crease); };

  /** A rounded footprint turned by th about (cx, cy), with its normals turned too. */
  function rring(cx, cy, th, u0, v0, u1, v1, r, n = 4) {
    const c = Math.cos(th), s = Math.sin(th);
    return rrect(u0, v0, u1, v1, r, n).map((q) => ({
      u: cx + q.u * c - q.v * s, v: cy + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c,
    }));
  }
  /** A rounded box in a frame turned by th: a silhouette and one crease. */
  function rbox(cx, cy, th, u0, v0, u1, v1, z0, z1, r = 1.2, b = 0.7) {
    const ring = rring(cx, cy, th, u0, v0, u1, v1, r);
    const inner = b > 0 ? rring(cx, cy, th, u0 + b, v0 + b, u1 - b, v1 - b, Math.max(0.3, r - b)) : null;
    return prism(P, front, ring, inner, z0, z1);
  }
  const moved = (ring, x, y) => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + y }));
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };

  /** Local to world for a body facing f: u forward, v to its left, z up. */
  const frame = (x, y, f) => {
    const c = Math.cos(f), s = Math.sin(f);
    return (u, v, z) => [x + u * c - v * s, y + u * s + v * c, z];
  };

  /** A repeatable number in [0, 1) for any integer: the scene stays deterministic, so ?t= always shows the same frame. */
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------------------------------------------------------------- light and tone
  // Light falls from above and to the viewer's left. A face's tone is one of six
  // classes, t1 (in shade) to t6 (lit), filled from the page's tokens, so both
  // themes shade the same way. Every tone is a fill only: outlines stay strokes.
  /** The world direction toward screen right, on the ground. */
  const RIGHT = [cA, -sA];
  const LIGHT = v3.norm([-cA * 0.55 + sA * 0.25, sA * 0.55 + cA * 0.25, 0.8]);
  /** The tone class for a surface normal. */
  const toneOf = (n) => {
    const l = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    return "t" + Math.min(6, 1 + Math.floor(l * 6));
  };
  const facesRight = (q) => q.nu * RIGHT[0] + q.nv * RIGHT[1] > 0;

  /**
   * A rounded box standing from z0 to z1 on a ring (rring), split into the faces
   * the viewer sees: the outline (its hull), the top, and the visible side band
   * cut where its normals turn from screen left to screen right. inner, when
   * given, is the crease ring a little inside the top.
   */
  function boxFaces(ring, z0, z1, inner) {
    const band = run(ring, front), split = band.findIndex(facesRight);
    const left = split < 0 ? band : band.slice(0, split + 1), right = split < 0 ? [] : band.slice(Math.max(0, split - 1));
    const side = (r) => (r.length < 2 ? "" : poly(ringAt(P, r, z1).concat(ringAt(P, r, z0).reverse())));
    return {
      sil: poly(hull(ringAt(P, ring, z0).concat(ringAt(P, ring, z1)))),
      top: poly(ringAt(P, ring, z1)), left: side(left), right: side(right),
      crease: inner ? open(ringAt(P, run(inner, front), z1)) : "",
    };
  }
  /** The elements for a shaded box: a base filled in the shade tone, the lit side and top over it, then the outline and crease. */
  function shadedBox(parent, tones = ["t2", "t3", "t5"], line = "sil") {
    const g = mk("g", {}, parent);
    return {
      g, base: mk("path", { class: "fo " + tones[0] }, g), left: mk("path", { class: "fo " + tones[1] }, g),
      top: mk("path", { class: "fo " + tones[2] }, g), line: mk("path", { class: "nf " + line }, g), cr: mk("path", { class: "nf lo" }, g),
    };
  }
  function putBox(el, f) { setD(el.base, f.sil); setD(el.left, f.left); setD(el.top, f.top); setD(el.line, f.sil); setD(el.cr, f.crease); }

  // ---------------------------------------------------------------- shadows
  // Soft contact shadows lie on the ground, under everything standing. One radial
  // gradient serves them all; a shadow fades as what casts it rises.
  const SHADE = "site-shade-" + (siteCore.n = (siteCore.n || 0) + 1);
  {
    const gr = mk("radialGradient", { id: SHADE }, defs);
    for (const [o, a] of [[0, 0.85], [0.5, 0.5], [0.8, 0.18], [1, 0]]) mk("stop", { offset: o, class: "shade-stop", "stop-opacity": a }, gr);
  }
  /** A shadow on the ground: set(x, y, rx, ry, th, k) lays an ellipse of radii rx, ry turned by th at (x, y), at strength k. */
  function makeShadow(parent = shadows) {
    const el = mk("path", { class: "fo shade" }, parent);
    el.style.fill = `url(#${SHADE})`;
    let last = "";
    return {
      el,
      set(x, y, rx, ry, th = 0, k = 1) {
        const c = Math.cos(th), s = Math.sin(th), pts = [];
        for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, u = rx * Math.cos(a), v = ry * Math.sin(a); pts.push(P(x + u * c - v * s, y + u * s + v * c, 0)); }
        setD(el, k > 0.01 ? poly(pts) : "");
        const o = r2(clamp(k, 0, 1));
        if (o !== last) { last = o; el.setAttribute("fill-opacity", o); }
      },
    };
  }

  // ---------------------------------------------------------------- the story's state, shared
  /** phase: repair, fixed, shake. lost and placed count since the 404 was last whole; knocked counts the reader's knocks. */
  const story = { phase: "repair", pt: 0, clock: 0, seq: 0, lost: broken.length, placed: 0, knocked: 0, byReader: false };
  const still = () => !!opts.freeze || reducedMotion();

  return { Cam, proj, fit, rrect, circ, prism, ringAt, run, hull, poly, open, seg, clamp, lerp, rad, r2, mk, solid, place, spring, stepS, reducedMotion, VW, VH, AZ, K, CORE, sA, cA, ZF, VIEW, depth, front, TAU, wrap, smooth, lerpA, SZ, SD, PITCH, SL, SAFE, HOOK_GROUND, JIB, GROUND, CRANES, PILE, MIXER, PALLET, LOAD, DUMP, BOSS, slots, slotAt, broken, C, P, S, P3, defs, ground, shadows, layer, tops, items, item, setD, flag, putC, rring, rbox, moved, v3, frame, hash, RIGHT, LIGHT, toneOf, facesRight, boxFaces, shadedBox, putBox, makeShadow, story, still };
}
