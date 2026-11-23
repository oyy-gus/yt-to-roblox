import { Router } from 'express';
import crypto from 'crypto';
import { validateRobloxCredentials } from '../services/robloxService.js';

const router = Router();

const ROBLOX_OAUTH_AUTHORIZE = 'https://apis.roblox.com/oauth/v1/authorize';
const ROBLOX_OAUTH_TOKEN = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_OAUTH_USERINFO = 'https://apis.roblox.com/oauth/v1/userinfo';

interface PendingOAuthState {
  codeVerifier: string;
  frontendRedirect: string;
  createdAt: number;
}

interface CompletedOAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  createdAt: number;
}

const pendingStates = new Map<string, PendingOAuthState>();
const completedSessions = new Map<string, CompletedOAuthSession>();

function cleanupExpiredOAuth() {
  const now = Date.now();
  for (const [k, v] of pendingStates.entries()) {
    if (now - v.createdAt > 10 * 60 * 1000) pendingStates.delete(k);
  }
  for (const [k, v] of completedSessions.entries()) {
    if (now - v.createdAt > 5 * 60 * 1000) completedSessions.delete(k);
  }
}

function getOAuthEnv(req?: any) {
  const clientId = (process.env.ROBLOX_CLIENT_ID || '').trim();
  const clientSecret = (process.env.ROBLOX_CLIENT_SECRET || '').trim();
  const envRedirect = (process.env.ROBLOX_REDIRECT_URI || '').trim();
  const inferredRedirect = req
    ? `${req.protocol}://${req.get('host')}/api/roblox/oauth/callback`
    : 'http://localhost:5000/api/roblox/oauth/callback';
  const redirectUri = envRedirect || inferredRedirect;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  return { clientId, clientSecret, redirectUri, frontendUrl };
}

router.get('/oauth/status', (req, res) => {
  const { clientId, redirectUri } = getOAuthEnv(req);
  return res.json({
    success: true,
    configured: Boolean(clientId),
    redirectUri
  });
});

router.get('/oauth/login', (req, res) => {
  cleanupExpiredOAuth();
  const { clientId, redirectUri, frontendUrl } = getOAuthEnv(req);

  const requestedRedirect = typeof req.query.redirect === 'string' && req.query.redirect.startsWith('http')
    ? req.query.redirect.replace(/\/+$/, '')
    : frontendUrl;

  if (!clientId) {
    return res.redirect(`${requestedRedirect}/?roblox_oauth_error=${encodeURIComponent('ROBLOX_CLIENT_ID belum dikonfigurasi di backend/.env')}`);
  }

  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  pendingStates.set(state, {
    codeVerifier,
    frontendRedirect: requestedRedirect,
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile asset:read asset:write',
    response_type: 'code',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  return res.redirect(`${ROBLOX_OAUTH_AUTHORIZE}?${params.toString()}`);
});

router.get('/oauth/callback', async (req, res) => {
  cleanupExpiredOAuth();
  const { clientId, clientSecret, redirectUri, frontendUrl } = getOAuthEnv(req);
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  const pending = state ? pendingStates.get(state) : undefined;
  if (state) pendingStates.delete(state);
  const targetRedirect = pending?.frontendRedirect || frontendUrl;

  if (error) {
    return res.redirect(`${targetRedirect}/?roblox_oauth_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !pending) {
    return res.redirect(`${targetRedirect}/?roblox_oauth_error=${encodeURIComponent('Sesi login OAuth tidak valid atau sudah kedaluwarsa.')}`);
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pending.codeVerifier
    });
    if (clientSecret) {
      tokenParams.set('client_secret', clientSecret);
    }

    const tokenRes = await fetch(ROBLOX_OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    const tokenData = await tokenRes.json().catch(() => ({})) as any;
    if (!tokenRes.ok || !tokenData.access_token) {
      const msg = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
      return res.redirect(`${targetRedirect}/?roblox_oauth_error=${encodeURIComponent(`Gagal menukar token Roblox: ${msg}`)}`);
    }

    const userRes = await fetch(ROBLOX_OAUTH_USERINFO, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json().catch(() => ({})) as any;

    if (!userRes.ok || !userData.sub) {
      return res.redirect(`${targetRedirect}/?roblox_oauth_error=${encodeURIComponent('Gagal mengambil profil akun Roblox.')}`);
    }

    const sessionId = crypto.randomBytes(24).toString('hex');
    completedSessions.set(sessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      userId: String(userData.sub),
      username: String(userData.preferred_username || userData.name || `User ${userData.sub}`),
      avatarUrl: userData.picture ? String(userData.picture) : undefined,
      createdAt: Date.now()
    });

    return res.redirect(`${targetRedirect}/?roblox_oauth=${sessionId}`);
  } catch (err: any) {
    return res.redirect(`${targetRedirect}/?roblox_oauth_error=${encodeURIComponent(err.message || 'Kesalahan OAuth Roblox.')}`);
  }
});

router.get('/oauth/session/:sessionId', (req, res) => {
  cleanupExpiredOAuth();
  const session = completedSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Sesi OAuth tidak ditemukan atau sudah kedaluwarsa.' });
  }
  completedSessions.delete(req.params.sessionId);
  return res.json({
    success: true,
    data: {
      accessToken: session.accessToken,
      userId: session.userId,
      username: session.username,
      avatarUrl: session.avatarUrl
    }
  });
});

router.post('/validate', async (req, res) => {
  try {
    const { apiKey, accessToken, creatorId, creatorType = 'user' } = req.body;
    const result = await validateRobloxCredentials({ apiKey, accessToken, creatorId, creatorType });
    return res.json({
      success: result.isValid,
      message: result.reason
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Terjadi kesalahan saat memeriksa akun Roblox: ${err.message}`
    });
  }
});

export default router;
