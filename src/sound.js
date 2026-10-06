/**
 * The site's sound: a construction ambience on a loop at 60%, and a brick
 * hitting concrete each time a block lands, softer when a crane sets one down.
 * It stays off until the reader turns it on (browsers start audio only after a
 * press), and remembers their choice for the next visit.
 *
 * siteSound({ ambience, impact }) → { on, setOn(on), play(event) }
 *   event   what the scene reports: { kind: "impact" | "set", strength 0..1, pan -1..1 }
 *
 * Web Audio plays both files where it can fetch them. Opened from disk, where a
 * fetch is refused, plain audio elements stand in.
 */
function siteSound(files) {
  /** The impact recording holds six separate hits: [offset, length] in seconds. Each landing takes the next. */
  const HITS = [[0, 0.9], [2.19, 0.62], [4.0, 0.72], [5.96, 0.62], [7.93, 0.44], [9.61, 0.74]];
  const AMBIENCE = 0.6, KEY = "construction404:sound";
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, master = null, bed = null, loop = null, bufs = null, loading = null, fb = null;
  let on = false, turn = 0, voices = 0, last = -1;

  const ramp = (param, to, sec) => {
    const t = ac.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(to, t + sec);
  };

  function graph() {
    if (ac || !AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    bed = ac.createGain(); bed.gain.value = 0; bed.connect(master);
  }
  const decode = (url) => fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); })
    .then((data) => new Promise((ok, fail) => ac.decodeAudioData(data, ok, fail)));
  function load() {
    if (!loading) {
      loading = Promise.all([decode(files.ambience), decode(files.impact)])
        .then(([a, i]) => { bufs = { a, i }; })
        .catch(() => { fallback(); });
    }
    return loading;
  }
  function fallback() {
    if (fb) return;
    const bedEl = new Audio(files.ambience);
    bedEl.loop = true; bedEl.volume = AMBIENCE;
    fb = { bed: bedEl, pool: Array.from({ length: 4 }, () => new Audio(files.impact)), next: 0 };
  }
  function startBed() {
    if (bufs && !loop) {
      loop = ac.createBufferSource();
      loop.buffer = bufs.a; loop.loop = true; loop.connect(bed);
      loop.start();
      ramp(bed.gain, AMBIENCE, 1.5);
    } else if (fb) fb.bed.play().catch(() => {});
  }

  const store = (v) => { try { localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* private window: forget it */ } };
  const stored = () => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } };

  function setOn(v) {
    on = !!v;
    store(on);
    if (on) {
      graph();
      if (ac) {
        ac.resume();
        ramp(master.gain, 1, 0.4);
        load().then(() => { if (on) startBed(); });
      } else { fallback(); startBed(); }
    } else {
      if (ac) { ramp(master.gain, 0, 0.25); setTimeout(() => { if (!on) ac.suspend(); }, 320); }
      if (fb) fb.bed.pause();
    }
  }

  function play(e) {
    if (!on) return;
    const strength = Math.max(0, Math.min(1, e.strength ?? 0.5)), set = e.kind === "set";
    const [offset, length] = HITS[turn++ % HITS.length];
    const vol = set ? 0.4 : 0.35 + 0.65 * strength;
    if (bufs && ac && ac.state === "running") {
      const t = ac.currentTime;
      // a pile of blocks landing together is one crash, not a machine gun
      if (voices >= 6 || (t - last < 0.05 && strength < 0.7)) return;
      last = t;
      const src = ac.createBufferSource(), gain = ac.createGain();
      src.buffer = bufs.i;
      const rate = (set ? 0.82 : 0.93) + ((turn * 0.137) % 0.14);
      src.playbackRate.value = rate;
      const end = t + length / rate;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.setValueAtTime(vol, end - 0.08);
      gain.gain.linearRampToValueAtTime(0, end);
      src.connect(gain);
      if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = e.pan || 0; gain.connect(p); p.connect(master); }
      else gain.connect(master);
      voices++;
      src.onended = () => { voices--; };
      src.start(t, offset, length);
    } else if (fb) {
      const el = fb.pool[fb.next++ % fb.pool.length];
      try { el.currentTime = offset; } catch { /* not loaded yet */ }
      el.volume = Math.min(1, vol);
      el.play().catch(() => {});
      clearTimeout(el.stopAt);
      el.stopAt = setTimeout(() => el.pause(), length * 1000);
    }
  }

  // Hidden tabs go quiet; coming back resumes only if the reader left it on.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (ac) ac.suspend(); if (fb) fb.bed.pause(); }
    else if (on) { if (ac) ac.resume(); if (fb) fb.bed.play().catch(() => {}); }
  });

  return { get on() { return on; }, wanted: stored(), setOn, play };
}
