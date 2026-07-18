"use strict";

// ==== Obstacle Rush — course d'obstacles 2D ====

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const livesEl = document.getElementById("lives");
const phaseEl = document.getElementById("phase");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("scoreDisplay");
const hitFlashEl = document.getElementById("hitFlash");

const homeScreen = document.getElementById("homeScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const homeBestEl = document.getElementById("homeBest");
const overBestEl = document.getElementById("overBest");
const finalScoreEl = document.getElementById("finalScore");
const newRecordEl = document.getElementById("newRecord");

const W = canvas.width;   // 900 (résolution logique)
const H = canvas.height;  // 500

// ---- Configuration ----

const GROUND_Y = 420;         // niveau du sol
const PLAYER_X = 180;         // position horizontale fixe du personnage
const GRAVITY = 0.55;
const JUMP_VELOCITY = -13.5;
const COYOTE_FRAMES = 6;      // tolérance de saut après avoir quitté un bord
const BUFFER_FRAMES = 7;      // tolérance de saut appuyé un peu trop tôt

const STAND = { w: 38, h: 62 };   // hitbox debout
const SLIDE = { w: 44, h: 32 };   // hitbox en glissade

const BEST_KEY = "obstacleRushBest";

// Les 3 niveaux de difficulté (temps en secondes)
const PHASES = [
  { name: "Facile",    until: 30,       speed: 5.5, gapMin: 400, gapMax: 560, css: "" },
  { name: "Moyen",     until: 60,       speed: 7.5, gapMin: 300, gapMax: 430, css: "medium" },
  { name: "Difficile", until: Infinity, speed: 9.5, gapMin: 240, gapMax: 340, css: "hard" },
];

// Thèmes de fond par niveau (ciel haut/bas, collines, soleil)
const THEMES = [
  { skyTop: "#aee9ff", skyBottom: "#e8fbff", hillsFar: "#8ee6b8", hillsNear: "#5fce93", sun: "#ffd93d", grass: "#4caf72", dirt: "#8d6e4b" },
  { skyTop: "#ffb36b", skyBottom: "#ffe3b3", hillsFar: "#ff9e9e", hillsNear: "#f2707a", sun: "#ff7b54", grass: "#d98e4a", dirt: "#7c5233" },
  { skyTop: "#3b2477", skyBottom: "#7b4bb7", hillsFar: "#5a3a95", hillsNear: "#472a7c", sun: "#f5f3ce", grass: "#6d5bb8", dirt: "#3c2e63" },
];

// ---- État du jeu ----

const state = {
  running: false,
  time: 0,               // secondes écoulées dans le run
  distance: 0,           // distance en px
  lives: 3,
  speed: PHASES[0].speed,
  phaseIndex: 0,
  player: {
    y: GROUND_Y,         // position des pieds
    vy: 0,
    grounded: true,
    sliding: false,
    coyote: 0,
    jumpBuffer: 0,
    invincible: 0,       // frames d'invincibilité restantes
    knockback: 0,        // effet de recul visuel
    onPlatform: null,
  },
  obstacles: [],         // blocs, barres, plateformes
  gaps: [],              // trous dans le sol
  particles: [],
  clouds: [],
  nextSpawnX: W + 200,
  keys: { slide: false },
  best: Number(localStorage.getItem(BEST_KEY)) || 0,
};

// ---- Écrans / navigation ----

function showScreen(el) {
  [homeScreen, gameOverScreen].forEach(s => s.classList.add("hidden"));
  if (el) el.classList.remove("hidden");
}

function goHome() {
  homeBestEl.textContent = state.best;
  showScreen(homeScreen);
}

document.getElementById("playBtn").addEventListener("click", startRun);
document.getElementById("replayBtn").addEventListener("click", startRun);

// ---- Lancement d'un run ----

function startRun() {
  state.running = true;
  state.time = 0;
  state.distance = 0;
  state.lives = 3;
  state.phaseIndex = 0;
  state.speed = PHASES[0].speed;
  state.obstacles = [];
  state.gaps = [];
  state.particles = [];
  state.nextSpawnX = W + 200;
  Object.assign(state.player, {
    y: GROUND_Y, vy: 0, grounded: true, sliding: false,
    coyote: 0, jumpBuffer: 0, invincible: 0, knockback: 0, onPlatform: null,
  });
  showScreen(null);
  updateHud();
}

// ---- HUD ----

function updateHud() {
  livesEl.textContent = "❤️".repeat(state.lives) || "💔";
  const phase = PHASES[state.phaseIndex];
  phaseEl.textContent = phase.name;
  phaseEl.className = "hud-value phase " + phase.css;
  const m = Math.floor(state.time / 60);
  const s = Math.floor(state.time % 60).toString().padStart(2, "0");
  timerEl.textContent = `${m}:${s}`;
  scoreEl.textContent = `${meters()} m`;
}

function meters() {
  return Math.floor(state.distance / 12);
}

// ---- Génération des obstacles ----

function currentPhase() {
  return PHASES[state.phaseIndex];
}

function spawnPattern(x) {
  const p = state.phaseIndex;
  const r = Math.random();

  if (p === 0) {
    // Facile : un seul type d'obstacle à la fois, bien espacé
    if (r < 0.45) return spawnBlock(x, 48);
    if (r < 0.75) return spawnBar(x);
    return spawnGap(x, 95);
  }

  if (p === 1) {
    // Moyen : obstacles plus costauds + plateformes mobiles
    if (r < 0.25) return spawnBlock(x, 56);
    if (r < 0.45) return spawnBar(x);
    if (r < 0.62) return spawnGap(x, 125);
    if (r < 0.82) return spawnDoubleBlock(x);
    return spawnPlatformGap(x);
  }

  // Difficile : combos qui demandent de sauter ET glisser
  if (r < 0.2) return spawnBlockThenBar(x);
  if (r < 0.38) return spawnBar(x);
  if (r < 0.55) return spawnGap(x, 140);
  if (r < 0.72) return spawnPlatformGap(x);
  if (r < 0.88) return spawnDoubleBlock(x);
  return spawnBlock(x, 62);
}

function spawnBlock(x, h) {
  state.obstacles.push({ type: "block", x, y: GROUND_Y - h, w: 46, h });
  return 46;
}

function spawnDoubleBlock(x) {
  spawnBlock(x, 48);
  spawnBlock(x + 150, 48);
  return 196;
}

function spawnBar(x) {
  // Barre suspendue : on passe dessous en glissant
  state.obstacles.push({ type: "bar", x, y: GROUND_Y - 86, w: 95, h: 26 });
  return 95;
}

function spawnBlockThenBar(x) {
  // Combo difficile : sauter le bloc puis glisser immédiatement sous la barre
  spawnBlock(x, 48);
  spawnBar(x + 190);
  return 285;
}

function spawnGap(x, w) {
  state.gaps.push({ x, w });
  return w;
}

function spawnPlatformGap(x) {
  // Grand trou infranchissable d'un seul saut : il faut rebondir sur la plateforme mobile
  const gapW = 260;
  state.gaps.push({ x, w: gapW });
  state.obstacles.push({
    type: "platform",
    x: x + gapW / 2 - 55,
    w: 110, h: 18,
    baseY: GROUND_Y - 65,
    amp: 30,
    t: Math.random() * Math.PI * 2,
    y: GROUND_Y - 65,
  });
  return gapW;
}

function updateSpawning() {
  state.nextSpawnX -= state.speed;
  if (state.nextSpawnX <= W + 100) {
    const phase = currentPhase();
    const consumed = spawnPattern(W + 120);
    const gap = phase.gapMin + Math.random() * (phase.gapMax - phase.gapMin);
    state.nextSpawnX = W + 120 + consumed + gap;
  }
}

// ---- Entrées ----

function pressJump() {
  if (!state.running) return;
  state.player.jumpBuffer = BUFFER_FRAMES;
}

document.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Spacebar" || e.key === "ArrowUp") {
    e.preventDefault();
    pressJump();
  }
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
    e.preventDefault();
    state.keys.slide = true;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
    state.keys.slide = false;
  }
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  pressJump();
});

// Boutons tactiles
const jumpBtn = document.getElementById("jumpBtn");
const slideBtn = document.getElementById("slideBtn");

["pointerdown", "touchstart"].forEach(evt =>
  jumpBtn.addEventListener(evt, (e) => { e.preventDefault(); pressJump(); }, { passive: false })
);
["pointerdown", "touchstart"].forEach(evt =>
  slideBtn.addEventListener(evt, (e) => { e.preventDefault(); state.keys.slide = true; }, { passive: false })
);
["pointerup", "pointercancel", "pointerleave", "touchend", "touchcancel"].forEach(evt =>
  slideBtn.addEventListener(evt, () => { state.keys.slide = false; })
);

// ---- Physique du joueur ----

function playerHitbox() {
  const p = state.player;
  const box = p.sliding ? SLIDE : STAND;
  return { x: PLAYER_X - box.w / 2, y: p.y - box.h, w: box.w, h: box.h };
}

function overGap() {
  // Le joueur tombe si ses pieds sont entièrement au-dessus d'un trou
  const left = PLAYER_X - 14;
  const right = PLAYER_X + 14;
  return state.gaps.some(g => left > g.x && right < g.x + g.w);
}

function updatePlayer(step) {
  const p = state.player;

  // Glissade uniquement au sol
  p.sliding = state.keys.slide && p.grounded;

  // Saut avec buffer + coyote time pour une bonne sensation de jeu
  if (p.jumpBuffer > 0) p.jumpBuffer -= step;
  if (p.coyote > 0) p.coyote -= step;

  if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
    p.vy = JUMP_VELOCITY;
    p.grounded = false;
    p.sliding = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.onPlatform = null;
    spawnDust(PLAYER_X, GROUND_Y, 6);
  }

  const prevY = p.y;
  p.vy += GRAVITY * step;
  p.y += p.vy * step;

  // Suivre la plateforme sur laquelle on est posé
  if (p.onPlatform) {
    const pl = p.onPlatform;
    const stillOn = pl.x < PLAYER_X + 20 && pl.x + pl.w > PLAYER_X - 20;
    if (stillOn && p.vy >= 0) {
      p.y = pl.y;
      p.vy = 0;
      p.grounded = true;
    } else {
      p.onPlatform = null;
      p.coyote = COYOTE_FRAMES;
    }
  }

  if (!p.onPlatform) {
    let landed = false;

    // Atterrissage sur une plateforme mobile
    if (p.vy >= 0) {
      for (const o of state.obstacles) {
        if (o.type !== "platform") continue;
        const overlapX = o.x < PLAYER_X + 18 && o.x + o.w > PLAYER_X - 18;
        if (overlapX && prevY <= o.y + 6 && p.y >= o.y) {
          p.y = o.y;
          p.vy = 0;
          p.grounded = true;
          p.onPlatform = o;
          landed = true;
          spawnDust(PLAYER_X, o.y, 4);
          break;
        }
      }
    }

    // Atterrissage sur le sol (sauf au-dessus d'un trou)
    if (!landed && p.vy >= 0 && p.y >= GROUND_Y && !overGap()) {
      if (!p.grounded) spawnDust(PLAYER_X, GROUND_Y, 5);
      p.y = GROUND_Y;
      p.vy = 0;
      p.grounded = true;
    } else if (!landed && !p.onPlatform) {
      if (p.grounded && (p.y < GROUND_Y || overGap())) {
        // On vient de quitter le sol (bord de trou) : coyote time
        p.coyote = COYOTE_FRAMES;
      }
      if (p.y > GROUND_Y && overGap()) p.grounded = false;
      if (p.y < GROUND_Y) p.grounded = false;
    }
  }

  // Tombé dans un trou
  if (p.y - 40 > H) {
    fallInGap();
  }

  // Décomptes d'effets
  if (p.invincible > 0) p.invincible -= step;
  if (p.knockback > 0) p.knockback = Math.max(0, p.knockback - 0.05 * step);
}

// ---- Collisions et dégâts ----

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function checkCollisions() {
  const p = state.player;
  if (p.invincible > 0) return;

  const hb = playerHitbox();
  for (let i = 0; i < state.obstacles.length; i++) {
    const o = state.obstacles[i];
    if (o.type === "platform") continue;
    if (rectsOverlap(hb, { x: o.x, y: o.y, w: o.w, h: o.h })) {
      state.obstacles.splice(i, 1);
      takeHit();
      return;
    }
  }
}

function takeHit() {
  const p = state.player;
  state.lives--;
  p.invincible = 90;   // ~1,5 s d'invincibilité
  p.knockback = 1;     // effet visuel de recul
  flashScreen();
  spawnBurst(PLAYER_X, p.y - 30);
  updateHud();
  if (state.lives <= 0) endRun();
}

function fallInGap() {
  const p = state.player;
  state.lives--;
  flashScreen();
  updateHud();
  if (state.lives <= 0) {
    endRun();
    return;
  }
  // Respawn : on repose le joueur au sol et on dégage la zone devant lui
  p.y = GROUND_Y;
  p.vy = 0;
  p.grounded = true;
  p.onPlatform = null;
  p.invincible = 100;
  state.gaps = state.gaps.filter(g => g.x > PLAYER_X + 350);
  state.obstacles = state.obstacles.filter(o => o.x > PLAYER_X + 350);
}

function flashScreen() {
  hitFlashEl.classList.remove("active");
  void hitFlashEl.offsetWidth;
  hitFlashEl.classList.add("active");
}

function endRun() {
  state.running = false;
  const score = meters();
  const isRecord = score > state.best;
  if (isRecord) {
    state.best = score;
    localStorage.setItem(BEST_KEY, String(score));
  }
  finalScoreEl.textContent = score;
  overBestEl.textContent = state.best;
  newRecordEl.classList.toggle("hidden", !isRecord);
  showScreen(gameOverScreen);
}

// ---- Particules ----

function spawnDust(x, y, count) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 24,
      y: y - Math.random() * 6,
      vx: -1 - Math.random() * 2,
      vy: -Math.random() * 1.5,
      size: 3 + Math.random() * 4,
      life: 1,
      decay: 0.04,
      color: "rgba(255,255,255,0.8)",
    });
  }
}

function spawnBurst(x, y) {
  const colors = ["#ff6b81", "#ffd93d", "#12cbc4", "#ff9f43"];
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 4;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.5,
      size: 3 + Math.random() * 4,
      life: 1,
      decay: 0.03,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function updateParticles(step) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * step;
    pt.y += pt.vy * step;
    pt.vy += 0.1 * step;
    pt.life -= pt.decay * step;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

// ---- Boucle de mise à jour ----

function updatePhase() {
  const prev = state.phaseIndex;
  state.phaseIndex = state.time < PHASES[0].until ? 0 : state.time < PHASES[1].until ? 1 : 2;
  // Vitesse de base du niveau + légère accélération continue en Difficile
  let speed = PHASES[state.phaseIndex].speed;
  if (state.phaseIndex === 2) speed += Math.min(2.5, (state.time - 60) / 45);
  state.speed = speed;
  if (prev !== state.phaseIndex) updateHud();
}

function update(step) {
  state.time += step / 60;
  state.distance += state.speed * step;

  updatePhase();
  updateSpawning();
  updatePlayer(step);

  // Défilement du monde
  for (const o of state.obstacles) {
    o.x -= state.speed * step;
    if (o.type === "platform") {
      o.t += 0.03 * step;
      o.y = o.baseY + Math.sin(o.t) * o.amp;
    }
  }
  for (const g of state.gaps) g.x -= state.speed * step;

  state.obstacles = state.obstacles.filter(o => o.x + o.w > -60);
  state.gaps = state.gaps.filter(g => g.x + g.w > -60);

  checkCollisions();
  updateHud();
}

// ---- Rendu ----

function lerp(a, b, t) { return a + (b - a) * t; }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Thème interpolé : transitions douces autour de 30 s et 60 s
function currentTheme() {
  const t = state.time;
  const blend = (edge) => Math.min(1, Math.max(0, (t - edge) / 4));
  const mix = (key) => {
    let c = hexToRgb(THEMES[0][key]);
    c = lerpRgb(c, hexToRgb(THEMES[1][key]), blend(28));
    c = lerpRgb(c, hexToRgb(THEMES[2][key]), blend(58));
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  };
  return {
    skyTop: mix("skyTop"), skyBottom: mix("skyBottom"),
    hillsFar: mix("hillsFar"), hillsNear: mix("hillsNear"),
    sun: mix("sun"), grass: mix("grass"), dirt: mix("dirt"),
    night: blend(58),
  };
}

function drawBackground(theme) {
  // Ciel
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Soleil / lune
  ctx.fillStyle = theme.sun;
  ctx.beginPath();
  ctx.arc(W - 130, 90, 42, 0, Math.PI * 2);
  ctx.fill();

  // Étoiles en mode Difficile
  if (theme.night > 0.05) {
    ctx.globalAlpha = theme.night;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137 + 60) % W;
      const sy = (i * 83 + 25) % (GROUND_Y - 120);
      const tw = 0.5 + 0.5 * Math.sin(state.time * 3 + i * 1.7);
      ctx.globalAlpha = theme.night * tw;
      ctx.fillRect(sx, sy, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
  }

  // Nuages en parallaxe
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (const c of state.clouds) {
    c.x -= c.v * (state.running ? state.speed / 5 : 0.6);
    if (c.x < -120) c.x = W + 120;
    drawCloud(c.x, c.y, c.s);
  }

  // Collines en parallaxe (deux couches)
  drawHills(theme.hillsFar, 0.25, 70, 190);
  drawHills(theme.hillsNear, 0.5, 95, 150);
}

function drawCloud(x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
  ctx.arc(x + 20 * s, y - 8 * s, 15 * s, 0, Math.PI * 2);
  ctx.arc(x + 40 * s, y, 17 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawHills(color, parallax, height, wavelength) {
  const offset = (state.distance * parallax) % (wavelength * 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = -wavelength * 2; x <= W + wavelength; x += 8) {
    const y = GROUND_Y - height / 2 - (Math.sin((x + offset) / wavelength * Math.PI) * height) / 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GROUND_Y);
  ctx.closePath();
  ctx.fill();
}

function drawGround(theme) {
  // Sol par segments, en évitant les trous
  const edges = [0];
  const sorted = [...state.gaps].sort((a, b) => a.x - b.x);
  ctx.fillStyle = theme.dirt;

  let cursor = 0;
  for (const g of sorted) {
    const gx = Math.max(0, g.x);
    const gEnd = Math.min(W, g.x + g.w);
    if (gx > cursor) drawGroundSegment(cursor, gx, theme);
    cursor = Math.max(cursor, gEnd);
  }
  if (cursor < W) drawGroundSegment(cursor, W, theme);

  // Parois des trous
  ctx.fillStyle = "#241c33";
  for (const g of sorted) {
    const gx = Math.max(-10, g.x);
    const gw = Math.min(W + 10, g.x + g.w) - gx;
    if (gw > 0) ctx.fillRect(gx, GROUND_Y, gw, H - GROUND_Y);
  }
}

function drawGroundSegment(x0, x1, theme) {
  ctx.fillStyle = theme.dirt;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, H - GROUND_Y);
  ctx.fillStyle = theme.grass;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, 14);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawObstacles() {
  for (const o of state.obstacles) {
    if (o.type === "block") {
      const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
      grad.addColorStop(0, "#12cbc4");
      grad.addColorStop(1, "#0a8f89");
      ctx.fillStyle = grad;
      roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      roundRect(o.x + 4, o.y + 4, o.w - 8, 10, 5);
      ctx.fill();
      // Petits picots sur le dessus pour signaler le danger
      ctx.fillStyle = "#087f7a";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2 + (i - 1) * 13, o.y - 3, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (o.type === "bar") {
      // Cordes de suspension
      ctx.strokeStyle = "rgba(90,60,30,0.7)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(o.x + 12, 0); ctx.lineTo(o.x + 12, o.y);
      ctx.moveTo(o.x + o.w - 12, 0); ctx.lineTo(o.x + o.w - 12, o.y);
      ctx.stroke();
      // La barre, avec rayures d'avertissement
      const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
      grad.addColorStop(0, "#ff9f43");
      grad.addColorStop(1, "#e07b1f");
      ctx.fillStyle = grad;
      roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.fill();
      ctx.save();
      roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      for (let sx = o.x - 20; sx < o.x + o.w + 20; sx += 24) {
        ctx.beginPath();
        ctx.moveTo(sx, o.y + o.h);
        ctx.lineTo(sx + 10, o.y);
        ctx.lineTo(sx + 18, o.y);
        ctx.lineTo(sx + 8, o.y + o.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (o.type === "platform") {
      // Plateforme flottante : terre + herbe
      const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h + 10);
      grad.addColorStop(0, "#8d6e4b");
      grad.addColorStop(1, "#6b5138");
      ctx.fillStyle = grad;
      roundRect(o.x, o.y, o.w, o.h + 10, 9);
      ctx.fill();
      ctx.fillStyle = "#5fce93";
      roundRect(o.x, o.y, o.w, 9, 9);
      ctx.fill();
      // Petites flèches pour montrer qu'elle bouge
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("⇅", o.x + o.w / 2, o.y + o.h + 4);
    }
  }
}

function drawPlayer() {
  const p = state.player;

  // Clignotement pendant l'invincibilité
  if (p.invincible > 0 && Math.floor(p.invincible / 5) % 2 === 0) return;

  const kb = p.knockback * 26;               // recul visuel après un coup
  const x = PLAYER_X - kb;
  const bob = p.grounded && !p.sliding ? Math.sin(state.distance / 14) * 3 : 0;

  let bw = 56, bh = 62;                       // dimensions du corps
  if (p.sliding) { bw = 72; bh = 34; }
  else if (!p.grounded) { bw = 52; bh = 68; } // étiré en l'air

  const cx = x;
  const cy = p.y - bh / 2 + bob;

  ctx.save();
  ctx.translate(cx, cy);
  if (!p.grounded) ctx.rotate(Math.min(0.25, Math.max(-0.25, p.vy * 0.02)));

  // Ombre
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 6, bw * 0.45, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  if (!p.grounded) ctx.rotate(Math.min(0.25, Math.max(-0.25, p.vy * 0.02)));

  // Corps : blob arrondi avec dégradé
  const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  grad.addColorStop(0, "#ff9f43");
  grad.addColorStop(1, "#ff6b81");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Contour doux
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Yeux (clignement périodique)
  const blink = Math.sin(state.time * 2.2) > 0.97 ? 0.15 : 1;
  const eyeY = p.sliding ? -4 : -bh * 0.16;
  const eyeGap = p.sliding ? 14 : 11;
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(side * eyeGap + 4, eyeY, 8, 9 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d3436";
    ctx.beginPath();
    ctx.ellipse(side * eyeGap + 7, eyeY, 4, 4.5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Joues roses
  ctx.fillStyle = "rgba(255,110,140,0.5)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * (eyeGap + 9) + 4, eyeY + 10, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sourire
  ctx.strokeStyle = "#2d3436";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(4, eyeY + 9, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

// Texte flottant au-dessus de la tête du personnage
function drawPlayerLabel() {
  const p = state.player;
  const kb = p.knockback * 26;
  const x = PLAYER_X - kb;

  // Hauteur du corps selon la posture (mêmes valeurs que drawPlayer)
  const bh = p.sliding ? 34 : (p.grounded ? 62 : 68);
  const bob = Math.sin(state.time * 3.2) * 4;          // flottement doux
  const y = p.y - bh - 24 + bob;

  const text = "Wilson";
  ctx.font = "700 15px 'Comic Sans MS', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Fond semi-transparent arrondi pour détacher le texte du décor
  const tw = ctx.measureText(text).width;
  const padX = 10, padY = 7;
  ctx.fillStyle = "rgba(45, 52, 54, 0.55)";
  roundRect(x - tw / 2 - padX, y - padY - 8, tw + padX * 2, 16 + padY * 2, 11);
  ctx.fill();

  // Texte avec léger contour
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
  ctx.textBaseline = "alphabetic";
}

function drawParticles() {
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  const theme = currentTheme();
  drawBackground(theme);
  drawGround(theme);
  drawObstacles();
  drawPlayer();
  drawPlayerLabel();
  drawParticles();
}

// ---- Boucle principale ----

let lastTime = performance.now();

function loop(now) {
  // Pas de temps normalisé sur 60 fps (tolère les petites variations)
  const step = Math.min(2.5, (now - lastTime) / 16.667);
  lastTime = now;

  if (state.running) update(step);
  updateParticles(step);
  draw();

  requestAnimationFrame(loop);
}

// ---- Initialisation ----

for (let i = 0; i < 5; i++) {
  state.clouds.push({
    x: Math.random() * W,
    y: 40 + Math.random() * 120,
    s: 0.7 + Math.random() * 0.8,
    v: 0.3 + Math.random() * 0.5,
  });
}

goHome();
updateHud();
requestAnimationFrame(loop);
