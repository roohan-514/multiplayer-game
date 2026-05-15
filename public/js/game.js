// ═══════════════════════════════════════════════════════════════════════════
// Arena Deathmatch - Multiplayer FPS Game Client
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────
  const MOUSE_SENSITIVITY = 0.002;
  const MOVE_SPEED = 0.18;
  const PLAYER_HEIGHT = 1.7;
  const PLAYER_RADIUS = 0.4;
  const GRAVITY = 0.015;
  const JUMP_FORCE = 0.25;
  const MAX_AMMO = 30;
  const RESERVE_AMMO = 90;
  const RELOAD_TIME = 2000;
  const FIRE_RATE = 120; // ms between shots
  const KILL_LIMIT = 50;

  // ── State ───────────────────────────────────────────────────────────────
  let socket = null;
  let selectedMap = null;
  let myId = null;
  let matchId = null;
  let mapData = null;

  // Game state
  let scene, camera, renderer;
  let players = {};
  let wallMeshes = [];
  let wallColliders = [];

  // Player state
  let velocity = { x: 0, y: 0, z: 0 };
  let onGround = true;
  let ammo = MAX_AMMO;
  let reserve = RESERVE_AMMO;
  let isReloading = false;
  let reloadTimer = null;
  let lastFireTime = 0;
  let myKills = 0;
  let myDeaths = 0;
  let alive = true;

  // Input
  let keys = {};
  let mouseDown = false;
  let isPointerLocked = false;

  // Voice chat
  let localStream = null;
  let peerConnections = {};
  let voiceEnabled = false;

  // ── DOM References ──────────────────────────────────────────────────────
  const mainMenu = document.getElementById('mainMenu');
  const loadingScreen = document.getElementById('loadingScreen');
  const gameUI = document.getElementById('gameUI');
  const mvpScreen = document.getElementById('mvpScreen');
  const gameContainer = document.getElementById('gameContainer');
  const playerNameInput = document.getElementById('playerName');
  const mapSelect = document.getElementById('mapSelect');
  const playBtn = document.getElementById('playBtn');
  const healthBar = document.getElementById('healthBar');
  const healthText = document.getElementById('healthText');
  const ammoText = document.getElementById('ammoText');
  const killFeed = document.getElementById('killFeed');
  const scoreDisplay = document.getElementById('myKills');
  const killProgressBar = document.getElementById('killProgressBar');
  const killProgressText = document.getElementById('killProgressText');
  const scoreboard = document.getElementById('scoreboard');
  const scoreBody = document.getElementById('scoreBody');
  const hitMarker = document.getElementById('hitMarker');
  const damageOverlay = document.getElementById('damageOverlay');
  const killNotification = document.getElementById('killNotification');
  const deathScreen = document.getElementById('deathScreen');
  const voiceToggle = document.getElementById('voiceToggle');

  // ── Initialization ──────────────────────────────────────────────────────
  function init() {
    socket = io();

    socket.on('mapList', (maps) => {
      renderMapSelect(maps);
    });

    socket.on('activeMatches', () => {
      // Could show active matches in lobby
    });

    socket.on('matchJoined', handleMatchJoined);
    socket.on('matchStarted', handleMatchStarted);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('playerLeft', handlePlayerLeft);
    socket.on('playerMoved', handlePlayerMoved);
    socket.on('playerRespawned', handlePlayerRespawned);
    socket.on('shotFired', handleShotFired);
    socket.on('killFeed', handleKillFeed);
    socket.on('scoreUpdate', handleScoreUpdate);
    socket.on('botUpdate', handleBotUpdate);
    socket.on('matchEnded', handleMatchEnded);

    // Voice signaling
    socket.on('voiceOffer', handleVoiceOffer);
    socket.on('voiceAnswer', handleVoiceAnswer);
    socket.on('iceCandidate', handleIceCandidate);

    // UI events
    playBtn.addEventListener('click', joinMatch);
    playerNameInput.addEventListener('input', updatePlayBtn);
    voiceToggle.addEventListener('click', toggleVoice);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }

  // ── Menu ────────────────────────────────────────────────────────────────
  function renderMapSelect(maps) {
    const icons = { dust: '🏜️', warehouse: '🏭', compound: '🏗️' };
    mapSelect.innerHTML = maps.map(m => `
      <div class="map-card" data-map="${m.id}" onclick="selectMap('${m.id}')">
        <div class="map-icon">${icons[m.id] || '🗺️'}</div>
        <div class="map-name">${m.name}</div>
        <div class="map-desc">${m.description}</div>
      </div>
    `).join('');
  }

  window.selectMap = function (mapId) {
    selectedMap = mapId;
    document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.map-card[data-map="${mapId}"]`).classList.add('selected');
    updatePlayBtn();
  };

  function updatePlayBtn() {
    playBtn.disabled = !(selectedMap && playerNameInput.value.trim());
  }

  function joinMatch() {
    const name = playerNameInput.value.trim();
    if (!name || !selectedMap) return;

    showScreen(loadingScreen);
    document.getElementById('loadingText').textContent = 'Connecting to match...';

    socket.emit('joinMatch', { mapId: selectedMap, playerName: name });
  }

  function showScreen(screen) {
    [mainMenu, loadingScreen, gameUI, mvpScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ── Match Handlers ──────────────────────────────────────────────────────
  function handleMatchJoined(data) {
    myId = data.playerId;
    matchId = data.matchId;
    mapData = data.map;

    // Init 3D scene
    initScene(data.mapId, data.map);

    // Add existing players
    for (const p of data.players) {
      if (p.id !== myId) {
        addPlayerModel(p.id, p.name, p.isBot, p.position);
      } else {
        // Set our position
        camera.position.set(p.position.x, PLAYER_HEIGHT, p.position.z);
      }
    }

    showScreen(gameUI);

    // Request pointer lock
    setTimeout(() => {
      gameContainer.addEventListener('click', requestPointerLock);
      requestPointerLock();
    }, 500);

    // Start game loop
    gameLoop();
  }

  function handleMatchStarted() {
    // Match is now active
  }

  function handlePlayerJoined(data) {
    if (data.id !== myId) {
      addPlayerModel(data.id, data.name, data.isBot, data.position);
    }
  }

  function handlePlayerLeft(data) {
    removePlayerModel(data.id);
    // If voice connected, close that peer
    if (peerConnections[data.id]) {
      peerConnections[data.id].close();
      delete peerConnections[data.id];
    }
  }

  function handlePlayerMoved(data) {
    const p = players[data.id];
    if (p) {
      p.targetPos = data.position;
      p.targetRot = data.rotation;
    }
  }

  function handlePlayerRespawned(data) {
    if (data.playerId === myId) {
      alive = true;
      camera.position.set(data.position.x, PLAYER_HEIGHT, data.position.z);
      velocity = { x: 0, y: 0, z: 0 };
      updateHealth(100);
      deathScreen.classList.add('hidden');
    } else {
      const p = players[data.playerId];
      if (p) {
        p.mesh.visible = true;
        p.targetPos = data.position;
        p.mesh.position.set(data.position.x, data.position.y, data.position.z);
      }
    }
  }

  function handleShotFired(data) {
    // Muzzle flash / tracer visual
    createTracer(data.origin, data.direction);

    if (data.result.hit) {
      if (data.shooterId === myId) {
        showHitMarker(data.result.isHeadshot);
      }
      if (data.result.targetId === myId && !data.result.killed) {
        const currentHp = parseInt(healthText.textContent) - data.result.damage;
        updateHealth(Math.max(0, currentHp));
        showDamageOverlay();
      }
      if (data.result.killed && data.result.targetId === myId) {
        alive = false;
        updateHealth(0);
        deathScreen.classList.remove('hidden');
      }
      if (data.result.killed && data.result.targetId !== myId) {
        const p = players[data.result.targetId];
        if (p) p.mesh.visible = false;
      }
      if (data.result.killed && data.shooterId === myId) {
        showKillNotification(data.result.targetName, data.result.isHeadshot);
      }
    }
  }

  function handleKillFeed(data) {
    addKillFeedEntry(data.killer, data.victim, data.isHeadshot);
  }

  function handleScoreUpdate(scores) {
    updateScoreboard(scores);

    // Update my kills
    const me = scores.find(s => s.id === myId);
    if (me) {
      myKills = me.kills;
      myDeaths = me.deaths;
      scoreDisplay.textContent = myKills;
      killProgressBar.style.setProperty('--progress', (myKills / KILL_LIMIT * 100) + '%');
      killProgressText.textContent = `${myKills} / ${KILL_LIMIT}`;
    }

    // Find leader progress
    if (scores.length > 0) {
      const leader = scores[0];
      killProgressBar.style.setProperty('--progress', (leader.kills / KILL_LIMIT * 100) + '%');
      killProgressText.textContent = `${leader.name}: ${leader.kills} / ${KILL_LIMIT}`;
    }
  }

  function handleBotUpdate(botStates) {
    for (const [id, state] of Object.entries(botStates)) {
      const p = players[id];
      if (p) {
        p.targetPos = state.position;
        p.targetRot = state.rotation;
        if (!state.alive) {
          p.mesh.visible = false;
        } else {
          p.mesh.visible = true;
        }
      }
    }
  }

  function handleMatchEnded(data) {
    showScreen(mvpScreen);

    document.getElementById('winnerName').textContent = data.winner.name;
    document.getElementById('winnerKills').textContent = `${data.stats.find(s => s.id === data.winner.id)?.kills || 0} Kills`;

    document.getElementById('mvpName').textContent = data.mvp.name;
    document.getElementById('mvpStats').textContent =
      `${data.mvp.kills} Kills / ${data.mvp.deaths} Deaths / ${data.mvp.kd} K/D`;

    const tbody = document.getElementById('finalScoreBody');
    tbody.innerHTML = data.stats.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${s.name} ${s.isBot ? '🤖' : ''}</td>
        <td>${s.kills}</td>
        <td>${s.deaths}</td>
        <td>${s.kd}</td>
      </tr>
    `).join('');

    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  // ── Three.js Scene ──────────────────────────────────────────────────────
  function initScene(mapId, map) {
    scene = new THREE.Scene();

    // Sky color based on map
    const skyColors = {
      dust: 0x87CEEB,
      warehouse: 0x334455,
      compound: 0x556677
    };
    scene.background = new THREE.Color(skyColors[mapId] || 0x87CEEB);
    scene.fog = new THREE.Fog(scene.background, 40, 100);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, PLAYER_HEIGHT, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    gameContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -40;
    scene.add(dirLight);

    // Point lights for atmosphere
    if (mapId === 'warehouse') {
      for (let x = -15; x <= 15; x += 10) {
        const light = new THREE.PointLight(0xffaa44, 0.5, 15);
        light.position.set(x, 5, 0);
        scene.add(light);
      }
    }

    // Ground
    const groundColors = { dust: 0xC2A66B, warehouse: 0x555555, compound: 0x667744 };
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshLambertMaterial({ color: groundColors[mapId] || 0x888888 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Build walls
    const wallColor = mapId === 'dust' ? 0xD4A574 :
                     mapId === 'warehouse' ? 0x666677 : 0x778866;

    wallColliders = [];
    wallMeshes = [];

    if (map.walls) {
      for (const w of map.walls) {
        const geo = new THREE.BoxGeometry(w.w, w.h, w.d);
        const mat = new THREE.MeshLambertMaterial({ color: wallColor });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(w.x, w.y, w.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        wallMeshes.push(mesh);
        wallColliders.push(w);
      }
    }

    // Build boxes/crates
    if (map.boxes) {
      for (const b of map.boxes) {
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
        const mat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        wallMeshes.push(mesh);
        wallColliders.push(b);
      }
    }

    // Decorative elements
    addMapDecorations(mapId);

    // Handle resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function addMapDecorations(mapId) {
    // Add barrels
    const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1, 8);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const barrelPositions = [
      { x: -5, z: -5 }, { x: 12, z: 3 }, { x: -18, z: 12 },
      { x: 7, z: -18 }, { x: -3, z: 16 }
    ];
    for (const pos of barrelPositions) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(pos.x, 0.5, pos.z);
      barrel.castShadow = true;
      scene.add(barrel);
    }

    // Add some visual poles/pillars
    if (mapId === 'warehouse') {
      const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 6, 8);
      const pillarMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      for (let x = -20; x <= 20; x += 10) {
        for (let z = -20; z <= 20; z += 20) {
          const pillar = new THREE.Mesh(pillarGeo, pillarMat);
          pillar.position.set(x, 3, z);
          scene.add(pillar);
        }
      }
    }
  }

  // ── Player Models ───────────────────────────────────────────────────────
  function addPlayerModel(id, name, isBot, position) {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.0, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({
      color: isBot ? 0x884444 : 0x4488aa
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const headMat = new THREE.MeshLambertMaterial({
      color: isBot ? 0xaa6666 : 0x66aacc
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333344 });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.15, 0.2, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.15, 0.2, 0);
    group.add(rightLeg);

    // Gun
    const gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.3, 1.0, -0.3);
    group.add(gun);

    // Name tag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = isBot ? '#ff8888' : '#88ccff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.2;
    sprite.scale.set(2, 0.5, 1);
    group.add(sprite);

    group.position.set(position.x, position.y || 0, position.z);
    scene.add(group);

    players[id] = {
      mesh: group,
      name,
      isBot,
      targetPos: position,
      targetRot: { x: 0, y: 0 },
      hp: 100,
      alive: true
    };
  }

  function removePlayerModel(id) {
    const p = players[id];
    if (p) {
      scene.remove(p.mesh);
      delete players[id];
    }
  }

  // ── Input Handling ──────────────────────────────────────────────────────
  function requestPointerLock() {
    gameContainer.requestPointerLock();
  }

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = !!document.pointerLockElement;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPointerLocked || !camera) return;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * MOUSE_SENSITIVITY;
    euler.x -= e.movementY * MOUSE_SENSITIVITY;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    camera.quaternion.setFromEuler(euler);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouseDown = true;
      if (!isPointerLocked) requestPointerLock();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });

  function onKeyDown(e) {
    keys[e.code] = true;

    // Tab - scoreboard
    if (e.code === 'Tab') {
      e.preventDefault();
      scoreboard.classList.remove('hidden');
    }

    // R - reload
    if (e.code === 'KeyR' && !isReloading) {
      startReload();
    }

    // V - voice toggle
    if (e.code === 'KeyV') {
      toggleVoice();
    }

    // Escape - release pointer
    if (e.code === 'Escape') {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;

    if (e.code === 'Tab') {
      scoreboard.classList.add('hidden');
    }
  }

  // ── Shooting ────────────────────────────────────────────────────────────
  function tryShoot() {
    if (!alive || isReloading || ammo <= 0) return;

    const now = Date.now();
    if (now - lastFireTime < FIRE_RATE) return;
    lastFireTime = now;

    ammo--;
    updateAmmoDisplay();

    // Get shoot direction from camera
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);

    const origin = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z
    };

    socket.emit('shoot', {
      origin,
      direction: { x: direction.x, y: direction.y, z: direction.z }
    });

    // Visual recoil
    camera.rotation.x -= 0.01;

    // Muzzle flash at camera
    createMuzzleFlash();

    // Auto reload when empty
    if (ammo <= 0 && reserve > 0) {
      startReload();
    }
  }

  function startReload() {
    if (isReloading || reserve <= 0 || ammo === MAX_AMMO) return;
    isReloading = true;
    ammoText.textContent = 'Reloading...';

    reloadTimer = setTimeout(() => {
      const needed = MAX_AMMO - ammo;
      const toReload = Math.min(needed, reserve);
      ammo += toReload;
      reserve -= toReload;
      isReloading = false;
      updateAmmoDisplay();
    }, RELOAD_TIME);
  }

  function updateAmmoDisplay() {
    ammoText.textContent = `${ammo} / ${reserve}`;
  }

  // ── Visual Effects ──────────────────────────────────────────────────────
  function createTracer(origin, direction) {
    const geo = new THREE.BufferGeometry();
    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const end = new THREE.Vector3(
      origin.x + direction.x * 50,
      origin.y + direction.y * 50,
      origin.z + direction.z * 50
    );
    geo.setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    setTimeout(() => scene.remove(line), 80);
  }

  function createMuzzleFlash() {
    const flashGeo = new THREE.SphereGeometry(0.08, 4, 4);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const flash = new THREE.Mesh(flashGeo, flashMat);

    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    flash.position.copy(camera.position).add(dir.multiplyScalar(0.5));
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 50);
  }

  function showHitMarker(headshot) {
    hitMarker.classList.remove('hidden', 'headshot');
    if (headshot) hitMarker.classList.add('headshot');
    hitMarker.style.display = 'block';
    setTimeout(() => {
      hitMarker.style.display = 'none';
      hitMarker.classList.add('hidden');
    }, 200);
  }

  function showDamageOverlay() {
    damageOverlay.classList.add('hit');
    setTimeout(() => damageOverlay.classList.remove('hit'), 300);
  }

  function showKillNotification(victimName, headshot) {
    killNotification.textContent = headshot ?
      `HEADSHOT! Eliminated ${victimName}` :
      `Eliminated ${victimName}`;
    killNotification.classList.remove('hidden');
    killNotification.style.animation = 'none';
    killNotification.offsetHeight; // reflow
    killNotification.style.animation = '';
    setTimeout(() => killNotification.classList.add('hidden'), 2000);
  }

  function addKillFeedEntry(killer, victim, headshot) {
    const entry = document.createElement('div');
    entry.className = 'kill-entry' + (headshot ? ' headshot' : '');
    entry.innerHTML = `<span class="killer">${killer}</span> ${headshot ? '💀' : '⚔'} <span class="victim">${victim}</span>`;
    killFeed.prepend(entry);

    // Remove old entries
    while (killFeed.children.length > 5) {
      killFeed.removeChild(killFeed.lastChild);
    }

    // Auto fade
    setTimeout(() => {
      entry.style.opacity = '0';
      entry.style.transition = 'opacity 0.5s';
      setTimeout(() => entry.remove(), 500);
    }, 5000);
  }

  function updateHealth(hp) {
    healthBar.style.width = hp + '%';
    healthText.textContent = hp;
    if (hp > 60) {
      healthBar.style.background = 'linear-gradient(90deg, #00ff88, #00cc66)';
    } else if (hp > 30) {
      healthBar.style.background = 'linear-gradient(90deg, #ffaa00, #ff8800)';
    } else {
      healthBar.style.background = 'linear-gradient(90deg, #ff4444, #cc0000)';
    }
  }

  function updateScoreboard(scores) {
    scoreBody.innerHTML = scores.map((s, i) => {
      const kd = s.deaths > 0 ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
      const cls = s.id === myId ? 'self' : (s.isBot ? 'bot' : '');
      return `<tr class="${cls}">
        <td>${i + 1}</td>
        <td>${s.name} ${s.isBot ? '🤖' : ''}</td>
        <td>${s.kills}</td>
        <td>${s.deaths}</td>
        <td>${kd}</td>
      </tr>`;
    }).join('');
  }

  // ── Collision ───────────────────────────────────────────────────────────
  function checkCollision(newPos) {
    // Map bounds
    const bounds = 28;
    if (Math.abs(newPos.x) > bounds || Math.abs(newPos.z) > bounds) return true;

    // Wall collisions
    for (const w of wallColliders) {
      const halfW = w.w / 2 + PLAYER_RADIUS;
      const halfD = w.d / 2 + PLAYER_RADIUS;
      if (newPos.x >= w.x - halfW && newPos.x <= w.x + halfW &&
          newPos.z >= w.z - halfD && newPos.z <= w.z + halfD &&
          newPos.y < (w.y || 0) + (w.h || 0) / 2) {
        return true;
      }
    }
    return false;
  }

  // ── Movement ────────────────────────────────────────────────────────────
  function updateMovement() {
    if (!alive || !camera) return;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    let moveX = 0, moveZ = 0;
    if (keys['KeyW']) { moveX += forward.x; moveZ += forward.z; }
    if (keys['KeyS']) { moveX -= forward.x; moveZ -= forward.z; }
    if (keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
    if (keys['KeyD']) { moveX += right.x; moveZ += right.z; }

    // Normalize diagonal movement
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * MOVE_SPEED;
      moveZ = (moveZ / len) * MOVE_SPEED;
    }

    // Jump
    if (keys['Space'] && onGround) {
      velocity.y = JUMP_FORCE;
      onGround = false;
    }

    // Gravity
    velocity.y -= GRAVITY;

    // Check horizontal collision
    const newPosX = { x: camera.position.x + moveX, y: camera.position.y, z: camera.position.z };
    const newPosZ = { x: camera.position.x, y: camera.position.y, z: camera.position.z + moveZ };

    if (!checkCollision(newPosX)) {
      camera.position.x += moveX;
    }
    if (!checkCollision(newPosZ)) {
      camera.position.z += moveZ;
    }

    // Vertical
    camera.position.y += velocity.y;
    if (camera.position.y <= PLAYER_HEIGHT) {
      camera.position.y = PLAYER_HEIGHT;
      velocity.y = 0;
      onGround = true;
    }

    // Shooting
    if (mouseDown) {
      tryShoot();
    }

    // Send position to server
    if (socket && matchId) {
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(camera.quaternion);
      socket.emit('playerMove', {
        position: {
          x: camera.position.x,
          y: camera.position.y - PLAYER_HEIGHT + 1,
          z: camera.position.z
        },
        rotation: { x: euler.x, y: euler.y }
      });
    }
  }

  // ── Interpolation ──────────────────────────────────────────────────────
  function interpolatePlayers() {
    for (const [id, p] of Object.entries(players)) {
      if (!p.mesh || !p.targetPos) continue;

      // Smooth position interpolation
      p.mesh.position.x += (p.targetPos.x - p.mesh.position.x) * 0.15;
      p.mesh.position.y += ((p.targetPos.y || 0) - p.mesh.position.y) * 0.15;
      p.mesh.position.z += (p.targetPos.z - p.mesh.position.z) * 0.15;

      // Rotation
      if (p.targetRot) {
        p.mesh.rotation.y = p.targetRot.y || 0;
      }
    }
  }

  // ── Game Loop ───────────────────────────────────────────────────────────
  function gameLoop() {
    requestAnimationFrame(gameLoop);
    updateMovement();
    interpolatePlayers();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ── Voice Chat ──────────────────────────────────────────────────────────
  async function toggleVoice() {
    if (voiceEnabled) {
      disableVoice();
    } else {
      await enableVoice();
    }
  }

  async function enableVoice() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceEnabled = true;
      voiceToggle.classList.add('active');
      voiceToggle.classList.remove('muted');
      document.getElementById('voiceIcon').textContent = '🎤';

      // Create peer connections for all players in match
      for (const id of Object.keys(players)) {
        if (!players[id].isBot) {
          createPeerConnection(id, true);
        }
      }
    } catch (err) {
      console.error('Voice chat error:', err);
      voiceToggle.classList.add('muted');
      document.getElementById('voiceIcon').textContent = '🔇';
    }
  }

  function disableVoice() {
    voiceEnabled = false;
    voiceToggle.classList.remove('active');
    voiceToggle.classList.add('muted');
    document.getElementById('voiceIcon').textContent = '🔇';

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    for (const [id, pc] of Object.entries(peerConnections)) {
      pc.close();
    }
    peerConnections = {};
  }

  function createPeerConnection(targetId, initiator) {
    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    const pc = new RTCPeerConnection(config);
    peerConnections[targetId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();

      // Show speaker indicator
      const indicator = document.createElement('div');
      indicator.className = 'speaker-indicator';
      indicator.id = `speaker-${targetId}`;
      indicator.textContent = players[targetId]?.name || 'Player';
      document.getElementById('voiceSpeakers').appendChild(indicator);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('iceCandidate', { targetId, candidate: event.candidate });
      }
    };

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('voiceOffer', { targetId, offer });
      });
    }

    return pc;
  }

  function handleVoiceOffer(data) {
    if (!voiceEnabled) return;
    const pc = createPeerConnection(data.senderId, false);
    pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    pc.createAnswer().then(answer => {
      pc.setLocalDescription(answer);
      socket.emit('voiceAnswer', { targetId: data.senderId, answer });
    });
  }

  function handleVoiceAnswer(data) {
    const pc = peerConnections[data.senderId];
    if (pc) {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }

  function handleIceCandidate(data) {
    const pc = peerConnections[data.senderId];
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  window.leaveMatch = function () {
    if (socket) {
      socket.emit('leaveMatch');
    }
    disableVoice();
    cleanupGame();
    showScreen(mainMenu);
  };

  window.backToMenu = function () {
    cleanupGame();
    showScreen(mainMenu);
  };

  function cleanupGame() {
    // Remove 3D scene
    if (renderer) {
      gameContainer.removeChild(renderer.domElement);
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    players = {};
    wallMeshes = [];
    wallColliders = [];
    myKills = 0;
    myDeaths = 0;
    ammo = MAX_AMMO;
    reserve = RESERVE_AMMO;
    isReloading = false;
    alive = true;
    matchId = null;
    keys = {};
    mouseDown = false;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  // ── Start ───────────────────────────────────────────────────────────────
  init();
})();
