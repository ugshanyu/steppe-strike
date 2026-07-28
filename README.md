# Steppe World

**One persistent block world where everyone explores, mines, and builds together.**

Steppe World is a Mongolian-first creative multiplayer world. There are no
weapons, teams, matches, room codes, or downloads. Choose a name and enter the
same living world as everyone else.

**World:** [steppe-strike-production.up.railway.app](https://steppe-strike-production.up.railway.app)

## Creative World Alpha

- One deterministic, effectively endless shared voxel landscape
- Hills, coastlines, water, soil, caves, coal, iron, and cross-chunk trees
- Server-authoritative mining with block-specific hardness
- Adjacent-face block placement with collision and spawn protection
- Six unlimited creative materials: grass, dirt, stone, sand, logs, and planks
- Persistent world edits that survive server restarts and deployments
- Instant guest identity with reconnect recovery
- Equivalent desktop and touch gameplay
- Mongolian-first interface

Survival meters, crafting, mobs, trading, and combat are intentionally outside
this milestone. The first product loop is simple: explore, mine, build, leave,
and return to the same world.

## Controls

| Desktop | Action | Mobile |
|---|---|---|
| `WASD` / arrows | Move | Left joystick |
| Mouse | Look | Swipe the world |
| Hold left click | Mine | Hold `УХАХ` |
| Right click | Place | Tap `ТАВИХ` |
| `Space` | Jump | Tap `ҮСРЭХ` |
| `1`–`6` / wheel | Select block | Tap hotbar |

## World model

```text
Browser
  ├─ deterministic chunk generation
  ├─ face-culled chunk meshes
  ├─ predicted block-aware movement
  └─ compact inputs at 30 Hz
          │ secure WebSocket
          ▼
Railway / Singapore
  ├─ one authoritative shared world
  ├─ validated mining and placement
  ├─ interest-bounded player snapshots
  └─ durable block edits on a mounted volume
```

Terrain is generated from seed `7282026` on both client and server, so base
chunks consume no network bandwidth. Only validated block differences are
stored and synchronized. Negative chunk coordinates use floor-based indexing,
trees are deterministic across chunk seams, and edits collapse when a block is
restored to its generated value.

The realtime transport follows the useful foundations in
[`ugshanyu/tank`](https://github.com/ugshanyu/tank): a fixed-rate authoritative
server, shared movement rules, client prediction and reconciliation, compact
binary messages, bounded rates, liveness checks, backpressure handling, and
real multi-client protocol tests.

## Current scale boundary

Creative World Alpha is one authoritative process with capacity for **96
simultaneous players**. Every connected person sees the same block edits.

Do not add independent Railway replicas without spatial coordination and shared
edit propagation; separate replicas would create diverging worlds. The future
scale path is spatial workers with Redis presence/pub-sub and deterministic
handoff at zone boundaries.

## Security and reliability

- Clients send intentions, never trusted positions or block mutations.
- The server validates reach, line of sight, mining duration, placement face,
  world bounds, player overlap, and protected spawn blocks.
- Names are normalized, stripped of control characters and markup, and capped.
- WebSocket payloads, input rates, chunk interest, save frequency, and in-memory
  edit growth are bounded.
- World saves use a versioned format and atomic file replacement.
- Corrupt saves fall back safely to the documented seed and emit a structured
  error.
- Ping/pong liveness, reconnect grace, input acknowledgement, and socket
  backpressure prevent dead or slow clients from degrading the world.
- HTTP responses use a restrictive Content Security Policy and security headers.
- `/healthz` reports safe runtime, population, revision, edit, and persistence
  health.

Guest names and reconnect IDs stay in browser local storage. Inside Usion, the
host's short-lived, service-scoped token is verified and its display name is
used. There is no player database or chat surface in this milestone.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm start
```

Open <http://localhost:8080>. For live client editing, run `npm start` and
`npm run dev` in separate terminals; Vite proxies `/ws` and `/healthz`.

## Verification

```bash
npm run check
```

The check covers deterministic terrain, negative chunk seams, resource
distribution, safe spawn, voxel collision, ray selection, protocol validation,
authoritative mining and placement, atomic persistence, corrupt-save recovery,
a real two-client shared edit, restart recovery, and the production build.

To test an already deployed world:

```bash
LIVE_URL=wss://steppe-strike-production.up.railway.app/ws npm run test:live
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP and WebSocket port |
| `NODE_ENV` | `development` | Enables production origin behavior |
| `ALLOWED_ORIGINS` | empty | Comma-separated browser origins |
| `WORLD_DATA_PATH` | `.data/steppe-world.json` locally, `/data/steppe-world.json` in production | Durable edit file |
| `TEST_MODE` | `0` | Stable close spawns for automated tests |
| `SERVICE_ID` | `steppe-strike` | Usion registry identity |
| `USION_VERIFY_URL` | `https://mobile.mongolai.mn/iframe/verify-token` | Scoped iframe-token verification |

`railway.json` defines the production build, start command, health check, and
restart policy. The service runs in Railway's Singapore region
(`asia-southeast1-eqsg3a`), the closest available Railway region to Mongolia.
