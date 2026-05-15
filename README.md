# Arena Deathmatch - Multiplayer FPS Game

A browser-based multiplayer first-person shooter with 3D graphics, voice chat, AI bots, and CS-style maps.

![Game Screenshot](https://img.shields.io/badge/Game-Multiplayer%20FPS-orange)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Three.js](https://img.shields.io/badge/Three.js-r128-blue)

## Features

- **Multiplayer Deathmatch**: Up to 5 players compete in fast-paced FPS combat
- **50-Kill Limit**: First player to reach 50 kills wins the match
- **3 CS-Style Maps**: Dust Arena, Warehouse, and Military Compound
- **AI Bots**: Matches fill automatically with intelligent bots when fewer than 5 human players
- **Voice Chat**: Built-in WebRTC voice communication between players
- **MVP Screen**: End-of-match showcase with winner, MVP, and full standings
- **Respawning**: Random respawn points after elimination
- **Customizable Names**: Choose your call sign before entering a match
- **Real-time Scoreboard**: Press Tab to view rankings during gameplay
- **Kill Feed**: Live kill notifications with headshot indicators
- **Leave Anytime**: Players can exit matches at will

## Tech Stack

- **Frontend**: Three.js (3D rendering), Vanilla JS
- **Backend**: Node.js, Express, Socket.IO
- **Voice Chat**: WebRTC with STUN server
- **Networking**: Real-time bidirectional with Socket.IO

## Getting Started

### Prerequisites
- Node.js 16+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/roohan-514/multiplayer-game.git
cd multiplayer-game

# Install dependencies
npm install

# Start the server
npm start
```

The game will be available at `http://localhost:3000`

### Playing

1. Open `http://localhost:3000` in your browser
2. Enter your call sign (player name)
3. Select a map
4. Click **DEPLOY** to join a match
5. AI bots will fill empty slots automatically

### Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| Mouse | Look around |
| Left Click | Shoot |
| R | Reload |
| Space | Jump |
| Tab | Scoreboard |
| V | Toggle voice chat |
| ESC | Release mouse |

## Maps

### Dust Arena 🏜️
A sun-scorched desert compound with tight corridors and open plazas. Sandy terrain with cover structures and crates.

### Warehouse 🏭
An industrial warehouse with stacked containers and catwalks. Dark atmosphere with warm point lighting.

### Military Compound 🏗️
A fortified military base with bunkers, watchtowers, and sandbag positions. Green terrain with concrete structures.

## Game Mechanics

- **Health**: 100 HP per player
- **Body Shot**: 25 damage
- **Headshot**: 50 damage
- **Respawn**: 2-second delay at a random spawn point
- **Ammo**: 30 rounds per magazine, 90 reserve
- **Reload Time**: 2 seconds
- **Win Condition**: First to 50 kills

## Architecture

```
multiplayer-game/
├── server.js              # Game server (Express + Socket.IO)
├── package.json           # Dependencies
├── public/
│   ├── index.html         # Main HTML with all screens
│   ├── css/
│   │   └── style.css      # Complete UI styling
│   ├── js/
│   │   └── game.js        # Game client (Three.js + networking)
│   └── assets/            # Game assets
└── README.md
```

## License

MIT
