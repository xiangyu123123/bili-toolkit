// ==UserScript==
// @name         Bilibili 增强工具箱
// @name:en      Bilibili Toolkit
// @namespace    bili-toolkit
// @version      1.6.4
// @description  界面净化（含动态/直播页广告位）/ 播放增强 / 素材提取 / 弹幕评论 / 线路测速选线与 P2P 会话阻断 / 观看干扰弹窗屏蔽，分栏控制台，模块可独立开关
// @author       Qoder Sites
// @homepageURL  https://bili-toolkit-ppywmt0k7sa.qoder.website/
// @supportURL   https://bili-toolkit-ppywmt0k7sa.qoder.website/#feedback
// @downloadURL  https://raw.githubusercontent.com/xiangyu123123/bili-toolkit/main/web/bili-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/xiangyu123123/bili-toolkit/main/web/bili-toolkit.user.js
// @match        https://www.bilibili.com/*
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://live.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.6.4';
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  const CFG_KEY = 'btk.cfg.v1';

  const DEFAULTS = {
    enabled: { clean: true, player: true, extract: true, social: true, cdn: false },
    clean: {
      feedAd: true,
      liveCard: true,
      headerBanner: true,
      activityIframe: true,
      headerEntry: true,
      videoAdCard: true,
      dynAd: true,
      dynBanner: true,
      livePromo: true,
      channelBar: false,
      hostOff: {},
      fixHeader: {},
      custom: []
    },
    player: {
      toolbar: true,
      maxSpeed: 5,
      remember: true,
      speed: 1,
      intro: 0,
      outro: 0,
      next: false,
      shortcuts: true,
      volumeStep: 2,
      autoQuality: true,
      nags: true,
      nagAll: false,
      nagWords: ['点赞', '投币', '收藏', '关注', '充电', '试看', '大会员', '免费']
    },
    social: {
      dmHidden: false,
      dmWords: [],
      cmWords: [],
      cmCollapse: true
    },
    cdn: {
      dropPcdn: true,
      reorder: true,
      pin: '',
      portRule: true,
      blockP2p: true,
      patterns: [],
      latency: {},
      last: ''
    },
    ui: { launcher: null, panel: null, tab: 'clean', theme: 'auto', accent: '', opacity: 100 }
  };

  /* ------------------------------------------------------------------ utils */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function isObj(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function merge(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    const out = Object.assign({}, base);
    Object.keys(over).forEach((k) => {
      out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k];
    });
    return out;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let t = obj;
    keys.forEach((k) => {
      if (!isObj(t[k])) t[k] = {};
      t = t[k];
    });
    t[last] = value;
  }

  function esc(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function toSeconds(input) {
    if (typeof input === 'number') return input;
    const parts = String(input).split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return NaN;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(m / 60);
    return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  let toastTimer;
  function toast(msg) {
    let el = $('#btk-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'btk-toast';
      document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ------------------------------------------------------------------- conf */

  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

  function loadConfig() {
    let saved = {};
    try {
      const raw = hasGM ? GM_getValue(CFG_KEY, null) : localStorage.getItem(CFG_KEY);
      if (raw) saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      saved = {};
    }
    return merge(DEFAULTS, saved || {});
  }

  let cfg = loadConfig();

  function save() {
    try {
      if (hasGM) GM_setValue(CFG_KEY, cfg);
      else localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch (e) {
      toast('设置保存失败：存储被浏览器拒绝');
    }
  }

  const on = (mod) => !!(cfg.enabled && cfg.enabled[mod]);

  /* -------------------------------------------------------------------- css */

  GM_addStyle(`
  #btk-toast,#btk-launcher,#btk-tools,#btk-pop,#btk-panel{
    --btk-font:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
    --btk-mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
    --btk-surface:#101620;--btk-surface-2:#18212d;--btk-surface-3:#1f2a38;
    --btk-head:#141c27;--btk-rail:#0d1319;--btk-line:#24303f;--btk-line-soft:#1a2431;
    --btk-text:#d9e3ef;--btk-strong:#ffffff;--btk-text-2:#9fb0c4;--btk-text-3:#7b8ba0;
    --btk-accent:#fb7299;--btk-on-accent:#ffffff;--btk-brand:#00a1d6;--btk-info:#8fd6ff;
    --btk-ok:#4ad295;--btk-warn:#f0b429;--btk-input:#18212d;--btk-hover:#243043;--btk-selected:#18222f;
    --btk-track:#2a3646;--btk-thumb:#8ea2ba;--btk-shadow:rgba(0,0,0,.5)}
  .btk-hidden,.btk-dm-cut,.btk-nag-cut{display:none!important}
  /* B 站的全局 reset 不一定覆盖到面板内部：width:100% 的元素加上 padding 会多出几像素，
     实测让面板 body 出现 463>459 的横向滚动条。面板内统一 border-box 后消失。 */
  #btk-panel *,#btk-panel *::before,#btk-panel *::after{box-sizing:border-box}
  #btk-toast{position:fixed;left:50%;bottom:70px;transform:translate(-50%,10px);z-index:2147483646;
    background:var(--btk-surface);color:var(--btk-text);border:1px solid var(--btk-line);
    padding:10px 18px;border-radius:22px;font-size:14px;
    line-height:1.4;max-width:min(70vw,520px);opacity:0;pointer-events:none;transition:opacity .18s,transform .18s;
    box-shadow:0 8px 26px var(--btk-shadow);font-family:var(--btk-font)}
  #btk-toast.show{opacity:1;transform:translate(-50%,0)}

  #btk-launcher{position:fixed;right:16px;bottom:124px;z-index:2147483640;width:42px;height:42px;
    border-radius:50%;border:1px solid var(--btk-line);background:var(--btk-brand);color:var(--btk-on-accent);
    font:700 15px/1 var(--btk-font);cursor:grab;box-shadow:0 6px 20px var(--btk-shadow);touch-action:none}
  #btk-launcher:hover{background:var(--btk-accent)}
  #btk-launcher.drag{cursor:grabbing}
  #btk-launcher::after{content:attr(data-count);position:absolute;right:-2px;top:-2px;min-width:17px;height:17px;
    border-radius:9px;background:var(--btk-accent);color:var(--btk-on-accent);font:600 11px/17px var(--btk-font);text-align:center;padding:0 4px}

  #btk-panel{--btk-font:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
    position:fixed;right:16px;bottom:174px;z-index:2147483640;width:min(620px,calc(100vw - 28px));
    height:min(492px,calc(100vh - 186px));display:grid;grid-template-columns:146px 1fr;
    grid-template-rows:auto 1fr auto;grid-template-areas:"head head" "rail body" "foot foot";
    background:var(--btk-surface);color:var(--btk-text);border:1px solid var(--btk-line);border-radius:12px;overflow:hidden;
    box-shadow:0 22px 60px var(--btk-shadow);font:14px/1.6 var(--btk-font)}
  #btk-panel[hidden]{display:none}
  #btk-head{grid-area:head;display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--btk-head);
    border-bottom:1px solid var(--btk-line);cursor:grab;user-select:none}
  #btk-head .btk-logo{width:24px;height:24px;border-radius:50%;background:var(--btk-brand);color:var(--btk-on-accent);
    font:700 12px/24px var(--btk-font);text-align:center;flex:none}
  #btk-head b{font-size:15px;color:var(--btk-strong)}
  #btk-head .btk-ver{color:var(--btk-text-3);font-size:12px;font-family:var(--btk-mono)}
  #btk-close{margin-left:auto;width:30px;height:30px;border-radius:7px;border:0;background:transparent;
    color:var(--btk-text-2);font:600 17px/1 var(--btk-font);cursor:pointer}
  #btk-close:hover{background:var(--btk-hover);color:var(--btk-strong)}
  #btk-rail{grid-area:rail;background:var(--btk-rail);border-right:1px solid var(--btk-line);padding:8px 0;overflow-y:auto}
  .btk-tab{display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:0;background:transparent;
    color:var(--btk-text-2);font:14px/1.3 var(--btk-font);text-align:left;cursor:pointer;border-left:3px solid transparent}
  .btk-tab:hover{background:var(--btk-hover);color:var(--btk-text)}
  .btk-tab[aria-selected=true]{background:var(--btk-selected);color:var(--btk-strong);border-left-color:var(--btk-accent)}
  .btk-dot{width:7px;height:7px;border-radius:50%;background:var(--btk-thumb);flex:none}
  .btk-dot.live{background:var(--btk-ok);box-shadow:0 0 0 3px rgba(74,210,149,.15)}
  #btk-body{grid-area:body;overflow-y:auto;padding:14px 16px 20px}
  #btk-body h4{margin:0 0 3px;font-size:15px;color:var(--btk-strong)}
  #btk-body .btk-sub{color:var(--btk-text-3);font-size:12.5px;margin:0 0 12px}
  #btk-foot{grid-area:foot;display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--btk-head);
    border-top:1px solid var(--btk-line);font-size:12px;color:var(--btk-text-3)}

  .btk-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--btk-line-soft)}
  .btk-row:last-child{border-bottom:0}
  .btk-row .btk-label{flex:1;min-width:0}
  .btk-row .btk-name{display:block;color:var(--btk-text)}
  .btk-row .btk-tip{display:block;color:var(--btk-text-3);font-size:12px;line-height:1.45}
  .btk-sw{position:relative;flex:none;width:38px;height:22px}
  .btk-sw input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
  .btk-sw i{display:block;width:38px;height:22px;border-radius:11px;background:var(--btk-track);transition:background .16s;pointer-events:none}
  .btk-sw i::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;
    background:var(--btk-thumb);transition:transform .16s,background .16s}
  .btk-sw input:checked + i{background:var(--btk-accent)}
  .btk-sw input:checked + i::after{transform:translateX(16px);background:var(--btk-on-accent)}
  .btk-sw input:focus-visible + i{outline:3px solid var(--btk-accent);outline-offset:2px}
  .btk-hits{font:11.5px/1 var(--btk-mono);color:var(--btk-ok);background:rgba(74,210,149,.1);
    border:1px solid rgba(74,210,149,.3);border-radius:4px;padding:3px 6px;white-space:nowrap}
  .btk-hits.zero{color:var(--btk-text-3);background:var(--btk-surface-2);border-color:var(--btk-line)}
  #btk-panel input[type=number]{width:78px;background:var(--btk-input);border:1px solid var(--btk-line);color:var(--btk-text);
    border-radius:6px;padding:6px 8px;font:14px var(--btk-mono)}
  #btk-panel input[type=color]{width:44px;height:30px;padding:2px;background:var(--btk-input);border:1px solid var(--btk-line);border-radius:6px}
  #btk-panel input[type=range]{width:120px;accent-color:var(--btk-accent)}
  #btk-panel textarea{width:100%;min-height:70px;background:var(--btk-input);border:1px solid var(--btk-line);color:var(--btk-text);
    border-radius:7px;padding:8px 9px;font:12.5px/1.55 var(--btk-mono);resize:vertical}
  .btk-seg{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 2px}
  .btk-seg button{border:1px solid var(--btk-line);background:var(--btk-input);color:var(--btk-text-2);border-radius:6px;
    padding:6px 9px;font:13px var(--btk-mono);cursor:pointer}
  .btk-seg button:hover{border-color:var(--btk-hover);color:var(--btk-strong)}
  .btk-seg button.on{background:var(--btk-accent);border-color:var(--btk-accent);color:var(--btk-on-accent);font-weight:700}
  .btk-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 2px}
  .btk-btn{background:var(--btk-surface-2);border:1px solid var(--btk-line);color:var(--btk-text);border-radius:7px;padding:7px 11px;
    font:13px/1.3 var(--btk-font);cursor:pointer}
  .btk-btn:hover{background:var(--btk-hover);border-color:var(--btk-text-3);color:var(--btk-strong)}
  .btk-btn:disabled{opacity:.45;cursor:not-allowed}
  .btk-btn.pin{background:var(--btk-accent);border-color:var(--btk-accent);color:var(--btk-on-accent);font-weight:600}
  .btk-note{color:var(--btk-text-3);font-size:12px;margin:6px 0}
  .btk-note b{color:var(--btk-text)}
  #btk-panel mark{background:#f7c948;color:#1b1f24;padding:0 2px;border-radius:2px}
  .btk-collapsed .reply-content{filter:blur(5px);cursor:pointer;transition:filter .15s}
  #btk-material img{max-width:132px;border-radius:6px;display:block;margin:8px 0}
  #btk-material .btk-p{max-height:190px;overflow:auto;margin:8px 0;border-top:1px solid var(--btk-line-soft)}
  #btk-material .btk-p-row{display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid var(--btk-line-soft);font-size:12.5px}
  #btk-material .btk-p-row span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #btk-diag{white-space:pre-wrap;font-size:11px;background:var(--btk-rail);border:1px solid var(--btk-line);border-radius:6px;padding:8px;margin-top:8px;color:var(--btk-text-2)}

  #btk-tools{position:absolute;top:44px;right:10px;z-index:2147483639;display:flex;gap:5px;align-items:center;
    background:var(--btk-surface);border:1px solid var(--btk-line);border-radius:9px;padding:5px 6px;
    color:var(--btk-text);font:12.5px/1 var(--btk-font);opacity:0;transition:opacity .2s;pointer-events:none;
    max-width:calc(100% - 20px);box-shadow:0 4px 14px var(--btk-shadow)}
  #btk-tools.show,#btk-tools.pinned{opacity:1;pointer-events:auto}
  #btk-tools .btk-rate{min-width:46px;text-align:center;font:600 12.5px var(--btk-mono);color:var(--btk-info);cursor:pointer}
  #btk-tools .btk-btn{padding:5px 8px;font-size:12px}
  #btk-pop{position:absolute;top:82px;right:10px;z-index:2147483639;display:none;flex-direction:column;gap:4px;
    background:var(--btk-surface);border:1px solid var(--btk-line);border-radius:9px;padding:7px;min-width:148px;
    box-shadow:0 6px 18px var(--btk-shadow)}
  #btk-pop.show{display:flex}
  #btk-pop .btk-btn{text-align:left}

  #btk-panel table.btk-line{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px;table-layout:fixed}
  #btk-panel table.btk-line th{color:var(--btk-text-3);font-weight:500;text-align:left;padding:5px 6px;border-bottom:1px solid var(--btk-line)}
  #btk-panel table.btk-line td{padding:5px 6px;border-bottom:1px solid var(--btk-line-soft);vertical-align:middle;word-break:break-all}
  #btk-panel table.btk-line tr.pinned td{background:rgba(251,114,153,.13)}
  #btk-panel .btk-best{color:var(--btk-ok)}
  #btk-panel .btk-pcdn{color:var(--btk-warn)}
  #btk-panel .btk-dead{color:var(--btk-text-3)}
  #btk-panel .btk-keys{width:100%;border-collapse:collapse;font-size:13px}
  #btk-panel .btk-keys td{padding:4px 6px;border-bottom:1px solid var(--btk-line-soft)}
  #btk-panel .btk-keys td:first-child{font-family:var(--btk-mono);color:var(--btk-info);white-space:nowrap;width:1%}
  `);

  /* ------------------------------------------------------------------ theme */

  // 「跟随 B 站」不是猜类名：B 站自己在 :root 上发了 --bg1_float / --text1 / --brand_pink
  // 这套设计变量（实测浅色下 bg1_float=#FFFFFF、text1=#18191C、brand_pink=#FF6699），
  // 直接引用就能跟着它的明暗切换，不用我们判断它当前是深色还是浅色。
  const THEME_PALETTES = {
    auto: {
      surface: 'var(--bg1_float,#ffffff)', 'surface-2': 'var(--bg2,#f6f7f8)', 'surface-3': 'var(--bg3,#f1f2f3)',
      head: 'var(--bg1,#ffffff)', rail: 'var(--bg2,#f6f7f8)', line: 'var(--line_regular,#e3e5e7)', 'line-soft': '#efeff1',
      text: 'var(--text1,#18191c)', strong: 'var(--text1,#18191c)', 'text-2': 'var(--text2,#61666d)', 'text-3': 'var(--text3,#9499a0)',
      accent: 'var(--brand_pink,#ff6699)', 'on-accent': '#ffffff', brand: 'var(--brand_blue,#00aeec)', info: 'var(--brand_blue,#00aeec)',
      ok: 'var(--success_green,#17a34a)', warn: '#d48806', input: 'var(--bg2_float,#f6f7f8)', hover: 'var(--bg3,#f1f2f3)',
      selected: 'var(--bg3,#f1f2f3)', track: '#d7dadf', thumb: '#ffffff', shadow: 'rgba(0,0,0,.16)'
    },
    light: {
      surface: '#ffffff', 'surface-2': '#f6f7f8', 'surface-3': '#f1f2f3',
      head: '#ffffff', rail: '#f6f7f8', line: '#e3e5e7', 'line-soft': '#efeff1',
      text: '#18191c', strong: '#18191c', 'text-2': '#61666d', 'text-3': '#9499a0',
      accent: '#ff6699', 'on-accent': '#ffffff', brand: '#00aeec', info: '#00aeec',
      ok: '#17a34a', warn: '#d48806', input: '#f6f7f8', hover: '#f1f2f3',
      selected: '#eceef0', track: '#d7dadf', thumb: '#ffffff', shadow: 'rgba(0,0,0,.16)'
    },
    dark: {
      surface: '#101620', 'surface-2': '#18212d', 'surface-3': '#1f2a38',
      head: '#141c27', rail: '#0d1319', line: '#24303f', 'line-soft': '#1a2431',
      text: '#d9e3ef', strong: '#ffffff', 'text-2': '#9fb0c4', 'text-3': '#7b8ba0',
      accent: '#fb7299', 'on-accent': '#ffffff', brand: '#00a1d6', info: '#8fd6ff',
      ok: '#4ad295', warn: '#f0b429', input: '#18212d', hover: '#243043',
      selected: '#18222f', track: '#2a3646', thumb: '#8ea2ba', shadow: 'rgba(0,0,0,.5)'
    }
  };

  function themeOpacity() {
    const n = Math.round(Number(cfg.ui.opacity));
    return isNaN(n) ? 100 : Math.max(60, Math.min(100, n));
  }

  function applyTheme() {
    const name = THEME_PALETTES[cfg.ui.theme] ? cfg.ui.theme : 'auto';
    const p = THEME_PALETTES[name];
    const decls = Object.keys(p).map((k) => '--btk-' + k + ':' + p[k]);
    const accent = String(cfg.ui.accent || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(accent)) decls.push('--btk-accent:' + accent);
    const op = themeOpacity();
    const css =
      '#btk-toast,#btk-launcher,#btk-tools,#btk-pop,#btk-panel{' + decls.join(';') + '}' +
      (op < 100 ? '#btk-panel{background:color-mix(in srgb,' + p.surface + ' ' + op + '%,transparent)}' : '');
    let tag = $('#btk-theme');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'btk-theme';
      document.documentElement.appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
  }

  function themeSummary() {
    const names = { auto: '跟随 B 站', light: '浅色', dark: '深色' };
    const op = themeOpacity();
    return (names[cfg.ui.theme] || '跟随 B 站') + (cfg.ui.accent ? ' · 自定义强调色' : '') + (op < 100 ? ' · 不透明度 ' + op + '%' : '');
  }

  /* ------------------------------------------------------- module: 界面净化 */

  // 选择器取自 2026-10 现网实测命中；:has() 用于把整张推广卡连壳去掉。
  // pages 是站点前缀（www / t / space / live）：同一条选择器在不同子站的语义不一样，
  // 实测动态页的 .left-entry__item 装的是频道按钮，套用顶栏入口规则会把导航删掉并压坏搜索框。
  const CLEAN_RULES = [
    {
      id: 'feedAd',
      pages: ['www'],
      label: '信息流推广卡',
      sels: [
        '.bili-feed-card:has(a[href*="cm.bilibili.com"])',
        '.feed-ad',
        '[class*="feed-ad"]',
        '[class*="ad-report"]'
      ]
    },
    { id: 'liveCard', pages: ['www'], label: '直播入口卡片', sels: ['[class*="live-card"]', '.living-entry'] },
    { id: 'headerBanner', pages: ['www'], label: '顶栏大图推广', sels: ['.bili-header__banner', '#bili-header-banner-img'] },
    { id: 'activityIframe', pages: ['www'], label: '活动推广内嵌框', sels: ['iframe[src*="jinkela/short"]'] },
    {
      id: 'headerEntry',
      pages: ['www'],
      label: '顶栏入口（直播/游戏/会员购/漫画/赛事/下载）',
      sels: [
        '.bili-header .left-entry__item:has(a[href*="live.bilibili.com"])',
        '.bili-header .left-entry__item:has(a[href*="show.bilibili.com"])',
        '.bili-header .left-entry__item:has(a[href*="game.bilibili.com"])',
        '.bili-header .left-entry__item:has(a[href*="manga.bilibili.com"])',
        '.bili-header .left-entry__item:has(a[href*="/match/"])',
        '.bili-header .left-entry__item:has(a[href*="app.bilibili.com"])',
        '.bili-header a[href*="show.bilibili.com"]',
        '.bili-header a[href*="game.bilibili.com"]',
        '.bili-header a[href*="manga.bilibili.com"]',
        '.bili-header a[href*="app.bilibili.com"]'
      ]
    },
    { id: 'videoAdCard', pages: ['www'], label: '视频页侧栏广告卡', sels: ['.vcd:has(.badge-text)', '.vcd'] },
    {
      id: 'dynAd',
      pages: ['t', 'space'],
      label: '动态推广卡',
      sels: [
        '.bili-dyn-item:has(.ad-report)',
        '.bili-dyn-item:has(a[href*="cm.bilibili.com"])',
        '[class*="ad-report"]'
      ]
    },
    { id: 'dynBanner', pages: ['t', 'space'], label: '动态横幅', sels: ['.bili-dyn-banner'] },
    {
      id: 'livePromo',
      pages: ['live'],
      label: '直播页下载位与活动弹窗',
      sels: ['.bili-download-panel', '.download-panel-ctnr', '.link-popup-ctnr', '.side-bar-popup-cntr', '.banner-area']
    },
    { id: 'channelBar', pages: ['www'], label: '首页频道导航栏', sels: ['.bili-header__channel', '.header-channel'] }
  ];

  function pageKey() {
    return String((W.location && W.location.hostname) || '')
      .split('.')[0]
      .toLowerCase();
  }

  function ruleOnThisPage(r) {
    return !r.pages || r.pages.indexOf(pageKey()) !== -1;
  }

  function pageRules() {
    return CLEAN_RULES.filter(ruleOnThisPage);
  }

  function ruleSels(id) {
    const r = CLEAN_RULES.find((x) => x.id === id);
    return r && ruleOnThisPage(r) ? r.sels : [];
  }

  function ruleHits(id) {
    return ruleSels(id).reduce((n, s) => {
      try {
        return n + document.querySelectorAll(s).length;
      } catch (e) {
        return n;
      }
    }, 0);
  }

  // 顶栏区域元素：三块互压是「搜索框压头像」这类事故的主信号
  const HEADER_ZONES = ['.left-entry', '.center-search-container', '.right-entry'];
  // 修复梯度：从最保守的开始试，只有能把重叠消掉且不误伤才保留
  const HEADER_REPAIRS = [
    {
      id: 'fit',
      css:
        '.bili-header__bar{min-width:0!important;overflow:visible!important}' +
        '.bili-header .center-search-container{min-width:0!important;flex:1 1 auto!important}' +
        '.bili-header .left-entry{min-width:0!important;flex:0 1 auto!important}' +
        '.bili-header .right-entry{min-width:0!important;flex:0 0 auto!important}'
    },
    {
      id: 'clip',
      css:
        '.bili-header__bar{min-width:0!important}' +
        '.bili-header .left-entry{flex-wrap:nowrap!important;overflow:hidden!important}'
    }
  ];
  const headerChecked = {};

  function headerRoot() {
    return $('.bili-header__bar') || $('.bili-header');
  }

  function hostOffList() {
    const map = cfg.clean.hostOff || {};
    return Array.isArray(map[pageKey()]) ? map[pageKey()] : [];
  }

  function activeCleanSelectors() {
    if (!on('clean')) return [];
    const off = hostOffList();
    const sels = [];
    pageRules().forEach((r) => {
      if (!cfg.clean[r.id]) return;
      if (off.indexOf(r.id) !== -1) return;
      sels.push(...r.sels);
    });
    cfg.clean.custom.forEach((c) => {
      const s = (c || '').trim();
      if (s && off.indexOf(s) === -1) sels.push(s);
    });
    return sels;
  }

  // B 站给搜索框的是 flex:1 1 auto：导航入口一被清掉，搜索框就从 320px 撑到 642px，
  // 一路顶到头像前面 —— 用户看到的「搜索框和头像重叠/乱了」就是这个。先量回原宽，再钉住。
  let naturalSearchW = 0;

  function captureSearchWidth() {
    if (naturalSearchW) return;
    const el = $('.bili-header .center-search-container');
    if (!el) return;
    const tag = $('#btk-clean-style');
    const saved = tag ? tag.textContent : '';
    if (tag) tag.textContent = '';
    const w = Math.round(el.getBoundingClientRect().width);
    if (tag) tag.textContent = saved;
    if (w > 120) {
      naturalSearchW = w;
      applySearchKeep();
    }
  }

  function applySearchKeep() {
    const need = naturalSearchW && on('clean') && headerTouchedByRules();
    let tag = $('#btk-header-keep');
    if (!need) {
      if (tag) tag.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'btk-header-keep';
      document.documentElement.appendChild(tag);
    }
    const css = '.bili-header .center-search-container{max-width:' + naturalSearchW + 'px!important}';
    if (tag.textContent !== css) tag.textContent = css;
  }

  function headerTouchedByRules() {
    const t = headerTouching();
    return !!(t.rules.length || t.customs.length);
  }

  function applyCleanRules() {
    const css = activeCleanSelectors()
      .map((s) => `${s}{display:none!important}`)
      .join('');
    let tag = $('#btk-clean-style');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'btk-clean-style';
      document.documentElement.appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
    applyHeaderRepair(repairId());
    applySearchKeep();
  }

  // 顶栏自检：不靠我预设哪条规则危险 —— 只要某条规则命中的元素落在 .bili-header 里，
  // 且它导致顶栏塌宽或导航压在搜索框/头像上，就在本站停用它。
  function headerOverlap() {
    return headerCollisions().leaf.length > 0 || headerCollisions().zone.length > 0;
  }

  function headerWidth() {
    const e = $('.left-entry') || headerRoot();
    return e ? e.getBoundingClientRect().width : 0;
  }

  function boxLabel(el) {
    const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const txt = String(el.textContent || '').replace(/\s+/g, '').slice(0, 6);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (txt ? '(' + txt + ')' : '');
  }

  // 只量一次 rect，避免两两比较时反复触发布局
  function rectsOf(list) {
    return list.map((el) => ({ el, r: el.getBoundingClientRect() }));
  }

  function collidePairs(pairs, min) {
    const out = [];
    for (let i = 0; i < pairs.length; i += 1) {
      for (let j = i + 1; j < pairs.length; j += 1) {
        const a = pairs[i];
        const b = pairs[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > min && oy > min) out.push({ a: boxLabel(a.el), b: boxLabel(b.el), ox: Math.round(ox), oy: Math.round(oy) });
        if (out.length >= 6) return out;
      }
    }
    return out;
  }

  function visibleBoxes(sels) {
    const root = headerRoot();
    if (!root) return [];
    const found = [];
    sels.forEach((s) => {
      const el = $(s);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) found.push(el);
    });
    return found;
  }

  function headerItems() {
    const root = headerRoot();
    if (!root) return [];
    return $$('a, button, input, .left-entry__item, .channel-item', root).filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 14 || r.height < 14) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.15) return false;
      // 搜索建议、下拉这类浮层压住导航是正常行为，不是布局塌陷
      if (cs.position === 'absolute' || cs.position === 'fixed') return false;
      return true;
    });
  }

  function headerCollisions() {
    const zone = collidePairs(rectsOf(visibleBoxes(HEADER_ZONES)), 6);
    const leaf = collidePairs(rectsOf(headerItems()), 4);
    return { zone, leaf };
  }

  function collisionText(c) {
    const all = c.zone.concat(c.leaf);
    if (!all.length) return '无重叠';
    return all
      .slice(0, 4)
      .map((p) => p.a + ' × ' + p.b + ' 压 ' + p.ox + '×' + p.oy + 'px')
      .join('；');
  }

  function repairId() {
    const map = cfg.clean.fixHeader || {};
    return map[pageKey()] || '';
  }

  function applyHeaderRepair(id) {
    const rule = HEADER_REPAIRS.find((r) => r.id === id);
    const css = rule ? rule.css : '';
    let tag = $('#btk-header-fix');
    if (!css) {
      if (tag) tag.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'btk-header-fix';
      document.documentElement.appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
  }

  function setRepair(id) {
    if (!cfg.clean.fixHeader) cfg.clean.fixHeader = {};
    cfg.clean.fixHeader[pageKey()] = id;
    applyHeaderRepair(id);
  }

  function headerTouching() {
    const inHeader = (s) => {
      try {
        return Array.prototype.some.call(document.querySelectorAll(s), (el) => !!(el.closest && el.closest('.bili-header')));
      } catch (e) {
        return false;
      }
    };
    const rules = pageRules().filter((r) => cfg.clean[r.id] && r.sels.some(inHeader));
    const customs = (cfg.clean.custom || []).filter((s) => s.trim() && inHeader(s.trim()));
    return { rules, customs };
  }

  function headerClipped() {
    const doc = document.documentElement;
    const rr = $('.bili-header .right-entry');
    if (!doc || !rr) return null;
    const r = rr.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cw = doc.clientWidth || innerWidth || 0;
    const over = Math.round(r.right - cw);
    // 顶栏有 min-width:1100，窗口窄时头像整块被推到屏幕外（不是重叠，是够不着）
    return cw && over > 2 ? over : 0;
  }

  function headerBroken(c) {
    return !!(c.zone.length || c.leaf.length);
  }

  // 停用只作候选，不作结论：把候选规则的样式临时摘掉再量一次，压坏了才算它干的。
  function culpritTrial(culprits) {
    const tag = $('#btk-clean-style');
    if (!tag || !tag.textContent || !culprits.length) return false;
    const blocked = {};
    pageRules()
      .filter((r) => culprits.indexOf(r.id) !== -1)
      .forEach((r) => r.sels.forEach((s) => (blocked[s] = 1)));
    culprits.forEach((c) => {
      if (c[0] === '.' || c[0] === '#') blocked[c] = 1;
    });
    const css = activeCleanSelectors()
      .filter((s) => !blocked[s])
      .map((s) => s + '{display:none!important}')
      .join('');
    const saved = tag.textContent;
    tag.textContent = css;
    const c = headerCollisions();
    const clip = headerClipped();
    tag.textContent = saved;
    return !headerBroken(c) && !clip;
  }

  function commitCulprits(key, culprits) {
    if (!cfg.clean.hostOff) cfg.clean.hostOff = {};
    cfg.clean.hostOff[key] = culprits;
    save();
    applyCleanRules();
    toast('净化规则把顶栏压坏了，已在 ' + key + '.bilibili.com 停用 ' + culprits.length + ' 条（面板「净化」页可恢复）');
    renderPanel();
  }

  function checkHeaderSafe() {
    const key = pageKey();
    if (!on('clean') || headerChecked[key]) return;
    const clipped = headerClipped();
    const on0 = headerCollisions();
    if (!headerBroken(on0) && !clipped) {
      if (headerWidth() > 0) headerChecked[key] = true;
      return;
    }
    if (repairId()) {
      headerChecked[key] = true;
      return;
    }
    // 把我的净化样式临时摘掉，判断重叠到底是谁造成的
    const tag = $('#btk-clean-style');
    const saved = tag ? tag.textContent : '';
    if (tag) tag.textContent = '';
    const off0 = headerCollisions();
    const wOff = headerWidth();
    const clipOff = headerClipped();
    if (tag) tag.textContent = saved;
    if (!wOff && !headerBroken(off0) && !clipOff) return;
    headerChecked[key] = true;

    const touched = headerTouching();
    const culprits = touched.rules.map((r) => r.id).concat(touched.customs);
    if (!headerBroken(off0) && !clipOff && culpritTrial(culprits)) {
      commitCulprits(key, culprits);
      return;
    }
    const fixed = tryHeaderRepair(headerBroken(off0) || clipOff ? '关掉净化样式后顶栏依旧挤压' : '顶栏挤压只在净化规则开启时出现');
    if (fixed !== 'fit' && fixed !== 'clip' && culpritTrial(culprits)) commitCulprits(key, culprits);
  }

  function tryHeaderRepair(reason) {
    const key = pageKey();
    const before = headerCollisions();
    for (let i = 0; i < HEADER_REPAIRS.length; i += 1) {
      applyHeaderRepair(HEADER_REPAIRS[i].id);
      if (!headerBroken(headerCollisions()) && !headerClipped()) {
        setRepair(HEADER_REPAIRS[i].id);
        save();
        toast('顶栏挤压已修复（策略 ' + HEADER_REPAIRS[i].id + '）：' + reason);
        renderPanel();
        return HEADER_REPAIRS[i].id;
      }
    }
    applyHeaderRepair('');
    if (!cfg.clean.fixHeader) cfg.clean.fixHeader = {};
    cfg.clean.fixHeader[key] = 'none';
    save();
    toast('顶栏挤压不是净化造成的，两种修复都无效：' + collisionText(before) + '。诊断已可复制。');
    renderPanel();
    return 'none';
  }

  function restoreHeaderRules() {
    if (!cfg.clean.hostOff) cfg.clean.hostOff = {};
    delete cfg.clean.hostOff[pageKey()];
    if (cfg.clean.fixHeader) delete cfg.clean.fixHeader[pageKey()];
    applyHeaderRepair('');
    headerChecked[pageKey()] = false;
    save();
    applyCleanRules();
    renderPanel();
    toast('已恢复本站的顶栏规则与修复');
  }

  function recheckHeader() {
    headerChecked[pageKey()] = false;
    checkHeaderSafe();
    renderPanel();
    toast('已重测顶栏：' + collisionText(headerCollisions()));
  }

  // 不需要任何调试工具：把顶栏几何与规则命中情况拼成一段文本，复制给用户看
  function headerDiagnosis() {
    const tag = $('#btk-clean-style');
    const saved = tag ? tag.textContent : '';
    const cOn = headerCollisions();
    const wOn = headerWidth();
    let cOff = { zone: [], leaf: [] };
    let wOff = 0;
    if (tag && saved) {
      tag.textContent = '';
      cOff = headerCollisions();
      wOff = headerWidth();
      tag.textContent = saved;
    }
    const touched = headerTouching();
    const zones = {};
    HEADER_ZONES.forEach((s) => {
      const el = $(s);
      if (!el) return;
      const r = el.getBoundingClientRect();
      zones[s] = Math.round(r.left) + '~' + Math.round(r.right) + '（宽 ' + Math.round(r.width) + '）';
    });
    return [
      'Bilibili 工具箱 v' + VERSION + ' 顶栏诊断',
      '站点：' + pageKey() + '.bilibili.com ' + location.pathname.slice(0, 24),
      '窗口：' + innerWidth + '×' + innerHeight + ' dpr' + devicePixelRatio + ' · 横向溢出：' + (document.documentElement.scrollWidth > document.documentElement.clientWidth ? '有（' + document.documentElement.scrollWidth + 'px）' : '无'),
      '顶栏宽度：规则开 ' + Math.round(wOn) + ' / 规则关 ' + Math.round(wOff),
      '重叠（规则开）：' + collisionText(cOn),
      '重叠（规则关）：' + collisionText(cOff),
      '三块位置：' + (Object.keys(zones).length ? JSON.stringify(zones) : '未找到顶栏'),
      '命中顶栏内的规则：' + (touched.rules.map((r) => r.id).join(', ') || '无'),
      '命中顶栏内的自定义选择器：' + (touched.customs.join(' | ') || '无'),
      '本站已被自动停用：' + (hostOffList().join(' | ') || '无'),
      '顶栏修复策略：' + (repairId() || '未启用'),
      '当前开启的净化规则：' + pageRules().filter((r) => cfg.clean[r.id]).map((r) => r.id).join(', '),
      '自定义选择器：' + ((cfg.clean.custom || []).join(' | ') || '无')
    ].join('\n');
  }

  // 反馈包：一次把「哪一版 + 什么环境 + 开了哪些 + 命中/停用/修复」说清，
  // 让「XX 没生效」这种反馈不用再来回追问截图和控制台。不含 Cookie、凭据、历史记录。
  function feedbackPack() {
    const yn = (b) => (b ? '开' : '关');
    const de = document.documentElement;
    const hits = pageRules()
      .map((r) => r.label + ' ' + ruleHits(r.id) + (cfg.clean[r.id] ? '' : '（开关关）'))
      .join(' · ');
    return [
      'Bilibili 增强工具箱 v' + VERSION + ' 反馈包',
      '【环境】',
      '  页面：' + String(location.href).slice(0, 120),
      '  站点：' + pageKey() + '.bilibili.com',
      '  窗口：' + innerWidth + '×' + innerHeight + ' dpr' + devicePixelRatio + ' · 横向溢出：' + (de.scrollWidth > de.clientWidth ? '有（' + de.scrollWidth + 'px）' : '无'),
      '  浏览器：' + String(navigator.userAgent).slice(0, 160),
      '【模块】' + TABS.filter((t) => t.mod).map((t) => t.label + ' ' + yn(on(t.mod))).join(' · '),
      '【外观】' + themeSummary(),
      '【净化】本页适用 ' + pageRules().length + ' 条 · 本站停用：' + (hostOffList().join(' | ') || '无') +
        ' · 顶栏修复：' + (repairId() || '未启用') + ' · 搜索框钉宽：' + (naturalSearchW || '未采集') + 'px',
      '【本页命中】' + (hits || '无'),
      '【自定义选择器】' + ((cfg.clean.custom || []).join(' | ') || '无'),
      '【播放】小工具 ' + yn(cfg.player.toolbar) + ' · 自动最高画质 ' + yn(cfg.player.autoQuality) +
        ' · 干扰屏蔽 ' + yn(cfg.player.nags) + '（关键词 ' + (cfg.player.nagWords || []).length + ' 个' + (cfg.player.nagAll ? ' · 提示条全关' : '') + '）· 倍速上限 ' + cfg.player.maxSpeed,
      '【弹幕评论】弹幕整层隐藏 ' + yn(cfg.social.dmHidden) + ' · 弹幕词 ' + (cfg.social.dmWords || []).length +
        ' · 评论词 ' + (cfg.social.cmWords || []).length + ' · 折叠 ' + yn(cfg.social.cmCollapse),
      '【线路】剔除 PCDN ' + yn(cfg.cdn.dropPcdn) + ' · 重排 ' + yn(cfg.cdn.reorder) + ' · 锁定：' + (cfg.cdn.pin || '无') +
        ' · 本次候选主机 ' + candidates.length + ' 个 · P2P 拦截 ' + blockedP2p + ' 次',
      '【顶栏】',
      headerDiagnosis()
        .split('\n')
        .slice(1)
        .map((l) => '  ' + l)
        .join('\n')
    ].join('\n');
  }

  // 停用是「本站跳过」而不是删除：自定义选择器列表保持原样，恢复按钮能整站还原。
  function disableAllCleanHere() {
    if (!cfg.clean.hostOff) cfg.clean.hostOff = {};
    cfg.clean.hostOff[pageKey()] = pageRules()
      .map((r) => r.id)
      .concat((cfg.clean.custom || []).map((s) => (s || '').trim()).filter(Boolean));
    save();
    applyCleanRules();
    renderPanel();
    toast('本站已停用全部净化规则（规则列表未删除，点「恢复」即可还原）');
  }

  function cssPath(el) {
    const out = [];
    let node = el;
    while (node && node.nodeType === 1 && out.length < 4) {
      if (node.id) {
        out.unshift('#' + CSS.escape(node.id));
        break;
      }
      const cls = String(node.className || '')
        .split(/\s+/)
        .filter((c) => /^[A-Za-z][\w-]*$/.test(c))
        .slice(0, 2);
      if (cls.length) {
        out.unshift(node.tagName.toLowerCase() + '.' + cls.join('.'));
      } else if (node.parentElement) {
        const same = Array.from(node.parentElement.children).filter((c) => c.tagName === node.tagName);
        out.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (same.indexOf(node) + 1) + ')');
      } else {
        out.unshift(node.tagName.toLowerCase());
      }
      node = node.parentElement;
    }
    return out.join(' > ');
  }

  let picking = false;
  let hoverEl = null;
  let hoverOutline = '';

  function startPick() {
    picking = true;
    toast('拾取模式：点击要隐藏的元素，按 Esc 取消');
    const onMove = (e) => {
      if (hoverEl) {
        hoverEl.style.outline = hoverOutline;
      }
      hoverEl = e.target;
      hoverOutline = hoverEl.style.outline;
      hoverEl.style.outline = '2px solid #fb7299';
      e.preventDefault();
    };
    const onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = cssPath(e.target);
      if (sel && cfg.clean.custom.indexOf(sel) === -1) cfg.clean.custom.push(sel);
      e.target.classList.add('btk-hidden');
      save();
      applyCleanRules();
      closePick();
      renderPanel();
      toast('已隐藏并记录：' + sel);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closePick();
    };
    function closePick() {
      picking = false;
      if (hoverEl) hoverEl.style.outline = hoverOutline;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  /* ------------------------------------------------------- module: 播放增强 */

  let boundVideo = null;
  let skipState = { intro: false, outro: false };
  let toolsEl = null;
  let popEl = null;

  const playerRoot = () =>
    $('#bilibili-player') || $('.bpx-player-video-wrap') || $('.bilibili-player-video-wrap') || $('#mplayer');

  const videoEl = () => $('video');

  function setRate(rate) {
    const v = videoEl();
    if (!v) return;
    const max = Number(cfg.player.maxSpeed) || 5;
    const r = Math.min(max, Math.max(0.1, Math.round(rate * 100) / 100));
    v.playbackRate = r;
    if (cfg.player.remember) cfg.player.speed = r;
    save();
    updateTools();
    toast('倍速 ' + r.toFixed(2) + 'x');
  }

  function adjustVolume(delta) {
    const v = videoEl();
    if (!v) return;
    v.volume = Math.min(1, Math.max(0, v.volume + delta / 100));
    toast('音量 ' + Math.round(v.volume * 100) + '%');
  }

  function bindVideo() {
    const v = videoEl();
    if (!v) {
      boundVideo = null;
      return false;
    }
    if (boundVideo === v) return true;
    boundVideo = v;
    const applyRemembered = () => {
      if (!cfg.player.remember || !on('player')) return;
      const max = Number(cfg.player.maxSpeed) || 5;
      v.playbackRate = Math.min(max, Number(cfg.player.speed) || 1);
    };
    v.addEventListener('loadedmetadata', applyRemembered);
    v.addEventListener('loadedmetadata', () => {
      if (on('player') && cfg.player.autoQuality) scheduleAutoQuality();
    });
    v.addEventListener('ratechange', () => {
      if (cfg.player.remember && v.playbackRate <= (Number(cfg.player.maxSpeed) || 5)) {
        cfg.player.speed = v.playbackRate;
        save();
      }
      updateTools();
    });
    v.addEventListener('timeupdate', handleSkip);
    v.addEventListener('seeking', () => {
      skipState = { intro: false, outro: false };
    });
    v.addEventListener('ended', handleEnded);
    applyRemembered();
    attachTools();
    return true;
  }

  function handleSkip() {
    const v = boundVideo;
    if (!v || !v.duration || !isFinite(v.duration)) return;
    const intro = toSeconds(cfg.player.intro) || 0;
    const outro = toSeconds(cfg.player.outro) || 0;
    if (intro > 0 && !skipState.intro && v.currentTime < intro - 0.4) {
      skipState.intro = true;
      v.currentTime = intro;
      toast('已跳过片头 ' + fmtTime(intro));
    }
    if (outro > 0 && !skipState.outro && v.duration - v.currentTime < outro && v.currentTime < v.duration - 1) {
      skipState.outro = true;
      v.currentTime = v.duration - 0.05;
      toast('已跳到片尾');
    }
  }

  function handleEnded() {
    if (!cfg.player.next || !on('player')) return;
    const nextBtn = $('.bpx-player-control-btn-next, .bilibili-player-video-btn-next');
    if (nextBtn) {
      nextBtn.click();
      toast('工具箱：自动播放下一个');
      return;
    }
    const st = W.__INITIAL_STATE__;
    const pages = st && (st.pages || (st.videoData && st.videoData.pages));
    if (!Array.isArray(pages) || pages.length < 2) return;
    const cur = Number((st.videoData && st.videoData.page) && st.videoData.page.page) || 1;
    if (cur < pages.length) {
      location.href = `https://www.bilibili.com/video/${st.bvid}/?p=${cur + 1}`;
    }
  }

  function ensureToolsShown(show) {
    if (toolsEl && !(popEl && popEl.classList.contains('show'))) toolsEl.classList.toggle('show', show);
    if (!show && popEl) popEl.classList.remove('show');
  }

  function togglePop(force) {
    if (!popEl) return;
    const want = force === undefined ? !popEl.classList.contains('show') : force;
    popEl.classList.toggle('show', want);
    if (toolsEl) toolsEl.classList.toggle('pinned', want);
  }

  function toolAction(act) {
    const vid = videoEl();
    if (act === 'slow') setRate((vid ? vid.playbackRate : 1) - 0.25);
    else if (act === 'fast') setRate((vid ? vid.playbackRate : 1) + 0.25);
    else if (act === 'reset') setRate(1);
    else if (act === 'dm') toggleDanmaku();
    else if (act === 'time') copyTimestamp();
    else if (act === 'line') openTab('cdn');
    else if (act === 'cfg') openTab('player');
    else if (act === 'more') togglePop();
    else if (act === 'intro' && vid) {
      cfg.player.intro = Math.round(vid.currentTime);
      save();
      renderPanel();
      toast('片头结束点 = ' + fmtTime(cfg.player.intro) + '（可在设置面板改）');
    } else if (act === 'outro' && vid) {
      cfg.player.outro = Math.max(0, Math.round(vid.duration - vid.currentTime));
      save();
      renderPanel();
      toast('片尾提前量 = ' + fmtTime(cfg.player.outro) + '（可在设置面板改）');
    }
  }

  function attachTools() {
    const root = playerRoot();
    const v = videoEl();
    if (!root || !v) return;
    if (!cfg.player.toolbar || !on('player')) return;
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    if (toolsEl && root.contains(toolsEl)) {
      updateTools();
      return;
    }
    toolsEl = document.createElement('div');
    toolsEl.id = 'btk-tools';
    toolsEl.innerHTML =
      '<button class="btk-btn" data-act="slow" title="降低倍速">−</button>' +
      '<span class="btk-rate" data-act="reset" title="回到 1.00x">1.00x</span>' +
      '<button class="btk-btn" data-act="fast" title="提高倍速">+</button>' +
      '<button class="btk-btn" data-act="dm" title="显示/隐藏弹幕">弹幕</button>' +
      '<button class="btk-btn" data-act="more" title="更多工具箱">⋯</button>';
    popEl = document.createElement('div');
    popEl.id = 'btk-pop';
    popEl.innerHTML =
      '<button class="btk-btn" data-act="intro">⏱ 此处设为片头结束</button>' +
      '<button class="btk-btn" data-act="outro">⏱ 此处设为片尾起点</button>' +
      '<button class="btk-btn" data-act="time">复制时间戳链接</button>' +
      '<button class="btk-btn" data-act="line">线路测速与选线</button>' +
      '<button class="btk-btn" data-act="cfg">打开设置面板</button>';
    root.appendChild(toolsEl);
    root.appendChild(popEl);
    [toolsEl, popEl].forEach((box) => {
      box.addEventListener('click', (e) => {
        const act = e.target && e.target.getAttribute('data-act');
        if (act) {
          e.preventDefault();
          e.stopPropagation();
          toolAction(act);
        }
      });
    });
    document.addEventListener('click', (e) => {
      if (popEl && popEl.classList.contains('show') && !popEl.contains(e.target) && !toolsEl.contains(e.target)) togglePop(false);
    });
    const wrap = root.closest('.bpx-player-container, .bilibili-player-container') || root;
    wrap.addEventListener('mouseenter', () => ensureToolsShown(true));
    wrap.addEventListener('mouseleave', () => ensureToolsShown(false));
    updateTools();
  }

  function updateTools() {
    if (!toolsEl) return;
    const v = videoEl();
    const label = $('.btk-rate', toolsEl);
    if (label && v) label.textContent = v.playbackRate.toFixed(2) + 'x';
    const dm = $('[data-act="dm"]', toolsEl);
    if (dm) dm.textContent = cfg.social.dmHidden ? '弹幕✕' : '弹幕';
  }

  function isTyping(e) {
    const t = e.target;
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable || picking;
  }

  function copyTimestamp() {
    const v = videoEl();
    if (!v) return toast('未找到播放器');
    const st = W.__INITIAL_STATE__;
    const bvid = st && st.bvid;
    if (!bvid) return toast('该页面没有 BV 号');
    const p = new URLSearchParams(location.search).get('p') || '1';
    const url = `https://www.bilibili.com/video/${bvid}/?p=${p}&t=${Math.floor(v.currentTime)}`;
    copyText(url).then((ok) => toast(ok ? '已复制时间戳链接 ' + fmtTime(v.currentTime) : '复制失败'));
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (!on('player') || !cfg.player.shortcuts || isTyping(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const v = videoEl();
      const k = e.key;
      const step = Number(cfg.player.volumeStep) || 2;
      if (k === ',') {
        adjustVolume(-step);
      } else if (k === '.') {
        adjustVolume(step);
      } else if (k === '[') {
        setRate((v ? v.playbackRate : 1) - 0.25);
      } else if (k === ']') {
        setRate((v ? v.playbackRate : 1) + 0.25);
      } else if (k === '\\') {
        setRate(1);
      } else if (k === 'D' && e.shiftKey) {
        toggleDanmaku();
      } else if (k === 'T' && e.shiftKey) {
        copyTimestamp();
      } else if (k === 'X' && e.shiftKey) {
        togglePanel();
      } else if (k === 'I' && e.shiftKey && v) {
        cfg.player.intro = Math.round(v.currentTime);
        save();
        toast('片头结束点 = ' + fmtTime(cfg.player.intro));
      } else if (k === 'O' && e.shiftKey && v) {
        cfg.player.outro = Math.max(0, Math.round(v.duration - v.currentTime));
        save();
        toast('片尾提前量 = ' + fmtTime(cfg.player.outro));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  let bindTimer = 0;
  function watchPlayer() {
    if (bindTimer) return;
    // 切 P / 改清晰度时播放器会替换 video 元素，需要持续重新绑定
    bindTimer = setInterval(() => {
      if (!on('player') || !cfg.player.toolbar) return;
      if (bindVideo()) attachTools();
    }, 1200);
  }

  /* ------------------------------------------------ module: 弹幕与评论 */

  // 现网桌面端弹幕是 DOM 节点（.bili-danmaku-x-*），不是 canvas
  const DM_WRAP_SEL = ['[class*="bpx-player-render-dm-wrap"]', '[class*="dm-wrap"]', '.bilibili-player-video-danmaku'];
  const DM_ITEM_SEL = '[class*="bili-danmaku-x-"]';
  let dmObserver = null;
  let dmScanQueued = false;

  function dmLayerCss(hidden) {
    if (!hidden) return '';
    return DM_WRAP_SEL.map((s) => `${s}{display:none!important}`).join('');
  }

  function applyDmLayer() {
    let tag = $('#btk-dm-style');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'btk-dm-style';
      document.documentElement.appendChild(tag);
    }
    const css = on('social') && cfg.social.dmHidden ? dmLayerCss(true) : '';
    if (tag.textContent !== css) tag.textContent = css;
  }

  function toggleDanmaku() {
    if (!on('social')) return toast('请先在工具箱面板开启「弹幕评论」模块');
    cfg.social.dmHidden = !cfg.social.dmHidden;
    save();
    applyDmLayer();
    toast(cfg.social.dmHidden ? '弹幕已隐藏' : '弹幕已显示');
  }

  function scanDanmaku() {
    if (!on('social')) return;
    const words = cfg.social.dmWords.filter(Boolean);
    $$(DM_ITEM_SEL).forEach((el) => {
      if (!words.length) {
        if (el.classList.contains('btk-dm-cut')) el.classList.remove('btk-dm-cut');
        return;
      }
      const text = el.textContent || '';
      el.classList.toggle('btk-dm-cut', words.some((w) => text.indexOf(w) !== -1));
    });
    updateDmStat();
  }

  function queueDmScan() {
    if (dmScanQueued) return;
    dmScanQueued = true;
    requestAnimationFrame(() => {
      dmScanQueued = false;
      scanDanmaku();
    });
  }

  function dmCutCount() {
    return $$(DM_ITEM_SEL).filter((el) => el.classList.contains('btk-dm-cut')).length;
  }

  function watchDanmaku() {
    if (dmObserver) return;
    const host = $('#bilibili-player') || document.body;
    if (!host) return;
    dmObserver = new MutationObserver(queueDmScan);
    dmObserver.observe(host, { childList: true, subtree: true, characterData: true });
  }

  function scanComments() {
    if (!on('social')) return;
    const words = cfg.social.cmWords.filter(Boolean);
    const items = $$('.reply-item');
    items.forEach((item) => {
      const content = $('.reply-content', item);
      if (!content) return;
      const text = content.textContent || '';
      const hit = words.some((w) => text.indexOf(w) !== -1);
      item.classList.toggle('btk-collapsed', !!(hit && cfg.social.cmCollapse));
      if (!hit || !words.length) return;
      if (item.dataset.btkHl !== words.join('|')) {
        item.dataset.btkHl = words.join('|');
        highlight(content, words);
      }
    });
  }

  function highlight(root, words) {
    const re = new RegExp('(' + words.map(esc).join('|') + ')', 'g');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest('mark,script,style,a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      if (re.test(n.nodeValue)) targets.push(n);
      re.lastIndex = 0;
    }
    targets.forEach((node) => {
      const frag = document.createDocumentFragment();
      let last = 0;
      node.nodeValue.replace(re, (m, g, idx) => {
        frag.appendChild(document.createTextNode(node.nodeValue.slice(last, idx)));
        const mark = document.createElement('mark');
        mark.textContent = m;
        frag.appendChild(mark);
        last = idx + m.length;
      });
      frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  document.addEventListener('click', (e) => {
    const item = e.target && e.target.closest && e.target.closest('.btk-collapsed');
    if (item) item.classList.remove('btk-collapsed');
  }, true);

  /* -------------------------------------------- module: 画质自动取最高 */

  // 档位来源必须并集取：页面内嵌的 __playinfo__ 是服务端按普通 fnval 生成的，4K/8K 只出现在
  // 播放器自己那次 fnval=4048&fourk=1 的请求里，只信它会永远停在 1080P 高码率。
  // 并集之外不自己拼 quality 数值去试，切不过去的档由播放器返回次高一档。
  let qualityState = { target: 0, cur: 0, msg: '等待播放器就绪' };
  let qualityTimer = 0;
  let qualityWaitTimer = 0;
  let qualityRunKey = '';
  let qualityUsedClick = false;

  // 实测网页端 4K 是 120（不是 116）；这里只当档位文案的兜底，绝不拿它当候选档位去试
  const QN_NAMES = { 16: '360P 流畅', 32: '480P 标清', 64: '720P 准高清', 80: '1080P 高清', 112: '1080P 高码率', 120: '4K 超高清', 127: '8K 超高清' };

  function playerCore() {
    const st = W.__INITIAL_STATE__;
    return (st && st.player) || null;
  }

  // 只有能切档的播放器才走 requestQuality；读档位与枚举不能也依赖它，否则接口缺一就全盘失效
  function playerApi() {
    const p = playerCore();
    return p && typeof p.requestQuality === 'function' ? p : null;
  }

  function supportFormats() {
    const d = (W.__playinfo__ || {}).data || {};
    return Array.isArray(d.support_formats) ? d.support_formats : [];
  }

  function playinfoQualities() {
    return supportFormats()
      .map((f) => Number(f.quality))
      .filter((n) => n > 0);
  }

  function liveQualities() {
    const p = playerCore();
    try {
      const l = p && p.getSupportedQualityList ? p.getSupportedQualityList() : [];
      return (Array.isArray(l) ? l : [])
        .map(Number)
        .filter((n) => n > 0);
    } catch (e) {
      return [];
    }
  }

  // data-value 就是这一档的 qn，0 是「自动」
  function menuQualities() {
    return $$('.bpx-player-ctrl-quality-menu-item')
      .map((li) => Number(li.getAttribute('data-value')))
      .filter((n) => n > 0);
  }

  function availableQualities() {
    const out = [];
    [playinfoQualities(), liveQualities(), menuQualities()].forEach((list) => {
      list.forEach((n) => {
        if (out.indexOf(n) === -1) out.push(n);
      });
    });
    return out.sort((a, b) => b - a);
  }

  function partKey() {
    const st = W.__INITIAL_STATE__ || {};
    const ps = st.playerStatsData || {};
    const vd = st.videoData || {};
    return [vd.bvid || location.href, ps.cid || vd.cid || '', vd.page || ps.page || ''].join('/');
  }

  let qualityDebugOpen = false;
  function renderQualityListUI() {
    const old = document.getElementById('btk-q-debug');
    if (!qualityDebugOpen) {
      if (old) old.remove();
      return;
    }
    if (!bodyEl || activeTab !== 'player') return;
    const merged = availableQualities();
    const lines = [
      '【页面 playinfo】' + (playinfoQualities().join(' / ') || '无'),
      '【播放器枚举】' + (liveQualities().join(' / ') || '无'),
      '【画质菜单】' + (menuQualities().join(' / ') || '无'),
      '【并集取档】' + (merged.length ? merged.map((q) => q + '=' + qualityLabel(q)).join(' / ') : '无'),
      '【当前】' + qualityLabel(currentQuality()) + ' · 【目标】' + (qualityState.target ? qualityLabel(qualityState.target) : '未定')
    ];
    const box = el('div');
    box.id = 'btk-q-debug';
    lines.forEach((txt) => {
      const p = el('p', null, txt);
      p.style.fontFamily = 'var(--btk-mono)';
      p.style.fontSize = '12.5px';
      p.style.margin = '8px 0';
      p.style.padding = '6px 8px';
      p.style.background = 'var(--surface-2)';
      p.style.borderRadius = '6px';
      box.appendChild(p);
    });
    if (old) old.replaceWith(box);
    else bodyEl.appendChild(box);
  }

  function showQualityDebug(show) {
    qualityDebugOpen = !!show;
    renderPanel();
  }

  function formatOf(q) {
    return supportFormats().find((f) => Number(f.quality) === q) || null;
  }

  function qualityLabel(q) {
    if (!q) return '未知档位';
    const f = formatOf(q);
    if (f && (f.new_description || f.display_desc)) return f.new_description || f.display_desc;
    const item = $$('.bpx-player-ctrl-quality-menu-item').find((li) => Number(li.getAttribute('data-value')) === q);
    if (item) {
      const text = $('.bpx-player-ctrl-quality-text', item);
      const badge = $('.bpx-player-ctrl-quality-badge', item);
      return ((text && text.textContent) || String(q)).trim() + (badge ? '（' + badge.textContent.trim() + '）' : '');
    }
    return QN_NAMES[q] || q + 'P';
  }

  function currentQuality() {
    const p = playerCore();
    try {
      const g = p && p.getQuality ? p.getQuality() : null;
      if (g && Number(g.realQ) > 0) return Number(g.realQ);
    } catch (e) {
      /* 播放器版本没有 realQ 字段时退回 playinfo */
    }
    const d = (W.__playinfo__ || {}).data || {};
    return Number(d.quality) || 0;
  }

  function qualityBadge() {
    const b = el('span', 'btk-hits' + (/未生效|还没|等待/.test(qualityState.msg) ? ' zero' : ''), qualityState.msg);
    b.id = 'btk-q-stat';
    return b;
  }

  function updateQualityStat() {
    const node = document.getElementById('btk-q-stat');
    if (node) node.replaceWith(qualityBadge());
  }

  function clickQualityItem(q) {
    const li = $$('.bpx-player-ctrl-quality-menu-item').find((e) => Number(e.getAttribute('data-value')) === q);
    if (!li) return false;
    li.click();
    qualityUsedClick = true;
    return true;
  }

  // 实测：点不到自己用的档时 B 站会弹登录框，切档过程里顺手收掉
  function closeQualityPrompt() {
    if (!qualityUsedClick) return;
    $$('.bili-mini-mask').forEach((n) => n.remove());
  }

  function askQuality(target) {
    const api = playerApi();
    if (api) {
      try {
        api.requestQuality(target);
        return true;
      } catch (e) {
        return clickQualityItem(target);
      }
    }
    return clickQualityItem(target);
  }

  function attemptQuality(list, i, manual) {
    const top = list[0];
    const target = list[i];
    const cur = currentQuality();
    qualityState.target = top;
    qualityState.cur = cur;
    if (cur >= top) {
      qualityState.msg = '已是最高 ' + qualityLabel(top);
      updateQualityStat();
      renderQualityListUI();
      if (manual) toast('已经是最高画质：' + qualityLabel(top));
      return;
    }
    qualityState.msg = '正在切到 ' + qualityLabel(target) + '…';
    updateQualityStat();
    renderQualityListUI();
    qualityUsedClick = false;
    if (!askQuality(target)) {
      fallBack(list, i, manual, '这个档没给出切换入口');
      return;
    }
    clearInterval(qualityTimer);
    let tries = 0;
    // 画质切换是异步的，轮询确认真正切过去了再说成功
    qualityTimer = setInterval(() => {
      tries++;
      closeQualityPrompt();
      const now = currentQuality();
      if (now >= target) {
        clearInterval(qualityTimer);
        qualityState.cur = now;
        qualityState.msg = '已切到 ' + qualityLabel(target);
        updateQualityStat();
        renderQualityListUI();
        toast('画质已切到 ' + qualityLabel(target));
      } else if (tries >= 12) {
        clearInterval(qualityTimer);
        fallBack(list, i, manual, qualityLabel(target) + ' 切不过去');
      }
    }, 800);
  }

  // 账号拿不到这一档时退回次高一档；退到不高于当前档就别再退，如实报未生效
  function fallBack(list, i, manual, why) {
    closeQualityPrompt();
    const next = list[i + 1];
    if (next != null && next > currentQuality()) {
      qualityState.msg = why + '，退回 ' + qualityLabel(next);
      updateQualityStat();
      renderQualityListUI();
      if (manual) toast(qualityState.msg);
      attemptQuality(list, i + 1, manual);
      return;
    }
    const now = currentQuality();
    qualityState.msg = '未生效，仍在 ' + qualityLabel(now) + '（' + why + '）';
    updateQualityStat();
    renderQualityListUI();
    if (manual) toast(qualityState.msg);
  }

  function applyMaxQuality(manual) {
    const list = availableQualities();
    if (!list.length) {
      qualityState.msg = '还没拿到可选画质列表';
      updateQualityStat();
      if (manual) toast('播放器还没给出可选画质列表，稍后再点一次');
      return false;
    }
    clearInterval(qualityTimer);
    clearTimeout(qualityWaitTimer);
    attemptQuality(list, 0, manual);
    return true;
  }

  // 播放器的 playurl 是异步拿的，档位列表要等；列表一出现就只跑一次
  function scheduleAutoQuality() {
    if (!on('player') || !cfg.player.autoQuality) return;
    const key = partKey();
    if (qualityRunKey === key) return;
    qualityRunKey = key;
    clearTimeout(qualityWaitTimer);
    let waits = 0;
    const tick = () => {
      if (!on('player') || !cfg.player.autoQuality) return;
      if (applyMaxQuality(false)) return;
      if (++waits >= 20) {
        qualityState.msg = '还没拿到可选画质列表';
        updateQualityStat();
        return;
      }
      qualityWaitTimer = setTimeout(tick, 1000);
    };
    qualityWaitTimer = setTimeout(tick, 1200);
  }

  /* ---------------------------------------- module: 观看干扰（引导弹窗） */

  // 实测：播放器内的引导浮层都走这套容器（试看/登录/充电提示、关注引导、进度条弹窗）
  const NAG_STATIC = ['.bpx-player-top-follow', '.bpx-player-follow', '.bpx-player-progress-popup'];
  const NAG_TOAST_ITEM = '.bpx-player-toast-item';

  function nagEnabled() {
    return on('player') && cfg.player.nags;
  }

  function applyNags() {
    let tag = $('#btk-nag-style');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'btk-nag-style';
      document.documentElement.appendChild(tag);
    }
    let css = '';
    if (nagEnabled()) {
      css += NAG_STATIC.map((s) => `${s}{display:none!important}`).join('');
      if (cfg.player.nagAll) css += '.bpx-player-toast-wrap,.bpx-player-toast-auto{display:none!important}';
    }
    if (tag.textContent !== css) tag.textContent = css;
  }

  function nagMatched(text) {
    const words = cfg.player.nagWords.filter(Boolean);
    return !!words.length && words.some((w) => text.indexOf(w) !== -1);
  }

  function scanNags() {
    if (!nagEnabled() || cfg.player.nagAll) return;
    $$(NAG_TOAST_ITEM).forEach((node) => {
      const text = (node.textContent || '').trim();
      node.classList.toggle('btk-nag-cut', !!text && nagMatched(text));
    });
  }

  function nagStat() {
    const cut = $$('.btk-nag-cut').length;
    const statics = NAG_STATIC.reduce((n, s) => {
      try {
        return n + document.querySelectorAll(s).length;
      } catch (e) {
        return n;
      }
    }, 0);
    return { cut, statics };
  }

  function nagBadge() {
    const s = nagStat();
    const b = el(
      'span',
      'btk-hits' + (s.cut || s.statics ? '' : ' zero'),
      s.cut ? '已挡 ' + s.cut + ' 条提示' : s.statics ? '本页 ' + s.statics + ' 个引导层' : '当前无弹窗元素'
    );
    b.id = 'btk-nag-stat';
    return b;
  }

  function updateNagStat() {
    const node = document.getElementById('btk-nag-stat');
    if (node) node.replaceWith(nagBadge());
  }

  /* -------------------------------------------------- module: 素材提取 */
  function videoMeta() {
    const st = W.__INITIAL_STATE__ || {};
    const v = st.videoData || {};
    const pic = (v.pic || $('meta[property="og:image"]')?.content || '').replace(/^https?:/, '').replace(/@[^?]*$/, '');
    return {
      bvid: st.bvid || v.bvid || '',
      aid: v.aid || st.aid || '',
      title: v.title || document.title || '',
      pic: pic ? 'https:' + pic : '',
      pubdate: v.pubdate ? new Date(v.pubdate * 1000).toLocaleString('zh-CN') : '',
      pages: st.pages || v.pages || []
    };
  }

  function coverUrlAt(size) {
    const m = videoMeta();
    if (!m.pic) return '';
    return size === 'origin' ? m.pic : m.pic + '@' + size;
  }

  async function downloadCover() {
    const url = coverUrlAt('origin');
    if (!url) return toast('没有封面地址');
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (videoMeta().bvid || 'cover') + '.jpg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast('封面已下载');
    } catch (e) {
      W.open(url, '_blank');
      toast('直接下载被跨域限制拦截，已在新标签打开');
    }
  }

  /* ------------------------------------------------- module: 线路优选 cdn */

  const PLAYURL_RE = /\/x\/player\/(wbi\/)?playurl|\/x\/pgc\/player\/(wbi\/)?playurl/;
  const PCDN_FALLBACK = ['pcdn', 'mcdn', 'pdl', 'szbdyd', 'ctimous', 'upbili'];

  function pcdnRe() {
    const list = (cfg.cdn.patterns && cfg.cdn.patterns.length ? cfg.cdn.patterns : PCDN_FALLBACK)
      .map(esc)
      .join('|');
    return new RegExp(list, 'i');
  }

  function hostsOf(url) {
    try {
      return new URL(url).host;
    } catch (e) {
      return '';
    }
  }

  // 现网观察：P2P/PCDN 节点常走非标准端口（如 :8082、:4483），而常规 CDN 用 443/80
  function portOf(url) {
    try {
      return new URL(url).port;
    } catch (e) {
      return '';
    }
  }

  function looksPcdn(url, re) {
    if (re.test(url)) return true;
    if (!cfg.cdn.portRule) return false;
    const p = portOf(url);
    return !!p && p !== '443' && p !== '80';
  }

  // 候选地址表：仅存在内存，重载页面后重新从 playurl 采集
  let candidates = [];
  let candidatesAt = 0;
  let candidatesMeta = { quality: '', format: '' };
  let speedResults = {};
  let measuring = false;
  let lineTableEl = null;

  function collectCandidates(d) {
    const re = pcdnRe();
    const list = [];
    const add = (kind, url, bandwidth) => {
      if (typeof url !== 'string' || !/^https?:/i.test(url)) return;
      const host = hostsOf(url);
      if (!host) return;
      if (list.some((c) => c.kind === kind && c.url === url)) return;
      list.push({ kind, host, url, port: portOf(url), bandwidth: bandwidth || 0, pcdn: looksPcdn(url, re) });
    };
    (d.durl || []).forEach((s) => {
      add('durl', s.url, s.filesize);
      (s.backup_url || []).forEach((u) => add('durl-backup', u));
    });
    ['video', 'audio'].forEach((k) => {
      ((d.dash && d.dash[k]) || []).forEach((s) => {
        add('dash-' + k, s.base_url || s.baseUrl, s.bandwidth);
        (s.backup_url || s.backupUrl || []).forEach((u) => add('dash-' + k + '-backup', u));
      });
    });
    return list;
  }

  function observe(d) {
    candidates = collectCandidates(d);
    candidatesAt = Date.now();
    candidatesMeta = { quality: d.quality || '', format: d.format || '' };
    speedResults = {};
  }

  // 首帧播放用的是页面 SSR 出来的 window.__playinfo__。表格要看到全部候选（含 PCDN），
  // 而播放器拿到的必须已经是剔除/重排过的，所以这里存原始值 + 只在 getter 上给过滤版。
  let rawPlayinfo = null;
  let filteredCache = null;

  function observePlayinfo(v) {
    if (v && v.data && on('cdn')) observe(v.data);
  }

  function filteredPlayinfo() {
    if (filteredCache) return filteredCache;
    if (!rawPlayinfo || !on('cdn')) return null;
    let clone;
    try {
      clone = JSON.parse(JSON.stringify(rawPlayinfo));
    } catch (e) {
      return null;
    }
    const res = applyLinePolicy(clone);
    if (!res || !res.changed) return null;
    filteredCache = clone;
    return clone;
  }

  function installPlayinfoHook() {
    if (W.__btkPiHooked) return;
    W.__btkPiHooked = true;
    let initial;
    try {
      initial = W.__playinfo__;
    } catch (e) {
      initial = undefined;
    }
    if (initial) {
      rawPlayinfo = initial;
      observePlayinfo(initial);
    }
    try {
      Object.defineProperty(W, '__playinfo__', {
        configurable: true,
        get() {
          return filteredPlayinfo() || rawPlayinfo;
        },
        set(v) {
          rawPlayinfo = v;
          filteredCache = null;
          observePlayinfo(v);
        }
      });
    } catch (e) {
      /* 页面已经用别的方式定义过这个属性，退回只做观察 */
    }
  }

  function resetCdnCapture() {
    filteredCache = null;
    observePlayinfo(rawPlayinfo);
  }

  function probeNode(url, timeout) {
    const corsAc = new W.AbortController();
    const headAc = new W.AbortController();
    const t1 = setTimeout(() => corsAc.abort(), timeout);
    const start = performance.now();
    return W.fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-262143' },
      credentials: 'omit',
      cache: 'no-store',
      signal: corsAc.signal
    })
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        clearTimeout(t1);
        const ms = performance.now() - start;
        return { ms, ok: true, bytes: buf.byteLength, mbps: (buf.byteLength * 8) / ms / 1000, mode: '下载测速' };
      })
      .catch(() => {
        clearTimeout(t1);
        // 跨域不允许读体时退化为连通延迟（opaque，拿不到字节数）
        const t2 = setTimeout(() => headAc.abort(), timeout);
        const h0 = performance.now();
        return W.fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          credentials: 'omit',
          cache: 'no-store',
          signal: headAc.signal
        })
          .then(() => {
            clearTimeout(t2);
            return { ms: performance.now() - h0, ok: true, bytes: 0, mbps: 0, mode: '仅 RTT' };
          })
          .catch(() => {
            clearTimeout(t2);
            return { ms: Number.MAX_SAFE_INTEGER, ok: false, bytes: 0, mbps: 0, mode: '失败' };
          });
      });
  }

  const KIND_LABEL = {
    durl: 'MP4 段',
    'durl-backup': 'MP4 备用',
    'dash-video': 'DASH 视频',
    'dash-video-backup': 'DASH 视频备用',
    'dash-audio': 'DASH 音频',
    'dash-audio-backup': 'DASH 音频备用'
  };

  // 同一条流的主干和备用常常是同一主机，按主机聚合才不会让表格重复刷屏
  function hostGroups() {
    const map = new Map();
    candidates.forEach((c) => {
      let g = map.get(c.host);
      if (!g) {
        g = { host: c.host, url: c.url, kinds: [], pcdn: false, bandwidth: 0 };
        map.set(c.host, g);
      }
      const label = KIND_LABEL[c.kind] || c.kind;
      if (g.kinds.indexOf(label) === -1) g.kinds.push(label);
      if (c.pcdn) g.pcdn = true;
      if ((c.bandwidth || 0) > g.bandwidth) {
        g.bandwidth = c.bandwidth || 0;
        g.url = c.url;
      }
    });
    return Array.from(map.values());
  }

  async function runSpeedTest() {
    if (measuring) return;
    const groups = hostGroups();
    if (!groups.length) return toast('还没有地址表：点「重载播放器」或切一次清晰度');
    measuring = true;
    speedResults = {};
    renderLineTable();
    const queue = groups.slice(0, 12);
    let cursor = 0;
    // 三个 worker 共用一个游标，保证每个主机只被探测一次
    const worker = async () => {
      while (cursor < queue.length) {
        if (!measuring) return;
        const g = queue[cursor++];
        const r = await probeNode(g.url, 2500);
        speedResults[g.host] = r;
        if (r.ok) {
          cfg.cdn.latency[g.host] = Math.round(r.ms);
          save();
        }
        renderLineTable();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    measuring = false;
    renderLineTable();
    const best = bestGroup(groups);
    if (best) toast('测速完成：吞吐最好 ' + best.host + '（' + (best.r.mbps ? best.r.mbps.toFixed(1) + ' Mbps / ' : '') + Math.round(best.r.ms) + 'ms）');
    else toast('测速完成：没有节点响应');
  }

  function stopSpeedTest() {
    measuring = false;
    renderLineTable();
  }

  function orderedGroups() {
    const groups = hostGroups();
    if (measuring) return groups;
    return groups.slice().sort((a, b) => {
      const ra = speedResults[a.host];
      const rb = speedResults[b.host];
      const va = ra && ra.ok ? 0 : 1;
      const vb = rb && rb.ok ? 0 : 1;
      if (va !== vb) return va - vb;
      if (!ra || !rb) return 0;
      return (rb.mbps - ra.mbps) || (ra.ms - rb.ms);
    });
  }

  function bestGroup(groups) {
    const done = (groups || hostGroups())
      .map((g) => ({ host: g.host, r: speedResults[g.host] }))
      .filter((x) => x.r && x.r.ok);
    if (!done.length) return null;
    return done.sort((a, b) => (b.r.mbps - a.r.mbps) || (a.r.ms - b.r.ms))[0];
  }

  function resultCell(host) {
    const r = speedResults[host];
    if (!r) return { text: '待测', cls: 'btk-dead' };
    if (!r.ok) return { text: '超时 / 失败', cls: 'btk-dead' };
    const ms = Math.round(r.ms) + 'ms';
    return r.mbps
      ? { text: ms + ' · ' + r.mbps.toFixed(1) + ' Mbps', cls: 'btk-best' }
      : { text: ms + '（仅 RTT）', cls: '' };
  }

  function renderLineTable() {
    if (!lineTableEl || !lineTableEl.isConnected) return;
    lineTableEl.innerHTML = '';
    const pin = cfg.cdn.pin || '';
    const best = bestGroup();

    const bar = el('div', 'btk-actions');
    const mkBtn = (label, cls, fn, disabled) => {
      const b = el('button', 'btk-btn' + (cls ? ' ' + cls : ''), label);
      b.type = 'button';
      if (disabled) b.disabled = true;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    mkBtn(measuring ? '停止测速' : '开始测速', '', () => (measuring ? stopSpeedTest() : runSpeedTest()));
    mkBtn('清除锁定', '', () => {
      cfg.cdn.pin = '';
      save();
      renderLineTable();
      toast('已清除锁定，下一次请求按自动规则排');
    }, !pin);
    mkBtn('重载播放器', '', () => location.reload());
    lineTableEl.appendChild(bar);

    if (!candidates.length) {
      lineTableEl.appendChild(
        el('div', 'btk-note', '还没有拿到播放地址表。开启本模块后点「重载播放器」，或切换一次清晰度，脚本会从 playurl 响应里收集候选节点。')
      );
      return;
    }

    const groups = orderedGroups();
    const pinPresent = groups.some((g) => g.host === pin);
    const ago = Math.round((Date.now() - candidatesAt) / 1000);
    const note = el('div', 'btk-note');
    note.appendChild(
      document.createTextNode(
        groups.length + ' 个主机 / ' + candidates.length + ' 条地址 · ' + ago + 's 前 · quality=' + (candidatesMeta.quality || '?') + ' · 锁定='
      )
    );
    note.appendChild(el('b', null, pin || '无（按自动规则）'));
    lineTableEl.appendChild(note);

    const table = el('table', 'btk-line');
    table.innerHTML = '<thead><tr><th style="width:40%">节点</th><th>承载</th><th style="width:24%">结果</th><th style="width:16%"></th></tr></thead>';
    const tb = document.createElement('tbody');
    groups.forEach((g) => {
      const tr = document.createElement('tr');
      if (g.host === pin) tr.className = 'pinned';
      const tdHost = document.createElement('td');
      tdHost.textContent = g.host;
      if (g.pcdn) tdHost.appendChild(el('span', 'btk-pcdn', ' · PCDN'));
      if (best && best.host === g.host) tdHost.appendChild(el('span', 'btk-best', ' · 最快'));
      const tdKind = document.createElement('td');
      tdKind.textContent = g.kinds.join('、');
      const tdRes = document.createElement('td');
      const res = resultCell(g.host);
      tdRes.textContent = res.text;
      tdRes.className = res.cls;
      const tdAct = document.createElement('td');
      tdAct.appendChild(
        btn(g.host === pin ? '已锁定' : '用这条', g.host === pin ? 'pin' : '', () => {
          cfg.cdn.pin = g.host;
          save();
          renderLineTable();
          toast('已锁定 ' + g.host + '：点「重载播放器」让它排到第一位');
        })
      );
      tr.appendChild(tdHost);
      tr.appendChild(tdKind);
      tr.appendChild(tdRes);
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    lineTableEl.appendChild(table);
    if (pin && !pinPresent) {
      lineTableEl.appendChild(
        el(
          'div',
          'btk-note btk-pcdn',
          '注意：锁定的 ' + pin + ' 不在本次 B 站给出的地址表里，所以这一次不会改线。B 站按清晰度和区域下发节点，换一次清晰度或重载再试。'
        )
      );
    }
    lineTableEl.appendChild(
      el(
        'div',
        'btk-note',
        measuring
          ? '测速中：每个主机一次请求、2.5 秒超时，可随时停止。'
          : '锁定只对之后的 playurl 请求生效（切清晰度、切 P、重载播放器）。吞吐列用带宽最高的那条流测得；「仅 RTT」表示该节点不允许跨域读 body，只能比连接延迟。'
      )
    );
  }

  function applyLinePolicy(json) {
    const d = json && json.data;
    if (!d) return null;
    const re = pcdnRe();
    const lat = cfg.cdn.latency || {};
    const pin = cfg.cdn.pin || '';
    let changed = false;

    const isBad = (u) => looksPcdn(u || '', re) && !(pin && hostsOf(u) === pin);

    // 实测：B 站把 PCDN 放在主地址、正规 CDN 放在 backup_url。所以不能整条删掉，
    // 而是把非 PCDN 的备用提升为主地址（备用本身是可独立取流的同源签名地址）。
    const promoteBackup = (list, get) => {
      if (!Array.isArray(list) || !cfg.cdn.dropPcdn) return list;
      const out = list.map((s) => {
        const main = get(s);
        if (!isBad(main)) return s;
        const bk = (s.backup_url || s.backupUrl || []).filter((u) => typeof u === 'string' && u);
        const good = bk.find((u) => !isBad(u));
        if (!good) return s;
        const copy = Object.assign({}, s);
        const rest = bk.filter((u) => u !== good);
        if (s.backup_url) {
          copy.backup_url = rest;
        } else {
          copy.backupUrl = rest;
        }
        if ('base_url' in copy) copy.base_url = good;
        else if ('baseUrl' in copy) copy.baseUrl = good;
        else copy.url = good;
        return copy;
      });
      return out.some((s, i) => s !== list[i]) ? out : list;
    };

    const keep = (list, get) => {
      if (!Array.isArray(list) || !cfg.cdn.dropPcdn) return list;
      const allowed = (u) => !isBad(u);
      const withCleanBackup = (s) => {
        const bk = s.backup_url || s.backupUrl;
        if (!Array.isArray(bk)) return s;
        const ok = bk.filter(allowed);
        if (ok.length === bk.length) return s;
        const copy = Object.assign({}, s);
        if (s.backup_url) copy.backup_url = ok;
        else copy.backupUrl = ok;
        return copy;
      };
      // 走到这里说明主地址仍是 PCDN 且没有可用备用：保留整条，别把播放器饿死
      const kept = list.filter((s) => allowed(get(s)) || !hasCleanBackup(s)).map(withCleanBackup);
      if (!kept.length) return list;
      const same = kept.length === list.length && kept.every((s, i) => s === list[i]);
      return same ? list : kept;
    };

    function hasCleanBackup(s) {
      const bk = s.backup_url || s.backupUrl;
      return Array.isArray(bk) && bk.some((u) => !isBad(u));
    }

    // 锁定节点永远排第一；其次按实测延迟升序；未知主机排在已测之后，同延迟时带宽大的靠前
    const rank = (list, get) => {
      if (!Array.isArray(list) || list.length < 2) return list;
      const scored = list.map((s, i) => ({
        s,
        i,
        pinned: pin && hostsOf(get(s) || '') === pin ? 0 : 1,
        ms: cfg.cdn.reorder ? lat[hostsOf(get(s) || '')] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
        bw: s.bandwidth || s.filesize || 0
      }));
      const sorted = scored
        .slice()
        .sort((a, b) => a.pinned - b.pinned || a.ms - b.ms || b.bw - a.bw || a.i - b.i)
        .map((x) => x.s);
      return sorted.some((s, i) => s !== list[i]) ? sorted : list;
    };

    const touched = (list, get) => {
      const promoted = promoteBackup(list, get);
      if (promoted !== list) changed = true;
      const kept = keep(promoted, get);
      if (kept !== promoted) {
        changed = true;
      }
      const ranked = rank(kept, get);
      if (ranked !== kept) changed = true;
      return ranked;
    };

    if (Array.isArray(d.durl)) d.durl = touched(d.durl, (s) => s.url);
    if (d.dash) {
      ['video', 'audio'].forEach((k) => {
        if (Array.isArray(d.dash[k])) d.dash[k] = touched(d.dash[k], (s) => s.base_url || s.baseUrl);
      });
    }
    return { text: JSON.stringify(json), changed };
  }

  function transformText(text) {
    if (!on('cdn')) return null;
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return null;
    }
    const d = json && json.data;
    if (!d) return null;
    observe(d);
    const res = applyLinePolicy(json);
    if (!res) return null;
    if (res.changed) save();
    renderLineTable();
    return res.changed ? res.text : null;
  }

  function patchXhr() {
    const XHR = W.XMLHttpRequest;
    if (!XHR || XHR.prototype.__btkPatched) return;
    XHR.prototype.__btkPatched = true;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__btkUrl = String(url || '');
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      const url = this.__btkUrl || '';
      const type = this.responseType || '';
      const textLike = type === '' || type === 'text' || type === 'json';
      if (on('cdn') && textLike && PLAYURL_RE.test(url)) {
        const xhr = this;
        let cache;
        const patched = () => {
          if (cache === undefined) {
            const raw = readNativeText(xhr);
            const out = raw ? transformText(raw) : null;
            cache = out === null ? raw : out;
          }
          return cache;
        };
        Object.defineProperty(xhr, 'responseText', {
          configurable: true,
          get() {
            return xhr.readyState >= 4 ? patched() : '';
          }
        });
        if (type === 'json') {
          Object.defineProperty(xhr, 'response', {
            configurable: true,
            get() {
              if (xhr.readyState < 4) return null;
              try {
                return JSON.parse(patched());
              } catch (e) {
                return null;
              }
            }
          });
        }
      }
      return origSend.apply(this, arguments);
    };
  }

  function readNativeText(xhr) {
    try {
      const desc = Object.getOwnPropertyDescriptor(W.XMLHttpRequest.prototype, 'responseText');
      return desc && desc.get ? desc.get.call(xhr) : '';
    } catch (e) {
      return '';
    }
  }

  function patchFetch() {
    if (!W.fetch || W.fetch.__btkPatched) return;
    const orig = W.fetch;
    W.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const p = orig.apply(this, arguments);
      if (!on('cdn') || !PLAYURL_RE.test(url)) return p;
      return p.then((res) => {
        return res
          .clone()
          .text()
          .then((t) => {
            const patched = transformText(t);
            if (patched === null) return res;
            return new W.Response(patched, { status: res.status, statusText: res.statusText, headers: res.headers });
          })
          .catch(() => res);
      });
    };
    W.fetch.__btkPatched = true;
  }

  /* ------------------------------------ module: 阻断 P2P 调度会话 */

  // 实测：Web 端参与 P2P 的通道只有这条 socket.io 会话（URL 带 sdkVersion=…:leecher），
  // 全程没有 WebRTC / datachannel。掐掉它，leecher 引擎既拿不到peer也无处共享。
  const P2P_RE = /(player-tracker|leecher|pcdn|pdl|p2p)/i;
  let blockedP2p = 0;
  let blockedP2pLast = '';

  function p2pBlockOn() {
    return on('cdn') && cfg.cdn.blockP2p;
  }

  function deadSocket(url, proto) {
    // 挂上真实原型，SDK 里的 instanceof WebSocket / READY_STATE 常量判断才不会走错分支；
    // 事件与状态都用自有属性覆盖原型上的原生 getter，避免 Illegal invocation。
    const self = Object.create(proto || null);
    self.url = String(url);
    self.readyState = 3;
    self.binaryType = 'blob';
    self.extensions = '';
    self.protocol = '';
    self.onopen = null;
    self.onmessage = null;
    self.onerror = null;
    self.onclose = null;
    self._l = {};
    self.addEventListener = (n, f) => {
      (self._l[n] = self._l[n] || []).push(f);
    };
    self.removeEventListener = (n, f) => {
      self._l[n] = (self._l[n] || []).filter((x) => x !== f);
    };
    self.dispatchEvent = (ev) => {
      self._fire(ev && ev.type);
      return true;
    };
    self._fire = (n) => {
      const e = { type: n, target: self };
      (self._l[n] || []).forEach((f) => {
        try {
          f(e);
        } catch (err) {}
      });
      if (typeof self['on' + n] === 'function') {
        try {
          self['on' + n](e);
        } catch (err) {}
      }
    };
    self.send = () => false;
    self.close = () => {
      self.readyState = 3;
    };
    setTimeout(() => {
      self._fire('error');
      self._fire('close');
    }, 0);
    return self;
  }

  function updateP2pStat() {
    const badge = document.getElementById('btk-p2p-stat');
    if (badge) badge.replaceWith(p2pBadge());
  }

  function p2pBadge() {
    const b = el('span', 'btk-hits' + (blockedP2p ? '' : ' zero'), blockedP2p ? '已拦截 ' + blockedP2p + ' 次' : '尚未拦截');
    b.id = 'btk-p2p-stat';
    b.title = blockedP2pLast ? '最近一次：' + blockedP2pLast : '脚本装载后没有 P2P 会话尝试连接';
    return b;
  }

  function installP2pBlock() {
    const Orig = W.WebSocket;
    if (!Orig || W.__btkWsHooked) return;
    W.__btkWsHooked = true;
    function Wrapped(socketUrl, protocols) {
      const u = String(socketUrl || '');
      if (p2pBlockOn() && P2P_RE.test(u)) {
        blockedP2p++;
        blockedP2pLast = u.slice(0, 96);
        updateP2pStat();
        return deadSocket(u, Orig.prototype);
      }
      return protocols === undefined ? new Orig(u) : new Orig(u, protocols);
    }
    Wrapped.prototype = Orig.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => {
      Wrapped[k] = Orig[k];
    });
    W.WebSocket = Wrapped;
  }

  /* ------------------------------------------------------------- 控制台面板 */

  let panelEl = null;
  let railEl = null;
  let bodyEl = null;
  let footEl = null;
  let panelOpen = false;
  let activeTab = 'clean';

  const TABS = [
    { id: 'clean', label: '界面净化', mod: 'clean' },
    { id: 'player', label: '播放增强', mod: 'player' },
    { id: 'material', label: '素材提取', mod: 'extract' },
    { id: 'social', label: '弹幕评论', mod: 'social' },
    { id: 'cdn', label: '线路测速', mod: 'cdn' },
    { id: 'ui', label: '外观', mod: null },
    { id: 'about', label: '关于', mod: null }
  ];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function btn(label, cls, fn) {
    const b = el('button', 'btk-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function section(title, sub) {
    const box = el('div');
    box.appendChild(el('h4', null, title));
    if (sub) box.appendChild(el('p', 'btk-sub', sub));
    return box;
  }

  function switchRow(name, path, opts) {
    const o = opts || {};
    const row = el('div', 'btk-row');
    const label = el('span', 'btk-label');
    label.appendChild(el('span', 'btk-name', name));
    if (o.tip) label.appendChild(el('span', 'btk-tip', o.tip));
    row.appendChild(label);
    if (o.badge) row.appendChild(o.badge);
    const sw = el('label', 'btk-sw');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!getPath(cfg, path);
    input.setAttribute('aria-label', name);
    sw.appendChild(input);
    sw.appendChild(el('i'));
    row.appendChild(sw);
    label.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      setPath(cfg, path, input.checked);
      save();
      applyCleanRules();
      if (path.startsWith('ui')) applyTheme();
      if (path.startsWith('clean')) setTimeout(checkHeaderSafe, 250);
      applyDmLayer();
      applyNags();
      if (path.startsWith('player')) scanNags();
      if (path.startsWith('social')) {
        scanComments();
        scanDanmaku();
      }
      if (path.startsWith('enabled.cdn')) {
        if (!input.checked) candidates = [];
        else resetCdnCapture();
      }
      if (path.startsWith('enabled')) renderPanel();
      else if (o.rerender) renderPanel();
      else if (path === 'cdn.dropPcdn' || path === 'cdn.reorder') renderLineTable();
      else if (path.startsWith('player')) updateNagStat();
      toast(name + (input.checked ? '：已开启' : '：已关闭'));
    });
    return row;
  }

  function numberRow(name, path, opts) {
    const o = opts || {};
    const row = el('div', 'btk-row');
    const label = el('span', 'btk-label');
    label.appendChild(el('span', 'btk-name', name));
    if (o.tip) label.appendChild(el('span', 'btk-tip', o.tip));
    row.appendChild(label);
    if (o.extra) o.extra.forEach((x) => row.appendChild(x));
    const input = el('input');
    input.type = 'number';
    input.min = o.min;
    input.max = o.max;
    input.step = o.step;
    input.value = getPath(cfg, path);
    input.setAttribute('aria-label', name);
    input.addEventListener('change', () => {
      const n = Number(input.value);
      setPath(cfg, path, Number.isFinite(n) ? n : 0);
      save();
      if (path === 'player.speed') setRate(Number(input.value));
      if (path === 'player.intro' || path === 'player.outro') skipState = { intro: false, outro: false };
    });
    row.appendChild(input);
    return row;
  }

  function listBox(name, path, opts) {
    const o = opts || {};
    const box = el('div');
    box.style.margin = '10px 0';
    box.appendChild(el('span', 'btk-name', name));
    if (o.tip) box.appendChild(el('span', 'btk-tip', o.tip));
    const ta = el('textarea');
    ta.value = (getPath(cfg, path) || []).join('\n');
    ta.placeholder = o.ph || '每行一个';
    ta.setAttribute('aria-label', name);
    ta.addEventListener('change', () => {
      setPath(
        cfg,
        path,
        ta.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      save();
      applyCleanRules();
      scanDanmaku();
      scanComments();
      scanNags();
      updateNagStat();
      renderLineTable();
    });
    box.appendChild(ta);
    return box;
  }

  function hitBadge(ruleId) {
    if (hostOffList().indexOf(ruleId) !== -1) {
      const off = el('span', 'btk-hits zero', '本站已停用');
      off.title = '这条规则会把本站顶栏压坏，自检已自动停用；点「恢复本站顶栏规则」可强行开回来。';
      return off;
    }
    const n = ruleHits(ruleId);
    const b = el('span', 'btk-hits' + (n ? '' : ' zero'), n ? '命中 ' + n : '本页无命中');
    b.title = '当前页面里这条规则匹配到的元素数量';
    return b;
  }

  function speedSegment() {
    const box = el('div', 'btk-seg');
    const v = videoEl();
    const cur = v ? v.playbackRate : Number(cfg.player.speed) || 1;
    [0.5, 0.75, 1, 1.25, 1.5, 2, 3].concat(Number(cfg.player.maxSpeed) > 3 ? [Number(cfg.player.maxSpeed)] : []).forEach((s) => {
      const b = el('button', Math.abs(cur - s) < 0.01 ? 'on' : '', s + 'x');
      b.type = 'button';
      b.addEventListener('click', () => {
        setRate(s);
        renderPanel();
      });
      box.appendChild(b);
    });
    return box;
  }

  function dmStatBadge() {
    const cut = dmCutCount();
    const hidden = cfg.social.dmHidden;
    const b = el('span', 'btk-hits' + (cut || hidden ? '' : ' zero'), hidden ? '整层已隐藏' : cut ? '已屏蔽 ' + cut + ' 条' : '当前无命中弹幕');
    b.id = 'btk-dm-stat';
    return b;
  }

  function cmStatBadge() {
    const total = $$('.reply-item').length;
    const hit = $$('.reply-item.btk-collapsed').length;
    const b = el('span', 'btk-hits' + (total ? '' : ' zero'), total ? '本页 ' + total + ' 条' + (hit ? ' / 折叠 ' + hit : '') : '未找到评论元素');
    b.id = 'btk-cm-stat';
    b.title = total ? '' : '评论区还没渲染出来（滚动到评论区，或需要登录）；找不到 .reply-item 时高亮与折叠都不会生效。';
    return b;
  }

  function updateDmStat() {
    const old = document.getElementById('btk-dm-stat');
    if (old) old.replaceWith(dmStatBadge());
    const cm = document.getElementById('btk-cm-stat');
    if (cm) cm.replaceWith(cmStatBadge());
  }

  function materialSection() {
    const box = el('div');
    box.id = 'btk-material';
    const m = videoMeta();
    if (!m.bvid) {
      box.appendChild(el('p', 'btk-sub', '素材提取只在视频页（/video/BV…）有内容。'));
      return box;
    }
    box.appendChild(el('p', 'btk-sub', m.title));
    box.appendChild(el('div', 'btk-note', 'BV ' + m.bvid + ' · aid ' + m.aid + ' · 发布于 ' + m.pubdate + ' · ' + m.pages.length + ' 个分 P'));
    if (m.pic) {
      const img = el('img');
      img.src = m.pic;
      img.alt = '视频封面';
      box.appendChild(img);
      const acts = el('div', 'btk-actions');
      acts.appendChild(btn('复制封面直链', '', () => copyText(m.pic).then(() => toast('已复制封面直链'))));
      acts.appendChild(btn('下载封面', '', downloadCover));
      acts.appendChild(btn('复制时间戳链接', '', copyTimestamp));
      acts.appendChild(btn('复制本页链接', '', () => copyText(location.href).then(() => toast('已复制本页链接'))));
      box.appendChild(acts);
    }
    if (m.pages.length > 1) {
      const list = el('div', 'btk-p');
      m.pages.forEach((p, i) => {
        const r = el('div', 'btk-p-row');
        r.appendChild(el('span', null, 'P' + (i + 1) + ' ' + (p.part || '') + ' (' + fmtTime(p.duration || 0) + ')'));
        r.appendChild(
          btn('复制直达', '', () => {
            copyText('https://www.bilibili.com/video/' + m.bvid + '/?p=' + (i + 1)).then(() => toast('已复制 P' + (i + 1)));
          })
        );
        list.appendChild(r);
      });
      box.appendChild(list);
    }
    return box;
  }

  function keysTable() {
    const t = el('table', 'btk-keys');
    const rows = [
      [', .', '音量 ±' + (Number(cfg.player.volumeStep) || 2) + '%'],
      ['[ ]', '倍速 ±0.25'],
      ['\\', '回到 1.00x'],
      ['Shift+I / Shift+O', '设片头结束 / 片尾提前量'],
      ['Shift+D', '隐藏 / 显示弹幕'],
      ['Shift+T', '复制时间戳链接'],
      ['Shift+X', '开 / 关本面板'],
      ['Esc', '关闭面板并退出拾取模式']
    ];
    rows.forEach((r) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, r[0]));
      tr.appendChild(el('td', null, r[1]));
      t.appendChild(tr);
    });
    return t;
  }

  function renderTab(tab) {
    const box = el('div');
    box.setAttribute('role', 'tabpanel');

    if (tab === 'clean') {
      const s = section('界面净化', '把推广卡、引导横幅这类东西从页面上拿掉。每条规则实时显示本页命中数。');
      s.appendChild(switchRow('启用本模块', 'enabled.clean'));
      if (on('clean')) {
        s.appendChild(el('div', 'btk-note', '当前站点：' + pageKey() + '.bilibili.com · 本页适用 ' + pageRules().length + ' 条规则'));
        const rep = repairId();
        const cNow = headerCollisions();
        if (rep === 'none') {
          const bad = el('div', 'btk-note');
          bad.style.color = '#f0b429';
          bad.textContent = '顶栏仍有重叠，且两种修复都无效：' + collisionText(cNow) + '。复制诊断粘给助手即可继续排查。';
          s.appendChild(bad);
        } else if (rep) {
          s.appendChild(el('div', 'btk-note', '顶栏挤压修复：已启用（' + rep + '）· 当前' + collisionText(cNow)));
        } else if (cNow.zone.length || cNow.leaf.length) {
          const bad = el('div', 'btk-note');
          bad.style.color = '#f0b429';
          bad.textContent = '检测到顶栏重叠：' + collisionText(cNow) + '（自检会在下一轮尝试修复）';
          s.appendChild(bad);
        }
        if (hostOffList().length) {
          const warn = el('div', 'btk-note');
          warn.style.color = '#f0b429';
          warn.textContent = '本站有 ' + hostOffList().length + ' 条规则/选择器因把顶栏搞坏已被自动停用。';
          s.appendChild(warn);
          s.appendChild(btn('恢复本站顶栏规则', '', restoreHeaderRules));
        }
        s.appendChild(btn('重测顶栏', '', recheckHeader));
        s.appendChild(btn('本页全部停用净化', '', disableAllCleanHere));
        s.appendChild(
          btn('复制顶栏诊断', '', () => {
            const txt = headerDiagnosis();
            copyText(txt).then((ok) => toast(ok ? '诊断已复制，粘给助手即可' : '复制失败，已展开在下方'));
            const box = el('pre');
            box.style.cssText = 'white-space:pre-wrap;font-size:11px;background:#0d1319;border:1px solid #24303f;border-radius:6px;padding:8px;margin-top:8px';
            box.textContent = txt;
            if (!document.getElementById('btk-diag')) {
              box.id = 'btk-diag';
              s.appendChild(box);
            }
          })
        );
        pageRules().forEach((r) => {
          s.appendChild(switchRow(r.label, 'clean.' + r.id, { badge: hitBadge(r.id) }));
        });
        s.appendChild(
          btn('拾取要隐藏的元素', '', () => {
            closePanel();
            startPick();
          })
        );
        s.appendChild(listBox('自定义选择器（每行一条）', 'clean.custom', { tip: '拾取器的结果会追加在这里，可手动删改。', ph: '.some-class\n#some-id' }));
        s.appendChild(
          btn('重新统计命中数', '', () => {
            renderPanel();
          })
        );
      }
      box.appendChild(s);
    }

    if (tab === 'player') {
      const s = section('播放增强', '倍速、跳片头片尾、自动连播、音量微调，都在播放器右上角那条小工具里。');
      s.appendChild(switchRow('启用本模块', 'enabled.player'));
      if (on('player')) {
        s.appendChild(el('div', 'btk-note', '当前倍速'));
        s.appendChild(speedSegment());
        s.appendChild(
          switchRow('自动切到最高画质', 'player.autoQuality', {
            badge: qualityBadge(),
            tip: '页面 playinfo / 播放器枚举 / 画质菜单三处取并集，只切 B 站给这个账号列出来的档；切不过去自动退回次高一档。'
          })
        );
        s.appendChild(btn('立即切到最高画质', '', () => applyMaxQuality(true)));
        s.appendChild(btn(qualityDebugOpen ? '收起画质档位来源' : '查看画质档位来源', '', () => showQualityDebug(!qualityDebugOpen)));
        s.appendChild(numberRow('倍速上限', 'player.maxSpeed', { min: 1, max: 16, step: 0.5, tip: '超出浏览器上限时可能丢帧', rerender: true }));
        s.appendChild(switchRow('记住并恢复倍速', 'player.remember'));
        s.appendChild(switchRow('播放器悬浮工具条', 'player.toolbar', { tip: '鼠标进入播放器时出现在右上角' }));
        s.appendChild(
          numberRow('跳过片头（秒）', 'player.intro', {
            min: 0,
            max: 1800,
            step: 1,
            extra: [
              btn('用当前进度', '', () => {
                const v = videoEl();
                if (!v) return toast('没找到播放器');
                cfg.player.intro = Math.round(v.currentTime);
                save();
                renderPanel();
                toast('片头结束点 = ' + fmtTime(cfg.player.intro));
              })
            ]
          })
        );
        s.appendChild(
          numberRow('片尾提前（秒）', 'player.outro', {
            min: 0,
            max: 1800,
            step: 1,
            extra: [
              btn('用当前进度', '', () => {
                const v = videoEl();
                if (!v) return toast('没找到播放器');
                cfg.player.outro = Math.max(0, Math.round(v.duration - v.currentTime));
                save();
                renderPanel();
                toast('片尾提前量 = ' + fmtTime(cfg.player.outro));
              })
            ]
          })
        );
        s.appendChild(switchRow('播完自动连播', 'player.next'));
        s.appendChild(switchRow('启用快捷键', 'player.shortcuts'));
        s.appendChild(keysTable());
      }
      box.appendChild(s);

      const n = section('观看干扰屏蔽', '播放器里弹出来的引导提示：试看/登录/充电提示条、关注引导、进度条弹窗。');
      n.appendChild(switchRow('启用本组（属播放增强）', 'player.nags', { badge: nagBadge(), tip: '按关键词挡掉提示条里的内容，不是关掉所有提示。' }));
      if (nagEnabled()) {
        n.appendChild(switchRow('连所有提示条一起隐藏', 'player.nagAll', { tip: '开了它就不再看关键词，播控提示（例如加载失败）也可能被挡掉。' }));
        if (!cfg.player.nagAll) n.appendChild(listBox('提示条关键词', 'player.nagWords', { tip: '命中就把这条提示藏掉；默认含 点赞 / 投币 / 收藏 / 关注 / 充电 / 试看。', ph: '点赞\n投币' }));
      }
      box.appendChild(n);
    }

    if (tab === 'material') {
      const s = section('素材提取', '读的是页面自带数据，不额外发请求，也不提供视频流下载。');
      s.appendChild(switchRow('启用本模块', 'enabled.extract'));
      if (on('extract')) s.appendChild(materialSection());
      box.appendChild(s);
    }

    if (tab === 'social') {
      const s = section('弹幕与评论', '弹幕是 DOM 节点，命中关键词直接不显示；评论做高亮和折叠。');
      s.appendChild(switchRow('启用本模块', 'enabled.social'));
      if (on('social')) {
        s.appendChild(
          switchRow('隐藏整层弹幕', 'social.dmHidden', {
            badge: dmStatBadge(),
            tip: '等价于快捷键 Shift+D'
          })
        );
        s.appendChild(listBox('弹幕屏蔽关键词', 'social.dmWords', { tip: '纯文本包含匹配，改完立即重扫。', ph: '剧透\n某个人名' }));
        s.appendChild(listBox('评论高亮 / 折叠关键词', 'social.cmWords', { ph: '广告\n代刷' }));
        s.appendChild(switchRow('命中关键词的评论自动折叠', 'social.cmCollapse', { badge: cmStatBadge(), tip: '点一下模糊的评论即可临时展开' }));
      }
      box.appendChild(s);
    }

    if (tab === 'cdn') {
      const s = section('视频线路测速与选线', '接管 playurl 响应，在本次拿到的地址里剔除 PCDN、测速并让你手动锁定节点。');
      s.appendChild(
        switchRow('启用本模块（默认关闭）', 'enabled.cdn', {
          tip: '关闭时脚本完全不读取、不解析、不改写任何请求。'
        })
      );
      if (on('cdn')) {
        lineTableEl = el('div');
        s.appendChild(lineTableEl);
        s.appendChild(
          switchRow('阻断 P2P 调度会话', 'cdn.blockP2p', {
            badge: p2pBadge(),
            tip: '掐掉带 :leecher 参数的 socket.io 会话，P2P 引擎就既拿不到 peer 也无处共享；实测该页没有任何 WebRTC 通道。'
          })
        );
        s.appendChild(switchRow('剔除 PCDN 地址', 'cdn.dropPcdn', { tip: '你锁定的节点即便命中特征串也会被保留。' }));
        s.appendChild(switchRow('按实测延迟自动排序', 'cdn.reorder', { tip: '关掉后就只尊重你手动锁定的节点。' }));
        s.appendChild(switchRow('把非标准端口的节点视为 PCDN', 'cdn.portRule', { tip: '现网 P2P 节点常走 :8082 / :4483 这类端口，常规 CDN 用 443。' }));
        s.appendChild(listBox('PCDN 主机特征串', 'cdn.patterns', { tip: '留空使用内置 pcdn|mcdn|pdl|szbdyd|ctimous|upbili', ph: 'pcdn\nmcdn' }));
        s.appendChild(
          btn('清除测速缓存', '', () => {
            cfg.cdn.latency = {};
            save();
            renderLineTable();
            toast('测速缓存已清空');
          })
        );
      }
      box.appendChild(s);
    }

    if (tab === 'ui') {
      const s = section('外观', '默认「跟随 B 站」：B 站自己在 :root 上发了 --bg1_float / --text1 / --brand_pink 这套设计变量，直接引用它，所以它切深色模式面板跟着切，不用猜。');
      const themeRow = el('div', 'btk-row');
      themeRow.appendChild(el('span', 'btk-label', '主题'));
      const seg = el('div', 'btk-seg');
      [['auto', '跟随 B 站'], ['light', '浅色'], ['dark', '深色']].forEach((t) => {
        const b = el('button', (cfg.ui.theme || 'auto') === t[0] ? 'on' : '', t[1]);
        b.addEventListener('click', () => {
          cfg.ui.theme = t[0];
          save();
          applyTheme();
          renderPanel();
          toast('主题：' + t[1]);
        });
        seg.appendChild(b);
      });
      themeRow.appendChild(seg);
      s.appendChild(themeRow);

      const accRow = el('div', 'btk-row');
      accRow.appendChild(el('span', 'btk-label', '自定义强调色'));
      const acc = document.createElement('input');
      acc.type = 'color';
      acc.value = /^#[0-9a-f]{6}$/i.test(cfg.ui.accent || '') ? cfg.ui.accent : '#ff6699';
      acc.addEventListener('input', () => {
        cfg.ui.accent = acc.value;
        applyTheme();
      });
      acc.addEventListener('change', () => {
        cfg.ui.accent = acc.value;
        save();
        applyTheme();
        renderPanel();
      });
      accRow.appendChild(acc);
      accRow.appendChild(
        btn('用 B 站的', '', () => {
          cfg.ui.accent = '';
          save();
          applyTheme();
          renderPanel();
          toast('强调色已回到跟随 B 站');
        })
      );
      s.appendChild(accRow);

      const opRow = el('div', 'btk-row');
      opRow.appendChild(el('span', 'btk-label', '面板不透明度'));
      const rng = document.createElement('input');
      rng.type = 'range';
      rng.min = '60';
      rng.max = '100';
      rng.step = '5';
      rng.value = String(themeOpacity());
      const opVal = el('span', 'btk-hits', themeOpacity() + '%');
      rng.addEventListener('input', () => {
        cfg.ui.opacity = Number(rng.value);
        opVal.textContent = rng.value + '%';
        applyTheme();
      });
      rng.addEventListener('change', () => {
        cfg.ui.opacity = Number(rng.value);
        save();
        applyTheme();
      });
      opRow.appendChild(rng);
      opRow.appendChild(opVal);
      s.appendChild(opRow);

      s.appendChild(el('div', 'btk-note', '当前外观：' + themeSummary() + '。改完立刻生效，不用刷新。'));
      s.appendChild(el('div', 'btk-note', '播放器右上角那条小工具和它的二级菜单一起跟随主题；压在画面上时靠描边和投影区分。弹幕、顶栏这些是 B 站自己的样式，本脚本不改配色。'));
      box.appendChild(s);
    }

    if (tab === 'about') {
      const s = section('关于与数据', 'v' + VERSION);
      s.appendChild(
        el(
          'div',
          'btk-note',
          '生效范围：www / t（动态）/ space（UP主空间）/ live（直播）桌面端；m.bilibili.com 不在匹配内。净化规则按页面生效，在动态页只会显示动态相关的命中数。'
        )
      );
      s.appendChild(el('div', 'btk-note', '所有设置存在 ' + (hasGM ? '扩展存储' : 'localStorage') + ' 的 ' + CFG_KEY + ' 键下，没有服务端、没有第三方请求。'));
      s.appendChild(el('div', 'btk-note', '线路候选地址表只存在内存，刷新页面即重新采集。'));
      s.appendChild(el('div', 'btk-note', '已开启模块：' + TABS.filter((t) => t.mod && on(t.mod)).map((t) => t.label).join('、')));
      s.appendChild(keysTable());
      s.appendChild(el('div', 'btk-note', '遇到「某条没生效」这类问题：下面「复制反馈包」一键带齐版本、页面、窗口、模块开关、每条规则命中数、顶栏几何与停用状态，贴到安装页 #feedback 一节给的地址即可，不用截图也不用开控制台。'));
      s.appendChild(
        btn('复制反馈包', '', () => {
          const txt = feedbackPack();
          copyText(txt).then((ok) => toast(ok ? '反馈包已复制（' + txt.length + ' 字）' : '复制失败，已展开在下方'));
          if (document.getElementById('btk-feedback')) return;
          const box = el('pre');
          box.id = 'btk-feedback';
          box.style.cssText = 'white-space:pre-wrap;font-size:11px;background:var(--btk-rail);border:1px solid var(--btk-line);border-radius:6px;padding:8px;margin-top:8px;color:var(--btk-text-2)';
          box.textContent = txt;
          s.appendChild(box);
        })
      );
      s.appendChild(
        btn('恢复默认设置（清空自定义选择器与锁定）', '', () => {
          cfg = merge(DEFAULTS, {});
          save();
          applyCleanRules();
          applyTheme();
          applyDmLayer();
          renderPanel();
          toast('已恢复默认设置');
        })
      );
      box.appendChild(s);
    }
    return box;
  }

  function renderPanel() {
    if (!panelEl || !bodyEl || !railEl) return;
    railEl.innerHTML = '';
    TABS.forEach((t) => {
      const b = el('button', 'btk-tab', '');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(activeTab === t.id));
      b.dataset.tab = t.id;
      const dot = el('span', 'btk-dot' + (t.mod && on(t.mod) ? ' live' : ''));
      b.appendChild(dot);
      b.appendChild(el('span', null, t.label));
      b.addEventListener('click', () => selectTab(t.id));
      railEl.appendChild(b);
    });
    bodyEl.innerHTML = '';
    lineTableEl = null;
    bodyEl.appendChild(renderTab(activeTab));
    const count = TABS.filter((t) => t.mod && on(t.mod)).length;
    if (footEl) {
      const s = nagStat();
      const bits = [count + ' / 5 个模块已开启'];
      if (blockedP2p) bits.push('已拦截 P2P 会话 ' + blockedP2p + ' 次');
      if (s.cut) bits.push('已挡提示 ' + s.cut + ' 条');
      if (dmCutCount()) bits.push('已挡弹幕 ' + dmCutCount() + ' 条');
      bits.push('配置自动保存');
      footEl.textContent = bits.join(' · ');
    }
    const launcher = document.getElementById('btk-launcher');
    if (launcher) launcher.setAttribute('data-count', String(count));
    // 表格必须在子树已连接到文档后渲染，否则 isConnected 为 false
    if (lineTableEl) renderLineTable();
    renderQualityListUI();
  }

  function selectTab(id) {
    activeTab = id;
    cfg.ui.tab = id;
    save();
    renderPanel();
    const btn = railEl && railEl.querySelector('[data-tab="' + id + '"]');
    if (btn) btn.focus();
  }

  function moveTab(delta) {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    const next = (idx + delta + TABS.length) % TABS.length;
    selectTab(TABS[next].id);
  }

  function openTab(tab) {
    if (tab) activeTab = tab;
    if (!panelEl) return;
    panelOpen = true;
    panelEl.hidden = false;
    clampPanel();
    renderPanel();
    const first = railEl && railEl.querySelector('.btk-tab[aria-selected="true"]');
    if (first) first.focus({ preventScroll: true });
  }

  function openPanel() {
    openTab(activeTab);
  }

  function closePanel() {
    panelOpen = false;
    if (panelEl) panelEl.hidden = true;
    togglePop(false);
  }

  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  function applyPos(node, pos) {
    if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
    const maxLeft = document.documentElement.clientWidth - node.offsetWidth;
    const maxTop = document.documentElement.clientHeight - node.offsetHeight;
    node.style.left = Math.max(4, Math.min(maxLeft - 4, pos.left)) + 'px';
    node.style.top = Math.max(4, Math.min(maxTop - 4, pos.top)) + 'px';
    node.style.right = 'auto';
    node.style.bottom = 'auto';
  }

  // 100vw 包含滚动条宽度，窄窗口下会把面板顶出视口，所以用 clientWidth 实测夹取
  function clampPanel() {
    if (!panelEl) return;
    const cw = document.documentElement.clientWidth;
    const ch = document.documentElement.clientHeight;
    // 面板默认贴在悬浮球上方（bottom:174px），所以可用高度要先把那 174px 扣掉，
    // 否则矮窗口下 top 会变成负数，标题栏和 × 直接被顶出视口够不着。
    const reserve = ch - 174 < 220 ? 24 : 186;
    panelEl.style.width = Math.max(300, Math.min(620, cw - 24)) + 'px';
    panelEl.style.height = Math.max(200, Math.min(492, ch - reserve)) + 'px';
    if (cfg.ui.panel) applyPos(panelEl, cfg.ui.panel);
    else if (reserve === 24) panelEl.style.bottom = '12px';
    const launcher = document.getElementById('btk-launcher');
    if (launcher && cfg.ui.launcher) applyPos(launcher, cfg.ui.launcher);
  }

  function makeDraggable(node, handle, key) {
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let pid = null;
    let moved = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // 在按钮/输入控件上按下时不启动拖拽，否则 pointer capture 会把 click 抢走（× 点不动就是这个）
      if (e.target.closest('button, a, input, select, textarea, [role="tab"]')) return;
      const b = node.getBoundingClientRect();
      sx = e.clientX;
      sy = e.clientY;
      ox = b.left;
      oy = b.top;
      pid = e.pointerId;
      moved = false;
    });
    handle.addEventListener('pointermove', (e) => {
      if (pid === null || e.pointerId !== pid) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) <= 4) return;
        moved = true;
        // 确认要移动了才抢占指针，此时再 capture 不会影响单击目标
        if (handle.setPointerCapture) handle.setPointerCapture(pid);
        node.classList.add('drag');
      }
      applyPos(node, { left: ox + dx, top: oy + dy });
      e.preventDefault();
    });
    const endDrag = (e) => {
      if (pid === null || (e && e.pointerId !== pid)) return;
      node.classList.remove('drag');
      if (handle.releasePointerCapture && handle.hasPointerCapture && handle.hasPointerCapture(pid)) {
        handle.releasePointerCapture(pid);
      }
      if (moved) {
        const b = node.getBoundingClientRect();
        cfg.ui[key] = { left: Math.round(b.left), top: Math.round(b.top) };
        save();
      }
      pid = null;
      moved = false;
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', () => {
      node.classList.remove('drag');
      pid = null;
      moved = false;
    });
  }

  function buildUi() {
    activeTab = cfg.ui.tab || 'clean';
    const launcher = el('button');
    launcher.id = 'btk-launcher';
    launcher.type = 'button';
    launcher.textContent = 'B+';
    launcher.title = 'Bilibili 增强工具箱（可拖动）';
    launcher.addEventListener('click', togglePanel);
    document.documentElement.appendChild(launcher);

    panelEl = el('div');
    panelEl.id = 'btk-panel';
    panelEl.hidden = true;
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-label', 'Bilibili 增强工具箱设置');

    const headBar = el('div');
    headBar.id = 'btk-head';
    headBar.appendChild(el('span', 'btk-logo', 'B+'));
    headBar.appendChild(el('b', null, '增强工具箱'));
    headBar.appendChild(el('span', 'btk-ver', 'v' + VERSION));
    const close = el('button', '', '×');
    close.type = 'button';
    close.id = 'btk-close';
    close.setAttribute('aria-label', '关闭面板');
    close.addEventListener('click', closePanel);
    headBar.appendChild(close);

    railEl = el('nav', null);
    railEl.id = 'btk-rail';
    railEl.setAttribute('role', 'tablist');
    railEl.setAttribute('aria-label', '模块');
    railEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        moveTab(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveTab(-1);
      }
    });

    bodyEl = el('div');
    bodyEl.id = 'btk-body';

    footEl = el('div');
    footEl.id = 'btk-foot';

    panelEl.appendChild(headBar);
    panelEl.appendChild(railEl);
    panelEl.appendChild(bodyEl);
    panelEl.appendChild(footEl);
    document.documentElement.appendChild(panelEl);

    applyPos(launcher, cfg.ui.launcher);
    applyPos(panelEl, cfg.ui.panel);
    makeDraggable(launcher, launcher, 'launcher');
    makeDraggable(panelEl, headBar, 'panel');
    window.addEventListener('resize', clampPanel);

    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('打开设置面板', openPanel);
      GM_registerMenuCommand('视频线路测速与选线', () => openTab('cdn'));
      GM_registerMenuCommand('隐藏指定元素（拾取模式）', () => {
        openTab('clean');
        startPick();
      });
      GM_registerMenuCommand('恢复默认设置', () => {
        if (typeof GM_deleteValue === 'function') GM_deleteValue(CFG_KEY);
        cfg = loadConfig();
        applyCleanRules();
        applyDmLayer();
        renderPanel();
        toast('已恢复默认设置');
      });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (panelOpen) closePanel();
      togglePop(false);
    }
  });

  /* ------------------------------------------------------------------ boot */

  function boot() {
    applyTheme();
    buildUi();
    applyCleanRules();
    applyDmLayer();
    applyNags();
    bindVideo();
    watchPlayer();
    watchDanmaku();

    // 播放时 B 站 DOM 每帧都在变：纯防抖会被不断重置而永不执行，所以用带最小间隔的节流
    const MIN_INTERVAL = 600;
    let last = 0;
    let timer = null;
    function sweep() {
      last = Date.now();
      timer = null;
      if (!picking) scanComments();
      scanNags();
      if (playerRoot() && (!boundVideo || !document.contains(boundVideo))) bindVideo();
      watchDanmaku();
      updateDmStat();
      captureSearchWidth();
      checkHeaderSafe();
    }
    sweep();
    const obs = new MutationObserver(() => {
      const wait = MIN_INTERVAL - (Date.now() - last);
      if (wait <= 0) {
        if (!timer) sweep();
        return;
      }
      if (!timer) timer = setTimeout(sweep, wait);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  patchXhr();
  patchFetch();
  installPlayinfoHook();
  installP2pBlock();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
