const SERVICE_ID = 'steppe-strike';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

const embedded = (() => {
  if (isLocal) return false;
  try {
    return window.parent !== window || Boolean(window.ReactNativeWebView);
  } catch {
    return true;
  }
})();

const appendAccess = (base, roomId, token) => {
  const url = new URL(base, location.href);
  url.searchParams.set('room_id', roomId);
  url.searchParams.set('token', token);
  return url.toString();
};

async function initializeUsion(usion) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (config) => {
      if (settled) return;
      settled = true;
      resolve(config || usion.config || {});
    };
    const timer = setTimeout(() => {
      if (!settled) reject(new Error('Usion initialization timed out'));
    }, 8_000);
    try {
      const result = usion.init((config) => {
        clearTimeout(timer);
        finish(config);
      });
      if (result?.then) {
        result.then((config) => {
          clearTimeout(timer);
          finish(config);
        }, reject);
      }
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function waitForRoom(usion, initialRoomId) {
  if (initialRoomId) return String(initialRoomId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No Usion room assigned')), 12_000);
    usion.game?.onRoomAssigned?.((info) => {
      const roomId = info?.roomId || usion.config?.roomId;
      if (!roomId) return;
      clearTimeout(timer);
      resolve(String(roomId));
    });
  });
}

function devPlatform() {
  const params = new URLSearchParams(location.search);
  const roomId = (params.get('room') || 'local-room')
    .replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || 'local-room';
  let userId = sessionStorage.getItem('steppe-dev-user');
  if (!userId) {
    userId = `guest-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem('steppe-dev-user', userId);
  }
  const sessionId = sessionStorage.getItem('steppe-dev-session') || crypto.randomUUID();
  sessionStorage.setItem('steppe-dev-session', sessionId);
  return {
    embedded: false,
    name: '',
    roomId,
    resolveUrl: async () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const base = `${protocol}//${location.host}/ws`;
      return appendAccess(base, roomId, `dev:${userId}:${sessionId}`);
    },
  };
}

export async function initializePlatform() {
  if (!embedded) {
    if (!isLocal) throw new Error('Open Steppe Strike from a Usion game room');
    return devPlatform();
  }
  const usion = window.Usion;
  if (!usion?.init || !usion?.game?._fetchDirectAccess) {
    throw new Error('Usion direct-game SDK unavailable');
  }
  const config = await initializeUsion(usion);
  const roomId = await waitForRoom(usion, usion.config?.roomId || config?.roomId);
  return {
    embedded: true,
    roomId,
    name: String(usion.user?.getName?.() || config?.userName || '').trim().slice(0, 18),
    resolveUrl: async () => {
      const access = await usion.game._fetchDirectAccess({
        roomId,
        serviceId: SERVICE_ID,
        protocolVersion: '2',
      });
      if (!access?.ws_url || !access?.access_token) {
        throw new Error('Usion did not grant match access');
      }
      return appendAccess(access.ws_url, roomId, access.access_token);
    },
  };
}
