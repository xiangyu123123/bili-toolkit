// 三个动作：
//   POST ?action=submit  —— 公开写入，存成 feedback/<uuid>.json
//   GET  ?action=list    —— 需要 x-feedback-key（应用 Secret FEEDBACK_KEY），列出并取回内容
//   POST ?action=delete  —— 同上，按 id 删除一条
// 公开站点上拿不到 Qoder 身份（实测 /__qoder_auth/me 返回 sites_auth_login_required），
// 所以收件侧用一把只有站主知道的密钥把关；密钥值只在服务端读取，不进前端代码也不进仓库。
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...headers },
});

const MAX_BODY = 8192;
const PAGES = ["home", "dynamic", "space", "live", "video", "other"];
const LIMITS = { page: 24, version: 24, browser: 200, content: 2000, expected: 2000, contact: 80 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIR = "feedback/";

function clean(value, max) {
  if (typeof value !== "string") return null;
  const s = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  return s || null;
}

// 不让长度/内容通过响应时间泄漏
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorize(request, env) {
  const want = typeof env === "function" ? env("FEEDBACK_KEY") : "";
  if (!want || typeof want !== "string" || !want.trim()) return { error: "service_not_configured", status: 503 };
  const got = request.headers.get("x-feedback-key") || "";
  if (!sameSecret(got.trim(), want.trim())) return { error: "unauthorized", status: 401 };
  return { ok: true };
}

// 服务侧列表结构不假设固定形状：字符串数组、{name}/{path}/{Key} 对象数组都吃
function entryPaths(payload) {
  const raw = Array.isArray(payload) ? payload
    : payload && Array.isArray(payload.keys) ? payload.keys
    : payload && Array.isArray(payload.objects) ? payload.objects
    : payload && Array.isArray(payload.data) ? payload.data
    : [];
  const out = [];
  raw.forEach((item) => {
    const p = typeof item === "string" ? item : item && (item.path || item.name || item.Key || item.key);
    if (typeof p === "string" && p.indexOf(DIR) === 0 && p.endsWith(".json")) out.push(p);
  });
  return out;
}

async function readBody(request) {
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

async function submit(request, storage) {
  const body = await readBody(request);
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
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  try {
    await storage.upload(DIR + id + ".json", bytes, { contentType: "application/json; charset=utf-8", upsert: false });
  } catch {
    // 写入结果未知时不重放，避免重复件；让用户手动再提交
    return json({ error: "save_failed" }, 503);
  }
  return json({ ok: true, id }, 201);
}

async function list(request, storage, params) {
  const limit = Math.max(1, Math.min(50, Number(params.get("limit")) || 20));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  let payload;
  try {
    payload = await storage.list(DIR.replace(/\/$/, ""), { limit: 1000, offset: 0, sortBy: { column: "name", order: "desc" } });
  } catch {
    return json({ error: "list_failed" }, 503);
  }
  const all = entryPaths(payload);
  const page = all.slice(offset, offset + limit);
  const items = [];
  for (const path of page) {
    try {
      const res = await storage.download(path);
      const text = await res.text();
      const rec = JSON.parse(text);
      if (rec && typeof rec === "object") items.push(rec);
    } catch (e) {
      items.push({ id: path.slice(DIR.length).replace(/\.json$/, ""), unreadable: true });
    }
  }
  return json({ ok: true, items, total: all.length, hasMore: offset + limit < all.length, nextOffset: offset + limit < all.length ? offset + limit : null });
}

async function remove(request, storage) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, body.status);
  const id = typeof body.input.id === "string" ? body.input.id.toLowerCase() : "";
  if (!UUID.test(id)) return json({ error: "invalid_id" }, 400);
  try {
    await storage.remove([DIR + id + ".json"]);
  } catch {
    return json({ error: "delete_failed" }, 503);
  }
  return json({ ok: true, id });
}

export async function handleFeedback({ request, storage, env }) {
  const params = new URL(request.url).searchParams;
  const action = params.get("action");
  if (action === "submit") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    return submit(request, storage);
  }
  if (action === "list") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    const auth = authorize(request, env);
    if (auth.error) return json({ error: auth.error }, auth.status);
    return list(request, storage, params);
  }
  if (action === "delete") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    const auth = authorize(request, env);
    if (auth.error) return json({ error: auth.error }, auth.status);
    return remove(request, storage);
  }
  return json({ error: "not_found" }, 404);
}
