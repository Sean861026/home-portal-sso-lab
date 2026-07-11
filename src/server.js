import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const config = {
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || 'local-lab-change-me',
  clientId: process.env.OIDC_CLIENT_ID || 'home-portal',
  publicIssuer: process.env.OIDC_PUBLIC_ISSUER || 'http://localhost:8080/realms/home',
  internalBase: process.env.OIDC_INTERNAL_BASE || 'http://localhost:8080/realms/home',
  redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:3000/callback'
};

const endpoints = {
  authorization: `${config.publicIssuer}/protocol/openid-connect/auth`,
  token: `${config.internalBase}/protocol/openid-connect/token`,
  jwks: `${config.internalBase}/protocol/openid-connect/certs`,
  logout: `${config.publicIssuer}/protocol/openid-connect/logout`
};
const jwks = createRemoteJWKSet(new URL(endpoints.jwks));
const app = express();

app.set('trust proxy', 1);
app.use(session({
  name: 'home_portal_sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 60 * 1000
  }
}));

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function page(title, body, user) {
  const nav = user
    ? `<span>Hi, ${escapeHtml(user.preferred_username)}</span><a href="/">Dashboard</a><a href="/admin">Admin</a><a href="/logout">Logout</a>`
    : '<a href="/login" class="primary">Login with SSO</a>';
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Home Portal</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui;background:#08111f;color:#e8eef7}body{margin:0}.wrap{max-width:900px;margin:auto;padding:24px}nav{display:flex;gap:18px;align-items:center;justify-content:flex-end;padding:12px 0}nav span{margin-right:auto;color:#9fb0c7}a{color:#72d6c9;text-decoration:none}.primary,button{background:#28b8a8;color:#041512;padding:10px 16px;border-radius:9px;font-weight:700}.hero{padding:70px 0 34px}h1{font-size:clamp(2rem,7vw,4.5rem);line-height:1;margin:.2em 0}.muted{color:#9fb0c7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.card{background:#101e31;border:1px solid #21334b;border-radius:14px;padding:20px}code,pre{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;overflow:auto;background:#050b13;padding:18px;border-radius:10px}.tag{display:inline-block;background:#183b40;color:#8ce7dc;padding:5px 9px;margin:3px;border-radius:99px}.denied{border-color:#7d3341}footer{margin-top:60px;color:#687d98}
</style></head><body><div class="wrap"><nav>${nav}</nav>${body}<footer>Home SSO Lab · OIDC Authorization Code + PKCE</footer></div></body></html>`;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/login', (req, res) => {
  const state = base64url(crypto.randomBytes(24));
  const nonce = base64url(crypto.randomBytes(24));
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  req.session.oidc = { state, nonce, verifier };

  const url = new URL(endpoints.authorization);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: config.redirectUri,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  res.redirect(url.toString());
});

app.get('/callback', async (req, res, next) => {
  try {
    const pending = req.session.oidc;
    if (!pending || !req.query.code || req.query.state !== pending.state) {
      return res.status(400).send(page('登入失敗', '<div class="card denied"><h1>Invalid OIDC callback</h1><p>State 不正確或登入流程已過期。</p></div>'));
    }

    const tokenResponse = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: String(req.query.code),
        redirect_uri: config.redirectUri,
        code_verifier: pending.verifier
      })
    });
    if (!tokenResponse.ok) throw new Error(`Token endpoint returned ${tokenResponse.status}: ${await tokenResponse.text()}`);
    const tokens = await tokenResponse.json();
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: config.publicIssuer,
      audience: config.clientId
    });
    if (payload.nonce !== pending.nonce) throw new Error('ID token nonce mismatch');

    req.session.oidc = undefined;
    req.session.user = payload;
    req.session.idToken = tokens.id_token;
    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

app.get('/', (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.send(page('Welcome', `<section class="hero"><p class="muted">YOUR PRIVATE START PAGE</p><h1>Home Portal</h1><p class="muted">用 Keycloak 練習真正的 OpenID Connect 單一登入。</p><p style="margin-top:30px"><a class="primary" href="/login">Login with SSO →</a></p></section><div class="grid"><div class="card"><h2>Authorization Code</h2><p class="muted">後端接收一次性 code，不在瀏覽器網址暴露 token。</p></div><div class="card"><h2>PKCE</h2><p class="muted">code verifier 綁定登入請求，降低授權碼遭攔截的風險。</p></div><div class="card"><h2>Role-Based Access</h2><p class="muted">用 ID Token 內的 realm roles 保護管理頁面。</p></div></div>`));
  }

  const roles = user.realm_access?.roles || [];
  res.send(page('Dashboard', `<section class="hero"><p class="muted">AUTHENTICATED</p><h1>歡迎，${escapeHtml(user.name || user.preferred_username)}</h1><p class="muted">你已透過 Keycloak 完成 SSO 登入。</p></section><div class="grid"><a class="card" href="http://localhost:3001"><h2>📝 Family Notes</h2><p class="muted">家庭記事與共同清單 →</p></a><a class="card" href="http://localhost:3002"><h2>📅 Family Calendar</h2><p class="muted">共享家庭行程 →</p></a><div class="card"><h2>Identity</h2><p><strong>Username</strong><br>${escapeHtml(user.preferred_username)}</p><p><strong>Email</strong><br>${escapeHtml(user.email)}</p></div><div class="card"><h2>Realm roles</h2><div>${roles.map(role => `<span class="tag">${escapeHtml(role)}</span>`).join('')}</div></div></div><h2 style="margin-top:35px">ID Token claims</h2><pre>${escapeHtml(JSON.stringify(user, null, 2))}</pre>`, user));
});

app.get('/admin', requireLogin, (req, res) => {
  const roles = req.session.user.realm_access?.roles || [];
  if (!roles.includes('admin')) {
    return res.status(403).send(page('Forbidden', '<div class="card denied" style="margin-top:60px"><p class="muted">HTTP 403</p><h1>需要 admin 角色</h1><p>SSO 已確認你的身分，但授權規則不允許進入這一頁。</p></div>', req.session.user));
  }
  res.send(page('Admin', '<section class="hero"><p class="muted">AUTHORIZED: ADMIN</p><h1>控制室</h1><p>只有 ID Token 含有 <code>admin</code> realm role 的使用者看得到這裡。</p></section><div class="card"><h2>🎛️ Secret home controls</h2><p class="muted">這裡之後可以接 NAS、Home Assistant 或其他內部服務。</p></div>', req.session.user));
});

app.get('/logout', (req, res) => {
  const idToken = req.session.idToken;
  req.session.destroy(() => {
    const url = new URL(endpoints.logout);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      post_logout_redirect_uri: 'http://localhost:3000/',
      ...(idToken ? { id_token_hint: idToken } : {})
    });
    res.redirect(url.toString());
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).send(page('Error', `<div class="card denied" style="margin-top:60px"><h1>Something went wrong</h1><pre>${escapeHtml(error.message)}</pre></div>`));
});

app.listen(config.port, () => {
  console.log(`Home Portal listening on http://localhost:${config.port}`);
});
