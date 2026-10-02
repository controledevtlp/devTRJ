/* =====================================================================
 * produtividade.js — Aba de Produtividade Operacional
 * Encerramentos por dia (dentro/fora SLA, CCI vs Campo) + Reincidentes
 * Histórico persistido em localStorage + pasta "Produtividade" da conexão
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U    = TRJ.ui;
  var D    = TRJ.domain;
  var C    = TRJ.constants;
  var Comp = TRJ.compute;
  var FS   = TRJ.files;
  var h    = U.h;

  var LS_KEY = 'trj_prod_hist_v1'; // localStorage key para histórico diário
  var _charts = [];
  var _state  = { periodo: 30, regiao: 'TODAS', prioridade: 'TODAS' };

  function destroyLocalCharts() {
    _charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    _charts = [];
  }

  // ── Tema ───────────────────────────────────────────────────────────
  var TOOLTIP_STYLE = {
    backgroundColor: '#1a1a24', titleColor: '#ff8c00', bodyColor: '#f0f0f0',
    borderColor: 'rgba(255,140,0,0.4)', borderWidth: 1, padding: 10, cornerRadius: 8
  };
  function gridClr() {
    return document.documentElement.getAttribute('data-theme') === 'light'
      ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
  }
  function tickClr() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? '#5a5d6b' : '#9a9aa3';
  }

  // ── Converter fimCalc (Date | string | number) → 'YYYY-MM-DD' local ─
  function toIsoDay(v) {
    if (!v) return null;
    var dt = (v instanceof Date) ? v : new Date(v);
    if (isNaN(dt.getTime())) return null;
    var y  = dt.getFullYear();
    var m  = ('0' + (dt.getMonth() + 1)).slice(-2);
    var d  = ('0' + dt.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }

  function fmtDia(isoDate) {
    var p = (isoDate || '').split('-');
    return p.length >= 3 ? p[2] + '/' + p[1] : isoDate;
  }

  function isConcluida(t) {
    var s = (t.status || '').toUpperCase();
    return s === 'CONCLUÍDA' || s === 'CONCLUIDA';
  }

  function isBacklog(t) {
    var s = (t.status || '').toUpperCase().replace('Ã', 'A');
    return s === 'NAO INICIADO' || s === 'INICIADO' || s === 'NÃO INICIADO';
  }

  function dentroSla(t) {
    if (!t.fimCalc || !t.vencimentoCalc) return false;
    return new Date(t.fimCalc).getTime() <= new Date(t.vencimentoCalc).getTime();
  }

  function pct(num, den) { return den > 0 ? Math.round(num / den * 100) : 0; }

  // ── localStorage: histórico diário ────────────────────────────────
  function loadHist() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveHist(hist) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(hist)); } catch (e) {}
  }
  function clearHist() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  // Retorna somente o registro mais recente por TSK (maior sequenciaId = col C).
  // Garante que TSKs reabertas (Concluída → Iniciado) não sejam contadas como encerradas.
  function maisRecentePorTSK(tasks) {
    var mapa = {};
    (tasks || []).forEach(function (t) {
      var tsk = t.osNumero || '';
      if (!tsk) return;
      var seq = Number(t.sequenciaId) || 0;
      var atual = mapa[tsk];
      if (!atual || seq > (Number(atual.sequenciaId) || 0)) mapa[tsk] = t;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; });
  }

  // ── Computar métricas de um array de tasksEnriched ─────────────────
  // Retorna objeto { byDay, byDayFiltro, reinciByDay }
  function computarMetricas(tasks) {
    // Deduplica por TSK usando sequenciaId (col C) — somente o status mais recente conta.
    // Evita contar como encerrada uma TSK que voltou para Iniciado/Não Iniciado.
    var uniqueTasks = maisRecentePorTSK(tasks);

    var concluidas = uniqueTasks.filter(function (t) {
      return isConcluida(t) && toIsoDay(t.fimCalc);
    });

    var byDay = {};
    var byDayFiltro = {}; // { 'YYYY-MM-DD': { 'REGIAO|PRIO': { total, dentro, fora, cci, campo } } }

    concluidas.forEach(function (t) {
      var d = toIsoDay(t.fimCalc);
      if (!byDay[d]) byDay[d] = { tasks: [], dentro: 0, fora: 0, cci: 0, campo: 0 };
      byDay[d].tasks.push(t);

      var cat = D.classificarCciCampo(t.filaAtual) === 'CCI' ? 'CCI' : 'Campo';
      var sl = dentroSla(t);
      if (sl) byDay[d].dentro++; else byDay[d].fora++;
      if (cat === 'CCI') byDay[d].cci++; else byDay[d].campo++;

      // Breakdown por região + prioridade para filtros históricos
      var reg  = t.regiao || 'OTHERS';
      var isPred = t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA';
      var prio = isPred ? 'PREDITIVA' : ((t.prioridade || '').toUpperCase() || 'S/PRIO');

      if (!byDayFiltro[d]) byDayFiltro[d] = {};
      var combos = [reg + '|' + prio, reg + '|TODAS', 'TODAS|' + prio];
      combos.forEach(function (key) {
        if (!byDayFiltro[d][key]) byDayFiltro[d][key] = { total: 0, dentro: 0, fora: 0, cci: 0, campo: 0 };
        var o = byDayFiltro[d][key];
        o.total++;
        if (sl) o.dentro++; else o.fora++;
        if (cat === 'CCI') o.cci++; else o.campo++;
      });
    });

    // Índice de fechamentos por enderecoId (para reincidência)
    var endClosures = {};
    concluidas.forEach(function (t) {
      if (!t.enderecoId) return;
      var eid = String(t.enderecoId).trim();
      if (!eid) return;
      if (!endClosures[eid]) endClosures[eid] = [];
      endClosures[eid].push({ dia: toIsoDay(t.fimCalc), task: t });
    });

    var reinciByDay = {};

    // Tipo 1: mesmo END_ID encerrado duas vezes com gap ≤ 7 dias
    Object.keys(endClosures).forEach(function (eid) {
      var list = endClosures[eid].slice().sort(function (a, b) {
        return a.dia < b.dia ? -1 : 1;
      });
      for (var i = 1; i < list.length; i++) {
        var gapMs  = new Date(list[i].dia).getTime() - new Date(list[i - 1].dia).getTime();
        var gapDia = Math.round(gapMs / 864e5);
        if (gapDia >= 1 && gapDia <= 7) {
          var d = list[i].dia;
          if (!reinciByDay[d]) reinciByDay[d] = [];
          reinciByDay[d].push({ eid: eid, task: list[i].task, prevTask: list[i - 1].task, gap: gapDia });
        }
      }
    });

    // Tipo 2: END_ID encerrado em dia anterior com nova TSK ABERTA hoje (reincidente ativo)
    var hoje = toIsoDay(new Date());
    var eidsAbertos = {};
    uniqueTasks.forEach(function (t) {
      if (!isBacklog(t) || !t.enderecoId) return;
      var eid = String(t.enderecoId).trim();
      if (!eidsAbertos[eid]) eidsAbertos[eid] = [];
      eidsAbertos[eid].push(t);
    });

    Object.keys(eidsAbertos).forEach(function (eid) {
      if (!endClosures[eid]) return;
      var lastClosure = endClosures[eid].reduce(function (best, c) {
        return (!best || c.dia > best.dia) ? c : best;
      }, null);
      if (!lastClosure || lastClosure.dia >= hoje) return; // ignora: sem fechamento anterior
      var gapMs  = new Date(hoje).getTime() - new Date(lastClosure.dia).getTime();
      var gapDia = Math.round(gapMs / 864e5);
      if (gapDia >= 1 && gapDia <= 7) {
        if (!reinciByDay[hoje]) reinciByDay[hoje] = [];
        var jaEsta = reinciByDay[hoje].some(function (r) { return r.eid === eid; });
        if (!jaEsta) {
          reinciByDay[hoje].push({ eid: eid, task: eidsAbertos[eid][0], prevTask: lastClosure.task, gap: gapDia });
        }
      }
    });

    return { byDay: byDay, byDayFiltro: byDayFiltro, reinciByDay: reinciByDay };
  }

  // ── Processar tasksEnriched → objeto de hist por dia ──────────────
  // IMPORTANTE: não armazenar arrays de tasks/reinciItems no localStorage —
  // com muitos arquivos isso ultrapassa a cota (~5MB) e o save falha silenciosamente.
  // Somente métricas numéricas são persistidas; drilldown histórico fica indisponível.
  function metricsToHistRows(byDay, reinciByDay, byDayFiltro) {
    var rows = {};
    Object.keys(byDay).forEach(function (d) {
      var b = byDay[d];
      rows[d] = {
        total: b.tasks.length,
        dentro: b.dentro, fora: b.fora,
        cci: b.cci, campo: b.campo,
        reinci: (reinciByDay[d] || []).length,
        tipo: 'HISTORICO',
        em: new Date().toISOString(),
        f: (byDayFiltro && byDayFiltro[d]) || {}
      };
    });
    return rows;
  }

  // ── Hoje: backlog + encerramentos parciais ─────────────────────────
  function computarHoje(tasks) {
    // Deduplica por TSK (maior sequenciaId): evita contar tarefas reabertas como encerradas.
    var uniqueTasks = maisRecentePorTSK(tasks);
    var hoje = toIsoDay(new Date());
    var backlogTotal = 0, backlogVencendo = 0;
    var encHoje = 0, dentroHoje = 0, foraHoje = 0, cciHoje = 0, campoHoje = 0;
    var tasksHoje = [];
    var now = Date.now();

    uniqueTasks.forEach(function (t) {
      if (isBacklog(t)) {
        backlogTotal++;
        if (t.vencimentoCalc) {
          var ms = new Date(t.vencimentoCalc).getTime() - now;
          if (ms > 0 && ms <= 390 * 60000) backlogVencendo++;
        }
      }
      if (isConcluida(t) && toIsoDay(t.fimCalc) === hoje) {
        encHoje++;
        tasksHoje.push(t);
        if (dentroSla(t)) dentroHoje++; else foraHoje++;
        if (D.classificarCciCampo(t.filaAtual) === 'CCI') cciHoje++; else campoHoje++;
      }
    });

    return {
      dia: hoje, label: fmtDia(hoje),
      total: encHoje, dentro: dentroHoje, fora: foraHoje,
      cci: cciHoje, campo: campoHoje, reinci: 0,
      backlog: backlogTotal, backlogVencendo: backlogVencendo,
      tasks: tasksHoje, reinciItems: [],
      tipo: 'HOJE'
    };
  }

  // ── Montar diasData para gráficos (hist + hoje) ────────────────────
  function montarDiasData(hist, hoje, periodo, regiao, prioridade) {
    var limite = periodo ? Date.now() - periodo * 864e5 : 0;
    var useReg  = regiao     && regiao     !== 'TODAS';
    var usePrio = prioridade && prioridade !== 'TODAS';

    var dias = [];
    Object.keys(hist).sort().forEach(function (d) {
      if (periodo && new Date(d).getTime() < limite) return;
      var row = hist[d];

      var dayData;
      if (useReg || usePrio) {
        var r   = useReg  ? regiao     : 'TODAS';
        var p   = usePrio ? prioridade : 'TODAS';
        var key = r + '|' + p;
        dayData = (row.f && row.f[key]) || null;
        if (!dayData) return; // sem dados para esse filtro nesse dia
      } else {
        dayData = row;
      }

      dias.push({
        dia: d, label: fmtDia(d),
        total: dayData.total || 0, dentro: dayData.dentro || 0, fora: dayData.fora || 0,
        cci: dayData.cci || 0, campo: dayData.campo || 0, reinci: row.reinci || 0,
        tasks: [], reinciItems: [],
        tipo: row.tipo || 'HISTORICO'
      });
    });

    // Adicionar hoje (se ainda não está no hist ou substituir o do hist pelo live)
    var hojeNoHist = dias.findIndex(function (d) { return d.dia === hoje.dia; });
    if (hojeNoHist >= 0) {
      dias[hojeNoHist] = Object.assign({}, dias[hojeNoHist], hoje, { tipo: 'HOJE' });
    } else {
      if (!periodo || new Date(hoje.dia).getTime() >= limite) dias.push(hoje);
    }

    return dias.sort(function (a, b) { return a.dia < b.dia ? -1 : 1; });
  }

  // ── Regressão linear simples para linha de tendência ─────────────
  function trendLine(values) {
    var pts = [];
    values.forEach(function (v, i) { if (v !== null) pts.push({ x: i, y: v }); });
    if (pts.length < 2) return values.map(function () { return null; });
    var n = pts.length;
    var sx = 0, sy = 0, sxy = 0, sx2 = 0;
    pts.forEach(function (p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x; });
    var m = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    var b = (sy - m * sx) / n;
    return values.map(function (v, i) {
      return v !== null ? parseFloat((m * i + b).toFixed(1)) : null;
    });
  }

  // ── Gráfico stacked: encerramentos por dia ─────────────────────────
  function chartEnc(canvas, diasData, onClickDia) {
    // % dentro SLA por dia (linha pontilhada)
    var pctsDia = diasData.map(function (d) {
      return d.total > 0 ? parseFloat((d.dentro / d.total * 100).toFixed(1)) : null;
    });
    // cor do ponto por nível de performance
    var ptCores = pctsDia.map(function (v) {
      if (v === null) return 'transparent';
      return v >= 80 ? '#2ecc71' : v >= 60 ? '#f39c12' : '#e74c3c';
    });
    var tendencia = trendLine(pctsDia);
    // cor da linha de tendência (baseada na direção: primeiro vs último ponto válido)
    var primPct = pctsDia.find(function (v) { return v !== null; });
    var ultPct  = null;
    for (var i = pctsDia.length - 1; i >= 0; i--) { if (pctsDia[i] !== null) { ultPct = pctsDia[i]; break; } }
    var tendCor = (ultPct !== null && primPct !== null && ultPct >= primPct) ? '#2ecc71' : '#e74c3c';

    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: diasData.map(function (d) { return d.label + (d.tipo === 'HOJE' ? ' ★' : ''); }),
        datasets: [
          { label: 'Dentro SLA', data: diasData.map(function (d) { return d.dentro; }),
            backgroundColor: '#2ecc71', borderRadius: 4, maxBarThickness: 46,
            yAxisID: 'y', order: 2 },
          { label: 'Fora SLA',   data: diasData.map(function (d) { return d.fora; }),
            backgroundColor: '#e74c3c', borderRadius: 4, maxBarThickness: 46,
            yAxisID: 'y', order: 2 },
          // Linha pontilhada: % dentro SLA diário
          { label: '% Dentro SLA',
            data: pctsDia,
            type: 'line',
            yAxisID: 'yPct',
            borderColor: 'rgba(241,196,15,0.75)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointBackgroundColor: ptCores,
            pointBorderColor: ptCores,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.35,
            fill: false,
            spanGaps: true,
            order: 0 },
          // Linha de tendência (regressão linear)
          { label: 'Tendência',
            data: tendencia,
            type: 'line',
            yAxisID: 'yPct',
            borderColor: tendCor,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false,
            spanGaps: true,
            order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } },
          y: { stacked: true, position: 'left',
               ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true },
          yPct: { position: 'right',
                  min: 0, max: 100,
                  ticks: { color: '#f1c40f', font: { size: 10 }, stepSize: 25,
                           callback: function (v) { return v + '%'; } },
                  grid: { drawOnChartArea: false } }
        },
        plugins: {
          legend: { display: true, labels: { color: tickClr(), font: { size: 11 }, boxWidth: 12, padding: 10,
            filter: function (item) { return item.text !== 'Tendência'; } // ocultar da legenda, mantém no chart
          } },
          tooltip: Object.assign({}, TOOLTIP_STYLE, {
            callbacks: {
              label: function (ctx) {
                if (ctx.dataset.label === '% Dentro SLA') return ' % Dentro SLA: ' + ctx.parsed.y + '%';
                if (ctx.dataset.label === 'Tendência') return null;
                return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y;
              },
              afterBody: function (ctx) {
                var d = diasData[ctx[0].dataIndex];
                var pct = pctsDia[ctx[0].dataIndex];
                var lines = ['───────────────',
                  '🏢 CCI: ' + d.cci + '    🔧 Campo: ' + d.campo];
                if (pct !== null) lines.push('SLA do dia: ' + pct + '%');
                if (d.tipo === 'HOJE') lines.push('📋 Backlog: ' + (d.backlog || 0));
                return lines;
              }
            }
          })
        },
        onClick: function (ev, els) { if (els && els.length && onClickDia) onClickDia(diasData[els[0].dataIndex]); }
      }
    });
    _charts.push(c); return c;
  }

  // ── Parser do Diário de Trabalho (coluna BG — motivoCancelamento) ──
  var RE_TS_P = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/g;

  function parseTimestampP(ts) {
    ts = (ts || '').trim();
    var m1 = ts.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1], +m1[4], +m1[5], +(m1[6] || 0));
    var m2 = ts.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3], +m2[4], +m2[5], +(m2[6] || 0));
    return new Date(NaN);
  }

  function parseDiarioP(texto) {
    if (!texto) return [];
    RE_TS_P.lastIndex = 0;
    var positions = [], m;
    while ((m = RE_TS_P.exec(texto)) !== null) {
      var dt = parseTimestampP(m[1]);
      if (!isNaN(dt.getTime())) positions.push({ dt: dt, pos: m.index, len: m[1].length });
    }
    if (!positions.length) return [];
    return positions.map(function (entry, i) {
      var bodyStart = entry.pos + entry.len;
      var bodyEnd = i + 1 < positions.length ? positions[i + 1].pos : texto.length;
      var body = texto.slice(bodyStart, bodyEnd).replace(/^\s*-\s*/, '').trim();
      var authorRaw = body.match(/^([^(\n\r]{1,70}?)(?:\s*[\(\n\r]|$)/);
      var author = authorRaw ? authorRaw[1].replace(/\s*-\s*Tel\.?:.*$/, '').trim() : '';
      author = author.replace(/\s*\(.*$/, '').trim();
      if (author.length > 50) author = author.substring(0, 50);
      return { dt: entry.dt, author: author || 'Sistema', content: body };
    });
  }

  // Filtra entradas genuínas do time — dois formatos suportados:
  // Formato 1 (TLP-T): TLP-Txxxxxxx-NOME - YYYY-MM-DD HH:MM
  // Formato 2 (Data-Nome): DD/MM/YYYY HH:MM:SS - NOME COMPLETO
  var RE_TLP      = /TLP-T\d+-([^-\r\n]{3,60}?)\s*-\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/g;
  var RE_DTNAME_P = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\s*-\s*([^\r\n]{5,80})/g;
  var RE_BOT_P    = /^(MONITOR\s*CCI|WFM\s*Agent|isoc_fixa|[Aa]utoma[çc][aã]o|Sistema\s*autom)/i;

  function parseTlpEntries(texto) {
    if (!texto) return [];
    var entries = [], m;
    // Formato 1: TLP-T
    RE_TLP.lastIndex = 0;
    while ((m = RE_TLP.exec(texto)) !== null) {
      var dt = parseTimestampP(m[2].trim());
      if (!isNaN(dt.getTime())) entries.push({ dt: dt, author: m[1].trim() });
    }
    // Formato 2: DD/MM/YYYY HH:MM:SS - NOME
    RE_DTNAME_P.lastIndex = 0;
    while ((m = RE_DTNAME_P.exec(texto)) !== null) {
      var nome = m[2].trim();
      if (RE_BOT_P.test(nome)) continue;
      var p2 = m[1].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!p2) continue;
      var dt2 = new Date(+p2[3], +p2[2]-1, +p2[1], +p2[4], +p2[5], p2[6]?+p2[6]:0);
      if (!isNaN(dt2.getTime())) entries.push({ dt: dt2, author: nome });
    }
    return entries.sort(function (a, b) { return a.dt - b.dt; });
  }

  function fmtGapP(hours) {
    if (hours < 1)  return Math.round(hours * 60) + 'min';
    if (hours < 24) return hours.toFixed(1) + 'h';
    return (hours / 24).toFixed(1) + 'd';
  }

  function computarDiarioP(tasks) {
    var stats = [], semDiario = 0, allGaps = [], totalEntradas = 0, authorCount = {};
    (tasks || []).forEach(function (t) {
      var entries = parseTlpEntries(t.motivoCancelamento || '');
      if (!entries.length) { semDiario++; return; }
      totalEntradas += entries.length;
      entries.forEach(function (e) {
        authorCount[e.author] = (authorCount[e.author] || 0) + 1;
      });
      var gaps = [];
      for (var i = 1; i < entries.length; i++) {
        var gapH = (entries[i].dt - entries[i - 1].dt) / 3600000;
        if (gapH >= 0 && gapH < 720) { gaps.push(gapH); allGaps.push(gapH); }
      }
      var avgGapH = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : null;
      var lastDt = entries[entries.length - 1].dt;
      var horasSemUpd = Math.max(0, (Date.now() - lastDt.getTime()) / 3600000);
      stats.push({ task: t, nEntries: entries.length, avgGapH: avgGapH, lastDt: lastDt, horasSemUpd: horasSemUpd });
    });
    var avgGapGlobal = allGaps.length ? allGaps.reduce(function (a, b) { return a + b; }, 0) / allGaps.length : 0;
    var topAuthors = Object.keys(authorCount)
      .map(function (a) { return { author: a, count: authorCount[a] }; })
      .sort(function (a, b) { return b.count - a.count; });
    return { stats: stats, semDiario: semDiario, totalEntradas: totalEntradas, allGaps: allGaps, avgGapH: avgGapGlobal, topAuthors: topAuthors };
  }

  function chartHistoDiario(canvas, allGaps) {
    var buckets = [
      { label: '< 30min',  min: 0,   max: 0.5,      cor: '#2ecc71' },
      { label: '30min–1h', min: 0.5, max: 1,         cor: '#27ae60' },
      { label: '1–2h',     min: 1,   max: 2,         cor: '#3498db' },
      { label: '2–4h',     min: 2,   max: 4,         cor: '#f39c12' },
      { label: '4–8h',     min: 4,   max: 8,         cor: '#e67e22' },
      { label: '8–24h',    min: 8,   max: 24,        cor: '#e74c3c' },
      { label: '> 24h',    min: 24,  max: Infinity,  cor: '#c0392b' }
    ];
    buckets.forEach(function (b) { b.count = 0; });
    allGaps.forEach(function (g) {
      for (var i = 0; i < buckets.length; i++) {
        if (g >= buckets[i].min && g < buckets[i].max) { buckets[i].count++; break; }
      }
    });
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: buckets.map(function (b) { return b.label; }),
        datasets: [{ label: 'Intervalos', data: buckets.map(function (b) { return b.count; }),
          backgroundColor: buckets.map(function (b) { return b.cor; }), borderRadius: 4, maxBarThickness: 54 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } },
          y: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE }
      }
    });
    _charts.push(c); return c;
  }

  function chartMediaOsDiario(canvas, stats) {
    var b = [
      { label: '< 1h',      count: 0, cor: '#2ecc71' },
      { label: '1–2h',      count: 0, cor: '#3498db' },
      { label: '2–4h',      count: 0, cor: '#f39c12' },
      { label: '4–8h',      count: 0, cor: '#e67e22' },
      { label: '8–24h',     count: 0, cor: '#e74c3c' },
      { label: '> 24h',     count: 0, cor: '#c0392b' },
      { label: '1 entrada', count: 0, cor: '#7f8c8d' }
    ];
    stats.forEach(function (s) {
      if (s.avgGapH === null) { b[6].count++; return; }
      if (s.avgGapH < 1)       b[0].count++;
      else if (s.avgGapH < 2)  b[1].count++;
      else if (s.avgGapH < 4)  b[2].count++;
      else if (s.avgGapH < 8)  b[3].count++;
      else if (s.avgGapH < 24) b[4].count++;
      else                      b[5].count++;
    });
    var c = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: b.map(function (x) { return x.label; }),
        datasets: [{ data: b.map(function (x) { return x.count; }), backgroundColor: b.map(function (x) { return x.cor; }),
          borderColor: 'transparent', borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: tickClr(), font: { size: 10 }, boxWidth: 10, padding: 8 } },
          tooltip: TOOLTIP_STYLE
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Gráfico bar: reincidentes por dia ─────────────────────────────
  function chartReinci(canvas, diasData, onClickDia) {
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: diasData.map(function (d) { return d.label; }),
        datasets: [{
          label: 'Reincidentes',
          data: diasData.map(function (d) { return d.reinci; }),
          backgroundColor: '#ff8c00', borderRadius: 4, maxBarThickness: 46
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } },
          y: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
        onClick: function (ev, els) {
          if (els && els.length && onClickDia && diasData[els[0].dataIndex].reinciItems) {
            onClickDia(diasData[els[0].dataIndex]);
          }
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Gráfico linha: taxa % de reincidência por dia ──────────────────
  function chartTaxaReinci(canvas, diasData) {
    var taxas = diasData.map(function (d) {
      return d.total > 0 ? parseFloat((d.reinci / d.total * 100).toFixed(1)) : 0;
    });
    var c = new Chart(canvas, {
      type: 'line',
      data: {
        labels: diasData.map(function (d) { return d.label; }),
        datasets: [{
          label: 'Taxa %',
          data: taxas,
          borderColor: '#ff8c00',
          backgroundColor: 'rgba(255,140,0,0.1)',
          borderWidth: 2,
          pointBackgroundColor: taxas.map(function (v) { return v > 15 ? '#e74c3c' : '#ff8c00'; }),
          pointRadius: 4, tension: 0.3, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } },
          y: { ticks: { color: tickClr(), font: { size: 11 }, callback: function (v) { return v + '%'; } },
               grid: { color: gridClr() }, beginAtZero: true }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE }
      }
    });
    _charts.push(c); return c;
  }

  // ── Gráfico horizontal: Top END_IDs reincidentes ───────────────────
  function chartTopEids(canvas, topEids) {
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topEids.map(function (e) { return e.eid; }),
        datasets: [{
          label: 'Reincidências',
          data: topEids.map(function (e) { return e.count; }),
          backgroundColor: topEids.map(function (e) {
            return e.count >= 3 ? '#e74c3c' : e.count === 2 ? '#ff8c00' : '#ffb347';
          }),
          borderRadius: 4, maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true },
          y: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() } }
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_STYLE, {
            callbacks: { label: function (ctx) { return ' ' + ctx.parsed.x + ' ocorrência(s)'; } }
          })
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Gráfico linha: evolução do backlog ────────────────────────────
  function chartBacklog(canvas, diasDataComHist, histMap) {
    var backlogSeries = diasDataComHist.map(function (d) {
      var row = histMap[d.dia];
      return (row && row.backlog != null) ? row.backlog : (d.tipo === 'HOJE' ? d.backlog : null);
    });
    var c = new Chart(canvas, {
      type: 'line',
      data: {
        labels: diasDataComHist.map(function (d) { return d.label; }),
        datasets: [{
          label: 'Backlog aberto',
          data: backlogSeries,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.1)',
          borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true,
          spanGaps: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } },
          y: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE }
      }
    });
    _charts.push(c); return c;
  }

  // ── Drills ────────────────────────────────────────────────────────
  function drillDia(dayData) {
    var tasks = dayData.tasks || [];
    if (!tasks.length) { U.toast('Sem detalhe de tasks disponível para este dia.', 'info'); return; }
    var content = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    content.appendChild(U.taskTable(tasks, { modoResultado: true }));
    U.openModal('Encerramentos em ' + dayData.label + ' (' + dayData.dia + ')', content, {
      onCopy: function () { return U.taskTableCopyText(tasks, 'Encerramentos ' + dayData.dia); }
    });
  }

  function drillReinci(dayData) {
    var items = dayData.reinciItems || [];
    if (!items.length) { U.toast('Sem detalhe de reincidentes para este dia.', 'info'); return; }
    var content = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    items.forEach(function (it) {
      content.appendChild(h('div', {
        class: 'trj-card p-3 mb-2',
        style: { borderLeft: '3px solid #ff8c00' }
      }, [
        h('div', { class: 'flex items-center gap-3 mb-1' }, [
          h('span', { class: 'font-bold text-sm', text: 'END_ID: ' + it.eid }),
          it.task.prioridade ? h('span', { class: 'trj-badge', style: { background: 'rgba(231,76,60,.18)', color: '#e74c3c', fontSize: '11px' }, text: it.task.prioridade }) : null
        ]),
        h('div', { style: { fontSize: '12px', color: 'var(--trj-muted)', lineHeight: '1.7' } }, [
          h('div', { text: 'Encerrado: ' + fmtDia(it.prevTask ? toIsoDay(it.prevTask.fimCalc) : '?') + '  (OS: ' + (it.prevTask && it.prevTask.osNumero || '—') + ')' }),
          h('div', { text: 'Reincidência: ' + fmtDia(toIsoDay(it.task.fimCalc)) + '  (OS: ' + (it.task.osNumero || '—') + ')  — gap: ' + it.gap + ' dia(s)' })
        ])
      ]));
    });
    U.openModal('Reincidentes em ' + dayData.label, content);
  }

  // ── Processar arquivos da pasta "Produtividade" ────────────────────
  async function processarHistoricoFolder(ctx, progressEl) {
    function log(msg) { if (progressEl) progressEl.textContent = msg; }

    if (!FS || !FS.scanProdutividadeFolder) {
      throw new Error('Função scanProdutividadeFolder não disponível. Verifique que files.js está atualizado.');
    }

    log('Verificando pasta conectada...');
    var files = await FS.scanProdutividadeFolder();
    if (!files.length) throw new Error('Nenhum arquivo .xlsx encontrado na subpasta "Produtividade".');

    log('Encontrado(s) ' + files.length + ' arquivo(s). Lendo...');

    // Ler e parsear todos os arquivos
    var allRaw = [];
    for (var i = 0; i < files.length; i++) {
      log('Lendo arquivo ' + (i + 1) + '/' + files.length + ': ' + files[i].name + '...');
      try {
        var buf = await files[i].file.arrayBuffer();
        var rows = FS.parseArrayBuffer(buf);
        allRaw = allRaw.concat(rows);
      } catch (e) {
        log('Aviso: erro ao ler "' + files[i].name + '" — pulando.');
      }
    }

    if (!allRaw.length) throw new Error('Nenhuma tarefa encontrada nos arquivos.');
    log('Total bruto: ' + allRaw.length + ' linhas. Deduplicando...');

    // Deduplica pelo critério padrão (maior sequenciaId por TSK)
    var deduped = D.dedupPorTsk ? D.dedupPorTsk(allRaw) : allRaw;
    log('Após dedup: ' + deduped.length + ' tarefas. Enriquecendo...');

    var validMap = (ctx.data && ctx.data.validMap) || {};
    var prazoMap = (ctx.data && ctx.data.prazoMap) || {};
    var enriched = Comp.enrichTasks(deduped, validMap, prazoMap);
    log('Calculando métricas por dia...');

    var result = computarMetricas(enriched);
    var hist = metricsToHistRows(result.byDay, result.reinciByDay, result.byDayFiltro);

    // Guardar no localStorage, mesclando com o que já existe
    var existing = loadHist();
    var merged   = Object.assign({}, existing, hist);
    saveHist(merged);

    // Tentar sincronizar com o GAS se disponível
    if (TRJ.api && TRJ.api.saveProdutividadeHist) {
      try {
        log('Sincronizando com o banco de dados...');
        var gasRows = Object.keys(hist).map(function (d) {
          return Object.assign({ data: d }, hist[d]);
        });
        await TRJ.api.saveProdutividadeHist(gasRows);
      } catch (e) { /* GAS indisponível: dados ficam no localStorage */ }
    }

    return Object.keys(hist).length;
  }

  // ── Render ────────────────────────────────────────────────────────
  TRJ.pages.produtividade = function (container, ctx) {
    var data = ctx && ctx.data;
    destroyLocalCharts();

    if (!data || !(data.tasksEnriched || []).length) {
      container.appendChild(h('div', { class: 'trj-card p-8 text-center' }, [
        h('div', { style: { fontSize: '2.4rem', marginBottom: '12px' }, text: '📭' }),
        h('div', { class: 'font-bold mb-2 text-base', text: 'Nenhum dado carregado' }),
        h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px' },
          text: 'Importe a planilha de tarefas pela aba "Importar dados" para visualizar a produtividade.' })
      ]));
      return;
    }

    var tasks = data.tasksEnriched;

    // Cabeçalho
    container.appendChild(U.pageHeader
      ? U.pageHeader('Produtividade Operacional', 'Encerramentos e reincidências por período')
      : h('div', { class: 'mb-4' }, [h('h1', { class: 'trj-heading text-xl font-bold', text: 'Produtividade Operacional' })])
    );

    var areaEl = h('div', {});
    container.appendChild(areaEl);

    function render() {
      destroyLocalCharts();
      areaEl.innerHTML = '';

      // Filtrar tasks por região e prioridade antes de qualquer cálculo
      var filteredTasks = tasks.filter(function (t) {
        if (_state.regiao !== 'TODAS' && (t.regiao || 'OTHERS') !== _state.regiao) return false;
        var isPred = t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA';
        if (_state.prioridade === 'PREDITIVA') return isPred;
        if (_state.prioridade !== 'TODAS' && (t.prioridade || '').toUpperCase() !== _state.prioridade) return false;
        return true;
      });
      var hoje = computarHoje(filteredTasks);

      var hist = loadHist();
      var hasHist = Object.keys(hist).length > 0;

      // ── Barra de ações/filtros ────────────────────────────────────
      var periodos = [{ l: '7d', v: 7 }, { l: '15d', v: 15 }, { l: '30d', v: 30 }, { l: 'Todos', v: 0 }];
      var btnsPeriodo = periodos.map(function (p) {
        return h('button', {
          class: 'trj-btn ' + (_state.periodo === p.v ? 'trj-btn-primary' : 'trj-btn-ghost'),
          style: { fontSize: '12px', padding: '4px 12px' },
          text: p.l,
          onclick: function () { _state.periodo = p.v; render(); }
        });
      });

      // Botão processar histórico
      var btnProcessar = h('button', {
        class: 'trj-btn trj-btn-ghost',
        style: { fontSize: '12px', padding: '4px 14px', color: '#ff8c00', borderColor: 'rgba(255,140,0,0.5)' },
        text: hasHist ? '🔄 Reprocessar Histórico' : '📁 Processar Histórico',
        onclick: function () { abrirModalProcessar(ctx, render); }
      });

      var btnLimpar = hasHist ? h('button', {
        class: 'trj-btn trj-btn-ghost',
        style: { fontSize: '11px', padding: '3px 10px', color: 'var(--trj-muted)' },
        text: '🗑 Limpar Histórico',
        onclick: function () { clearHist(); render(); }
      }) : null;

      var sep = function () { return h('span', { style: { color: 'rgba(255,255,255,.12)', margin: '0 4px' }, text: '|' }); };

      var regioes = ['TODAS'].concat(C.REGIOES || []);
      var btnsRegiao = regioes.map(function (r) {
        return h('button', {
          class: 'trj-btn ' + (_state.regiao === r ? 'trj-btn-primary' : 'trj-btn-ghost'),
          style: { fontSize: '11px', padding: '3px 10px' },
          text: r === 'TODAS' ? 'Todas' : r,
          onclick: function () { _state.regiao = r; render(); }
        });
      });

      var prios = ['TODAS', 'P1', 'P2', 'P3', 'P4', 'P5', 'PREDITIVA'];
      var btnsPrio = prios.map(function (p) {
        return h('button', {
          class: 'trj-btn ' + (_state.prioridade === p ? 'trj-btn-primary' : 'trj-btn-ghost'),
          style: { fontSize: '11px', padding: '3px 10px' },
          text: p === 'TODAS' ? 'Todas' : p,
          onclick: function () { _state.prioridade = p; render(); }
        });
      });

      var row1Items = [
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'PERÍODO:' }),
        h('div', { class: 'flex gap-2' }, btnsPeriodo),
        sep(),
        btnProcessar,
        btnLimpar
      ].filter(Boolean);
      var row2Items = [
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'REGIÃO:' }),
        h('div', { class: 'flex gap-2 flex-wrap' }, btnsRegiao),
        sep(),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'PRIORIDADE:' }),
        h('div', { class: 'flex gap-2 flex-wrap' }, btnsPrio)
      ];
      areaEl.appendChild(h('div', {
        class: 'trj-card p-3 mb-5',
        style: { borderColor: 'rgba(255,140,0,0.2)' }
      }, [
        h('div', { class: 'flex items-center gap-3 flex-wrap mb-2' }, row1Items),
        h('div', { class: 'flex items-center gap-3 flex-wrap' }, row2Items)
      ]));

      var diasData = montarDiasData(hist, hoje, _state.periodo, _state.regiao, _state.prioridade);

      // ── Se não há histórico: painel de boas-vindas ────────────────
      if (!hasHist) {
        areaEl.appendChild(renderOnboarding(hoje, ctx, render));
        return;
      }

      // ── KPIs gerais do período ────────────────────────────────────
      var totTotal  = 0, totDentro = 0, totFora = 0, totCci = 0, totCampo = 0, totReinci = 0;
      diasData.forEach(function (d) {
        totTotal  += d.total; totDentro += d.dentro; totFora += d.fora;
        totCci    += d.cci;   totCampo  += d.campo;  totReinci += d.reinci;
      });
      var pctDentro = pct(totDentro, totTotal);

      // Seção encerramentos
      areaEl.appendChild(secTitle('ENCERRAMENTOS', '#2ecc71'));
      areaEl.appendChild(h('div', { class: 'grid gap-3 mb-4', style: { gridTemplateColumns: 'repeat(4,1fr)' } }, [
        U.kpiCard({ label: 'Total Encerrado', value: totTotal, cor: '#ff8c00', sub: 'no período' }),
        U.kpiCard({ label: 'Dentro do SLA', value: pctDentro + '%',
          cor: pctDentro >= 70 ? '#2ecc71' : '#e74c3c',
          sub: totDentro + ' tickets (' + totFora + ' fora)' }),
        U.kpiCard({ label: 'Via CCI',  value: totCci,   cor: '#3498db', sub: pct(totCci, totTotal) + '% do total' }),
        U.kpiCard({ label: 'Via Campo', value: totCampo, cor: '#ff8c00', sub: pct(totCampo, totTotal) + '% do total' })
      ]));

      // Gráficos encerramentos: stacked + donut
      var rowEnc = h('div', { class: 'grid gap-4 mb-4', style: { gridTemplateColumns: '1fr 260px' } });
      var ccEnc  = U.chartCard('ENCERRAMENTOS POR DIA — Dentro × Fora SLA', { hint: diasData.length + ' dias (★ = hoje, parcial)' });
      ccEnc.card.style.minHeight = '300px';
      var ccDon  = U.chartCard('RESULTADO GERAL', { small: true });
      rowEnc.appendChild(ccEnc.card);
      rowEnc.appendChild(ccDon.card);
      areaEl.appendChild(rowEnc);

      // Seção diário de trabalho (substitui CCI × Campo)
      var diarioData = computarDiarioP(filteredTasks);
      areaEl.appendChild(secTitle('DIÁRIO DE TRABALHO', '#9b59b6'));
      var semUpdRisco = diarioData.stats.filter(function (s) { return s.horasSemUpd > 24; }).length;
      areaEl.appendChild(h('div', { class: 'grid gap-3 mb-4', style: { gridTemplateColumns: 'repeat(4,1fr)' } }, [
        U.kpiCard({ label: 'OS com Diário', value: diarioData.stats.length, cor: '#9b59b6', sub: diarioData.semDiario + ' sem registros' }),
        U.kpiCard({ label: 'Total de Entradas', value: diarioData.totalEntradas, cor: '#3498db', sub: 'atualizações registradas' }),
        U.kpiCard({ label: 'Intervalo Médio', value: diarioData.avgGapH > 0 ? fmtGapP(diarioData.avgGapH) : '—',
          cor: diarioData.avgGapH > 8 ? '#e74c3c' : diarioData.avgGapH > 4 ? '#ff8c00' : '#2ecc71',
          sub: 'entre atualizações' }),
        U.kpiCard({ label: 'Sem Upd. > 24h', value: semUpdRisco, cor: semUpdRisco > 0 ? '#e74c3c' : '#2ecc71', sub: 'OS em risco' })
      ]));
      var rowDiario = h('div', { class: 'grid gap-4 mb-5', style: { gridTemplateColumns: '1fr 260px' } });
      var ccHistoDiario = U.chartCard('INTERVALOS DE ATUALIZAÇÃO — Diário de Trabalho', { hint: diarioData.allGaps.length + ' intervalos registrados' });
      ccHistoDiario.card.style.minHeight = '260px';
      var ccDonDiario = U.chartCard('INTERVALO MÉDIO POR OS', { small: true });
      rowDiario.appendChild(ccHistoDiario.card);
      rowDiario.appendChild(ccDonDiario.card);
      areaEl.appendChild(rowDiario);

      // Seção hoje (destaque)
      areaEl.appendChild(secTitle('HOJE (PARCIAL — ' + hoje.label + ')', '#3498db'));
      areaEl.appendChild(h('div', { class: 'grid gap-3 mb-5', style: { gridTemplateColumns: 'repeat(4,1fr)' } }, [
        U.kpiCard({ label: 'Encerrados Hoje', value: hoje.total, cor: '#2ecc71', sub: pct(hoje.dentro, hoje.total) + '% dentro SLA' }),
        U.kpiCard({ label: 'Backlog Ativo',  value: hoje.backlog, cor: '#3498db', sub: 'tarefas abertas agora' }),
        U.kpiCard({ label: 'Vencendo em breve', value: hoje.backlogVencendo, cor: '#ff8c00', sub: 'próximas 6h30' }),
        U.kpiCard({ label: 'CCI / Campo',
          value: hoje.cci + ' / ' + hoje.campo, cor: '#ff8c00', sub: 'encerramentos do dia' })
      ]));

      // Backlog ao longo do tempo (se tiver histórico com backlog)
      var diasComBacklog = diasData.filter(function (d) { return d.backlog > 0; });
      if (diasComBacklog.length >= 2) {
        var rowBl = h('div', { class: 'mb-5' });
        var ccBl  = U.chartCard('EVOLUÇÃO DO BACKLOG ABERTO', { hint: 'capturado por dia' });
        ccBl.card.style.minHeight = '220px';
        rowBl.appendChild(ccBl.card);
        areaEl.appendChild(rowBl);
        setTimeout(function () { chartBacklog(ccBl.canvas, diasData, hist); }, 0);
      }

      // Seção reincidentes
      areaEl.appendChild(secTitle('REINCIDENTES', '#ff8c00'));
      var diasComReinci   = diasData.filter(function (d) { return d.reinci > 0; }).length;
      var taxaReinci      = (totTotal > 0 ? totReinci / totTotal * 100 : 0).toFixed(1);
      var mediaDia        = diasComReinci > 0 ? (totReinci / diasComReinci).toFixed(1) : '0';

      areaEl.appendChild(h('div', { class: 'grid gap-3 mb-4', style: { gridTemplateColumns: 'repeat(4,1fr)' } }, [
        U.kpiCard({ label: 'Reincidentes', value: totReinci,
          cor: totReinci > 0 ? '#e74c3c' : '#2ecc71', sub: 'END_IDs voltaram em ≤7d' }),
        U.kpiCard({ label: 'Taxa de Reincidência', value: taxaReinci + '%',
          cor: parseFloat(taxaReinci) > 15 ? '#e74c3c' : '#ff8c00', sub: 'sobre o total encerrado' }),
        U.kpiCard({ label: 'Dias c/ Reincid.', value: diasComReinci, cor: '#3498db', sub: 'dias com ocorrência' }),
        U.kpiCard({ label: 'Média por Dia',  value: mediaDia, cor: '#ff8c00', sub: 'reincid./dia ativo' })
      ]));

      var rowRei = h('div', { class: 'grid gap-4 mb-4', style: { gridTemplateColumns: '1fr 260px' } });
      var ccRei  = U.chartCard('REINCIDENTES POR DIA', { hint: 'END_ID normalizado → retornou em até 7 dias' });
      ccRei.card.style.minHeight = '260px';

      // Calcular top END_IDs e prioridades
      var eidMap = {}, prioAgg = {};
      var PRIO_COR = { P1: '#e74c3c', P2: '#ff8c00', P3: '#f1c40f', P4: '#3498db', P5: '#9aa5b1' };
      diasData.forEach(function (d) {
        (d.reinciItems || []).forEach(function (it) {
          eidMap[it.eid] = (eidMap[it.eid] || 0) + 1;
          var p = it.task.prioridade || 'S/PRIO';
          prioAgg[p] = (prioAgg[p] || 0) + 1;
        });
      });
      var ccPrio = U.chartCard('REINCID. POR PRIORIDADE', { small: true });
      rowRei.appendChild(ccRei.card);
      rowRei.appendChild(ccPrio.card);
      areaEl.appendChild(rowRei);

      var topEids = Object.keys(eidMap).map(function (e) { return { eid: e, count: eidMap[e] }; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, 10);

      if (topEids.length) {
        var rowTop = h('div', { class: 'grid gap-4 mb-4', style: { gridTemplateColumns: '1fr 1fr' } });
        var ccTop  = U.chartCard('TOP END_IDs MAIS REINCIDENTES', { hint: '🔴 ≥3x · 🟠 2x · 🟡 1x' });
        ccTop.card.style.minHeight = '260px';
        var ccTx   = U.chartCard('TAXA DE REINCIDÊNCIA % / DIA', {});
        ccTx.card.style.minHeight = '260px';
        rowTop.appendChild(ccTop.card);
        rowTop.appendChild(ccTx.card);
        areaEl.appendChild(rowTop);
        setTimeout(function () {
          chartTopEids(ccTop.canvas, topEids);
          chartTaxaReinci(ccTx.canvas, diasData);
        }, 0);
      }

      var prioDonutData = Object.keys(prioAgg).sort().map(function (p) {
        return { label: p, value: prioAgg[p], cor: PRIO_COR[p] || '#9aa5b1' };
      });

      setTimeout(function () {
        chartEnc(ccEnc.canvas, diasData, drillDia);
        U.donutChart(ccDon.canvas, [
          { label: 'Dentro SLA', value: totDentro, cor: '#2ecc71' },
          { label: 'Fora SLA',   value: totFora,   cor: '#e74c3c' }
        ]);
        if (diarioData.allGaps.length) chartHistoDiario(ccHistoDiario.canvas, diarioData.allGaps);
        if (diarioData.stats.length) chartMediaOsDiario(ccDonDiario.canvas, diarioData.stats);
        chartReinci(ccRei.canvas, diasData, drillReinci);
        if (prioDonutData.length) U.donutChart(ccPrio.canvas, prioDonutData);
      }, 0);
    }

    render();
  };

  // ── Painel de boas-vindas (sem histórico) ─────────────────────────
  function renderOnboarding(hoje, ctx, onDone) {
    var panel = h('div', {});

    panel.appendChild(h('div', { class: 'grid gap-3 mb-5', style: { gridTemplateColumns: 'repeat(3,1fr)' } }, [
      U.kpiCard({ label: 'Encerrados Hoje', value: hoje.total, cor: '#2ecc71', sub: pct(hoje.dentro, hoje.total) + '% dentro SLA' }),
      U.kpiCard({ label: 'Backlog Ativo', value: hoje.backlog, cor: '#3498db', sub: 'tarefas abertas agora' }),
      U.kpiCard({ label: 'Vencendo em breve', value: hoje.backlogVencendo, cor: '#ff8c00', sub: 'próximas 6h30' })
    ]));

    panel.appendChild(h('div', {
      class: 'trj-card p-6 text-center',
      style: { borderColor: 'rgba(255,140,0,0.3)', borderStyle: 'dashed' }
    }, [
      h('div', { style: { fontSize: '2.5rem', marginBottom: '12px' }, text: '📂' }),
      h('div', { class: 'font-bold text-base mb-2', text: 'Sem histórico de produtividade' }),
      h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px', maxWidth: '480px', margin: '0 auto 20px' },
        text: 'Para gerar os gráficos históricos, coloque os arquivos "Atividades-TRJ_FMMT" anteriores ' +
              'na subpasta "Produtividade" dentro da pasta conectada e clique em processar.' }),
      h('div', { class: 'trj-card p-3 mb-5 text-left', style: { maxWidth: '420px', margin: '0 auto 20px', fontSize: '12px', color: 'var(--trj-muted)' } }, [
        h('div', { class: 'font-bold mb-2', style: { color: 'var(--trj-fg)' }, text: '📁 Estrutura esperada:' }),
        h('div', { text: 'Pasta conectada/' }),
        h('div', { style: { paddingLeft: '16px' }, text: '├ Atividades-TRJ_FMMT_hoje.xlsx' }),
        h('div', { style: { paddingLeft: '16px' }, text: '└ Produtividade/' }),
        h('div', { style: { paddingLeft: '32px' }, text: '├ Atividades-TRJ_FMMT_2026-07-01.xlsx' }),
        h('div', { style: { paddingLeft: '32px' }, text: '├ Atividades-TRJ_FMMT_2026-07-02.xlsx' }),
        h('div', { style: { paddingLeft: '32px' }, text: '└ ...' })
      ]),
      h('button', {
        class: 'trj-btn trj-btn-primary',
        style: { padding: '10px 28px', fontSize: '14px' },
        text: '📁 Processar Histórico da pasta "Produtividade"',
        onclick: function () { abrirModalProcessar(ctx, onDone); }
      })
    ]));
    return panel;
  }

  // ── Modal: processamento de histórico ──────────────────────────────
  function abrirModalProcessar(ctx, onDone) {
    var progressEl = h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px', minHeight: '24px' }, text: 'Aguardando...' });
    var btnStart = h('button', {
      class: 'trj-btn trj-btn-primary',
      style: { padding: '8px 24px' },
      text: 'Iniciar Processamento'
    });
    var errEl   = h('div', { style: { color: '#e74c3c', fontSize: '13px', marginTop: '8px' } });
    var okEl    = h('div', { style: { color: '#2ecc71', fontSize: '13px', marginTop: '8px' } });

    var content = h('div', {}, [
      h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px', marginBottom: '16px' },
        text: 'Todos os arquivos .xlsx dentro da subpasta "Produtividade" da pasta conectada ' +
              'serão lidos, processados e as métricas salvas para análise histórica.' }),
      progressEl, errEl, okEl,
      h('div', { class: 'flex gap-3 mt-4' }, [btnStart])
    ]);

    U.openModal('Processar Histórico de Produtividade', content);

    btnStart.addEventListener('click', async function () {
      btnStart.disabled = true;
      btnStart.textContent = 'Processando...';
      errEl.textContent = '';
      okEl.textContent = '';
      try {
        var n = await processarHistoricoFolder(ctx, progressEl);
        progressEl.textContent = '';
        okEl.textContent = '✅ ' + n + ' dia(s) processado(s) e salvos! Gráficos carregados.';
        // Renderizar gráficos imediatamente (por trás do modal)
        if (onDone) onDone();
        // Trocar botão para fechar modal
        btnStart.disabled = false;
        btnStart.textContent = 'Fechar e ver gráficos';
        btnStart.onclick = function () {
          var ov = document.querySelector('.trj-modal-overlay');
          if (ov) ov.click();
        };
      } catch (e) {
        progressEl.textContent = '';
        errEl.textContent = '❌ ' + (e.message || 'Erro desconhecido.');
        btnStart.disabled = false;
        btnStart.textContent = 'Tentar Novamente';
      }
    });
  }

  // ── Helpers de UI ─────────────────────────────────────────────────
  function secTitle(texto, cor) {
    return h('div', { class: 'flex items-center gap-2 mb-3 mt-2', style: { borderBottom: '1px solid rgba(255,140,0,0.15)', paddingBottom: '8px' } }, [
      h('span', { style: { width: '4px', height: '16px', borderRadius: '2px', background: cor, display: 'inline-block' } }),
      h('span', { class: 'text-xs font-bold uppercase tracking-widest', style: { color: cor }, text: texto })
    ]);
  }

})(window.TRJ = window.TRJ || {});
