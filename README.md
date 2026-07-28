# Steppe Strike

**A global realtime voxel FPS built for fast play from Mongolia.**

Steppe Strike drops every player into the same public block-world team battle.
There are no accounts, room codes, downloads, or map menus: choose a name and
join. The launch server supports up to **96 simultaneous players** in one world.

**Play:** [steppe-strike-production.up.railway.app](https://steppe-strike-production.up.railway.app)

## What is playable

- One shared Mongolian-steppe-inspired voxel battlefield
- Automatic Blue / Red team balancing
- Authoritative AK-style hitscan combat
- 100 HP, 30-round magazine, reloads, headshots, kill feed, and scoreboard
- Three-second respawns with brief spawn protection
- First team to 50 eliminations wins; the next battle starts automatically
- Instant guest identity with reconnect recovery
- Desktop pointer-lock controls and phone-first dual-zone touch controls
- Mongolian-first interface with universally recognizable FPS HUD patterns

## Controls

| Desktop | Action | Mobile |
|---|---|---|
| `WASD` / arrows | Move | Left joystick |
| Mouse | Aim | Drag on right side |
| Left click | Fire | Fire circle |
| `Space` | Jump | Up button |
| `R` | Reload | R button |
| `Tab` | Scoreboard | — |

## Architecture

```text
Browser
  ├─ Three.js voxel renderer
  ├─ predicted local movement
  ├─ smoothed remote players
  └─ 9-byte input packets at 30 Hz
          │ secure WebSocket
          ▼
Railway / Singapore
  ├─ static Vite client
  ├─ authoritative 30 Hz world
  ├─ 15 Hz binary snapshots
  ├─ movement + collision validation
  └─ server-owned hits, ammo, teams, deaths, and respawns
```

The realtime foundation follows the proven patterns in
[`ugshanyu/tank`](https://github.com/ugshanyu/tank):

- a fixed-rate authoritative server
- shared client/server movement code
- client prediction and server reconciliation
- compact binary hot-path messages
- bounded payloads and message rates
- disabled WebSocket compression and TCP `NODELAY`
- snapshots skipped for clients with socket backpressure
- real two-client protocol smoke tests

The voxel terrain is deterministic and bundled with both sides, so it consumes
no realtime bandwidth. At full launch capacity, each snapshot is about 2.3 KB
before WebSocket framing, or roughly 35 KB/s per player at 15 Hz.

## Honest scale boundary

Version 1 is a **96-player single-world launch**, not an unbounded distributed
simulation. A single authoritative process is intentional: every connected
player sees the same battle and hits never disagree across replicas.

The next scale step is spatial zones backed by Redis presence/pub-sub, with
handoff between adjacent authoritative workers. Do not add Railway replicas to
this service without that coordination layer; independent replicas would create
separate worlds.

## Security and reliability

- The client sends inputs, never positions, damage, scores, or hit claims.
- Names are normalized, control characters and markup are removed, and length
  is capped.
- WebSocket frames are limited to 512 bytes and connections to 90 messages/s.
- The server caps players, checks browser origins when `ALLOWED_ORIGINS` is set,
  enforces fire rate/ammo/reload rules, and rejects friendly-fire claims by
  design.
- Ping/pong liveness, reconnect grace, input acknowledgement, and socket
  backpressure prevent dead or slow clients from degrading the world.
- HTTP responses use a restrictive Content Security Policy and browser security
  headers.
- `/healthz` exposes safe runtime health, player count, tick, uptime, capacity,
  and Railway replica region.

Guest names and reconnect IDs stay in browser local storage. There is no player
database and no chat surface in this release.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm start
```

Open <http://localhost:8080>.

For live client editing, run the realtime server and Vite in separate terminals:

```bash
npm start
npm run dev
```

Vite proxies `/ws` and `/healthz` to port 8080.

## Verification

```bash
npm run check
```

This runs:

- protocol codec tests
- world collision and shared movement tests
- server-authoritative combat tests
- a real two-client WebSocket match covering join, movement, headshot kill,
  death, respawn, malformed input resilience, and same-session reconnect
- the production Vite build

To verify an already-deployed server with two independent secure-WebSocket
clients:

```bash
LIVE_URL=wss://steppe-strike-production.up.railway.app/ws npm run test:live
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP and WebSocket port |
| `NODE_ENV` | `development` | Enables production origin behavior |
| `ALLOWED_ORIGINS` | empty | Comma-separated browser origins |
| `TEST_MODE` | `0` | Deterministic close spawns for automated smoke tests |

## Railway

The repository contains `railway.json` with the production build, start
command, `/healthz` check, and restart policy. The production service is kept in
Railway's Singapore region (`asia-southeast1-eqsg3a`), the closest available
Railway deployment region to the primary Mongolian audience.
