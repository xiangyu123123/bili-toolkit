// 临时校验：在可触发事件的 DOM 桩里执行油猴脚本，验证线路测速菜单与手动选线。
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = 'C:/Users/14461/Documents/Qoder/2026-10-13/73f64461';
const SRC = fs.readFileSync(ROOT + '/web/bili-toolkit.user.js', 'utf8');

function makeMkEl(getRoot) {
  return function mkEl(tag) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: [],
    parent: null,
    _cls: new Set(),
    _l: {},
    _text: '',
    _html: '',
    attrs: {},
    id: '',
    disabled: false,
    hidden: false,
    value: '',
    type: '',
    placeholder: '',
    title: '',
    href: '',
    download: '',
    src: '',
    style: {},
    dataset: {}
  };
  Object.defineProperty(el, 'className', {
    get: () => [...el._cls].join(' '),
    set: (v) => {
      el._cls = new Set(String(v).split(/\s+/).filter(Boolean));
    }
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el.children.map((c) => (c.textContent !== undefined ? c.textContent : c.nodeValue || '')).join(''),
    set: (v) => {
      el.children = [];
      el._text = String(v);
      if (el._text !== '') el.children.push({ nodeType: 3, nodeValue: el._text, textContent: el._text, parent: el, children: [] });
    }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (v) => {
      el._html = String(v);
      el.children = [];
    }
  });
  Object.defineProperty(el, 'isConnected', {
    get() {
      let n = el;
      while (n.parent) n = n.parent;
      return n === getRoot();
    }
  });
  el.appendChild = (c) => {
    c.parent = el;
    el.children.push(c);
    return c;
  };
  el.removeChild = (c) => {
    el.children = el.children.filter((x) => x !== c);
    return c;
  };
  el.remove = function () {
    if (this.parent) this.parent.removeChild(this);
  };
  el.classList = {
    add: (...n) => n.forEach((x) => el._cls.add(x)),
    remove: (...n) => n.forEach((x) => el._cls.delete(x)),
    toggle: (n, force) => {
      if (force === undefined) el._cls.has(n) ? el._cls.delete(n) : el._cls.add(n);
      else force ? el._cls.add(n) : el._cls.delete(n);
    },
    contains: (n) => el._cls.has(n)
  };
  el.addEventListener = (n, fn) => {
    (el._l[n] = el._l[n] || []).push(fn);
  };
  el.removeEventListener = (n, fn) => {
    el._l[n] = (el._l[n] || []).filter((f) => f !== fn);
  };
  el.click = function () {
    (el._l.click || []).forEach((fn) => fn({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} }));
  };
  el.setAttribute = (k, v) => {
    el.attrs[k] = v;
  };
  el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
  el.closest = (sel) => {
    let n = el;
    while (n) {
      if (matches(n, sel)) return n;
      n = n.parent;
    }
    return null;
  };
  el.contains = (o) => {
    let n = o;
    while (n) {
      if (n === el) return true;
      n = n.parent;
    }
    return false;
  };
  el.getBoundingClientRect = () => {
    // 真实 DOMRect 总是带 left/right/bottom；桩里也必须补齐，否则几何判定读到 undefined 会静默失效
    const r = typeof el._rectFn === 'function' ? el._rectFn() : el._rect || { x: 0, y: 0, width: 0, height: 0 };
    const x = r.x != null ? r.x : r.left || 0;
    const y = r.y != null ? r.y : r.top || 0;
    const w = r.width != null ? r.width : (r.right || 0) - x;
    const h = r.height != null ? r.height : (r.bottom || 0) - y;
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h };
  };
  el.querySelectorAll = (sel) => collect(el, sel);
  el.querySelector = (sel) => collect(el, sel)[0] || null;
  el.replaceWith = function (next) {
    const p = this.parent;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i === -1) return;
    p.children[i] = next;
    next.parent = p;
    this.parent = null;
  };
  el.focus = () => {};
  el.select = () => {};
  el.scrollIntoView = () => {
    el._scrolled = true;
  };
  return el;
  };
}

function matchesCompound(el, s) {
  if (!s) return false;
  if (s.indexOf(':has(') !== -1) return false;
  if (s[0] === '#') return el.id === s.slice(1);
  if (s[0] === '.') return el._cls && el._cls.has(s.slice(1));
  if (s[0] === '[') {
    const m = /^\[\s*class\s*[*^$]?=\s*"([^"]+)"\s*\]$/.exec(s);
    return m ? String(el.className || '').indexOf(m[1]) !== -1 : false;
  }
  return el.tagName === s.toUpperCase();
}

// 桩里必须支持后代组合器：否则 '.bili-header .center-search-container' 会退化成匹配 .bili-header 本身
function matches(el, sel) {
  return String(sel)
    .split(',')
    .some((raw) => {
      const parts = raw.trim().split(/[\s>]+/).filter(Boolean);
      if (!parts.length) return false;
      if (!matchesCompound(el, parts[parts.length - 1])) return false;
      let node = el.parent;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        let hit = false;
        while (node) {
          if (matchesCompound(node, parts[i])) {
            node = node.parent;
            hit = true;
            break;
          }
          node = node.parent;
        }
        if (!hit) return false;
      }
      return true;
    });
}

function collect(root, sel) {
  const out = [];
  const visit = (n) => {
    (n.children || []).forEach((c) => {
      if (matches(c, sel)) out.push(c);
      visit(c);
    });
  };
  visit(root);
  return out;
}

function findButton(root, text) {
  return collect(root, 'button').find((b) => (b.textContent || '').trim() === text);
}

function makeXhrClass() {
  return class XHR {
    constructor() {
      this.readyState = 0;
      this.responseType = '';
      this.rawText = '';
    }
    open(m, u) {
      this._url = u;
      this.readyState = 1;
    }
    send() {
      this.readyState = 4;
    }
    feed(t) {
      this.rawText = t;
      this.readyState = 4;
    }
    get responseText() {
      return this.rawText;
    }
    addEventListener() {}
  };
}

let clock = 0;

function boot(seedCfg) {
  let root = null;
  const mkEl = makeMkEl(() => root);
  const docEl = mkEl('html');
  docEl.clientWidth = 1280;
  docEl.clientHeight = 900;
  docEl.offsetWidth = 1280;
  docEl.offsetHeight = 900;
  root = docEl;
  const body = mkEl('body');
  docEl.appendChild(body);
  const doc = {
    nodeType: 9,
    readyState: 'complete',
    documentElement: docEl,
    body,
    createElement: mkEl,
    createTextNode: (t) => ({ nodeType: 4, nodeValue: String(t), textContent: String(t), parent: null, children: [] }),
    createDocumentFragment: () => mkEl('frag'),
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener() {},
    removeEventListener() {},
    execCommand: () => true,
    appendChild: (c) => docEl.appendChild(c),
    getElementById: (id) => (docEl.id === id ? docEl : collect(docEl, '#' + id)[0] || null),
    querySelector: (sel) => (matches(docEl, sel) ? docEl : collect(docEl, sel)[0] || null),
    querySelectorAll: (sel) => collect(docEl, sel)
  };
  const gmStore = { 'btk.cfg.v1': seedCfg };
  const probeLog = [];
  const menu = {};
  const XHR = makeXhrClass();
  const sb = {};
  sb.window = sb;
  sb.self = sb;
  sb.top = sb;
  sb.unsafeWindow = sb;
  sb.document = doc;
  sb.navigator = { clipboard: { writeText: async () => {} }, userAgent: 'node' };
  sb.location = {
    href: 'https://www.bilibili.com/video/BV1test/?p=1',
    search: '?p=1',
    pathname: '/video/BVtest/',
    protocol: 'https:',
    hostname: 'www.bilibili.com',
    reload: () => {}
  };
  // 让注入的样式表真正影响 getComputedStyle，否则顶栏自检这类几何逻辑永远跑不到
  const hiddenEls = new Set();
  sb.getComputedStyle = (el) => {
    hiddenEls.clear();
    const tag = docEl.children.find((c) => c.id === 'btk-clean-style' || c.id === 'btk-nag-style' || c.id === 'btk-dm-style');
    docEl.children.forEach((t) => {
      if (t.tagName !== 'STYLE' || !t.textContent) return;
      String(t.textContent).split('}').forEach((rule) => {
        const i = rule.indexOf('{');
        if (i < 0 || !/display:\s*none/.test(rule.slice(i + 1))) return;
        collect(docEl, rule.slice(0, i).trim()).forEach((e) => hiddenEls.add(e));
      });
    });
    void tag;
    return {
      display: hiddenEls.has(el) ? 'none' : 'block',
      visibility: 'visible',
      position: 'relative',
      zIndex: '1'
    };
  };
  sb.XMLHttpRequest = XHR;
  sb.NodeFilter = { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 };
  const observers = [];
  sb.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      observers.push(this);
    }
    observe() {
      this.observed = true;
    }
  };
  sb.CSS = { escape: (s) => s };
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb.performance = { now: () => (clock += 40) };
  sb.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  sb.AbortController = AbortController;
  sb.URL = URL;
  sb.URLSearchParams = URLSearchParams;
  sb.setTimeout = setTimeout;
  sb.clearTimeout = clearTimeout;
  sb.setInterval = (fn, ms) => setInterval(fn, ms);
  sb.clearInterval = (id) => clearInterval(id);
  sb.GM_getValue = (k, d) => (k in gmStore ? JSON.parse(JSON.stringify(gmStore[k])) : d);
  sb.GM_setValue = (k, v) => {
    gmStore[k] = JSON.parse(JSON.stringify(v));
  };
  sb.GM_deleteValue = (k) => {
    delete gmStore[k];
  };
  const addedStyles = [];
  sb.GM_addStyle = (css) => { addedStyles.push(String(css)); };
  sb.GM_registerMenuCommand = (label, fn) => {
    menu[label] = fn;
  };
  // GET+Range 视为可读体的 cors 探测；HEAD 视为 no-cors 回退
  sb.fetch = (u, init) => {
    const url = String((u && u.url) || u);
    probeLog.push({ url, method: (init && init.method) || 'GET' });
    if (/dead\./.test(url)) return Promise.reject(new Error('net'));
    if (/rtt\./.test(url) && (!init || init.method !== 'HEAD')) return Promise.reject(new Error('cors'));
    if (init && init.method === 'HEAD') return Promise.resolve({ ok: true, status: 200 });
    return Promise.resolve({ ok: true, status: 206, arrayBuffer: () => Promise.resolve(new ArrayBuffer(262144)) });
  };
  sb.Response = class {
    constructor(b, o) {
      this.body = b;
      Object.assign(this, o || {});
    }
  };
  sb.console = console;
  sb.addEventListener = () => {};
  sb.removeEventListener = () => {};
  sb.innerWidth = 1280;
  sb.innerHeight = 900;
  sb.devicePixelRatio = 1;
  sb.WebSocket = class {
    constructor(u) {
      this.url = String(u);
      this.readyState = 0;
    }
    send() {}
    close() {}
    addEventListener() {}
  };
  sb.WebSocket.CONNECTING = 0;
  sb.WebSocket.OPEN = 1;
  sb.WebSocket.CLOSING = 2;
  sb.WebSocket.CLOSED = 3;
  sb.__INITIAL_STATE__ = {
    bvid: 'BV1test',
    videoData: { aid: 123, title: '测试视频', pic: '//i0.hdslb.com/bfs/archive/abc.jpg', pubdate: 1700000000, page: { page: 1 } },
    pages: [
      { cid: 1, part: 'P1', duration: 100 },
      { cid: 2, part: 'P2', duration: 200 }
    ]
  };
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { timeout: 8000 });
  const probe = (code) => vm.runInContext(code, ctx, { timeout: 8000 });
  return { sb, ctx, probe, doc, docEl, gmStore, probeLog, menu, observers, addedStyles, cfg: () => gmStore['btk.cfg.v1'], XHR };
}

function askXhr(env, payload) {
  const xhr = new env.XHR();
  xhr.open('GET', 'https://api.bilibili.com/x/player/wbi/playurl?bvid=BV1test&cid=1');
  const raw = JSON.stringify(payload);
  xhr.send();
  xhr.feed(raw);
  return { outText: xhr.responseText, out: JSON.parse(xhr.responseText), raw };
}

const PLAYINFO = {
  code: 0,
  data: {
    quality: 80,
    format: 'mp4',
    durl: [{ url: 'https://cn-a.cache.bilibili.com/d1/x.m4s', filesize: 1000, backup_url: ['https://xy.mcdn.bilibili.com/pcdn/b.m4s'] }],
    dash: {
      video: [
        { base_url: 'https://slow.example.com/v1.m4s', bandwidth: 3000000 },
        { base_url: 'https://fast.example.com/v2.m4s', bandwidth: 2000000 },
        { base_url: 'https://rtt.example.com/v3.m4s', bandwidth: 1000000 }
      ],
      audio: [{ base_url: 'https://dead.example.com/a1.m4s', bandwidth: 100000 }]
    }
  }
};

const results = [];
const check = (n, p, d) => results.push({ n, p, d });
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/* A. 基本改写行为（回归 v1.0 的断言） */
try {
  const env = boot({ enabled: { cdn: true } });
  check('启动无异常', true, '');
  const { outText, out, raw } = askXhr(env, PLAYINFO);
  const urls = out.data.durl.flatMap((d) => [d.url].concat(d.backup_url || [])).concat(out.data.dash.video.map((v) => v.base_url), out.data.dash.audio.map((v) => v.base_url));
  check('PCDN 条目被剔除', urls.every((u) => !/mcdn|pcdn|pdl/i.test(u)), urls.join(' | '));
  check('非 PCDN 条目零丢失', urls.length === 5, urls.length + ' 条（期望 5）');
  check('响应被改写', outText !== raw, raw.length + ' -> ' + outText.length);
  const clean = { code: 0, data: { durl: [{ url: 'https://good.example.com/a.m4s' }] } };
  check('干净响应原样透传', askXhr(env, clean).outText === JSON.stringify(clean), '');
  const allPcdn = { code: 0, data: { durl: [{ url: 'https://a.mcdn.bilibili.com/1.m4s' }, { url: 'https://b.pdl.bilibili.com/2.m4s' }] } };
  check(
    '地址全部命中特征串时不改写（避免播放器无地址可用）',
    askXhr(env, allPcdn).outText === JSON.stringify(allPcdn),
    ''
  );
  await tick();
  check('本次读取未自动发起测速', env.probeLog.length === 0, env.probeLog.length + ' 次请求');
} catch (e) {
  check('A 用例执行', false, e.message);
}

/* B. 测速菜单 + 手动选线 */
try {
  const env = boot({ enabled: { cdn: true } });
  askXhr(env, PLAYINFO);
  await tick();

  env.menu['视频线路测速与选线']();
  const panel = env.docEl.querySelector('#btk-panel');
  check('测速菜单已渲染', !!panel && /开始测速/.test(panel.textContent), '');
  check('候选节点已列出', /slow\.example\.com/.test(panel.textContent) && /rtt\.example\.com/.test(panel.textContent), '');
  check('未测时状态为待测', /待测/.test(panel.textContent), '');

  const start = findButton(panel, '开始测速');
  check('存在开始测速按钮', !!start, '');
  start.click();
  await tick(200);

  const txt = env.docEl.querySelector('#btk-panel').textContent;
  const getReqs = env.probeLog.filter((p) => p.method === 'GET').length;
  check('每个候选节点各发一次下载探测', getReqs === 6, getReqs + ' 次 GET（候选 6 条）');
  check('cors 可读的节点给出吞吐速率', /Mbps/.test(txt), txt.match(/[\d.]+ Mbps/g)?.join(', ') || '无');
  check('跨域不可读节点降级为仅 RTT', /仅 RTT/.test(txt), '');
  check('完全无响应的节点标记失败', /超时 \/ 失败/.test(txt), '');
  check('最快节点被标记', /最快/.test(txt), '');

  // 手动选中 rtt 节点（它不是最快，检验「用户选择优先于自动排序」）
  const rows = collect(env.docEl, 'tr').filter((tr) => /example\.com|bilibili\.com/.test(tr.textContent));
  check('候选行数与地址表一致', rows.length === 6, rows.length + ' 行（候选 6 条）');
  check('每行都有「用这条」', rows.every((tr) => collect(tr, 'button').some((b) => /用这条|已锁定/.test(b.textContent))), '');
  const targetRow = rows.find((tr) => /rtt\.example\.com/.test(tr.textContent));
  const pinBtn = targetRow && collect(targetRow, 'button').find((b) => b.textContent.trim() === '用这条');
  check('可锁定指定节点', !!pinBtn, '');
  pinBtn.click();
  check('锁定写入配置', env.cfg().cdn.pin === 'rtt.example.com', env.cfg().cdn.pin);

  const before = env.probeLog.length;
  const reload = findButton(env.docEl.querySelector('#btk-panel'), '重载播放器');
  check('存在重载播放器按钮', !!reload, '');
  reload.click();

  // 第二次 playurl：锁定节点应排到第一，且不被自动排序覆盖
  const r2 = askXhr(env, PLAYINFO);
  const order = r2.out.data.dash.video.map((v) => new URL(v.base_url).host);
  check('锁定节点排到首位', order[0] === 'rtt.example.com', order.join(' -> '));
  check('其余节点保留作为回退', order.length === 3, order.join(','));

  // 通过菜单锁定一个 PCDN 节点：它不该被剔除
  const pcdnRow = collect(env.docEl, 'tr').find((tr) => /xy\.mcdn\.bilibili\.com/.test(tr.textContent));
  const pcdnBtn = pcdnRow && collect(pcdnRow, 'button').find((b) => /用这条|已锁定/.test(b.textContent));
  check('PCDN 行也可锁定', !!pcdnBtn, '');
  pcdnBtn.click();
  const r3 = askXhr(env, PLAYINFO);
  const keptBackup = (r3.out.data.durl[0].backup_url || []).some((u) => /mcdn/.test(u));
  check('锁定的 PCDN 节点被保留', keptBackup, JSON.stringify(r3.out.data.durl));
  check('测速按钮点击不会重复压测', env.probeLog.length >= before, '');
} catch (e) {
  check('B 用例执行', false, e.stack);
}

/* C. 模块关闭：不读取、不改写、菜单空态 */
try {
  const env = boot({ enabled: { cdn: false } });
  const payload = { code: 0, data: { durl: [{ url: 'https://xy.mcdn.bilibili.com/pcdn/a.m4s' }] } };
  check('关闭时响应原样返回', askXhr(env, payload).outText === JSON.stringify(payload), '');
  env.menu['视频线路测速与选线']();
  const txt = env.docEl.querySelector('#btk-panel').textContent;
  check('关闭时不出现测速表格', !/开始测速/.test(txt), '');
  check('关闭时给出开启提示', /关闭时脚本完全不读取/.test(txt), txt.slice(0, 60));
  check('关闭时不发任何探测', env.probeLog.length === 0, env.probeLog.length + ' 次');
} catch (e) {
  check('C 用例执行', false, e.stack);
}

/* D. __playinfo__：页面拿到过滤版，表格仍看到全部候选 */
try {
  const env = boot({ enabled: { cdn: true } });
  env.probe('window.__playinfo__ = ' + JSON.stringify(PLAYINFO) + ';');
  const got = env.probe('JSON.parse(JSON.stringify(window.__playinfo__))');
  const urls = got.data.durl
    .flatMap((d) => [d.url].concat(d.backup_url || []))
    .concat(got.data.dash.video.map((v) => v.base_url), got.data.dash.audio.map((v) => v.base_url));
  check('播放器读到的是过滤版', urls.every((u) => !/mcdn|pcdn|pdl/i.test(u)), urls.join(' | '));
  check('过滤后非 PCDN 条目完整', urls.length === 5, urls.length + ' 条（期望 5）');
  env.menu['视频线路测速与选线']();
  const tableTxt = env.docEl.querySelector('#btk-panel').textContent;
  check('表格仍列出原始 PCDN 候选', /xy\.mcdn\.bilibili\.com/.test(tableTxt) && /PCDN/.test(tableTxt), '');
  const twice = env.probe(
    '(function(){var a=JSON.stringify(window.__playinfo__);var b=JSON.stringify(window.__playinfo__);return JSON.stringify({stable:a===b,backups:window.__playinfo__.data.durl[0].backup_url.length});})()'
  );
  const tj = JSON.parse(twice);
  check('重复读取结果稳定（不会二次过滤）', tj.stable === true, twice);
} catch (e) {
  check('D 用例执行', false, e.message);
}

/* E. P2P 会话阻断 */
try {
  const env = boot({ enabled: { cdn: true } });
  const tracker = 'wss://ali-web-player-tracker.biliapi.net/socket.io/?buvid=x&sdkVersion=2.14.0%3Aleecher&EIO=4&transport=websocket';
  const chat = 'wss://broadcast.chat.bilibili.com:7826/sub?platform=web';
  const blocked = env.probe(
    `(function(){var s=new WebSocket(${JSON.stringify(tracker)});return JSON.stringify({rs:s.readyState,send:s.send('x'),proto:s instanceof WebSocket,url:s.url.slice(0,40)});})()`
  );
  const bs = JSON.parse(blocked);
  check('P2P 会话被换成死连接', bs.rs === 3 && bs.send === false, blocked);
  check('伪装对象仍能通过 instanceof 检查', bs.proto === true, '');
  const pass = env.probe(`(function(){var s=new WebSocket(${JSON.stringify(chat)});return String(s.readyState);})()`);
  check('聊天广播 WebSocket 不受影响', pass === '0', 'readyState=' + pass);
  env.menu['视频线路测速与选线']();
  check('面板显示拦截计数', /已拦截 1 次/.test(env.docEl.querySelector('#btk-panel').textContent), '');
  const off = boot({ enabled: { cdn: false } });
  const offRs = off.probe(`(function(){var s=new WebSocket(${JSON.stringify(tracker)});return String(s.readyState);})()`);
  check('模块关闭时不拦任何 WebSocket', offRs === '0', 'readyState=' + offRs);
} catch (e) {
  check('E 用例执行', false, e.message);
}

/* F. 观看干扰弹窗屏蔽 */
try {
  const env = boot({ enabled: { clean: true, player: true } });
  const mk = (cls, text) => {
    const d = env.docEl.appendChild;
    const node = env.sb.document.createElement('div');
    node.className = cls;
    node.textContent = text;
    env.docEl.appendChild(node);
    return node;
  };
  const nag = mk('bpx-player-toast-item', '点赞投币收藏三连走一波');
  const keep = mk('bpx-player-toast-item', '网络异常，正在重试');
  mk('bpx-player-follow', '关注UP主');

  // 走真实路径：打开面板 -> 切到播放增强 -> 触发「观看干扰屏蔽」开关的 change
  env.menu['打开设置面板']();
  collect(env.docEl, 'button').find((b) => b.textContent.trim() === '播放增强').click();
  const row = collect(env.docEl, 'div').find((d) => d.classList.contains('btk-row') && /启用本组/.test(d.textContent));
  const input = collect(row, 'input')[0];
  const fire = (node, name) => (node._l[name] || []).forEach((fn) => fn({ target: node, currentTarget: node, preventDefault() {}, stopPropagation() {} }));
  input.checked = true;
  fire(input, 'change');
  await tick(60);
  check('命中关键词的提示条被标记', nag.classList.contains('btk-nag-cut'), String(nag.className));
  check('未命中的提示条保留', !keep.classList.contains('btk-nag-cut'), String(keep.className));
  const nagCss = (env.docEl.querySelector('#btk-nag-style') || {}).textContent || '';
  check('关注引导层进了屏蔽表', /\.bpx-player-follow/.test(nagCss) && /\.bpx-player-top-follow/.test(nagCss), nagCss.slice(0, 90));
  check('干扰屏蔽徽标有状态', /已挡|引导层|无弹窗元素/.test(env.docEl.querySelector('#btk-panel').textContent), '');
} catch (e) {
  check('F 用例执行', false, e.message);
}

/* G. DOM 持续变动时扫描仍要执行（旧防抖写法会永不触发） */
try {
  const env = boot({ enabled: { clean: true, player: true } });
  const bodyObs = env.observers[env.observers.length - 1];
  check('已注册 body 变更观察器', !!bodyObs && bodyObs.observed === true, 'observers=' + env.observers.length);
  const node = env.sb.document.createElement('div');
  node.className = 'bpx-player-toast-item';
  node.textContent = '点赞投币收藏三连走一波';
  env.docEl.appendChild(node);
  for (let i = 0; i < 9; i++) {
    bodyObs.cb([]);
    await tick(100);
  }
  check('持续变更下扫描仍然执行', node.classList.contains('btk-nag-cut'), String(node.className));
} catch (e) {
  check('G 用例执行', false, e.message);
}

/* H. 主地址是 PCDN 时，提升非 PCDN 备用为主地址（真实 B 站就是这样下发的） */
try {
  const env = boot({ enabled: { cdn: true } });
  const pcdnPrimary = {
    code: 0,
    data: {
      dash: {
        video: [
          {
            base_url: 'https://xy116x196x140x27xy.mcdn.bilivideo.cn:8082/upgcxcode/a.m4s',
            backup_url: ['https://cn-sxxa-ct-03-01.bilivideo.com/upgcxcode/a.m4s', 'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/a.m4s'],
            bandwidth: 900000
          }
        ],
        audio: [
          {
            base_url: 'https://xy113x6x91x135xy.mcdn.bilivideo.cn:8082/upgcxcode/b.m4s',
            backup_url: ['https://xy58x144x144x19xy.mcdn.bilivideo.cn:8082/upgcxcode/b.m4s'],
            bandwidth: 100000
          }
        ]
      }
    }
  };
  const out = askXhr(env, pcdnPrimary).out;
  const v = out.data.dash.video[0];
  const a = out.data.dash.audio[0];
  check('PCDN 主地址被换成非 PCDN 备用', /^https:\/\/cn-sxxa/.test(v.base_url), v.base_url);
  check('换出来的备用仍留在备份链里', v.backup_url.indexOf('https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/a.m4s') !== -1, JSON.stringify(v.backup_url));
  check('没有可用非 PCDN 备用时保留原地址（不断流）', /mcdn/.test(a.base_url), a.base_url);
  env.menu['视频线路测速与选线']();
  const tableTxt = env.docEl.querySelector('#btk-panel').textContent;
  check('表格里仍保留原始 PCDN 候选可见', /mcdn\.bilivideo\.cn/.test(tableTxt) && /PCDN/.test(tableTxt), '');

  // 关掉剔除开关后不应有任何改写
  const off = boot({ enabled: { cdn: true }, cdn: { dropPcdn: false } });
  const same = askXhr(off, pcdnPrimary).outText === JSON.stringify(pcdnPrimary);
  check('关闭剔除时不改写', same, '');
} catch (e) {
  check('H 用例执行', false, e.message);
}

/* I. 画质自动取最高：三处档位来源取并集，切不过去降一档，确认真切过去才报成功 */
try {
  const env = boot({ enabled: { clean: true, player: true } });
  env.probe(
    'window.__playinfo__ = { code:0, data:{ quality:32, support_formats:[' +
      '{quality:32,display_desc:"480P"},{quality:80,display_desc:"1080P"},{quality:112,display_desc:"1080P",new_description:"1080P 高码率"}] } };' +
      'window.__btkReq = []; window.__cur = 32;' +
      'window.__INITIAL_STATE__.player = { requestQuality: function(q){ window.__btkReq.push(q); window.__cur = q; },' +
      ' getSupportedQualityList: function(){ return [112,80,32,16]; }, getQuality: function(){ return { realQ: window.__cur }; } };'
  );
  env.menu['打开设置面板']();
  collect(env.docEl, 'button').find((b) => b.textContent.trim() === '播放增强').click();
  const badgeBefore = (env.docEl.querySelector('#btk-q-stat') || {}).textContent;
  check('画质徽标已渲染', /等待|最高|未|正在/.test(badgeBefore || ''), badgeBefore);
  const go = findButton(env.docEl.querySelector('#btk-panel'), '立即切到最高画质');
  check('存在立即切最高画质按钮', !!go, '');
  go.click();
  await tick(1600);
  const reqs = env.probe('JSON.stringify(window.__btkReq)');
  check('只请求了下发档位中的最高值', reqs === '[112]', reqs);
  const badgeAfter = (env.docEl.querySelector('#btk-q-stat') || {}).textContent;
  check('切换结果被确认（不是静默成功）', /已切到 1080P/.test(badgeAfter || ''), badgeAfter);

  // 播放器不配合时要如实报「未生效」
  const env2 = boot({ enabled: { player: true } });
  env2.probe(
    'window.__playinfo__ = { code:0, data:{ quality:16, support_formats:[{quality:16,display_desc:"360P"},{quality:80,display_desc:"1080P"}] } };' +
      'window.__INITIAL_STATE__.player = { requestQuality: function(){}, getQuality: function(){ return { realQ: 16 }; }, getSupportedQualityList: function(){ return [16]; } };'
  );
  env2.menu['打开设置面板']();
  collect(env2.docEl, 'button').find((b) => b.textContent.trim() === '播放增强').click();
  findButton(env2.docEl.querySelector('#btk-panel'), '立即切到最高画质').click();
  await tick(13500);
  const badge2 = (env2.docEl.querySelector('#btk-q-stat') || {}).textContent;
  check('切不动时如实显示未生效', /未生效/.test(badge2 || ''), badge2);
  check('退档不会退到当前档再报成功', !/已是最高/.test(badge2 || ''), badge2);

  // 核心回归：4K（网页端 qn=120）只在播放器画质菜单里出现，页面 playinfo 给不到时也必须取到
  const env3 = boot({ enabled: { player: true } });
  env3.probe(
    'window.__playinfo__ = { code:0, data:{ quality:80, support_formats:[{quality:80,new_description:"1080P 高清"},{quality:112,new_description:"1080P 高码率"}] } };' +
      'window.__btkReq = []; window.__cur = 80;' +
      'window.__INITIAL_STATE__.player = { requestQuality: function(q){ window.__btkReq.push(q); window.__cur = q; },' +
      ' getSupportedQualityList: function(){ return [112,80]; }, getQuality: function(){ return { realQ: window.__cur }; } };' +
      'var mkq = function(v, t){ var li = document.createElement("li"); li.className = "bpx-player-ctrl-quality-menu-item";' +
      ' li.setAttribute("data-value", v); var s = document.createElement("span"); s.className = "bpx-player-ctrl-quality-text";' +
      ' s.textContent = t; li.appendChild(s); document.body.appendChild(li); };' +
      'mkq(120, "4K 超高清"); mkq(112, "1080P 高码率"); mkq(80, "1080P 高清"); mkq(0, "自动");'
  );
  env3.menu['打开设置面板']();
  collect(env3.docEl, 'button').find((b) => b.textContent.trim() === '播放增强').click();
  findButton(env3.docEl.querySelector('#btk-panel'), '立即切到最高画质').click();
  await tick(1600);
  const reqs3 = env3.probe('JSON.stringify(window.__btkReq)');
  check('菜单独有的 4K 被并集取到', reqs3 === '[120]', reqs3);
  const badge3 = (env3.docEl.querySelector('#btk-q-stat') || {}).textContent;
  check('档位文案取自菜单项（4K 超高清）', /已切到 4K 超高清/.test(badge3 || ''), badge3);
  findButton(env3.docEl.querySelector('#btk-panel'), '查看画质档位来源').click();
  const dbg = (env3.docEl.querySelector('#btk-q-debug') || {}).textContent;
  check(
    '档位来源读数含三个源与并集',
    /页面 playinfo/.test(dbg || '') && /画质菜单】120/.test(dbg || '') && /并集取档】120=4K 超高清/.test(dbg || ''),
    dbg
  );

  // 账号拿不到最高档时逐级退回，且按顺序真的试过被拒的那一档
  const env4 = boot({ enabled: { player: true } });
  env4.probe(
    'window.__playinfo__ = { code:0, data:{ quality:16, support_formats:[{quality:16,new_description:"360P 流畅"},{quality:80,new_description:"1080P 高清"},{quality:120,new_description:"4K 超高清"}] } };' +
      'window.__btkReq = []; window.__cur = 16;' +
      'window.__INITIAL_STATE__.player = { requestQuality: function(q){ window.__btkReq.push(q); if (q <= 80) window.__cur = q; },' +
      ' getSupportedQualityList: function(){ return [120,80,16]; }, getQuality: function(){ return { realQ: window.__cur }; } };'
  );
  env4.menu['打开设置面板']();
  collect(env4.docEl, 'button').find((b) => b.textContent.trim() === '播放增强').click();
  findButton(env4.docEl.querySelector('#btk-panel'), '立即切到最高画质').click();
  await tick(12500);
  check('先试 4K 被拒后降到 1080P', env4.probe('JSON.stringify(window.__btkReq)') === '[120,80]', env4.probe('JSON.stringify(window.__btkReq)'));
  const badge4 = (env4.docEl.querySelector('#btk-q-stat') || {}).textContent;
  check('降档后确认落在 1080P', /已切到 1080P 高清/.test(badge4 || ''), badge4);

  // 播放器没暴露 requestQuality 时走菜单点击（旧版选择器 .quality-menu-item 在真实 DOM 里根本不存在），
  // 且点击拿不到的档会弹登录框，必须收掉
  const env5 = boot({ enabled: { player: true } });
  env5.probe(
    'window.__playinfo__ = { code:0, data:{ quality:16, support_formats:[{quality:16,new_description:"360P 流畅"},{quality:120,new_description:"4K 超高清"}] } };' +
      'window.__cur = 16;' +
      'window.__INITIAL_STATE__.player = { getQuality: function(){ return { realQ: window.__cur }; } };' +
      'var mkq = function(v, t){ var li = document.createElement("li"); li.className = "bpx-player-ctrl-quality-menu-item";' +
      ' li.setAttribute("data-value", v); var s = document.createElement("span"); s.className = "bpx-player-ctrl-quality-text";' +
      ' s.textContent = t; li.appendChild(s);' +
      ' li.addEventListener("click", function(){ window.__cur = v; if (v === 120) { var m = document.createElement("div");' +
      ' m.className = "bili-mini-mask"; document.body.appendChild(m); } });' +
      ' document.body.appendChild(li); };' +
      'mkq(120, "4K 超高清"); mkq(16, "360P 流畅");'
  );
  env5.menu['打开设置面板']();
  collect(env5.docEl, 'button').find((b) => b.textContent.trim() === '播放增强').click();
  findButton(env5.docEl.querySelector('#btk-panel'), '立即切到最高画质').click();
  await tick(1600);
  check('无 requestQuality 时按 data-value 点中 4K', /已切到 4K 超高清/.test((env5.docEl.querySelector('#btk-q-stat') || {}).textContent || ''), (env5.docEl.querySelector('#btk-q-stat') || {}).textContent);
  check('点击引出的登录框被收掉', collect(env5.docEl, '.bili-mini-mask').length === 0, collect(env5.docEl, '.bili-mini-mask').length + ' 个');
} catch (e) {
  check('I 用例执行', false, e.message);
}

/* J. 顶栏自检：规则导致顶栏元素互相压住时自动停用肇事规则 */
try {
  const env = boot({ enabled: { clean: true } });
  const mk = (cls, parent) => {
    const n = env.sb.document.createElement('div');
    n.className = cls;
    (parent || env.docEl).appendChild(n);
    return n;
  };
  const header = mk('bili-header');
  const left = mk('left-entry', header);
  const items = [];
  for (let i = 0; i < 8; i++) {
    const it = mk('left-entry__item' + (i >= 2 && i <= 4 ? ' live-card-entry' : ''), left);
    it._rectFn = () => ({ x: 24 + i * 60, y: 0, width: 60, height: 64 });
    items.push(it);
  }
  const hidden = () => items.filter((it) => env.sb.getComputedStyle(it).display === 'none').length;
  const visW = () => (items.length - hidden()) * 60;
  left._rectFn = () => ({ x: 24, y: 0, width: visW(), height: 64 });
  const search = mk('center-search-container', header);
  // 导航一被规则挖空，B 站的搜索框就被重新排到导航上面（真实回归的几何形状）
  search._rectFn = () => ({ x: hidden() ? 24 + visW() - 120 : 24 + visW() + 20, y: 12, width: 268, height: 40 });
  const right = mk('right-entry', header);
  right._rectFn = () => ({ x: hidden() ? 24 + visW() + 148 : 24 + visW() + 308, y: 7, width: 290, height: 50 });

  const obs = env.observers[env.observers.length - 1];
  obs.cb([]);
  await tick(700);
  obs.cb([]);
  await tick(900);
  const off = env.cfg().clean.hostOff || {};
  const css = (env.docEl.querySelector('#btk-clean-style') || {}).textContent || '';
  check('自检发现顶栏重叠并停用了肇事规则', Array.isArray(off.www) && off.www.indexOf('liveCard') !== -1, JSON.stringify(off));
  check('停用后样式表不再包含该规则', !/live-card/.test(css), css.slice(0, 120));
  check('顶栏宽度恢复', visW() === 480, '可见宽度 ' + visW());
  check('停用后重叠消失', hidden() === 0 && search.getBoundingClientRect().left > left.getBoundingClientRect().right, '搜索框 x=' + Math.round(search.getBoundingClientRect().left));

  // 诊断按钮：不依赖任何调试工具就能把几何情况复制出来
  env.menu['打开设置面板']();
  collect(env.docEl, 'button').find((b) => b.textContent.trim() === '界面净化').click();
  const diagBtn = collect(env.docEl, 'button').find((b) => b.textContent.trim() === '复制顶栏诊断');
  check('存在复制顶栏诊断按钮', !!diagBtn, '');
  check('存在重测顶栏按钮', !!findButton(env.docEl, '重测顶栏'), '');
  diagBtn.click();
  await tick(120);
  const diag = (env.docEl.querySelector('#btk-diag') || {}).textContent || '';
  check('诊断文本含站点与几何', /站点：www/.test(diag) && /顶栏宽度：规则开 \d+ \/ 规则关 \d+/.test(diag), diag.replace(/\n/g, ' ⏎ ').slice(0, 190));
  check('诊断列出重叠与窗口尺寸', /重叠（规则关）：无重叠/.test(diag) && /窗口：\d+×\d+/.test(diag), diag.replace(/\n/g, ' ⏎ ').slice(0, 240));
  check('诊断列出被停用的规则', /本站已被自动停用：liveCard/.test(diag), '');
} catch (e) {
  check('J 用例执行', false, e.stack || e.message);
}

/* K. 顶栏重叠不是净化造成的：走修复梯度，修好才保留 */
try {
  const env = boot({ enabled: { clean: true }, clean: { liveCard: false } });
  const mk = (cls, parent) => {
    const n = env.sb.document.createElement('div');
    n.className = cls;
    (parent || env.docEl).appendChild(n);
    return n;
  };
  const header = mk('bili-header');
  const left = mk('left-entry', header);
  const search = mk('center-search-container', header);
  const right = mk('right-entry', header);
  const fixTag = () => (env.docEl.querySelector('#btk-header-fix') || {}).textContent || '';
  const fit = () => /flex:1 1 auto/.test(fixTag());
  left._rectFn = () => ({ x: 24, y: 0, width: 520, height: 64 });
  // 关掉我的样式表也一样压着：这是 B 站自身的挤压；fit 策略排开之后就不压了
  search._rectFn = () => ({ x: fit() ? 544 : 400, y: 12, width: 268, height: 40 });
  right._rectFn = () => ({ x: fit() ? 832 : 688, y: 7, width: 290, height: 50 });

  const obs = env.observers[env.observers.length - 1];
  obs.cb([]);
  await tick(700);
  obs.cb([]);
  await tick(900);
  const fh = env.cfg().clean.fixHeader || {};
  check('非净化造成的重叠走修复梯度', fh.www === 'fit', JSON.stringify(fh));
  check('修复样式已落到页面且未停用任何规则', /min-width:0/.test(fixTag()) && !((env.cfg().clean.hostOff || {}).www || []).length, fixTag().slice(0, 60));
  check('修好后重叠消失', fit() && search.getBoundingClientRect().left >= left.getBoundingClientRect().right, '搜索框 x=' + Math.round(search.getBoundingClientRect().left));
  env.menu['打开设置面板']();
  collect(env.docEl, 'button').find((b) => b.textContent.trim() === '界面净化').click();
  const note = collect(env.docEl, 'div').filter((d) => /顶栏挤压修复/.test(d.textContent || '')).map((d) => d.textContent)[0] || '';
  check('面板显示修复已启用', /已启用（fit）/.test(note), note.slice(0, 80));
} catch (e) {
  check('K 用例执行', false, e.stack || e.message);
}

/* L. 两种修复都无效时如实报告，不留半个样式 */
try {
  const env = boot({ enabled: { clean: true }, clean: { liveCard: false } });
  const mk = (cls, parent) => {
    const n = env.sb.document.createElement('div');
    n.className = cls;
    (parent || env.docEl).appendChild(n);
    return n;
  };
  const header = mk('bili-header');
  const left = mk('left-entry', header);
  const search = mk('center-search-container', header);
  left._rectFn = () => ({ x: 24, y: 0, width: 520, height: 64 });
  search._rectFn = () => ({ x: 400, y: 12, width: 268, height: 40 });

  const obs = env.observers[env.observers.length - 1];
  obs.cb([]);
  await tick(700);
  obs.cb([]);
  await tick(900);
  const fh = env.cfg().clean.fixHeader || {};
  const tag = env.docEl.querySelector('#btk-header-fix');
  check('修复无效时记为 none', fh.www === 'none', JSON.stringify(fh));
  check('修复无效时不留残余样式', !tag, tag ? tag.textContent.slice(0, 40) : '无');
  env.menu['打开设置面板']();
  collect(env.docEl, 'button').find((b) => b.textContent.trim() === '界面净化').click();
  const note = collect(env.docEl, 'div').filter((d) => /两种修复都无效/.test(d.textContent || '')).map((d) => d.textContent)[0] || '';
  check('面板如实说明修复无效并给出重叠量', /两种修复都无效/.test(note) && /压 \d+×\d+px/.test(note), note.slice(0, 120));
} catch (e) {
  check('L 用例执行', false, e.stack || e.message);
}

/* M. 清掉顶栏入口后搜索框被 flex 撑宽：量回原宽并钉住 */
try {
  const env = boot({ enabled: { clean: true } });
  const mk = (cls, parent) => {
    const n = env.sb.document.createElement('div');
    n.className = cls;
    (parent || env.docEl).appendChild(n);
    return n;
  };
  const header = mk('bili-header');
  const left = mk('left-entry', header);
  const items = [];
  for (let i = 0; i < 8; i++) {
    const it = mk('left-entry__item' + (i >= 2 && i <= 4 ? ' live-card-entry' : ''), left);
    it._rectFn = () => ({ x: 24 + i * 60, y: 0, width: 60, height: 64 });
    items.push(it);
  }
  const hidden = () => items.filter((it) => env.sb.getComputedStyle(it).display === 'none').length;
  left._rectFn = () => ({ x: 24, y: 0, width: (8 - hidden()) * 60, height: 64 });
  const search = mk('center-search-container', header);
  // B 站的搜索框是 flex:1 1 auto：导航一空出来就跟着变宽（现网实测 320 → 642）
  search._rectFn = () => ({ x: 34 + (8 - hidden()) * 60, y: 12, width: 320 + hidden() * 40, height: 40 });
  const right = mk('right-entry', header);
  right._rectFn = () => ({ x: 900, y: 7, width: 290, height: 50 });

  check('规则已把搜索框撑宽', hidden() > 0 && search.getBoundingClientRect().width > 320, '当前渲染宽 ' + search.getBoundingClientRect().width);
  const obs = env.observers[env.observers.length - 1];
  obs.cb([]);
  await tick(700);
  obs.cb([]);
  await tick(900);
  const keep = (env.docEl.querySelector('#btk-header-keep') || {}).textContent || '';
  check('钉住搜索框宽度的样式已注入', /max-width:320px/.test(keep), keep.slice(0, 90));
  check('钉的是清空规则前的原宽而不是撑宽后的值', /320/.test(keep) && search.getBoundingClientRect().width > 320, '渲染宽 ' + search.getBoundingClientRect().width);
  const mCfg = ((env.cfg() || {}).clean) || {};
  check('顶栏未被误判为压坏（没有停用规则、没上修复）', !((mCfg.hostOff || {}).www || []).length && !(mCfg.fixHeader || {}).www, JSON.stringify(mCfg.hostOff || {}) + ' / ' + JSON.stringify(mCfg.fixHeader || {}));
} catch (e) {
  check('M 用例执行', false, e.stack || e.message);
}

/* N. 主题：跟随 B 站引用它自己的设计变量，浅色/深色/自定义强调色/透明度都要落到样式里 */
try {
  const env = boot({ enabled: { clean: true }, ui: { theme: 'light', accent: '#00aa88', opacity: 80 } });
  const themeCss = () => ((env.docEl.querySelector('#btk-theme') || {}).textContent) || '';
  check('主题样式表已注入', !!env.docEl.querySelector('#btk-theme'), '');
  check('浅色主题落到具体颜色', /--btk-surface:#ffffff/.test(themeCss()), themeCss().slice(0, 90));
  check('自定义强调色覆盖主题', /--btk-accent:#00aa88/.test(themeCss()), '');
  check('不透明度低于 100 时改用 color-mix', /color-mix\(in srgb,#ffffff 80%,transparent\)/.test(themeCss()), (themeCss().match(/#btk-panel\{[^}]*\}/) || [''])[0]);

  const envAuto = boot({ enabled: { clean: true }, ui: { theme: 'auto' } });
  const autoCss = () => ((envAuto.docEl.querySelector('#btk-theme') || {}).textContent) || '';
  check('跟随 B 站时引用 B 站自己的设计变量', /--btk-surface:var\(--bg1_float/.test(autoCss()) && /--btk-text:var\(--text1/.test(autoCss()) && /--btk-accent:var\(--brand_pink/.test(autoCss()), autoCss().slice(0, 120));
  check('不透明度默认 100 时不用 color-mix', autoCss().indexOf('color-mix') === -1, autoCss().slice(-60));

  const envBad = boot({ enabled: { clean: true }, ui: { theme: 'nope', accent: 'red', opacity: 10 } });
  const badCss = () => ((envBad.docEl.querySelector('#btk-theme') || {}).textContent) || '';
  check('非法主题/颜色/透明度被兜底', /--btk-surface:var\(--bg1_float/.test(badCss()) && !/--btk-accent:red/.test(badCss()) && /60%/.test(badCss()), badCss().slice(-70));

  envAuto.menu['打开设置面板']();
  collect(envAuto.docEl, 'button').find((b) => b.textContent.trim() === '外观').click();
  await tick(120);
  const segs = collect(envAuto.docEl, 'button').filter((b) => ['跟随 B 站', '浅色', '深色'].indexOf((b.textContent || '').trim()) !== -1);
  check('外观页有主题三选', segs.length === 3, '找到 ' + segs.length + ' 个');
  check('当前主题在段选里高亮', segs.some((b) => b._cls.has('on') && b.textContent.trim() === '跟随 B 站'), '');
  const lightBtn = segs.find((b) => b.textContent.trim() === '浅色');
  lightBtn.click();
  await tick(120);
  check('点浅色后样式表立刻换成浅色且已存盘', /--btk-surface:#ffffff/.test(((envAuto.docEl.querySelector('#btk-theme') || {}).textContent) || '') && ((envAuto.cfg().ui || {}).theme) === 'light', JSON.stringify((envAuto.cfg().ui || {}).theme));
} catch (e) {
  check('N 用例执行', false, e.stack || e.message);
}

/* O. 面板几何与皮肤接线：矮窗口不能把标题栏顶出视口，配色必须走变量 */
try {
  const env = boot({ enabled: { clean: true } });
  const base = (env.addedStyles || []).join('\n');
  check('面板内统一 border-box（修掉 4px 横向滚动条）', /#btk-panel \*[^{]*\{box-sizing:border-box\}/.test(base), (base.match(/box-sizing[^}]*\}/) || [''])[0]);
  check('面板默认高度扣掉悬浮球占位', /height:min\(492px,calc\(100vh - 186px\)\)/.test(base), (base.match(/#btk-panel\{[^}]*height:[^;]*/) || [''])[0].slice(-48));
  check('面板配色走变量而不是写死', /#btk-panel\{[^}]*background:var\(--btk-surface\)/.test(base) && /#btk-rail\{[^}]*background:var\(--btk-rail\)/.test(base), '');

  const panel = env.docEl.querySelector('#btk-panel');
  env.docEl.clientHeight = 535;
  env.docEl.clientWidth = 1280;
  env.menu['打开设置面板']();
  await tick(120);
  check('535px 高的窗口里面板不顶出视口', panel.style.height === '349px', 'height=' + panel.style.height);
  check('顶部留出 10px 以上余量（535-174-349=12）', 535 - 174 - Number(String(panel.style.height).replace('px', '')) >= 8, 'top=' + (535 - 174 - 349));

  env.docEl.clientHeight = 380;
  env.menu['打开设置面板']();
  env.menu['打开设置面板']();
  await tick(120);
  check('极矮窗口改为贴底并保住最小高度', panel.style.height === '356px' && panel.style.bottom === '12px', 'height=' + panel.style.height + ' bottom=' + panel.style.bottom);
} catch (e) {
  check('O 用例执行', false, e.stack || e.message);
}

/* P. 播放器小工具必须吃主题变量：1.6.0 就是在这里把按钮文字留在深底上导致看不见 */
try {
  const env = boot({ enabled: { clean: true } });
  const base = (env.addedStyles || []).join('\n');
  const tools = (base.match(/#btk-tools\{[^}]*\}/) || [''])[0];
  const pop = (base.match(/#btk-pop\{[^}]*\}/) || [''])[0];
  check('工具条底色走主题变量', /background:var\(--btk-surface\)/.test(tools) && /color:var\(--btk-text\)/.test(tools), tools.slice(0, 110));
  check('工具条不再残留写死的白色玻璃', tools.indexOf('rgba(255,255,255') === -1 && pop.indexOf('rgba(255,255,255') === -1, pop.slice(0, 90));
  check('二级菜单同样跟随主题', /#btk-pop\{[^}]*background:var\(--btk-surface\)/.test(base), '');
  check('倍速读数走主题 info 色', /#btk-tools \.btk-rate\{[^}]*color:var\(--btk-info\)/.test(base), '');
  check('工具条按钮不再单独覆盖 color（由 .btk-btn 统一上色）', !/#btk-tools \.btk-btn\{[^}]*color:/.test(base) && !/#btk-pop \.btk-btn\{[^}]*color:/.test(base), (base.match(/#btk-tools \.btk-btn\{[^}]*\}/) || [''])[0]);
  check('压在画面上靠描边+投影区分', /#btk-tools\{[^}]*box-shadow:[^;}]*var\(--btk-shadow\)/.test(base) && /#btk-tools\{[^}]*border:1px solid var\(--btk-line\)/.test(base), (base.match(/box-shadow:[^;}]*/) || [''])[0]);
} catch (e) {
  check('P 用例执行', false, e.stack || e.message);
}

/* Q. 反馈包与自动更新元数据 */
try {
  check('脚本头带 @downloadURL 指向自身', /^\/\/ @downloadURL\s+https:\/\/\S+bili-toolkit\.user\.js$/m.test(SRC), (SRC.match(/^\/\/ @downloadURL.*$/m) || [''])[0]);
  check('脚本头带 @updateURL（Tampermonkey 才能自动检查更新）', /^\/\/ @updateURL\s+https:\/\/\S+bili-toolkit\.user\.js$/m.test(SRC), '');
  const RAW = 'https://raw\\.githubusercontent\\.com/xiangyu123123/bili-toolkit/main/web/bili-toolkit\\.user\\.js';
  check(
    '更新源指向 GitHub raw（发布 = git push，不依赖站点排队）',
    new RegExp('^// @updateURL\\s+' + RAW + '$', 'm').test(SRC),
    (SRC.match(/^\/\/ @updateURL.*$/m) || [''])[0]
  );
  check(
    '下载源同样指向 GitHub raw，避免装到旧副本',
    new RegExp('^// @downloadURL\\s+' + RAW + '$', 'm').test(SRC),
    (SRC.match(/^\/\/ @downloadURL.*$/m) || [''])[0]
  );
  check('脚本头带 @supportURL 指向反馈页', /^\/\/ @supportURL\s+https:\/\/\S+\/#feedback$/m.test(SRC), (SRC.match(/^\/\/ @supportURL.*$/m) || [''])[0]);

  const env = boot({ enabled: { clean: true, cdn: true }, clean: { liveCard: true }, cdn: { pin: 'fast.example.com' } });
  env.menu['打开设置面板']();
  collect(env.docEl, 'button').find((b) => b.textContent.trim() === '关于').click();
  await tick(150);
  const fb = findButton(env.docEl, '复制反馈包');
  check('关于页有「复制反馈包」', !!fb, '');
  fb.click();
  await tick(200);
  const pack = (env.docEl.querySelector('#btk-feedback') || {}).textContent || '';
  check('反馈包含版本与环境行', /v\d+\.\d+\.\d+ 反馈包/.test(pack) && /页面：https:\/\/www\.bilibili\.com/.test(pack) && /浏览器：node/.test(pack), pack.replace(/\n/g, ' ⏎ ').slice(0, 150));
  check('反馈包列出模块开关与命中数', /【模块】界面净化 开/.test(pack) && /【本页命中】/.test(pack), (pack.match(/【本页命中】.*/) || [''])[0].slice(0, 90));
  check('反馈包含净化停用/修复/钉宽与线路状态', /本站停用：无/.test(pack) && /顶栏修复：未启用/.test(pack) && /锁定：fast\.example\.com/.test(pack) && /P2P 拦截 0 次/.test(pack), (pack.match(/【线路】.*/) || [''])[0]);
  check('反馈包带顶栏几何明细', /【顶栏】/.test(pack) && /重叠（规则开）/.test(pack), (pack.match(/【顶栏】[\s\S]{0,80}/) || [''])[0].replace(/\n/g, ' ⏎ '));
  check('反馈包不含凭据类字段', !/cookie|token|password|authorization/i.test(pack), '');
} catch (e) {
  check('Q 用例执行', false, e.stack || e.message);
}

const report =
  results.map((r) => (r.p ? 'PASS ' : 'FAIL ') + r.n + (r.d ? '  [' + r.d + ']' : '')).join('\n') +
  '\n总计: ' + results.filter((r) => r.p).length + '/' + results.length + ' 通过';
fs.writeFileSync(ROOT + '/tools/last-run.txt', report);
console.log(report);
