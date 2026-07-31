import { createHash } from 'node:crypto';

const safeProfile = (value) => (
  value
  && typeof value.user_id === 'string'
  && value.user_id.length > 0
  && value.user_id.length <= 128
);

export async function verifyIframeToken(token, {
  serviceId,
  verifyUrl,
  fetchImpl = fetch,
}) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) {
    throw new Error('Invalid Usion token');
  }

  const response = await fetchImpl(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      expected_service_id: serviceId,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Usion token rejected');

  const profile = await response.json();
  if (!safeProfile(profile)) throw new Error('Invalid Usion profile');
  return {
    userId: profile.user_id,
    name: String(profile.name || '').slice(0, 18),
    session: createHash('sha256')
      .update(`${serviceId}:${profile.user_id}`)
      .digest('base64url')
      .slice(0, 40),
  };
}
