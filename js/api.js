/* =====================================================================
 * api.js  —  CLIENTE DE COMUNICAÇÃO COM O APPS SCRIPT
 * ---------------------------------------------------------------------
 * Faz todas as chamadas para o backend (a Planilha Google via Apps Script).
 * Usa Content-Type "text/plain" de propósito: assim o navegador NÃO faz
 * a requisição extra de "preflight" (OPTIONS), que o Apps Script não
 * sabe responder. O corpo continua sendo um JSON.
 *
 * MODO OFFLINE (sem backend):
 * ---------------------------------------------------------------------
 * Se a URL do Apps Script (js/config.js) estiver em branco, o site
 * continua funcionando 100% no navegador, lendo as planilhas pelos
 * uploads (TRJ.files). Nesse caso:
 *   • login            -> aceita qualquer credencial (token local)
 *   • getConfig/setConfig -> usa o localStorage do navegador
 *   • lookupCities     -> retorna mapa vazio (sem enriquecimento de cidade)
 * Quando a URL é preenchida, o comportamento volta a ser 100% backend.
 * ===================================================================== */
(function (TRJ) {
  var A = {};
  var LS_CFG = 'trj_config_offline';

  function getUrl() {
    var u = (TRJ.config && TRJ.config.APPS_SCRIPT_URL || '').trim();
    return u;
  }
  function offline() { return !getUrl(); }

  function readOfflineConfig() {
    try { return JSON.parse(localStorage.getItem(LS_CFG) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeOfflineConfig(cfg) {
    try { localStorage.setItem(LS_CFG, JSON.stringify(cfg || {})); } catch (e) {}
  }

  // Chamada genérica. action = nome da operação; params = objeto extra.
  async function call(action, params) {
    var url = getUrl();
    if (!url) {
      throw new Error('URL do Apps Script não configurada. Edite o arquivo js/config.js e cole a URL que termina em /exec.');
    }
    var token = (TRJ.auth && TRJ.auth.getToken && TRJ.auth.getToken()) || '';
    var body = Object.assign({ action: action, token: token }, params || {});

    var resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        // text/plain evita o preflight CORS (OPTIONS) no Apps Script
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Falha de rede ao contatar o servidor. Verifique sua conexão e a URL do Apps Script.');
    }

    var txt = await resp.text();
    var data;
    try {
      data = JSON.parse(txt);
    } catch (e) {
      // Resposta não-JSON normalmente é uma página de erro/login do Google.
      throw new Error('Resposta inesperada do servidor. Confirme que o Web App está publicado com acesso "Qualquer pessoa".');
    }
    if (data && data.ok === false) {
      throw new Error(data.error || 'Erro no servidor.');
    }
    return data;
  }

  // ---- Métodos por ação ----
  A.ping          = function ()            { if (offline()) return Promise.resolve({ ok: true, offline: true }); return call('ping'); };

  A.login         = function (email, pwd)  {
    if (offline()) {
      var mail = (email || '').trim() || 'operador@trj.com';
      return Promise.resolve({ ok: true, token: 'offline-' + Date.now(), user: { email: mail, nome: 'Operador', role: 'admin' } });
    }
    return call('login', { email: email, password: pwd });
  };

  A.getCities     = function (opts)        { if (offline()) return Promise.resolve({ ok: true, rows: [] }); return call('getCities', opts || {}); };
  A.getCitiesMeta = function ()            { if (offline()) return Promise.resolve({ ok: true, total: 0 }); return call('getCitiesMeta'); };
  A.lookupCities  = function (ids)         { if (offline()) return Promise.resolve({ ok: true, map: {} }); return call('lookupCities', { ids: ids || [] }); };
  A.getTasks      = function ()            { if (offline()) return Promise.resolve({ ok: true, rows: [] }); return call('getTasks'); };
  A.saveTasks     = function (rows)        { if (offline()) return Promise.resolve({ ok: true }); return call('saveTasks', { rows: rows || [] }); };
  A.getIncidents  = function ()            { if (offline()) return Promise.resolve({ ok: true, rows: [] }); return call('getIncidents'); };
  A.saveIncidents = function (rows)        { if (offline()) return Promise.resolve({ ok: true }); return call('saveIncidents', { rows: rows || [] }); };
  A.setIncidentStatus = function (items)   { if (offline()) return Promise.resolve({ ok: true }); return call('setIncidentStatus', { items: items || [] }); };

  A.getConfig     = function ()            { if (offline()) return Promise.resolve({ ok: true, config: readOfflineConfig() }); return call('getConfig'); };
  A.setConfig     = function (config)      {
    if (offline()) { var merged = Object.assign({}, readOfflineConfig(), config || {}); writeOfflineConfig(merged); return Promise.resolve({ ok: true, config: merged }); }
    return call('setConfig', { config: config || {} });
  };

  // Busca os valores únicos das colunas D, E, F do VALID_CAD pra montar
  // os dropdowns dinâmicos no formulário de cadastro.
  A.getValidCadOptions = function () {
    if (offline()) return Promise.resolve({ ok: true, headers: { D: 'Coluna D', E: 'Coluna E', F: 'Coluna F' }, options: { D: [], E: [], F: [] } });
    return call('getValidCadOptions');
  };

  // Cadastro de sites (usado pela página Cadastro de Cidades).
  A.saveSite      = function (row)         {
    if (offline()) {
      try { var arr = JSON.parse(localStorage.getItem('trj_sites') || '[]') || []; arr.push(row || {}); localStorage.setItem('trj_sites', JSON.stringify(arr)); } catch (e) {}
      return Promise.resolve({ ok: true, offline: true });
    }
    return call('saveSite', { row: row || {} });
  };

  // Publica a "foto" do Dashboard (sem filtros) pro link público de
  // visualização (dashboard-publico.html). Em modo offline não há como
  // publicar (precisa do backend), então só ignora silenciosamente.
  A.saveDashboardSnapshot = function (snapshot) {
    if (offline()) return Promise.resolve({ ok: true, offline: true });
    return call('saveDashboardSnapshot', { snapshot: snapshot || {} });
  };

  // Histórico de produtividade (dias já processados).
  // Offline: usa localStorage como fallback. Online: sincroniza com GAS.
  var LS_PROD = 'trj_prod_hist_v1';
  A.getProdutividadeHist = function () {
    if (offline()) {
      try { return Promise.resolve({ ok: true, rows: JSON.parse(localStorage.getItem(LS_PROD) || '{}') }); }
      catch (e) { return Promise.resolve({ ok: true, rows: {} }); }
    }
    return call('getProdutividadeHist');
  };
  A.saveProdutividadeHist = function (rows) {
    if (offline()) {
      try {
        var existing = JSON.parse(localStorage.getItem(LS_PROD) || '{}') || {};
        (rows || []).forEach(function (r) { if (r.data) existing[r.data] = r; });
        localStorage.setItem(LS_PROD, JSON.stringify(existing));
      } catch (e) {}
      return Promise.resolve({ ok: true, offline: true });
    }
    return call('saveProdutividadeHist', { rows: rows || [] });
  };

  A.call = call;
  A.getUrl = getUrl;
  A.isOffline = offline;
  TRJ.api = A;
})(window.TRJ = window.TRJ || {});
