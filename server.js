const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Game Constants ──────────────────────────────────────────────────────────
const KILL_LIMIT = 50;
const MAX_PLAYERS = 5;
const TICK_RATE = 20; // server ticks per second
const BOT_NAMES = ['Shadow', 'Viper', 'Ghost', 'Phoenix', 'Blaze', 'Reaper', 'Storm', 'Cobra'];
const PLAYER_MAX_HP = 100;
const RESPAWN_DELAY = 2000; // ms
const DAMAGE_BODY = 25;
const DAMAGE_HEAD = 50;

// ── Map Definitions ─────────────────────────────────────────────────────────
const MAPS = {
  dust: {
    name: 'Dust Arena',
    description: 'A sun-scorched desert compound with tight corridors and open plazas.',
    spawnPoints: [
      { x: -20, y: 1, z: -20 },
      { x: 20, y: 1, z: -20 },
      { x: -20, y: 1, z: 20 },
      { x: 20, y: 1, z: 20 },
      { x: 0, y: 1, z: 0 },
      { x: -15, y: 1, z: 0 },
      { x: 15, y: 1, z: 0 },
      { x: 0, y: 1, z: -15 },
      { x: 0, y: 1, z: 15 },
      { x: -10, y: 1, z: -10 },
      { x: 10, y: 1, z: 10 }
    ],
    walls: [
      // Outer walls
      { x: 0, y: 2.5, z: -30, w: 60, h: 5, d: 1 },
      { x: 0, y: 2.5, z: 30, w: 60, h: 5, d: 1 },
      { x: -30, y: 2.5, z: 0, w: 1, h: 5, d: 60 },
      { x: 30, y: 2.5, z: 0, w: 1, h: 5, d: 60 },
      // Inner structures
      { x: -10, y: 2, z: -10, w: 6, h: 4, d: 1 },
      { x: -10, y: 2, z: -10, w: 1, h: 4, d: 6 },
      { x: 10, y: 2, z: 10, w: 6, h: 4, d: 1 },
      { x: 10, y: 2, z: 10, w: 1, h: 4, d: 6 },
      // Center pillar
      { x: 0, y: 2, z: 0, w: 3, h: 4, d: 3 },
      // Side covers
      { x: -20, y: 1.5, z: 5, w: 4, h: 3, d: 1 },
      { x: 20, y: 1.5, z: -5, w: 4, h: 3, d: 1 },
      { x: 5, y: 1.5, z: -20, w: 1, h: 3, d: 4 },
      { x: -5, y: 1.5, z: 20, w: 1, h: 3, d: 4 },
      // Crates
      { x: -15, y: 1, z: -15, w: 2, h: 2, d: 2 },
      { x: 15, y: 1, z: 15, w: 2, h: 2, d: 2 },
      { x: 15, y: 1, z: -15, w: 2, h: 2, d: 2 },
      { x: -15, y: 1, z: 15, w: 2, h: 2, d: 2 }
    ],
    boxes: [
      { x: -8, y: 0.75, z: 5, w: 1.5, h: 1.5, d: 1.5 },
      { x: 8, y: 0.75, z: -5, w: 1.5, h: 1.5, d: 1.5 },
      { x: 0, y: 0.75, z: 12, w: 1.5, h: 1.5, d: 1.5 },
      { x: 0, y: 0.75, z: -12, w: 1.5, h: 1.5, d: 1.5 }
    ]
  },
  warehouse: {
    name: 'Warehouse',
    description: 'An industrial warehouse with stacked containers and catwalks.',
    spawnPoints: [
      { x: -18, y: 1, z: -18 },
      { x: 18, y: 1, z: -18 },
      { x: -18, y: 1, z: 18 },
      { x: 18, y: 1, z: 18 },
      { x: 0, y: 1, z: 0 },
      { x: -12, y: 1, z: 0 },
      { x: 12, y: 1, z: 0 },
      { x: 0, y: 1, z: -12 },
      { x: 0, y: 1, z: 12 }
    ],
    walls: [
      // Outer walls
      { x: 0, y: 3, z: -25, w: 50, h: 6, d: 1 },
      { x: 0, y: 3, z: 25, w: 50, h: 6, d: 1 },
      { x: -25, y: 3, z: 0, w: 1, h: 6, d: 50 },
      { x: 25, y: 3, z: 0, w: 1, h: 6, d: 50 },
      // Shipping containers
      { x: -10, y: 1.5, z: -8, w: 6, h: 3, d: 2.5 },
      { x: 10, y: 1.5, z: 8, w: 6, h: 3, d: 2.5 },
      { x: -10, y: 1.5, z: 8, w: 2.5, h: 3, d: 6 },
      { x: 10, y: 1.5, z: -8, w: 2.5, h: 3, d: 6 },
      // Center structure
      { x: -2, y: 2, z: 0, w: 1, h: 4, d: 8 },
      { x: 2, y: 2, z: 0, w: 1, h: 4, d: 8 },
      // Catwalks (thin platforms)
      { x: 0, y: 3, z: -15, w: 10, h: 0.3, d: 2 },
      { x: 0, y: 3, z: 15, w: 10, h: 0.3, d: 2 }
    ],
    boxes: [
      { x: -5, y: 0.75, z: -15, w: 1.5, h: 1.5, d: 1.5 },
      { x: 5, y: 0.75, z: 15, w: 1.5, h: 1.5, d: 1.5 },
      { x: -15, y: 0.75, z: 5, w: 1.5, h: 1.5, d: 1.5 },
      { x: 15, y: 0.75, z: -5, w: 1.5, h: 1.5, d: 1.5 },
      { x: 0, y: 0.75, z: 0, w: 2, h: 1.5, d: 2 }
    ]
  },
  compound: {
    name: 'Military Compound',
    description: 'A fortified military base with bunkers and watchtowers.',
    spawnPoints: [
      { x: -22, y: 1, z: -22 },
      { x: 22, y: 1, z: -22 },
      { x: -22, y: 1, z: 22 },
      { x: 22, y: 1, z: 22 },
      { x: 0, y: 1, z: 0 },
      { x: -15, y: 1, z: 10 },
      { x: 15, y: 1, z: -10 },
      { x: 10, y: 1, z: 15 },
      { x: -10, y: 1, z: -15 }
    ],
    walls: [
      // Outer walls
      { x: 0, y: 2.5, z: -28, w: 56, h: 5, d: 1.5 },
      { x: 0, y: 2.5, z: 28, w: 56, h: 5, d: 1.5 },
      { x: -28, y: 2.5, z: 0, w: 1.5, h: 5, d: 56 },
      { x: 28, y: 2.5, z: 0, w: 1.5, h: 5, d: 56 },
      // Bunkers
      { x: -15, y: 1.5, z: -15, w: 8, h: 3, d: 1 },
      { x: -15, y: 1.5, z: -11, w: 1, h: 3, d: 8 },
      { x: -11, y: 1.5, z: -15, w: 1, h: 3, d: 8 },
      { x: 15, y: 1.5, z: 15, w: 8, h: 3, d: 1 },
      { x: 15, y: 1.5, z: 11, w: 1, h: 3, d: 8 },
      { x: 11, y: 1.5, z: 15, w: 1, h: 3, d: 8 },
      // Center building
      { x: -3, y: 2.5, z: -5, w: 1, h: 5, d: 10 },
      { x: 3, y: 2.5, z: -5, w: 1, h: 5, d: 10 },
      { x: 0, y: 2.5, z: -10, w: 6, h: 5, d: 1 },
      // Sandbag walls
      { x: -8, y: 0.75, z: 5, w: 4, h: 1.5, d: 0.5 },
      { x: 8, y: 0.75, z: -5, w: 4, h: 1.5, d: 0.5 },
      { x: 5, y: 0.75, z: 8, w: 0.5, h: 1.5, d: 4 },
      { x: -5, y: 0.75, z: -8, w: 0.5, h: 1.5, d: 4 }
    ],
    boxes: [
      { x: -20, y: 1, z: 0, w: 2, h: 2, d: 2 },
      { x: 20, y: 1, z: 0, w: 2, h: 2, d: 2 },
      { x: 0, y: 1, z: -20, w: 2, h: 2, d: 2 },
      { x: 0, y: 1, z: 20, w: 2, h: 2, d: 2 },
      { x: 0, y: 0.5, z: 5, w: 1, h: 1, d: 1 }
    ]
  }
};

// ── Active Matches ──────────────────────────────────────────────────────────
const matches = new Map();

function createMatch(mapId) {
  const map = MAPS[mapId];
  if (!map) return null;
  const matchId = uuidv4();
  const match = {
    id: matchId,
    mapId,
    map,
    players: new Map(),
    bots: new Map(),
    state: 'waiting', // waiting, playing, finished
    createdAt: Date.now(),
    winner: null,
    botInterval: null
  };
  matches.set(matchId, match);
  return match;
}

function getRandomSpawn(map) {
  const sp = map.spawnPoints;
  return { ...sp[Math.floor(Math.random() * sp.length)] };
}

function createPlayer(id, name, isBot = false) {
  return {
    id,
    name: name || 'Player',
    isBot,
    hp: PLAYER_MAX_HP,
    kills: 0,
    deaths: 0,
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0 },
    alive: true,
    respawnTimer: null
  };
}

// ── Collision Detection ─────────────────────────────────────────────────────
function checkWallCollision(pos, walls, radius = 0.5) {
  for (const wall of walls) {
    const halfW = wall.w / 2;
    const halfD = wall.d / 2;
    const minX = wall.x - halfW - radius;
    const maxX = wall.x + halfW + radius;
    const minZ = wall.z - halfD - radius;
    const maxZ = wall.z + halfD + radius;
    if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
      if (pos.y < wall.y + wall.h / 2) {
        return true;
      }
    }
  }
  return false;
}

// ── Raycasting for Shots ────────────────────────────────────────────────────
function processShot(match, shooterId, origin, direction) {
  const shooter = match.players.get(shooterId) || match.bots.get(shooterId);
  if (!shooter || !shooter.alive) return null;

  let closestHit = null;
  let closestDist = Infinity;

  const allTargets = [...match.players.values(), ...match.bots.values()];

  for (const target of allTargets) {
    if (target.id === shooterId || !target.alive) continue;

    // Simple sphere-ray intersection for hit detection
    const dx = target.position.x - origin.x;
    const dy = target.position.y - origin.y;
    const dz = target.position.z - origin.z;

    const dot = dx * direction.x + dy * direction.y + dz * direction.z;
    if (dot < 0) continue; // behind shooter

    const closestX = origin.x + direction.x * dot;
    const closestY = origin.y + direction.y * dot;
    const closestZ = origin.z + direction.z * dot;

    const distToCenter = Math.sqrt(
      (closestX - target.position.x) ** 2 +
      (closestY - target.position.y) ** 2 +
      (closestZ - target.position.z) ** 2
    );

    const hitRadius = 1.0; // player hitbox radius
    if (distToCenter < hitRadius && dot < closestDist) {
      closestDist = dot;
      const isHeadshot = closestY > target.position.y + 0.5;
      closestHit = { target, distance: dot, isHeadshot };
    }
  }

  if (closestHit) {
    const damage = closestHit.isHeadshot ? DAMAGE_HEAD : DAMAGE_BODY;
    closestHit.target.hp -= damage;

    if (closestHit.target.hp <= 0) {
      closestHit.target.hp = 0;
      closestHit.target.alive = false;
      closestHit.target.deaths++;
      shooter.kills++;

      // Respawn after delay
      setTimeout(() => {
        if (match.state !== 'finished') {
          const spawn = getRandomSpawn(match.map);
          closestHit.target.position = spawn;
          closestHit.target.hp = PLAYER_MAX_HP;
          closestHit.target.alive = true;

          io.to(match.id).emit('playerRespawned', {
            playerId: closestHit.target.id,
            position: spawn
          });
        }
      }, RESPAWN_DELAY);

      // Check win condition
      if (shooter.kills >= KILL_LIMIT) {
        endMatch(match, shooter);
      }

      return {
        hit: true,
        killed: true,
        targetId: closestHit.target.id,
        targetName: closestHit.target.name,
        shooterId: shooter.id,
        shooterName: shooter.name,
        isHeadshot: closestHit.isHeadshot,
        damage
      };
    }

    return {
      hit: true,
      killed: false,
      targetId: closestHit.target.id,
      damage,
      isHeadshot: closestHit.isHeadshot
    };
  }

  return { hit: false };
}

function endMatch(match, winner) {
  match.state = 'finished';
  match.winner = winner;

  // Gather all player stats
  const allPlayers = [...match.players.values(), ...match.bots.values()];
  const stats = allPlayers.map(p => ({
    id: p.id,
    name: p.name,
    kills: p.kills,
    deaths: p.deaths,
    isBot: p.isBot,
    kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2)
  })).sort((a, b) => b.kills - a.kills);

  const mvp = stats[0];

  io.to(match.id).emit('matchEnded', {
    winner: { id: winner.id, name: winner.name },
    mvp,
    stats
  });

  // Clear bot interval
  if (match.botInterval) {
    clearInterval(match.botInterval);
  }

  // Clean up match after delay
  setTimeout(() => {
    matches.delete(match.id);
  }, 30000);
}

// ── Bot AI ──────────────────────────────────────────────────────────────────
function addBot(match) {
  const botId = 'bot-' + uuidv4().substring(0, 8);
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Math.floor(Math.random() * 100);
  const bot = createPlayer(botId, botName, true);
  bot.position = getRandomSpawn(match.map);
  bot.targetId = null;
  bot.moveAngle = Math.random() * Math.PI * 2;
  bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
  bot.lastShot = 0;
  bot.accuracy = 0.3 + Math.random() * 0.4; // 30-70% accuracy
  bot.reactionTime = 300 + Math.random() * 500; // 300-800ms
  match.bots.set(botId, bot);

  io.to(match.id).emit('playerJoined', {
    id: botId,
    name: botName,
    isBot: true,
    position: bot.position
  });

  return bot;
}

function updateBots(match) {
  if (match.state !== 'playing') return;

  const now = Date.now();
  const allTargets = [...match.players.values(), ...match.bots.values()];

  for (const [botId, bot] of match.bots) {
    if (!bot.alive) continue;

    // Find closest alive enemy
    let closestEnemy = null;
    let closestDist = Infinity;

    for (const target of allTargets) {
      if (target.id === botId || !target.alive) continue;
      const dx = target.position.x - bot.position.x;
      const dz = target.position.z - bot.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = target;
      }
    }

    if (closestEnemy) {
      const dx = closestEnemy.position.x - bot.position.x;
      const dz = closestEnemy.position.z - bot.position.z;
      const angle = Math.atan2(dx, dz);
      bot.rotation.y = angle;

      // Move towards enemy if far, strafe if close
      const speed = 0.15;
      if (closestDist > 10) {
        const newX = bot.position.x + Math.sin(angle) * speed;
        const newZ = bot.position.z + Math.cos(angle) * speed;
        const allWalls = [...(match.map.walls || []), ...(match.map.boxes || [])];
        if (!checkWallCollision({ x: newX, y: bot.position.y, z: newZ }, allWalls)) {
          bot.position.x = newX;
          bot.position.z = newZ;
        }
      } else if (closestDist > 3) {
        // Strafe
        const strafeAngle = angle + (Math.PI / 2) * bot.strafeDir;
        const newX = bot.position.x + Math.sin(strafeAngle) * speed * 0.5;
        const newZ = bot.position.z + Math.cos(strafeAngle) * speed * 0.5;
        const allWalls = [...(match.map.walls || []), ...(match.map.boxes || [])];
        if (!checkWallCollision({ x: newX, y: bot.position.y, z: newZ }, allWalls)) {
          bot.position.x = newX;
          bot.position.z = newZ;
        }
        if (Math.random() < 0.02) bot.strafeDir *= -1;
      }

      // Shoot at enemy
      if (closestDist < 30 && now - bot.lastShot > bot.reactionTime) {
        bot.lastShot = now;

        // Calculate direction with some inaccuracy
        const dirLen = Math.sqrt(dx * dx + dz * dz);
        const spread = (1 - bot.accuracy) * 0.5;
        const direction = {
          x: dx / dirLen + (Math.random() - 0.5) * spread,
          y: (Math.random() - 0.5) * spread * 0.5,
          z: dz / dirLen + (Math.random() - 0.5) * spread
        };

        // Normalize
        const dLen = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
        direction.x /= dLen;
        direction.y /= dLen;
        direction.z /= dLen;

        const result = processShot(match, botId, bot.position, direction);
        if (result) {
          io.to(match.id).emit('shotFired', {
            shooterId: botId,
            origin: bot.position,
            direction,
            result
          });

          if (result.killed) {
            io.to(match.id).emit('killFeed', {
              killer: bot.name,
              victim: result.targetName,
              isHeadshot: result.isHeadshot
            });

            io.to(match.id).emit('scoreUpdate', getScoreboard(match));
          }
        }
      }
    } else {
      // Wander
      bot.position.x += Math.sin(bot.moveAngle) * 0.08;
      bot.position.z += Math.cos(bot.moveAngle) * 0.08;
      if (Math.random() < 0.02) {
        bot.moveAngle += (Math.random() - 0.5) * 1;
      }
      // Clamp to map bounds
      const bounds = 25;
      bot.position.x = Math.max(-bounds, Math.min(bounds, bot.position.x));
      bot.position.z = Math.max(-bounds, Math.min(bounds, bot.position.z));
    }
  }

  // Broadcast bot positions
  const botStates = {};
  for (const [id, bot] of match.bots) {
    botStates[id] = {
      position: bot.position,
      rotation: bot.rotation,
      hp: bot.hp,
      alive: bot.alive
    };
  }
  io.to(match.id).emit('botUpdate', botStates);
}

function getScoreboard(match) {
  const all = [...match.players.values(), ...match.bots.values()];
  return all.map(p => ({
    id: p.id,
    name: p.name,
    kills: p.kills,
    deaths: p.deaths,
    hp: p.hp,
    isBot: p.isBot
  })).sort((a, b) => b.kills - a.kills);
}

// ── Socket.IO Handlers ──────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send available maps
  socket.emit('mapList', Object.entries(MAPS).map(([id, map]) => ({
    id,
    name: map.name,
    description: map.description
  })));

  // Send active matches
  socket.emit('activeMatches', getActiveMatches());

  // Join or create match
  socket.on('joinMatch', ({ mapId, playerName }) => {
    // Look for existing match on this map
    let match = null;
    for (const m of matches.values()) {
      if (m.mapId === mapId && m.state !== 'finished' &&
          m.players.size + m.bots.size < MAX_PLAYERS) {
        match = m;
        break;
      }
    }

    if (!match) {
      match = createMatch(mapId);
      if (!match) {
        socket.emit('error', { message: 'Invalid map' });
        return;
      }
    }

    // Create player
    const player = createPlayer(socket.id, playerName || 'Player');
    player.position = getRandomSpawn(match.map);
    match.players.set(socket.id, player);

    socket.join(match.id);
    socket.matchId = match.id;

    // Notify everyone
    io.to(match.id).emit('playerJoined', {
      id: socket.id,
      name: player.name,
      isBot: false,
      position: player.position
    });

    // Send current match state
    const existingPlayers = [];
    for (const [id, p] of match.players) {
      existingPlayers.push({
        id,
        name: p.name,
        isBot: false,
        position: p.position,
        hp: p.hp,
        kills: p.kills,
        deaths: p.deaths,
        alive: p.alive
      });
    }
    for (const [id, p] of match.bots) {
      existingPlayers.push({
        id,
        name: p.name,
        isBot: true,
        position: p.position,
        hp: p.hp,
        kills: p.kills,
        deaths: p.deaths,
        alive: p.alive
      });
    }

    socket.emit('matchJoined', {
      matchId: match.id,
      mapId: match.mapId,
      map: match.map,
      playerId: socket.id,
      players: existingPlayers
    });

    // Fill with bots if needed (up to MAX_PLAYERS)
    const totalPlayers = match.players.size + match.bots.size;
    if (totalPlayers < MAX_PLAYERS) {
      const botsNeeded = MAX_PLAYERS - totalPlayers;
      for (let i = 0; i < botsNeeded; i++) {
        addBot(match);
      }
    }

    // Start match if not already
    if (match.state === 'waiting') {
      match.state = 'playing';
      io.to(match.id).emit('matchStarted');

      // Start bot AI loop
      match.botInterval = setInterval(() => updateBots(match), 1000 / TICK_RATE);
    }

    io.to(match.id).emit('scoreUpdate', getScoreboard(match));
  });

  // Player movement
  socket.on('playerMove', ({ position, rotation }) => {
    const match = matches.get(socket.matchId);
    if (!match) return;
    const player = match.players.get(socket.id);
    if (!player || !player.alive) return;

    player.position = position;
    player.rotation = rotation;

    socket.to(match.id).emit('playerMoved', {
      id: socket.id,
      position,
      rotation
    });
  });

  // Player shoots
  socket.on('shoot', ({ origin, direction }) => {
    const match = matches.get(socket.matchId);
    if (!match || match.state !== 'playing') return;

    const result = processShot(match, socket.id, origin, direction);
    if (result) {
      io.to(match.id).emit('shotFired', {
        shooterId: socket.id,
        origin,
        direction,
        result
      });

      if (result.killed) {
        const shooter = match.players.get(socket.id);
        io.to(match.id).emit('killFeed', {
          killer: shooter ? shooter.name : 'Unknown',
          victim: result.targetName,
          isHeadshot: result.isHeadshot
        });

        io.to(match.id).emit('scoreUpdate', getScoreboard(match));
      }

      if (result.hit && !result.killed) {
        io.to(match.id).emit('scoreUpdate', getScoreboard(match));
      }
    }
  });

  // Voice signaling
  socket.on('voiceOffer', ({ targetId, offer }) => {
    io.to(targetId).emit('voiceOffer', { senderId: socket.id, offer });
  });

  socket.on('voiceAnswer', ({ targetId, answer }) => {
    io.to(targetId).emit('voiceAnswer', { senderId: socket.id, answer });
  });

  socket.on('iceCandidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('iceCandidate', { senderId: socket.id, candidate });
  });

  // Player leaves
  socket.on('leaveMatch', () => {
    handlePlayerLeave(socket);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handlePlayerLeave(socket);
  });

  function handlePlayerLeave(sock) {
    const match = matches.get(sock.matchId);
    if (!match) return;

    match.players.delete(sock.id);
    sock.leave(match.id);

    io.to(match.id).emit('playerLeft', { id: sock.id });
    io.to(match.id).emit('scoreUpdate', getScoreboard(match));

    // If no human players left, end match
    if (match.players.size === 0 && match.state !== 'finished') {
      if (match.botInterval) clearInterval(match.botInterval);
      matches.delete(match.id);
    }

    sock.matchId = null;
  }
});

function getActiveMatches() {
  const list = [];
  for (const [id, match] of matches) {
    if (match.state !== 'finished') {
      list.push({
        id,
        mapId: match.mapId,
        mapName: match.map.name,
        playerCount: match.players.size + match.bots.size,
        maxPlayers: MAX_PLAYERS,
        state: match.state
      });
    }
  }
  return list;
}

// ── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Game server running on http://localhost:${PORT}`);
});
