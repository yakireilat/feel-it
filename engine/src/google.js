// Google Business Profile: read new reviews and post owner-approved replies.
// Needs an OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) and, per client, a refresh token
// from the business owner's Google account, named by client.google.refreshTokenEnv.
const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const API = 'https://mybusiness.googleapis.com/v4';

export function createGoogle({
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (!clientId || !clientSecret) return null;
  const tokens = new Map();

  async function accessToken(g) {
    const refreshToken = env[g.refreshTokenEnv];
    if (!refreshToken) throw new Error(`env var ${g.refreshTokenEnv} (Google refresh token) is not set`);
    const cached = tokens.get(refreshToken);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    if (!res.ok) throw Object.assign(new Error(`Google token ${res.status}`), { status: res.status });
    const data = await res.json();
    tokens.set(refreshToken, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
    return data.access_token;
  }

  async function call(g, method, path, body) {
    const res = await fetchImpl(`${API}/accounts/${g.accountId}/locations/${g.locationId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken(g)}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) throw Object.assign(new Error(`Google ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
    return res.json();
  }

  return {
    async listReviews(g) {
      const data = await call(g, 'GET', '/reviews?pageSize=50&orderBy=updateTime%20desc');
      return (data.reviews ?? []).map((r) => ({
        reviewId: r.reviewId,
        author: r.reviewer?.isAnonymous ? '' : r.reviewer?.displayName ?? '',
        rating: STARS[r.starRating] ?? null,
        text: r.comment ?? '',
        replied: Boolean(r.reviewReply),
      }));
    },
    replyToReview: (g, reviewId, comment) => call(g, 'PUT', `/reviews/${reviewId}/reply`, { comment }),
  };
}
