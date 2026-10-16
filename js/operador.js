/* =====================================================================
 * operador.js — Visão do OPERADOR ("bateu o olho, sabe o que fazer")
 * ---------------------------------------------------------------------
 * Lê o MESMO snapshot do dashboard público (getDashboardSnapshot) e reaproveita as regras de
 * domínio do sistema (dedupPorTsk, corretiva, backlog, último update humano). Não altera nada
 * dos dashboards existentes e não cria backend novo.
 *
 * Abas: Fazer agora (fila priorizada) · Sites fora · B2B & Concentradores · Mapa
 * Filtros: regra criadora (FIXA / MÓVEL — coluna DJ), prioridade, situação, região, busca.
 * Passar o mouse numa TSK mostra onde ela está (status, fila, pendência, movimentação).
 * ===================================================================== */
(function () {
  'use strict';
  var TRJ = window.TRJ, U = TRJ.ui, C = TRJ.constants, D = TRJ.domain, OP = TRJ.operador;
  var h = U.h, esc = U.esc;
  var URL_API = (TRJ.config && TRJ.config.APPS_SCRIPT_URL) || '';
  var root = document.getElementById('root'), tipEl = document.getElementById('op-tip');

  var LS_KEY = 'trj_operador_v1';
  var POLL_MS = 60000;      // consulta (leve) por snapshot novo
  var TICK_MS = 30000;      // atualiza os "vence em / atrasada há"
  var STALE_MIN = 20;       // avisa quando o snapshot está velho
  var PAGE = 80;            // linhas da fila renderizadas por vez
  var SEMKEY = '__SEM__';
  var COR = { red: '#c62839', amber: '#d68910', green: '#168a47', blue: '#1f6fb5', purple: '#7d3c98', gray: '#6b7280', orange: '#b85a00' };
  var PRIO_COR = { P1: '#c62839', P2: '#d35400', P3: '#b85a00', P4: '#1f6fb5', P5: '#6b7280' };

  var raw = { tasksEnriched: [], incidentsEnriched: [], concentradores: null };
  var savedAt = null, lastSavedAt = null, loadedOnce = false, erroCarga = null;
  var model = null;
  var firstSeen = {};            // osNumero -> instante em que apareceu (0 = já existia na 1ª carga)
  var view = { pop: false };

  /* ---------- estado dos filtros (lembrado no navegador) ---------- */
  var state = (function () {
    var d = { tab: 'fila', grupo: 'TODAS', regras: [], prios: [], situacao: 'TODAS', regiao: 'TODAS', ordem: 'tier', pend: false };
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (s) Object.keys(d).forEach(function (k) { if (s[k] !== undefined) d[k] = s[k]; }); } catch (e) {}
    d.busca = ''; d.limite = PAGE;
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
  function copiar(txt) {
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('TSK ' + txt + ' copiada', 'ok'); }, function () {});
  }

  /* ---------- carga do snapshot ---------- */
  async function carregarDados(silencioso, forcar) {
    if (!URL_API) { erroCarga = 'URL do Apps Script não configurada (js/config.js).'; render(); return; }
    try {
      // verificação leve: só baixa o snapshot (1–2 MB) quando há versão nova
      if (silencioso && !forcar && lastSavedAt) {
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
      var novo = json.savedAt || null;
      var mudou = novo !== lastSavedAt;
      lastSavedAt = novo; savedAt = novo;
      var d = json.data;
      raw.tasksEnriched = d.tasksEnriched || [];
      raw.incidentsEnriched = d.incidentsEnriched || [];
      raw.prazoMap = d.prazoMap || {};
      raw.concentradores = Array.isArray(d.concentradores) ? d.concentradores : null;
      prepararMapa(d);
      if (mudou || !loadedOnce) {
        erroCarga = null;
        buildModel();
        loadedOnce = true;
        render();
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

  /* ---------- modelo derivado (1x por snapshot) ---------- */
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
        regra: OP.classificar(t.isocDJ), b2b: ehB2B(t),
        upd: U.classificarUltimoBloco ? U.classificarUltimoBloco(t.motivoCancelamento) : { estado: 'sem', dt: null, texto: null }
      };
      if (!(it.os in firstSeen)) firstSeen[it.os] = loadedOnce ? now : 0;
      items.push(it); byOs[up(it.os)] = it;
    });

    // sites fora: um por END_ID (igual ao dashboard público)
    var grupos = {}, ordem = [];
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

  /* ---------- filtros ---------- */
  function regraKey(it) { return it.regra.grupo ? it.regra.nome : SEMKEY; }
  function passBase(it) {
    if (state.regras.length) { if (state.regras.indexOf(regraKey(it)) < 0) return false; }
    else if (state.grupo !== 'TODAS' && it.regra.grupo !== state.grupo) return false;
    if (state.regiao !== 'TODAS' && it.regiao !== state.regiao) return false;
    if (state.prios.length && state.prios.indexOf(it.prio) < 0) return false;
    return true;
  }
  function restOf(it, now) { return it.venc ? Math.round((it.venc.getTime() - now) / 60000) : null; }
  function semUpdH(it, now) {
    var ref = (it.upd && it.upd.estado !== 'sem' && it.upd.dt) ? it.upd.dt : it.criacao;
    return ref ? (now - ref.getTime()) / 3600000 : 0;
  }
  function corTempo(rest) {
    if (rest == null) return COR.gray;
    if (rest < 0) return COR.red;
    if (rest <= 120) return COR.amber;
    return COR.green;
  }
  function pctPrazo(it, now) {
    if (!it.venc || !it.criacao) return null;
    var tot = it.venc.getTime() - it.criacao.getTime(); if (tot <= 0) return 100;
    return Math.max(0, Math.min(100, (now - it.criacao.getTime()) / tot * 100));
  }

  /* Camadas da fila "Fazer agora": salvar o que ainda dá tempo (P1–P3) vem antes de tudo */
  var TIERS = {
    1: { t: 'P1–P3 no prazo — dá para salvar', cor: COR.green },
    2: { t: 'P1–P3 vencidas', cor: COR.red },
    3: { t: 'P4–P5 no prazo — vão vencer', cor: COR.blue },
    4: { t: 'P4–P5 vencidas', cor: COR.orange },
    5: { t: 'Sem prazo definido / preditiva', cor: COR.gray },
    6: { t: 'Pendenciadas (fora da nossa fila)', cor: COR.purple }
  };
  function tierOf(it, rest) {
    if (it.pend) return 6;
    if (rest == null) return 5;
    var alta = prioNum(it.prio) <= 3;
    return alta ? (rest >= 0 ? 1 : 2) : (rest >= 0 ? 3 : 4);
  }
  function ordenar(lista, now) {
    var ord = state.ordem;
    lista.forEach(function (it) { it._rest = restOf(it, now); it._tier = tierOf(it, it._rest); });
    function restKey(it) { return it._rest == null ? 9e9 : it._rest; }
    lista.sort(function (a, b) {
      if (ord === 'venc') return restKey(a) - restKey(b);
      if (ord === 'prio') return (prioNum(a.prio) - prioNum(b.prio)) || (restKey(a) - restKey(b));
      if (ord === 'recentes') return ((b.criacao ? b.criacao.getTime() : 0) - (a.criacao ? a.criacao.getTime() : 0));
      // 'tier' (padrão)
      if (a._tier !== b._tier) return a._tier - b._tier;
      if (a._tier === 1 || a._tier === 3) return restKey(a) - restKey(b);             // o que vence primeiro
      if (a._tier === 2 || a._tier === 4) return (prioNum(a.prio) - prioNum(b.prio)) || (restKey(a) - restKey(b));
      return (prioNum(a.prio) - prioNum(b.prio)) || ((a.criacao ? a.criacao.getTime() : 0) - (b.criacao ? b.criacao.getTime() : 0));
    });
    return lista;
  }
  function filaAtual(now) {
    var base = model.items.filter(passBase).filter(function (it) { return state.pend || !it.pend; });
    var q = up(state.busca);
    var lista = base.filter(function (it) {
      if (q && (up(it.os) + ' ' + up(it.site) + ' ' + up(it.end) + ' ' + up(it.cidade)).indexOf(q) < 0) return false;
      var rest = restOf(it, now);
      switch (state.situacao) {
        case 'VENCIDAS': return !it.pend && rest != null && rest < 0;
        case 'V2H': return !it.pend && rest != null && rest >= 0 && rest <= 120;
        case 'NO_PRAZO': return !it.pend && rest != null && rest >= 0;
        case 'SEMUPD': return !it.pend && semUpdH(it, now) > 4;
        default: return true;
      }
    });
    return { base: base, lista: ordenar(lista, now) };
  }
  function sitesAtuais() {
    var q = up(state.busca);
    return model.sites.filter(function (s) {
      if (state.regiao !== 'TODAS' && s.regiao !== state.regiao) return false;
      if (q && (up(s.end) + ' ' + up(s.sites.join(' ')) + ' ' + up(s.inc.cidade || s.inc.cidadeUf)).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      if (!!a.tsk !== !!b.tsk) return a.tsk ? 1 : -1;                     // sem TSK primeiro
      return (a.desde ? a.desde.getTime() : 9e15) - (b.desde ? b.desde.getTime() : 9e15);   // há mais tempo fora primeiro
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
    'INICIADO': { l: 'INICIADO', cor: COR.green },
    'NAO INICIADO': { l: 'NÃO INICIADO', cor: COR.orange },
    'PENDENTE': { l: 'PENDENCIADA', cor: COR.purple },
    'CONCLUIDA': { l: 'CONCLUÍDA', cor: COR.blue },
    'CANCELADA': { l: 'CANCELADA', cor: COR.gray }
  };
  function stInfo(status) { return ST_INFO[D.normalize(status)] || { l: String(status || '—').toUpperCase(), cor: COR.gray }; }
  function ln(k, v) { return '<div class="ln"><span>' + k + '</span><span>' + v + '</span></div>'; }
  function tipHtml(os) {
    var rows = model.byTsk[up(os)];
    if (!rows || !rows.length) return '<b>' + esc(os) + '</b><div class="tx">Sem detalhes no snapshot.</div>';
    var t = rows[0], it = model.byOs[up(os)], si = stInfo(t.status), now = Date.now();
    var reg = OP.classificar(t.isocDJ);
    var criacao = D.parsePlatformDate(t.dataCriacaoAS) || toDate(t.dataCriacao);
    var venc = toDate(t.vencimentoCalc);
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
    // pendência: trecho do formulário de tramitação/suspensão
    var bg = String(t.motivoCancelamento || '');
    var m = /TRAMITA[ÇC][ÃA]O OU SUSPENS[ÃA]O:/i.exec(bg);
    if (m && (D.normalize(t.status) === 'PENDENTE' || rows.some(function (r) { return D.normalize(r.status) === 'PENDENTE'; }))) {
      out += ln('Pendência', esc(bg.slice(m.index, m.index + 200).replace(/\s+/g, ' ')) + '…');
    }
    // movimentação: últimas linhas da mesma TSK (do mais antigo ao mais novo)
    var mv = [], ult = '';
    rows.slice(0, 6).reverse().forEach(function (r) {
      var s = stInfo(r.status).l + ' → ' + String(r.filaAtual || '—').slice(0, 34);
      if (s !== ult) { mv.push(s); ult = s; }
    });
    if (mv.length > 1) out += '<div class="mv"><b>Movimentação:</b><br>' + mv.map(esc).join('<br>') + '</div>';
    return out;
  }
  var tipFor = null;
  function showTip(el) {
    if (!model) return;
    var os = el.getAttribute('data-os'); if (!os) return;
    tipFor = el; tipEl.innerHTML = tipHtml(os); tipEl.style.display = 'block';
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(tipEl);   // tema claro: ajusta já, sem esperar o observador
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
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-os]') : null;
    if (el) { copiar(el.getAttribute('data-os')); showTip(el); }
    else { hideTip(); if (view.pop && !e.target.closest('.op-pop') && !e.target.closest('[data-pop]')) { view.pop = false; render(); } }
  });
  window.addEventListener('scroll', hideTip, true);

  /* ---------- componentes de tela ---------- */
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
    var row = h('div', { class: 'op-row' }, [
      h('span', { class: 'op-p', style: { color: PRIO_COR[it.prio] || 'var(--trj-fg)' }, text: it.prio }),
      h('div', { style: { minWidth: 0 } }, [
        h('span', { class: 'op-tsk', dataset: { os: it.os }, text: it.os }), tags,
        h('span', { class: 'op-sub', html: '<b>' + esc(it.site || '—') + '</b> · ' + esc(it.end || '—') + (it.cidade ? ' · ' + esc(it.cidade) : '') + (it.falha ? ' · ' + esc(it.falha) : '') })
      ]),
      h('div', { class: 'op-bar', title: pct == null ? '' : Math.round(pct) + '% do prazo consumido' }, pct == null ? null : h('i', { style: { width: pct.toFixed(0) + '%', background: cor } })),
      h('div', { class: 'op-time', style: { color: cor }, text: tempo })
    ]);
    row.style.setProperty('--rc', cor);
    return row;
  }

  function kpi(valor, rotulo, cor, on, onclick) {
    var b = h('button', { class: 'op-kpi' + (on ? ' on' : ''), type: 'button', onclick: onclick }, [
      h('div', { class: 'v', style: { color: cor }, text: String(valor) }), h('div', { class: 'l', text: rotulo })
    ]);
    b.style.borderLeftColor = cor;
    return b;
  }
  function setSit(s) { state.situacao = state.situacao === s ? 'TODAS' : s; state.limite = PAGE; saveState(); state.tab = 'fila'; render(); }
  function setTab(t) { state.tab = t; saveState(); view.pop = false; render(); }

  function topBar() {
    var idade = savedAt ? Math.round((Date.now() - new Date(savedAt).getTime()) / 60000) : null;
    var velho = idade != null && idade > STALE_MIN;
    return h('div', { class: 'op-top' }, [
      h('div', { class: 'op-title' }, [h('img', { src: 'assets/logo-trj.png', alt: '' }), h('span', { text: 'OPERAÇÃO TRJ' })]),
      h('div', { class: 'op-live' }, [
        h('span', { class: 'op-dot' + (velho ? ' stale' : '') }),
        h('span', { id: 'op-age', text: savedAt ? ('Atualizado há ' + fmtDur(idade) + ' · ' + fmtDt(new Date(savedAt))) : 'Dados publicados' }),
        h('button', { class: 'op-btn', type: 'button', text: '↻ Atualizar', onclick: function () { carregarDados(false, true); } }),
        h('button', { class: 'op-btn', type: 'button', text: document.body.classList.contains('op-tv') ? '✕ Sair do modo TV' : '📺 Modo TV', onclick: toggleTV })
      ])
    ]);
  }
  function atualizarIdade() {
    var el = document.getElementById('op-age'); if (!el || !savedAt) return;
    var idade = Math.round((Date.now() - new Date(savedAt).getTime()) / 60000);
    el.textContent = 'Atualizado há ' + fmtDur(idade) + ' · ' + fmtDt(new Date(savedAt));
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
      if (sem) out.push(h('div', { class: 'op-banner', text: 'ℹ ' + sem + ' TSK(s) com regra criadora não reconhecida (ou vazia). Veja em “Regras criadoras” → “Sem classificação”.' }));
    }
    return out;
  }

  function tabs(nFila, nSites) {
    function t(id, label, n) {
      return h('button', { class: 'op-tab' + (state.tab === id ? ' active' : ''), type: 'button', onclick: function () { setTab(id); } },
        [label, n != null ? h('span', { class: 'n', text: String(n) }) : null]);
    }
    return h('div', { class: 'op-tabs' }, [t('fila', 'Fazer agora', nFila), t('sites', 'Sites fora', nSites), t('prio', 'B2B & Concentradores'), t('mapa', 'Mapa')]);
  }

  /* ---------- barra de filtros ---------- */
  function regioesDisponiveis() {
    var s = {}; model.items.forEach(function (it) { s[it.regiao] = 1; }); model.sites.forEach(function (x) { s[x.regiao] = 1; });
    return Object.keys(s).sort();
  }
  function filtros(tab) {
    var bar = h('div', { class: 'op-filters' });
    if (tab === 'fila') {
      var seg = h('div', { class: 'op-seg' }, [['TODAS', 'Todas', ''], ['FIXA', 'FIXA', 'fixa'], ['MOVEL', 'MÓVEL', 'movel']].map(function (g) {
        var on = !state.regras.length && state.grupo === g[0];
        return h('button', { type: 'button', class: (on ? 'on ' : '') + g[2], text: g[1], onclick: function () { state.grupo = g[0]; state.regras = []; state.limite = PAGE; saveState(); render(); } });
      }));
      bar.appendChild(seg);
      bar.appendChild(h('button', { class: 'op-chip' + (state.regras.length ? ' on' : ''), type: 'button', dataset: { pop: '1' },
        text: 'Regras criadoras' + (state.regras.length ? ' (' + state.regras.length + ')' : '') + ' ▾',
        onclick: function (e) { e.stopPropagation(); view.pop = !view.pop; render(); } }));
      bar.appendChild(h('span', { class: 'op-sep' }));
      ['P1', 'P2', 'P3', 'P4', 'P5'].forEach(function (p) {
        bar.appendChild(h('button', { class: 'op-chip' + (state.prios.indexOf(p) >= 0 ? ' on' : ''), type: 'button', text: p, onclick: function () {
          var i = state.prios.indexOf(p); if (i >= 0) state.prios.splice(i, 1); else state.prios.push(p); state.limite = PAGE; saveState(); render(); } }));
      });
      bar.appendChild(h('span', { class: 'op-sep' }));
      var sit = h('select', { class: 'op-sel', title: 'Situação', onchange: function () { state.situacao = this.value; state.limite = PAGE; saveState(); render(); } },
        [['TODAS', 'Situação: todas'], ['NO_PRAZO', 'No prazo'], ['V2H', 'Vencem em até 2h'], ['VENCIDAS', 'Vencidas'], ['SEMUPD', 'Sem update há +4h']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      sit.value = state.situacao; bar.appendChild(sit);
      var ord = h('select', { class: 'op-sel', title: 'Ordenação', onchange: function () { state.ordem = this.value; saveState(); render(); } },
        [['tier', 'Ordem: Fazer agora'], ['venc', 'Vencimento (mais próximo)'], ['prio', 'Prioridade'], ['recentes', 'Mais recentes']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      ord.value = state.ordem; bar.appendChild(ord);
    }
    var reg = h('select', { class: 'op-sel', title: 'Região', onchange: function () { state.regiao = this.value; saveState(); render(); } },
      [h('option', { value: 'TODAS', text: 'Região: todas' })].concat(regioesDisponiveis().map(function (r) { return h('option', { value: r, text: regiaoLabel(r) }); })));
    reg.value = state.regiao; bar.appendChild(reg);
    var busca = h('input', { class: 'op-search', type: 'search', placeholder: '🔍 TSK, site, END_ID…', value: state.busca });
    busca.addEventListener('input', function () { state.busca = busca.value; state.limite = PAGE; renderLista(); });
    bar.appendChild(busca);
    if (tab === 'fila') {
      var lbl = h('label', { class: 'op-chip', style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, [
        h('input', { type: 'checkbox' }), h('span', { text: 'Incluir pendenciadas' })]);
      var cb = lbl.querySelector('input'); cb.checked = !!state.pend;
      cb.addEventListener('change', function () { state.pend = cb.checked; state.limite = PAGE; saveState(); render(); });
      bar.appendChild(lbl);
    }
    if (view.pop && tab === 'fila') bar.appendChild(popRegras());
    return bar;
  }

  function popRegras() {
    var pop = h('div', { class: 'op-pop' });
    var contagem = {}, semDJ = {};
    model.items.forEach(function (it) {
      var k = regraKey(it); contagem[k] = (contagem[k] || 0) + 1;
      if (!it.regra.grupo) { var n = it.regra.dj || '(vazio)'; semDJ[n] = (semDJ[n] || 0) + 1; }
    });
    function toggle(k, on) { var i = state.regras.indexOf(k); if (on && i < 0) state.regras.push(k); if (!on && i >= 0) state.regras.splice(i, 1); state.limite = PAGE; saveState(); render(); }
    function grupo(g, titulo, cor) {
      var lista = OP.regrasLista().filter(function (r) { return r.grupo === g; });
      var tot = lista.reduce(function (s, r) { return s + (contagem[r.nome] || 0); }, 0);
      pop.appendChild(h('h4', { style: { color: cor } }, [titulo + ' (' + tot + ')',
        h('button', { class: 'op-chip', type: 'button', text: 'marcar todas', onclick: function () { lista.forEach(function (r) { if (state.regras.indexOf(r.nome) < 0) state.regras.push(r.nome); }); saveState(); render(); } })]));
      lista.forEach(function (r) {
        var cb = h('input', { type: 'checkbox' }); cb.checked = state.regras.indexOf(r.nome) >= 0;
        cb.addEventListener('change', function () { toggle(r.nome, cb.checked); });
        pop.appendChild(h('label', null, [cb, h('span', { text: r.nome }), h('span', { class: 'c', text: String(contagem[r.nome] || 0) })]));
      });
    }
    pop.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('b', { text: 'Regra criadora (coluna DJ)' }),
      h('span', null, [
        h('button', { class: 'op-chip', type: 'button', text: 'limpar seleção', onclick: function () { state.regras = []; saveState(); render(); } }), ' ',
        h('button', { class: 'op-chip on', type: 'button', text: 'fechar', onclick: function () { view.pop = false; render(); } })])
    ]));
    grupo('FIXA', 'FIXA', COR.blue);
    grupo('MOVEL', 'MÓVEL', COR.green);
    var nSem = contagem[SEMKEY] || 0;
    pop.appendChild(h('h4', { style: { color: COR.gray } }, ['Sem classificação (' + nSem + ')']));
    var cb2 = h('input', { type: 'checkbox' }); cb2.checked = state.regras.indexOf(SEMKEY) >= 0;
    cb2.addEventListener('change', function () { toggle(SEMKEY, cb2.checked); });
    pop.appendChild(h('label', null, [cb2, h('span', { text: 'Regra vazia ou não reconhecida' }), h('span', { class: 'c', text: String(nSem) })]));
    var nomes = Object.keys(semDJ).sort(function (a, b) { return semDJ[b] - semDJ[a]; }).slice(0, 12);
    if (nomes.length) pop.appendChild(h('div', { class: 'op-sub', style: { whiteSpace: 'normal', marginTop: '4px' }, text: 'Valores encontrados: ' + nomes.map(function (n) { return n + ' (' + semDJ[n] + ')'; }).join(' · ') + ' — para classificar, edite js/operador-regras.js.' }));
    return pop;
  }

  /* ---------- listas ---------- */
  function renderLista() {
    if (!view.listEl || !model) return;
    var now = Date.now(), box = view.listEl; box.innerHTML = '';
    if (state.tab === 'fila') {
      var f = filaAtual(now), lista = f.lista;
      if (!lista.length) { box.appendChild(h('div', { class: 'op-empty', text: 'Nada na fila com esses filtros. 👏' })); return; }
      var lastTier = null, n = Math.min(lista.length, state.limite), cont = {};
      lista.forEach(function (it) { cont[it._tier] = (cont[it._tier] || 0) + 1; });
      for (var i = 0; i < n; i++) {
        var it = lista[i];
        if (state.ordem === 'tier' && it._tier !== lastTier) {
          lastTier = it._tier;
          box.appendChild(h('div', { class: 'op-tier', style: { color: TIERS[it._tier].cor } }, [TIERS[it._tier].t, h('span', { class: 'n', style: { background: TIERS[it._tier].cor }, text: String(cont[it._tier]) })]));
        }
        box.appendChild(rowFila(it, now));
      }
      if (lista.length > n) box.appendChild(h('button', { class: 'op-btn op-more', type: 'button', text: 'Mostrar mais (' + (lista.length - n) + ' restantes)', onclick: function () { state.limite += PAGE; renderLista(); } }));
    } else if (state.tab === 'sites') {
      var ss = sitesAtuais();
      if (!ss.length) { box.appendChild(h('div', { class: 'op-empty', text: 'Nenhum site fora com esses filtros. 👏' })); return; }
      var semT = ss.filter(function (s) { return !s.tsk; }).length, mostrou = 0, lastSem = null;
      ss.slice(0, state.limite).forEach(function (s) {
        var chave = s.tsk ? 'com' : 'sem';
        if (chave !== lastSem) {
          lastSem = chave;
          box.appendChild(h('div', { class: 'op-tier', style: { color: chave === 'sem' ? COR.red : COR.green } }, [chave === 'sem' ? 'Sem TSK — abrir/acionar' : 'Com TSK aberta', h('span', { class: 'n', style: { background: chave === 'sem' ? COR.red : COR.green }, text: String(chave === 'sem' ? semT : ss.length - semT) })]));
        }
        box.appendChild(rowSite(s, now)); mostrou++;
      });
      if (ss.length > mostrou) box.appendChild(h('button', { class: 'op-btn op-more', type: 'button', text: 'Mostrar mais (' + (ss.length - mostrou) + ' restantes)', onclick: function () { state.limite += PAGE; renderLista(); } }));
    }
  }
  function rowSite(s, now) {
    var cor = s.tsk ? COR.green : COR.red;
    var dur = s.desde ? fmtDur((now - s.desde.getTime()) / 60000) : (s.inc.downtime || '—');
    var tskEl = s.tsk
      ? h('span', null, [h('span', { class: 'op-tsk', dataset: { os: s.tsk.osNumero }, text: s.tsk.osNumero }), tag(stInfo(s.tsk.status).l, stInfo(s.tsk.status).cor)])
      : h('span', { style: { color: COR.red, fontWeight: '800' }, text: 'SEM TSK' });
    var det = String(s.inc.detalhe || '').replace(/\s+/g, ' ').trim();
    var row = h('div', { class: 'op-srow' }, [
      h('div', { class: 'op-sdur', text: dur }),
      h('div', { style: { minWidth: 0 } }, [
        h('b', { text: s.sites.join(', ') || '—' }), s.qtd > 1 ? tag('+' + (s.qtd - 1), COR.gray, s.qtd + ' sites neste END_ID') : null,
        h('span', { class: 'op-sub', text: (s.end || '—') + ' · ' + (s.inc.cidadeUf || s.inc.cidade || '—') + ' · ' + regiaoLabel(s.regiao) })
      ]),
      h('div', { class: 'op-col3', style: { minWidth: 0 } }, [
        h('div', { style: { fontSize: '12px', fontWeight: '700' }, text: s.inc.causa || '—' }),
        h('span', { class: 'op-sub', text: det ? det.slice(0, 90) + (det.length > 90 ? '…' : '') : 'sem detalhe' })
      ]),
      h('div', { style: { textAlign: 'right' } }, tskEl)
    ]);
    row.style.setProperty('--rc', cor);
    return row;
  }

  /* ---------- render ---------- */
  function render() {
    hideTip();
    var prevMap = null;
    if (state.tab === 'mapa' && TRJ._publicMapInstance) { try { prevMap = { c: TRJ._publicMapInstance.getCenter(), z: TRJ._publicMapInstance.getZoom() }; } catch (e) {} }
    root.innerHTML = '';
    if (!model) { root.appendChild(h('div', { class: 'op-loading', text: erroCarga || 'Carregando dados publicados...' })); return; }
    var now = Date.now();
    var f = filaAtual(now);
    var nSites = sitesAtuais().filter(function (s) { return !s.tsk; }).length;
    document.title = (f.base.filter(function (it) { var r = restOf(it, now); return !it.pend && r != null && r < 0; }).length ? '(' + f.base.filter(function (it) { var r = restOf(it, now); return !it.pend && r != null && r < 0; }).length + ') ' : '') + 'Operação TRJ';

    root.appendChild(topBar());
    banners().forEach(function (b) { root.appendChild(b); });
    root.appendChild(tabs(f.lista.length, nSites));

    if (state.tab === 'fila' || state.tab === 'sites') {
      // contadores (respeitam FIXA/MÓVEL, prioridade e região; não a "situação")
      var base = f.base.filter(function (it) { return !it.pend; });
      var venc = base.filter(function (it) { var r = restOf(it, now); return r != null && r < 0; }).length;
      var v2h = base.filter(function (it) { var r = restOf(it, now); return r != null && r >= 0 && r <= 120; }).length;
      var prazo = base.filter(function (it) { var r = restOf(it, now); return r != null && r >= 0; }).length;
      var semUpd = base.filter(function (it) { return semUpdH(it, now) > 4; }).length;
      var b2b = base.filter(function (it) { return it.b2b; }).length;
      var conc = concAlertas();
      root.appendChild(h('div', { class: 'op-kpis' }, [
        kpi(venc, 'Vencidas', COR.red, state.situacao === 'VENCIDAS', function () { setSit('VENCIDAS'); }),
        kpi(v2h, 'Vencem em até 2h', COR.amber, state.situacao === 'V2H', function () { setSit('V2H'); }),
        kpi(prazo, 'No prazo', COR.green, state.situacao === 'NO_PRAZO', function () { setSit('NO_PRAZO'); }),
        kpi(semUpd, 'Sem update +4h', COR.orange, state.situacao === 'SEMUPD', function () { setSit('SEMUPD'); }),
        kpi(nSites, 'Sites fora sem TSK', COR.red, state.tab === 'sites', function () { setTab(state.tab === 'sites' ? 'fila' : 'sites'); }),
        kpi(b2b, 'B2B / Premium', COR.purple, false, function () { setTab('prio'); }),
        kpi(raw.concentradores ? conc : '—', 'Concentradores', COR.purple, false, function () { setTab('prio'); })
      ]));
      root.appendChild(filtros(state.tab));
      view.listEl = h('div', { class: 'op-list' });
      root.appendChild(view.listEl);
      renderLista();
    } else if (state.tab === 'prio') {
      var box = h('div'); root.appendChild(box);
      TRJ.pages.prioritarios(box, { data: raw, app: { isPublic: true, refresh: function () { return carregarDados(false, true); }, render: function () {} } });
    } else if (state.tab === 'mapa') {
      var mb = h('div'); root.appendChild(mb);
      TRJ.pages.mapa(mb, { data: raw, readOnly: true, prevCenter: prevMap && prevMap.c, prevZoom: prevMap && prevMap.z,
        mapaCoordMap: raw._mapaCoordMap || null, mapaMarkers: raw._mapaMarkersSlim || null, mapaMwData: raw._mapaMwData || null, mapaFoData: raw._mapaFoData || null });
    }
  }

  /* ---------- ciclo de atualização ---------- */
  TRJ.theme.mountToggle();
  TRJ.theme.onChange(function () { if (model) render(); });
  setInterval(function () { carregarDados(true); }, POLL_MS);
  setInterval(function () {
    if (!model) return;
    if (state.tab === 'fila' || state.tab === 'sites') {
      var a = document.activeElement;
      if (a && (a.classList.contains('op-search') || a.tagName === 'SELECT')) { atualizarIdade(); return; }   // não interromper quem está digitando
      render();
    } else atualizarIdade();
  }, TICK_MS);
  carregarDados(false);
})();
