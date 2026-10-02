/* ============================================================
 * Página: Pesquisa Operacional
 * ============================================================ */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants;

  function norm(s) {
    if (!s) return '';
    return s.toString().trim().toUpperCase()
      .replace(/[ÁÀÂÃÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
      .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÕÖ]/g,'O')
      .replace(/[ÚÙÛÜ]/g,'U').replace(/Ç/g,'C')
      .replace(/[\t\/\\\-_.,;:()'"""]/g,' ')
      .replace(/\s{2,}/g,' ').trim();
  }

  // Palavras-chave exatas para Normalizados (lista do usuário)
  var PALAVRAS_NORM = [
    'EXTERNAL', 'ENERGIA', 'GSM BTS DOWN', 'MASSIVA ACESSO', 'PARTIAL DOWN',
    'CELL', 'ENODEB DOWN', 'ENODEB DOWN-CELL', 'COMMUNICATION FAILURE',
    'INACESSIVEL', 'EQUIPAMENTO INACESSIVEL', 'SITE FORA', 'NR GNODEB DOWN',
    'FALHA DE ENERGIA', 'RETIFICADOR', 'ENODB', 'ISOLATED NE',
    'S1 APP LINK DOWN', 'BATERIA', 'BATERIA EM DESCARGA', 'NODEB DOWN', 'DISJUNTOR'
  ];

  // DJ que EXCLUEM a task dos normalizados
  var DJ_EXCLUIR = ['PREDITIVA', 'MABE', 'ACESSO FA'];

  // Tipos de falha que NUNCA devem entrar nos normalizados
  var TIPO_FALHA_EXCLUIR_NORM = ['SISTEMA IRRADIANTE'];

  function ehValidoParaPesquisa(t) {
    if (!t) return false;
    var tipo = (t.tipoAtividade || '').toLowerCase();
    if (tipo.indexOf('corretiva') < 0) return false;
    var s = norm(t.status || '');
    return s === 'NAO INICIADO' || s === 'INICIADO';
  }

  function formatarLinha(t, extra, resumo) {
    var tsk  = t.osNumero || '—';
    var site = t.siteId || t.enderecoId || '—';
    var eid  = t.enderecoId || '';
    var prio = t.prioridade || '';
    var fila = (t.filaAtual || '').replace(/^TLP-T\d+(-\d+)?-?\s*/i,'').slice(0,35);
    if (resumo) return (prio ? '*'+prio+'* ' : '') + tsk + ' / ' + site + (eid?' ('+eid+')':'');
    var base = (prio ? '*'+prio+'* ' : '') + tsk + ' / ' + site + (eid?' ('+eid+')':'');
    if (fila) base += ' → ' + fila;
    if (extra) base += ' · ' + extra;
    return base;
  }

  function montarTexto(titulo, grupos) {
    if (!Object.keys(grupos).length) return '';
    var linhas = ['*' + titulo.toUpperCase() + '*', ''];
    C.REGIOES.concat(['SEM REGIÃO']).forEach(function (r) {
      var label = (C.REGIAO_LABELS[r] || r).toUpperCase();
      var arr = grupos[r] || grupos[label];
      if (!arr || !arr.length) return;
      linhas.push('*' + label + '*');
      arr.forEach(function (l) { linhas.push(l); });
      linhas.push('');
    });
    return linhas.join('\n').trim();
  }

  function agrupar(linhas_regioes) {
    var g = {};
    linhas_regioes.forEach(function (item) {
      var r = item.r || 'SEM REGIÃO';
      if (!g[r]) g[r] = [];
      g[r].push(item.linha);
    });
    return g;
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function(){ U.toast('✓ Copiado!','ok'); });
    } else {
      var ta = document.createElement('textarea'); ta.value = txt;
      ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); U.toast('✓ Copiado!','ok'); } catch(e){}
      document.body.removeChild(ta);
    }
  }

  function btnCopiar(getTexto) {
    return U.h('button', {
      class:'trj-btn trj-btn-ghost clickable',
      style:{ fontSize:'12px', padding:'4px 12px', display:'inline-flex', alignItems:'center', gap:'5px', border:'1px solid rgba(255,255,255,.15)' },
      onclick: function() {
        var txt = getTexto();
        if (!txt) { U.toast('Nenhum resultado para copiar.','err'); return; }
        copyText(txt);
      }
    }, [U.h('span',{text:'📋'}), U.h('span',{text:'Copiar'})]);
  }

  function statusBadge(s) {
    var u = norm(s);
    var cor = u==='INICIADO' ? '#2ecc71' : '#f0b429';
    var bg  = u==='INICIADO' ? 'rgba(46,204,113,.18)' : 'rgba(240,180,41,.22)';
    return U.h('span',{class:'trj-badge',style:{background:bg,color:cor,fontWeight:'700',fontSize:'10px'},text:s||'—'});
  }

  function vazio(msg) {
    return U.h('p',{style:{color:'var(--trj-muted)',fontSize:'13px',fontStyle:'italic',textAlign:'center',padding:'24px 0'},text: msg || 'Nenhum resultado.'});
  }

  function tabelaResultados(rows, colunas) {
    if (!rows.length) return vazio();
    var thead = U.h('thead', null, U.h('tr', null, colunas.map(function(c){ return U.h('th',{text:c}); })));
    var tbody = U.h('tbody', null, rows.map(function(r){
      return U.h('tr', null, r.map(function(cel){
        if (cel && typeof cel === 'object' && cel.nodeType) return U.h('td',null,cel);
        return U.h('td',{text: cel==null?'—':String(cel), style:{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}});
      }));
    }));
    return U.h('div',{style:{overflowX:'auto'}}, U.h('table',{class:'trj-table'},[thead,tbody]));
  }

  /* ── calcular status do update (usa a mesma lógica do dashboard) ── */
  function calcUpdateStatus(bg) {
    if (!bg || !bg.trim()) return 'sem';
    if (U.classificarUltimoBloco) {
      var res = U.classificarUltimoBloco(bg);
      return res.estado; // 'ok', 'antigo', 'acionamento', 'sem'
    }
    if (U.isTextoSemAtualizacao && U.isTextoSemAtualizacao(bg)) return 'sem';
    return 'ok';
  }

  function updateIconeTexto(estado) {
    if (estado === 'ok')          return '🟢 Hoje';
    if (estado === 'antigo')      return '🟡 Anterior';
    if (estado === 'acionamento') return '🟠 Acionamento';
    return '🔴 Sem update';
  }

  /* ── filtros de região e prioridade (helper) ── */
  function mkFiltroSel(label, options) {
    var sel = U.h('select', {
      class:'trj-select',
      style:{fontSize:'12px', padding:'3px 10px', minWidth:'130px'}
    }, options.map(function(o){ return U.h('option',{value:o.v,text:o.t}); }));
    return sel;
  }

  function opcoesRegiao() {
    return [{ v:'TODAS', t:'Todas as regiões' }]
      .concat(C.REGIOES.filter(function(r){ return r !== 'OTHERS'; })
              .map(function(r){ return { v:r, t:C.REGIAO_LABELS[r]||r }; }));
  }
  function opcoesPrio() {
    return [{ v:'TODAS', t:'Todas as prioridades' }]
      .concat(['P1','P2','P3','P4','P5'].map(function(p){ return { v:p, t:p }; }));
  }

  /* ══════════════════════════════════════════════════════════════════
   * PÁGINA PRINCIPAL
   * ══════════════════════════════════════════════════════════════════ */
  TRJ.pages.pesquisa = function(container, ctx) {
    var data  = ctx.data || {};
    var tasks = data.tasksEnriched || [];
    var incs  = data.incidentsEnriched || [];

    var eidsAtivos = {};
    incs.forEach(function(i) {
      if ((i.statusTrat||'ATIVO').toUpperCase() !== 'RESOLVIDO') {
        eidsAtivos[(i.enderecoId||i.endId||'').trim()] = i;
      }
    });

    container.appendChild(U.pageHeader('Pesquisa Operacional',
      'Pesquisa por campo · TSKs sem atualização · Possíveis normalizados'));

    var modoAtivo = { v: 'palavra' };
    var tabContent = U.h('div', { style:{ marginTop:'16px' } });
    var TABS = [
      { id:'palavra',  label:'Pesquisa por Campo' },
      { id:'pendente', label:'TSKs Sem Atualização' },
      { id:'norm',     label:'Possíveis Normalizados' },
    ];
    var tabBtns = {};
    var tabRow = U.h('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'0' } });
    TABS.forEach(function(tab) {
      var btn = U.h('button', {
        class:'trj-btn clickable',
        style:{ padding:'8px 18px', fontSize:'13px', fontWeight:'600',
                borderRadius:'10px 10px 0 0', border:'1px solid var(--trj-border)',
                borderBottom:'none', background: tab.id===modoAtivo.v ? 'var(--trj-card)' : 'var(--trj-card2)',
                color: tab.id===modoAtivo.v ? 'var(--trj-primary)' : 'var(--trj-muted)',
                transition:'all .15s' },
        onclick: function() {
          modoAtivo.v = tab.id;
          Object.keys(tabBtns).forEach(function(id){
            var isA = id === tab.id;
            tabBtns[id].style.background = isA ? 'var(--trj-card)' : 'var(--trj-card2)';
            tabBtns[id].style.color      = isA ? 'var(--trj-primary)' : 'var(--trj-muted)';
          });
          renderModo();
        }
      }, [U.h('span',{text: tab.label})]);
      tabBtns[tab.id] = btn;
      tabRow.appendChild(btn);
    });
    container.appendChild(tabRow);
    var card = U.h('div', { class:'trj-card p-5', style:{ borderRadius:'0 10px 10px 10px' } });
    card.appendChild(tabContent);
    container.appendChild(card);

    /* ════════════════════════════════════════════════════════════
     * MODO 1 — PESQUISA POR CAMPO
     * ════════════════════════════════════════════════════════════ */
    function renderPalavra() {
      tabContent.innerHTML = '';
      var campoAtivo = { v: 'bg' };
      var CAMPOS = [
        { id:'bg',    label:'Diário (BG)',  fn: function(t,q){ return t.motivoCancelamento && norm(t.motivoCancelamento).indexOf(norm(q)) >= 0; } },
        { id:'endid', label:'END_ID',       fn: function(t,q){ return norm(t.enderecoId||'').indexOf(norm(q)) >= 0; } },
        { id:'site',  label:'Site',         fn: function(t,q){ return norm(t.siteId||'').indexOf(norm(q)) >= 0; } },
        { id:'tsk',   label:'TSK',          fn: function(t,q){ return norm(t.osNumero||'').indexOf(norm(q)) >= 0; } },
        { id:'falha', label:'Tipo de Falha',fn: function(t,q){ return norm(t.tipoFalha||'').indexOf(norm(q)) >= 0; } },
      ];
      // Botões de opção de campo
      var campoBtns = {};
      var campoRow = U.h('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' } });
      CAMPOS.forEach(function(c) {
        var b = U.h('button', {
          class:'trj-btn trj-btn-ghost clickable',
          style:{ fontSize:'11px', padding:'3px 12px',
                  background: c.id===campoAtivo.v ? 'rgba(255,140,0,.18)' : '',
                  borderColor: c.id===campoAtivo.v ? 'var(--trj-primary)' : '' },
          onclick: function() {
            campoAtivo.v = c.id;
            Object.keys(campoBtns).forEach(function(id){
              campoBtns[id].style.background   = id===c.id ? 'rgba(255,140,0,.18)' : '';
              campoBtns[id].style.borderColor   = id===c.id ? 'var(--trj-primary)' : '';
            });
            buscar();
          }
        }, c.label);
        campoBtns[c.id] = b;
        campoRow.appendChild(b);
      });
      tabContent.appendChild(campoRow);

      var searchInput = U.h('input', {
        class:'trj-input',
        placeholder:'Digite o valor para buscar...',
        style:{ fontSize:'13px', width:'100%', marginBottom:'10px' }
      });
      var resultArea = U.h('div');
      var textoAtual = '';
      var ctrlRow = U.h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'14px', flexWrap:'wrap' } }, [
        btnCopiar(function(){ return textoAtual; })
      ]);
      tabContent.appendChild(searchInput);
      tabContent.appendChild(ctrlRow);
      tabContent.appendChild(resultArea);
      searchInput.focus();

      var timer = null;
      searchInput.addEventListener('input', function() { clearTimeout(timer); timer = setTimeout(buscar, 300); });
      searchInput.addEventListener('keydown', function(e){ if(e.key==='Enter') buscar(); });

      function buscar() {
        var q = searchInput.value.trim();
        resultArea.innerHTML = '';
        if (!q) return;
        var campo = CAMPOS.filter(function(c){ return c.id === campoAtivo.v; })[0];
        if (!campo) return;
        // Para campos não-BG, busca em TODAS as Corretivas (não só abertas)
        var pool = campo.id === 'bg' ? tasks.filter(ehValidoParaPesquisa) : tasks.filter(function(t){
          return (t.tipoAtividade||'').toLowerCase().indexOf('corretiva') >= 0;
        });
        var resultados = pool.filter(function(t){ return campo.fn(t, q); });
        if (!resultados.length) { resultArea.appendChild(vazio('Nenhum resultado para "' + q + '"')); textoAtual = ''; return; }
        var grupos = agrupar(resultados.map(function(item) {
          return { r: item.regiao || 'SEM REGIÃO', linha: formatarLinha(item, null, true) };
        }));
        textoAtual = montarTexto('PESQUISA: ' + q, grupos);
        var rows = resultados.map(function(t) {
          var reg = (C.REGIAO_LABELS[t.regiao]||t.regiao||'SEM REGIÃO').toUpperCase();
          var estado = calcUpdateStatus(t.motivoCancelamento||'');
          return [reg, statusBadge(t.status), t.osNumero, t.siteId||'—', t.enderecoId||'—', t.tipoFalha||'—', updateIconeTexto(estado)];
        });
        resultArea.appendChild(U.h('div',{style:{fontWeight:'600',fontSize:'13px',marginBottom:'8px'},text:resultados.length+' resultado(s) para "'+q+'"'}));
        resultArea.appendChild(tabelaResultados(rows, ['Região','Status','TSK','Site','END_ID','Falha','Último Update']));
      }
    }

    /* ════════════════════════════════════════════════════════════
     * MODO 2 — TSKs SEM ATUALIZAÇÃO (com filtros região + prioridade)
     * ════════════════════════════════════════════════════════════ */
    function renderPendente() {
      tabContent.innerHTML = '';
      var filtroUpd = U.h('select', { class:'trj-select', style:{ fontSize:'12px', padding:'3px 10px', minWidth:'200px' } }, [
        U.h('option',{value:'sem', text:'Sem qualquer atualização'}),
        U.h('option',{value:'antigo', text:'Atualização não de hoje'}),
        U.h('option',{value:'todos', text:'Todas as abertas'}),
      ]);
      var selReg  = mkFiltroSel('Região',     opcoesRegiao());
      var selPrio = mkFiltroSel('Prioridade', opcoesPrio());
      var resultArea = U.h('div', { style:{ marginTop:'14px' } });
      var textoAtual = '';
      var ctrlRow = U.h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px', flexWrap:'wrap' } }, [
        filtroUpd, selReg, selPrio, btnCopiar(function(){ return textoAtual; })
      ]);
      tabContent.appendChild(ctrlRow);
      tabContent.appendChild(resultArea);
      function renderLista() {
        resultArea.innerHTML = '';
        var filtro = filtroUpd.value;
        var regFiltro  = selReg.value;
        var prioFiltro = selPrio.value;
        var validas = tasks.filter(ehValidoParaPesquisa).filter(function(t){
          if (regFiltro  !== 'TODAS' && (t.regiao    ||'OTHERS') !== regFiltro)  return false;
          if (prioFiltro !== 'TODAS' && (t.prioridade||'')       !== prioFiltro) return false;
          return true;
        });
        var resultados = [];
        validas.forEach(function(t) {
          var estado = calcUpdateStatus(t.motivoCancelamento || '');
          var incluir = (filtro==='todos') ||
                        (filtro==='sem'    && estado==='sem') ||
                        (filtro==='antigo' && (estado==='sem' || estado==='antigo'));
          if (!incluir) return;
          resultados.push({ r: t.regiao||'SEM REGIÃO', t: t, estado: estado });
        });
        resultados.sort(function(a,b){
          var ri=C.REGIOES||[];
          var ar=ri.indexOf(a.r), br2=ri.indexOf(b.r); if(ar!==br2) return ar-br2;
          var pa=parseInt((a.t.prioridade||'P9').replace(/\D/g,''),10)||9;
          var pb=parseInt((b.t.prioridade||'P9').replace(/\D/g,''),10)||9;
          return pa-pb;
        });
        if (!resultados.length) { resultArea.appendChild(vazio('Nenhuma TSK encontrada.')); textoAtual=''; return; }
        var grupos = agrupar(resultados.map(function(item){ return { r:item.r, linha:formatarLinha(item.t,null,true) }; }));
        textoAtual = montarTexto('TSKs '+(filtro==='sem'?'SEM ATUALIZAÇÃO':filtro==='antigo'?'SEM UPDATE HOJE':'ABERTAS'), grupos);
        var rows = resultados.map(function(item){
          var t=item.t, reg=(C.REGIAO_LABELS[item.r]||item.r||'SEM REGIÃO').toUpperCase();
          return [reg, statusBadge(t.status), t.osNumero, t.prioridade||'—', t.siteId||'—', t.enderecoId||'—', t.tipoFalha||'—', updateIconeTexto(item.estado)];
        });
        resultArea.appendChild(U.h('div',{style:{fontWeight:'600',fontSize:'13px',marginBottom:'10px'},text:resultados.length+' TSK(s)'}));
        resultArea.appendChild(tabelaResultados(rows, ['Região','Status','TSK','P','Site','END_ID','Falha','Update']));
      }
      filtroUpd.addEventListener('change', renderLista);
      selReg.addEventListener('change', renderLista);
      selPrio.addEventListener('change', renderLista);
      renderLista();
    }

    /* ════════════════════════════════════════════════════════════
     * MODO 3 — POSSÍVEIS NORMALIZADOS (com exclusão DJ + filtros)
     * ════════════════════════════════════════════════════════════ */
    function renderNormalizados() {
      tabContent.innerHTML = '';
      var selReg  = mkFiltroSel('Região',     opcoesRegiao());
      var selPrio = mkFiltroSel('Prioridade', opcoesPrio());
      var resultArea = U.h('div', { style:{ marginTop:'14px' } });
      var textoAtual = '';
      var ctrlRow = U.h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px', flexWrap:'wrap' } }, [
        selReg, selPrio, btnCopiar(function(){ return textoAtual; }),
        U.h('span',{style:{fontSize:'11px',color:'var(--trj-muted)',marginLeft:'6px'},text:'TSKs abertas cujo END_ID não está mais em sites fora ativos'})
      ]);
      tabContent.appendChild(ctrlRow);
      tabContent.appendChild(resultArea);

      function renderNorm() {
        resultArea.innerHTML = '';
        var regFiltro  = selReg.value;
        var prioFiltro = selPrio.value;
        var validas = tasks.filter(ehValidoParaPesquisa).filter(function(t){
          if (regFiltro  !== 'TODAS' && (t.regiao    ||'OTHERS') !== regFiltro)  return false;
          if (prioFiltro !== 'TODAS' && (t.prioridade||'')       !== prioFiltro) return false;
          return true;
        });
        var normalizados = [];
        validas.forEach(function(t) {
          var eid = (t.enderecoId||'').trim();
          // 1. END_ID não está nos incidentes ativos (site voltou)
          if (eidsAtivos[eid]) return;
          // 2. Excluir se DJ contém PREDITIVA, MABE ou ACESSO FA
          var dj = norm(t.isocDJ||'');
          for (var i=0; i<DJ_EXCLUIR.length; i++) {
            if (dj.indexOf(norm(DJ_EXCLUIR[i])) >= 0) return;
          }
          // 2b. Excluir tipos de falha que nunca devem aparecer nos normalizados
          var tfNorm = norm(t.tipoFalha||'');
          for (var j=0; j<TIPO_FALHA_EXCLUIR_NORM.length; j++) {
            if (tfNorm.indexOf(norm(TIPO_FALHA_EXCLUIR_NORM[j])) >= 0) return;
          }
          // 3. Verificar palavras-chave em tipoFalha, BG (motivoCancelamento) e filaAtual
          // (O VBA buscava na coluna EB; no nosso modelo o BG e fila também carregam info de alarme)
          var camposVerif = [t.tipoFalha || '', t.filaAtual || '', (t.motivoCancelamento || '').slice(0, 500)];
          var textoTotal  = camposVerif.join(' ');
          var textoNorm   = norm(textoTotal);
          var temPalavra  = PALAVRAS_NORM.some(function(p) { return textoNorm.indexOf(norm(p)) >= 0; });
          if (!temPalavra) return;
          normalizados.push({ r: t.regiao||'SEM REGIÃO', t: t });
        });
        normalizados.sort(function(a,b){
          var ri=C.REGIOES||[];
          var ar=ri.indexOf(a.r), br2=ri.indexOf(b.r); if(ar!==br2) return ar-br2;
          var pa=parseInt((a.t.prioridade||'P9').replace(/\D/g,''),10)||9;
          var pb=parseInt((b.t.prioridade||'P9').replace(/\D/g,''),10)||9;
          return pa-pb;
        });
        if (!normalizados.length) { resultArea.appendChild(vazio('Nenhuma TSK identificada como possível normalizado.')); textoAtual=''; return; }
        var grupos = agrupar(normalizados.map(function(item){ return { r:item.r, linha:formatarLinha(item.t, item.t.tipoFalha, true) }; }));
        textoAtual = montarTexto('POSSÍVEIS NORMALIZADOS', grupos);
        var rows = normalizados.map(function(item){
          var t=item.t, reg=(C.REGIAO_LABELS[item.r]||item.r||'SEM REGIÃO').toUpperCase();
          var estado = calcUpdateStatus(t.motivoCancelamento||'');
          return [reg, statusBadge(t.status), t.osNumero, t.prioridade||'—', t.siteId||'—', t.enderecoId||'—', t.tipoFalha||'—', updateIconeTexto(estado)];
        });
        var aviso = U.h('div',{style:{display:'flex',gap:'10px',alignItems:'flex-start',padding:'10px 14px',background:'rgba(46,204,113,.08)',border:'1px solid rgba(46,204,113,.25)',borderRadius:'8px',marginBottom:'12px'}},[
          U.h('span',{style:{fontSize:'18px'},text:'✅'}),
          U.h('div',null,[
            U.h('b',{text:normalizados.length+' TSK(s) possivelmente normalizada(s)'}),
            U.h('p',{style:{fontSize:'12px',color:'var(--trj-muted)',margin:'3px 0 0'},text:'Site voltou (sem incidente ativo). Falha com keyword de alarme. DJ sem PREDITIVA/MABE/ACESSO FA.'})
          ])
        ]);
        resultArea.appendChild(aviso);
        resultArea.appendChild(tabelaResultados(rows, ['Região','Status','TSK','P','Site','END_ID','Tipo Falha','Último Update']));
      }
      selReg.addEventListener('change', renderNorm);
      selPrio.addEventListener('change', renderNorm);
      renderNorm();
    }

    function renderModo() {
      tabContent.innerHTML = '';
      if (modoAtivo.v==='palavra') renderPalavra();
      else if (modoAtivo.v==='pendente') renderPendente();
      else renderNormalizados();
    }
    renderModo();
  };

})(window.TRJ = window.TRJ || {});
