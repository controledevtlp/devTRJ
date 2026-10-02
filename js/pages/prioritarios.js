/* =====================================================================
 * Página: Prioritários
 * =====================================================================
 * Botões-categoria com drilldown.
 * Melhorias nesta versão:
 *  • Filtra apenas INICIADO e NÃO INICIADO (exclui PENDENTE)
 *  • Usa o maior sequenciaId (col C) para pegar o status mais recente,
 *    igual à lógica do dashboard
 *  • Botão 📋 Copiar em cada categoria, separado por região
 *  • Backbone usa "LONGA DISTANCIA" (sem "BACKBONE")
 *  • B2B: DJ contém "PREMIUM" OU BG contém "B2B-TIM"/"tracking_corporativo"/"PREMIUM"
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants;
  var LS_CONC = 'trj_concentradores';

  // ── helpers ──────────────────────────────────────────────────────────
  function up(s) { return (s || '').toString().trim().toUpperCase(); }

  // Apenas INICIADO e NÃO INICIADO (igual ao backlog do dashboard — sem PENDENTE)
  function ehBacklogValido(t) {
    var s = up(t.status);
    return s === 'NÃO INICIADO' || s === 'NAO INICIADO' || s === 'INICIADO';
  }
  function ehCorretiva(t) {
    return (t.tipoAtividade || '').toLowerCase().indexOf('corretiva') >= 0;
  }

  // Usa o maior sequenciaId para garantir o status mais recente (igual ao dashboard)
  // allTasks = todas as tarefas enriquecidas (sem filtro de status ainda)
  function maisRecentePorTSK(tasks) {
    var mapa = {};
    tasks.forEach(function (t) {
      var tsk = t.osNumero || '';
      if (!tsk) return;
      var atual = mapa[tsk];
      var seq = Number(t.sequenciaId) || 0;
      if (!atual || seq > (Number(atual.sequenciaId) || 0)) mapa[tsk] = t;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; });
  }

  function ehB2B(t) {
    var dj = up(t.isocDJ || '');
    var bg = up(t.motivoCancelamento || '');
    return dj.indexOf('PREMIUM') >= 0 ||
           bg.indexOf('B2B - TIM') >= 0 ||
           bg.indexOf('TRACKING_CORPORATIVO') >= 0 ||
           bg.indexOf('PREMIUM') >= 0;
  }
  function ehBackboneLD(t) {
    return up(t.motivoCancelamento || '').indexOf('LONGA DISTANCIA') >= 0;
  }

  function carregarConc() {
    try { return JSON.parse(localStorage.getItem(LS_CONC) || '[]') || []; }
    catch (e) { return []; }
  }
  function salvarConc(l) {
    try { localStorage.setItem(LS_CONC, JSON.stringify(l)); } catch (e) {}
  }

  // ── ícone folha ──────────────────────────────────────────────────────
  var FOLHA = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

  // ── ícones SVG das categorias ─────────────────────────────────────────
  var ICO_B2B = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>';
  var ICO_BACKBONE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
  var ICO_CONC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="M12 6v6M12 12 4 17M12 12l8 5"/></svg>';

  // ── bgCell: ícone de update (igual ao ultimoUpdateCell do dashboard) ──
  // Não mostra prévia do texto — só ícone com tooltip. Clicar abre modal.
  var ICONE_FOLHA_PRIO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 5.25-8 5.25S17 5 17 8z"/></svg>';
  function bgCell(t) {
    var bg = t.motivoCancelamento || '';
    // Sem BG: ponto pulsante vermelho
    if (!bg.trim() || !U.classificarUltimoBloco) {
      return U.h('span', {
        style: { display:'inline-flex', alignItems:'center', justifyContent:'center', width:'28px' },
        title: 'Sem atualização'
      }, [U.h('span', { class: 'trj-pulse-dot' })]);
    }
    var resultado = U.classificarUltimoBloco(bg);
    var estado = resultado.estado;

    function abrirModal(ev) {
      ev.stopPropagation();
      var dois = U.extrairDoisBlocosBG ? U.extrairDoisBlocosBG(bg) : [];
      var conteudo = dois.length > 1
        ? '── Último ──\n\n' + dois[0] + '\n\n── Penúltimo ──\n\n' + dois[1]
        : (dois[0] || bg || '—');
      var el = U.h('div', { style: { whiteSpace:'pre-wrap', fontFamily:'ui-monospace,monospace', fontSize:'12px', maxHeight:'60vh', overflowY:'auto', padding:'12px', lineHeight:'1.6', background:'var(--trj-card2)', borderRadius:'8px' }, text: conteudo });
      U.openModal('Último Update — ' + (t.osNumero || ''), el);
    }

    // Tooltip: texto do bloco mais recente sem o timestamp no início
    var preview = (resultado.texto || '').replace(/^\d{1,2}[\/-]\d{1,2}[\/-]?\d{0,4}\s*\d{1,2}:\d{2}(?::\d{2})?\s*-?\s*/, '').trim().slice(0, 120);

    if (estado === 'sem') {
      return U.h('span', {
        style: { display:'inline-flex', alignItems:'center', justifyContent:'center', width:'28px' },
        title: 'Sem atualização do técnico'
      }, [U.h('span', { class: 'trj-pulse-dot' })]);
    }
    if (estado === 'acionamento') {
      return U.h('button', {
        class: 'trj-btn', style: { background:'transparent', border:'none', padding:'2px 4px', cursor:'pointer', display:'inline-flex', alignItems:'center', color:'var(--trj-primary)' },
        title: preview || 'Verificando acionamento', onclick: abrirModal
      }, [U.h('span', { html: ICONE_FOLHA_PRIO })]);
    }
    if (estado === 'antigo') {
      var dtLabel = '';
      if (resultado.dt) {
        var ontem = new Date(); ontem.setDate(ontem.getDate()-1);
        var ehOntem = resultado.dt.getDate()===ontem.getDate() && resultado.dt.getMonth()===ontem.getMonth();
        dtLabel = ehOntem ? 'ontem' : (resultado.dt.getDate()+'/'+(resultado.dt.getMonth()+1));
      }
      return U.h('button', {
        class: 'trj-btn', style: { background:'transparent', border:'none', padding:'2px 4px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'3px', color:'var(--trj-muted)' },
        title: preview + (dtLabel?' ('+dtLabel+')':''), onclick: abrirModal
      }, [
        U.h('span', { html: ICONE_FOLHA_PRIO }),
        dtLabel ? U.h('span', { style:{fontSize:'9px',fontWeight:'700',background:'rgba(240,180,41,.2)',color:'#f0b429',borderRadius:'3px',padding:'1px 3px'}, text: dtLabel }) : null
      ].filter(Boolean));
    }
    // ok — folha verde
    return U.h('button', {
      class: 'trj-btn', style: { background:'transparent', border:'none', padding:'2px 4px', cursor:'pointer', display:'inline-flex', alignItems:'center', color:'var(--trj-green)' },
      title: preview, onclick: abrirModal
    }, [U.h('span', { html: ICONE_FOLHA_PRIO })]);
  }

  // ── status badge ─────────────────────────────────────────────────────
  function statusBadge(s) {
    var u = up(s), cor = '#9aa5b1', bg = 'rgba(154,165,177,.15)', lbl = s || '—';
    if (u === 'INICIADO')                                   { cor = '#1fae5e'; bg = 'rgba(46,204,113,.2)'; }
    else if (u === 'NÃO INICIADO' || u === 'NAO INICIADO') { cor = '#f0b429'; bg = 'rgba(240,180,41,.25)'; lbl = 'NÃO INIC.'; }
    return U.h('span', { class: 'trj-badge', style: { background: bg, color: cor, fontWeight: '700', fontSize: '10px' }, text: lbl });
  }

  // ── copiar texto para clipboard ──────────────────────────────────────
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt)
        .then(function () { U.toast('✓ Copiado!', 'ok'); })
        .catch(function () { _fb(txt); });
    } else { _fb(txt); }
    function _fb(s) {
      var ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); U.toast('✓ Copiado!', 'ok'); }
      catch (e) { U.toast('Não foi possível copiar.', 'err'); }
      document.body.removeChild(ta);
    }
  }

  // ── gerar texto de cópia de uma lista de tarefas (por região) ────────
  function gerarTextoCopia(rows, titulo) {
    if (!rows.length) return titulo + '\n(nenhum resultado)';
    var regioesMapa = {};
    rows.forEach(function (t) {
      var r = t.regiao || 'OTHERS';
      if (!regioesMapa[r]) regioesMapa[r] = [];
      regioesMapa[r].push(t);
    });
    var linhas = ['*' + titulo.toUpperCase() + '*', ''];
    Object.keys(regioesMapa).sort().forEach(function (r) {
      var regLabel = (C.REGIAO_LABELS[r] || r).toUpperCase();
      linhas.push('*' + regLabel + '*');
      regioesMapa[r].forEach(function (t) {
        var prio  = t.prioridade ? '*' + t.prioridade + '* ' : '';
        var tsk   = t.osNumero || '—';
        var site  = t.siteId || t.enderecoId || '—';
        var end   = t.enderecoId || '';
        var fila  = (t.filaAtual || '').replace(/^TLP-T\d+(-\d+)?-?\s*/i, '').slice(0, 30);
        var bgUpd = '';
        if (U.classificarUltimoBloco && t.motivoCancelamento) {
          var resUpd = U.classificarUltimoBloco(t.motivoCancelamento);
          if (resUpd.estado === 'sem') {
            bgUpd = ' · SEM UPDATE';
          } else if (resUpd.estado === 'acionamento') {
            bgUpd = ' · VERIFICANDO ACIONAMENTO';
          } else if (resUpd.texto) {
            bgUpd = ' · ' + resUpd.texto.replace(/^\d[\d\/\-:\s]{5,20}-?\s*/, '').trim().slice(0, 50);
          }
        }
        linhas.push(prio + tsk + ' / ' + site + (end && end !== site ? ' / ' + end : '') + (fila ? ' · ' + fila : '') + bgUpd);
      });
      linhas.push('');
    });
    return linhas.join('\n').trim();
  }

  // ── gerar texto de cópia para concentradores ─────────────────────────
  function gerarTextoCopiaConc(matches) {
    if (!matches.length) return '*CONCENTRADORES*\n(nenhum alerta ativo)';
    var linhas = ['*CONCENTRADORES — ALERTAS ATIVOS*', ''];
    var tarefas = matches.filter(function (m) { return m.tipo === 'task'; });
    var incids  = matches.filter(function (m) { return m.tipo === 'incident'; });
    if (tarefas.length) {
      linhas.push('📋 *TAREFAS ABERTAS*');
      var rmap = {};
      tarefas.forEach(function (m) {
        var r = m.data.regiao || 'OTHERS';
        if (!rmap[r]) rmap[r] = [];
        rmap[r].push(m);
      });
      Object.keys(rmap).sort().forEach(function (r) {
        linhas.push('*' + (C.REGIAO_LABELS[r] || r).toUpperCase() + '*');
        rmap[r].forEach(function (m) {
          var t = m.data;
          var prio = t.prioridade ? '*' + t.prioridade + '* ' : '';
          linhas.push(prio + (t.osNumero || '—') + ' / ' + (t.siteId || t.enderecoId || '—') + ' · 📝 ' + (m.conc.nota || '—'));
        });
        linhas.push('');
      });
    }
    if (incids.length) {
      linhas.push('🚨 *SITES FORA*');
      incids.forEach(function (m) {
        var i = m.data;
        linhas.push((i.horario || '—') + ' · ' + (i.site || '—') + ' / ' + (i.enderecoId || '—') + ' · 📝 ' + (m.conc.nota || '—'));
      });
    }
    return linhas.join('\n').trim();
  }

  // ── tabela de tarefas prioritárias ────────────────────────────────────
  function tabelaTarefas(rows, opts) {
    opts = opts || {};
    if (!rows.length) {
      return U.h('p', { style: { color: 'var(--trj-muted)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }, text: opts.vazio || 'Nenhum resultado.' });
    }
    var thead = U.h('thead', null, U.h('tr', null,
      ['Status', 'TSK', 'NE / Site', 'END_ID', 'Falha', 'Fila Atual', 'ÚLTIMO UPDATE']
        .map(function (t) { return U.h('th', { text: t }); })));
    var tbody = U.h('tbody', null, rows.map(function (t) {
      return U.h('tr', null, [
        U.h('td', null, statusBadge(t.status)),
        U.h('td', null, U.h('span', { style: { fontFamily: 'ui-monospace,monospace', fontWeight: '700', fontSize: '12px', color: 'var(--trj-primary)' }, text: t.osNumero || '—' })),
        U.h('td', { text: t.siteId || t.enderecoId || '—', style: { maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        U.h('td', { text: t.enderecoId || '—', style: { fontFamily: 'ui-monospace,monospace', fontSize: '11px' } }),
        U.h('td', { text: t.tipoFalha || '—', style: { maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        U.h('td', { text: (t.filaAtual || '—').slice(0, 45), style: { fontSize: '11px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        U.h('td', null, bgCell(t))
      ]);
    }));
    return U.h('div', { style: { overflowX: 'auto' } }, U.h('table', { class: 'trj-table' }, [thead, tbody]));
  }

  // ── tabela de concentradores ──────────────────────────────────────────
  function tabelaConcentradores(matches) {
    if (!matches.length) {
      return U.h('p', { style: { color: 'var(--trj-muted)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }, text: 'Nenhum concentrador com alerta ativo no momento.' });
    }
    var tarefas = matches.filter(function (m) { return m.tipo === 'task'; });
    var incids  = matches.filter(function (m) { return m.tipo === 'incident'; });
    var sections = [];
    if (tarefas.length) {
      var thead = U.h('thead', null, U.h('tr', null,
        ['Status', 'TSK', 'NE / Site', 'END_ID', 'Falha', 'Fila Atual', 'ÚLTIMO UPDATE', 'Anotação']
          .map(function (h) { return U.h('th', { text: h }); })));
      var tbody = U.h('tbody', null, tarefas.map(function (m) {
        var t = m.data;
        return U.h('tr', { style: { borderLeft: '3px solid #9b59b6' } }, [
          U.h('td', null, statusBadge(t.status)),
          U.h('td', null, U.h('span', { style: { fontFamily: 'ui-monospace,monospace', fontWeight: '700', fontSize: '12px', color: 'var(--trj-primary)' }, text: t.osNumero || '—' })),
          U.h('td', { text: t.siteId || t.enderecoId || '—' }),
          U.h('td', { text: t.enderecoId || '—', style: { fontFamily: 'ui-monospace,monospace', fontSize: '11px' } }),
          U.h('td', { text: t.tipoFalha || '—' }),
          U.h('td', { text: (t.filaAtual || '—').slice(0, 40), style: { fontSize: '11px' } }),
          U.h('td', null, bgCell(t)),
          U.h('td', { style: { color: '#9b59b6', fontStyle: 'italic', fontSize: '11px' }, text: m.conc.nota || '—' })
        ]);
      }));
      sections.push(U.h('div', { style: { marginBottom: '16px' } }, [
        U.h('p', { style: { fontSize: '12px', fontWeight: '700', color: '#9b59b6', marginBottom: '6px' }, text: '📋 Tarefas abertas (' + tarefas.length + ')' }),
        U.h('div', { style: { overflowX: 'auto' } }, U.h('table', { class: 'trj-table' }, [thead, tbody]))
      ]));
    }
    if (incids.length) {
      var thead2 = U.h('thead', null, U.h('tr', null,
        ['Horário', 'Site', 'END_ID', 'Causa', 'Cidade', 'Duração', 'Anotação']
          .map(function (h) { return U.h('th', { text: h }); })));
      var tbody2 = U.h('tbody', null, incids.map(function (m) {
        var i = m.data;
        return U.h('tr', { style: { borderLeft: '3px solid #e74c3c' } }, [
          U.h('td', { text: i.horario || '—' }),
          U.h('td', { text: i.site || '—', style: { fontWeight: '700' } }),
          U.h('td', { text: i.enderecoId || '—', style: { fontFamily: 'ui-monospace,monospace', fontSize: '11px' } }),
          U.h('td', { text: i.causa || '/', style: { maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
          U.h('td', { text: i.cidadeUf || '—' }),
          U.h('td', { text: i.downtime || i.duracao || '—' }),
          U.h('td', { style: { color: '#9b59b6', fontStyle: 'italic', fontSize: '11px' }, text: m.conc.nota || '—' })
        ]);
      }));
      sections.push(U.h('div', null, [
        U.h('p', { style: { fontSize: '12px', fontWeight: '700', color: '#e74c3c', marginBottom: '6px' }, text: '🚨 Sites Fora (Incidentes) (' + incids.length + ')' }),
        U.h('div', { style: { overflowX: 'auto' } }, U.h('table', { class: 'trj-table' }, [thead2, tbody2]))
      ]));
    }
    return U.h('div', null, sections);
  }

  // ── formulário de cadastro ────────────────────────────────────────────
  function formConcentradores(onSalvar) {
    var inpSite = U.h('input', { class: 'trj-input', placeholder: 'Site (ex.: RJBT40)', style: { flex: '1', minWidth: '120px' } });
    var inpEnd  = U.h('input', { class: 'trj-input', placeholder: 'END_ID (ex.: RJRJO_0143)', style: { flex: '1', minWidth: '140px' } });
    var inpNota = U.h('input', { class: 'trj-input', placeholder: 'Anotação (ex.: Hub principal)', style: { flex: '2', minWidth: '200px' } });
    var btnAdd  = U.h('button', {
      class: 'trj-btn trj-btn-primary clickable', html: '+ Cadastrar',
      onclick: function () {
        var s = (inpSite.value || '').trim(), e = (inpEnd.value || '').trim(), n = (inpNota.value || '').trim();
        if (!s && !e) { U.toast('Informe ao menos o Site ou END_ID.', 'err'); return; }
        var lista = carregarConc();
        lista.push({ id: Date.now(), site: s, endId: e, nota: n });
        salvarConc(lista); inpSite.value = ''; inpEnd.value = ''; inpNota.value = '';
        U.toast('Concentrador cadastrado.', 'ok'); onSalvar();
      }
    });
    return U.h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '12px', background: 'var(--trj-card2)', borderRadius: '8px', marginBottom: '12px' } },
      [inpSite, inpEnd, inpNota, btnAdd]);
  }

  function listaConcentradores(lista, onRemover) {
    if (!lista.length) return U.h('p', { style: { color: 'var(--trj-muted)', fontSize: '12px', fontStyle: 'italic' }, text: 'Nenhum concentrador cadastrado. Use o formulário acima.' });
    return U.h('div', { style: { marginBottom: '12px' } }, lista.map(function (c) {
      return U.h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--trj-border)', fontSize: '12px', flexWrap: 'wrap' } }, [
        U.h('span', { style: { fontFamily: 'ui-monospace,monospace', fontWeight: '700', minWidth: '80px' }, text: c.site || '—' }),
        U.h('span', { style: { color: 'var(--trj-muted)', minWidth: '120px' }, text: c.endId || '—' }),
        U.h('span', { style: { color: 'var(--trj-muted)', fontStyle: 'italic', flex: '1' }, text: c.nota || '' }),
        U.h('button', {
          class: 'trj-btn trj-btn-ghost clickable',
          style: { fontSize: '10px', padding: '1px 6px', color: '#e74c3c', marginLeft: 'auto' },
          text: '✕ Remover',
          onclick: function () { salvarConc(carregarConc().filter(function (x) { return x.id !== c.id; })); onRemover(); }
        })
      ]);
    }));
  }

  // ── botão categoria ───────────────────────────────────────────────────
  function btnCategoria(opts) {
    return U.h('button', {
      class: 'trj-btn clickable',
      style: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: '700',
        background: opts.ativo ? opts.cor : 'var(--trj-card2)',
        color: opts.ativo ? '#fff' : opts.cor,
        border: '2px solid ' + opts.cor,
        boxShadow: opts.ativo ? ('0 4px 18px ' + opts.cor + '55') : 'none',
        transition: 'all .2s ease', transform: opts.ativo ? 'translateY(-2px)' : '',
        minWidth: '220px', position: 'relative'
      },
      onclick: opts.onclick
    }, [
      opts.icon ? U.h('span', { style: { display: 'inline-flex', alignItems: 'center', flexShrink: '0' }, html: opts.icon }) : null,
      U.h('div', { style: { textAlign: 'left' } }, [
        U.h('div', { text: opts.label }),
        U.h('div', { style: { fontSize: '11px', fontWeight: '400', opacity: '0.85' }, text: opts.count + ' tarefa(s) em aberto' })
      ]),
      opts.count > 0 ? U.h('span', {
        style: { position: 'absolute', top: '6px', right: '8px', background: opts.ativo ? 'rgba(255,255,255,.3)' : opts.cor, color: '#fff', borderRadius: '999px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800' },
        text: String(opts.count)
      }) : null
    ]);
  }

  // ── PÁGINA PRINCIPAL ─────────────────────────────────────────────────
  TRJ.pages.prioritarios = function (container, ctx) {
    var app  = ctx.app;
    var data = ctx.data || {};

    // Pegar o status mais recente por TSK (maior sequenciaId = col C)
    var todasCorretivas = (data.tasksEnriched || []).filter(ehCorretiva);
    var recentesPorTSK  = maisRecentePorTSK(todasCorretivas);

    // Filtrar: somente INICIADO e NÃO INICIADO
    var allTasks  = recentesPorTSK.filter(ehBacklogValido);
    var incidents = data.incidentsEnriched || [];

    var b2bTasks      = allTasks.filter(ehB2B);
    var backboneTasks = allTasks.filter(ehBackboneLD);

    function calcMatches() {
      var lista = carregarConc(), matches = [];
      lista.forEach(function (conc) {
        var key = up(conc.endId || conc.site || '');
        if (!key) return;
        allTasks.forEach(function (t) {
          var ke = up(t.enderecoId || ''), ks = up(t.siteId || '');
          if (ke === key || ks === key || (key.length > 3 && (ke.indexOf(key) >= 0 || ks.indexOf(key) >= 0)))
            matches.push({ tipo: 'task', conc: conc, data: t });
        });
        incidents.forEach(function (inc) {
          if (up(inc.statusTrat) === 'RESOLVIDO') return;
          var ke = up(inc.enderecoId || inc.endId || ''), ks = up(inc.site || '');
          if (ke === key || ks === key || (key.length > 3 && (ke.indexOf(key) >= 0 || ks.indexOf(key) >= 0)))
            matches.push({ tipo: 'incident', conc: conc, data: inc });
        });
      });
      return matches;
    }

    var concMatches = calcMatches();
    var catAtiva = { v: null };

    container.appendChild(U.pageHeader('Prioritários', 'Casos especiais em monitoramento — clique em uma categoria para ver os detalhes.'));

    var btnRow   = U.h('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px' } });
    var drillArea = U.h('div', { style: { minHeight: '120px' } });

    function setCategoria(cat) {
      catAtiva.v = cat;
      btnRow.innerHTML = ''; renderBotoes();
      drillArea.innerHTML = '';
      if (cat) drillArea.appendChild(renderDrill(cat));
    }

    function renderBotoes() {
      btnRow.appendChild(btnCategoria({ icon: ICO_B2B,      label: 'B2B / Premium',              count: b2bTasks.length,      cor: '#3498db', ativo: catAtiva.v === 'b2b',      onclick: function () { setCategoria(catAtiva.v === 'b2b'      ? null : 'b2b'); } }));
      btnRow.appendChild(btnCategoria({ icon: ICO_BACKBONE, label: 'Backbone / Longa Distância', count: backboneTasks.length,  cor: '#e74c3c', ativo: catAtiva.v === 'backbone', onclick: function () { setCategoria(catAtiva.v === 'backbone' ? null : 'backbone'); } }));
      btnRow.appendChild(btnCategoria({ icon: ICO_CONC,     label: 'Concentradores',              count: concMatches.length,   cor: '#9b59b6', ativo: catAtiva.v === 'conc',     onclick: function () { setCategoria(catAtiva.v === 'conc'     ? null : 'conc'); } }));
    }
    renderBotoes();
    container.appendChild(btnRow);
    container.appendChild(drillArea);

    function renderDrill(cat) {
      var card = U.h('div', { class: 'trj-card p-5', style: { animation: 'fadeIn .18s ease' } });

      // ── Cabeçalho com título + botão copiar ──
      function headerComCopiar(icon, titulo, cor, onCopiar) {
        var btnCopy = U.h('button', {
          class: 'trj-btn trj-btn-ghost clickable',
          style: { fontSize: '11px', padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(255,255,255,.15)', marginLeft: 'auto' },
          onclick: function () { copyText(onCopiar()); }
        }, [U.h('span', { text: '📋' }), U.h('span', { text: 'Copiar' })]);
        var icoEl = icon ? U.h('span', { style: { display: 'inline-flex', alignItems: 'center', opacity: '0.85' }, html: icon }) : null;
        return U.h('div', { class: 'flex items-center gap-2 mb-4', style: { flexWrap: 'wrap' } }, [
          icoEl,
          U.h('span', { style: { fontWeight: '800', fontSize: '16px', color: cor }, text: titulo }),
          btnCopy
        ].filter(Boolean));
      }

      if (cat === 'b2b') {
        card.appendChild(headerComCopiar('', 'B2B / Premium — ' + b2bTasks.length + ' caso(s)', '#3498db', function () { return gerarTextoCopia(b2bTasks, 'B2B / PREMIUM'); }));
        card.appendChild(tabelaTarefas(b2bTasks, { vazio: 'Nenhum caso B2B / Premium com status Iniciado ou Não Iniciado.' }));

      } else if (cat === 'backbone') {
        card.appendChild(headerComCopiar('', 'Backbone / Longa Distância — ' + backboneTasks.length + ' caso(s)', '#e74c3c', function () { return gerarTextoCopia(backboneTasks, 'BACKBONE / LONGA DISTÂNCIA'); }));
        card.appendChild(tabelaTarefas(backboneTasks, { vazio: 'Nenhuma tarefa com Longa Distância no diário.' }));

      } else if (cat === 'conc') {
        card.appendChild(headerComCopiar('', 'Concentradores — ' + concMatches.length + ' alerta(s)', '#9b59b6', function () { return gerarTextoCopiaConc(concMatches); }));
        card.appendChild(formConcentradores(function () { concMatches = calcMatches(); setCategoria('conc'); }));
        card.appendChild(listaConcentradores(carregarConc(), function () { concMatches = calcMatches(); setCategoria('conc'); }));
        if (concMatches.length > 0) {
          card.appendChild(U.h('hr', { style: { margin: '12px 0', borderColor: 'var(--trj-border)' } }));
          card.appendChild(U.h('p', { style: { fontWeight: '700', fontSize: '13px', marginBottom: '8px', color: '#9b59b6' }, text: 'Alertas ativos:' }));
          card.appendChild(tabelaConcentradores(concMatches));
        }
      }
      return card;
    }

    container.appendChild(U.h('div', { style: { marginTop: '16px', display: 'flex', justifyContent: 'flex-end' } }, [
      U.h('button', {
        class: 'trj-btn trj-btn-ghost clickable', text: '🔄 Atualizar painel',
        onclick: function () { app.refresh(true).then(function () { app.render(); }); }
      })
    ]));
  };

})(window.TRJ = window.TRJ || {});
