/* =====================================================================
 * Página: Cadastro de Cidades / Sites
 * ---------------------------------------------------------------------
 * Formulário para cadastrar sites encontrados sem região no VALID_CAD.
 *
 * Mapeamento de colunas (novo):
 *   A = Cidade   B = END_ID   C = Site
 *   D/E/F = dinâmicos (valores únicos já existentes na planilha)
 *   G = cópia de B (END_ID)   H = cópia de A (Cidade)
 *
 * As opções dos selects D, E, F são carregadas via getValidCadOptions
 * (action do Apps Script que lê os valores únicos das colunas reais).
 * ===================================================================== */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui;

  var LS_SITES = 'trj_sites';

  // Cache de opções dinâmicas — carregado uma vez por sessão de navegação.
  // Estrutura: { headers: {D,E,F}, options: {D:[...], E:[...], F:[...]} }
  var _cadOptions = null;

  function lerSites() {
    try { return JSON.parse(localStorage.getItem(LS_SITES) || '[]') || []; }
    catch (e) { return []; }
  }

  // ---- Carrega opções dinâmicas (D, E, F) do backend ----
  async function carregarOpcoes() {
    if (_cadOptions) return _cadOptions;
    try {
      var res = await TRJ.api.getValidCadOptions();
      _cadOptions = res || { headers: { D: 'Coluna D', E: 'Coluna E', F: 'Coluna F' }, options: { D: [], E: [], F: [] } };
    } catch (e) {
      _cadOptions = { headers: { D: 'Coluna D', E: 'Coluna E', F: 'Coluna F' }, options: { D: [], E: [], F: [] } };
    }
    return _cadOptions;
  }

  // Monta um <select> com os valores da coluna (mais opção "— em branco —")
  function selectDinamico(id, valores, cls) {
    var opts = [U.h('option', { value: '', text: '— em branco —' })].concat(
      (valores || []).map(function (v) { return U.h('option', { value: v, text: v }); })
    );
    return U.h('select', { id: id, class: cls || 'trj-select w-full' }, opts);
  }

  // ---- Varredura de sites sem cadastro (regiao = OTHERS) ----
  function coletarSemCadastro(data) {
    var vistos = {}, lista = [];
    function add(endId, site, cidade, origem) {
      var key = (endId || '').toString().trim().toUpperCase();
      if (!key || vistos[key]) return;
      vistos[key] = true;
      lista.push({ end_id: key, site: (site || '').toString().trim(), cidade: (cidade || '').toString().trim(), origem: origem });
    }
    ((data && data.tasksEnriched) || []).forEach(function (t) {
      if ((t.regiao || 'OTHERS') !== 'OTHERS') return;
      if (!TRJ.domain.isTicketCorretiva(t.tipoAtividade)) return;
      add(t.enderecoId, t.siteId, t.cidade, 'Tarefa');
    });
    ((data && data.incidentsEnriched) || []).forEach(function (i) {
      if ((i.regiao || 'OTHERS') !== 'OTHERS') return;
      if ((i.statusTrat || '').toUpperCase() === 'RESOLVIDO') return;
      add(i.enderecoId, i.site, i.cidade || i.cidadeUf, 'Incidente');
    });
    return lista.sort(function (a, b) { return a.end_id.localeCompare(b.end_id); });
  }

  // ---- Card: varredura + cadastro em lote ----
  function buildScanCard(ctx, opts) {
    var data = ctx.data, app = ctx.app;
    var headers = opts.headers || {};
    var options = opts.options || {};

    var card = U.h('div', { class: 'trj-card p-5 mb-5' });
    card.appendChild(U.h('h3', { class: 'text-base font-bold mb-1', text: '🔍 Sites sem cadastro (classificados como "Outros")' }));
    card.appendChild(U.h('p', { class: 'text-xs mb-3', style: { color: 'var(--trj-muted)' }, text: 'Busca tarefas e incidentes ativos sem região cadastrada. Marque os que quer cadastrar, preencha D/E/F e cadastre em lote.' }));

    // Selects D, E, F compartilhados para o cadastro em lote
    var selD = selectDinamico('scan-sel-d', options.D, 'trj-select');
    var selE = selectDinamico('scan-sel-e', options.E, 'trj-select');
    var selF = selectDinamico('scan-sel-f', options.F, 'trj-select');

    var resultWrap = U.h('div', { class: 'mt-3' });
    var statusTxt = U.h('span', { class: 'text-xs', style: { color: 'var(--trj-muted)' } });
    var btnBuscar = U.h('button', {
      class: 'trj-btn trj-btn-primary clickable', text: '🔍 Buscar sites sem cadastro',
      onclick: function () { renderResultado(); }
    });
    card.appendChild(U.h('div', { class: 'flex items-center gap-2 flex-wrap' }, [btnBuscar, statusTxt]));
    card.appendChild(resultWrap);

    var checkboxes = [];

    function renderResultado() {
      var lista = coletarSemCadastro(data);
      resultWrap.innerHTML = '';
      checkboxes = [];
      if (!lista.length) {
        statusTxt.textContent = '';
        resultWrap.appendChild(U.h('div', { class: 'text-sm py-6 text-center', style: { color: 'var(--trj-green)' }, text: '✓ Nenhum site sem cadastro encontrado — tudo classificado!' }));
        return;
      }
      statusTxt.textContent = lista.length + ' site(s) sem cadastro encontrado(s)';

      // Barra de ferramentas com os selects D/E/F
      var colsDEF = U.h('div', { class: 'flex flex-wrap items-center gap-2 flex-1' }, [
        U.h('div', null, [
          U.h('div', { class: 'text-xs mb-1', style: { color: 'var(--trj-muted)' }, text: headers.D || 'Coluna D' }),
          selD
        ]),
        U.h('div', null, [
          U.h('div', { class: 'text-xs mb-1', style: { color: 'var(--trj-muted)' }, text: headers.E || 'Coluna E' }),
          selE
        ]),
        U.h('div', null, [
          U.h('div', { class: 'text-xs mb-1', style: { color: 'var(--trj-muted)' }, text: headers.F || 'Coluna F' }),
          selF
        ])
      ]);
      var toolbar = U.h('div', { class: 'flex items-start gap-3 flex-wrap mt-3 mb-3 p-3 trj-card', style: { borderRadius: '10px' } }, [
        U.h('div', { class: 'flex flex-col gap-2' }, [
          U.h('button', { class: 'trj-btn trj-btn-ghost clickable', style: { fontSize: '12px' }, text: 'Marcar todos', onclick: function () { checkboxes.forEach(function (c) { c.cb.checked = true; }); atualizarContagem(); } }),
          U.h('button', { class: 'trj-btn trj-btn-ghost clickable', style: { fontSize: '12px' }, text: 'Desmarcar todos', onclick: function () { checkboxes.forEach(function (c) { c.cb.checked = false; }); atualizarContagem(); } })
        ]),
        colsDEF
      ]);
      resultWrap.appendChild(toolbar);

      var thSt = { textAlign: 'left', padding: '7px 9px', fontSize: '11px', color: 'var(--trj-muted)', borderBottom: '1px solid var(--trj-border)', textTransform: 'uppercase' };
      var tdSt = { padding: '7px 9px', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,.05)' };
      var head = U.h('tr', null, ['', 'Cidade', 'END_ID', 'Site', 'Origem'].map(function (t) { return U.h('th', { style: thSt, text: t }); }));
      var body = lista.map(function (item) {
        var cb = U.h('input', { type: 'checkbox' });
        checkboxes.push({ item: item, cb: cb });
        cb.addEventListener('change', atualizarContagem);
        return U.h('tr', null, [
          U.h('td', { style: tdSt }, cb),
          U.h('td', { style: tdSt, text: item.cidade || '—' }),
          U.h('td', { style: Object.assign({ fontFamily: 'ui-monospace, monospace' }, tdSt), text: item.end_id }),
          U.h('td', { style: tdSt, text: item.site || '—' }),
          U.h('td', { style: tdSt, text: item.origem })
        ]);
      });
      resultWrap.appendChild(U.h('div', { style: { maxHeight: '360px', overflow: 'auto' } }, [
        U.h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, [U.h('thead', null, [head]), U.h('tbody', null, body)])
      ]));

      var btnCad = U.h('button', {
        class: 'trj-btn trj-btn-primary clickable', text: 'Cadastrar selecionados (0)',
        style: { marginTop: '12px' }, disabled: true,
        onclick: async function () {
          var sel = checkboxes.filter(function (c) { return c.cb.checked; }).map(function (c) { return c.item; });
          if (!sel.length) return;
          btnCad.disabled = true;
          var ok = 0, falhas = 0;
          for (var i = 0; i < sel.length; i++) {
            var it = sel[i];
            try {
              await TRJ.api.saveSite({
                cidade: it.cidade || '',
                end_id: it.end_id,
                site: it.site || '',
                colD: selD.value,
                colE: selE.value,
                colF: selF.value
              });
              ok++;
            } catch (e) { falhas++; }
          }
          U.toast(ok + ' site(s) cadastrado(s)' + (falhas ? ' · ' + falhas + ' falha(s)' : '') + '.', falhas ? 'err' : 'ok');
          if (app && app.refresh) await app.refresh(true);
          if (app && app.render) app.render();
        }
      });
      resultWrap.appendChild(btnCad);

      function atualizarContagem() {
        var n = checkboxes.filter(function (c) { return c.cb.checked; }).length;
        btnCad.textContent = 'Cadastrar selecionados (' + n + ')';
        btnCad.disabled = n === 0;
      }
    }

    return card;
  }

  // bloco label + campo
  function campo(labelTxt, inputEl, full) {
    return U.h('div', { class: full ? 'col-span-2' : '' }, [
      U.h('label', { class: 'text-xs font-bold block mb-1', style: { color: 'var(--trj-muted)' }, text: labelTxt }),
      inputEl
    ]);
  }

  // ---- Card: buscar por END_ID e editar ----
  function buildEditCard(opts) {
    var headers = opts.headers || {};
    var options = opts.options || {};

    var card = U.h('div', { class: 'trj-card p-5 mb-5' });
    card.appendChild(U.h('h3', { class: 'text-base font-bold mb-1', text: '✏️ Buscar / Editar por END_ID' }));
    card.appendChild(U.h('p', { class: 'text-xs mb-3', style: { color: 'var(--trj-muted)' }, text: 'Localiza o site pelo END_ID e permite editar os dados. Ao salvar, todas as linhas com o mesmo END_ID serão atualizadas.' }));

    var inBusca = U.h('input', { class: 'trj-input', style: { width: '220px' }, placeholder: 'Digite o END_ID...' });
    var msgBusca = U.h('span', { class: 'text-xs', style: { color: 'var(--trj-muted)' } });
    var btnBuscar = U.h('button', { class: 'trj-btn trj-btn-primary clickable', text: '🔍 Buscar' });
    var formEdit = U.h('div', { style: { display: 'none', marginTop: '16px' } });

    card.appendChild(U.h('div', { class: 'flex items-center gap-2 flex-wrap mb-2' }, [inBusca, btnBuscar, msgBusca]));
    card.appendChild(formEdit);

    function mostrarForm(rows, endIdBuscado) {
      formEdit.innerHTML = '';
      formEdit.style.display = 'block';

      if (!rows || !rows.length) {
        msgBusca.textContent = 'Nenhum registro encontrado para "' + endIdBuscado + '".';
        msgBusca.style.color = 'var(--trj-red, #e74c3c)';
        formEdit.style.display = 'none';
        return;
      }

      msgBusca.textContent = rows.length + ' linha(s) encontrada(s) — todas serão atualizadas ao salvar.';
      msgBusca.style.color = 'var(--trj-muted)';

      var base = rows[0];

      var inCidade = U.h('input', { class: 'trj-input w-full', value: base.cidade || '', placeholder: 'Cidade' });
      var inEndId  = U.h('input', { class: 'trj-input w-full', value: base.end_id  || '', placeholder: 'END_ID', disabled: true, style: { opacity: '.6', cursor: 'not-allowed' } });
      var inSite   = U.h('input', { class: 'trj-input w-full', value: base.site   || '', placeholder: 'Site' });

      function selEdit(id, valores, valorAtual) {
        var opts2 = [U.h('option', { value: '', text: '— em branco —' })].concat(
          (valores || []).map(function (v) { return U.h('option', { value: v, text: v }); })
        );
        var sel = U.h('select', { id: id, class: 'trj-select w-full' }, opts2);
        sel.value = valorAtual || '';
        return sel;
      }

      var selD = selEdit('edit-sel-d', options.D, base.colD);
      var selE = selEdit('edit-sel-e', options.E, base.colE);
      var selF = selEdit('edit-sel-f', options.F, base.colF);

      var msgSave = U.h('div', { class: 'text-xs mt-2', style: { minHeight: '18px', color: 'var(--trj-muted)' } });

      var btnSalvar = U.h('button', {
        class: 'trj-btn trj-btn-primary clickable', text: 'Salvar alterações',
        onclick: async function () {
          var row = {
            cidade: (inCidade.value || '').trim(),
            site:   (inSite.value   || '').trim(),
            colD: selD.value,
            colE: selE.value,
            colF: selF.value
          };
          btnSalvar.disabled = true;
          try {
            var res = await TRJ.api.updateSite(endIdBuscado, row);
            var n = res && res.updated != null ? res.updated : '?';
            msgSave.textContent = '✓ ' + n + ' linha(s) atualizadas com sucesso.';
            msgSave.style.color = 'var(--trj-green, #2ecc71)';
            U.toast(n + ' linha(s) atualizadas.', 'ok');
          } catch (e) {
            msgSave.textContent = e && e.message ? e.message : 'Erro ao atualizar.';
            msgSave.style.color = 'var(--trj-red, #e74c3c)';
            U.toast('Erro ao atualizar.', 'err');
          } finally { btnSalvar.disabled = false; }
        }
      });

      var btnCancelar = U.h('button', {
        class: 'trj-btn trj-btn-ghost clickable', text: 'Cancelar',
        onclick: function () { formEdit.style.display = 'none'; formEdit.innerHTML = ''; inBusca.value = ''; msgBusca.textContent = ''; }
      });

      formEdit.appendChild(U.h('div', { class: 'trj-card p-4', style: { borderColor: 'rgba(255,140,0,0.25)' } }, [
        U.h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-4' }, [
          campo('CIDADE', inCidade),
          campo('END_ID', inEndId),
          campo('SITE', inSite, true),
          campo(headers.D || 'Coluna D', selD),
          campo(headers.E || 'Coluna E', selE),
          campo(headers.F || 'Coluna F', selF)
        ]),
        U.h('div', { class: 'flex gap-2 flex-wrap' }, [btnSalvar, btnCancelar]),
        msgSave
      ]));
    }

    async function executarBusca() {
      var endId = (inBusca.value || '').trim().toUpperCase();
      if (!endId) { msgBusca.textContent = 'Digite um END_ID para buscar.'; msgBusca.style.color = 'var(--trj-red, #e74c3c)'; return; }
      msgBusca.textContent = 'Buscando...';
      msgBusca.style.color = 'var(--trj-muted)';
      formEdit.style.display = 'none';
      formEdit.innerHTML = '';
      btnBuscar.disabled = true;
      try {
        var res = await TRJ.api.searchSite(endId);
        mostrarForm(res && res.rows ? res.rows : [], endId);
      } catch (e) {
        msgBusca.textContent = e && e.message ? e.message : 'Erro na busca.';
        msgBusca.style.color = 'var(--trj-red, #e74c3c)';
      } finally { btnBuscar.disabled = false; }
    }

    btnBuscar.addEventListener('click', executarBusca);
    inBusca.addEventListener('keydown', function (e) { if (e.key === 'Enter') executarBusca(); });

    return card;
  }

  TRJ.pages.cadastro = async function (container, ctx) {
    container.appendChild(U.pageHeader('Cadastro de Cidades',
      'Gerencie os sites encontrados sem região no VALID_CAD.'));

    // Mostra um spinner enquanto carrega as opções do backend
    var loadingEl = U.h('div', { class: 'trj-card p-6 mb-5 text-sm', style: { color: 'var(--trj-muted)' }, text: '⏳ Carregando opções do banco de dados...' });
    container.appendChild(loadingEl);

    var opts = await carregarOpcoes();
    loadingEl.remove();

    container.appendChild(buildScanCard(ctx, opts));
    container.appendChild(buildEditCard(opts));

    // ---- Formulário de cadastro manual ----
    var headers = opts.headers || {};
    var options = opts.options || {};

    var inCidade = U.h('input', { class: 'trj-input w-full', placeholder: 'Ex.: Rio de Janeiro' });
    var inEndId  = U.h('input', { class: 'trj-input w-full', placeholder: 'Ex.: RJCEN_001' });
    var inSite   = U.h('input', { class: 'trj-input w-full', placeholder: 'Nome / identificação do site' });
    var selD     = selectDinamico('form-sel-d', options.D);
    var selE     = selectDinamico('form-sel-e', options.E);
    var selF     = selectDinamico('form-sel-f', options.F);

    var msg = U.h('div', { class: 'text-sm mt-1', style: { color: 'var(--trj-muted)', minHeight: '20px' } });

    var btnSalvar = U.h('button', { class: 'trj-btn trj-btn-primary clickable', text: 'Salvar',
      onclick: async function () {
        var row = {
          cidade: (inCidade.value || '').trim(),
          end_id: (inEndId.value || '').trim(),
          site: (inSite.value || '').trim(),
          colD: selD.value,
          colE: selE.value,
          colF: selF.value
        };
        if (!row.end_id && !row.site && !row.cidade) {
          msg.textContent = 'Preencha ao menos Cidade, END_ID ou Site.';
          msg.style.color = 'var(--trj-red, #e74c3c)'; return;
        }
        btnSalvar.disabled = true;
        try {
          await TRJ.api.saveSite(row);
          msg.textContent = 'Site salvo com sucesso.';
          msg.style.color = 'var(--trj-green, #2ecc71)';
          U.toast('Site cadastrado.', 'ok');
          inCidade.value = ''; inEndId.value = ''; inSite.value = '';
          selD.selectedIndex = 0; selE.selectedIndex = 0; selF.selectedIndex = 0;
          msg.textContent = '';
        } catch (e) {
          msg.textContent = e && e.message ? e.message : 'Erro ao salvar o site.';
          msg.style.color = 'var(--trj-red, #e74c3c)';
          U.toast('Erro ao salvar o site.', 'err');
        } finally { btnSalvar.disabled = false; }
      }
    });
    var btnLimpar = U.h('button', { class: 'trj-btn trj-btn-ghost clickable', text: 'Limpar',
      onclick: function () { inCidade.value = ''; inEndId.value = ''; inSite.value = ''; selD.selectedIndex = 0; selE.selectedIndex = 0; selF.selectedIndex = 0; msg.textContent = ''; }
    });

    var form = U.h('div', { class: 'trj-card p-5 mb-5' }, [
      U.h('h3', { class: 'text-base font-bold mb-3', text: 'Cadastro manual' }),
      U.h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-4' }, [
        campo('CIDADE', inCidade),
        campo('END_ID', inEndId),
        campo('SITE', inSite, true),
        campo(headers.D || 'Coluna D', selD),
        campo(headers.E || 'Coluna E', selE),
        campo(headers.F || 'Coluna F', selF)
      ]),
      U.h('div', { class: 'flex gap-2 flex-wrap mt-4' }, [btnSalvar, btnLimpar]),
      msg
    ]);
    container.appendChild(form);
  };
})(window.TRJ = window.TRJ || {});
