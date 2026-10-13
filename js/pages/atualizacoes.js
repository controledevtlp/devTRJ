/* =====================================================================
 * atualizacoes.js — Análise do Diário de Trabalho (coluna BG)
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui;
  var h = U.h;
  var _charts = [];
  var _stateAtu = {
    periodo: 0,
    prioridades: [],
    rankingView: 'geral'
  };

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
      var authorRaw = body.match(/^([^(\n\r]{1,70}?)(?:\s*[\(\n\r]|$)/);
      var author = authorRaw ? authorRaw[1].replace(/\s*-\s*Tel\.?:.*$/, '').trim() : '';
      author = author.replace(/\s*\(.*$/, '').trim();
      if (author.length > 50) author = author.substring(0, 50);
      return { dt: entry.dt, author: author || 'Sistema', content: body };
    });
  }

  var RE_TLP_A    = /TLP-T\d+-([^-\r\n]{3,60}?)\s*-\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/g;
  var RE_DTNAME_A = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\s*-\s*([^\r\n]{5,80})/g;
  var RE_TS_A     = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{4}[\/\-]\d{2}[\/\-]\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}[\/\-]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)/g;
  var RE_BOT_A = /^(?:MONITOR\s*CCI|WFM\s*Agent|isoc_fixa|[Aa]utoma[çc][aã]o|Sistema\s*autom|System|Tentativa\s+\d+|Raio-X|dsoc_[a-z_]|taischatbot|\w+chatbot)/i;

  function parseTlpEntriesA(texto) {
    if (!texto) return [];
    var entries = [], m;
    RE_TLP_A.lastIndex = 0;
    while ((m = RE_TLP_A.exec(texto)) !== null) {
      var dt = parseTimestamp(m[2].trim());
      if (!isNaN(dt.getTime())) entries.push({ dt: dt, author: m[1].trim(), content: '' });
    }
    RE_DTNAME_A.lastIndex = 0;
    while ((m = RE_DTNAME_A.exec(texto)) !== null) {
      // Remove sufixo "(Anotações de trabalho)" antes de checar bot — a plataforma
      // acrescenta esse sufixo a TODOS os autores, inclusive humanos.
      var nome = m[2].trim().replace(/\s*\([Aa]nota[çc][õo]es\s+de\s+trabalho\)/i, '').trim();
      if (!nome || RE_BOT_A.test(nome)) continue;
      var p2 = m[1].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!p2) continue;
      // Descarta entradas cujo conteúdo imediato é formulário de sistema
      // (flag GMG por usuário humano, tramitação, retorno por alarme, etc.)
      var _posA = m.index + m[0].length;
      var _reProxA = new RegExp(RE_TS_A.source);
      var _mProxA = _reProxA.exec(texto.substring(_posA));
      var _blocoA = texto.substring(_posA, _mProxA ? _posA + _mProxA.index : texto.length).trim();
      if (U.isTextoSemAtualizacao && U.isTextoSemAtualizacao(_blocoA)) continue;
      var dt2 = new Date(+p2[3], +p2[2]-1, +p2[1], +p2[4], +p2[5], p2[6]?+p2[6]:0);
      if (!isNaN(dt2.getTime())) entries.push({ dt: dt2, author: nome, content: '' });
    }
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

  // Extrai datas/horas de cada evento "Tentativa N – Modo de validação" no diário.
  function extrairRetornosAlarmeDts(bg) {
    if (!bg) return [];
    var texto = bg.toString();
    var RE_TENT = /TENTATIVA\s+\d+\s*[–\-]\s*MODO DE VALIDA[ÇC][AÃ]O/gi;
    var RE_DT   = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/g;
    var dts = [], m;
    RE_TENT.lastIndex = 0;
    while ((m = RE_TENT.exec(texto)) !== null) {
      var before = texto.substring(0, m.index);
      RE_DT.lastIndex = 0;
      var tsM = null, tsMt;
      while ((tsMt = RE_DT.exec(before)) !== null) tsM = tsMt;
      if (tsM) {
        var pts = tsM[0].match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (pts) {
          var dt = new Date(+pts[3], +pts[2]-1, +pts[1], +pts[4], +pts[5], pts[6]?+pts[6]:0);
          if (!isNaN(dt.getTime())) dts.push(dt);
        }
      }
    }
    return dts;
  }

  // ── Formatação ────────────────────────────────────────────────────
  function fmtHM(dt) {
    return ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
  }
  function fmtDDMM(dt) {
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2);
  }
  function fmtGap(hours) {
    var totalMin = Math.round(hours * 60);
    if (totalMin < 60) return totalMin + 'min';
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h < 24) return m > 0 ? h + 'h' + m + 'min' : h + 'h';
    var d = Math.floor(h / 24);
    var rh = h % 24;
    return rh > 0 ? d + 'd' + rh + 'h' : d + 'd';
  }
  function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }

  // ── Computação ────────────────────────────────────────────────────
  function computarDiario(tasks) {
    var todayRef = new Date(); todayRef.setHours(0, 0, 0, 0);
    var todayStart = todayRef.getTime();

    var stats = [];
    var semDiario = 0;
    var allGaps = [];
    var totalEntradas = 0;
    var authorCount = {};
    var hourCount = new Array(24).fill(0);
    var hourCountEntrantes = new Array(24).fill(0);
    var hourCountRetorno   = new Array(24).fill(0);
    var retornosTasks = [];
    var retornosPerSite = {};
    var siteCount = {};

    // Contagem por site — todas as tasks (com e sem diário)
    (tasks || []).forEach(function (t) {
      var sk = (t.enderecoId || '').toString().trim().toUpperCase();
      if (!sk) return;
      if (!siteCount[sk]) siteCount[sk] = { site: t.site || sk, enderecoId: t.enderecoId || sk, siteId: t.siteId || '', regiao: t.regiao || '', count: 0 };
      siteCount[sk].count++;
      if (!siteCount[sk].siteId && t.siteId) siteCount[sk].siteId = t.siteId;
      if (!siteCount[sk].regiao && t.regiao) siteCount[sk].regiao = t.regiao;
    });

    (tasks || []).forEach(function (t) {
      var entries = parseTlpEntriesA(t.motivoCancelamento || '');
      if (!entries.length) { semDiario++; return; }

      totalEntradas += entries.length;
      // Primeira entrada do diário ≈ horário de entrada da task na fila
      hourCountEntrantes[entries[0].dt.getHours()]++;
      entries.forEach(function (e) {
        hourCount[e.dt.getHours()]++;
        var a = e.author || 'Sistema';
        authorCount[a] = (authorCount[a] || 0) + 1;
      });

      // Retornos por alarme (API Netcool)
      var retDts = extrairRetornosAlarmeDts(t.motivoCancelamento || '');
      retDts.forEach(function (dt) {
        hourCountRetorno[dt.getHours()]++;
        var sk2 = (t.enderecoId || '').toString().trim().toUpperCase();
        if (sk2) {
          if (!retornosPerSite[sk2]) retornosPerSite[sk2] = [];
          retornosPerSite[sk2].push({ dt: dt, osNumero: t.osNumero || '?' });
        }
      });
      if (retDts.length > 0) retornosTasks.push({ task: t, count: retDts.length, dts: retDts });

      var gaps = [];
      for (var i = 1; i < entries.length; i++) {
        var gapH = (entries[i].dt - entries[i - 1].dt) / 3600000;
        if (gapH >= 0 && gapH < 720) { gaps.push(gapH); allGaps.push(gapH); }
      }

      var avgGapH = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : null;
      var lastDt = entries[entries.length - 1].dt;
      var horasSemUpd = Math.max(0, (Date.now() - lastDt.getTime()) / 3600000);

      stats.push({ task: t, entries: entries, nEntries: entries.length, gaps: gaps, avgGapH: avgGapH, lastDt: lastDt, horasSemUpd: horasSemUpd });
    });

    // Build author → OS maps (geral e hoje) — segunda passagem sobre stats já prontos
    var authorOSmap = {};
    var todayOSmap  = {};

    stats.forEach(function (st) {
      var osNum = st.task.osNumero || '_sem_os_';
      st.entries.forEach(function (e) {
        var a = e.author || 'Sistema';

        if (!authorOSmap[a]) authorOSmap[a] = {};
        if (!authorOSmap[a][osNum]) authorOSmap[a][osNum] = { stat: st, count: 0, lastDt: null };
        authorOSmap[a][osNum].count++;
        if (!authorOSmap[a][osNum].lastDt || e.dt > authorOSmap[a][osNum].lastDt)
          authorOSmap[a][osNum].lastDt = e.dt;

        if (e.dt.getTime() >= todayStart) {
          if (!todayOSmap[a]) todayOSmap[a] = {};
          if (!todayOSmap[a][osNum]) todayOSmap[a][osNum] = { stat: st, count: 0, lastDt: null };
          todayOSmap[a][osNum].count++;
          if (!todayOSmap[a][osNum].lastDt || e.dt > todayOSmap[a][osNum].lastDt)
            todayOSmap[a][osNum].lastDt = e.dt;
        }
      });
    });

    function mapToArr(map) {
      var out = {};
      Object.keys(map).forEach(function (a) {
        out[a] = Object.keys(map[a]).map(function (os) { return map[a][os]; })
          .sort(function (x, y) { return y.count - x.count; });
      });
      return out;
    }

    var authorOSmapArr = mapToArr(authorOSmap);
    var todayOSmapArr  = mapToArr(todayOSmap);

    var todayAuthorCount = {};
    Object.keys(todayOSmapArr).forEach(function (a) {
      todayAuthorCount[a] = todayOSmapArr[a].reduce(function (s, x) { return s + x.count; }, 0);
    });
    var todayAuthors = Object.keys(todayAuthorCount)
      .map(function (a) { return { author: a, count: todayAuthorCount[a] }; })
      .sort(function (a, b) { return b.count - a.count; });

    var avgGapGlobal = allGaps.length ? allGaps.reduce(function (a, b) { return a + b; }, 0) / allGaps.length : 0;
    var sorted = allGaps.slice().sort(function (a, b) { return a - b; });
    var mediana = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    var topAuthors = Object.keys(authorCount)
      .map(function (a) { return { author: a, count: authorCount[a] }; })
      .sort(function (a, b) { return b.count - a.count; });

    stats.sort(function (a, b) { return b.horasSemUpd - a.horasSemUpd; });

    var topSites = Object.keys(siteCount)
      .map(function (k) { return siteCount[k]; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 30);

    retornosTasks.sort(function (a, b) { return b.count - a.count; });

    return {
      stats: stats, semDiario: semDiario, totalEntradas: totalEntradas,
      allGaps: allGaps, avgGapH: avgGapGlobal, mediana: mediana,
      topAuthors: topAuthors, hourCount: hourCount,
      hourCountEntrantes: hourCountEntrantes, hourCountRetorno: hourCountRetorno,
      retornosTasks: retornosTasks,
      retornosPerSite: retornosPerSite,
      topSites: topSites,
      authorOSmap: authorOSmapArr,
      todayAuthors: todayAuthors,
      todayAuthorOSmap: todayOSmapArr
    };
  }

  // ── Utilitário: copiar texto (mesma lógica do dashboard) ─────────
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt)
        .then(function () { U.toast('✓ Copiado!', 'ok'); })
        .catch(function () { _fbCopy(txt); });
    } else { _fbCopy(txt); }
    function _fbCopy(s) {
      var ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); U.toast('✓ Copiado!', 'ok'); }
      catch (e) { U.toast('Não foi possível copiar.', 'err'); }
      document.body.removeChild(ta);
    }
  }

  // ── Helper: badge de status ───────────────────────────────────────
  function statusBadge(statusStr) {
    var stUp = (statusStr || '').trim().toUpperCase();
    var cor, bg;
    if (stUp === 'INICIADO') { cor = '#1fae5e'; bg = 'rgba(31,174,94,.18)'; }
    else if (stUp.indexOf('NÃO') >= 0 || stUp === 'NAO INICIADO') { cor = '#9a7d00'; bg = 'rgba(241,196,15,.22)'; }
    else if (stUp.indexOf('CONCLU') >= 0) { cor = '#5b7ed6'; bg = 'rgba(91,126,214,.2)'; }
    else { cor = 'var(--trj-muted)'; bg = 'rgba(255,255,255,0.07)'; }
    return h('span', { style: { background: bg, color: cor, fontWeight: '700', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', whiteSpace: 'nowrap' }, text: statusStr || '—' });
  }

  // ── Gráfico: entrantes normais vs retornos por alarme por hora ────
  function chartEntrantes(canvas, hourCountEntrantes, hourCountRetorno, stats) {
    var labels = [];
    for (var i = 0; i < 24; i++) labels.push(('0' + i).slice(-2) + 'h');
    var totals = hourCountEntrantes.map(function (v, i) { return v + (hourCountRetorno[i] || 0); });
    var maxTotal = Math.max.apply(null, totals.concat([0]));
    var peakHour = maxTotal > 0 ? totals.indexOf(maxTotal) : -1;
    var normalBg  = hourCountEntrantes.map(function (_, i) { return i === peakHour ? 'rgba(255,140,0,0.92)' : 'rgba(255,140,0,0.38)'; });
    var retornoBg = hourCountRetorno.map(function (_, i)   { return i === peakHour ? 'rgba(231,76,60,0.92)'  : 'rgba(231,76,60,0.38)';  });
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Entrantes Normais', data: hourCountEntrantes, backgroundColor: normalBg,  borderRadius: 3, maxBarThickness: 18 },
          { label: 'Retorno por Alarme', data: hourCountRetorno,  backgroundColor: retornoBg, borderRadius: 3, maxBarThickness: 18 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 9 } }, grid: { color: gridClr() } },
          y: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true }
        },
        plugins: {
          legend: { display: true, labels: { color: tickClr(), font: { size: 10 }, boxWidth: 10, padding: 10 } },
          tooltip: TOOLTIP_STYLE
        },
        onClick: function (ev, els) {
          if (!els || !els.length || !stats) return;
          var hrIdx = els[0].index;
          var hrLabel = labels[hrIdx];
          var tasksHr = stats.filter(function (st) {
            return st.entries.some(function (e) { return e.dt.getHours() === hrIdx; });
          });
          if (!tasksHr.length) return;
          abrirDrilldownHora(hrLabel + ' — Entrantes / Retornos', tasksHr);
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Modal: drilldown autor → OSs que atualizou ────────────────────
  function abrirDrilldownAutor(authorName, osEntries) {
    if (!osEntries || !osEntries.length) {
      U.openModal(authorName, h('div', { style: { color: 'var(--trj-muted)', padding: '16px' }, text: 'Nenhuma OS encontrada.' }));
      return;
    }
    var total = osEntries.reduce(function (s, x) { return s + x.count; }, 0);
    var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });

    var topRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: '8px' } });
    topRow.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--trj-muted)' }, text: total + ' atualização(ões) em ' + osEntries.length + ' OS' + (osEntries.length !== 1 ? 's' : '') }));
    var cpBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' }, text: '📋 Copiar' });
    cpBtn.onclick = function () {
      var lines = ['TSK\tSITE\tEND ID\tFALHA\tAtualizações\tÚltima'];
      osEntries.forEach(function (entry) {
        var st = entry.stat;
        lines.push([st.task.osNumero || '—', st.task.siteId || '—', st.task.enderecoId || '—', st.task.tipoFalha || '—', entry.count + 'x', entry.lastDt ? fmtDDMM(entry.lastDt) + ' ' + fmtHM(entry.lastDt) : '—'].join('\t'));
      });
      copyText(lines.join('\n'));
    };
    topRow.appendChild(cpBtn);
    wrap.appendChild(topRow);

    // Cabeçalho de colunas
    wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.6fr 1fr auto', gap: '4px', padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
      h('span', { text: 'TSK' }), h('span', { text: 'Site' }), h('span', { text: 'END ID' }), h('span', { text: 'Falha' }), h('span', { text: 'Qtd.' }), h('span', { text: 'Última Atualiz.' }), h('span', { text: '' })
    ]));

    osEntries.forEach(function (entry) {
      var st = entry.stat;
      var item = h('div', {
        style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.6fr 1fr auto', gap: '4px', alignItems: 'center', padding: '8px 12px',
                 borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background .15s ease' },
        onclick: function () { abrirTimeline(st); }
      }, [
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' } }, [
          h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '12px' }, text: st.task.osNumero || '—' }),
          statusBadge(st.task.status)
        ]),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: st.task.siteId || '—' }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: String(st.task.enderecoId || '—') }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: st.task.tipoFalha || '—' }),
        h('span', { style: { fontSize: '11px', color: 'var(--trj-fg)', fontWeight: '600', textAlign: 'center' }, text: entry.count + 'x' }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' },
          text: entry.lastDt ? fmtDDMM(entry.lastDt) + ' ' + fmtHM(entry.lastDt) : '—' }),
        h('button', {
          class: 'trj-btn trj-btn-ghost',
          style: { fontSize: '10px', padding: '2px 8px', flexShrink: '0' },
          text: 'Timeline',
          onclick: function (e) { e.stopPropagation(); abrirTimeline(st); }
        })
      ]);
      item.addEventListener('mouseenter', function () { item.style.background = 'rgba(255,140,0,0.06)'; });
      item.addEventListener('mouseleave', function () { item.style.background = ''; });
      wrap.appendChild(item);
    });

    U.openModal(authorName + ' — OSs atualizadas (' + osEntries.length + ')', wrap);
  }

  // ── Modal: ranking completo de autores ───────────────────────────
  function abrirRankingAutores(allAuthors, highlightAuthor, osMap) {
    var total = allAuthors.reduce(function (s, a) { return s + a.count; }, 0);
    var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    allAuthors.forEach(function (a, i) {
      var isHl = a.author === highlightAuthor;
      var pctVal = total > 0 ? Math.round(a.count / total * 100) : 0;
      var osEntries = osMap && osMap[a.author] ? osMap[a.author] : null;
      var item = h('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: isHl ? 'rgba(255,140,0,0.08)' : 'transparent',
          cursor: osEntries ? 'pointer' : 'default', transition: 'background .15s ease' },
        onclick: osEntries ? (function (entries, name) { return function () { abrirDrilldownAutor(name, entries); }; })(osEntries, a.author) : null
      }, [
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', width: '24px', textAlign: 'right' }, text: String(i + 1) }),
        h('span', { style: { flex: '1', fontSize: '12px', fontWeight: isHl ? '700' : '400', color: isHl ? '#ff8c00' : 'var(--trj-fg)' }, text: a.author }),
        h('div', { style: { width: '120px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' } }, [
          h('div', { style: { width: pctVal + '%', minWidth: '2px', height: '6px', background: isHl ? '#ff8c00' : '#3498db', borderRadius: '3px' } })
        ]),
        h('span', { style: { fontSize: '12px', color: '#ff8c00', fontWeight: '600', width: '32px', textAlign: 'right' }, text: String(a.count) }),
        h('span', { style: { fontSize: '11px', color: 'var(--trj-muted)', width: '36px', textAlign: 'right' }, text: pctVal + '%' }),
        osEntries ? h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', paddingLeft: '4px' }, text: '›' }) : h('span', { style: { width: '12px' } })
      ]);
      if (osEntries) {
        item.addEventListener('mouseenter', function () { item.style.background = 'rgba(255,140,0,0.08)'; });
        item.addEventListener('mouseleave', function () { item.style.background = isHl ? 'rgba(255,140,0,0.08)' : ''; });
      }
      wrap.appendChild(item);
    });
    U.openModal('Ranking de Autores (' + allAuthors.length + ')', wrap);
  }

  // ── Gráfico: top autores (com drilldown) ─────────────────────────
  function chartAutores(canvas, allAuthors, authorOSmap) {
    var top12 = allAuthors.slice(0, 12);
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: top12.map(function (a) {
          return a.author.length > 28 ? a.author.substring(0, 28) + '…' : a.author;
        }),
        datasets: [{ label: 'Atualizações', data: top12.map(function (a) { return a.count; }), backgroundColor: '#ff8c00', borderRadius: 4, maxBarThickness: 28 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: tickClr(), font: { size: 11 } }, grid: { color: gridClr() }, beginAtZero: true },
          y: { ticks: { color: tickClr(), font: { size: 10 } }, grid: { color: gridClr() } }
        },
        plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
        onClick: function (ev, els) {
          if (!els || !els.length) { abrirRankingAutores(allAuthors, null, authorOSmap); return; }
          var clicked = top12[els[0].index];
          if (clicked && authorOSmap && authorOSmap[clicked.author]) {
            abrirDrilldownAutor(clicked.author, authorOSmap[clicked.author]);
          } else {
            abrirRankingAutores(allAuthors, clicked ? clicked.author : null, authorOSmap);
          }
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Drilldown genérico por hora ───────────────────────────────────
  function abrirDrilldownHora(titulo, tasksHr) {
    var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    var copyBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px', marginBottom: '8px' }, text: '📋 Copiar' });
    copyBtn.onclick = function () {
      var lines = ['TSK\tSITE\tEND ID\tSTATUS\tÚltima atualiz.'];
      tasksHr.forEach(function (st) {
        lines.push([st.task.osNumero || '—', st.task.siteId || '—', st.task.enderecoId || '—', st.task.status || '—', fmtDDMM(st.lastDt) + ' ' + fmtHM(st.lastDt)].join('\t'));
      });
      copyText(lines.join('\n'));
    };
    wrap.appendChild(copyBtn);
    // Cabeçalho
    var hdr = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: '4px', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
      h('span', { text: 'TSK' }), h('span', { text: 'Site' }), h('span', { text: 'END ID' }), h('span', { text: 'Status' }), h('span', { text: 'Última Atualiz.' }), h('span', { text: '' })
    ]);
    wrap.appendChild(hdr);
    tasksHr.forEach(function (st) {
      var row = h('div', {
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: '4px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', alignItems: 'center' },
        onclick: function () { abrirTimeline(st); }
      }, [
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
          h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '12px' }, text: st.task.osNumero || '—' }),
          statusBadge(st.task.status)
        ]),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.siteId || '—' }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: String(st.task.enderecoId || '—') }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.tipoFalha || '—' }),
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: fmtDDMM(st.lastDt) + ' ' + fmtHM(st.lastDt) }),
        h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 6px' }, text: 'Timeline', onclick: function (e) { e.stopPropagation(); abrirTimeline(st); } })
      ]);
      row.addEventListener('mouseenter', function () { row.style.background = 'rgba(255,140,0,0.06)'; });
      row.addEventListener('mouseleave', function () { row.style.background = ''; });
      wrap.appendChild(row);
    });
    U.openModal(titulo + ' (' + tasksHr.length + ' TSKs)', wrap);
  }

  // ── Gráfico: atividade por hora ───────────────────────────────────
  function chartHoras(canvas, hourCount, stats) {
    var labels = Array.from({ length: 24 }, function (_, i) { return ('0' + i).slice(-2) + 'h'; });
    var comercial = function (i) { return i >= 7 && i <= 21; };
    var maxH = Math.max.apply(null, hourCount.concat([0]));
    var bgColors = hourCount.map(function (v, i) {
      if (maxH > 0 && v === maxH) return comercial(i) ? 'rgba(255,140,0,0.92)' : 'rgba(231,76,60,0.88)';
      return comercial(i) ? 'rgba(255,140,0,0.32)' : 'rgba(231,76,60,0.28)';
    });
    var c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Atualizações', data: hourCount,
          backgroundColor: bgColors,
          borderRadius: 3, maxBarThickness: 30
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
          if (!els || !els.length || !stats) return;
          var hrIdx = els[0].index;
          var hrLabel = labels[hrIdx];
          var tasksHr = stats.filter(function (st) {
            return st.entries.some(function (e) { return e.dt.getHours() === hrIdx; });
          });
          if (!tasksHr.length) return;
          abrirDrilldownHora(hrLabel + ' — Atualizações', tasksHr);
        }
      }
    });
    _charts.push(c); return c;
  }

  // ── Card: ranking geral/hoje com drilldown (substitui INTERVALO MÉDIO POR OS) ──
  function buildRankingCard(result) {
    var card = h('div', { class: 'trj-card p-4', style: { display: 'flex', flexDirection: 'column', minHeight: '240px' } });

    var headerRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' } });
    var titleEl   = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      h('span', { class: 'trj-chart-dot' }),
      h('span', { style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--trj-muted)' }, text: 'RANKING DE ATUALIZAÇÕES' })
    ]);

    var btnGeral = h('button', { class: 'trj-btn trj-btn-primary',  style: { fontSize: '10px', padding: '2px 8px' }, text: 'Geral' });
    var btnHoje  = h('button', { class: 'trj-btn trj-btn-ghost',    style: { fontSize: '10px', padding: '2px 8px' }, text: 'Hoje' });
    var toggleEl = h('div', { style: { display: 'flex', gap: '4px' } }, [btnGeral, btnHoje]);

    function syncToggle() {
      var isGeral = _stateAtu.rankingView === 'geral';
      btnGeral.className = 'trj-btn ' + (isGeral  ? 'trj-btn-primary' : 'trj-btn-ghost');
      btnHoje.className  = 'trj-btn ' + (!isGeral ? 'trj-btn-primary' : 'trj-btn-ghost');
      btnGeral.style.cssText = 'font-size:10px;padding:2px 8px';
      btnHoje.style.cssText  = 'font-size:10px;padding:2px 8px';
    }

    var listEl = h('div', { style: { flex: '1', overflowY: 'auto', maxHeight: '220px' } });

    function renderList() {
      listEl.innerHTML = '';
      var isHoje   = _stateAtu.rankingView === 'hoje';
      var authors  = isHoje ? result.todayAuthors  : result.topAuthors;
      var osMap    = isHoje ? result.todayAuthorOSmap : result.authorOSmap;

      if (!authors || !authors.length) {
        listEl.appendChild(h('div', { style: { color: 'var(--trj-muted)', fontSize: '12px', padding: '20px 8px', textAlign: 'center' },
          text: isHoje ? 'Nenhuma atualização registrada hoje.' : 'Sem dados.' }));
        return;
      }

      var total = authors.reduce(function (s, a) { return s + a.count; }, 0);
      var max   = authors[0].count;

      authors.slice(0, 15).forEach(function (a, i) {
        var pctVal   = total > 0 ? Math.round(a.count / total * 100) : 0;
        var barW     = max > 0 ? (a.count / max * 100) : 0;
        var osEnt    = osMap && osMap[a.author];

        var barra = h('div', { style: { width: barW + '%', minWidth: '2px', height: '5px', borderRadius: '3px', background: '#ff8c00', transition: 'background .2s ease' } });

        var row = h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '6px', cursor: osEnt ? 'pointer' : 'default', transition: 'background .15s ease' }
        }, [
          h('span', { style: { color: 'var(--trj-muted)', fontSize: '10px', width: '18px', textAlign: 'right', flexShrink: '0' }, text: String(i + 1) }),
          h('div', { style: { flex: '1', minWidth: '0' } }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px', alignItems: 'center' } }, [
              h('span', { style: { fontSize: '11px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }, text: a.author }),
              h('div', { style: { display: 'flex', gap: '5px', alignItems: 'center', flexShrink: '0' } }, [
                h('span', { style: { color: 'var(--trj-muted)', fontSize: '10px' }, text: pctVal + '%' }),
                h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '11px', minWidth: '20px', textAlign: 'right' }, text: String(a.count) }),
                osEnt ? h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px' }, text: '›' }) : h('span', { style: { width: '10px' } })
              ])
            ]),
            h('div', { style: { background: 'rgba(255,255,255,0.06)', borderRadius: '3px', height: '5px', overflow: 'hidden' } }, barra)
          ])
        ]);

        if (osEnt) {
          row.addEventListener('mouseenter', function () { row.style.background = 'rgba(255,140,0,0.07)'; barra.style.background = '#ffaa33'; });
          row.addEventListener('mouseleave', function () { row.style.background = ''; barra.style.background = '#ff8c00'; });
          row.addEventListener('click', (function (n, e) { return function () { abrirDrilldownAutor(n, e); }; })(a.author, osEnt));
        }

        listEl.appendChild(row);
      });

      if (authors.length > 15) {
        listEl.appendChild(h('div', { style: { textAlign: 'center', paddingTop: '8px' } }, [
          h('button', {
            class: 'trj-btn trj-btn-ghost',
            style: { fontSize: '10px', padding: '2px 10px' },
            text: 'Ver todos (' + authors.length + ')',
            onclick: function () { abrirRankingAutores(authors, null, osMap); }
          })
        ]));
      }
    }

    btnGeral.onclick = function () { _stateAtu.rankingView = 'geral'; syncToggle(); renderList(); };
    btnHoje.onclick  = function () { _stateAtu.rankingView = 'hoje';  syncToggle(); renderList(); };

    headerRow.appendChild(titleEl);
    headerRow.appendChild(toggleEl);
    card.appendChild(headerRow);
    card.appendChild(listEl);
    renderList();
    return card;
  }

  // ── Modal: linha do tempo de uma OS ──────────────────────────────
  function abrirTimeline(stat) {
    var entries = stat.entries;
    var wrap = h('div', { style: { maxHeight: '68vh', overflowY: 'auto', padding: '6px 4px' } });

    wrap.appendChild(h('div', { class: 'trj-card p-3 mb-4 flex gap-6', style: { fontSize: '12px', flexWrap: 'wrap' } }, [
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'ENTRADAS' }), h('div', { class: 'font-bold text-base', text: String(entries.length) })]),
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'INTERVALO MÉDIO' }), h('div', { class: 'font-bold text-base', text: stat.avgGapH != null ? fmtGap(stat.avgGapH) : '—' })]),
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'ÚLTIMA ATUALIZ.' }), h('div', { class: 'font-bold text-base', text: fmtDDMM(stat.lastDt) + ' ' + fmtHM(stat.lastDt) })]),
      h('div', {}, [h('div', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'STATUS' }), h('div', { class: 'font-bold text-base', text: stat.task.status || '—' })])
    ]));

    entries.forEach(function (entry, i) {
      var isFirst = i === 0, isLast = i === entries.length - 1;
      var gapH = i > 0 ? (entry.dt - entries[i - 1].dt) / 3600000 : null;
      var dotCor = isLast ? '#ff8c00' : isFirst ? '#2ecc71' : '#3498db';

      if (gapH !== null && gapH >= 0 && gapH < 720) {
        var gapCor = gapH > 8 ? '#e74c3c' : gapH > 4 ? '#f39c12' : 'var(--trj-muted)';
        wrap.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0 3px 18px' } }, [
          h('div', { style: { width: '2px', height: '18px', background: 'rgba(255,140,0,0.25)', marginLeft: '5px' } }),
          h('span', { style: { color: gapCor, fontSize: '11px', marginLeft: '10px', fontWeight: gapH > 4 ? '600' : '400' }, text: '+ ' + fmtGap(gapH) })
        ]));
      }

      var preview = entry.content.length > 300 ? entry.content.substring(0, 300) + '…' : entry.content;
      preview = preview.replace(/<[^>]+>/g, '').replace(/\[code\].*?\[\/code\]/gs, '[...]').trim();

      wrap.appendChild(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } }, [
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: '0' } }, [
          h('div', { style: { width: '11px', height: '11px', borderRadius: '50%', background: dotCor, marginTop: '4px', flexShrink: '0', boxShadow: '0 0 0 2px ' + dotCor + '30' } })
        ]),
        h('div', { class: 'trj-card p-3', style: { flex: '1', fontSize: '12px', marginBottom: '0' } }, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px', gap: '8px', flexWrap: 'wrap' } }, [
            h('span', { style: { color: dotCor, fontWeight: '700' }, text: fmtDDMM(entry.dt) + ' ' + fmtHM(entry.dt) }),
            h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', textAlign: 'right' }, text: entry.author })
          ]),
          h('div', { style: { color: 'var(--trj-fg)', lineHeight: '1.55', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }, text: preview })
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
      // Período: input numérico manual + botão Todos
      var periodoInput = h('input', {
        type: 'text',
        value: _stateAtu.periodo ? String(_stateAtu.periodo) : '',
        placeholder: 'ex: 30',
        style: {
          width: '68px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
          border: '1px solid rgba(255,255,255,0.15)', background: 'var(--trj-bg-card)',
          color: 'var(--trj-fg)', outline: 'none', textAlign: 'center'
        },
        oninput: function () { this.value = this.value.replace(/[^0-9]/g, ''); },
        onchange: function () {
          var v = parseInt(this.value, 10);
          _stateAtu.periodo = (isNaN(v) || v <= 0) ? 0 : v;
          if (!_stateAtu.periodo) this.value = '';
          render();
        }
      });

      var btnTodos = h('button', {
        class: 'trj-btn ' + (!_stateAtu.periodo ? 'trj-btn-primary' : 'trj-btn-ghost'),
        style: { fontSize: '11px', padding: '3px 10px' },
        text: 'Todos',
        onclick: function () { _stateAtu.periodo = 0; periodoInput.value = ''; render(); }
      });

      // Prioridades: multi-select
      var prios = ['P1', 'P2', 'P3', 'P4', 'P5', 'PREDITIVA'];
      var btnTodas = h('button', {
        class: 'trj-btn ' + (!_stateAtu.prioridades.length ? 'trj-btn-primary' : 'trj-btn-ghost'),
        style: { fontSize: '11px', padding: '3px 10px' },
        text: 'Todas',
        onclick: function () { _stateAtu.prioridades = []; render(); }
      });
      var chipsPrio = prios.map(function (p) {
        var ativo = _stateAtu.prioridades.indexOf(p) >= 0;
        return h('button', {
          class: 'trj-btn ' + (ativo ? 'trj-btn-primary' : 'trj-btn-ghost'),
          style: { fontSize: '11px', padding: '3px 10px' },
          text: p,
          onclick: function () {
            var idx = _stateAtu.prioridades.indexOf(p);
            if (idx >= 0) _stateAtu.prioridades.splice(idx, 1);
            else _stateAtu.prioridades.push(p);
            render();
          }
        });
      });

      areaEl.appendChild(h('div', { class: 'trj-card p-3 mb-5', style: { borderColor: 'rgba(255,140,0,0.2)' } }, [
        h('div', { class: 'flex items-center gap-3 flex-wrap mb-2' }, [
          h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'PERÍODO:' }),
          h('div', { class: 'flex gap-2 items-center' }, [
            btnTodos, periodoInput,
            h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: 'dias' })
          ])
        ]),
        h('div', { class: 'flex items-center gap-3 flex-wrap' }, [
          h('span', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontWeight: '600' }, text: 'PRIORIDADE:' }),
          h('div', { class: 'flex gap-2 flex-wrap' }, [btnTodas].concat(chipsPrio))
        ])
      ]));

      // Filtrar tasks
      var now = Date.now();
      var limite = _stateAtu.periodo ? now - _stateAtu.periodo * 864e5 : 0;
      var tasks = allTasks.filter(function (t) {
        if (_stateAtu.prioridades.length) {
          var isPred = t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA';
          if (_stateAtu.prioridades.indexOf('PREDITIVA') >= 0 && isPred) return true;
          if (isPred) return false;
          if (_stateAtu.prioridades.indexOf((t.prioridade || '').toUpperCase()) < 0) return false;
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
      var comDiario   = s.length;
      var totalOSs    = comDiario + result.semDiario;
      var pctCom      = pct(comDiario, totalOSs);
      var avgFmt      = result.avgGapH > 0 ? fmtGap(result.avgGapH) : '—';
      var medFmt      = result.mediana  > 0 ? fmtGap(result.mediana)  : '—';
      var avgEntradas = comDiario > 0 ? (result.totalEntradas / comDiario).toFixed(1) : '0';
      var abertas4h   = s.filter(function (st) {
        var up = (st.task.status || '').toUpperCase();
        return up.indexOf('CONCLU') < 0 && up.indexOf('CANCEL') < 0 && st.horasSemUpd > 4;
      }).length;
      var hoje = result.todayAuthors.reduce(function (acc, a) { return acc + a.count; }, 0);

      // ── KPIs ──────────────────────────────────────────────────────
      var kpiDiario = U.kpiCard({ label: 'OSs com Diário', value: pctCom + '%',
        cor: pctCom >= 80 ? '#2ecc71' : pctCom >= 50 ? '#f39c12' : '#e74c3c',
        sub: comDiario + ' de ' + totalOSs + ' OSs',
        onClick: function () { mostrarTodasModal(s); }
      });
      kpiDiario.style.cursor = 'pointer';
      kpiDiario.title = 'Clique para ver todas as OSs com diário';
      var kpiAbertas = U.kpiCard({ label: 'Abertas s/ Atualiz. +4h', value: abertas4h,
        cor: abertas4h > 0 ? '#e74c3c' : '#2ecc71', sub: 'requerem atenção agora',
        onClick: function () {
          var lista = s.filter(function (st) {
            var up = (st.task.status || '').toUpperCase();
            return up.indexOf('CONCLU') < 0 && up.indexOf('CANCEL') < 0 && st.horasSemUpd > 4;
          });
          var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
          var cpBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px', marginBottom: '8px' }, text: '📋 Copiar' });
          cpBtn.onclick = function () {
            var lines = ['TSK\tSITE\tEND ID\tSTATUS\tSem Atualiz.'];
            lista.forEach(function (st) { lines.push([st.task.osNumero || '—', st.task.siteId || '—', st.task.enderecoId || '—', st.task.status || '—', fmtGap(st.horasSemUpd)].join('\t')); });
            copyText(lines.join('\n'));
          };
          wrap.appendChild(cpBtn);
          wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr auto', gap: '4px', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
            h('span', { text: 'TSK' }), h('span', { text: 'Site' }), h('span', { text: 'END ID' }), h('span', { text: 'Status' }), h('span', { text: 'Sem Atualiz.' }), h('span', { text: '' })
          ]));
          lista.forEach(function (st) {
            var urgente = st.horasSemUpd > 8, atencao = st.horasSemUpd > 4;
            var corGap = urgente ? '#e74c3c' : atencao ? '#f39c12' : 'var(--trj-muted)';
            var row = h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr auto', gap: '4px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', alignItems: 'center' }, onclick: function () { abrirTimeline(st); } }, [
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '12px' }, text: st.task.osNumero || '—' }), statusBadge(st.task.status)]),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.siteId || '—' }),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: String(st.task.enderecoId || '—') }),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.status || '—' }),
              h('span', { style: { color: corGap, fontWeight: urgente ? '700' : '400', fontSize: '11px' }, text: fmtGap(st.horasSemUpd) }),
              h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 6px' }, text: 'TL', onclick: function (e) { e.stopPropagation(); abrirTimeline(st); } })
            ]);
            row.addEventListener('mouseenter', function () { row.style.background = 'rgba(231,76,60,0.06)'; });
            row.addEventListener('mouseleave', function () { row.style.background = ''; });
            wrap.appendChild(row);
          });
          if (!lista.length) wrap.appendChild(h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px', padding: '20px', textAlign: 'center' }, text: 'Nenhuma OS requer atenção agora.' }));
          U.openModal('Abertas s/ Atualiz. +4h (' + lista.length + ')', wrap);
        }
      });
      kpiAbertas.style.cursor = 'pointer';
      kpiAbertas.title = 'Clique para ver OSs sem atualização há mais de 4h';
      var kpiHoje = U.kpiCard({ label: 'Atualizações Hoje', value: String(hoje),
        cor: hoje > 0 ? '#2ecc71' : 'var(--trj-muted)', sub: result.todayAuthors.length + ' autor(es) hoje',
        onClick: function () {
          var todaySts = [];
          var _seen = {};
          Object.keys(result.todayAuthorOSmap || {}).forEach(function (a) {
            (result.todayAuthorOSmap[a] || []).forEach(function (entry) {
              var osn = entry.stat.task.osNumero || '_';
              if (!_seen[osn]) { _seen[osn] = true; todaySts.push(entry); }
            });
          });
          todaySts.sort(function (a, b) { return (b.lastDt || 0) - (a.lastDt || 0); });
          var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
          var cpBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px', marginBottom: '8px' }, text: '📋 Copiar' });
          cpBtn.onclick = function () {
            var lines = ['TSK\tSITE\tEND ID\tSTATUS\tEntr. Hoje\tÚltima Atualiz.'];
            todaySts.forEach(function (x) { lines.push([x.stat.task.osNumero || '—', x.stat.task.siteId || '—', x.stat.task.enderecoId || '—', x.stat.task.status || '—', String(x.count), fmtDDMM(x.lastDt) + ' ' + fmtHM(x.lastDt)].join('\t')); });
            copyText(lines.join('\n'));
          };
          wrap.appendChild(cpBtn);
          wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 0.6fr 1fr auto', gap: '4px', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
            h('span', { text: 'TSK' }), h('span', { text: 'Site' }), h('span', { text: 'END ID' }), h('span', { text: 'Status' }), h('span', { text: 'Entr.' }), h('span', { text: 'Última Atualiz.' }), h('span', { text: '' })
          ]));
          if (!todaySts.length) {
            wrap.appendChild(h('div', { style: { color: 'var(--trj-muted)', fontSize: '13px', padding: '20px', textAlign: 'center' }, text: 'Nenhuma atualização registrada hoje.' }));
          }
          todaySts.forEach(function (x) {
            var st = x.stat;
            var row = h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 0.6fr 1fr auto', gap: '4px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', alignItems: 'center' }, onclick: function () { abrirTimeline(st); } }, [
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '12px' }, text: st.task.osNumero || '—' }), statusBadge(st.task.status)]),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.siteId || '—' }),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: String(st.task.enderecoId || '—') }),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st.task.status || '—' }),
              h('span', { style: { color: '#2ecc71', fontWeight: '600', fontSize: '11px' }, text: String(x.count) }),
              h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: fmtDDMM(x.lastDt) + ' ' + fmtHM(x.lastDt) }),
              h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 6px' }, text: 'TL', onclick: function (e) { e.stopPropagation(); abrirTimeline(st); } })
            ]);
            row.addEventListener('mouseenter', function () { row.style.background = 'rgba(46,204,113,0.05)'; });
            row.addEventListener('mouseleave', function () { row.style.background = ''; });
            wrap.appendChild(row);
          });
          U.openModal('Atualizações Hoje (' + todaySts.length + ' OSs)', wrap);
        }
      });
      kpiHoje.style.cursor = 'pointer';
      kpiHoje.title = 'Clique para ver as OSs atualizadas hoje';
      areaEl.appendChild(h('div', { class: 'grid gap-3 mb-5', style: { gridTemplateColumns: 'repeat(5,1fr)' } }, [
        kpiDiario,
        U.kpiCard({ label: 'Intervalo Médio', value: avgFmt, cor: '#ff8c00', sub: 'mediana: ' + medFmt }),
        U.kpiCard({ label: 'Entradas/OS', value: avgEntradas, cor: '#3498db', sub: result.totalEntradas + ' entradas no total' }),
        kpiAbertas,
        kpiHoje
      ]));

      // ── Gráficos ──────────────────────────────────────────────────
      areaEl.appendChild(secTitle('ANÁLISE DE INTERVALOS', '#ff8c00'));
      var row1 = h('div', { class: 'grid gap-4 mb-4', style: { gridTemplateColumns: '1fr 1fr' } });
      var ccHist = U.chartCard('ENTRANTES POR HORA — NORMAIS VS RETORNO POR ALARME', { hint: 'laranja = entrantes normais · vermelho = retornou à fila por alarme' });
      ccHist.card.style.minHeight = '240px';
      row1.appendChild(ccHist.card);
      row1.appendChild(buildRankingCard(result));
      areaEl.appendChild(row1);

      areaEl.appendChild(secTitle('ATIVIDADE POR AUTOR E HORÁRIO', '#3498db'));
      var row2 = h('div', { class: 'grid gap-4 mb-5', style: { gridTemplateColumns: '1fr 1fr' } });
      var ccAuth = U.chartCard('TOP AUTORES DE ATUALIZAÇÃO', { hint: 'clique num autor para ver suas OSs' });
      ccAuth.card.style.minHeight = '280px';
      var ccHora = U.chartCard('ATUALIZAÇÕES POR HORA DO DIA', { hint: 'laranja = horário comercial · vermelho = fora do horário' });
      ccHora.card.style.minHeight = '280px';
      row2.appendChild(ccAuth.card);
      row2.appendChild(ccHora.card);
      areaEl.appendChild(row2);

      if (result.topAuthors.length > 12) {
        areaEl.appendChild(h('div', { class: 'flex justify-end mb-4', style: { marginTop: '-12px' } }, [
          h('button', {
            class: 'trj-btn trj-btn-ghost',
            style: { fontSize: '11px', padding: '3px 12px' },
            text: 'Ver ranking completo (' + result.topAuthors.length + ' autores)',
            onclick: function () { abrirRankingAutores(result.topAuthors, null, result.authorOSmap); }
          })
        ]));
      }

      setTimeout(function () {
        chartEntrantes(ccHist.canvas, result.hourCountEntrantes, result.hourCountRetorno, s);
        if (result.topAuthors.length) chartAutores(ccAuth.canvas, result.topAuthors, result.authorOSmap);
        chartHoras(ccHora.canvas, result.hourCount, s);
      }, 0);

      // ── RETORNO POR ALARME ────────────────────────────────────────────
      var retList = result.retornosTasks || [];
      var retornosPerSite = result.retornosPerSite || {};
      areaEl.appendChild(secTitle('RETORNO POR ALARME — TSKs QUE VOLTARAM À FILA (' + retList.length + ')', '#e74c3c'));
      if (!retList.length) {
        areaEl.appendChild(h('div', { class: 'trj-card p-4', style: { color: 'var(--trj-muted)', fontSize: '13px', textAlign: 'center' } },
          [h('span', { text: 'Nenhuma TSK com retorno por alarme no período selecionado.' })]));
      } else {
        // Gráfico por região — lista completa somente no drilldown
        var retRegiaoMap = {};
        retList.forEach(function (item) {
          var rg = (item.task.regiao || 'SEM REGIÃO').toString().trim().toUpperCase();
          if (!retRegiaoMap[rg]) retRegiaoMap[rg] = [];
          retRegiaoMap[rg].push(item);
        });
        var retRegioes = Object.keys(retRegiaoMap).sort(function (a, b) { return retRegiaoMap[b].length - retRegiaoMap[a].length; });
        var retRgMax = retRegiaoMap[retRegioes[0]].length;
        var retRgCard = h('div', { class: 'trj-card p-3 mb-3' });
        var retTitleRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } });
        retTitleRow.appendChild(h('span', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--trj-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }, text: 'Volume por Região' }));
        var retCopyBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' }, text: '📋 Copiar' });
        retCopyBtn.onclick = function () {
          var lines = ['TSK\tEND ID\tSITE\tTipo de Falha\tStatus\tRetornos'];
          retList.forEach(function (item) { lines.push([item.task.osNumero || '—', item.task.enderecoId || '—', item.task.siteId || '—', item.task.tipoFalha || '—', item.task.status || '—', String(item.count)].join('\t')); });
          copyText(lines.join('\n'));
        };
        retTitleRow.appendChild(retCopyBtn);
        retRgCard.appendChild(retTitleRow);
        retRegioes.forEach(function (rg) {
          var rgItems = retRegiaoMap[rg];
          var barW = Math.round(rgItems.length / retRgMax * 100);
          var rgRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 4px', cursor: 'pointer', borderRadius: '4px' } });
          rgRow.appendChild(h('span', { style: { width: '140px', fontSize: '11px', color: 'var(--trj-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: rg }));
          rgRow.appendChild(h('div', { style: { flex: '1', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', height: '8px', overflow: 'hidden' } }, [
            h('div', { style: { width: barW + '%', height: '100%', background: '#e74c3c', borderRadius: '3px' } })
          ]));
          rgRow.appendChild(h('span', { style: { fontSize: '11px', color: '#e74c3c', fontWeight: '700', minWidth: '28px', textAlign: 'right' }, text: String(rgItems.length) }));
          rgRow.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--trj-muted)', paddingLeft: '4px' }, text: '›' }));
          rgRow.addEventListener('mouseenter', function () { rgRow.style.background = 'rgba(231,76,60,0.06)'; });
          rgRow.addEventListener('mouseleave', function () { rgRow.style.background = ''; });
          rgRow.addEventListener('click', (function (rgLabel, rgItems2) { return function () {
            var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
            var mCpBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px', marginBottom: '8px' }, text: '📋 Copiar' });
            mCpBtn.onclick = function () {
              var lines = ['TSK\tEND ID\tSITE\tTipo de Falha\tStatus\tRetornos'];
              rgItems2.forEach(function (item2) { lines.push([item2.task.osNumero || '—', item2.task.enderecoId || '—', item2.task.siteId || '—', item2.task.tipoFalha || '—', item2.task.status || '—', String(item2.count)].join('\t')); });
              copyText(lines.join('\n'));
            };
            wrap.appendChild(mCpBtn);
            wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 0.6fr auto', gap: '4px', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
              h('span', { text: 'TSK' }), h('span', { text: 'END ID' }), h('span', { text: 'Site' }), h('span', { text: 'Tipo de Falha' }), h('span', { text: 'Retor.' }), h('span', { text: '' })
            ]));
            rgItems2.forEach(function (item2) {
              var t2 = item2.task;
              var st2 = s.find(function (x) { return x.task === t2; });
              var rowM = h('div', {
                style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 0.6fr auto', gap: '4px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: st2 ? 'pointer' : 'default', alignItems: 'center' },
                onclick: st2 ? function () { abrirTimeline(st2); } : null
              }, [
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                  h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '12px' }, text: t2.osNumero || '—' }),
                  statusBadge(t2.status)
                ]),
                h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: String(t2.enderecoId || '—') }),
                h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: String(t2.siteId || '—') }),
                h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: t2.tipoFalha || '—' }),
                h('span', { style: { color: '#e74c3c', fontWeight: '700', fontSize: '13px', textAlign: 'center' }, text: String(item2.count) }),
                h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 6px' }, text: 'TL', onclick: function (e) { e.stopPropagation(); if (st2) abrirTimeline(st2); } })
              ]);
              if (st2) { rowM.addEventListener('mouseenter', function () { rowM.style.background = 'rgba(231,76,60,0.05)'; }); rowM.addEventListener('mouseleave', function () { rowM.style.background = ''; }); }
              wrap.appendChild(rowM);
            });
            U.openModal('Retornos por Alarme — ' + rgLabel + ' (' + rgItems2.length + ')', wrap);
          }; })(rg, rgItems));
          retRgCard.appendChild(rgRow);
        });
        areaEl.appendChild(retRgCard);
      }

      // ── OSs ABERTAS + TOP OFENSOR — lado a lado ───────────────────
      var rowAbOf = h('div', { class: 'grid gap-4 mb-4', style: { gridTemplateColumns: '1fr 1fr' } });

      // ── OSs ABERTAS (somente Não iniciado / Iniciado) — apenas gráfico ─
      (function () {
        var riskRows = s.filter(function (st) {
          var up = (st.task.status || '').toUpperCase().trim();
          return up === 'INICIADO' || up === 'NÃO INICIADO' || up === 'NAO INICIADO';
        });

        var secAb = h('div', {});
        var titleAbRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } });
        titleAbRow.appendChild(h('div', { class: 'flex items-center gap-2', style: { borderBottom: 'none' } }, [
          h('span', { style: { width: '4px', height: '16px', borderRadius: '2px', background: '#e74c3c', display: 'inline-block' } }),
          h('span', { class: 'text-xs font-bold uppercase tracking-widest', style: { color: '#e74c3c' }, text: 'OSs ABERTAS — SEM ATUALIZAÇÃO' })
        ]));
        var copyAbBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' }, text: '📋 Copiar' });
        copyAbBtn.onclick = function () {
          var lines = ['TSK\tSITE\tEND ID\tStatus\tPrioridade\tÚltima Atualiz.\tSem Atualiz.\tEntradas\tGap Médio'];
          riskRows.forEach(function (st) {
            var isPred = st.task.statusSla === 'PREDITIVA' || st.task.fonteSla === 'PREDITIVA';
            lines.push([st.task.osNumero || '—', st.task.siteId || '—', st.task.enderecoId || '—', st.task.status || '—', isPred ? 'PREDITIVA' : (st.task.prioridade || '—'), fmtDDMM(st.lastDt) + ' ' + fmtHM(st.lastDt), fmtGap(st.horasSemUpd), st.nEntries, st.avgGapH != null ? fmtGap(st.avgGapH) : '—'].join('\t'));
          });
          copyText(lines.join('\n'));
        };
        titleAbRow.appendChild(copyAbBtn);
        secAb.appendChild(titleAbRow);

        if (!riskRows.length) {
          secAb.appendChild(h('div', { class: 'trj-card p-4 text-center', style: { color: 'var(--trj-muted)', fontSize: '12px' },
            text: 'Nenhuma OS com status "Não iniciado" ou "Iniciado" encontrada.' }));
        } else {
          var abRegiaoMap = {};
          riskRows.forEach(function (st) {
            var rg = (st.task.regiao || 'SEM REGIÃO').toString().trim().toUpperCase();
            if (!abRegiaoMap[rg]) abRegiaoMap[rg] = [];
            abRegiaoMap[rg].push(st);
          });
          var abRegioes = Object.keys(abRegiaoMap).sort(function (a, b) { return abRegiaoMap[b].length - abRegiaoMap[a].length; });
          var abRgMax = abRegiaoMap[abRegioes[0]].length;
          var abRgCard = h('div', { class: 'trj-card p-3' });
          abRgCard.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--trj-muted)', marginBottom: '6px' }, text: riskRows.length + ' OS(s) · clique por região para ver detalhes' }));
          abRegioes.forEach(function (rg) {
            var abSts = abRegiaoMap[rg];
            var barW = Math.round(abSts.length / abRgMax * 100);
            var abRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 4px', cursor: 'pointer', borderRadius: '4px' } });
            abRow.appendChild(h('span', { style: { width: '130px', fontSize: '11px', color: 'var(--trj-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: rg }));
            abRow.appendChild(h('div', { style: { flex: '1', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', height: '8px', overflow: 'hidden' } }, [
              h('div', { style: { width: barW + '%', height: '100%', background: '#e74c3c', borderRadius: '3px' } })
            ]));
            abRow.appendChild(h('span', { style: { fontSize: '11px', color: '#e74c3c', fontWeight: '700', minWidth: '28px', textAlign: 'right' }, text: String(abSts.length) }));
            abRow.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--trj-muted)', paddingLeft: '4px' }, text: '›' }));
            abRow.addEventListener('mouseenter', function () { abRow.style.background = 'rgba(231,76,60,0.06)'; });
            abRow.addEventListener('mouseleave', function () { abRow.style.background = ''; });
            abRow.addEventListener('click', (function (rgLabel, abSts2) { return function () {
              var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
              var topRow2 = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: '8px' } });
              topRow2.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--trj-muted)' }, text: abSts2.length + ' OS(s) — ' + rgLabel }));
              var cpBtn2 = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' }, text: '📋 Copiar' });
              cpBtn2.onclick = function () {
                var lines2 = ['TSK\tSITE\tEND ID\tStatus\tPrioridade\tÚltima Atualiz.\tSem Atualiz.\tEntradas\tGap Médio'];
                abSts2.forEach(function (st2) {
                  var isPred2 = st2.task.statusSla === 'PREDITIVA' || st2.task.fonteSla === 'PREDITIVA';
                  lines2.push([st2.task.osNumero || '—', st2.task.siteId || '—', st2.task.enderecoId || '—', st2.task.status || '—', isPred2 ? 'PREDITIVA' : (st2.task.prioridade || '—'), fmtDDMM(st2.lastDt) + ' ' + fmtHM(st2.lastDt), fmtGap(st2.horasSemUpd), st2.nEntries, st2.avgGapH != null ? fmtGap(st2.avgGapH) : '—'].join('\t'));
                });
                copyText(lines2.join('\n'));
              };
              topRow2.appendChild(cpBtn2);
              wrap.appendChild(topRow2);
              // Cabeçalho
              wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr 1fr 0.8fr 0.6fr 0.6fr auto', gap: '4px', padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
                h('span', { text: 'TSK' }), h('span', { text: 'Site' }), h('span', { text: 'END ID' }), h('span', { text: 'Prio.' }), h('span', { text: 'Última Atualiz.' }), h('span', { text: 'Sem Atualiz.' }), h('span', { text: 'Entradas' }), h('span', { text: 'Gap Med.' }), h('span', { text: '' })
              ]));
              abSts2.forEach(function (st2) {
                var urgente2 = st2.horasSemUpd > 8;
                var atencao2 = st2.horasSemUpd > 4;
                var cor2 = urgente2 ? '#e74c3c' : atencao2 ? '#f39c12' : 'var(--trj-muted)';
                var rowBg2 = urgente2 ? 'rgba(231,76,60,0.05)' : atencao2 ? 'rgba(243,156,18,0.04)' : 'transparent';
                var isPred2 = st2.task.statusSla === 'PREDITIVA' || st2.task.fonteSla === 'PREDITIVA';
                var rowM = h('div', {
                  style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr 1fr 0.8fr 0.6fr 0.6fr auto', gap: '4px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: rowBg2 },
                  onclick: function () { abrirTimeline(st2); }
                }, [
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' } }, [
                    h('span', { style: { color: '#ff8c00', fontWeight: '700', fontSize: '12px' }, text: st2.task.osNumero || '—' }),
                    statusBadge(st2.task.status)
                  ]),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: st2.task.siteId || '—' }),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: String(st2.task.enderecoId || '—') }),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: isPred2 ? 'PREDITIVA' : (st2.task.prioridade || '—') }),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: fmtDDMM(st2.lastDt) + ' ' + fmtHM(st2.lastDt) }),
                  h('span', { style: { color: cor2, fontWeight: urgente2 ? '700' : '400', fontSize: '11px' }, text: fmtGap(st2.horasSemUpd) }),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', textAlign: 'center' }, text: String(st2.nEntries) }),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: st2.avgGapH != null ? fmtGap(st2.avgGapH) : '—' }),
                  h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 6px' }, text: 'TL', onclick: function (e) { e.stopPropagation(); abrirTimeline(st2); } })
                ]);
                rowM.addEventListener('mouseenter', function () { rowM.style.background = urgente2 ? 'rgba(231,76,60,0.08)' : 'rgba(255,140,0,0.05)'; });
                rowM.addEventListener('mouseleave', function () { rowM.style.background = rowBg2; });
                wrap.appendChild(rowM);
              });
              U.openModal('OSs Abertas — ' + rgLabel + ' (' + abSts2.length + ')', wrap);
            }; })(rg, abSts));
            abRgCard.appendChild(abRow);
          });
          secAb.appendChild(abRgCard);
          if (s.length > riskRows.length) {
            secAb.appendChild(h('div', { style: { marginTop: '8px', textAlign: 'right' } }, [
              h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' },
                text: 'Ver todas (' + s.length + ') incl. outros status',
                onclick: function () { mostrarTodasModal(s); } })
            ]));
          }
        }
        rowAbOf.appendChild(secAb);
      })();

      // ── TOP OFENSOR — apenas gráfico de região, lista no drilldown ──
      (function () {
        var topSites = result.topSites || [];
        var secOf = h('div', {});
        var titleOfRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } });
        titleOfRow.appendChild(h('div', { class: 'flex items-center gap-2' }, [
          h('span', { style: { width: '4px', height: '16px', borderRadius: '2px', background: '#9b59b6', display: 'inline-block' } }),
          h('span', { class: 'text-xs font-bold uppercase tracking-widest', style: { color: '#9b59b6' }, text: 'TOP OFENSOR — MAIOR REINCIDÊNCIA' })
        ]));
        var copyOfBtn = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' }, text: '📋 Copiar' });
        copyOfBtn.onclick = function () {
          var lines = ['#\tNE ID\tEND ID\tOSs\tRetornos'];
          topSites.slice(0, 20).forEach(function (site, idx) {
            var sk3 = (site.enderecoId || '').toString().trim().toUpperCase();
            var siteDts = retornosPerSite[sk3] || [];
            lines.push([idx + 1, site.siteId || '—', site.enderecoId || '—', site.count, siteDts.length || '0'].join('\t'));
          });
          copyText(lines.join('\n'));
        };
        titleOfRow.appendChild(copyOfBtn);
        secOf.appendChild(titleOfRow);

        if (!topSites.length) {
          secOf.appendChild(h('div', { class: 'trj-card p-4 text-center', style: { color: 'var(--trj-muted)', fontSize: '12px' }, text: 'Nenhum site com reincidência.' }));
        } else {
          var ofRegiaoMap = {};
          topSites.forEach(function (site) {
            var rg = (site.regiao || 'SEM REGIÃO').toString().trim().toUpperCase();
            if (!ofRegiaoMap[rg]) ofRegiaoMap[rg] = { count: 0, sites: [] };
            ofRegiaoMap[rg].count++;
            ofRegiaoMap[rg].sites.push(site);
          });
          var ofRegioes = Object.keys(ofRegiaoMap).sort(function (a, b) { return ofRegiaoMap[b].count - ofRegiaoMap[a].count; });
          var ofRgMax = ofRegiaoMap[ofRegioes[0]].count;
          var ofRgCard = h('div', { class: 'trj-card p-3' });
          ofRgCard.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--trj-muted)', marginBottom: '6px' }, text: topSites.length + ' site(s) · clique por região para ver detalhes' }));
          ofRegioes.forEach(function (rg) {
            var entry = ofRegiaoMap[rg];
            var barW = Math.round(entry.count / ofRgMax * 100);
            var ofRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 4px', cursor: 'pointer', borderRadius: '4px' } });
            ofRow.appendChild(h('span', { style: { width: '130px', fontSize: '11px', color: 'var(--trj-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: rg }));
            ofRow.appendChild(h('div', { style: { flex: '1', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', height: '8px', overflow: 'hidden' } }, [
              h('div', { style: { width: barW + '%', height: '100%', background: '#9b59b6', borderRadius: '3px' } })
            ]));
            ofRow.appendChild(h('span', { style: { fontSize: '11px', color: '#9b59b6', fontWeight: '700', minWidth: '28px', textAlign: 'right' }, text: String(entry.count) }));
            ofRow.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--trj-muted)', paddingLeft: '4px' }, text: '›' }));
            ofRow.addEventListener('mouseenter', function () { ofRow.style.background = 'rgba(155,89,182,0.06)'; });
            ofRow.addEventListener('mouseleave', function () { ofRow.style.background = ''; });
            ofRow.addEventListener('click', (function (rgLabel, entry2) { return function () {
              var wrap = h('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
              var topRow3 = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: '8px' } });
              topRow3.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--trj-muted)' }, text: entry2.sites.length + ' site(s) — ' + rgLabel }));
              var cpBtn3 = h('button', { class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 8px' }, text: '📋 Copiar' });
              cpBtn3.onclick = function () {
                var lines3 = ['#\tNE ID\tEND ID\tOSs\tRetornos'];
                entry2.sites.forEach(function (site2, i2) {
                  var sk4 = (site2.enderecoId || '').toString().trim().toUpperCase();
                  var siteDts2 = retornosPerSite[sk4] || [];
                  lines3.push([i2 + 1, site2.siteId || '—', site2.enderecoId || '—', site2.count, siteDts2.length].join('\t'));
                });
                copyText(lines3.join('\n'));
              };
              topRow3.appendChild(cpBtn3);
              wrap.appendChild(topRow3);
              // Cabeçalho
              wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '28px 1fr 1fr 0.6fr 0.8fr 1fr', gap: '4px', padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: '10px', color: 'var(--trj-muted)', fontWeight: '600', textTransform: 'uppercase' } }, [
                h('span', { text: '#' }), h('span', { text: 'NE ID' }), h('span', { text: 'END ID' }), h('span', { text: 'OSs' }), h('span', { text: 'Reincid.' }), h('span', { text: 'Retornos' })
              ]));
              entry2.sites.forEach(function (site2, i2) {
                var cor2 = i2 === 0 ? '#e74c3c' : i2 < 3 ? '#e67e22' : '#9b59b6';
                var sk4 = (site2.enderecoId || '').toString().trim().toUpperCase();
                var siteDts2 = retornosPerSite[sk4] || [];
                var maxCt = entry2.sites[0].count;
                var barPct2 = Math.round(site2.count / maxCt * 100);
                var rowM2 = h('div', { style: { display: 'grid', gridTemplateColumns: '28px 1fr 1fr 0.6fr 0.8fr 1fr', gap: '4px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, [
                  h('span', { style: { color: cor2, fontWeight: '700', fontSize: '12px' }, text: String(i2 + 1) }),
                  h('span', { style: { color: '#ff8c00', fontWeight: '600', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: String(site2.siteId || '—') }),
                  h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: String(site2.enderecoId || '—') }),
                  h('span', { style: { color: cor2, fontWeight: '700', textAlign: 'center' }, text: String(site2.count) }),
                  h('div', { style: { background: 'rgba(255,255,255,0.08)', borderRadius: '3px', height: '7px', overflow: 'hidden' } }, [
                    h('div', { style: { width: barPct2 + '%', height: '100%', background: cor2, borderRadius: '3px' } })
                  ]),
                  siteDts2.length ? h('button', {
                    class: 'trj-btn trj-btn-ghost', style: { fontSize: '10px', padding: '2px 7px' },
                    text: siteDts2.length + ' retorno(s)',
                    onclick: (function (dts2, eid2) { return function (e) {
                      e.stopPropagation();
                      var wrap2 = h('div', { style: { maxHeight: '50vh', overflowY: 'auto' } });
                      dts2.slice().sort(function (a, b) { return b.dt - a.dt; }).forEach(function (d) {
                        wrap2.appendChild(h('div', { style: { padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', display: 'flex', gap: '10px', alignItems: 'center' } }, [
                          h('span', { style: { color: '#ff8c00', fontWeight: '600', minWidth: '130px' }, text: d.osNumero }),
                          h('span', { style: { color: 'var(--trj-muted)' }, text: fmtDDMM(d.dt) + ' às ' + fmtHM(d.dt) })
                        ]));
                      });
                      U.openModal('Retornos por Alarme — ' + eid2, wrap2);
                    }; })(siteDts2, site2.enderecoId || sk4)
                  }) : h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: '—' })
                ]);
                wrap.appendChild(rowM2);
              });
              U.openModal('Top Ofensor — ' + rgLabel + ' (' + entry2.sites.length + ' sites)', wrap);
            }; })(rg, entry));
            ofRgCard.appendChild(ofRow);
          });
          secOf.appendChild(ofRgCard);
        }
        rowAbOf.appendChild(secOf);
      })();

      areaEl.appendChild(rowAbOf);
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
        h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' }, text: fmtGap(st.horasSemUpd) + ' atrás' })
      ]);
      wrap.appendChild(item);
    });
    U.openModal('Todas as OSs com Diário (' + stats.length + ')', wrap);
  }

})(window.TRJ = window.TRJ || {});
