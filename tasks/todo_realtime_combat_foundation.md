# Realtime Combat Foundation

## Product contract

- [x] Preserve the voxel-world identity while making competitive maps immutable during rounds.
- [x] Keep creative mining/building outside the competitive match simulation.
- [x] Support equivalent desktop and touch gameplay, with input-specific controls only.
- [x] Keep Usion outside the per-frame gameplay path.

## 1. Usion direct room access

- [x] Resolve the Usion-assigned `roomId` before connecting.
- [x] Request protocol-v2 direct access and use the returned `wss` URL and RS256 token.
- [x] Verify issuer, audience, service, room, session, and `play` permission against Usion JWKS.
- [x] Retain a standalone development identity only behind an explicit non-production flag.

## 2–3. Rooms and 60 Hz movement

- [x] Replace the singleton player simulation with isolated `roomId -> Match` state.
- [x] Support 2–10 human seats with short reconnect reservations.
- [x] Run server simulation at a fixed 60 Hz with drift and overrun telemetry.
- [x] Send compact binary inputs at 60 Hz and snapshots at 20–30 Hz.
- [x] Predict local movement, reconcile acknowledged input, and interpolate remote players.

## 4–6. Authoritative combat

- [x] Add one rifle with server-owned ammo, fire rate, reload, spread, and damage.
- [x] Add server-owned hitscan and line-of-sight checks.
- [x] Retain bounded transform history and rewind targets for lag-compensated shots.
- [x] Add health, death, respawn, and reconnect-safe combat state.
- [x] Reject impossible input state, invalid angles, stale sequences, duplicate fire nonces, and malformed packets.

## 7–9. Match loop and Usion results

- [x] Balance teams and use fixed protected spawns.
- [x] Add warmup, live round, round end, score limit, and match end.
- [x] Add spectator behavior for dead players.
- [x] Submit exactly one signed result to Usion after a completed match.
- [x] Never let the client decide damage, score, winner, or result submission.

## 10. Verification and production

- [x] Unit-test codecs, movement, collision, hits, rewind bounds, teams, and rounds.
- [x] Run real multi-client tests for join, movement, shooting, death, respawn, reconnect, and result.
- [x] Add malformed-input, rate-limit, duplicate-session, and stale-input tests.
- [x] Test with 150 ms latency, 60 ms jitter, and 5% loss simulation.
- [x] Load-test concurrent ten-player rooms and record server tick p95/p99.
- [x] Play-test desktop and touch controls in a real browser.
- [ ] Deploy one stateful Singapore replica and verify authenticated production access.
- [ ] Keep Usion unpublished until all quality gates pass.
- [ ] Delete this completed task file.
