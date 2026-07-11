import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import express from 'express';
import session from 'express-session';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const kind = process.env.APP_KIND === 'calendar' ? 'calendar' : 'notes';
const port = Number(process.env.PORT || (kind === 'calendar' ? 3002 : 3001));
const clientId = process.env.OIDC_CLIENT_ID || `family-${kind}`;
const publicIssuer = process.env.OIDC_PUBLIC_ISSUER || 'http://localhost:8080/realms/home';
const internalBase = process.env.OIDC_INTERNAL_BASE || publicIssuer;
const redirectUri = process.env.OIDC_REDIRECT_URI || `http://localhost:${port}/callback`;
const dataFile = process.env.DATA_FILE || `./data/${kind}.json`;
const label = kind === 'calendar' ? 'Family Calendar' : 'Family Notes';
const icon = kind === 'calendar' ? '📅' : '📝';
const jwks = createRemoteJWKSet(new URL(`${internalBase}/protocol/openid-connect/certs`));
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: `${kind}_sid`,
  secret: process.env.SESSION_SECRET || `local-${kind}-secret`,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 60 * 60 * 1000 }
}));

const esc = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const random = () => crypto.randomBytes(24).toString('base64url');
const rolesOf = user => user?.realm_access?.roles || [];
const isAdmin = user => rolesOf(user).includes('admin');

async function loadItems() {
  try { return JSON.parse(await readFile(dataFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function saveItems(items) {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(items, null, 2));
}

function csrf(req) {
  if (!req.session.csrf) req.session.csrf = random();
  return req.session.csrf;
}

function layout(title, body, user) {
  const nav = user ? `<span>${esc(user.preferred_username)}</span><a href="http://localhost:3000">Portal</a><a href="/leave">離開此 App</a>` : '<a class="button" href="/login">使用 SSO 登入</a>';
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${label}</title><style>
*{box-sizing:border-box}:root{font-family:Inter,system-ui;background:#f6f2ea;color:#292824}body{margin:0}.wrap{max-width:920px;margin:auto;padding:24px}nav{display:flex;align-items:center;justify-content:flex-end;gap:18px}nav span{margin-right:auto;color:#716d64}a{color:#335d7a;text-decoration:none}.hero{padding:55px 0 25px}h1{font-size:clamp(2.5rem,7vw,5rem);margin:.1em 0}.muted{color:#777167}.button,button{border:0;border-radius:9px;background:#315d79;color:white;padding:10px 15px;font-weight:700;cursor:pointer}.form,.item{background:white;border:1px solid #ddd4c6;border-radius:14px;padding:18px;margin:14px 0;box-shadow:0 4px 18px #342b1c0a}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}input,textarea{width:100%;border:1px solid #cfc6b8;border-radius:8px;padding:11px;font:inherit;margin:5px 0 12px}textarea{min-height:90px}.meta{font-size:.85rem;color:#888074}.item h2{margin:.2em 0}.danger{background:#a74343;float:right}.empty{text-align:center;padding:50px;color:#888074}@media(max-width:600px){.row{grid-template-columns:1fr}}
</style></head><body><div class="wrap"><nav>${nav}</nav>${body}</div></body></html>`;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true, app: kind }));
app.get('/login', (req, res) => {
  const state = random(); const nonce = random(); const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  req.session.oidc = { state, nonce, verifier };
  const url = new URL(`${publicIssuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'openid profile email', redirect_uri: redirectUri, state, nonce, code_challenge: challenge, code_challenge_method: 'S256' });
  res.redirect(url.toString());
});

app.get('/callback', async (req, res, next) => {
  try {
    const pending = req.session.oidc;
    if (!pending || req.query.state !== pending.state || !req.query.code) return res.status(400).send('Invalid OIDC callback');
    const response = await fetch(`${internalBase}/protocol/openid-connect/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: String(req.query.code), redirect_uri: redirectUri, code_verifier: pending.verifier }) });
    if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
    const tokens = await response.json();
    const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: publicIssuer, audience: clientId });
    if (payload.nonce !== pending.nonce) throw new Error('Nonce mismatch');
    req.session.oidc = undefined; req.session.user = payload;
    res.redirect('/');
  } catch (error) { next(error); }
});

app.get('/', (req, res) => {
  if (!req.session.user) return res.send(layout(label, `<section class="hero"><p class="muted">AN INDEPENDENT OIDC CLIENT</p><h1>${icon} ${label}</h1><p>先登入 Home Portal，再點這裡。Keycloak 不會再次詢問密碼，這就是 SSO。</p><p style="margin-top:28px"><a class="button" href="/login">使用 SSO 登入 →</a></p></section>`));
  res.redirect('/items');
});

app.get('/items', requireLogin, async (req, res, next) => {
  try {
    const items = (await loadItems()).sort((a, b) => String(a.date || a.createdAt).localeCompare(String(b.date || b.createdAt)));
    const token = csrf(req);
    const fields = kind === 'calendar'
      ? `<div class="row"><label>活動名稱<input name="title" required maxlength="80"></label><label>日期與時間<input name="date" type="datetime-local" required></label></div><label>備註<textarea name="body" maxlength="500"></textarea></label>`
      : `<label>標題<input name="title" required maxlength="80"></label><label>內容<textarea name="body" required maxlength="1000"></textarea></label>`;
    const cards = items.map(item => {
      const canDelete = isAdmin(req.session.user) || item.owner === req.session.user.sub;
      return `<article class="item">${canDelete ? `<form method="post" action="/items/${encodeURIComponent(item.id)}/delete"><input type="hidden" name="csrf" value="${token}"><button class="danger">刪除</button></form>` : ''}<p class="meta">${esc(item.author)}${item.date ? ` · ${esc(new Date(item.date).toLocaleString('zh-TW'))}` : ''}</p><h2>${esc(item.title)}</h2><p>${esc(item.body).replaceAll('\n', '<br>')}</p></article>`;
    }).join('') || '<div class="empty">還沒有內容，新增第一筆吧。</div>';
    res.send(layout(label, `<section class="hero"><p class="muted">SSO CONNECTED</p><h1>${icon} ${label}</h1><p>登入身分：${esc(req.session.user.email)}</p></section><form class="form" method="post" action="/items"><input type="hidden" name="csrf" value="${token}">${fields}<button>新增${kind === 'calendar' ? '行程' : '記事'}</button></form><section>${cards}</section>`, req.session.user));
  } catch (error) { next(error); }
});

app.post('/items', requireLogin, async (req, res, next) => {
  try {
    if (!req.session.csrf || req.body.csrf !== req.session.csrf) return res.status(403).send('Invalid CSRF token');
    const title = String(req.body.title || '').trim(); const body = String(req.body.body || '').trim(); const date = String(req.body.date || '');
    if (!title || (kind === 'notes' && !body) || (kind === 'calendar' && !date)) return res.status(400).send('Missing required fields');
    const items = await loadItems();
    items.push({ id: crypto.randomUUID(), title: title.slice(0, 80), body: body.slice(0, kind === 'notes' ? 1000 : 500), date: kind === 'calendar' ? date : undefined, owner: req.session.user.sub, author: req.session.user.preferred_username, createdAt: new Date().toISOString() });
    await saveItems(items); res.redirect('/items');
  } catch (error) { next(error); }
});

app.post('/items/:id/delete', requireLogin, async (req, res, next) => {
  try {
    if (!req.session.csrf || req.body.csrf !== req.session.csrf) return res.status(403).send('Invalid CSRF token');
    const items = await loadItems(); const item = items.find(entry => entry.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    if (!isAdmin(req.session.user) && item.owner !== req.session.user.sub) return res.status(403).send('Forbidden');
    await saveItems(items.filter(entry => entry.id !== item.id)); res.redirect('/items');
  } catch (error) { next(error); }
});

app.get('/leave', (req, res) => req.session.destroy(() => res.redirect('/')));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).send(layout('Error', `<section class="hero"><h1>發生錯誤</h1><pre>${esc(error.message)}</pre></section>`)); });
app.listen(port, () => console.log(`${label} listening on http://localhost:${port}`));
