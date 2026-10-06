/** The ground: the slab, the sand pile, the bag pallet, the cones and the mixer. */
function siteGround(ctx) {
  const {
    rrect, circ, prism, ringAt, run, hull, poly, open, seg, rad, mk, solid, sA, cA, VIEW, depth, front, TAU, GROUND,
    PILE, MIXER, PALLET, P, P3, ground, layer, item, setD, putC, rbox, moved, v3,
  } = ctx;

  // ---------------------------------------------------------------- ground and props
  {
    const [x0, y0, x1, y1] = GROUND;
    const outer = rrect(x0, y0, x1, y1, 36, 14), inner = rrect(x0 + 2.4, y0 + 2.4, x1 - 2.4, y1 - 2.4, 33.6, 14);
    putC(solid(ground), prism(P, front, outer, inner, -6, 0));
  }

  function sandPile([x, y]) {
    const g = mk("g", {}, layer), foot = [], top = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU, w = 1 + 0.07 * Math.sin(a * 3 + 1);
      foot.push(P(x + 17 * w * Math.cos(a), y + 14 * w * Math.sin(a), 0));
      top.push(P(x - 3 + 4.5 * Math.cos(a), y - 1 + 3.5 * Math.sin(a), 12.5));
    }
    mk("path", { class: "sil", d: poly(hull(foot.concat(top))) }, g);
    mk("path", { class: "nf lo", d: open([P(x - 1, y + 2, 11.5), P(x + 2, y + 7, 6.5), P(x + 6, y + 12.5, 0.6)]) + open([P(x - 6, y + 2, 10.5), P(x - 8, y + 8, 5), P(x - 11, y + 12, 0.6)]) }, g);
    item(g, depth(x, y));
  }

  function bagPallet([x, y]) {
    const g = mk("g", {}, layer);
    putC(solid(g), rbox(x, y, 0, -13, -10, 13, 10, 0, 2.8, 1, 0.6));
    for (const u of [-8.4, 0, 8.4]) putC(solid(g), rbox(x + u, y, 0, -3.9, -9.2, 3.9, 9.2, 2.8, 6.8, 2.6, 0.9));
    for (const v of [-4.6, 4.6]) putC(solid(g), rbox(x, y + v, 0, -12.4, -4.3, 12.4, 4.3, 6.8, 10.8, 2.6, 0.9));
    item(g, depth(x, y));
  }

  function cone(x, y) {
    const g = mk("g", {}, layer);
    putC(solid(g), rbox(x, y, 0, -3.4, -3.4, 3.4, 3.4, 0, 1, 0.9, 0));
    mk("path", { class: "sil", d: poly(hull(ringAt(P, moved(circ(2.5, 24), x, y), 1).concat(ringAt(P, moved(circ(0.6, 12), x, y), 9)))) }, g);
    mk("path", { class: "nf", d: open(ringAt(P, run(moved(circ(1.55, 24), x, y), front), 5)) }, g);
    item(g, depth(x, y));
  }

  function makeMixer([x, y], psi) {
    const g = mk("g", {}, layer), tilt = rad(26);
    const a = [Math.cos(psi) * Math.cos(tilt), Math.sin(psi) * Math.cos(tilt), Math.sin(tilt)];
    const e1 = [-Math.sin(psi), Math.cos(psi), 0];
    const e2 = [a[1] * e1[2] - a[2] * e1[1], a[2] * e1[0] - a[0] * e1[2], a[0] * e1[1] - a[1] * e1[0]];
    const O = [x - a[0] * 5, y - a[1] * 5, 12.5];
    const dir = (b) => v3.add(v3.mul(e1, Math.cos(b)), v3.mul(e2, Math.sin(b)));
    const at = (t, R, b) => v3.add(v3.add(O, v3.mul(a, t)), v3.mul(dir(b), R));
    const vis = (b) => { const n = dir(b); return n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] > 0; };
    const ring = (t, R, n = 36) => Array.from({ length: n }, (_, i) => P3(at(t, R, (i / n) * TAU)));
    const side = -Math.sin(psi) * sA + Math.cos(psi) * cA >= 0 ? 1 : -1;
    const W = (u, v, z) => P(x + u * Math.cos(psi) - v * Math.sin(psi), y + u * Math.sin(psi) + v * Math.cos(psi), z);

    putC(solid(g), rbox(x, y, psi, -12, -5.5, 9, 5.5, 3.6, 6, 1.2, 0.6));
    putC(solid(g), rbox(x, y, psi, -13, -4.4, -6.5, 4.4, 6, 12.5, 1.2, 0.6));
    const wheel = [];
    for (let i = 0; i < 24; i++) { const b = (i / 24) * TAU; wheel.push(W(-3 + 3.6 * Math.cos(b), side * 6.6, 3.6 + 3.6 * Math.sin(b))); }
    mk("path", { class: "sil", d: poly(wheel) }, g);
    mk("path", { class: "nf sil", d: open([W(9, 0, 4.4), W(17, 0, 1.6)]) + open([W(7.5, 0, 3.6), W(7.5, 0, 0)]) + seg(W(-1, -3, 6), P3(at(3, 7.6, -Math.PI / 2))) + seg(W(-1, 3, 6), P3(at(3, 7.6, -Math.PI / 2))) }, g);
    mk("path", { class: "sil", d: poly(hull([...ring(-3.6, 6.4), ...ring(0, 8.8), ...ring(8, 8.8), ...ring(15, 4.8)])) }, g);
    const band = [];
    for (let i = 0; i <= 48; i++) { const b = (i / 48) * TAU; if (vis(b)) band.push(P3(at(8, 8.8, b))); }
    mk("path", { class: "nf lo", d: open(band) }, g);
    const fins = mk("path", { class: "nf" }, g);
    const mouthOpen = a[0] * VIEW[0] + a[1] * VIEW[1] + a[2] * VIEW[2] > 0;
    if (mouthOpen) {
      mk("path", { d: poly(ring(15, 4.8)) }, g);
      mk("path", { class: "nf lo", d: poly(ring(14.4, 3.3)) }, g);
    }
    item(g, depth(x, y));
    const m = { spin: 0 };
    m.draw = () => {
      let d = "";
      for (let k = 0; k < 3; k++) {
        let pts = [];
        for (let t = 0; t <= 8; t += 0.5) {
          const b = m.spin + (k * TAU) / 3 + t * 0.16;
          if (vis(b)) pts.push(P3(at(t, 8.8, b)));
          else { d += open(pts); pts = []; }
        }
        d += open(pts);
      }
      setD(fins, d);
    };
    return m;
  }

  sandPile(PILE);
  bagPallet(PALLET);
  cone(-96, 50); cone(-104, 72); cone(-100, 116); cone(-84, 126);
  const mixer = makeMixer(MIXER, rad(160));

  return { mixer, update(dt) { mixer.spin += dt * 1.6; }, draw() { mixer.draw(); } };
}
