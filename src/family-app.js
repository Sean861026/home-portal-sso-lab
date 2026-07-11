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
const publicHost = process.env.PUBLIC_HOST || 'localhost';
const secureCookies = process.env.COOKIE_SECURE === 'true';
const jwks = createRemoteJWKSet(new URL(`${internalBase}/protocol/openid-connect/certs`));
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: `${kind}_sid`,
  secret: process.env.SESSION_SECRET || `local-${kind}-secret`,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 60 * 60 * 1000 }
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
  const nav = user ? `<span>${esc(user.preferred_username)}</span><a href="http://${publicHost}:3000">Portal</a><a href="/leave">離開此 App</a>` : '<a class="button" href="/login">使用 SSO 登入</a>';
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${label}</title><style>
*{box-sizing:border-box}:root{--bg:#06101f;--panel:rgba(14,31,52,.76);--panel2:rgba(18,39,64,.62);--line:rgba(126,173,205,.16);--cyan:#5eead4;--blue:#67e8f9;--text:#eef8ff;--muted:#8faabe;--danger:#fb7185;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:var(--text);background:var(--bg)}body{margin:0;min-height:100vh;background:radial-gradient(circle at 76% -8%,rgba(18,143,154,.22),transparent 36%),radial-gradient(circle at 6% 94%,rgba(30,64,175,.17),transparent 33%),linear-gradient(145deg,#050c18,#081526 55%,#06111f);background-attachment:fixed}.wrap{max-width:1040px;margin:auto;padding:22px 28px 45px}nav{position:sticky;top:14px;z-index:4;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:15px;background:rgba(5,14,27,.8);backdrop-filter:blur(20px)}nav:before{content:"${kind === 'calendar' ? '□  FAMILY CALENDAR' : '✎  FAMILY NOTES'}";margin-right:auto;color:var(--cyan);font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em}nav span{color:var(--muted);font:500 11px ui-monospace,SFMono-Regular,Consolas,monospace}nav a{padding:8px 11px;border-radius:9px}a{color:var(--cyan);text-decoration:none}.hero{position:relative;overflow:hidden;margin:22px 0 16px;padding:38px 30px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(115deg,rgba(17,41,67,.88),rgba(8,28,48,.74));box-shadow:0 22px 55px rgba(0,0,0,.22)}.hero:after{content:"";position:absolute;right:-90px;top:-170px;width:500px;height:390px;border-radius:50%;background:repeating-radial-gradient(circle,transparent 0 34px,rgba(94,234,212,.055) 35px 36px);pointer-events:none}.hero h1{font-size:clamp(2.4rem,7vw,4.8rem);letter-spacing:-.055em;line-height:1;margin:.15em 0}.hero>.muted:first-child{color:var(--cyan);font:600 10px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.17em}.muted,.meta{color:var(--muted)}.button,button{border:1px solid rgba(94,234,212,.28);border-radius:10px;background:linear-gradient(135deg,var(--cyan),#22d3ee);color:#07131f;padding:10px 15px;font-weight:750;cursor:pointer}.form,.item{background:var(--panel);border:1px solid var(--line);border-radius:17px;padding:21px;margin:14px 0;box-shadow:0 20px 48px rgba(0,0,0,.2);backdrop-filter:blur(16px)}.form label{display:block;color:#aac0cf;font:600 10px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase}.row{display:grid;grid-template-columns:1fr 1fr;gap:13px}input,textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:12px;background:rgba(3,11,22,.72);color:var(--text);font:500 13px Inter,"Segoe UI",sans-serif;margin:7px 0 14px;outline:none}input:focus,textarea:focus{border-color:rgba(94,234,212,.55);box-shadow:0 0 0 3px rgba(94,234,212,.08)}textarea{min-height:96px;resize:vertical}.meta{font:500 10px ui-monospace,SFMono-Regular,Consolas,monospace}.item{position:relative;transition:.18s}.item:hover{transform:translateY(-2px);border-color:rgba(94,234,212,.28)}.item h2{margin:.3em 0;font-size:18px}.item p{line-height:1.65}.danger{background:rgba(251,113,133,.1);border-color:rgba(251,113,133,.28);color:#fda4af;float:right;padding:7px 10px;font-size:11px}.empty{text-align:center;padding:58px;border:1px dashed var(--line);border-radius:17px;color:var(--muted);font:500 12px ui-monospace,SFMono-Regular,Consolas,monospace}@media(max-width:650px){.wrap{padding:14px}.row{grid-template-columns:1fr}.hero{padding:30px 21px}nav{position:static;flex-wrap:wrap}nav:before{width:100%}}
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
