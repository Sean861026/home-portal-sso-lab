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
const publicHost = process.env.PUBLIC_HOST || 'localhost';
const publicBase = `http://${publicHost}`;

const endpoints = {
  authorization: `${config.publicIssuer}/protocol/openid-connect/auth`,
  token: `${config.internalBase}/protocol/openid-connect/token`,
  jwks: `${config.internalBase}/protocol/openid-connect/certs`,
  logout: `${config.publicIssuer}/protocol/openid-connect/logout`
};
const jwks = createRemoteJWKSet(new URL(endpoints.jwks));
const app = express();
const secureCookies = process.env.COOKIE_SECURE === 'true';

app.set('trust proxy', 1);
app.use(session({
  name: 'home_portal_sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
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
:root{--bg:#06101f;--panel:rgba(14,31,52,.74);--panel2:rgba(18,39,64,.62);--line:rgba(126,173,205,.16);--cyan:#5eead4;--blue:#67e8f9;--text:#eef8ff;--muted:#8faabe;--danger:#fb7185;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:var(--text);background:var(--bg)}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 78% -5%,rgba(18,143,154,.22),transparent 34%),radial-gradient(circle at 5% 95%,rgba(30,64,175,.17),transparent 32%),linear-gradient(145deg,#050c18,#081526 55%,#06111f);background-attachment:fixed}.wrap{max-width:1180px;margin:auto;padding:22px 30px 40px}nav{position:sticky;top:14px;z-index:5;display:flex;gap:8px;align-items:center;padding:10px 12px;margin-bottom:24px;border:1px solid var(--line);border-radius:15px;background:rgba(5,14,27,.78);backdrop-filter:blur(20px);box-shadow:0 18px 45px rgba(0,0,0,.18)}nav:before{content:"⌂  HOME PORTAL";color:var(--cyan);font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;margin-right:auto}nav span{color:var(--muted);font:500 11px ui-monospace,SFMono-Regular,Consolas,monospace}nav a{padding:8px 11px;border-radius:9px}a{color:var(--cyan);text-decoration:none;transition:.18s ease}a:hover{color:var(--blue)}.primary,button{display:inline-block;border:1px solid rgba(94,234,212,.3);background:linear-gradient(135deg,var(--cyan),#22d3ee);color:#07131f;padding:11px 17px;border-radius:10px;font-weight:750;box-shadow:0 10px 28px rgba(34,211,238,.12)}.hero{position:relative;overflow:hidden;padding:48px 34px;margin-top:12px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(115deg,rgba(17,41,67,.88),rgba(8,28,48,.74));box-shadow:0 22px 55px rgba(0,0,0,.22)}.hero:after{content:"";position:absolute;right:-95px;top:-170px;width:520px;height:420px;border-radius:50%;background:repeating-radial-gradient(circle,transparent 0 35px,rgba(94,234,212,.055) 36px 37px);pointer-events:none}.hero>.muted:first-child{color:var(--cyan);font:600 10px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.17em}.hero h1{font-size:clamp(2.4rem,6vw,4.8rem);line-height:.98;letter-spacing:-.055em;margin:.18em 0;font-weight:650}.hero p{position:relative;z-index:1}.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:16px;margin-top:16px}.card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:17px;padding:22px;box-shadow:0 20px 48px rgba(0,0,0,.2);backdrop-filter:blur(16px);transition:transform .18s,border-color .18s}.card:hover{transform:translateY(-2px);border-color:rgba(94,234,212,.3)}.card h2{font-size:15px;margin:0 0 11px}.card p{line-height:1.6}.grid>a.card h2{color:var(--text)}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}pre{white-space:pre-wrap;overflow:auto;background:rgba(2,8,18,.8);border:1px solid var(--line);padding:20px;border-radius:14px;color:#bad2df;font-size:12px;line-height:1.55}.tag{display:inline-block;background:rgba(94,234,212,.09);border:1px solid rgba(94,234,212,.22);color:var(--cyan);padding:6px 10px;margin:3px;border-radius:99px;font:600 10px ui-monospace,SFMono-Regular,Consolas,monospace}.denied{border-color:rgba(251,113,133,.5)}footer{margin-top:50px;padding-top:18px;border-top:1px solid var(--line);color:#668297;font:500 10px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em}@media(max-width:720px){.wrap{padding:14px}.hero{padding:34px 22px}nav{position:static;flex-wrap:wrap}nav:before{width:100%}.grid{grid-template-columns:1fr}}
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
  res.send(page('Dashboard', `<section class="hero"><p class="muted">AUTHENTICATED</p><h1>歡迎，${escapeHtml(user.name || user.preferred_username)}</h1><p class="muted">你已透過 Keycloak 完成 SSO 登入。</p></section><div class="grid"><a class="card" href="${publicBase}:3001"><h2>📝 Family Notes</h2><p class="muted">家庭記事與共同清單 →</p></a><a class="card" href="${publicBase}:3002"><h2>📅 Family Calendar</h2><p class="muted">共享家庭行程 →</p></a><div class="card"><h2>Identity</h2><p><strong>Username</strong><br>${escapeHtml(user.preferred_username)}</p><p><strong>Email</strong><br>${escapeHtml(user.email)}</p></div><div class="card"><h2>Realm roles</h2><div>${roles.map(role => `<span class="tag">${escapeHtml(role)}</span>`).join('')}</div></div></div><h2 style="margin-top:35px">ID Token claims</h2><pre>${escapeHtml(JSON.stringify(user, null, 2))}</pre>`, user));
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
      post_logout_redirect_uri: `${publicBase}:3000/`,
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
