(function () {
  'use strict';

  const SCRIPT_URL = 'bili-toolkit.user.js';
  const statusEl = document.getElementById('status');
  let srcText = '';
  let siteVersion = '';
  let statusTimer;

  function say(msg) {
    statusEl.textContent = msg;
    statusEl.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2600);
  }

  async function copy(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      say(okMsg);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      say(ok ? okMsg : '复制失败，请手动选择源码复制');
    }
  }

  function loadSource() {
    const pre = document.getElementById('src');
    const meta = document.getElementById('src-meta');
    const toggle = document.getElementById('toggle-src');

    fetch(SCRIPT_URL)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then((text) => {
        srcText = text;
        const lines = text.split('\n').length;
        const kb = (new Blob([text]).size / 1024).toFixed(1);
        meta.textContent = lines + ' 行 · ' + kb + ' KB · 纯本地实现，无第三方库';
        pre.textContent = text;

        const version = (text.match(/^\/\/ @version\s+(.+)$/m) || [])[1];
        if (version) {
          siteVersion = version.trim();
          document.getElementById('ver').textContent = siteVersion;
        }

        const env = document.getElementById('env-pack');
        if (env) {
          env.textContent = [
            'Bilibili 增强工具箱 · 安装页环境',
            '  页面：' + location.href,
            '  脚本版本：v' + (version || '?').trim(),
            '  下载地址：' + new URL('bili-toolkit.user.js', location.href).href,
            '  窗口：' + innerWidth + '×' + innerHeight + ' dpr' + devicePixelRatio,
            '  浏览器：' + navigator.userAgent,
            '  注：脚本自身的反馈包（模块开关 / 每条规则命中数 / 顶栏几何）要在 B 站页面里的控制台「关于 → 复制反馈包」生成。'
          ].join('\n');
        }

        toggle.addEventListener('click', () => {
          pre.hidden = !pre.hidden;
          toggle.textContent = pre.hidden ? '展开源码' : '收起源码';
          if (!pre.hidden) pre.focus();
        });
      })
      .catch((e) => {
        meta.textContent = '源码未能加载（' + e.message + '）';
        toggle.disabled = true;
      });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy-script]');
    if (btn) {
      if (!srcText) return say('源码还在加载中，稍等一下');
      return copy(srcText, '已复制完整脚本，粘进管理器的新建脚本即可');
    }
    const ref = e.target.closest('[data-copy]');
    if (ref) {
      const el = document.querySelector(ref.getAttribute('data-copy'));
      if (el) copy(el.textContent.trim(), '已复制 ' + el.textContent.trim().split('\n').length + ' 条');
    }
  });

  const FB_ENDPOINT = '/functions/v1/app?action=submit';
  const FB_ERRORS = {
    invalid_page: '页面类型没认出来，重新选一个再提交。',
    invalid_version: '版本栏为空或太长（上限 24 字）。',
    invalid_browser: '浏览器信息缺失，可能是隐私插件拦了 navigator 字段。',
    content_too_short: '现象至少写 5 个字，不然没法定位。',
    invalid_expected: '「期望」一栏内容不合法（过长或含控制字符）。',
    invalid_contact: '联系方式不合法（上限 80 字）。',
    invalid_json: '提交内容格式不对，刷新页面后重试。',
    invalid_body_size: '内容太长了（整体上限 8 KB）。',
    invalid_content_type: '提交格式不对（需要 JSON）。',
    unreadable_body: '请求体没读到，刷新后重试。',
    method_not_allowed: '这个地址只接受提交（POST）。',
    not_found: '反馈接口不在这个地址上（后端可能还没发布）。',
    save_failed: '服务端没能保存。你填的内容还在，稍后再点一次提交 —— 我不会自动重发，避免重复入库。'
  };

  function fbEnvLine() {
    return '环境：' + [
      navigator.userAgent.slice(0, 160),
      innerWidth + '×' + innerHeight + ' dpr' + devicePixelRatio,
      navigator.language,
      '脚本版本 v' + (siteVersion || '?')
    ].join(' · ');
  }

  function fbPayload() {
    return {
      page: document.getElementById('fb-page').value,
      version: (document.getElementById('fb-version').value.trim() || siteVersion || '').slice(0, 24),
      browser: fbEnvLine().slice(0, 200),
      content: document.getElementById('fb-content').value.trim(),
      expected: document.getElementById('fb-expected').value.trim() || null,
      contact: document.getElementById('fb-contact').value.trim() || null
    };
  }

  function fbResult(msg, kind) {
    const el = document.getElementById('fb-result');
    el.textContent = msg;
    el.className = kind || '';
  }

  function wireFeedback() {
    const form = document.getElementById('feedback-form');
    if (!form) return;
    const submit = document.getElementById('fb-submit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = fbPayload();
      if (payload.content.length < 5) return fbResult('现象至少写 5 个字。', 'err');
      submit.disabled = true;
      submit.textContent = '提交中…';
      fbResult('');
      let r;
      try {
        r = await fetch(FB_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        submit.disabled = false;
        submit.textContent = '提交反馈';
        return fbResult('连不上反馈接口（后端可能还没发布，或网络不通）。可以先用「复制我填的内容」。', 'err');
      }
      submit.disabled = false;
      submit.textContent = '提交反馈';

      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') === -1) {
        return fbResult(r.status === 401 || r.status === 403
          ? '提交被网关拒绝（' + r.status + '）：这一版可能还没发布后端。'
          : '接口返回了非 JSON 响应（HTTP ' + r.status + '）。', 'err');
      }
      let data;
      try {
        data = await r.json();
      } catch (err) {
        return fbResult('接口响应解析失败（HTTP ' + r.status + '）。', 'err');
      }
      if (r.ok && data && data.ok === true && typeof data.id === 'string') {
        document.getElementById('fb-content').value = '';
        document.getElementById('fb-expected').value = '';
        fbResult('已收到，编号 ' + data.id.slice(0, 8) + '。站主在后台能看到这一条。', 'ok');
        return;
      }
      const code = data && typeof data.error === 'string' ? data.error : '';
      fbResult((FB_ERRORS[code] || '提交失败（HTTP ' + r.status + (code ? ' · ' + code : '') + '）。') + ' 内容还留着，可以再试。', 'err');
    });

    document.getElementById('fb-copy-form').addEventListener('click', () => {
      const p = fbPayload();
      copy([
        '【反馈】页面：' + p.page + ' · 版本：' + p.version,
        p.content,
        p.expected ? '期望：' + p.expected : '',
        p.contact ? '联系：' + p.contact : '',
        p.browser
      ].filter(Boolean).join('\n'), '已复制，可以贴到 Issue 或面板反馈包里');
    });

    document.getElementById('fb-fill-env').addEventListener('click', () => {
      const ta = document.getElementById('fb-content');
      const line = '\n' + fbEnvLine();
      if (ta.value.indexOf(fbEnvLine()) === -1) ta.value = (ta.value.trimEnd() + line).trimStart();
      document.getElementById('fb-version').value = siteVersion || '';
      fbResult('已把环境信息写进现象末尾。', 'ok');
    });
  }

  /* ---------------------------------------------------- 站主登录与反馈后台 */

  const APP = '/functions/v1/app';
  const PAGE_LABEL = { video: '视频播放页', home: '首页 / 信息流', dynamic: '动态页', space: 'UP 主空间', live: '直播页', other: '其它' };
  const AUTH_ERRORS = {
    no_account: '这个站还没初始化账号，先在下面设置一个账号和密码。',
    account_exists: '账号已经初始化过了，直接登录即可；要改密码得站主本人操作。',
    bad_credentials: '账号或密码不对。',
    weak_password: '密码至少 10 位。',
    invalid_user: '账号名只能是 3–32 位字母、数字、_ . -。',
    too_many_attempts: '失败次数太多，已临时锁定，10 分钟后再试。',
    unauthorized: '还没登录。',
    session_expired: '登录已过期，重新登录一次。',
    list_failed: '读取列表失败，稍后再试。',
    delete_failed: '删除失败，条目可能还在。',
    service_not_configured: '服务端还没配置好。',
    invalid_id: '要删的编号不合法。'
  };

  function token() { try { return sessionStorage.getItem('btk.session') || ''; } catch (e) { return ''; } }
  function setToken(v) { try { if (v) sessionStorage.setItem('btk.session', v); else sessionStorage.removeItem('btk.session'); } catch (e) {} }

  function call(action, opts) {
    const headers = { 'content-type': 'application/json' };
    if (token()) headers['x-session'] = token();
    return fetch(APP + '?action=' + action, Object.assign({ credentials: 'same-origin', headers: headers }, opts || {})).then((r) => {
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') === -1) throw new Error('HTTP ' + r.status);
      return r.json().then((data) => ({ status: r.status, data: data }));
    });
  }

  function authMsg(text, kind) {
    const el = document.getElementById('auth-msg');
    el.textContent = text || '';
    el.className = kind || '';
  }

  function failAuth(err) {
    const m = String((err && err.message) || err);
    const hit = Object.keys(AUTH_ERRORS).filter((k) => m.indexOf(k) !== -1)[0];
    authMsg(hit ? AUTH_ERRORS[hit] : ('出错了：' + m), 'err');
  }

  function errText(res) {
    const code = res.data && typeof res.data.error === 'string' ? res.data.error : '';
    return AUTH_ERRORS[code] || ('请求失败（HTTP ' + res.status + (code ? ' · ' + code : '') + '）');
  }

  function pill(text, cls) {
    const s = document.createElement('span');
    s.className = cls || '';
    s.textContent = text;
    return s;
  }

  function renderItem(rec) {
    const box = document.createElement('article');
    box.className = 'fb-item';
    const head = document.createElement('div');
    head.className = 'head';
    head.appendChild(pill(PAGE_LABEL[rec.page] || rec.page || '未知页面', 'b'));
    head.appendChild(pill('v' + (rec.version || '?')));
    head.appendChild(pill(String(rec.created_at || '').replace('T', ' ').replace(/\.\d+Z$/, ' UTC')));
    if (rec.contact) head.appendChild(pill('联系：' + rec.contact));
    box.appendChild(head);

    const body = document.createElement('p');
    body.className = 'content';
    body.textContent = rec.unreadable ? '（这条读不出内容，编号 ' + rec.id + '）' : (rec.content || '（空）');
    box.appendChild(body);

    if (rec.expected) {
      const exp = document.createElement('p');
      exp.className = 'meta';
      exp.textContent = '期望：' + rec.expected;
      box.appendChild(exp);
    }
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = (rec.browser || '') + (rec.id ? '  ·  ' + rec.id : '');
    box.appendChild(meta);

    const row = document.createElement('div');
    row.className = 'row';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn tiny';
    copyBtn.textContent = '复制这条';
    copyBtn.addEventListener('click', () => copy(JSON.stringify(rec, null, 2), '已复制这条反馈的 JSON'));
    row.appendChild(copyBtn);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn tiny danger';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      if (!window.confirm('删除 ' + String(rec.id || '').slice(0, 8) + ' ？不可恢复。')) return;
      del.disabled = true;
      call('delete', { method: 'POST', body: JSON.stringify({ id: rec.id }) }).then((res) => {
        if (!res.data || res.data.ok !== true) throw new Error(errText(res));
        authMsg('已删除 ' + String(rec.id).slice(0, 8) + '。', 'ok');
        loadConsole();
      }, (err) => { del.disabled = false; failAuth(err); });
    });
    row.appendChild(del);
    box.appendChild(row);
    return box;
  }

  let consoleItems = [];

  function loadConsole() {
    authMsg('读取中…');
    call('list').then((res) => {
      if (!res.data || res.data.ok !== true) {
        if (res.status === 401) { setToken(''); showLoggedOut(); }
        throw new Error(errText(res));
      }
      consoleItems = (res.data.items || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const stats = document.getElementById('fb-stats');
      stats.textContent = '';
      stats.appendChild(pill('共 ' + consoleItems.length + ' 条'));
      stats.appendChild(pill('服务端 total ' + res.data.total));
      stats.appendChild(pill('未处理 ' + consoleItems.filter((r) => r.status === 'new').length + ' 条'));
      const list = document.getElementById('fb-items');
      list.textContent = '';
      if (!consoleItems.length) {
        const empty = document.createElement('p');
        empty.className = 'fb-empty';
        empty.textContent = '还没有人提交反馈。';
        list.appendChild(empty);
      } else {
        consoleItems.forEach((rec) => list.appendChild(renderItem(rec)));
      }
      authMsg('');
    }, (err) => { failAuth(err); showLoggedOut(); });
  }

  function showLoggedOut() {
    document.getElementById('console').hidden = true;
    document.getElementById('auth-form').hidden = false;
    document.getElementById('auth-out').hidden = true;
    call('status').then((res) => {
      const has = !!(res.data && res.data.has_account);
      document.getElementById('auth-title').textContent = has ? '站主登录' : '初始化站主账号';
      document.getElementById('auth-go').textContent = has ? '登录' : '创建并登录';
      document.getElementById('auth-note').textContent = has
        ? '登录后这一页会多出后台：反馈全文列表、逐条删除、导出 JSON。游客只能提交，看不到任何一条 —— 列表数据每次都要服务端校验会话令牌后才返回，不是靠页面隐藏。'
        : '第一次使用：设置一个账号和密码（密码至少 10 位），只有这一次能创建。密码只在服务端存 PBKDF2 散列，明文不落盘、不进仓库、也不经过聊天。';
    }, () => {});
  }

  function showLoggedIn(user) {
    document.getElementById('console').hidden = false;
    document.getElementById('auth-form').hidden = true;
    document.getElementById('auth-out').hidden = false;
    document.getElementById('auth-title').textContent = '已登录：' + (user || '站主');
    loadConsole();
  }

  function wireConsole() {
    const form = document.getElementById('auth-form');
    if (!form) return;
    let mode = 'login';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = {
        user: document.getElementById('auth-user').value.trim(),
        password: document.getElementById('auth-pass').value
      };
      if (!payload.user || !payload.password) return authMsg('账号和密码都要填。', 'err');
      const go = document.getElementById('auth-go');
      go.disabled = true;
      authMsg(mode === 'setup' ? '创建中…' : '登录中…');
      const start = mode === 'setup'
        ? call('setup', { method: 'POST', body: JSON.stringify(payload) }).then((res) => {
            if (!res.data || res.data.ok !== true) throw new Error(errText(res));
            return call('login', { method: 'POST', body: JSON.stringify(payload) });
          })
        : call('login', { method: 'POST', body: JSON.stringify(payload) });

      start.then((res) => {
        if (!res.data || res.data.ok !== true) throw new Error(errText(res));
        setToken(res.data.token);
        document.getElementById('auth-pass').value = '';
        go.disabled = false;
        showLoggedIn(res.data.user);
        say('已登录，反馈后台就在下面。');
      }, (err) => { go.disabled = false; failAuth(err); });
    });

    document.getElementById('auth-out').addEventListener('click', () => {
      call('logout', { method: 'POST', body: '{}' }).catch(() => {});
      setToken('');
      showLoggedOut();
      authMsg('已退出本页登录（会话令牌已作废）。', 'ok');
    });

    document.getElementById('fb-reload').addEventListener('click', loadConsole);
    document.getElementById('fb-export').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(consoleItems, null, 2)], { type: 'application/json' }));
      a.download = 'bili-toolkit-feedback.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });

    call('status').then((res) => {
      mode = res.data && res.data.has_account ? 'login' : 'setup';
      if (token()) showLoggedIn();
      else showLoggedOut();
    }, () => { mode = 'login'; showLoggedOut(); });
  }

  loadSource();
  wireFeedback();
  wireConsole();
})();
