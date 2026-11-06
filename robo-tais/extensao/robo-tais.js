/* Robô Tais — roda DENTRO da aba da Tais (Telegram Web ou Portal TIM).
 * Nenhuma senha é lida. Tudo acontece no seu navegador, na sua sessão já logada.
 * Pode ser usado como extensão do Edge, favorito (bookmarklet) ou colado no console (F12). */
(() => {
  'use strict';
  if (window.__roboTais) { window.__roboTais.mostrar(); return; }

  const VERSAO = '1.1';
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
    nao: ['não atende', 'não normalizad', 'não está normalizad'],
    sim: ['atende aos critérios', 'está normalizad', 'sem alarme', 'nenhum alarme ativo'],
    pergunta: ['gostaria de inserir'],
    conf: ['inserid', 'anexad', 'sucesso', 'registrad', 'adicionad'],
    erro: ['não foi possível', 'erro', 'falha ao', 'não foi inserido']
  };
  const salvo = store.get('cfg', {});
  const CFG = Object.assign({
    tmpl: { tsk: '{codigo} validar', ne: '{codigo} testar', end: '{codigo} testar' },
    limite: 3, pausa: 2, espera: 90, estavel: 3, simulacao: false, retomar: true,
    selInput: '', selMsgs: '', selEnviar: ''
  }, salvo);
  CFG.tmpl = Object.assign({ tsk: '{codigo} validar', ne: '{codigo} testar', end: '{codigo} testar' }, salvo.tmpl || {});
  CFG.frases = Object.assign({}, FRASES_PADRAO, salvo.frases || {});
  const salvarCfg = () => store.set('cfg', CFG);

  /* ============ ESTADO ============ */
  let modo = store.get('modo', 'tsk');        // tsk | ne | end
  let dados = null;                            // {abas:[{nome,linhas}], aba, cab, linhas}
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
  // botões "Sim"/"Não" visíveis (folhas de texto), sempre em ordem do documento
  function botoes(rotulo) {
    const alvo = new Set(), lista = [];
    docs().forEach(d => d.querySelectorAll('button,[role=button],a,input[type=button],input[type=submit],span,div,p,li,label').forEach(el => {
      const t = el.tagName === 'INPUT' ? el.value : el.textContent;
      if (soLetras(t) !== rotulo) return;
      if (el.querySelectorAll('*').length > 3) return;
      if (!visivel(el)) return;
      const alt = el.closest('button,[role=button],a,input,.reply-markup-button') || el;
      if (!alvo.has(alt)) { alvo.add(alt); lista.push(alt); }
    }));
    return lista;
  }
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
      if (n.includes('criterio') || n.includes('gostaria')) return;
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
    const antesB = new Set(botoes('sim').concat(botoes('nao')));
    faseTxt = 'enviando “' + msg + '”…';
    await enviar(inp, msg);
    log('Enviado: ' + msg);
    faseTxt = 'aguardando resposta da Tais…';
    const t0 = Date.now();
    let ultimo = '', mudou = Date.now(), cls = null;
    while (Date.now() - t0 < CFG.espera * 1000) {
      await esperar(500);
      const nl = novasLinhas(antesL, linhasPagina());
      const txt = nl.join('\n');
      if (txt !== ultimo) { ultimo = txt; mudou = Date.now(); }
      cls = classificar(txt);
      if (cls && Date.now() - mudou >= CFG.estavel * 1000) break;
    }
    const nl = novasLinhas(antesL, linhasPagina());
    const resposta = nl.join('\n');
    if (!cls) return { status: 'indefinido', resposta: resposta || '(sem resposta no tempo limite)', evento: '', alarmes: '', anexado: '' };
    const ex = extrair(nl);
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
      atualizarLinha(it); salvarSessao(); renderResumo();
      if (!parar) { try { faseTxt = 'pausa…'; await esperar(CFG.pausa * 1000); } catch (e) { break; } }
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
  async function lerXlsx(buf) {
    const z = await lerZip(buf);
    const wb = parseXml(await z.ler('xl/workbook.xml'));
    const rels = parseXml(await z.ler('xl/_rels/workbook.xml.rels'));
    const alvo = {};
    [...rels.getElementsByTagName('Relationship')].forEach(r => { let t = r.getAttribute('Target'); t = t.startsWith('/') ? t.slice(1) : 'xl/' + t; alvo[r.getAttribute('Id')] = t; });
    let comp = [];
    const ss = await z.ler('xl/sharedStrings.xml');
    if (ss) comp = [...parseXml(ss).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].filter(t => !t.parentElement || t.parentElement.tagName !== 'rPh').map(t => t.textContent).join(''));
    const abas = [];
    for (const s of [...wb.getElementsByTagName('sheet')]) {
      const xml = await z.ler(alvo[s.getAttribute('r:id')]);
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
      abas.push({ nome: s.getAttribute('name'), linhas });
    }
    return abas;
  }
  function lerTexto(txt) {
    const ls = txt.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const sep = ['\t', ';', ','].find(s => ls.some(l => l.includes(s))) || '\t';
    return [{ nome: 'Lista', linhas: ls.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())) }];
  }
  function definirAba(i) {
    const a = dados.abas[i]; dados.aba = i;
    let h = 0;
    for (let k = 0; k < Math.min(10, a.linhas.length); k++) if (a.linhas[k].filter(c => String(c).trim()).length >= 2) { h = k; break; }
    const soUma = a.linhas.every(l => l.length <= 1);
    dados.cab = soUma ? ['Código'] : a.linhas[h].map((c, j) => String(c).trim() || ('Coluna ' + (j + 1)));
    dados.linhas = soUma ? a.linhas : a.linhas.slice(h + 1);
  }
  const ACHAR = {
    tsk: h => /^(numero|tsk|chamado|ticket|n)$/.test(norm(h)) || /^(numero|tsk)\b/.test(norm(h)),
    ne: h => /^ne ?-?_?id$/.test(norm(h)) || /^neid/.test(norm(h)),
    end: h => /^end ?-?_?id$/.test(norm(h)) || /^endid/.test(norm(h))
  };
  function colAuto(m) { const i = dados.cab.findIndex(ACHAR[m]); return i >= 0 ? i : 0; }

  const limpo = v => { v = String(v == null ? '' : v).trim(); return (!v || /^(-|n\/?a|nan|null|none|#n\/?a)$/i.test(v)) ? '' : v; };
  function construir() {
    itens = [];
    if (!dados) return;
    const cc = +$('#col').value;
    const ct = +$('#colTsk').value;
    const mapa = new Map();
    dados.linhas.forEach(l => {
      const c = limpo(l[cc]); if (!c) return;
      if (!mapa.has(c)) { mapa.set(c, { tsks: new Set() }); }
      if (modo !== 'tsk' && ct >= 0) { const t = limpo(l[ct]); if (t) mapa.get(c).tsks.add(t); }
    });
    let n = 0;
    mapa.forEach((v, c) => itens.push({ id: ++n, codigo: c, tsk: modo === 'tsk' ? c : [...v.tsks].join(', '), status: 'pendente', evento: '', alarmes: '', anexado: '', resposta: '', hora: '' }));
    $('#info').textContent = itens.length + ' ' + (modo === 'tsk' ? 'TSKs' : 'códigos únicos') + ' carregados.';
    renderTabela(); renderResumo();
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
    const larg = [10, 22, 22, 20, 18, 50, 16, 10, 80];
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    cab.forEach((_, i) => x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (larg[i] || 18) + '" customWidth="1"/>');
    x += '</cols><sheetData>';
    const cel = (r, c, v, s) => '<c r="' + letra(c) + r + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
    x += '<row r="1">' + cab.map((v, c) => cel(1, c, v, 1)).join('') + '</row>';
    linhas.forEach((l, i) => { x += '<row r="' + (i + 2) + '">' + l.map((v, c) => cel(i + 2, c, v, estilos && estilos[i] && c === 3 ? estilos[i] : 0)).join('') + '</row>'; });
    return x + '</sheetData></worksheet>';
  }
  function gerarXlsx() {
    const cab = ['Modo', 'Código', 'TSK', 'Status', 'Evento', 'Alarmes', 'Anexado no chamado', 'Hora', 'Resposta da Tais'];
    const lin = i => [NOMES_MODO[modo], i.codigo, i.tsk, STATUS_TXT[i.status].replace(/^\S+\s/, ''), i.evento, i.alarmes, i.anexado, i.hora, i.resposta];
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
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + fill('FFC6EFCE') + fill('FFFFC7CE') + fill('FFE7E6E6') + fill('FFFFEB9C') + '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>';
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
*{box-sizing:border-box;font-family:system-ui,Segoe UI,Arial,sans-serif}
.p{width:470px;max-height:92vh;display:flex;flex-direction:column;background:#fff;color:#1f2937;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);font-size:13px;overflow:hidden}
.p.largo{width:min(900px,96vw)}
.h{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#0f3d91;color:#fff;cursor:move;user-select:none}
.h b{flex:1;font-size:14px}.h button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:13px}
.c{padding:10px;overflow:auto;display:flex;flex-direction:column;gap:10px}
.min .c{display:none}
fieldset{border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin:0}legend{font-weight:600;padding:0 4px;color:#0f3d91}
.modos{display:flex;gap:6px}.modos button{flex:1;padding:8px 4px;border:2px solid #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;font-weight:600}
.modos button.on{border-color:#0f3d91;background:#dbeafe;color:#0f3d91}
label{display:flex;flex-direction:column;gap:2px;font-size:12px;color:#475569}
input[type=text],input[type=number],select,textarea{border:1px solid #cbd5e1;border-radius:6px;padding:5px;font-size:12px;width:100%;background:#fff;color:#111}
textarea{min-height:60px;font-family:ui-monospace,Consolas,monospace}
.l{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.l>*{flex:1;min-width:90px}
.b{padding:7px 10px;border:1px solid #94a3b8;background:#f1f5f9;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;color:#1f2937}
.b:disabled{opacity:.45;cursor:not-allowed}
.go{background:#16a34a;border-color:#15803d;color:#fff;font-size:14px;flex:2}.stop{background:#dc2626;border-color:#b91c1c;color:#fff}
.agora{border:2px dashed #94a3b8;border-radius:8px;padding:8px;background:#f8fafc;min-height:54px}
.agora.on{border-color:#2563eb;background:#eff6ff}.agora b{font-size:15px}
.cont{display:flex;gap:6px;flex-wrap:wrap}.cont div{flex:1;min-width:62px;text-align:center;border-radius:8px;padding:5px 2px;font-size:11px;font-weight:600}.cont strong{display:block;font-size:18px}
.k-n{background:#c6efce;color:#14532d}.k-r{background:#ffc7ce;color:#7f1d1d}.k-g{background:#e7e6e6;color:#374151}.k-y{background:#ffeb9c;color:#713f12}.k-p{background:#e0e7ff;color:#312e81}.k-a{background:#bbf7d0;color:#14532d}
.prontos{background:#ecfdf5;border:2px solid #16a34a;border-radius:8px;padding:8px}.prontos h4{margin:0 0 4px;color:#15803d}
.chips{display:flex;flex-wrap:wrap;gap:4px;max-height:90px;overflow:auto}.chips span{background:#fff;border:1px solid #16a34a;border-radius:99px;padding:1px 8px;font-size:11px;cursor:pointer}
.tab{max-height:300px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:12px}
th{position:sticky;top:0;background:#e2e8f0;text-align:left;padding:4px 6px}td{padding:3px 6px;border-top:1px solid #e2e8f0;vertical-align:top;word-break:break-word}td:nth-child(1),td:nth-child(2){white-space:nowrap}
tr.normalizado{background:#e6f7ea}tr.nao_normalizado{background:#fde8ea}tr.nao_validavel{background:#eeeeee}tr.indefinido{background:#fff6d1}tr.testando{background:#dbeafe;font-weight:600}
tr{cursor:pointer}.det{display:none;white-space:pre-wrap;font-size:11px;color:#334155;margin-top:3px;background:#fff;border:1px solid #e2e8f0;padding:4px;border-radius:4px}tr.open .det{display:block}
.alm{font-size:11px;color:#7f1d1d}
.log{height:110px;overflow:auto;background:#0b1220;color:#cbd5e1;font:11px ui-monospace,Consolas,monospace;padding:6px;border-radius:8px;white-space:pre-wrap}
.nota{font-size:11px;color:#64748b}details>summary{cursor:pointer;font-weight:600;color:#0f3d91}
</style>
<button id="lanc" style="display:none;font-size:22px;border:0;border-radius:50%;width:48px;height:48px;background:#0f3d91;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)" title="Abrir Robô Tais">🤖</button>
<div class="p" id="p">
 <div class="h" id="h"><b>🤖 Robô Tais <small style="font-weight:400">v${VERSAO}</small></b><button id="bLargo" title="Aumentar/diminuir">⇔</button><button id="bMin" title="Minimizar">–</button><button id="bX" title="Esconder (o robô continua)">×</button></div>
 <div class="c">
  <fieldset><legend>1. O que fazer</legend>
   <div class="modos"><button data-m="tsk">✅ Validar TSK</button><button data-m="ne">📡 Testar NE-ID</button><button data-m="end">🏢 Testar END-ID</button></div>
  </fieldset>
  <fieldset><legend>2. Planilha</legend>
   <label>Arquivo .xlsx / .csv<input type="file" id="arq" accept=".xlsx,.csv,.txt"></label>
   <details style="margin-top:4px"><summary>ou cole a lista aqui</summary><textarea id="cola" placeholder="Cole aqui (uma por linha) as TSKs / NE-IDs / END-IDs copiadas do Excel"></textarea><button class="b" id="bCola" style="margin-top:4px">Usar lista colada</button></details>
   <div class="l" style="margin-top:6px"><label>Aba<select id="aba"></select></label><label>Coluna dos códigos<select id="col"></select></label><label>Coluna da TSK (p/ NE/END)<select id="colTsk"></select></label></div>
   <div class="nota" id="info">Nenhuma planilha carregada.</div>
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
   <label>Pergunta “inserir resultado no chamado”<textarea id="fPer"></textarea></label>
   <label>Confirmação de que anexou<textarea id="fConf"></textarea></label>
   <button class="b" id="bFr" style="margin-top:4px">Salvar frases</button> <button class="b" id="bFrPad">Restaurar padrão</button>
  </details>
 </div>
</div>`;
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
    const caixas = [['k-p', itens.length, 'Total'], ['k-p', c('pendente') + c('testando'), 'Faltam'], ['k-n', c('normalizado'), '🟢 Normaliz.'], ['k-r', c('nao_normalizado'), '🔴 Não norm.'], ['k-g', c('nao_validavel'), '⚪ Não valid.'], ['k-y', c('indefinido'), '🟡 Indef.']];
    if (modo === 'tsk') caixas.push(['k-a', anex, '📎 Anexados']);
    $('#cont').innerHTML = caixas.map(x => '<div class="' + x[0] + '"><strong>' + x[1] + '</strong>' + x[2] + '</div>').join('');
    const pr = prontos();
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
    const a = $('#agora');
    if (rodando && itemAtual) { a.className = 'agora on'; a.innerHTML = ''; const b = document.createElement('b'); b.textContent = '🔄 Testando agora: ' + itemAtual.codigo; const d = document.createElement('div'); d.textContent = faseTxt + ' (' + Math.round((Date.now() - inicioItem) / 1000) + 's)  •  item ' + itemAtual.id + ' de ' + itens.length; a.append(b, d); }
    else if (!rodando) { a.className = 'agora'; a.textContent = 'Parado.'; }
  }, 500);

  function preencherCfg() {
    $('#tmpl').value = CFG.tmpl[modo]; $('#lim').value = CFG.limite; $('#pausa').value = CFG.pausa; $('#espera').value = CFG.espera;
    $('#sim').checked = CFG.simulacao; $('#ret').checked = CFG.retomar;
    $('#fSim').value = CFG.frases.sim.join('\n'); $('#fNao').value = CFG.frases.nao.join('\n'); $('#fNv').value = CFG.frases.nv.join('\n');
    $('#fPer').value = CFG.frases.pergunta.join('\n'); $('#fConf').value = CFG.frases.conf.join('\n');
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
    if (dados) { $('#col').value = colAuto(m); selecionarColTsk(); construir(); } else { renderTabela(); renderResumo(); }
  }
  $$('.modos button').forEach(b => b.addEventListener('click', () => trocarModo(b.dataset.m)));

  function preencherSelects() {
    $('#aba').innerHTML = dados.abas.map((a, i) => '<option value="' + i + '">' + xe(a.nome) + ' (' + a.linhas.length + ')</option>').join('');
    $('#aba').value = dados.aba;
    const ops = dados.cab.map((c, i) => '<option value="' + i + '">' + xe(c) + '</option>').join('');
    $('#col').innerHTML = ops; $('#colTsk').innerHTML = '<option value="-1">(nenhuma)</option>' + ops;
    $('#col').value = colAuto(modo); selecionarColTsk();
  }
  function selecionarColTsk() { $('#colTsk').value = modo === 'tsk' ? -1 : (dados.cab.findIndex(ACHAR.tsk) >= 0 ? dados.cab.findIndex(ACHAR.tsk) : -1); }
  function carregarDados(abas, nome) {
    dados = { abas }; definirAba(0); preencherSelects(); construir();
    log('Planilha carregada: ' + nome + ' — ' + itens.length + ' itens.');
  }
  $('#arq').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const abas = /\.xlsx$/i.test(f.name) ? await lerXlsx(await f.arrayBuffer()) : lerTexto(await f.text());
      if (!abas.length) throw new Error('planilha vazia');
      carregarDados(abas, f.name);
    } catch (err) { log('⚠ Não consegui ler o arquivo: ' + err.message + '. Use “cole a lista aqui”.'); }
  });
  $('#bCola').addEventListener('click', () => { const t = $('#cola').value; if (!t.trim()) return; carregarDados(lerTexto(t), 'lista colada'); });
  $('#aba').addEventListener('change', () => { definirAba(+$('#aba').value); preencherSelects(); construir(); });
  $('#col').addEventListener('change', construir); $('#colTsk').addEventListener('change', construir);

  $('#bGo').addEventListener('click', () => { lerCfg(); executar(); });
  $('#bStop').addEventListener('click', () => { parar = true; store.set('rodando', false); log('Parando… (termina o item atual)'); });
  $('#bXls').addEventListener('click', baixarExcel);
  $('#bLimpa').addEventListener('click', () => { if (itens.length && !confirm('Apagar os resultados atuais e recomeçar?')) return; itens.forEach(i => Object.assign(i, { status: 'pendente', evento: '', alarmes: '', anexado: '', resposta: '', hora: '' })); store.del('sessao'); renderTabela(); renderResumo(); log('Resultados limpos.'); });
  $('#bCopia').addEventListener('click', () => copiar(prontos().map(i => modo === 'tsk' ? i.codigo : (i.tsk || i.codigo)).join('\n')));
  $('#bX').addEventListener('click', () => { $('#p').style.display = 'none'; $('#lanc').style.display = 'block'; });
  $('#lanc').addEventListener('click', () => { $('#p').style.display = ''; $('#lanc').style.display = 'none'; });
  $('#bMin').addEventListener('click', () => $('#p').classList.toggle('min'));
  $('#bLargo').addEventListener('click', () => $('#p').classList.toggle('largo'));

  $('#bFr').addEventListener('click', () => {
    const l = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    CFG.frases = { sim: l('#fSim'), nao: l('#fNao'), nv: l('#fNv'), pergunta: l('#fPer'), conf: l('#fConf'), erro: CFG.frases.erro }; salvarCfg(); log('Frases salvas.');
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
