/* =====================================================================
 * operador.js — Visão do OPERADOR ("bateu o olho, sabe o que fazer")
 * ---------------------------------------------------------------------
 * Lê o MESMO snapshot do dashboard público (getDashboardSnapshot) e reaproveita as regras de
 * domínio do sistema (dedupPorTsk, corretiva, backlog, último update humano). Não altera nada
 * dos dashboards existentes e não cria backend novo.
 *
 * Abas: Fazer agora · Sites fora · B2B / Premium · Concentradores · Backbone / LD · Mapa
 * Filtros: regra criadora (FIXA / MÓVEL — coluna DJ), prioridade, situação, regiões (chips), busca.
 * Visão por região: cada região é um bloco (lado a lado quando há mais de uma), com botão de cópia
 * ("Prioridade -> TSK / SITE - FALHA") logo acima.
 * Ctrl+clique em TSKs → "Calcular rota" abre o Mapa já com a rota. Site sem coordenada não entra na
 * seleção até a coordenada ser informada (e gravada no banco). Exporta Excel (ExcelJS) com resumo,
 * atalhos e o backlog de cada região (sites fora com TSK em vermelho).
 * ===================================================================== */
(function () {
  'use strict';
  var TRJ = window.TRJ, U = TRJ.ui, C = TRJ.constants, D = TRJ.domain, OP = TRJ.operador;
  var h = U.h, esc = U.esc;
  var URL_API = (TRJ.config && TRJ.config.APPS_SCRIPT_URL) || '';
  var root = document.getElementById('root'), tipEl = document.getElementById('op-tip');

  var LS_KEY = 'trj_operador_v2';
  var POLL_MS = 60000, TICK_MS = 30000, STALE_MIN = 20, PAGE = 40;
  var SEMKEY = '__SEM__';
  var TABS = ['fila', 'sites', 'b2b', 'conc', 'backbone', 'mapa'];
  var COR = { red: '#c62839', amber: '#d68910', green: '#168a47', blue: '#1f6fb5', purple: '#7d3c98', gray: '#6b7280', orange: '#b85a00' };
  var PRIO_COR = { P1: '#c62839', P2: '#d35400', P3: '#b85a00', P4: '#1f6fb5', P5: '#6b7280' };

  var raw = { tasksEnriched: [], incidentsEnriched: [], concentradores: null };
  var savedAt = null, lastSavedAt = null, loadedOnce = false, erroCarga = null;
  var model = null;
  var firstSeen = {};
  var view = { pop: false, rotaInicial: null, rotaAtiva: false, novaRegra: false, modal: false };
  var sel = [];            // seleção para rota: [{ key, os, end, site }] na ordem do clique
  var selMode = false;     // toque/sem Ctrl: cada clique seleciona
  var lastNums = {};       // últimos valores exibidos (contagem animada ao mudar)
  var LS_COORD_PEND = 'trj_operador_coords_pend', LS_COORD_LOCAL = 'trj_operador_coords_local', LS_PIN = 'trj_operador_pin';
  var coordCache = { src: null, idx: null };

  /* ---------- estado dos filtros (lembrado no navegador) ---------- */
  var state = (function () {
    var d = { tab: 'fila', grupo: 'TODAS', regras: [], prios: [], situacao: 'TODAS', regioes: [], ordem: 'padrao', pend: false, lado: true };
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (s) Object.keys(d).forEach(function (k) { if (s[k] !== undefined) d[k] = s[k]; }); } catch (e) {}
    if (TABS.indexOf(d.tab) < 0) d.tab = 'fila';
    d.busca = ''; d.lim = {};
    return d;
  })();
  function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- utilidades ---------- */
  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  function toDate(v) { if (!v) return null; var d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
  function fmtDur(min) {
    var a = Math.abs(Math.round(min));
    if (a < 60) return a + 'min';
    var hh = Math.floor(a / 60), mm = a % 60;
    if (hh < 48) return hh + 'h' + (mm ? ('0' + mm).slice(-2) : '');
    return Math.floor(hh / 24) + 'd ' + (hh % 24) + 'h';
  }
  function fmtDt(d) { return d ? D.formatarDataCompacta(d) : '—'; }
  function prioNum(p) { var m = /\d+/.exec(p || ''); return m ? parseInt(m[0], 10) : 99; }
  function regiaoLabel(r) { return (C.REGIAO_LABELS && C.REGIAO_LABELS[r]) || r; }
  function ehB2B(t) {
    var dj = up(t.isocDJ), bg = up(t.motivoCancelamento);
    return dj.indexOf('PREMIUM') >= 0 || bg.indexOf('B2B - TIM') >= 0 || bg.indexOf('TRACKING_CORPORATIVO') >= 0 || bg.indexOf('PREMIUM') >= 0;
  }
  function ehBackbone(t) { return up(t.motivoCancelamento).indexOf('LONGA DISTANCIA') >= 0; }
  function copiar(txt, msg) {
    function ok() { U.toast(msg || ('TSK ' + txt + ' copiada'), 'ok'); }
    function fallback() {     // http/arquivo local ou navegador sem a API de área de transferência
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) ok(); else U.toast('Não foi possível copiar.', 'err'); } catch (e) { U.toast('Não foi possível copiar.', 'err'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
  }
  function fmtNum(n) { return typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n); }
  var REDUZIDO = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* número que "rola" até o valor novo (mesmo efeito do devGERAL: easeOut cúbico) — data-k identifica o contador */
  function num(valor, key, cls) {
    var s = h('span', { class: cls || null, text: fmtNum(valor) });
    if (typeof valor === 'number' && key) { s.setAttribute('data-target', String(valor)); s.setAttribute('data-k', key); }
    return s;
  }
  function animarNumeros(scope) {
    var els = scope.querySelectorAll('[data-target]'), alvos = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i], to = parseFloat(el.getAttribute('data-target')), k = el.getAttribute('data-k');
      var from = lastNums[k] === undefined ? 0 : lastNums[k];
      lastNums[k] = to;
      if (from === to || REDUZIDO) { el.textContent = fmtNum(to); continue; }
      el.textContent = fmtNum(from); el.classList.add('bump');
      alvos.push({ el: el, from: from, to: to });
    }
    if (!alvos.length) return;
    var dur = 680, ini = null;
    function fim() { alvos.forEach(function (a) { a.el.textContent = fmtNum(a.to); }); }
    function step(ts) {
      if (ini === null) ini = ts;
      var p = Math.min((ts - ini) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      alvos.forEach(function (a) { a.el.textContent = fmtNum(Math.round(a.from + (a.to - a.from) * e)); });
      if (p < 1) requestAnimationFrame(step); else fim();
    }
    requestAnimationFrame(step);
    setTimeout(fim, dur + 120);        // aba em segundo plano não executa rAF: garante o valor final
  }
  var ordemRegioes = (C.REGIOES || []).slice();
  function regiaoIdx(r) { var i = ordemRegioes.indexOf(r); return r === 'OTHERS' ? 998 : (i < 0 ? 997 : i); }

  /* ---------- carga do snapshot ---------- */
  async function carregarDados(silencioso, forcar) {
    if (!URL_API) { erroCarga = 'URL do Apps Script não configurada (js/config.js).'; render(); return; }
    try {
      if (silencioso && !forcar && lastSavedAt) {      // verificação leve: só baixa o snapshot quando há versão nova
        try {
          var mj = await (await fetch(URL_API + '?action=getSnapshotMeta')).json();
          if (mj && mj.ok && mj.savedAt && mj.savedAt === lastSavedAt) { atualizarIdade(); return; }
        } catch (e) { /* Apps Script antigo: segue para o download completo */ }
      }
      var json = await (await fetch(URL_API + '?action=getDashboardSnapshot')).json();
      if (!json || json.ok === false) throw new Error((json && json.error) || 'Erro ao buscar dados.');
      if (!json.data) {
        if (!loadedOnce) { erroCarga = json.savedAt ? 'O snapshot publicado está indisponível. Peça para abrirem o Dashboard no painel principal.' : 'Ainda não há nenhuma publicação.'; render(); }
        return;
      }
      aplicarSnapshot(json);
      cacheSet({ savedAt: json.savedAt || null, data: json.data });
      reenviarCoordsPendentes();
    } catch (e) {
      if (!loadedOnce) { erroCarga = 'Não foi possível carregar: ' + (e.message || e); render(); }
    }
  }
  function aplicarSnapshot(json, doCache) {
    var novo = json.savedAt || null, mudou = novo !== lastSavedAt, estavaEmCache = view.emCache;
    view.emCache = !!doCache;
    lastSavedAt = novo; savedAt = novo;
    var d = json.data;
    raw.tasksEnriched = d.tasksEnriched || [];
    raw.incidentsEnriched = d.incidentsEnriched || [];
    raw.prazoMap = d.prazoMap || {};
    raw.concentradores = Array.isArray(d.concentradores) ? d.concentradores : null;
    prepararMapa(d);
    if (mudou || !loadedOnce || estavaEmCache) {
      var primeira = !loadedOnce;
      erroCarga = null; buildModel(); loadedOnce = true;
      if (!(state.tab === 'mapa' && view.rotaAtiva)) render(!primeira); else atualizarIdade();   // não destrói a rota que está na tela
    } else atualizarIdade();
  }
  /* última versão do snapshot guardada neste aparelho: a tela abre na hora e atualiza quando o download termina
     (o Apps Script pode levar 15 s+ para entregar 1–2 MB) */
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('trj_operador', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  async function cacheGet() {
    try { var db = await idb(); return await new Promise(function (res) { var q = db.transaction('kv').objectStore('kv').get('snap'); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }); } catch (e) { return null; }
  }
  async function cacheSet(v) { try { var db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, 'snap'); } catch (e) {} }
  async function abrirComCache() {
    var c = await cacheGet();
    if (c && c.data && !loadedOnce) aplicarSnapshot({ savedAt: c.savedAt, data: c.data }, true);
  }
  function ls(key, val) { try { if (val) localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function lsGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function prepararMapa(d) {
    if (d.mapaCoordMap) { raw._mapaCoordMap = d.mapaCoordMap; ls('trj_coordMap', d.mapaCoordMap); } else raw._mapaCoordMap = lsGet('trj_coordMap');
    // coordenadas informadas aqui que o snapshot ainda não trouxe continuam valendo (somem da lista local quando chegam no snapshot)
    var locais = lsGet(LS_COORD_LOCAL) || {}, ks = Object.keys(locais);
    if (ks.length) {
      if (!raw._mapaCoordMap) raw._mapaCoordMap = {};
      var alterou = false;
      ks.forEach(function (k) { if (k in raw._mapaCoordMap) { delete locais[k]; alterou = true; } else raw._mapaCoordMap[k] = locais[k]; });
      if (alterou) { try { localStorage.setItem(LS_COORD_LOCAL, JSON.stringify(locais)); } catch (e) {} }
    }
    coordCache.src = null;
    if (d.mapaMarkersSlim && d.mapaMarkersSlim.length) raw._mapaMarkersSlim = d.mapaMarkersSlim;
    if (d.mapaMwSlim && d.mapaMwSlim.length) {
      raw._mapaMwData = d.mapaMwSlim.map(function (l) { return { Enlace2: l.E2, LAT_A: l.LA, LONG_A: l.LO, LAT_B: l.LB, LONG_B: l.LOB, FORNECEDOR: l.F }; });
      ls('trj_mwData', raw._mapaMwData);
    } else raw._mapaMwData = lsGet('trj_mwData');
    if (d.mapaFoSlim && d.mapaFoSlim.length) {
      raw._mapaFoData = d.mapaFoSlim.map(function (x) { return { NEName: x.N, HUB: x.H, LAT_A: x.LA, LONG_A: x.LO, FORNECEDOR: x.F }; });
      ls('trj_foData', raw._mapaFoData);
    } else raw._mapaFoData = lsGet('trj_foData');
  }

  /* ---------- modelo derivado (1x por snapshot ou ao mudar regras) ---------- */
  function buildModel() {
    var now = Date.now(), tasks = raw.tasksEnriched || [];
    var byTsk = {};
    tasks.forEach(function (t) { var k = up(t.osNumero); if (k) (byTsk[k] = byTsk[k] || []).push(t); });
    Object.keys(byTsk).forEach(function (k) { byTsk[k].sort(function (a, b) { return (Number(b.sequenciaId) || 0) - (Number(a.sequenciaId) || 0); }); });

    var dedup = D.dedupPorTsk(tasks);
    var items = [], byOs = {}, openEnd = {}, temDJ = false;
    dedup.forEach(function (t) {
      var st = D.normalize(t.status);
      var back = st === 'NAO INICIADO' || st === 'INICIADO', pend = st === 'PENDENTE';
      var corr = D.isTicketCorretiva(t.tipoAtividade);
      var eid = up(t.enderecoId);
      if ((back || pend) && eid) { var cur = openEnd[eid]; if (!cur || (corr && !cur.corr)) openEnd[eid] = { t: t, corr: corr }; }
      if (!corr) return;
      if (!(back && t.dataCriacaoAS) && !pend) return;
      if (t.isocDJ) temDJ = true;
      var it = {
        t: t, os: t.osNumero || '', prio: up(t.prioridade) || '—', st: st, pend: pend,
        site: t.siteId || '', end: t.enderecoId || '', cidade: t.cidade || '', regiao: t.regiao || 'OTHERS', falha: t.tipoFalha || '',
        venc: toDate(t.vencimentoCalc), criacao: D.parsePlatformDate(t.dataCriacaoAS) || toDate(t.dataCriacao),
        regra: OP.classificar(t.isocDJ), b2b: ehB2B(t), backbone: ehBackbone(t),
        upd: U.classificarUltimoBloco ? U.classificarUltimoBloco(t.motivoCancelamento) : { estado: 'sem', dt: null, texto: null }
      };
      if (!(it.os in firstSeen)) firstSeen[it.os] = loadedOnce ? now : 0;
      items.push(it); byOs[up(it.os)] = it;
    });

    var grupos = {}, ordem = [];      // sites fora: um por END_ID (igual ao dashboard público)
    (raw.incidentsEnriched || []).forEach(function (i) {
      if (up(i.statusTrat || 'ATIVO') === 'RESOLVIDO') return;
      var k = up(i.enderecoId);
      if (!k) { ordem.push([i]); return; }
      if (!grupos[k]) { grupos[k] = []; ordem.push(grupos[k]); }
      grupos[k].push(i);
    });
    var sites = ordem.map(function (g) {
      var antigo = g[0];
      g.forEach(function (x) { var a = toDate(antigo.horarioDt), b = toDate(x.horarioDt); if (b && (!a || b < a)) antigo = x; });
      var nomes = []; g.forEach(function (x) { if (x.site && nomes.indexOf(x.site) < 0) nomes.push(x.site); });
      var op = openEnd[up(antigo.enderecoId)];
      return { inc: antigo, sites: nomes, qtd: g.length, regiao: antigo.regiao || 'OTHERS', desde: toDate(antigo.horarioDt), tsk: op ? op.t : null, end: antigo.enderecoId || '' };
    });
    var foraPorEnd = {};      // END_ID -> site fora ativo (a linha da TSK fica em destaque vermelho)
    sites.forEach(function (s) { if (s.end) foraPorEnd[up(s.end)] = s; });
    items.forEach(function (it) { it.fora = foraPorEnd[up(it.end)] || null; });
    model = { items: items, byOs: byOs, byTsk: byTsk, openEnd: openEnd, sites: sites, temDJ: temDJ, foraPorEnd: foraPorEnd };
  }

  /* ---------- filtros / ordenação ---------- */
  function regraKey(it) { return it.regra.grupo ? it.regra.nome : SEMKEY; }
  function passBase(it) {
    if (state.regras.length) { if (state.regras.indexOf(regraKey(it)) < 0) return false; }
    else if (state.grupo !== 'TODAS' && it.regra.grupo !== state.grupo) return false;
    if (state.regioes.length && state.regioes.indexOf(it.regiao) < 0) return false;
    if (state.prios.length && state.prios.indexOf(it.prio) < 0) return false;
    return true;
  }
  function restOf(it, now) { return it.venc ? Math.round((it.venc.getTime() - now) / 60000) : null; }
  function semUpdH(it, now) {
    var ref = (it.upd && it.upd.estado !== 'sem' && it.upd.dt) ? it.upd.dt : it.criacao;
    return ref ? (now - ref.getTime()) / 3600000 : 0;
  }
  function corTempo(rest) { if (rest == null) return COR.gray; if (rest < 0) return COR.red; if (rest <= 120) return COR.amber; return COR.green; }
  function pctPrazo(it, now) {
    if (!it.venc || !it.criacao) return null;
    var tot = it.venc.getTime() - it.criacao.getTime(); if (tot <= 0) return 100;
    return Math.max(0, Math.min(100, (now - it.criacao.getTime()) / tot * 100));
  }
  /* bucket: 0 = ainda vai vencer · 1 = sem prazo · 2 = já vencida · 3 = pendenciada */
  function bucketOf(it) { if (it.pend) return 3; if (it._rest == null) return 1; return it._rest >= 0 ? 0 : 2; }
  function restKey(it) { return it._rest == null ? 9e9 : it._rest; }
  function ordenarBloco(lista) {
    var ord = state.ordem;
    return lista.sort(function (a, b) {
      if (ord === 'recentes') return ((b.criacao ? b.criacao.getTime() : 0) - (a.criacao ? a.criacao.getTime() : 0));
      var ba = bucketOf(a), bb = bucketOf(b);
      if (ord === 'venc') {   // ainda vão vencer (mais próximo primeiro) → sem prazo → vencidas por último
        if (ba !== bb) return ba - bb;
        if (ba === 2) return restKey(b) - restKey(a);      // vencidas: a que venceu há menos tempo primeiro
        return (restKey(a) - restKey(b)) || (prioNum(a.prio) - prioNum(b.prio));
      }
      // padrão: P1 → P5; dentro de cada prioridade, no prazo primeiro e vencidas na sequência
      if (ba === 3 || bb === 3) { if (ba !== bb) return ba - bb; }
      var dp = prioNum(a.prio) - prioNum(b.prio); if (dp) return dp;
      if (ba !== bb) return ba - bb;
      return ba === 2 ? (restKey(a) - restKey(b)) : (restKey(a) - restKey(b));    // vencidas: a mais atrasada primeiro
    });
  }
  function regioesBlocos(chavesPresentes) {
    var lista = state.regioes.length ? state.regioes : chavesPresentes;
    return lista.slice().sort(function (a, b) { return regiaoIdx(a) - regiaoIdx(b); });
  }
  function filaAtual(now) {
    var base = model.items.filter(passBase).filter(function (it) { return state.pend || !it.pend; });
    base.forEach(function (it) { it._rest = restOf(it, now); });
    var q = up(state.busca);
    var filtrada = base.filter(function (it) {
      if (q && (up(it.os) + ' ' + up(it.site) + ' ' + up(it.end) + ' ' + up(it.cidade)).indexOf(q) < 0) return false;
      var rest = it._rest;
      switch (state.situacao) {
        case 'VENCIDAS': return !it.pend && rest != null && rest < 0;
        case 'V2H': return !it.pend && rest != null && rest >= 0 && rest <= 120;
        case 'NO_PRAZO': return !it.pend && rest != null && rest >= 0;
        case 'SEMUPD': return !it.pend && semUpdH(it, now) > 4;
        default: return true;
      }
    });
    var porReg = {};
    filtrada.forEach(function (it) { (porReg[it.regiao] = porReg[it.regiao] || []).push(it); });
    var chaves = Object.keys(porReg);
    var blocos = regioesBlocos(state.regioes.length ? state.regioes : chaves).map(function (r) {
      return { regiao: r, lista: ordenarBloco(porReg[r] || []) };
    });
    if (!state.regioes.length) blocos = blocos.filter(function (b) { return b.lista.length; });
    return { base: base, filtrada: filtrada, blocos: blocos };
  }
  function sitesAtuais() {
    var q = up(state.busca);
    return model.sites.filter(function (s) {
      if (state.regioes.length && state.regioes.indexOf(s.regiao) < 0) return false;
      if (q && (up(s.end) + ' ' + up(s.sites.join(' ')) + ' ' + up(s.inc.cidade || s.inc.cidadeUf)).indexOf(q) < 0) return false;
      return true;
    });
  }
  /* dados para as abas B2B / Concentradores / Backbone: respeita região, FIXA/MÓVEL/regras e prioridade */
  function rawFiltrado() {
    var semFiltro = !state.regioes.length && state.grupo === 'TODAS' && !state.regras.length && !state.prios.length;
    if (semFiltro) return raw;
    function passTask(t) {
      var reg = OP.classificar(t.isocDJ), rk = reg.grupo ? reg.nome : SEMKEY;
      if (state.regras.length) { if (state.regras.indexOf(rk) < 0) return false; }
      else if (state.grupo !== 'TODAS' && reg.grupo !== state.grupo) return false;
      if (state.regioes.length && state.regioes.indexOf(t.regiao || 'OTHERS') < 0) return false;
      if (state.prios.length && state.prios.indexOf(up(t.prioridade)) < 0) return false;
      return true;
    }
    return Object.assign({}, raw, {
      tasksEnriched: (raw.tasksEnriched || []).filter(passTask),
      incidentsEnriched: state.regioes.length ? (raw.incidentsEnriched || []).filter(function (i) { return state.regioes.indexOf(i.regiao || 'OTHERS') >= 0; }) : raw.incidentsEnriched
    });
  }
  function concAlertas() {
    var lista = raw.concentradores; if (!lista || !lista.length) return 0;
    var n = 0;
    lista.forEach(function (c) {
      var key = up(c.endId || c.site); if (!key) return;
      function bate(a, b) { var ke = up(a), ks = up(b); return ke === key || ks === key || (key.length > 3 && (ke.indexOf(key) >= 0 || ks.indexOf(key) >= 0)); }
      model.items.forEach(function (it) { if (!it.pend && bate(it.end, it.site)) n++; });
      (raw.incidentsEnriched || []).forEach(function (i) { if (up(i.statusTrat) !== 'RESOLVIDO' && bate(i.enderecoId || i.endId, i.site)) n++; });
    });
    return n;
  }

  /* ---------- tooltip da TSK (onde ela está) ---------- */
  var ST_INFO = {
    'INICIADO': { l: 'INICIADO', cor: COR.green }, 'NAO INICIADO': { l: 'NÃO INICIADO', cor: COR.orange },
    'PENDENTE': { l: 'PENDENCIADA', cor: COR.purple }, 'CONCLUIDA': { l: 'CONCLUÍDA', cor: COR.blue }, 'CANCELADA': { l: 'CANCELADA', cor: COR.gray }
  };
  function stInfo(status) { return ST_INFO[D.normalize(status)] || { l: String(status || '—').toUpperCase(), cor: COR.gray }; }
  function ln(k, v) { return '<div class="ln"><span>' + k + '</span><span>' + v + '</span></div>'; }
  function tipHtml(os) {
    var rows = model.byTsk[up(os)];
    if (!rows || !rows.length) return '<b>' + esc(os) + '</b><div class="tx">Sem detalhes no snapshot.</div>';
    var t = rows[0], it = model.byOs[up(os)], si = stInfo(t.status), now = Date.now();
    var reg = OP.classificar(t.isocDJ);
    var criacao = D.parsePlatformDate(t.dataCriacaoAS) || toDate(t.dataCriacao), venc = toDate(t.vencimentoCalc);
    var out = '<div class="hd"><span>' + esc(t.osNumero) + '</span><span class="st" style="background:' + si.cor + '">' + si.l + '</span></div>';
    out += ln('Onde está', esc(t.filaAtual || '—'));
    if (reg.dj) out += ln('Regra criadora', esc(reg.nome) + (reg.grupo ? ' <b>(' + (reg.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL') + ')</b>' : ''));
    out += ln('Site / END_ID', esc((t.siteId || '—') + ' / ' + (t.enderecoId || '—')));
    if (criacao) out += ln('Criada', fmtDt(criacao) + ' <span class="tx">(há ' + fmtDur((now - criacao.getTime()) / 60000) + ')</span>');
    if (venc) { var rest = Math.round((venc.getTime() - now) / 60000); out += ln('Vencimento', fmtDt(venc) + ' <b style="color:' + corTempo(rest) + '">' + (rest < 0 ? 'atrasada ' : 'vence em ') + fmtDur(rest) + '</b>'); }
    var upd = it ? it.upd : (U.classificarUltimoBloco ? U.classificarUltimoBloco(t.motivoCancelamento) : null);
    if (upd && upd.estado !== 'sem' && upd.dt) {
      out += ln('Último update', fmtDt(upd.dt) + ' <span class="tx">(há ' + fmtDur((now - upd.dt.getTime()) / 60000) + ')</span>');
      if (upd.texto) {      // a MENSAGEM que vem depois do nome de quem atualizou (não o cabeçalho "App Teleperformance - Tel.:")
        var msg = String(upd.texto).replace(/\s+/g, ' ');
        out += '<div class="msg">' + (upd.autor ? '<b>' + esc(upd.autor) + '</b><br>' : '') + '“' + esc(msg.slice(0, 260)) + (msg.length > 260 ? '…' : '') + '”</div>';
      }
    } else out += ln('Último update', '<b style="color:' + COR.red + '">sem atualização do operador</b>');
    if (t.enderecoId) out += ln('Coordenada', coordDe(t.enderecoId) ? 'cadastrada' : '<b style="color:' + COR.orange + '">sem coordenada — informe ao selecionar p/ rota</b>');
    var bg = String(t.motivoCancelamento || ''), m = /TRAMITA[ÇC][ÃA]O OU SUSPENS[ÃA]O:/i.exec(bg);
    if (m && (D.normalize(t.status) === 'PENDENTE' || rows.some(function (r) { return D.normalize(r.status) === 'PENDENTE'; }))) {
      out += ln('Pendência', esc(bg.slice(m.index, m.index + 200).replace(/\s+/g, ' ')) + '…');
    }
    var mv = [], ult = '';
    rows.slice(0, 6).reverse().forEach(function (r) {
      var s = stInfo(r.status).l + ' → ' + String(r.filaAtual || '—').slice(0, 34);
      if (s !== ult) { mv.push(s); ult = s; }
    });
    if (mv.length > 1) out += '<div class="mv"><b>Movimentação:</b><br>' + mv.map(esc).join('<br>') + '</div>';
    out += '<div class="mv">Ctrl + clique: selecionar para rota</div>';
    return out;
  }
  var tipFor = null;
  function showTip(el) {
    if (!model) return;
    var os = el.getAttribute('data-os'); if (!os) return;
    tipFor = el; tipEl.innerHTML = tipHtml(os); tipEl.style.display = 'block';
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(tipEl);
    var r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
    var y = r.bottom + 8; if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8);
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { tipEl.style.display = 'none'; tipFor = null; }
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest ? e.target.closest('[data-os]') : null;
    if (el) { if (el !== tipFor) showTip(el); } else if (tipFor) hideTip();
  });
  window.addEventListener('scroll', hideTip, true);

  /* ---------- seleção para rota (Ctrl + clique) ---------- */
  function selIdx(key) { for (var i = 0; i < sel.length; i++) if (sel[i].key === key) return i; return -1; }
  function toggleSel(rowEl) {
    var key = rowEl.getAttribute('data-sel'); if (!key) return;
    var i = selIdx(key);
    if (i >= 0) { sel.splice(i, 1); refreshSelUI(); return; }
    var item = { key: key, os: rowEl.getAttribute('data-os-sel') || '', end: rowEl.getAttribute('data-end') || '', site: rowEl.getAttribute('data-site') || '' };
    if (!item.end.trim()) { U.toast('Esta TSK está sem END_ID — não é possível traçar rota.', 'err'); return; }
    if (!coordDe(item.end)) {       // sem coordenada: avisa e só deixa selecionar depois que a coordenada for informada
      abrirCoordModal(item, function () { if (selIdx(key) < 0) sel.push(item); refreshSelUI(); });
      return;
    }
    sel.push(item); refreshSelUI();
  }
  function refreshSelUI() {
    var rows = root.querySelectorAll('[data-sel]');
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i].getAttribute('data-sel'), ix = selIdx(k);
      if (ix >= 0) { rows[i].classList.add('sel'); rows[i].setAttribute('data-n', String(ix + 1)); }
      else { rows[i].classList.remove('sel'); rows[i].removeAttribute('data-n'); }
    }
    renderSelBar();
  }
  var selBar = null;
  function renderSelBar() {
    if (!selBar) { selBar = document.createElement('div'); selBar.id = 'op-selbar'; document.body.appendChild(selBar); }
    if (!sel.length) { selBar.style.display = 'none'; return; }
    selBar.style.display = 'flex'; selBar.innerHTML = '';
    var ends = sel.map(function (s) { return s.end; }).filter(Boolean);
    selBar.appendChild(h('span', { class: 'n', text: sel.length + ' selecionada' + (sel.length > 1 ? 's' : '') }));
    selBar.appendChild(h('span', { class: 'lst', text: sel.map(function (s) { return s.os || s.site || s.end; }).join(' → ') }));
    var ok = ends.length >= 2;
    selBar.appendChild(h('button', { class: 'op-btn go', type: 'button', disabled: ok ? null : 'disabled', title: ok ? 'Calcular a rota entre os sites, na ordem dos cliques' : 'Selecione pelo menos 2 (Ctrl + clique)', text: '🧭 Calcular rota', onclick: calcularRota }));
    selBar.appendChild(h('button', { class: 'op-btn', type: 'button', text: 'Limpar', onclick: function () { sel = []; refreshSelUI(); } }));
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(selBar);
  }
  function coordIndex() {
    var cm = raw._mapaCoordMap || lsGet('trj_coordMap') || TRJ.defaultCoordMap || {};
    if (coordCache.src !== cm) {
      var idx = {}; Object.keys(cm).forEach(function (k) { idx[k.toLowerCase()] = k; });
      coordCache = { src: cm, idx: idx };
    }
    return { cm: cm, idx: coordCache.idx };
  }
  function coordDe(end) {
    var e = String(end || '').trim().toLowerCase(); if (!e) return null;
    var ci = coordIndex(), k = ci.idx[e], v = k ? ci.cm[k] : null;
    return v && v.length >= 2 && isFinite(+v[0]) && isFinite(+v[1]) ? [+v[0], +v[1]] : null;
  }

  /* ---------- coordenada que falta: informar, validar e gravar no banco ---------- */
  /* aceita "-22.9071, -43.1743", "-22,9071 -43,1743", "-22.9071;-43.1743" ou o link do Google Maps (@lat,lon) */
  function lerCoord(txt) {
    var s = String(txt || '').trim(); if (!s) return { erro: 'Informe latitude e longitude.' };
    var m = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s) || /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s), a, b;
    if (m) { a = parseFloat(m[1]); b = parseFloat(m[2]); }
    else {
      var t = s.match(/-?\d+(?:[.,]\d+)?/g);
      if (!t || t.length !== 2) return { erro: 'Use o formato: latitude, longitude (ex.: -22.9071, -43.1743).' };
      a = parseFloat(t[0].replace(',', '.')); b = parseFloat(t[1].replace(',', '.'));
    }
    if (!isFinite(a) || !isFinite(b)) return { erro: 'Coordenada inválida.' };
    var noBrasil = function (la, lo) { return la >= -34.5 && la <= 5.5 && lo >= -74.5 && lo <= -32; };
    if (!noBrasil(a, b)) {
      if (noBrasil(b, a)) return { erro: 'Parece que latitude e longitude estão invertidas. Informe primeiro a latitude (ex.: -22.9071, -43.1743).' };
      return { erro: 'Essa coordenada está fora do Brasil. Confira os sinais (no Brasil, latitude e longitude costumam ser negativas).' };
    }
    return { lat: Math.round(a * 1e6) / 1e6, lon: Math.round(b * 1e6) / 1e6 };
  }
  function aplicarCoordLocal(end, lat, lon) {
    if (!raw._mapaCoordMap) raw._mapaCoordMap = Object.assign({}, coordIndex().cm);
    var ci = coordIndex(), k = ci.idx[String(end).trim().toLowerCase()] || String(end).trim();
    raw._mapaCoordMap[k] = [lat, lon];
    coordCache.src = null;
    var locais = lsGet(LS_COORD_LOCAL) || {}; locais[k] = [lat, lon];
    try { localStorage.setItem(LS_COORD_LOCAL, JSON.stringify(locais)); localStorage.setItem('trj_coordMap', JSON.stringify(raw._mapaCoordMap)); } catch (e) {}
  }
  async function enviarCoord(p) {
    var corpo = { action: 'addCoordOperador', endId: p.end, lat: p.lat, lon: p.lon, site: p.site || '', os: p.os || '' };
    var pin = ''; try { pin = localStorage.getItem(LS_PIN) || ''; } catch (e) {}
    if (p.pin || pin) corpo.pin = p.pin || pin;
    var resp = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', body: JSON.stringify(corpo) });
    var j = JSON.parse(await resp.text());
    if (j && j.ok === false) { var er = new Error(j.error || 'Erro no servidor.'); er.code = j.code || ''; er.server = true; throw er; }
    return j;
  }
  function pendentes() { return lsGet(LS_COORD_PEND) || []; }
  function gravarPendentes(l) { try { localStorage.setItem(LS_COORD_PEND, JSON.stringify(l)); } catch (e) {} }
  var reenviando = false;
  async function reenviarCoordsPendentes() {
    if (reenviando || !URL_API) return;
    var lista = pendentes(); if (!lista.length) return;
    reenviando = true;
    try {
      var resto = [];
      for (var i = 0; i < lista.length; i++) {
        try { var r = await enviarCoord(lista[i]); if (r && r.exists && r.coord) aplicarCoordLocal(lista[i].end, +r.coord[0], +r.coord[1]); }
        catch (e) { if (!e || !e.server || e.code === 'PIN') resto.push(lista[i]); }   // erro de validação do servidor: descarta; rede/PIN: tenta de novo depois
      }
      gravarPendentes(resto);
    } finally { reenviando = false; }
  }

  function fecharModal() { var o = document.getElementById('op-modal-ov'); if (o) o.remove(); view.modal = false; document.removeEventListener('keydown', escModal, true); }
  function escModal(e) { if (e.key === 'Escape') fecharModal(); }
  function abrirCoordModal(item, onOk) {
    fecharModal(); view.modal = true; hideTip();
    var inp = h('input', { class: 'op-search', type: 'text', placeholder: '-22.9071, -43.1743', autocomplete: 'off', style: { maxWidth: 'none', width: '100%', fontSize: '14px', padding: '9px 11px' } });
    var pinInp = h('input', { class: 'op-search', type: 'password', placeholder: 'PIN da equipe', autocomplete: 'off', style: { maxWidth: 'none', width: '100%', display: 'none', marginTop: '8px' } });
    var erro = h('div', { class: 'op-modal-err' });
    var salvar = h('button', { class: 'op-btn go', type: 'button', text: '💾 Salvar e selecionar' });
    var gmaps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((item.site || item.end) + ' ' + item.end);
    var box = h('div', { class: 'op-modal', role: 'dialog', 'aria-modal': 'true' }, [
      h('h3', { text: '📍 Site sem coordenada' }),
      h('p', { html: 'O site <b>' + esc(item.site || '—') + '</b> (END_ID <b>' + esc(item.end) + '</b>) ainda não tem coordenada cadastrada, então não entra na rota. Informe a coordenada para liberar a seleção — ela fica gravada no banco para todos.' }),
      h('label', { class: 'op-modal-lb', text: 'Latitude, longitude' }), inp,
      h('div', { class: 'op-modal-hint', html: 'Dica: no Google Maps, clique com o botão direito no local e copie os números da primeira linha. Também aceito o link do Maps. <a href="' + gmaps + '" target="_blank" rel="noopener">Abrir o Google Maps ↗</a>' }),
      pinInp, erro,
      h('div', { class: 'op-modal-act' }, [h('button', { class: 'op-btn', type: 'button', text: 'Cancelar', onclick: fecharModal }), salvar])
    ]);
    var ov = h('div', { id: 'op-modal-ov', class: 'op-modal-ov' }, [box]);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) fecharModal(); });
    document.body.appendChild(ov);
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(ov);
    document.addEventListener('keydown', escModal, true);
    setTimeout(function () { inp.focus(); }, 30);
    var ocupado = false;
    async function confirmar() {
      if (ocupado) return;
      var r = lerCoord(inp.value);
      if (r.erro) { erro.textContent = r.erro; inp.focus(); return; }
      ocupado = true; salvar.disabled = true; salvar.textContent = 'Gravando…'; erro.textContent = '';
      var p = { end: item.end, lat: r.lat, lon: r.lon, site: item.site, os: item.os, pin: pinInp.style.display === 'none' ? '' : pinInp.value.trim() };
      try {
        var res = await enviarCoord(p);
        if (p.pin) { try { localStorage.setItem(LS_PIN, p.pin); } catch (e) {} }
        if (res && res.exists && res.coord) { aplicarCoordLocal(item.end, +res.coord[0], +res.coord[1]); U.toast('Esse site já tinha coordenada no banco — usando a cadastrada.', 'info'); }
        else { aplicarCoordLocal(item.end, r.lat, r.lon); U.toast('Coordenada gravada: ' + item.end, 'ok'); }
        fecharModal(); onOk();
      } catch (e) {
        if (e && e.code === 'PIN') {
          pinInp.style.display = ''; pinInp.focus(); erro.textContent = e.message || 'Informe o PIN da equipe para gravar coordenadas.';
          ocupado = false; salvar.disabled = false; salvar.textContent = '💾 Salvar e selecionar'; return;
        }
        if (e && e.server) { erro.textContent = e.message; ocupado = false; salvar.disabled = false; salvar.textContent = '💾 Salvar e selecionar'; return; }
        // sem rede / Apps Script antigo: vale nesta sessão e fica na fila para gravar quando a conexão voltar
        aplicarCoordLocal(item.end, r.lat, r.lon);
        var lista = pendentes(); lista.push({ end: item.end, lat: r.lat, lon: r.lon, site: item.site || '', os: item.os || '' }); gravarPendentes(lista);
        U.toast('Sem conexão com o banco: coordenada usada agora e será gravada assim que possível.', 'err');
        fecharModal(); onOk();
      }
    }
    salvar.addEventListener('click', confirmar);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmar(); });
    pinInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmar(); });
  }
  function calcularRota() {
    var ci = coordIndex(), ends = [], semCoord = [];
    sel.forEach(function (s) {
      var e = (s.end || '').trim(); if (!e) return;
      var k = ci.idx[e.toLowerCase()];
      if (!k) { if (semCoord.indexOf(e) < 0) semCoord.push(e); return; }
      if (ends[ends.length - 1] !== k) ends.push(k);
    });
    if (semCoord.length) U.toast('Sem coordenada cadastrada: ' + semCoord.join(', '), 'err');
    if (ends.length < 2) { U.toast('É preciso pelo menos 2 sites com coordenada para calcular a rota.', 'err'); return; }
    if (ends.length > 8) { U.toast('A rota aceita até 8 pontos — usando os 8 primeiros.', 'info'); ends = ends.slice(0, 8); }
    view.rotaInicial = ends; view.rotaAtiva = true;
    state.tab = 'mapa'; saveState(); view.pop = false;
    render();
  }
  document.addEventListener('click', function (e) {
    var row = e.target.closest ? e.target.closest('[data-sel]') : null;
    if (row && (e.ctrlKey || e.metaKey || selMode) && !e.target.closest('button,a,input,select,label')) {
      e.preventDefault(); toggleSel(row); if (window.getSelection) window.getSelection().removeAllRanges(); return;
    }
    var el = e.target.closest ? e.target.closest('[data-os]') : null;
    if (el) { copiar(el.getAttribute('data-os')); showTip(el); return; }
    hideTip();
    var fecha = false;
    if (view.pop && !e.target.closest('.op-pop') && !e.target.closest('[data-pop]')) { view.pop = false; fecha = true; }
    if (fecha) render(true);
  });

  /* ---------- componentes ---------- */
  function tag(txt, cor, title) { return h('span', { class: 'op-tag', style: { background: cor }, title: title || null, text: txt }); }

  function rowFila(it, now) {
    var rest = it._rest != null ? it._rest : restOf(it, now), cor = it.pend ? COR.purple : corTempo(rest), pct = pctPrazo(it, now);
    var tags = [];
    if (it.regra.grupo) tags.push(tag(it.regra.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL', it.regra.grupo === 'FIXA' ? COR.blue : COR.green, it.regra.nome));
    if (it.fora) tags.push(tag('SITE FORA', COR.red, 'Este site está fora' + (it.fora.desde ? ' há ' + fmtDur((now - it.fora.desde.getTime()) / 60000) : '')));
    if (it.b2b) tags.push(tag('B2B', COR.purple, 'B2B / Premium'));
    if (it.pend) tags.push(tag('PEND', COR.purple, 'Pendenciada'));
    if (firstSeen[it.os] > 0 && now - firstSeen[it.os] < 300000) tags.push(tag('NOVA', COR.red, 'Entrou na fila nos últimos 5 min'));
    if (!it.pend && semUpdH(it, now) > 4) tags.push(tag('S/ UPD', COR.orange, 'Sem atualização do operador há mais de 4h'));
    var tempo = it.pend ? 'pendenciada' : (rest == null ? 'sem prazo' : (rest < 0 ? 'atrasada ' : 'vence em ') + fmtDur(rest));
    var row = h('div', { class: 'op-row', dataset: { sel: it.os, osSel: it.os, end: it.end, site: it.site } }, [
      h('span', { class: 'op-p', style: { color: PRIO_COR[it.prio] || 'var(--trj-fg)' }, text: it.prio }),
      h('div', { style: { minWidth: 0 } }, [
        h('span', { class: 'op-tsk', dataset: { os: it.os }, text: it.os }), tags,
        h('span', { class: 'op-sub', html: '<b>' + esc(it.site || '—') + '</b> · ' + esc(it.end || '—') + (it.cidade ? ' · ' + esc(it.cidade) : '') + (it.falha ? ' · ' + esc(it.falha) : '') })
      ]),
      h('div', { class: 'op-time', style: { color: cor }, text: tempo }),
      h('div', { class: 'op-bar', title: pct == null ? '' : Math.round(pct) + '% do prazo consumido' }, pct == null ? null : h('i', { style: { width: pct.toFixed(0) + '%', background: cor } }))
    ]);
    row.style.setProperty('--rc', cor);
    return row;
  }

  function rowSite(s, now) {
    var cor = s.tsk ? COR.green : COR.red;
    var dur = s.desde ? fmtDur((now - s.desde.getTime()) / 60000) : (s.inc.downtime || '—');
    var tskEl = s.tsk
      ? h('span', null, [h('span', { class: 'op-tsk', dataset: { os: s.tsk.osNumero }, text: s.tsk.osNumero }), tag(stInfo(s.tsk.status).l, stInfo(s.tsk.status).cor)])
      : h('span', { style: { color: COR.red, fontWeight: '800' }, text: 'SEM TSK' });
    var det = String(s.inc.detalhe || '').replace(/\s+/g, ' ').trim();
    var key = s.tsk ? s.tsk.osNumero : 'E:' + s.end;
    var row = h('div', { class: 'op-srow', dataset: { sel: key, osSel: s.tsk ? s.tsk.osNumero : '', end: s.end, site: s.sites[0] || '' } }, [
      h('div', { class: 'op-sdur', text: dur }),
      h('div', { style: { minWidth: 0 } }, [
        h('b', { text: s.sites.join(', ') || '—' }), s.qtd > 1 ? tag('+' + (s.qtd - 1), COR.gray, s.qtd + ' sites neste END_ID') : null,
        h('span', { class: 'op-sub', text: (s.end || '—') + ' · ' + (s.inc.cidadeUf || s.inc.cidade || '—') }),
        h('span', { class: 'op-sub', text: (s.inc.causa || '—') + (det ? ' — ' + det.slice(0, 70) + (det.length > 70 ? '…' : '') : '') })
      ]),
      h('div', { style: { textAlign: 'right' } }, tskEl)
    ]);
    row.style.setProperty('--rc', cor);
    return row;
  }

  function kpi(valor, rotulo, cor, on, onclick, sub, key) {
    var v = num(valor, key || ('kpi:' + rotulo), null); v.className = 'v'; v.style.color = cor;
    var b = h('button', { class: 'op-kpi' + (on ? ' on' : ''), type: 'button', onclick: onclick }, [
      v, h('div', { class: 'l', text: rotulo }), sub ? h('div', { class: 's', text: sub }) : null
    ]);
    b.style.borderLeftColor = cor;
    return b;
  }
  function setSit(s) { state.situacao = state.situacao === s ? 'TODAS' : s; state.lim = {}; saveState(); state.tab = 'fila'; render('lista'); }
  function setTab(t) { state.tab = t; saveState(); view.pop = false; if (t !== 'mapa') view.rotaAtiva = false; render(); }

  function topBar() {
    var idade = savedAt ? Math.round((Date.now() - new Date(savedAt).getTime()) / 60000) : null, velho = idade != null && idade > STALE_MIN;
    return h('div', { class: 'op-top' }, [
      h('div', { class: 'op-title' }, [h('img', { src: 'assets/logo-trj.png', alt: '' }), h('span', { text: 'OPERAÇÃO TRJ' })]),
      h('div', { class: 'op-live' }, [
        h('span', { class: 'op-dot' + (velho ? ' stale' : '') }),
        h('span', { id: 'op-age', text: savedAt ? ('Atualizado há ' + fmtDur(idade) + ' · ' + fmtDt(new Date(savedAt))) : 'Dados publicados' }),
        h('button', { class: 'op-btn', type: 'button', text: '⬇ Excel', title: 'Exporta o que está filtrado, com resumo e atalhos entre as abas', onclick: exportarExcel }),
        h('button', { class: 'op-btn', type: 'button', text: '↻ Atualizar', onclick: function () { carregarDados(false, true); } }),
        h('button', { class: 'op-btn', type: 'button', text: document.body.classList.contains('op-tv') ? '✕ Sair do modo TV' : '📺 Modo TV', onclick: toggleTV })
      ])
    ]);
  }
  function atualizarIdade() {
    var el = document.getElementById('op-age'); if (!el || !savedAt) return;
    el.textContent = 'Atualizado há ' + fmtDur(Math.round((Date.now() - new Date(savedAt).getTime()) / 60000)) + ' · ' + fmtDt(new Date(savedAt));
  }
  function toggleTV() {
    var on = document.body.classList.toggle('op-tv');
    try { if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    render();
  }
  function banners() {
    var out = [], idade = savedAt ? Math.round((Date.now() - new Date(savedAt).getTime()) / 60000) : 0;
    if (view.emCache) out.push(h('div', { class: 'op-banner', style: { background: 'rgba(31,111,181,.12)', borderColor: 'rgba(31,111,181,.45)' }, text: '⏳ Mostrando a última versão salva neste aparelho — buscando os dados mais recentes…' }));
    if (idade > STALE_MIN) out.push(h('div', { class: 'op-banner', text: '⚠ Os dados foram publicados há ' + fmtDur(idade) + '. O snapshot só é atualizado quando o Dashboard está aberto no painel do coordenador.' }));
    if (model.items.length && !model.temDJ) out.push(h('div', { class: 'op-banner', text: 'ℹ A separação FIXA / MÓVEL (coluna DJ) e os casos B2B aparecem após a próxima publicação do snapshot — basta abrir o Dashboard no painel principal.' }));
    else if (model.temDJ) {
      var sem = model.items.filter(function (it) { return !it.regra.grupo; }).length;
      if (sem) out.push(h('div', { class: 'op-banner', text: 'ℹ ' + sem + ' TSK(s) com regra criadora não reconhecida (ou vazia). Abra “Regras criadoras” para classificar como FIXA ou MÓVEL.' }));
    }
    return out;
  }
  function tabs(counts) {
    function t(id, label) {
      var n = counts[id];
      return h('button', { class: 'op-tab' + (state.tab === id ? ' active' : ''), type: 'button', onclick: function () { setTab(id); } },
        [label, n != null ? num(n, 'tab:' + id, 'n') : null]);
    }
    return h('div', { class: 'op-tabs' }, [t('fila', 'Fazer agora'), t('sites', 'Sites fora'), t('b2b', 'B2B / Premium'), t('conc', 'Concentradores'), t('backbone', 'Backbone / LD'), t('mapa', 'Mapa')]);
  }

  /* ---------- barra de filtros ---------- */
  function regioesDisponiveis() {
    var s = {}; model.items.forEach(function (it) { s[it.regiao] = 1; }); model.sites.forEach(function (x) { s[x.regiao] = 1; });
    return Object.keys(s).sort(function (a, b) { return regiaoIdx(a) - regiaoIdx(b); });
  }
  /* por região: sites fora (total · com TSK · sem TSK) e TSKs na fila */
  function statsRegiao() {
    var st = {};
    function g(r) { return st[r] || (st[r] = { tot: 0, com: 0, sem: 0, fila: 0 }); }
    model.sites.forEach(function (s) { var o = g(s.regiao); o.tot++; if (s.tsk) o.com++; else o.sem++; });
    model.items.forEach(function (it) { if (!it.pend) g(it.regiao).fila++; });
    return st;
  }
  function chipRegiao(rotulo, key, o, on, titulo, onclick) {
    return h('button', { class: 'op-rchip' + (on ? ' on' : ''), type: 'button', title: titulo, onclick: onclick }, [
      h('b', { text: rotulo }),
      num(o.tot, 'rc:' + key + ':t', 't'),
      h('span', { class: 'ok' }, ['✓', num(o.com, 'rc:' + key + ':c')]),
      h('span', { class: 'no' }, ['○', num(o.sem, 'rc:' + key + ':s')])
    ]);
  }
  /* chips de região (seleção múltipla) na mesma linha dos botões Pendenciadas / Lado a lado / Selecionar p/ rota */
  function linhaRegioes(tab) {
    var row = h('div', { class: 'op-regrow' }), st = statsRegiao(), todos = { tot: 0, com: 0, sem: 0 };
    Object.keys(st).forEach(function (r) { todos.tot += st[r].tot; todos.com += st[r].com; todos.sem += st[r].sem; });
    row.appendChild(chipRegiao('Todas', 'all', todos, !state.regioes.length, 'Mostrar todas as regiões — ' + todos.tot + ' sites fora · ' + todos.com + ' com TSK aberta · ' + todos.sem + ' sem TSK',
      function () { state.regioes = []; state.lim = {}; saveState(); render('lista'); }));
    regioesDisponiveis().forEach(function (r) {
      var o = st[r] || { tot: 0, com: 0, sem: 0, fila: 0 }, on = state.regioes.indexOf(r) >= 0;
      row.appendChild(chipRegiao(regiaoLabel(r), r, o, on,
        regiaoLabel(r) + ': ' + o.tot + ' sites fora · ✓ ' + o.com + ' com TSK aberta · ○ ' + o.sem + ' sem TSK · ' + o.fila + ' TSKs na fila. Clique para filtrar (pode escolher várias).',
        function () {
          var i = state.regioes.indexOf(r); if (i >= 0) state.regioes.splice(i, 1); else state.regioes.push(r);
          state.lim = {}; saveState(); render('lista');
        }));
    });
    var extras = h('span', { class: 'op-extras' });
    if (tab === 'fila') {
      var lbl = h('label', { class: 'op-chip op-tgl' }, [h('input', { type: 'checkbox' }), h('span', { text: 'Pendenciadas' })]);
      var cb = lbl.querySelector('input'); cb.checked = !!state.pend;
      cb.addEventListener('change', function () { state.pend = cb.checked; state.lim = {}; saveState(); render('lista'); });
      extras.appendChild(lbl);
    }
    if (extras.childNodes.length) row.appendChild(extras);
    return row;
  }
  function filtros(tab) {
    var wrap = h('div', { class: 'op-fwrap' });
    var bar = h('div', { class: 'op-filters' });
    var comRegra = tab === 'fila' || tab === 'outra';
    if (comRegra) {
      bar.appendChild(h('div', { class: 'op-seg' }, [['TODAS', 'Todas', ''], ['FIXA', 'FIXA', 'fixa'], ['MOVEL', 'MÓVEL', 'movel']].map(function (g) {
        var on = !state.regras.length && state.grupo === g[0];
        return h('button', { type: 'button', class: (on ? 'on ' : '') + g[2], text: g[1], onclick: function () { state.grupo = g[0]; state.regras = []; state.lim = {}; saveState(); render('lista'); } });
      })));
      bar.appendChild(h('button', { class: 'op-chip' + (state.regras.length ? ' on' : ''), type: 'button', dataset: { pop: '1' },
        text: 'Regras criadoras' + (state.regras.length ? ' (' + state.regras.length + ')' : '') + ' ▾',
        onclick: function (e) { e.stopPropagation(); view.pop = !view.pop; render(true); } }));
      bar.appendChild(h('span', { class: 'op-sep' }));
      ['P1', 'P2', 'P3', 'P4', 'P5'].forEach(function (p) {
        bar.appendChild(h('button', { class: 'op-chip' + (state.prios.indexOf(p) >= 0 ? ' on' : ''), type: 'button', text: p, onclick: function () {
          var i = state.prios.indexOf(p); if (i >= 0) state.prios.splice(i, 1); else state.prios.push(p); state.lim = {}; saveState(); render('lista'); } }));
      });
    }
    if (tab === 'fila') {
      bar.appendChild(h('span', { class: 'op-sep' }));
      var sit = h('select', { class: 'op-sel', title: 'Situação', onchange: function () { state.situacao = this.value; state.lim = {}; saveState(); render('lista'); } },
        [['TODAS', 'Situação: todas'], ['NO_PRAZO', 'No prazo'], ['V2H', 'Vencem em até 2h'], ['VENCIDAS', 'Vencidas'], ['SEMUPD', 'Sem update há +4h']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      sit.value = state.situacao; bar.appendChild(sit);
      var ord = h('select', { class: 'op-sel', title: 'Ordenação dentro de cada região', onchange: function () { state.ordem = this.value; saveState(); render('lista'); } },
        [['padrao', 'Ordem: P1→P5, no prazo antes'], ['venc', 'Ordem: vencimento (vão vencer)'], ['recentes', 'Ordem: mais recentes']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      ord.value = state.ordem; bar.appendChild(ord);
    }
    if (tab !== 'outra') {
      var busca = h('input', { class: 'op-search', type: 'search', placeholder: '🔍 TSK, site, END_ID…', value: state.busca });
      busca.addEventListener('input', function () { state.busca = busca.value; state.lim = {}; renderLista(); });
      bar.appendChild(busca);
      var ex2 = h('span', { class: 'op-extras' });
      var lado = h('label', { class: 'op-chip op-tgl', title: 'Com 2 ou mais regiões, mostra uma ao lado da outra' }, [h('input', { type: 'checkbox' }), h('span', { text: 'Lado a lado' })]);
      var cb2 = lado.querySelector('input'); cb2.checked = !!state.lado;
      cb2.addEventListener('change', function () { state.lado = cb2.checked; saveState(); render('lista'); });
      ex2.appendChild(lado);
      var selb = h('label', { class: 'op-chip op-tgl', title: 'Selecionar TSKs para a rota: no computador use Ctrl + clique; em tela de toque, marque esta opção e toque nas linhas' }, [h('input', { type: 'checkbox' }), h('span', { text: '☑ Selecionar' })]);
      var cb3 = selb.querySelector('input'); cb3.checked = selMode;
      cb3.addEventListener('change', function () { selMode = cb3.checked; document.body.classList.toggle('op-selmode', selMode); });
      ex2.appendChild(selb);
      bar.appendChild(ex2);
    }
    if (view.pop && comRegra) bar.appendChild(popRegras());
    wrap.appendChild(bar);
    wrap.appendChild(linhaRegioes(tab));
    return wrap;
  }

  function popRegras() {
    var pop = h('div', { class: 'op-pop' });
    var contagem = {}, semDJ = {};
    model.items.forEach(function (it) {
      var k = regraKey(it); contagem[k] = (contagem[k] || 0) + 1;
      if (!it.regra.grupo) { var n = it.regra.dj || '(vazio)'; semDJ[n] = (semDJ[n] || 0) + 1; }
    });
    function refaz() { buildModel(); state.lim = {}; saveState(); render(true); }
    function toggle(k, on) { var i = state.regras.indexOf(k); if (on && i < 0) state.regras.push(k); if (!on && i >= 0) state.regras.splice(i, 1); state.lim = {}; saveState(); render(true); }
    function grupo(g, titulo, cor, outro, outroTxt) {
      var lista = OP.regrasLista().filter(function (r) { return r.grupo === g; });
      var tot = lista.reduce(function (s, r) { return s + (contagem[r.nome] || 0); }, 0);
      pop.appendChild(h('h4', { style: { color: cor } }, [titulo + ' (' + tot + ')',
        h('button', { class: 'op-chip', type: 'button', text: 'marcar todas', onclick: function () { lista.forEach(function (r) { if (state.regras.indexOf(r.nome) < 0) state.regras.push(r.nome); }); saveState(); render(true); } })]));
      lista.forEach(function (r) {
        var cb = h('input', { type: 'checkbox' }); cb.checked = state.regras.indexOf(r.nome) >= 0;
        cb.addEventListener('change', function () { toggle(r.nome, cb.checked); });
        var acoes = h('span', { class: 'acts' }, [
          h('button', { class: 'mini', type: 'button', title: 'Mover esta regra para ' + outroTxt, text: '⇄ ' + outroTxt, onclick: function (e) { e.preventDefault(); e.stopPropagation(); OP.mover(r.nome, outro); refaz(); } }),
          r.extra ? h('button', { class: 'mini', type: 'button', title: 'Excluir esta regra incluída por você', text: '×', onclick: function (e) { e.preventDefault(); e.stopPropagation(); OP.remover(r.nome); refaz(); } }) : null
        ]);
        pop.appendChild(h('label', null, [cb, h('span', { text: r.nome + (r.movida ? ' ·movida' : '') + (r.extra ? ' ·nova' : '') }), h('span', { class: 'c', text: String(contagem[r.nome] || 0) }), acoes]));
      });
    }
    pop.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('b', { text: 'Regra criadora (coluna DJ)' }),
      h('span', null, [
        h('button', { class: 'op-chip', type: 'button', text: 'limpar seleção', onclick: function () { state.regras = []; saveState(); render(true); } }), ' ',
        h('button', { class: 'op-chip on', type: 'button', text: 'fechar', onclick: function () { view.pop = false; render(true); } })])
    ]));
    grupo('FIXA', 'FIXA', COR.blue, 'MOVEL', 'MÓVEL');
    grupo('MOVEL', 'MÓVEL', COR.green, 'FIXA', 'FIXA');
    var nSem = contagem[SEMKEY] || 0;
    pop.appendChild(h('h4', { style: { color: COR.gray } }, ['Sem classificação (' + nSem + ')']));
    var cb2 = h('input', { type: 'checkbox' }); cb2.checked = state.regras.indexOf(SEMKEY) >= 0;
    cb2.addEventListener('change', function () { toggle(SEMKEY, cb2.checked); });
    pop.appendChild(h('label', null, [cb2, h('span', { text: 'Regra vazia ou não reconhecida' }), h('span', { class: 'c', text: String(nSem) })]));
    Object.keys(semDJ).sort(function (a, b) { return semDJ[b] - semDJ[a]; }).slice(0, 12).forEach(function (nome) {
      if (nome === '(vazio)') return;
      pop.appendChild(h('div', { class: 'op-nova' }, [
        h('span', { class: 'op-sub', style: { flex: '1', whiteSpace: 'normal' }, text: nome + ' (' + semDJ[nome] + ')' }),
        h('button', { class: 'mini', type: 'button', text: '→ FIXA', onclick: function () { OP.adicionar(nome, 'FIXA'); refaz(); } }),
        h('button', { class: 'mini', type: 'button', text: '→ MÓVEL', onclick: function () { OP.adicionar(nome, 'MOVEL'); refaz(); } })
      ]));
    });
    // incluir regra nova (discreto)
    var rodape = h('div', { class: 'op-pop-foot' });
    if (!view.novaRegra) {
      rodape.appendChild(h('button', { class: 'op-link', type: 'button', text: '+ incluir regra criadora', onclick: function () { view.novaRegra = true; render(true); } }));
      if (OP.temAjustes()) rodape.appendChild(h('button', { class: 'op-link', type: 'button', text: 'restaurar padrão', onclick: function () { if (confirm('Desfazer todas as regras movidas/incluídas neste navegador?')) { OP.restaurarPadrao(); state.regras = []; refaz(); } } }));
    } else {
      var inp = h('input', { class: 'op-search', type: 'text', placeholder: 'Nome exatamente como na coluna DJ', style: { maxWidth: 'none', flex: '1' } });
      var gsel = h('select', { class: 'op-sel' }, [h('option', { value: 'MOVEL', text: 'MÓVEL' }), h('option', { value: 'FIXA', text: 'FIXA' })]);
      rodape.appendChild(h('div', { class: 'op-nova' }, [inp, gsel,
        h('button', { class: 'op-btn go', type: 'button', text: 'Adicionar', onclick: function () { if (OP.adicionar(inp.value, gsel.value)) { view.novaRegra = false; refaz(); } } }),
        h('button', { class: 'op-link', type: 'button', text: 'cancelar', onclick: function () { view.novaRegra = false; render(true); } })]));
    }
    pop.appendChild(rodape);
    pop.appendChild(h('div', { class: 'op-sub', style: { whiteSpace: 'normal', marginTop: '6px' }, text: 'Os ajustes ficam salvos neste navegador. Para valer para toda a equipe, repita-os em js/operador-regras.js.' }));
    return pop;
  }

  /* ---------- listas por região ---------- */
  /* coluna = barra de ações (cópia geral) logo ACIMA + o quadrado da região */
  function blocoEl(titulo, resumo, btnCopiar) {
    var bloco = h('div', { class: 'op-block' }, [h('div', { class: 'op-bh' }, [h('b', { text: titulo }), h('span', { class: 'r', html: resumo || '' })]), h('div', { class: 'op-bb' })]);
    var barra = h('div', { class: 'op-copybar' }, [btnCopiar || null]);
    return h('div', { class: 'op-col' }, [barra, bloco]);
  }
  /* "Prioridade -> TSK / SITE - FALHA" */
  function linhaCopia(it) { return (it.pend ? it.prio + ' (PEND)' : it.prio) + ' -> ' + it.os + ' / ' + (it.site || it.end || '—') + ' - ' + (it.falha || '—'); }
  function btnCopia(texto, lista, titulo, mini) {
    return h('button', { class: mini ? 'op-copy mini' : 'op-copy', type: 'button', title: 'Copiar no formato: Prioridade -> TSK / SITE - FALHA',
      text: texto, onclick: function (e) {
        e.stopPropagation();
        if (!lista.length) return;
        copiar(lista.map(linhaCopia).join('\n'), lista.length + ' TSK' + (lista.length > 1 ? 's' : '') + ' de ' + titulo + ' copiada' + (lista.length > 1 ? 's' : ''));
      } });
  }
  function linhaCopiaSite(s) {
    return '• ' + (s.sites.join(', ') || '—') + ' / ' + (s.end || '—') + ' - ' + (s.inc.causa || '—') + ' · ' + (s.tsk ? s.tsk.osNumero + ' (' + stInfo(s.tsk.status).l + ')' : 'SEM TSK');
  }
  function renderLista() {
    if (!view.listEl || !model) return;
    var now = Date.now(), box = view.listEl; box.innerHTML = '';
    if (state.tab === 'fila') {
      var f = filaAtual(now);
      if (!f.filtrada.length) { box.appendChild(h('div', { class: 'op-empty', text: 'Nada na fila com esses filtros. 👏' })); return; }
      var cols = state.lado && f.blocos.length >= 2;
      var wrap = h('div', { class: 'op-blocks' + (cols ? ' cols' : '') });
      f.blocos.forEach(function (b) {
        var venc = b.lista.filter(function (it) { return !it.pend && it._rest != null && it._rest < 0; }).length;
        var nome = regiaoLabel(b.regiao);
        var col = blocoEl(nome, '<span>' + b.lista.length + ' TSKs</span>' + (venc ? ' · <span style="color:' + COR.red + '">' + venc + ' vencidas</span>' : ''),
          b.lista.length ? btnCopia('📋 Copiar ' + nome + ' (' + b.lista.length + ')', b.lista, nome) : null);
        var body = col.querySelector('.op-bb'), lim = state.lim[b.regiao] || PAGE, ultP = null;
        if (!b.lista.length) body.appendChild(h('div', { class: 'op-empty', style: { padding: '14px 0' }, text: 'Nada nesta região.' }));
        b.lista.slice(0, lim).forEach(function (it) {
          if (state.ordem === 'padrao') {
            var chave = it.pend ? 'PEND' : it.prio;
            if (chave !== ultP) {
              ultP = chave;
              var grupo = b.lista.filter(function (x) { return (x.pend ? 'PEND' : x.prio) === chave; });
              body.appendChild(h('div', { class: 'op-ph', style: { color: it.pend ? COR.purple : (PRIO_COR[it.prio] || 'var(--trj-muted)') } }, [
                h('span', { text: (it.pend ? 'PENDENCIADAS' : it.prio) + ' · ' + grupo.length }),
                btnCopia('📋', grupo, nome + ' ' + (it.pend ? 'pendenciadas' : it.prio), true)
              ]));
            }
          }
          body.appendChild(rowFila(it, now));
        });
        if (b.lista.length > lim) body.appendChild(h('button', { class: 'op-btn op-more', type: 'button', text: 'Mostrar mais (' + (b.lista.length - lim) + ')', onclick: function () { state.lim[b.regiao] = lim + PAGE; renderLista(); } }));
        wrap.appendChild(col);
      });
      box.appendChild(wrap);
    } else if (state.tab === 'sites') {
      var ss = sitesAtuais();
      if (!ss.length) { box.appendChild(h('div', { class: 'op-empty', text: 'Nenhum site fora com esses filtros. 👏' })); return; }
      var porReg = {}; ss.forEach(function (s) { (porReg[s.regiao] = porReg[s.regiao] || []).push(s); });
      var regs = regioesBlocos(Object.keys(porReg)).filter(function (r) { return (porReg[r] || []).length; });
      var wrap2 = h('div', { class: 'op-blocks' + (state.lado && regs.length >= 2 ? ' cols' : '') });
      regs.forEach(function (r) {
        var lista = porReg[r], nomeR = regiaoLabel(r);
        var com = lista.filter(function (s) { return s.tsk; }), sem = lista.filter(function (s) { return !s.tsk; });
        function ord(a, b) { return (a.desde ? a.desde.getTime() : 9e15) - (b.desde ? b.desde.getTime() : 9e15); }
        com.sort(ord); sem.sort(ord);
        var copiaSites = h('button', { class: 'op-copy', type: 'button', title: 'Copiar a lista de sites fora desta região', text: '📋 Copiar ' + nomeR + ' (' + lista.length + ')',
          onclick: function () { copiar(com.concat(sem).map(linhaCopiaSite).join('\n'), lista.length + ' site(s) fora de ' + nomeR + ' copiado(s)'); } });
        var col2 = blocoEl(nomeR, '<span>' + lista.length + ' sites</span> · <span style="color:' + COR.red + '">' + sem.length + ' sem TSK</span>', copiaSites);
        var body = col2.querySelector('.op-bb'), lim = state.lim['S' + r] || PAGE, usados = 0;
        function secao(titulo, cor, arr) {
          if (!arr.length || usados >= lim) return;
          body.appendChild(h('div', { class: 'op-ph', style: { color: cor } }, [h('span', { text: titulo + ' · ' + arr.length })]));
          arr.forEach(function (s) { if (usados < lim) { body.appendChild(rowSite(s, now)); usados++; } });
        }
        secao('Com TSK aberta', COR.green, com);            // sempre no topo
        secao('Sem TSK — abrir/acionar', COR.red, sem);     // e as sem TSK logo abaixo
        if (lista.length > usados) body.appendChild(h('button', { class: 'op-btn op-more', type: 'button', text: 'Mostrar mais (' + (lista.length - usados) + ')', onclick: function () { state.lim['S' + r] = lim + PAGE; renderLista(); } }));
        wrap2.appendChild(col2);
      });
      box.appendChild(wrap2);
    }
    refreshSelUI();
  }

  /* ---------- Excel (ExcelJS: resumo com atalhos, backlog por região, dados cruzados) ---------- */
  var XL = {
    navy: 'FF1F2937', laranja: 'FFFF8C00', linha: 'FFD9DCE3', zebra: 'FFF6F7FB', branco: 'FFFFFFFF', tinta: 'FF1F2937', suave: 'FF6B7280',
    verm: 'FFC62839', vermBg: 'FFFFC7CE', vermFg: 'FF9C0006', ambar: 'FFF5B041', verde: 'FF1E8449', verdeBg: 'FFD5F5E3', azul: 'FF1F6FB5', roxo: 'FF7D3C98', roxoBg: 'FFE8DAEF', cinza: 'FFE5E7EB'
  };
  var XL_PRIO = { P1: ['FFFDE2E4', 'FFB71C2E'], P2: ['FFFFE8D6', 'FFC2410C'], P3: ['FFFFF3CD', 'FF92400E'], P4: ['FFDCEBFA', 'FF1F6FB5'], P5: ['FFEDEEF1', 'FF4B5563'] };
  var XL_SIT = { 'Vencida': [XL.verm, XL.branco], 'Vence em até 2h': [XL.ambar, XL.tinta], 'No prazo': [XL.verdeBg, XL.verde], 'Pendenciada': [XL.roxoBg, XL.roxo], 'Sem prazo': [XL.cinza, 'FF4B5563'] };
  var XL_DATA = 'dd/mm/yyyy hh:mm';
  function xFill(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
  function xBorda(argb, estilo) { var s = { style: estilo || 'thin', color: { argb: argb || XL.linha } }; return { top: s, left: s, bottom: s, right: s }; }
  function xd(d) { return d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000) : null; }   // ExcelJS grava datas em UTC: compensa o fuso para o Excel mostrar a hora local
  function colLetra(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  async function exportarExcel() {
    if (!window.ExcelJS) { U.toast('A biblioteca de Excel não carregou. Atualize a página.', 'err'); return; }
    U.toast('Gerando o Excel…', 'info');
    await new Promise(function (r) { setTimeout(r, 40); });
    try { await montarExcel(); } catch (e) { console.error(e); U.toast('Erro ao gerar o Excel: ' + (e && e.message || e), 'err'); }
  }

  async function montarExcel() {
    var now = Date.now(), wb = new ExcelJS.Workbook();
    wb.creator = 'Operação TRJ'; wb.created = new Date();
    var f = filaAtual(now), base = f.base, baseNP = base.filter(function (it) { return !it.pend; });
    var sites = sitesAtuais(), conc = raw.concentradores || [];
    var nomesUsados = {};
    function nomeAba(n) {
      n = String(n).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31); var b = n, i = 2;
      while (nomesUsados[n.toLowerCase()]) { n = b.slice(0, 28) + ' ' + (i++); }
      nomesUsados[n.toLowerCase()] = 1; return n;
    }
    var RES = 'Resumo';
    nomesUsados[RES.toLowerCase()] = 1;
    function link(aba) { return "#'" + aba + "'!A1"; }

    /* regras de domínio reaproveitadas pelas abas */
    function concDe(it) {
      var k1 = up(it.end), k2 = up(it.site), hit = null;
      conc.forEach(function (c) { var key = up(c.endId || c.site); if (key && (key === k1 || key === k2)) hit = c; });
      return hit;
    }
    function sitDe(it, rest) { if (it.pend) return 'Pendenciada'; if (rest == null) return 'Sem prazo'; return rest < 0 ? 'Vencida' : (rest <= 120 ? 'Vence em até 2h' : 'No prazo'); }
    function prazoTxt(it, rest) { if (it.pend) return 'pendenciada'; if (rest == null) return 'sem prazo'; return (rest < 0 ? 'atrasada ' : 'vence em ') + fmtDur(rest); }
    /* backlog: DENTRO do prazo no topo (por prioridade), depois as vencidas, também por prioridade */
    function ordemExcel(a, b) {
      function bk(it) { if (it.pend) return 3; if (it._rest == null) return 2; return it._rest >= 0 ? 0 : 1; }   // no prazo → vencidas → sem prazo → pendenciadas
      var ba = bk(a), bb = bk(b); if (ba !== bb) return ba - bb;
      var dp = prioNum(a.prio) - prioNum(b.prio); if (dp) return dp;
      return restKey(a) - restKey(b);       // no prazo: vence antes primeiro · vencidas: a mais atrasada primeiro
    }
    baseNP.forEach(function (it) { it._rest = restOf(it, now); });
    base.forEach(function (it) { it._rest = restOf(it, now); });

    /* ===== colunas padrão das abas de TSK ===== */
    function colsTsk(comRegiao) {
      var c = [];
      if (comRegiao) c.push({ h: 'Região', w: 14, v: function (it) { return regiaoLabel(it.regiao); } });
      return c.concat([
        { h: 'Prioridade', w: 10, t: 'prio', v: function (it) { return it.prio; } },
        { h: 'TSK', w: 19, t: 'bold', v: function (it) { return it.os; } },
        { h: 'Site', w: 18, v: function (it) { return it.site; } },
        { h: 'END_ID', w: 14, v: function (it) { return it.end; } },
        { h: 'Cidade', w: 18, v: function (it) { return it.cidade; } },
        { h: 'Falha', w: 24, v: function (it) { return it.falha; } },
        { h: 'Status', w: 13, v: function (it) { return stInfo(it.t.status).l; } },
        { h: 'Situação', w: 16, t: 'sit', v: function (it) { return sitDe(it, it._rest); } },
        { h: 'Prazo', w: 18, v: function (it) { return prazoTxt(it, it._rest); } },
        { h: 'Vencimento', w: 17, t: 'data', v: function (it) { return it.venc; } },
        { h: 'Criação', w: 17, t: 'data', v: function (it) { return it.criacao; } },
        { h: 'Site fora', w: 17, t: 'bold', v: function (it) { return it.fora ? 'FORA' + (it.fora.desde ? ' há ' + fmtDur((now - it.fora.desde.getTime()) / 60000) : '') : ''; } },
        { h: 'Regra criadora', w: 34, v: function (it) { return it.regra.nome || ''; } },
        { h: 'Grupo', w: 11, v: function (it) { return it.regra.grupo ? (it.regra.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL') : '(sem class.)'; } },
        { h: 'Fila atual', w: 32, v: function (it) { return it.t.filaAtual || ''; } },
        { h: 'Último update', w: 17, t: 'data', v: function (it) { return it.upd && it.upd.estado !== 'sem' && it.upd.dt ? it.upd.dt : ''; } },
        { h: 'Quem atualizou', w: 24, v: function (it) { return it.upd && it.upd.estado !== 'sem' ? (it.upd.autor || '') : ''; } },
        { h: 'Mensagem do update', w: 64, t: 'wrap', v: function (it) { return it.upd && it.upd.estado !== 'sem' && it.upd.texto ? String(it.upd.texto).replace(/\s+/g, ' ').slice(0, 500) : ''; } },
        { h: 'B2B', w: 7, t: 'ctr', v: function (it) { return it.b2b ? 'Sim' : ''; } },
        { h: 'Concentrador', w: 13, t: 'ctr', v: function (it) { return concDe(it) ? 'Sim' : ''; } }
      ]);
    }
    /* site fora COM TSK na fila = linha inteira em vermelho */
    function estiloLinhaTsk(it) { return it.fora ? { bg: XL.vermBg, fg: XL.vermFg, bold: true } : null; }

    /* ===== construtor genérico de aba ===== */
    function aba(nome, titulo, sub, cor, cols, linhas, opt) {
      opt = opt || {};
      var ws = wb.addWorksheet(nome, { properties: { tabColor: { argb: cor || XL.laranja } }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      var n = cols.length;
      cols.forEach(function (c, i) { ws.getColumn(i + 1).width = c.w; });
      ws.mergeCells(1, 1, 1, n);
      var t = ws.getCell(1, 1); t.value = titulo;
      t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: XL.branco } }; t.fill = xFill(XL.navy); t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;
      ws.mergeCells(2, 1, 2, n);
      var s2 = ws.getCell(2, 1); s2.value = sub || '';
      s2.font = { name: 'Calibri', size: 10, color: { argb: XL.suave }, italic: true }; s2.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 22;
      function botao(col, txt, destino, bg) {
        var c = ws.getCell(3, col);
        c.value = { text: txt, hyperlink: link(destino), tooltip: 'Ir para ' + destino };
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XL.branco }, underline: false };
        c.fill = xFill(bg || XL.azul); c.alignment = { vertical: 'middle', horizontal: 'center' }; c.border = xBorda('FF174F82', 'medium');
      }
      botao(1, '← Voltar ao menu', RES, XL.azul);
      (opt.atalhos || []).forEach(function (a, i) { botao(2 + i, a[0], a[1], XL.laranja); });
      var hr = ws.getRow(4); hr.height = 24;
      cols.forEach(function (c, i) {
        var cell = hr.getCell(i + 1); cell.value = c.h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XL.branco } }; cell.fill = xFill(XL.navy);
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = { bottom: { style: 'medium', color: { argb: XL.laranja } }, top: { style: 'thin', color: { argb: XL.navy } }, left: { style: 'thin', color: { argb: 'FF374151' } }, right: { style: 'thin', color: { argb: 'FF374151' } } };
      });
      linhas.forEach(function (ln, i) {
        var row = ws.getRow(5 + i), est = opt.linha ? opt.linha(ln) : null, zebra = i % 2 === 1;
        cols.forEach(function (c, j) {
          var cell = row.getCell(j + 1), v = c.v(ln);
          if (v instanceof Date) { cell.value = xd(v); cell.numFmt = XL_DATA; }
          else if (v === '' || v == null) cell.value = null;
          else cell.value = v;
          var fnt = { name: 'Calibri', size: 10, color: { argb: XL.tinta } }, bg = zebra ? XL.zebra : XL.branco;
          if (c.t === 'bold') fnt.bold = true;
          if (est) { bg = est.bg; fnt.color = { argb: est.fg }; if (est.bold) fnt.bold = true; }
          else if (c.t === 'prio' && XL_PRIO[v]) { bg = XL_PRIO[v][0]; fnt.color = { argb: XL_PRIO[v][1] }; fnt.bold = true; }
          else if (c.t === 'sit' && XL_SIT[v]) { bg = XL_SIT[v][0]; fnt.color = { argb: XL_SIT[v][1] }; fnt.bold = true; }
          if (opt.celula) { var o = opt.celula(ln, c, v); if (o) { if (o.bg) bg = o.bg; if (o.fg) fnt.color = { argb: o.fg }; if (o.bold) fnt.bold = true; } }
          cell.font = fnt; cell.fill = xFill(bg);
          cell.alignment = { vertical: 'middle', horizontal: (c.t === 'prio' || c.t === 'sit' || c.t === 'ctr' || c.t === 'data' || c.t === 'num') ? 'center' : 'left', wrapText: c.t === 'wrap', indent: c.t === 'prio' || c.t === 'sit' || c.t === 'ctr' || c.t === 'data' || c.t === 'num' ? 0 : 0 };
          cell.border = xBorda(est ? (est.fina || 'FFE08A93') : XL.linha);
          if (j === 0 && est) cell.border = Object.assign({}, cell.border, { left: { style: 'thick', color: { argb: est.borda || XL.verm } } });
          if (c.link) { var dest = c.link(ln); if (dest && v) { cell.value = { text: String(v), hyperlink: link(dest), tooltip: 'Ir para ' + dest }; fnt.color = { argb: XL.azul }; fnt.underline = true; cell.font = fnt; } }
        });
        row.height = 17;
      });
      if (linhas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + linhas.length, column: n } };
      else { ws.mergeCells(5, 1, 5, n); var vz = ws.getCell(5, 1); vz.value = 'Nenhum registro com os filtros atuais.'; vz.font = { italic: true, color: { argb: XL.suave } }; vz.alignment = { horizontal: 'center' }; }
      return ws;
    }

    var filtroTxt = [
      'Grupo: ' + (state.regras.length ? state.regras.length + ' regra(s) escolhida(s)' : (state.grupo === 'TODAS' ? 'todas' : (state.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL'))),
      'Regiões: ' + (state.regioes.length ? state.regioes.map(regiaoLabel).join(', ') : 'todas'),
      'Prioridades: ' + (state.prios.length ? state.prios.join(', ') : 'todas'),
      'Pendenciadas: ' + (state.pend ? 'incluídas' : 'fora')
    ].join('   |   ');
    var carimbo = 'Gerado em ' + fmtDt(new Date()) + (savedAt ? '  ·  snapshot publicado em ' + fmtDt(new Date(savedAt)) : '') + '   |   ' + filtroTxt;

    /* ===== abas de TSK ===== */
    var porRegiao = {};
    base.forEach(function (it) { (porRegiao[it.regiao] = porRegiao[it.regiao] || []).push(it); });
    var regsComFila = Object.keys(porRegiao).sort(function (a, b) { return regiaoIdx(a) - regiaoIdx(b); });
    var abaRegiao = {};
    regsComFila.forEach(function (r) { abaRegiao[r] = nomeAba('Backlog ' + regiaoLabel(r)); });

    var nomeFila = nomeAba('Fazer agora'), nomeVenc = nomeAba('Vencidas'), nomeReg = nomeAba('Por região'), nomeRg = nomeAba('Por regra criadora'),
        nomeSites = nomeAba('Sites fora'), nomeB2B = nomeAba('B2B'), nomeConc = nomeAba('Concentradores');

    /* Resumo é criado primeiro (aparece como 1ª aba) e preenchido no fim */
    var wsRes = wb.addWorksheet(RES, { properties: { tabColor: { argb: XL.laranja } }, views: [{ showGridLines: false }] });

    /* Fazer agora: todas as regiões, dentro do prazo no topo de cada região */
    var itens = [];
    f.blocos.forEach(function (b) { b.lista.slice().sort(ordemExcel).forEach(function (it) { it._rest = restOf(it, now); itens.push(it); }); });
    itens.sort(function (a, b) { var d = regiaoIdx(a.regiao) - regiaoIdx(b.regiao); return d || ordemExcel(a, b); });
    aba(nomeFila, 'Fazer agora — todas as regiões', carimbo + '   |   linhas em VERMELHO = site fora com TSK na fila', XL.laranja, colsTsk(true), itens,
      { linha: estiloLinhaTsk, atalhos: [['Vencidas ›', nomeVenc], ['Sites fora ›', nomeSites]] });

    /* Backlog de cada região */
    regsComFila.forEach(function (r) {
      var lista = porRegiao[r].slice().sort(ordemExcel);
      var nv = lista.filter(function (it) { return !it.pend && it._rest != null && it._rest < 0; }).length, nf = lista.filter(function (it) { return it.fora; }).length;
      aba(abaRegiao[r], 'Backlog — ' + regiaoLabel(r), lista.length + ' TSKs · ' + nv + ' vencidas · ' + nf + ' em site fora (linhas vermelhas)  |  dentro do prazo no topo (por prioridade), vencidas na sequência (por prioridade)',
        XL.azul, colsTsk(false), lista, { linha: estiloLinhaTsk, atalhos: [['Sites fora ›', nomeSites]] });
    });

    /* Vencidas */
    var vencidas = itens.filter(function (it) { return !it.pend && it._rest != null && it._rest < 0; }).sort(function (a, b) { return prioNum(a.prio) - prioNum(b.prio) || restKey(a) - restKey(b); });
    aba(nomeVenc, 'Somente vencidas', carimbo, XL.verm, colsTsk(true), vencidas, { linha: estiloLinhaTsk });

    /* Sites fora (cruzado com a TSK aberta) */
    var sitesOrd = sites.slice().sort(function (a, b) { return (!!b.tsk - !!a.tsk) || ((a.desde ? a.desde.getTime() : 9e15) - (b.desde ? b.desde.getTime() : 9e15)); });
    var colsSites = [
      { h: 'Região', w: 14, v: function (s) { return regiaoLabel(s.regiao); } },
      { h: 'Situação', w: 15, t: 'bold', v: function (s) { return s.tsk ? 'COM TSK' : 'SEM TSK'; } },
      { h: 'Site(s)', w: 26, t: 'bold', v: function (s) { return s.sites.join(', '); } },
      { h: 'END_ID', w: 14, v: function (s) { return s.end; } },
      { h: 'Cidade/UF', w: 22, v: function (s) { return s.inc.cidadeUf || s.inc.cidade || ''; } },
      { h: 'Fora há', w: 11, t: 'ctr', v: function (s) { return s.desde ? fmtDur((now - s.desde.getTime()) / 60000) : ''; } },
      { h: 'Fora desde', w: 17, t: 'data', v: function (s) { return s.desde || ''; } },
      { h: 'Causa', w: 26, v: function (s) { return s.inc.causa || ''; } },
      { h: 'Detalhe', w: 56, t: 'wrap', v: function (s) { return String(s.inc.detalhe || '').replace(/\s+/g, ' ').slice(0, 300); } },
      { h: 'TSK aberta', w: 19, t: 'bold', v: function (s) { return s.tsk ? s.tsk.osNumero : ''; } },
      { h: 'Status TSK', w: 13, v: function (s) { return s.tsk ? stInfo(s.tsk.status).l : ''; } },
      { h: 'Prioridade', w: 10, t: 'prio', v: function (s) { return s.tsk ? up(s.tsk.prioridade) : ''; } },
      { h: 'Vencimento', w: 17, t: 'data', v: function (s) { return s.tsk && s.tsk.vencimentoCalc ? toDate(s.tsk.vencimentoCalc) : ''; } },
      { h: 'Fila atual', w: 32, v: function (s) { return s.tsk ? (s.tsk.filaAtual || '') : ''; } },
      { h: 'Concentrador', w: 13, t: 'ctr', v: function (s) { return concDe({ end: s.end, site: s.sites[0] }) ? 'Sim' : ''; } }
    ];
    aba(nomeSites, 'Sites fora', carimbo + '   |   verde = com TSK aberta · vermelho = sem TSK (precisa abrir/acionar)', XL.verm, colsSites, sitesOrd, {
      linha: function (s) { return s.tsk ? { bg: XL.verdeBg, fg: XL.verde, bold: false, borda: XL.verde, fina: 'FFA9DFBF' } : { bg: XL.vermBg, fg: XL.vermFg, bold: true }; },
      celula: function (s, c) { if (c.h === 'Situação') return s.tsk ? { bg: XL.verde, fg: XL.branco, bold: true } : { bg: XL.verm, fg: XL.branco, bold: true }; return null; }
    });

    /* B2B */
    var b2bL = itens.filter(function (it) { return it.b2b && !it.pend; });
    aba(nomeB2B, 'B2B / Premium', carimbo, XL.roxo, colsTsk(true), b2bL, { linha: estiloLinhaTsk });

    /* Concentradores (cruzado com TSKs e incidentes) */
    var linConc = [];
    conc.forEach(function (c) {
      var key = up(c.endId || c.site); if (!key) return;
      function bate(a, b) { var ke = up(a), ks = up(b); return ke === key || ks === key || (key.length > 3 && (ke.indexOf(key) >= 0 || ks.indexOf(key) >= 0)); }
      var achou = false;
      model.items.forEach(function (it) { if (!it.pend && bate(it.end, it.site)) { achou = true; linConc.push({ c: c, tipo: 'TSK', ref: it.os, prio: it.prio, sit: sitDe(it, restOf(it, now)), quando: it.venc, regiao: regiaoLabel(it.regiao) }); } });
      (raw.incidentsEnriched || []).forEach(function (i) { if (up(i.statusTrat) !== 'RESOLVIDO' && bate(i.enderecoId || i.endId, i.site)) { achou = true; linConc.push({ c: c, tipo: 'Site fora', ref: i.site || '', prio: '', sit: i.causa || '', quando: toDate(i.horarioDt), regiao: regiaoLabel(i.regiao || 'OTHERS') }); } });
      if (!achou) linConc.push({ c: c, tipo: 'Sem alerta', ref: '', prio: '', sit: '', quando: '', regiao: '' });
    });
    aba(nomeConc, 'Concentradores — alertas ativos', carimbo, XL.roxo, [
      { h: 'Site', w: 20, t: 'bold', v: function (l) { return l.c.site || ''; } }, { h: 'END_ID', w: 16, v: function (l) { return l.c.endId || ''; } },
      { h: 'Anotação', w: 30, v: function (l) { return l.c.nota || ''; } }, { h: 'Tipo', w: 12, t: 'ctr', v: function (l) { return l.tipo; } },
      { h: 'TSK / Site fora', w: 22, v: function (l) { return l.ref; } }, { h: 'Prioridade', w: 10, t: 'prio', v: function (l) { return l.prio; } },
      { h: 'Situação / Causa', w: 30, v: function (l) { return l.sit; } }, { h: 'Vencimento / Desde', w: 17, t: 'data', v: function (l) { return l.quando; } }, { h: 'Região', w: 14, v: function (l) { return l.regiao; } }
    ], linConc, { linha: function (l) { return l.tipo === 'Sem alerta' ? null : { bg: l.tipo === 'Site fora' ? XL.vermBg : 'FFFFF3CD', fg: l.tipo === 'Site fora' ? XL.vermFg : 'FF92400E', bold: true, borda: l.tipo === 'Site fora' ? XL.verm : 'FFD68910', fina: l.tipo === 'Site fora' ? 'FFE08A93' : 'FFF2D48A' }; } });

    /* Por região (métricas) */
    var regs = {}; baseNP.forEach(function (it) { var o = regs[it.regiao] || (regs[it.regiao] = { n: 0, v: 0, h2: 0, ok: 0, su: 0, fora: 0, p: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 } }); o.n++; if (it._rest != null && it._rest < 0) o.v++; else if (it._rest != null && it._rest <= 120) o.h2++; else if (it._rest != null) o.ok++; if (semUpdH(it, now) > 4) o.su++; if (it.fora) o.fora++; if (o.p[it.prio] != null) o.p[it.prio]++; });
    var sitReg = {}; sites.forEach(function (s) { var o = sitReg[s.regiao] || (sitReg[s.regiao] = { t: 0, sem: 0 }); o.t++; if (!s.tsk) o.sem++; });
    var nomesReg = Object.keys(Object.assign({}, regs, sitReg)).sort(function (a, b) { return regiaoIdx(a) - regiaoIdx(b); });
    var linReg = nomesReg.map(function (r) { return { r: r, o: regs[r] || { n: 0, v: 0, h2: 0, ok: 0, su: 0, fora: 0, p: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 } }, s: sitReg[r] || { t: 0, sem: 0 } }; });
    aba(nomeReg, 'Métricas por região', carimbo + '   |   clique no nome da região para abrir o backlog dela', XL.azul, [
      { h: 'Região', w: 18, t: 'bold', v: function (l) { return regiaoLabel(l.r); }, link: function (l) { return abaRegiao[l.r]; } },
      { h: 'TSKs', w: 8, t: 'num', v: function (l) { return l.o.n; } }, { h: 'Vencidas', w: 10, t: 'num', v: function (l) { return l.o.v; } },
      { h: 'Vencem ≤2h', w: 11, t: 'num', v: function (l) { return l.o.h2; } }, { h: 'No prazo', w: 10, t: 'num', v: function (l) { return l.o.ok; } },
      { h: '% vencidas', w: 11, t: 'num', v: function (l) { return l.o.n ? Math.round(l.o.v / l.o.n * 1000) / 10 : 0; } },
      { h: 'Sem update +4h', w: 14, t: 'num', v: function (l) { return l.o.su; } },
      { h: 'P1', w: 6, t: 'num', v: function (l) { return l.o.p.P1; } }, { h: 'P2', w: 6, t: 'num', v: function (l) { return l.o.p.P2; } }, { h: 'P3', w: 6, t: 'num', v: function (l) { return l.o.p.P3; } },
      { h: 'P4', w: 6, t: 'num', v: function (l) { return l.o.p.P4; } }, { h: 'P5', w: 6, t: 'num', v: function (l) { return l.o.p.P5; } },
      { h: 'TSKs em site fora', w: 16, t: 'num', v: function (l) { return l.o.fora; } },
      { h: 'Sites fora', w: 11, t: 'num', v: function (l) { return l.s.t; } }, { h: 'Sites fora sem TSK', w: 17, t: 'num', v: function (l) { return l.s.sem; } }
    ], linReg, { celula: function (l, c, v) {
      if (c.h === '% vencidas') return v >= 50 ? { bg: XL.verm, fg: XL.branco, bold: true } : (v >= 25 ? { bg: XL.ambar, fg: XL.tinta, bold: true } : { bg: XL.verdeBg, fg: XL.verde, bold: true });
      if (c.h === 'Vencidas' && v > 0) return { fg: XL.verm, bold: true };
      if (c.h === 'Sites fora sem TSK' && v > 0) return { bg: XL.vermBg, fg: XL.vermFg, bold: true };
      return null; } });

    /* Por regra criadora */
    var rg = {}; baseNP.forEach(function (it) { var k = it.regra.nome || '(vazio)'; var o = rg[k] || (rg[k] = { nome: k, g: it.regra.grupo, n: 0, v: 0, h2: 0, b: 0 }); o.n++; if (it._rest != null && it._rest < 0) o.v++; else if (it._rest != null && it._rest <= 120) o.h2++; if (it.b2b) o.b++; });
    var linRg = Object.keys(rg).sort(function (a, b) { return rg[b].n - rg[a].n; }).map(function (k) { return rg[k]; });
    aba(nomeRg, 'Métricas por regra criadora (coluna DJ)', carimbo, XL.azul, [
      { h: 'Regra criadora (DJ)', w: 44, t: 'bold', v: function (o) { return o.nome; } },
      { h: 'Grupo', w: 18, t: 'ctr', v: function (o) { return o.g === 'FIXA' ? 'FIXA' : (o.g ? 'MÓVEL' : '(sem classificação)'); } },
      { h: 'TSKs', w: 8, t: 'num', v: function (o) { return o.n; } }, { h: 'Vencidas', w: 10, t: 'num', v: function (o) { return o.v; } },
      { h: 'Vencem ≤2h', w: 11, t: 'num', v: function (o) { return o.h2; } }, { h: 'B2B', w: 8, t: 'num', v: function (o) { return o.b; } }
    ], linRg, { celula: function (o, c, v) {
      if (c.h === 'Grupo') return o.g === 'FIXA' ? { bg: 'FFDCEBFA', fg: XL.azul, bold: true } : (o.g ? { bg: XL.verdeBg, fg: XL.verde, bold: true } : null);
      if (c.h === 'Vencidas' && v > 0) return { fg: XL.verm, bold: true };
      return null; } });

    /* ===== RESUMO: cartões + menu de botões ===== */
    var ws = wsRes, NC = 12;
    for (var ci = 1; ci <= NC; ci++) ws.getColumn(ci).width = 14;
    ws.mergeCells('A1:L1');
    var c1 = ws.getCell('A1'); c1.value = 'OPERAÇÃO TRJ — Resumo';
    c1.font = { name: 'Calibri', size: 22, bold: true, color: { argb: XL.branco } }; c1.fill = xFill(XL.navy); c1.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 42;
    ws.mergeCells('A2:L2'); ws.getCell('A2').fill = xFill(XL.laranja); ws.getRow(2).height = 5;
    ws.mergeCells('A3:L3'); var c3 = ws.getCell('A3'); c3.value = 'Gerado em ' + fmtDt(new Date()) + (savedAt ? '   ·   snapshot publicado em ' + fmtDt(new Date(savedAt)) : '');
    c3.font = { size: 10, color: { argb: XL.suave } }; c3.alignment = { indent: 1, vertical: 'middle' }; ws.getRow(3).height = 18;
    ws.mergeCells('A4:L4'); var c4 = ws.getCell('A4'); c4.value = 'Filtros aplicados:  ' + filtroTxt;
    c4.font = { size: 10, bold: true, color: { argb: XL.tinta } }; c4.alignment = { indent: 1, vertical: 'middle' }; ws.getRow(4).height = 18;

    var tot = baseNP.length;
    function cnt(fn) { return baseNP.filter(fn).length; }
    var nV = cnt(function (it) { return it._rest != null && it._rest < 0; }), n2 = cnt(function (it) { return it._rest != null && it._rest >= 0 && it._rest <= 120; });
    var nOk = cnt(function (it) { return it._rest != null && it._rest >= 0; }), nSU = cnt(function (it) { return semUpdH(it, now) > 4; });
    var nFx = cnt(function (it) { return it.regra.grupo === 'FIXA'; }), nMv = cnt(function (it) { return it.regra.grupo === 'MOVEL'; });
    var nB2B = cnt(function (it) { return it.b2b; }), nSemTsk = sites.filter(function (s) { return !s.tsk; }).length;
    var nConc = linConc.filter(function (l) { return l.tipo !== 'Sem alerta'; }).length, nForaTsk = cnt(function (it) { return it.fora; });
    function pct(n) { return tot ? (Math.round(n / tot * 1000) / 10).toLocaleString('pt-BR') + '% da fila' : ''; }
    function cartao(linha, col, rotulo, valor, cor, sub) {
      ws.mergeCells(linha, col, linha, col + 1); ws.mergeCells(linha + 1, col, linha + 1, col + 1); ws.mergeCells(linha + 2, col, linha + 2, col + 1);
      var a = ws.getCell(linha, col), b = ws.getCell(linha + 1, col), c = ws.getCell(linha + 2, col);
      a.value = rotulo.toUpperCase(); a.font = { size: 9, bold: true, color: { argb: XL.suave } }; a.alignment = { horizontal: 'center', vertical: 'middle' };
      b.value = valor; b.font = { size: 26, bold: true, color: { argb: cor } }; b.alignment = { horizontal: 'center', vertical: 'middle' };
      c.value = sub || ''; c.font = { size: 9, color: { argb: XL.suave } }; c.alignment = { horizontal: 'center', vertical: 'middle' };
      [a, b, c].forEach(function (x) { x.fill = xFill('FFF3F4F6'); });
      var tl = { style: 'thin', color: { argb: XL.linha } };
      for (var k = 0; k < 2; k++) {
        var b1 = { top: { style: 'thick', color: { argb: cor } } }, b2 = {}, b3 = { bottom: tl };
        if (k === 0) { b1.left = tl; b2.left = tl; b3.left = tl; } else { b1.right = tl; b2.right = tl; b3.right = tl; }
        ws.getCell(linha, col + k).border = b1; ws.getCell(linha + 1, col + k).border = b2; ws.getCell(linha + 2, col + k).border = b3;
      }
    }
    ws.getRow(5).height = 8;
    [6, 7, 8, 10, 11, 12].forEach(function (r, i) { ws.getRow(r).height = [20, 38, 18, 20, 38, 18][i]; });
    ws.getRow(9).height = 8;
    cartao(6, 1, 'TSKs na fila', tot, XL.navy, state.pend ? 'sem as pendenciadas' : '');
    cartao(6, 3, 'Vencidas', nV, XL.verm, pct(nV));
    cartao(6, 5, 'Vencem em até 2h', n2, 'FFD68910', pct(n2));
    cartao(6, 7, 'No prazo', nOk, XL.verde, pct(nOk));
    cartao(6, 9, 'Sem update +4h', nSU, 'FFB85A00', pct(nSU));
    cartao(6, 11, 'TSKs em site fora', nForaTsk, XL.verm, 'linhas vermelhas');
    cartao(10, 1, 'Sites fora', sites.length, XL.verm, nSemTsk + ' sem TSK');
    cartao(10, 3, 'Sites fora sem TSK', nSemTsk, XL.vermFg, 'abrir / acionar');
    cartao(10, 5, 'FIXA', nFx, XL.azul, pct(nFx));
    cartao(10, 7, 'MÓVEL', nMv, XL.verde, pct(nMv));
    cartao(10, 9, 'B2B / Premium', nB2B, XL.roxo, pct(nB2B));
    cartao(10, 11, 'Concentradores c/ alerta', nConc, XL.roxo, '');

    var r0 = 14;
    ws.mergeCells(r0, 1, r0, NC);
    var mh = ws.getCell(r0, 1); mh.value = 'MENU — clique no botão para ir à aba (cada aba tem o botão “← Voltar ao menu”)';
    mh.font = { size: 11, bold: true, color: { argb: XL.branco } }; mh.fill = xFill(XL.laranja); mh.alignment = { indent: 1, vertical: 'middle' }; ws.getRow(r0).height = 22;
    var menu = [
      [nomeFila, itens.length, 'Todas as TSKs filtradas, região por região — dentro do prazo no topo. Sites fora com TSK em vermelho.', XL.laranja],
      [nomeVenc, vencidas.length, 'Só as vencidas, da prioridade mais alta para a mais baixa.', XL.verm]
    ];
    regsComFila.forEach(function (r) {
      var l = porRegiao[r], nf = l.filter(function (it) { return it.fora; }).length;
      menu.push([abaRegiao[r], l.length, 'Backlog completo de ' + regiaoLabel(r) + (nf ? ' — ' + nf + ' TSK(s) em site fora (vermelho)' : '') + '.', XL.azul]);
    });
    menu.push([nomeSites, sites.length, 'Sites fora cruzados com a TSK aberta (verde = com TSK · vermelho = sem TSK).', XL.verm]);
    menu.push([nomeB2B, b2bL.length, 'TSKs B2B / Premium da fila.', XL.roxo]);
    menu.push([nomeConc, linConc.length, 'Concentradores e os alertas ativos neles.', XL.roxo]);
    menu.push([nomeReg, linReg.length, 'Métricas por região (com link para o backlog de cada uma).', XL.azul]);
    menu.push([nomeRg, linRg.length, 'Métricas por regra criadora (coluna DJ) — FIXA / MÓVEL.', XL.azul]);
    menu.forEach(function (m, i) {
      var r = r0 + 1 + i; ws.getRow(r).height = 25;
      ws.mergeCells(r, 1, r, 3); ws.mergeCells(r, 5, r, NC);
      var b = ws.getCell(r, 1); b.value = { text: '➜  ' + m[0], hyperlink: link(m[0]), tooltip: 'Ir para ' + m[0] };
      b.font = { size: 11, bold: true, color: { argb: XL.branco }, underline: false }; b.fill = xFill(m[3]); b.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      b.border = xBorda(XL.branco, 'medium');
      var n = ws.getCell(r, 4); n.value = m[1]; n.numFmt = '#,##0" linhas"'; n.font = { size: 10, bold: true, color: { argb: XL.tinta } }; n.alignment = { horizontal: 'center', vertical: 'middle' }; n.fill = xFill('FFF3F4F6');
      var d = ws.getCell(r, 5); d.value = m[2]; d.font = { size: 10, color: { argb: XL.suave } }; d.alignment = { vertical: 'middle', indent: 1, wrapText: true };
    });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    var buf = await wb.xlsx.writeBuffer();
    var d0 = new Date(), p2 = function (n) { return ('0' + n).slice(-2); };
    var nome = 'Operacao_TRJ_' + d0.getFullYear() + p2(d0.getMonth() + 1) + p2(d0.getDate()) + '_' + p2(d0.getHours()) + p2(d0.getMinutes()) + '.xlsx';
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    U.toast('Excel exportado — a aba “Resumo” tem o menu com atalhos.', 'ok');
  }

  /* ---------- render ---------- */
  var animTimer = null;
  /* escalona a entrada dos cartões, colunas e linhas (mesmo efeito do devGERAL) */
  function marcarIndices() {
    var ks = root.querySelectorAll('.op-kpi'), i;
    for (i = 0; i < ks.length; i++) ks[i].style.setProperty('--i', String(i));
    var cols = root.querySelectorAll('.op-col');
    for (i = 0; i < cols.length; i++) {
      cols[i].style.setProperty('--i', String(i));
      var rows = cols[i].querySelectorAll('.op-row,.op-srow');
      for (var j = 0; j < rows.length; j++) rows[j].style.setProperty('--i', String(Math.min(j, 14)));
    }
  }
  /* modo: true = atualização automática (sem animar a entrada; só os números "rolam") · 'lista' = anima só as colunas/linhas · omitido = entrada completa */
  function render(modo) {
    var quiet = modo === true;
    hideTip();
    var prevMap = null;
    if (state.tab === 'mapa' && TRJ._publicMapInstance) { try { prevMap = { c: TRJ._publicMapInstance.getCenter(), z: TRJ._publicMapInstance.getZoom() }; } catch (e) {} }
    root.innerHTML = '';
    clearTimeout(animTimer); root.classList.remove('op-anim'); root.classList.remove('op-anim-lista');
    if (!model) { root.appendChild(h('div', { class: 'op-loading', text: erroCarga || 'Carregando dados publicados...' })); renderSelBar(); return; }
    var now = Date.now();
    var f = filaAtual(now);
    var sitesTodos = sitesAtuais(), nSem = sitesTodos.filter(function (s) { return !s.tsk; }).length;
    var baseNP = f.base.filter(function (it) { return !it.pend; });
    var nVenc = baseNP.filter(function (it) { return it._rest != null && it._rest < 0; }).length;
    document.title = (nVenc ? '(' + nVenc + ') ' : '') + 'Operação TRJ';
    var b2b = baseNP.filter(function (it) { return it.b2b; }).length, bb = baseNP.filter(function (it) { return it.backbone; }).length, conc = concAlertas();

    root.appendChild(topBar());
    banners().forEach(function (b) { root.appendChild(b); });
    root.appendChild(tabs({ fila: f.filtrada.length, sites: sitesTodos.length, b2b: b2b, conc: raw.concentradores ? conc : null, backbone: bb }));

    if (state.tab === 'fila' || state.tab === 'sites') {
      var v2h = baseNP.filter(function (it) { return it._rest != null && it._rest >= 0 && it._rest <= 120; }).length;
      var prazo = baseNP.filter(function (it) { return it._rest != null && it._rest >= 0; }).length;
      var semUpd = baseNP.filter(function (it) { return semUpdH(it, now) > 4; }).length;
      root.appendChild(h('div', { class: 'op-kpis' }, [
        kpi(nVenc, 'Vencidas', COR.red, state.situacao === 'VENCIDAS', function () { setSit('VENCIDAS'); }),
        kpi(v2h, 'Vencem em até 2h', COR.amber, state.situacao === 'V2H', function () { setSit('V2H'); }),
        kpi(prazo, 'No prazo', COR.green, state.situacao === 'NO_PRAZO', function () { setSit('NO_PRAZO'); }),
        kpi(semUpd, 'Sem update +4h', COR.orange, state.situacao === 'SEMUPD', function () { setSit('SEMUPD'); }),
        kpi(sitesTodos.length, 'Sites fora', COR.red, state.tab === 'sites', function () { setTab(state.tab === 'sites' ? 'fila' : 'sites'); }, nSem + ' sem TSK'),
        kpi(b2b, 'B2B / Premium', COR.purple, false, function () { setTab('b2b'); }),
        kpi(raw.concentradores ? conc : '—', 'Concentradores', COR.purple, false, function () { setTab('conc'); })
      ]));
      root.appendChild(filtros(state.tab));
      view.listEl = h('div', { class: 'op-list' });
      root.appendChild(view.listEl);
      renderLista();
    } else if (state.tab === 'b2b' || state.tab === 'conc' || state.tab === 'backbone') {
      root.appendChild(filtros('outra'));
      var box = h('div'); root.appendChild(box);
      box.className = 'op-page';
      TRJ.pages.prioritarios(box, { categoria: state.tab, data: rawFiltrado(), app: { isPublic: true, refresh: function () { return carregarDados(false, true); }, render: function () {} } });
    } else if (state.tab === 'mapa') {
      var rota = view.rotaInicial; view.rotaInicial = null;
      if (rota) root.appendChild(h('div', { class: 'op-banner', style: { background: 'rgba(31,111,181,.12)', borderColor: 'rgba(31,111,181,.45)' }, text: '🧭 Rota calculada entre ' + rota.length + ' sites, na ordem selecionada: ' + rota.join(' → ') }));
      var mb = h('div', { class: 'op-page' }); root.appendChild(mb);
      TRJ.pages.mapa(mb, { data: raw, readOnly: true, rotaInicial: rota, prevCenter: !rota && prevMap ? prevMap.c : null, prevZoom: !rota && prevMap ? prevMap.z : null,
        mapaCoordMap: raw._mapaCoordMap || null, mapaMarkers: raw._mapaMarkersSlim || null, mapaMwData: raw._mapaMwData || null, mapaFoData: raw._mapaFoData || null });
    }
    refreshSelUI();
    if (!quiet && !REDUZIDO) {
      marcarIndices(); root.classList.add(modo === 'lista' ? 'op-anim-lista' : 'op-anim');
      animTimer = setTimeout(function () { root.classList.remove('op-anim'); root.classList.remove('op-anim-lista'); }, 1100);   // depois disso, listas redesenhadas (busca, "mostrar mais") não animam de novo
    }
    animarNumeros(root);
  }

  /* ---------- ciclo de atualização ---------- */
  TRJ.theme.mountToggle();
  TRJ.theme.onChange(function () { if (model) render(true); });
  setInterval(function () { carregarDados(true); }, POLL_MS);
  setInterval(function () {
    if (!model) return;
    if (state.tab === 'fila' || state.tab === 'sites') {
      var a = document.activeElement;
      if ((a && (a.classList.contains('op-search') || a.tagName === 'SELECT')) || view.pop || view.modal) { atualizarIdade(); return; }   // não interromper
      render(true);
    } else atualizarIdade();
  }, TICK_MS);
  abrirComCache();
  carregarDados(false);
})();
