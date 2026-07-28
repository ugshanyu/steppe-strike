# Steppe Strike Launch Plan

## Product

- [x] Ship one public, shared voxel battlefield with instant guest entry.
- [x] Make the first session obvious on desktop and mobile: enter a name, join,
      move, aim, fire, reload, jump, and respawn.
- [x] Use Mongolian-first flavor and defaults without blocking international
      players.
- [x] Provide team deathmatch, health, ammo, headshots, kill feed, scoreboard,
      connection quality, and automatic team balancing.

## Realtime Architecture

- [x] Serve the built browser client and WebSocket endpoint from one Node
      service to keep deployment and origin policy simple.
- [x] Generate the voxel map deterministically on client and server so terrain
      is not sent over the network.
- [x] Run an authoritative fixed-rate server simulation. Accept inputs, never
      client positions or client-declared hits.
- [x] Use compact binary input and snapshot messages, client prediction for the
      local player, interpolation for remote players, bounded queues,
      connection caps, idle timeouts, payload limits, and socket backpressure.
- [x] Keep every player in the same public world for launch, with a clear
      capacity limit and structured health/runtime metrics.

## Client

- [x] Build a polished Three.js voxel world inspired by the Mongolian steppe.
- [x] Add pointer-lock desktop controls and touch-first dual-stick mobile
      controls.
- [x] Add responsive HUD, crosshair, hit feedback, damage direction, kill feed,
      scoreboard, reconnect status, and accessible reduced-motion behavior.
- [x] Keep client modules focused and under the repository file-size guideline.

## Verification

- [x] Unit-test protocol codecs, validation, world collision, and combat math.
- [x] Run a real two-client WebSocket smoke match covering join, movement,
      shooting, death, respawn, reconnect, and malformed input resilience.
- [x] Build the production client and run dependency/security checks.
- [x] Exercise desktop and mobile layouts in a real browser and inspect visual
      output.

## Publication

- [x] Document local play, architecture, controls, capacity, security, and
      honest scaling boundaries.
- [ ] Commit and push the complete repository to GitHub.
- [ ] Create a dedicated Railway project/service from this repository.
- [ ] Deploy in Railway's Singapore region and verify the public HTTPS/WSS game,
      health endpoint, and two live production clients.
- [ ] Delete this task file only after every item is complete and verified.
