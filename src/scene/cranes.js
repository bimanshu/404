/**
 * The two tower cranes: lattice masts on ballasted footings, slewing tops (turntable, cab, cathead,
 * jib, counter-jib and counterweights), the trolley, the hook and its load's rigging, and the jobs
 * that put blocks back. They move like heavy machines: every drive follows a jerk-limited S-curve
 * within its speed limit, the top sways on the mast when a slew stops, and what hangs from the hook
 * is a pendulum whose period follows the rope's length.
 */
function siteCranes(ctx, B) {
  const {
    poly, open, seg, clamp, mk, sA, cA, depth, wrap, SZ, SL, SAFE, HOOK_GROUND, JIB, CRANES, P, layer, tops, item, setD,
    rring, hull, story, still, boxFaces, shadedBox, putBox, makeShadow, toneOf, hash,
  } = ctx;
  const { blocks, placeable, findSpot } = B;

  // ---------------------------------------------------------------- projection, flattened
  // The camera is orthographic: a world point's screen place is a sum of three screen vectors.
  const O = P(0, 0, 0), dP = (q) => [q[0] - O[0], q[1] - O[1]];
  const EX = dP(P(1, 0, 0)), EY = dP(P(0, 1, 0)), EZ = dP(P(0, 0, 1));
  /** A frame turned by f about (x, y): local (u forward, v left, z up) to screen. */
  function basis(x, y, f) {
    const c = Math.cos(f), s = Math.sin(f);
    const U0 = c * EX[0] + s * EY[0], U1 = c * EX[1] + s * EY[1], V0 = -s * EX[0] + c * EY[0], V1 = -s * EX[1] + c * EY[1];
    const o0 = O[0] + x * EX[0] + y * EY[0], o1 = O[1] + x * EX[1] + y * EY[1];
    return (u, v, z) => [o0 + u * U0 + v * V0 + z * EZ[0], o1 + u * U1 + v * V1 + z * EZ[1]];
  }
  const r3 = (n) => Math.round(n * 1000) / 1000;

  // ---------------------------------------------------------------- the machine
  const MW = 5.5;            // the mast's half width
  const G = 130;             // gravity, in units/s² (a unit is about 7 cm)
  // drive limits: speed and peak acceleration; the slew in rad, trolley and hoist in units
  const SLEW = { v: 0.5, a: 0.4 }, HOIST = { v: 110, a: 190 };
  // at the hook, the slew and the trolley are held to a travel speed (slower with a load) and an acceleration
  const HOOK_V = [36, 28], HOOK_A = 26, TROLLEY_A = 16;
  const SWAY_W = 4.4, SWAY_Z = 0.12, SWAY_K = 0.35;  // the top on its mast: about 0.7 Hz, lightly damped
  const STEEL = ["t2", "t4", "t5"], CONC = ["t2", "t3", "t5"], WEIGHT = ["t1", "t3", "t4"];
  const BANDS = [16, 60, 180];   // how far out the core, the counter-jib and the jib reach
  const JU0 = 6, NP = 20, PL = (JIB - JU0) / NP, JV = 3.2;   // the jib: root, panels, half width
  const HOOK_PLANE = Math.atan2(-sA, cA);                      // the hook is seen flat on
  // the hook's outline in its own plane (a along it, z up from the hook's height), shank and swivel nut to the bowl and tip
  const HOOK = (() => {
    const pts = [[-0.6, 1.7], [0.4, 1.7], [0.4, 1.1], [0.15, 1.1], [0.15, -1.25]];
    for (let i = 1; i <= 5; i++) { const a = Math.PI + (i / 5) * Math.PI; pts.push([0.6 + 0.45 * Math.cos(a), -1.25 + 0.45 * Math.sin(a)]); }
    pts.push([1.05, -0.7], [1.3, -0.45], [1.55, -0.7], [1.55, -1.25]);
    for (let i = 1; i <= 6; i++) { const a = -(i / 6) * Math.PI; pts.push([0.6 + 0.95 * Math.cos(a), -1.25 + 0.95 * Math.sin(a)]); }
    pts.push([-0.35, 1.1], [-0.6, 1.1]);
    return pts;
  })();
  const UNIT = "M1 0A1 1 0 0 1 -1 0A1 1 0 0 1 1 0Z";

  // ---------------------------------------------------------------- building
  function makeCrane(c) {
    const k = {
      ...c, th: c.park, r: 64, h: SAFE, steps: [], cur: null, job: null, mode: null, spot: null, sx: 0, sy: 0,
      w: 0, vr: 0, vh: 0, pw: 0, pvh: 0, pom: 0, pvr: 0, flex: 0, fv: 0, ax: 0, ay: 0, avx: 0, avy: 0, pL: null,
      bz: 0, bv: 0, yv: 0, held: null, lifts: 0, hz: SAFE, dF: null, dR: null, dH: "", order: "", tf: c.park, tr: 64, bands: [null, null, null], shF: [0, 0],
    };
    // the cab hangs on the side that faces the viewer when parked
    k.cabSide = -Math.sin(c.park) * sA + Math.cos(c.park) * cA >= 0 ? 1 : -1;
    buildMast(k);
    // the hook, its rope and the rigging: an item, so it paints in depth order with the load
    const hg = mk("g", {}, layer);
    k.rope = mk("path", { class: "nf" }, hg);
    k.block = mbox(hg, STEEL, true);
    k.hook = mk("path", { class: "t4 sil" }, hg);
    k.sling = mk("path", { class: "nf" }, hg);
    k.hookIt = item(hg);
    k.hookShade = makeShadow();
    // faint long shadows of the jib and counter-jib, laid on the ground by a transform so their softness follows them
    k.jibShade = [0.13, 0.15].map((o) => {
      const el = makeShadow().el;
      el.setAttribute("d", UNIT);
      el.setAttribute("fill-opacity", o);
      return el;
    });
    buildTop(k);
    return k;
  }

  /** The footing, its ballast and the lattice mast: built once, they never move. */
  function buildMast(k) {
    const { x, y, H } = k, g = mk("g", {}, layer), W = (u, v, z) => P(x + u, y + v, z);
    makeShadow().set(x, y, 21, 21, 0, 0.42);
    const box = (tones, u0, v0, u1, v1, z0, z1, r, b) => putBox(shadedBox(g, tones), boxFaces(rring(x, y, 0, u0, v0, u1, v1, r), z0, z1,
      b ? rring(x, y, 0, u0 + b, v0 + b, u1 - b, v1 - b, Math.max(0.3, r - b)) : null));
    const ballast = (side) => { for (let i = 0; i < 2; i++) box(WEIGHT, side * 10.2 - 2.7, -11.5, side * 10.2 + 2.7, 11.5, 2.6 + i * 3.1, 2.5 + (i + 1) * 3.1, 0.7, 0.5); };
    // the cast pad, and the ballast stack behind the mast
    box(CONC, -15, -15, 15, 15, 0, 2.6, 2.4, 1);
    ballast(-1);
    // the mast: four chords, X bracing on the faces, ties at the section joints, a ladder inside
    const zb = 3.4, zt = H - 1.6, n = Math.max(6, Math.round((zt - zb) / 10.5)), dz = (zt - zb) / n;
    const C = [[-MW, MW], [MW, MW], [MW, -MW], [-MW, -MW]];   // front left, front right, back right, back left
    const X = (a, b, z0, z1) => seg(W(a[0], a[1], z0), W(b[0], b[1], z1)) + seg(W(b[0], b[1], z0), W(a[0], a[1], z1));
    let back = seg(W(C[3][0], C[3][1], zb), W(C[3][0], C[3][1], zt)), side = "", face = "", ties = "", lad = "";
    for (let i = 0; i < n; i++) {
      const z0 = zb + i * dz, z1 = z0 + dz;
      face += X(C[0], C[1], z0, z1);
      side += X(C[1], C[2], z0, z1);
    }
    for (let i = 0; i <= n; i += 3) {
      const z = zb + i * dz;
      ties += open([W(C[0][0], C[0][1], z), W(C[1][0], C[1][1], z), W(C[2][0], C[2][1], z)]);
      back += open([W(C[2][0], C[2][1], z), W(C[3][0], C[3][1], z), W(C[0][0], C[0][1], z)]);
    }
    ties += open([W(C[0][0], C[0][1], zt), W(C[1][0], C[1][1], zt), W(C[2][0], C[2][1], zt)]);
    back += open([W(C[2][0], C[2][1], zt), W(C[3][0], C[3][1], zt), W(C[0][0], C[0][1], zt)]);
    // the ladder runs up inside, just behind the front face
    const ly = MW - 1.6;
    lad += seg(W(-1.3, ly, zb), W(-1.3, ly, zt)) + seg(W(1.3, ly, zb), W(1.3, ly, zt));
    for (let z = zb + 2; z < zt; z += 3.4) lad += seg(W(-1.3, ly, z), W(1.3, ly, z));
    mk("path", { class: "nf lo", d: back + lad }, g);
    mk("path", { class: "nf lo", d: side }, g);
    mk("path", { class: "nf", d: face + ties }, g);
    let chords = "";
    for (const q of C.slice(0, 3)) chords += seg(W(q[0], q[1], zb), W(q[0], q[1], zt));
    mk("path", { class: "nf sil", d: chords }, g);
    // the mast's feet: base plates bolted down to anchors cast in the pad
    let plates = "", bolts = "";
    for (const q of C) {
      plates += boxFaces(rring(x + q[0], y + q[1], 0, -1.7, -1.7, 1.7, 1.7, 0.4), 2.6, 3.4).sil;
      for (const [a, b] of [[-1.1, 1.1], [1.1, 1.1]]) bolts += seg(W(q[0] + a, q[1] + b, 3.4), W(q[0] + a, q[1] + b, 4.1));
    }
    mk("path", { class: "t4 sil", d: plates }, g);
    mk("path", { class: "nf", d: bolts }, g);
    // the near stack of ballast covers the mast's foot
    ballast(1);
    item(g, depth(x, y));
  }

  /** The slewing top's elements; drawTop fills them in. */
  function buildTop(k) {
    const { x, y, H } = k, t = mk("g", {}, tops);
    k.top = t;
    // the slewing ring is round, so it never needs redrawing
    putBox(shadedBox(t, STEEL), boxFaces(rring(x, y, 0, -6.6, -6.6, 6.6, 6.6, 6.6, 6), H - 1.6, H + 0.3));
    const g = () => mk("g", {}, t), path = (cls, parent) => mk("path", { class: cls }, parent);
    const p = (k.parts = {});
    p.plat = mbox(t, STEEL);
    p.cab = g(); p.cabBox = mbox(p.cab, STEEL); p.glass = path("t1", p.cab); p.glint = path("nf lo", p.cab);
    p.cat = g(); p.catFar = path("nf lo", p.cat); p.catNear = path("nf", p.cat); p.catLegs = path("nf sil", p.cat);
    p.cap = mbox(p.cat, STEEL, true); p.lamp = path("t6 sil", p.cat);
    p.jib = g(); p.jFar = path("nf lo", p.jib);
    p.rope = path("nf lo", p.jib); p.trol = mbox(p.jib, STEEL, true); p.wheels = path("t3", p.jib);
    p.jNearL = path("nf", p.jib); p.jChords = path("nf sil", p.jib);
    p.cj = g(); p.deck = mbox(p.cj, STEEL); p.railFar = path("nf lo", p.cj);
    p.drum = g(); p.drumBody = path("t4 sil", p.drum); p.drumEnd = path("sil", p.drum);
    p.cabinet = mbox(null, STEEL, true); p.cj.appendChild(p.drum); p.cj.appendChild(p.cabinet.g);
    p.railNear = path("nf", p.cj);
    p.cw = g(); p.cwBox = mbox(p.cw, WEIGHT); p.seams = path("nf lo", p.cw);
    p.ties = path("nf", t);
    // the aviation light on the cathead's peak sits on the axis, so it never moves
    const lamp = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; lamp.push(P(x + 0.75 * Math.cos(a), y + 0.75 * Math.sin(a), H + 32.3)); }
    lamp.push(P(x, y, H + 33.6));
    setD(p.lamp, poly(hull(lamp)));
  }

  // ---------------------------------------------------------------- drawing
  /**
   * The top, in three bands by their reach from the slewing axis: the core (turntable, cab, cathead), the
   * counter-jib and the jib. A band is redrawn only once its parts have moved a visible amount, so in a slow
   * slew the core, which hardly moves, is redrawn far less often than the jib.
   */
  function drawTop(k, f) {
    const { x, y, H } = k, p = k.parts, L = basis(x, y, f), c = Math.cos(f), s = Math.sin(f);
    const dU = c * sA + s * cA, dV = -s * sA + c * cA;   // how much the jib's axis and its left side face the viewer
    const nv = dV >= 0 ? 1 : -1;                           // the near side
    const Z0 = H + 3.2, Z1 = H + 10.6, zc0 = H + 3.2, zc1 = H + 29.6;
    const half = (z) => 4.2 + ((1.3 - 4.2) * (z - zc0)) / (zc1 - zc0);
    const zt = (u) => (u < JIB - 16 ? Z1 : Z1 + ((Z0 + 2.2 - Z1) * (u - (JIB - 16))) / 16);
    const bx = (el, u0, v0, u1, v1, z0, z1, r = 1) => mput(el, boxFaces(rring(x, y, f, u0, v0, u1, v1, r), z0, z1));

    // paint order: the arm turned away, the turntable, the cab and cathead by depth, the arm turned toward, the ties
    const jibNear = dU >= 0, cabFirst = 5.9 * dU + k.cabSide * 9.4 * dV < 0;
    const order = (jibNear ? 1 : 0) + (cabFirst ? 2 : 0) + (dU < 0 ? 4 : 0) + (nv > 0 ? 8 : 0);
    let all = false;
    if (order !== k.order) {
      k.order = order; all = true;
      const core = [p.plat.g, ...(cabFirst ? [p.cab, p.cat] : [p.cat, p.cab])];
      const cj = jibNear ? [p.cw, p.cj] : [p.cj, p.cw];
      for (const e of jibNear ? [...cj, ...core, p.jib] : [p.jib, ...core, ...cj]) k.top.appendChild(e);
      // on the counter-jib, the winch and the cabinet in depth order between the rails
      const [a, b] = dU < 0 ? [p.cabinet.g, p.drum] : [p.drum, p.cabinet.g];
      p.cj.insertBefore(a, p.railNear); p.cj.insertBefore(b, p.railNear);
      k.top.appendChild(p.ties);
    }
    const due = (i) => {
      if (!all && k.bands[i] != null && Math.abs(f - k.bands[i]) * BANDS[i] < 0.12) return false;
      k.bands[i] = f;
      return true;
    };

    if (due(0)) {
      // the turntable
      bx(p.plat, -7, -6.5, 8, 6.5, H + 0.3, H + 3.2, 1.4);
      // the operator's cab beside the jib's root, glazed toward the jib and on its outer side
      const cs = k.cabSide, cv0 = cs > 0 ? 5.6 : -13.2, cv1 = cs > 0 ? 13.2 : -5.6, cu1 = 10.6, ov = cs > 0 ? cv1 : cv0;
      bx(p.cabBox, 1.2, cv0, cu1, cv1, H - 1.2, H + 10.4, 1);
      const pane = (u0, v0, u1, v1, z0, z1) => poly([L(u0, v0, z0), L(u1, v1, z0), L(u1, v1, z1), L(u0, v0, z1)]);
      let glass = "", glint = "";
      if (dU > 0.06) {
        const a = cv0 + 0.9, b = cv1 - 0.9, u = cu1 + 0.02;
        glass += pane(u, a, u, b, H + 0.2, H + 3.5) + pane(u, a, u, b, H + 4.1, H + 9.6);
        glint += seg(L(u, a + (b - a) * 0.25, H + 4.8), L(u, a + (b - a) * 0.5, H + 8.9));
      }
      if (cs * dV > 0.06) {
        const v = ov + cs * 0.02;
        glass += pane(3, v, 9.6, v, H + 4.1, H + 9.6);
        glint += seg(L(4.4, v, H + 4.7), L(6.6, v, H + 9));
      }
      setD(p.glass, glass); setD(p.glint, glint);
      // the cathead: four legs leaning in to the peak, braced on every face; the faces turned away drawn dim
      const lv = [zc0, H + 12, H + 20.6, zc1], LEG = [[1, 1], [-1, 1], [-1, -1], [1, -1]], dep = (q) => q[0] * dU + q[1] * dV;
      let far = "", near = "", legs = "", farLeg = 0;
      for (let i = 1; i < 4; i++) if (dep(LEG[i]) < dep(LEG[farLeg])) farLeg = i;
      for (let i = 0; i < 4; i++) {
        const a = LEG[i], b = LEG[(i + 1) % 4];
        let d = "";
        for (let j = 0; j < 3; j++) {
          const z0 = lv[j], z1 = lv[j + 1], h0 = half(z0), h1 = half(z1), [p0, p1] = j % 2 ? [a, b] : [b, a];
          d += seg(L(p0[0] * h0, p0[1] * h0, z0), L(p1[0] * h1, p1[1] * h1, z1));
          if (j) d += seg(L(a[0] * h0, a[1] * h0, z0), L(b[0] * h0, b[1] * h0, z0));
        }
        if (dep([a[0] + b[0], a[1] + b[1]]) > 0) near += d; else far += d;
        const leg = seg(L(a[0] * 4.2, a[1] * 4.2, zc0), L(a[0] * 1.3, a[1] * 1.3, zc1));
        if (i === farLeg) far += leg; else legs += leg;
      }
      // the jib's top chord ties into the cathead
      near += seg(L(JU0, 0, Z1), L(half(Z1), half(Z1), Z1)) + seg(L(JU0, 0, Z1), L(half(Z1), -half(Z1), Z1));
      setD(p.catFar, far); setD(p.catNear, near); setD(p.catLegs, legs);
      bx(p.cap, -1.9, -1.9, 1.9, 1.9, zc1, H + 32.3, 0.6);
    }

    if (due(1)) {
      // the counter-jib: a walkway with handrails, the hoist winch and its cabinet, and the counterweight slabs at its end
      bx(p.deck, -46, -3.8, -5, 3.8, H + 3, H + 5, 0.6);
      const rail = (v) => {
        let d = open([L(-5.5, v, H + 8.6), L(-45.5, v, H + 8.6)]) + open([L(-5.5, v, H + 6.8), L(-45.5, v, H + 6.8)]);
        for (let u = -5.5; u >= -45.6; u -= 8) d += seg(L(u, v, H + 5), L(u, v, H + 8.6));
        return d;
      };
      setD(p.railFar, rail(-nv * 3.5)); setD(p.railNear, rail(nv * 3.5));
      const du = -31, dzc = H + 7.3, dr = 2.1, endA = [], endB = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, cu = du + dr * Math.cos(a), cz = dzc + dr * Math.sin(a);
        endA.push(L(cu, -nv * 2.5, cz)); endB.push(L(cu, nv * 2.5, cz));
      }
      setD(p.drumBody, poly(hull(endA.concat(endB))));
      setD(p.drumEnd, poly(endB));
      setClass(p.drumEnd, toneOf([-s * nv, c * nv, 0]));
      bx(p.cabinet, -24, -2.8, -18.5, 2.8, H + 5, H + 10.6, 0.6);
      bx(p.cwBox, -58, -5.6, -46, 5.6, H - 7, H + 7.6, 0.6);
      let seams = "";
      for (const u of [-55, -52, -49]) seams += open([L(u, -nv * 5.6, H + 7.6), L(u, nv * 5.6, H + 7.6), L(u, nv * 5.6, H - 7)]);
      setD(p.seams, seams);
      if (all || Math.abs(f - k.shF[1]) * 62 > 1) { k.shF[1] = f; shadowAt(k.jibShade[1], x - c * 31, y - s * 31, f, 31, 7.5); }
    }

    if (due(2)) {
      // the jib: a triangular truss, two bottom chords the trolley runs on and one top chord, laced on all three faces
      const vN = nv * JV, vF = -nv * JV, top = [L(JU0, 0, Z1)], nearZ = [], farZ = [], bot = [];
      for (let i = 0; i <= NP; i++) {
        const u = JU0 + i * PL;
        nearZ.push(L(u, vN, Z0)); farZ.push(L(u, vF, Z0));
        bot.push(L(u, i % 2 ? vF : vN, Z0));
        if (i < NP) { const um = u + PL / 2, q = L(um, 0, zt(um)); top.push(q); nearZ.push(q); farZ.push(q); }
      }
      top.push(L(JIB, 0, zt(JIB)));
      const ends = (u) => open([L(u, vN, Z0), L(u, 0, zt(u)), L(u, vF, Z0), L(u, vN, Z0)]);
      setD(p.jFar, seg(L(JU0, vF, Z0), L(JIB, vF, Z0)) + open(farZ) + open(bot));
      setD(p.jNearL, open(nearZ) + ends(JU0) + ends(JIB));
      setD(p.jChords, seg(L(JU0, vN, Z0), L(JIB, vN, Z0)) + open(top));
      // pendant ties from the peak to the jib and the counter-jib
      const A = L(0, 0, H + 31);
      setD(p.ties, seg(A, L(80, 0, Z1)) + seg(A, L(146, 0, zt(146))) + seg(L(0, 1, H + 30.6), L(-44, 3.5, H + 5)) + seg(L(0, -1, H + 30.6), L(-44, -3.5, H + 5)));
      // its shadow on the ground, long and faint; being soft it moves in steps of about a unit, which spares repainting the ground every frame
      if (all || Math.abs(f - k.shF[0]) * 184 > 1) { k.shF[0] = f; shadowAt(k.jibShade[0], x + (c * (JU0 + JIB)) / 2, y + (s * (JU0 + JIB)) / 2, f, (JIB - JU0) / 2 + 8, 5); }
    }
  }
  const setClass = (el, cls) => { if (el.__c !== cls) { el.__c = cls; el.setAttribute("class", cls + " sil"); } };
  /**
   * A shaded box that moves: the shade tone under the lit side and the top, then the outline. A small one is
   * two paths, its sides in the middle tone with the outline, and the lit top laid over them.
   */
  function mbox(parent, tones, small) {
    const g = mk("g", {}, parent);
    if (small) return { g, base: mk("path", { class: tones[1] + " sil" }, g), left: null, top: mk("path", { class: "fo " + tones[2] }, g), line: null };
    return {
      g, base: mk("path", { class: "fo " + tones[0] }, g), left: mk("path", { class: "fo " + tones[1] }, g),
      top: mk("path", { class: "fo " + tones[2] }, g), line: mk("path", { class: "nf sil" }, g),
    };
  }
  function mput(el, f) { setD(el.base, f.sil); if (el.left) setD(el.left, f.left); setD(el.top, f.top); if (el.line) setD(el.line, f.sil); }
  /** A soft shadow ellipse on the ground, as a unit circle carried there by a transform, so the gradient keeps its shape. */
  function shadowAt(el, cx, cy, f, a, b) {
    const c = Math.cos(f), s = Math.sin(f);
    const m = [a * (c * EX[0] + s * EY[0]), a * (c * EX[1] + s * EY[1]), b * (-s * EX[0] + c * EY[0]), b * (-s * EX[1] + c * EY[1])];
    const tr = `matrix(${m.map(r3).join(" ")} ${r3(O[0] + cx * EX[0] + cy * EY[0])} ${r3(O[1] + cx * EX[1] + cy * EY[1])})`;
    if (el.__t !== tr) { el.__t = tr; el.setAttribute("transform", tr); }
  }

  /** The trolley under the jib: its frame, wheels on the bottom chords, the sheaves the hoist rope runs over, and that rope along the jib. */
  function drawTrolley(k, f) {
    const { x, y, H, r } = k, p = k.parts, L = basis(x, y, f), c = Math.cos(f), s = Math.sin(f);
    const nv = -s * sA + c * cA >= 0 ? 1 : -1;
    mput(p.trol, boxFaces(rring(x, y, f, r - 3.4, -4.3, r + 3.4, 4.3, 0.8), H - 0.8, H + 2.2));
    let d = "";
    for (const du of [-2.2, 2.2]) {
      const w = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; w.push(L(r + du + 0.8 * Math.cos(a), nv * 4.3, H + 2.9 + 0.8 * Math.sin(a))); }
      d += poly(w);
    }
    let sh = d;
    for (const du of [-1.3, 1.3]) {
      const w = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; w.push(L(r + du + 0.9 * Math.cos(a), nv * 4.32, H + 0.5 + 0.9 * Math.sin(a))); }
      sh += poly(w);
    }
    setD(p.wheels, sh);
    // the hoist rope comes over the jib's root to the trolley, and runs on from it to its anchor at the tip
    const zr = H + 3.6;
    setD(p.rope, seg(L(JU0 + 1, 0, zr), L(r - 3.4, 0, H + 1.4)) + seg(L(r + 3.4, 0, H + 1.4), L(JIB - 4, 0, zr)));
  }

  /** The hook: its rope in two falls, the hook block and the hook with its latch, and the slings of a load. */
  function drawHook(k, f) {
    const { x, y, H } = k, c = Math.cos(f), s = Math.sin(f), r = k.tr;
    const [hx, hy] = hookAt(k), hz = k.hz, load = k.job && k.job.state === "carried" ? k.job : null;
    const key = `${Math.round(f * 1e4)},${Math.round(k.tf * 1e4)},${Math.round(r * 50)},${Math.round(hx * 50)},${Math.round(hy * 50)},${Math.round(hz * 50)},${load ? Math.round(load.yaw * 1e3) : "-"}`;
    k.hookIt.key = depth(hx, hy) + 0.02 + (load ? load.z * 1e-3 : 0);
    if (key === k.dH) return;
    k.dH = key;
    const nv = -s * sA + c * cA >= 0 ? 1 : -1, L = basis(hx, hy, f), T = basis(x, y, k.tf);
    setD(k.rope, seg(T(r - 1.3, 0, H - 0.8), L(-1.3, 0, hz + 7.3)) + seg(T(r + 1.3, 0, H - 0.8), L(1.3, 0, hz + 7.3)));
    mput(k.block, boxFaces(rring(hx, hy, f, -2.6, -1.3, 2.6, 1.3, 1), hz + 1.7, hz + 7.3));
    const sh = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; sh.push(L(1.6 * Math.cos(a), nv * 1.32, hz + 5.1 + 1.6 * Math.sin(a))); }
    const hc = Math.cos(HOOK_PLANE), hs = Math.sin(HOOK_PLANE), Hk = (a, z) => P(hx + a * hc, hy + a * hs, hz + z);
    // the hook, and the cover plate of the block's sheave
    setD(k.hook, poly(HOOK.map(([a, z]) => Hk(a, z))) + poly(sh));
    const latch = seg(Hk(1.3, -0.45), Hk(0.15, 0.35));
    if (load) {
      const cc = Math.cos(load.yaw), ss = Math.sin(load.yaw), top = load.z + SZ + (load.hover || 0), hk = Hk(0.6, -1.95);
      setD(k.sling, latch + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => seg(hk, P(load.x + 5.9 * u * cc - 3 * v * ss, load.y + 5.9 * u * ss + 3 * v * cc, top))).join(""));
      k.hookShade.set(hx, hy, 0, 0, 0, 0);
    } else {
      setD(k.sling, latch);
      const lift = clamp(hz / 130, 0, 1);
      k.hookShade.set(hx, hy, 3.6 + 3 * lift, 3 + 2.5 * lift, f, 0.32 * (1 - lift) * (1 - lift) + 0.03);
    }
  }

  /** full: the top too. The hook is drawn every frame; its rope hangs from the trolley where it was last drawn. */
  function drawCrane(k, full) {
    const f = k.th + k.flex, fk = Math.round(f * 1e4);
    if (full || k.dF == null) {
      if (fk !== k.dF) { k.dF = fk; drawTop(k, f); }
      if (k.dR == null || Math.abs(k.r - k.tr) > 0.02 || Math.abs(f - k.tf) * k.r > 0.12) { k.dR = 1; k.tf = f; k.tr = k.r; drawTrolley(k, f); }
    }
    drawHook(k, f);
  }

  // ---------------------------------------------------------------- the jobs
  /** The trolley's radius and the jib's angle that put the hook over (px, py). */
  const polar = (k, px, py) => [Math.atan2(py - k.y, px - k.x), Math.hypot(px - k.x, py - k.y)];

  const hookAt = (k) => [k.x + k.r * Math.cos(k.th) + k.sx, k.y + k.r * Math.sin(k.th) + k.sy];

  /** The next block for this crane: one on the ground, in its columns, that can go back now; lowest first, then nearest. */
  function pickJob(k) {
    const [hx, hy] = hookAt(k);
    let best = null, score = 0;
    for (const b of blocks) {
      if (b.state !== "ground" || !k.take(b.slot.col) || !placeable(b.slot)) continue;
      const sc = b.slot.lvl * 40 + Math.hypot(b.x - hx, b.y - hy);
      if (!best || sc < score) { best = b; score = sc; }
    }
    return best;
  }

  function planJob(k, b) {
    const s = b.slot, [pt, pr] = polar(k, b.x, b.y), [st, sr] = polar(k, s.cx, s.cy);
    k.job = b; k.mode = "place";
    k.steps.push(
      { h: SAFE }, { th: pt, r: pr }, { h: HOOK_GROUND, low: true },
      { wait: 0.6, low: true, then: () => { b.state = "carried"; } },
      { h: SAFE }, { th: st, r: sr }, { h: s.z0 + SZ + 2 + SL, low: true },
      { wait: 0.5, low: true, then: () => { Object.assign(b, { state: "slot", x: s.cx, y: s.cy, z: s.z0, yaw: 0 }); k.job = null; k.mode = null; story.placed++; } },
      { h: SAFE },
    );
  }

  /** A block below the job's slot was knocked out: drop a job not yet hooked, or set the load down on the ground. */
  function abandon(k) {
    const b = k.job;
    k.steps = [];
    if (b.state !== "carried") { k.job = null; k.mode = null; return; }
    const spot = findSpot(b.slot, k), [th, r] = polar(k, spot[0], spot[1]);
    k.mode = "setdown"; k.spot = spot;
    k.steps.push(
      { h: SAFE }, { th, r }, { h: HOOK_GROUND, low: true },
      { wait: 0.5, low: true, then: () => { Object.assign(b, { state: "ground", z: 0 }); k.job = null; k.mode = null; k.spot = null; } },
      { h: SAFE },
    );
  }

  /** The pendulum's length: the rope's, from the trolley's sheaves to the middle of the hook block, and a little more with a load on its slings. */
  const swingLength = (k) => Math.max(8, k.H - 5.3 - k.h + (k.job && k.job.state === "carried" ? 6 : 0));

  /** How far the hook swings: its offset and speed off the trolley, as one amplitude. */
  const swingSize = (k) => {
    const L = swingLength(k), w2 = G / L;
    return L * Math.sqrt(k.ax * k.ax + k.ay * k.ay + (k.avx * k.avx + k.avy * k.avy) / w2);
  };

  const parked = (k) => Math.abs(wrap(k.park - k.th)) < 0.01 && Math.abs(k.r - 64) < 0.5 && Math.abs(k.h - SAFE) < 0.5;

  // ---------------------------------------------------------------- the drives
  /**
   * A jerk-limited move over D: the speed rises along a smoothstep to its peak, cruises, and falls the
   * same way, so the acceleration rises and falls smoothly too. A short move never reaches full speed.
   */
  function move(D, lim) {
    const d = Math.abs(D);
    if (d < 1e-6) return null;
    let vp = lim.v, Ta = (1.5 * vp) / lim.a;
    if (d < vp * Ta) { vp = Math.sqrt((d * lim.a) / 1.5); Ta = (1.5 * vp) / lim.a; }
    const Tc = (d - vp * Ta) / vp;
    return { d, sg: Math.sign(D), vp, Ta, Tc, T: 2 * Ta + Tc };
  }
  /**
   * The same move as a good operator drives it with a load on the hook: the slowing starts a whole number
   * of the pendulum's periods Tp after the speeding up, so the swing the start gave is taken back by the
   * stop and the hook arrives hanging still.
   */
  function shaped(D, lim, Tp) {
    const d = Math.abs(D);
    if (d < 1e-6) return null;
    for (let n = 1; n <= 6; n++) {
      const S = n * Tp, vp = d / S, Ta = Math.max((1.5 * vp) / lim.a, Math.min(0.3 * S, 0.7));
      if (vp <= lim.v && Ta <= S) return { d, sg: Math.sign(D), vp, Ta, Tc: S - Ta, T: S + Ta };
    }
    return move(D, lim);
  }
  /** Where a move is at time t, and how fast it goes: [distance, speed]. */
  function at(m, t) {
    if (!m) return [0, 0];
    t = clamp(t, 0, m.T);
    const ramp = (q) => { const u = q / m.Ta, u3 = u * u * u; return [m.vp * m.Ta * (u3 - (u3 * u) / 2), m.vp * (3 * u * u - 2 * u3)]; };
    let x, v;
    if (t < m.Ta) [x, v] = ramp(t);
    else if (t < m.Ta + m.Tc) { x = (m.vp * m.Ta) / 2 + m.vp * (t - m.Ta); v = m.vp; }
    else { const q = ramp(m.T - t); x = m.d - q[0]; v = q[1]; }
    return [m.sg * x, m.sg * v];
  }

  function craneStep(k, dt) {
    // an idle wait gives way at once to new work
    if (k.cur && k.cur.idle && story.clock > 0.8 && pickJob(k)) k.cur = null;
    if (!k.cur) {
      if (!k.steps.length) {
        const b = story.clock > 0.8 ? pickJob(k) : null;
        if (b) planJob(k, b);
        else if (!parked(k)) k.steps.push({ h: SAFE }, { th: k.park, r: 64 });
        else k.steps.push({ wait: 0.3, idle: true });
      }
      const st = k.steps.shift();
      st.t = 0;
      st.f = { th: k.th, r: k.r, h: k.h };
      // slew and trolley run together; each move ends with a short beat as the brakes take it
      if (st.th != null) {
        const Tp = 2 * Math.PI * Math.sqrt(swingLength(k) / G);
        const out = Math.max(k.r, st.r, 20), hv = HOOK_V[k.job && k.job.state === "carried" ? 1 : 0];
        st.dth = wrap(st.th - k.th);
        st.ms = shaped(st.dth, { v: Math.min(SLEW.v, hv / out), a: Math.min(SLEW.a, HOOK_A / out) }, Tp);
        st.mr = shaped(st.r - k.r, { v: hv, a: TROLLEY_A }, Tp);
        st.run = Math.max(st.ms ? st.ms.T : 0, st.mr ? st.mr.T : 0);
        st.dur = Math.max(0.3, st.run + 0.15);
      } else if (st.h != null) { st.mh = move(st.h - k.h, HOIST); st.dur = Math.max(0.25, (st.mh ? st.mh.T : 0) + 0.1); }
      else st.dur = st.wait;
      k.cur = st;
    }
    const st = k.cur;
    st.t += dt;
    k.w = k.vr = k.vh = 0;
    if (st.th != null) {
      const a = at(st.ms, st.t), b = at(st.mr, st.t);
      k.th = st.f.th + a[0]; k.w = a[1]; k.r = st.f.r + b[0]; k.vr = b[1];
    }
    if (st.h != null) { const a = at(st.mh, st.t); k.h = st.f.h + a[0]; k.vh = a[1]; }
    // after a slew the operator lets the hook settle before lowering, for at most a second or so
    if (st.t >= st.dur && st.th != null && st.t < st.dur + 1.2 && swingSize(k) > 1) return;
    if (st.t >= st.dur) {
      k.cur = null;
      // checked at every step's end, before its hook or release runs
      if (k.mode === "place" && !placeable(k.job.slot)) { abandon(k); return; }
      if (st.then) st.then();
    }
  }

  /**
   * What the drives do to the steel and the load: the top sways on the mast as a slew starts and stops; the
   * hook is a pendulum from the trolley, driven by the trolley's acceleration, with a period set by the rope's
   * length; the rope stretches a little as a hoist starts and stops; and a load twists on its slings until the
   * riggers square it up. Near the ground the riggers' hands and tag lines steady it.
   */
  function physics(k, dt) {
    if (dt <= 0) return;
    // sway: the slew's angular acceleration bends the top on its mast
    const al = clamp((k.w - k.pw) / dt, -2, 2);
    k.pw = k.w;
    k.fv += (-SWAY_W * SWAY_W * k.flex - 2 * SWAY_Z * SWAY_W * k.fv - SWAY_K * al) * dt;
    k.flex += k.fv * dt;
    if (Math.abs(k.flex) < 1e-5 && Math.abs(k.fv) < 1e-5) k.flex = k.fv = 0;

    // the trolley's acceleration in the jib's own frame: along the jib (less the pull of the turn) and across it
    const f = k.th + k.flex, c = Math.cos(f), s = Math.sin(f), om = k.w + k.fv;
    const omd = (om - k.pom) / dt, rdd = (k.vr - k.pvr) / dt;
    k.pom = om; k.pvr = k.vr;
    const aR = clamp(rdd - k.r * om * om, -150, 150), aT = clamp(k.r * omd + 2 * k.vr * om, -150, 150);

    // the pendulum: from the trolley's sheaves to the hook block, or to the middle of the load
    const b = k.job && k.job.state === "carried" ? k.job : null, Lp = swingLength(k);
    const Ld = k.pL != null && Math.abs(Lp - k.pL) < 3 ? (Lp - k.pL) / dt : 0;
    k.pL = Lp;
    const w2 = G / Lp, low = k.cur && k.cur.low, reach = b ? k.h - 2 - SL - SZ : k.h - 2;
    // air and the rope damp it a little; a slow approach and tag lines more; hands on the load near the ground most
    // while a shaped move runs the operator leaves the swing alone, as its stop takes it back; once stopped the anti-sway catches what is left
    const moving = k.cur && k.cur.th != null;
    let damp = moving ? (k.cur.t < k.cur.run ? 0.04 : 2.4) : 0.3, hold = 0;
    if (low) damp = 2.2;
    if (low && reach < 22) damp = 3.5;
    if (low && k.cur.wait) { damp = 7; hold = 14; }
    // the swing is worked in the jib's frame (ax along it, ay across), so it turns with the jib; at these slew rates the Coriolis pull is left out
    const step = (a, v, acc) => v + (-(w2 + hold) * a - acc / Lp - (2 * Ld / Lp) * v - damp * v) * dt;
    k.avx = step(k.ax, k.avx, aR); k.avy = step(k.ay, k.avy, aT);
    k.ax = clamp(k.ax + k.avx * dt, -0.3, 0.3); k.ay = clamp(k.ay + k.avy * dt, -0.3, 0.3);
    if (Math.abs(k.ax) + Math.abs(k.ay) + Math.abs(k.avx) + Math.abs(k.avy) < 2e-5) k.ax = k.ay = k.avx = k.avy = 0;
    // the hook's offset from where the drives alone would put it: the jib's sway plus the swing
    const qa = Lp * Math.sin(k.ax), qc = Lp * Math.sin(k.ay);
    k.sx = k.r * (c - Math.cos(k.th)) + qa * c - qc * s;
    k.sy = k.r * (s - Math.sin(k.th)) + qa * s + qc * c;

    // the rope stretches as a hoist speeds up or slows: the hook bobs, more so with a load
    const ah = clamp((k.vh - k.pvh) / dt, -300, 300);
    k.pvh = k.vh;
    if (b && k.held !== b) {
      // the load is hooked: the rope takes its weight with a small dip, and it starts to turn on its slings
      k.held = b; k.lifts++;
      b.yaw = wrap(b.yaw);
      k.yv = (hash(k.lifts * 7 + k.x) - 0.5) * 0.3;
      k.bv -= 4;
    } else if (!b) k.held = null;
    const wz = b ? 15 : 21;
    k.bv += (-wz * wz * k.bz - 2 * 0.22 * wz * k.bv - ah) * dt;
    k.bz += k.bv * dt;
    if (Math.abs(k.bz) < 1e-4 && Math.abs(k.bv) < 1e-3) k.bz = k.bv = 0;
    let hz = k.h + k.bz;
    if (b) {
      // the load hangs from the hook; it cannot sink into the ground or into the bed of its slot
      const [hx, hy] = hookAt(k), floor = k.mode === "place" && low ? b.slot.z0 : 0;
      b.x = hx; b.y = hy; b.z = Math.max(floor, hz - 2 - SL - SZ);
      const held = b.z + 2 + SL + SZ;
      // resting on the ground or its bed, the load holds the rope: the stretch stays where the rest leaves it
      if (held > hz) { k.bz = held - k.h; k.bv = Math.max(k.bv, 0); }
      hz = held;
      // it twists on its slings and settles square
      k.yv += (-3.2 * b.yaw - 1.8 * k.yv) * dt;
      b.yaw += k.yv * dt;
    }
    k.hz = hz;
  }

  const cranes = CRANES.map(makeCrane);
  if (depth(cranes[0].x, cranes[0].y) > depth(cranes[1].x, cranes[1].y)) tops.appendChild(cranes[0].top);

  // When frames come slower than 50 a second the two tops take turns, each redrawn every other frame; a skip ahead or a still draws all
  let since = 0, turn = 0;
  return {
    cranes, polar, hookAt,
    update(dt) { since += dt; for (const k of cranes) { craneStep(k, dt); physics(k, dt); } },
    draw() {
      const slow = since > 1 / 50 && since < 0.1 && !still();
      since = 0; turn ^= 1;
      cranes.forEach((k, i) => drawCrane(k, !slow || i === turn));
    },
  };
}
