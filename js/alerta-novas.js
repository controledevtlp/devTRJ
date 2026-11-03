/* =====================================================================
 * alerta-novas.js — TSKs NOVAS aguardando o 1º update (compartilhado: link do operador e dashboard público)
 * ---------------------------------------------------------------------
 * "Nova" = apareceu no snapshot depois da primeira abertura neste aparelho e ainda não tem nenhum update.
 * Continua nova até receber o PRIMEIRO update (ou sair da fila). A primeira abertura só registra o que já existe.
 *
 *   AN.detector(prefixo)   regra de "nova" + memória no aparelho (localStorage). Usado pelo operador.js.
 *   AN.painel(prefixo)     detector + lista filtrada + FAIXA VISUAL (sem som) + chips de prioridade. Usado pelo dashboard.
 *
 * Escopo do alerta (igual ao do operador): região(ões) + equipe FIXA/MÓVEL + prioridades escolhidas.
 * Sem filtro de região / equipe, vale para todas.
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var U = TRJ.ui, D = TRJ.domain, OP = TRJ.operador, C = TRJ.constants, h = U.h;
  var AN = TRJ.alertaNovas = {};
  AN.PRIOS = ['P1', 'P2', 'P3', 'P4', 'P5', 'S/P'];                 // "S/P" = TSK sem prioridade
  var PRIO_COR = { P1: '#c62839', P2: '#d35400', P3: '#b85a00', P4: '#1f6fb5', P5: '#6b7280' };

  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  AN.chavePrio = function (prio) { return /^P[1-5]$/.test(prio) ? prio : 'S/P'; };

  /* ---------- núcleo ---------- */
  AN.detector = function (prefixo) {
    var LS_V = prefixo + '_vistas', LS_N = prefixo + '_novas';
    var vistas = lsGet(LS_V), novas = lsGet(LS_N) || {};            // os -> instante em que foi vista / detectada como nova
    return {
      novas: novas,                                                  // mesmo objeto, alterado no lugar
      ehNova: function (os) { return !!novas[up(os)]; },
      /* itens = TODAS as TSKs corretivas da fila: [{ os, pend, semUpd }]. Devolve as chaves (os) que viraram novas AGORA. */
      detectar: function (itens) {
        var agora = Date.now(), primeira = !vistas, achadas = [], por = {};
        vistas = vistas || {};
        itens.forEach(function (it) {
          if (!it.os) return;
          por[it.os] = it;
          if (it.pend || (it.os in vistas)) return;
          vistas[it.os] = agora;
          if (!primeira && it.semUpd && !(it.os in novas)) { novas[it.os] = agora; achadas.push(it.os); }
        });
        Object.keys(novas).forEach(function (os) {                   // sai quando recebe o 1º update ou deixa a fila
          var it = por[os];
          if (!it || it.pend || !it.semUpd) delete novas[os];
        });
        Object.keys(vistas).forEach(function (os) { if (!por[os] && agora - vistas[os] > 72 * 3600000) delete vistas[os]; });
        lsSet(LS_V, vistas); lsSet(LS_N, novas);
        return achadas;
      }
    };
  };

  /* TSKs "para acionamento" a partir das tarefas do snapshot (mesmo critério do operador: corretivas abertas, sem as pendenciadas) */
  AN.itens = function (tasks) {
    var out = [];
    D.dedupPorTsk(tasks || []).forEach(function (t) {
      var st = D.normalize(t.status);
      if (!(st === 'NAO INICIADO' || st === 'INICIADO') || !D.isTicketCorretiva(t.tipoAtividade) || !t.dataCriacaoAS) return;
      var upd = U.classificarUltimoBloco ? U.classificarUltimoBloco(t.motivoCancelamento) : { estado: 'sem' };
      var regra = OP && OP.classificar ? OP.classificar(t.isocDJ) : { grupo: null };
      out.push({ os: up(t.osNumero), osRaw: t.osNumero || '', prio: up(t.prioridade) || '—', site: t.siteId || '', end: t.enderecoId || '', regiao: t.regiao || 'OTHERS',
        grupo: regra.grupo || null, semUpd: upd.estado === 'sem', pend: false, criacao: D.parsePlatformDate(t.dataCriacaoAS) });
    });
    return out;
  };

  /* ---------- painel (dashboard): detector + faixa visual ---------- */
  AN.painel = function (prefixo) {
    var det = AN.detector(prefixo), LS_P = prefixo + '_alerta_prios', itens = [];
    var prios = (lsGet(LS_P) || AN.PRIOS).filter(function (p) { return AN.PRIOS.indexOf(p) >= 0; });
    function rotRegiao(r) { return (C && C.REGIAO_LABELS && C.REGIAO_LABELS[r]) || r; }
    var api = {
      /* chamar a cada snapshot novo; devolve quantas TSKs viraram novas agora */
      atualizar: function (tasks) { itens = AN.itens(tasks); return det.detectar(itens).length; },
      prios: function () { return prios.slice(); },
      /* escopo = { regioes: [] (vazio = todas), grupo: 'TODAS' | 'FIXA' | 'MOVEL' } */
      pendentes: function (escopo) {
        escopo = escopo || {};
        var regs = escopo.regioes || [], grupo = escopo.grupo || 'TODAS';
        return itens.filter(function (it) {
          return det.ehNova(it.os) && (!regs.length || regs.indexOf(it.regiao) >= 0) && (grupo === 'TODAS' || it.grupo === grupo) && prios.indexOf(AN.chavePrio(it.prio)) >= 0;
        }).sort(function (a, b) { return (parseInt(/\d/.exec(a.prio) || 99, 10) - parseInt(/\d/.exec(b.prio) || 99, 10)) || ((a.criacao ? a.criacao.getTime() : 0) - (b.criacao ? b.criacao.getTime() : 0)); });
      },
      /* "ALERTAR  P1 P2 P3 P4 P5 S/P": quais prioridades entram no alerta (fica guardado no aparelho) */
      controlePrios: function (aoMudar) {
        return h('span', { class: 'op-aprios', title: 'Prioridades das TSKs novas que entram no alerta. "S/P" = TSK sem prioridade.' },
          [h('span', { class: 'op-lbl', text: 'ALERTAR' })].concat(AN.PRIOS.map(function (p) {
            return h('button', { class: 'op-chip' + (prios.indexOf(p) >= 0 ? ' on' : ''), type: 'button', text: p, onclick: function () {
              var i = prios.indexOf(p); if (i >= 0) prios.splice(i, 1); else prios.push(p);
              lsSet(LS_P, prios); if (aoMudar) aoMudar();
            } });
          })));
      },
      /* faixa vermelha (só visual) com as TSKs novas do escopo; null quando não há nenhuma */
      faixa: function (escopo, aoMudar, opcoes) {
        var lista = api.pendentes(escopo); if (!lista.length) return null;
        escopo = escopo || {};
        var esc = (escopo.regioes && escopo.regioes.length) ? escopo.regioes.map(rotRegiao).join(' + ') : 'todas as regiões';
        if (escopo.grupo && escopo.grupo !== 'TODAS') esc += ' · ' + (escopo.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL');
        var chips = lista.slice(0, 12).map(function (it) {
          return h('span', { class: 'op-achip' }, [
            h('b', { style: { color: PRIO_COR[it.prio] || 'inherit' }, text: it.prio }),
            h('span', { class: 'op-tsk', style: { cursor: 'pointer' }, title: 'Clique para copiar a TSK', text: it.osRaw, onclick: function () { U.copyText(it.osRaw, it.osRaw + ' copiada'); } }),
            h('span', { text: it.site || it.end || '—' })
          ]);
        });
        if (lista.length > 12) chips.push(h('span', { class: 'op-achip', text: '+ ' + (lista.length - 12) }));
        return h('div', { class: 'op-alerta' }, [
          h('span', { class: 'op-sirene' }),
          h('div', { class: 'op-ainfo' }, [
            h('b', { text: lista.length + (lista.length > 1 ? ' NOVAS TSKS' : ' NOVA TSK') + ' PARA ACIONAMENTO' }),
            h('span', { class: 'op-aesc', text: ' · ' + esc + ' · aguardando o 1º update' }),
            h('div', { class: 'op-achips' }, chips)
          ]),
          (opcoes && opcoes.semControle) ? null : h('div', { class: 'op-aacts' }, [api.controlePrios(aoMudar)])      // semControle: a tela já mostra o seletor em outro lugar
        ]);
      },
      /* título da aba piscando enquanto houver TSK nova no escopo atual */
      piscarTitulo: function (getEscopo) {
        var base = document.title, alt = false;
        setInterval(function () {
          var n = api.pendentes(getEscopo()).length;
          if (document.title !== base && !/^\(!\)/.test(document.title)) base = document.title;
          if (n) { alt = !alt; document.title = alt ? '(!) ' + n + (n > 1 ? ' NOVAS' : ' NOVA') + ' - ' + base : base; }
          else if (document.title !== base) document.title = base;
        }, 1500);
      }
    };
    return api;
  };
})(window.TRJ = window.TRJ || {});
