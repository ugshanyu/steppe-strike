# Steppe Strike

**The original Steppe World, minimized into a real-time team match with shooting added.**

Steppe Strike keeps the approved Minecraft-style world foundation: deterministic
terrain, hills, coastlines, water, soil, caves, ore, trees, voxel collision,
chunk rendering, and the original block palette. Competitive rooms use one
roughly 80×56-block region of that world and make it immutable for the match.

The game is Mongolian-first and is built for 2–10 players per Usion room.

## Current match

- Original Steppe World terrain seed: `7282026`
- Small protected world boundary; no replacement arena terrain
- Balanced attacker and defender teams
- Warmup, live round, round end, score limit, and match end
- One server-owned rifle with ammo, reload, fire rate, movement/burst spread,
  body damage, and headshots
- Server-owned health, death, spectating, round respawn, scores, and results
- 60 Hz authoritative simulation and 20 Hz compact binary snapshots
- Local prediction/reconciliation and 100 ms remote-player interpolation
- Maximum 200 ms target rewind for lag-compensated hits
- Equivalent keyboard/mouse and touch control surfaces

Creative mining, placement, persistence, and the full procedural world engine
remain in the repository. Competitive rooms intentionally freeze block edits so
the server and every player always use the same collision and line-of-sight map.

## Controls

| Desktop | Action | Mobile |
|---|---|---|
| `WASD` / arrows | Move | Left joystick |
| Mouse | Look | Swipe the world |
| Left click | Fire | Hold `ГАЛ` |
| `R` | Reload | Tap `R` |
| `Space` | Jump | Tap `↑` |

## Realtime architecture

```text
Usion
  ├─ matchmaking, room membership, invites
  ├─ short-lived room-bound RS256 access token
  └─ leaderboard/result ingestion
            │ direct WebSocket
            ▼
Steppe Strike server
  ├─ isolated roomId → Match state
  ├─ 2–10 retained seats and reconnect grace
  ├─ drift-corrected 60 Hz simulation
  ├─ movement, collision, rifle, health, teams, rounds
  ├─ transform history and bounded lag compensation
  └─ HMAC-signed, idempotent final result
            │
            ▼
Browser
  ├─ unchanged deterministic Steppe World generation
  ├─ compact 60 Hz intentions
  ├─ local prediction and server reconciliation
  └─ buffered remote interpolation
```

Usion is never in the per-frame gameplay path. It authorizes entry before the
socket connects and receives one signed result after the match.

## Security and reliability

- Production sockets accept only Usion RS256 tokens scoped to the exact
  service, room, session, audience, issuer, expiry, and `play` permission.
- Unsigned development users require `DEV_ALLOW_UNSIGNED=1` and cannot be
  enabled in production.
- Clients send intentions, not positions, hits, damage, health, scores, or
  winners.
- World collision and bullet occlusion use the same deterministic block map.
- Payload size, message rate, socket backpressure, reconnect seats, and rewind
  time are bounded.
- The fixed ticker reports p95/p99 execution time, drift, overruns, and dropped
  catch-up steps through `/healthz`.
- Direct results use HMAC-SHA256 and an idempotency key.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run build
DEV_ALLOW_UNSIGNED=1 npm start
```

Open <http://localhost:8080>. Local rooms can be selected with
`?room=local-room`.

## Verification

```bash
npm run check
```

This runs unit tests, a real WebSocket smoke match, an adverse-network
simulation at 150 ms latency / 60 ms jitter / 5% loss, a 500-player load gate,
and the production build.

The current local load gate simulates 50 simultaneous ten-player rooms:

```text
500 players · 60 Hz · tick p99 ≈4 ms · frame budget 16.667 ms
```

Authenticated production verification requires two access tokens issued by the
same Usion room:

```bash
LIVE_URL=wss://HOST/ws \
LIVE_ROOM_ID=ROOM \
LIVE_ACCESS_TOKEN_ALPHA=TOKEN \
LIVE_ACCESS_TOKEN_BRAVO=TOKEN \
npm run test:live
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP and WebSocket port |
| `NODE_ENV` | `development` | Production security boundary |
| `SERVICE_ID` | `steppe-strike` | Usion service identity |
| `USION_JWKS_URL` | Usion production JWKS | RS256 access verification |
| `USION_API_URL` | `https://mobile.mongolai.mn` | Signed result destination |
| `USION_RESULT_KEY_ID` | empty | Registered result-signing key |
| `USION_RESULT_SECRET` | empty | Result HMAC secret |
| `ALLOWED_ORIGINS` | empty | Optional browser-origin allowlist |
| `DEV_ALLOW_UNSIGNED` | `0` | Explicit local-only development access |
| `TEST_MODE` | `0` | Short automated-test match timings |

`railway.json` defines the Railway build, health check, start command, and
restart policy. Keep the Usion service unpublished until authenticated
production access, result submission, desktop play, and touch play all pass.
