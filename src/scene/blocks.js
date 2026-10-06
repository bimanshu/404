/** The 404's blocks: in place, falling, on the ground or carried; their cracks, the dashed gaps, and where fallen blocks land. */
function siteBlocks(ctx) {
  const {
    prism, ringAt, hull, poly, open, lerp, rad, r2, mk, place, spring, stepS, K, depth, front, TAU, wrap, SZ, SD,
    JIB, PILE, MIXER, PALLET, DUMP, slots, P, S, ground, layer, item, setD, flag, rring, rbox, story, still,
  } = ctx;

  // ---------------------------------------------------------------- the 404
  /** Cracks on a block's front face, in face units (x across, z up, 11 square), by the side its missing neighbour is on. */
  const CRACKS = {
    t: [[3, 11], [5, 8], [3.8, 6.2], [6, 3.6]],
    l: [[0, 6], [3, 7.4], [4.6, 5], [7.4, 5.8]],
    r: [[11, 6], [8, 4.4], [6.2, 6.4], [3.8, 5]],
  };
  const out = (q) => q && q.block.state !== "slot";
  /** Which of a block's faces show a crack: "t" when the one above is out, "l" and "r" for its sides. */
  const crackFlags = (b) => {
    if (b.state !== "slot") return "";
    const s = b.slot;
    return (out(s.up) ? "t" : "") + (out(s.left) ? "l" : "") + (out(s.right) ? "r" : "");
  };
  function crackD(s, flags, dx, dy, dz) {
    const j = ((s.col * 7 + s.lvl * 3) % 5) / 5, q = SZ / 11, fy = SD + dy + 0.05;
    let d = "";
    for (const f of flags) {
      const pts = CRACKS[f].map(([x, z], i) => (i ? [x, z] : f === "t" ? [x + j * 3, z] : [x, z + j * 2]));
      d += open(pts.map(([x, z]) => P(s.x0 + dx + x * q, fy, s.z0 + dz + z * q)));
    }
    return d;
  }

  const blocks = slots.map((s) => {
    const g = mk("g", {}, layer), el = { g };
    el.sil = mk("path", { class: "sil blk" }, g);
    el.top = mk("path", { class: "fo blk-top" }, g);
    el.cr = mk("path", { class: "nf sil" }, g);
    el.crack = mk("path", { class: "nf sil" }, g);
    const b = { slot: s, x: s.cx, y: s.cy, z: s.z0, yaw: 0, state: "slot", el, it: item(g), drawn: "", nudge: spring(0, { eps: 0.02 }) };
    s.block = b;
    if (s.spot) { b.x = s.spot[0]; b.y = s.spot[1]; b.z = 0; b.yaw = rad(s.spot[2]); b.state = "ground"; }
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
    const d = rbox(s.cx, s.cy, 0, -SZ / 2, -SD / 2, SZ / 2, SD / 2, s.z0, s.z0 + SZ, 2.4, 0).sil;
    return { s, d, el: mk("path", { class: "nf dash hi" }, g), it: item(g, s.key - 1e-4) };
  });
  /** A loose block, one a press would knock out, slides a little toward the viewer and rises a little. */
  function drawBlock(b, dx = 0, dz = 0) {
    const n = b.nudge.x, y = b.y + n, z = b.z + dz + n * 0.4, flags = crackFlags(b);
    const key = r2(b.x + dx) + "," + r2(y) + "," + r2(z) + "," + r2(b.yaw) + flags;
    if (key !== b.drawn) {
      b.drawn = key;
      const ring = rring(b.x + dx, y, b.yaw, -SZ / 2, -SD / 2, SZ / 2, SD / 2, 2.4);
      const inner = rring(b.x + dx, y, b.yaw, -SZ / 2 + 1, -SD / 2 + 1, SZ / 2 - 1, SD / 2 - 1, 1.4);
      const p = prism(P, front, ring, inner, z, z + SZ);
      setD(b.el.sil, p.sil);
      setD(b.el.top, poly(ringAt(P, ring, z + SZ)));
      setD(b.el.cr, p.crease);
      setD(b.el.crack, flags ? crackD(b.slot, flags, dx, n, z - b.slot.z0) : "");
    }
    b.it.key = depth(b.x, b.y) + b.z * 1e-3;
  }

  const isIn = (s) => s.block.state === "slot";
  const isOut = (s) => s.block.state === "ground";
  /** A slot can take its block only once every slot below it in its column is filled, so nothing is ever set above a gap. */
  const placeable = (s) => slots.every((o) => o.col !== s.col || o.lvl >= s.lvl || o.block.state === "slot");

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
  const clear = (x, y, t) => t.every(([tx, ty]) => Math.hypot(x - tx, y - ty) >= 20.5);

  /** Where a block from slot s can land: clear ground in front of the 404, in reach of its crane, near its column. */
  function findSpot(s, k) {
    const t = taken();
    const keep = [[...PILE, 28], [...MIXER, 26], [...PALLET, 22], [124, 100, 14], [180, 100, 14], [206, 90, 14], [...DUMP, 18], ...ctx.cranes.map((c) => [c.x, c.y, 28])];
    let best = null;
    for (let x = -44; x <= 206; x += 7) for (let y = 30; y <= 94; y += 8) {
      const d = Math.hypot(x - k.x, y - k.y);
      if (d < 32 || d > JIB - 12 || !clear(x, y, t) || keep.some(([kx, ky, r]) => Math.hypot(x - kx, y - ky) < r)) continue;
      const score = Math.abs(x - s.cx) + Math.abs(y - 44) * 1.6;
      if (!best || score < best[3]) best = [x, y, ((story.seq * 47) % 50) - 25, score];
    }
    return best ? best.slice(0, 3) : [s.cx, 22, 0];
  }

  const debris = [];
  function fall(b, dt) {
    const f = b.fall;
    f.t += dt;
    if (f.t < 0) return;
    if (f.t < f.dur) {
      const u = f.t / f.dur, vz = 34, g = (2 * (f.z0 + vz * f.dur)) / (f.dur * f.dur);
      b.x = lerp(f.x0, f.x1, u); b.y = lerp(f.y0, f.y1, u);
      b.z = Math.max(0, f.z0 + vz * f.t - 0.5 * g * f.t * f.t);
      b.yaw = f.yaw * u;
      return;
    }
    if (!f.landed) {
      f.landed = true;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + b.slot.col, sp = 14 + (i % 3) * 6;
        const el = mk("ellipse", { class: "dot m", rx: r2(0.7 * S), ry: r2(0.7 * S * K) }, b.el.g);
        debris.push({ el, b, x: b.x + Math.cos(a) * 6, y: b.y + Math.sin(a) * 6, z: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 16 + (i % 2) * 8, life: 0 });
      }
    }
    const t = f.t - f.dur;
    b.x = f.x1; b.y = f.y1; b.yaw = wrap(f.yaw);
    b.z = t < 0.26 ? 2.6 * Math.sin((t / 0.26) * Math.PI) : 0;
    if (t >= 0.26) { b.state = "ground"; b.fall = null; }
  }

  function update(dt) {
    for (const b of blocks) {
      if (b.state === "falling") fall(b, dt);
      stepS(b.nudge, dt);
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life += dt;
      if (d.z > 0 || d.vz > 0) { d.vz -= 120 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z = Math.max(0, d.z + d.vz * dt); if (d.z === 0) { d.vz = 0; d.vx = d.vy = 0; } }
      if (d.life > 1.6) { d.el.remove(); debris.splice(i, 1); }
    }
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
      flag(b.el.sil, "hi", b.state !== "ground");
      flag(b.el.g, "loose", picked);
    }
    for (const g of ghosts) setD(g.el, g.s.block.state === "slot" ? "" : g.d);
    for (const d of debris) { place(d.el, P(d.x, d.y, d.z)); flag(d.el, "off", d.life > 0.9); }
  }

  return { blocks, ghosts, isIn, isOut, placeable, taken, clear, findSpot, update, draw };
}
