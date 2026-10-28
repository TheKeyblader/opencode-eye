// The eye: reference animation engine (validated in the mock-up).
// No dependency. Only writes CSS variables and the data-line attribute; never touches the DOM otherwise.
//
// Use in a Solid component:
//   onMount(() => {
//     const engine = createEyeEngine({ eye: eyeSvg, stage: stageSvg, getInput: () => ({
//       state: view().state,              // 'idle' | 'think' | … (see eye-state.ts)
//       mods: view().mods,                // { impatient, bored, tired }
//       reduced: reducedMotion(),         // prefers-reduced-motion or a setting
//     }) });
//     engine.start();
//     onCleanup(() => engine.stop());
//   });
//   On a click on the eye: engine.blinkTwice(), then open the card 380 ms later.

/** The error spiral's path (center 100,100; r = 2 + 1.75θ; θ from 0 to 7π). */
export function spiralPath() {
  let d = '';
  for (let a = 0; a <= Math.PI * 7; a += 0.2) {
    const r = 2 + a * 1.75;
    d += (d ? ' L ' : 'M ') + (100 + Math.cos(a) * r).toFixed(1) + ' ' + (100 + Math.sin(a) * r).toFixed(1);
  }
  return d;
}

const TOOL_STATES = { read: 1, write: 1, shell: 1, generic: 1, delegate: 1, web: 1, plan: 1 };
const NO_TIRED = { attention: 1, surprised: 1, happy: 1, sleep: 1 };
const AX = 40; // the gaze's horizontal amplitude (viewBox units)
const AY = 36; // vertical amplitude

const easeInOutQuad = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export function createEyeEngine({ eye, stage, getInput }) {
  let raf = 0;
  let last = 0;
  let mouse = null;
  const rnd = Math.random;

  const e = {
    st: null, t0: 0,
    x: 0, y: 0, vx: 0, vy: 0,              // gaze (−1…1)
    lid: 0, vlid: 0,                       // lid (0 open, 1 closed)
    p: 1,                                  // pupil scale
    by: 0, vby: 0, br: 0, vbr: 0,          // brow (translation, rotation)
    k: 1, vk: 0, shake: 0,                 // scale kick, shake
    bs: 1, vbs: 0, side: 1, sideAt: 0,     // side of the bubble / of the gaze while thinking
    blinkAt: 0, blinkStart: -1, blink2: 0,
    jx: 0, jy: 0, jitAt: 0, wx: 0, wy: 0, wanderAt: 0,
    gx: 0, gy: 0, gbr: 0, gAt: 0,
    lx: 64, ly: 32, line: -1,              // magnifier
    px: 64, py: 32, pr: 0, w: null,        // pencil, written lines
    c: null,                               // checks
    zx: 100, zy: 60, vzx: 0, vzy: 0,       // puzzle
    mix: 100, miy: 62, vmix: 0, vmiy: 0, mpx: 0, mpy: -7, // mini eye
  };

  function spring(key, vkey, target, k, c, h) {
    e[vkey] += ((target - e[key]) * k - e[vkey] * c) * h;
    e[key] += e[vkey] * h;
  }

  function enter(st) {
    if (st === 'error-flash') { e.vk -= 0.05; e.shake = 7; }
    else if (st === 'error' || st === 'error-spiral') { e.vk -= 0.04; e.shake = 5; }
    else if (st === 'surprised') e.vk += 0.1;
    else if (st === 'vexed') e.vk -= 0.08;
    else if (st === 'attention') e.vk += 0.06;
    else if (st === 'happy') e.vk += 0.07;
    e.line = -1;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(3, Math.max(0.25, (now - (last || now - 16.7)) / 16.667));
    last = now;
    const { state: st, mods: M = {}, reduced: R = false } = getInput();
    if (st !== e.st) { e.st = st; e.t0 = now; enter(st); }
    const T = now - e.t0;

    // The pointer relative to the eye's center (the circle's center is at y 130/230 of the SVG)
    let mx = 0, my = 0, near = false;
    const has = !!mouse;
    if (has) {
      const r = eye.getBoundingClientRect();
      const dx = mouse.x - (r.left + r.width / 2), dy = mouse.y - (r.top + r.height * (130 / 230));
      const d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / (r.width * 1.1));
      mx = (dx / d) * m; my = (dy / d) * m;
      near = d < r.width * (72 / 200) + 40;
    }
    const jitter = (ax, ay, minT, maxT) => {
      if (now > e.jitAt) { e.jx = (rnd() - 0.5) * ax; e.jy = (rnd() - 0.5) * ay; e.jitAt = now + minT + rnd() * (maxT - minT); }
    };

    let tx = 0, ty = 0, lid = 0, pupil = 1, by = 0, br = 0, blink = true, k = 0.12, c = 0.4, lidDirect = null;

    switch (st) {
      case 'idle': {
        if (has) { tx = mx; ty = my; }
        else {
          if (now > e.wanderAt) { e.wx = (rnd() - 0.5) * 0.9; e.wy = (rnd() - 0.5) * 0.6; e.wanderAt = now + 1400 + rnd() * 2200; }
          tx = e.wx; ty = e.wy;
        }
        jitter(0.08, 0.1, 500, 2000); tx += e.jx; ty += e.jy;
        pupil = (1 + 0.04 * Math.sin(now / 1100)) * (near ? 1.14 : 1);
        if (M.bored) { lid = 0.42; k = 0.04; c = 0.3; pupil *= 0.92; by = 5; if (!has) { tx *= 0.6; ty = ty * 0.5 + 0.2; } }
        break;
      }
      case 'think': {
        if (now > e.sideAt) { e.side = -e.side; e.sideAt = now + 3000 + rnd() * 3000; }
        jitter(0.16, 0.12, 250, 650);
        tx = e.side * 0.62 + e.jx; ty = -0.62 + e.jy;
        pupil = 0.95; by = -6; br = -e.side * 9; k = 0.16; c = 0.45;
        break;
      }
      case 'respond': {
        tx = 0.07 * Math.sin(T / 900); ty = 0.04 + 0.03 * Math.sin(T / 260);
        pupil = 1 + 0.08 * Math.abs(Math.sin(T / 120)) * (0.5 + 0.5 * Math.sin(T / 650));
        by = -2 + 2.5 * Math.sin(T / 260); lid = 0.05;
        break;
      }
      case 'read': {
        // The magnifier goes over the sheet's 4 lines; the eye follows it.
        const sweep = 1150, ret = 320, lineDur = sweep + ret, lines = 4;
        const li = Math.floor(T / lineDur) % lines, lt = T % lineDur;
        const ys = [32, 50, 68, 86], ends = [136, 138, 124, 104], x0 = 64;
        let lx, ly, cur;
        if (lt < sweep) { lx = x0 + (ends[li] - x0) * easeInOutQuad(lt / sweep); ly = ys[li]; cur = li; }
        else {
          const u = easeInOutQuad((lt - sweep) / ret), nl = (li + 1) % lines;
          lx = ends[li] + (x0 - ends[li]) * u; ly = ys[li] + (ys[nl] - ys[li]) * u; cur = nl;
        }
        e.lx += (lx - e.lx) * Math.min(1, 0.35 * dt);
        e.ly += (ly - e.ly) * Math.min(1, 0.35 * dt);
        if (e.line !== cur) {
          e.line = cur;
          eye.setAttribute('data-line', String(cur));
          if (stage) stage.setAttribute('data-line', String(cur));
        }
        tx = ((e.lx - 100) / 40) * 0.75; ty = 0.5 + (e.ly - 59) * 0.004;
        pupil = 0.62; by = 1;
        break;
      }
      case 'write': {
        // The pencil writes 4 lines then lifts; the eye follows its tip.
        const lineT = 1400, lines = 4, pause = 800, cycle = lineT * lines + pause;
        const ct = T % cycle;
        const ys = [32, 50, 68, 86], ends = [134, 138, 120, 96], x0 = 64;
        const writing = ct < lineT * lines;
        const li = writing ? Math.floor(ct / lineT) : lines - 1;
        const p = writing ? (ct - li * lineT) / lineT : 1;
        e.w = [0, 1, 2, 3].map((i) => (i < li ? 0 : i === li ? 1 - p : 1));
        let px = x0 + (ends[li] - x0) * p, py = ys[li] - 1 + (writing ? Math.sin(T / 55) * 1.3 : 0);
        if (!writing) { px = ends[li] + 8; py = ys[li] - 10; }
        e.px = px; e.py = py; e.pr = writing ? -4 + 6 * Math.sin(T / 110) : -14;
        tx = ((px - 100) / 40) * 0.75; ty = 0.58; lid = 0.45; pupil = 0.8; by = 4;
        break;
      }
      case 'shell': {
        tx = 0; ty = 0.42;
        if (!R) { tx += (rnd() - 0.5) * 0.05; ty += (rnd() - 0.5) * 0.05; }
        pupil = 0.48; by = 6; lid = 0.12; k = 0.3; c = 0.55;
        break;
      }
      case 'generic': {
        // The puzzle piece jumps from point to point; the eye follows it.
        if (now > e.gAt) {
          const a = rnd() * Math.PI * 2, rr = 0.35 + rnd() * 0.45;
          e.gx = Math.cos(a) * rr; e.gy = Math.sin(a) * rr * 0.85; e.gbr = (rnd() - 0.5) * 10;
          e.gAt = now + 350 + rnd() * 450;
        }
        spring('zx', 'vzx', 100 + e.gx * 48, 0.2, 0.45, dt);
        spring('zy', 'vzy', 60 + e.gy * 30, 0.2, 0.45, dt);
        tx = ((e.zx - 100) / 48) * 0.6; ty = 0.42 + ((e.zy - 60) / 30) * 0.22;
        pupil = 0.9; by = -3; br = e.gbr; k = 0.22; c = 0.5;
        break;
      }
      case 'delegate': {
        // Phase 1: the two eyes look at each other. Phase 2: the small one goes to work, the big one watches it.
        const cyc = T % 3400;
        let mxT = 100, myT = 62, ppx = 0, ppy = -7;
        if (cyc < 1300) { tx = 0; ty = 0.62; br = -4; }
        else {
          const w = (cyc - 1300) / 2100;
          mxT = 100 + 42 * Math.sin(w * Math.PI * 2);
          ppx = 5 * Math.sign(Math.cos(w * Math.PI * 2)); ppy = 4;
          tx = ((e.mix - 100) / 48) * 0.6; ty = 0.55;
        }
        spring('mix', 'vmix', mxT, 0.15, 0.4, dt);
        spring('miy', 'vmiy', myT, 0.15, 0.4, dt);
        e.mpx += (ppx - e.mpx) * Math.min(1, 0.2 * dt);
        e.mpy += (ppy - e.mpy) * Math.min(1, 0.2 * dt);
        pupil = 0.85; by = -2;
        break;
      }
      case 'web': {
        tx = 0.18 * Math.sin(T / 2400); ty = -0.28 + 0.05 * Math.sin(T / 1700);
        pupil = 0.42; by = -5; k = 0.06; c = 0.35;
        break;
      }
      case 'plan': {
        // 4 checks of 800 ms, then 2 beats of pause, then again.
        const stepT = 800, row = Math.floor(T / stepT) % 6, ph = (T % stepT) / stepT;
        e.c = [0, 1, 2, 3].map((i) => (i < row ? 1 : i === row ? Math.min(1, Math.max(0, (ph - 0.3) / 0.25)) : 0));
        const r = Math.min(row, 3);
        tx = -0.45 + (row >= 4 ? 0.3 : 0);
        ty = 0.35 + r * 0.09 + (row < 4 && ph > 0.25 && ph < 0.55 ? 0.12 : 0);
        pupil = 0.8; by = 3; k = 0.2; c = 0.45;
        break;
      }
      case 'attention': {
        tx = has ? mx * 0.12 : 0; ty = has ? my * 0.12 : 0;
        pupil = 1.4; blink = false; by = -10;
        break;
      }
      case 'sleep': {
        lidDirect = easeInOutQuad(Math.min(1, T / 2600));
        tx = 0; ty = 0.55; pupil = 0.8; by = 7; blink = false; k = 0.05; c = 0.3;
        break;
      }
      case 'error-flash':
      case 'error': {
        const flash = st === 'error-flash';
        if (R) { tx = 0; ty = 0.3; br = 8; }
        else {
          const a = T / (flash ? 140 : 420);
          tx = Math.cos(a) * 0.9; ty = Math.sin(a) * 0.9;
          br = (flash ? 12 : 10) * Math.sin(T / (flash ? 90 : 300));
        }
        pupil = 0.7; by = 3; lid = 0.08; blink = !flash; k = 0.25; c = 0.45;
        break;
      }
      case 'error-spiral': {
        br = R ? 8 : 10 * Math.sin(T / 300); by = 2; blink = false;
        break;
      }
      case 'happy': {
        by = -9; blink = false;
        break;
      }
      case 'vexed': {
        tx = 0.82; ty = -0.12; pupil = 0.5; lid = 0.42; by = 7; br = -7; k = 0.2; c = 0.45;
        break;
      }
      case 'surprised': {
        tx = 0; ty = -0.1; pupil = T < 220 ? 0.4 : 1.2; by = -16; blink = false; k = 0.25;
        break;
      }
    }

    // Modifiers
    if (M.impatient && TOOL_STATES[st]) {
      const ph = T % 2800;
      if (ph < 750) { tx = has ? mx * 0.35 : 0; ty = has ? my * 0.35 : 0.05; pupil = 1.05; br = -8; by = -4; }
      else if (ph < 1250) lid = Math.max(lid, 0.42 * Math.sin(((ph - 750) / 500) * Math.PI));
    }
    if (M.tired && !NO_TIRED[st]) lid = Math.min(1, lid + 0.2);

    // Blinks: 180 ms, sometimes double
    if (!blink) { if (e.blinkAt < now + 800) e.blinkAt = now + 800 + rnd() * 2000; }
    else if (now > e.blinkAt) {
      e.blinkStart = now;
      const dbl = rnd() < 0.18;
      e.blinkAt = now + (dbl ? 280 : (st === 'idle' ? 2400 : 3800) + rnd() * 4200);
    }
    if (e.blink2 && now >= e.blink2) { e.blinkStart = now; e.blink2 = 0; }
    let b = 0;
    if (e.blinkStart >= 0) {
      const p = (now - e.blinkStart) / 180;
      if (p >= 1) e.blinkStart = -1;
      else b = p < 0.4 ? Math.sin((p / 0.4) * Math.PI / 2) : 1 - (1 - Math.pow(1 - (p - 0.4) / 0.6, 3));
    }

    // Spring integration (steps ≤ 1 frame)
    const steps = Math.ceil(dt), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      spring('x', 'vx', tx, k, c, h);
      spring('y', 'vy', ty, k, c, h);
      if (lidDirect === null) spring('lid', 'vlid', lid, 0.07, 0.34, h);
      spring('by', 'vby', by, 0.1, 0.35, h);
      spring('br', 'vbr', br, 0.1, 0.35, h);
      spring('k', 'vk', 1, 0.18, 0.22, h);
      spring('bs', 'vbs', e.side, 0.12, 0.3, h);
    }
    if (lidDirect !== null) { e.lid = lidDirect; e.vlid = 0; }
    e.p += (pupil - e.p) * Math.min(1, 0.12 * dt);
    e.shake *= Math.pow(0.88, dt);
    const lidOut = Math.min(1, e.lid + (1 - e.lid) * b);

    // Output: CSS variables
    const s = eye.style;
    s.setProperty('--look-x', (e.x * AX).toFixed(2));
    s.setProperty('--look-y', (e.y * AY).toFixed(2));
    s.setProperty('--lid', lidOut.toFixed(3));
    s.setProperty('--pupil', e.p.toFixed(3));
    s.setProperty('--brow-y', e.by.toFixed(2));
    s.setProperty('--brow-r', e.br.toFixed(2));
    s.setProperty('--kick', e.k.toFixed(4));
    s.setProperty('--shake', R ? '0' : (e.shake * Math.sin(now / 22)).toFixed(2));
    s.setProperty('--bub-s', e.bs.toFixed(3));
    if (stage) {
      const g = stage.style;
      g.setProperty('--lx', e.lx.toFixed(2));
      g.setProperty('--ly', e.ly.toFixed(2));
      g.setProperty('--px', e.px.toFixed(2));
      g.setProperty('--py', e.py.toFixed(2));
      g.setProperty('--pr', e.pr.toFixed(2));
      if (e.w) e.w.forEach((v, i) => g.setProperty('--w' + i, v.toFixed(3)));
      if (e.c) e.c.forEach((v, i) => g.setProperty('--c' + i, v.toFixed(3)));
      g.setProperty('--zx', e.zx.toFixed(2));
      g.setProperty('--zy', e.zy.toFixed(2));
      g.setProperty('--mix', e.mix.toFixed(2));
      g.setProperty('--miy', e.miy.toFixed(2));
      g.setProperty('--mpx', e.mpx.toFixed(2));
      g.setProperty('--mpy', e.mpy.toFixed(2));
    }
  }

  const onMove = (ev) => { mouse = { x: ev.clientX, y: ev.clientY }; };
  const onLeave = () => { mouse = null; };
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  };

  return {
    start() {
      if (raf) return;
      e.blinkAt = performance.now() + 1500;
      window.addEventListener('pointermove', onMove, true);
      document.documentElement.addEventListener('pointerleave', onLeave);
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf); raf = 0;
      window.removeEventListener('pointermove', onMove, true);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    },
    /** A double blink (a click on the eye): open the details card 380 ms later. */
    blinkTwice() {
      const now = performance.now();
      e.blinkStart = now;
      e.blink2 = now + 200;
    },
  };
}
