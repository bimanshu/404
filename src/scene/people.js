/**
 * The crew: a manager, a signalman for each crane, an onlooker, a shoveler, a
 * barrow and its pusher, and a labourer with cement bags.
 *
 * Each worker is a jointed body about seven heads tall, built fresh every frame
 * from a few numbers: where the feet are planted, how far the hips crouch, how
 * far the back leans and twists, where the hands are wanted and where the head
 * looks. Legs and arms reach their feet and hands by two-bone IK and are drawn
 * as tapered capsules, so knees and elbows bend. The feet are planted on the
 * ground and stepped by a gait clock that runs on distance walked, so they never
 * slide. Far limbs go behind the torso and near ones in front of it.
 */
function sitePeople(ctx, B, CR) {
  const {
    hull, run, clamp, lerp, rad, mk, sA, cA, VIEW, LIGHT, RIGHT, wrap, smooth, lerpA, rrect, rring,
    PILE, MIXER, PALLET, LOAD, DUMP, BOSS, P, S, layer, item, setD, frame, story, hash, toneOf,
    boxFaces, shadedBox, putBox, makeShadow, depth,
  } = ctx;
  const { cranes } = CR;

  // ---------------------------------------------------------------- small helpers
  const F = (n) => Math.round(n * 10) / 10;
  const pt = (q) => F(q[0]) + " " + F(q[1]);
  /** A path through screen points, closed unless told otherwise. */
  function shape(pts, close = true) {
    if (!pts.length) return "";
    let s = "M" + pt(pts[0]);
    for (let i = 1; i < pts.length; i++) s += "L" + pt(pts[i]);
    return close ? s + "Z" : s;
  }
  const P3 = (q) => P(q[0], q[1], q[2]);
  /** Depth of a world point: larger is nearer the viewer. */
  const dW = (q) => q[0] * sA + q[1] * cA;
  const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  const ease = (x, a, b) => smooth(ramp(x, a, b));
  const setCls = (el, c) => { if (el.__cls !== c) { el.__cls = c; el.setAttribute("class", c); } };
  const toneN = (n) => +toneOf(unit(n)).slice(1);
  const TPI = Math.PI * 2;

  /**
   * A tapered limb through screen points q with screen radii r: one closed
   * outline, mitred at the joints, with round ends.
   */
  function limbPath(q, r) {
    const n = q.length, nx = [], ny = [];
    let px = 0, py = 1, seen = false;
    for (let i = 0; i < n - 1; i++) {
      const dx = q[i + 1][0] - q[i][0], dy = q[i + 1][1] - q[i][1], l = Math.hypot(dx, dy);
      if (l > 0.05) {
        px = -dy / l; py = dx / l;
        if (!seen) { seen = true; for (let k = 0; k < i; k++) { nx[k] = px; ny[k] = py; } }
      }
      nx.push(px); ny.push(py);
    }
    const L = [], R = [];
    for (let j = 0; j < n; j++) {
      let mx, my;
      if (j === 0) { mx = nx[0]; my = ny[0]; }
      else if (j === n - 1) { mx = nx[n - 2]; my = ny[n - 2]; }
      else {
        mx = nx[j - 1] + nx[j]; my = ny[j - 1] + ny[j];
        const l = Math.hypot(mx, my);
        if (l < 0.4) { mx = nx[j]; my = ny[j]; } else { const k = 1 / Math.max(0.7, l / 2) / l; mx *= k; my *= k; }
      }
      L.push([q[j][0] + mx * r[j], q[j][1] + my * r[j]]);
      R.push([q[j][0] - mx * r[j], q[j][1] - my * r[j]]);
    }
    let s = "M" + pt(L[0]);
    for (let j = 1; j < n; j++) s += "L" + pt(L[j]);
    s += "A" + F(r[n - 1]) + " " + F(r[n - 1]) + " 0 0 0 " + pt(R[n - 1]);
    for (let j = n - 2; j >= 0; j--) s += "L" + pt(R[j]);
    return s + "A" + F(r[0]) + " " + F(r[0]) + " 0 0 0 " + pt(L[0]) + "Z";
  }

  /** Two-bone IK: the joint between a and b (lengths l1, l2), bent toward pole. Returns [joint, end]; the end is pulled in when out of reach. */
  function ik(a, b, l1, l2, pole) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz);
    const max = (l1 + l2) * 0.999;
    if (d > max) { const k = max / d; dx *= k; dy *= k; dz *= k; d = max; b = [a[0] + dx, a[1] + dy, a[2] + dz]; }
    if (d < 1e-4) return [add3(a, pole, l1), b];
    const ux = dx / d, uy = dy / d, uz = dz / d;
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const pd = pole[0] * ux + pole[1] * uy + pole[2] * uz;
    let qx = pole[0] - ux * pd, qy = pole[1] - uy * pd, qz = pole[2] - uz * pd;
    const ql = Math.hypot(qx, qy, qz) || 1;
    qx /= ql; qy /= ql; qz /= ql;
    return [[a[0] + ux * x + qx * h, a[1] + uy * x + qy * h, a[2] + uz * x + qz * h], b];
  }

  // ---------------------------------------------------------------- the body
  // World units are about 7 cm. Hip joints stand 11.75 up, shoulders 18.2, the
  // chin about 20, the crown of the head 22.8 and the hard hat 23.2.
  const THIGH = 5.5, SHIN = 5.4, UPPER = 4.4, FORE = 3.4, ANK = 1.05, HIPW = 1.15, SHW = 2.35, STAND = 11.75;
  const LEGMAX = (THIGH + SHIN) * 0.994;
  /** The torso's cross-sections up the spine: height above the hip joints, half depth, half width. */
  const TORSO = [[0.35, 1.45, 2.25], [2.2, 1.42, 2.1], [4.9, 1.7, 2.6], [6.15, 1.45, 2.9], [6.95, 1.0, 1.55]];
  const ANG8 = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * TPI), Math.sin((i / 8) * TPI)]);
  const ANG16 = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * TPI), Math.sin((i / 16) * TPI)]);
  const ANG6 = Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * TPI + 0.5), Math.sin((i / 6) * TPI + 0.5)]);
  const ANG12 = Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * TPI), Math.sin((i / 12) * TPI)]);
  /** A work boot in the foot's frame: u forward from the ankle, v left, z up from the sole. */
  const BOOT = [];
  for (const s of [-1, 1]) BOOT.push([-0.95, s * 0.5, 0], [1.7, s * 0.6, 0], [2.55, s * 0.3, 0.1], [2.4, s * 0.38, 0.7], [1.3, s * 0.52, 1.05], [0.4, s * 0.55, 1.8], [-0.8, s * 0.52, 1.8], [-1.05, s * 0.5, 0.75]);
  /** The swing's share of a stride. */
  const SIG = 0.42;
  const NONE = {};

  function makePerson(x, y, f, o = {}) {
    const g = mk("g", {}, layer), legs = mk("g", {}, g);
    const p = {
      x, y, f, px: x, py: y, pf: f, vx: 0, vy: 0, walk: 0, ph: 0, cv: 0, speed: o.speed || 20, boss: !!o.boss,
      lean: 0, crouch: 0, twist: 0, tilt: 0, sway: 0, hy: 0, hp: 0, nod: 0, look: null, want: NONE,
      seed: o.seed || 0, t: (o.seed || 0) * 3.1, hands: null, extra: null, props: [], it: item(g), order: "",
    };
    p.shadow = makeShadow();
    p.legsG = legs;
    p.leg = [0, 1].map(() => mk("path", { class: "sil t2" }, legs));
    p.boot = [0, 1].map(() => mk("path", { class: "sil t1" }, legs));
    p.back = mk("g", {}, g);
    p.arm = [0, 1].map(() => mk("path", { class: "sil t3" }, p.back));
    p.torso = mk("path", { class: "sil " + (o.boss ? "t4" : "hv") }, g);
    p.marks = mk("path", { class: o.boss ? "fo t2" : "lo t4" }, g);
    p.head = mk("path", { class: "sil t5" }, g);
    p.hat = mk("path", { class: (o.boss ? "hi" : "sil") + " hv" }, g);
    p.front = mk("g", {}, g);
    const Wd = frame(x, y, f);
    p.feet = [1, -1].map((s) => { const q = Wd(0, s * HIPW, 0); return { s, x: q[0], y: q[1], f, z: 0, sw: false, fx: 0, fy: 0, ff: 0, pitch: 0 }; });
    return p;
  }

  /**
   * The gait. A clock runs on distance walked (and on turning, and on its own
   * while a step is unfinished); the left foot swings in the first SIG of each
   * cycle and the right half a cycle later. A swinging foot flies to where its
   * hip will be when it lands, plus half a stance ahead, so a planted foot stays put.
   */
  function gait(p, dt) {
    const dx = p.x - p.px, dy = p.y - p.py, dist = Math.hypot(dx, dy), turn = Math.abs(wrap(p.f - p.pf));
    p.px = p.x; p.py = p.y; p.pf = p.f;
    const k = Math.min(1, dt * 10);
    p.vx += (dx / dt - p.vx) * k; p.vy += (dy / dt - p.vy) * k;
    const v = Math.hypot(p.vx, p.vy), wv = clamp(v / 6, 0, 1);
    p.walk += (wv - p.walk) * Math.min(1, dt * 6);
    const Lc = 7 + 0.5 * Math.max(8, v);
    const Wd = frame(p.x, p.y, p.f);
    let err = 0;
    for (const ft of p.feet) {
      const h = Wd(0, ft.s * HIPW, 0);
      err = Math.max(err, Math.hypot(ft.x - h[0], ft.y - h[1]) + Math.abs(wrap(ft.f - p.f)) * 1.6);
    }
    let dg = dist / Lc + turn * 0.32;
    if ((p.feet[0].sw || p.feet[1].sw || err > 1.2) && dg < dt * 1.9) dg = dt * 1.9;
    p.ph = (p.ph + dg) % 1;
    const ux = v > 0.3 ? p.vx / v : 0, uy = v > 0.3 ? p.vy / v : 0;
    for (const ft of p.feet) {
      const loc = (p.ph - (ft.s > 0 ? 0 : 0.5) + 1) % 1, swinging = loc < SIG;
      if (swinging && !ft.sw) { ft.sw = true; ft.fx = ft.x; ft.fy = ft.y; ft.ff = ft.f; }
      if (!ft.sw) {
        // planted: the heel peels up as the body passes over the foot
        const rel = (ft.x - p.x) * Math.cos(p.f) + (ft.y - p.y) * Math.sin(p.f);
        ft.pitch += (clamp((-rel - 1.2) / 3.4, 0, 1) * 0.6 * wv - ft.pitch) * Math.min(1, dt * 14);
        continue;
      }
      const t = swinging ? loc / SIG : 1;
      const h = Wd(0, ft.s * HIPW, 0), reach = ((SIG - t * SIG) * Lc + (1 - SIG) * Lc * 0.5) * wv;
      const e = smooth(t);
      ft.x = lerp(ft.fx, h[0] + ux * reach, e); ft.y = lerp(ft.fy, h[1] + uy * reach, e);
      ft.f = lerpA(ft.ff, p.f + ft.s * 0.08, e);
      ft.z = Math.sin(Math.PI * t) * (0.55 + 0.75 * wv);
      // toe-off, then the toe lifts for the heel strike
      ft.pitch = (1 - ease(t, 0, 0.35)) * 0.6 * wv - ease(t, 0.55, 1) * 0.3 * wv;
      if (!swinging) { ft.sw = false; ft.z = 0; }
    }
  }

  /** The idle life every body shares: breath, weight shifts, where the head looks, the pose's easing. */
  function life(p, dt) {
    p.t += dt;
    gait(p, dt);
    const w = p.want || NONE, k = Math.min(1, dt * (w.rate || 7));
    p.lean += ((w.lean || 0) + 0.07 * p.walk - p.lean) * k;
    p.crouch += ((w.crouch || 0) + 0.3 * p.walk - p.crouch) * k;
    p.twist += ((w.twist || 0) - p.twist) * k;
    p.tilt += ((w.tilt || 0) - p.tilt) * k;
    // weight shifts from foot to foot while standing; the stance foot carries the hips while walking
    const idle = 1 - p.walk, sd = p.seed * 5.3;
    const shift = (w.shift ?? 0.35) * Math.sin(p.t * 0.43 + sd) * (0.6 + 0.4 * Math.sin(p.t * 0.17 + sd * 2));
    const swayW = -0.28 * p.walk * Math.sin(TPI * p.ph + 0.4);
    p.sway += (shift * idle + swayW - p.sway) * Math.min(1, dt * 4);
    // the head: toward what it is told to watch, else now and then toward whatever moves
    let L = p.look;
    if (!L && p.curious !== false) {
      const per = 7 + 3 * hash(p.seed * 7 + 1), ph = (p.t + p.seed * 2.3) % per;
      if (ph < 2.2) L = movingThing(p);
    }
    let yaw = 0, pitch = -0.08;
    if (L) {
      const a = Math.atan2(L[1] - p.y, L[0] - p.x);
      yaw = clamp(wrap(a - p.f - p.twist), -1.3, 1.3);
      pitch = clamp(Math.atan2(L[2] - 21.5, Math.hypot(L[0] - p.x, L[1] - p.y)), -0.55, 0.22);
    }
    p.hy += (yaw - p.hy) * Math.min(1, dt * 4.5);
    p.hp += (pitch + p.nod - p.hp) * Math.min(1, dt * 7);
  }

  const hookAt = (k) => [k.x + k.r * Math.cos(k.th) + k.sx, k.y + k.r * Math.sin(k.th) + k.sy, k.h - 2];
  /** The nearest thing on the move worth a glance: a working hook, or the barrow. */
  function movingThing(p) {
    let best = null, bd = 1e9;
    for (const k of cranes) {
      if (!k.cur || k.cur.idle) continue;
      const h = hookAt(k), d = Math.hypot(h[0] - p.x, h[1] - p.y);
      if (d < bd) { bd = d; best = h; }
    }
    if (pusher && pusher !== p && pusher.walk > 0.3) {
      const d = Math.hypot(barrow.x - p.x, barrow.y - p.y);
      if (d < bd) best = [barrow.x, barrow.y, 6];
    }
    return best;
  }

  /** Tone index of a side of the body whose outward normal is n, seen partly face on. */
  const sideTone = (nx, ny) => toneN([nx * 0.5 + VIEW[0] * 0.5, ny * 0.5 + VIEW[1] * 0.5, 0.12 + VIEW[2] * 0.5]);

  function drawPerson(p) {
    const f = p.f, cf = Math.cos(f), sf = Math.sin(f);
    const fw = [cf, sf, 0], lf = [-sf, cf, 0];

    // ---- feet: the ankle and the boot, rolled about the ball (heel up) or the ankle (toe up)
    const ank = [];
    for (let i = 0; i < 2; i++) {
      const ft = p.feet[i], c1 = Math.cos(ft.f), s1 = Math.sin(ft.f), pc = Math.cos(ft.pitch), ps = Math.sin(ft.pitch);
      const pu = ft.pitch > 0 ? 2.3 : 0, pz = ft.pitch > 0 ? 0 : ANK;
      const loc = (a, b, c) => {
        const du = a - pu, dz = c - pz, a2 = pu + du * pc + dz * ps, z2 = pz + dz * pc - du * ps;
        return [ft.x + a2 * c1 - b * s1, ft.y + a2 * s1 + b * c1, z2 + ft.z];
      };
      ank.push(loc(0, 0, ANK));
      // a planted boot keeps its outline
      const bk = F(ft.x) + " " + F(ft.y) + " " + F(ft.f * 30) + " " + F(ft.pitch * 30) + " " + F(ft.z);
      if (ft.bk !== bk) { ft.bk = bk; ft.bootD = shape(hull(BOOT.map((q) => P3(loc(q[0], q[1], q[2]))))); }
    }

    // ---- the hips: as high as both legs can reach, lowered by the crouch, shifted by the sway
    const pel = [p.x - sf * p.sway, p.y + cf * p.sway, 0];
    let hz = STAND - p.crouch;
    for (let i = 0; i < 2; i++) {
      const s = p.feet[i].s, hx = pel[0] - sf * s * HIPW, hy = pel[1] + cf * s * HIPW;
      const d = Math.hypot(ank[i][0] - hx, ank[i][1] - hy);
      hz = Math.min(hz, ank[i][2] + Math.sqrt(Math.max(0, LEGMAX * LEGMAX - d * d)));
    }
    pel[2] = Math.max(hz, STAND - 5);

    // ---- the torso's frame: a forward lean, a twist that grows up the spine, a sideways tilt
    const rel = p.feet.map((ft) => (ft.x - pel[0]) * cf + (ft.y - pel[1]) * sf);
    const tw = p.twist + 0.012 * p.walk * (rel[0] - rel[1]);
    const cl = Math.cos(p.lean), sl = Math.sin(p.lean), tl = Math.sin(p.tilt);
    const T = (a, b, h) => {
      const k = tw * clamp(h / 6.3, 0, 1), ck = Math.cos(k), sk = Math.sin(k);
      const a1 = a * ck - b * sk, b1 = a * sk + b * ck, a2 = a1 * cl + h * sl, h2 = h * cl - a1 * sl, b2 = b1 + h2 * tl;
      return [pel[0] + a2 * cf - b2 * sf, pel[1] + a2 * sf + b2 * cf, pel[2] + h2];
    };
    const br = Math.sin(p.t * 1.65 + p.seed) * 0.07;
    const J = { T, fw, lf, pel, f, br };

    // ---- legs
    const tones = [1, -1].map((s) => sideTone(-sf * s, cf * s));
    const legD = [0, 0];
    for (let i = 0; i < 2; i++) {
      const s = p.feet[i].s, hip = T(0, s * HIPW, 0);
      const [kn, an] = ik(hip, ank[i], THIGH, SHIN, [cf + lf[0] * s * 0.15, sf + lf[1] * s * 0.15, 0.05]);
      setD(p.leg[i], limbPath([P3(hip), P3(kn), P3(an)], [1.3 * S, 0.88 * S, 0.6 * S]));
      setCls(p.leg[i], "sil t" + Math.max(1, tones[i] - 1));
      setD(p.boot[i], p.feet[i].bootD);
      legD[i] = dW(kn) + dW(an);
    }

    // ---- torso
    const sil = [];
    for (const [h, hd, hw] of TORSO) {
      const wd = hw + (h > 4 && h < 6 ? br * 0.5 : 0);
      for (const [c, s] of ANG8) sil.push(P3(T(c * hd, s * wd, h + (h > 5 ? br : 0))));
    }
    setD(p.torso, shape(hull(sil)));
    setD(p.marks, p.boss ? jacketShade(p, T, tw) : vestMarks(p, T, tw));

    // ---- head on its neck, and the hard hat
    const hyaw = f + tw + p.hy, hpit = Math.max(-0.55, p.hp - 0.35 * p.lean);
    const cy = Math.cos(hyaw), sy = Math.sin(hyaw), cpt = Math.cos(hpit), spt = Math.sin(hpit);
    const hf = [cpt * cy, cpt * sy, spt], hl = [-sy, cy, 0], hu = [-spt * cy, -spt * sy, cpt];
    const piv = T(0.3, 0, 8.0 + br);
    const HD = (a, b, c) => [piv[0] + hf[0] * a + hl[0] * b + hu[0] * c, piv[1] + hf[1] * a + hl[1] * b + hu[1] * c, piv[2] + hf[2] * a + hl[2] * b + hu[2] * c];
    const hp = [P3(T(0.2, 0.62, 6.9)), P3(T(0.2, -0.62, 6.9)), P3(T(-0.35, 0, 6.95)), P3(HD(0.95, 0, -0.05))];
    for (const [c, sc] of [[-0.85, 0.72], [0.2, 1], [1.2, 0.68]]) for (const [u, v] of ANG8) hp.push(P3(HD(0.15 + 1.22 * u * sc, 1.0 * v * sc, 1.45 + c)));
    setD(p.head, shape(hull(hp)));
    // the hard hat: shell and brim in one outline, with the seam where they meet and the ridge over the crown
    const C0 = 1.85, hat = [], base = [];
    for (const [u, v] of ANG12) {
      hat.push(P3(HD(0.12 + u * (u > 0 ? 2.5 : 1.92), v * 1.8, C0 - 0.04)));
      const nx = hf[0] * u + hl[0] * v, ny = hf[1] * u + hl[1] * v;
      base.push({ u, v, vis: nx * sA + ny * cA > 0 });
    }
    for (const [c, sc] of [[0.9, 0.9], [1.45, 0.62]]) for (const [u, v] of ANG8) hat.push(P3(HD(0.12 + u * (u > 0 ? 1.75 : 1.65) * sc, v * 1.58 * sc, C0 + c)));
    hat.push(P3(HD(0.05, 0, C0 + 1.75)));
    const seam = run(base, (q) => q.vis).map((q) => P3(HD(0.12 + q.u * (q.u > 0 ? 1.75 : 1.65), q.v * 1.58, C0)));
    let ridge = [];
    for (let i = 0; i <= 6; i++) {
      const a = 0.35 + (i / 6) * 2.3, ca = Math.cos(a), sa = Math.sin(a);
      const n = add3(add3([0, 0, 0], hf, ca), hu, sa);
      if (n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] > 0.08) ridge.push(P3(HD(0.12 + ca * 1.7, 0, C0 + sa * 1.75)));
      else if (ridge.length) break;
    }
    setD(p.hat, shape(hull(hat)) + (seam.length > 1 ? shape(seam, false) : "") + (ridge.length > 1 ? shape(ridge, false) : ""));
    J.headAt = HD(0.15, 0, 1.45);

    // ---- arms: hanging and swinging against the legs, unless the pose wants the hands somewhere
    const chestD = dW(T(0.2, 0, 4.5));
    const armD = [0, 0];
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1, sh = T(0, s * SHW, 6.1 + br);
      const sw = clamp(-0.42 * rel[i], -2.6, 2.6) * p.walk + 0.45;
      let hand = [sh[0] + cf * sw - sf * s * 0.5, sh[1] + sf * sw + cf * s * 0.5, sh[2] - 7.2 + 0.12 * Math.abs(sw)];
      let pole = [-cf + lf[0] * s * 0.35, -sf + lf[1] * s * 0.35, -0.1], tipLen = 1.15, tipR = 0.55, tipDir = null;
      const own = p.hands && p.hands(s, J, sh);
      if (own) {
        const w = own.w == null ? 1 : own.w;
        hand = mix3(hand, own.at, w);
        if (own.pole) pole = w >= 1 ? own.pole : add3(pole, own.pole, w * 2);
        if (own.tipLen) { tipLen = own.tipLen; tipR = own.tipR || tipR; }
        tipDir = own.tipDir || null;
      }
      const [el, wr] = ik(sh, hand, UPPER, FORE, pole);
      const dir = tipDir || unit([wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]]);
      const tip = add3(wr, dir, tipLen);
      setD(p.arm[i], limbPath([P3(sh), P3(el), P3(wr), P3(tip)], [0.85 * S, 0.62 * S, 0.45 * S, tipR * S]));
      setCls(p.arm[i], "sil t" + (p.boss ? Math.max(1, tones[i] - 1) : tones[i]));
      armD[i] = dW(sh) - chestD + 0.5 * (dW(wr) - chestD);
      J["hand" + i] = wr;
    }

    // ---- props and the order of everything that can pass in front of the torso or behind it
    if (p.extra) p.extra(p, J);
    const key = (legD[0] > legD[1] ? "a" : "b") + (armD[0] > 0.35 ? "F" : "B") + (armD[1] > 0.35 ? "F" : "B") + (armD[0] > armD[1] ? "1" : "0") + p.props.map((q) => (q.front ? "F" : "B")).join("");
    if (key !== p.order) {
      p.order = key;
      const L = legD[0] > legD[1] ? [1, 0] : [0, 1];
      for (const i of L) { p.legsG.appendChild(p.leg[i]); p.legsG.appendChild(p.boot[i]); }
      for (const q of p.props) (q.front ? p.front : p.back).appendChild(q.el);
      for (const i of armD[0] > armD[1] ? [1, 0] : [0, 1]) (armD[i] > 0.35 ? p.front : p.back).appendChild(p.arm[i]);
    }

    // ---- the soft contact shadow, between the feet
    const mx = (p.feet[0].x + p.feet[1].x) / 2, my = (p.feet[0].y + p.feet[1].y) / 2;
    const shx = mx * 0.6 + pel[0] * 0.4, shy = my * 0.6 + pel[1] * 0.4, srx = 3.3 + Math.abs(rel[0] - rel[1]) * 0.3;
    const sk = F(shx) + " " + F(shy) + " " + F(srx) + " " + F(f * 10);
    if (p.sk !== sk) { p.sk = sk; p.shadow.set(shx, shy, srx, 2.4, f, 0.4); }
    p.it.key = depth(p.x, p.y);
  }

  /** The vest's two reflective bands, and its front opening when the front is in view. */
  function vestMarks(p, T, tw) {
    let d = "";
    const at = (h) => { for (let i = 1; i < TORSO.length; i++) if (h <= TORSO[i][0]) { const a = TORSO[i - 1], b = TORSO[i], t = (h - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; } return TORSO[TORSO.length - 1].slice(1); };
    for (const [h0, h1] of [[1.35, 1.95], [3.55, 4.15]]) {
      const ring = [];
      const [hd, hw] = at((h0 + h1) / 2), yaw = p.f + tw * clamp(h0 / 6.3, 0, 1);
      for (const [c, s] of ANG12) {
        const nu = c / hd, nv = s / hw, nx = nu * Math.cos(yaw) - nv * Math.sin(yaw), ny = nu * Math.sin(yaw) + nv * Math.cos(yaw);
        ring.push({ c, s, vis: nx * sA + ny * cA > 0.02 });
      }
      const vis = run(ring, (q) => q.vis);
      if (vis.length < 2) continue;
      const lo = vis.map((q) => P3(T(q.c * (hd + 0.04), q.s * (hw + 0.04), h0))), up = vis.map((q) => P3(T(q.c * (hd + 0.04), q.s * (hw + 0.04), h1)));
      d += shape(lo.concat(up.reverse()));
    }
    const fyaw = p.f + tw * 0.6;
    if (Math.cos(fyaw) * sA + Math.sin(fyaw) * cA > 0.15) d += shape([P3(T(1.47, 0, 0.45)), P3(T(1.7, 0, 4.9)), P3(T(1.15, 0, 6.6))], false);
    return d;
  }

  /** The manager's jacket: the side turned from the light, as a band up the torso. */
  function jacketShade(p, T, tw) {
    const a = [], b = [];
    for (const [h, hd, hw] of TORSO.slice(0, 4)) {
      const yaw = p.f + tw * clamp(h / 6.3, 0, 1), cy = Math.cos(yaw), sy = Math.sin(yaw);
      const ring = ANG16.map(([c, s]) => {
        const nu = c / hd, nv = s / hw, nx = nu * cy - nv * sy, ny = nu * sy + nv * cy;
        return { c, s, vis: nx * sA + ny * cA > 0, dark: nx * LIGHT[0] + ny * LIGHT[1] < 0 };
      });
      const shade = run(ring, (q) => q.vis).filter((q) => q.dark);
      if (shade.length < 2) continue;
      a.push(P3(T(shade[0].c * hd, shade[0].s * hw, h)));
      b.push(P3(T(shade[shade.length - 1].c * hd, shade[shade.length - 1].s * hw, h)));
    }
    return a.length > 1 ? shape(a.concat(b.reverse())) : "";
  }

  /** Moves a body one step toward (tx, ty): it turns first, then walks, speeding up and slowing down. True once it is there. */
  function walkTo(p, tx, ty, dt, speed = p.speed) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 0.5) { p.cv = 0; return true; }
    const want = Math.atan2(dy, dx), off = Math.abs(wrap(want - p.f));
    turnTo(p, want, dt, 5, off >= 1 && d > 2 * (p.pivot || 0));
    const vmax = off < 1 ? Math.min(speed * (1 - off * 0.5), Math.sqrt(2 * 40 * d) + 1.5) : 0;
    p.cv += clamp(vmax - p.cv, -70 * dt, 32 * dt);
    const step = Math.min(d, Math.max(0, p.cv) * dt);
    p.x += (dx / d) * step; p.y += (dy / d) * step;
    return false;
  }
  /** Turns a body toward want. One pushing a barrow turns about a point ahead of him, walking round it, as the barrow pivots on its middle. */
  function turnTo(p, want, dt, rate = 4, pivot = false) {
    if (!p.pivot || !pivot) { p.f += clamp(wrap(want - p.f), -rate * dt, rate * dt); return; }
    const r = Math.min(rate, p.speed / p.pivot) * dt, d = clamp(wrap(want - p.f), -r, r);
    const ax = p.x + Math.cos(p.f) * p.pivot, ay = p.y + Math.sin(p.f) * p.pivot;
    p.f += d;
    p.x = ax - Math.cos(p.f) * p.pivot; p.y = ay - Math.sin(p.f) * p.pivot;
  }
  const toward = (p, q) => Math.atan2(q[1] - p.y, q[0] - p.x);

  /** A route is a loop of steps: { to }, { face }, { wait }, { until }, each with an optional then. */
  function runRoute(p, dt) {
    const st = p.route[p.ri];
    let done = false;
    if (st.to) done = walkTo(p, st.to[0], st.to[1], dt);
    else {
      p.cv = 0;
      if (st.face != null) { turnTo(p, st.face, dt, 3, true); done = Math.abs(wrap(st.face - p.f)) < 0.04; }
      else if (st.wait != null) { p.wt = (p.wt || 0) + dt; done = p.wt >= st.wait; }
      else if (st.until) done = st.until();
    }
    if (done) { p.wt = 0; p.ri = (p.ri + 1) % p.route.length; if (st.then) st.then(); }
  }

  // ---------------------------------------------------------------- the wheelbarrow
  // A steel tray on a tube frame: one wheel ahead, two legs and two handles behind.
  const AXU = 8.0, AXZ = 2.9, WR = 2.9, ZB = 4.4, ZT = 9.4;
  const TRAY = { bot: rrect(-4.2, -2.4, 3.2, 2.4, 1.3, 2), top: rrect(-6.6, -4.6, 6.6, 4.6, 2.2, 2), heap: rrect(-3.8, -2.3, 3.6, 2.3, 2.1, 2) };
  const WHEEL16 = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * TPI), Math.sin((i / 16) * TPI)]);
  function makeBarrow() {
    const g = mk("g", {}, layer);
    const b = { x: 0, y: 0, f: 0, fill: 0, heap: 0, roll: 0, pitch: 0, lift: 1, tip: 0, it: item(g) };
    b.shadow = makeShadow();
    b.wheelA = [mk("path", { class: "sil t1" }, g), mk("path", { class: "sil t4" }, g)];
    b.frame = mk("path", { class: "nf sil" }, g);
    b.base = mk("path", { class: "fo t2" }, g);
    b.side = mk("path", { class: "fo t4" }, g);
    b.hole = mk("path", { class: "fo t1" }, g);
    b.load = mk("path", { class: "sil t4" }, g);
    b.line = mk("path", { class: "nf sil" }, g);
    b.wheelB = [mk("path", { class: "sil t1" }, g), mk("path", { class: "sil t4" }, g)];
    return b;
  }
  /** The barrow's own frame: u forward to the wheel, pitched about the axle so the legs lift when pushed. */
  const barrowFrame = (b) => {
    const W0 = frame(b.x, b.y, b.f), ca = Math.cos(b.pitch), sa = Math.sin(b.pitch);
    return (u, v, z) => { const du = u - AXU, dz = z - AXZ; return W0(AXU + du * ca + dz * sa, v, AXZ + dz * ca - du * sa); };
  };
  function drawBarrow(b) {
    const key = F(b.x) + " " + F(b.y) + " " + F(b.f * 30) + " " + F(b.pitch * 60) + " " + F(b.roll * 10) + " " + F(b.heap * 20);
    if (b.key === key) return;
    b.key = key;
    const Wd = barrowFrame(b), W = (u, v, z) => P3(Wd(u, v, z)), cf = Math.cos(b.f), sf = Math.sin(b.f);
    // the wheel: a tyre with some width, and a pressed rim with three spokes that turn as it rolls
    const sideV = -sf * sA + cf * cA > 0 ? 1 : -1, wheelNear = cf * sA + sf * cA > 0;
    const tyre = [];
    for (const [c, s] of WHEEL16) for (const v of [-0.62, 0.62]) tyre.push(W(AXU + WR * c, v, AXZ + WR * s));
    const rim = WHEEL16.map(([c, s]) => W(AXU + 1.75 * c, sideV * 0.66, AXZ + 1.75 * s));
    let spokes = "";
    for (let n = 0; n < 3; n++) {
      const a = b.roll + (n * TPI) / 3;
      spokes += shape([W(AXU + 0.45 * Math.cos(a), sideV * 0.68, AXZ + 0.45 * Math.sin(a)), W(AXU + 1.7 * Math.cos(a), sideV * 0.68, AXZ + 1.7 * Math.sin(a))], false);
    }
    const tyreD = shape(hull(tyre)), rimD = shape(rim) + spokes;
    setD(b.wheelA[0], wheelNear ? "" : tyreD); setD(b.wheelA[1], wheelNear ? "" : rimD);
    setD(b.wheelB[0], wheelNear ? tyreD : ""); setD(b.wheelB[1], wheelNear ? rimD : "");
    // the frame: two rails from the axle under the tray to the handles, and the legs
    let fr = "";
    for (const s of [-1, 1]) {
      fr += shape([W(AXU, s * 0.95, AXZ), W(3.4, s * 2.3, ZB - 0.3), W(-4.6, s * 2.7, ZB + 0.1), W(-12.6, s * 3.0, 8.0)], false);
      fr += shape([W(-2.9, s * 2.6, ZB), W(-3.8, s * 2.9, 0), W(-2.6, s * 2.9, 0)], false);
    }
    fr += shape([W(-2.9, -2.6, ZB - 0.2), W(-2.9, 2.6, ZB - 0.2)], false);
    setD(b.frame, fr);
    // the tray: a tapered tub, shaded on the side away from the light, dark inside
    const bot = TRAY.bot.map((q) => W(q.u, q.v, ZB)), top = TRAY.top.map((q) => W(q.u, q.v, ZT));
    const silD = shape(hull(bot.concat(top)));
    const ring = TRAY.top.map((q, i) => {
      const nx = q.nu * cf - q.nv * sf, ny = q.nu * sf + q.nv * cf;
      return { i, vis: nx * sA + ny * cA >= 0, right: nx * RIGHT[0] + ny * RIGHT[1] > 0 };
    });
    const lit = run(ring, (q) => q.vis && !q.right);
    setD(b.base, silD);
    setD(b.side, lit.length > 1 ? shape(lit.map((q) => top[q.i]).concat(lit.map((q) => bot[q.i]).reverse())) : "");
    setD(b.hole, shape(top));
    if (b.heap > 0.03) {
      const at = (rr, z) => rr.map((q) => W(q.u, q.v, z));
      setD(b.load, shape(hull(at(TRAY.top, ZT - 0.6).concat(at(TRAY.heap, ZT - 0.3 + 3.2 * b.heap)))));
    } else setD(b.load, "");
    setD(b.line, silD + shape(top));
    const c = Wd(0.5, 0, 0);
    b.shadow.set(c[0], c[1], 10.5, 5.6, b.f, 0.42);
    b.it.key = depth(b.x, b.y);
  }

  // ---------------------------------------------------------------- the crew
  // the manager: clipboard in one hand, the other points at whatever is being set down
  const boss = makePerson(BOSS[0], BOSS[1], rad(-100), { boss: true, seed: 1 });
  boss.pw = 0; boss.target = [66, 6, 40]; boss.home = rad(-100); boss.placed = story.placed; boss.nodT = 9; boss.glance = 0;
  boss.clip = mk("path", { class: "sil t6" }, boss.front);
  boss.props = [{ el: boss.clip, front: true }];
  boss.hands = (s, J, sh) => {
    const { T, fw, lf } = J;
    if (s > 0) {
      // the clipboard hand, in front of the chest; raised a little when he reads it
      const g = boss.glance;
      return { at: T(2.5 + 0.4 * g, 0.75, 3.2 + 1.1 * g), pole: [-fw[0] * 0.2 + lf[0], -fw[1] * 0.2 + lf[1], -0.7] };
    }
    if (boss.pw < 0.01) return null;
    const d = unit([boss.target[0] - sh[0], boss.target[1] - sh[1], boss.target[2] - sh[2]]);
    return { at: add3(sh, d, 7.6), w: boss.pw, pole: [-lf[0] * 0.6, -lf[1] * 0.6, -1], tipLen: 1.7, tipR: 0.38 };
  };
  boss.extra = (p, J) => {
    const h = J.hand0, { fw, lf } = J;
    const up = unit([fw[0] * 0.7, fw[1] * 0.7, 0.72]), c = add3(add3(h, up, 1.2), fw, 0.3);
    const q = [add3(add3(c, lf, 1.25), up, -1.6), add3(add3(c, lf, 1.25), up, 1.6), add3(add3(c, lf, -1.25), up, 1.6), add3(add3(c, lf, -1.25), up, -1.6)];
    const k0 = add3(add3(c, up, 1.45), lf, 0.5), k1 = add3(add3(c, up, 1.45), lf, -0.5);
    setD(p.clip, shape(q.map(P3)) + shape([P3(k0), P3(k1)], false));
    p.props[0].front = dW(c) > dW(J.T(0.2, 0, 4.5));
    p.clipAt = c;
  };

  // a signalman for each crane: walks to the block, beckons while the load travels, raises an arm while the hook comes down
  const signals = cranes.map((k, n) => {
    const p = makePerson(k.home[0], k.home[1], rad(-100), { speed: 26, seed: 2 + n });
    p.k = k; p.raise = 0; p.beck = 0; p.cheer = 0;
    p.hands = (s, J, sh) => {
      const { fw, lf } = J, t = p.t;
      if (p.cheer > 0.01) {
        const at = add3(add3(add3(sh, [0, 0, 7.1]), lf, s * 1.4), fw, 0.9 * Math.sin(t * 8 + s));
        return { at, w: p.cheer, pole: [lf[0] * s, lf[1] * s, -0.3] };
      }
      if (s > 0) return null;
      if (p.raise > 0.01) {
        // arm up, the hand circling: keep it coming down
        const at = add3(add3(add3(sh, [0, 0, 7.2]), lf, -0.9 + 0.35 * Math.cos(t * 6)), fw, 0.9 + 0.35 * Math.sin(t * 6));
        return { at, w: p.raise, pole: [lf[0] * -1 + fw[0] * 0.3, lf[1] * -1 + fw[1] * 0.3, 0] };
      }
      if (p.beck > 0.01) {
        // forearm up and toward the body, again and again: bring it here
        const b = 0.5 - 0.5 * Math.cos(t * 5.6);
        const at = mix3(add3(add3(sh, fw, 6.6), [0, 0, 1.4]), add3(add3(sh, fw, 3.0), [0, 0, 3.4]), b);
        return { at: add3(at, lf, -0.8), w: p.beck, pole: [-lf[0], -lf[1], -0.8] };
      }
      return null;
    };
    return p;
  });

  // the onlooker: hands on hips, watching the right crane, shifting from foot to foot
  const watcher = makePerson(212, 110, rad(-120), { seed: 5 });
  watcher.want = { shift: 0.6 };
  watcher.hands = (s, J) => ({ at: J.T(0.1, s * 2.55, 1.6), pole: [J.lf[0] * s - J.fw[0] * 0.4, J.lf[1] * s - J.fw[1] * 0.4, 0.1] });

  // the shoveler and the barrow he fills
  const barrow = makeBarrow();
  const pusher = makePerson(LOAD[0], LOAD[1], Math.PI, { speed: 20, seed: 6 });
  pusher.hold = 1;
  pusher.route = [
    { to: LOAD }, { face: Math.PI },
    { wait: 0.45, lift: 0 },
    { wait: 0.4, hold: 0 },
    { until: () => barrow.fill >= 1, hold: 0, load: true },
    { wait: 0.55, lift: 0 },
    { wait: 0.4 },
    { face: rad(-90) },
    { to: [120, 120] }, { to: DUMP }, { face: toward({ x: DUMP[0], y: DUMP[1] }, MIXER) },
    { wait: 0.7, tip: 1, then: () => { barrow.dumped = 1; } },
    { until: () => !barrow.dumped, tip: 1 },
    { wait: 0.6, tip: 0 },
    { to: [120, 120] },
  ];
  pusher.ri = 0;
  pusher.pivot = 13;
  /** The barrow rides ahead of its pusher; its wheel turns with the distance it rolls forward. */
  const HITCH = 14.8;
  const hitch = () => {
    const wx = barrow.x, wy = barrow.y;
    barrow.f = pusher.f;
    barrow.x = pusher.x + Math.cos(pusher.f) * HITCH;
    barrow.y = pusher.y + Math.sin(pusher.f) * HITCH;
    barrow.roll += ((barrow.x - wx) * Math.cos(barrow.f) + (barrow.y - wy) * Math.sin(barrow.f)) / WR;
  };
  hitch();
  const grip = (s) => add3(barrowFrame(barrow)(-11.9, s * 3.0, 8.0), [0, 0, 0.5]);
  pusher.hands = (s, J) => (pusher.hold > 0.01 ? { at: grip(s), w: pusher.hold, pole: [-J.fw[0] + J.lf[0] * s * 0.6, -J.fw[1] + J.lf[1] * s * 0.6, -0.4], tipDir: unit([J.fw[0], J.fw[1], -0.4]) } : null);

  const shovel = makePerson(-30, 100, Math.PI, { seed: 8 });
  shovel.cyc = 0;
  shovel.toolG = mk("g", {}, shovel.front);
  shovel.tool = mk("path", { class: "nf sil" }, shovel.toolG);
  shovel.blade = mk("path", { class: "sil t3" }, shovel.toolG);
  shovel.sand = mk("path", { class: "sil t4" }, shovel.toolG);
  shovel.props = [{ el: shovel.toolG, front: true }];
  /** Shovel poses in the body's frame: G the grip end, X the blade's tip; how far he crouches and leans. */
  const SHOVEL = {
    rest: { G: [1.1, -2.5, 15.4], X: [3.4, -3.4, 0.2], crouch: 0, lean: 0.03 },
    aim: { G: [-0.4, -2.2, 11.4], X: [10.4, 0.5, 5.6], crouch: 2.0, lean: 0.55 },
    dig: { G: [-1.6, -2.1, 9.9], X: [12.2, 0.5, 3.0], crouch: 2.5, lean: 0.72 },
    lift: { G: [-0.4, -2.3, 12.6], X: [14.6, 0.2, 10.4], crouch: 0.8, lean: 0.24 },
    toss: { G: [0.3, -2.2, 14.2], X: [14.4, -0.3, 12.0], crouch: 0.35, lean: 0.08 },
  };
  const mixPose = (a, b, t) => ({ G: mix3(a.G, b.G, t), X: mix3(a.X, b.X, t), crouch: lerp(a.crouch, b.crouch, t), lean: lerp(a.lean, b.lean, t) });
  shovel.pose = SHOVEL.rest;
  shovel.yawOff = 0;
  /** The pose's points in the world, from the hips' frame (not the shoulders', so the tool turns with the twist). */
  const shovelPts = (J) => {
    const pz = shovel.pose, tw = shovel.twist, c = Math.cos(tw), s = Math.sin(tw);
    const W = (q) => { const u = q[0] * c - q[1] * s, v = q[0] * s + q[1] * c; return [shovel.x + u * J.fw[0] + v * J.lf[0], shovel.y + u * J.fw[1] + v * J.lf[1], q[2]]; };
    const G = W(pz.G), X = W(pz.X), d = unit([X[0] - G[0], X[1] - G[1], X[2] - G[2]]);
    return { G, X: add3(G, d, 15.7), N: add3(G, d, 11.5), d };
  };
  shovel.hands = (s, J) => {
    const k = shovelPts(J), busy = shovel.cyc > 0 || shovel.pose !== SHOVEL.rest;
    if (s < 0) return { at: add3(k.G, k.d, 0.6), pole: [-J.fw[0] + J.lf[0] * -0.6, -J.fw[1] + J.lf[1] * -0.6, -0.5], tipDir: k.d, tipLen: 0.9 };
    return busy ? { at: add3(k.G, k.d, 5.0), w: clamp(shovel.grip, 0, 1), pole: [J.lf[0] * 0.8 - J.fw[0] * 0.3, J.lf[1] * 0.8 - J.fw[1] * 0.3, -0.8], tipDir: k.d, tipLen: 0.9 } : null;
  };
  shovel.grip = 0;
  shovel.extra = (p, J) => {
    const k = shovelPts(J), side = unit([-k.d[1], k.d[0], 0]), up = unit([-k.d[0] * k.d[2], -k.d[1] * k.d[2], k.d[0] * k.d[0] + k.d[1] * k.d[1]]);
    setD(p.tool, shape([P3(k.G), P3(k.N)], false) + shape([P3(add3(k.G, side, 0.8)), P3(add3(k.G, side, -0.8))], false));
    const bl = [add3(k.N, side, 1.2), add3(add3(k.X, side, 1.35), up, 0.25), add3(add3(k.X, side, -1.35), up, 0.25), add3(k.N, side, -1.2)];
    setD(p.blade, shape(bl.map(P3)));
    const full = p.cyc > 0.22 && p.cyc < 0.69;
    if (full) {
      const c = add3(mix3(k.N, k.X, 0.5), up, 0.35), hp = [];
      for (const [u, v] of ANG8) hp.push(P3(add3(add3(c, k.d, u * 1.6), side, v * 0.95)));
      hp.push(P3(add3(c, up, 1.0)));
      setD(p.sand, shape(hull(hp)));
    } else setD(p.sand, "");
    p.props[0].front = dW(mix3(k.G, k.N, 0.5)) > dW(J.T(0.2, 0, 4.5)) - 0.5;
  };

  // the labourer carrying cement bags from the pallet to the mixer
  /** He lifts from the near side of the pallet and tips into the mixer's mouth, walking round its end. */
  const PICK = [258.5, -4.5], DROP = [260.5, 59.5], ROUND = [252, 32], MOUTH = [267.8, 53.6];
  const carrier = makePerson(PICK[0], PICK[1], rad(-15), { speed: 16, seed: 9 });
  carrier.bag = false;
  carrier.sack = shadedBox(carrier.front, ["t2", "t3", "t5"]);
  carrier.props = [{ el: carrier.sack.g, front: true }];
  carrier.route = [
    { to: PICK }, { face: toward({ x: PICK[0], y: PICK[1] }, PALLET) },
    { wait: 1.7, act: "pick" },
    { to: ROUND }, { to: DROP }, { face: toward({ x: DROP[0], y: DROP[1] }, MOUTH) },
    { wait: 1.5, act: "drop" },
    { to: ROUND },
  ];
  carrier.ri = 0;
  /** Where the bag is, by what he is doing: on the stack, in his hands, or on his right shoulder. */
  const bagPlace = (J) => {
    const { T, fw } = J, st = carrier.route[carrier.ri], w = carrier.wt || 0;
    const shoulder = T(0.25, -2.0, 7.35), front = T(3.1, 0, 2.7), chest = T(3.1, 0, 4.6);
    if (st.act === "pick") {
      const stack = [carrier.x + fw[0] * 7.2, carrier.y + fw[1] * 7.2, 11.7];
      if (w < 1.15) return { at: mix3(stack, front, ease(w, 0.6, 1.15)), held: 2 };
      return { at: mix3(front, shoulder, ease(w, 1.15, 1.6)), held: w < 1.5 ? 2 : 1 };
    }
    if (st.act === "drop") {
      if (w < 0.55) return { at: mix3(shoulder, chest, ease(w, 0, 0.55)), held: w < 0.15 ? 1 : 2 };
      // heaved forward into the drum's mouth
      const pour = [carrier.x + fw[0] * 6.2, carrier.y + fw[1] * 6.2, 16.4];
      return { at: mix3(chest, pour, ease(w, 0.55, 1.0)), held: 2 };
    }
    return { at: shoulder, held: 1 };
  };
  carrier.hands = (s, J) => {
    const st = carrier.route[carrier.ri], w = carrier.wt || 0, { fw, lf } = J;
    if (!carrier.bag) {
      if (st.act === "pick" && w < 0.62) {
        const stack = [carrier.x + fw[0] * 7.2, carrier.y + fw[1] * 7.2, 12.0];
        return { at: add3(stack, lf, s * 2.0), w: ease(w, 0.05, 0.55), pole: [lf[0] * s - fw[0] * 0.3, lf[1] * s - fw[1] * 0.3, -0.6] };
      }
      return null;
    }
    const bp = bagPlace(J);
    if (bp.held === 2) return { at: add3(add3(bp.at, lf, s * 2.05), [0, 0, 0.2]), pole: [lf[0] * s - fw[0] * 0.3, lf[1] * s - fw[1] * 0.3, -0.7] };
    if (s < 0) return { at: add3(add3(bp.at, fw, 2.7), [0, 0, 1.0]), pole: [-fw[0] * 0.2 - lf[0], -fw[1] * 0.2 - lf[1], -0.6] };
    return null;
  };
  carrier.extra = (p, J) => {
    if (!p.bag) { putBox(p.sack, { sil: "", top: "", left: "", right: "", crease: "" }); return; }
    const bp = bagPlace(J);
    putBox(p.sack, boxFaces(rring(bp.at[0], bp.at[1], p.f, -4.1, -1.7, 4.1, 1.7, 1.4), bp.at[2] - 1.0, bp.at[2] + 1.0, null));
    p.props[0].front = dW(bp.at) > dW(J.T(0.2, 0, 4.5)) + 0.2;
  };

  const people = [boss, ...signals, watcher, pusher, shovel, carrier];

  let tick = 0, simDt = 0, frameDt = 1 / 60;
  function updatePeople(dt) {
    simDt += dt;
    // ---- the barrow and its pusher
    runRoute(pusher, dt);
    hitch();
    const st = pusher.route[pusher.ri];
    const wantHold = st.hold ?? 1, wantLift = st.lift ?? (wantHold ? 1 : 0), wantTip = st.tip ?? 0;
    pusher.hold += (wantHold - pusher.hold) * Math.min(1, dt * 7);
    const lift = pusher.hold > 0.85 ? wantLift : 0;
    barrow.lift += (lift - barrow.lift) * Math.min(1, dt * 6);
    barrow.tip += (wantTip - barrow.tip) * Math.min(1, dt * 3.2);
    barrow.pitch = rad(8) * barrow.lift + rad(22) * barrow.tip;
    if (barrow.dumped) { barrow.fill = Math.max(0, barrow.fill - dt * 1.4); if (!barrow.fill) barrow.dumped = 0; }
    barrow.heap += (barrow.fill - barrow.heap) * Math.min(1, dt * (barrow.dumped ? 12 : 5));
    const hl = pusher.hold;
    pusher.want = {
      lean: hl * lerp(lerp(0.52, 0.2, barrow.lift), 0.02, barrow.tip),
      crouch: hl * lerp(lerp(2.1, 0.3, barrow.lift), 0.5, barrow.tip),
      shift: hl > 0.5 ? 0.1 : 0.35,
    };
    pusher.look = hl > 0.5 ? null : [barrow.x, barrow.y, 8];
    pusher.curious = hl < 0.5;

    // ---- the shoveler loads while the barrow waits beside him
    const loading = st.load && barrow.fill < 1;
    const fPile = toward(shovel, PILE), fBar = toward(shovel, [barrow.x, barrow.y]);
    if (loading || shovel.cyc > 0) {
      const before = shovel.cyc;
      shovel.cyc += dt / 2.3;
      if (before < 0.68 && shovel.cyc >= 0.68) barrow.fill = Math.min(1, barrow.fill + 0.25);
      if (before === 0) shovel.from = shovel.pose;
      if (shovel.cyc >= 1) { shovel.cyc = loading ? shovel.cyc - 1 : 0; shovel.from = SHOVEL.aim; }
      const c = shovel.cyc, A = SHOVEL.dig, Bp = SHOVEL.lift, Tp = SHOVEL.toss, sw = wrap(fBar - fPile);
      let turn = 0;
      // aim at the pile, thrust the blade in, pry and lift, swing round, toss, swing back
      if (c < 0.12) { shovel.pose = mixPose(shovel.from, SHOVEL.aim, ease(c, 0, 0.12)); turn = 0; }
      else if (c < 0.22) { shovel.pose = mixPose(SHOVEL.aim, A, ease(c, 0.12, 0.22)); turn = 0; }
      else if (c < 0.38) { shovel.pose = mixPose(A, Bp, ease(c, 0.22, 0.38)); turn = 0; }
      else if (c < 0.6) { shovel.pose = Bp; turn = ease(c, 0.38, 0.6); }
      else if (c < 0.72) { shovel.pose = mixPose(Bp, Tp, ease(c, 0.6, 0.72)); turn = 1; }
      else { shovel.pose = mixPose(Tp, SHOVEL.aim, ease(c, 0.72, 1)); turn = 1 - ease(c, 0.72, 1); }
      // the hips swing most of the way round and the shoulders twist the rest
      const fTo = fPile + sw * 0.68 * turn;
      shovel.f = lerpA(shovel.f, fTo, Math.min(1, dt * 12));
      shovel.want = { lean: shovel.pose.lean, crouch: shovel.pose.crouch, twist: sw * 0.32 * turn, rate: 14, shift: 0 };
      shovel.grip += (1 - shovel.grip) * Math.min(1, dt * 6);
      shovel.look = shovelPts({ fw: [Math.cos(shovel.f), Math.sin(shovel.f)], lf: [-Math.sin(shovel.f), Math.cos(shovel.f)] }).X;
      shovel.curious = false;
    } else {
      turnTo(shovel, rad(-60), dt, 1.5);
      shovel.pose = mixPose(shovel.pose, SHOVEL.rest, Math.min(1, dt * 4));
      if (Math.abs(shovel.pose.G[2] - SHOVEL.rest.G[2]) < 0.02) shovel.pose = SHOVEL.rest;
      shovel.want = { lean: shovel.pose.lean, crouch: shovel.pose.crouch, shift: 0.25 };
      shovel.grip += (0 - shovel.grip) * Math.min(1, dt * 5);
      shovel.look = null; shovel.curious = true;
    }

    // ---- the labourer
    runRoute(carrier, dt);
    {
      const cs = carrier.route[carrier.ri], w = carrier.wt || 0;
      if (cs.act === "pick") {
        if (w >= 0.6) carrier.bag = true;
        const bend = ease(w, 0, 0.5) * (1 - ease(w, 0.75, 1.3));
        carrier.want = { lean: 0.55 * bend, crouch: 2.0 * bend, rate: 9, shift: 0 };
      } else if (cs.act === "drop") {
        if (w >= 1.0) carrier.bag = false;
        const bend = ease(w, 0.45, 0.95) * (1 - ease(w, 1.05, 1.5));
        carrier.want = { lean: 0.3 * bend, crouch: 0.5 * bend, rate: 9, shift: 0 };
      } else carrier.want = carrier.bag ? { lean: 0.1, crouch: 0.35, tilt: 0.07, shift: 0.1 } : NONE;
      carrier.curious = !carrier.bag;
      carrier.look = cs.act === "pick" && w < 1.1 ? [carrier.x + Math.cos(carrier.f) * 7, carrier.y + Math.sin(carrier.f) * 7, 11] : cs.act === "drop" ? [MOUTH[0], MOUTH[1], 16] : null;
    }

    // ---- signalmen follow their crane's job
    for (const p of signals) {
      const k = p.k, b = k.job;
      let to = k.home, look = hookAt(k);
      if (k.mode === "setdown") { to = [k.spot[0] + 3, k.spot[1] + 17]; }
      else if (b && b.state === "ground") { to = [b.x + 3, b.y + 17]; }
      else if (b) { to = [b.slot.cx + 3, 30]; }
      const there = walkTo(p, to[0], to[1], dt);
      if (there) turnTo(p, toward(p, look), dt, 3);
      const busy = there && b && k.cur;
      p.raise += ((busy && k.cur.low ? 1 : 0) - p.raise) * Math.min(1, dt * 5);
      p.beck += ((busy && k.cur.th != null ? 1 : 0) - p.beck) * Math.min(1, dt * 5);
      p.cheer += ((story.phase === "fixed" ? 1 : 0) - p.cheer) * Math.min(1, dt * 5);
      p.look = b || k.mode ? look : null;
      p.want = { shift: there ? 0.3 : 0 };
    }

    // ---- the manager turns to whatever is being set down and points at it; nods when it lands; reads his clipboard between
    const busy = cranes.find((k) => k.cur && k.cur.low && k.job);
    if (busy) boss.target = hookAt(busy);
    boss.pw += ((busy || story.phase === "fixed" ? 1 : 0) - boss.pw) * Math.min(1, dt * 3);
    if (story.phase === "fixed") boss.target = [boss.x + Math.cos(boss.f) * 2, boss.y + Math.sin(boss.f) * 2, 60];
    const look = busy ? toward(boss, boss.target) : boss.home;
    turnTo(boss, boss.home + clamp(wrap(look - boss.home), -1, 1), dt, 1.2);
    if (story.placed > boss.placed) boss.nodT = 0;
    boss.placed = story.placed;
    boss.nodT += dt;
    { const sn = Math.sin(Math.min(1, boss.nodT / 0.9) * Math.PI * 2); boss.nod = boss.nodT < 1 ? -0.3 * sn * sn : 0; }
    const reading = !busy && story.phase !== "fixed" && (boss.t % 9) > 5.2;
    boss.glance += ((reading ? 1 : 0) - boss.glance) * Math.min(1, dt * 3);
    boss.look = busy ? boss.target : reading && boss.clipAt ? boss.clipAt : null;
    boss.curious = !reading;
    boss.want = { shift: 0.25 };

    // ---- the onlooker follows the right crane's hook
    const rk = cranes[1], hk = hookAt(rk);
    turnTo(watcher, toward(watcher, hk), dt, 0.8);
    watcher.look = hk;

    boss.busy = boss.pw > 0.02 || boss.nodT < 1 || Math.abs(boss.glance - (reading ? 1 : 0)) > 0.02;
    for (const p of signals) p.busy = p.raise > 0.02 || p.beck > 0.02 || p.cheer > 0.02;
    pusher.busy = pusher.hold > 0.02 || Math.abs(barrow.tip) > 0.01;
    shovel.busy = shovel.cyc > 0 || shovel.grip > 0.02;
    carrier.busy = carrier.bag || !!carrier.route[carrier.ri].act;
    for (const p of people) {
      life(p, dt);
      p.calm = !p.busy && p.walk < 0.03 && !p.feet[0].sw && !p.feet[1].sw;
    }
  }

  return {
    people, barrow, update: updatePeople,
    draw() {
      // When frames come slower than about 50 a second, the crew takes turns: each body is redrawn every
      // other frame, and one only breathing and shifting its weight every fourth. A still frame draws all.
      tick++;
      frameDt += (simDt - frameDt) * 0.1; simDt = 0;
      const all = ctx.still(), slow = frameDt > 1 / 50;
      people.forEach((p, i) => {
        const every = p.calm ? (slow ? 4 : 2) : slow ? 2 : 1;
        if (all || !p.drawn || (tick + i) % every === 0) { drawPerson(p); p.drawn = true; }
      });
      drawBarrow(barrow);
    },
  };
}
