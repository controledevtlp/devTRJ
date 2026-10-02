/* =====================================================================
 * atualizacoes.js — Análise do Diário de Trabalho (coluna BG)
 * Linha do tempo por OS, tempo médio entre atualizações, ranking de
 * autores, distribuição por hora, OSs em risco sem atualização recente.
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui;
  var h = U.h;
  var _charts = [];
  var _stateAtu = { periodo: 0, prioridade: 'TODAS' }; // 0 = todos os períodos

  // ── Tema ──────────────────────────────────────────────────────────
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
  function destroyLocalCharts() {
    _charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    _charts = [];
  }

  // ── Parser do Diário de Trabalho ─────────────────────────────────
  // Suporta dois formatos encontrados nos dados:
  //   Formato 1: "DD/MM/YYYY HH:mm:ss - Autor (Tipo)Conteúdo"
  //   Formato 2: "YYYY-MM-DD HH:mm - TICKET-NOME - Tel.:Conteúdo"
  var RE_TS = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/g;

  function parseTimestamp(ts) {
    ts = (ts || '').trim();
    var m1 = ts.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1], +m1[4], +m1[5], +(m1[6] || 0));
    var m2 = ts.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3], +m2[4], +m2[5], +(m2[6] || 0));
    return new Date(NaN);
  }

  function parseDiario(texto) {
    if (!texto) return [];
    RE_TS.lastIndex = 0;
    var positions = [];
    var m;
    while ((m = RE_TS.exec(texto)) !== null) {
      var dt = parseTimestamp(m[1]);
      if (!isNaN(dt.getTime())) positions.push({ dt: dt, pos: m.index, len: m[1].length });
    }
    if (!positions.length) return [];

    return positions.map(function (entry, i) {
      var bodyStart = entry.pos + entry.len;
      var bodyEnd   = i + 1 < positions.length ? positions[i + 1].pos : texto.length;
      var body = texto.slice(bodyStart, bodyEnd).replace(/^\s*-\s*/, '').trim();
      // Extrai autor: texto antes de "(" ou final de linha ou " - Tel."
      var authorRaw = body.match(/^([^(\n\r]{1,70}?)(?:\s*[\(\n\r]|$)/);
      var author = authorRaw
        ? authorRaw[1].replace(/\s*-\s*Tel\.?:.*$/, '').trim()
        : '';
      // Limita tamanho do autor e remove sufixos técnicos comuns
      author = author.replace(/\s*\(.*$/, '').trim();
      if (author.length > 50) author = author.substring(0, 50);
      return { dt: entry.dt, author: author || 'Sistema', content: body };
    });
  }

  // Filtra entradas genuínas do time — dois formatos suportados:
  // Formato 1 (TLP-T): TLP-Txxxxxxx-NOME - YYYY-MM-DD HH:MM
  // Formato 2 (Data-Nome): DD/MM/YYYY HH:MM:SS - NOME COMPLETO
  var RE_TLP_A    = /TLP-T\d+-([^-\r\n]{3,60}?)\s*-\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/g;
  var RE_DTNAME_A = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\s*-\s*([^\r\n]{5,80})/g;
  var RE_TS_A     = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{4}[\/\-]\d{2}[\/\-]\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}[\/\-]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)/g;
  // Bot filter: nomes de sistemas automáticos (início) OU "(Anotações de trabalho)" em qualquer posição
  var RE_BOT_A = /^(?:MONITOR\s*CCI|WFM\s*Agent|isoc_fixa|[Aa]utoma[çc][aã]o|Sistema\s*autom|System\b|Raio-X|dsoc_[a-z_]|taischatbot|\w+chatbot)|\(anota/i;

  function parseTlpEntriesA(texto) {
    if (!texto) return [];
    var entries = [], m;
    // Formato 1: TLP-T
    RE_TLP_A.lastIndex = 0;
    while ((m = RE_TLP_A.exec(texto)) !== null) {
      var dt = parseTimestamp(m[2].trim());
      if (!isNaN(dt.getTime())) entries.push({ dt: dt, author: m[1].trim(), content: '' });
    }
    // Formato 2: DD/MM/YYYY HH:MM:SS - NOME
    RE_DTNAME_A.lastIndex = 0;
    while ((m = RE_DTNAME_A.exec(texto)) !== null) {
      var nome = m[2].trim();
      if (RE_BOT_A.test(nome)) continue;
      var p2 = m[1].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!p2) continue;
      var dt2 = new Date(+p2[3], +p2[2]-1, +p2[1], +p2[4], +p2[5], p2[6]?+p2[6]:0);
      if (!isNaN(dt2.getTime())) entries.push({ dt: dt2, author: nome, content: '' });
    }
    // Formato 3: bloco "ATUALIZAÇÃO GMG" — localiza timestamp anterior mais próximo
    var RE_GMG_A = /ATUALIZA[ÇC][AÃ]O\s+GMG/gi;
    RE_GMG_A.lastIndex = 0;
    while ((m = RE_GMG_A.exec(texto)) !== null) {
      var before = texto.substring(0, m.index);
      var reScan = new RegExp(RE_TS_A.source, 'g');
      var tsMatch = null, tsMt;
      while ((tsMt = reScan.exec(before)) !== null) tsMatch = tsMt;
      if (!tsMatch) continue;
      var dtGmg = parseTimestamp(tsMatch[1]);
      if (!isNaN(dtGmg.getTime())) entries.push({ dt: dtGmg, author: 'GMG', content: '' });
    }
    return entries.sort(function (a, b) { return a.dt - b.dt; });
  }

  // ── Formatação ────────────────────────────────────────────────────
  function fmtHM(dt) {
    return ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
  }
  function fmtDDMM(dt) {
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2);
  }
  function fmtGap(hours) {
    if (hours < 1)  return Math.round(hours * 60) + 'min';
    if (hours < 24) return hours.toFixed(1) + 'h';
    return (hours / 24).toFixed(1) + 'd';
  }
  function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }

  // ── Computação ────────────────────────────────────────────────────
  function computarDiario(tasks) {
    var stats = [];
    var semDiario = 0;
    var allGaps = [];           // todos os intervalos entre entradas (em horas)
    var totalEntradas = 0;
    var authorCount  = {};
    var hourCount    = new Array(24).fill(0);

    (tasks || []).forEach(function (t) {
      var entries = parseTlpEntriesA(t.motivoCancelamento || '');
      if (!entries.length) { semDiario++; return; }

      totalEntradas += entries.length;

      entries.forEach(function (e) {
        hourCount[e.dt.getHours()]++;
        var a = e.author || 'Sistema';
        authorCount[a] = (authorCount[a] || 0) + 1;
      });

      var gaps = [];
      for (var i = 1; i < entries.length; i++) {
        var gapH = (entries[i].dt - entries[i - 1].dt) / 3600000;
        // ignora gaps negativos (dados fora de ordem) ou irreais (> 30 dias)
        if (gapH >= 0 && gapH < 720) {
          gaps.push(gapH);
          allGaps.push(gapH);
        }
      }

      var avgGapH = gaps.length
        ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length
        : null;
      var lastDt = entries[entries.length - 1].dt;
      var horasSemUpd = Math.max(0, (Date.now() - lastDt.getTime()) / 3600000);

      stats.push({
        task: t,
        entries: entries,
        nEntries: entries.length,
        gaps: gaps,
        avgGapH: avgGapH,
        lastDt: lastDt,
        horasSemUpd: horasSemUpd
      });
    });

    var avgGapGlobal = allGaps.length
      ? allGaps.reduce(function (a, b) { return a + b; }, 0) / allGaps.length
      : 0;

    var sorted = allGaps.slice().sort(function (a, b) { return a - b; });
    var mediana = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    var topAuthors = Object.keys(authorCount)
      .map(function (a) { return { author: a, count: authorCount[a] }; })
      .sort(function (a, b) { return b.count - a.count; }); // lista completa, sem slice

    // Ordenar por horasSemUpd desc (mais em risco primeiro)
    stats.sort(function (a, b) { return b.horasSemUpd - a.horasSemUpd; });

    return {
      stats: stats,
      semDiario: semDiario,
      totalEntradas: totalEntradas,
      allGaps: allGaps,
      avgGapH: avgGapGlobal,
      mediana: mediana,
      topAuthors: topAuthors,
      hourCount: hourCount
    };
  }

  // ── Gráfico: histograma de intervalos ─────────────────────────────
  function chartHistograma(canvas, allGaps) {
    var buckets = [
      { label: '< 30min',   min: 0,   max: 0.5,  cor: '#2ecc71' },
      { label: '30min–1h',  min: 0.5, max: 1,    cor: '#27ae60' },
      { label: '1–2h',      min: 1,   max: 2,    cor: '#3498db' },
      { label: '2–4h',      min: 2,   max: 4,    cor: '#f39c12' },
      { label: '4–8h',      min: 4,   max: 8,    cor: '#e67e22' },
      { label: '8–24h',     min: 8,   max: 24,   cor: '#e74c3c' },
      { label: '> 24h',     min: 24,  max: Infinity, cor: '#c0392b' }
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
        datasets: [{
          label: 'Ocorrências',
          data:  buckets.map(function (b) { return b.count; }),
          backgroundColor: buckets.map(function (b) { return b.cor; }),
          borderRadius: 4, maxBarThickness: 54
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() } },
          y: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE }
      }
    });
    _charts.push(c); return c;
  }

  // ── Modal: ranking completo de autores ───────────────────────────
  function abrirRankingAutores(allAuthors, highlightAuthor) {
    var total = allAuthors.reduce(function (s, a) { return s + a.count; }, 0);
    var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    allAuthors.forEach(function (a, i) {
      var isHl = a.author === highlightAuthor;
      var pctVal = total > 0 ? Math.round(a.count / total * 100) : 0;
      var item = h('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: isHl ? 'rgba(255,140,0,0.08)' : 'transparent' }
      }, [
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', width: '24px', textAlign: 'right' }, text: String(i + 1) }),
        h('span', { style: { flex: 1, fontSize: '12px', fontWeight: isHl ? '700' : '400', color: isHl ? '#ff8c00' : 'var(--trj-fg)' }, text: a.author }),
        h('div', { style: { width: '120px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' } }, [
          h('div', { style: { width: pctVal + '%', minWidth: '2px', height: '6px', background: isHl ? '#ff8c00' : '#3498db', borderRadius: '3px' } })
        ]),
        h('span', { style: { fontSize: '12px', color: '#ff8c00', fontWeight: '600', width: '32px', textAlign: 'right' }, text: String(a.count) }),
        h('span', { style: { fontSize: '11px', color: 'var(--trj-muted)', width: '36px', textAlign: 'right' }, text: pctVal + '%' })
      ]);
      wrap.appendChild(item);
    });
    U.openModal('Ranking Completo de Autores (' + allAuthors.length + ')', wrap);
  }

  // ── Gráfico: top autores ──────────────────────────────────────────
  function chartAutores(canvas, allAuthors) {
    var top12 = allAuthors.slice(0, 12);
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: top12.map(function (a) {
          return a.author.length > 28 ? a.author.substring(0, 28) + '…' : a.author;
        }),
        datasets: [{
          label: 'Atualizações',
          data: top12.map(function (a) { return a.count; }),
          backgroundColor: '#ff8c00', borderRadius: 4, maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true },
          y: { ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
        onClick: function (ev, els) {
          if (!els || !els.length) { abrirRankingAutores(allAuthors, null); return; }
          var clicked = top12[els[0].index];
          abrirRankingAutores(allAuthors, clicked ? clicked.author : null);
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Gráfico: atividade por hora ───────────────────────────────────
  function chartHoras(canvas, hourCount) {
    var comercial = function (i) { return i >= 7 && i <= 21; };
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, function (_, i) { return ('0' + i).slice(-2) + 'h'; }),
        datasets: [{
          label: 'Atualizações',
          data: hourCount,
          backgroundColor: hourCount.map(function (_, i) {
            return comercial(i) ? 'rgba(255,140,0,0.75)' : 'rgba(231,76,60,0.65)';
          }),
          borderRadius: 3, maxBarThickness: 30
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

  // ── Gráfico: distribuição do intervalo médio por OS ───────────────
  function chartMediaPorOS(canvas, stats) {
    var b = [
      { label: '< 1h',    count: 0, cor: '#2ecc71' },
      { label: '1–2h',    count: 0, cor: '#3498db' },
      { label: '2–4h',    count: 0, cor: '#f39c12' },
      { label: '4–8h',    count: 0, cor: '#e67e22' },
      { label: '8–24h',   count: 0, cor: '#e74c3c' },
      { label: '> 24h',   count: 0, cor: '#c0392b' },
      { label: '1 entrada', count: 0, cor: '#7f8c8d' }
    ];
    stats.forEach(function (s) {
      if (s.avgGapH === null) { b[6].count++; return; }
      if (s.avgGapH < 1)      b[0].count++;
      else if (s.avgGapH < 2) b[1].count++;
      else if (s.avgGapH < 4) b[2].count++;
      else if (s.avgGapH < 8) b[3].count++;
      else if (s.avgGapH < 24) b[4].count++;
      else                      b[5].count++;
    });
    var c = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: b.map(function (x) { return x.label; }),
        datasets: [{
          data:            b.map(function (x) { return x.count; }),
          backgroundColor: b.map(function (x) { return x.cor; }),
          borderColor: 'transparent', borderWidth: 0, hoverOffset: 6
        }]
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

  // ── Modal: linha do tempo de uma OS ──────────────────────────────
  function abrirTimeline(stat) {
    var entries = stat.entries;
    var wrap = h('div', { style: { maxHeight: '68vh', overflowY: 'auto', padding: '6px 4px' } });

    // Cabeçalho resumido
    wrap.appendChild(h('div', { class: 'trj-card p-3 mb-4 flex gap-6', style: { fontSize: '12px', flexWrap: 'wrap' } }, [
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'ENTRADAS' }), h('div', { class: 'font-bold text-base', text: String(entries.length) })]),
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'INTERVALO MÉDIO' }), h('div', { class: 'font-bold text-base', text: stat.avgGapH != null ? fmtGap(stat.avgGapH) : '—' })]),
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'ÚLTIMA ATUALIZ.' }), h('div', { class: 'font-bold text-base', text: fmtDDMM(stat.lastDt) + ' ' + fmtHM(stat.lastDt) })]),
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'STATUS' }), h('div', { class: 'font-bold text-base', text: stat.task.status || '—' })])
    ]));

    entries.forEach(function (entry, i) {
      var isFirst = i === 0;
      var isLast  = i === entries.length - 1;
      var gapH    = i > 0 ? (entry.dt - entries[i - 1].dt) / 3600000 : null;
      var dotCor  = isLast ? '#ff8c00' : isFirst ? '#2ecc71' : '#3498db';

      // Separador de gap entre entradas
      if (gapH !== null && gapH >= 0 && gapH < 720) {
        var gapCor = gapH > 8 ? '#e74c3c' : gapH > 4 ? '#f39c12' : 'var(--trj-muted)';
        wrap.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0 3px 18px' } }, [
          h('div', { style: { width: '2px', height: '18px', background: 'rgba(255,140,0,0.25)', marginLeft: '5px' } }),
          h('span', { style: { color: gapCor, fontSize: '11px', marginLeft: '10px', fontWeight: gapH > 4 ? '600' : '400' },
            text: '+ ' + fmtGap(gapH) })
        ]));
      }

      var preview = entry.content.length > 300
        ? entry.content.substring(0, 300) + '…' : entry.content;
      // Limpar tags HTML/código inline do conteúdo
      preview = preview.replace(/<[^>]+>/g, '').replace(/\[code\].*?\[\/code\]/gs, '[...]').trim();

      wrap.appendChild(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } }, [
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 } }, [
          h('div', { style: { width: '11px', height: '11px', borderRadius: '50%', background: dotCor,
                              marginTop: '4px', flexShrink: 0, boxShadow: '0 0 0 2px ' + dotCor + '30' } })
        ]),
        h('div', { class: 'trj-card p-3', style: { flex: 1, fontSize: '12px', marginBottom: '0' } }, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px', gap: '8px', flexWrap: 'wrap' } }, [
            h('span', { style: { color: dotCor, fontWeight: '700' },
              text: fmtDDMM(entry.dt) + ' ' + fmtHM(entry.dt) }),
            h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', textAlign: 'right' }, text: entry.author })
          ]),
          h('div', { style: { color: 'var(--trj-fg)', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
            text: preview })
        ])
      ]));
    });

    U.openModal('Timeline — OS ' + (stat.task.osNumero || '?'), wrap);
  }

  // ── Seção title helper ────────────────────────────────────────────
  function secTitle(texto, cor) {
    return h('div', { class: 'flex items-center gap-2 mb-3 mt-2',
      style: { borderBottom: '1px solid rgba(255,140,0,0.15)', paddingBottom: '8px' } }, [
      h('span', { style: { width: '4px', height: '16px', borderRadius: '2px', background: cor, display: 'inline-block' } }),
      h('span', { class: 'text-xs font-bold uppercase tracking-widest', style: { color: cor }, text: texto })
    ]);
  }

  // ── Página principal ──────────────────────────────────────────────
  TRJ.pages.atualizacoes = function (container, ctx) {
    var data = ctx && ctx.data;
    destroyLocalCharts();

    if (!data || !(data.tasksEnriched || []).length) {
      container.appendChild(h('div', { class: 'trj-card p-8 text-center' }, [
        h('div', { style: { fontSize: '2.2rem', marginBottom: '12px' }, text: '📝' }),
        h('div', { class: 'font-bold mb-2', text: 'Nenhum dado carregado' }),
        h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px' },
          text: 'Importe a planilha pela aba "Importar dados" para analisar o diário de trabalho.' })
      ]));
      return;
    }

    if (U.pageHeader) {
      container.appendChild(U.pageHeader('Média de atualizações CSM', 'Análise de atualizações e linha do tempo por OS (col. BG)'));
    }

    var allTasks = data.tasksEnriched;
    var areaEl = h('div', {});
    container.appendChild(areaEl);

    function render() {
      destroyLocalCharts();
      areaEl.innerHTML = '';

      // ── Filtros ──────────────────────────────────────────────────
      var periodos = [{ l: 'Todos', v: 0 }, { l: '7d', v: 7 }, { l: '15d', v: 15 }, { l: '30d', v: 30 }];
      var btnsPeriodo = periodos.map(function (p) {
        return h('button', {
          class: 'trj-btn ' + (_stateAtu.periodo === p.v ? 'trj-btn-primary' : 'trj-btn-ghost'),
          style: { fontSize: '11px', padding: '3px 10px' },
          text: p.l,
          onclick: function () { _stateAtu.periodo = p.v; render(); }
        });
      });

      var C2 = (window.TRJ && TRJ.constants) || {};
      var prios = ['TODAS', 'P1', 'P2', 'P3', 'P4', 'P5', 'PREDITIVA'];
      var btnsPrio = prios.map(function (p) {
        return h('button', {
          class: 'trj-btn ' + (_stateAtu.prioridade === p ? 'trj-btn-primary' : 'trj-btn-ghost'),
          style: { fontSize: '11px', padding: '3px 10px' },
          text: p === 'TODAS' ? 'Todas' : p,
          onclick: function () { _stateAtu.prioridade = p; render(); }
        });
      });

      areaEl.appendChild(h('div', {
        class: 'trj-card p-3 mb-5',
        style: { borderColor: 'rgba(255,140,0,0.2)' }
      }, [
        h('div', { class: 'flex items-center gap-3 flex-wrap mb-2' }, [
          h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'PERÍODO:' }),
          h('div', { class: 'flex gap-2' }, btnsPeriodo)
        ]),
        h('div', { class: 'flex items-center gap-3 flex-wrap' }, [
          h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'PRIORIDADE:' }),
          h('div', { class: 'flex gap-2 flex-wrap' }, btnsPrio)
        ])
      ]));

      // Filtrar tasks por período e prioridade
      var now = Date.now();
      var limite = _stateAtu.periodo ? now - _stateAtu.periodo * 864e5 : 0;
      var tasks = allTasks.filter(function (t) {
        if (_stateAtu.prioridade !== 'TODAS') {
          var isPred = t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA';
          if (_stateAtu.prioridade === 'PREDITIVA' && !isPred) return false;
          if (_stateAtu.prioridade !== 'PREDITIVA' && isPred) return false;
          if (_stateAtu.prioridade !== 'PREDITIVA' && (t.prioridade || '').toUpperCase() !== _stateAtu.prioridade) return false;
        }
        if (limite) {
          var ref = t.fimCalc ? new Date(t.fimCalc).getTime() : (t.dataCriacao ? new Date(t.dataCriacao).getTime() : 0);
          if (ref && ref < limite) {
            var st2 = (t.status || '').toUpperCase();
            if (st2.indexOf('CONCLU') >= 0 || st2.indexOf('CANCEL') >= 0) return false;
          }
        }
        return true;
      });

      var result = computarDiario(tasks);
      var s = result.stats;
      var comDiario = s.length;
      var totalOSs  = comDiario + result.semDiario;
      var pctCom    = pct(comDiario, totalOSs);
      var avgFmt    = result.avgGapH > 0 ? fmtGap(result.avgGapH) : '—';
      var medFmt    = result.mediana  > 0 ? fmtGap(result.mediana)  : '—';
      var avgEntradas = comDiario > 0 ? (result.totalEntradas / comDiario).toFixed(1) : '0';
      var abertas4h = s.filter(function (st) {
        var status = (st.task.status || '').toUpperCase();
        var aberta = status.indexOf('CONCLU') < 0 && status.indexOf('CANCEL') < 0;
        return aberta && st.horasSemUpd > 4;
      }).length;

      // ── KPIs ──────────────────────────────────────────────────────
      areaEl.appendChild(h('div', { class: 'grid gap-3 mb-5', style: { gridTemplateColumns: 'repeat(4,1fr)' } }, [
        U.kpiCard({ label: 'OSs com Diário', value: pctCom + '%',
          cor: pctCom >= 80 ? '#2ecc71' : pctCom >= 50 ? '#f39c12' : '#e74c3c',
          sub: comDiario + ' de ' + totalOSs + ' OSs' }),
        U.kpiCard({ label: 'Intervalo Médio', value: avgFmt,
          cor: '#ff8c00', sub: 'mediana: ' + medFmt }),
        U.kpiCard({ label: 'Entradas/OS', value: avgEntradas,
          cor: '#3498db', sub: result.totalEntradas + ' entradas no total' }),
        U.kpiCard({ label: 'Abertas s/ Atualiz. +4h', value: abertas4h,
          cor: abertas4h > 0 ? '#e74c3c' : '#2ecc71', sub: 'requerem atenção agora' })
      ]));

      // ── Gráficos ──────────────────────────────────────────────────
      areaEl.appendChild(secTitle('ANÁLISE DE INTERVALOS', '#ff8c00'));
      var row1 = h('div', { class: 'grid gap-4 mb-4', style: { gridTemplateColumns: '1fr 1fr' } });
      var ccHist = U.chartCard('DISTRIBUIÇÃO DOS INTERVALOS ENTRE ATUALIZAÇÕES', { hint: 'verde = rápido · vermelho = lento' });
      ccHist.card.style.minHeight = '240px';
      var ccDist = U.chartCard('INTERVALO MÉDIO POR OS', {});
      ccDist.card.style.minHeight = '240px';
      row1.appendChild(ccHist.card);
      row1.appendChild(ccDist.card);
      areaEl.appendChild(row1);

      areaEl.appendChild(secTitle('ATIVIDADE POR AUTOR E HORÁRIO', '#3498db'));
      var row2 = h('div', { class: 'grid gap-4 mb-5', style: { gridTemplateColumns: '1fr 1fr' } });
      var ccAuth = U.chartCard('TOP AUTORES DE ATUALIZAÇÃO', { hint: 'clique num autor para ver o ranking completo' });
      ccAuth.card.style.minHeight = '280px';
      var ccHora = U.chartCard('ATUALIZAÇÕES POR HORA DO DIA', { hint: 'laranja = horário comercial · vermelho = fora do horário' });
      ccHora.card.style.minHeight = '280px';
      row2.appendChild(ccAuth.card);
      row2.appendChild(ccHora.card);
      areaEl.appendChild(row2);

      // Botão ranking completo abaixo do gráfico de autores
      if (result.topAuthors.length > 12) {
        areaEl.appendChild(h('div', { class: 'flex justify-end mb-4', style: { marginTop: '-12px' } }, [
          h('button', {
            class: 'trj-btn trj-btn-ghost',
            style: { fontSize: '11px', padding: '3px 12px' },
            text: 'Ver ranking completo (' + result.topAuthors.length + ' autores)',
            onclick: function () { abrirRankingAutores(result.topAuthors, null); }
          })
        ]));
      }

      setTimeout(function () {
        if (result.allGaps.length) chartHistograma(ccHist.canvas, result.allGaps);
        chartMediaPorOS(ccDist.canvas, s);
        if (result.topAuthors.length) chartAutores(ccAuth.canvas, result.topAuthors);
        chartHoras(ccHora.canvas, result.hourCount);
      }, 0);

      // ── Tabela: OSs por tempo sem atualização ─────────────────────
      areaEl.appendChild(secTitle('OSs ABERTAS — TEMPO SEM ATUALIZAÇÃO', '#e74c3c'));
      areaEl.appendChild(h('div', { style: { color: 'var(--trj-muted)', fontSize: '12px', marginBottom: '10px' },
        text: 'Clique em qualquer linha ou "Ver timeline" para abrir a linha do tempo completa da OS.' }));

      var riskRows = s.filter(function (st) {
        var status = (st.task.status || '').toUpperCase();
        return status.indexOf('CONCLU') < 0 && status.indexOf('CANCEL') < 0;
      }).slice(0, 50);

      if (!riskRows.length) {
        areaEl.appendChild(h('div', { class: 'trj-card p-5 text-center', style: { color: 'var(--trj-muted)', fontSize: '13px' },
          text: 'Nenhuma OS aberta com diário preenchido encontrada.' }));
      } else {
        var tbl = h('div', { class: 'trj-card', style: { overflowX: 'auto' } });
        var table = h('table', { style: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' } });
        var thead = h('thead', {});
        thead.appendChild(h('tr', { style: { borderBottom: '1px solid rgba(255,140,0,0.2)', color: 'var(--trj-muted)', textAlign: 'left', fontSize: '11px' } }, [
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'OS' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'NE ID' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'Status' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'Prioridade' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'Última atualiz.' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'Sem atualiz. há' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'Entradas' }),
          h('th', { style: { padding: '8px 12px', fontWeight: '600' }, text: 'Gap médio' }),
          h('th', { style: { padding: '8px 12px' } })
        ]));
        table.appendChild(thead);

        var tbody = h('tbody', {});
        riskRows.forEach(function (st) {
          var urgente = st.horasSemUpd > 8;
          var atencao = st.horasSemUpd > 4;
          var cor = urgente ? '#e74c3c' : atencao ? '#f39c12' : 'var(--trj-muted)';
          var rowBg = urgente ? 'rgba(231,76,60,0.05)' : atencao ? 'rgba(243,156,18,0.04)' : 'transparent';
          var isPredRow = st.task.statusSla === 'PREDITIVA' || st.task.fonteSla === 'PREDITIVA';

          var tr = h('tr', {
            style: { borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: rowBg },
            onclick: function () { abrirTimeline(st); }
          }, [
            h('td', { style: { padding: '8px 12px', color: '#ff8c00', fontWeight: '600' },
              text: st.task.osNumero || '—' }),
            h('td', { style: { padding: '8px 12px', color: 'var(--trj-muted)', fontSize: '11px' },
              text: String(st.task.enderecoId || '—') }),
            h('td', { style: { padding: '8px 12px' }, text: st.task.status || '—' }),
            h('td', { style: { padding: '8px 12px' },
              text: isPredRow ? 'PREDITIVA' : (st.task.prioridade || '—') }),
            h('td', { style: { padding: '8px 12px', color: 'var(--trj-muted)' },
              text: fmtDDMM(st.lastDt) + ' às ' + fmtHM(st.lastDt) }),
            h('td', { style: { padding: '8px 12px', color: cor, fontWeight: urgente ? '700' : '400' },
              text: fmtGap(st.horasSemUpd) }),
            h('td', { style: { padding: '8px 12px', color: 'var(--trj-muted)', textAlign: 'center' },
              text: String(st.nEntries) }),
            h('td', { style: { padding: '8px 12px', color: 'var(--trj-muted)' },
              text: st.avgGapH != null ? fmtGap(st.avgGapH) : '—' }),
            h('td', { style: { padding: '8px 12px' } }, [
              h('button', {
                class: 'trj-btn trj-btn-ghost',
                style: { fontSize: '11px', padding: '2px 10px' },
                text: 'Ver timeline',
                onclick: function (e) { e.stopPropagation(); abrirTimeline(st); }
              })
            ])
          ]);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tbl.appendChild(table);
        areaEl.appendChild(tbl);
      }

      if (s.length > riskRows.length) {
        areaEl.appendChild(h('div', { class: 'trj-card p-4 mt-4', style: { fontSize: '12px', color: 'var(--trj-muted)', textAlign: 'center' } }, [
          h('span', { text: 'Exibindo OSs abertas. ' }),
          h('button', {
            class: 'trj-btn trj-btn-ghost',
            style: { fontSize: '11px', padding: '2px 10px', display: 'inline-flex' },
            text: 'Ver todas (' + s.length + ') incluindo concluídas',
            onclick: function () { mostrarTodasModal(s); }
          })
        ]));
      }
    }

    render();
  };

  // ── Modal: lista completa de OSs com diário ───────────────────────
  function mostrarTodasModal(stats) {
    var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    stats.slice(0, 200).forEach(function (st) {
      var item = h('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' },
        onclick: function () { abrirTimeline(st); }
      }, [
        h('span', { style: { color: '#ff8c00', fontWeight: '600', fontSize: '12px' }, text: st.task.osNumero || '—' }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.status || '—' }),
        h('span', { style: { fontSize: '11px' }, text: st.nEntries + ' entradas' }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' },
          text: fmtGap(st.horasSemUpd) + ' atrás' })
      ]);
      wrap.appendChild(item);
    });
    U.openModal('Todas as OSs com Diário (' + stats.length + ')', wrap);
  }

})(window.TRJ = window.TRJ || {});
