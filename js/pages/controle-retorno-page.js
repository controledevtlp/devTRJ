/* Página: Controle de Retorno — o que foi suspenso/tramitado e voltou para a fila (antes do planejado ou não), para ninguém deixar a nota
 * "parada" ou perdida e estourar o prazo. Os textos se ajustam ao filtro: só suspensões, só tramitações ou as duas juntas.
 * Não atualiza sozinha: botão ↻ Atualizar (ou reimportação dos arquivos). */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, D = TRJ.domain, R = TRJ.retorno, h = U.h;
  var CL = R.CLASSES;
  var state = { regiao: 'TODAS', prios: [], op: 'TODAS', periodo: 'tudo', horaBase: 'retorno', aba: 'agora', classe: 'TODAS', tipo: 'TODOS', dim: 'caminho' };
  var APEL = null, apelCarregando = false;
  var LS_APEL = 'trj_retorno_apelidos';

  /* ---------- vocabulário: os nomes acompanham o que está filtrado ---------- */
  var VOC = {
    SUSPENSAO: { quem: 'quem suspendeu', agora: 'Suspensas agora', segue: 'segue suspensa', ainda: 'Ainda suspensa', ainda_pl: 'Ainda suspensas', enc: 'Encerrada durante a suspensão', em: 'Suspensa em', ha: 'Suspensa há', tempo: 'Tempo médio suspensa', tempoCol: 'Tempo suspensa', tot: 'Suspensões', pl: 'suspensões', sub: 'Tudo o que foi suspenso e voltou para a fila — antes do planejado ou não', vazio: 'Nenhuma TSK suspensa com esses filtros.', rank: 'Conta em nome de quem suspendeu (Usuário Executor da linha pendente).' },
    TRAMITACAO: { quem: 'quem tramitou', agora: 'Tramitadas agora', segue: 'segue tramitada', ainda: 'Ainda em tramitação', ainda_pl: 'Ainda em tramitação', enc: 'Encerrada em tramitação', em: 'Tramitada em', ha: 'Tramitada há', tempo: 'Tempo médio tramitada', tempoCol: 'Tempo tramitada', tot: 'Tramitações', pl: 'tramitações', sub: 'Tudo o que foi tramitado e voltou para a fila — antes do planejado ou não', vazio: 'Nenhuma TSK tramitada com esses filtros.', rank: 'Conta em nome de quem tramitou (Usuário Executor da linha pendente).' },
    TODOS: { quem: 'quem suspendeu/tramitou', agora: 'Fora da fila agora', segue: 'segue fora da fila', ainda: 'Ainda fora da fila', ainda_pl: 'Ainda fora da fila', enc: 'Encerrada fora da fila', em: 'Fora da fila em', ha: 'Fora da fila há', tempo: 'Tempo médio fora da fila', tempoCol: 'Tempo fora da fila', tot: 'Total', pl: 'suspensões e tramitações', sub: 'Tudo o que foi suspenso ou tramitado e voltou para a fila — antes do planejado ou não', vazio: 'Nenhuma TSK suspensa ou tramitada com esses filtros.', rank: 'Conta em nome de quem suspendeu/tramitou (Usuário Executor da linha pendente).' }
  };
  var V = VOC.TODOS;
  function rotC(c) { return c === 'SUSPENSA' ? V.ainda : (c === 'ENCERRADA' ? V.enc : CL[c].rot); }

  /* ---------- apelidos (nomes curtos para caminhos / motivos não listados) — compartilhados via CONFIG da planilha ---------- */
  function lerApelLocal() { try { return JSON.parse(localStorage.getItem(LS_APEL) || '{}') || {}; } catch (e) { return {}; } }
  function carregaApelidos(render) {
    if (APEL) return; APEL = lerApelLocal();
    if (apelCarregando || !TRJ.api || !TRJ.api.getConfig) return; apelCarregando = true;
    TRJ.api.getConfig().then(function (r) {
      var raw = r && r.config && r.config.retorno_apelidos; if (!raw) return;
      try { var rem = JSON.parse(raw); APEL = Object.assign({}, APEL, rem); try { localStorage.setItem(LS_APEL, JSON.stringify(APEL)); } catch (e) {} render(); } catch (e) {}
    }).catch(function () {}).then(function () { apelCarregando = false; });
  }
  function nomeDe(tipo, valor) { var a = APEL && APEL[tipo + ':' + valor]; return a ? a : (valor || '—'); }
  function salvaApelido(tipo, valor, nome) {
    APEL = APEL || {}; var k = tipo + ':' + valor;
    if (nome) APEL[k] = nome; else delete APEL[k];
    try { localStorage.setItem(LS_APEL, JSON.stringify(APEL)); } catch (e) {}
    if (TRJ.api && TRJ.api.setConfig) return TRJ.api.setConfig({ retorno_apelidos: JSON.stringify(APEL) });
    return Promise.resolve();
  }

  /* ---------- utilidades ---------- */
  function copiar(txt, msg) { if (U.copyText) U.copyText(txt, msg); }
  function fmtDt(d) { return d ? D.formatarDataCompacta(d) : '—'; }
  function durTxt(min) {
    if (min == null) return '—';
    var a = Math.abs(Math.round(min)); if (a < 60) return a + 'min';
    var hh = Math.floor(a / 60), mm = a % 60; if (hh < 48) return hh + 'h' + ('0' + mm).slice(-2) + 'min';
    return Math.floor(hh / 24) + 'd' + (hh % 24) + 'h';
  }
  function regLabel(r) { return (C.REGIAO_LABELS && C.REGIAO_LABELS[r]) || r; }
  function refData(e) { return e.retorno || e.inicio; }
  function mesmoDia(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function tag(txt, cor, title) { return h('span', { class: 'op-tag', style: { background: cor }, title: title || null, text: txt }); }
  function tagClasse(e) {
    var c = CL[e.classe]; var t = rotC(e.classe);
    if (e.classe === 'ANTECIPADO') t = 'ANTECIPADO ' + durTxt(e.deltaMin);
    if (e.classe === 'SUSPENSA' && e.vencidoSemRetorno) t = 'RETORNO VENCIDO';
    return tag(t, e.vencidoSemRetorno ? '#c62839' : c.cor, rotC(e.classe));
  }

  /* a tela não pula para o topo: guarda a posição de rolagem e a devolve depois de redesenhar (inclusive quando a importação redesenha a página) */
  var ROLAGEM = { top: 0, hash: '' };
  function paiRolavel() {
    var el = document.getElementById('page'), n = el;
    while (n && n !== document.body) { var o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; }
    return document.scrollingElement || document.documentElement;
  }
  function reRenderMantendoRolagem(app) { var sp = paiRolavel(), top = sp.scrollTop; ROLAGEM.top = top; ROLAGEM.hash = location.hash; app.render(); restauraRolagem(); }
  function restauraRolagem() { [0, 60, 250].forEach(function (ms) { setTimeout(function () { if (location.hash !== ROLAGEM.hash) return; var sp = paiRolavel(); if (sp.scrollTop !== ROLAGEM.top) sp.scrollTop = ROLAGEM.top; }, ms); }); }
  window.addEventListener('scroll', function (e) { if (location.hash !== '#/controle-retorno') return; var t = e.target === document ? (document.scrollingElement || document.documentElement) : e.target; if (t && t.scrollTop != null && (t === paiRolavel())) { ROLAGEM.top = t.scrollTop; ROLAGEM.hash = location.hash; } }, true);

  /* o mesmo motivo escrito de jeitos diferentes ("Restrição de Acesso" x "RESTRIÇÃO DE ACESSO") vira uma barra só */
  var MOT_DISP = {};
  function chaveMotivo(e) {
    var raw = e.motivo || '(sem motivo)', k = raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/s+/g, ' ').trim();
    if (!MOT_DISP[k]) MOT_DISP[k] = raw;
    return k;
  }

  /* dimensões do gráfico "Visão por …" (um só gráfico, troca de visão por botões) */
  var DIMS = [
    ['operador', 'Operador', function (e) { return e.quem; }, null, { horizontal: true, top: 14 }],
    ['caminho', 'Caminho', function (e) { return e.caminho; }, function (k) { return nomeDe('caminho', k); }, { horizontal: true, top: 12 }],
    ['motivo', 'Motivo', chaveMotivo, function (k) { var raw = MOT_DISP[k] || k; return nomeDe(R.ehMotivoSusp(raw) ? 'motivo' : 'tram', raw); }, { horizontal: true, top: 12 }],
    ['prio', 'Prioridade', function (e) { return e.prio; }, null, { top: 6, ordem: function (a, b) { return a < b ? -1 : 1; } }],
    ['regiao', 'Região', function (e) { return e.regiao; }, regLabel, { top: 10 }],
    ['tempo', 'Tempo até voltar', function (e) { return e.faixa; }, function (k) { var f = R.FAIXAS.filter(function (x) { return x[0] === k; })[0]; return f ? f[1] : k; }, { top: 8, soRetornos: true, ordem: function (a, b) { var o = R.FAIXAS.map(function (x) { return x[0]; }); return o.indexOf(a) - o.indexOf(b); } }],
    ['tipo', 'Suspensão x tramitação', function (e) { return e.tipo; }, function (k) { return R.TIPOS[k].rot; }, { top: 3, soTodos: true }]
  ];

  TRJ.pages.controleRetorno = function (container, ctx) {
    var data = ctx.data, app = ctx.app;
    if (!data) { container.appendChild(h('div', { class: 'trj-card p-6', text: 'Sem dados carregados.' })); return; }
    function rerender() { reRenderMantendoRolagem(app); }
    carregaApelidos(function () { if (location.hash === '#/controle-retorno') reRenderMantendoRolagem(app); });
    if (TRJ.tipTsk && TRJ.tipTsk.instalarAuth) TRJ.tipTsk.instalarAuth(data, app, copiar);
    V = VOC[state.tipo] || VOC.TODOS;
    if (state.dim === 'tipo' && state.tipo !== 'TODOS') state.dim = 'caminho';
    if (state.aba === 'suspensas') state.aba = 'agora';

    if (ROLAGEM.hash === location.hash && ROLAGEM.top) restauraRolagem();      // redesenho vindo de fora (ex.: importação): volta para onde você estava
    var res = R.analisar(data.tasksEnriched), todos = res.eventos, agora = new Date();
    function noPeriodo(e) {
      var d = refData(e); if (!d || state.periodo === 'tudo') return true;
      if (state.periodo === 'hoje') return mesmoDia(d, agora);
      if (state.periodo === '24h') return agora - d <= 24 * 3600000;
      if (state.periodo === '7d') return agora - d <= 7 * 24 * 3600000;
      return true;
    }
    function passa(e, semOp) {
      if (state.regiao !== 'TODAS' && e.regiao !== state.regiao) return false;
      if (state.prios.length && state.prios.indexOf(e.prio) < 0) return false;
      if (!semOp && state.op !== 'TODAS' && e.quem !== state.op) return false;
      if (state.tipo !== 'TODOS' && e.tipo !== state.tipo) return false;
      return noPeriodo(e);
    }
    var ev = todos.filter(function (e) { return passa(e); });
    var operadores = {}; todos.filter(function (e) { return passa(e, true); }).forEach(function (e) { operadores[e.quem] = (operadores[e.quem] || 0) + 1; });

    /* ---------- cabeçalho / filtros ---------- */
    var selReg = h('select', { class: 'trj-select', style: { width: 'auto' }, onchange: function () { state.regiao = this.value; rerender(); } },
      [h('option', { value: 'TODAS', text: 'Todas as regiões' })].concat(C.REGIOES.map(function (r) { return h('option', { value: r, text: regLabel(r), selected: state.regiao === r ? 'selected' : null }); })));
    var selOp = h('select', { class: 'trj-select', style: { width: 'auto', maxWidth: '230px' }, onchange: function () { state.op = this.value; rerender(); } },
      [h('option', { value: 'TODAS', text: 'Todos os operadores' })].concat(Object.keys(operadores).sort().map(function (n) { return h('option', { value: n, text: n + ' (' + operadores[n] + ')', selected: state.op === n ? 'selected' : null }); })));
    function chips(opcoes, ativoFn, clique) {
      return h('div', { class: 'cr-chips' }, opcoes.map(function (o) { return h('button', { type: 'button', class: 'op-chip' + (ativoFn(o[0]) ? ' on' : ''), text: o[1], onclick: function () { clique(o[0]); rerender(); } }); }));
    }
    var chTipo = chips([['TODOS', 'Suspensões + tramitações'], ['SUSPENSAO', 'Só suspensões'], ['TRAMITACAO', 'Só tramitações']], function (v) { return state.tipo === v; }, function (v) { state.tipo = v; });
    var chPer = chips([['hoje', 'Hoje'], ['24h', '24 h'], ['7d', '7 dias'], ['tudo', 'Todo o período']], function (v) { return state.periodo === v; }, function (v) { state.periodo = v; });
    var chPrio = chips([['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3'], ['P4', 'P4'], ['P5', 'P5']], function (v) { return state.prios.indexOf(v) >= 0; }, function (v) { var i = state.prios.indexOf(v); if (i >= 0) state.prios.splice(i, 1); else state.prios.push(v); });
    var live = h('span', { class: 'cr-live', title: 'A página só muda quando você pede ou quando os arquivos são reimportados' }, [h('button', { type: 'button', class: 'op-btn', text: '↻ Atualizar', onclick: function () { rerender(); } }), 'dados de ' + agora.toLocaleTimeString('pt-BR')]);
    container.appendChild(U.pageHeader('Controle de Retorno', V.sub, h('div', { class: 'flex items-center gap-2 flex-wrap' }, [selReg, selOp, chTipo, chPer, chPrio, live])));

    if (!res.temCampos) container.appendChild(h('div', { class: 'op-banner', text: 'ℹ Os dados carregados ainda não trazem as colunas de suspensão (Responsabilidade, Sub área, Nota de Suspensão, Data/Hora de Reinício…). Reimporte os arquivos de atividades em “Importar dados” para preencher caminho, motivo e previsão de retorno.' }));
    if (!todos.length) { container.appendChild(h('div', { class: 'op-empty', text: 'Nenhuma suspensão ou tramitação encontrada nos arquivos carregados.' })); return; }

    /* ---------- drill ---------- */
    function textoCopia(lista) { return lista.map(function (e) { return [R.TIPOS[e.tipo].rot, e.quem, e.os, e.site, e.prio, nomeDe('caminho', e.caminho), rotC(e.classe) + (e.classe === 'ANTECIPADO' ? ' ' + durTxt(e.deltaMin) : '')].join(' · '); }).join('\n'); }
    function drill(titulo, lista, aberto) { U.openModal(titulo + ' — ' + lista.length, lista.length ? (aberto ? tabelaEventos(lista, false, true) : tabelaEventos(lista, true)) : h('div', { class: 'op-empty', text: 'Nada aqui.' }), { onCopy: function () { return textoCopia(lista); } }); }

    /* ---------- resumo (KPIs) ---------- */
    var fora = ev.filter(function (e) { return e.classe === 'SUSPENSA'; }), venc = fora.filter(function (e) { return e.vencidoSemRetorno; });
    var ant = ev.filter(function (e) { return e.classe === 'ANTECIPADO'; }), semp = ev.filter(function (e) { return e.classe === 'SEM_PREVISAO'; }), nop = ev.filter(function (e) { return e.classe === 'NO_PRAZO'; });
    var ret = ev.filter(function (e) { return e.retorno; }), comTempo = ret.filter(function (e) { return e.suspensaMin != null; }), medMin = comTempo.length ? Math.round(comTempo.reduce(function (a, e) { return a + e.suspensaMin; }, 0) / comTempo.length) : null;
    var comAw = ant.length + nop.length, ultHora = ret.filter(function (e) { return agora - e.retorno <= 3600000; });
    var kpis = [
      { l: V.agora, v: fora.length, c: '#1f6fb5', lista: fora, t: V.agora, aberto: true },
      { l: 'Retorno vencido (' + V.segue + ')', v: venc.length, c: '#c62839', lista: venc, t: 'Retorno previsto vencido e ' + V.segue, aberto: true },
      { l: 'Retornaram ANTES do planejado', v: ant.length, c: '#c62839', lista: ant, t: 'Retornaram antes do planejado' },
      { l: 'Retornaram sem previsão', v: semp.length, c: '#d68910', lista: semp, t: 'Retornaram sem previsão (sem data de reinício)' },
      { l: 'Retornaram no prazo', v: nop.length, c: '#168a47', lista: nop, t: 'Retornaram no prazo' },
      { l: 'Retornos na última hora', v: ultHora.length, c: '#7d3c98', lista: ultHora, t: 'Retornaram na última hora' },
      { l: V.tempo, v: medMin == null ? '—' : durTxt(medMin), c: '#ff8c00', lista: ret, t: 'Todos os retornos do filtro' }
    ];
    container.appendChild(h('div', { class: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3' }, kpis.map(function (k) {
      return U.kpiCard({ label: k.l, value: String(k.v), cor: k.c, onClick: function () { drill(k.t, k.lista, k.aberto); } });
    })));
    var nSus = ev.filter(function (e) { return e.tipo === 'SUSPENSAO'; }).length, nInf = ev.filter(function (e) { return e.origem === 'inferida'; }).length;
    var contagem = state.tipo === 'TODOS' ? '<b>' + nSus + '</b> suspensão(ões) e <b>' + (ev.length - nSus) + '</b> tramitação(ões)' : '<b>' + ev.length + '</b> ' + V.pl;
    container.appendChild(h('div', { class: 'cr-nota', html: contagem + ' no filtro.' + (nInf ? ' <b>' + nInf + '</b> identificada(s) só pela nota/previsão em linhas já de volta à fila (sem linha “pendente” no arquivo — início e ' + V.quem + ' não aparecem).' : '') }));
    if (comAw) container.appendChild(h('div', { class: 'cr-nota', html: '<b>' + Math.round(ant.length / comAw * 100) + '%</b> dos retornos com data prevista voltaram antes (' + ant.length + ' de ' + comAw + '). ' + semp.length + ' retorno(s) não tinham data de reinício — só é possível conferir os que têm.' }));

    /* ---------- 2 gráficos ---------- */
    var ORDEM = ['ANTECIPADO', 'SEM_PREVISAO', 'NO_PRAZO', 'SUSPENSA'];
    function series(classes) { return classes.map(function (c) { return { label: rotC(c), cor: CL[c].cor, classe: c }; }); }
    var grid = h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4' });

    // (1) quando voltaram / quando foram para fora da fila
    var hrBase = state.horaBase;
    var swHora = h('span', { class: 'cr-sw' }, [['retorno', 'hora do retorno'], ['suspensao', 'hora de saída da fila']].map(function (o) {
      return h('button', { type: 'button', class: 'op-chip' + (hrBase === o[0] ? ' on' : ''), text: o[1], onclick: function () { state.horaBase = o[0]; rerender(); } });
    }));
    var ccHora = U.chartCard('Por horário do dia', { hint: swHora });
    (function () {
      var base = hrBase === 'retorno' ? ev.filter(function (e) { return e.retorno; }) : ev.filter(function (e) { return e.inicio; }), classes = hrBase === 'retorno' ? ORDEM.slice(0, 3) : ORDEM, horas = [], i;
      for (i = 0; i < 24; i++) horas.push(('0' + i).slice(-2) + 'h');
      function hr(e) { var d = hrBase === 'retorno' ? e.retorno : e.inicio; return d ? d.getHours() : -1; }
      var sr = series(classes).map(function (s) { return Object.assign(s, { data: horas.map(function (_, k) { return base.filter(function (e) { return hr(e) === k && e.classe === s.classe; }).length; }) }); });
      ccHora.canvas.__draw = function () { U.seriesChart(ccHora.canvas, horas, sr, { onSeg: function (k, di) { var c = sr[di].classe; drill('Horário ' + horas[k] + ' (' + (hrBase === 'retorno' ? 'retorno' : 'saída da fila') + ') · ' + rotC(c), base.filter(function (e) { return hr(e) === k && e.classe === c; })); } }); };
    })();

    // (2) uma visão só, trocando a dimensão (operador, caminho, motivo, prioridade, região, tempo até voltar, tipo)
    var dimsOk = DIMS.filter(function (d) { return !(d[4] && d[4].soTodos && state.tipo !== 'TODOS'); });
    var dimAtual = dimsOk.filter(function (d) { return d[0] === state.dim; })[0] || dimsOk[0];
    var swDim = h('span', { class: 'cr-sw cr-sw-dim' }, dimsOk.map(function (d) {
      return h('button', { type: 'button', class: 'op-chip' + (dimAtual[0] === d[0] ? ' on' : ''), text: d[1], onclick: function () { state.dim = d[0]; rerender(); } });
    }));
    var tituloDim = dimAtual[0] === 'operador' ? 'Por operador (' + V.quem + ')' : 'Por ' + dimAtual[1].toLowerCase();
    var ccDim = U.chartCard(tituloDim);
    ccDim.card.insertBefore(swDim, ccDim.card.children[1] || null);        // botões de visão numa linha própria (cabem todos, sem espremer o título)
    (function () {
      var chaveFn = dimAtual[2], rotuloFn = dimAtual[3], o = dimAtual[4] || {};
      var base = o.soRetornos ? ev.filter(function (e) { return e.retorno; }) : ev, classes = o.soRetornos ? ORDEM.slice(0, 3) : ORDEM;
      var cont = {}, tot = {};
      base.forEach(function (e) { var k = chaveFn(e); if (!k) return; (cont[k] = cont[k] || {})[e.classe] = (cont[k][e.classe] || 0) + 1; tot[k] = (tot[k] || 0) + 1; });
      var ks = Object.keys(tot).sort(function (a, b) { return o.ordem ? o.ordem(a, b) : tot[b] - tot[a]; }).slice(0, o.top || 12);
      var sr = series(classes).map(function (s) { return Object.assign(s, { data: ks.map(function (k) { return (cont[k] && cont[k][s.classe]) || 0; }) }); });
      ccDim.canvas.__draw = function () { U.seriesChart(ccDim.canvas, ks.map(rotuloFn || function (k) { return k; }), sr, { horizontal: !!o.horizontal, onSeg: function (i, di) { var k = ks[i], c = sr[di].classe; drill(dimAtual[1] + ': ' + (rotuloFn ? rotuloFn(k) : k) + ' · ' + rotC(c), base.filter(function (e) { return chaveFn(e) === k && e.classe === c; })); } }); };
    })();
    [ccHora, ccDim].forEach(function (cc) { grid.appendChild(cc.card); });
    container.appendChild(grid);
    [ccHora, ccDim].forEach(function (cc) { try { cc.canvas.__draw(); } catch (e) { console.error(e); } });

    /* ---------- tabelas ---------- */
    var abas = [
      ['agora', V.agora, fora.length], ['retornos', 'Retornos à fila', ret.length],
      ['operadores', 'Ranking de operadores', null], ['nomes', 'Nomes dos caminhos', Object.keys(res.catalogo.caminho).length + Object.keys(res.catalogo.motivo).length]
    ];
    container.appendChild(h('div', { class: 'op-tabs', style: { marginBottom: '10px' } }, abas.map(function (a) {
      return h('button', { type: 'button', class: 'op-tab' + (state.aba === a[0] ? ' active' : ''), onclick: function () { state.aba = a[0]; rerender(); } }, [a[1], a[2] != null ? h('span', { class: 'n', text: String(a[2]) }) : null]);
    })));
    var box = h('div', { class: 'cr-box' }); container.appendChild(box);
    if (state.aba === 'agora') {
      var ord = fora.slice().sort(function (a, b) { return (b.vencidoSemRetorno - a.vencidoSemRetorno) || ((a.previsto ? a.previsto.getTime() : 9e15) - (b.previsto ? b.previsto.getTime() : 9e15)); });
      box.appendChild(ord.length ? tabelaEventos(ord, false, true) : h('div', { class: 'op-empty', text: V.vazio }));
    } else if (state.aba === 'retornos') {
      var opcoes = [['TODAS', 'Todos']].concat(ORDEM.slice(0, 3).map(function (c) { return [c, rotC(c)]; }));
      box.appendChild(h('div', { class: 'cr-chips', style: { marginBottom: '8px' } }, opcoes.map(function (o) { return h('button', { type: 'button', class: 'op-chip' + (state.classe === o[0] ? ' on' : ''), text: o[1], onclick: function () { state.classe = o[0]; rerender(); } }); })));
      var lst = ret.filter(function (e) { return state.classe === 'TODAS' || e.classe === state.classe; });
      box.appendChild(lst.length ? tabelaEventos(lst, true) : h('div', { class: 'op-empty', text: 'Nenhum retorno com esses filtros.' }));
    } else if (state.aba === 'operadores') box.appendChild(rankingOperadores(ev, drill));
    else box.appendChild(painelNomes(res.catalogo, app));
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(container);
  };

  /* ---------- tabela de eventos ---------- */
  function tabelaEventos(lista, mostraRetorno, mostraPrevisao) {
    var comTipo = state.tipo === 'TODOS';
    var cols = (comTipo ? ['Tipo'] : []).concat(['Operador', 'TSK', 'Site', 'Prio', 'Região', 'Caminho', 'Motivo', V.em]);
    if (mostraPrevisao) cols = cols.concat([V.ha, 'Retorno previsto']);
    else cols = cols.concat(['Previsto (AW)', 'Retornou em', 'Retornou por', V.tempoCol, 'Situação']);
    var tab = h('table', { class: 'trj-table cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, cols.map(function (c) { return h('th', { text: c }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    lista.slice(0, 600).forEach(function (e) {
      var cels = [];
      if (comTipo) cels.push(h('td', null, [tag(e.tipo === 'SUSPENSAO' ? 'SUSPENSÃO' : 'TRAMITAÇÃO', R.TIPOS[e.tipo].cor, R.TIPOS[e.tipo].rot), e.origem === 'inferida' ? tag('INFERIDA', '#6b7280', 'Sem linha pendente no arquivo: identificada pela nota/previsão numa linha já em Não iniciado/Iniciado. Início e quem suspendeu/tramitou não aparecem.') : null]));
      cels = cels.concat([
        h('td', { text: e.quem }), h('td', null, [h('span', { class: 'op-tsk', dataset: { os: e.os }, text: e.os })]), h('td', { text: e.site || '', title: 'END_ID ' + e.end }),
        h('td', { text: e.prio }), h('td', { text: regLabel(e.regiao) }), h('td', { text: nomeDe('caminho', e.caminho), title: e.caminho }),
        h('td', { text: nomeDe(e.tipo === 'SUSPENSAO' ? 'motivo' : 'tram', e.motivo || ''), title: [e.motivo, e.nota, e.area].filter(Boolean).join(' · ') }), h('td', { text: fmtDt(e.inicio) })
      ]);
      if (mostraPrevisao) {
        var rest = e.previsto ? Math.round((e.previsto.getTime() - Date.now()) / 60000) : null;
        cels.push(h('td', { text: durTxt(e.suspensaMin) }));
        cels.push(h('td', null, [e.previsto ? h('span', { class: 'cc-venc', style: { color: rest < 0 ? '#c62839' : (rest <= 60 ? '#d68910' : '#168a47') }, text: (rest < 0 ? 'VENCIDO A ' : 'EM ') + durTxt(rest) + ' · ' + fmtDt(e.previsto) }) : h('span', { class: 'tx', text: 'sem previsão' })]));
      } else {
        cels.push(h('td', { text: fmtDt(e.previsto) })); cels.push(h('td', { text: fmtDt(e.retorno) }));
        cels.push(h('td', { text: e.retornoPor || '—', class: e.retornoSistema ? 'cr-sis' : '' })); cels.push(h('td', { text: durTxt(e.suspensaMin) })); cels.push(h('td', null, [tagClasse(e)]));
      }
      tb.appendChild(h('tr', { class: e.classe === 'ANTECIPADO' || e.vencidoSemRetorno ? 'cr-alerta' : '', dataset: { osSel: e.os } }, cels));
    });
    var wrap = h('div', { style: { overflowX: 'auto' } }, [tab]);
    if (lista.length > 600) wrap.appendChild(h('div', { class: 'cr-nota', text: 'Mostrando os 600 mais recentes de ' + lista.length + '. Use os filtros para refinar.' }));
    return wrap;
  }

  function rankingOperadores(ev, drill) {
    var m = {};
    ev.forEach(function (e) { var o = m[e.quem] || (m[e.quem] = { quem: e.quem, tot: 0, ANTECIPADO: 0, SEM_PREVISAO: 0, NO_PRAZO: 0, SUSPENSA: 0, ENCERRADA: 0, sis: e.quemSistema }); o.tot++; o[e.classe]++; });
    var lista = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.ANTECIPADO - a.ANTECIPADO || b.tot - a.tot; });
    var tab = h('table', { class: 'trj-table cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, ['Operador', V.tot, 'Antes do planejado', 'Sem previsão', 'No prazo', V.ainda_pl, '% antecipado'].map(function (c) { return h('th', { text: c }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    lista.forEach(function (o) {
      var comAw = o.ANTECIPADO + o.NO_PRAZO, pct = comAw ? Math.round(o.ANTECIPADO / comAw * 100) : null;
      function cel(v, classe, cor) { return h('td', null, [h('button', { type: 'button', class: 'cr-num', style: { color: v ? cor : 'var(--trj-muted)' }, text: String(v), onclick: function () { if (v) drill(o.quem + ' · ' + rotC(classe), ev.filter(function (e) { return e.quem === o.quem && e.classe === classe; })); } })]); }
      tb.appendChild(h('tr', null, [h('td', { text: o.quem, style: { fontWeight: '700' } }), h('td', { text: String(o.tot) }), cel(o.ANTECIPADO, 'ANTECIPADO', '#c62839'), cel(o.SEM_PREVISAO, 'SEM_PREVISAO', '#d68910'), cel(o.NO_PRAZO, 'NO_PRAZO', '#168a47'), cel(o.SUSPENSA, 'SUSPENSA', '#1f6fb5'),
        h('td', null, [pct == null ? h('span', { class: 'tx', text: '—' }) : h('b', { style: { color: pct >= 50 ? '#c62839' : (pct >= 25 ? '#d68910' : '#168a47') }, text: pct + '%' })])]));
    });
    return h('div', { style: { overflowX: 'auto' } }, [tab, h('div', { class: 'cr-nota', text: V.rank + ' “% antecipado” considera só os que tinham data de reinício.' })]);
  }

  /* ---------- nomes dos caminhos / motivos (os não listados aparecem como NOVO) ---------- */
  function painelNomes(cat, app) {
    var tipos = [['caminho', 'Caminho (1ª > 2ª escolha)'], ['motivo', 'Motivo da SUSPENSÃO'], ['tram', 'Motivo da TRAMITAÇÃO'], ['area', 'Área']], linhas = [];
    tipos.forEach(function (t) { Object.keys(cat[t[0]]).forEach(function (v) { linhas.push({ tipo: t[0], rot: t[1], valor: v, n: cat[t[0]][v].n, novo: cat[t[0]][v].novo }); }); });
    linhas.sort(function (a, b) { return (b.novo - a.novo) || (b.n - a.n); });
    var tab = h('table', { class: 'trj-table cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, ['Tipo', 'Valor na plataforma', 'Qtd', 'Situação', 'Nome no gráfico'].map(function (c) { return h('th', { text: c }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    linhas.forEach(function (l) {
      var inp = h('input', { type: 'text', class: 'cc-inp', style: { minWidth: '200px' }, placeholder: 'dar um nome curto…', value: (APEL && APEL[l.tipo + ':' + l.valor]) || '' });
      var btn = h('button', { type: 'button', class: 'op-btn', text: '💾', title: 'Salvar (compartilhado com a equipe)', onclick: function () {
        btn.disabled = true;
        salvaApelido(l.tipo, l.valor, inp.value.trim()).then(function () { U.toast('Nome salvo', 'ok'); reRenderMantendoRolagem(app); }, function (e) { btn.disabled = false; U.toast('Salvo só neste navegador: ' + ((e && e.message) || e), 'err'); });
      } });
      tb.appendChild(h('tr', { class: l.novo ? 'cr-novo' : '' }, [h('td', { text: l.rot }), h('td', { text: l.valor, style: { fontWeight: '700' } }), h('td', { text: String(l.n) }),
        h('td', null, [l.novo ? tag('NOVO — dê um nome', '#d68910') : tag('conhecido', '#6b7280')]), h('td', null, [h('div', { style: { display: 'flex', gap: '6px' } }, [inp, btn])])]));
    });
    return h('div', null, [h('div', { class: 'cr-nota', text: 'Todo caminho/motivo que aparece nos arquivos entra na métrica. Os que não estavam na sua lista ficam marcados como NOVO; dê um nome curto para o gráfico ficar objetivo — o nome é salvo na planilha e vale para toda a equipe.' }), h('div', { style: { overflowX: 'auto' } }, [tab])]);
  }
})(window.TRJ = window.TRJ || {});
