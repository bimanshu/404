/** The two tower cranes: their masts and slewing tops, the hook and its load, and the jobs that put blocks back. */
function siteCranes(ctx, B) {
  const {
    ringAt, hull, poly, open, seg, clamp, lerp, mk, solid, place, sA, cA, depth, wrap, smooth, SZ, SL, SAFE,
    HOOK_GROUND, JIB, CRANES, P, ground, layer, tops, item, setD, putC, rring, rbox, story, still,
  } = ctx;
  const { blocks, placeable, findSpot } = B;

  // ---------------------------------------------------------------- cranes
  function makeCrane(c) {
    const k = { ...c, th: c.park, r: 64, h: SAFE, steps: [], cur: null, job: null, mode: null, spot: null, sx: 0, sy: 0, svx: 0, svy: 0, tp: null, tv: [0, 0], side: null };
    const { x, y, H } = c;
    // footing, mast and its lattice
    const g = mk("g", {}, layer);
    putC(solid(g), rbox(x, y, 0, -13, -13, 13, 13, 0, 4.5, 3, 1.2));
    putC(solid(g), rbox(x, y, 0, -4.6, -4.6, 4.6, 4.6, 4.5, H, 1.2, 0.6));
    let lat = "";
    const zs = [];
    for (let z = 6; z <= H - 2; z += 7.5) zs.push(z);
    lat += open(zs.map((z, i) => P(x + 4.6, y + (i % 2 ? 3.2 : -3.2), z)));
    lat += open(zs.map((z, i) => P(x + (i % 2 ? -3.2 : 3.2), y + 4.6, z)));
    mk("path", { class: "nf", d: lat }, g);
    item(g, depth(x, y));
    // the hook, its cable and slings: an item, so it paints in depth order with the load
    const hg = mk("g", {}, layer);
    k.cable = mk("path", { class: "nf" }, hg);
    k.block = solid(hg);
    k.hook = mk("path", { class: "nf sil" }, hg);
    k.sling = mk("path", { class: "nf" }, hg);
    k.hookIt = item(hg);
    // the slewing top: painted after everything on the ground
    const t = mk("g", {}, tops);
    k.parts = {
      cw: solid(t), cj: solid(t), cjl: mk("path", { class: "nf" }, t), apex: mk("path", { class: "sil" }, t),
      turn: solid(t), cab: solid(t), win: mk("path", { class: "nf" }, t),
      trolley: solid(t), jib: solid(t), jl: mk("path", { class: "nf" }, t), ties: mk("path", { class: "nf" }, t),
    };
    k.top = t;
    return k;
  }

  function drawCrane(k) {
    const { x, y, H, th, r } = k, p = k.parts, c = Math.cos(th), s = Math.sin(th);
    const L = (u, v, z) => P(x + u * c - v * s, y + u * s + v * c, z);
    const away = c * sA + s * cA < 0;
    if (away !== k.side) {
      k.side = away;
      const back = [p.cw.g, p.cj.g, p.cjl, p.apex, p.turn.g, p.cab.g, p.win], jib = [p.trolley.g, p.jib.g, p.jl];
      for (const e of away ? [...jib, ...back.slice().reverse()] : [...back, ...jib]) k.top.appendChild(e);
      k.top.appendChild(p.ties);
    }
    putC(p.cw, rbox(x, y, th, -58, -5.5, -44, 5.5, H - 9, H + 4, 1.6, 0.8));
    putC(p.cj, rbox(x, y, th, -55, -3.2, -4, 3.2, H + 2.5, H + 7.5, 1, 0.6));
    const ns = -s * sA + c * cA >= 0 ? 1 : -1;
    const zig = (u0, u1, step, v, za, zb) => { const pts = []; for (let u = u0, i = 0; u <= u1; u += step, i++) pts.push(L(u, v, i % 2 ? zb : za)); return open(pts); };
    setD(p.cjl, zig(-42, -6, 6, ns * 3.2, H + 3, H + 7));
    const foot = rring(x, y, th, -3.8, -3.8, 3.8, 3.8, 1), head = rring(x, y, th, -1.1, -1.1, 1.1, 1.1, 0.5);
    setD(p.apex, poly(hull(ringAt(P, foot, H + 9).concat(ringAt(P, head, H + 34)))));
    putC(p.turn, rbox(x, y, th, -7, -7, 7, 7, H, H + 2.5, 2, 0.8));
    putC(p.cab, rbox(x, y, th, -1, 4, 8, 11, H + 2.5, H + 10.5, 1.4, 0.7));
    const winFace = c * sA + s * cA >= 0;
    setD(p.win, winFace ? poly([L(8.05, 5.4, H + 5), L(8.05, 9.6, H + 5), L(8.05, 9.6, H + 9), L(8.05, 5.4, H + 9)]) : "");
    putC(p.trolley, rbox(x, y, th, r - 4, -3.6, r + 4, 3.6, H - 1.4, H + 2.6, 1, 0.5));
    putC(p.jib, rbox(x, y, th, -4, -3, JIB, 3, H + 2.5, H + 9, 1, 0.6));
    setD(p.jl, zig(4, JIB - 4, 7.5, ns * 3, H + 3, H + 8.5));
    const A = P(x, y, H + 34);
    setD(p.ties, seg(A, L(70, 0, H + 9)) + seg(A, L(136, 0, H + 9)) + seg(A, L(-52, 0, H + 7.5)));

    // hook, cable, slings and load
    const tx = x + r * c, ty = y + r * s, hx = tx + k.sx, hy = ty + k.sy, h = k.h;
    const n = [-s * 1.1, c * 1.1];
    setD(k.cable, seg(P(tx + n[0], ty + n[1], H - 1.4), P(hx + n[0], hy + n[1], h + 6.5)) + seg(P(tx - n[0], ty - n[1], H - 1.4), P(hx - n[0], hy - n[1], h + 6.5)));
    putC(k.block, rbox(hx, hy, th, -2.6, -2.6, 2.6, 2.6, h + 1, h + 6.5, 1, 0.5));
    const H2 = (u, z) => P(hx + u * c, hy + u * s, z);
    setD(k.hook, open([H2(0, h + 1), H2(0, h - 1.2), H2(0.7, h - 2.5), H2(1.9, h - 2.6), H2(2.5, h - 1.6)]));
    const load = k.job && k.job.state === "carried" ? k.job : null;
    if (load) {
      const cc = Math.cos(load.yaw), ss = Math.sin(load.yaw), top = load.z + SZ, hk = P(hx, hy, h - 2);
      setD(k.sling, [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => seg(hk, P(load.x + 5.9 * u * cc - 3 * v * ss, load.y + 5.9 * u * ss + 3 * v * cc, top))).join(""));
    } else setD(k.sling, "");
    k.hookIt.key = depth(hx, hy) + 0.02 + (load ? load.z * 1e-3 : 0);
  }

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

  const parked = (k) => Math.abs(wrap(k.park - k.th)) < 0.01 && Math.abs(k.r - 64) < 0.5 && Math.abs(k.h - SAFE) < 0.5;

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
      if (st.th != null) { st.dth = wrap(st.th - k.th); st.dur = Math.max(0.9, 0.6 + Math.abs(st.dth) * 1.1 + Math.abs(st.r - k.r) / 90); }
      else if (st.h != null) st.dur = Math.max(0.5, 0.35 + Math.abs(st.h - k.h) / 55);
      else st.dur = st.wait;
      k.cur = st;
    }
    const st = k.cur;
    st.t += dt;
    const e = smooth(clamp(st.t / st.dur, 0, 1));
    if (st.th != null) { k.th = st.f.th + st.dth * e; k.r = lerp(st.f.r, st.r, e); }
    if (st.h != null) k.h = lerp(st.f.h, st.h, e);
    if (st.t >= st.dur) {
      k.cur = null;
      // checked at every step's end, before its hook or release runs
      if (k.mode === "place" && !placeable(k.job.slot)) { abandon(k); return; }
      if (st.then) st.then();
    }
  }

  /** The load swings on its cable: a pendulum driven by the trolley's acceleration, held still near the ground. */
  function swing(k, dt) {
    const tx = k.x + k.r * Math.cos(k.th), ty = k.y + k.r * Math.sin(k.th);
    if (!k.tp) k.tp = [tx, ty];
    const vx = (tx - k.tp[0]) / dt, vy = (ty - k.tp[1]) / dt, ax = (vx - k.tv[0]) / dt, ay = (vy - k.tv[1]) / dt;
    k.tp = [tx, ty]; k.tv = [vx, vy];
    const damp = k.h < SAFE - 8 ? 7 : 0.9;
    k.svx += (-9 * k.sx - damp * k.svx - clamp(ax, -400, 400)) * dt;
    k.svy += (-9 * k.sy - damp * k.svy - clamp(ay, -400, 400)) * dt;
    k.sx = clamp(k.sx + k.svx * dt, -6, 6);
    k.sy = clamp(k.sy + k.svy * dt, -6, 6);
    const b = k.job;
    if (b && b.state === "carried") {
      b.x = tx + k.sx; b.y = ty + k.sy; b.z = k.h - 2 - SL - SZ;
      b.yaw = wrap(b.yaw) * Math.max(0, 1 - dt * 1.4);
    }
  }

  const cranes = CRANES.map(makeCrane);
  if (depth(cranes[0].x, cranes[0].y) > depth(cranes[1].x, cranes[1].y)) tops.appendChild(cranes[0].top);

  return {
    cranes, polar, hookAt,
    update(dt) { for (const k of cranes) { craneStep(k, dt); swing(k, dt); } },
    draw() { for (const k of cranes) drawCrane(k); },
  };
}
