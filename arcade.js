(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const dialog = $("bonus-dialog");
  const canvas = $("bonus-canvas");
  const ctx = canvas.getContext("2d");
  const controls = [...dialog.querySelectorAll("[data-game-control]")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const height = 360;
  const gravity = 1500;
  const speed = 250;
  const jumpSpeed = 650;
  const playerWidth = 26;
  const playerHeight = 32;
  const layouts = [
    [[0, 270, 160], [240, 250, 110], [440, 220, 110], [640, 250, 110], [840, 215, 110], [1040, 245, 110], [1240, 215, 110], [1440, 245, 110], [1640, 240, 180]],
    [[0, 270, 155], [260, 235, 105], [470, 205, 105], [680, 250, 105], [890, 210, 105], [1100, 240, 105], [1310, 205, 105], [1520, 245, 105], [1730, 220, 180]],
    [[0, 270, 150], [260, 240, 95], [470, 205, 95], [680, 250, 95], [890, 205, 95], [1100, 245, 95], [1310, 205, 95], [1520, 245, 95], [1730, 220, 180]]
  ];
  const palettes = [
    { sky: "#111e31", horizon: "#27355b", accent: "#8ce2eb", node: "#37577b", line: "#6588a9" },
    { sky: "#201a35", horizon: "#493c67", accent: "#d0b1fa", node: "#584878", line: "#927aa9" },
    { sky: "#211c2b", horizon: "#594443", accent: "#f6d78e", node: "#715552", line: "#b49582" }
  ];
  const game = {
    phase: "ready", layer: 0, score: 0, lives: 3, platforms: [], visited: new Set(),
    checkpoint: 0, player: null, camera: 0, worldWidth: 0, animationTime: 0, layerTime: 0,
    pickups: [], effects: [], collectiblePoints: 0,
    frame: null, lastFrame: null, jumpBuffer: 0, coyote: 0,
    keys: new Set(), controlKeys: new Map(), pointers: new Map(),
    lastMouseDirection: 0, mouseAirDirection: 0
  };
  let viewWidth = 760;

  function updateHUD() {
    $("bonus-layer").textContent = `${game.layer + 1} / ${layouts.length}`;
    $("bonus-score").textContent = game.score.toLocaleString("en-US");
    $("bonus-lives").textContent = game.lives;
    const progress = game.collectiblePoints % 100;
    $("bonus-life-progress").textContent = `${progress} / 100`;
    $("bonus-life-meter").value = progress;
    $("bonus-life-meter").setAttribute("aria-valuetext", `${progress} of 100 collectible points toward the next extra life. ${game.collectiblePoints} collected this run.`);
    const active = game.phase === "running";
    controls.forEach(button => { button.disabled = !active; });
    $("bonus-pause").disabled = !active && game.phase !== "paused";
    $("bonus-pause").textContent = game.phase === "paused" ? "Resume" : "Pause";
  }
  function announce(message) {
    $("bonus-feedback").textContent = message;
  }
  function clearInputs() {
    game.keys.clear();
    game.controlKeys.clear();
    game.pointers.clear();
    game.jumpBuffer = 0;
    game.lastMouseDirection = 0;
    game.mouseAirDirection = 0;
    controls.forEach(button => button.classList.remove("is-held"));
  }
  function resizeCanvas() {
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const newWidth = width < 500 && window.innerHeight > 500 ? 420 : 760;
    if (canvas.width !== newWidth || canvas.height !== height) {
      viewWidth = newWidth;
      canvas.width = viewWidth;
      canvas.height = height;
      updateCamera();
    }
    draw();
  }
  function updateCamera() {
    if (!game.player) return;
    game.camera = Math.max(0, Math.min(game.worldWidth - viewWidth, game.player.x - viewWidth * .38));
  }
  function loadLayer(index) {
    game.layer = index;
    game.layerTime = 0;
    game.effects = [];
    game.platforms = layouts[index].map(([x, y, width], i, platforms) => {
      const moving = i > 0 && i < platforms.length - 1;
      return {
        x, y, width, baseX: x, baseY: y, previousX: x, previousY: y, dx: 0, dy: 0,
        driftX: moving ? 12 + index * 4 + i % 2 * 3 : 0,
        driftY: moving ? 9 + index * 3 + i % 3 * 2 : 0,
        rate: .7 + index * .12 + i % 3 * .07,
        phase: i * 1.1 + index * .6
      };
    });
    movePlatforms();
    game.pickups = game.platforms.slice(1).flatMap((platform, i) => [
      { kind: "token", value: 10, platform: i + 1, fraction: .3, phase: i * 1.7, collected: false },
      { kind: "token", value: 10, platform: i + 1, fraction: .62, phase: i * 1.7 + 1, collected: false },
      { kind: "vector", value: 25, platform: i + 1, phase: i * 1.7 + 2, collected: false }
    ]);
    movePickups();
    game.worldWidth = game.platforms[game.platforms.length - 1].x + game.platforms[game.platforms.length - 1].width;
    game.checkpoint = 0;
    game.visited = new Set([0]);
    game.player = { x: 52, y: game.platforms[0].y - playerHeight, vy: 0, grounded: true, platform: 0, facing: 1, moving: false };
    game.coyote = .1;
    game.jumpBuffer = 0;
    game.camera = 0;
    updateHUD();
  }
  function movePlatforms() {
    game.platforms.forEach(platform => {
      platform.previousX = platform.x;
      platform.previousY = platform.y;
      platform.x = platform.baseX + Math.sin(game.layerTime * platform.rate + platform.phase) * platform.driftX;
      platform.y = platform.baseY + Math.sin(game.layerTime * platform.rate * .8 + platform.phase * 1.2) * platform.driftY;
      platform.dx = platform.x - platform.previousX;
      platform.dy = platform.y - platform.previousY;
    });
  }
  function movePickups() {
    game.pickups.forEach(pickup => {
      if (pickup.collected) return;
      const platform = game.platforms[pickup.platform];
      const bob = motion.matches ? 0 : Math.sin(game.layerTime * 1.7 + pickup.phase) * 7;
      const sway = motion.matches ? 0 : Math.sin(game.layerTime * 1.3 + pickup.phase) * 6;
      if (pickup.kind === "vector") {
        pickup.x = platform.x + platform.width * .45 + sway;
        pickup.y = platform.y - 73 + bob;
      } else {
        const previous = game.platforms[pickup.platform - 1];
        const from = previous.x + previous.width - 45 + playerWidth / 2;
        const to = platform.x + 25 + playerWidth / 2;
        const t = pickup.fraction;
        pickup.x = from + (to - from) * t + sway;
        pickup.y = previous.y + (platform.y - previous.y) * t - playerHeight / 2 - 4 * 138 * t * (1 - t) + bob;
      }
    });
  }
  function collectPickups() {
    const player = game.player;
    game.pickups.forEach(pickup => {
      if (pickup.collected) return;
      const dx = Math.max(player.x - pickup.x, 0, pickup.x - player.x - playerWidth);
      const dy = Math.max(player.y - pickup.y, 0, pickup.y - player.y - playerHeight);
      const radius = pickup.kind === "token" ? 11 : 12;
      if (dx * dx + dy * dy > radius * radius) return;
      pickup.collected = true;
      const previousLivesEarned = Math.floor(game.collectiblePoints / 100);
      game.collectiblePoints += pickup.value;
      game.score += pickup.value;
      const extraLives = Math.floor(game.collectiblePoints / 100) - previousLivesEarned;
      game.lives += extraLives;
      game.effects.push({ x: pickup.x, y: pickup.y, text: `+${pickup.value}`, color: pickup.kind === "token" ? "#ffe0a0" : "#b9e8ff", life: 1 });
      if (extraLives) game.effects.push({ x: player.x + playerWidth / 2, y: player.y - 20, text: "+1 LIFE", color: "#b4f1c7", life: 1.4 });
      updateHUD();
      announce(extraLives ? "100 collectible points! One extra life earned." : `${pickup.kind === "token" ? "AI token" : "Vector"} collected. +${pickup.value} bonus points.`);
    });
  }
  function clearFrame() {
    if (game.frame !== null) cancelAnimationFrame(game.frame);
    game.frame = null;
    game.lastFrame = null;
  }
  function showOverlay(title, copy, button) {
    $("bonus-overlay-title").textContent = title;
    $("bonus-overlay-copy").textContent = copy;
    $("bonus-start").textContent = button;
    $("bonus-overlay").hidden = false;
  }
  function prepare() {
    clearFrame();
    clearInputs();
    game.phase = "ready";
    game.score = 0;
    game.lives = 3;
    game.collectiblePoints = 0;
    game.animationTime = 0;
    loadLayer(0);
    showOverlay("Robot, ready?", "Ride moving neurons. Collect tokens and vectors to earn extra lives.", "Start game");
    announce("Ready when you are.");
    updateHUD();
  }
  function start() {
    prepare();
    game.phase = "running";
    $("bonus-overlay").hidden = true;
    announce("Layer 1 of 3. Jump to the first neuron.");
    updateHUD();
    canvas.focus({ preventScroll: true });
    game.frame = requestAnimationFrame(frame);
  }
  function pause() {
    if (game.phase !== "running") return;
    game.phase = "paused";
    clearFrame();
    clearInputs();
    updateHUD();
    announce("Paused. Select Resume to continue.");
    draw();
  }
  function resume() {
    if (game.phase !== "paused") return;
    game.phase = "running";
    game.lastFrame = null;
    updateHUD();
    announce(`Layer ${game.layer + 1} of ${layouts.length}. Keep going.`);
    canvas.focus({ preventScroll: true });
    game.frame = requestAnimationFrame(frame);
  }
  function endGame(won) {
    game.phase = won ? "won" : "lost";
    clearFrame();
    clearInputs();
    updateHUD();
    const message = won
      ? `You completed all ${layouts.length} layers and earned ${game.score.toLocaleString("en-US")} bonus points.`
      : `Out of lives. You earned ${game.score.toLocaleString("en-US")} bonus points.`;
    showOverlay(won ? "Signal delivered!" : "Try another run?", message, "Play again");
    announce(message);
    draw();
    $("bonus-start").focus({ preventScroll: true });
  }
  function moveDirection() {
    const actions = [...game.pointers.values(), ...game.controlKeys.values()];
    const left = game.keys.has("ArrowLeft") || game.keys.has("KeyA") || actions.includes("left");
    const right = game.keys.has("ArrowRight") || game.keys.has("KeyD") || actions.includes("right");
    const direction = Number(right) - Number(left);
    if (left || right) return direction;
    return (!game.player.grounded || game.jumpBuffer > 0) ? game.mouseAirDirection : 0;
  }
  function landOn(index) {
    game.mouseAirDirection = 0;
    if (index > game.checkpoint) game.checkpoint = index;
    if (!game.visited.has(index)) {
      game.visited.add(index);
      game.score += 100;
      updateHUD();
      announce(`Layer ${game.layer + 1}: neuron ${index} of ${game.platforms.length - 1} reached. Checkpoint saved.`);
    }
  }
  function fall() {
    game.lives--;
    clearInputs();
    updateHUD();
    if (game.lives === 0) {
      endGame(false);
      return;
    }
    const checkpoint = game.platforms[game.checkpoint];
    game.player.x = checkpoint.x + Math.min(35, checkpoint.width - playerWidth);
    game.player.y = checkpoint.y - playerHeight;
    game.player.vy = 0;
    game.player.grounded = true;
    game.player.platform = game.checkpoint;
    game.player.moving = false;
    game.coyote = .1;
    game.jumpBuffer = 0;
    updateCamera();
    announce(`You fell. ${game.lives} ${game.lives === 1 ? "life" : "lives"} left. Back at the last checkpoint.`);
  }
  function advanceLayer() {
    game.score += 250;
    if (game.layer === layouts.length - 1) {
      endGame(true);
      return;
    }
    loadLayer(game.layer + 1);
    announce(`Gate reached! Layer ${game.layer + 1} of ${layouts.length}.`);
  }
  function update(dt) {
    game.layerTime += dt;
    game.animationTime += dt;
    game.effects = game.effects.filter(effect => {
      effect.life -= dt;
      if (!motion.matches) effect.y -= 24 * dt;
      return effect.life > 0;
    });
    movePlatforms();
    movePickups();
    const player = game.player;
    const previousBottom = player.y + playerHeight;
    const support = player.grounded && player.platform !== null ? game.platforms[player.platform] : null;
    if (support) {
      player.x += support.dx;
      player.y += support.dy;
    }
    const direction = moveDirection();
    if (direction) player.facing = direction;
    player.moving = direction !== 0;
    player.x = Math.max(0, Math.min(game.worldWidth - playerWidth, player.x + direction * speed * dt));
    game.jumpBuffer = Math.max(0, game.jumpBuffer - dt);
    if (game.jumpBuffer > 0 && (player.grounded || game.coyote > 0)) {
      player.vy = -jumpSpeed;
      player.grounded = false;
      game.coyote = 0;
      game.jumpBuffer = 0;
    }
    if (player.grounded && support && player.x + playerWidth > support.x && player.x < support.x + support.width) {
      player.y = support.y - playerHeight;
      player.vy = 0;
    } else {
      player.vy += gravity * dt;
      player.y += player.vy * dt;
      player.grounded = false;
      player.platform = null;
      for (let i = 0; i < game.platforms.length; i++) {
        const platform = game.platforms[i];
        // Cross the moving surface in relative coordinates, not its old world position.
        if (previousBottom <= platform.previousY + .01 && player.y + playerHeight >= platform.y &&
            player.x + playerWidth > platform.x && player.x < platform.x + platform.width) {
          player.y = platform.y - playerHeight;
          player.vy = 0;
          player.grounded = true;
          player.platform = i;
          landOn(i);
          break;
        }
      }
    }
    game.coyote = player.grounded ? .1 : Math.max(0, game.coyote - dt);
    if (player.y > height + 40) {
      fall();
      return;
    }
    collectPickups();
    const finalPlatform = game.platforms[game.platforms.length - 1];
    const gateX = finalPlatform.x + finalPlatform.width - 55;
    if (player.grounded && player.platform === game.platforms.length - 1 &&
        player.x + playerWidth / 2 >= gateX - 18) {
      advanceLayer();
      return;
    }
    updateCamera();
  }
  function frame(timestamp) {
    game.frame = null;
    if (game.phase !== "running") return;
    const dt = game.lastFrame === null ? 0 : Math.min((timestamp - game.lastFrame) / 1000, .04);
    game.lastFrame = timestamp;
    for (let remaining = dt; remaining > 0 && game.phase === "running";) {
      const step = Math.min(remaining, 1 / 120);
      update(step);
      remaining -= step;
    }
    draw();
    if (game.phase === "running") game.frame = requestAnimationFrame(frame);
  }
  function drawBackground(palette) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.sky);
    sky.addColorStop(1, palette.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewWidth, height);
    for (let i = 0; i < 48; i++) {
      const x = ((i * 197 + 31 - game.camera * .18) % (viewWidth + 60) + viewWidth + 60) % (viewWidth + 60) - 30;
      const y = 18 + (i * 67 % 200);
      ctx.globalAlpha = i % 4 === 0 ? .7 : .32;
      ctx.fillStyle = i % 5 === 0 ? palette.accent : "#dce8f6";
      ctx.fillRect(Math.round(x), y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff12";
    ctx.lineWidth = 1;
    for (let y = 45; y < height; y += 72) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewWidth, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffffff99";
    ctx.font = "600 10px sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillText(`LAYER 0${game.layer + 1}  /  03`, 20, 25);
    ctx.letterSpacing = "0px";
  }
  function drawConnections(palette) {
    for (let i = 0; i < game.platforms.length - 1; i++) {
      const a = game.platforms[i];
      const b = game.platforms[i + 1];
      const x1 = a.x + a.width / 2 - game.camera;
      const x2 = b.x + b.width / 2 - game.camera;
      if (x2 < -80 || x1 > viewWidth + 80) continue;
      const y1 = a.y + 25;
      const y2 = b.y + 25;
      const mid = (x1 + x2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2);
      ctx.strokeStyle = palette.line;
      ctx.globalAlpha = .45;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const t = motion.matches ? .5 : (game.animationTime * .35 + i * .29) % 1;
      const inv = 1 - t;
      const x = inv ** 3 * x1 + 3 * inv ** 2 * t * mid + 3 * inv * t ** 2 * mid + t ** 3 * x2;
      const y = inv ** 3 * y1 + 3 * inv ** 2 * t * y1 + 3 * inv * t ** 2 * y2 + t ** 3 * y2;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawPlatforms(palette) {
    game.platforms.forEach((platform, index) => {
      const x = platform.x - game.camera;
      if (x + platform.width < -40 || x > viewWidth + 40) return;
      const center = x + platform.width / 2;
      if (platform.driftX) {
        ctx.save();
        ctx.strokeStyle = palette.line;
        ctx.globalAlpha = .25;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.ellipse(platform.baseX + platform.width / 2 - game.camera, platform.baseY + 23, platform.driftX + 16, platform.driftY + 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.ellipse(center, platform.y + 23, Math.min(platform.width * .42, 58), 25, 0, 0, Math.PI * 2);
      ctx.fillStyle = palette.node;
      ctx.fill();
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = game.visited.has(index) ? .85 : .45;
      ctx.beginPath();
      ctx.arc(center, platform.y + 23, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.node;
      ctx.fillRect(x, platform.y, platform.width, 12);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(x, platform.y, platform.width, 4);
      ctx.fillStyle = "#ffffff77";
      ctx.fillRect(x + 5, platform.y + 2, Math.max(0, platform.width - 10), 1);
    });
  }
  function drawPickups() {
    game.pickups.forEach(pickup => {
      if (pickup.collected) return;
      const x = pickup.x - game.camera;
      if (x < -20 || x > viewWidth + 20) return;
      ctx.save();
      ctx.translate(x, pickup.y);
      ctx.shadowBlur = 12;
      if (pickup.kind === "token") {
        ctx.shadowColor = "#eac46f";
        ctx.fillStyle = "#eac46f";
        ctx.strokeStyle = "#fff0bc";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 3 * i - Math.PI / 6;
          const px = Math.cos(angle) * 9;
          const py = Math.sin(angle) * 9;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#332b1b";
        ctx.font = "800 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("T", 0, 3.5);
      } else {
        ctx.shadowColor = "#8cd9ff";
        ctx.fillStyle = "#1d3956";
        ctx.strokeStyle = "#9bdeff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(-5, 5);
        ctx.lineTo(5, -5);
        ctx.lineTo(0, -5);
        ctx.moveTo(5, -5);
        ctx.lineTo(5, 0);
        ctx.moveTo(-5, 5);
        ctx.lineTo(-5, -2);
        ctx.moveTo(-5, 5);
        ctx.lineTo(2, 5);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  function drawGate(palette) {
    const platform = game.platforms[game.platforms.length - 1];
    const x = platform.x + platform.width - 55 - game.camera;
    if (x < -40 || x > viewWidth + 40) return;
    const y = platform.y - 44;
    ctx.save();
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 18, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = palette.accent;
    ctx.font = "700 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(game.layer === layouts.length - 1 ? "FINISH" : "NEXT", x, y - 25);
    ctx.textAlign = "start";
  }
  function drawPlayer() {
    const player = game.player;
    const x = Math.round(player.x - game.camera);
    const y = Math.round(player.y);
    ctx.save();
    ctx.translate(x + playerWidth / 2, y);
    const stride = player.grounded && player.moving && !motion.matches ? Math.sin(game.animationTime * 17) : 0;
    ctx.fillStyle = "#dbeaf3";
    ctx.fillRect(-1, 2, 2, 4);
    ctx.fillStyle = "#f6d78e";
    ctx.fillRect(-3, 0, 6, 3);
    ctx.fillStyle = "#122132";
    ctx.fillRect(-12, 5, 24, 15);
    ctx.fillStyle = "#b9cddd";
    ctx.fillRect(-11, 6, 22, 12);
    ctx.fillRect(-13, 9, 2, 6);
    ctx.fillRect(11, 9, 2, 6);
    ctx.fillStyle = "#eff8ff";
    ctx.fillRect(-9, 5, 18, 2);
    ctx.fillStyle = "#173247";
    ctx.fillRect(-8, 8, 16, 8);
    ctx.fillStyle = "#8ff1f1";
    ctx.fillRect(-6 + player.facing, 10, 3, 3);
    ctx.fillRect(2 + player.facing, 10, 3, 3);
    ctx.fillStyle = "#7b98ae";
    ctx.fillRect(-3, 17, 6, 2);
    ctx.fillRect(-7, 20, 14, 8);
    ctx.fillRect(-12, 21 + stride, 4, 6);
    ctx.fillRect(8, 21 - stride, 4, 6);
    ctx.fillStyle = "#dbeaf3";
    ctx.fillRect(-6, 27, 3, 3);
    ctx.fillRect(3, 27, 3, 3);
    ctx.fillRect(-9, 30 + Math.max(0, stride), 8, 2);
    ctx.fillRect(1, 30 + Math.max(0, -stride), 8, 2);
    ctx.fillStyle = "#173247";
    ctx.fillRect(-5, 21, 10, 6);
    ctx.fillStyle = "#b4f1e7";
    ctx.font = "700 6px monospace";
    ctx.textAlign = "center";
    ctx.fillText("AI", 0, 26);
    ctx.restore();
  }
  function drawEffects() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "800 12px monospace";
    game.effects.forEach(effect => {
      ctx.globalAlpha = Math.min(1, effect.life * 3);
      ctx.fillStyle = effect.color;
      ctx.fillText(effect.text, effect.x - game.camera, effect.y);
    });
    ctx.restore();
  }
  function draw() {
    if (!ctx || !game.player) return;
    const palette = palettes[game.layer];
    ctx.clearRect(0, 0, viewWidth, height);
    drawBackground(palette);
    drawConnections(palette);
    drawPlatforms(palette);
    drawGate(palette);
    drawPickups();
    drawPlayer();
    drawEffects();
    if (game.phase === "paused") {
      ctx.fillStyle = "#10141dcc";
      ctx.fillRect(0, 0, viewWidth, height);
      ctx.fillStyle = "#fff";
      ctx.font = "700 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", viewWidth / 2, height / 2);
      ctx.textAlign = "start";
    }
  }
  function openBonus(startImmediately = false) {
    prepare();
    dialog.showModal();
    if (!ctx) {
      $("bonus-overlay-copy").textContent = "Your browser does not support canvas games.";
      $("bonus-start").disabled = true;
      console.error("AI Quiz could not initialize the bonus game: canvas is unavailable.");
    } else {
      resizeCanvas();
      if (startImmediately) start();
      else $("bonus-start").focus();
    }
  }
  $("bonus-open").addEventListener("click", () => openBonus());
  $("bonus-secret-open").addEventListener("click", () => openBonus(true));
  $("bonus-start").addEventListener("click", start);
  $("bonus-pause").addEventListener("click", () => {
    if (game.phase === "running") pause();
    else if (game.phase === "paused") resume();
  });
  dialog.addEventListener("keydown", (event) => {
    if (game.phase !== "running" || (event.target !== canvas && !event.target.matches("[data-game-control]"))) return;
    if (event.target.matches("[data-game-control]") && (event.code === "Space" || event.code === "Enter")) {
      event.preventDefault();
      if (!game.controlKeys.has(event.code)) {
        const action = event.target.dataset.gameControl;
        game.controlKeys.set(event.code, action);
        if (action === "jump") game.jumpBuffer = .12;
      }
      return;
    }
    const movement = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"];
    const jumping = ["Space", "ArrowUp", "KeyW"];
    if (!movement.includes(event.code) && !jumping.includes(event.code)) return;
    event.preventDefault();
    if (movement.includes(event.code)) game.keys.add(event.code);
    else if (!event.repeat) game.jumpBuffer = .12;
  });
  window.addEventListener("keyup", (event) => {
    game.keys.delete(event.code);
    if (game.controlKeys.has(event.code)) {
      event.preventDefault();
      game.controlKeys.delete(event.code);
    }
  });
  controls.forEach(button => {
    button.addEventListener("pointerdown", (event) => {
      if (game.phase !== "running") return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const action = button.dataset.gameControl;
      game.pointers.set(event.pointerId, action);
      button.classList.add("is-held");
      if (event.pointerType === "mouse" && action !== "jump") game.lastMouseDirection = action === "right" ? 1 : -1;
      if (action === "jump") {
        game.jumpBuffer = .12;
        if (event.pointerType === "mouse") game.mouseAirDirection = game.lastMouseDirection;
      }
    });
    const release = (event) => {
      game.pointers.delete(event.pointerId);
      if (![...game.pointers.values()].includes(button.dataset.gameControl)) button.classList.remove("is-held");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    clearFrame();
    clearInputs();
    game.phase = "ready";
    updateHUD();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("blur", pause);
  window.addEventListener("resize", () => {
    if (dialog.open) resizeCanvas();
  });
})();
