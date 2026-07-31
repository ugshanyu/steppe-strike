import { CombatMap } from '../shared/combat-map.js';
import { MatchRoom } from './match-room.js';

export class RoomManager {
  constructor({
    roomOptions = {},
    resultReporter = null,
  } = {}) {
    this.roomOptions = roomOptions;
    this.resultReporter = resultReporter;
    this.map = new CombatMap();
    this.rooms = new Map();
    this.onEvent = () => {};
  }

  getOrCreate(roomId, now = Date.now()) {
    let room = this.rooms.get(roomId);
    if (room) return room;
    room = new MatchRoom(roomId, {
      ...this.roomOptions,
      now,
      map: this.map,
      emit: (payload) => this.onEvent(room, payload),
      complete: (completedRoom, result) => this.handleResult(completedRoom, result),
    });
    this.rooms.set(roomId, room);
    return room;
  }

  join(identity, name, ws, now = Date.now()) {
    return this.getOrCreate(identity.roomId, now).join(identity, name, ws, now);
  }

  step(now = Date.now()) {
    for (const room of this.rooms.values()) room.step(now);
  }

  async handleResult(room, result) {
    if (!this.resultReporter) return;
    try {
      await this.resultReporter.submit(room, result);
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'result_submit_failed',
        roomId: room.id,
        reason: error.message,
      }));
    }
  }

  health() {
    let players = 0;
    for (const room of this.rooms.values()) players += room.match.connectedSeats().length;
    return {
      rooms: this.rooms.size,
      players,
      capacityPerRoom: 10,
    };
  }
}
