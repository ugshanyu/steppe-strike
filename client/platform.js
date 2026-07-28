const embedded = (() => {
  try {
    return window.parent !== window || Boolean(window.ReactNativeWebView);
  } catch {
    return true;
  }
})();

export async function initializePlatform() {
  if (!embedded) {
    return {
      embedded: false,
      name: '',
      getToken: () => '',
    };
  }

  const usion = window.Usion;
  if (!usion?.init || !usion?.user) {
    throw new Error('Usion SDK unavailable');
  }

  await usion.init({ timeout: 8000 });
  for (let attempt = 0; attempt < 40 && !usion.user.getToken?.(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!usion.user.getToken?.()) throw new Error('Usion identity unavailable');

  return {
    embedded: true,
    name: String(usion.user.getName?.() || '').trim().slice(0, 18),
    // The host refreshes this scoped token during long-running sessions.
    // Read it immediately before every WebSocket (re)connect.
    getToken: () => String(usion.user.getToken?.() || ''),
  };
}
