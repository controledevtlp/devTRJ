/* =====================================================================
 * Página: Importar dados
 * ---------------------------------------------------------------------
 * Carrega as TAREFAS a partir dos arquivos "Atividades-TRJ_FMMT" da pasta
 * de Downloads. Dois caminhos: leitura automática (Chrome/Edge) ou upload
 * manual (qualquer navegador).
 *
 * A leitura automática verifica a pasta sozinha a cada
 * F.getMonitorIntervalMs() (45s por padrão — ver files.js). Toda vez que
 * lê com sucesso, os arquivos usados (agendada + não-agendada) são
 * movidos para a subpasta "Importados" dentro da própria pasta
 * conectada, pra não confundir com os próximos downloads.
 *
 * Os INCIDENTES (Sites Fora) podem ser importados de três formas:
 *   • colando o texto/HTML do painel G.E.N.E.S.I.S em um campo de texto;
 *   • anexando o arquivo do painel G.E.N.E.S.I.S;
 *   • clicando em "Buscar automaticamente" — chama a Ponte TRJ local
 *     (servidor que roda na sua máquina enquanto conectado na VPN e
 *     busca direto na página do painel, sem precisar de nenhum
 *     executável extra).
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, FS = TRJ.files, G = TRJ.genesis, Comp = TRJ.compute;

  // Endereço da Ponte TRJ local (ver ponte_trj.py). Só funciona com o
  // servidor local rodando e a VPN da empresa conectada.
  var PONTE_URL = 'http://localhost:5057/api/incidentes';

  // Processa um texto/HTML do G.E.N.E.S.I.S e atualiza os incidentes.
  // Importante: salva SEMPRE os incidentes completos (não agrupados) — o
  // agrupamento por END_ID é só uma forma de visualização na página
  // "Sites Fora", pra não distorcer nenhuma contagem (dashboard, resumo etc.).
  async function processarGenesis(html, data, app, origemLabel) {
    if (!html || !html.trim()) { U.toast('Cole o conteúdo do painel G.E.N.E.S.I.S primeiro.', 'err'); return false; }
    try {
      U.loading(true);
      if (!G.ehGenesisHtml(html)) { U.toast('O conteúdo não parece ser do painel G.E.N.E.S.I.S.', 'err'); return false; }
      var genesisRows = G.parseGenesisHtml(html);
      if (!genesisRows.length) { U.toast('Nenhum incidente encontrado no conteúdo informado.', 'err'); return false; }
      var ids = genesisRows.map(function (r) { return (r.enderecoId || r.site || '').toString().toUpperCase(); }).filter(Boolean);
      var validMap = (data && data.validMap) || {};
      if (ids.length) {
        try { var lk = await TRJ.api.lookupCities(ids); validMap = Object.assign({}, validMap, (lk && lk.map) || {}); }
        catch (e) { /* sem backend de cidades: segue sem enriquecimento */ }
      }
      var incidentes = Comp.genesisToIncidents(genesisRows, validMap);
      FS.setIncidents(incidentes, { origem: origemLabel || 'genesis', em: new Date().toISOString() });
      await app.reloadIncidents();
      U.toast(incidentes.length + ' incidente(s) importado(s).', 'ok');
      app.render();
      return true;
    } catch (e) {
      U.toast(e.message || 'Erro ao importar incidentes.', 'err');
      return false;
    } finally {
      U.loading(false);
    }
  }

  // Converte as linhas devolvidas pela Ponte local (busca direta no
  // painel, sem depender de nenhum .exe) para o mesmo formato que
  // parseGenesisHtml() produz, pra reaproveitar Comp.genesisToIncidents()
  // sem duplicar lógica. A ponte devolve bem mais campos do que o
  // parser de HTML colado consegue pegar (ex.: statusEvento real, anf
  // numérico, tecnologia direta da coluna, nota de abertura) — usamos
  // o que for útil e combinamos o resto em "detalhe".
  function genesisRowsFromPonte(rows) {
    return (rows || []).map(function (r) {
      var detalhePartes = [r.detalhe, r.falha, r.notaAbertura].filter(Boolean);
      return {
        site: r.site || null,
        horario: r.horario || null,
        downtime: r.duracao || null,
        gsbi: null,
        qtdFurtos: 0,
        qtdCelulas: 0,
        tecnologia: r.tecnologia || null,
        enderecoId: r.endId || null,
        anf: r.anf || r.anfLabel || null,
        cidadeUf: r.cidadeUf || null,
        infra: r.infra || null,
        eve: r.eve || null,
        statusEvento: r.statusEvento || null,
        previsao: r.previsao || null,
        causa: r.causa || null,
        detalhe: detalhePartes.length ? detalhePartes.join(' | ') : null,
        alarme: r.alarmeCompleto || r.alarme || null,
        peso: parseInt(r.peso, 10) || 0
      };
    });
  }

  // Busca os incidentes automaticamente via Ponte TRJ local (que por sua
  // vez executa o puxar_dados.exe). Requer VPN conectada e a ponte rodando.
  async function buscarAutomatico(data, app) {
    try {
      U.loading(true);
      var resp;
      try {
        resp = await fetch(PONTE_URL, { method: 'GET' });
      } catch (e) {
        U.toast('Não consegui falar com a Ponte TRJ local. Ela está rodando (iniciar_ponte_trj.bat) e você está conectado na VPN?', 'err');
        return false;
      }
      var json = await resp.json().catch(function () { return null; });
      if (!resp.ok || !json || json.erro) {
        U.toast((json && json.erro) || ('A Ponte TRJ retornou um erro (HTTP ' + resp.status + ').'), 'err');
        return false;
      }
      var genesisRows = genesisRowsFromPonte(json.incidentes);
      if (!genesisRows.length) { U.toast('A busca automática não retornou nenhum incidente.', 'err'); return false; }

      var ids = genesisRows.map(function (r) { return (r.enderecoId || r.site || '').toString().toUpperCase(); }).filter(Boolean);
      var validMap = (data && data.validMap) || {};
      if (ids.length) {
        try { var lk = await TRJ.api.lookupCities(ids); validMap = Object.assign({}, validMap, (lk && lk.map) || {}); }
        catch (e) { /* sem backend de cidades: segue sem enriquecimento */ }
      }
      var incidentes = Comp.genesisToIncidents(genesisRows, validMap);
      FS.setIncidents(incidentes, { origem: 'genesis-auto', em: new Date().toISOString() });
      await app.reloadIncidents();
      U.toast(incidentes.length + ' incidente(s) importado(s) automaticamente.', 'ok');
      app.render();
      return true;
    } catch (e) {
      U.toast(e.message || 'Erro ao buscar incidentes automaticamente.', 'err');
      return false;
    } finally {
      U.loading(false);
    }
  }

  TRJ.pages.importar = function (container, ctx) {
    var app = ctx.app;
    var data = ctx.data || {};
    var meta = FS.getMeta();
    var tMeta = meta.tasks || {};
    var nTasks = FS.getTasks().length;
    var nInc = FS.getIncidents().length;
    var intervaloSeg = Math.round((FS.getMonitorIntervalMs ? FS.getMonitorIntervalMs() : 45000) / 1000);

    container.appendChild(U.pageHeader('Importar dados',
      'Carregue as tarefas e os incidentes para liberar o restante do sistema.'));

    // ---- status compacto (com ícones) ----
    container.appendChild(U.h('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-3 mb-7' }, [
      U.kpiCard({ label: '📋 Tarefas', value: U.fmtNum(nTasks), cor: C.CORES_TRJ.orange }),
      U.kpiCard({ label: '🚨 Incidentes', value: U.fmtNum(nInc), cor: C.CORES_TRJ.blue }),
      U.kpiCard({ label: '📥 Origem das tarefas', value: tMeta.origem === 'pasta' ? 'Pasta automática' : (tMeta.origem === 'upload' ? 'Upload manual' : '—'), cor: C.CORES_TRJ.green }),
      U.kpiCard({ label: '🕒 Atualizado em', value: tMeta.em ? new Date(tMeta.em).toLocaleDateString('pt-BR') : '—', sub: tMeta.em ? new Date(tMeta.em).toLocaleTimeString('pt-BR') : null, cor: '#8b5cf6' })
    ]));

    // =====================================================================
    // SEÇÃO 1 — TAREFAS (ATIVIDADES)
    // =====================================================================
    container.appendChild(secaoTitulo('📋 Tarefas (Atividades)', C.CORES_TRJ.orange));

    var tarefasGrid = U.h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8' });

    // --- dois slots de upload independentes ---
    var slots = FS.getSlotInfo();  // { ag: {nome,qtd,em} | null, na: {nome,qtd,em} | null }

    function makeSlot(opts) {
      // opts: { tipo:'ag'|'na', label, icon, filtro, slotInfo, onClear }
      var si = opts.slotInfo;
      var card = U.h('div', { class: 'trj-card p-4 flex flex-col gap-3' });

      // Cabeçalho do slot
      var hdr = U.h('div', { class: 'flex items-center justify-between' }, [
        U.h('div', { class: 'flex items-center gap-2 text-sm font-bold' }, [
          U.h('span', { text: opts.icon }),
          U.h('span', { text: opts.label })
        ]),
        si ? U.h('button', {
          class: 'trj-btn trj-btn-ghost clickable',
          style: { fontSize: '11px', padding: '2px 8px', color: '#e74c3c' },
          text: '✕ Remover',
          onclick: async function () {
            opts.onClear();
            await app.refresh(true);
            app.render();
            U.toast('Slot removido.', 'ok');
          }
        }) : null
      ]);
      card.appendChild(hdr);

      // Status atual do slot
      if (si) {
        var nomeCurto = si.nome.replace(/Atividades-TRJ_FMMT_?/i, '').replace(/\.xlsx?$/i, '') || si.nome;
        card.appendChild(U.h('div', {
          class: 'flex items-center gap-2 p-2 rounded',
          style: { background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.25)', fontSize: '12px' }
        }, [
          U.h('span', { text: '✅' }),
          U.h('div', { class: 'flex flex-col' }, [
            U.h('span', { style: { fontWeight: '700', color: 'var(--trj-green)' }, text: nomeCurto }),
            U.h('span', { style: { color: 'var(--trj-muted)', fontSize: '11px' } },
              U.fmtNum(si.qtd) + ' tarefa(s) · ' + (si.em ? new Date(si.em).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : ''))
          ])
        ]));
      }

      // Dropzone para upload
      var dz = U.dropzone({
        icon: si ? '🔄' : '📂',
        title: si ? 'Atualizar este arquivo' : 'Arraste o arquivo aqui',
        sub: 'ou clique para selecionar — <b>' + opts.filtroLabel + '</b> (.xlsx)',
        accept: '.xlsx,.xls', multiple: false,
        statusOk: false,
        onFile: async function (files) {
          // Normaliza para array (o dropzone pode passar File único ou FileList)
          var filesArray = (files instanceof File) ? [files]
                         : (files && typeof files[Symbol.iterator] === 'function') ? Array.from(files)
                         : [files];
          // Filtrar só o tipo correto
          var validos = filesArray.filter(function (f) {
            if (!f || !f.name) return false;
            var isNa = FS.isNaoAgendada ? FS.isNaoAgendada(f.name) : (f.name.toLowerCase().indexOf('nao') >= 0 && f.name.toLowerCase().indexOf('agendad') >= 0);
            return opts.tipo === 'na' ? isNa : !isNa;
          });
          if (!validos.length) {
            U.toast('O arquivo não corresponde a este slot (' + opts.label + ').', 'err');
            return;
          }
          try {
            U.loading(true, 'Lendo planilha...');
            var r = await FS.readManualFiles(validos, function (msg) { U.loading(true, msg); });
            await app.refresh(true);
            U.toast(r.total + ' tarefa(s) total após atualização.', 'ok');
            app.render();
          } catch (e) { U.toast(e.message || 'Erro ao ler o arquivo.', 'err'); }
          finally { U.loading(false); }
        }
      });
      card.appendChild(dz);
      return card;
    }

    // Slot 1 — Agendada (arquivo com data de hoje)
    tarefasGrid.appendChild(makeSlot({
      tipo: 'ag', label: 'Planilha agendada (data de hoje)', icon: '📅',
      filtroLabel: 'Atividades-TRJ_FMMT_DD_MM_AA',
      slotInfo: slots.ag,
      onClear: function () { FS.clearSlotAg(); }
    }));

    // Slot 2 — Não-agendada
    tarefasGrid.appendChild(makeSlot({
      tipo: 'na', label: 'Planilha não-agendada', icon: '📋',
      filtroLabel: 'Atividades-TRJ_FMMT_Não-agendada',
      slotInfo: slots.na,
      onClear: function () { FS.clearSlotNa(); }
    }));

    // --- leitura automática da pasta ---
    var pastaCard = U.h('div', { class: 'trj-card p-5 flex flex-col gap-3' });
    pastaCard.appendChild(U.h('h3', { class: 'text-sm font-bold flex items-center gap-2' }, [
      U.h('span', { text: '🔄' }), U.h('span', { text: 'Leitura automática da pasta' })
    ]));
    if (!FS.supportsDirectoryPicker()) {
      pastaCard.appendChild(U.h('p', { class: 'text-xs', style: { color: 'var(--trj-muted)' }, html: 'Disponível só no <b>Chrome</b> ou <b>Edge</b>. Use o upload manual ao lado.' }));
    } else {
      var statusPasta = infoRow('📁', 'Buscando pasta conectada...', 'var(--trj-muted)');
      pastaCard.appendChild(statusPasta);
      FS.folderName().then(function (nome) {
        setInfoRow(statusPasta, '📁', nome ? (nome + ' — pronta para leitura') : 'Nenhuma pasta conectada ainda.', nome ? 'var(--trj-green)' : 'var(--trj-muted)');
      });
      // duas linhas informativas fixas, com ícone — deixam claro o
      // comportamento automático sem precisar abrir nenhum menu.
      pastaCard.appendChild(infoRow('⏱', 'Verifica automaticamente a cada ' + intervaloSeg + 's', 'var(--trj-muted)'));
      pastaCard.appendChild(infoRow('📦', 'Arquivos lidos são movidos para a subpasta "Importados/"', 'var(--trj-muted)'));

      var btnVerificar = U.h('button', {
        class: 'trj-btn trj-btn-primary clickable', html: app.icon('refresh') + ' Verificar agora',
        onclick: async function () {
          try {
            U.loading(true, 'Verificando pasta...');
            var r = await FS.scanFolder(function (msg) { U.loading(true, msg); });
            await app.refresh(true);
            U.toast(r.unchanged ? 'Sem novidades — já está atualizado.' : (r.total + ' tarefa(s) carregada(s).'), 'ok');
            app.render();
          } catch (e) { U.toast(e.message || 'Erro ao ler a pasta.', 'err'); }
          finally { U.loading(false); }
        }
      });
      var btnConectar = U.h('button', {
        class: 'trj-btn trj-btn-ghost clickable', html: '🔗 Conectar outra pasta...',
        onclick: async function () {
          try {
            U.loading(true, 'Abrindo seletor de pasta...');
            var nome = await FS.pickFolder();
            U.toast('Pasta conectada: ' + nome, 'ok');
            var r = await FS.scanFolder(function (msg) { U.loading(true, msg); });
            await app.refresh(true);
            U.toast(r.total + ' tarefa(s) carregada(s).', 'ok');
            app.navigate('#/importar'); app.render();
          } catch (e) { if (!(e && e.name === 'AbortError')) U.toast(e.message || 'Erro ao conectar pasta.', 'err'); }
          finally { U.loading(false); }
        }
      });
      pastaCard.appendChild(U.h('div', { class: 'flex gap-2 flex-wrap mt-1' }, [btnVerificar, btnConectar]));
      pastaCard.appendChild(U.h('p', { class: 'text-xs mt-1', style: { color: 'var(--trj-muted)' }, text: '💡 Pasta de Downloads com muitos arquivos antigos deixa a verificação mais lenta — conectar uma pasta menor e dedicada ajuda.' }));
    }
    tarefasGrid.appendChild(pastaCard);
    container.appendChild(tarefasGrid);

    // =====================================================================
    // SEÇÃO 2 — INCIDENTES (SITES FORA)
    // =====================================================================
    container.appendChild(secaoTitulo('🚨 Incidentes (Sites Fora)', C.CORES_TRJ.blue));

    // --- ação primária: busca automática, em destaque ---
    var autoCard = U.h('div', {
      class: 'trj-card p-6 mb-3',
      style: { border: '1px solid rgba(46,204,113,.3)', background: 'rgba(46,204,113,.05)' }
    });
    autoCard.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-1' }, [
      U.h('span', { class: 'trj-pulse-dot' }),
      U.h('h3', { class: 'text-base font-bold flex items-center gap-2' }, [U.h('span', { text: '📡' }), U.h('span', { text: 'Buscar incidentes automaticamente' })])
    ]));
    autoCard.appendChild(U.h('p', { class: 'text-xs mb-4', style: { color: 'var(--trj-muted)' }, text: 'Conecte-se à VPN da empresa, deixe a Ponte TRJ local aberta, e clique no botão — sem copiar nem colar nada.' }));
    autoCard.appendChild(U.h('button', {
      class: 'trj-btn trj-btn-lg clickable', style: { background: C.CORES_TRJ.green, borderColor: C.CORES_TRJ.green, color: '#0a160f' },
      html: '🔄 Buscar incidentes agora', onclick: function () { buscarAutomatico(data, app); }
    }));
    container.appendChild(autoCard);

    // --- opções manuais, escondidas por padrão (<details> nativo: some sem perder o texto digitado) ---
    var details = U.h('details', { class: 'trj-details trj-card p-5' });
    details.appendChild(U.h('summary', { html: '✍️ Prefere importar manualmente?' }));

    var manualBody = U.h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4 mt-1' });

    var colCol = U.h('div', { class: 'flex flex-col gap-2' });
    colCol.appendChild(U.h('div', { class: 'text-xs flex items-center gap-1', style: { color: 'var(--trj-muted)' } }, [U.h('span', { text: '📋' }), U.h('span', { text: 'Colar o conteúdo da página:' })]));
    var txt = U.h('textarea', { class: 'trj-input w-full', rows: '6', placeholder: 'Cole aqui o conteúdo do painel G.E.N.E.S.I.S (Ctrl+V)...', style: { fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' } });
    var btnTxt = U.h('button', { class: 'trj-btn trj-btn-primary clickable', html: '⬆️ Importar texto colado', onclick: async function () {
      var ok = await processarGenesis(txt.value, data, app, 'genesis-texto');
      if (ok) txt.value = '';
    } });
    var btnTxtLimpar = U.h('button', { class: 'trj-btn trj-btn-ghost clickable', html: '🧹 Limpar', onclick: function () { txt.value = ''; } });
    colCol.appendChild(txt);
    colCol.appendChild(U.h('div', { class: 'flex gap-2 flex-wrap' }, [btnTxt, btnTxtLimpar]));
    manualBody.appendChild(colCol);

    var incDz = U.dropzone({
      icon: '📎', title: 'Anexar arquivo do painel',
      sub: 'Página salva (.html) ou exportada (.xls/.xlsx) do G.E.N.E.S.I.S',
      accept: '.html,.htm,.xls,.xlsx',
      statusText: 'Aguardando arquivo...',
      onFile: function (file) {
        var reader = new FileReader();
        reader.onload = function () { processarGenesis(reader.result, data, app, 'genesis-arquivo'); };
        reader.readAsText(file, 'UTF-8');
      }
    });
    manualBody.appendChild(incDz);
    details.appendChild(manualBody);
    container.appendChild(details);

    // =====================================================================
    // RODAPÉ — limpar dados
    // =====================================================================
    container.appendChild(U.h('div', { class: 'flex gap-2 flex-wrap mt-7' }, [
      U.h('button', { class: 'trj-btn trj-btn-ghost clickable', html: '🗑️ Limpar tarefas', onclick: function () {
        if (!confirm('Remover todas as tarefas carregadas?')) return;
        FS.clearTasks(); app.refresh(true).then(function () { app.render(); }); U.toast('Tarefas removidas.', 'ok');
      } }),
      U.h('button', { class: 'trj-btn trj-btn-ghost clickable', html: '🗑️ Limpar incidentes', onclick: function () {
        if (!confirm('Remover todos os incidentes carregados?')) return;
        FS.clearIncidents(); app.refresh(true).then(function () { app.render(); }); U.toast('Incidentes removidos.', 'ok');
      } })
    ]));
  };

  // título de seção com marcador colorido (reaproveita o ponto do trj-chart-dot)
  function secaoTitulo(texto, cor) {
    return U.h('h2', { class: 'text-xs font-bold uppercase mb-3', style: { color: 'var(--trj-muted)', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', gap: '8px' } }, [
      U.h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: cor, boxShadow: '0 0 10px ' + cor, display: 'inline-block', flexShrink: '0' } }),
      U.h('span', { text: texto })
    ]);
  }

  // linha de info compacta (ícone + texto colorido) — usada nos status da
  // leitura automática (pasta conectada, intervalo, arquivamento).
  function infoRow(icone, texto, cor) {
    var row = U.h('div', { class: 'text-xs flex items-center gap-2', style: { color: cor || 'var(--trj-muted)' } }, [
      U.h('span', { class: 'trj-info-icon', text: icone }),
      U.h('span', { class: 'trj-info-text', text: texto })
    ]);
    return row;
  }
  function setInfoRow(row, icone, texto, cor) {
    row.style.color = cor || 'var(--trj-muted)';
    var ic = row.querySelector('.trj-info-icon'); if (ic) ic.textContent = icone;
    var tx = row.querySelector('.trj-info-text'); if (tx) tx.textContent = texto;
  }
})(window.TRJ = window.TRJ || {});
