"use strict";

// ==== Casse-Briques ====

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const container = document.getElementById("canvasContainer");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const finalScoreEl = document.getElementById("finalScore");

const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const winScreen = document.getElementById("winScreen");

const W = canvas.width;   // 800 (résolution logique, mise à l'échelle en CSS)
const H = canvas.height;  // 600

// ---- Configuration ----

const PADDLE = { width: 130, height: 16, speed: 9, y: H - 40 };
const BALL_RADIUS = 9;
const BASE_BALL_SPEED = 5.5;
const SPEED_PER_LEVEL = 0.7;    // accélération à chaque niveau
const MIN_PADDLE_WIDTH = 80;    // la raquette rétrécit un peu à chaque niveau

// Rangées de briques : couleur (dégradé) + points, du haut vers le bas
const BRICK_ROWS = [
  { colors: ["#ff4d8f", "#c2185b"], glow: "#ff4d8f", points: 50 },
  { colors: ["#ff6b6b", "#d63a3a"], glow: "#ff6b6b", points: 40 },
  { colors: ["#ffd93d", "#e0a800"], glow: "#ffd93d", points: 30 },
  { colors: ["#4ade80", "#16a34a"], glow: "#4ade80", points: 20 },
  { colors: ["#29d8ff", "#0284c7"], glow: "#29d8ff", points: 10 },
];
const BRICK_COLS = 10;
const BRICK_HEIGHT = 24;
const BRICK_GAP = 6;
const BRICK_TOP = 70;
const BRICK_SIDE = 30;

// ---- État du jeu ----

const state = {
  running: false,
  score: 0,
  lives: 3,
  level: 1,
  ballOnPaddle: true,   // la balle est collée à la raquette avant le lancement
  paddle: { x: W / 2 - PADDLE.width / 2, width: PADDLE.width },
  ball: { x: W / 2, y: 0, vx: 0, vy: 0, speed: BASE_BALL_SPEED },
  bricks: [],
  particles: [],
  trail: [],            // traînée lumineuse derrière la balle
  keys: { left: false, right: false },
  paddleFlash: 0,       // effet visuel quand la balle touche la raquette
};

// ---- Briques ----

function buildBricks() {
  state.bricks = [];
  const brickWidth = (W - BRICK_SIDE * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
  BRICK_ROWS.forEach((row, r) => {
    for (let c = 0; c < BRICK_COLS; c++) {
      state.bricks.push({
        x: BRICK_SIDE + c * (brickWidth + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_HEIGHT + BRICK_GAP),
        w: brickWidth,
        h: BRICK_HEIGHT,
        row,
        alive: true,
        // petit décalage d'apparition pour l'animation d'entrée
        spawn: (r * BRICK_COLS + c) * 12,
      });
    }
  });
}

// ---- Réinitialisations ----

function resetBall() {
  state.ballOnPaddle = true;
  state.ball.speed = BASE_BALL_SPEED + (state.level - 1) * SPEED_PER_LEVEL;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.trail = [];
}

function resetLevel() {
  state.paddle.width = Math.max(MIN_PADDLE_WIDTH, PADDLE.width - (state.level - 1) * 8);
  state.paddle.x = W / 2 - state.paddle.width / 2;
  buildBricks();
  resetBall();
}

function newGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.particles = [];
  resetLevel();
  updateHud();
}

function launchBall() {
  if (!state.ballOnPaddle) return;
  state.ballOnPaddle = false;
  // Lancement avec un léger angle aléatoire
  const angle = (-Math.PI / 2) + (Math.random() * 0.6 - 0.3);
  state.ball.vx = Math.cos(angle) * state.ball.speed;
  state.ball.vy = Math.sin(angle) * state.ball.speed;
}

// ---- HUD ----

function updateHud() {
  scoreEl.textContent = state.score;
  levelEl.textContent = state.level;
  livesEl.textContent = "❤️".repeat(state.lives) || "—";
}

function bumpScore() {
  scoreEl.classList.remove("bump");
  void scoreEl.offsetWidth; // relance l'animation CSS
  scoreEl.classList.add("bump");
}

// ---- Particules ----

function spawnParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      size: 2 + Math.random() * 4,
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      color,
    });
  }
}

function updateParticles() {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12; // gravité
    p.life -= p.decay;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

// ---- Logique de jeu ----

function movePaddle() {
  if (state.keys.left) state.paddle.x -= PADDLE.speed;
  if (state.keys.right) state.paddle.x += PADDLE.speed;
  state.paddle.x = Math.max(0, Math.min(W - state.paddle.width, state.paddle.x));
}

function moveBall() {
  const b = state.ball;

  if (state.ballOnPaddle) {
    b.x = state.paddle.x + state.paddle.width / 2;
    b.y = PADDLE.y - BALL_RADIUS - 1;
    return;
  }

  b.x += b.vx;
  b.y += b.vy;

  // Traînée lumineuse
  state.trail.push({ x: b.x, y: b.y, life: 1 });
  if (state.trail.length > 12) state.trail.shift();
  state.trail.forEach(t => (t.life -= 0.08));

  // Rebonds sur les murs
  if (b.x - BALL_RADIUS < 0) {
    b.x = BALL_RADIUS;
    b.vx = Math.abs(b.vx);
  } else if (b.x + BALL_RADIUS > W) {
    b.x = W - BALL_RADIUS;
    b.vx = -Math.abs(b.vx);
  }
  if (b.y - BALL_RADIUS < 0) {
    b.y = BALL_RADIUS;
    b.vy = Math.abs(b.vy);
  }

  // Rebond sur la raquette
  const p = state.paddle;
  if (
    b.vy > 0 &&
    b.y + BALL_RADIUS >= PADDLE.y &&
    b.y + BALL_RADIUS <= PADDLE.y + PADDLE.height + Math.abs(b.vy) &&
    b.x >= p.x - BALL_RADIUS &&
    b.x <= p.x + p.width + BALL_RADIUS
  ) {
    // L'angle de rebond dépend du point d'impact sur la raquette
    const hit = (b.x - (p.x + p.width / 2)) / (p.width / 2); // -1 .. 1
    const maxAngle = Math.PI / 3; // 60° max
    b.vx = Math.sin(hit * maxAngle) * b.speed;
    b.vy = -Math.abs(Math.cos(hit * maxAngle) * b.speed);
    b.y = PADDLE.y - BALL_RADIUS;
    state.paddleFlash = 1;
    spawnParticles(b.x, PADDLE.y, "#29d8ff", 6);
  }

  // Balle perdue en bas
  if (b.y - BALL_RADIUS > H) {
    loseLife();
  }
}

function collideBricks() {
  const b = state.ball;
  if (state.ballOnPaddle) return;

  for (const brick of state.bricks) {
    if (!brick.alive) continue;

    // Point de la brique le plus proche du centre de la balle
    const closestX = Math.max(brick.x, Math.min(b.x, brick.x + brick.w));
    const closestY = Math.max(brick.y, Math.min(b.y, brick.y + brick.h));
    const dx = b.x - closestX;
    const dy = b.y - closestY;
    if (dx * dx + dy * dy > BALL_RADIUS * BALL_RADIUS) continue;

    brick.alive = false;
    state.score += brick.row.points;
    updateHud();
    bumpScore();
    spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.row.glow);

    // Rebond selon le côté touché
    if (Math.abs(dx) > Math.abs(dy)) {
      b.vx = dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx);
    } else {
      b.vy = dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy);
    }

    if (state.bricks.every(br => !br.alive)) {
      levelComplete();
    }
    break; // une seule brique par frame pour un rebond propre
  }
}

function loseLife() {
  state.lives--;
  updateHud();
  container.classList.remove("shake");
  void container.offsetWidth;
  container.classList.add("shake");

  if (state.lives <= 0) {
    gameOver();
  } else {
    resetBall();
  }
}

function gameOver() {
  state.running = false;
  finalScoreEl.textContent = state.score;
  gameOverScreen.classList.remove("hidden");
}

function levelComplete() {
  state.running = false;
  winScreen.classList.remove("hidden");
}

// ---- Rendu ----

function drawBricks() {
  const now = performance.now();
  for (const brick of state.bricks) {
    if (!brick.alive) continue;

    // Animation d'apparition en fondu/écrasement
    const t = Math.min(1, Math.max(0, (now - brickSpawnTime - brick.spawn) / 250));
    const scale = 0.6 + 0.4 * t;

    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    const w = brick.w * scale;
    const h = brick.h * scale;

    const grad = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    grad.addColorStop(0, brick.row.colors[0]);
    grad.addColorStop(1, brick.row.colors[1]);

    ctx.globalAlpha = t;
    ctx.shadowColor = brick.row.glow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    roundRect(cx - w / 2, cy - h / 2, w, h, 5);
    ctx.fill();

    // Reflet en haut de la brique
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    roundRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h * 0.32, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

function drawPaddle() {
  const p = state.paddle;
  const flash = state.paddleFlash;

  const grad = ctx.createLinearGradient(p.x, 0, p.x + p.width, 0);
  grad.addColorStop(0, "#ff4d8f");
  grad.addColorStop(1, "#a855f7");

  ctx.shadowColor = flash > 0.1 ? "#ffffff" : "#ff4d8f";
  ctx.shadowBlur = 14 + flash * 22;
  ctx.fillStyle = grad;
  // La raquette "gonfle" légèrement au moment de l'impact
  const bulge = flash * 4;
  roundRect(p.x - bulge / 2, PADDLE.y - bulge / 2, p.width + bulge, PADDLE.height + bulge, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (state.paddleFlash > 0) state.paddleFlash = Math.max(0, state.paddleFlash - 0.08);
}

function drawBall() {
  const b = state.ball;

  // Traînée
  for (const t of state.trail) {
    if (t.life <= 0) continue;
    ctx.globalAlpha = t.life * 0.35;
    ctx.fillStyle = "#29d8ff";
    ctx.beginPath();
    ctx.arc(t.x, t.y, BALL_RADIUS * t.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const grad = ctx.createRadialGradient(
    b.x - 3, b.y - 3, 1,
    b.x, b.y, BALL_RADIUS
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#29d8ff");

  ctx.shadowColor = "#29d8ff";
  ctx.shadowBlur = 16;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLaunchHint() {
  if (!state.ballOnPaddle || !state.running) return;
  ctx.fillStyle = "rgba(238, 241, 255, 0.55)";
  ctx.font = "16px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 300);
  ctx.globalAlpha = blink;
  ctx.fillText("Espace ou clic pour lancer la balle", W / 2, H / 2 + 60);
  ctx.globalAlpha = 1;
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

// ---- Boucle principale ----

let brickSpawnTime = performance.now();

function loop() {
  ctx.clearRect(0, 0, W, H);

  if (state.running) {
    movePaddle();
    moveBall();
    collideBricks();
  }
  updateParticles();

  drawBricks();
  drawPaddle();
  drawBall();
  drawParticles();
  drawLaunchHint();

  requestAnimationFrame(loop);
}

// ---- Entrées clavier / souris ----

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") state.keys.left = true;
  if (e.key === "ArrowRight") state.keys.right = true;
  if (e.key === " " || e.key === "Spacebar") {
    e.preventDefault();
    if (state.running) launchBall();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") state.keys.left = false;
  if (e.key === "ArrowRight") state.keys.right = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (!state.running) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  state.paddle.x = Math.max(0, Math.min(W - state.paddle.width, x - state.paddle.width / 2));
});

canvas.addEventListener("click", () => {
  if (state.running) launchBall();
});

// Contrôle tactile (bonus pour mobile)
canvas.addEventListener("touchmove", (e) => {
  if (!state.running) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.touches[0].clientX - rect.left) / rect.width) * W;
  state.paddle.x = Math.max(0, Math.min(W - state.paddle.width, x - state.paddle.width / 2));
}, { passive: false });

canvas.addEventListener("touchstart", (e) => {
  if (!state.running) return;
  e.preventDefault();
  launchBall();
}, { passive: false });

// ---- Boutons des écrans ----

document.getElementById("startBtn").addEventListener("click", () => {
  startScreen.classList.add("hidden");
  newGame();
  brickSpawnTime = performance.now();
  state.running = true;
});

document.getElementById("restartBtn").addEventListener("click", () => {
  gameOverScreen.classList.add("hidden");
  newGame();
  brickSpawnTime = performance.now();
  state.running = true;
});

document.getElementById("nextLevelBtn").addEventListener("click", () => {
  winScreen.classList.add("hidden");
  state.level++;
  updateHud();
  resetLevel();
  brickSpawnTime = performance.now();
  state.running = true;
});

// ---- Démarrage ----

buildBricks();
updateHud();
loop();
