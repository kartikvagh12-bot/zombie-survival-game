(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const waveEl = document.getElementById("wave");
  const healthBar = document.getElementById("healthBarInner");
  const startOverlay = document.getElementById("startOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const finalWaveEl = document.getElementById("finalWave");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");

  const joystickEl = document.getElementById("joystick");
  const joystickBase = document.getElementById("joystickBase");
  const joystickStick = document.getElementById("joystickStick");
  const shootZone = document.getElementById("shootZone");

  const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  // World state
  let W = 0, H = 0, dpr = 1;
  let player, bullets, zombies, particles;
  let score, wave, zombiesKilled, spawnTimer, spawnInterval;
  let lastShot, shootCooldown;
  let running = false;
  let lastTime = 0;
  let screenFlash = 0;
  let mouseX = 0, mouseY = 0;
  let mouseDown = false;

  const keys = {};
  const joystick = { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dy: 0, max: 50 };
  const shootTouch = { active: false, id: null };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function reset() {
    player = {
      x: W / 2,
      y: H / 2,
      r: 16,
      speed: 220,
      health: 100,
      maxHealth: 100,
      angle: 0,
      hitFlash: 0
    };
    bullets = [];
    zombies = [];
    particles = [];
    score = 0;
    wave = 1;
    zombiesKilled = 0;
    spawnTimer = 0;
    spawnInterval = 1.4;
    lastShot = 0;
    shootCooldown = 160; // ms
    screenFlash = 0;
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    waveEl.textContent = wave;
    const pct = Math.max(0, player.health / player.maxHealth) * 100;
    healthBar.style.width = pct + "%";
  }

  // --- Spawning -------------------------------------------------------------
  function spawnZombie() {
    const side = Math.floor(Math.random() * 4);
    const margin = 40;
    let x, y;
    if (side === 0) { x = -margin; y = Math.random() * H; }
    else if (side === 1) { x = W + margin; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = -margin; }
    else { x = Math.random() * W; y = H + margin; }

    // Different types
    const roll = Math.random();
    let type;
    if (roll < 0.15 + Math.min(0.3, wave * 0.02)) {
      // fast
      type = { speed: 110 + Math.random() * 30, r: 12, hp: 1, color: "#ff6b6b", damage: 12 };
    } else if (roll < 0.25 + Math.min(0.3, wave * 0.015)) {
      // tank
      type = { speed: 45 + Math.random() * 15, r: 22, hp: 3, color: "#6b8cff", damage: 22 };
    } else {
      // normal
      type = { speed: 70 + Math.random() * 20, r: 16, hp: 2, color: "#7acb6b", damage: 16 };
    }

    zombies.push({
      x, y,
      r: type.r,
      speed: type.speed,
      hp: type.hp,
      maxHp: type.hp,
      color: type.color,
      damage: type.damage,
      hitFlash: 0
    });
  }

  // --- Shooting -------------------------------------------------------------
  function tryShoot(now) {
    if (now - lastShot < shootCooldown) return;
    lastShot = now;

    const speed = 620;
    const vx = Math.cos(player.angle) * speed;
    const vy = Math.sin(player.angle) * speed;
    bullets.push({
      x: player.x + Math.cos(player.angle) * (player.r + 4),
      y: player.y + Math.sin(player.angle) * (player.r + 4),
      vx, vy,
      r: 4,
      life: 1.2
    });

    // muzzle particles
    for (let i = 0; i < 4; i++) {
      const a = player.angle + (Math.random() - 0.5) * 0.6;
      const s = 120 + Math.random() * 80;
      particles.push({
        x: player.x + Math.cos(player.angle) * (player.r + 4),
        y: player.y + Math.sin(player.angle) * (player.r + 4),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25,
        maxLife: 0.25,
        color: "#ffd24a",
        r: 2
      });
    }
  }

  function spawnHitParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 120;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4,
        maxLife: 0.4,
        color,
        r: 2 + Math.random() * 2
      });
    }
  }

  // --- Update ---------------------------------------------------------------
  function update(dt, now) {
    // Movement vector
    let mx = 0, my = 0;
    if (keys["w"] || keys["arrowup"]) my -= 1;
    if (keys["s"] || keys["arrowdown"]) my += 1;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    if (joystick.active) {
      mx = joystick.dx / joystick.max;
      my = joystick.dy / joystick.max;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    player.x += mx * player.speed * dt;
    player.y += my * player.speed * dt;
    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(H - player.r, player.y));

    // Aim
    if (isTouch) {
      if (joystick.active && (Math.abs(joystick.dx) > 2 || Math.abs(joystick.dy) > 2)) {
        player.angle = Math.atan2(joystick.dy, joystick.dx);
      }
    } else {
      player.angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    }

    // Shoot
    const wantShoot = (!isTouch && mouseDown) || (isTouch && shootTouch.active);
    if (wantShoot) tryShoot(now);

    // Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        bullets.splice(i, 1);
      }
    }

    // Zombies
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      const dx = player.x - z.x;
      const dy = player.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      z.x += (dx / d) * z.speed * dt;
      z.y += (dy / d) * z.speed * dt;
      if (z.hitFlash > 0) z.hitFlash -= dt;

      // Damage to player on contact (damage over time)
      if (d < z.r + player.r) {
        player.health -= z.damage * dt;
        player.hitFlash = 0.15;
        screenFlash = Math.min(1, screenFlash + 0.6 * dt);
        if (player.health <= 0) {
          player.health = 0;
          endGame();
          return;
        }
      }

      // Bullet collisions
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const bdx = b.x - z.x;
        const bdy = b.y - z.y;
        if (bdx * bdx + bdy * bdy < (z.r + b.r) * (z.r + b.r)) {
          bullets.splice(j, 1);
          z.hp -= 1;
          z.hitFlash = 0.1;
          spawnHitParticles(b.x, b.y, z.color);
          if (z.hp <= 0) {
            zombies.splice(i, 1);
            score += 1;
            zombiesKilled += 1;
            spawnHitParticles(z.x, z.y, z.color);
            if (zombiesKilled % 10 === 0) {
              wave += 1;
              spawnInterval = Math.max(0.35, spawnInterval * 0.88);
            }
            updateHUD();
          }
          break;
        }
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Spawn
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      const count = 1 + Math.floor(wave / 4);
      for (let i = 0; i < count; i++) spawnZombie();
    }

    // Flash decay
    if (player.hitFlash > 0) player.hitFlash -= dt;
    if (screenFlash > 0) screenFlash = Math.max(0, screenFlash - dt * 2);

    updateHUD();
  }

  // --- Render ---------------------------------------------------------------
  function render() {
    // BG
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const gs = 40;
    ctx.beginPath();
    for (let x = 0; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Particles
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bullets
    ctx.fillStyle = "#ffd24a";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Zombies
    for (const z of zombies) {
      ctx.fillStyle = z.hitFlash > 0 ? "#ffffff" : z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      // eye
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // hp pip if tank
      if (z.maxHp > 1) {
        const hpPct = z.hp / z.maxHp;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(z.x - z.r, z.y - z.r - 8, z.r * 2, 4);
        ctx.fillStyle = "#3ddc84";
        ctx.fillRect(z.x - z.r, z.y - z.r - 8, z.r * 2 * hpPct, 4);
      }
    }

    // Player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    // gun
    ctx.fillStyle = "#444";
    ctx.fillRect(player.r - 2, -3, 14, 6);
    // body
    ctx.fillStyle = player.hitFlash > 0 ? "#ffffff" : "#4ac1ff";
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Screen flash
    if (screenFlash > 0) {
      ctx.fillStyle = `rgba(255, 40, 40, ${screenFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // --- Loop -----------------------------------------------------------------
  function loop(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt, ts);
    render();
    requestAnimationFrame(loop);
  }

  function startGame() {
    resize();
    reset();
    startOverlay.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
    running = true;
    lastTime = 0;
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    finalScoreEl.textContent = score;
    finalWaveEl.textContent = wave;
    gameOverOverlay.classList.remove("hidden");
  }

  // --- Input: keyboard + mouse ---------------------------------------------
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouseDown = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouseDown = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- Input: touch ---------------------------------------------------------
  function joystickStart(e) {
    const t = e.changedTouches[0];
    const rect = joystickEl.getBoundingClientRect();
    joystick.active = true;
    joystick.id = t.identifier;
    joystick.baseX = rect.left + rect.width / 2;
    joystick.baseY = rect.top + rect.height / 2;
    joystick.dx = 0;
    joystick.dy = 0;
    updateStickVisual();
    e.preventDefault();
  }
  function joystickMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joystick.id) continue;
      let dx = t.clientX - joystick.baseX;
      let dy = t.clientY - joystick.baseY;
      const d = Math.hypot(dx, dy);
      if (d > joystick.max) {
        dx = (dx / d) * joystick.max;
        dy = (dy / d) * joystick.max;
      }
      joystick.dx = dx;
      joystick.dy = dy;
      updateStickVisual();
      e.preventDefault();
    }
  }
  function joystickEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joystick.id) continue;
      joystick.active = false;
      joystick.id = null;
      joystick.dx = 0;
      joystick.dy = 0;
      updateStickVisual();
    }
  }
  function updateStickVisual() {
    joystickStick.style.transform = `translate(calc(-50% + ${joystick.dx}px), calc(-50% + ${joystick.dy}px))`;
  }

  joystickEl.addEventListener("touchstart", joystickStart, { passive: false });
  joystickEl.addEventListener("touchmove", joystickMove, { passive: false });
  joystickEl.addEventListener("touchend", joystickEnd);
  joystickEl.addEventListener("touchcancel", joystickEnd);

  function shootStart(e) {
    const t = e.changedTouches[0];
    shootTouch.active = true;
    shootTouch.id = t.identifier;
    e.preventDefault();
  }
  function shootEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== shootTouch.id) continue;
      shootTouch.active = false;
      shootTouch.id = null;
    }
  }
  shootZone.addEventListener("touchstart", shootStart, { passive: false });
  shootZone.addEventListener("touchend", shootEnd);
  shootZone.addEventListener("touchcancel", shootEnd);

  // Prevent page scroll/zoom on canvas & document touches
  document.addEventListener("touchmove", (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  // --- Boot -----------------------------------------------------------------
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  resize();

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);

  // Draw static frame on menu
  (function idleRender() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);
  })();
})();
