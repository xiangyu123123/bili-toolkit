// 反馈落进站点私有 Storage：feedback/<uuid>.json。
// 浏览器侧只有写入通道 —— 不列目录、不签名下载，所以访客读不到任何一条（含自己刚提的）；
// 站主用后台文件工具 list / download / delete。
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...headers },
});

const MAX_BODY = 8192;
const PAGES = ["home", "dynamic", "space", "live", "video", "other"];
const LIMITS = { page: 24, version: 24, browser: 200, content: 2000, expected: 2000, contact: 80 };

function clean(value, max) {
  if (typeof value !== "string") return null;
  const s = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  return s || null;
}

export async function handleFeedback({ request, storage }) {
  const params = new URL(request.url).searchParams;
  if (params.get("action") !== "submit") return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });

  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) return json({ error: "invalid_content_type" }, 415);

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "unreadable_body" }, 400);
  }
  if (!raw || raw.length > MAX_BODY) return json({ error: "invalid_body_size" }, 413);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_json" }, 400);

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
    await storage.upload("feedback/" + id + ".json", bytes, {
      contentType: "application/json; charset=utf-8",
      upsert: false,
    });
  } catch {
    // 上传结果未知时不重放，避免留下重复件；让用户手动再提交
    return json({ error: "save_failed" }, 503);
  }
  return json({ ok: true, id }, 201);
}
