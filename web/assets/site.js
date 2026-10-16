(function () {
  'use strict';

  const SCRIPT_URL = 'bili-toolkit.user.js';
  const statusEl = document.getElementById('status');
  let srcText = '';
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
        if (version) document.getElementById('ver').textContent = version.trim();

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

  loadSource();
})();
