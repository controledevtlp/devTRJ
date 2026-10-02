/* =====================================================================
 * app.js  —  NÚCLEO DA APLICAÇÃO (bootstrap + rotas + cache de dados)
 * ---------------------------------------------------------------------
 * - Verifica login; mostra a tela de login ou o painel.
 * - Monta a barra lateral e troca de página pelo hash da URL (#/...).
 * - Carrega tarefas + incidentes + cidades + config UMA vez e reaproveita.
 * - As abas de visualização só aparecem depois que os arquivos são
 *   carregados (apenas "Importar dados" e "Configurações" no início).
 * ===================================================================== */
(function (TRJ) {
  var U = TRJ.ui, D = TRJ.domain, Comp = TRJ.compute, C = TRJ.constants;
  var App = { data: null };

  // ícones SVG simples (stroke currentColor)
  // ---------------- TEMA (claro/escuro) ----------------
  var LS_THEME = 'trj_theme';
  function getTheme() { try { return localStorage.getItem(LS_THEME) || 'dark'; } catch (e) { return 'dark'; } }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
    try { localStorage.setItem(LS_THEME, t); } catch (e) {}
  }
  applyTheme(getTheme()); // aplica o tema salvo já no carregamento, antes de montar a tela

  var ICONS = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z"/>',
    pesquisa: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>',
    mapa: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="9" r="1.5" fill="currentColor"/>',
    priority: '<path d="M7 11a5 5 0 0 1 10 0"/><rect x="5" y="11" width="14" height="4" rx="1"/><path d="M9 15v2h6v-2"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="4.5" y1="4.5" x2="6.5" y2="6.5"/><line x1="19.5" y1="4.5" x2="17.5" y2="6.5"/>',
    sla: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
    regional: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    sites: '<path d="M12 2v6M5 8a7 7 0 0 1 14 0M8 11a4 4 0 0 1 8 0M12 14v8"/>',
    cadastro: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h5"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.5L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    importar:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    produtividade:  '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    atualizacoes:   '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'
  };
  function icon(name, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }
  App.icon = icon;

  var LINKS = [
    { hash: '#/dashboard', label: 'Dashboard', ico: 'dashboard' },
    { hash: '#/prioritarios', label: 'Prioritários', ico: 'priority' },
    { hash: '#/pesquisa',    label: 'Pesquisa Operacional', ico: 'pesquisa' },
    { hash: '#/mapa',        label: 'Mapa Operacional', ico: 'mapa' },
    { hash: '#/sla', label: 'SLA / Aderência', ico: 'sla' },
    { hash: '#/produtividade',  label: 'Produtividade',      ico: 'produtividade' },
    { hash: '#/atualizacoes',   label: 'Atualizações',       ico: 'atualizacoes' },
    { hash: '#/regional', label: 'Visão Regional', ico: 'regional' },
    { hash: '#/sites-fora', label: 'Sites Fora (Incidentes)', ico: 'sites' },
    { hash: '#/cadastro', label: 'Cadastro de Cidades', ico: 'cadastro' },
    { hash: '#/importar', label: 'Importar dados', ico: 'importar' },
    { hash: '#/configuracoes', label: 'Configurações', ico: 'config' }
  ];

  // ---------------- LOGIN ----------------
  function showLogin(msg) {
    document.getElementById('app-shell').style.display = 'none';
    var ls = document.getElementById('login-screen');
    ls.style.display = 'flex';
    var err = document.getElementById('login-error');
    if (err) err.textContent = msg || '';
  }
  function wireLogin() {
    var form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var email = document.getElementById('login-email').value.trim();
      var pwd = document.getElementById('login-pwd').value;
      var btn = document.getElementById('login-btn');
      var err = document.getElementById('login-error');
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Entrando...';
      try {
        await TRJ.auth.login(email, pwd);
        await startApp();
      } catch (e) {
        err.textContent = e.message || 'Falha no login.';
      } finally {
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  // ---------------- SHELL ----------------
  function buildSidebar() {
    var user = TRJ.auth.getUser() || {};
    var brand = U.h('div', { class: 'flex items-center gap-3 px-4 py-4' }, [
      U.h('img', { src: 'assets/logo-trj.png', alt: 'TRJ', style: { width: '38px', height: '38px', objectFit: 'contain' } }),
      U.h('div', null, [
        U.h('div', { class: 'font-extrabold text-sm', style: { color: 'var(--trj-primary)', letterSpacing: '.5px' }, text: TRJ.config.APP_NAME || 'CONTROLE TRJ' }),
        U.h('div', { class: 'text-xs', style: { color: 'var(--trj-muted)' }, text: TRJ.config.APP_SUB || 'Operacional' })
      ])
    ]);
    var hasTasks = App.data && App.data.rawTasks && App.data.rawTasks.length > 0;
    var visibleLinks = hasTasks ? LINKS : LINKS.filter(function (l) { return l.hash === '#/importar' || l.hash === '#/configuracoes'; });
    var nav = U.h('nav', { class: 'flex flex-col gap-1 px-3 mt-2', style: { flex: '1' } }, visibleLinks.map(function (l) {
      return U.h('a', { class: 'trj-link', href: l.hash, dataset: { hash: l.hash } }, [
        U.h('span', { class: 'ico', html: icon(l.ico) }), U.h('span', { text: l.label })
      ]);
    }));
    if (!hasTasks) {
      nav.appendChild(U.h('div', { class: 'text-xs px-2 pt-2', style: { color: 'var(--trj-muted)', lineHeight: '1.4' }, text: 'Faça o upload dos arquivos para liberar as abas de visualização.' }));
    }
    var temaAtual = getTheme();
    var btnTema = U.h('button', {
      class: 'trj-link w-full', onclick: function () {
        var novo = getTheme() === 'light' ? 'dark' : 'light';
        applyTheme(novo);
        buildShell(); render(); // refaz o menu (ícone/label do tema) e a página atual
      }
    }, [
      U.h('span', { class: 'ico', text: temaAtual === 'light' ? '🌙' : '☀️' }),
      U.h('span', { text: temaAtual === 'light' ? 'Tema escuro' : 'Tema claro' })
    ]);
    var btnLinkPublico = U.h('button', {
      class: 'trj-link w-full', title: 'Copiar o link de visualização pública do Dashboard',
      onclick: function () {
        var url = location.href.replace(/index\.html.*$/, '').replace(/\/?(#.*)?$/, '/') + 'dashboard-publico.html';
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { U.toast('Link público copiado!', 'ok'); }, function () { U.toast(url, 'info'); });
      }
    }, [U.h('span', { class: 'ico', text: '🔗' }), U.h('span', { text: 'Copiar link público' })]);
    var footer = U.h('div', { class: 'px-3 py-3', style: { borderTop: '1px solid var(--trj-border)' } }, [
      U.h('div', { class: 'text-xs px-2 mb-2 truncate', style: { color: 'var(--trj-muted)' }, text: user.email || '' }),
      btnLinkPublico,
      btnTema,
      U.h('button', { class: 'trj-link w-full', onclick: doLogout }, [U.h('span', { class: 'ico', html: icon('logout') }), U.h('span', { text: 'Sair' })])
    ]);
    return U.h('aside', { id: 'sidebar', class: 'trj-card flex flex-col', style: { width: '256px', minWidth: '256px', borderRadius: '0', borderTop: 'none', borderBottom: 'none', borderLeft: 'none', height: '100vh' } }, [brand, nav, footer]);
  }

  // ---------------- Comportamento do menu (hover na borda + botão p/ touch) ----------------
  var SIDEBAR_CLOSE_DELAY = 220; // ms de tolerância ao tirar o mouse, evita fechar "tremendo"
  var sidebarCloseTimer = null;
  var sidebarPinned = false; // true = aberto via clique no botão (modo touch/clique)

  function openSidebar() {
    if (sidebarCloseTimer) { clearTimeout(sidebarCloseTimer); sidebarCloseTimer = null; }
    document.body.classList.add('trj-sidebar-open');
  }
  function closeSidebarSoon() {
    if (sidebarPinned) return; // só fecha automaticamente se não foi fixado pelo botão
    if (sidebarCloseTimer) clearTimeout(sidebarCloseTimer);
    sidebarCloseTimer = setTimeout(function () { document.body.classList.remove('trj-sidebar-open'); }, SIDEBAR_CLOSE_DELAY);
  }
  function closeSidebarNow() {
    sidebarPinned = false;
    if (sidebarCloseTimer) { clearTimeout(sidebarCloseTimer); sidebarCloseTimer = null; }
    document.body.classList.remove('trj-sidebar-open');
  }
  function toggleSidebarPinned() {
    sidebarPinned = !sidebarPinned;
    if (sidebarPinned) openSidebar(); else closeSidebarNow();
  }

  // Wireup feito uma única vez (os elementos de hover/botão são fixos, fora do shell que é recriado a cada render)
  function ensureSidebarChrome() {
    if (document.getElementById('sidebar-hover-zone')) return;
    var hoverZone = U.h('div', { id: 'sidebar-hover-zone' });
    hoverZone.addEventListener('mouseenter', openSidebar);
    hoverZone.addEventListener('mouseleave', closeSidebarSoon);
    var toggleBtn = U.h('button', { id: 'sidebar-toggle-btn', title: 'Abrir menu', text: '⋮', onclick: toggleSidebarPinned });
    document.body.appendChild(hoverZone);
    document.body.appendChild(toggleBtn);
  }

  function doLogout() { if (TRJ.files && TRJ.files.stopAutoMonitor) TRJ.files.stopAutoMonitor(); if (App._timer) { clearInterval(App._timer); App._timer = null; } TRJ.auth.logout(); location.hash = '#/dashboard'; showLogin(); }

  function setActiveLink() {
    var cur = location.hash || '#/dashboard';
    document.querySelectorAll('#sidebar .trj-link[data-hash]').forEach(function (a) {
      a.classList.toggle('active', a.dataset.hash === cur);
    });
  }

  function buildShell() {
    ensureSidebarChrome();
    var shell = document.getElementById('app-shell');
    shell.innerHTML = '';
    shell.style.display = 'flex';
    var sidebar = buildSidebar();
    sidebar.addEventListener('mouseenter', openSidebar);
    sidebar.addEventListener('mouseleave', closeSidebarSoon);
    // ao escolher uma aba, prioriza o conteúdo: fecha o menu (inclusive se fixado pelo botão)
    sidebar.querySelectorAll('.trj-link[data-hash]').forEach(function (a) {
      a.addEventListener('click', closeSidebarNow);
    });
    var page = U.h('div', { id: 'page', class: 'p-4 lg:p-6', style: { paddingTop: '54px' } });
    var main = U.h('div', { style: { flex: '1', minWidth: '0', width: '100%' } }, [page, U.devFooter()]);
    shell.appendChild(sidebar);
    shell.appendChild(main);
    setActiveLink();
  }

  // ---------------- DADOS ----------------
  function prazoOverride(config) {
    var o = {};
    C.PRIORIDADES.forEach(function (p) { if (config['sla_' + p] != null && config['sla_' + p] !== '') o[p] = config['sla_' + p]; });
    return o;
  }

  App.loadAll = async function () {
    U.loading(true);
    try {
      // Config (prazos de SLA): backend se houver URL, senão localStorage (offline).
      var cfgRes = await TRJ.api.getConfig();
      var config = (cfgRes && cfgRes.config) || {};
      // Tarefas e incidentes vêm dos arquivos lidos no navegador (TRJ.files).
      var rawTasks = (TRJ.files && TRJ.files.getTasks()) || [];
      var rawInc = (TRJ.files && TRJ.files.getIncidents()) || [];
      var prazoMap = D.montarPrazoMap(prazoOverride(config));
      var ids = Comp.collectIds(rawTasks, rawInc);
      var validMap = {};
      if (ids.length) {
        try { var lk = await TRJ.api.lookupCities(ids); validMap = (lk && lk.map) || {}; }
        catch (e) { validMap = {}; /* sem backend de cidades: segue sem enriquecimento */ }
      }
      var now = new Date();
      App.data = {
        config: config, prazoMap: prazoMap, validMap: validMap,
        rawTasks: rawTasks, rawInc: rawInc,
        tasksEnriched: Comp.enrichTasks(rawTasks, validMap, prazoMap, now),
        incidentsEnriched: Comp.enrichIncidents(rawInc, validMap),
        loadedAt: new Date()
      };
    } finally {
      U.loading(false);
    }
  };

  // silent = true -> não mostra toast (usado pelo monitor automático/timer,
  // evitando o acúmulo de avisos "Dados atualizados.")
  App.refresh = async function (silent) {
    try {
      await App.loadAll();
      buildShell();
      render();
      ensureMonitor();
      if (!silent) U.toast('Dados atualizados.', 'ok');
    } catch (e) {
      U.toast(e.message || 'Erro ao atualizar.', 'err');
    }
  };

  // registra o monitor automático apenas uma vez (idempotente em files.js)
  function ensureMonitor() {
    if (TRJ.files && TRJ.files.startAutoMonitor) {
      TRJ.files.startAutoMonitor(function () { App.refresh(true); }, 45000);
    }
  }

  // recarrega só incidentes (após upload/alteração de status) — agora da memória/navegador
  App.reloadIncidents = async function () {
    var rawInc = (TRJ.files && TRJ.files.getIncidents()) || [];
    App.data.rawInc = rawInc;
    App.data.incidentsEnriched = Comp.enrichIncidents(rawInc, App.data.validMap);
  };

  // ---------------- DRILL ----------------
  App.openDrillTasks = function (spec, filtros, title, opts, onCopy) {
    if (!App.data) return;
    var rows = Comp.drillTasks(App.data.tasksEnriched, spec, filtros || {});
    U.openModal(title || 'Detalhamento', U.taskTable(rows, opts || {}), {
      onCopy: onCopy || function () { return U.taskTableCopyText(rows, title); }
    });
  };
  App.openDrillIncidents = function (spec, title, opts) {
    if (!App.data) return;
    opts = opts || {};
    var rows = Comp.drillIncidents(App.data.incidentsEnriched, spec);
    U.openModal(title || 'Detalhamento', U.incidentTable(rows, App.data.tasksEnriched), {
      onCopy: opts.onCopy || function () { return U.incidentTableCopyText(rows, title); }
    });
  };

  // ---------------- ROTAS ----------------
  var ROUTES = {
    '#/dashboard': 'dashboard',
    '#/prioritarios': 'prioritarios',
    '#/pesquisa':     'pesquisa',
    '#/mapa':         'mapa',
    '#/sla': 'sla',
    '#/produtividade': 'produtividade',
    '#/atualizacoes':  'atualizacoes',
    '#/regional': 'regional',
    '#/sites-fora': 'sitesFora',
    '#/cadastro': 'cadastro',
    '#/importar': 'importar',
    '#/configuracoes': 'configuracoes'
  };

  // Resolve a página registrada aceitando os dois formatos:
  //   TRJ.pages.x = function(container, ctx) {...}
  //   TRJ.pages.x = { render: function(container, ctx) {...} }
  function resolvePage(key) {
    var p = TRJ.pages && TRJ.pages[key];
    if (!p) return null;
    if (typeof p === 'function') return p;
    if (typeof p.render === 'function') return p.render.bind(p);
    return null;
  }

  function render() {
    if (!TRJ.auth.isLogged()) { showLogin(); return; }
    var page = document.getElementById('page');
    if (!page) return;
    U.destroyCharts();
    U.closeModal();
    var hash = location.hash || '#/dashboard';
    if (!ROUTES[hash]) { location.hash = '#/dashboard'; return; }
    var hasTasks = App.data && App.data.rawTasks && App.data.rawTasks.length > 0;
    if (!hasTasks && hash !== '#/importar' && hash !== '#/configuracoes') { location.hash = '#/importar'; return; }
    setActiveLink();
    var fn = resolvePage(ROUTES[hash]);
    page.innerHTML = '';
    if (typeof fn === 'function') {
      try { fn(page, { data: App.data, app: App }); }
      catch (e) { page.appendChild(U.h('div', { class: 'trj-card p-6', style: { color: 'var(--trj-red, #e74c3c)' }, text: 'Erro ao renderizar a página: ' + (e.message || e) })); }
    } else {
      page.appendChild(U.h('div', { class: 'trj-card p-6', text: 'Página não encontrada.' }));
    }
  }
  App.render = render;
  App.navigate = function (hash) { if (location.hash === hash) render(); else location.hash = hash; };

  // ---------------- START ----------------
  async function startApp() {
    document.getElementById('login-screen').style.display = 'none';
    buildShell();
    render(); // renderiza imediatamente com dados vazios — sem esperar o carregamento
    // Carregamento em background com mensagens de progresso
    _loadComProgresso();
  }

  async function _loadComProgresso() {
    var msgs = [
      'Verificando configurações...',
      'Lendo dados em memória...',
      'Buscando localização dos sites...',
      'Calculando backlog e SLA...',
      'Finalizando...'
    ];
    var pct = 0;
    function mostrarProgresso(i) {
      pct = Math.round((i / msgs.length) * 100);
      U.loadingMsg && U.loadingMsg(msgs[i] || '...', pct);
      U.loading(true);
    }
    try {
      mostrarProgresso(0);
      var cfgRes = await TRJ.api.getConfig().catch(function(){ return null; });
      var config = (cfgRes && cfgRes.config) || {};

      mostrarProgresso(1);
      var rawTasks = (TRJ.files && TRJ.files.getTasks()) || [];
      var rawInc   = (TRJ.files && TRJ.files.getIncidents()) || [];
      var prazoMap = D.montarPrazoMap(prazoOverride(config));

      mostrarProgresso(2);
      var ids      = Comp.collectIds(rawTasks, rawInc);
      var validMap = {};
      if (ids.length) {
        try { var lk = await TRJ.api.lookupCities(ids); validMap = (lk && lk.map) || {}; }
        catch (e) { validMap = {}; }
      }

      mostrarProgresso(3);
      var now = new Date();
      App.data = {
        config: config, prazoMap: prazoMap, validMap: validMap,
        rawTasks: rawTasks, rawInc: rawInc,
        tasksEnriched:    Comp.enrichTasks(rawTasks, validMap, prazoMap, now),
        incidentsEnriched: Comp.enrichIncidents(rawInc, validMap),
        loadedAt: now
      };

      mostrarProgresso(4);
      buildShell();
      render();
      ensureMonitor();
    } catch (e) {
      if (/token/i.test(e.message || '')) { doLogout(); showLogin(e.message); return; }
      U.toast(e.message || 'Erro ao carregar dados.', 'err');
    } finally {
      U.loading(false);
    }
    if (TRJ.config.AUTO_REFRESH_SEG > 0) {
      if (App._timer) clearInterval(App._timer);
      App._timer = setInterval(function () { App.refresh(true); }, TRJ.config.AUTO_REFRESH_SEG * 1000);
    }
  }

  function boot() {
    wireLogin();
    window.addEventListener('hashchange', render);
    if (TRJ.auth.isLogged()) startApp();
    else showLogin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  TRJ.app = App;
})(window.TRJ = window.TRJ || {});
