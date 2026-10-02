/* Página: Dashboard */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, Comp = TRJ.compute;
  var state = { regiao: 'TODAS', prioridades: [] };

  TRJ.pages.dashboard = function (container, ctx) {
    var data = ctx.data, app = ctx.app;
    if (!data) { container.appendChild(U.h('div', { class: 'trj-card p-6', text: 'Sem dados carregados.' })); return; }

    // Calcula o dashboard. Se algo vier vazio/indefinido, usamos defaults
    // defensivos para nunca quebrar a renderização (ex.: kpis.foraSla).
    var d = Comp.dashboard(data.tasksEnriched, data.incidentsEnriched, state) || {};
    var f = state;
    var K = d.kpis || {};
    var topCidades = d.topCidades || { totalSitesFora: 0, porAnf: [], cidades: [] };

    // Publica automaticamente uma "foto" SEM FILTROS (visão completa, não
    // o que o operador estiver filtrando agora) pro link público de
    // visualização — silencioso, não bloqueia a tela nem mostra erro.
    publicarSnapshotPublico(data);

    // ---- filtros + ações ----
    var selReg = U.h('select', { class: 'trj-select', style: { width: 'auto' }, onchange: function () { state.regiao = this.value; app.render(); } },
      [U.h('option', { value: 'TODAS', text: 'Todas as regiões' })].concat(C.REGIOES.map(function (r) {
        return U.h('option', { value: r, text: C.REGIAO_LABELS[r] || r, selected: f.regiao === r ? 'selected' : null });
      })));
    var selPri = (function () {
      var wrap = U.h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' } });
      function mkChip(lbl, ativo, onclick) {
        return U.h('button', {
          class: 'trj-btn trj-btn-ghost',
          style: {
            fontSize: '10px', padding: '2px 7px', borderRadius: '20px',
            background: ativo ? 'rgba(255,140,0,.25)' : 'rgba(255,255,255,.06)',
            color: ativo ? 'var(--trj-primary)' : 'var(--trj-muted)',
            border: '1px solid ' + (ativo ? 'var(--trj-primary)' : 'rgba(255,255,255,.12)'),
            fontWeight: ativo ? '700' : '400', cursor: 'pointer'
          },
          text: lbl, onclick: onclick
        });
      }
      wrap.appendChild(mkChip('Todas', !state.prioridades.length, function () { state.prioridades = []; app.render(); }));
      (C.PRIORIDADES || []).forEach(function (p) {
        var ativo = state.prioridades.indexOf(p) >= 0;
        wrap.appendChild(mkChip(p, ativo, function (pp) {
          return function () {
            var idx = state.prioridades.indexOf(pp);
            if (idx >= 0) state.prioridades.splice(idx, 1);
            else state.prioridades.push(pp);
            app.render();
          };
        }(p)));
      });
      return wrap;
    }());
    var btnWa = U.h('button', { class: 'trj-btn trj-btn-ghost', text: '📱 Copiar resumo', onclick: function () { copiarResumo(d); } });
    var btnExcel = U.h('button', {
      class: 'trj-btn clickable',
      style: { background: 'rgba(33,115,70,.18)', color: '#2e7d46', border: '1px solid rgba(33,115,70,.4)', fontWeight: '700', gap: '6px', transition: 'all .2s ease' },
      onclick: function () { exportarExcelDashboard(d, data); },
      onmouseenter: function (ev) { ev.currentTarget.style.background = 'rgba(33,115,70,.35)'; ev.currentTarget.style.borderColor = '#2e7d46'; ev.currentTarget.style.boxShadow = '0 4px 14px rgba(33,115,70,.3)'; },
      onmouseleave: function (ev) { ev.currentTarget.style.background = 'rgba(33,115,70,.18)'; ev.currentTarget.style.borderColor = 'rgba(33,115,70,.4)'; ev.currentTarget.style.boxShadow = ''; }
    }, [
      U.h('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: '#2e7d46', style: { flexShrink: '0' } }, [
        U.h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
        U.h('polyline', { fill: 'none', stroke: 'rgba(33,115,70,.25)', 'stroke-width': '1.5', points: '14 2 14 8 20 8' }),
        U.h('line', { fill: 'none', stroke: '#fff', 'stroke-width': '1.5', x1: '8', y1: '13', x2: '16', y2: '21' }),
        U.h('line', { fill: 'none', stroke: '#fff', 'stroke-width': '1.5', x1: '16', y1: '13', x2: '8', y2: '21' })
      ]),
      U.h('span', { text: 'Extrair Excel' })
    ]);
    var btnRef = U.h('button', { class: 'trj-btn trj-btn-primary', html: app.icon('refresh') + ' Atualizar', onclick: function () { app.refresh(); } });
    var right = U.h('div', { class: 'flex items-center gap-2 flex-wrap' }, [selReg, selPri, btnWa, btnExcel, btnRef]);
    var atualizadoEm = d.atualizadoEm ? new Date(d.atualizadoEm).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
    container.appendChild(U.pageHeader('Dashboard Operacional', 'Atualizado em ' + atualizadoEm, right));

    // ---- KPIs ----
    var kpiDefs = [
      { label: 'Fora do SLA', value: U.fmtNum(K.foraSla), cor: C.CORES_TRJ.red, spec: { tipo: 'foraSla' }, t: 'Backlog fora do SLA' },
      { label: 'Backlog Total', value: U.fmtNum(K.backlogTotal), cor: C.CORES_TRJ.orange, spec: { tipo: 'backlogTotal' }, t: 'Backlog total' },
      { label: 'Backlog Indefinido', value: U.fmtNum(K.backlogIndef), cor: C.CORES_TRJ.red, spec: { tipo: 'backlogIndef' }, t: 'Backlog sem SLA definido' },
      { label: 'Preditiva', value: U.fmtNum(K.preditiva), cor: C.CORES_TRJ.orange, spec: { tipo: 'preditiva' }, t: 'Atividades preditivas' },
      { label: 'Produtividade (Concluídas)', value: U.fmtNum(K.produtividade), cor: C.CORES_TRJ.green, spec: { tipo: 'produtividade' }, opts: { modoResultado: true }, t: 'TSKs concluídas' },
      { label: 'SLA Geral (Concluídas)', value: U.fmtPct(K.slaGeral), cor: C.CORES_TRJ.green, spec: { tipo: 'produtividade' }, opts: { modoResultado: true }, t: 'TSKs concluídas — % dentro do prazo' }
    ];
    var kpiGrid = U.h('div', { class: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5' }, kpiDefs.map(function (k) {
      return U.kpiCard({ label: k.label, value: k.value, cor: k.cor, onClick: k.spec ? function (kk) { return function () { app.openDrillTasks(kk.spec, f, kk.t, kk.opts || {}); }; }(k) : null });
    }));
    container.appendChild(kpiGrid);

    // ---- charts grid ----
    var aging = U.chartCard('AGING DO BACKLOG');
    // ============================================================
    // HELPERS COMPARTILHADOS DE CÓPIA
    // ============================================================
    function fmtMinutos(min) {
      if (min <= 0) return 'VENCIDO';
      if (min < 60) return min + 'min';
      var h = Math.floor(min/60), m = min%60;
      return h + 'h' + (m > 0 ? m + 'min' : '');
    }

    function calcUpdateStr(bg) {
      if (!bg) return 'SEM ATUALIZAÇÃO';
      if (!U.classificarUltimoBloco) return 'SEM ATUALIZAÇÃO';
      var res = U.classificarUltimoBloco(bg.toString());
      if (res.estado === 'sem') return 'SEM ATUALIZAÇÃO';
      if (res.estado === 'acionamento') return 'VERIFICANDO ACIONAMENTO';
      if (!res.dt) return 'SEM ATUALIZAÇÃO';
      var diffMin = Math.round((Date.now() - res.dt.getTime()) / 60000);
      if (diffMin < 0) return 'ATUALIZADO AGORA';
      if (diffMin < 60) return 'ATUALIZADO A ' + diffMin + 'min';
      var h = Math.floor(diffMin / 60), mn = diffMin % 60;
      return 'ATUALIZADO A ' + h + 'h' + (mn > 0 ? mn + 'min' : '');
    }


    function prioLabel(t) {
      return t && t.prioridade ? '*' + t.prioridade + '*' : '';
    }

    function copyText(txt) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt)
          .then(function(){ U.toast('✓ Copiado!', 'ok'); })
          .catch(function(){ _fb(txt); });
      } else { _fb(txt); }
      function _fb(s) {
        var ta = document.createElement('textarea');
        ta.value = s; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); U.toast('✓ Copiado!', 'ok'); }
        catch(e){ U.toast('Não foi possível copiar.','err'); }
        document.body.removeChild(ta);
      }
    }

    // ============================================================
    // SITES FORA — geração de texto para cópia
    // ============================================================
    // Sempre agrupa por END_ID na cópia.
    // Respeita state.regiao e state.prioridade do dashboard.
    function gerarTextoSitesFora(regiaoFiltro) {
      // Filtro efetivo: parâmetro explícito OU filtro do dashboard
      var regiaoEfetiva = regiaoFiltro || (state.regiao !== 'TODAS' ? state.regiao : null);
      var prioFiltros   = state.prioridades || [];

      var incAtivos = (data.incidentsEnriched || []).filter(function(inc){
        return (inc.statusTrat||'').toUpperCase() !== 'RESOLVIDO' &&
               (!regiaoEfetiva || (inc.regiao||'OTHERS') === regiaoEfetiva);
      });
      var tasksEnriched = data.tasksEnriched || [];

      // Agrupar por END_ID (na cópia, sempre agrupado)
      var endIdMap = {};
      incAtivos.forEach(function(inc){
        var eid = inc.enderecoId || '_sem_endid_' + inc.site;
        if (!endIdMap[eid]) endIdMap[eid] = [];
        endIdMap[eid].push(inc);
      });

      // Mapear por região
      var regioesMapa = {};
      Object.keys(endIdMap).forEach(function(eid){
        var incs = endIdMap[eid];
        // Ordenar por horário para pegar o mais antigo como referência
        incs.sort(function(a,b){ return (a.horario||'').localeCompare(b.horario||''); });
        var mainInc = incs[0];
        var r = mainInc.regiao || 'OTHERS';
        if (!regioesMapa[r]) regioesMapa[r] = [];
        regioesMapa[r].push({ eid: eid, incs: incs, mainInc: mainInc });
      });

      var linhas = [];
      Object.keys(regioesMapa).sort().forEach(function(r){
        var regLabel = (C.REGIAO_LABELS[r] || r).toUpperCase();
        linhas.push('*' + regLabel + '*');
        linhas.push('*SITES FORA NA FILA*');

        var grupos = regioesMapa[r];
        var comTSK = [], semTSK = [];

        grupos.forEach(function(grupo){
          // Buscar TSK na tarefa mais recente para este END_ID
          var mainInc = grupo.mainInc;
          var tsk = U.tskAberta ? U.tskAberta(mainInc, tasksEnriched) : null;
          var tf = tsk ? tasksEnriched.filter(function(t){ return t.osNumero === tsk.osNumero; })[0] : null;
          // Filtro de prioridade: se há filtro ativo e a TSK não bate, pular
          if (prioFiltros.length && tf && prioFiltros.indexOf(tf.prioridade) < 0) return;
          if (prioFiltros.length && !tf) return; // sem TSK e filtro de prio ativo: ignorar

          // Só conta como "com TSK" se o tipo for Manutenção Corretiva.
          // TSK manual (outro tipo) é tratada como SEM TSK para fins de cópia.
          var isCorretiva = tf && (tf.tipoAtividade || '').indexOf('Corretiva') >= 0;
          if (tsk && isCorretiva) {
            comTSK.push({ grupo: grupo, tsk: tsk, tf: tf });
          } else {
            semTSK.push(grupo);
          }
        });

        // --- Com TSK (primeiro) ---
        comTSK.forEach(function(item){
          var tsk = item.tsk, tf = item.tf;
          var prio    = tf && tf.prioridade ? '*' + tf.prioridade + '* ' : '';
          var tskNum  = tsk.osNumero || 'SEM TSK';
          var site    = (tf && tf.siteId) || item.grupo.mainInc.site || '—';
          var upd     = calcUpdateStr((tf||{}).motivoCancelamento || (tsk||{}).motivoCancelamento);
          linhas.push(prio + tskNum + ' / ' + site + ' · ' + upd);
        });

        // --- Sem TSK: somente os que não tiverem diagnóstico (causa vazia/"/" no Genesis) ---
        // O parser Genesis converte "/" para null via nn(), então verificamos null/vazio OU "/" literal.
        semTSK.forEach(function(grupo){
          var causaBarra = grupo.incs.some(function(i){
            var c = (i.causa == null ? '' : String(i.causa)).trim();
            return !c || c === '/';
          });
          if (!causaBarra) return;
          var hor  = grupo.mainInc.horario || '—';
          var endId = grupo.eid.startsWith('_sem_endid_') ? '' : (' / ' + grupo.eid);
          // Sites únicos do grupo (não repete)
          var sitesUnicos = [];
          grupo.incs.forEach(function(i){ if (i.site && sitesUnicos.indexOf(i.site) < 0) sitesUnicos.push(i.site); });
          var sitesStr = sitesUnicos.join(', ');
          linhas.push(hor + ' · SEM TSK · ' + sitesStr + endId);
        });

        linhas.push('');
      });
      return linhas.join('\n').trim();
    }

    // ============================================================
    // PRAZOS A VENCER — geração de texto
    // (definidas ANTES dos botões que as chamam)
    // ============================================================
    // gerarTextoPrazosRegiao: texto copiável do gráfico Prazos a Vencer.
    // bucketIdx = null → todas as faixas; número → só aquela faixa de tempo.
    // Aplica dedupPorTsk para garantir que cada chamado apareça uma única vez
    // (usando somente o row mais recente — mesmo critério do gráfico).
    function gerarTextoPrazosRegiao(regiaoFiltro, bucketIdx) {
      var now = Date.now();
      var regiaoEfetiva = regiaoFiltro || (state.regiao !== 'TODAS' ? state.regiao : null);
      var prioFiltros   = state.prioridades || [];
      // Dedup: um row por TSK (o mais recente), igual ao critério do gráfico
      var _dedup = TRJ.domain && TRJ.domain.dedupPorTsk;
      var dedup = _dedup ? _dedup(data.tasksEnriched || []) : (data.tasksEnriched || []);
      var tasksVenc = dedup.filter(function(t){
        var s = (t.status||'').toString().trim().toUpperCase();
        if (s !== 'NÃO INICIADO' && s !== 'NAO INICIADO' && s !== 'INICIADO') return false;
        if (t.statusSla !== 'DENTRO DO SLA' || !t.vencimentoCalc) return false;
        if (regiaoEfetiva && (t.regiao||'OTHERS') !== regiaoEfetiva) return false;
        if (prioFiltros.length && prioFiltros.indexOf(t.prioridade) < 0) return false;
        var rest = Math.round((new Date(t.vencimentoCalc).getTime() - now) / 60000);
        if (rest < 0 || rest > 390) return false; // mesmo limite do gráfico (390min)
        if (bucketIdx != null) {
          var b = C.VENCIMENTO_BUCKETS[bucketIdx];
          if (!b || rest < b.min || rest >= b.max) return false;
        }
        return true;
      });
      var titulo = bucketIdx != null
        ? '*' + ('A VENCER: ' + (C.VENCIMENTO_BUCKETS[bucketIdx] ? C.VENCIMENTO_BUCKETS[bucketIdx].label : '')).toUpperCase() + '*'
        : '*PRAZOS A VENCER*';
      var regioesMapa = {};
      tasksVenc.forEach(function(t){
        var r = t.regiao||'OTHERS';
        if (!regioesMapa[r]) regioesMapa[r] = [];
        regioesMapa[r].push(t);
      });
      var linhas = [titulo, ''];
      C.REGIOES.concat(['OTHERS']).forEach(function(r){
        if (!regioesMapa[r]) return;
        linhas.push('*' + (C.REGIAO_LABELS[r]||r).toUpperCase() + '*');
        var arr = regioesMapa[r].slice().sort(function(a,b){
          var pa = parseInt((a.prioridade||'P9').replace(/\D/g,''),10)||9;
          var pb = parseInt((b.prioridade||'P9').replace(/\D/g,''),10)||9;
          if (pa !== pb) return pa - pb;
          return new Date(a.vencimentoCalc).getTime() - new Date(b.vencimentoCalc).getTime();
        });
        arr.forEach(function(t){
          var prio   = t.prioridade ? '*' + t.prioridade + '* ' : '';
          var tsk    = t.osNumero || '—';
          var site   = t.siteId || t.enderecoId || '—';
          var falha  = (t.tipoFalha || '—').toUpperCase();
          var rest   = Math.round((new Date(t.vencimentoCalc).getTime() - now) / 60000);
          var tempo  = rest <= 0 ? 'VENCIDO' : 'VENCE EM ' + fmtMinutos(rest);
          linhas.push(prio + [tsk, site, falha, tempo].filter(Boolean).join(' · '));
        });
        linhas.push('');
      });
      return linhas.join('\n').trim();
    }
    function gerarTextoPrazosTodasRegioes() { return gerarTextoPrazosRegiao(null, null); }

    // Prazos a Vencer — botão copiar (ao lado do título)
    var vencBtnCopiar = U.h('button', {
      class: 'trj-btn trj-btn-ghost clickable',
      style: { fontSize: '11px', padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(255,255,255,.15)' },
      onclick: function(){ copyText(gerarTextoPrazosTodasRegioes()); }
    }, [U.h('span',{text:'📋'}), U.h('span',{text:'Copiar'})]);
    var venc = U.chartCard('PRAZOS A VENCER', { hint: null, rightEl: vencBtnCopiar });

    // ============================================================
    // SITES FORA — toggle + botão copiar todos
    // ============================================================
    var sfAgrupar = { value: true };
    var switchSf = U.switch(true, 'AGRUPAR POR END_ID', function(v){ sfAgrupar.value = v; });

    var btnCopiarTodosSF = U.h('button', {
      class: 'trj-btn trj-btn-ghost clickable',
      style: { fontSize: '11px', padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(255,255,255,.15)' },
      onclick: function(){ copyText(gerarTextoSitesFora(null)); }
    }, [U.h('span',{text:'📋'}), U.h('span',{text:'Copiar'})]);

    var sfControls = U.h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [switchSf, btnCopiarTodosSF]);
    var sites = U.chartCard('SITES FORA POR REGIÃO', { rightEl: sfControls });
    var slaReg = U.chartCard('SLA POR REGIÃO');
    var manu = U.chartCard('ATIVIDADES MANUAIS', { hint: 'inclui cancelamentos' });
    var prod = U.chartCard('PRODUTIVIDADE — ENCERRADAS DENTRO/FORA DO SLA');
    var grid = U.h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5' }, [aging.card, venc.card, sites.card, slaReg.card, manu.card, prod.card]);
    container.appendChild(grid);

    // ---- top cidades ----
    container.appendChild(buildTopCidades(topCidades, app));

    // ---- desenha charts (canvas já no DOM) ----

    var aData = d.aging || [], vData = d.prazosVencimento || [], sfData = d.sitesForaRegiao || [], srData = d.slaPorRegiao || [], amData = d.atividadesManuais || [], pData = d.produtividade || [];
    U.barChart(aging.canvas, aData, { onBar: function (i) { app.openDrillTasks({ tipo: 'aging', arg: i }, f, 'AGING: ' + aData[i].label); } });
    U.hbarChart(venc.canvas, vData, { onBar: function (i) {
      var bucket = vData[i];
      var regiaoFiltro = null;
      // Botão copiar do drill usa a mesma função do botão externo, filtrado ao bucket selecionado.
      // Isso garante formato e dedup idênticos nos dois botões de copiar.
      var onCopyDrill = function () { return gerarTextoPrazosRegiao(null, i); };
      app.openDrillTasks({ tipo: 'vencimento', arg: i }, f, 'A VENCER: ' + (bucket.label||''), {}, onCopyDrill);
    }});
    U.barChart(sites.canvas, sfData.map(function (x) { return { label: x.label.toUpperCase(), total: x.total, cor: C.CORES_TRJ.red }; }), {
      onBar: function (i) {
        var tipo = sfAgrupar.value ? 'sitesForaAgrupado' : 'sitesFora';
        var regiao = sfData[i].regiao;
        var titulo = 'SITES FORA: ' + (sfData[i].label||'').toUpperCase();
        app.openDrillIncidents({ tipo: tipo, arg: regiao }, titulo, {
          onCopy: function(){ return gerarTextoSitesFora(regiao); }
        });
      }
    });
    U.stackedChart(slaReg.canvas, srData, { onSeg: function (i, ds) { var r = srData[i]; app.openDrillTasks({ tipo: 'slaRegiao', arg: r.regiao + '|' + (ds === 1 ? 'fora' : 'dentro') }, f, 'SLA ' + r.label); } });
    U.donutChart(manu.canvas, amData, {
      cores: C.DONUT_CORES,
      onSlice: function (i) {
        var nm = amData[i].name;
        var ehCancel = nm.indexOf('Cancel.') === 0;
        var spec = ehCancel
          ? { tipo: 'cancelCorretiva', arg: nm.indexOf('Associa') >= 0 ? 'assoc' : 'auto' }
          : { tipo: 'atividades', arg: argAtiv(nm) };
        app.openDrillTasks(spec, f, nm, ehCancel ? { modoCancelamento: true } : {});
      }
    });
    U.stackedChart(prod.canvas, pData.map(function (p) { return { label: p.categoria, dentro: p.dentro, fora: p.fora, preditiva: p.preditiva }; }), {
      onSeg: function (i, ds) {
        var cat = pData[i].categoria;
        var lado = ds === 2 ? 'preditiva' : (ds === 1 ? 'fora' : 'dentro');
        var titulo = 'Produtividade ' + cat + (ds === 2 ? ' — Preditiva' : (ds === 1 ? ' — Fora do SLA' : ' — Dentro do SLA'));
        app.openDrillTasks({ tipo: 'produtividadeCat', arg: cat + '|' + lado }, f, titulo, { modoResultado: true });
      }
    });

    // Botões de região no Prazos a Vencer — APÓS todos os charts estarem renderizados
    // (gerarTextoPrazosRegiao já está definida acima — botão vencBtnCopiar funciona sem buildVencRegioeBtns)
    try { if (typeof buildVencRegioeBtns === 'function') buildVencRegioeBtns(); } catch (e) { /* opcional */ }
  };

  function argAtiv(name) {
    if (/WO/i.test(name)) return 'wo';
    if (/Prevent/i.test(name)) return 'prev';
    if (/Conjunta/i.test(name)) return 'conj';
    return 'outras';
  }

  // Publica uma "foto" do Dashboard SEM FILTROS (visão completa da
  // equipe) pro link público de visualização. Best-effort: nunca trava a
  // tela nem mostra erro pro operador, e só manda de novo se algo mudou
  // desde a última publicação (evita gravação repetida sem necessidade).
  // Publica os dados BRUTOS (tarefas + incidentes) pro link público de
  // visualização — não os números já calculados, pra a página pública
  // poder filtrar por região e abrir os drills igual ao painel principal.
  // Best-effort: nunca trava a tela nem mostra erro pro operador, e só
  // manda de novo se algo mudou desde a última publicação.
  var _ultimoSnapshotJSON = null;

  // Reduz cada tarefa enriquecida a só os campos que o dashboard público
  // (compute.js + ui.js, rodando de novo do zero em cima do snapshot)
  // realmente lê. Sem isso, o JSON publicado vinha gigante: testei com
  // 270 tarefas reais e deu ~770KB só de tasksEnriched — boa parte disso
  // é a coluna "Diário de Trabalho" (motivoCancelamento), que pode ter
  // até ~10 mil caracteres em uma única tarefa cancelada. Como só
  // importa saber se contém "ASSOCIAÇÃO DE ATIVIDADES" ou não, mantemos
  // o MESMO nome de campo (pra não mudar nada em compute.js) só que com
  // o texto cortado pro essencial.
  function slimTaskForPublish(t) {
    var motivo = (t.motivoCancelamento || '').toString();
    var motivoSlim = /ASSOCIA/i.test(motivo) ? 'ASSOCIAÇÃO DE ATIVIDADES' : (motivo ? 'AUTOMACAO' : '');
    return {
      osNumero: t.osNumero, sequenciaId: t.sequenciaId, tipoAtividade: t.tipoAtividade,
      status: t.status, filaAtual: t.filaAtual, prioridade: t.prioridade,
      dataCriacao: t.dataCriacao, dataCriacaoAS: t.dataCriacaoAS,  // AS = "Criação do NTT" (aging)
      enderecoId: t.enderecoId, siteId: t.siteId,
      cidade: t.cidade, regiao: t.regiao, tipoFalha: t.tipoFalha,
      vencimentoCalc: t.vencimentoCalc, fimCalc: t.fimCalc,
      statusSla: t.statusSla, fonteSla: t.fonteSla, motivoCancelamento: motivoSlim
    };
  }

  function publicarSnapshotPublico(data) {
    try {
      // Incluir coordMap no snapshot para que o mapa funcione em qualquer dispositivo.
      // Publica somente o coordMap (ENDID→[lat,lon]) para manter o payload enxuto.
      // mwData e foData são grandes demais para o snapshot; ficam no localStorage do usuário.
      function tryLS(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e){ return null; }
      }
      var coordMapLS = tryLS('trj_coordMap') || {};
      // Slim mwData: só as colunas necessárias para as polylines
      var mwDataLS = tryLS('trj_mwData') || [];
      var mwSlim = mwDataLS.length > 0 ? mwDataLS.map(function(l) {
        return { E2:l.Enlace2||'', LA:l.LAT_A, LO:l.LONG_A, LB:l.LAT_B, LOB:l.LONG_B, F:l.FORNECEDOR||'' };
      }) : null;
      // Slim foData: só as colunas necessárias para os marcadores
      var foDataLS = tryLS('trj_foData') || [];
      var foSlim = foDataLS.length > 0 ? foDataLS.map(function(h) {
        return { N:h.NEName||'', H:h.HUB||'', LA:h.LAT_A, LO:h.LONG_A, F:h.FORNECEDOR||'' };
      }) : null;

      var payload = {
        tasksEnriched:     (data.tasksEnriched || []).map(slimTaskForPublish),
        incidentsEnriched: data.incidentsEnriched || [],
        prazoMap:          data.prazoMap || {},        // necessário para SLA/Aderência
        mapaCoordMap: Object.keys(coordMapLS).length > 0 ? coordMapLS : null,
        mapaMwSlim:   mwSlim,
        mapaFoSlim:   foSlim
      };
      var jsonStr = JSON.stringify(payload);
      if (jsonStr === _ultimoSnapshotJSON) return;
      _ultimoSnapshotJSON = jsonStr;
      TRJ.api.saveDashboardSnapshot(payload).catch(function () {});
    } catch (e) { /* nunca deixa a publicação quebrar o Dashboard */ }
  }

  function buildTopCidades(tc, app) {
    var porAnf = tc.porAnf || [], cidades = tc.cidades || [];

    var anfList = U.h('div', { class: 'flex flex-wrap gap-2 mb-4' }, porAnf.map(function (a) {
      var chip = U.h('button', {
        class: 'trj-btn trj-btn-ghost',
        style: { fontSize: '12px', transition: 'all .2s ease' },
        onclick: function () { app.openDrillIncidents({ tipo: 'anf', arg: a.anfRaw }, a.anf); }
      }, [
        U.h('span', { class: 'font-bold', text: a.anf }),
        U.h('span', { style: { color: 'var(--trj-primary)', marginLeft: '6px' }, text: String(a.total) }),
        U.h('span', { style: { color: 'var(--trj-muted)', marginLeft: '4px', fontSize: '11px' }, text: '(' + a.pct + '%)' })
      ]);
      chip.addEventListener('mouseenter', function () { chip.style.transform = 'translateY(-2px)'; chip.style.borderColor = 'rgba(255,140,0,.6)'; chip.style.boxShadow = '0 6px 16px rgba(255,140,0,.2)'; });
      chip.addEventListener('mouseleave', function () { chip.style.transform = ''; chip.style.borderColor = ''; chip.style.boxShadow = ''; });
      return chip;
    }));

    var bars = U.h('div', { class: 'flex flex-col gap-1' }, cidades.slice(0, 15).map(function (c) {
      var barra = U.h('div', { style: { width: c.pct + '%', height: '8px', borderRadius: '6px', background: 'var(--trj-primary)', transition: 'all .2s ease' } });
      var item = U.h('div', { style: { cursor: 'pointer', padding: '5px 8px', borderRadius: '8px', transition: 'background .18s ease' } }, [
        U.h('div', { class: 'flex justify-between text-xs mb-1' }, [
          U.h('span', { style: { fontWeight: '600' }, text: c.cidade }),
          U.h('span', { style: { color: 'var(--trj-primary)', fontWeight: '700' }, text: String(c.total) })
        ]),
        U.h('div', { style: { background: 'rgba(255,255,255,.07)', borderRadius: '6px', height: '8px', overflow: 'hidden' } }, barra)
      ]);
      item.addEventListener('mouseenter', function () {
        item.style.background = 'rgba(255,140,0,.1)';
        barra.style.background = 'var(--trj-primary2)';
        barra.style.boxShadow = '0 0 10px rgba(255,140,0,.5)';
      });
      item.addEventListener('mouseleave', function () { item.style.background = ''; barra.style.background = 'var(--trj-primary)'; barra.style.boxShadow = ''; });
      item.addEventListener('click', function () { app.openDrillIncidents({ tipo: 'cidade', arg: c.cidade }, c.cidade); });
      return item;
    }));

    var total = U.h('div', {
      class: 'trj-card p-5 flex flex-col items-center justify-center clickable',
      style: { minWidth: '180px', cursor: 'pointer', transition: 'box-shadow .15s', border: '2px solid transparent' },
      title: 'Clique para ver todos os sites fora',
      onclick: function () { app.openDrillIncidents({ tipo: 'sitesFora', arg: null }, 'TODOS OS SITES FORA'); }
    }, [
      U.h('div', { class: 'text-xs uppercase', style: { color: 'var(--trj-muted)' }, text: 'TOTAL SITES FORA' }),
      U.h('div', { class: 'font-extrabold', style: { fontSize: '56px', color: C.CORES_TRJ.red, lineHeight: '1', textShadow: '0 0 20px rgba(231,76,60,.4)' }, text: U.fmtNum(tc.totalSitesFora) }),
      U.h('div', { style: { fontSize: '10px', color: 'var(--trj-muted)', marginTop: '4px' }, text: '▼ ver incidentes' })
    ]);
    return U.h('div', { class: 'trj-card p-4' }, [
      U.h('div', { class: 'flex items-center gap-2 mb-3' }, [
        U.h('span', { class: 'trj-chart-dot' }),
        U.h('h3', { class: 'text-sm font-bold', text: 'TOP CIDADES — SITES FORA' }),
        U.h('span', { class: 'text-xs font-normal', style: { color: 'var(--trj-muted)' }, text: '(clique em qualquer cidade ou ANF para detalhar)' })
      ]),
      U.h('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4' }, [
        total,
        U.h('div', { class: 'lg:col-span-2' }, [anfList, bars])
      ])
    ]);
  }

  function copiarResumo(d) {
    var K = d.kpis || {};
    var tc = d.topCidades || {};
    var linhas = [
      '*Controle TRJ — Resumo*',
      'Fora do SLA: ' + (K.foraSla || 0),
      'Backlog Total: ' + (K.backlogTotal || 0),
      'Backlog Indef.: ' + (K.backlogIndef || 0),
      'Preditiva: ' + (K.preditiva || 0),
      'Produtividade (Concluídas): ' + (K.produtividade || 0),
      'SLA Geral (Concluídas): ' + (K.slaGeral || 0) + '%',
      'Sites fora: ' + (tc.totalSitesFora || 0),
      'Atualizado: ' + new Date(d.atualizadoEm || Date.now()).toLocaleString('pt-BR')
    ];
    var txt = linhas.join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('Resumo copiado!', 'ok'); }, function () { U.toast('Não foi possível copiar.', 'err'); });
    else U.toast('Cópia não suportada neste navegador.', 'err');
  }

  // Extrai todos os dados do Dashboard (KPIs + todos os gráficos) num único
  // arquivo Excel, uma aba por bloco — pra quem preferir analisar fora do site.
  function exportarExcelDashboard(d, pageData) {
    if (typeof XLSX === 'undefined') { U.toast('Biblioteca de Excel não carregou. Recarregue a página.', 'err'); return; }
    var wb = XLSX.utils.book_new();
    var dom = TRJ.domain;
    var now = new Date();

    // Aplica formatação básica na aba: freeze do cabeçalho + larguras de coluna
    function formatarAba(ws, colWidths) {
      // Congelar primeira linha
      if (!ws['!freeze']) ws['!freeze'] = { ySplit: 1 };
      // Larguras das colunas
      if (colWidths && colWidths.length) {
        ws['!cols'] = colWidths.map(function(w){ return { wch: w }; });
      }
    }

    function aba(nome, aoa, colWidths) {
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      formatarAba(ws, colWidths);
      XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
    }

    function abaLista(nome, rows, cols, colWidths) {
      var hdr = cols.map(function (c) { return (c.h||'').toUpperCase(); });
      var aoa = [hdr];
      (rows || []).forEach(function (r) {
        aoa.push(cols.map(function (c) {
          var v = r[c.k];
          if (v == null) return '';
          if (c.dt && v) { try { return new Date(v).toLocaleString('pt-BR'); } catch(e){ return v; } }
          return v;
        }));
      });
      aba(nome, aoa, colWidths || cols.map(function(){ return 18; }));
    }

    // ---- KPIs ----
    var K = d.kpis || {};
    var tc = d.topCidades || {};
    aba('DASHBOARD', [
      ['INDICADOR', 'VALOR'],
      ['FORA DO SLA', K.foraSla || 0],
      ['BACKLOG TOTAL', K.backlogTotal || 0],
      ['BACKLOG INDEFINIDO', K.backlogIndef || 0],
      ['PREDITIVA', K.preditiva || 0],
      ['PRODUTIVIDADE (CONCLUÍDAS)', K.produtividade || 0],
      ['SLA GERAL (%)', K.slaGeral || 0],
      ['SITES FORA (TOTAL)', tc.totalSitesFora || 0],
      ['EXTRAÍDO EM', now.toLocaleString('pt-BR')]
    ], [40, 20]);

    var tasksE = (pageData && pageData.tasksEnriched) || [];
    var incE   = (pageData && pageData.incidentsEnriched) || [];
    var sep    = dom.separarTicketsManuais(tasksE);
    var ticketsCorretiva = sep.tickets, manuaisFull = sep.manuais;

    var colsTask = [
      { k:'osNumero', h:'TSK', w:20 }, { k:'status', h:'STATUS', w:14 }, { k:'prioridade', h:'PRIORIDADE', w:12 },
      { k:'regiao', h:'REGIÃO', w:16 }, { k:'cidade', h:'CIDADE', w:20 }, { k:'enderecoId', h:'END_ID', w:16 },
      { k:'siteId', h:'SITE', w:16 }, { k:'tipoFalha', h:'TIPO FALHA', w:22 }, { k:'filaAtual', h:'FILA ATUAL', w:40 },
      { k:'dataCriacao', h:'CRIAÇÃO', w:18, dt:1 }, { k:'vencimentoCalc', h:'VENCIMENTO SLA', w:18, dt:1 },
      { k:'statusSla', h:'STATUS SLA', w:16 }, { k:'tipoAtividade', h:'TIPO ATIVIDADE', w:30 }
    ];

    // ---- Backlog ----
    abaLista('BACKLOG', tasksE.filter(function(t){ return dom.isBacklogStatus(t.status); }),
      colsTask, colsTask.map(function(c){ return c.w||18; }));

    // ---- Concluídas ----
    abaLista('CONCLUÍDAS', ticketsCorretiva.filter(function(t){
      var s=(t.status||'').toUpperCase().trim(); return s==='CONCLUÍDA'||s==='CONCLUIDA';
    }), [
      {k:'osNumero',h:'TSK',w:20},{k:'status',h:'STATUS',w:14},{k:'prioridade',h:'PRIORIDADE',w:12},
      {k:'regiao',h:'REGIÃO',w:16},{k:'cidade',h:'CIDADE',w:20},{k:'enderecoId',h:'END_ID',w:16},
      {k:'siteId',h:'SITE',w:16},{k:'tipoFalha',h:'TIPO FALHA',w:22},{k:'filaAtual',h:'FILA ATUAL',w:40},
      {k:'dataCriacao',h:'CRIAÇÃO',w:18,dt:1},{k:'fimCalc',h:'ENCERRAMENTO',w:18,dt:1},
      {k:'vencimentoCalc',h:'VENCIMENTO SLA',w:18,dt:1},{k:'statusSla',h:'STATUS SLA',w:16}
    ].map(function(c){ return c; }), null);

    // ---- Canceladas ----
    abaLista('CANCELADAS', ticketsCorretiva.filter(function(t){
      var s=(t.status||'').toUpperCase().trim(); return s==='CANCELADA'||s==='CANCELADO';
    }).map(function(t){
      var m=(t.motivoCancelamento||'').toString().toUpperCase();
      return Object.assign({},t,{tipoCancelamento:m.indexOf('ASSOCIA')>=0?'ASSOCIAÇÃO':'AUTOMAÇÃO'});
    }), [
      {k:'osNumero',h:'TSK',w:20},{k:'tipoCancelamento',h:'TIPO CANCELAMENTO',w:20},{k:'prioridade',h:'PRIORIDADE',w:12},
      {k:'regiao',h:'REGIÃO',w:16},{k:'cidade',h:'CIDADE',w:20},{k:'enderecoId',h:'END_ID',w:16},
      {k:'siteId',h:'SITE',w:16},{k:'tipoFalha',h:'TIPO FALHA',w:22},{k:'filaAtual',h:'FILA ATUAL',w:40},
      {k:'dataCriacao',h:'CRIAÇÃO',w:18,dt:1}
    ], null);

    // ---- Atividades Manuais ----
    abaLista('ATIVIDADES MANUAIS', manuaisFull, [
      {k:'osNumero',h:'TSK',w:20},{k:'tipoAtividade',h:'TIPO ATIVIDADE',w:30},{k:'status',h:'STATUS',w:14},
      {k:'regiao',h:'REGIÃO',w:16},{k:'cidade',h:'CIDADE',w:20},{k:'enderecoId',h:'END_ID',w:16},
      {k:'siteId',h:'SITE',w:16},{k:'filaAtual',h:'FILA ATUAL',w:40},{k:'dataCriacao',h:'CRIAÇÃO',w:18,dt:1}
    ], null);

    // ---- Sites Fora (detalhado) ----
    var incAtivos = incE.filter(function(i){ return (i.statusTrat||'ATIVO').toUpperCase()!=='RESOLVIDO'; });
    abaLista('SITES FORA', incAtivos, [
      {k:'horario',h:'HORÁRIO',w:12},{k:'downtime',h:'DURAÇÃO',w:10},{k:'site',h:'SITE',w:20},
      {k:'enderecoId',h:'END_ID',w:16},{k:'anf',h:'ANF',w:8},{k:'cidadeUf',h:'CIDADE/UF',w:22},
      {k:'regiao',h:'REGIÃO',w:16},
      {k:'causa',h:'CAUSA',w:30},{k:'causaGrupo',h:'CAUSA GRUPO',w:20},
      {k:'detalhe',h:'DETALHE',w:40},{k:'previsao',h:'PREVISÃO',w:14},
      {k:'statusTrat',h:'STATUS TRAT.',w:16},{k:'infra',h:'INFRA',w:14},{k:'peso',h:'PESO',w:8}
    ], null);

    // ---- Backlog por região (resumo) ----
    abaLista('SLA POR REGIÃO', d.slaPorRegiao||[], [
      {k:'label',h:'REGIÃO',w:20},{k:'dentro',h:'DENTRO DO SLA',w:16},{k:'fora',h:'FORA DO SLA',w:16}
    ], [20,16,16]);

    abaLista('PRAZOS A VENCER', d.prazosVencimento||[], [
      {k:'label',h:'FAIXA',w:14},{k:'total',h:'TOTAL',w:10}
    ], [14,10]);

    abaLista('AGING BACKLOG', d.aging||[], [
      {k:'label',h:'FAIXA',w:14},{k:'total',h:'TOTAL',w:10}
    ], [14,10]);

    abaLista('SITES FORA POR REGIÃO', d.sitesForaRegiao||[], [
      {k:'label',h:'REGIÃO',w:20},{k:'total',h:'TOTAL',w:10}
    ], [20,10]);

    abaLista('PRODUTIVIDADE', d.produtividade||[], [
      {k:'categoria',h:'CATEGORIA',w:20},{k:'dentro',h:'DENTRO DO SLA',w:16},
      {k:'fora',h:'FORA DO SLA',w:16},{k:'preditiva',h:'PREDITIVA',w:14}
    ], null);

    var ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    XLSX.writeFile(wb, 'Dashboard_TRJ_' + ts + '.xlsx');
    U.toast('Excel exportado com ' + (tasksE.length+incAtivos.length) + ' registros em ' + wb.SheetNames.length + ' abas!', 'ok');
  }
    if (typeof XLSX === 'undefined') { U.toast('Biblioteca de Excel não carregou. Recarregue a página.', 'err'); return; }

})(window.TRJ = window.TRJ || {});
