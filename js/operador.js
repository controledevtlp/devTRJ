/* =====================================================================
 * operador.js — Visão do OPERADOR ("bateu o olho, sabe o que fazer")
 * ---------------------------------------------------------------------
 * Lê o MESMO snapshot do dashboard público (getDashboardSnapshot) e reaproveita as regras de
 * domínio do sistema (dedupPorTsk, corretiva, backlog, último update humano). Não altera nada
 * dos dashboards existentes e não cria backend novo.
 *
 * Abas: Fazer agora · Sites fora · B2B / Premium · Concentradores · Backbone / LD · Mapa
 * Filtros: regra criadora (FIXA / MÓVEL — coluna DJ), prioridade, situação, regiões (várias), busca.
 * Visão por região: cada região é um bloco (lado a lado quando há mais de uma).
 * Ctrl+clique em TSKs → "Calcular rota" abre o Mapa já com a rota. Exporta Excel com resumo/atalhos.
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
  var view = { pop: false, popReg: false, rotaInicial: null, rotaAtiva: false, novaRegra: false };
  var sel = [];            // seleção para rota: [{ key, os, end, site }] na ordem do clique
  var selMode = false;     // toque/sem Ctrl: cada clique seleciona

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
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast(msg || ('TSK ' + txt + ' copiada'), 'ok'); }, function () {});
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
      var novo = json.savedAt || null, mudou = novo !== lastSavedAt;
      lastSavedAt = novo; savedAt = novo;
      var d = json.data;
      raw.tasksEnriched = d.tasksEnriched || [];
      raw.incidentsEnriched = d.incidentsEnriched || [];
      raw.prazoMap = d.prazoMap || {};
      raw.concentradores = Array.isArray(d.concentradores) ? d.concentradores : null;
      prepararMapa(d);
      if (mudou || !loadedOnce) {
        erroCarga = null; buildModel(); loadedOnce = true;
        if (!(state.tab === 'mapa' && view.rotaAtiva)) render(); else atualizarIdade();   // não destrói a rota que está na tela
      } else atualizarIdade();
    } catch (e) {
      if (!loadedOnce) { erroCarga = 'Não foi possível carregar: ' + (e.message || e); render(); }
    }
  }
  function ls(key, val) { try { if (val) localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function lsGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function prepararMapa(d) {
    if (d.mapaCoordMap) { raw._mapaCoordMap = d.mapaCoordMap; ls('trj_coordMap', d.mapaCoordMap); } else raw._mapaCoordMap = lsGet('trj_coordMap');
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
    model = { items: items, byOs: byOs, byTsk: byTsk, openEnd: openEnd, sites: sites, temDJ: temDJ };
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
      if (upd.texto) out += '<div class="tx" style="margin:2px 0 4px">“' + esc(String(upd.texto).replace(/\s+/g, ' ').slice(0, 170)) + (String(upd.texto).length > 170 ? '…' : '') + '”</div>';
    } else out += ln('Último update', '<b style="color:' + COR.red + '">sem atualização do operador</b>');
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
    if (i >= 0) sel.splice(i, 1);
    else sel.push({ key: key, os: rowEl.getAttribute('data-os-sel') || '', end: rowEl.getAttribute('data-end') || '', site: rowEl.getAttribute('data-site') || '' });
    refreshSelUI();
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
    var cm = raw._mapaCoordMap || lsGet('trj_coordMap') || TRJ.defaultCoordMap || {}, idx = {};
    Object.keys(cm).forEach(function (k) { idx[k.toLowerCase()] = k; });
    return { cm: cm, idx: idx };
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
    state.tab = 'mapa'; saveState(); view.pop = view.popReg = false;
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
    if (view.popReg && !e.target.closest('.op-pop') && !e.target.closest('[data-pop]')) { view.popReg = false; fecha = true; }
    if (fecha) render();
  });

  /* ---------- componentes ---------- */
  function tag(txt, cor, title) { return h('span', { class: 'op-tag', style: { background: cor }, title: title || null, text: txt }); }

  function rowFila(it, now) {
    var rest = it._rest != null ? it._rest : restOf(it, now), cor = it.pend ? COR.purple : corTempo(rest), pct = pctPrazo(it, now);
    var tags = [];
    if (it.regra.grupo) tags.push(tag(it.regra.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL', it.regra.grupo === 'FIXA' ? COR.blue : COR.green, it.regra.nome));
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

  function kpi(valor, rotulo, cor, on, onclick, sub) {
    var b = h('button', { class: 'op-kpi' + (on ? ' on' : ''), type: 'button', onclick: onclick }, [
      h('div', { class: 'v', style: { color: cor }, text: String(valor) }), h('div', { class: 'l', text: rotulo }), sub ? h('div', { class: 's', text: sub }) : null
    ]);
    b.style.borderLeftColor = cor;
    return b;
  }
  function setSit(s) { state.situacao = state.situacao === s ? 'TODAS' : s; state.lim = {}; saveState(); state.tab = 'fila'; render(); }
  function setTab(t) { state.tab = t; saveState(); view.pop = view.popReg = false; if (t !== 'mapa') view.rotaAtiva = false; render(); }

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
        [label, n != null ? h('span', { class: 'n', text: String(n) }) : null]);
    }
    return h('div', { class: 'op-tabs' }, [t('fila', 'Fazer agora'), t('sites', 'Sites fora'), t('b2b', 'B2B / Premium'), t('conc', 'Concentradores'), t('backbone', 'Backbone / LD'), t('mapa', 'Mapa')]);
  }

  /* ---------- barra de filtros ---------- */
  function regioesDisponiveis() {
    var s = {}; model.items.forEach(function (it) { s[it.regiao] = 1; }); model.sites.forEach(function (x) { s[x.regiao] = 1; });
    return Object.keys(s).sort(function (a, b) { return regiaoIdx(a) - regiaoIdx(b); });
  }
  function filtros(tab) {
    var bar = h('div', { class: 'op-filters' });
    var comRegra = tab === 'fila' || tab === 'outra';
    if (comRegra) {
      bar.appendChild(h('div', { class: 'op-seg' }, [['TODAS', 'Todas', ''], ['FIXA', 'FIXA', 'fixa'], ['MOVEL', 'MÓVEL', 'movel']].map(function (g) {
        var on = !state.regras.length && state.grupo === g[0];
        return h('button', { type: 'button', class: (on ? 'on ' : '') + g[2], text: g[1], onclick: function () { state.grupo = g[0]; state.regras = []; state.lim = {}; saveState(); render(); } });
      })));
      bar.appendChild(h('button', { class: 'op-chip' + (state.regras.length ? ' on' : ''), type: 'button', dataset: { pop: '1' },
        text: 'Regras criadoras' + (state.regras.length ? ' (' + state.regras.length + ')' : '') + ' ▾',
        onclick: function (e) { e.stopPropagation(); view.pop = !view.pop; view.popReg = false; render(); } }));
      bar.appendChild(h('span', { class: 'op-sep' }));
      ['P1', 'P2', 'P3', 'P4', 'P5'].forEach(function (p) {
        bar.appendChild(h('button', { class: 'op-chip' + (state.prios.indexOf(p) >= 0 ? ' on' : ''), type: 'button', text: p, onclick: function () {
          var i = state.prios.indexOf(p); if (i >= 0) state.prios.splice(i, 1); else state.prios.push(p); state.lim = {}; saveState(); render(); } }));
      });
    }
    if (tab === 'fila') {
      bar.appendChild(h('span', { class: 'op-sep' }));
      var sit = h('select', { class: 'op-sel', title: 'Situação', onchange: function () { state.situacao = this.value; state.lim = {}; saveState(); render(); } },
        [['TODAS', 'Situação: todas'], ['NO_PRAZO', 'No prazo'], ['V2H', 'Vencem em até 2h'], ['VENCIDAS', 'Vencidas'], ['SEMUPD', 'Sem update há +4h']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      sit.value = state.situacao; bar.appendChild(sit);
      var ord = h('select', { class: 'op-sel', title: 'Ordenação dentro de cada região', onchange: function () { state.ordem = this.value; saveState(); render(); } },
        [['padrao', 'Ordem: P1→P5 (no prazo, depois vencidas)'], ['venc', 'Vencimento: vão vencer → vencidas'], ['recentes', 'Mais recentes']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      ord.value = state.ordem; bar.appendChild(ord);
    }
    // regiões (seleção múltipla)
    bar.appendChild(h('button', { class: 'op-chip' + (state.regioes.length ? ' on' : ''), type: 'button', dataset: { pop: '1' },
      text: 'Regiões' + (state.regioes.length ? ' (' + state.regioes.length + ')' : ': todas') + ' ▾',
      onclick: function (e) { e.stopPropagation(); view.popReg = !view.popReg; view.pop = false; render(); } }));
    if (tab !== 'outra') {
      var busca = h('input', { class: 'op-search', type: 'search', placeholder: '🔍 TSK, site, END_ID…', value: state.busca });
      busca.addEventListener('input', function () { state.busca = busca.value; state.lim = {}; renderLista(); });
      bar.appendChild(busca);
    }
    var extras = h('span', { class: 'op-extras' });
    if (tab === 'fila') {
      var lbl = h('label', { class: 'op-chip', style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, [h('input', { type: 'checkbox' }), h('span', { text: 'Pendenciadas' })]);
      var cb = lbl.querySelector('input'); cb.checked = !!state.pend;
      cb.addEventListener('change', function () { state.pend = cb.checked; state.lim = {}; saveState(); render(); });
      extras.appendChild(lbl);
    }
    if (tab !== 'outra') {
    var lado = h('label', { class: 'op-chip', title: 'Com 2 ou mais regiões, mostra uma ao lado da outra', style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, [h('input', { type: 'checkbox' }), h('span', { text: 'Lado a lado' })]);
    var cb2 = lado.querySelector('input'); cb2.checked = !!state.lado;
    cb2.addEventListener('change', function () { state.lado = cb2.checked; saveState(); render(); });
    extras.appendChild(lado);
    var selb = h('label', { class: 'op-chip', title: 'Para tela de toque: cada toque seleciona (no computador use Ctrl + clique)', style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, [h('input', { type: 'checkbox' }), h('span', { text: '☑ Selecionar p/ rota' })]);
    var cb3 = selb.querySelector('input'); cb3.checked = selMode;
    cb3.addEventListener('change', function () { selMode = cb3.checked; document.body.classList.toggle('op-selmode', selMode); });
    extras.appendChild(selb);
    }
    bar.appendChild(extras);
    if (view.pop && comRegra) bar.appendChild(popRegras());
    if (view.popReg) bar.appendChild(popRegioes());
    return bar;
  }

  function popRegioes() {
    var pop = h('div', { class: 'op-pop op-pop-sm' });
    var cont = {}; model.items.forEach(function (it) { if (state.pend || !it.pend) cont[it.regiao] = (cont[it.regiao] || 0) + 1; });
    pop.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('b', { text: 'Regiões' }),
      h('span', null, [
        h('button', { class: 'op-chip', type: 'button', text: 'todas', onclick: function () { state.regioes = []; state.lim = {}; saveState(); render(); } }), ' ',
        h('button', { class: 'op-chip on', type: 'button', text: 'fechar', onclick: function () { view.popReg = false; render(); } })])
    ]));
    regioesDisponiveis().forEach(function (r) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = state.regioes.indexOf(r) >= 0;
      cb.addEventListener('change', function () {
        var i = state.regioes.indexOf(r); if (cb.checked && i < 0) state.regioes.push(r); if (!cb.checked && i >= 0) state.regioes.splice(i, 1);
        state.lim = {}; saveState(); render();
      });
      pop.appendChild(h('label', null, [cb, h('span', { text: regiaoLabel(r) }), h('span', { class: 'c', text: String(cont[r] || 0) })]));
    });
    return pop;
  }

  function popRegras() {
    var pop = h('div', { class: 'op-pop' });
    var contagem = {}, semDJ = {};
    model.items.forEach(function (it) {
      var k = regraKey(it); contagem[k] = (contagem[k] || 0) + 1;
      if (!it.regra.grupo) { var n = it.regra.dj || '(vazio)'; semDJ[n] = (semDJ[n] || 0) + 1; }
    });
    function refaz() { buildModel(); state.lim = {}; saveState(); render(); }
    function toggle(k, on) { var i = state.regras.indexOf(k); if (on && i < 0) state.regras.push(k); if (!on && i >= 0) state.regras.splice(i, 1); state.lim = {}; saveState(); render(); }
    function grupo(g, titulo, cor, outro, outroTxt) {
      var lista = OP.regrasLista().filter(function (r) { return r.grupo === g; });
      var tot = lista.reduce(function (s, r) { return s + (contagem[r.nome] || 0); }, 0);
      pop.appendChild(h('h4', { style: { color: cor } }, [titulo + ' (' + tot + ')',
        h('button', { class: 'op-chip', type: 'button', text: 'marcar todas', onclick: function () { lista.forEach(function (r) { if (state.regras.indexOf(r.nome) < 0) state.regras.push(r.nome); }); saveState(); render(); } })]));
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
        h('button', { class: 'op-chip', type: 'button', text: 'limpar seleção', onclick: function () { state.regras = []; saveState(); render(); } }), ' ',
        h('button', { class: 'op-chip on', type: 'button', text: 'fechar', onclick: function () { view.pop = false; render(); } })])
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
      rodape.appendChild(h('button', { class: 'op-link', type: 'button', text: '+ incluir regra criadora', onclick: function () { view.novaRegra = true; render(); } }));
      if (OP.temAjustes()) rodape.appendChild(h('button', { class: 'op-link', type: 'button', text: 'restaurar padrão', onclick: function () { if (confirm('Desfazer todas as regras movidas/incluídas neste navegador?')) { OP.restaurarPadrao(); state.regras = []; refaz(); } } }));
    } else {
      var inp = h('input', { class: 'op-search', type: 'text', placeholder: 'Nome exatamente como na coluna DJ', style: { maxWidth: 'none', flex: '1' } });
      var gsel = h('select', { class: 'op-sel' }, [h('option', { value: 'MOVEL', text: 'MÓVEL' }), h('option', { value: 'FIXA', text: 'FIXA' })]);
      rodape.appendChild(h('div', { class: 'op-nova' }, [inp, gsel,
        h('button', { class: 'op-btn go', type: 'button', text: 'Adicionar', onclick: function () { if (OP.adicionar(inp.value, gsel.value)) { view.novaRegra = false; refaz(); } } }),
        h('button', { class: 'op-link', type: 'button', text: 'cancelar', onclick: function () { view.novaRegra = false; render(); } })]));
    }
    pop.appendChild(rodape);
    pop.appendChild(h('div', { class: 'op-sub', style: { whiteSpace: 'normal', marginTop: '6px' }, text: 'Os ajustes ficam salvos neste navegador. Para valer para toda a equipe, repita-os em js/operador-regras.js.' }));
    return pop;
  }

  /* ---------- listas por região ---------- */
  function blocoEl(titulo, resumo) {
    return h('div', { class: 'op-block' }, [h('div', { class: 'op-bh' }, [h('b', { text: titulo }), h('span', { class: 'r', html: resumo || '' })]), h('div', { class: 'op-bb' })]);
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
        var bl = blocoEl(regiaoLabel(b.regiao), '<span>' + b.lista.length + ' TSKs</span>' + (venc ? ' · <span style="color:' + COR.red + '">' + venc + ' vencidas</span>' : ''));
        var body = bl.lastChild, lim = state.lim[b.regiao] || PAGE, ultP = null;
        if (!b.lista.length) body.appendChild(h('div', { class: 'op-empty', style: { padding: '14px 0' }, text: 'Nada nesta região.' }));
        b.lista.slice(0, lim).forEach(function (it) {
          if (state.ordem === 'padrao') {
            var chave = it.pend ? 'PEND' : it.prio;
            if (chave !== ultP) {
              ultP = chave;
              var n = b.lista.filter(function (x) { return (x.pend ? 'PEND' : x.prio) === chave; }).length;
              body.appendChild(h('div', { class: 'op-ph', style: { color: it.pend ? COR.purple : (PRIO_COR[it.prio] || 'var(--trj-muted)') }, text: (it.pend ? 'PENDENCIADAS' : it.prio) + ' · ' + n }));
            }
          }
          body.appendChild(rowFila(it, now));
        });
        if (b.lista.length > lim) body.appendChild(h('button', { class: 'op-btn op-more', type: 'button', text: 'Mostrar mais (' + (b.lista.length - lim) + ')', onclick: function () { state.lim[b.regiao] = lim + PAGE; renderLista(); } }));
        wrap.appendChild(bl);
      });
      box.appendChild(wrap);
    } else if (state.tab === 'sites') {
      var ss = sitesAtuais();
      if (!ss.length) { box.appendChild(h('div', { class: 'op-empty', text: 'Nenhum site fora com esses filtros. 👏' })); return; }
      var porReg = {}; ss.forEach(function (s) { (porReg[s.regiao] = porReg[s.regiao] || []).push(s); });
      var regs = regioesBlocos(Object.keys(porReg)).filter(function (r) { return (porReg[r] || []).length; });
      var wrap2 = h('div', { class: 'op-blocks' + (state.lado && regs.length >= 2 ? ' cols' : '') });
      regs.forEach(function (r) {
        var lista = porReg[r];
        var com = lista.filter(function (s) { return s.tsk; }), sem = lista.filter(function (s) { return !s.tsk; });
        function ord(a, b) { return (a.desde ? a.desde.getTime() : 9e15) - (b.desde ? b.desde.getTime() : 9e15); }
        com.sort(ord); sem.sort(ord);
        var bl = blocoEl(regiaoLabel(r), '<span>' + lista.length + ' sites</span> · <span style="color:' + COR.red + '">' + sem.length + ' sem TSK</span>');
        var body = bl.lastChild, lim = state.lim['S' + r] || PAGE, usados = 0;
        function secao(titulo, cor, arr) {
          if (!arr.length || usados >= lim) return;
          body.appendChild(h('div', { class: 'op-ph', style: { color: cor }, text: titulo + ' · ' + arr.length }));
          arr.forEach(function (s) { if (usados < lim) { body.appendChild(rowSite(s, now)); usados++; } });
        }
        secao('Com TSK aberta', COR.green, com);            // sempre no topo
        secao('Sem TSK — abrir/acionar', COR.red, sem);     // e as sem TSK logo abaixo
        if (lista.length > usados) body.appendChild(h('button', { class: 'op-btn op-more', type: 'button', text: 'Mostrar mais (' + (lista.length - usados) + ')', onclick: function () { state.lim['S' + r] = lim + PAGE; renderLista(); } }));
        wrap2.appendChild(bl);
      });
      box.appendChild(wrap2);
    }
    refreshSelUI();
  }

  /* ---------- Excel (resumo + atalhos + dados cruzados) ---------- */
  function exportarExcel() {
    if (!window.XLSX) { U.toast('A biblioteca de Excel não carregou. Atualize a página.', 'err'); return; }
    var now = Date.now(), X = window.XLSX, wb = X.utils.book_new();
    var f = filaAtual(now), itens = [];
    f.blocos.forEach(function (b) { b.lista.forEach(function (it) { itens.push(it); }); });
    var base = f.base.filter(function (it) { return !it.pend; });
    var sites = sitesAtuais();
    var conc = raw.concentradores || [];
    var incAtivos = {}; sites.forEach(function (s) { incAtivos[up(s.end)] = s; });
    function concDe(it) {
      var k1 = up(it.end), k2 = up(it.site), hit = null;
      conc.forEach(function (c) { var key = up(c.endId || c.site); if (key && (key === k1 || key === k2)) hit = c; });
      return hit;
    }
    function sitDe(it, rest) { if (it.pend) return 'Pendenciada'; if (rest == null) return 'Sem prazo'; return rest < 0 ? 'Vencida' : (rest <= 120 ? 'Vence em até 2h' : 'No prazo'); }
    var NOMES = { resumo: 'Resumo', fila: 'Fazer agora', reg: 'Por região', regra: 'Por regra criadora', sites: 'Sites fora', b2b: 'B2B', conc: 'Concentradores', venc: 'Vencidas' };
    function link(sheet) { return '#\'' + sheet + '\'!A1'; }
    var DATA_FMT = 'dd/mm/yyyy hh:mm';

    function planilha(nome, titulo, cab, linhas, larguras, colData) {
      var aoa = [['← Voltar ao menu'], [titulo + ' — ' + linhas.length + ' linha(s)'], [], cab].concat(linhas);
      var ws = X.utils.aoa_to_sheet(aoa, { cellDates: true });
      ws['A1'] = { t: 's', v: '← Voltar ao menu', l: { Target: link(NOMES.resumo), Tooltip: 'Ir para o Resumo' } };
      ws['!cols'] = larguras.map(function (w) { return { wch: w }; });
      if (linhas.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + linhas.length, c: cab.length - 1 } }) };
      (colData || []).forEach(function (c) { for (var r = 4; r < 4 + linhas.length; r++) { var a = X.utils.encode_cell({ r: r, c: c }); if (ws[a] && ws[a].t === 'd') ws[a].z = DATA_FMT; } });
      return ws;
    }

    /* Fazer agora (cruzado: regra criadora, site fora, concentrador, B2B, update) */
    var cabFila = ['Região', 'Prioridade', 'TSK', 'Site', 'END_ID', 'Cidade', 'Falha', 'Status', 'Situação', 'Min. p/ vencer (neg.=atraso)', 'Vencimento', 'Criação', 'Regra criadora', 'Grupo', 'Fila atual', 'Último update', 'Sem update (h)', 'B2B', 'Site fora ativo', 'Concentrador', 'Obs. concentrador'];
    var linFila = itens.map(function (it) {
      var rest = restOf(it, now), c = concDe(it), sf = incAtivos[up(it.end)];
      var upd = (it.upd && it.upd.estado !== 'sem' && it.upd.dt) ? it.upd.dt : null;
      return [regiaoLabel(it.regiao), it.prio, it.os, it.site, it.end, it.cidade, it.falha, stInfo(it.t.status).l, sitDe(it, rest), rest, it.venc || '', it.criacao || '',
        it.regra.nome || '', it.regra.grupo ? (it.regra.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL') : '(sem classificação)', it.t.filaAtual || '', upd || '', upd ? Math.round(semUpdH(it, now) * 10) / 10 : '',
        it.b2b ? 'Sim' : 'Não', sf ? 'Sim (' + fmtDur((now - (sf.desde ? sf.desde.getTime() : now)) / 60000) + ')' : 'Não', c ? 'Sim' : 'Não', c ? (c.nota || '') : ''];
    });
    var wsFila = planilha(NOMES.fila, 'Fazer agora (filtros da tela aplicados)', cabFila, linFila, [14, 9, 18, 18, 14, 18, 22, 13, 15, 12, 17, 17, 34, 11, 32, 17, 11, 6, 16, 12, 22], [10, 11, 15]);

    /* Vencidas */
    var venc = itens.filter(function (it) { return !it.pend && it._rest != null && it._rest < 0; });
    var wsVenc = planilha(NOMES.venc, 'Somente vencidas', ['Região', 'Prioridade', 'TSK', 'Site', 'END_ID', 'Atraso (min)', 'Vencimento', 'Regra criadora', 'Grupo', 'Fila atual'],
      venc.map(function (it) { return [regiaoLabel(it.regiao), it.prio, it.os, it.site, it.end, -it._rest, it.venc, it.regra.nome || '', it.regra.grupo === 'FIXA' ? 'FIXA' : (it.regra.grupo ? 'MÓVEL' : ''), it.t.filaAtual || '']; }),
      [14, 9, 18, 18, 14, 12, 17, 34, 9, 32], [6]);

    /* Sites fora (cruzado com a TSK aberta) */
    var wsSites = planilha(NOMES.sites, 'Sites fora (filtro de região aplicado)', ['Região', 'Site(s)', 'END_ID', 'Cidade/UF', 'Fora há (min)', 'Causa', 'Detalhe', 'TSK aberta', 'Status TSK', 'Prioridade', 'Vencimento', 'Fila atual', 'Concentrador'],
      sites.slice().sort(function (a, b) { return (!!a.tsk - !!b.tsk) * -1 || ((a.desde ? a.desde.getTime() : 9e15) - (b.desde ? b.desde.getTime() : 9e15)); }).map(function (s) {
        var t = s.tsk, c = concDe({ end: s.end, site: s.sites[0] });
        return [regiaoLabel(s.regiao), s.sites.join(', '), s.end, s.inc.cidadeUf || s.inc.cidade || '', s.desde ? Math.round((now - s.desde.getTime()) / 60000) : '', s.inc.causa || '', String(s.inc.detalhe || '').replace(/\s+/g, ' ').slice(0, 300),
          t ? t.osNumero : 'SEM TSK', t ? stInfo(t.status).l : '', t ? up(t.prioridade) : '', t && t.vencimentoCalc ? toDate(t.vencimentoCalc) : '', t ? (t.filaAtual || '') : '', c ? 'Sim' : 'Não'];
      }), [14, 24, 14, 24, 12, 26, 50, 18, 14, 9, 17, 32, 12], [10]);

    /* B2B */
    var b2b = base.filter(function (it) { return it.b2b; });
    var wsB2B = planilha(NOMES.b2b, 'B2B / Premium', ['Região', 'Prioridade', 'TSK', 'Site', 'END_ID', 'Situação', 'Vencimento', 'Regra criadora', 'Fila atual'],
      b2b.map(function (it) { return [regiaoLabel(it.regiao), it.prio, it.os, it.site, it.end, sitDe(it, it._rest), it.venc, it.regra.nome || '', it.t.filaAtual || '']; }), [14, 9, 18, 18, 14, 15, 17, 34, 32], [6]);

    /* Concentradores (cruzado com TSKs e incidentes) */
    var linConc = [];
    conc.forEach(function (c) {
      var key = up(c.endId || c.site); if (!key) return;
      function bate(a, b) { var ke = up(a), ks = up(b); return ke === key || ks === key || (key.length > 3 && (ke.indexOf(key) >= 0 || ks.indexOf(key) >= 0)); }
      var achou = false;
      model.items.forEach(function (it) { if (!it.pend && bate(it.end, it.site)) { achou = true; linConc.push([c.site || '', c.endId || '', c.nota || '', 'TSK', it.os, it.prio, sitDe(it, restOf(it, now)), it.venc, regiaoLabel(it.regiao)]); } });
      (raw.incidentsEnriched || []).forEach(function (i) { if (up(i.statusTrat) !== 'RESOLVIDO' && bate(i.enderecoId || i.endId, i.site)) { achou = true; linConc.push([c.site || '', c.endId || '', c.nota || '', 'Site fora', i.site || '', '', i.causa || '', toDate(i.horarioDt), regiaoLabel(i.regiao || 'OTHERS')]); } });
      if (!achou) linConc.push([c.site || '', c.endId || '', c.nota || '', 'Sem alerta', '', '', '', '', '']);
    });
    var wsConc = planilha(NOMES.conc, 'Concentradores — alertas ativos', ['Site', 'END_ID', 'Anotação', 'Tipo', 'TSK / Site fora', 'Prioridade', 'Situação / Causa', 'Vencimento / Desde', 'Região'], linConc, [18, 16, 26, 11, 20, 10, 30, 17, 14], [7]);

    /* Por região (métricas) */
    var regs = {}; base.forEach(function (it) { var r = it.regiao; var o = regs[r] || (regs[r] = { n: 0, v: 0, h2: 0, ok: 0, su: 0, p: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 } }); o.n++; if (it._rest != null && it._rest < 0) o.v++; else if (it._rest != null && it._rest <= 120) o.h2++; else if (it._rest != null) o.ok++; if (semUpdH(it, now) > 4) o.su++; if (o.p[it.prio] != null) o.p[it.prio]++; });
    var sitReg = {}; sites.forEach(function (s) { var o = sitReg[s.regiao] || (sitReg[s.regiao] = { t: 0, sem: 0 }); o.t++; if (!s.tsk) o.sem++; });
    var nomesReg = Object.keys(Object.assign({}, regs, sitReg)).sort(function (a, b) { return regiaoIdx(a) - regiaoIdx(b); });
    var linReg = nomesReg.map(function (r) { var o = regs[r] || { n: 0, v: 0, h2: 0, ok: 0, su: 0, p: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 } }, s = sitReg[r] || { t: 0, sem: 0 };
      return [regiaoLabel(r), o.n, o.v, o.h2, o.ok, o.n ? Math.round(o.v / o.n * 1000) / 10 : 0, o.su, o.p.P1, o.p.P2, o.p.P3, o.p.P4, o.p.P5, s.t, s.sem]; });
    var wsReg = planilha(NOMES.reg, 'Métricas por região (fila filtrada, sem pendenciadas)', ['Região', 'TSKs', 'Vencidas', 'Vencem ≤2h', 'No prazo', '% vencidas', 'Sem update +4h', 'P1', 'P2', 'P3', 'P4', 'P5', 'Sites fora', 'Sites fora sem TSK'], linReg, [16, 8, 10, 11, 10, 11, 14, 6, 6, 6, 6, 6, 11, 17], []);

    /* Por regra criadora */
    var rg = {}; base.forEach(function (it) { var k = it.regra.nome || '(vazio)'; var o = rg[k] || (rg[k] = { g: it.regra.grupo, n: 0, v: 0, h2: 0, b: 0 }); o.n++; if (it._rest != null && it._rest < 0) o.v++; else if (it._rest != null && it._rest <= 120) o.h2++; if (it.b2b) o.b++; });
    var linRg = Object.keys(rg).sort(function (a, b) { return rg[b].n - rg[a].n; }).map(function (k) { var o = rg[k]; return [k, o.g === 'FIXA' ? 'FIXA' : (o.g ? 'MÓVEL' : '(sem classificação)'), o.n, o.v, o.h2, o.b]; });
    var wsRg = planilha(NOMES.regra, 'Métricas por regra criadora', ['Regra criadora (DJ)', 'Grupo', 'TSKs', 'Vencidas', 'Vencem ≤2h', 'B2B'], linRg, [42, 18, 8, 10, 11, 8], []);

    /* Resumo (menu com atalhos + métricas) */
    var tot = base.length, nV = base.filter(function (it) { return it._rest != null && it._rest < 0; }).length, n2 = base.filter(function (it) { return it._rest != null && it._rest >= 0 && it._rest <= 120; }).length;
    var nOk = base.filter(function (it) { return it._rest != null && it._rest >= 0; }).length, nSU = base.filter(function (it) { return semUpdH(it, now) > 4; }).length;
    var nFx = base.filter(function (it) { return it.regra.grupo === 'FIXA'; }).length, nMv = base.filter(function (it) { return it.regra.grupo === 'MOVEL'; }).length;
    var filtroTxt = [
      'Grupo: ' + (state.regras.length ? state.regras.length + ' regra(s) escolhida(s)' : (state.grupo === 'TODAS' ? 'todas' : (state.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL'))),
      'Regiões: ' + (state.regioes.length ? state.regioes.map(regiaoLabel).join(', ') : 'todas'),
      'Prioridades: ' + (state.prios.length ? state.prios.join(', ') : 'todas'),
      'Pendenciadas: ' + (state.pend ? 'incluídas' : 'fora')
    ].join('  |  ');
    var aoa = [
      ['OPERAÇÃO TRJ — Resumo'],
      ['Gerado em', new Date()], ['Snapshot publicado em', savedAt ? new Date(savedAt) : ''], ['Filtros aplicados', filtroTxt], [],
      ['MÉTRICAS (refletem os filtros)', 'Valor', '% da fila'],
      ['TSKs na fila', tot, ''], ['Vencidas', nV, tot ? Math.round(nV / tot * 1000) / 10 : 0], ['Vencem em até 2h', n2, tot ? Math.round(n2 / tot * 1000) / 10 : 0],
      ['No prazo (inclui as de até 2h)', nOk, tot ? Math.round(nOk / tot * 1000) / 10 : 0], ['Sem update há +4h', nSU, tot ? Math.round(nSU / tot * 1000) / 10 : 0],
      ['FIXA', nFx, tot ? Math.round(nFx / tot * 1000) / 10 : 0], ['MÓVEL', nMv, tot ? Math.round(nMv / tot * 1000) / 10 : 0],
      ['B2B / Premium', b2b.length, tot ? Math.round(b2b.length / tot * 1000) / 10 : 0],
      ['Sites fora', sites.length, ''], ['Sites fora sem TSK', sites.filter(function (s) { return !s.tsk; }).length, ''],
      ['Concentradores com alerta', linConc.filter(function (l) { return l[3] !== 'Sem alerta'; }).length, ''], [],
      ['MENU — clique para ir à aba', 'Linhas']
    ];
    var menu = [[NOMES.fila, linFila.length], [NOMES.venc, venc.length], [NOMES.reg, linReg.length], [NOMES.regra, linRg.length], [NOMES.sites, sites.length], [NOMES.b2b, b2b.length], [NOMES.conc, linConc.length]];
    var wsRes = X.utils.aoa_to_sheet(aoa.concat(menu), { cellDates: true });
    wsRes['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 12 }];
    ['B2', 'B3'].forEach(function (a) { if (wsRes[a]) wsRes[a].z = DATA_FMT; });
    menu.forEach(function (m, i) { var a = 'A' + (aoa.length + 1 + i); wsRes[a] = { t: 's', v: '➜ ' + m[0], l: { Target: link(m[0]), Tooltip: 'Ir para ' + m[0] } }; });

    X.utils.book_append_sheet(wb, wsRes, NOMES.resumo);
    X.utils.book_append_sheet(wb, wsFila, NOMES.fila);
    X.utils.book_append_sheet(wb, wsVenc, NOMES.venc);
    X.utils.book_append_sheet(wb, wsReg, NOMES.reg);
    X.utils.book_append_sheet(wb, wsRg, NOMES.regra);
    X.utils.book_append_sheet(wb, wsSites, NOMES.sites);
    X.utils.book_append_sheet(wb, wsB2B, NOMES.b2b);
    X.utils.book_append_sheet(wb, wsConc, NOMES.conc);
    var d = new Date(), p2 = function (n) { return ('0' + n).slice(-2); };
    X.writeFile(wb, 'Operacao_TRJ_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.xlsx', { cellDates: true });
    U.toast('Excel exportado — abra a aba “Resumo” para o menu.', 'ok');
  }

  /* ---------- render ---------- */
  function render() {
    hideTip();
    var prevMap = null;
    if (state.tab === 'mapa' && TRJ._publicMapInstance) { try { prevMap = { c: TRJ._publicMapInstance.getCenter(), z: TRJ._publicMapInstance.getZoom() }; } catch (e) {} }
    root.innerHTML = '';
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
      TRJ.pages.prioritarios(box, { categoria: state.tab, data: rawFiltrado(), app: { isPublic: true, refresh: function () { return carregarDados(false, true); }, render: function () {} } });
    } else if (state.tab === 'mapa') {
      var rota = view.rotaInicial; view.rotaInicial = null;
      if (rota) root.appendChild(h('div', { class: 'op-banner', style: { background: 'rgba(31,111,181,.12)', borderColor: 'rgba(31,111,181,.45)' }, text: '🧭 Rota calculada entre ' + rota.length + ' sites, na ordem selecionada: ' + rota.join(' → ') }));
      var mb = h('div'); root.appendChild(mb);
      TRJ.pages.mapa(mb, { data: raw, readOnly: true, rotaInicial: rota, prevCenter: !rota && prevMap ? prevMap.c : null, prevZoom: !rota && prevMap ? prevMap.z : null,
        mapaCoordMap: raw._mapaCoordMap || null, mapaMarkers: raw._mapaMarkersSlim || null, mapaMwData: raw._mapaMwData || null, mapaFoData: raw._mapaFoData || null });
    }
    refreshSelUI();
  }

  /* ---------- ciclo de atualização ---------- */
  TRJ.theme.mountToggle();
  TRJ.theme.onChange(function () { if (model) render(); });
  setInterval(function () { carregarDados(true); }, POLL_MS);
  setInterval(function () {
    if (!model) return;
    if (state.tab === 'fila' || state.tab === 'sites') {
      var a = document.activeElement;
      if ((a && (a.classList.contains('op-search') || a.tagName === 'SELECT')) || view.pop || view.popReg) { atualizarIdade(); return; }   // não interromper
      render();
    } else atualizarIdade();
  }, TICK_MS);
  carregarDados(false);
})();
