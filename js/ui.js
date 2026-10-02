/* =====================================================================
 * ui.js  —  COMPONENTES DE INTERFACE (helpers reutilizáveis)
 * ---------------------------------------------------------------------
 * Funções para montar a tela: sidebar, cartões de KPI, gráficos
 * (Chart.js), modal de detalhamento (drill), avisos (toast), etc.
 * Tudo gera elementos no DOM — sem frameworks.
 * ===================================================================== */
(function (TRJ) {
  var U = {};
  var C = TRJ.constants;
  var D = TRJ.domain;

  // ---------- hyperscript: cria elemento DOM ----------
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
        else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
      });
    }
    if (children !== null && children !== undefined) appendChildren(e, children);
    return e;
  }
  function appendChildren(e, children) {
    if (Array.isArray(children)) children.forEach(function (c) { appendChildren(e, c); });
    else if (children instanceof Node) e.appendChild(children);
    else if (children !== null && children !== undefined && children !== false) e.appendChild(document.createTextNode(String(children)));
  }
  U.h = h;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  U.esc = esc;

  function fmtNum(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString('pt-BR');
  }
  U.fmtNum = fmtNum;
  U.fmtPct = function (n) { return (n == null || isNaN(n) ? 0 : n) + '%'; };

  // hex (#rgb ou #rrggbb) -> "r,g,b" para usar em rgba(...)
  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '255,140,0';
    return r + ',' + g + ',' + b;
  }
  function hexToRgba(hex, a) { return 'rgba(' + hexToRgb(hex) + ',' + a + ')'; }
  U.hexToRgba = hexToRgba;

  // ---------- toast ----------
  function ensureToasts() {
    var t = document.getElementById('trj-toasts');
    if (!t) { t = h('div', { id: 'trj-toasts' }); document.body.appendChild(t); }
    return t;
  }
  U.toast = function (msg, type) {
    var box = ensureToasts();
    var el = h('div', { class: 'trj-toast ' + (type || 'info'), text: msg });
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function () { el.remove(); }, 320); }, 3600);
  };

  // ---------- loading (com mensagem opcional de etapa) ----------
  function ensureLoading() {
    var l = document.getElementById('trj-loading');
    if (!l) {
      l = h('div', { id: 'trj-loading' }, [
        h('div', { class: 'trj-spin' }),
        h('div', { id: 'trj-loading-msg', style: { color: 'var(--trj-fg)', fontSize: '13px', marginTop: '12px', fontWeight: '600' } }),
        h('div', { id: 'trj-loading-sub', style: { color: 'var(--trj-muted)', fontSize: '11px', marginTop: '4px' } }),
        h('div', { style: { width: '180px', height: '3px', background: 'rgba(255,255,255,.1)', borderRadius: '4px', marginTop: '14px', overflow: 'hidden' } }, [
          h('div', { id: 'trj-loading-bar', style: { height: '3px', borderRadius: '4px', background: 'var(--trj-primary)', width: '0%', transition: 'width .4s ease' } })
        ])
      ]);
      document.body.appendChild(l);
    }
    return l;
  }
  U.loading = function (show, msg) {
    ensureLoading().classList.toggle('show', !!show);
    var m = document.getElementById('trj-loading-msg');
    if (m) m.textContent = msg || '';
    if (!show) {
      var bar = document.getElementById('trj-loading-bar');
      if (bar) bar.style.width = '0%';
      var sub = document.getElementById('trj-loading-sub');
      if (sub) sub.textContent = '';
    }
  };
  U.loadingMsg = function (msg, pct) {
    ensureLoading().classList.add('show');
    var m = document.getElementById('trj-loading-msg');
    if (m) m.textContent = msg || '';
    var bar = document.getElementById('trj-loading-bar');
    if (bar) bar.style.width = (pct || 0) + '%';
    var sub = document.getElementById('trj-loading-sub');
    if (sub) sub.textContent = pct != null ? pct + '%' : '';
  };

  // ---------- modal ----------
  U.closeModal = function () {
    var m = document.getElementById('trj-modal-host');
    if (m) m.remove();
  };
  U.openModal = function (title, contentEl, opts) {
    U.closeModal();
    opts = opts || {};
    var body = h('div', { class: 'overflow-auto p-4', style: { flex: '1' } }, contentEl);
    var headRight = [];
    if (opts.onCopy) {
      headRight.push(h('button', {
        class: 'trj-btn trj-btn-ghost', text: '📋 Copiar', title: 'Copiar este detalhamento em texto (formato WhatsApp)',
        onclick: function () { U.copyText(opts.onCopy(), 'Detalhamento copiado!'); }
      }));
    }
    headRight.push(h('button', { class: 'trj-btn trj-btn-ghost', text: '✕ Fechar', onclick: U.closeModal }));
    var head = h('div', { class: 'flex items-center justify-between px-5 py-3 flex-wrap gap-2', style: { borderBottom: '1px solid var(--trj-border)' } }, [
      h('h3', { class: 'text-base font-bold', style: { color: 'var(--trj-primary)' }, text: title }),
      h('div', { class: 'flex items-center gap-2' }, headRight)
    ]);
    var modal = h('div', { class: 'trj-modal' }, [head, body]);
    if (opts.footer) modal.appendChild(h('div', { class: 'px-5 py-3', style: { borderTop: '1px solid var(--trj-border)' } }, opts.footer));
    var bg = h('div', { class: 'trj-modal-bg', id: 'trj-modal-host', onclick: function (ev) { if (ev.target === bg) U.closeModal(); } }, modal);
    document.body.appendChild(bg);
  };
  // fecha o modal com ESC, sem precisar clicar em "Fechar" (registrado uma única vez)
  if (!U._escWired) {
    U._escWired = true;
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && document.getElementById('trj-modal-host')) U.closeModal();
    });
  }

  // ---------- KPI card ----------
  // Mesma assinatura de sempre: { label, value, sub?, cor?, onClick? }
  // Visual: barra de destaque no topo + brilho no canto + glow no valor,
  // tudo na cor "cor" (ou laranja padrão), com elevação no hover (via CSS .trj-kpi).
  U.kpiCard = function (o) {
    var corHex = /^#/.test(o.cor || '') ? o.cor : '#ff8c00';
    var accent = h('div', { style: { position: 'absolute', top: '0', left: '0', right: '0', height: '3px', background: corHex } });
    var glow = h('div', { style: {
      position: 'absolute', bottom: '-22px', right: '-22px', width: '90px', height: '90px', borderRadius: '50%',
      background: 'radial-gradient(circle, ' + hexToRgba(corHex, .16) + ', transparent)', pointerEvents: 'none'
    } });
    var card = h('div', { class: 'trj-card trj-kpi p-4 flex flex-col gap-1', style: { position: 'relative' } }, [
      accent, glow,
      h('div', { class: 'text-xs font-semibold uppercase tracking-wide', style: { color: 'var(--trj-muted)', letterSpacing: '1px' }, text: o.label }),
      h('div', { class: 'text-3xl font-extrabold', style: { color: o.cor || 'var(--trj-fg)', textShadow: '0 0 18px ' + hexToRgba(corHex, .3) }, text: o.value }),
      o.sub ? h('div', { class: 'text-xs', style: { color: 'var(--trj-muted)' }, text: o.sub }) : null
    ]);
    if (o.onClick) card.addEventListener('click', o.onClick);
    else card.style.cursor = 'default';
    return card;
  };

  // ---------- Barra de resumo (total em destaque + lista lateral) ----------
  // items: [{ nome, valor, pct? }]
  U.resumoBar = function (totalLabel, totalValor, items) {
    return h('div', { class: 'trj-resumo-bar' }, [
      h('div', { class: 'trj-resumo-total' }, [
        h('span', { class: 'trj-resumo-total-label', text: totalLabel }),
        h('span', { class: 'trj-resumo-total-valor', text: String(totalValor) })
      ]),
      h('div', { class: 'trj-resumo-grid' }, (items || []).map(function (it) {
        return h('div', { class: 'trj-resumo-item' }, [
          h('span', { class: 'trj-resumo-nome', text: it.nome }),
          h('span', { class: 'trj-resumo-val', text: String(it.valor) }),
          it.pct != null ? h('span', { class: 'trj-resumo-pct', text: it.pct }) : null
        ]);
      }))
    ]);
  };

  // ---------- Caixa de busca (debounce simples) ----------
  U.searchInput = function (placeholder, onChange, opts) {
    opts = opts || {};
    var inp = h('input', { type: 'text', class: 'trj-input', placeholder: placeholder, value: opts.value || '' });
    var t = null;
    inp.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { onChange(inp.value); }, 140);
    });
    return inp;
  };

  // ---------- Switch (toggle bonito, com hover/glow) ----------
  // U.switch(checked, label, onChange) — onChange recebe o novo boolean.
  U.switch = function (checked, label, onChange) {
    var input = h('input', { type: 'checkbox', class: 'trj-switch-input', checked: checked ? 'checked' : null });
    input.checked = !!checked; // garante o estado real do DOM, não só o atributo inicial
    input.addEventListener('change', function () { onChange(input.checked); });
    return h('label', { class: 'trj-switch-wrap' }, [
      input,
      h('span', { class: 'trj-switch-track' }, h('span', { class: 'trj-switch-thumb' })),
      label ? h('span', { class: 'trj-switch-label', text: label }) : null
    ]);
  };

  // ---------- Dropzone reutilizável (clique ou arraste-e-solte) ----------
  // opts: { icon, title, sub, accept, multiple, statusText, statusOk, onFile(fileOrFileList) }
  U.dropzone = function (opts) {
    opts = opts || {};
    var fileInput = h('input', {
      type: 'file', style: { display: 'none' },
      accept: opts.accept || '', multiple: opts.multiple || false,
      onchange: function () {
        if (!this.files || !this.files.length) return;
        opts.onFile(opts.multiple ? this.files : this.files[0]);
      }
    });
    var statusPill = h('div', {
      class: 'trj-badge', style: {
        background: opts.statusOk ? 'rgba(46,204,113,.12)' : 'rgba(255,255,255,.05)',
        color: opts.statusOk ? 'var(--trj-green)' : 'var(--trj-muted)',
        fontFamily: 'ui-monospace, monospace', padding: '6px 12px', marginTop: '4px'
      }, text: opts.statusText || 'Aguardando arquivo...'
    });
    var dz = h('div', { class: 'trj-dropzone' }, [
      h('div', { class: 'trj-dropzone-icon', text: opts.icon || '📁' }),
      h('div', { class: 'trj-dropzone-title', text: opts.title || 'Arraste o arquivo aqui' }),
      h('div', { class: 'trj-dropzone-sub', html: opts.sub || 'ou clique para selecionar' }),
      statusPill,
      fileInput
    ]);
    dz.addEventListener('click', function (e) { if (e.target !== fileInput) fileInput.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); dz.classList.remove('dragover');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      opts.onFile(opts.multiple ? files : files[0]);
    });
    return dz;
  };

  // ---------- Copiar texto (clipboard) ----------
  U.copyText = function (text, msg) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { U.toast(msg || 'Copiado!', 'ok'); },
        function () { U.toast('Não foi possível copiar.', 'err'); }
      );
    } else {
      U.toast('Cópia não suportada neste navegador.', 'err');
    }
  };

  // ---------- Chart card (titulo + canvas) ----------
  // opts.onCopy(): se informado, mostra um botão "📋" que copia o texto retornado.
  U.chartCard = function (title, opts) {
    opts = opts || {};
    var canvas = h('canvas');
    var wrap = h('div', { class: 'chart-wrap' + (opts.small ? ' sm' : '') }, canvas);
    var rightBits = [];
    if (opts.hint) {
      // hint pode ser string ou elemento DOM (ex.: um U.switch)
      if (typeof opts.hint === 'string') {
        rightBits.push(h('span', { class: 'text-xs', style: { color: 'var(--trj-muted)' }, text: opts.hint }));
      } else if (opts.hint && opts.hint.nodeType) {
        rightBits.push(opts.hint);
      }
    }
    if (opts.rightEl && opts.rightEl.nodeType) rightBits.push(opts.rightEl);
    if (opts.onCopy) {
      rightBits.push(h('button', {
        class: 'trj-btn trj-btn-ghost', title: 'Copiar dados em texto',
        style: { padding: '3px 9px', fontSize: '12px' }, text: '📋',
        onclick: function () { U.copyText(opts.onCopy(), 'Dados copiados!'); }
      }));
    }
    var head = h('div', { class: 'flex items-center justify-between mb-3' }, [
      h('h3', { class: 'text-sm font-bold flex items-center gap-2' }, [
        h('span', { class: 'trj-chart-dot' }),
        h('span', { text: title })
      ]),
      rightBits.length ? h('div', { class: 'flex items-center gap-2' }, rightBits) : null
    ]);
    var card = h('div', { class: 'trj-card trj-chart-card p-4' }, [head, wrap]);
    return { card: card, canvas: canvas };
  };

  // ---------- Chart.js: tema escuro ----------
  var charts = [];
  U.destroyCharts = function () { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; };

  function isLightTheme() { return document.documentElement.getAttribute('data-theme') === 'light'; }
  function gridColor() { return isLightTheme() ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; }
  function tickColor() { return isLightTheme() ? '#5a5d6b' : '#9a9aa3'; }
  var tooltipCfg = {
    backgroundColor: '#1a1a24', titleColor: '#ff8c00', bodyColor: '#f0f0f0',
    borderColor: 'rgba(255,140,0,0.4)', borderWidth: 1, padding: 10, cornerRadius: 8
  };

  function register(c) { charts.push(c); return c; }

  // Clareia uma cor hex pro efeito de hover — mistura apenas 30% de branco
  // pra dar destaque sutil sem perder a cor original de referência.
  function clarearCor(hex) {
    hex = (hex || '#ff8c00').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    r = Math.min(255, Math.round(r + (255 - r) * 0.30));
    g = Math.min(255, Math.round(g + (255 - g) * 0.30));
    b = Math.min(255, Math.round(b + (255 - b) * 0.30));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // Enriquece datasets com hoverBackgroundColor mais clara + borda branca sutil
  function hoverDatasets(datasets) {
    return datasets.map(function (ds) {
      var bgArr = Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [ds.backgroundColor];
      var hoverBg = bgArr.map(function (c) {
        var cs = c && c.toString ? c.toString() : '';
        return cs.startsWith('#') ? clarearCor(cs) : cs;
      });
      return Object.assign({}, ds, {
        hoverBackgroundColor: hoverBg,
        hoverBorderColor: bgArr.map(function () { return 'rgba(255,255,255,0.55)'; }),
        hoverBorderWidth: 1.5
      });
    });
  }

  // bar vertical. data = [{label,total,cor?}], onBar(index)
  U.barChart = function (canvas, data, opts) {
    opts = opts || {};
    var datasets = [{ data: data.map(function (d) { return d.total; }),
      backgroundColor: data.map(function (d) { return d.cor || C.CORES_TRJ.orange; }),
      borderRadius: 6, maxBarThickness: 46 }];
    return register(new Chart(canvas, {
      type: 'bar',
      data: { labels: data.map(function (d) { return d.label; }), datasets: hoverDatasets(datasets) },
      options: baseOpts({ onClick: opts.onBar, horizontal: false })
    }));
  };

  // bar horizontal
  U.hbarChart = function (canvas, data, opts) {
    opts = opts || {};
    var datasets = [{ data: data.map(function (d) { return d.total; }),
      backgroundColor: data.map(function (d) { return d.cor || C.CORES_TRJ.orange; }),
      borderRadius: 6, maxBarThickness: 34 }];
    return register(new Chart(canvas, {
      type: 'bar',
      data: { labels: data.map(function (d) { return d.label; }), datasets: hoverDatasets(datasets) },
      options: baseOpts({ onClick: opts.onBar, horizontal: true })
    }));
  };

  // stacked dentro/fora (+ preditiva opcional). data = [{label, dentro, fora, preditiva?}], onSeg(index, datasetIndex)
  U.stackedChart = function (canvas, data, opts) {
    opts = opts || {};
    var o = baseOpts({ horizontal: false });
    o.scales.x.stacked = true; o.scales.y.stacked = true;
    o.plugins.legend.display = true;
    if (opts.onSeg) o.onClick = function (ev, els) { if (els && els.length) opts.onSeg(els[0].index, els[0].datasetIndex); };
    var temPreditiva = data.some(function (d) { return d.preditiva != null && d.preditiva > 0; });
    var datasets = [
      { label: opts.l1 || 'Dentro', data: data.map(function (d) { return d.dentro; }), backgroundColor: C.CORES_TRJ.green, borderRadius: 4, maxBarThickness: 46 },
      { label: opts.l2 || 'Fora', data: data.map(function (d) { return d.fora; }), backgroundColor: C.CORES_TRJ.red, borderRadius: 4, maxBarThickness: 46 }
    ];
    if (temPreditiva) datasets.push({ label: opts.l3 || 'Preditiva', data: data.map(function (d) { return d.preditiva || 0; }), backgroundColor: C.CORES_TRJ.orange, borderRadius: 4, maxBarThickness: 46 });
    return register(new Chart(canvas, {
      type: 'bar',
      data: { labels: data.map(function (d) { return d.label; }), datasets: hoverDatasets(datasets) },
      options: o
    }));
  };

  // donut. data = [{name,value}], onSlice(index) — com hover de cor mais clara + borda branca
  U.donutChart = function (canvas, data, opts) {
    opts = opts || {};
    // Aceita d.label OU d.name (compatibilidade)
    // Aceita d.cor individual OU opts.cores array (prioridade: d.cor)
    var cores = C.CHART_CORES;
    var bgCores = data.map(function (d, i) {
      return d.cor || (opts.cores ? opts.cores[i % opts.cores.length] : cores[i % cores.length]);
    });
    var hoverCores = bgCores.map(function (c) { return c && c.startsWith('#') ? clarearCor(c) : c; });
    return register(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map(function (d) { return d.label || d.name || ''; }),
        datasets: [{
          data: data.map(function (d) { return d.value; }),
          backgroundColor: bgCores,
          hoverBackgroundColor: hoverCores,
          hoverBorderColor: 'rgba(255,255,255,0.6)',
          hoverBorderWidth: 2,
          borderColor: isLightTheme() ? '#ffffff' : '#13131a', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: tickColor(), font: { size: 11 }, boxWidth: 12, padding: 12 }
          },
          tooltip: tooltipCfg
        },
        onClick: opts.onSlice ? function (ev, els) { if (els && els.length) opts.onSlice(els[0].index); } : undefined
      }
    }));
  };

  function baseOpts(cfg) {
    cfg = cfg || {};
    var o = {
      indexAxis: cfg.horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false, labels: { color: tickColor() } },
        tooltip: tooltipCfg
      },
      scales: {
        x: { ticks: { color: tickColor(), font: { size: 11 } }, grid: { color: gridColor() } },
        y: { ticks: { color: tickColor(), font: { size: 11 } }, grid: { color: gridColor() }, beginAtZero: true }
      }
    };
    if (cfg.onClick) o.onClick = function (ev, els) { if (els && els.length) cfg.onClick(els[0].index); };
    return o;
  }

  // ---------- Badges de status ----------
  U.slaBadge = function (statusSla) {
    var s = (statusSla || '').toUpperCase();
    var cor = '#9aa5b1', bg = 'rgba(154,165,177,.15)';
    if (s === 'FORA DO SLA') { cor = '#e74c3c'; bg = 'rgba(231,76,60,.15)'; }
    else if (s === 'DENTRO DO SLA') { cor = '#2ecc71'; bg = 'rgba(46,204,113,.15)'; }
    else if (s === 'PREDITIVA') { cor = '#ff8c00'; bg = 'rgba(255,140,0,.15)'; }
    else if (s === 'CONCLUIDO') { cor = '#3498db'; bg = 'rgba(52,152,219,.15)'; }
    return h('span', { class: 'trj-badge', style: { color: cor, background: bg }, text: statusSla || '—' });
  };
  U.tratBadge = function (st) {
    var s = (st || 'ATIVO').toUpperCase();
    var cor = '#e74c3c', bg = 'rgba(231,76,60,.15)';
    if (s === 'RESOLVIDO') { cor = '#2ecc71'; bg = 'rgba(46,204,113,.15)'; }
    else if (s === 'EM TRATAMENTO') { cor = '#ff8c00'; bg = 'rgba(255,140,0,.15)'; }
    return h('span', { class: 'trj-badge', style: { color: cor, background: bg }, text: st || 'ATIVO' });
  };

  // ---------- TSK aberta (cruza END_ID do incidente GENESIS com a fila de tarefas/TOA) ----------
  var STATUS_FECHADO_TSK = ['CONCLUÍDA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO'];
  function tskAberta(incident, tasksEnriched) {
    if (!incident || !tasksEnriched || !tasksEnriched.length) return null;
    var key = (incident.enderecoId || incident.endId || '').toString().trim().toUpperCase();
    if (!key) return null;
    var candidatos = tasksEnriched.filter(function (t) {
      var k2 = (t.enderecoId || '').toString().trim().toUpperCase();
      if (k2 !== key) return false;
      var st = (t.status || '').toString().trim().toUpperCase();
      return STATUS_FECHADO_TSK.indexOf(st) < 0;
    });
    if (!candidatos.length) return null;
    // Separar: corretiva tem prioridade sobre atividade manual
    function ehCorretiva(t) {
      var tipo = (t.tipoAtividade || '').trim();
      return tipo === 'Planta Interna - Manutenção Corretiva' || tipo === 'Planta Interna - Manutencao Corretiva' ||
             tipo.indexOf('Corretiva') >= 0 || tipo.indexOf('CORRETIVA') >= 0;
    }
    var corretivas = candidatos.filter(ehCorretiva);
    var ativos = corretivas.length > 0 ? corretivas : candidatos; // só manual se não há corretiva
    function sortDesc(list) {
      return list.sort(function (a, b) {
        var sa = Number(a.sequenciaId) || 0;
        var sb = Number(b.sequenciaId) || 0;
        if (sb !== sa) return sb - sa;
        var pa = (a.status || '').toUpperCase() === 'INICIADO' ? 0 : 1;
        var pb = (b.status || '').toUpperCase() === 'INICIADO' ? 0 : 1;
        return pa - pb;
      });
    }
    sortDesc(ativos);
    var melhor = ativos[0];

    // O row com maior sequenciaId pode ter BG vazio (update de status sem diary).
    // Buscar o motivoCancelamento (BG) mais recente com conteúdo real, igual ao VBA
    // que concatenava todos os updates do diário.
    var bgPrincipal = (melhor.motivoCancelamento || '').trim();
    var bgSlimPattern = /^(ASSOCIAÇÃO DE ATIVIDADES|AUTOMACAO|AUTOMAÇÃO)$/i;
    if (!bgPrincipal || bgSlimPattern.test(bgPrincipal)) {
      // Procurar em TODOS os rows da mesma TSK, do mais recente para o mais antigo
      var todosTSK = tasksEnriched.filter(function (t) {
        return t.osNumero === melhor.osNumero;
      });
      todosTSK.sort(function (a, b) { return (Number(b.sequenciaId)||0) - (Number(a.sequenciaId)||0); });
      for (var ri = 0; ri < todosTSK.length; ri++) {
        var bg = (todosTSK[ri].motivoCancelamento || '').trim();
        if (bg && !bgSlimPattern.test(bg)) { bgPrincipal = bg; break; }
      }
    }

    return {
      osNumero: melhor.osNumero,
      status: melhor.status || null,
      filaAtual: melhor.filaAtual || null,
      motivoCancelamento: bgPrincipal || melhor.motivoCancelamento || null,
      total: candidatos.length,
      sequenciaId: melhor.sequenciaId
    };
  }
  U.tskAberta = tskAberta;

  // Badge "TSK <num>" colorido por status (Iniciado=verde, Não iniciado=amarelo bem visível), ou "SEM TSK".
  U.tskCell = function (incident, tasksEnriched) {
    var m = tskAberta(incident, tasksEnriched);
    if (!m) {
      return h('span', { class: 'trj-badge', style: { background: 'rgba(231,76,60,.16)', color: '#ff6b6b', fontWeight: '700' } }, [
        h('span', { class: 'trj-pulse-dot', style: { marginRight: '5px', verticalAlign: 'middle' } }),
        h('span', { text: 'SEM TSK' })
      ]);
    }
    var st = (m.status || '').toUpperCase();
    var cor = '#9aa5b1', bg = 'rgba(154,165,177,.15)';
    if (st === 'INICIADO') { cor = '#1fae5e'; bg = 'rgba(46,204,113,.22)'; }
    else if (st === 'NÃO INICIADO' || st === 'NAO INICIADO') { cor = '#9a7d00'; bg = 'rgba(241,196,15,.35)'; }
    var texto = (m.osNumero || '—') + (m.total > 1 ? ' (+' + (m.total - 1) + ')' : '');
    var tooltip = (m.status || '') + (m.filaAtual ? '\n' + m.filaAtual : '');
    return h('span', { class: 'trj-badge', style: { background: bg, color: cor, fontWeight: '700', cursor: 'help' }, title: tooltip }, texto);
  };

  // Padrões de anotações automáticas do sistema (bot) — ignoradas ao extrair o último update manual.
  var BOT_PATTERNS = [/WFM\s*Agent/i, /MONITOR\s*CCI/i, /isoc_fixa/i, /Anotações de trabalho/i, /Sistema.*automático/i];
  function ehBot(bloco) { return BOT_PATTERNS.some(function (p) { return p.test(bloco); }); }
  function extrairUltimaAnotacao(bgTexto) {
    if (!bgTexto) return null;
    var blocos = bgTexto.toString().split(/(?=\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)|(?=[A-Z]{2,6}_\d{4}[\d\-]+)/);
    for (var i = 0; i < blocos.length; i++) {
      var b = blocos[i].trim();
      if (b.length < 20) continue;
      if (!ehBot(b)) return b;
    }
    return null;
  }

  U.parseDataHoraBG = parseDataHoraBG;
  U.extrairDoisBlocosBG = extrairDoisBlocosMaisRecentes;
  U.isTextoSemAtualizacao = isTextoSemAtualizacao;

  // ---------- Correlação entre incidentes (mesmo horário ±4min + ANF/cidade) ----------
  function parseHorarioMin(horario) {
    if (!horario) return null;
    var m = String(horario).match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var dia = parseInt(m[1], 10), mes = parseInt(m[2], 10), hh = parseInt(m[3], 10), mi = parseInt(m[4], 10);
    return ((mes * 31) + dia) * 1440 + hh * 60 + mi; // só serve para medir diferenças pequenas
  }
  // Retorna { idx: {forte, fraca} } — forte = mesma ANF e cidade; fraca = só mesma ANF.
  U.computeCorrelacoes = function (rows) {
    function cidadeNorm(r) {
      var c = (r.cidadeUf || r.cidade || '').toString().toUpperCase().trim();
      return c.split('/')[0].trim(); // "VILA VELHA / ES" e "VILA VELHA" devem bater
    }
    var pts = rows.map(function (r, i) {
      return { i: i, t: parseHorarioMin(r.horario), anf: (r.anf || '').toString().trim(), cidade: cidadeNorm(r) };
    }).filter(function (x) { return x.t != null && x.anf; });
    var result = {};
    for (var a = 0; a < pts.length; a++) {
      for (var b = a + 1; b < pts.length; b++) {
        var x = pts[a], y = pts[b];
        if (x.anf !== y.anf || Math.abs(x.t - y.t) > 4) continue;
        var forte = !!(x.cidade && y.cidade && x.cidade === y.cidade);
        result[x.i] = result[x.i] || { forte: 0, fraca: 0 };
        result[y.i] = result[y.i] || { forte: 0, fraca: 0 };
        if (forte) { result[x.i].forte++; result[y.i].forte++; }
        else { result[x.i].fraca++; result[y.i].fraca++; }
      }
    }
    return result;
  };

  // ---------- Badge visual de vencimento (backlog aberto: "VENCE EM / VENCIDO A") ----------
  U.vencimentoBadge = function (vencimentoCalc) {
    var venc = D.formatarVencimentoSimples(vencimentoCalc);
    if (!venc.cor) return h('span', { style: { color: 'var(--trj-muted)' }, text: '—' });
    var bg = venc.venceu ? 'rgba(231,76,60,.16)' : 'rgba(46,204,113,.16)';
    var icone = venc.venceu ? '⚠️' : '⏱';
    var bits = [h('span', { text: icone }), h('span', { text: venc.texto })];
    if (venc.venceu) bits.unshift(h('span', { class: 'trj-pulse-dot' }));
    return h('span', {
      class: 'trj-badge', style: { background: bg, color: venc.cor, fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px' }
    }, bits);
  };

  // ---------- Badge de tipo de cancelamento ----------
  // Para canceladas: mostra o MOTIVO (Associação ou Automação), sem medir SLA.
  // A medição de SLA não é confiável pra canceladas porque a data de
  // cancelamento fica em texto livre (campo BG), então usar o tipo é mais
  // seguro e mais útil operacionalmente.
  U.cancelamentoBadge = function (t) {
    var motivo = (t.motivoCancelamento || '').toString().toUpperCase();
    var ehAssoc = motivo.indexOf('ASSOCIA') >= 0;
    if (ehAssoc) {
      return h('span', { class: 'trj-badge', style: { background: 'rgba(52,152,219,.16)', color: '#3498db', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px' } }, [
        h('span', { text: '🔗' }), h('span', { text: 'Associação' })
      ]);
    }
    return h('span', { class: 'trj-badge', style: { background: 'rgba(155,89,182,.16)', color: '#9b59b6', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px' } }, [
      h('span', { text: '⚡' }), h('span', { text: 'Automação' })
    ]);
  };

  // ---------- Badge de Resultado SLA (somente para CONCLUÍDAS) ----------
  // Compara fimCalc (hora real de encerramento) com vencimentoCalc (prazo).
  U.resultadoSlaBadge = function (t) {
    if (!t.fimCalc || !t.vencimentoCalc) return h('span', { style: { color: 'var(--trj-muted)' }, text: '—' });
    var dentroSla = new Date(t.fimCalc).getTime() <= new Date(t.vencimentoCalc).getTime();
    if (dentroSla) {
      return h('span', { class: 'trj-badge', style: { background: 'rgba(46,204,113,.16)', color: '#2ecc71', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px' } }, [
        h('span', { text: '✅' }), h('span', { text: 'Dentro SLA' })
      ]);
    }
    return h('span', { class: 'trj-badge', style: { background: 'rgba(231,76,60,.16)', color: '#e74c3c', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px' } }, [
      h('span', { text: '❌' }), h('span', { text: 'Fora SLA' })
    ]);
  };

  // ---------- Tabela de tasks (drill) ----------
  // opts.modoResultado = true  → última coluna mostra "Dentro SLA / Fora SLA" (concluídas)
  // opts.modoCancelamento = true → última coluna mostra "Automação / Associação" (canceladas)
  // sem flag → mostra tempo restante (backlog aberto)
  U.taskTable = function (rows, opts) {
    opts = opts || {};
    var modoResultado = opts.modoResultado;
    var modoCancelamento = opts.modoCancelamento;
    var colLabel = modoCancelamento ? 'Tipo Cancelamento' : (modoResultado ? 'Resultado SLA' : 'Vencimento');
    var thead = h('thead', null, h('tr', null, ['Região', 'TSK', 'Site', 'Cidade', 'Falha', 'P', 'Criação NTT', colLabel].map(function (t) { return h('th', { text: t }); })));
    var body = rows.slice(0, 1000).map(function (t) {
      var lastCell;
      if (modoCancelamento) lastCell = U.cancelamentoBadge(t);
      else if (modoResultado) lastCell = U.resultadoSlaBadge(t);
      else lastCell = U.vencimentoBadge(t.vencimentoCalc);
      // Criação NTT: parsePlatformDate() antes de formatarDataCompacta()
      // garante que "12/06/2026" seja interpretado como 12 de junho (BR),
      // não como dezembro 6 (US) que new Date() faria.
      var rawNTT = t.dataCriacaoAS || t.dataCriacao;
      var dtNTT = rawNTT ? (D.parsePlatformDate ? D.parsePlatformDate(rawNTT) : null) : null;
      return h('tr', null, [
        h('td', { text: C.REGIAO_LABELS[t.regiao] || t.regiao || '—' }),
        h('td', { text: t.osNumero || '—' }),
        h('td', { text: t.siteId || t.enderecoId || '—' }),
        h('td', { text: t.cidade || '—' }),
        h('td', { text: t.tipoFalha || '—' }),
        h('td', { text: t.prioridade || '—' }),
        h('td', { text: dtNTT ? D.formatarDataCompacta(dtNTT) : '—' }),
        h('td', null, lastCell)
      ]);
    });
    var tbl = h('table', { class: 'trj-table' }, [thead, h('tbody', null, body)]);
    return wrapTable(tbl, rows.length);
  };

  // ---------- Texto pra copiar (WhatsApp) — drill de tarefas ----------
  // Agrupa por Região e, dentro de cada região, por Prioridade (*P1*, *P2*...),
  // pra servir de cobrança direta com o time.
  U.taskTableCopyText = function (rows, titulo) {
    var porRegiao = {};
    (rows || []).forEach(function (t) {
      var reg = C.REGIAO_LABELS[t.regiao] || t.regiao || 'OTHERS';
      var p = (t.prioridade || 'SEM PRIORIDADE').toString().toUpperCase().trim() || 'SEM PRIORIDADE';
      porRegiao[reg] = porRegiao[reg] || {};
      porRegiao[reg][p] = porRegiao[reg][p] || [];
      porRegiao[reg][p].push(t);
    });
    var linhas = ['*' + (titulo || 'Detalhamento') + '*', 'Total: ' + (rows || []).length, ''];
    Object.keys(porRegiao).sort().forEach(function (reg) {
      linhas.push('*' + reg + '*');
      Object.keys(porRegiao[reg]).sort().forEach(function (p) {
        linhas.push('*' + p + '*');
        porRegiao[reg][p].forEach(function (t) {
          var venc = D.formatarVencimentoSimples(t.vencimentoCalc);
          linhas.push('• ' + (t.osNumero || '—') + ' · ' + (t.siteId || t.enderecoId || '—') + ' · ' + (t.cidade || '—') + ' · ' + (t.tipoFalha || '—') + ' · ' + venc.texto);
        });
      });
      linhas.push('');
    });
    return linhas.join('\n').trim();
  };

  // Formata tempo decorrido desde o timestamp de atualização no campo detalhe do GENESIS.
  // Verde < 30min · Amarelo 30–60min · Vermelho > 60min (com ponto pulsante).
  function formatElapsedGenesis(iso) {
    if (!iso) return null;
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) ms = 0;
    var min = Math.floor(ms / 60000);
    var hh = Math.floor(min / 60), mm = min % 60;
    var texto = hh > 0 ? (hh + 'h' + (mm > 0 ? mm + 'min' : '')) : (min + 'min');
    var cor, bg;
    if (min < 30)      { cor = '#2ecc71'; bg = 'rgba(46,204,113,.15)'; }
    else if (min < 60) { cor = '#f1c40f'; bg = 'rgba(241,196,15,.15)'; }
    else               { cor = '#e74c3c'; bg = 'rgba(231,76,60,.15)'; }
    return { texto: texto, cor: cor, bg: bg, min: min };
  }
  U.formatElapsedGenesis = formatElapsedGenesis;

  // ---------- Tabela de incidentes G.E.N.E.S.I.S (Sites Fora + drills) ----------
  // Colunas iguais ao painel de origem (Horário/Duração/Tec/Site/END_ID/ANF/Cidade-UF),
  // troca a coluna "Status" do GENESIS pela TSK aberta na fila (tasksEnriched),
  // e sinaliza com ⚡ incidentes prováveis de mesma causa raiz (mesma ANF, horário próximo).
  U.incidentTable = function (rows, tasksEnriched) {
    var corr = U.computeCorrelacoes(rows);
    var thead = h('thead', null, h('tr', null,
      ['Horário', 'Duração', 'Site', 'END_ID', 'ANF', 'Cidade/UF', 'TSK', 'Último Update', 'Causa', 'Detalhe']
        .map(function (t) { return h('th', { text: t }); })));
    var body = rows.slice(0, 1000).map(function (r, idx) {
      var c = corr[idx];
      var rowStyle = {}, corrIcon = null;
      if (c && c.forte > 0) {
        rowStyle.borderLeft = '3px solid #e74c3c';
        corrIcon = h('span', { style: { marginRight: '5px' }, title: 'Correlacionado com ' + c.forte + ' outro(s) incidente(s) — mesma ANF e cidade, horário a até 4min de diferença', text: '⚡' });
      } else if (c && c.fraca > 0) {
        rowStyle.borderLeft = '3px solid #f1c40f';
        corrIcon = h('span', { style: { marginRight: '5px' }, title: 'Correlacionado com ' + c.fraca + ' outro(s) incidente(s) — mesma ANF, horário a até 4min de diferença', text: '⚡' });
      }
      return h('tr', { style: rowStyle }, [
        h('td', { text: r.horario || '—' }),
        h('td', { text: r.downtime || r.duracao || '—' }),
        h('td', null, [corrIcon, h('span', { text: r.site || '—' })]),
        h('td', { text: r.enderecoId || '—' }),
        h('td', { text: r.anf || '—' }),
        h('td', { text: r.cidadeUf || r.cidade || '—' }),
        h('td', null, U.tskCell(r, tasksEnriched)),
        h('td', null, U.ultimoUpdateCell(r, tasksEnriched)),
        h('td', { text: r.causa || '/' }),
        h('td', null, function(){
          var textoDetalhe = r.detalhe || '';
          var elapsed = formatElapsedGenesis(r.ultimaAtGenesis);
          // Detecta se a TSK tem atualização mais recente que o timestamp do GENESIS
          var genesisAtMs = r.ultimaAtGenesis ? new Date(r.ultimaAtGenesis).getTime() : 0;
          var tskInfo = tskAberta(r, tasksEnriched);
          var tskBloco = tskInfo ? classificarUltimoBloco(tskInfo.motivoCancelamento) : null;
          var stTsk = (tskInfo && tskInfo.status || '').toString().trim().toUpperCase();
          var precisaAtualizar = !!(tskInfo && tskBloco && tskBloco.estado !== 'sem' &&
                                    tskBloco.dt && tskBloco.dt.getTime() > genesisAtMs &&
                                    (stTsk === 'INICIADO' || stTsk === 'NÃO INICIADO' || stTsk === 'NAO INICIADO'));
          function atualizarBadge() {
            if (!precisaAtualizar) return null;
            return h('span', { class: 'trj-badge', style: { color: 'var(--trj-primary)', background: 'rgba(255,140,0,.2)', fontSize: '10px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' } },
              [h('span', { class: 'trj-pulse-dot' }), h('span', { text: 'ATUALIZAR GENESIS' })]);
          }
          function timeBadge() {
            if (!elapsed) return null;
            var bits = [];
            if (elapsed.min >= 60) bits.push(h('span', { class: 'trj-pulse-dot', style: { marginRight: '3px' } }));
            bits.push(h('span', { text: 'há ' + elapsed.texto }));
            return h('span', { class: 'trj-badge', style: { color: elapsed.cor, background: elapsed.bg, fontSize: '10px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' } }, bits);
          }
          function buildCel(mainEl) {
            var parts = [atualizarBadge(), mainEl, timeBadge()].filter(Boolean);
            return parts.length === 1 ? parts[0] :
              h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' } }, parts);
          }
          if (!textoDetalhe || textoDetalhe === '#') {
            return buildCel(h('span', { style: { color: 'var(--trj-muted)', fontStyle: 'italic', fontSize: '11px' }, text: 'SEM INFO' }));
          }
          var resumo = textoDetalhe.replace(/\n+/g, ' ').slice(0, 38) + (textoDetalhe.length > 38 ? '…' : '');
          var cel = h('span', {
            style: { maxWidth: '240px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline dotted' },
            title: textoDetalhe.slice(0, 300), text: resumo
          });
          cel.addEventListener('click', function(ev) {
            ev.stopPropagation();
            var cid = h('div', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.8', padding: '4px' }, text: textoDetalhe });
            U.openModal('Detalhe', cid);
          });
          return buildCel(cel);
        }())
      ]);
    });
    var tbl = h('table', { class: 'trj-table' }, [thead, h('tbody', null, body)]);
    return wrapTable(tbl, rows.length);
  };

  // Seleciona o melhor nome de site de uma lista separada por vírgula (agrupamento).
  // Ordem de prioridade: SR- > 5G- > 4G- > primeiro da lista.
  function priorizarSite(siteStr) {
    if (!siteStr) return '—';
    var sites = siteStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (sites.length <= 1) return sites[0] || '—';
    function pfx(p) { return sites.find(function(s) { return s.toUpperCase().indexOf(p) === 0; }) || null; }
    return pfx('SR-') || pfx('5G-') || pfx('4G-') || sites[0];
  }

  // Retorna o status de atualização de um incidente para o texto de cópia.
  //   'ATUALIZAR GENESIS' → TSK (INICIADO/NÃO INICIADO) tem update mais recente que o GENESIS
  //   'SEM ATUALIZAÇÃO'   → nenhum timestamp registrado no detalhe do GENESIS
  //   'ATUALIZAR'         → timestamp do GENESIS existe mas é mais antigo que 1h
  //   null                → atualizado há menos de 1h, nada a sinalizar
  function statusCopiaGenesis(r, tsks) {
    var genesisAtMs = r.ultimaAtGenesis ? new Date(r.ultimaAtGenesis).getTime() : 0;
    var tskInfo = tskAberta(r, tsks);
    var stTsk = (tskInfo && tskInfo.status || '').toString().trim().toUpperCase();
    if (tskInfo && (stTsk === 'INICIADO' || stTsk === 'NÃO INICIADO' || stTsk === 'NAO INICIADO')) {
      var bloco = classificarUltimoBloco(tskInfo.motivoCancelamento);
      if (bloco && bloco.estado !== 'sem' && bloco.dt && bloco.dt.getTime() > genesisAtMs) return 'ATUALIZAR GENESIS';
    }
    if (!r.ultimaAtGenesis) return 'SEM ATUALIZAÇÃO';
    if ((Date.now() - genesisAtMs) > 3600000) return 'ATUALIZAR';
    return null;
  }

  // ---------- Texto pra copiar (WhatsApp) — drill de incidentes ----------
  // Quando tasksEnriched é passado, usa o formato sites-fora:
  //   • Site / END_ID - STATUS
  // Caso contrário, usa o formato original agrupado por região.
  U.incidentTableCopyText = function (rows, titulo, tasksEnriched) {
    if (tasksEnriched) {
      var porRegiao = {};
      (rows || []).forEach(function (r) {
        var reg = (C.REGIAO_LABELS && C.REGIAO_LABELS[r.regiao]) || r.regiao || 'OUTROS';
        porRegiao[reg] = porRegiao[reg] || [];
        porRegiao[reg].push(r);
      });
      var linhas = ['*' + (titulo || 'Sites Fora') + '*', 'Total: ' + (rows || []).length, ''];
      var agora30 = Date.now();
      function parseHorarioDt(hor) {
        var m = String(hor || '').match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
        if (!m) return null;
        var now = new Date();
        var dt = new Date(now.getFullYear(), +m[2]-1, +m[1], +m[3], +m[4], 0, 0);
        if (dt.getTime() > agora30 + 3600000) dt.setFullYear(dt.getFullYear() - 1);
        return dt;
      }
      Object.keys(porRegiao).sort().forEach(function (reg) {
        var linhasReg = [];
        porRegiao[reg].forEach(function (r) {
          var dtHor = parseHorarioDt(r.horario);
          if (dtHor && (agora30 - dtHor.getTime()) < 30 * 60000) return; // menos de 30 min — ignora
          var hor  = (r.horario || '—').trim();
          var site = priorizarSite(r.site || '');
          var endId = r.enderecoId || '—';
          var st = statusCopiaGenesis(r, tasksEnriched);
          linhasReg.push('• ' + hor + ' - ' + site + ' / ' + endId + (st ? ' - ' + st : ''));
        });
        if (!linhasReg.length) return; // região vazia após filtro — omite
        linhas.push('*' + reg + '*');
        linhasReg.forEach(function (l) { linhas.push(l); });
        linhas.push('');
      });
      return linhas.join('\n').trim();
    }
    var porRegiao = {};
    (rows || []).forEach(function (r) {
      var reg = C.REGIAO_LABELS[r.regiao] || r.regiao || 'OTHERS';
      porRegiao[reg] = porRegiao[reg] || [];
      porRegiao[reg].push(r);
    });
    var linhas = ['*' + (titulo || 'Detalhamento') + '*', 'Total: ' + (rows || []).length, ''];
    Object.keys(porRegiao).sort().forEach(function (reg) {
      linhas.push('*' + reg + '*');
      porRegiao[reg].forEach(function (r) {
        linhas.push('• ' + (r.site || '—') + ' · ' + (r.enderecoId || '—') + ' · ' + (r.cidadeUf || r.cidade || '—') + ' · ANF ' + (r.anf || '—'));
      });
      linhas.push('');
    });
    return linhas.join('\n').trim();
  };

  function wrapTable(tbl, n) {
    return h('div', null, [
      h('div', { class: 'text-xs mb-2', style: { color: 'var(--trj-muted)' }, text: fmtNum(n) + ' registro(s)' + (n > 1000 ? ' (exibindo 1000)' : '') }),
      h('div', { style: { maxHeight: '64vh', overflow: 'auto' } }, tbl)
    ]);
  }

  // ---------- Section helper ----------
  // opts.compact: cabeçalho bem sutil/reduzido (ex.: página Sites Fora, onde o
  // que importa é o conteúdo da lista, não o topo).
  U.pageHeader = function (title, subtitle, right, opts) {
    opts = opts || {};
    var logoSize = opts.compact ? '30px' : '42px';
    var logo = h('img', { src: 'assets/logo-trj.png', alt: '', class: 'trj-logo-hover', style: { width: logoSize, height: logoSize, objectFit: 'contain', flexShrink: '0' } });
    var tituloEl = h('h1', { class: 'trj-heading font-extrabold flex items-center gap-2', style: { fontSize: opts.compact ? '17px' : '26px' } }, [logo, h('span', { text: title })]);
    return h('div', { class: 'flex items-end justify-between flex-wrap gap-3', style: { marginBottom: opts.compact ? '10px' : '20px' } }, [
      h('div', null, [
        tituloEl,
        subtitle ? h('p', { class: 'text-sm mt-1', style: { color: 'var(--trj-muted)' }, text: subtitle }) : null
      ]),
      right || null
    ]);
  };

  TRJ.ui = U;
  // ---------- Rodapé "Equipe de Desenvolvimento" ----------
  // Reaproveitado tanto no painel principal (app.js) quanto no dashboard
  // público (dashboard-publico.html), pra manter o crédito sempre visível.

// Ícone SVG de folha/documento (para o Último Update)
  var ICONE_FOLHA_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

  // ============================================================
  // LÓGICA DO ÚLTIMO UPDATE (baseada no VBA modDistribuirDados)
  // ============================================================
  // Frases padrão dos sistemas automáticos (MONITOR CCI / BOT)
  var FRASES_PADRAO_BOT = [
    'Identificamos seu reparo na fila da TLP e vamos atuar para resolver o mais breve possível. Estamos trabalhando para garantir o melhor atendimento.',
    'Identificamos alarmes relacionados ao seu reparo estaremos encaminhado o mesmo para atuação em campo.'
  ];

  // Padrões de resposta automática que CONTÊM uma parte fixa, mas podem ter
  // prefixo variável (ex.: número de circuito). Checados via indexOf.
  var FRASES_PADRAO_BOT_PARCIAIS = [
    // "Circuito RJO60014894:\nNão foi identificado massiva no provedor VTAL..."
    // O número do circuito varia, então checamos só a parte constante.
    'NÃO FOI IDENTIFICADO MASSIVA NO PROVEDOR VTAL E NÃO FOI IDENTIFICADO FALHA DE INFRA/ENERGIA'
  ];

  // Corresponde a IsTextoSemAtualizacao do VBA
  function isTextoSemAtualizacao(bg) {
    if (!bg || bg.trim() === '') return true;
    var t = bg.trim().toUpperCase().replace(/\s+/g, ' ');
    // Correspondência exata com frases padrão de bot
    for (var i = 0; i < FRASES_PADRAO_BOT.length; i++) {
      if (t === FRASES_PADRAO_BOT[i].trim().toUpperCase().replace(/\s+/g, ' ')) return true;
    }
    // Correspondência parcial (texto contém a frase padrão como único conteúdo relevante)
    for (var j = 0; j < FRASES_PADRAO_BOT_PARCIAIS.length; j++) {
      if (t.indexOf(FRASES_PADRAO_BOT_PARCIAIS[j]) >= 0) return true;
    }
    // Formulário auto de GMG (WFM/System) — mas só se não houver bloco manual "ATUALIZAÇÃO GMG"
    if (t.indexOf('ALTERAÇÃO NO ENVIO') >= 0 && t.indexOf('JUSTIFICATIVA DA SELEÇÃO') >= 0 && t.indexOf('DATA DE ATIVAÇÃO DO GERADOR') >= 0) {
      if (t.indexOf('ATUALIZAÇÃO GMG') < 0) return true;
    }
    return false;
  }

  // Parseia data no formato DD/MM/YYYY HH:MM:SS, DD/MM/YY HH:MM, YYYY-MM-DD HH:MM,
  // DD/MM HH:MM (sem ano — assume ano atual) e HH:MM sozinho (assume hoje; se resultado
  // cair no futuro, assume ontem). Réplica fiel de ExtrairUltimaDataHora do VBA original.
  function parseDataHoraBG(s) {
    s = (s || '').trim();
    var m;
    // YYYY-MM-DD HH:MM ou YYYY-MM-DD HH:MM:SS
    m = s.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], m[6]?+m[6]:0);
    // DD/MM/YYYY HH:MM ou DD/MM/YY HH:MM (com ano)
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      var ano = +m[3]; if (ano < 100) ano += 2000;
      return new Date(ano, +m[2]-1, +m[1], +m[4], +m[5], m[6]?+m[6]:0);
    }
    // DD/MM HH:MM (sem ano) — assume o ano atual, igual ao VBA
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var anoAtual = new Date().getFullYear();
      return new Date(anoAtual, +m[2]-1, +m[1], +m[3], +m[4], m[5]?+m[5]:0);
    }
    // HH:MM ou HH:MM:SS sozinho — assume hoje; se resultado cair no futuro, assume ontem
    m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var hh = +m[1], mm = +m[2], ss = m[3] ? +m[3] : 0;
      if (hh > 23 || mm > 59 || ss > 59) return null;
      var agora = new Date();
      var dt = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hh, mm, ss);
      if (dt.getTime() > agora.getTime()) dt.setDate(dt.getDate() - 1); // igual ao VBA: DateAdd("d", -1, dt)
      return dt;
    }
    return null;
  }

  // Regex unificada de captura de timestamps no texto BG — ORDEM IMPORTA:
  // do padrão mais específico (com ano) ao menos específico (só hora).
  // Réplica o pattern do VBA ExtrairUltimaDataHora / UltimaMensagemEhVerificandoAcionamento.
  var BG_TIMESTAMP_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{4}[\/\-]\d{2}[\/\-]\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}[\/\-]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)/g;
  U.BG_TIMESTAMP_RE = BG_TIMESTAMP_RE;
  U.classificarUltimoBloco = classificarUltimoBloco;

  // Extrai TODOS os timestamps do texto BG e retorna o bloco (timestamp + texto seguinte)
  // cuja data seja a MAIS RECENTE — igual ao ExtrairUltimaDataHora + UltimaMensagem do VBA.
  // Handles: DD/MM/YYYY HH:MM:SS, YYYY-MM-DD HH:MM e variações.
  function extrairBlocoMaisRecente(bgTexto) {
    if (!bgTexto) return null;
    var texto = bgTexto.toString();
    var DT_RE = new RegExp(BG_TIMESTAMP_RE.source, 'g');
    var matches = [], m;
    while ((m = DT_RE.exec(texto)) !== null) {
      var dt = parseDataHoraBG(m[1]);
      if (dt && !isNaN(dt.getTime())) matches.push({ idx: m.index, len: m[0].length, dt: dt });
    }
    if (!matches.length) return null;
    // Extrai bloco de cada timestamp até o próximo
    var blocos = matches.map(function (cur, i) {
      var fim = i < matches.length - 1 ? matches[i + 1].idx : texto.length;
      return { dt: cur.dt, texto: texto.substring(cur.idx, fim).trim() };
    });
    // Ordena pelo mais recente
    blocos.sort(function (a, b) { return b.dt - a.dt; });
    return blocos[0];
  }

  // Parser de entradas genuínas de operadores no diário — dois formatos suportados:
  // Formato 1 (TLP-T): TLP-Txxxxxx-NOME - YYYY-MM-DD HH:MM
  // Formato 2 (Data-Nome): DD/MM/YYYY HH:MM:SS - NOME COMPLETO
  // Bots/sistemas nunca geram o formato TLP-T; no Formato 2 são filtrados pelo nome.
  var RE_TLP_UI    = /TLP-T\d+-([^-\r\n]{3,60}?)\s*-\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/g;
  var RE_DTNAME_UI = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\s*-\s*([^\r\n]{5,80})/g;
  // Bot filter: nomes de sistemas automáticos (início) OU "(Anotações de trabalho)" em qualquer posição
  var RE_BOT_UI = /^(?:MONITOR\s*CCI|WFM\s*Agent|isoc_fixa|[Aa]utoma[çc][aã]o|Sistema\s*autom|System\b|Raio-X|dsoc_[a-z_]|taischatbot|\w+chatbot)|\(anota/i;
  function parseTlpEntries(texto) {
    if (!texto) return [];
    var entries = [], m;
    // Formato 1: TLP-T
    RE_TLP_UI.lastIndex = 0;
    while ((m = RE_TLP_UI.exec(texto)) !== null) {
      var p = m[2].trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!p) continue;
      var dt = new Date(+p[1], +p[2]-1, +p[3], +p[4], +p[5], p[6]?+p[6]:0);
      if (!isNaN(dt.getTime())) entries.push({ dt: dt, author: m[1].trim() });
    }
    // Formato 2: DD/MM/YYYY HH:MM:SS - NOME
    RE_DTNAME_UI.lastIndex = 0;
    while ((m = RE_DTNAME_UI.exec(texto)) !== null) {
      var nome = m[2].trim();
      if (RE_BOT_UI.test(nome)) continue;
      var p2 = m[1].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!p2) continue;
      var dt2 = new Date(+p2[3], +p2[2]-1, +p2[1], +p2[4], +p2[5], p2[6]?+p2[6]:0);
      if (!isNaN(dt2.getTime())) entries.push({ dt: dt2, author: nome });
    }
    // Formato 3: bloco "ATUALIZAÇÃO GMG" — localiza timestamp anterior mais próximo
    var RE_GMG_UI = /ATUALIZA[ÇC][AÃ]O\s+GMG/gi;
    RE_GMG_UI.lastIndex = 0;
    while ((m = RE_GMG_UI.exec(texto)) !== null) {
      var before = texto.substring(0, m.index);
      var RE_TS = new RegExp(BG_TIMESTAMP_RE.source, 'g');
      var tsMatch = null, tsMt;
      while ((tsMt = RE_TS.exec(before)) !== null) tsMatch = tsMt;
      if (!tsMatch) continue;
      var dtGmg = parseDataHoraBG(tsMatch[1]);
      if (dtGmg && !isNaN(dtGmg.getTime())) entries.push({ dt: dtGmg, author: 'GMG' });
    }
    entries.sort(function(a, b) { return a.dt - b.dt; });
    return entries;
  }

  // Classifica o estado do Último Update.
  // Prioriza entradas TLP-T (genuínas de operadores, mesmo critério da aba Atualizações).
  // Cai de volta à detecção genérica de timestamp + filtro de bot apenas quando não há TLP-T.
  //   'sem'         → nenhuma entrada real encontrada
  //   'acionamento' → última entrada real contém "VERIFICANDO ACIONAMENTO"
  //   'ok'          → última entrada real é de hoje
  //   'antigo'      → última entrada real é de ontem ou anterior
  function classificarUltimoBloco(bgTexto) {
    if (isTextoSemAtualizacao(bgTexto)) return { estado: 'sem', texto: null, dt: null };
    var bloco = extrairBlocoMaisRecente(bgTexto);
    var textoDisplay = bloco ? bloco.texto : (bgTexto ? bgTexto.toString().trim() : null);

    // Fonte primária: entradas TLP-T (operadores humanos, filtragem por design)
    var tlpEntries = parseTlpEntries(bgTexto || '');
    var dtRef = tlpEntries.length ? tlpEntries[tlpEntries.length - 1].dt : (bloco ? bloco.dt : null);

    if (!dtRef) return { estado: 'sem', texto: textoDisplay, dt: null };

    var txtUpper = (textoDisplay || '').toUpperCase();
    if (txtUpper.indexOf('VERIFICANDO ACIONAMENTO') >= 0) return { estado: 'acionamento', texto: textoDisplay, dt: dtRef };

    // Filtro de MONITOR CCI só é necessário no fallback (sem TLP-T), pois TLP-T já exclui bots
    if (!tlpEntries.length && txtUpper.indexOf('MONITOR CCI') >= 0) {
      for (var fi = 0; fi < FRASES_PADRAO_BOT.length; fi++) {
        if (txtUpper.indexOf(FRASES_PADRAO_BOT[fi].toUpperCase()) >= 0) {
          return { estado: 'sem', texto: null, dt: null };
        }
      }
      return { estado: 'acionamento', texto: textoDisplay, dt: dtRef };
    }

    var agora = new Date();
    var ehHoje = dtRef.getDate() === agora.getDate() &&
                 dtRef.getMonth() === agora.getMonth() &&
                 dtRef.getFullYear() === agora.getFullYear();
    return { estado: ehHoje ? 'ok' : 'antigo', texto: textoDisplay, dt: dtRef };
  }

  // Extrai os 2 blocos mais recentes (penúltimo + último) para o modal.
  function extrairDoisBlocosMaisRecentes(bgTexto) {
    if (!bgTexto) return [];
    var texto = bgTexto.toString();
    var DT_RE = new RegExp(BG_TIMESTAMP_RE.source, 'g');
    var matches = [], m;
    while ((m = DT_RE.exec(texto)) !== null) {
      var dt = parseDataHoraBG(m[1]);
      if (dt && !isNaN(dt.getTime())) matches.push({ idx: m.index, dt: dt });
    }
    if (!matches.length) return bgTexto ? [bgTexto.toString().trim()] : [];
    var blocos = matches.map(function (cur, i) {
      var fim = i < matches.length - 1 ? matches[i + 1].idx : texto.length;
      return { dt: cur.dt, texto: texto.substring(cur.idx, fim).trim() };
    });
    blocos.sort(function (a, b) { return b.dt - a.dt; });
    return blocos.slice(0, 2).map(function (b) { return b.texto; });
  }

  // Célula "Último Update" — substitui a coluna Previsão na tabela de incidentes.
  // Célula "Último Update" — substitui a coluna Previsão na tabela de incidentes.
  // Ícone de folha SVG: verde = tem update, laranja = verificando acionamento, vermelho = sem update.
  U.ultimoUpdateCell = function (incident, tasksEnriched) {
    var m = tskAberta(incident, tasksEnriched);

    // Classificar a partir do diário TSK se disponível
    var resultado = m ? classificarUltimoBloco(m.motivoCancelamento) : { estado: 'sem', dt: null, texto: null };

    // Fallback: se o diário não tem entrada válida, usa o timestamp do detalhe Genesis
    if (resultado.estado === 'sem' && incident.ultimaAtGenesis) {
      var genesisAt = new Date(incident.ultimaAtGenesis);
      if (!isNaN(genesisAt.getTime())) {
        var agNow = new Date();
        var ehHoje = genesisAt.getDate() === agNow.getDate() &&
                     genesisAt.getMonth() === agNow.getMonth() &&
                     genesisAt.getFullYear() === agNow.getFullYear();
        resultado = { estado: ehHoje ? 'ok' : 'antigo', dt: genesisAt, texto: 'Genesis: ' + incident.ultimaAtGenesis };
      }
    }

    var estado = resultado.estado;
    var textoCompleto = resultado.texto;

    function abrirModal(ev) {
      ev.stopPropagation();
      var conteudoModal;
      if (m && m.motivoCancelamento) {
        var dois = extrairDoisBlocosMaisRecentes(m.motivoCancelamento || '');
        conteudoModal = dois.length > 1
          ? '── Último ──\n\n' + dois[0] + '\n\n── Penúltimo ──\n\n' + dois[1]
          : (textoCompleto || '—');
      } else {
        conteudoModal = 'Última atualização registrada no Genesis:\n' + (incident.ultimaAtGenesis || '—');
      }
      var cid = h('div', { style: { whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace,monospace', fontSize: '12px', maxHeight: '60vh', overflowY: 'auto', padding: '12px', lineHeight: '1.6', background: 'var(--trj-card2)', borderRadius: '8px' }, text: conteudoModal });
      U.openModal((estado === 'acionamento' ? 'Acionamento' : 'Último Update') + ' — ' + ((m && m.osNumero) || incident.enderecoId || ''), cid);
    }

    if (estado === 'sem') {
      return h('span', {
        style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px' },
        title: 'Sem atualização'
      }, [h('span', { class: 'trj-pulse-dot' })]);
    }

    var previewHover = (textoCompleto || '')
      .replace(/^\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s+-?\s*/, '')
      .trim().slice(0, 120);

    if (estado === 'acionamento') {
      var btnAc = h('button', {
        class: 'trj-btn',
        style: { background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--trj-primary)', opacity: '0.85' },
        title: previewHover || 'Verificando acionamento',
        onclick: abrirModal
      }, [h('span', { html: ICONE_FOLHA_SVG })]);
      return btnAc;
    }

    if (estado === 'antigo') {
      var dtLabel = '';
      if (resultado.dt) {
        var ontem = new Date(); ontem.setDate(ontem.getDate()-1);
        var ehOntem = resultado.dt.getDate()===ontem.getDate() && resultado.dt.getMonth()===ontem.getMonth();
        dtLabel = ehOntem ? 'ontem' : (resultado.dt.getDate()+'/'+(resultado.dt.getMonth()+1));
      }
      var btnAnt = h('button', {
        class: 'trj-btn',
        style: { background:'transparent', border:'none', padding:'2px 4px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'3px', color:'var(--trj-muted)', opacity:'0.8' },
        title: (previewHover||'') + (dtLabel?' ('+dtLabel+')':''),
        onclick: abrirModal
      }, [
        h('span', { html: ICONE_FOLHA_SVG }),
        dtLabel ? h('span', { style:{fontSize:'9px',fontWeight:'700',background:'rgba(240,180,41,.2)',color:'#f0b429',borderRadius:'3px',padding:'1px 3px',lineHeight:'1.3'}, text: dtLabel }) : null
      ].filter(Boolean));
      return btnAnt;
    }

    return h('button', {
      class: 'trj-btn',
      style: { background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--trj-green)', opacity: '0.85' },
      title: previewHover,
      onclick: abrirModal
    }, [h('span', { html: ICONE_FOLHA_SVG })]);
  };

  U.devFooter = function () {
    function pessoa(role, name, email, cor) {
      return h('div', { style: { display:'inline-flex', alignItems:'center', gap:'6px', flexWrap:'wrap', justifyContent:'center' } }, [
        h('span', { style:{ color:cor, fontWeight:'600', fontSize:'10px' }, text: role + ':' }),
        h('span', { style:{ fontSize:'10px', color:'var(--trj-muted)' }, text: name }),
        h('a', { href:'mailto:'+email, style:{ fontSize:'10px', color:'var(--trj-muted)', opacity:'.7', textDecoration:'none' }, text:'<'+email+'>' })
      ]);
    }
    return h('div', {
      style: { marginTop:'28px', paddingTop:'10px', borderTop:'1px solid var(--trj-border)', textAlign:'center', color:'var(--trj-muted)', fontSize:'10px', opacity:'.65', lineHeight:'1.7' }
    }, [
      h('div', { style:{marginBottom:'3px', fontWeight:'600', letterSpacing:'.04em', fontSize:'10px', textTransform:'uppercase', opacity:'.8' }, text:'Equipe de Desenvolvimento' }),
      h('div', { style:{display:'flex', gap:'14px', justifyContent:'center', flexWrap:'wrap'} }, [
        pessoa('Dev', 'Lucas Infante', 'lucas.esao7751@gmail.com', 'var(--trj-primary)'),
        pessoa('Idealizador', 'Bruno Augusto', 'bruno.augusto.bafs@gmail.com', 'var(--trj-blue)')
      ]),
      h('div', { style:{marginTop:'3px', fontSize:'9px', opacity:'.6'}, text:'Controle operacional TIM · TLP' })
    ]);
  };

})(window.TRJ = window.TRJ || {});
