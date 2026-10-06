/** The crew: a manager, a signalman for each crane, an onlooker, a shoveler, a barrow and its pusher, and a labourer with cement bags. */
function sitePeople(ctx, B, CR) {
  const {
    rrect, ringAt, run, hull, poly, open, seg, clamp, rad, r2, mk, solid, place, sA, cA, depth, front, TAU, wrap,
    smooth, lerpA, PILE, MIXER, PALLET, LOAD, DUMP, BOSS, P, S, P3, ground, layer, item, setD, flag, putC, rring,
    rbox, v3, frame, story,
  } = ctx;
  const { cranes } = CR;

  // ---------------------------------------------------------------- people
  const HEAD = 2.2;
  function makePerson(x, y, f, o = {}) {
    const g = mk("g", {}, layer);
    const p = { x, y, f, phase: 0, amp: 0, moving: false, speed: o.speed || 20, boss: !!o.boss, arms: null, extra: null, it: item(g) };
    p.legA = mk("path", { class: "nf sil" }, g);
    p.legB = mk("path", { class: "nf sil" }, g);
    p.back = mk("g", {}, g);
    p.armA = mk("path", { class: "nf sil" }, g);
    p.torso = mk("path", { class: "sil" }, g);
    p.vest = mk("path", { class: "nf" }, g);
    p.head = mk("ellipse", { class: "sil", rx: r2(HEAD * S), ry: r2(HEAD * S) }, g);
    p.hat = mk("path", { class: o.boss ? "hi" : "sil" }, g);
    p.armB = mk("path", { class: "nf sil" }, g);
    p.front = mk("g", {}, g);
    return p;
  }

  function drawPerson(p) {
    const Wd = frame(p.x, p.y, p.f), W = (u, v, z) => P3(Wd(u, v, z));
    const sf = Math.sin(p.f), cf = Math.cos(p.f);
    const near = -sf * sA + cf * cA >= 0 ? 1 : -1;
    const leg = (s) => {
      const ph = p.phase + (s > 0 ? 0 : Math.PI), fu = 2.6 * p.amp * Math.sin(ph), fz = 1.4 * p.amp * Math.max(0, Math.cos(ph));
      return open([W(0, s * 1.1, 8.8), W(fu * 0.5 + 0.6 * p.amp, s * 1.15, 4.6 + fz * 0.6), W(fu, s * 1.2, fz)]);
    };
    setD(p.legA, leg(-near));
    setD(p.legB, leg(near));
    const arm = (s) => {
      const own = p.arms && p.arms(s, Wd);
      const sh = W(0, s * 2.5, 15.8);
      if (own) return open([sh, ...own.map(P3)]);
      const ph = p.phase + (s > 0 ? Math.PI : 0), sw = 2.3 * p.amp * Math.sin(ph);
      return open([sh, W(sw * 0.45 - 0.2, s * 2.9, 12.6), W(sw, s * 3, 9.6)]);
    };
    setD(p.armA, arm(-near));
    setD(p.armB, arm(near));
    const ring = rring(p.x, p.y, p.f, -1.4, -2.4, 1.4, 2.4, 1.3);
    setD(p.torso, poly(hull(ringAt(P, ring, 8.6).concat(ringAt(P, ring, 16.6)))));
    setD(p.vest, p.boss ? "" : open(ringAt(P, run(ring, front), 12.8)));
    place(p.head, W(0, 0, 19.2));
    const hc = W(0.25, 0, 19.9), rx = 2.75 * S, ry = 2.3 * S, bw = rx + 1.1 * S;
    setD(p.hat, `M${r2(hc[0] - rx)} ${r2(hc[1])}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(hc[0] + rx)} ${r2(hc[1])}ZM${r2(hc[0] - bw)} ${r2(hc[1] + 0.2)}L${r2(hc[0] + bw)} ${r2(hc[1] + 0.2)}`);
    if (p.extra) p.extra(p, Wd, near);
    p.it.key = depth(p.x, p.y);
  }

  /** Moves a body one step toward (tx, ty): it turns first, then walks. True once it is there. */
  function walkTo(p, tx, ty, dt, speed = p.speed) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 0.5) { p.moving = false; return true; }
    const want = Math.atan2(dy, dx), off = Math.abs(wrap(want - p.f));
    turnTo(p, want, dt, 6);
    if (off < 1) {
      const step = Math.min(d, speed * dt * (1 - off * 0.5));
      p.x += (dx / d) * step; p.y += (dy / d) * step; p.phase += step * 0.42; p.moving = true;
    } else p.moving = false;
    return false;
  }
  const turnTo = (p, want, dt, rate = 4) => { p.f += clamp(wrap(want - p.f), -rate * dt, rate * dt); };
  const toward = (p, q) => Math.atan2(q[1] - p.y, q[0] - p.x);

  /** A route is a loop of steps: { to }, { face }, { wait }, { until }, each with an optional then. */
  function runRoute(p, dt) {
    const st = p.route[p.ri];
    let done = false;
    if (st.to) done = walkTo(p, st.to[0], st.to[1], dt);
    else {
      p.moving = false;
      if (st.face != null) { turnTo(p, st.face, dt); done = Math.abs(wrap(st.face - p.f)) < 0.04; }
      else if (st.wait != null) { p.wt = (p.wt || 0) + dt; done = p.wt >= st.wait; }
      else if (st.until) done = st.until();
    }
    if (done) { p.wt = 0; p.ri = (p.ri + 1) % p.route.length; if (st.then) st.then(); }
  }

  // ---- the wheelbarrow, pushed by one worker
  function makeBarrow() {
    const g = mk("g", {}, layer);
    const b = { x: 0, y: 0, f: 0, fill: 0, roll: 0, pitch: 0, it: item(g) };
    b.wheelA = mk("path", { class: "sil" }, g); b.spokeA = mk("path", { class: "nf" }, g);
    b.frame = mk("path", { class: "nf sil" }, g);
    b.tray = mk("path", { class: "sil" }, g);
    b.load = mk("path", {}, g);
    b.rim = mk("path", { class: "nf" }, g);
    b.wheelB = mk("path", { class: "sil" }, g); b.spokeB = mk("path", { class: "nf" }, g);
    return b;
  }
  /** The barrow's own frame: u forward to the wheel, pitched about the axle so the legs lift when pushed. */
  const barrowFrame = (b) => {
    const W0 = frame(b.x, b.y, b.f), ca = Math.cos(b.pitch), sa = Math.sin(b.pitch);
    return (u, v, z) => { const du = u - 7.6, dz = z - 3.2; return W0(7.6 + du * ca + dz * sa, v, 3.2 + dz * ca - du * sa); };
  };
  const TRAY = { foot: rrect(-4.4, -2.6, 3.4, 2.6, 1.4), top: rrect(-6.8, -4.4, 5.4, 4.4, 2.2), inner: rrect(-6, -3.6, 4.6, 3.6, 1.6), heap: rrect(-3.8, -2.1, 2.4, 2.1, 1.8) };
  function drawBarrow(b) {
    const Wd = barrowFrame(b), W = (u, v, z) => P3(Wd(u, v, z)), cf = Math.cos(b.f), sf = Math.sin(b.f);
    const wheelNear = cf * sA + sf * cA > 0;
    const wheel = [];
    for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU; wheel.push(W(7.6 + 3.2 * Math.cos(a), 0, 3.2 + 3.2 * Math.sin(a))); }
    const spokes = [0, 1].map((n) => { const a = b.roll + (n * Math.PI) / 2; return seg(W(7.6 + 3 * Math.cos(a), 0, 3.2 + 3 * Math.sin(a)), W(7.6 - 3 * Math.cos(a), 0, 3.2 - 3 * Math.sin(a))); }).join("");
    setD(b.wheelA, wheelNear ? "" : poly(wheel)); setD(b.spokeA, wheelNear ? "" : spokes);
    setD(b.wheelB, wheelNear ? poly(wheel) : ""); setD(b.spokeB, wheelNear ? spokes : "");
    let fr = "";
    for (const s of [-1, 1]) fr += open([W(7.6, s * 1.2, 3.2), W(-4.6, s * 2.8, 4.6), W(-12.6, s * 3.1, 8.2)]) + open([W(-3.2, s * 2.8, 4.6), W(-3.8, s * 3, 0)]);
    setD(b.frame, fr);
    const at = (ring, z) => ring.map((q) => W(q.u, q.v, z));
    setD(b.tray, poly(hull(at(TRAY.foot, 4.6).concat(at(TRAY.top, 9.8)))));
    const facesV = (q) => (q.nu * cf - q.nv * sf) * sA + (q.nu * sf + q.nv * cf) * cA >= 0;
    if (b.fill > 0.02) {
      setD(b.load, poly(hull(at(TRAY.inner, 9.8).concat(at(TRAY.heap, 9.8 + 3.4 * b.fill)))));
      setD(b.rim, open(at(run(TRAY.inner, facesV), 9.8)));
    } else { setD(b.load, ""); setD(b.rim, poly(at(TRAY.inner, 9.8))); }
    b.it.key = depth(b.x, b.y);
  }

  // the manager: clipboard in one hand, the other points at whatever is being set down
  const boss = makePerson(BOSS[0], BOSS[1], rad(-100), { boss: true });
  boss.pw = 0; boss.target = [66, 6, 40]; boss.home = rad(-100);
  boss.clip = mk("path", { class: "sil" }, boss.front);
  boss.arms = (s, Wd) => {
    if (s < 0) return [Wd(1, -3, 12.2), Wd(2.6, -1.8, 12.6)];
    const sh = Wd(0, 2.5, 15.8), d = v3.norm(v3.sub(boss.target, sh));
    const w = boss.pw;
    return [v3.lerp(Wd(-0.2, 2.9, 12.6), v3.add(sh, v3.mul(d, 3.7)), w), v3.lerp(Wd(0, 3, 9.6), v3.add(sh, v3.mul(d, 7.4)), w)];
  };
  boss.extra = (p, Wd) => {
    const facing = Math.cos(p.f) * sA + Math.sin(p.f) * cA >= 0, parent = facing ? p.front : p.back;
    if (p.clip.parentNode !== parent) parent.appendChild(p.clip);
    setD(p.clip, poly([Wd(2.4, -3.1, 11.6), Wd(3.1, -3.1, 15.2), Wd(3.1, 0.2, 15.2), Wd(2.4, 0.2, 11.6)].map(P3)));
  };

  // a signalman for each crane: walks to the block, raises an arm while the hook comes down
  const signals = cranes.map((k) => {
    const p = makePerson(k.home[0], k.home[1], rad(-100), { speed: 26 });
    p.k = k; p.raise = 0; p.cheer = 0; p.t = 0;
    p.arms = (s, Wd) => {
      const t = p.t * 9;
      if (p.cheer > 0.01) {
        const up = [Wd(0.3, s * 3.6, 19.6), Wd(0.2 + Math.sin(t + s) * 0.6, s * 3.3, 23.8)];
        return [v3.lerp(Wd(-0.2, s * 2.9, 12.6), up[0], p.cheer), v3.lerp(Wd(0, s * 3, 9.6), up[1], p.cheer)];
      }
      if (s > 0 || p.raise < 0.01) return null;
      const up = [Wd(0.4, -3.6, 19.6), Wd(0.4 + Math.sin(t) * 0.8, -3.1, 23.6)];
      return [v3.lerp(Wd(-0.2, -2.9, 12.6), up[0], p.raise), v3.lerp(Wd(0, -3, 9.6), up[1], p.raise)];
    };
    return p;
  });

  // the onlooker: hands on hips, watching the right crane
  const watcher = makePerson(212, 110, rad(-120));
  watcher.arms = (s, Wd) => [Wd(-0.6, s * 4.6, 12.8), Wd(0.2, s * 2.6, 10.2)];

  // the shoveler and the barrow he fills
  const barrow = makeBarrow();
  const pusher = makePerson(LOAD[0], LOAD[1], Math.PI, { speed: 20 });
  pusher.route = [
    { to: LOAD }, { face: Math.PI }, { until: () => barrow.fill >= 1 },
    { to: [120, 120] }, { to: DUMP }, { face: toward({ x: DUMP[0], y: DUMP[1] }, MIXER) },
    { wait: 1.4, then: () => { barrow.dumped = 1; } },
    { to: [120, 120] },
  ];
  pusher.ri = 0;
  /** The barrow rides 15.5 ahead of its pusher; its wheel turns with the distance. */
  const hitch = () => {
    const was = [barrow.x, barrow.y];
    barrow.f = pusher.f;
    barrow.x = pusher.x + Math.cos(pusher.f) * 15.5;
    barrow.y = pusher.y + Math.sin(pusher.f) * 15.5;
    barrow.roll += Math.hypot(barrow.x - was[0], barrow.y - was[1]) / 3.2;
  };
  hitch();
  pusher.arms = (s, Wd) => {
    const grip = barrowFrame(barrow)(-12.6, s * 3.1, 8.2), sh = Wd(0, s * 2.5, 15.8);
    return [v3.add(v3.lerp(sh, grip, 0.5), [0, 0, -1.2]), grip];
  };

  const shovel = makePerson(-30, 100, Math.PI);
  shovel.cyc = 0; shovel.tool = mk("path", { class: "nf sil" }, shovel.front); shovel.blade = mk("path", { class: "sil" }, shovel.front);
  shovel.sand = mk("ellipse", { class: "dot m", rx: r2(1.3 * S), ry: r2(0.8 * S) }, shovel.front);
  const SHOVEL = {
    dig: [[0.8, -2.2, 12.4], [6.8, -0.8, 1.6]], lift: [[0.6, -2.4, 13.4], [6.8, -0.6, 8.8]],
    toss: [[1.2, -2, 14], [7.4, -0.4, 12.6]], rest: [[1.6, -2.6, 14.4], [2.4, -3, 2.2]],
  };
  shovel.pose = SHOVEL.rest;
  shovel.arms = (s, Wd) => {
    const [G, N] = shovel.pose, at = s < 0 ? G : v3.lerp(G, N, 0.42);
    const hand = Wd(at[0], at[1], at[2]), sh = Wd(0, s * 2.5, 15.8);
    return [v3.add(v3.lerp(sh, hand, 0.5), [0, 0, -1.4]), hand];
  };
  shovel.extra = (p, Wd) => {
    const [G, N] = p.pose, d = v3.norm(v3.sub(N, G)), g = Wd(G[0], G[1], G[2]), n = Wd(N[0], N[1], N[2]);
    const tip = v3.add(N, v3.mul(d, 4.2));
    const bl = [Wd(N[0], N[1] + 1.7, N[2]), Wd(tip[0], tip[1] + 1.4, tip[2]), Wd(tip[0], tip[1] - 1.4, tip[2]), Wd(N[0], N[1] - 1.7, N[2])];
    setD(p.tool, seg(P3(g), P3(n)));
    setD(p.blade, poly(bl.map(P3)));
    const full = p.cyc > 0.22 && p.cyc < 0.66;
    flag(p.sand, "off", !full);
    p.sand.setAttribute("rx", full ? r2(1.3 * S) : "0");
    place(p.sand, P3(Wd(...v3.add(N, v3.add(v3.mul(d, 2.1), [0, 0, 0.8])))));
  };

  // the labourer carrying cement bags from the pallet to the mixer
  const carrier = makePerson(262, 4, rad(40), { speed: 16 });
  carrier.bag = false;
  carrier.sack = solid(carrier.front);
  carrier.route = [
    { to: [262, 4] }, { face: toward({ x: 262, y: 4 }, PALLET) }, { wait: 0.8, then: () => { carrier.bag = true; } },
    { to: [256, 34] }, { face: toward({ x: 256, y: 34 }, MIXER) }, { wait: 0.9, then: () => { carrier.bag = false; } },
  ];
  carrier.ri = 0;
  carrier.arms = (s, Wd) => (carrier.bag && s < 0 ? [Wd(0.6, -4.2, 18.6), Wd(1.3, -3, 19.9)] : null);
  carrier.extra = (p, Wd, near) => {
    if (!p.bag) { setD(p.sack.sil, ""); setD(p.sack.cr, ""); return; }
    const parent = near < 0 ? p.front : p.back;
    if (p.sack.g.parentNode !== parent) parent.appendChild(p.sack.g);
    const c = Wd(0, -3, 0);
    putC(p.sack, rbox(c[0], c[1], p.f, -4, -1.7, 4, 1.7, 15.8, 19.4, 1.6, 0.6));
  };

  const people = [boss, ...signals, watcher, pusher, shovel, carrier];

  function updatePeople(dt) {
    // the barrow and its pusher
    runRoute(pusher, dt);
    hitch();
    barrow.pitch += ((pusher.moving ? rad(9) : 0) - barrow.pitch) * Math.min(1, dt * 6);
    if (barrow.dumped) { barrow.fill = Math.max(0, barrow.fill - dt * 1.4); if (!barrow.fill) barrow.dumped = 0; }

    // the shoveler loads while the barrow waits beside him
    const loading = pusher.ri === 2 && barrow.fill < 1;
    const fPile = toward(shovel, PILE), fBar = toward(shovel, [barrow.x, barrow.y]);
    if (loading || shovel.cyc > 0) {
      const before = shovel.cyc;
      shovel.cyc += dt / 2.2;
      if (before < 0.68 && shovel.cyc >= 0.68) barrow.fill = Math.min(1, barrow.fill + 0.25);
      if (shovel.cyc >= 1) shovel.cyc = loading ? shovel.cyc - 1 : 0;
      const c = shovel.cyc, A = SHOVEL.dig, B = SHOVEL.lift, T = SHOVEL.toss;
      const mixP = (p, q, t) => [v3.lerp(p[0], q[0], t), v3.lerp(p[1], q[1], t)];
      if (c < 0.22) { shovel.f = lerpA(shovel.f, fPile, Math.min(1, dt * 10)); shovel.pose = mixP(SHOVEL.rest, A, smooth(Math.min(1, c / 0.1))); }
      else if (c < 0.38) { shovel.f = fPile; shovel.pose = mixP(A, B, smooth((c - 0.22) / 0.16)); }
      else if (c < 0.6) { shovel.f = lerpA(fPile, fBar, smooth((c - 0.38) / 0.22)); shovel.pose = B; }
      else if (c < 0.72) { shovel.f = fBar; shovel.pose = mixP(B, T, smooth((c - 0.6) / 0.12)); }
      else { shovel.f = lerpA(fBar, fPile, smooth((c - 0.72) / 0.28)); shovel.pose = mixP(T, A, smooth((c - 0.72) / 0.28)); }
    } else {
      turnTo(shovel, rad(-60), dt, 1.5);
      shovel.pose = [v3.lerp(shovel.pose[0], SHOVEL.rest[0], Math.min(1, dt * 4)), v3.lerp(shovel.pose[1], SHOVEL.rest[1], Math.min(1, dt * 4))];
    }

    runRoute(carrier, dt);

    // signalmen follow their crane's job
    for (const p of signals) {
      const k = p.k, b = k.job;
      p.t += dt;
      let to = p.k.home, look = [k.x + k.r * Math.cos(k.th), k.y + k.r * Math.sin(k.th)];
      if (k.mode === "setdown") { to = [k.spot[0] + 3, k.spot[1] + 17]; look = k.spot; }
      else if (b && b.state === "ground") { to = [b.x + 3, b.y + 17]; look = [b.x, b.y]; }
      else if (b) { to = [b.slot.cx + 3, 30]; look = [b.slot.cx, b.slot.cy]; }
      const there = walkTo(p, to[0], to[1], dt);
      if (there) turnTo(p, toward(p, look), dt, 4);
      const want = there && k.cur && k.cur.low && b ? 1 : 0;
      p.raise += (want - p.raise) * Math.min(1, dt * 5);
      p.cheer += ((story.phase === "fixed" ? 1 : 0) - p.cheer) * Math.min(1, dt * 5);
    }

    // the manager turns to whatever is being set down and points at it
    const busy = cranes.find((k) => k.cur && k.cur.low && k.job);
    if (busy) boss.target = [busy.x + busy.r * Math.cos(busy.th) + busy.sx, busy.y + busy.r * Math.sin(busy.th) + busy.sy, busy.h];
    boss.pw += ((busy || story.phase === "fixed" ? 1 : 0) - boss.pw) * Math.min(1, dt * 3);
    if (story.phase === "fixed") boss.target = [boss.x, boss.y - 2, 60];
    const look = busy ? toward(boss, boss.target) : boss.home;
    turnTo(boss, boss.home + clamp(wrap(look - boss.home), -1, 1), dt, 1.2);

    // the onlooker follows the right crane's hook
    const rk = cranes[1];
    turnTo(watcher, toward(watcher, [rk.x + rk.r * Math.cos(rk.th), rk.y + rk.r * Math.sin(rk.th)]), dt, 0.8);

    for (const p of people) p.amp += ((p.moving ? 1 : 0) - p.amp) * Math.min(1, dt * 7);
  }

  return {
    people, barrow, update: updatePeople,
    draw() { for (const p of people) drawPerson(p); drawBarrow(barrow); },
  };
}
