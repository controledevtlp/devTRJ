/* Página: Controle de Retorno — o que foi suspenso/tramitado e VOLTOU para a fila, para a nota não ficar parada ou perdida.
 * Só entra o que já retornou (quem continua suspenso/tramitado não é controlado aqui). Os textos se ajustam ao filtro:
 * só suspensões, só tramitações ou as duas juntas. Clique na TSK copia o número; botão direito fixa o balão de detalhes.
 * Layout: escolha da visão (suspensas/tramitadas x encerradas) → barra de filtros rotulados → resumo e gráficos → detalhamento.
 * Não atualiza sozinha: botão ATUALIZAR (ou reimportação dos arquivos). */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, D = TRJ.domain, R = TRJ.retorno, h = U.h;
  var CL = R.CLASSES;
  /* modo = qual visão da página (suspensas/tramitadas que voltaram x encerradas que voltaram); aba = detalhamento dentro do modo "retornos" */
  var state = { regioes: [], grupo: 'TODAS', prios: [], op: 'TODAS', periodo: 'tudo', modo: 'retornos', aba: 'retornos', classe: 'TODAS', tipo: 'TODOS', dim: 'caminho', motivoRe: 'TODOS' };
  var ICO = {
    atualizar: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    filtro: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    salvar: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/>',
    limpar: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>'
  };
  function ico(n) { return h('span', { class: 'cr-ico', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[n] + '</svg>' }); }
  /* FIXA / MÓVEL = regra criadora (coluna DJ) classificada com as regras do operador (TRJ.operador); null = regra não reconhecida */
  function grupoDe(e) { var OP = TRJ.operador; return OP && OP.classificar && e.dj ? OP.classificar(e.dj).grupo || null : null; }
  var APEL = null, apelCarregando = false;
  var LS_APEL = 'trj_retorno_apelidos';

  /* ---------- vocabulário: os nomes acompanham o que está filtrado ---------- */
  var VOC = {
    SUSPENSAO: { quem: 'quem suspendeu', ret: 'Suspensões que retornaram', tot: 'Suspensões', pl: 'suspensões', sub: 'Suspensões que voltaram para a fila', rank: 'Conta em nome de quem suspendeu (Usuário Executor da linha pendente).' },
    TRAMITACAO: { quem: 'quem tramitou', ret: 'Tramitações que retornaram', tot: 'Tramitações', pl: 'tramitações', sub: 'Tramitações que voltaram para a fila', rank: 'Conta em nome de quem tramitou (Usuário Executor da linha pendente).' },
    TODOS: { quem: 'quem suspendeu/tramitou', ret: 'Retornaram à fila', tot: 'Retornos', pl: 'suspensões e tramitações', sub: 'Suspensões e tramitações que voltaram para a fila', rank: 'Conta em nome de quem suspendeu/tramitou (Usuário Executor da linha pendente).' }
  };
  var V = VOC.TODOS;
  function rotC(c) { return CL[c].rot; }

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
  function mesmoDia(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function tag(txt, cor, title) { return h('span', { class: 'op-tag', style: { background: cor }, title: title || null, text: txt }); }
  function tagClasse(e) { return tag(e.classe === 'ANTECIPADO' ? 'ANTECIPADO ' + durTxt(e.deltaMin) : rotC(e.classe), CL[e.classe].cor, rotC(e.classe)); }

  /* clique (botão esquerdo) na TSK copia o número — vale também dentro dos detalhes (modal) e no dashboard público.
     O botão direito continua fixando o balão de detalhes (tip-tsk.js). */
  var COPIA_TSK = false;
  function instalaCopiaTsk() {
    if (COPIA_TSK) return; COPIA_TSK = true;
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.cr-tsk') : null; if (!el) return;
      var os = el.getAttribute('data-os') || el.textContent; copiar(os, os + ' copiada');
    });
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
    var raw = e.motivo || '(sem motivo)', k = raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
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
    ['grupo', 'Fixa x Móvel', function (e) { return grupoDe(e) || 'SEM'; }, function (k) { return k === 'FIXA' ? 'FIXA' : (k === 'MOVEL' ? 'MÓVEL' : 'Sem regra'); }, { top: 3 }],
    ['tipo', 'Suspensão x tramitação', function (e) { return e.tipo; }, function (k) { return R.TIPOS[k].rot; }, { top: 3, soTodos: true }]
  ];

  TRJ.pages.controleRetorno = function (container, ctx) {
    var data = ctx.data, app = ctx.app;
    /* publico = dashboard público: recebe os episódios já calculados pelo painel (data.retornoRes), só leitura (sem aba de nomes nem balão de TSK) */
    var publico = !!ctx.publico;
    if (!data) { container.appendChild(h('div', { class: 'trj-card p-6', text: 'Sem dados carregados.' })); return; }
    if (publico && !data.retornoRes) { container.appendChild(h('div', { class: 'op-empty', text: 'O controle de retorno ainda não foi publicado. Abra o Dashboard no painel principal (com os arquivos de atividades importados) para publicar.' })); return; }
    function rerender() { reRenderMantendoRolagem(app); }
    if (publico) APEL = Object.assign({}, data.retornoApelidos || {});
    else {
      carregaApelidos(function () { if (location.hash === '#/controle-retorno') reRenderMantendoRolagem(app); });
      if (TRJ.tipTsk && TRJ.tipTsk.instalarAuth) TRJ.tipTsk.instalarAuth(data, app, copiar);
    }
    if (!ctx.operador) instalaCopiaTsk();          // no link do operador o clique na TSK já copia (e abre o balão) pelo próprio operador.js
    V = VOC[state.tipo] || VOC.TODOS;
    if (state.dim === 'tipo' && state.tipo !== 'TODOS') state.dim = 'caminho';
    if (state.dim === 'tempo') state.dim = 'caminho';
    if (state.aba !== 'retornos' && state.aba !== 'operadores' && state.aba !== 'nomes') state.aba = 'retornos';
    if (state.modo !== 'retornos' && state.modo !== 'reabertas') state.modo = 'retornos';

    if (!publico && ROLAGEM.hash === location.hash && ROLAGEM.top) restauraRolagem();      // redesenho vindo de fora (ex.: importação): volta para onde você estava
    var res = publico ? data.retornoRes : R.analisar(data.tasksEnriched), agora = new Date();
    var todos = res.eventos.filter(function (e) { return e.retorno; });                    // só o que já voltou para a fila
    var resRe = publico ? data.reabertasRes : R.analisarReabertas(data.tasksEnriched);       // TSKs encerradas que voltaram à fila
    var reTodos = (resRe && resRe.eventos) || [], temRe = !!resRe;
    if (publico && state.aba === 'nomes') state.aba = 'retornos';
    if (state.modo === 'reabertas' && !temRe) state.modo = 'retornos';
    var emRe = state.modo === 'reabertas';
    function noPeriodoD(d) {
      if (!d || state.periodo === 'tudo') return true;
      if (state.periodo === 'hoje') return mesmoDia(d, agora);
      if (state.periodo === '24h') return agora - d <= 24 * 3600000;
      if (state.periodo === '7d') return agora - d <= 7 * 24 * 3600000;
      return true;
    }
    function noPeriodo(e) { return noPeriodoD(e.retorno); }
    function passaRe(e, semReg) {
      if (!semReg && state.regioes.length && state.regioes.indexOf(e.regiao || 'OTHERS') < 0) return false;
      if (state.grupo !== 'TODAS' && grupoDe(e) !== state.grupo) return false;
      if (state.prios.length && state.prios.indexOf(e.prio) < 0) return false;
      return noPeriodoD(e.reabertaEm);
    }
    function passa(e, semOp, semReg) {
      if (!semReg && state.regioes.length && state.regioes.indexOf(e.regiao || 'OTHERS') < 0) return false;
      if (state.grupo !== 'TODAS' && grupoDe(e) !== state.grupo) return false;
      if (state.prios.length && state.prios.indexOf(e.prio) < 0) return false;
      if (!semOp && state.op !== 'TODAS' && e.quem !== state.op) return false;
      if (state.tipo !== 'TODOS' && e.tipo !== state.tipo) return false;
      return noPeriodo(e);
    }
    var ev = todos.filter(function (e) { return passa(e); });
    var evRe = reTodos.filter(function (e) { return passaRe(e); });
    var porReg = {}; (emRe ? reTodos.filter(function (e) { return passaRe(e, true); }) : todos.filter(function (e) { return passa(e, false, true); })).forEach(function (e) { var r = e.regiao || 'OTHERS'; porReg[r] = (porReg[r] || 0) + 1; });
    var operadores = {}; todos.filter(function (e) { return passa(e, true); }).forEach(function (e) { operadores[e.quem] = (operadores[e.quem] || 0) + 1; });

    /* ---------- cabeçalho / filtros ---------- */
    var selOp = h('select', { class: 'trj-select', style: { width: 'auto', maxWidth: '230px' }, onchange: function () { state.op = this.value; rerender(); } },
      [h('option', { value: 'TODAS', text: 'Todos os operadores' })].concat(Object.keys(operadores).sort().map(function (n) { return h('option', { value: n, text: n + ' (' + operadores[n] + ')', selected: state.op === n ? 'selected' : null }); })));
    function chips(opcoes, ativoFn, clique) {
      return h('div', { class: 'cr-chips' }, opcoes.map(function (o) { return h('button', { type: 'button', class: 'op-chip' + (ativoFn(o[0]) ? ' on' : ''), text: o[1], onclick: function () { clique(o[0]); rerender(); } }); }));
    }
    /* regiões: seleção múltipla (vazio = todas); o número é quanto retornou na região com os demais filtros */
    var chReg = h('div', { class: 'cr-chips' }, [h('button', { type: 'button', class: 'op-chip' + (!state.regioes.length ? ' on' : ''), text: 'Todas', onclick: function () { state.regioes = []; rerender(); } })].concat(
      C.REGIOES.filter(function (r) { return porReg[r] || state.regioes.indexOf(r) >= 0; }).map(function (r) {
        return h('button', { type: 'button', class: 'op-chip' + (state.regioes.indexOf(r) >= 0 ? ' on' : ''), title: 'Clique para filtrar (pode escolher várias)', text: regLabel(r) + ' ' + (porReg[r] || 0), onclick: function () { var i = state.regioes.indexOf(r); if (i >= 0) state.regioes.splice(i, 1); else state.regioes.push(r); rerender(); } });
      })));
    var chGrupo = chips([['TODAS', 'Todas'], ['FIXA', 'FIXA'], ['MOVEL', 'MÓVEL']], function (v) { return state.grupo === v; }, function (v) { state.grupo = v; });
    var chTipo = chips([['TODOS', 'Todos'], ['SUSPENSAO', 'Suspensões'], ['TRAMITACAO', 'Tramitações']], function (v) { return state.tipo === v; }, function (v) { state.tipo = v; });
    var chPer = chips([['hoje', 'Hoje'], ['24h', 'Últimas 24 h'], ['7d', 'Últimos 7 dias'], ['tudo', 'Tudo']], function (v) { return state.periodo === v; }, function (v) { state.periodo = v; });
    var chPrio = chips([['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3'], ['P4', 'P4'], ['P5', 'P5']], function (v) { return state.prios.indexOf(v) >= 0; }, function (v) { var i = state.prios.indexOf(v); if (i >= 0) state.prios.splice(i, 1); else state.prios.push(v); });
    var live = h('span', { class: 'cr-live', title: publico ? 'Dados publicados pelo painel principal; a página confere sozinha a cada minuto se saiu publicação nova' : 'A página só muda quando você pede ou quando os arquivos são reimportados' },
      [h('button', { type: 'button', class: 'op-btn cr-btn-ico', onclick: function () { if (publico && app.refresh) app.refresh(); else rerender(); } }, [ico('atualizar'), 'ATUALIZAR']),
        publico && data.publicadoEm ? 'publicado em ' + new Date(data.publicadoEm).toLocaleString('pt-BR') : 'dados de ' + agora.toLocaleTimeString('pt-BR')]);
    container.appendChild(U.pageHeader('Controle de Retorno', emRe ? 'TSKs encerradas que foram reabertas e voltaram para a fila' : V.sub, live));

    /* 1) qual visão: cada botão diz o que é e quantos itens há com os filtros atuais */
    var modos = [
      ['retornos', 'SUSPENSAS E TRAMITADAS', 'Voltaram para a fila depois de suspensas ou tramitadas', ev.length],
      temRe ? ['reabertas', 'ENCERRADAS', 'Voltaram para a fila depois de encerradas', evRe.length] : null
    ].filter(Boolean);
    if (modos.length > 1) container.appendChild(h('div', { class: 'cr-modos' }, modos.map(function (m) {
      return h('button', { type: 'button', class: 'cr-modo' + (state.modo === m[0] ? ' on' : ''), onclick: function () { state.modo = m[0]; rerender(); } },
        [h('span', { class: 'cr-modo-t', text: m[1] }), h('b', { class: 'cr-modo-n', text: String(m[3]) }), h('span', { class: 'cr-modo-s', text: m[2] })]);
    })));

    /* 2) filtros: uma barra só, cada grupo com o seu rótulo; só aparecem os que valem para a visão escolhida */
    function grupoF(rot, conteudo) { return h('div', { class: 'cr-fg' }, [h('span', { class: 'cr-rot', text: rot }), conteudo]); }
    var nAtivos = (state.periodo !== 'tudo' ? 1 : 0) + (state.regioes.length ? 1 : 0) + (state.grupo !== 'TODAS' ? 1 : 0) + (state.prios.length ? 1 : 0) + (!emRe && state.tipo !== 'TODOS' ? 1 : 0) + (!emRe && state.op !== 'TODAS' ? 1 : 0);
    function limpaFiltros() { state.periodo = 'tudo'; state.regioes = []; state.grupo = 'TODAS'; state.prios = []; state.tipo = 'TODOS'; state.op = 'TODAS'; state.classe = 'TODAS'; state.motivoRe = 'TODOS'; rerender(); }
    container.appendChild(h('div', { class: 'cr-filtros' }, [
      h('div', { class: 'cr-filtros-t' }, [ico('filtro'), h('span', { text: 'FILTROS' }),
        nAtivos ? h('span', { class: 'cr-badge', text: nAtivos + (nAtivos === 1 ? ' ATIVO' : ' ATIVOS') }) : h('span', { class: 'cr-filtros-s', text: 'nenhum filtro ativo' }),
        nAtivos ? h('button', { type: 'button', class: 'op-btn cr-btn-ico', onclick: limpaFiltros }, [ico('limpar'), 'LIMPAR']) : null]),
      h('div', { class: 'cr-fgrid' }, [
        grupoF('PERÍODO', chPer),
        publico && data.regiaoFixa ? null : grupoF('REGIÃO', chReg),
        grupoF('EQUIPE', chGrupo),
        grupoF('PRIORIDADE', chPrio),
        emRe ? null : grupoF('TIPO', chTipo),
        emRe ? null : grupoF('OPERADOR', selOp)
      ])
    ]));

    if (!res.temCampos && !emRe) container.appendChild(h('div', { class: 'op-banner', text: 'Faltam dados de suspensão nos arquivos carregados. Reimporte os arquivos de atividades em “Importar dados”.' }));
    if (!todos.length && !reTodos.length) { container.appendChild(h('div', { class: 'op-empty', text: 'Nenhuma suspensão ou tramitação que tenha retornado à fila nos arquivos carregados.' })); return; }

    /* detalhamento (visão "suspensas e tramitadas"): lista, ranking e nomes */
    function barraAbas() {
      var abas = [
        ['retornos', 'RETORNOS', ev.length],
        ['operadores', 'RANKING DE OPERADORES', null], ['nomes', 'NOMES DOS CAMINHOS', Object.keys(res.catalogo.caminho).length + Object.keys(res.catalogo.motivo).length]
      ].filter(function (a) { return a && !(publico && a[0] === 'nomes'); });
      return h('div', { class: 'op-tabs', style: { marginBottom: '10px' } }, abas.map(function (a) {
        return h('button', { type: 'button', class: 'op-tab' + (state.aba === a[0] ? ' active' : ''), onclick: function () { state.aba = a[0]; rerender(); } }, [a[1], a[2] != null ? h('span', { class: 'n', text: String(a[2]) }) : null]);
      }));
    }
    if (emRe) {
      viewReabertas(container, evRe, rerender, agora);
      if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(container);
      return;
    }

    /* ---------- drill ---------- */
    function textoCopia(lista) { return lista.map(function (e) { return [R.TIPOS[e.tipo].rot, e.quem, e.os, e.site, e.prio, nomeDe('caminho', e.caminho), rotC(e.classe) + (e.classe === 'ANTECIPADO' ? ' ' + durTxt(e.deltaMin) : '')].join(' · '); }).join('\n'); }
    function drill(titulo, lista) { U.openModal(titulo + ' — ' + lista.length, lista.length ? tabelaEventos(lista) : h('div', { class: 'op-empty', text: 'Nada aqui.' }), { onCopy: function () { return textoCopia(lista); } }); }

    /* ---------- resumo (KPIs): tudo é do que já voltou para a fila ---------- */
    var ant = ev.filter(function (e) { return e.classe === 'ANTECIPADO'; }), semp = ev.filter(function (e) { return e.classe === 'SEM_PREVISAO'; }), nop = ev.filter(function (e) { return e.classe === 'NO_PRAZO'; });
    var ret = ev, comAw = ant.length + nop.length;
    var hoje = ret.filter(function (e) { return mesmoDia(e.retorno, agora); }), ultHora = ret.filter(function (e) { return agora - e.retorno <= 3600000; });
    var kpis = [
      { l: V.ret, v: ret.length, c: '#1f6fb5', lista: ret, t: V.ret },
      { l: 'Retornaram hoje', v: hoje.length, c: '#7d3c98', lista: hoje, t: 'Retornaram hoje' },
      { l: 'Retornaram na última hora', v: ultHora.length, c: '#a569bd', lista: ultHora, t: 'Retornaram na última hora' },
      { l: 'Retornaram ANTES do planejado', v: ant.length, c: '#c62839', lista: ant, t: 'Retornaram antes do planejado' },
      { l: 'Retornaram sem previsão', v: semp.length, c: '#d68910', lista: semp, t: 'Retornaram sem previsão (sem data de reinício)' },
      { l: 'Retornaram no prazo', v: nop.length, c: '#168a47', lista: nop, t: 'Retornaram no prazo' }
    ];
    container.appendChild(h('div', { class: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3' }, kpis.map(function (k) {
      return U.kpiCard({ label: k.l, value: String(k.v), cor: k.c, onClick: function () { drill(k.t, k.lista); } });
    })));
    var nSus = ev.filter(function (e) { return e.tipo === 'SUSPENSAO'; }).length, nInf = ev.filter(function (e) { return e.origem === 'inferida'; }).length;
    var contagem = state.tipo === 'TODOS' ? '<b>' + nSus + '</b> suspensão(ões) e <b>' + (ev.length - nSus) + '</b> tramitação(ões) retornaram' : '<b>' + ev.length + '</b> ' + V.pl + ' retornaram';
    container.appendChild(h('div', { class: 'cr-nota', html: contagem + ' no período filtrado.' }));
    if (comAw) container.appendChild(h('div', { class: 'cr-nota', html: '<b>' + Math.round(ant.length / comAw * 100) + '%</b> voltaram antes da data prevista (' + ant.length + ' de ' + comAw + ').' }));

    /* ---------- 2 gráficos ---------- */
    var ORDEM = ['ANTECIPADO', 'SEM_PREVISAO', 'NO_PRAZO'];
    function series(classes) { return classes.map(function (c) { return { label: rotC(c), cor: CL[c].cor, classe: c }; }); }
    var grid = h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4' });

    // (1) a que horas voltaram para a fila
    var ccHora = U.chartCard('Retornos por horário do dia');
    (function () {
      var horas = [], i;
      for (i = 0; i < 24; i++) horas.push(('0' + i).slice(-2) + 'h');
      function hr(e) { return e.retorno.getHours(); }
      var sr = series(ORDEM).map(function (s) { return Object.assign(s, { data: horas.map(function (_, k) { return ev.filter(function (e) { return hr(e) === k && e.classe === s.classe; }).length; }) }); });
      ccHora.canvas.__draw = function () { U.seriesChart(ccHora.canvas, horas, sr, { onSeg: function (k, di) { var c = sr[di].classe; drill('Retornaram às ' + horas[k] + ' · ' + rotC(c), ev.filter(function (e) { return hr(e) === k && e.classe === c; })); } }); };
    })();

    // (2) uma visão só, trocando a dimensão (operador, caminho, motivo, prioridade, região, tipo)
    var dimsOk = DIMS.filter(function (d) { return !(d[4] && d[4].soTodos && state.tipo !== 'TODOS'); });
    var dimAtual = dimsOk.filter(function (d) { return d[0] === state.dim; })[0] || dimsOk[0];
    var swDim = h('div', { class: 'cr-sw-dim' }, [h('span', { class: 'cr-rot', text: 'AGRUPAR POR' }), h('div', { class: 'cr-chips' }, dimsOk.map(function (d) {
      return h('button', { type: 'button', class: 'op-chip' + (dimAtual[0] === d[0] ? ' on' : ''), text: d[1], onclick: function () { state.dim = d[0]; rerender(); } });
    }))]);
    var tituloDim = dimAtual[0] === 'operador' ? 'Por operador (' + V.quem + ')' : 'Por ' + dimAtual[1].toLowerCase();
    var ccDim = U.chartCard(tituloDim);
    ccDim.card.insertBefore(swDim, ccDim.card.children[1] || null);        // botões de visão numa linha própria (cabem todos, sem espremer o título)
    (function () {
      var chaveFn = dimAtual[2], rotuloFn = dimAtual[3], o = dimAtual[4] || {};
      var base = ev, classes = ORDEM;
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
    container.appendChild(h('div', { class: 'cr-sec', text: 'DETALHAMENTO' }));
    container.appendChild(barraAbas());
    var box = h('div', { class: 'cr-box' }); container.appendChild(box);
    if (state.aba === 'retornos') {
      var opcoes = [['TODAS', 'Todas']].concat(ORDEM.map(function (c) { return [c, rotC(c)]; }));
      box.appendChild(h('div', { class: 'cr-fg cr-fg-linha' }, [h('span', { class: 'cr-rot', text: 'SITUAÇÃO' }), h('div', { class: 'cr-chips' }, opcoes.map(function (o) {
        var n = o[0] === 'TODAS' ? ret.length : ret.filter(function (e) { return e.classe === o[0]; }).length;
        return h('button', { type: 'button', class: 'op-chip' + (state.classe === o[0] ? ' on' : ''), text: o[1] + ' ' + n, onclick: function () { state.classe = o[0]; rerender(); } });
      }))]));
      var lst = ret.filter(function (e) { return state.classe === 'TODAS' || e.classe === state.classe; });
      box.appendChild(lst.length ? tabelaEventos(lst) : h('div', { class: 'op-empty', text: 'Nenhum retorno com esses filtros.' }));
    } else if (state.aba === 'operadores') box.appendChild(rankingOperadores(ev, drill));
    else box.appendChild(painelNomes(res.catalogo, app));
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(container);
  };

  /* ---------- TSKs encerradas que voltaram à fila (reabertas) ---------- */
  var MOT = R.MOTIVOS_REABERTA, ORDEM_MOT = ['ALARME', 'TECNICO', 'MANUAL', 'SEM_REGISTRO'];
  function tabelaReab(lista) {
    var cols = ['TSK', 'Site', 'Prio', 'Região', 'Equipe', 'Encerrada por', 'Encerrada em', 'Reaberta em', 'Ficou encerrada', 'Motivo', 'Indício no diário', 'Voltou para', 'Ocorrências'];
    var tab = h('table', { class: 'trj-table cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, cols.map(function (c) { return h('th', { text: c }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    lista.slice(0, 600).forEach(function (e) {
      var g = grupoDe(e), solo = e.origem === 'diario';
      tb.appendChild(h('tr', { dataset: { osSel: e.os } }, [
        h('td', null, [h('span', { class: 'op-tsk cr-tsk', dataset: { os: e.os }, title: 'Clique: copiar a TSK · botão direito: fixar os detalhes', text: e.os })]),
        h('td', { text: e.site || '', title: 'END_ID ' + e.end }), h('td', { text: e.prio }), h('td', { text: regLabel(e.regiao) }),
        h('td', null, [g ? tag(g === 'FIXA' ? 'FIXA' : 'MÓVEL', g === 'FIXA' ? '#1f6fb5' : '#168a47', e.dj) : h('span', { class: 'tx', text: '—', title: e.dj || 'sem regra criadora' })]),
        h('td', { text: solo ? '—' : (e.quem || '—'), class: e.quemSistema && !solo ? 'cr-sis' : '' }),
        h('td', { text: solo ? '—' : fmtDt(e.encerradaEm), title: e.statusEnc === 'CANCELADA' ? 'Cancelada' : (solo ? '' : 'Concluída') }),
        h('td', null, [h('span', { text: fmtDt(e.reabertaEm) }), solo ? tag('SÓ DIÁRIO', '#6b7280', 'A linha de status (encerrada → reaberta) não está nos arquivos carregados; o retorno aparece só no diário de trabalho.') : null]),
        h('td', { text: solo || e.intervaloMin == null ? '—' : (e.intervaloMin <= 2 ? 'na hora' : durTxt(e.intervaloMin)) }),
        h('td', null, [tag(MOT[e.motivo].rot.toUpperCase(), MOT[e.motivo].cor)]),
        h('td', { text: e.indicio || '—', title: e.indicio || '', style: { maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
        h('td', { text: e.voltouPara ? e.voltouPara + (e.statusVolta ? ' · ' + (e.statusVolta === 'PENDENTE' ? 'pendente' : (e.statusVolta === 'INICIADO' ? 'iniciada' : 'não iniciada')) : '') : '—', title: e.voltouPara || '' }),
        h('td', { text: e.nReab > 1 ? e.nReab + '×' : '1×', style: { fontWeight: e.nReab > 1 ? '800' : '400', color: e.nReab > 1 ? '#c62839' : '' } })
      ]));
    });
    var wrap = h('div', { style: { overflowX: 'auto' } }, [tab]);
    if (lista.length > 600) wrap.appendChild(h('div', { class: 'cr-nota', text: 'Mostrando as 600 mais recentes de ' + lista.length + '. Use os filtros para refinar.' }));
    return wrap;
  }
  /* corpo da aba "Encerradas que voltaram": KPIs, 2 gráficos (por horário e por região, empilhados por motivo), filtro de motivo e tabela */
  function viewReabertas(container, evRe, rerender, agora) {
    function drillRe(titulo, lista) {
      U.openModal(titulo + ' — ' + lista.length, lista.length ? tabelaReab(lista) : h('div', { class: 'op-empty', text: 'Nada aqui.' }), { onCopy: function () { return lista.map(function (e) { return [e.os, e.site, e.prio, MOT[e.motivo].rot, fmtDt(e.reabertaEm), e.indicio].join(' · '); }).join('\n'); } });
    }
    var porTsk = {}; evRe.forEach(function (e) { porTsk[e.os] = Math.max(porTsk[e.os] || 0, e.nReab); });
    var tsks = Object.keys(porTsk), reinc = evRe.filter(function (e) { return e.nReab > 1; });
    var alarme = evRe.filter(function (e) { return e.motivo === 'ALARME'; }), tecn = evRe.filter(function (e) { return e.motivo === 'TECNICO'; }), hojeRe = evRe.filter(function (e) { return mesmoDia(e.reabertaEm, agora); });
    var kpis = [
      { l: 'Encerradas que voltaram', v: evRe.length, c: '#1f6fb5', lista: evRe, t: 'Encerradas que voltaram à fila' },
      { l: 'TSKs diferentes', v: tsks.length, c: '#7d3c98', lista: evRe, t: 'Encerradas que voltaram — todas' },
      { l: 'Retorno por alarme', v: alarme.length, c: '#c62839', lista: alarme, t: 'Retorno por alarme' },
      { l: 'Nota do técnico', v: tecn.length, c: '#1f6fb5', lista: tecn, t: 'Voltaram com nota do técnico' },
      { l: 'TSKs que voltaram 2+ vezes', v: reinc.length ? Object.keys(reinc.reduce(function (m, e) { m[e.os] = 1; return m; }, {})).length : 0, c: '#d68910', lista: reinc, t: 'TSKs que voltaram 2 ou mais vezes' },
      { l: 'Voltaram hoje', v: hojeRe.length, c: '#a569bd', lista: hojeRe, t: 'Voltaram hoje' }
    ];
    container.appendChild(h('div', { class: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3' }, kpis.map(function (k) {
      return U.kpiCard({ label: k.l, value: String(k.v), cor: k.c, onClick: function () { drillRe(k.t, k.lista); } });
    })));
    var nH = evRe.filter(function (e) { return e.origem === 'historico'; }).length;
    container.appendChild(h('div', { class: 'cr-nota', html: '<b>' + evRe.length + '</b> TSK(s) encerrada(s) voltaram para a fila no período filtrado' + (nH < evRe.length ? ' (' + (evRe.length - nH) + ' identificada(s) só pelo diário).' : '.') }));
    function seriesMot() { return ORDEM_MOT.map(function (m) { return { label: MOT[m].rot, cor: MOT[m].cor, motivo: m }; }); }
    var grid = h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4' });
    var ccH = U.chartCard('Voltaram à fila por horário do dia'), horas = [], i;
    for (i = 0; i < 24; i++) horas.push(('0' + i).slice(-2) + 'h');
    var srH = seriesMot().map(function (s) { return Object.assign(s, { data: horas.map(function (_, k) { return evRe.filter(function (e) { return e.reabertaEm.getHours() === k && e.motivo === s.motivo; }).length; }) }); });
    ccH.canvas.__draw = function () { U.seriesChart(ccH.canvas, horas, srH, { onSeg: function (k, di) { var m = srH[di].motivo; drillRe('Voltaram às ' + horas[k] + ' · ' + MOT[m].rot, evRe.filter(function (e) { return e.reabertaEm.getHours() === k && e.motivo === m; })); } }); };
    var ccR = U.chartCard('Volume por região'), tot = {}, cont = {};
    evRe.forEach(function (e) { var r = e.regiao || 'OTHERS'; tot[r] = (tot[r] || 0) + 1; (cont[r] = cont[r] || {})[e.motivo] = (cont[r][e.motivo] || 0) + 1; });
    var ks = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; }).slice(0, 12);
    var srR = seriesMot().map(function (s) { return Object.assign(s, { data: ks.map(function (k) { return (cont[k] && cont[k][s.motivo]) || 0; }) }); });
    ccR.canvas.__draw = function () { U.seriesChart(ccR.canvas, ks.map(regLabel), srR, { horizontal: true, onSeg: function (ix, di) { var m = srR[di].motivo, k = ks[ix]; drillRe(regLabel(k) + ' · ' + MOT[m].rot, evRe.filter(function (e) { return (e.regiao || 'OTHERS') === k && e.motivo === m; })); } }); };
    [ccH, ccR].forEach(function (cc) { grid.appendChild(cc.card); });
    container.appendChild(grid);
    [ccH, ccR].forEach(function (cc) { try { cc.canvas.__draw(); } catch (e) { console.error(e); } });
    var opcoes = [['TODOS', 'Todos']].concat(ORDEM_MOT.map(function (m) { return [m, MOT[m].rot]; }));
    container.appendChild(h('div', { class: 'cr-sec', text: 'DETALHAMENTO' }));
    container.appendChild(h('div', { class: 'cr-fg cr-fg-linha' }, [h('span', { class: 'cr-rot', text: 'MOTIVO' }), h('div', { class: 'cr-chips' }, opcoes.map(function (o) {
      var n = o[0] === 'TODOS' ? evRe.length : evRe.filter(function (e) { return e.motivo === o[0]; }).length;
      return h('button', { type: 'button', class: 'op-chip' + (state.motivoRe === o[0] ? ' on' : ''), text: o[1] + ' ' + n, onclick: function () { state.motivoRe = o[0]; rerender(); } });
    }))]));
    var lst = evRe.filter(function (e) { return state.motivoRe === 'TODOS' || e.motivo === state.motivoRe; });
    container.appendChild(h('div', { class: 'cr-box' }, [lst.length ? tabelaReab(lst) : h('div', { class: 'op-empty', text: 'Nenhuma TSK encerrada voltou à fila com esses filtros.' })]));
  }

  /* ---------- tabela de eventos ---------- */
  function tabelaEventos(lista) {
    var comTipo = state.tipo === 'TODOS';
    var cols = (comTipo ? ['Tipo'] : []).concat(['Operador', 'TSK', 'Site', 'Prio', 'Região', 'Equipe', 'Caminho', 'Motivo', 'Retornou em', 'Previsto (AW)', 'Situação']);
    var tab = h('table', { class: 'trj-table cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, cols.map(function (c) { return h('th', { text: c }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    lista.slice(0, 600).forEach(function (e) {
      var cels = [];
      if (comTipo) cels.push(h('td', null, [tag(e.tipo === 'SUSPENSAO' ? 'SUSPENSÃO' : 'TRAMITAÇÃO', R.TIPOS[e.tipo].cor, R.TIPOS[e.tipo].rot), e.origem === 'inferida' ? tag('INFERIDA', '#6b7280', 'Sem linha pendente no arquivo: identificada pela nota/previsão numa linha já em Não iniciado/Iniciado. Quem suspendeu/tramitou não aparece.') : null]));
      cels = cels.concat([
        h('td', { text: e.quem }), h('td', null, [h('span', { class: 'op-tsk cr-tsk', dataset: { os: e.os }, title: 'Clique: copiar a TSK · botão direito: fixar os detalhes', text: e.os })]), h('td', { text: e.site || '', title: 'END_ID ' + e.end }),
        h('td', { text: e.prio }), h('td', { text: regLabel(e.regiao) }), h('td', null, [grupoDe(e) ? tag(grupoDe(e) === 'FIXA' ? 'FIXA' : 'MÓVEL', grupoDe(e) === 'FIXA' ? '#1f6fb5' : '#168a47', e.dj) : h('span', { class: 'tx', text: '—', title: e.dj || 'sem regra criadora' })]), h('td', { text: nomeDe('caminho', e.caminho), title: e.caminho }),
        h('td', { text: nomeDe(e.tipo === 'SUSPENSAO' ? 'motivo' : 'tram', e.motivo || ''), title: [e.motivo, e.nota, e.area].filter(Boolean).join(' · ') }),
        h('td', { text: fmtDt(e.retorno) }), h('td', { text: fmtDt(e.previsto) }), h('td', null, [tagClasse(e)])
      ]);
      tb.appendChild(h('tr', { class: e.classe === 'ANTECIPADO' ? 'cr-alerta' : '', dataset: { osSel: e.os } }, cels));
    });
    var wrap = h('div', { style: { overflowX: 'auto' } }, [tab]);
    if (lista.length > 600) wrap.appendChild(h('div', { class: 'cr-nota', text: 'Mostrando os 600 mais recentes de ' + lista.length + '. Use os filtros para refinar.' }));
    return wrap;
  }

  function rankingOperadores(ev, drill) {
    var m = {};
    ev.forEach(function (e) { var o = m[e.quem] || (m[e.quem] = { quem: e.quem, tot: 0, ANTECIPADO: 0, SEM_PREVISAO: 0, NO_PRAZO: 0, sis: e.quemSistema }); o.tot++; o[e.classe]++; });
    var lista = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.ANTECIPADO - a.ANTECIPADO || b.tot - a.tot; });
    var tab = h('table', { class: 'trj-table cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, ['Operador', V.tot, 'Antes do planejado', 'Sem previsão', 'No prazo', '% antecipado'].map(function (c) { return h('th', { text: c }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    lista.forEach(function (o) {
      var comAw = o.ANTECIPADO + o.NO_PRAZO, pct = comAw ? Math.round(o.ANTECIPADO / comAw * 100) : null;
      function cel(v, classe, cor) { return h('td', null, [h('button', { type: 'button', class: 'cr-num', style: { color: v ? cor : 'var(--trj-muted)' }, text: String(v), onclick: function () { if (v) drill(o.quem + ' · ' + rotC(classe), ev.filter(function (e) { return e.quem === o.quem && e.classe === classe; })); } })]); }
      tb.appendChild(h('tr', null, [h('td', { text: o.quem, style: { fontWeight: '700' } }), h('td', { text: String(o.tot) }), cel(o.ANTECIPADO, 'ANTECIPADO', '#c62839'), cel(o.SEM_PREVISAO, 'SEM_PREVISAO', '#d68910'), cel(o.NO_PRAZO, 'NO_PRAZO', '#168a47'),
        h('td', null, [pct == null ? h('span', { class: 'tx', text: '—' }) : h('b', { style: { color: pct >= 50 ? '#c62839' : (pct >= 25 ? '#d68910' : '#168a47') }, text: pct + '%' })])]));
    });
    return h('div', { style: { overflowX: 'auto' } }, [tab, h('div', { class: 'cr-nota', text: '% antecipado: retornos antes da data prevista, entre os que tinham data prevista.' })]);
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
      var btn = h('button', { type: 'button', class: 'op-btn cr-btn-ico', title: 'Salvar (compartilhado com a equipe)', onclick: function () {
        btn.disabled = true;
        salvaApelido(l.tipo, l.valor, inp.value.trim()).then(function () { U.toast('Nome salvo', 'ok'); reRenderMantendoRolagem(app); }, function (e) { btn.disabled = false; U.toast('Salvo só neste navegador: ' + ((e && e.message) || e), 'err'); });
      } }, [ico('salvar'), 'SALVAR']);
      tb.appendChild(h('tr', { class: l.novo ? 'cr-novo' : '' }, [h('td', { text: l.rot }), h('td', { text: l.valor, style: { fontWeight: '700' } }), h('td', { text: String(l.n) }),
        h('td', null, [l.novo ? tag('NOVO — dê um nome', '#d68910') : tag('conhecido', '#6b7280')]), h('td', null, [h('div', { style: { display: 'flex', gap: '6px' } }, [inp, btn])])]));
    });
    return h('div', null, [h('div', { class: 'cr-nota', text: 'Dê um nome curto aos caminhos e motivos para os gráficos ficarem mais objetivos. O nome vale para toda a equipe.' }), h('div', { style: { overflowX: 'auto' } }, [tab])]);
  }
})(window.TRJ = window.TRJ || {});
