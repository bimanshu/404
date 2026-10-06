/**
 * Construction 404. A 404 built of blocks, broken: the missing blocks lie on
 * the ground in front of it, and two tower cranes lift them back into their
 * places while a crew works the site below. A manager points the work out,
 * a signalman walks with each crane, a shoveler loads a wheelbarrow from the
 * sand pile, the barrow runs to the mixer, and a labourer carries cement bags
 * to it. When the last block is set the sign lights up, shakes, and breaks
 * again, and the work starts over.
 *
 * Any block in place can be knocked out: click or tap it, or pick it with the
 * arrow keys and press Enter. It falls with every block stacked on it, and
 * its crane puts them back, always from the bottom of a column up.
 *
 * Drawn on the Hairline kernel (HL). The scene is split by part: core (camera,
 * layout, layers, helpers), ground, blocks, cranes and people; this file holds
 * the story, the frame loop and the reader's input.
 *
 * construction404(stage, svg, opts) → { destroy, aspect, knock, where, advance, snapshot, time }
 *   stage       the element carrying data-hairline; it gets the pointer and the keys
 *   svg         an <svg> inside it; the scene sets its viewBox
 *   opts.frame  "full" (the whole site, about 16:9) or "core" (the 404 and both cranes, for a tall screen)
 *   opts.t      seconds to run the site forward before the first frame
 *   opts.freeze draw that one frame and stop
 *   opts.onRead     a short status: "fixing 3/8", "fixed", "breaking"
 *   opts.onAnnounce a sentence for a live region, after something the reader did
 *   opts.onKnock    the number of blocks the reader has knocked out
 *   aspect      the viewBox's width over its height, for sizing the stage
 */
function construction404(stage, svg, opts = {}) {
  const { register, disposer, reducedMotion, rad, TAU } = { ...HL, TAU: Math.PI * 2 };
  const bag = disposer();
  const noop = () => {};
  const onRead = opts.onRead || noop, onAnnounce = opts.onAnnounce || noop, onKnock = opts.onKnock || noop;

  const ctx = siteCore(svg, opts);
  const { VW, VH, SZ, S, slots, slotAt, broken, items, layer, story, still } = ctx;
  const B = siteBlocks(ctx), G = siteGround(ctx), CR = siteCranes(ctx, B);
  ctx.cranes = CR.cranes;
  const PE = sitePeople(ctx, B, CR);
  const { blocks, isIn, isOut, clear, taken, findSpot } = B;
  const cranes = CR.cranes;

  // ---------------------------------------------------------------- the story
  const craneFor = (s) => cranes.find((k) => k.take(s.col));

  /** Knocks the block in slot s out, with every block standing on it in its column. Returns how many fell. */
  function knockOut(s, o = {}) {
    if (s.block.state !== "slot") return 0;
    const stack = slots.filter((q) => q.col === s.col && q.lvl >= s.lvl && q.block.state === "slot").sort((a, b) => a.lvl - b.lvl);
    stack.forEach((q, i) => {
      const b = q.block, spot = !o.byReader && q.spot && clear(q.spot[0], q.spot[1], taken()) ? q.spot : findSpot(q, craneFor(q));
      story.seq++;
      if (still()) { Object.assign(b, { state: "ground", x: spot[0], y: spot[1], z: 0, yaw: rad(spot[2]) }); return; }
      b.state = "falling";
      b.fall = { t: -((o.delay || 0) + i * 0.12), x0: q.cx, y0: q.cy, z0: q.z0, x1: spot[0], y1: spot[1], yaw: rad(spot[2]) + (story.seq % 2 ? TAU : -TAU) * 0.5, dur: 0.75 + q.z0 / 160 };
    });
    story.lost += stack.length;
    if (story.phase !== "repair") { story.phase = "repair"; story.pt = 0; }
    if (o.byReader) {
      story.knocked += stack.length; story.byReader = true;
      onKnock(story.knocked);
      onAnnounce(stack.length === 1 ? "You knocked out a block. A crane will put it back." : `You knocked out ${stack.length} blocks. A crane will put them back.`);
    }
    return stack.length;
  }

  /** Without motion there is no crane to watch, so a block that is out goes straight back. */
  function putBack(s) {
    Object.assign(s.block, { state: "slot", x: s.cx, y: s.cy, z: s.z0, yaw: 0 });
    story.placed++;
    onAnnounce("The block is back in place.");
  }

  function director(dt) {
    story.pt += dt;
    if (story.phase === "repair" && story.lost > 0 && blocks.every((b) => b.state === "slot")) {
      Object.assign(story, { phase: "fixed", pt: 0, lost: 0, placed: 0 });
      if (story.byReader) { story.byReader = false; onAnnounce("Every block is back in place."); }
    } else if (story.phase === "fixed" && story.pt > 3.6) { story.phase = "shake"; story.pt = 0; }
    else if (story.phase === "shake" && story.pt > 0.8) {
      story.phase = "repair"; story.pt = 0;
      broken.slice().sort((a, b) => b.lvl - a.lvl || a.col - b.col).forEach((q, i) => knockOut(q, { delay: i * 0.11 }));
    }
  }

  function sim(dt) {
    story.clock += dt;
    director(dt);
    CR.update(dt);
    B.update(dt);
    PE.update(dt);
    G.update(dt);
  }

  let read = "";
  function draw() {
    B.draw(active());
    CR.draw();
    PE.draw();
    G.draw();
    // repaint in depth order, only when the order changed
    let sorted = true;
    for (let i = 1; i < items.length; i++) if (items[i].key < items[i - 1].key) { sorted = false; break; }
    if (!sorted) { items.sort((a, b) => a.key - b.key); for (const it of items) layer.appendChild(it.g); }
    const text = story.phase === "fixed" ? "fixed" : story.phase === "shake" ? "breaking" : `fixing ${story.placed}/${story.lost}`;
    if (text !== read) { read = text; onRead(text); }
  }

  // ---------------------------------------------------------------- life
  const advance = (sec) => { let left = sec; while (left > 1e-6) { const h = Math.min(left, 1 / 90); sim(h); left -= h; } };
  advance(Math.max(0, opts.t || 0));
  if (reducedMotion() && !opts.t) advance(8.6); // a still with both cranes at work
  // the block under the pointer, and the one picked with the keys
  let hover = null, sel = null;
  const active = () => hover || sel;
  // register draws the first frame at once; the kernel clamps dt to 50ms
  const loop = register(stage, (dt) => {
    if (still()) { draw(); return false; }
    advance(dt);
    draw();
    return true;
  });
  bag.add(loop.unregister);
  const poke = () => { if (still()) draw(); else loop.wake(); };

  // ---- the reader's hand: hover marks a block, a press knocks it out
  const inside = (poly, [x, y]) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (c) { if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false; }
    }
    return true;
  };
  /** The nearest slot whose rest pose holds the point; a finger also gets the nearest within half a block. */
  function slotAtPoint(p, want, finger) {
    let best = null;
    for (const s of slots) if (want(s) && inside(s.hit, p) && (!best || s.key > best.key)) best = s;
    if (best || !finger) return best;
    let d0 = 0.75 * SZ * S;
    for (const s of slots) { const d = want(s) && Math.hypot(p[0] - s.mid[0], p[1] - s.mid[1]); if (d !== false && d < d0) { best = s; d0 = d; } }
    return best;
  }
  const toView = (e) => {
    const m = svg.getScreenCTM();
    if (!m) return [-1, -1];
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  const setHover = (s) => { if (s !== hover) { hover = s; stage.style.cursor = s ? "pointer" : ""; poke(); } };

  bag.on(stage, "pointermove", (e) => { if (e.pointerType === "mouse") setHover(slotAtPoint(toView(e), isIn, false)); });
  bag.on(stage, "pointerleave", () => setHover(null));
  bag.on(stage, "pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = toView(e), finger = e.pointerType !== "mouse";
    const s = slotAtPoint(p, isIn, finger);
    if (s) { knockOut(s, { byReader: true }); hover = null; stage.style.cursor = ""; poke(); return; }
    if (still()) { const g = slotAtPoint(p, isOut, finger); if (g) { putBack(g); poke(); } }
  });

  // ---- the keys: arrows walk the blocks, Enter or Space knocks one out
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  function walk(from, [dc, dl]) {
    if (!from) return slots.filter(isIn).sort((a, b) => Math.hypot(a.col - 5, a.lvl - 2) - Math.hypot(b.col - 5, b.lvl - 2))[0] || slots[0];
    let best = null, score = 0;
    for (const s of slots) {
      const along = dc ? (s.col - from.col) * dc : (s.lvl - from.lvl) * dl, across = dc ? Math.abs(s.lvl - from.lvl) : Math.abs(s.col - from.col);
      if (along <= 0) continue;
      const sc = along + across * 3;
      if (!best || sc < score) { best = s; score = sc; }
    }
    return best || from;
  }
  const say = (s) => onAnnounce(isIn(s) ? "Block in place. Press Enter to knock it out." : "Block out. A crane will put it back.");
  bag.on(stage, "keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (DIRS[e.key]) { e.preventDefault(); sel = walk(sel, DIRS[e.key]); say(sel); poke(); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!sel) { sel = walk(null); say(sel); }
      else if (isIn(sel)) knockOut(sel, { byReader: true });
      else if (still() && isOut(sel)) putBack(sel);
      else say(sel);
      poke();
      return;
    }
    if (e.key === "Escape" && sel) { sel = null; poke(); }
  });
  bag.on(stage, "blur", () => { if (sel) { sel = null; poke(); } });
  bag.add(() => { svg.replaceChildren(); stage.style.cursor = ""; });

  return {
    destroy: bag.dispose,
    aspect: VW / VH,
    time: () => story.clock,
    /** Knocks out the block at a column and level, as a press would. Returns how many fell. */
    knock: (col, lvl) => { const s = slotAt(col, lvl), n = s ? knockOut(s, { byReader: true }) : 0; poke(); return n; },
    /** Where a block's rest pose sits, in viewBox units. */
    where: (col, lvl) => { const s = slotAt(col, lvl); return s ? s.mid.slice() : null; },
    /** Runs the site forward, for tests and for skipping ahead. */
    advance: (sec) => { advance(sec); draw(); },
    snapshot: () => ({
      phase: story.phase, lost: story.lost, placed: story.placed, knocked: story.knocked,
      blocks: blocks.map((b) => ({ col: b.slot.col, lvl: b.slot.lvl, state: b.state, x: b.x, y: b.y })),
      cranes: cranes.map((k) => ({ job: k.job && `${k.job.slot.col},${k.job.slot.lvl}`, mode: k.mode, h: k.h })),
    }),
  };
}
