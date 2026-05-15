// ═══════════════════════════════════════════════════════════════════════════
// Arena Deathmatch - Multiplayer FPS Game Client (Optimized + Realistic)
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
  const FIRE_RATE = 120;
  const KILL_LIMIT = 50;
  const NET_SEND_INTERVAL = 50; // ms between position updates to server

  // ── State ───────────────────────────────────────────────────────────────
  let socket = null;
  let selectedMap = null;
  let myId = null;
  let matchId = null;
  let mapData = null;

  let scene, camera, renderer;
  let players = {};
  let wallMeshes = [];
  let wallColliders = [];

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
  let lastNetSend = 0;

  let keys = {};
  let mouseDown = false;
  let isPointerLocked = false;

  let localStream = null;
  let peerConnections = {};
  let voiceEnabled = false;

  // Texture cache
  let textureCache = {};

  // Gun model
  let gunModel = null;
  let gunRecoil = 0;

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

  // ── Procedural Textures ─────────────────────────────────────────────────
  function createCanvasTexture(width, height, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeBrickTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(0, 0, w, h);
      const brickH = 32, brickW = 64, mortarW = 3;
      for (let row = 0; row < h / brickH; row++) {
        const offset = (row % 2) * (brickW / 2);
        for (let col = -1; col < w / brickW + 1; col++) {
          const x = col * brickW + offset;
          const y = row * brickH;
          const r = 130 + Math.random() * 40;
          const g = 90 + Math.random() * 30;
          const b = 60 + Math.random() * 20;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + mortarW, y + mortarW, brickW - mortarW * 2, brickH - mortarW * 2);
          // Subtle noise
          for (let i = 0; i < 15; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
            ctx.fillRect(x + mortarW + Math.random() * (brickW - mortarW * 2),
              y + mortarW + Math.random() * (brickH - mortarW * 2), 3, 3);
          }
        }
      }
    });
  }

  function makeConcreteTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#707070';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        const v = 90 + Math.random() * 50;
        ctx.fillStyle = `rgba(${v},${v},${v},0.3)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
      // Cracks
      ctx.strokeStyle = 'rgba(50,50,50,0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        let cx = Math.random() * w, cy = Math.random() * h;
        ctx.moveTo(cx, cy);
        for (let j = 0; j < 8; j++) {
          cx += (Math.random() - 0.5) * 30;
          cy += (Math.random() - 0.5) * 30;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    });
  }

  function makeMetalTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#5a5a6a');
      grad.addColorStop(0.5, '#6a6a7a');
      grad.addColorStop(1, '#4a4a5a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Brushed metal lines
      for (let i = 0; i < 200; i++) {
        const y = Math.random() * h;
        ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + (Math.random() - 0.5) * 2);
        ctx.stroke();
      }
      // Scratches
      for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = `rgba(200,200,200,${0.1 + Math.random() * 0.1})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, Math.random() * h);
        ctx.lineTo(Math.random() * w, Math.random() * h);
        ctx.stroke();
      }
    });
  }

  function makeSandTexture() {
    return createCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#C8B078';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 10000; i++) {
        const r = 180 + Math.random() * 40;
        const g = 155 + Math.random() * 35;
        const b = 100 + Math.random() * 30;
        ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
        const s = 1 + Math.random() * 2;
        ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
      }
    });
  }

  function makeWoodTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        const v = Math.sin(y * 0.1) * 10 + Math.random() * 10;
        ctx.fillStyle = `rgb(${120 + v},${85 + v * 0.7},${20 + v * 0.3})`;
        ctx.fillRect(0, y, w, 2);
      }
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(60,40,10,${Math.random() * 0.15})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 4);
      }
    });
  }

  function makeGrassTexture() {
    return createCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#4a6b35';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8000; i++) {
        const r = 55 + Math.random() * 30;
        const g = 85 + Math.random() * 40;
        const b = 35 + Math.random() * 20;
        ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 6);
      }
    });
  }

  function makeFloorTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#555555';
      ctx.fillRect(0, 0, w, h);
      const tileSize = 64;
      for (let r = 0; r < h / tileSize; r++) {
        for (let c = 0; c < w / tileSize; c++) {
          const v = 70 + Math.random() * 20;
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(c * tileSize + 1, r * tileSize + 1, tileSize - 2, tileSize - 2);
        }
      }
    });
  }

  function getTexture(name) {
    if (textureCache[name]) return textureCache[name];
    const makers = {
      brick: makeBrickTexture,
      concrete: makeConcreteTexture,
      metal: makeMetalTexture,
      sand: makeSandTexture,
      wood: makeWoodTexture,
      grass: makeGrassTexture,
      floor: makeFloorTexture
    };
    const tex = makers[name] ? makers[name]() : makeConcreteTexture();
    textureCache[name] = tex;
    return tex;
  }

  // ── Initialization ──────────────────────────────────────────────────────
  function init() {
    socket = io();

    socket.on('mapList', (maps) => renderMapSelect(maps));
    socket.on('activeMatches', () => {});
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
    socket.on('voiceOffer', handleVoiceOffer);
    socket.on('voiceAnswer', handleVoiceAnswer);
    socket.on('iceCandidate', handleIceCandidate);

    playBtn.addEventListener('click', joinMatch);
    playerNameInput.addEventListener('input', updatePlayBtn);
    voiceToggle.addEventListener('click', toggleVoice);
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
    initScene(data.mapId, data.map);
    for (const p of data.players) {
      if (p.id !== myId) {
        addPlayerModel(p.id, p.name, p.isBot, p.position);
      } else {
        camera.position.set(p.position.x, PLAYER_HEIGHT, p.position.z);
      }
    }
    showScreen(gameUI);
    setTimeout(() => {
      gameContainer.addEventListener('click', requestPointerLock);
      requestPointerLock();
    }, 500);
    gameLoop();
  }

  function handleMatchStarted() {}

  function handlePlayerJoined(data) {
    if (data.id !== myId) addPlayerModel(data.id, data.name, data.isBot, data.position);
  }

  function handlePlayerLeft(data) {
    removePlayerModel(data.id);
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
    createTracer(data.origin, data.direction);
    if (data.result.hit) {
      if (data.shooterId === myId) showHitMarker(data.result.isHeadshot);
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
      // Impact particles
      if (data.result.hit && data.result.targetId) {
        const target = players[data.result.targetId];
        if (target && target.mesh) {
          createImpactParticles(target.mesh.position);
        }
      }
    }
  }

  function handleKillFeed(data) {
    addKillFeedEntry(data.killer, data.victim, data.isHeadshot);
  }

  function handleScoreUpdate(scores) {
    updateScoreboard(scores);
    const me = scores.find(s => s.id === myId);
    if (me) {
      myKills = me.kills;
      myDeaths = me.deaths;
      scoreDisplay.textContent = myKills;
    }
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
        p.mesh.visible = state.alive;
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
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ── Three.js Scene (Optimized + Realistic) ─────────────────────────────
  function initScene(mapId, map) {
    scene = new THREE.Scene();

    // Realistic sky gradients
    const skyColors = {
      dust: 0x87CEEB,
      warehouse: 0x1a1a2e,
      compound: 0x4a6741
    };
    scene.background = new THREE.Color(skyColors[mapId] || 0x87CEEB);
    scene.fog = new THREE.FogExp2(scene.background, 0.012);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);
    camera.position.set(0, PLAYER_HEIGHT, 0);

    // Optimized renderer
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputEncoding = THREE.sRGBEncoding;
    gameContainer.appendChild(renderer.domElement);

    // Hemisphere light for natural ambient
    const hemiLight = new THREE.HemisphereLight(
      mapId === 'dust' ? 0xffeebb : mapId === 'warehouse' ? 0x334466 : 0x88aa88,
      mapId === 'dust' ? 0x886633 : mapId === 'warehouse' ? 0x111122 : 0x445533,
      0.6
    );
    scene.add(hemiLight);

    // Directional sun/main light
    const dirLight = new THREE.DirectionalLight(
      mapId === 'dust' ? 0xfff0cc : mapId === 'warehouse' ? 0x8899bb : 0xddddcc,
      mapId === 'warehouse' ? 0.4 : 0.9
    );
    dirLight.position.set(15, 25, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 35;
    dirLight.shadow.camera.bottom = -35;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Map-specific lighting
    if (mapId === 'warehouse') {
      const colors = [0xffaa44, 0xff8833, 0xffcc55];
      for (let i = 0; i < 6; i++) {
        const light = new THREE.PointLight(colors[i % 3], 0.6, 12, 2);
        light.position.set(-15 + i * 6, 4.5, (i % 2 === 0 ? -5 : 5));
        scene.add(light);
      }
    } else if (mapId === 'dust') {
      const fillLight = new THREE.DirectionalLight(0xffcc88, 0.3);
      fillLight.position.set(-10, 15, -10);
      scene.add(fillLight);
    }

    // Ground with texture
    const groundTexName = mapId === 'dust' ? 'sand' : mapId === 'warehouse' ? 'floor' : 'grass';
    const groundTex = getTexture(groundTexName);
    groundTex.repeat.set(mapId === 'warehouse' ? 8 : 15, mapId === 'warehouse' ? 8 : 15);
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: mapId === 'warehouse' ? 0.7 : 0.9,
      metalness: mapId === 'warehouse' ? 0.1 : 0.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Build map structures
    wallColliders = [];
    wallMeshes = [];
    buildMapStructures(mapId, map);
    addMapDecorations(mapId);
    createGunModel();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function getWallMaterial(mapId, type) {
    if (type === 'outer') {
      if (mapId === 'dust') {
        const tex = getTexture('brick');
        tex.repeat.set(8, 2);
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
      } else if (mapId === 'warehouse') {
        const tex = getTexture('metal');
        tex.repeat.set(6, 2);
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.6 });
      } else {
        const tex = getTexture('concrete');
        tex.repeat.set(6, 2);
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1 });
      }
    } else if (type === 'inner') {
      if (mapId === 'dust') {
        const tex = getTexture('concrete');
        tex.repeat.set(2, 1);
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05, color: 0xccbb99 });
      } else if (mapId === 'warehouse') {
        return new THREE.MeshStandardMaterial({
          color: 0x445566,
          roughness: 0.3,
          metalness: 0.7,
          map: getTexture('metal')
        });
      } else {
        const tex = getTexture('concrete');
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1, color: 0x889977 });
      }
    } else if (type === 'crate') {
      const tex = getTexture('wood');
      tex.repeat.set(1, 1);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.0 });
    }
    return new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
  }

  function buildMapStructures(mapId, map) {
    // Shared materials for performance
    const outerMat = getWallMaterial(mapId, 'outer');
    const innerMat = getWallMaterial(mapId, 'inner');
    const crateMat = getWallMaterial(mapId, 'crate');

    if (map.walls) {
      for (let i = 0; i < map.walls.length; i++) {
        const w = map.walls[i];
        const geo = new THREE.BoxGeometry(w.w, w.h, w.d);
        const isOuter = i < 4;
        const mat = isOuter ? outerMat : innerMat;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(w.x, w.y, w.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        wallMeshes.push(mesh);
        wallColliders.push(w);

        // Add edge details to inner walls
        if (!isOuter && w.h >= 3) {
          addWallEdge(w);
        }
      }
    }

    if (map.boxes) {
      for (const b of map.boxes) {
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
        const mesh = new THREE.Mesh(geo, crateMat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        wallMeshes.push(mesh);
        wallColliders.push(b);
      }
    }
  }

  function addWallEdge(w) {
    const edgeGeo = new THREE.BoxGeometry(w.w + 0.1, 0.15, w.d + 0.1);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.3 });
    const topEdge = new THREE.Mesh(edgeGeo, edgeMat);
    topEdge.position.set(w.x, w.y + w.h / 2, w.z);
    scene.add(topEdge);
  }

  function addMapDecorations(mapId) {
    // Barrels with realistic material
    const barrelGeo = new THREE.CylinderGeometry(0.35, 0.38, 1, 12);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.6, metalness: 0.4 });
    const barrelPositions = [
      { x: -5, z: -5 }, { x: 12, z: 3 }, { x: -18, z: 12 },
      { x: 7, z: -18 }, { x: -3, z: 16 }, { x: 16, z: -12 },
      { x: -12, z: -18 }, { x: 22, z: 8 }
    ];
    for (const pos of barrelPositions) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(pos.x, 0.5, pos.z);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      scene.add(barrel);

      // Barrel ring details
      const ringGeo = new THREE.TorusGeometry(0.37, 0.02, 4, 12);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.7 });
      for (const ry of [0.15, 0.85]) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos.x, ry, pos.z);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
      }
    }

    // Warehouse-specific: support pillars, lights, pipes
    if (mapId === 'warehouse') {
      const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 6, 6);
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.3, metalness: 0.8 });
      for (let x = -20; x <= 20; x += 10) {
        for (let z = -20; z <= 20; z += 20) {
          const pillar = new THREE.Mesh(pillarGeo, pillarMat);
          pillar.position.set(x, 3, z);
          pillar.castShadow = true;
          scene.add(pillar);
        }
      }

      // Ceiling beams
      const beamGeo = new THREE.BoxGeometry(50, 0.3, 0.2);
      const beamMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.4, metalness: 0.6 });
      for (let z = -20; z <= 20; z += 8) {
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(0, 5.8, z);
        scene.add(beam);
      }

      // Industrial light fixtures
      const lightFixGeo = new THREE.ConeGeometry(0.4, 0.3, 6);
      const lightFixMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.5, metalness: 0.5 });
      for (let x = -12; x <= 12; x += 8) {
        const fix = new THREE.Mesh(lightFixGeo, lightFixMat);
        fix.position.set(x, 5.5, 0);
        fix.rotation.x = Math.PI;
        scene.add(fix);
      }
    }

    // Dust-specific: debris, rubble, sandbags
    if (mapId === 'dust') {
      // Rubble piles
      const rubbleGeo = new THREE.DodecahedronGeometry(0.3, 0);
      const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x998866, roughness: 0.95 });
      const rubblePositions = [
        { x: -7, z: -3 }, { x: 3, z: 8 }, { x: -16, z: -8 },
        { x: 12, z: -12 }, { x: -4, z: 22 }, { x: 18, z: 5 }
      ];
      for (const pos of rubblePositions) {
        for (let i = 0; i < 3 + Math.random() * 4; i++) {
          const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
          rubble.position.set(
            pos.x + (Math.random() - 0.5) * 2,
            0.15 + Math.random() * 0.2,
            pos.z + (Math.random() - 0.5) * 2
          );
          rubble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
          rubble.scale.setScalar(0.5 + Math.random() * 1.0);
          rubble.castShadow = true;
          scene.add(rubble);
        }
      }

      // Sandbag walls
      const sandbagGeo = new THREE.BoxGeometry(0.6, 0.3, 0.35);
      const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xAA9966, roughness: 0.95 });
      const sandbagPositions = [{ x: -12, z: 5 }, { x: 12, z: -3 }];
      for (const pos of sandbagPositions) {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++) {
            const sb = new THREE.Mesh(sandbagGeo, sandbagMat);
            sb.position.set(
              pos.x + col * 0.55 - 0.8 + (row % 2) * 0.27,
              0.15 + row * 0.28,
              pos.z
            );
            sb.castShadow = true;
            scene.add(sb);
          }
        }
      }
    }

    // Compound-specific: watchtower frames, fences
    if (mapId === 'compound') {
      // Wire fence posts
      const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 4);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.6 });
      for (let x = -20; x <= 20; x += 5) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 1.25, 25);
        scene.add(post);
      }

      // Watchtower base
      const towerGeo = new THREE.BoxGeometry(3, 0.2, 3);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0x556644, roughness: 0.8 });
      const towerPlatform = new THREE.Mesh(towerGeo, towerMat);
      towerPlatform.position.set(-22, 4, -22);
      scene.add(towerPlatform);
      // Tower legs
      const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 4);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x444433, roughness: 0.7 });
      for (const dx of [-1.2, 1.2]) {
        for (const dz of [-1.2, 1.2]) {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.position.set(-22 + dx, 2, -22 + dz);
          leg.castShadow = true;
          scene.add(leg);
        }
      }
    }
  }

  function createGunModel() {
    gunModel = new THREE.Group();

    // Gun body
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.45);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, gunMat);
    gunModel.add(body);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.25, 6);
    const barrel = new THREE.Mesh(barrelGeo, gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.3);
    gunModel.add(barrel);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.04, 0.12, 0.06);
    const mag = new THREE.Mesh(magGeo, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 }));
    mag.position.set(0, -0.08, 0.05);
    gunModel.add(mag);

    // Grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.1, 0.04);
    const grip = new THREE.Mesh(gripGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
    grip.position.set(0, -0.06, 0.12);
    grip.rotation.x = 0.2;
    gunModel.add(grip);

    // Sight
    const sightGeo = new THREE.BoxGeometry(0.02, 0.03, 0.02);
    const sight = new THREE.Mesh(sightGeo, gunMat);
    sight.position.set(0, 0.055, -0.1);
    gunModel.add(sight);

    gunModel.position.set(0.25, -0.2, -0.45);
    camera.add(gunModel);
    scene.add(camera);
  }

  // ── Player Models ───────────────────────────────────────────────────────
  function addPlayerModel(id, name, isBot, position) {
    const group = new THREE.Group();

    const bodyColor = isBot ? 0x8B3A3A : 0x3A6B8B;
    const accentColor = isBot ? 0xAA5555 : 0x5588AA;

    // Body (torso)
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.1 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    // Tactical vest
    const vestGeo = new THREE.BoxGeometry(0.55, 0.5, 0.35);
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x3a3a2a, roughness: 0.85 });
    const vest = new THREE.Mesh(vestGeo, vestMat);
    vest.position.y = 0.95;
    group.add(vest);

    // Head (slightly rounded box)
    const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const headMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.6, metalness: 0.1 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);

    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.6;
    group.add(helmet);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.15, 0.5, 0.18);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.8 });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.12, 0.25, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.12, 0.25, 0);
    group.add(rightLeg);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.1, 0.5, 0.12);
    const armMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.33, 0.9, 0);
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.33, 0.85, -0.05);
    rightArm.rotation.x = -0.3;
    group.add(rightArm);

    // Weapon in hand
    const weapGeo = new THREE.BoxGeometry(0.06, 0.06, 0.4);
    const weapMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.8 });
    const weapon = new THREE.Mesh(weapGeo, weapMat);
    weapon.position.set(0.33, 0.85, -0.25);
    group.add(weapon);

    // Name tag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect(10, 8, 236, 48, 8);
    ctx.fill();
    ctx.fillStyle = isBot ? '#ff8888' : '#88ddff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.3;
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

  // ── Impact Particles ────────────────────────────────────────────────────
  function createImpactParticles(position) {
    const count = 6;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 1] = position.y + Math.random() * 1.5;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff4400, size: 0.15, transparent: true, opacity: 0.8 });
    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    let frame = 0;
    const animate = () => {
      frame++;
      mat.opacity -= 0.05;
      const posArr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        posArr[i * 3 + 1] += 0.03;
      }
      geo.attributes.position.needsUpdate = true;
      if (frame < 15) requestAnimationFrame(animate);
      else scene.remove(particles);
    };
    animate();
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
    if (e.code === 'Tab') { e.preventDefault(); scoreboard.classList.remove('hidden'); }
    if (e.code === 'KeyR' && !isReloading) startReload();
    if (e.code === 'KeyV') toggleVoice();
    if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock();
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    if (e.code === 'Tab') scoreboard.classList.add('hidden');
  }

  // ── Shooting ────────────────────────────────────────────────────────────
  function tryShoot() {
    if (!alive || isReloading || ammo <= 0) return;
    const now = Date.now();
    if (now - lastFireTime < FIRE_RATE) return;
    lastFireTime = now;
    ammo--;
    updateAmmoDisplay();

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    const origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    socket.emit('shoot', { origin, direction: { x: direction.x, y: direction.y, z: direction.z } });

    // Gun recoil animation
    gunRecoil = 0.06;
    createMuzzleFlash();
    if (ammo <= 0 && reserve > 0) startReload();
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
      origin.x + direction.x * 40,
      origin.y + direction.y * 40,
      origin.z + direction.z * 40
    );
    geo.setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    setTimeout(() => { scene.remove(line); geo.dispose(); mat.dispose(); }, 60);
  }

  function createMuzzleFlash() {
    const flashGeo = new THREE.SphereGeometry(0.06, 4, 4);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    flash.position.copy(camera.position).add(dir.multiplyScalar(0.5));
    scene.add(flash);
    setTimeout(() => { scene.remove(flash); flashGeo.dispose(); flashMat.dispose(); }, 40);
  }

  function showHitMarker(headshot) {
    hitMarker.classList.remove('hidden', 'headshot');
    if (headshot) hitMarker.classList.add('headshot');
    hitMarker.style.display = 'block';
    setTimeout(() => { hitMarker.style.display = 'none'; hitMarker.classList.add('hidden'); }, 200);
  }

  function showDamageOverlay() {
    damageOverlay.classList.add('hit');
    setTimeout(() => damageOverlay.classList.remove('hit'), 300);
  }

  function showKillNotification(victimName, headshot) {
    killNotification.textContent = headshot ? `HEADSHOT! Eliminated ${victimName}` : `Eliminated ${victimName}`;
    killNotification.classList.remove('hidden');
    killNotification.style.animation = 'none';
    killNotification.offsetHeight;
    killNotification.style.animation = '';
    setTimeout(() => killNotification.classList.add('hidden'), 2000);
  }

  function addKillFeedEntry(killer, victim, headshot) {
    const entry = document.createElement('div');
    entry.className = 'kill-entry' + (headshot ? ' headshot' : '');
    entry.innerHTML = `<span class="killer">${killer}</span> ${headshot ? '💀' : '⚔'} <span class="victim">${victim}</span>`;
    killFeed.prepend(entry);
    while (killFeed.children.length > 5) killFeed.removeChild(killFeed.lastChild);
    setTimeout(() => {
      entry.style.opacity = '0';
      entry.style.transition = 'opacity 0.5s';
      setTimeout(() => entry.remove(), 500);
    }, 5000);
  }

  function updateHealth(hp) {
    healthBar.style.width = hp + '%';
    healthText.textContent = hp;
    if (hp > 60) healthBar.style.background = 'linear-gradient(90deg, #00ff88, #00cc66)';
    else if (hp > 30) healthBar.style.background = 'linear-gradient(90deg, #ffaa00, #ff8800)';
    else healthBar.style.background = 'linear-gradient(90deg, #ff4444, #cc0000)';
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
    const bounds = 28;
    if (Math.abs(newPos.x) > bounds || Math.abs(newPos.z) > bounds) return true;
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

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * MOVE_SPEED;
      moveZ = (moveZ / len) * MOVE_SPEED;
    }

    if (keys['Space'] && onGround) {
      velocity.y = JUMP_FORCE;
      onGround = false;
    }

    velocity.y -= GRAVITY;

    const newPosX = { x: camera.position.x + moveX, y: camera.position.y, z: camera.position.z };
    const newPosZ = { x: camera.position.x, y: camera.position.y, z: camera.position.z + moveZ };
    if (!checkCollision(newPosX)) camera.position.x += moveX;
    if (!checkCollision(newPosZ)) camera.position.z += moveZ;

    camera.position.y += velocity.y;
    if (camera.position.y <= PLAYER_HEIGHT) {
      camera.position.y = PLAYER_HEIGHT;
      velocity.y = 0;
      onGround = true;
    }

    if (mouseDown) tryShoot();

    // Gun recoil recovery
    if (gunModel) {
      gunRecoil *= 0.85;
      gunModel.position.z = -0.45 + gunRecoil;
      gunModel.rotation.x = -gunRecoil * 2;

      // Subtle weapon sway
      const swayTime = Date.now() * 0.001;
      gunModel.position.x = 0.25 + Math.sin(swayTime * 1.5) * 0.003;
      gunModel.position.y = -0.2 + Math.sin(swayTime * 2) * 0.002;
    }

    // Throttled network send
    const now = Date.now();
    if (socket && matchId && now - lastNetSend > NET_SEND_INTERVAL) {
      lastNetSend = now;
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
      const lerpFactor = 0.12;
      p.mesh.position.x += (p.targetPos.x - p.mesh.position.x) * lerpFactor;
      p.mesh.position.y += ((p.targetPos.y || 0) - p.mesh.position.y) * lerpFactor;
      p.mesh.position.z += (p.targetPos.z - p.mesh.position.z) * lerpFactor;
      if (p.targetRot) {
        // Smooth rotation interpolation
        let targetY = p.targetRot.y || 0;
        let currentY = p.mesh.rotation.y;
        let diff = targetY - currentY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.mesh.rotation.y += diff * 0.15;
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
    if (voiceEnabled) disableVoice();
    else await enableVoice();
  }

  async function enableVoice() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceEnabled = true;
      voiceToggle.classList.add('active');
      voiceToggle.classList.remove('muted');
      document.getElementById('voiceIcon').textContent = '🎤';
      for (const id of Object.keys(players)) {
        if (!players[id].isBot) createPeerConnection(id, true);
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
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    for (const [id, pc] of Object.entries(peerConnections)) pc.close();
    peerConnections = {};
  }

  function createPeerConnection(targetId, initiator) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnections[targetId] = pc;
    if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();
      const indicator = document.createElement('div');
      indicator.className = 'speaker-indicator';
      indicator.id = `speaker-${targetId}`;
      indicator.textContent = players[targetId]?.name || 'Player';
      document.getElementById('voiceSpeakers').appendChild(indicator);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('iceCandidate', { targetId, candidate: event.candidate });
    };
    if (initiator) {
      pc.createOffer().then(offer => { pc.setLocalDescription(offer); socket.emit('voiceOffer', { targetId, offer }); });
    }
    return pc;
  }

  function handleVoiceOffer(data) {
    if (!voiceEnabled) return;
    const pc = createPeerConnection(data.senderId, false);
    pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    pc.createAnswer().then(answer => { pc.setLocalDescription(answer); socket.emit('voiceAnswer', { targetId: data.senderId, answer }); });
  }

  function handleVoiceAnswer(data) {
    const pc = peerConnections[data.senderId];
    if (pc) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  function handleIceCandidate(data) {
    const pc = peerConnections[data.senderId];
    if (pc) pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  window.leaveMatch = function () {
    if (socket) socket.emit('leaveMatch');
    disableVoice();
    cleanupGame();
    showScreen(mainMenu);
  };

  window.backToMenu = function () {
    cleanupGame();
    showScreen(mainMenu);
  };

  function cleanupGame() {
    if (renderer) {
      gameContainer.removeChild(renderer.domElement);
      renderer.dispose();
      renderer = null;
    }
    // Dispose textures
    for (const key in textureCache) {
      textureCache[key].dispose();
    }
    textureCache = {};

    scene = null;
    camera = null;
    gunModel = null;
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
    gunRecoil = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  init();
})();
