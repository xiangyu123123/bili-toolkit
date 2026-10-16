// 动作一览：
//   POST ?action=submit  公开写入 feedback/<uuid>.json
//   POST ?action=setup   仅当还没有账号时可用：用「账号 + 密码」建号，密码只存 PBKDF2 散列
//   POST ?action=login   校验账号密码，发一个短期令牌（sessions/<token>.json）
//   GET  ?action=list    需要 x-session 令牌：列出并取回反馈内容
//   POST ?action=delete  需要 x-session 令牌：按 id 删除一条
//   POST ?action=logout  需要 x-session 令牌：作废该令牌
// 站点是公开的、公开站上拿不到 Qoder 身份（实测 /__qoder_auth/me 返回 sites_auth_login_required），
// 所以收件侧用这套应用内账号把关。凭据只存在服务端私有存储，不进前端代码也不进仓库。
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...headers },
});

const MAX_BODY = 8192;
const PAGES = ["home", "dynamic", "space", "live", "video", "other"];
const LIMITS = { page: 24, version: 24, browser: 200, content: 2000, expected: 2000, contact: 80 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FB = "feedback/";
const ACCOUNT = "auth/account.json";
const FAILS = "auth/fails.json";
const SESSIONS = "sessions/";
const TOKEN = /^[0-9a-f]{64}$/;
const SESSION_MS = 12 * 60 * 60 * 1000;
const ITERATIONS = 150000;
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

function clean(value, max) {
  if (typeof value !== "string") return null;
  const s = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  return s || null;
}

function hex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function unhex(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
function randomHex(nbytes) {
  const b = new Uint8Array(nbytes);
  crypto.getRandomValues(b);
  return hex(b);
}

async function derive(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unhex(saltHex), iterations: Number(iterations) || ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return hex(new Uint8Array(bits));
}

// 定长比较，别让密码长度/前缀通过响应时间泄漏
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) return { error: "invalid_content_type", status: 415 };
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { error: "unreadable_body", status: 400 };
  }
  if (!raw || raw.length > MAX_BODY) return { error: "invalid_body_size", status: 413 };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "invalid_json", status: 400 };
    return { input: parsed };
  } catch (e) {
    return { error: "invalid_json", status: 400 };
  }
}

async function readObject(storage, path) {
  try {
    const res = await storage.download(path);
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// 平台列表返回的是「相对前缀」的条目名（如 228552be-….json），也可能给完整路径；
// 两种都接下来统一成 feedback/<uuid>.json，并拒绝任何带 / 或 .. 的条目名。
function pathsOf(payload, prefix) {
  const raw = Array.isArray(payload) ? payload
    : payload && Array.isArray(payload.keys) ? payload.keys
    : payload && Array.isArray(payload.objects) ? payload.objects
    : payload && Array.isArray(payload.data) ? payload.data
    : [];
  const out = [];
  raw.forEach((item) => {
    const p = typeof item === "string" ? item : item && (item.path || item.name || item.Key || item.key);
    if (typeof p !== "string" || !p.endsWith(".json")) return;
    const rel = p.indexOf(prefix) === 0 ? p.slice(prefix.length) : p;
    if (!rel || rel.indexOf("/") !== -1 || rel.indexOf("..") !== -1) return;
    out.push(prefix + rel);
  });
  return out;
}

async function writeJson(storage, path, value) {
  await storage.upload(path, new TextEncoder().encode(JSON.stringify(value)), {
    contentType: "application/json; charset=utf-8",
    upsert: true,
  });
}

/* ------------------------------------------------------------ 反馈写入 */

async function submit(request, storage) {
  const body = await readJson(request);
  if (body.error) return json({ error: body.error }, body.status);
  const input = body.input;

  const page = clean(input.page, LIMITS.page);
  const version = clean(input.version, LIMITS.version);
  const browser = clean(input.browser, LIMITS.browser);
  const content = clean(input.content, LIMITS.content);
  const expected = input.expected == null ? null : clean(input.expected, LIMITS.expected);
  const contact = input.contact == null ? null : clean(input.contact, LIMITS.contact);

  if (!page || PAGES.indexOf(page) === -1) return json({ error: "invalid_page" }, 400);
  if (!version) return json({ error: "invalid_version" }, 400);
  if (!browser) return json({ error: "invalid_browser" }, 400);
  if (!content || content.length < 5) return json({ error: "content_too_short" }, 400);
  if (expected === null && input.expected != null) return json({ error: "invalid_expected" }, 400);
  if (contact === null && input.contact != null) return json({ error: "invalid_contact" }, 400);

  // 对象名只由服务端生成，浏览器给不出任何路径片段
  const id = crypto.randomUUID();
  const record = { id, created_at: new Date().toISOString(), page, version, browser, content, expected, contact, status: "new" };
  try {
    await storage.upload(FB + id + ".json", new TextEncoder().encode(JSON.stringify(record)), {
      contentType: "application/json; charset=utf-8",
      upsert: false,
    });
  } catch {
    // 写入结果未知时不重放，避免重复件；让用户手动再提交
    return json({ error: "save_failed" }, 503);
  }
  return json({ ok: true, id }, 201);
}

/* ------------------------------------------------------------ 账号与令牌 */

async function setup(request, storage) {
  const body = await readJson(request);
  if (body.error) return json({ error: body.error }, body.status);
  const user = clean(body.input.user, 32);
  const password = typeof body.input.password === "string" ? body.input.password : "";
  if (!user || !/^[A-Za-z0-9_.-]{3,32}$/.test(user)) return json({ error: "invalid_user" }, 400);
  if (password.length < 10 || password.length > 200) return json({ error: "weak_password" }, 400);

  if (await readObject(storage, ACCOUNT)) return json({ error: "account_exists" }, 409);

  const salt = randomHex(16);
  const record = { user, salt, iterations: ITERATIONS, hash: await derive(password, salt, ITERATIONS), created_at: new Date().toISOString() };
  try {
    await writeJson(storage, ACCOUNT, record);
  } catch {
    return json({ error: "save_failed" }, 503);
  }
  return json({ ok: true, user }, 201);
}

async function login(request, storage) {
  const body = await readJson(request);
  if (body.error) return json({ error: body.error }, body.status);
  const account = await readObject(storage, ACCOUNT);
  if (!account || typeof account.hash !== "string") return json({ error: "no_account" }, 404);

  const fails = (await readObject(storage, FAILS)) || { count: 0, locked_until: 0 };
  if (Number(fails.locked_until) > Date.now()) return json({ error: "too_many_attempts" }, 429);

  const user = clean(body.input.user, 32);
  const password = typeof body.input.password === "string" ? body.input.password : "";
  const okUser = typeof user === "string" && user === account.user;
  const okPass = same(await derive(password, account.salt, account.iterations), account.hash);
  if (!okUser || !okPass) {
    const next = { count: Number(fails.count || 0) + 1, locked_until: Number(fails.count || 0) + 1 >= MAX_FAILS ? Date.now() + LOCK_MS : 0 };
    try {
      await writeJson(storage, FAILS, next);
    } catch (e) { /* 计数写不进去不放大结果 */ }
    return json({ error: "bad_credentials" }, 401);
  }

  const token = randomHex(32);
  const now = Date.now();
  try {
    await writeJson(storage, SESSIONS + token + ".json", { user: account.user, created_at: new Date(now).toISOString(), expires_at: new Date(now + SESSION_MS).toISOString() });
    await writeJson(storage, FAILS, { count: 0, locked_until: 0 });
  } catch {
    return json({ error: "save_failed" }, 503);
  }
  return json({ ok: true, user: account.user, token, expires_at: new Date(now + SESSION_MS).toISOString() });
}

async function currentSession(request, storage) {
  const token = request.headers.get("x-session") || "";
  if (!TOKEN.test(token)) return { error: "unauthorized", status: 401 };
  const rec = await readObject(storage, SESSIONS + token + ".json");
  if (!rec || !rec.expires_at || Date.parse(rec.expires_at) <= Date.now()) return { error: "session_expired", status: 401 };
  return { ok: true, token, rec };
}

async function logout(request, storage) {
  const s = await currentSession(request, storage);
  if (s.error) return json({ error: s.error }, s.status);
  try {
    await storage.remove([SESSIONS + s.token + ".json"]);
  } catch {
    return json({ error: "delete_failed" }, 503);
  }
  return json({ ok: true });
}

/* ------------------------------------------------------------ 收件与清理 */

async function list(request, storage, params) {
  const limit = Math.max(1, Math.min(50, Number(params.get("limit")) || 20));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  let payload;
  try {
    payload = await storage.list("feedback", { limit: 1000, offset: 0, sortBy: { column: "name", order: "desc" } });
  } catch {
    return json({ error: "list_failed" }, 503);
  }
  const all = pathsOf(payload, FB);
  const page = all.slice(offset, offset + limit);
  const items = [];
  for (const path of page) {
    const rec = await readObject(storage, path);
    items.push(rec || { id: path.slice(FB.length).replace(/\.json$/, ""), unreadable: true });
  }
  return json({ ok: true, items, total: all.length, hasMore: offset + limit < all.length, nextOffset: offset + limit < all.length ? offset + limit : null });
}

async function remove(request, storage) {
  const body = await readJson(request);
  if (body.error) return json({ error: body.error }, body.status);
  const id = typeof body.input.id === "string" ? body.input.id.toLowerCase() : "";
  if (!UUID.test(id)) return json({ error: "invalid_id" }, 400);
  try {
    await storage.remove([FB + id + ".json"]);
  } catch {
    return json({ error: "delete_failed" }, 503);
  }
  return json({ ok: true, id });
}

export async function handleFeedback({ request, storage }) {
  const params = new URL(request.url).searchParams;
  const action = params.get("action");

  if (action === "submit") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    return submit(request, storage);
  }
  if (action === "setup" || action === "login" || action === "logout" || action === "delete") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    if (action === "setup") return setup(request, storage);
    if (action === "login") return login(request, storage);
    const s = await currentSession(request, storage);
    if (s.error) return json({ error: s.error }, s.status);
    return action === "logout" ? logout(request, storage) : remove(request, storage);
  }
  if (action === "list") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    const s = await currentSession(request, storage);
    if (s.error) return json({ error: s.error }, s.status);
    return list(request, storage, params);
  }
  if (action === "status") {
    const account = await readObject(storage, ACCOUNT);
    return json({ ok: true, has_account: !!account, user: account && account.user ? account.user : null });
  }
  return json({ error: "not_found" }, 404);
}
