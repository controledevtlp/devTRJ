/* =====================================================================
 * dashboard-excel.js — "Extrair Excel" do Dashboard autenticado (ExcelJS)
 * ---------------------------------------------------------------------
 * Mesmo visual do Excel da tela do operador: aba Resumo com cartões e botões de menu, botão
 * "← Voltar ao menu" em cada aba, backlog de cada região (dentro do prazo no topo por prioridade,
 * depois as vencidas) e TSK em site fora com a linha inteira em vermelho.
 * Respeita os filtros do Dashboard: região, prioridade e FIXA / MÓVEL (regra criadora).
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, D = TRJ.domain;

  var XL = {
    navy: 'FF1F2937', laranja: 'FFFF8C00', linha: 'FFD9DCE3', zebra: 'FFF6F7FB', branco: 'FFFFFFFF', tinta: 'FF1F2937', suave: 'FF6B7280',
    verm: 'FFC62839', vermBg: 'FFFFC7CE', vermFg: 'FF9C0006', ambar: 'FFF5B041', verde: 'FF1E8449', verdeBg: 'FFD5F5E3', azul: 'FF1F6FB5', roxo: 'FF7D3C98', roxoBg: 'FFE8DAEF', cinza: 'FFE5E7EB'
  };
  var XL_PRIO = { P1: ['FFFDE2E4', 'FFB71C2E'], P2: ['FFFFE8D6', 'FFC2410C'], P3: ['FFFFF3CD', 'FF92400E'], P4: ['FFDCEBFA', 'FF1F6FB5'], P5: ['FFEDEEF1', 'FF4B5563'] };
  var XL_SIT = { 'Vencida': [XL.verm, XL.branco], 'Vence em até 2h': [XL.ambar, XL.tinta], 'No prazo': [XL.verdeBg, XL.verde], 'Pendenciada': [XL.roxoBg, XL.roxo], 'Sem prazo': [XL.cinza, 'FF4B5563'] };
  var XL_DATA = 'dd/mm/yyyy hh:mm';

  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  function fill(a) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: a } }; }
  function borda(a, est) { var s = { style: est || 'thin', color: { argb: a || XL.linha } }; return { top: s, left: s, bottom: s, right: s }; }
  function xd(d) { return d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000) : null; }   // ExcelJS grava em UTC: compensa o fuso
  function toDate(v) {
    if (!v) return null;
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime()) && D.parsePlatformDate) d = D.parsePlatformDate(v);
    return d && !isNaN(d.getTime()) ? d : null;
  }
  function prioNum(p) { var m = /\d+/.exec(p || ''); return m ? parseInt(m[0], 10) : 99; }
  function fmtDur(min) {
    var a = Math.abs(Math.round(min));
    if (a < 60) return a + 'min';
    var h = Math.floor(a / 60), m = a % 60;
    if (h < 48) return h + 'h' + (m ? ('0' + m).slice(-2) : '');
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }
  function fmtDt(d) { return d ? D.formatarDataCompacta(d) : '—'; }
  function regLabel(r) { return (C.REGIAO_LABELS && C.REGIAO_LABELS[r]) || r; }
  function regIdx(r) { var i = (C.REGIOES || []).indexOf(r); return r === 'OTHERS' ? 998 : (i < 0 ? 997 : i); }

  TRJ.pages.dashboardExcel = async function (d, pageData, filtros) {
    var ExcelJS = window.ExcelJS;
    if (!ExcelJS) throw new Error('A biblioteca ExcelJS não carregou.');
    filtros = filtros || {};
    var OP = TRJ.operador, now = Date.now(), wb = new ExcelJS.Workbook();
    wb.creator = 'Controle Operacional TRJ'; wb.created = new Date();
    var K = d.kpis || {}, tc = d.topCidades || {};

    /* ---- dados filtrados (mesmo critério do Dashboard) ---- */
    var prios = filtros.prioridades || [];
    var tasksAll = (pageData && pageData.tasksEnriched) || [], incAll = (pageData && pageData.incidentsEnriched) || [];
    function passa(t) {
      if (filtros.regiao && filtros.regiao !== 'TODAS' && (t.regiao || 'OTHERS') !== filtros.regiao) return false;
      if (prios.length && prios.indexOf(up(t.prioridade)) < 0) return false;
      if (filtros.grupo && filtros.grupo !== 'TODAS' && OP && OP.classificar(t.isocDJ).grupo !== filtros.grupo) return false;
      return true;
    }
    var tasksE = tasksAll.filter(passa);
    var sep = D.separarTicketsManuais(tasksE), corretivas = sep.tickets, manuais = sep.manuais;
    var dedup = D.dedupPorTsk(corretivas);
    var incAtivos = incAll.filter(function (i) {
      if ((i.statusTrat || 'ATIVO').toUpperCase() === 'RESOLVIDO') return false;
      return !(filtros.regiao && filtros.regiao !== 'TODAS') || (i.regiao || 'OTHERS') === filtros.regiao || (i.regiao || 'OTHERS') === 'OTHERS';
    });

    /* sites fora agrupados por END_ID (o mais antigo é a referência) */
    var grupos = {}, ordem = [];
    incAtivos.forEach(function (i) {
      var k = up(i.enderecoId);
      if (!k) { ordem.push([i]); return; }
      if (!grupos[k]) { grupos[k] = []; ordem.push(grupos[k]); }
      grupos[k].push(i);
    });
    var tskAberta = {};      // END_ID -> TSK corretiva aberta (backlog ou pendente)
    dedup.forEach(function (t) {
      var s = up(t.status), eid = up(t.enderecoId);
      if (eid && (s === 'NAO INICIADO' || s === 'NÃO INICIADO' || s === 'INICIADO' || s === 'PENDENTE') && !tskAberta[eid]) tskAberta[eid] = t;
    });
    var foraPorEnd = {};
    var sitesFora = ordem.map(function (g) {
      var a = g[0];
      g.forEach(function (x) { var da = toDate(a.horarioDt), db = toDate(x.horarioDt); if (db && (!da || db < da)) a = x; });
      var nomes = []; g.forEach(function (x) { if (x.site && nomes.indexOf(x.site) < 0) nomes.push(x.site); });
      var s = { inc: a, nomes: nomes, end: a.enderecoId || '', regiao: a.regiao || 'OTHERS', desde: toDate(a.horarioDt), tsk: tskAberta[up(a.enderecoId)] || null };
      if (s.end) foraPorEnd[up(s.end)] = s;
      return s;
    });

    /* ---- backlog (Não iniciado / Iniciado, dedup por TSK) + pendentes ---- */
    function ehBack(t) { var s = up(t.status); return s === 'NAO INICIADO' || s === 'NÃO INICIADO' || s === 'INICIADO'; }
    var backlog = dedup.filter(function (t) { return ehBack(t) || up(t.status) === 'PENDENTE'; }).map(function (t) {
      var venc = toDate(t.vencimentoCalc), pend = up(t.status) === 'PENDENTE';
      var upd = U.classificarUltimoBloco ? U.classificarUltimoBloco(t.motivoCancelamento) : { estado: 'sem' };
      return {
        t: t, os: t.osNumero || '', prio: up(t.prioridade) || '—', pend: pend, site: t.siteId || '', end: t.enderecoId || '', cidade: t.cidade || '',
        regiao: t.regiao || 'OTHERS', falha: t.tipoFalha || '', venc: venc, criacao: toDate(t.dataCriacaoAS) || toDate(t.dataCriacao),
        rest: venc ? Math.round((venc.getTime() - now) / 60000) : null, regra: OP ? OP.classificar(t.isocDJ) : { grupo: null, nome: t.isocDJ || '' },
        upd: upd, fora: foraPorEnd[up(t.enderecoId)] || null
      };
    });
    function sitDe(it) { if (it.pend) return 'Pendenciada'; if (it.rest == null) return 'Sem prazo'; return it.rest < 0 ? 'Vencida' : (it.rest <= 120 ? 'Vence em até 2h' : 'No prazo'); }
    function prazoTxt(it) { if (it.pend) return 'pendenciada'; if (it.rest == null) return 'sem prazo'; return (it.rest < 0 ? 'atrasada ' : 'vence em ') + fmtDur(it.rest); }
    /* dentro do prazo no topo (por prioridade), vencidas na sequência (por prioridade), sem prazo e pendenciadas no fim */
    function ordemBacklog(a, b) {
      function bk(it) { return it.pend ? 3 : (it.rest == null ? 2 : (it.rest >= 0 ? 0 : 1)); }
      var ba = bk(a), bb = bk(b); if (ba !== bb) return ba - bb;
      var dp = prioNum(a.prio) - prioNum(b.prio); if (dp) return dp;
      return (a.rest == null ? 9e9 : a.rest) - (b.rest == null ? 9e9 : b.rest);
    }

    /* ---- construtor genérico de aba ---- */
    var usados = { resumo: 1 };
    function nomeAba(n) {
      n = String(n).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31); var b = n, i = 2;
      while (usados[n.toLowerCase()]) n = b.slice(0, 28) + ' ' + (i++);
      usados[n.toLowerCase()] = 1; return n;
    }
    var RES = 'Resumo';
    function link(a) { return "#'" + a + "'!A1"; }
    var filtroTxt = [
      'Região: ' + (filtros.regiao && filtros.regiao !== 'TODAS' ? regLabel(filtros.regiao) : 'todas'),
      'Prioridades: ' + (prios.length ? prios.join(', ') : 'todas'),
      'Regra criadora: ' + (filtros.grupo === 'FIXA' ? 'FIXA' : (filtros.grupo === 'MOVEL' ? 'MÓVEL' : 'todas (FIXA + MÓVEL)'))
    ].join('   |   ');
    var carimbo = 'Extraído em ' + fmtDt(new Date()) + '   |   ' + filtroTxt;

    function aba(nome, titulo, sub, cor, cols, linhas, opt) {
      opt = opt || {};
      var ws = wb.addWorksheet(nome, { properties: { tabColor: { argb: cor || XL.laranja } }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      var n = cols.length;
      cols.forEach(function (c, i) { ws.getColumn(i + 1).width = c.w; });
      ws.mergeCells(1, 1, 1, Math.max(n, 2));
      var t = ws.getCell(1, 1); t.value = titulo;
      t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: XL.branco } }; t.fill = fill(XL.navy); t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;
      ws.mergeCells(2, 1, 2, Math.max(n, 2));
      var s2 = ws.getCell(2, 1); s2.value = sub || '';
      s2.font = { name: 'Calibri', size: 10, color: { argb: XL.suave }, italic: true }; s2.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(2).height = 18; ws.getRow(3).height = 22;
      function botao(col, txt, destino, bg) {
        var c = ws.getCell(3, col);
        c.value = { text: txt, hyperlink: link(destino), tooltip: 'Ir para ' + destino };
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XL.branco }, underline: false };
        c.fill = fill(bg || XL.azul); c.alignment = { vertical: 'middle', horizontal: 'center' }; c.border = borda('FF174F82', 'medium');
      }
      botao(1, '← Voltar ao menu', RES, XL.azul);
      (opt.atalhos || []).forEach(function (a, i) { botao(2 + i, a[0], a[1], XL.laranja); });
      var hr = ws.getRow(4); hr.height = 24;
      cols.forEach(function (c, i) {
        var cell = hr.getCell(i + 1); cell.value = c.h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XL.branco } }; cell.fill = fill(XL.navy);
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: XL.laranja } }, top: { style: 'thin', color: { argb: XL.navy } }, left: { style: 'thin', color: { argb: 'FF374151' } }, right: { style: 'thin', color: { argb: 'FF374151' } } };
      });
      linhas.forEach(function (ln, i) {
        var row = ws.getRow(5 + i), est = opt.linha ? opt.linha(ln) : null, zebra = i % 2 === 1;
        cols.forEach(function (c, j) {
          var cell = row.getCell(j + 1), v = c.v(ln);
          if (v instanceof Date) { cell.value = xd(v); cell.numFmt = XL_DATA; } else if (v === '' || v == null) cell.value = null; else cell.value = v;
          var fnt = { name: 'Calibri', size: 10, color: { argb: XL.tinta } }, bg = zebra ? XL.zebra : XL.branco;
          if (c.t === 'bold') fnt.bold = true;
          if (est) { bg = est.bg; fnt.color = { argb: est.fg }; if (est.bold) fnt.bold = true; }
          else if (c.t === 'prio' && XL_PRIO[v]) { bg = XL_PRIO[v][0]; fnt.color = { argb: XL_PRIO[v][1] }; fnt.bold = true; }
          else if (c.t === 'sit' && XL_SIT[v]) { bg = XL_SIT[v][0]; fnt.color = { argb: XL_SIT[v][1] }; fnt.bold = true; }
          if (opt.celula) { var o = opt.celula(ln, c, v); if (o) { if (o.bg) bg = o.bg; if (o.fg) fnt.color = { argb: o.fg }; if (o.bold) fnt.bold = true; } }
          cell.font = fnt; cell.fill = fill(bg);
          var centro = c.t === 'prio' || c.t === 'sit' || c.t === 'ctr' || c.t === 'data' || c.t === 'num';
          cell.alignment = { vertical: 'middle', horizontal: centro ? 'center' : 'left', wrapText: c.t === 'wrap' };
          cell.border = borda(est ? (est.fina || 'FFE08A93') : XL.linha);
          if (j === 0 && est) cell.border = Object.assign({}, cell.border, { left: { style: 'thick', color: { argb: est.borda || XL.verm } } });
          if (c.link) { var dest = c.link(ln); if (dest && v) { cell.value = { text: String(v), hyperlink: link(dest), tooltip: 'Ir para ' + dest }; fnt.color = { argb: XL.azul }; fnt.underline = true; cell.font = fnt; } }
        });
        row.height = 17;
      });
      if (linhas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + linhas.length, column: n } };
      else { ws.mergeCells(5, 1, 5, Math.max(n, 2)); var vz = ws.getCell(5, 1); vz.value = 'Nenhum registro com os filtros atuais.'; vz.font = { italic: true, color: { argb: XL.suave } }; vz.alignment = { horizontal: 'center' }; }
      return ws;
    }

    /* ---- colunas ---- */
    function colsBacklog(comRegiao) {
      var c = [];
      if (comRegiao) c.push({ h: 'Região', w: 14, v: function (it) { return regLabel(it.regiao); } });
      return c.concat([
        { h: 'Prioridade', w: 10, t: 'prio', v: function (it) { return it.prio; } },
        { h: 'TSK', w: 19, t: 'bold', v: function (it) { return it.os; } },
        { h: 'Site', w: 18, v: function (it) { return it.site; } },
        { h: 'END_ID', w: 14, v: function (it) { return it.end; } },
        { h: 'Cidade', w: 18, v: function (it) { return it.cidade; } },
        { h: 'Falha', w: 24, v: function (it) { return it.falha; } },
        { h: 'Status', w: 13, v: function (it) { return it.t.status || ''; } },
        { h: 'Situação', w: 16, t: 'sit', v: function (it) { return sitDe(it); } },
        { h: 'Prazo', w: 18, v: function (it) { return prazoTxt(it); } },
        { h: 'Vencimento', w: 17, t: 'data', v: function (it) { return it.venc; } },
        { h: 'Criação', w: 17, t: 'data', v: function (it) { return it.criacao; } },
        { h: 'Site fora', w: 17, t: 'bold', v: function (it) { return it.fora ? 'FORA' + (it.fora.desde ? ' há ' + fmtDur((now - it.fora.desde.getTime()) / 60000) : '') : ''; } },
        { h: 'Regra criadora', w: 34, v: function (it) { return it.regra.nome || ''; } },
        { h: 'Grupo', w: 11, t: 'ctr', v: function (it) { return it.regra.grupo ? (it.regra.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL') : '(sem class.)'; } },
        { h: 'Fila atual', w: 32, v: function (it) { return it.t.filaAtual || ''; } },
        { h: 'Último update', w: 17, t: 'data', v: function (it) { return it.upd && it.upd.estado !== 'sem' && it.upd.dt ? it.upd.dt : ''; } },
        { h: 'Quem atualizou', w: 24, v: function (it) { return it.upd && it.upd.estado !== 'sem' ? (it.upd.autor || '') : ''; } },
        { h: 'Mensagem do update', w: 64, t: 'wrap', v: function (it) { return it.upd && it.upd.estado !== 'sem' && it.upd.texto ? String(it.upd.texto).replace(/\s+/g, ' ').slice(0, 500) : ''; } }
      ]);
    }
    function estiloTsk(it) { return it.fora ? { bg: XL.vermBg, fg: XL.vermFg, bold: true } : null; }
    function colsLista(cols) {   // colunas simples: [chave, título, largura, tipo]
      return cols.map(function (c) {
        return { h: c[1], w: c[2], t: c[3], v: function (r) {
          var v = r[c[0]]; if (v == null) return '';
          if (c[3] === 'data') return toDate(v) || '';
          return v;
        } };
      });
    }

    /* ---- nomes das abas (Resumo é criada primeiro) ---- */
    var wsRes = wb.addWorksheet(RES, { properties: { tabColor: { argb: XL.laranja } }, views: [{ showGridLines: false }] });
    var porRegiao = {};
    backlog.forEach(function (it) { (porRegiao[it.regiao] = porRegiao[it.regiao] || []).push(it); });
    var regsComFila = Object.keys(porRegiao).sort(function (a, b) { return regIdx(a) - regIdx(b); });
    var abaReg = {};
    regsComFila.forEach(function (r) { abaReg[r] = nomeAba('Backlog ' + regLabel(r)); });
    var nBack = nomeAba('Backlog geral'), nVenc = nomeAba('Vencidas'), nSites = nomeAba('Sites fora'), nConc = nomeAba('Concluídas'), nCanc = nomeAba('Canceladas'),
        nMan = nomeAba('Atividades manuais'), nSla = nomeAba('SLA por região'), nPrazo = nomeAba('Prazos a vencer'), nAging = nomeAba('Aging backlog'),
        nProd = nomeAba('Produtividade');

    /* ---- abas de backlog ---- */
    var backOrd = backlog.slice().sort(function (a, b) { return regIdx(a.regiao) - regIdx(b.regiao) || ordemBacklog(a, b); });
    aba(nBack, 'Backlog geral — todas as regiões', carimbo + '   |   linhas em VERMELHO = TSK em site fora', XL.laranja, colsBacklog(true), backOrd,
      { linha: estiloTsk, atalhos: [['Vencidas ›', nVenc], ['Sites fora ›', nSites]] });
    regsComFila.forEach(function (r) {
      var l = porRegiao[r].slice().sort(ordemBacklog);
      var nv = l.filter(function (it) { return !it.pend && it.rest != null && it.rest < 0; }).length, nf = l.filter(function (it) { return it.fora; }).length;
      aba(abaReg[r], 'Backlog — ' + regLabel(r), l.length + ' TSKs · ' + nv + ' vencidas · ' + nf + ' em site fora (linhas vermelhas)  |  dentro do prazo no topo (por prioridade), vencidas na sequência (por prioridade)',
        XL.azul, colsBacklog(false), l, { linha: estiloTsk, atalhos: [['Sites fora ›', nSites]] });
    });
    var vencidas = backOrd.filter(function (it) { return !it.pend && it.rest != null && it.rest < 0; }).sort(function (a, b) { return prioNum(a.prio) - prioNum(b.prio) || a.rest - b.rest; });
    aba(nVenc, 'Somente vencidas', carimbo, XL.verm, colsBacklog(true), vencidas, { linha: estiloTsk });

    /* ---- sites fora ---- */
    var sfOrd = sitesFora.slice().sort(function (a, b) { return (!!b.tsk - !!a.tsk) || ((a.desde ? a.desde.getTime() : 9e15) - (b.desde ? b.desde.getTime() : 9e15)); });
    aba(nSites, 'Sites fora', carimbo + '   |   verde = com TSK aberta · vermelho = sem TSK (precisa abrir/acionar)', XL.verm, [
      { h: 'Região', w: 14, v: function (s) { return regLabel(s.regiao); } },
      { h: 'Situação', w: 15, t: 'bold', v: function (s) { return s.tsk ? 'COM TSK' : 'SEM TSK'; } },
      { h: 'Site(s)', w: 26, t: 'bold', v: function (s) { return s.nomes.join(', '); } },
      { h: 'END_ID', w: 14, v: function (s) { return s.end; } },
      { h: 'Cidade/UF', w: 22, v: function (s) { return s.inc.cidadeUf || s.inc.cidade || ''; } },
      { h: 'Fora há', w: 11, t: 'ctr', v: function (s) { return s.desde ? fmtDur((now - s.desde.getTime()) / 60000) : ''; } },
      { h: 'Fora desde', w: 17, t: 'data', v: function (s) { return s.desde || ''; } },
      { h: 'Causa', w: 26, v: function (s) { return s.inc.causa || ''; } },
      { h: 'Detalhe', w: 56, t: 'wrap', v: function (s) { return String(s.inc.detalhe || '').replace(/\s+/g, ' ').slice(0, 300); } },
      { h: 'TSK aberta', w: 19, t: 'bold', v: function (s) { return s.tsk ? s.tsk.osNumero : ''; } },
      { h: 'Status TSK', w: 13, v: function (s) { return s.tsk ? (s.tsk.status || '') : ''; } },
      { h: 'Prioridade', w: 10, t: 'prio', v: function (s) { return s.tsk ? up(s.tsk.prioridade) : ''; } },
      { h: 'Vencimento', w: 17, t: 'data', v: function (s) { return s.tsk ? (toDate(s.tsk.vencimentoCalc) || '') : ''; } },
      { h: 'Fila atual', w: 32, v: function (s) { return s.tsk ? (s.tsk.filaAtual || '') : ''; } }
    ], sfOrd, {
      linha: function (s) { return s.tsk ? { bg: XL.verdeBg, fg: XL.verde, bold: false, borda: XL.verde, fina: 'FFA9DFBF' } : { bg: XL.vermBg, fg: XL.vermFg, bold: true }; },
      celula: function (s, c) { if (c.h === 'Situação') return s.tsk ? { bg: XL.verde, fg: XL.branco, bold: true } : { bg: XL.verm, fg: XL.branco, bold: true }; return null; }
    });

    /* ---- concluídas / canceladas / manuais ---- */
    var concl = corretivas.filter(function (t) { var s = up(t.status); return s === 'CONCLUÍDA' || s === 'CONCLUIDA'; });
    aba(nConc, 'Concluídas', carimbo, XL.verde, colsLista([['osNumero', 'TSK', 20, 'bold'], ['prioridade', 'Prioridade', 11, 'prio'], ['regiao', 'Região', 14], ['cidade', 'Cidade', 20], ['enderecoId', 'END_ID', 16],
      ['siteId', 'Site', 16], ['tipoFalha', 'Tipo de falha', 22], ['filaAtual', 'Fila atual', 36], ['dataCriacao', 'Criação', 17, 'data'], ['fimCalc', 'Encerramento', 17, 'data'],
      ['vencimentoCalc', 'Vencimento SLA', 17, 'data'], ['statusSla', 'Status SLA', 16, 'ctr']]), concl, {
      celula: function (r, c, v) { if (c.h === 'Status SLA') return /FORA/.test(up(v)) ? { bg: XL.vermBg, fg: XL.vermFg, bold: true } : (v ? { bg: XL.verdeBg, fg: XL.verde, bold: true } : null); return null; } });
    var cancel = corretivas.filter(function (t) { var s = up(t.status); return s === 'CANCELADA' || s === 'CANCELADO'; }).map(function (t) {
      return Object.assign({}, t, { tipoCancelamento: up(t.motivoCancelamento).indexOf('ASSOCIA') >= 0 ? 'ASSOCIAÇÃO' : 'AUTOMAÇÃO' });
    });
    aba(nCanc, 'Canceladas', carimbo, XL.suave, colsLista([['osNumero', 'TSK', 20, 'bold'], ['tipoCancelamento', 'Tipo cancelamento', 20, 'ctr'], ['prioridade', 'Prioridade', 11, 'prio'],
      ['regiao', 'Região', 14], ['cidade', 'Cidade', 20], ['enderecoId', 'END_ID', 16], ['siteId', 'Site', 16], ['tipoFalha', 'Tipo de falha', 22], ['filaAtual', 'Fila atual', 36], ['dataCriacao', 'Criação', 17, 'data']]), cancel);
    aba(nMan, 'Atividades manuais', carimbo, XL.roxo, colsLista([['osNumero', 'TSK', 20, 'bold'], ['tipoAtividade', 'Tipo de atividade', 30], ['status', 'Status', 14], ['regiao', 'Região', 14], ['cidade', 'Cidade', 20],
      ['enderecoId', 'END_ID', 16], ['siteId', 'Site', 16], ['filaAtual', 'Fila atual', 36], ['dataCriacao', 'Criação', 17, 'data']]), manuais);

    /* ---- métricas dos gráficos ---- */
    aba(nSla, 'SLA por região (backlog)', carimbo, XL.azul, [
      { h: 'Região', w: 20, t: 'bold', v: function (r) { return r.label; }, link: function (r) { return abaReg[r.regiao]; } },
      { h: 'Dentro do SLA', w: 16, t: 'num', v: function (r) { return r.dentro; } }, { h: 'Fora do SLA', w: 16, t: 'num', v: function (r) { return r.fora; } },
      { h: '% fora', w: 11, t: 'num', v: function (r) { return (r.dentro + r.fora) ? Math.round(r.fora / (r.dentro + r.fora) * 1000) / 10 : 0; } }
    ], d.slaPorRegiao || [], { celula: function (r, c, v) {
      if (c.h === '% fora') return v >= 50 ? { bg: XL.verm, fg: XL.branco, bold: true } : (v >= 25 ? { bg: XL.ambar, fg: XL.tinta, bold: true } : { bg: XL.verdeBg, fg: XL.verde, bold: true });
      if (c.h === 'Fora do SLA' && v > 0) return { fg: XL.verm, bold: true }; return null; } });
    aba(nPrazo, 'Prazos a vencer', carimbo, XL.ambar, [{ h: 'Faixa', w: 18, t: 'bold', v: function (r) { return r.label; } }, { h: 'Total', w: 10, t: 'num', v: function (r) { return r.total; } }], d.prazosVencimento || []);
    aba(nAging, 'Aging do backlog', carimbo, XL.ambar, [{ h: 'Faixa', w: 18, t: 'bold', v: function (r) { return r.label; } }, { h: 'Total', w: 10, t: 'num', v: function (r) { return r.total; } }], d.aging || []);
    aba(nProd, 'Produtividade', carimbo, XL.verde, [
      { h: 'Categoria', w: 20, t: 'bold', v: function (r) { return r.categoria; } }, { h: 'Dentro do SLA', w: 16, t: 'num', v: function (r) { return r.dentro; } },
      { h: 'Fora do SLA', w: 16, t: 'num', v: function (r) { return r.fora; } }, { h: 'Preditiva', w: 14, t: 'num', v: function (r) { return r.preditiva; } }
    ], d.produtividade || []);

    /* ---- RESUMO: cartões + menu ---- */
    var ws = wsRes, NC = 12, i;
    for (i = 1; i <= NC; i++) ws.getColumn(i).width = 14;
    ws.mergeCells('A1:L1');
    var c1 = ws.getCell('A1'); c1.value = 'DASHBOARD OPERACIONAL TRJ — Resumo';
    c1.font = { name: 'Calibri', size: 22, bold: true, color: { argb: XL.branco } }; c1.fill = fill(XL.navy); c1.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(1).height = 42;
    ws.mergeCells('A2:L2'); ws.getCell('A2').fill = fill(XL.laranja); ws.getRow(2).height = 5;
    ws.mergeCells('A3:L3'); var c3 = ws.getCell('A3'); c3.value = 'Extraído em ' + fmtDt(new Date());
    c3.font = { size: 10, color: { argb: XL.suave } }; c3.alignment = { indent: 1, vertical: 'middle' }; ws.getRow(3).height = 18;
    ws.mergeCells('A4:L4'); var c4 = ws.getCell('A4'); c4.value = 'Filtros aplicados:  ' + filtroTxt;
    c4.font = { size: 10, bold: true, color: { argb: XL.tinta } }; c4.alignment = { indent: 1, vertical: 'middle' }; ws.getRow(4).height = 18;
    function n(v) { return v || 0; }
    var nFx = backlog.filter(function (it) { return !it.pend && it.regra.grupo === 'FIXA'; }).length, nMv = backlog.filter(function (it) { return !it.pend && it.regra.grupo === 'MOVEL'; }).length;
    var nSem = backlog.filter(function (it) { return !it.pend && !it.regra.grupo; }).length;
    var nForaTsk = backlog.filter(function (it) { return it.fora; }).length, nSemTsk = sitesFora.filter(function (s) { return !s.tsk; }).length;
    function cartao(linha, col, rotulo, valor, cor, sub) {
      ws.mergeCells(linha, col, linha, col + 1); ws.mergeCells(linha + 1, col, linha + 1, col + 1); ws.mergeCells(linha + 2, col, linha + 2, col + 1);
      var a = ws.getCell(linha, col), b = ws.getCell(linha + 1, col), c = ws.getCell(linha + 2, col);
      a.value = rotulo.toUpperCase(); a.font = { size: 9, bold: true, color: { argb: XL.suave } }; a.alignment = { horizontal: 'center', vertical: 'middle' };
      b.value = valor; b.font = { size: 26, bold: true, color: { argb: cor } }; b.alignment = { horizontal: 'center', vertical: 'middle' };
      c.value = sub || ''; c.font = { size: 9, color: { argb: XL.suave } }; c.alignment = { horizontal: 'center', vertical: 'middle' };
      [a, b, c].forEach(function (x) { x.fill = fill('FFF3F4F6'); });
      var tl = { style: 'thin', color: { argb: XL.linha } };
      for (var k = 0; k < 2; k++) {
        var b1 = { top: { style: 'thick', color: { argb: cor } } }, b2 = {}, b3 = { bottom: tl };
        if (k === 0) { b1.left = tl; b2.left = tl; b3.left = tl; } else { b1.right = tl; b2.right = tl; b3.right = tl; }
        ws.getCell(linha, col + k).border = b1; ws.getCell(linha + 1, col + k).border = b2; ws.getCell(linha + 2, col + k).border = b3;
      }
    }
    [6, 7, 8, 10, 11, 12].forEach(function (r, idx) { ws.getRow(r).height = [20, 38, 18, 20, 38, 18][idx]; });
    ws.getRow(5).height = 8; ws.getRow(9).height = 8;
    cartao(6, 1, 'Fora do SLA', n(K.foraSla), XL.verm, 'backlog');
    cartao(6, 3, 'Backlog total', n(K.backlogTotal), XL.laranja, 'não iniciado + iniciado');
    cartao(6, 5, 'Backlog indefinido', n(K.backlogIndef), XL.vermFg, 'sem SLA definido');
    cartao(6, 7, 'Preditiva', n(K.preditiva), 'FFD68910', '');
    cartao(6, 9, 'Produtividade', n(K.produtividade), XL.verde, 'concluídas');
    cartao(6, 11, 'SLA geral', Number(n(K.slaGeral)).toFixed(1) + '%', XL.verde, 'concluídas dentro do prazo');
    cartao(10, 1, 'Sites fora', n(tc.totalSitesFora) || sitesFora.length, XL.verm, nSemTsk + ' sem TSK');
    cartao(10, 3, 'TSKs em site fora', nForaTsk, XL.verm, 'linhas vermelhas');
    cartao(10, 5, 'FIXA', nFx, XL.azul, 'backlog por regra criadora');
    cartao(10, 7, 'MÓVEL', nMv, XL.verde, 'backlog por regra criadora');
    cartao(10, 9, 'Sem classificação', nSem, XL.suave, 'regra criadora não reconhecida');
    cartao(10, 11, 'GMG (faturável)', n(K.gmg), 'FFB85A00', '');

    var r0 = 14;
    ws.mergeCells(r0, 1, r0, NC);
    var mh = ws.getCell(r0, 1); mh.value = 'MENU — clique no botão para ir à aba (cada aba tem o botão “← Voltar ao menu”)';
    mh.font = { size: 11, bold: true, color: { argb: XL.branco } }; mh.fill = fill(XL.laranja); mh.alignment = { indent: 1, vertical: 'middle' }; ws.getRow(r0).height = 22;
    var menu = [[nBack, backlog.length, 'Backlog de todas as regiões — dentro do prazo no topo. TSK em site fora em vermelho.', XL.laranja], [nVenc, vencidas.length, 'Só as vencidas, da prioridade mais alta para a mais baixa.', XL.verm]];
    regsComFila.forEach(function (r) {
      var l = porRegiao[r], nf = l.filter(function (it) { return it.fora; }).length;
      menu.push([abaReg[r], l.length, 'Backlog completo de ' + regLabel(r) + (nf ? ' — ' + nf + ' TSK(s) em site fora (vermelho)' : '') + '.', XL.azul]);
    });
    menu.push([nSites, sitesFora.length, 'Sites fora cruzados com a TSK aberta (verde = com TSK · vermelho = sem TSK).', XL.verm]);
    menu.push([nConc, concl.length, 'TSKs concluídas, com o status do SLA.', XL.verde]);
    menu.push([nCanc, cancel.length, 'TSKs canceladas (associação x automação).', XL.suave]);
    menu.push([nMan, manuais.length, 'Atividades manuais (não corretivas).', XL.roxo]);
    menu.push([nSla, (d.slaPorRegiao || []).length, 'SLA do backlog por região (com link para o backlog de cada uma).', XL.azul]);
    menu.push([nPrazo, (d.prazosVencimento || []).length, 'Prazos a vencer por faixa de tempo.', XL.ambar]);
    menu.push([nAging, (d.aging || []).length, 'Aging do backlog.', XL.ambar]);
    menu.push([nProd, (d.produtividade || []).length, 'Produtividade por categoria.', XL.verde]);
    menu.forEach(function (m, idx) {
      var r = r0 + 1 + idx; ws.getRow(r).height = 25;
      ws.mergeCells(r, 1, r, 3); ws.mergeCells(r, 5, r, NC);
      var b = ws.getCell(r, 1); b.value = { text: '➜  ' + m[0], hyperlink: link(m[0]), tooltip: 'Ir para ' + m[0] };
      b.font = { size: 11, bold: true, color: { argb: XL.branco }, underline: false }; b.fill = fill(m[3]); b.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }; b.border = borda(XL.branco, 'medium');
      var nn = ws.getCell(r, 4); nn.value = m[1]; nn.numFmt = '#,##0" linhas"'; nn.font = { size: 10, bold: true, color: { argb: XL.tinta } }; nn.alignment = { horizontal: 'center', vertical: 'middle' }; nn.fill = fill('FFF3F4F6');
      var dd = ws.getCell(r, 5); dd.value = m[2]; dd.font = { size: 10, color: { argb: XL.suave } }; dd.alignment = { vertical: 'middle', indent: 1, wrapText: true };
    });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    var buf = await wb.xlsx.writeBuffer();
    var p2 = function (x) { return ('0' + x).slice(-2) }, d0 = new Date();
    var nome = 'Dashboard_TRJ_' + d0.getFullYear() + p2(d0.getMonth() + 1) + p2(d0.getDate()) + '_' + p2(d0.getHours()) + p2(d0.getMinutes()) + '.xlsx';
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return { abas: wb.worksheets.length, backlog: backlog.length, sitesFora: sitesFora.length };
  };
})(window.TRJ = window.TRJ || {});
