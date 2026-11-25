(() => {
  "use strict";

  const canvas = document.getElementById("ocean");
  const ctx = canvas.getContext("2d");
  const hourSlider = document.getElementById("hour");
  const hourValue = document.getElementById("hour-value");
  const swellSlider = document.getElementById("swell");
  const swellValue = document.getElementById("swell-value");
  const pauseBtn = document.getElementById("pause");
  const beginBtn = document.getElementById("begin");
  const statusEl = document.getElementById("ocean-status");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Hour of light: dawn teal -> dusk -> midnight ink */
  const STOPS = [
    { name: "Dawn",     top: [24, 94, 90],  bottom: [13, 52, 54],  ink: [190, 232, 221], glow: [242, 178, 121] },
    { name: "Dusk",     top: [15, 61, 66],  bottom: [9, 37, 40],   ink: [156, 207, 198], glow: [242, 178, 121] },
    { name: "Midnight", top: [7, 39, 46],   bottom: [4, 15, 20],   ink: [110, 169, 172], glow: [214, 156, 116] },
  ];

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpRGB = (a, b, t) => [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
  const rgb = (c, alpha) =>
    alpha === undefined
      ? `rgb(${c[0]},${c[1]},${c[2]})`
      : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

  function paletteAt(hour) {
    const pos = (hour / 100) * (STOPS.length - 1);
    const i = Math.min(Math.floor(pos), STOPS.length - 2);
    const t = pos - i;
    const a = STOPS[i];
    const b = STOPS[i + 1];
    return {
      name: t < 0.5 ? a.name : b.name,
      top: lerpRGB(a.top, b.top, t),
      bottom: lerpRGB(a.bottom, b.bottom, t),
      ink: lerpRGB(a.ink, b.ink, t),
      glow: lerpRGB(a.glow, b.glow, t),
    };
  }

  const state = {
    hour: 50,
    swell: 40,
    paused: reduceMotion.matches, // reduced motion starts with a still surface
    t: 0,
    w: 0,
    h: 0,
    dpr: 1,
  };

  let particles = [];
  const ripples = [];
  const MAX_RIPPLES = 14;

  function buildParticles() {
    const count = Math.min(2600, Math.max(900, Math.round((state.w * state.h) / 700)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * state.w,
      baseY: Math.random() * state.h,
      depth: Math.random(),                 // 0 far, 1 near
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
      drift: (Math.random() - 0.5) * 6,
      size: 0.6 + Math.random() * 1.8,
    }));
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = canvas.clientWidth;
    state.h = canvas.clientHeight;
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    buildParticles();
  }

  function swellFactor() {
    return 0.2 + (state.swell / 100) * 1.5;
  }

  function spawnRipple(x, y, power) {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, age: 0, life: 3.2, power });
  }

  /* Pointer + touch gestures */
  let lastX = null, lastY = null, lastMoveTime = 0;
  canvas.addEventListener("pointerdown", (e) => {
    lastX = e.offsetX; lastY = e.offsetY;
    spawnRipple(e.offsetX, e.offsetY, 1.2);
  });
  canvas.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (lastX === null) { lastX = e.offsetX; lastY = e.offsetY; return; }
    const dx = e.offsetX - lastX, dy = e.offsetY - lastY;
    if (Math.hypot(dx, dy) > 34 && now - lastMoveTime > 60) {
      spawnRipple(e.offsetX, e.offsetY, 0.45);
      lastX = e.offsetX; lastY = e.offsetY; lastMoveTime = now;
    }
  });
  canvas.addEventListener("pointerleave", () => { lastX = lastY = null; });

  /* Simulation + render */
  function particleY(p) {
    const swell = swellFactor();
    const amp = (4 + p.depth * 22) * swell;
    return (
      p.baseY +
      Math.sin(state.t * p.speed + p.phase) * amp +
      Math.sin(state.t * p.speed * 0.37 + p.phase * 1.7) * amp * 0.4
    );
  }

  function rippleOffset(p, x, y) {
    let ox = 0, oy = 0;
    for (const r of ripples) {
      const dx = x - r.x, dy = y - r.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const front = r.age * 130;
      const band = d - front;
      const envelope = Math.exp(-(band * band) / (2 * 42 * 42)) * (1 - r.age / r.life);
      const push = r.power * envelope * 16;
      ox += (dx / d) * push;
      oy += (dy / d) * push + Math.sin(band * 0.09) * push * 0.4;
    }
    return [ox, oy];
  }

  function render(dt) {
    if (!state.paused) state.t += dt * (reduceMotion.matches ? 0.45 : 1);
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age >= ripples[i].life) ripples.splice(i, 1);
    }

    const pal = paletteAt(state.hour);
    const grad = ctx.createLinearGradient(0, 0, 0, state.h);
    grad.addColorStop(0, rgb(pal.top));
    grad.addColorStop(1, rgb(pal.bottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, state.w, state.h);

    /* ripple rings */
    ctx.lineWidth = 1.2;
    for (const r of ripples) {
      const alpha = (1 - r.age / r.life) * 0.22 * r.power;
      ctx.strokeStyle = rgb(pal.glow, alpha);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.age * 130, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* particles */
    const near = rgb(pal.ink), far = lerpRGB(pal.ink, pal.bottom, 0.55);
    for (const p of particles) {
      const y = particleY(p);
      const [ox, oy] = rippleOffset(p, p.x, y);
      ctx.fillStyle = rgb(far, 0.35 + p.depth * 0.65);
      ctx.beginPath();
      ctx.arc(p.x + ox, y + oy, p.size * (0.6 + p.depth * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }

    /* accent shimmer near the surface */
    ctx.fillStyle = rgb(pal.glow, 0.5);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + state.t * 0.2;
      const rx = state.w / 2 + Math.cos(a) * state.w * 0.3;
      const ry = state.h * 0.5 + Math.sin(a) * state.h * 0.22;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    document.documentElement.style.setProperty("--bg", rgb(pal.bottom));
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    render(dt);
    requestAnimationFrame(frame);
  }

  /* Controls */
  const swellNames = ["Soft", "Gentle", "Rolling", "Heavy"];
  function swellName(v) {
    return swellNames[Math.min(3, Math.floor((v / 100) * 4))];
  }

  function announce(message) {
    statusEl.textContent = "";
    requestAnimationFrame(() => { statusEl.textContent = message; });
  }

  hourSlider.addEventListener("input", () => {
    state.hour = Number(hourSlider.value);
    hourValue.textContent = paletteAt(state.hour).name;
  });

  swellSlider.addEventListener("input", () => {
    state.swell = Number(swellSlider.value);
    swellValue.textContent = swellName(state.swell);
  });

  function setPaused(paused) {
    state.paused = paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.textContent = paused ? "Resume the tide" : "Pause the tide";
    announce(paused ? "The tide is paused." : "The tide is flowing.");
  }

  pauseBtn.addEventListener("click", () => setPaused(!state.paused));

  beginBtn.addEventListener("click", () => {
    if (state.paused) setPaused(false);
    spawnRipple(state.w / 2, state.h / 2, 1.4);
  });

  reduceMotion.addEventListener?.("change", (e) => {
    if (e.matches && !state.paused) setPaused(true);
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  hourValue.textContent = paletteAt(state.hour).name;
  swellValue.textContent = swellName(state.swell);
  if (state.paused) {
    pauseBtn.setAttribute("aria-pressed", "true");
    pauseBtn.textContent = "Resume the tide";
  }
  resize();
  requestAnimationFrame(frame);
})();
