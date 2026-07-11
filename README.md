# Home Portal SSO Lab

[繁體中文](README.md) | [English](README.en.md)

一個可以實際操作的 OIDC/SSO 練習環境。Keycloak 是身分提供者（Identity Provider），Node.js Portal 是依賴方（Relying Party）。

## 啟動

需要 Docker Desktop。第一次啟動會下載 image 並建置 Portal：

建議先複製環境設定並更換預設值：

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

等 Keycloak 啟動後開啟：

- Portal: http://localhost:3000
- Family Notes: http://localhost:3001
- Family Calendar: http://localhost:3002
- Keycloak Admin Console: http://localhost:8080/admin

## 練習帳號

| 帳號 | 密碼 | 角色 | 預期結果 |
|---|---|---|---|
| `alice` | `alice123` | `family` | 可登入 Dashboard，不能進 Admin |
| `owner` | `owner123` | `family`, `admin` | 可登入 Dashboard 與 Admin |
| `sean` | `sean123` | `family`, `admin` | 可使用所有 Lab 功能 |

Keycloak 管理介面的本機帳密是 `admin` / `admin`。

> 這些都是刻意公開的本機 Lab 密碼，絕對不要直接拿到公網使用。

## 可以觀察什麼

1. 點擊 Login 後，Portal 產生 `state`、`nonce` 與 PKCE verifier。
2. 瀏覽器被導向 Keycloak；Portal 完全不接觸使用者密碼。
3. Keycloak 將一次性 authorization code 傳回 `/callback`。
4. Portal 從後端兌換 token，驗證 ID Token 的簽章、issuer、audience 和 nonce。
5. `/admin` 根據 `realm_access.roles` 做授權；登入（authentication）不代表有權限（authorization）。
6. 登出會同時清除 Portal session 並呼叫 Keycloak 的 RP-Initiated Logout。

## 測試真正的 SSO

先登入 Portal，再從 Dashboard 開啟 Family Notes 或 Family Calendar。兩者各自使用不同的 OIDC client 與 session cookie，但 Keycloak 已有登入 session，因此不會再次詢問密碼。

Family Notes 與 Calendar 的資料分別存於 Docker named volume。一般使用者能新增內容及刪除自己的內容；`admin` 能刪除任何人的內容。

## 透過 Tailscale 從外部連線

在家用主機與外部裝置安裝 Tailscale，並以同一個 Tailnet 登入。將 `.env` 的 `PUBLIC_HOST` 設為家用主機的 MagicDNS hostname：

```env
PUBLIC_HOST=laptop-r8l39tjm
COOKIE_SECURE=false
```

正常重建，不要刪除 volumes：

```bash
docker compose up --build
```

`keycloak-provision` 會自動將精確的 localhost 與 Tailscale redirect URIs 寫入現有 clients。外部裝置連上 Tailscale 後，開啟 `http://laptop-r8l39tjm:3000`。這些服務只應透過受信任的 Tailnet 存取；HTTP 模式不適合公開網際網路。

## 新增服務且不刪資料

`keycloak-provision` 會在每次 Compose 啟動時檢查 `keycloak/provision/clients/*.json`，只建立尚未存在的 OIDC client。它不會刪除或覆寫現有 client，也不會動到 Notes、Calendar 或 Keycloak volume。

加入新服務時：

1. 複製一份 `keycloak/provision/clients/*.json` 並修改 client ID、redirect URI 與 web origin。
2. 在 `docker-compose.yml` 加入服務。
3. 執行 `docker-compose up --build`，不要加 `-v`。

Realm import 仍負責全新安裝的初始資料；provisioning 則負責既有安裝的增量 client 建立。

## 重置環境

Realm import 只會在全新資料目錄時套用。若修改 `keycloak/home-realm.json` 後想重新匯入：

```bash
docker compose down -v
docker compose up --build
```

`-v` 會刪除這個 Lab 的 Keycloak volume 及其中資料。

## 接到外網之前

正式對外時至少要更換所有密碼與 `SESSION_SECRET`、使用 HTTPS、把 cookie 設為 `secure`、限制 redirect URI、使用持久化 session store，並在 Tunnel/反向代理層限制來源。不要直接把 Keycloak 的開發模式暴露到公網。

設定 `COOKIE_SECURE=true` 後，瀏覽器只會透過 HTTPS 傳送 session cookie。完整清單請參考 [SECURITY.md](SECURITY.md)。
