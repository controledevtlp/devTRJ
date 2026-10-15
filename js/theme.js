/* =====================================================================
 * theme.js — TEMA CLARO/ESCURO (compartilhado: painel, dashboard público, devGERAL)
 * ---------------------------------------------------------------------
 * 1) Guarda a escolha (localStorage) e aplica <html data-theme="light|dark"> ANTES da
 *    primeira pintura (carregar este arquivo no <head>).
 * 2) As variáveis CSS (css/styles.css) já trocam as cores "estruturais". Este módulo cobre o
 *    resto: o código das páginas escreve MUITAS cores direto no estilo inline (laranja #ff8c00,
 *    verde, amarelo, brancos translúcidos para linhas/hover...), pensadas para fundo escuro.
 *    No tema claro, o adaptador abaixo ajusta, elemento a elemento, só o que ficaria ilegível:
 *      • texto com contraste insuficiente contra o fundo real → escurece mantendo o matiz;
 *      • fundos/bordas "branco translúcido" (invisíveis no claro) → viram cinza-escuro translúcido.
 *    Tudo é reversível ao voltar para o escuro (valores originais ficam guardados no elemento).
 * 3) TRJ.theme.ink(hex) devolve a cor ajustada para uso em gráficos (canvas).
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var KEY = 'trj_theme';
  var root = document.documentElement;
  var listeners = [];
  var obs = null, queue = [], raf = 0;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function get() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function isLight() { return get() === 'light'; }

  /* ---------- cor ---------- */
  function parse(c) {
    var m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    var p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function hexToRgb(h) {
    h = String(h || '').trim();
    var m = h.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null;
    var s = m[1]; if (s.length === 3) s = s.replace(/./g, '$&$&');
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: 1 };
  }
  function over(top, bot) {
    var a = top.a + bot.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a: a };
  }
  function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b); if (l1 < l2) { var t = l1; l1 = l2; l2 = t; } return (l1 + 0.05) / (l2 + 0.05); }
  function rgbToHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return { h: h, s: s, l: l };
  }
  function hslToRgb(o) {
    var h = o.h, s = o.s, l = o.l;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (s === 0) { var v = Math.round(l * 255); return { r: v, g: v, b: v, a: 1 }; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: Math.round(f(p, q, h + 1 / 3) * 255), g: Math.round(f(p, q, h) * 255), b: Math.round(f(p, q, h - 1 / 3) * 255), a: 1 };
  }
  function css(c) { return 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')'; }

  /* Ajusta a cor do texto até atingir o contraste-alvo contra o fundo (mantém o matiz).
     Tenta primeiro a direção natural (fundo claro → escurece; fundo escuro → clareia); se não
     alcançar o alvo (ex.: texto claro sobre um laranja médio), tenta a outra e fica com a melhor. */
  function walkL(fg, bg, target, dir) {
    var hsl = rgbToHsl(fg), c = fg, best = fg;
    for (var i = 0; i < 90; i++) {
      hsl.l += dir * 0.012;
      if (hsl.l <= 0.04) hsl.l = 0.04; if (hsl.l >= 1) hsl.l = 1;
      c = hslToRgb(hsl);
      if (ratio(c, bg) > ratio(best, bg)) best = c;
      if (ratio(c, bg) >= target) return c;
      if ((dir < 0 && hsl.l <= 0.04) || (dir > 0 && hsl.l >= 1)) break;
    }
    return best;
  }
  function fixText(fg, bg, target) {
    var dir = lum(bg) > 0.35 ? -1 : 1;
    var c1 = walkL(fg, bg, target, dir);
    if (ratio(c1, bg) >= target) return c1;
    var c2 = walkL(fg, bg, target, -dir);
    return ratio(c2, bg) > ratio(c1, bg) ? c2 : c1;
  }

  /* cor para gráficos (canvas) no tema atual — sobre o fundo de card */
  function ink(hex, target) {
    if (!isLight()) return hex;
    var c = hexToRgb(hex); if (!c) return hex;
    var bg = { r: 255, g: 255, b: 255, a: 1 }, t = target || 3.2;
    return ratio(c, bg) >= t ? hex : css(fixText(c, bg, t));
  }

  /* ---------- adaptador (só no tema claro) ---------- */
  var SKIP = { SCRIPT: 1, STYLE: 1, CANVAS: 1, NOSCRIPT: 1, LINK: 1, META: 1, HEAD: 1, TITLE: 1 };
  var SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  var DARKTRANS = function (a) { return 'rgba(20, 24, 40, ' + Math.min(0.2, Math.max(0.05, a * 1.5)).toFixed(3) + ')'; };

  function isWhiteTrans(c) { return c && c.a > 0 && c.a < 0.95 && c.r >= 225 && c.g >= 225 && c.b >= 225; }
  function inSvg(el) { return el.namespaceURI && el.namespaceURI.indexOf('svg') >= 0; }

  /* guarda o valor inline original e o que aplicamos; ao reverter, só restaura se a página não
     tiver mudado a propriedade nesse meio tempo (ex.: hover/ativo trocando o background) */
  function apply(el, prop, value) {
    var st = el.__trj || (el.__trj = {});
    if (!(prop in st)) st[prop] = { o: el.style.getPropertyValue(prop), p: el.style.getPropertyPriority(prop), a: null };
    el.style.setProperty(prop, value, "important");
    st[prop].a = el.style.getPropertyValue(prop);
  }
  function revertEl(el) {
    var st = el.__trj; if (!st) return;
    Object.keys(st).forEach(function (prop) {
      var mine = el.style.getPropertyValue(prop) === st[prop].a && el.style.getPropertyPriority(prop) === "important";
      if (!mine) return;
      if (st[prop].o) el.style.setProperty(prop, st[prop].o, st[prop].p); else el.style.removeProperty(prop);
    });
    el.__trj = null;
  }

  var pageBg = null;
  function getPageBg() {
    var b = parse(getComputedStyle(document.body).backgroundColor), h = parse(getComputedStyle(root).backgroundColor);
    var base = { r: 255, g: 255, b: 255, a: 1 };
    if (h && h.a > 0) base = over(h, base);
    if (b && b.a > 0) base = over(b, base);
    return base;
  }

  /* Elementos com transition (abas, botões…): se a cor fosse lida no meio da animação, o cálculo
     usaria um valor intermediário. Por isso a transição é desligada só durante a leitura/aplicação. */
  function process(el, memo) {
    var cs = getComputedStyle(el);
    var tr = parseFloat(cs.transitionDuration) > 0;
    var o, op;
    if (tr) { o = el.style.getPropertyValue('transition'); op = el.style.getPropertyPriority('transition'); el.style.setProperty('transition', 'none', 'important'); void cs.color; }
    if (el.__trj) revertEl(el);
    adaptEl(el, memo, cs);
    if (tr) { void cs.color; if (o) el.style.setProperty('transition', o, op); else el.style.removeProperty('transition'); }
  }

  function adaptEl(el, memo, cs) {
    cs = cs || getComputedStyle(el);

    /* 1) fundo e bordas em branco translúcido */
    var bgc = parse(cs.backgroundColor);
    if (isWhiteTrans(bgc)) apply(el, 'background-color', DARKTRANS(bgc.a));
    for (var i = 0; i < 4; i++) {
      var sd = SIDES[i];
      if (parseFloat(cs['border' + sd + 'Width']) > 0 && cs['border' + sd + 'Style'] !== 'none') {
        var bc = parse(cs['border' + sd + 'Color']);
        if (isWhiteTrans(bc)) apply(el, 'border-' + sd.toLowerCase() + '-color', DARKTRANS(bc.a));
      }
    }

    /* fundo efetivo (já com a correção acima) — memoizado por elemento */
    var eff = effBg(el, memo, cs);

    /* 2) texto sem contraste */
    var hasText = false;
    for (var n = el.firstChild; n; n = n.nextSibling) { if (n.nodeType === 3 && n.nodeValue.trim()) { hasText = true; break; } }
    if (!hasText) return;
    var fg = parse(cs.color); if (!fg) return;
    var fgc = over(fg, eff);
    var fs = parseFloat(cs.fontSize) || 14, bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    var large = fs >= 24 || (fs >= 18.66 && bold);
    var target = large ? 3 : 4.5;
    if (ratio(fgc, eff) >= target) return;
    var nc = fixText(fgc, eff, target);
    apply(el, 'color', css(nc));
  }

  function effBg(el, memo, cs) {
    if (!el || el.nodeType !== 1) return pageBg;
    var m = memo.get(el); if (m) return m;
    var p = effBg(el.parentElement, memo);
    var c = parse((cs || getComputedStyle(el)).backgroundColor);
    var r = (c && c.a > 0) ? over(c, p) : p;
    memo.set(el, r); return r;
  }

  function passTree(rootEl, shallow) {
    if (!rootEl || rootEl.nodeType !== 1 || SKIP[rootEl.tagName] || inSvg(rootEl)) return;
    pageBg = getPageBg();
    var memo = new WeakMap();
    if (shallow) { process(rootEl, memo); if (obs) obs.takeRecords(); return; }
    function walk(el) {
      if (SKIP[el.tagName] || inSvg(el)) return;
      process(el, memo);
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) walk(c);
    }
    walk(rootEl);
    if (obs) obs.takeRecords();   /* descarta as mutações causadas por nós mesmos */
  }

  function revertAll() {
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) if (all[i].__trj) revertEl(all[i]);
  }

  function flush() {
    raf = 0;
    if (!isLight()) { queue = []; return; }
    var q = queue; queue = [];
    var deep = new Set(), shallow = new Set();
    q.forEach(function (it) { if (it.el.isConnected) (it.deep ? deep : shallow).add(it.el); });
    deep.forEach(function (el) { passTree(el, false); });
    shallow.forEach(function (el) { if (!deep.has(el)) passTree(el, true); });
  }
  function schedule(el, deep) {
    queue.push({ el: el, deep: !!deep });
    if (!raf) raf = requestAnimationFrame(flush);
  }

  function startObserver() {
    if (obs || !window.MutationObserver) return;
    obs = new MutationObserver(function (recs) {
      if (!isLight()) return;
      recs.forEach(function (r) {
        if (r.type === 'childList') { for (var i = 0; i < r.addedNodes.length; i++) if (r.addedNodes[i].nodeType === 1) schedule(r.addedNodes[i], true); }
        else if (r.type === 'attributes' && r.target.nodeType === 1) schedule(r.target, false);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  /* ---------- API ---------- */
  function set(t, opts) {
    t = t === 'light' ? 'light' : 'dark';
    var prev = get();
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    if (document.body) {
      if (t === 'light') { startObserver(); passTree(document.body); }
      else revertAll();
    }
    updateFab();
    if (!(opts && opts.silent) && prev !== t) listeners.slice().forEach(function (fn) { try { fn(t); } catch (e) { console.error(e); } });
  }
  function toggle() { set(isLight() ? 'dark' : 'light'); }
  function onChange(fn) { listeners.push(fn); }

  /* Botão flutuante (páginas sem menu próprio: dashboard público) */
  function updateFab() {
    var b = document.getElementById('trj-theme-fab'); if (!b) return;
    b.textContent = isLight() ? '🌙' : '☀️';
    b.title = isLight() ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
    b.setAttribute('aria-label', b.title);
  }
  function mountToggle() {
    if (document.getElementById('trj-theme-fab')) return;
    var b = document.createElement('button');
    b.id = 'trj-theme-fab'; b.type = 'button';
    b.addEventListener('click', toggle);
    document.body.appendChild(b); updateFab();
  }

  /* aplica o tema salvo ANTES da primeira pintura */
  root.setAttribute('data-theme', stored() === 'light' ? 'light' : 'dark');
  function boot() { if (isLight()) { startObserver(); passTree(document.body); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  TRJ.theme = { get: get, set: set, toggle: toggle, isLight: isLight, onChange: onChange, mountToggle: mountToggle, ink: ink, adapt: function (el) { if (isLight()) passTree(el || document.body); } };
})(window.TRJ = window.TRJ || {});
