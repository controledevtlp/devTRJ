/* Robô Tais — roda DENTRO da aba da Tais (Telegram Web ou Portal TIM).
 * Nenhuma senha é lida. Tudo acontece no seu navegador, na sua sessão já logada.
 * Pode ser usado como extensão do Edge, favorito (bookmarklet) ou colado no console (F12). */
(() => {
  'use strict';
  if (window.__roboTais) { window.__roboTais.mostrar(); return; }

  const VERSAO = '1.5';
  const LS = 'robotais_v1_';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const soLetras = s => norm(s).replace(/[^a-z]/g, '');
  const agora = () => new Date().toLocaleTimeString('pt-BR');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(LS + k); } catch (e) { } }
  };

  /* ============ CONFIGURAÇÃO (editável no painel) ============ */
  const FRASES_PADRAO = {
    nv: ['nenhuma regra de validação', 'não foi possível validar', 'sem possibilidade de validar'],
    indef: ['não encontrei regras', 'não é possível afirmar', 'não foi possível afirmar', 'se ele atende aos critérios'],
    cadeia: ['cadeia de tickets', 'apenas de um evento'],
    nao: ['não atende', 'não normalizad', 'não está normalizad'],
    sim: ['atende aos critérios', 'está normalizad', 'sem alarme', 'nenhum alarme ativo'],
    pergunta: ['gostaria de inserir'],
    conf: ['inserid', 'anexad', 'sucesso', 'registrad', 'adicionad'],
    erro: ['não foi possível', 'erro', 'falha ao', 'não foi inserido']
  };
  const salvo = store.get('cfg', {});
  const CFG = Object.assign({
    tmpl: { tsk: '{codigo} validar', ne: '{codigo} testar', end: '{codigo} testar' },
    limite: 3, pausa: 2, espera: 90, estavel: 3, simulacao: false, retomar: true, tema: 'dark',
    selInput: '', selMsgs: '', selEnviar: ''
  }, salvo);
  CFG.tmpl = Object.assign({ tsk: '{codigo} validar', ne: '{codigo} testar', end: '{codigo} testar' }, salvo.tmpl || {});
  CFG.frases = Object.assign({}, FRASES_PADRAO, salvo.frases || {});
  CFG.filtros = Object.assign({ ativo: true, status: ['Não iniciado', 'Iniciado'], excluir: ['PREDITIVA', 'SUPORTE ACESSO', 'MABE'], tipo: ['Planta Interna - Manutenção Corretiva'] }, salvo.filtros || {});
  const salvarCfg = () => store.set('cfg', CFG);

  /* ============ ESTADO ============ */
  let modo = store.get('modo', 'tsk');        // tsk | ne | end
  let dados = null;                            // lista unificada: {cab, linhas, orig}
  const fontes = { ag: null, na: null, lista: null };   // planilhas carregadas: Agendado, Não agendado, lista colada
  const ORIG_TXT = { ag: 'Agendado', na: 'Não agendado', lista: 'Lista colada' };
  let seguirUm = '';                           // qual planilha faltante o usuário aceitou dispensar
  let itens = [];                              // itens do teste
  let rodando = false, parar = false, faseTxt = '', itemAtual = null, inicioItem = 0;
  const NOMES_MODO = { tsk: 'Validar TSK', ne: 'Testar NE-ID', end: 'Testar END-ID' };
  const STATUS_TXT = { pendente: '⏳ Pendente', testando: '🔄 Testando', normalizado: '🟢 Normalizado', nao_normalizado: '🔴 Não normalizado', nao_validavel: '⚪ Não validável', indefinido: '🟡 Indefinido' };

  /* ============ ACESSO À PÁGINA (inclui iframes do mesmo domínio) ============ */
  function docs() {
    const out = [document];
    (function walk(d) {
      d.querySelectorAll('iframe,frame').forEach(f => {
        try { const cd = f.contentDocument; if (cd && !out.includes(cd)) { out.push(cd); walk(cd); } } catch (e) { }
      });
    })(document);
    return out;
  }
  function consultar(sel) {
    if (!sel) return null;
    for (const d of docs()) { try { const el = d.querySelector(sel); if (el) return el; } catch (e) { } }
    return null;
  }
  function visivel(el) {
    try {
      if (!el.getClientRects().length) return false;
      const cs = el.ownerDocument.defaultView.getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    } catch (e) { return false; }
  }
  function cssPath(el) {
    const esc = (window.CSS && CSS.escape) ? CSS.escape : (s => s);
    const parts = []; let n = el;
    while (n && n.nodeType === 1 && n.tagName !== 'HTML') {
      if (n.id && n.ownerDocument.querySelectorAll('#' + esc(n.id)).length === 1) { parts.unshift('#' + esc(n.id)); break; }
      let p = n.tagName.toLowerCase();
      const par = n.parentElement;
      if (par) { const irm = [...par.children].filter(c => c.tagName === n.tagName); if (irm.length > 1) p += ':nth-of-type(' + (irm.indexOf(n) + 1) + ')'; }
      parts.unshift(p); n = par;
    }
    return parts.join(' > ');
  }

  function acharInput() {
    if (CFG.selInput) { const e = consultar(CFG.selInput); if (e) return e; }
    // Telegram Web K
    for (const d of docs()) {
      const tg = [...d.querySelectorAll('.input-message-input[contenteditable]')].find(e => e.isContentEditable && visivel(e));
      if (tg) return tg;
    }
    const cand = [];
    docs().forEach(d => d.querySelectorAll('textarea,input,[contenteditable],[role=textbox]').forEach(el => {
      if (el.tagName === 'INPUT' && !['text', 'search', ''].includes((el.getAttribute('type') || '').toLowerCase())) return;
      if (el.hasAttribute('contenteditable') && !el.isContentEditable) return;
      if (el.disabled || el.readOnly || !visivel(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 18) return;
      cand.push({ el, r });
    }));
    cand.sort((a, b) => (b.r.bottom - a.r.bottom) || (b.r.width - a.r.width));
    return cand.length ? cand[0].el : null;
  }
  function raizesMensagens() {
    if (CFG.selMsgs) { const e = consultar(CFG.selMsgs); if (e) return [e]; }
    const tg = docs().map(d => d.querySelector('.bubbles-inner, .bubbles')).filter(Boolean);
    if (tg.length) return tg;
    return docs().map(d => d.body).filter(Boolean);
  }
  function linhasPagina() {
    return raizesMensagens().flatMap(r => String(r.innerText || '').split('\n').map(s => s.trim()).filter(Boolean));
  }
  function novasLinhas(base, atual) {
    const cont = new Map();
    base.forEach(l => cont.set(l, (cont.get(l) || 0) + 1));
    const out = [];
    atual.forEach(l => { const c = cont.get(l) || 0; if (c > 0) cont.set(l, c - 1); else out.push(l); });
    return out;
  }
  // botões/folhas de texto visíveis cujo texto (já sem acento e minúsculo) satisfaz fn; sempre em ordem do documento
  function botoesQue(fn) {
    const alvo = new Set(), lista = [];
    docs().forEach(d => d.querySelectorAll('button,[role=button],a,input[type=button],input[type=submit],.reply-markup-button,span,div,p,li,label').forEach(el => {
      if (el.childElementCount > 3) return;
      const t = el.tagName === 'INPUT' ? el.value : el.textContent;
      if (!t || t.length > 200 || !fn(norm(t))) return;
      if (el.querySelectorAll('*').length > 6) return;
      if ([...el.children].some(c => c.textContent && fn(norm(c.textContent)))) return;   // só o elemento mais interno (não o bloco que agrupa vários botões)
      if (!visivel(el)) return;
      const alt = el.closest('button,[role=button],a,input,.reply-markup-button') || el;
      if (!alvo.has(alt)) { alvo.add(alt); lista.push(alt); }
    }));
    return lista;
  }
  const botoes = rotulo => botoesQue(t => t.replace(/[^a-z]/g, '') === rotulo);
  function clicar(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { }
    const w = el.ownerDocument.defaultView;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(t => {
      try { el.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true, view: w })); } catch (e) { }
    });
    el.click();
  }

  /* ============ ENVIO ============ */
  const valorDe = el => (el.isContentEditable ? el.innerText : el.value) || '';
  function apertarEnter(el) {
    const w = el.ownerDocument.defaultView;
    ['keydown', 'keypress', 'keyup'].forEach(t => el.dispatchEvent(new w.KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })));
  }
  function botaoEnviar(inp) {
    let n = inp;
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
      const bs = [...n.querySelectorAll('button,[role=button],.btn-send,input[type=submit]')].filter(visivel);
      const b = bs.find(x => /enviar|send/.test(norm((x.getAttribute('aria-label') || '') + ' ' + (x.title || '') + ' ' + x.textContent + ' ' + x.className)) || x.type === 'submit');
      if (b) return b;
    }
    return null;
  }
  async function enviar(inp, msg) {
    const w = inp.ownerDocument.defaultView;
    inp.focus();
    if (inp.isContentEditable) {
      inp.ownerDocument.execCommand('selectAll', false, null);
      if (!inp.ownerDocument.execCommand('insertText', false, msg)) {
        inp.textContent = msg;
        inp.dispatchEvent(new w.InputEvent('input', { bubbles: true, data: msg, inputType: 'insertText' }));
      }
    } else {
      const proto = inp.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, msg);
      inp.dispatchEvent(new w.Event('input', { bubbles: true }));
      inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    await esperar(300);
    const pick = CFG.selEnviar ? consultar(CFG.selEnviar) : null;
    if (pick) clicar(pick); else apertarEnter(inp);
    await esperar(900);
    if (valorDe(inp).trim() === msg.trim()) {
      const b = botaoEnviar(inp); if (b) clicar(b);
      await esperar(900);
    }
    if (valorDe(inp).trim() === msg.trim()) {
      const f = inp.closest('form'); if (f && f.requestSubmit) { try { f.requestSubmit(); } catch (e) { } }
      await esperar(900);
    }
    if (valorDe(inp).trim() === msg.trim()) throw new Error('Não consegui enviar a mensagem (use 🎯 Marcar botão enviar).');
  }
  class Parado extends Error { }
  async function esperar(ms) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { if (parar) throw new Parado(); await sleep(Math.min(200, fim - Date.now())); }
    if (parar) throw new Parado();
  }
  async function aguardarInput() {
    for (let i = 0; i < 120; i++) {
      const e = acharInput();
      if (e && !e.disabled && !e.readOnly) return e;
      await esperar(500);
    }
    throw new Error('Campo de mensagem não encontrado (a página recarregou? use 🎯 Marcar campo).');
  }

  /* ============ CLASSIFICAÇÃO ============ */
  const tem = (t, arr) => arr.some(p => p && t.includes(norm(p)));
  function classificar(texto) {
    const t = norm(texto);
    if (tem(t, CFG.frases.indef)) return 'indefinido';   // “não encontrei regras / não é possível afirmar”: nunca vira normalizado
    if (tem(t, CFG.frases.nv)) return 'nao_validavel';
    if (tem(t, CFG.frases.nao)) return 'nao_normalizado';
    if (tem(t, CFG.frases.sim)) return 'normalizado';
    return null;
  }
  function extrair(linhas) {
    const txt = linhas.join('\n');
    let ev = (txt.match(/\bEVE[\w-]*\d[\w-]*/i) || [])[0] || '';
    if (!ev) ev = (txt.match(/evento\s*[:#-]?\s*([A-Z0-9-]*\d[A-Z0-9-]*)/i) || [])[1] || '';
    const al = [];
    linhas.forEach(l => {
      const n = norm(l);
      if (/criterio|gostaria|regras de validacao|feedback|duvidas|nao foi possivel|nao e possivel/.test(n)) return;
      if (/alarm|falha|retificador|energia|bateria|sn-[a-z0-9]+/i.test(l) && !al.includes(l)) al.push(l);
    });
    return { evento: ev, alarmes: al.join(' | ').slice(0, 600) };
  }

  /* ============ TESTE DE UM ITEM ============ */
  async function testarReal(it) {
    const msg = CFG.tmpl[modo].replace('{codigo}', it.codigo);
    faseTxt = 'aguardando campo de mensagem…';
    const inp = await aguardarInput();
    const antesL = linhasPagina();
    const antesB = new Set(botoesQue(() => true));
    faseTxt = 'enviando “' + msg + '”…';
    await enviar(inp, msg);
    log('Enviado: ' + msg);
    faseTxt = 'aguardando resposta da Tais…';
    const t0 = Date.now();
    let ultimo = '', mudou = Date.now(), cls = null;
    let cadeiaDesde = 0, cadeiaOk = false, baseResp = null, escolhido = '';
    const evn = (it.eventos || []).map(e => norm(e).replace(/\s/g, '')).filter(Boolean);
    while (Date.now() - t0 < CFG.espera * 1000) {
      await esperar(500);
      const nl = novasLinhas(antesL, linhasPagina());
      const txt = nl.join('\n');
      if (txt !== ultimo) { ultimo = txt; mudou = Date.now(); }
      // A Tais perguntou qual evento da cadeia validar: escolhe o evento desta TSK (vem da planilha)
      if (!cadeiaOk && tem(norm(txt), CFG.frases.cadeia)) {
        if (!cadeiaDesde) { cadeiaDesde = Date.now(); faseTxt = 'cadeia de tickets: escolhendo o evento da planilha…'; }
        if (!evn.length) return { status: 'indefinido', resposta: 'A Tais perguntou qual evento da cadeia validar, mas esta TSK não tem evento na planilha (coluna do evento).\n' + txt, evento: '', alarmes: '', anexado: '' };
        const alvo = botoesQue(t => evn.some(e => t.replace(/\s/g, '').includes(e))).filter(e => !antesB.has(e));
        if (alvo.length) {
          escolhido = alvo[0].textContent.trim().replace(/\s+/g, ' ');
          baseResp = linhasPagina();
          clicar(alvo[0]); cadeiaOk = true; mudou = Date.now();
          faseTxt = 'evento escolhido, aguardando a validação…';
          log('Cadeia de tickets: escolhido “' + escolhido + '”');
        } else if (Date.now() - cadeiaDesde > 12000) {
          return { status: 'indefinido', resposta: 'Nenhuma opção da cadeia corresponde ao evento da planilha (' + (it.eventos || []).join(', ') + ').\n' + txt, evento: '', alarmes: '', anexado: '' };
        }
        continue;
      }
      cls = classificar(txt);
      if (cls && Date.now() - mudou >= CFG.estavel * 1000) break;
    }
    const nl = novasLinhas(antesL, linhasPagina());
    const linhasResp = baseResp ? novasLinhas(baseResp, linhasPagina()) : nl;
    const resposta = (escolhido ? '[Cadeia: escolhido “' + escolhido + '”]\n' : '') + linhasResp.join('\n');
    const ex = extrair(linhasResp);
    if (!cls) return { status: 'indefinido', resposta: resposta || '(sem resposta no tempo limite)', evento: ex.evento, alarmes: '', anexado: '' };
    if (cls === 'indefinido') return { status: 'indefinido', resposta, evento: ex.evento, alarmes: '', anexado: '' };
    const r = { status: cls, resposta, evento: ex.evento, alarmes: ex.alarmes, anexado: '' };
    const pergunta = tem(norm(resposta), CFG.frases.pergunta);

    if (cls === 'normalizado' && modo === 'tsk') {
      faseTxt = 'anexando no chamado…';
      r.anexado = await anexar(antesB);
    } else if (cls === 'nao_normalizado' || (cls === 'normalizado' && modo !== 'tsk')) {
      if (pergunta) {                                    // limpa a pergunta de anexo sem anexar
        const n = botoes('nao').filter(e => !antesB.has(e));
        if (n.length) { clicar(n[n.length - 1]); await esperar(800); }
      }
    }
    return r;
  }
  async function anexar(antesB) {
    let sim = null;
    for (let i = 0; i < 20 && !sim; i++) {
      const novos = botoes('sim').filter(e => !antesB.has(e));
      if (novos.length) sim = novos[novos.length - 1]; else await esperar(500);
    }
    if (!sim) { log('⚠ Botão “Sim” de anexar não apareceu.'); return 'FALHOU'; }
    const base = linhasPagina();
    clicar(sim);
    const t0 = Date.now(); let ult = '', mudou = Date.now();
    while (Date.now() - t0 < 25000) {
      await esperar(500);
      const txt = novasLinhas(base, linhasPagina()).join('\n');
      if (txt !== ult) { ult = txt; mudou = Date.now(); }
      const n = norm(txt);
      if (tem(n, CFG.frases.erro)) return 'FALHOU';
      if (tem(n, CFG.frases.conf) && Date.now() - mudou >= 1500) return 'SIM';
    }
    return 'VERIFICAR';
  }
  async function simular(it) {
    faseTxt = '(simulação) aguardando resposta…';
    await esperar(400 + Math.random() * 900);
    const x = Math.random();
    if (x < 0.55) return { status: 'normalizado', resposta: 'SIMULAÇÃO: atende aos critérios de fechamento', evento: '', alarmes: '', anexado: modo === 'tsk' ? (Math.random() < 0.9 ? 'SIM' : 'VERIFICAR') : '' };
    if (x < 0.85) return { status: 'nao_normalizado', resposta: 'SIMULAÇÃO: não atende. Alarme de energia ativo', evento: 'EVE' + Math.floor(Math.random() * 9e6 + 1e6), alarmes: 'SN-SIM001 falha de energia | falha de retificador', anexado: '' };
    if (x < 0.95) return { status: 'nao_validavel', resposta: 'SIMULAÇÃO: Nenhuma regra de validação foi localizada', evento: '', alarmes: '', anexado: '' };
    return { status: 'indefinido', resposta: 'SIMULAÇÃO: resposta desconhecida', evento: '', alarmes: '', anexado: '' };
  }

  /* ============ EXECUÇÃO ============ */
  async function executar() {
    if (rodando) return;
    if (!itens.length) { log('Carregue uma planilha (ou cole a lista) primeiro.'); return; }
    let pend = itens.filter(i => i.status === 'pendente');
    if (!pend.length) { log('Nenhum item pendente. Use “Limpar” para recomeçar.'); return; }
    if (CFG.limite > 0) pend = pend.slice(0, CFG.limite);
    rodando = true; parar = false; store.set('rodando', true);
    log('▶ Iniciando ' + pend.length + ' item(ns) — ' + NOMES_MODO[modo] + (CFG.simulacao ? ' [SIMULAÇÃO]' : ''));
    atualizarBotoes();
    for (const it of pend) {
      if (parar) break;
      it.status = 'testando'; itemAtual = it; inicioItem = Date.now(); atualizarLinha(it); renderResumo();
      try {
        const r = CFG.simulacao ? await simular(it) : await testarReal(it);
        Object.assign(it, r, { hora: agora() });
        log(it.codigo + ' → ' + STATUS_TXT[it.status] + (it.anexado ? ' | anexo: ' + it.anexado : '') + (it.evento ? ' | ' + it.evento : ''));
      } catch (e) {
        if (e instanceof Parado) { it.status = 'pendente'; log('■ Parado pelo usuário.'); atualizarLinha(it); break; }
        it.status = 'indefinido'; it.resposta = 'ERRO: ' + e.message; it.hora = agora();
        log('⚠ ' + it.codigo + ': ' + e.message);
        atualizarLinha(it); salvarSessao();
        if (/Campo de mensagem|enviar/.test(e.message)) { parar = true; break; }
      }
      itemAtual = null; atualizarLinha(it); salvarSessao(); renderResumo();
      if (!parar && it !== pend[pend.length - 1]) { try { faseTxt = 'pausa antes do próximo item…'; await esperar(CFG.pausa * 1000); } catch (e) { break; } }
    }
    rodando = false; itemAtual = null; faseTxt = ''; store.set('rodando', false);
    log(itens.some(i => i.status === 'pendente') ? '⏸ Fim do lote. Ainda há itens pendentes.' : '✅ Todos os itens foram testados. Baixe o Excel.');
    atualizarBotoes(); renderResumo();
  }
  function salvarSessao() {
    store.set('sessao', { modo, quando: Date.now(), itens: itens.map(i => Object.assign({}, i, { resposta: String(i.resposta || '').slice(0, 500) })) });
  }

  /* ============ LEITURA DA PLANILHA (.xlsx sem biblioteca) ============ */
  const parseXml = t => new DOMParser().parseFromString(t, 'application/xml');
  async function lerZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Este arquivo não parece ser .xlsx');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const arq = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      arq[nome] = { metodo: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) };
      p += 46 + nl + el + cl;
    }
    return {
      async ler(nome) {
        const f = arq[nome]; if (!f) return null;
        const ini = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
        const bytes = u8.subarray(ini, ini + f.csize);
        if (f.metodo === 0) return new TextDecoder().decode(bytes);
        const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(s).text();
      }
    };
  }
  const colIdx = ref => { let n = 0; for (const ch of String(ref).replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  // junta um caminho relativo a uma pasta e resolve ./ e ../
  function juntar(dir, alvo) {
    if (alvo.startsWith('/')) return alvo.slice(1);
    const out = [];
    (dir + alvo).split('/').forEach(p => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }
  async function lerXlsx(buf) {
    const z = await lerZip(buf);
    // acha o workbook pelos relacionamentos do pacote (funciona com ou sem a pasta xl/)
    let wbPath = null;
    const raiz = await z.ler('_rels/.rels');
    if (raiz) {
      const r = [...parseXml(raiz).getElementsByTagName('Relationship')].find(x => /officeDocument$/.test(x.getAttribute('Type') || ''));
      if (r) wbPath = juntar('', r.getAttribute('Target'));
    }
    let wbXml = wbPath && await z.ler(wbPath);
    if (!wbXml) for (const c of ['xl/workbook.xml', 'workbook.xml']) { wbXml = await z.ler(c); if (wbXml) { wbPath = c; break; } }
    if (!wbXml) throw new Error('não achei a planilha dentro do arquivo .xlsx');
    const dir = wbPath.includes('/') ? wbPath.slice(0, wbPath.lastIndexOf('/') + 1) : '';
    const wb = parseXml(wbXml);
    const relXml = await z.ler(dir + '_rels/' + wbPath.slice(dir.length) + '.rels');
    const alvo = {}; let ssPath = null;
    if (relXml) [...parseXml(relXml).getElementsByTagName('Relationship')].forEach(r => {
      const t = juntar(dir, r.getAttribute('Target')); alvo[r.getAttribute('Id')] = t;
      if (/sharedStrings$/.test(r.getAttribute('Type') || '')) ssPath = t;
    });
    let comp = [];
    const ss = await z.ler(ssPath || (dir + 'sharedStrings.xml'));
    if (ss) comp = [...parseXml(ss).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].filter(t => !t.parentElement || t.parentElement.tagName !== 'rPh').map(t => t.textContent).join(''));
    const abas = [];
    for (const sh of [...wb.getElementsByTagName('sheet')]) {
      const xml = await z.ler(alvo[sh.getAttribute('r:id')]);
      if (!xml) continue;
      const linhas = [];
      [...parseXml(xml).getElementsByTagName('row')].forEach(row => {
        const arr = [];
        [...row.children].forEach(c => {
          if (c.tagName !== 'c') return;
          const t = c.getAttribute('t'); let v = '';
          if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else { const ve = c.getElementsByTagName('v')[0]; v = ve ? ve.textContent : ''; if (t === 's') v = comp[+v] != null ? comp[+v] : ''; }
          arr[colIdx(c.getAttribute('r'))] = v;
        });
        for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = '';
        linhas.push(arr);
      });
      abas.push({ nome: sh.getAttribute('name'), linhas });
    }
    return abas;
  }
  function lerTexto(txt) {
    const ls = txt.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const sep = ['\t', ';', ','].find(s => ls.some(l => l.includes(s))) || '\t';
    return [{ nome: 'Lista', linhas: ls.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())) }];
  }
  // escolhe a aba com mais linhas e acha o cabeçalho (primeira linha com 2+ células preenchidas)
  function prepararFonte(abas) {
    const a = abas.slice().sort((x, y) => y.linhas.length - x.linhas.length)[0];
    let h = 0;
    for (let k = 0; k < Math.min(10, a.linhas.length); k++) if (a.linhas[k].filter(c => String(c).trim()).length >= 2) { h = k; break; }
    if (a.linhas.every(l => l.length <= 1)) return { cab: ['Código'], linhas: a.linhas };
    const cabL = a.linhas[h], resto = a.linhas.slice(h + 1);
    const n = Math.max(cabL.length, ...resto.slice(0, 200).map(l => l.length));
    return { cab: Array.from({ length: n }, (_, j) => String(cabL[j] == null ? '' : cabL[j]).trim() || ('Coluna ' + (j + 1))), linhas: resto };
  }
  const ACHAR = {
    tsk: h => /^(numero|tsk|chamado|ticket|n)$/.test(norm(h)) || /^(numero|tsk)\b/.test(norm(h)),
    ne: h => /^ne ?-?_?id$/.test(norm(h)) || /^neid/.test(norm(h)),
    end: h => /^end ?-?_?id$/.test(norm(h)) || /^endid/.test(norm(h))
  };
  // Colunas padrão: TSK = B, ID da atividade = C, tipo da atividade = D, estado = E, regra criadora = DJ, evento = GF.
  // Procura primeiro pelo nome do cabeçalho; se não achar, usa a letra da coluna.
  function colsAuto(m) {
    const porNome = re => dados.cab.findIndex(h => re.test(norm(h)));
    const achar = (re, L) => { const i = porNome(re); if (i >= 0) return i; const j = colIdx(L); return j < dados.cab.length ? j : -1; };
    const iT = dados.cab.findIndex(ACHAR.tsk);
    const tsk = iT >= 0 ? iT : (dados.cab.length > 1 ? 1 : 0);
    const iC = m === 'tsk' ? tsk : dados.cab.findIndex(ACHAR[m]);
    return {
      cod: iC >= 0 ? iC : 0, tsk: m === 'tsk' ? -1 : tsk,
      ev: achar(/^evento$/, 'GF'), st: achar(/^(estado|status)$/, 'E'), rg: achar(/^regra( usuario)? criador/, 'DJ'),
      tp: achar(/^tipo da atividade$/, 'D'), id: achar(/^id da atividade$/, 'C')
    };
  }
  const limpo = v => { v = String(v == null ? '' : v).trim(); return (!v || /^(-|n\/?a|nan|null|none|#n\/?a)$/i.test(v)) ? '' : v; };
  // compara dois IDs de atividade: >0 se a for maior (mais recente) que b
  const cmpId = (a, b) => {
    const x = String(a == null ? '' : a).trim(), y = String(b == null ? '' : b).trim();
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) { const d = BigInt(x) - BigInt(y); return d > 0n ? 1 : (d < 0n ? -1 : 0); }
    return x.localeCompare(y, undefined, { numeric: true });
  };
  function construir() {
    itens = [];
    if (!dados) return;
    const cc = +$('#col').value, ct = +$('#colTsk').value, ce = +$('#colEv').value, cs = +$('#colSt').value, cr = +$('#colRg').value, cp = +$('#colTp').value, ci = +$('#colId').value;
    const F = CFG.filtros;
    const aceitos = new Set(F.status.map(norm)), excl = F.excluir.map(norm).filter(Boolean), tipos = new Set((F.tipo || []).map(norm));
    const tskCol = modo === 'tsk' ? cc : ct;
    const ign = { tipo: 0, status: 0, repetida: 0, regra: 0 };
    // 1) linhas válidas: tipo da atividade (coluna D) e estado (coluna E)
    const validas = [];
    dados.linhas.forEach((l, li) => {
      if (F.ativo) {
        if (cp >= 0 && tipos.size && !tipos.has(norm(l[cp]))) { ign.tipo++; return; }
        if (cs >= 0 && aceitos.size && !aceitos.has(norm(l[cs]))) { ign.status++; return; }
      }
      validas.push(li);
    });
    // 2) TSK repetida (coluna B): entre as linhas válidas, fica a de maior ID da atividade (coluna C) = mais recente
    const porTsk = new Map(), semTsk = [];
    validas.forEach(li => {
      const t = tskCol >= 0 ? limpo(dados.linhas[li][tskCol]) : '';
      if (!t) { semTsk.push(li); return; }
      const atual = porTsk.get(t);
      if (atual == null) { porTsk.set(t, li); return; }
      ign.repetida++;
      if (ci >= 0 && cmpId(dados.linhas[li][ci], dados.linhas[atual][ci]) > 0) porTsk.set(t, li);
    });
    const escolhidas = [...porTsk.values(), ...semTsk].sort((a, b) => a - b);
    // 3) regra usuário criador (coluna DJ) da linha escolhida e montagem dos itens
    const mapa = new Map();
    escolhidas.forEach(li => {
      const l = dados.linhas[li], c = limpo(l[cc]); if (!c) return;
      if (F.ativo && cr >= 0 && excl.length) { const r = norm(l[cr]); if (excl.some(x => r.includes(x))) { ign.regra++; return; } }
      if (!mapa.has(c)) mapa.set(c, { tsks: new Set(), evs: new Set(), org: new Set(), ids: new Set() });
      const m = mapa.get(c);
      m.org.add(dados.orig[li]);
      if (modo !== 'tsk' && ct >= 0) { const t = limpo(l[ct]); if (t) m.tsks.add(t); }
      if (ci >= 0) { const v = limpo(l[ci]); if (v) m.ids.add(v); }
      if (ce >= 0) String(l[ce] == null ? '' : l[ce]).split(/[;,\s]+/).map(limpo).filter(Boolean).forEach(e => m.evs.add(e));
    });
    let n = 0; const cont = { ag: 0, na: 0, lista: 0 };
    mapa.forEach((v, c) => {
      v.org.forEach(k => { cont[k]++; });
      itens.push({ id: ++n, codigo: c, tsk: modo === 'tsk' ? c : [...v.tsks].join(', '), origem: ['ag', 'na', 'lista'].filter(k => v.org.has(k)).map(k => ORIG_TXT[k]).join(' + '), idAtividade: [...v.ids].join(', '), eventos: [...v.evs], eventoPlan: [...v.evs].join(', '), status: 'pendente', evento: '', alarmes: '', anexado: '', resposta: '', hora: '' });
    });
    let info = itens.length + ' ' + (modo === 'tsk' ? 'TSKs' : 'códigos únicos') + ' para testar';
    if (fontes.ag || fontes.na) info += ' (Agendado: ' + cont.ag + ' · Não agendado: ' + cont.na + ')';
    info += '.';
    if (F.ativo) info += ' Ignoradas: ' + ign.tipo + ' linhas por tipo da atividade, ' + ign.status + ' por estado';
    info += (F.ativo ? '; ' : ' ') + ign.repetida + ' linhas repetidas da mesma TSK (fica a de maior ID da atividade)';
    if (F.ativo) info += '; ' + ign.regra + ' por regra criadora';
    info += '.';
    const av = [];
    if (F.ativo && cp < 0) av.push('coluna do tipo da atividade não definida (filtro de tipo desligado)');
    if (F.ativo && cs < 0) av.push('coluna de estado não definida (filtro de estado desligado)');
    if (F.ativo && cr < 0) av.push('coluna da regra criadora não definida (filtro de regra desligado)');
    if (ci < 0) av.push('coluna do ID da atividade não definida (em TSK repetida fica a primeira linha)');
    if (ce < 0) av.push('sem coluna de evento (não dá para escolher o evento da cadeia)');
    if (av.length) info += ' ⚠ ' + av.join('; ') + '.';
    if (!itens.length) info += ' ⚠ Nenhum item sobrou: confira as colunas e os filtros.';
    $('#info').textContent = info;
    const nc = i => i >= 0 ? letra(i) + ' · ' + (dados.cab[i] || '') : '—';
    $('#infoCols').textContent = 'Colunas lidas: ' + (modo === 'tsk' ? 'TSK' : 'código') + ' = ' + nc(cc) + (ct >= 0 ? ' | TSK = ' + nc(ct) : '') + ' | ID da atividade = ' + nc(ci) + ' | tipo = ' + nc(cp) + ' | estado = ' + nc(cs) + ' | regra criadora = ' + nc(cr) + ' | evento = ' + nc(ce);
    renderTabela(); renderResumo();
  }
  function reconstruir() {
    if (rodando) { log('Pare o robô antes de mudar colunas ou filtros.'); return; }
    if (itens.some(i => i.status !== 'pendente') && !confirm('Mudar colunas ou filtros apaga os resultados atuais. Continuar?')) return;
    construir();
  }

  /* ============ EXCEL DE SAÍDA (.xlsx sem biblioteca) ============ */
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipar(arqs) {
    const enc = new TextEncoder(), partes = [], central = []; let off = 0;
    arqs.forEach(a => {
      const nome = enc.encode(a.nome), dado = enc.encode(a.conteudo), crc = crc32(dado);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, dado.length, true); lh.setUint32(22, dado.length, true); lh.setUint16(26, nome.length, true);
      partes.push(new Uint8Array(lh.buffer), nome, dado);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, dado.length, true); ch.setUint32(24, dado.length, true);
      ch.setUint16(28, nome.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nome);
      off += 30 + nome.length + dado.length;
    });
    const tam = central.reduce((s, x) => s + x.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arqs.length, true); fim.setUint16(10, arqs.length, true);
    fim.setUint32(12, tam, true); fim.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const letra = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ESTILO_STATUS = { normalizado: 2, nao_normalizado: 3, nao_validavel: 4, indefinido: 5 };
  function xmlAba(cab, linhas, estilos) {
    const larg = [14, 16, 22, 22, 16, 20, 24, 24, 50, 16, 10, 80];
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    cab.forEach((_, i) => x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (larg[i] || 18) + '" customWidth="1"/>');
    x += '</cols><sheetData>';
    const cel = (r, c, v, s) => '<c r="' + letra(c) + r + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
    x += '<row r="1">' + cab.map((v, c) => cel(1, c, v, 1)).join('') + '</row>';
    linhas.forEach((l, i) => { x += '<row r="' + (i + 2) + '">' + l.map((v, c) => cel(i + 2, c, v, estilos && estilos[i] && c === 5 ? estilos[i] : 0)).join('') + '</row>'; });
    return x + '</sheetData></worksheet>';
  }
  function gerarXlsx() {
    const cab = ['Modo', 'Origem', 'Código', 'TSK', 'ID da atividade', 'Status', 'Evento (planilha)', 'Evento (Tais)', 'Alarmes', 'Anexado no chamado', 'Hora', 'Resposta da Tais'];
    const lin = i => [NOMES_MODO[modo], i.origem || '', i.codigo, i.tsk, i.idAtividade || '', STATUS_TXT[i.status].replace(/^\S+\s/, ''), i.eventoPlan || '', i.evento, i.alarmes, i.anexado, i.hora, i.resposta];
    const sel = st => itens.filter(i => st.includes(i.status));
    const abas = [
      ['Normalizados', sel(['normalizado'])],
      ['Não normalizados', sel(['nao_normalizado'])],
      ['Não validáveis', sel(['nao_validavel'])],
      ['Indefinidos', sel(['indefinido'])],
      ['Todos', itens]
    ];
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + abas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + abas.map((a, i) => '<sheet name="' + xe(a[0]) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>';
    const wbr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + abas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const fill = c => '<fill><patternFill patternType="solid"><fgColor rgb="' + c + '"/><bgColor indexed="64"/></patternFill></fill>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + fill('FFC6EFCE') + fill('FFFFC7CE') + fill('FFE7E6E6') + fill('FFFFEB9C') + '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>';
    const arqs = [{ nome: '[Content_Types].xml', conteudo: ct }, { nome: '_rels/.rels', conteudo: rels }, { nome: 'xl/workbook.xml', conteudo: wb }, { nome: 'xl/_rels/workbook.xml.rels', conteudo: wbr }, { nome: 'xl/styles.xml', conteudo: styles }];
    abas.forEach((a, i) => arqs.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', conteudo: xmlAba(cab, a[1].map(lin), a[0] === 'Todos' ? a[1].map(x => ESTILO_STATUS[x.status] || 0) : null) }));
    return zipar(arqs);
  }
  function baixarExcel() {
    if (!itens.length) { log('Nada para exportar ainda.'); return; }
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const nome = 'resultado_tais_' + modo + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.xlsx';
    const url = URL.createObjectURL(gerarXlsx());
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log('⬇ Excel gerado: ' + nome);
  }

  /* ============ PAINEL ============ */
  const host = document.createElement('div');
  host.id = '__roboTais';
  host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
  document.documentElement.appendChild(host);
  ['keydown', 'keyup', 'keypress', 'paste'].forEach(t => host.addEventListener(t, e => e.stopPropagation()));
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = `
<style>
:host{all:initial}
:host,:host([data-tema="dark"]){
 --bg:rgba(8,12,22,.92);--card:rgba(255,255,255,.035);--inp:#0a1121;--line:rgba(130,170,255,.2);--grid:rgba(120,170,255,.07);
 --fg:#e7eefb;--muted:#8da0bf;--acc:#22d3ee;--acc2:#3b82f6;--glow:rgba(34,211,238,.42);--ring:rgba(34,211,238,.25);
 --ok:#34d399;--bad:#fb7185;--gray:#94a3b8;--warn:#fbbf24;
 --t-ok:rgba(52,211,153,.13);--t-bad:rgba(251,113,133,.13);--t-gray:rgba(148,163,184,.12);--t-warn:rgba(251,191,36,.13);--t-acc:rgba(34,211,238,.14);
 --hbg:linear-gradient(135deg,rgba(34,211,238,.16),rgba(59,130,246,.12));--th:#0d162b;--hov:rgba(255,255,255,.05);
 --go-fg:#031420;--solid:#0d1424;--shadow:0 28px 70px rgba(0,0,0,.65),0 0 0 1px rgba(34,211,238,.14),0 0 40px rgba(34,211,238,.08);
 --mono:ui-monospace,"Cascadia Code","SF Mono",Consolas,monospace}
:host([data-tema="light"]){
 --bg:rgba(250,252,255,.94);--card:#f2f6fc;--inp:#ffffff;--line:#d3dcec;--grid:rgba(37,99,235,.06);
 --fg:#0e1a2f;--muted:#566884;--acc:#0891b2;--acc2:#2563eb;--glow:rgba(8,145,178,.32);--ring:rgba(37,99,235,.22);
 --ok:#047857;--bad:#be123c;--gray:#516078;--warn:#a16207;
 --t-ok:rgba(16,185,129,.14);--t-bad:rgba(244,63,94,.12);--t-gray:rgba(100,116,139,.12);--t-warn:rgba(234,179,8,.17);--t-acc:rgba(8,145,178,.13);
 --hbg:linear-gradient(135deg,#e0f4fb,#e4eaff);--th:#e6edf8;--hov:rgba(15,40,90,.05);
 --go-fg:#ffffff;--solid:#ffffff;--shadow:0 22px 55px rgba(20,40,90,.28),0 0 0 1px rgba(37,99,235,.12);}
*{box-sizing:border-box;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
.p{position:relative;width:470px;max-height:92vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);font-size:13px;overflow:hidden;-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);animation:in .38s cubic-bezier(.2,.8,.2,1)}
.p::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:22px 22px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 60%);mask-image:linear-gradient(180deg,#000,transparent 60%)}
.p.largo{width:min(920px,96vw)}
.h,.c,.f{position:relative}
.h{display:flex;align-items:center;gap:8px;padding:11px 12px;background:var(--hbg);cursor:move;user-select:none}
.h::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,var(--acc),var(--acc2),transparent);background-size:200% 100%;opacity:.55}
.run .h::after{opacity:1;animation:slide 2.4s linear infinite}
.logo{color:var(--acc);display:grid;filter:drop-shadow(0 0 7px var(--glow))}
.tit{flex:1;display:flex;flex-direction:column;line-height:1.1}
.tit b{font-size:14px;letter-spacing:.2em;text-transform:uppercase;font-weight:800;background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.tit small{font:10px var(--mono);color:var(--muted);letter-spacing:.06em;margin-top:3px}
.led{width:9px;height:9px;border-radius:50%;background:var(--gray);flex:none}
.run .led{background:var(--acc);box-shadow:0 0 12px var(--acc);animation:pulse 1.1s ease-in-out infinite}
.ib{width:28px;height:28px;display:grid;place-items:center;padding:0;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;cursor:pointer;font-size:14px;line-height:1;transition:.16s}
.ib:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);box-shadow:0 4px 14px var(--glow)}
.c{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:11px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.min .c,.min .f{display:none}
fieldset{border:1px solid var(--line);background:var(--card);border-radius:13px;padding:10px 11px 9px;margin:0;transition:border-color .2s,box-shadow .2s}
fieldset:hover{border-color:var(--acc);box-shadow:0 0 0 1px var(--ring),0 8px 24px rgba(0,0,0,.12)}
legend{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:0 6px;color:var(--acc)}
.modos{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.modos button{padding:10px 4px;border:1px solid var(--line);background:var(--inp);color:var(--fg);border-radius:11px;cursor:pointer;font-weight:600;font-size:12px;transition:.16s}
.modos button:hover:not(:disabled){border-color:var(--acc);transform:translateY(-2px);box-shadow:0 6px 18px var(--glow)}
.modos button.on{border-color:var(--acc);background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(59,130,246,.2));box-shadow:0 0 0 1px var(--acc) inset,0 0 20px var(--glow)}
.modos button:disabled{opacity:.5;cursor:not-allowed}
label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--muted)}
input[type=text],input[type=number],select,textarea{border:1px solid var(--line);border-radius:9px;padding:6px 8px;font-size:12px;width:100%;background:var(--inp);color:var(--fg);transition:.15s;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--ring)}
input[type=checkbox]{accent-color:var(--acc);width:15px;height:15px}
input[type=file]{font-size:12px;color:var(--muted)}
input[type=file]::file-selector-button{margin-right:9px;border:1px solid var(--line);background:var(--inp);color:var(--fg);border-radius:8px;padding:6px 11px;cursor:pointer;font-weight:600;transition:.15s}
input[type=file]::file-selector-button:hover{border-color:var(--acc);color:var(--acc)}
textarea{min-height:60px;font-family:var(--mono)}
.l{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.l>*{flex:1;min-width:90px}
.b{padding:8px 11px;border:1px solid var(--line);background:var(--inp);border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;color:var(--fg);transition:.16s}
.b:hover:not(:disabled){border-color:var(--acc);color:var(--acc);transform:translateY(-1px);box-shadow:0 5px 16px var(--glow)}
.b:active:not(:disabled){transform:translateY(0)}
.b:disabled{opacity:.4;cursor:not-allowed}
.go{background:linear-gradient(135deg,var(--acc),var(--acc2));border:0;color:var(--go-fg);font-size:14px;flex:2;box-shadow:0 7px 20px var(--glow)}
.go:hover:not(:disabled){color:var(--go-fg);filter:brightness(1.1);box-shadow:0 10px 28px var(--glow)}
.stop{background:linear-gradient(135deg,#fb7185,#e11d48);border:0;color:#fff}
.stop:hover:not(:disabled){color:#fff;box-shadow:0 6px 20px rgba(244,63,94,.45)}
.agora{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:13px;padding:10px 12px;background:var(--card);min-height:56px;color:var(--muted)}
.agora b{font-size:15px;color:var(--fg);font-family:var(--mono)}
.agora.on{border-color:var(--acc);background:var(--t-acc);box-shadow:0 0 0 1px var(--ring),0 0 26px var(--glow)}
.agora.on::after{content:"";position:absolute;top:0;left:-45%;width:45%;height:100%;pointer-events:none;background:linear-gradient(100deg,transparent,var(--ring),transparent);animation:sweep 1.9s linear infinite}
.pr{display:flex;align-items:center;gap:9px}
.prog{flex:1;height:7px;border-radius:99px;background:var(--inp);border:1px solid var(--line);overflow:hidden}
.prog i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 12px var(--glow);transition:width .45s}
.pr span{font:11px var(--mono);color:var(--muted);min-width:56px;text-align:right}
.cont{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:7px}
.cont div{position:relative;overflow:hidden;text-align:center;border-radius:11px;padding:8px 2px 6px;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--line);background:var(--card);color:var(--muted);transition:.16s}
.cont div::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:var(--c);box-shadow:0 0 10px var(--c)}
.cont div:hover{transform:translateY(-2px);border-color:var(--c);box-shadow:0 6px 18px rgba(0,0,0,.14)}
.cont strong{display:block;font:700 21px var(--mono);letter-spacing:0;color:var(--c);text-shadow:0 0 14px var(--c);margin-bottom:1px}
.k-p{--c:var(--acc)}.k-n,.k-a{--c:var(--ok)}.k-r{--c:var(--bad)}.k-g{--c:var(--gray)}.k-y{--c:var(--warn)}
.prontos{background:var(--t-ok);border:1px solid var(--ok);border-radius:13px;padding:10px 11px;box-shadow:0 0 26px var(--t-ok)}
.prontos h4{margin:0 0 7px;color:var(--ok);font-size:12px;letter-spacing:.05em;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.chips{display:flex;flex-wrap:wrap;gap:5px;max-height:92px;overflow:auto}
.chips span{background:var(--inp);border:1px solid var(--ok);color:var(--fg);border-radius:99px;padding:2px 10px;font:11px var(--mono);cursor:pointer;transition:.15s}
.chips span:hover{background:var(--ok);color:var(--inp);transform:translateY(-1px);box-shadow:0 4px 12px var(--t-ok)}
.tab{max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:13px;background:var(--card);scrollbar-width:thin;scrollbar-color:var(--line) transparent}
table{border-collapse:collapse;width:100%;font-size:12px}
th{position:sticky;top:0;z-index:1;background:var(--th);color:var(--muted);text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
td{padding:5px 8px;border-top:1px solid var(--line);vertical-align:top;word-break:break-word}
td:nth-child(1),td:nth-child(2){white-space:nowrap;font-family:var(--mono)}
tr{cursor:pointer;transition:background .15s}tr:hover td{background:var(--hov)}
tr.normalizado{background:var(--t-ok)}tr.nao_normalizado{background:var(--t-bad)}tr.nao_validavel{background:var(--t-gray)}tr.indefinido{background:var(--t-warn)}
tr.normalizado td:first-child{box-shadow:inset 3px 0 0 var(--ok)}tr.nao_normalizado td:first-child{box-shadow:inset 3px 0 0 var(--bad)}tr.nao_validavel td:first-child{box-shadow:inset 3px 0 0 var(--gray)}tr.indefinido td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
tr.testando{font-weight:600;animation:rowglow 1.2s ease-in-out infinite}tr.testando td:first-child{box-shadow:inset 3px 0 0 var(--acc)}
.det{display:none;white-space:pre-wrap;font:11px/1.4 var(--mono);color:var(--muted);margin-top:4px;background:var(--inp);border:1px solid var(--line);padding:6px;border-radius:8px}tr.open .det{display:block}
.alm{font-size:11px;color:var(--bad)}
.sub{font:10px var(--mono);color:var(--muted);white-space:normal}
.ups{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.up{border:1px dashed var(--line);border-radius:12px;padding:9px;background:var(--inp);display:flex;flex-direction:column;gap:6px;transition:.2s;min-width:0}
.up:hover,.up.drag{border-color:var(--acc);box-shadow:0 0 0 3px var(--ring)}
.up.ok{border:1px solid var(--ok);background:var(--t-ok)}.up.aviso{border:1px solid var(--warn);background:var(--t-warn)}
.up.pisca{animation:pisca .9s ease 2}
.upt{font-weight:700;font-size:13px}
.uph{font-size:10.5px;color:var(--muted);line-height:1.4}.uph i{font:10px var(--mono);font-style:normal;word-break:break-all;color:var(--fg);opacity:.8}
.upb{display:block;text-align:center;border:1px solid var(--line);border-radius:9px;padding:6px;cursor:pointer;font-weight:600;font-size:12px;background:var(--card);color:var(--fg);transition:.15s}
.upb:hover{border-color:var(--acc);color:var(--acc);box-shadow:0 5px 16px var(--glow)}.upb input{display:none}
.upi{display:flex;align-items:flex-start;gap:6px;font-size:11px;color:var(--muted);word-break:break-word}
.up.ok .upi{color:var(--ok)}.up.aviso .upi{color:var(--warn)}
.upi .x{margin-left:auto;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:13px;padding:0 2px}.upi .x:hover{color:var(--bad)}
.modal{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:16px;background:rgba(2,6,16,.55);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);animation:in .2s}
.balao{position:relative;max-width:370px;background:var(--solid);color:var(--fg);border:1px solid var(--acc);border-radius:18px;padding:16px 16px 14px;box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 30px var(--glow)}
.balao::after{content:"";position:absolute;left:34px;bottom:-9px;width:16px;height:16px;background:var(--solid);border-right:1px solid var(--acc);border-bottom:1px solid var(--acc);transform:rotate(45deg)}
.bt{font-weight:800;color:var(--acc);letter-spacing:.03em;margin-bottom:6px}.bx{font-size:13px;line-height:1.5;color:var(--fg)}
.bb{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.bb .go{flex:none;font-size:12px}
.log{height:118px;overflow:auto;background:#060a14;color:#86efc7;font:11px/1.5 var(--mono);padding:8px 10px;border-radius:12px;border:1px solid var(--line);white-space:pre-wrap;box-shadow:inset 0 0 24px rgba(34,211,238,.06);scrollbar-width:thin;scrollbar-color:#25314d transparent}
.nota{font-size:11px;color:var(--muted)}
details>summary{cursor:pointer;font-weight:700;color:var(--acc);font-size:12px;transition:.15s}details>summary:hover{filter:brightness(1.2)}
.f{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid var(--line);background:var(--card);font-size:11px;color:var(--muted)}
.f b{color:var(--acc);letter-spacing:.05em;text-shadow:0 0 12px var(--glow)}.f span:last-child{font-family:var(--mono)}
.lanc{display:none;place-items:center;width:52px;height:52px;border:0;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--go-fg);cursor:pointer;box-shadow:0 8px 26px var(--glow);transition:.18s;animation:pulseb 2.4s ease-in-out infinite}
.lanc:hover{transform:scale(1.08) rotate(-4deg)}
@keyframes pisca{50%{box-shadow:0 0 0 4px var(--glow);border-color:var(--acc)}}
@keyframes in{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes pulse{50%{opacity:.35;transform:scale(.8)}}
@keyframes pulseb{50%{box-shadow:0 8px 40px var(--glow),0 0 0 8px var(--ring)}}
@keyframes slide{to{background-position:-200% 0}}
@keyframes sweep{to{left:110%}}
@keyframes rowglow{50%{background:var(--t-acc)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
<button class="lanc" id="lanc" title="Abrir Robô Tais"><svg width="28" height="28" viewBox="0 0 24 24"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/><path d="M9 15h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
<div class="p" id="p">
 <div class="h" id="h"><span class="logo"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="1.4" fill="currentColor"/><circle cx="15" cy="11" r="1.4" fill="currentColor"/><path d="M9 15h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span><div class="tit"><b>Robô Tais</b><small>VALIDAÇÃO AUTOMÁTICA · v${VERSAO}</small></div><span class="led" id="led" title="Estado do robô"></span><button class="ib" id="bTema" title="Tema claro / escuro">◐</button><button class="ib" id="bLargo" title="Aumentar / diminuir">⇔</button><button class="ib" id="bMin" title="Minimizar">–</button><button class="ib" id="bX" title="Esconder (o robô continua)">×</button></div>
 <div class="c">
  <fieldset><legend>1. O que fazer</legend>
   <div class="modos"><button data-m="tsk">✅ Validar TSK</button><button data-m="ne">📡 Testar NE-ID</button><button data-m="end">🏢 Testar END-ID</button></div>
  </fieldset>
  <fieldset><legend>2. Planilha</legend>
   <div class="ups">
    <div class="up" id="upAg">
     <div class="upt">📅 Agendado</div>
     <div class="uph">Arquivo com a <b>data de hoje</b> no nome<br><i>ex.: Atividades-TRJ_FMMT_17_11_26</i></div>
     <label class="upb">Escolher arquivo<input type="file" id="arqAg" accept=".xlsx,.csv,.txt"></label>
     <div class="upi"><span id="infoAg">Nenhum arquivo.</span><button class="x" id="rmAg" title="Remover" hidden>✕</button></div>
    </div>
    <div class="up" id="upNa">
     <div class="upt">🕓 Não agendado</div>
     <div class="uph">Arquivo com <b>“não agendada”</b> no nome<br><i>ex.: Atividades-TRJ_FMMT_Não-agendada</i></div>
     <label class="upb">Escolher arquivo<input type="file" id="arqNa" accept=".xlsx,.csv,.txt"></label>
     <div class="upi"><span id="infoNa">Nenhum arquivo.</span><button class="x" id="rmNa" title="Remover" hidden>✕</button></div>
    </div>
   </div>
   <details style="margin-top:6px"><summary>ou cole a lista aqui</summary><textarea id="cola" placeholder="Cole aqui (uma por linha) as TSKs / NE-IDs / END-IDs copiadas do Excel"></textarea><button class="b" id="bCola" style="margin-top:4px">Usar lista colada</button></details>
   <div class="nota" id="info" style="margin-top:6px">Nenhuma planilha carregada.</div>
   <div class="nota" id="infoCols"></div>
   <details style="margin-top:6px"><summary>Colunas e filtros</summary>
    <div class="l" style="margin-top:6px"><label>Coluna dos códigos<select id="col"></select></label><label>Coluna da TSK (p/ NE/END)<select id="colTsk"></select></label></div>
    <div class="l" style="margin-top:6px"><label>Coluna do ID da atividade (C)<select id="colId"></select></label><label>Coluna do tipo da atividade (D)<select id="colTp"></select></label><label>Coluna do estado (E)<select id="colSt"></select></label></div>
    <div class="l" style="margin-top:6px"><label>Coluna do evento (GF)<select id="colEv"></select></label><label>Coluna da regra criadora (DJ)<select id="colRg"></select></label></div>
    <label style="flex-direction:row;gap:6px;align-items:center;margin:8px 0 6px"><input type="checkbox" id="fAtivo"> Aplicar os filtros abaixo (tipo, estado e regra criadora)</label>
    <div class="l"><label>Tipos de atividade aceitos (um por linha)<textarea id="fTipo"></textarea></label><label>Estados aceitos (um por linha)<textarea id="fStatus"></textarea></label><label>Ignorar se a regra criadora contiver<textarea id="fExcl"></textarea></label></div>
    <div class="nota" style="margin-top:4px">Se a mesma TSK aparecer em várias linhas, o robô usa só as linhas válidas e, entre elas, a de maior ID da atividade (a mais recente).</div>
   </details>
   <button class="b" id="bRec" style="display:none;margin-top:4px"></button>
  </fieldset>
  <fieldset><legend>3. Executar</legend>
   <div class="l"><label>Mensagem enviada (use {codigo})<input type="text" id="tmpl"></label><label>Quantos testar (0 = todos)<input type="number" id="lim" min="0"></label></div>
   <div class="l" style="margin-top:6px"><label>Pausa entre itens (s)<input type="number" id="pausa" min="0"></label><label>Tempo máx. resposta (s)<input type="number" id="espera" min="10"></label></div>
   <label style="flex-direction:row;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="sim"> 🧪 Modo simulação (não mexe na Tais)</label>
   <label style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="ret"> Continuar sozinho se a página recarregar</label>
   <div class="l" style="margin-top:8px"><button class="b go" id="bGo">▶ Iniciar</button><button class="b stop" id="bStop" disabled>■ Parar</button><button class="b" id="bXls">⬇ Excel</button><button class="b" id="bLimpa">↺ Limpar</button></div>
  </fieldset>
  <div class="agora" id="agora">Parado.</div>
  <div class="pr"><div class="prog"><i id="progI"></i></div><span id="progT">0 / 0</span></div>
  <div class="cont" id="cont"></div>
  <div class="prontos" id="prontos"><h4>✔ Prontos para encerrar: <span id="nPront">0</span> <button class="b" id="bCopia" style="padding:1px 6px;margin-left:6px">copiar lista</button></h4><div class="chips" id="chips"></div></div>
  <div><div class="l" style="margin-bottom:4px"><label>Mostrar<select id="filtro"><option value="">Todos</option><option value="normalizado">🟢 Normalizados</option><option value="nao_normalizado">🔴 Não normalizados</option><option value="nao_validavel">⚪ Não validáveis</option><option value="indefinido">🟡 Indefinidos</option><option value="pendente">⏳ Pendentes</option></select></label></div>
   <div class="tab"><table><thead><tr><th>#</th><th>Código</th><th id="thTsk">TSK</th><th>Status</th><th>Anexo</th></tr></thead><tbody id="tb"></tbody></table></div></div>
  <div class="log" id="log"></div>
  <details><summary>Calibração e frases (se a Tais não for reconhecida)</summary>
   <div class="l" style="margin:6px 0"><button class="b" id="bConn">🔌 Testar conexão</button><button class="b" id="pInp">🎯 Marcar campo de mensagem</button><button class="b" id="pMsg">🎯 Marcar área das mensagens</button><button class="b" id="pEnv">🎯 Marcar botão enviar</button><button class="b" id="pZera">Voltar ao automático</button></div>
   <div class="nota" id="calib"></div>
   <label>🟢 Normalizado (uma frase por linha)<textarea id="fSim"></textarea></label>
   <label>🔴 Não normalizado<textarea id="fNao"></textarea></label>
   <label>⚪ Não validável<textarea id="fNv"></textarea></label>
   <label>🟡 Indefinido: não dá para afirmar (nunca vira normalizado)<textarea id="fInd"></textarea></label>
   <label>Pergunta da cadeia de tickets (escolhe o evento da planilha)<textarea id="fCad"></textarea></label>
   <label>Pergunta “inserir resultado no chamado”<textarea id="fPer"></textarea></label>
   <label>Confirmação de que anexou<textarea id="fConf"></textarea></label>
   <button class="b" id="bFr" style="margin-top:4px">Salvar frases</button> <button class="b" id="bFrPad">Restaurar padrão</button>
  </details>
 </div>
 <div class="f"><span>⚡ Desenvolvido por <b>Lucas Infante</b></span><span>v${VERSAO}</span></div>
</div>`;
  function aplicarTema() { host.setAttribute('data-tema', CFG.tema === 'light' ? 'light' : 'dark'); }
  aplicarTema();
  const $ = s => sr.querySelector(s);
  const $$ = s => [...sr.querySelectorAll(s)];

  function log(m) {
    const el = $('#log'); if (!el) return;
    el.textContent += '[' + agora() + '] ' + m + '\n';
    const ls = el.textContent.split('\n'); if (ls.length > 300) el.textContent = ls.slice(-250).join('\n');
    el.scrollTop = el.scrollHeight;
  }
  const linhasTr = new Map();
  function renderTabela() {
    const tb = $('#tb'); tb.textContent = ''; linhasTr.clear();
    $('#thTsk').style.display = modo === 'tsk' ? 'none' : '';
    itens.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td>';
      tr.addEventListener('click', () => tr.classList.toggle('open'));
      tb.appendChild(tr); linhasTr.set(it.id, tr); atualizarLinha(it);
    });
    aplicarFiltro();
  }
  function atualizarLinha(it) {
    const tr = linhasTr.get(it.id); if (!tr) return;
    tr.className = (it.status) + (tr.classList.contains('open') ? ' open' : '');
    const td = tr.children;
    td[0].textContent = it.id; td[1].textContent = it.codigo;
    const sub = [it.origem === ORIG_TXT.lista ? '' : it.origem, it.idAtividade ? 'ID ' + it.idAtividade : '', it.eventoPlan].filter(Boolean).join(' · ');
    if (sub) { const sb = document.createElement('div'); sb.className = 'sub'; sb.textContent = sub; td[1].appendChild(sb); }
    td[2].textContent = it.tsk; td[2].style.display = modo === 'tsk' ? 'none' : '';
    td[3].textContent = ''; const st = document.createElement('div'); st.textContent = STATUS_TXT[it.status]; td[3].appendChild(st);
    if (it.evento || it.alarmes) { const a = document.createElement('div'); a.className = 'alm'; a.textContent = [it.evento, it.alarmes].filter(Boolean).join(' • '); td[3].appendChild(a); }
    const d = document.createElement('div'); d.className = 'det'; d.textContent = it.resposta || ''; td[3].appendChild(d);
    td[4].textContent = it.anexado || (it.status === 'normalizado' && modo === 'tsk' ? '' : '—');
    if (it.anexado === 'SIM') td[4].textContent = '✔ SIM'; else if (it.anexado === 'FALHOU') td[4].textContent = '✖ FALHOU'; else if (it.anexado === 'VERIFICAR') td[4].textContent = '⚠ VERIFICAR';
    if (it.status === 'testando') tr.scrollIntoView({ block: 'nearest' });
  }
  function aplicarFiltro() {
    const f = $('#filtro').value;
    itens.forEach(it => { const tr = linhasTr.get(it.id); if (tr) tr.style.display = (!f || it.status === f) ? '' : 'none'; });
  }
  function prontos() {
    return itens.filter(i => i.status === 'normalizado' && (modo !== 'tsk' || i.anexado === 'SIM'));
  }
  function renderResumo() {
    const c = s => itens.filter(i => i.status === s).length;
    const anex = itens.filter(i => i.anexado === 'SIM').length;
    const caixas = [['k-p', c('pendente') + c('testando'), 'Faltam'], ['k-n', c('normalizado'), 'Normaliz.'], ['k-r', c('nao_normalizado'), 'Não norm.'], ['k-g', c('nao_validavel'), 'Não valid.'], ['k-y', c('indefinido'), 'Indef.']];
    if (modo === 'tsk') caixas.push(['k-a', anex, 'Anexados']);
    $('#cont').innerHTML = caixas.map(x => '<div class="' + x[0] + '"><strong>' + x[1] + '</strong>' + x[2] + '</div>').join('');
    const pr = prontos();
    const feitos = itens.filter(i => i.status !== 'pendente' && i.status !== 'testando').length;
    $('#progI').style.width = (itens.length ? feitos / itens.length * 100 : 0) + '%'; $('#progT').textContent = feitos + ' / ' + itens.length;
    $('#nPront').textContent = pr.length;
    const ch = $('#chips'); ch.textContent = '';
    pr.forEach(i => { const s = document.createElement('span'); s.textContent = modo === 'tsk' ? i.codigo : (i.codigo + (i.tsk ? ' (' + i.tsk + ')' : '')); s.title = 'Clique para copiar'; s.onclick = () => copiar(modo === 'tsk' ? i.codigo : (i.tsk || i.codigo)); ch.appendChild(s); });
    aplicarFiltro();
  }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); log('Copiado: ' + t.split('\n').length + ' item(ns)'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); log('Copiado.'); }
  }
  function atualizarBotoes() {
    $('#bGo').disabled = rodando; $('#bStop').disabled = !rodando; $('#bLimpa').disabled = rodando;
    $$('.modos button').forEach(b => { b.classList.toggle('on', b.dataset.m === modo); b.disabled = rodando; });
  }
  setInterval(() => {
    const a = $('#agora'); $('#p').classList.toggle('run', rodando);
    if (rodando && itemAtual) { a.className = 'agora on'; a.innerHTML = ''; const b = document.createElement('b'); b.textContent = '🔄 Testando agora: ' + itemAtual.codigo; const d = document.createElement('div'); d.textContent = faseTxt + ' (' + Math.round((Date.now() - inicioItem) / 1000) + 's)  •  item ' + itemAtual.id + ' de ' + itens.length; a.append(b, d); }
    else if (rodando) { a.className = 'agora on'; a.textContent = faseTxt || 'Preparando…'; }
    else { a.className = 'agora'; a.textContent = 'Parado.'; }
  }, 500);

  function preencherCfg() {
    $('#tmpl').value = CFG.tmpl[modo]; $('#lim').value = CFG.limite; $('#pausa').value = CFG.pausa; $('#espera').value = CFG.espera;
    $('#sim').checked = CFG.simulacao; $('#ret').checked = CFG.retomar;
    $('#fSim').value = CFG.frases.sim.join('\n'); $('#fNao').value = CFG.frases.nao.join('\n'); $('#fNv').value = CFG.frases.nv.join('\n');
    $('#fPer').value = CFG.frases.pergunta.join('\n'); $('#fConf').value = CFG.frases.conf.join('\n');
    $('#fInd').value = CFG.frases.indef.join('\n'); $('#fCad').value = CFG.frases.cadeia.join('\n');
    $('#fAtivo').checked = CFG.filtros.ativo; $('#fStatus').value = CFG.filtros.status.join('\n'); $('#fExcl').value = CFG.filtros.excluir.join('\n'); $('#fTipo').value = (CFG.filtros.tipo || []).join('\n');
    $('#calib').textContent = 'Campo: ' + (CFG.selInput || 'automático') + ' | Mensagens: ' + (CFG.selMsgs || 'automático') + ' | Enviar: ' + (CFG.selEnviar || 'tecla Enter');
  }
  function lerCfg() {
    CFG.tmpl[modo] = $('#tmpl').value || '{codigo}'; CFG.limite = Math.max(0, +$('#lim').value || 0);
    CFG.pausa = Math.max(0, +$('#pausa').value || 0); CFG.espera = Math.max(10, +$('#espera').value || 90);
    CFG.simulacao = $('#sim').checked; CFG.retomar = $('#ret').checked; salvarCfg();
  }
  ['#tmpl', '#lim', '#pausa', '#espera', '#sim', '#ret'].forEach(s => $(s).addEventListener('change', lerCfg));
  $('#filtro').addEventListener('change', aplicarFiltro);

  function trocarModo(m) {
    modo = m; store.set('modo', m); preencherCfg(); atualizarBotoes();
    if (dados) { const c = colsAuto(m); $('#col').value = c.cod; $('#colTsk').value = c.tsk; construir(); } else { renderTabela(); renderResumo(); }
  }
  $$('.modos button').forEach(b => b.addEventListener('click', () => trocarModo(b.dataset.m)));

  function preencherSelects() {
    const ops = dados.cab.map((c, i) => '<option value="' + i + '">' + xe(letra(i) + ' · ' + c) + '</option>').join('');
    const nenhuma = '<option value="-1">(nenhuma)</option>';
    $('#col').innerHTML = ops;
    ['#colTsk', '#colEv', '#colSt', '#colRg', '#colTp', '#colId'].forEach(q => { $(q).innerHTML = nenhuma + ops; });
    const c = colsAuto(modo);
    $('#col').value = c.cod; $('#colTsk').value = c.tsk; $('#colEv').value = c.ev; $('#colSt').value = c.st; $('#colRg').value = c.rg; $('#colTp').value = c.tp; $('#colId').value = c.id;
  }
  // junta as planilhas carregadas (Agendado + Não agendado) numa só lista
  function montarDados() {
    const usar = fontes.lista ? [['lista', fontes.lista]] : [['ag', fontes.ag], ['na', fontes.na]].filter(x => x[1]);
    atualizarSlots();
    if (!usar.length) { dados = null; itens = []; $('#info').textContent = 'Nenhuma planilha carregada.'; $('#infoCols').textContent = ''; renderTabela(); renderResumo(); return; }
    const base = usar[0][1];
    dados = { cab: base.cab, linhas: [], orig: [] };
    usar.forEach(([k, f]) => {
      if (f.cab.join('|') !== base.cab.join('|')) log('⚠ O layout de “' + f.nome + '” é diferente do primeiro arquivo; as colunas serão lidas pela mesma posição.');
      f.linhas.forEach(l => { dados.linhas.push(l); dados.orig.push(k); });
    });
    preencherSelects(); construir();
  }
  const hojeTxt = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '_' + p(d.getMonth() + 1) + '_' + String(d.getFullYear()).slice(2); };
  const ehNaoAgendada = nome => /\bn(ao|\s?o)\s+agendad/.test(norm(nome).replace(/[_\-.]+/g, ' '));
  function checarNome(slot, nome) {
    if (slot === 'ag') {
      if (ehNaoAgendada(nome)) return { ok: false, msg: 'o nome parece o do arquivo NÃO agendado' };
      const m = nome.match(/(\d{1,2})[_\-.](\d{1,2})[_\-.](\d{2,4})/);
      if (!m) return { ok: false, msg: 'o nome não tem data (esperado algo como ' + hojeTxt() + ')' };
      const d = new Date(), ano = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      if (+m[1] !== d.getDate() || +m[2] !== d.getMonth() + 1 || ano !== d.getFullYear()) return { ok: false, msg: 'a data do nome é ' + m[1] + '/' + m[2] + '/' + m[3] + ' e hoje é ' + hojeTxt().replace(/_/g, '/') };
      return { ok: true };
    }
    return ehNaoAgendada(nome) ? { ok: true } : { ok: false, msg: 'o nome não tem “não agendada”' };
  }
  const SLOT = { ag: { el: '#upAg', info: '#infoAg', rm: '#rmAg', inp: '#arqAg', nome: 'Agendado' }, na: { el: '#upNa', info: '#infoNa', rm: '#rmNa', inp: '#arqNa', nome: 'Não agendado' } };
  function atualizarSlots() {
    ['ag', 'na'].forEach(k => {
      const S = SLOT[k], f = fontes[k], box = $(S.el);
      box.classList.toggle('ok', !!f && f.chk.ok); box.classList.toggle('aviso', !!f && !f.chk.ok);
      $(S.rm).hidden = !f;
      $(S.info).textContent = f ? ((f.chk.ok ? '✔ ' : '⚠ ') + f.nome + ' · ' + f.linhas.length + ' linhas' + (f.chk.ok ? '' : ' — ' + f.chk.msg + '. Confira se é o arquivo certo.')) : 'Nenhum arquivo.';
    });
  }
  async function carregarArquivo(slot, f) {
    try {
      const abas = /\.xlsx$/i.test(f.name) ? await lerXlsx(await f.arrayBuffer()) : lerTexto(await f.text());
      if (!abas.length) throw new Error('planilha vazia');
      const fonte = prepararFonte(abas); fonte.nome = f.name; fonte.chk = checarNome(slot, f.name);
      fontes[slot] = fonte; fontes.lista = null; seguirUm = '';
      log('Planilha ' + SLOT[slot].nome + ' carregada: ' + f.name + ' (' + fonte.linhas.length + ' linhas)' + (fonte.chk.ok ? '' : ' ⚠ ' + fonte.chk.msg));
      montarDados();
    } catch (err) { log('⚠ Não consegui ler “' + f.name + '”: ' + err.message + '. Use “cole a lista aqui”.'); }
  }
  ['ag', 'na'].forEach(k => {
    const S = SLOT[k];
    $(S.inp).addEventListener('change', e => { const f = e.target.files[0]; if (f) carregarArquivo(k, f); e.target.value = ''; });
    $(S.rm).addEventListener('click', () => { if (rodando) return; fontes[k] = null; seguirUm = ''; montarDados(); log('Planilha ' + S.nome + ' removida.'); });
    const box = $(S.el);
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) carregarArquivo(k, f); });
  });
  $('#bCola').addEventListener('click', () => {
    const t = $('#cola').value; if (!t.trim()) return;
    const fonte = prepararFonte(lerTexto(t)); fonte.nome = 'lista colada';
    fontes.lista = fonte; fontes.ag = fontes.na = null; seguirUm = '';
    log('Lista colada carregada (' + fonte.linhas.length + ' linhas).'); montarDados();
  });

  // balão de escolha dentro do painel
  function perguntar({ titulo, texto, botoes }) {
    if ($('.modal')) return;
    const ov = document.createElement('div'); ov.className = 'modal';
    const card = document.createElement('div'); card.className = 'balao';
    const t = document.createElement('div'); t.className = 'bt'; t.textContent = '🤖 ' + titulo;
    const x = document.createElement('div'); x.className = 'bx'; x.textContent = texto;
    const bb = document.createElement('div'); bb.className = 'bb';
    botoes.concat([{ rotulo: 'Cancelar', cancelar: true }]).forEach(b => {
      const el = document.createElement('button'); el.className = 'b' + (b.primario ? ' go' : '');
      el.textContent = b.rotulo; el.onclick = () => { ov.remove(); if (b.fn) b.fn(); };
      bb.appendChild(el);
    });
    card.append(t, x, bb); ov.appendChild(card); $('#p').appendChild(ov);
  }
  function iniciar() {
    const falta = fontes.lista ? '' : (fontes.ag && !fontes.na ? 'na' : (!fontes.ag && fontes.na ? 'ag' : ''));
    if (falta && seguirUm !== falta) {
      const tem = SLOT[falta === 'na' ? 'ag' : 'na'].nome, sem = SLOT[falta].nome;
      perguntar({
        titulo: 'Só uma planilha anexada',
        texto: 'Você anexou apenas a planilha “' + tem + '”. A planilha “' + sem + '” não foi anexada. Quer seguir só com a de ' + tem + '?',
        botoes: [
          { rotulo: 'Seguir só com ' + tem, primario: true, fn: () => { seguirUm = falta; executar(); } },
          { rotulo: 'Anexar a de ' + sem, fn: () => { const b = $(SLOT[falta].el); b.classList.add('pisca'); setTimeout(() => b.classList.remove('pisca'), 2200); $(SLOT[falta].inp).click(); } }
        ]
      });
      return;
    }
    executar();
  }
  ['#col', '#colTsk', '#colEv', '#colSt', '#colRg', '#colTp', '#colId'].forEach(q => $(q).addEventListener('change', reconstruir));
  function lerFiltros() {
    const l = id => $(id).value.split('\n').map(x => x.trim()).filter(Boolean);
    CFG.filtros = { ativo: $('#fAtivo').checked, status: l('#fStatus'), excluir: l('#fExcl'), tipo: l('#fTipo') }; salvarCfg();
    if (dados) reconstruir();
  }
  ['#fAtivo', '#fStatus', '#fExcl', '#fTipo'].forEach(q => $(q).addEventListener('change', lerFiltros));

  $('#bGo').addEventListener('click', () => { lerCfg(); iniciar(); });
  $('#bStop').addEventListener('click', () => { parar = true; store.set('rodando', false); log('Parando… (termina o item atual)'); });
  $('#bXls').addEventListener('click', baixarExcel);
  $('#bLimpa').addEventListener('click', () => { if (itens.length && !confirm('Apagar os resultados atuais e recomeçar?')) return; itens.forEach(i => Object.assign(i, { status: 'pendente', evento: '', alarmes: '', anexado: '', resposta: '', hora: '' })); store.del('sessao'); renderTabela(); renderResumo(); log('Resultados limpos.'); });
  $('#bCopia').addEventListener('click', () => copiar(prontos().map(i => modo === 'tsk' ? i.codigo : (i.tsk || i.codigo)).join('\n')));
  $('#bX').addEventListener('click', () => { $('#p').style.display = 'none'; $('#lanc').style.display = 'block'; });
  $('#lanc').addEventListener('click', () => { $('#p').style.display = ''; $('#lanc').style.display = 'none'; });
  $('#bTema').addEventListener('click', () => { CFG.tema = CFG.tema === 'light' ? 'dark' : 'light'; salvarCfg(); aplicarTema(); });
  $('#bMin').addEventListener('click', () => $('#p').classList.toggle('min'));
  $('#bLargo').addEventListener('click', () => $('#p').classList.toggle('largo'));

  $('#bFr').addEventListener('click', () => {
    const l = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    CFG.frases = { sim: l('#fSim'), nao: l('#fNao'), nv: l('#fNv'), indef: l('#fInd'), cadeia: l('#fCad'), pergunta: l('#fPer'), conf: l('#fConf'), erro: CFG.frases.erro }; salvarCfg(); log('Frases salvas.');
  });
  $('#bFrPad').addEventListener('click', () => { CFG.frases = JSON.parse(JSON.stringify(FRASES_PADRAO)); salvarCfg(); preencherCfg(); log('Frases restauradas.'); });
  $('#bConn').addEventListener('click', () => {
    const i = acharInput();
    log(i ? '✔ Campo de mensagem encontrado (' + i.tagName.toLowerCase() + (i.isContentEditable ? ', editável' : '') + ').' : '✖ Campo de mensagem NÃO encontrado. Abra o chat da Tais ou use 🎯 Marcar campo.');
    log('Área de mensagens: ' + (CFG.selMsgs ? 'marcada' : (docs().some(d => d.querySelector('.bubbles')) ? 'Telegram (automática)' : 'página inteira')) + '. Quadros (iframes) acessíveis: ' + (docs().length - 1));
    if (i) { const o = i.style.outline; i.style.outline = '3px solid #16a34a'; setTimeout(() => { i.style.outline = o; }, 2500); }
  });
  function marcar(chave, nome) {
    log('🎯 Clique em: ' + nome + ' (ESC cancela)');
    host.style.display = 'none'; let ant = null, antO = '';
    const ds = docs();
    const sobre = e => { if (ant) ant.style.outline = antO; ant = e.target; antO = ant.style.outline; ant.style.outline = '3px solid #f59e0b'; };
    const fim = () => { ds.forEach(d => { d.removeEventListener('mouseover', sobre, true); d.removeEventListener('click', clique, true); d.removeEventListener('keydown', tecla, true); }); if (ant) ant.style.outline = antO; host.style.display = ''; };
    const clique = e => { e.preventDefault(); e.stopPropagation(); const alvo = e.target; fim(); CFG[chave] = cssPath(alvo); salvarCfg(); preencherCfg(); log('✔ Marcado: ' + CFG[chave]); };
    const tecla = e => { if (e.key === 'Escape') { fim(); log('Cancelado.'); } };
    ds.forEach(d => { d.addEventListener('mouseover', sobre, true); d.addEventListener('click', clique, true); d.addEventListener('keydown', tecla, true); });
  }
  $('#pInp').addEventListener('click', () => marcar('selInput', 'o CAMPO onde se digita a mensagem'));
  $('#pMsg').addEventListener('click', () => marcar('selMsgs', 'a ÁREA onde aparecem as mensagens da conversa'));
  $('#pEnv').addEventListener('click', () => marcar('selEnviar', 'o BOTÃO de enviar'));
  $('#pZera').addEventListener('click', () => { CFG.selInput = CFG.selMsgs = CFG.selEnviar = ''; salvarCfg(); preencherCfg(); log('Calibração automática restaurada.'); });

  // arrastar o painel
  (() => {
    let dx = 0, dy = 0, arr = false;
    $('#h').addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') return; arr = true; const r = host.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (!arr) return; host.style.left = Math.max(0, e.clientX - dx) + 'px'; host.style.top = Math.max(0, e.clientY - dy) + 'px'; host.style.right = 'auto'; });
    window.addEventListener('mouseup', () => { arr = false; });
  })();

  /* ============ RETOMAR SESSÃO (página recarregada) ============ */
  function restaurar(auto) {
    const s = store.get('sessao', null);
    if (!s || !s.itens || !s.itens.length) return false;
    modo = s.modo; store.set('modo', modo); preencherCfg(); atualizarBotoes();
    itens = s.itens.map(i => Object.assign({}, i, { status: i.status === 'testando' ? 'pendente' : i.status }));
    $('#info').textContent = itens.length + ' itens restaurados da última sessão.';
    renderTabela(); renderResumo();
    log('↻ Sessão anterior restaurada (' + itens.filter(i => i.status !== 'pendente').length + ' testados, ' + itens.filter(i => i.status === 'pendente').length + ' pendentes).');
    return true;
  }
  const sessaoAnt = store.get('sessao', null);
  if (sessaoAnt && sessaoAnt.itens && sessaoAnt.itens.length) {
    const b = $('#bRec'); b.style.display = '';
    b.textContent = '↻ Recuperar último teste (' + sessaoAnt.itens.length + ' itens, ' + new Date(sessaoAnt.quando).toLocaleString('pt-BR') + ')';
    b.addEventListener('click', () => restaurar());
  }
  window.__roboTais = {
    mostrar() { host.style.display = ''; $('#p').style.display = ''; $('#lanc').style.display = 'none'; },
    _debug: { get itens() { return itens; }, CFG, classificar, extrair, gerarXlsx, lerXlsx }
  };
  preencherCfg(); atualizarBotoes(); renderResumo();
  log('Robô Tais v' + VERSAO + ' pronto. Páginas aceitas: Telegram Web e Portal TIM.');
  if (store.get('rodando', false) && CFG.retomar && restaurar(true)) {
    log('A página recarregou durante um teste. Retomando em 6 segundos… (clique em Parar para cancelar)');
    setTimeout(() => { if (!parar && store.get('rodando', false)) { executar(); } }, 6000);
  }
})();
