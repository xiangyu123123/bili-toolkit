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

  loadSource();
  wireFeedback();
})();
