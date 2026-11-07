/* =====================================================================
 * causa-comum.js — PILOTO: pontos comuns de falha + associação de TSKs
 * ---------------------------------------------------------------------
 * 1) Topologia × sites fora: usa a árvore do diagrama (js/data/topologia-trj.js, gerada por
 *    diagrama-topologia/gerar_topologia_operador.js) para achar os nós (hubs / enlaces de subida) debaixo
 *    dos quais sites caíram juntos. Regra: concentrador FORA que derrubou 1 ou mais filhos diretos (o concentrador + pelo
 *    menos mais um); se um filho (também fora, em cadeia) explica o grupo, o ancestral é quem fica.
 * 2) Associação: sugere qual TSK fica como PRINCIPAL e quais devem ser associadas a ela (falha por evento,
 *    não por tarefa) — pelos filhos de um ponto comum, por duplicidade (mesmo END_ID + mesma nota de abertura,
 *    coluna CP). Gera a máscara do diário e a mensagem para a equipe.
 * 3) Diagrama: mostra a rota em comum e os ramos com falha de cada suspeito (SVG).
 *
 * API: TRJ.causaComum.disponivel() · gruposSites(data) · analisar(grupos) · duplicidades(tasks)
 *      render(box, res, ajudas) · renderAssociacoes(box, dup, ajudas, qual)
 * ajudas = { COR, copiar(txt,msg), autenticado: bool }
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var CC = TRJ.causaComum = {};
  var D = TRJ.domain;

  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  /* tira prefixos de tecnologia/rádio: "SR-PRTI12", "4G-VITR09", "18NLRJIG08" → "PRTI12", "VITR09", "RJIG08" */
  function strip(k) { return k.replace(/^(?:(?:SR|4G|5G|5D|3G|2G|NR|LTE)[-_ ]|\d{0,2}NL)/, ''); }
  function toDate(v) { if (!v) return null; var d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
  function fmtDt(d) { return d ? (D && D.formatarDataCompacta ? D.formatarDataCompacta(d) : d.toLocaleString('pt-BR')) : '—'; }
  function tsMs(t) { return t && t.venc ? t.venc.getTime() : -8.64e15; }

  /* ================= índice da topologia ================= */
  var IDX = null, IDX_DE = null;
  function indice() {
    var T = TRJ.topologia; if (!T) return null;
    if (IDX && IDX_DE === T) return IDX;
    var nodes = {}, kids = {}, byName = {}, byStrip = {}, mwEnd = {};
    function add(map, k, id) { if (!k) return; var a = map[k] || (map[k] = []); if (a.indexOf(id) < 0) a.push(id); }
    T.nodes.forEach(function (r) {
      var n = { id: r[0], nome: r[1], pid: r[2], rotulo: r[3] || '' };
      nodes[n.id] = n;
      if (n.pid) (kids[n.pid] = kids[n.pid] || []).push(n.id);
      String(n.nome).split('|').forEach(function (a) {
        a = up(a); if (!a) return; add(byName, a, n.id); add(byStrip, strip(a), n.id);
        // "SCAR02 (SE9054)", "RP00 (1)", "SQRM06(m)": o que vem entre parênteses no fim é anotação — o nome sem ela e o código (SE9054) também valem como apelido
        var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(a);
        if (m && m[1]) { add(byName, m[1], n.id); add(byStrip, strip(m[1]), n.id); if (/^[A-Z]{1,3}\d{3,5}$/.test(m[2].trim())) add(byName, m[2].trim(), n.id); }
      });
    });
    (T.mw || []).forEach(function (r) {
      [[r[0], r[1]], [r[2], r[3]]].forEach(function (p) {
        var e = up(p[0]); if (!e || e === 'DESCONHECIDO') return;
        var o = mwEnd[e] || (mwEnd[e] = { sites: [], enlaces: [] });
        if (p[1] && o.sites.indexOf(up(p[1])) < 0) o.sites.push(up(p[1]));
        o.enlaces.push(r);
      });
    });
    var desc = {};
    function calc(id, prof) { if (desc[id] != null) return desc[id]; if (prof > 60) return 0; var c = 0; (kids[id] || []).forEach(function (k) { c += 1 + calc(k, prof + 1); }); return (desc[id] = c); }
    Object.keys(nodes).forEach(function (id) { calc(id, 0); });
    IDX_DE = T;
    return (IDX = { nodes: nodes, kids: kids, byName: byName, byStrip: byStrip, mwEnd: mwEnd, desc: desc });
  }
  CC.disponivel = function () { return !!TRJ.topologia && !!indice(); };

  /* ================= grupos de sites fora (dashboard autenticado) ================= */
  function tskInfo(t) {
    return { os: t.osNumero || '', prio: up(t.prioridade) || '—', status: t.status || '', venc: toDate(t.vencimentoCalc),
      criacao: (D && D.parsePlatformDate ? D.parsePlatformDate(t.dataCriacaoAS) : null) || toDate(t.dataCriacao), siteId: t.siteId || '', end: t.enderecoId || '', regiao: t.regiao || 'OTHERS', falha: t.tipoFalha || '', evento: t.evento || '' };
  }
  /* evento (coluna GF) de cada TSK, para a máscara e a mensagem de associação: a TSK principal é citada pelo EVENTO */
  var EVENTOS = {};
  function indexaEventos(tasks) { (tasks || []).forEach(function (t) { if (t && t.evento && t.osNumero) EVENTOS[up(t.osNumero)] = String(t.evento).trim(); }); }
  CC.eventoDe = function (principal, tsks) {
    var p = up(principal); if (!p) return '';
    if (/^EVE\d+/.test(p)) return p;                                   // já digitaram o evento
    if (EVENTOS[p]) return EVENTOS[p];
    var ach = (tsks || []).filter(function (t) { return up(t.os) === p && t.evento; })[0];
    return ach ? ach.evento : '';
  };
  /* um grupo por END_ID: { end, nomes[], qtd, regiao, desde, tsk } — igual ao que o operador monta */
  CC.gruposSites = function (data) {
    var tasks = (data && data.tasksEnriched) || [], inc = (data && data.incidentsEnriched) || [];
    indexaEventos(tasks);
    var aberta = {};
    D.dedupPorTsk(tasks).forEach(function (t) {
      var st = D.normalize(t.status), eid = up(t.enderecoId); if (!eid) return;
      var back = st === 'NAO INICIADO' || st === 'INICIADO', pend = st === 'PENDENTE';
      if (!back && !pend) return;
      var corr = D.isTicketCorretiva(t.tipoAtividade), cur = aberta[eid];
      if (!cur || (corr && !cur.corr)) aberta[eid] = { t: t, corr: corr };
    });
    var grupos = {}, ordem = [];
    inc.forEach(function (i) {
      if (up(i.statusTrat || 'ATIVO') === 'RESOLVIDO') return;
      var k = up(i.enderecoId);
      if (!k) { ordem.push([i]); return; }
      if (!grupos[k]) { grupos[k] = []; ordem.push(grupos[k]); }
      grupos[k].push(i);
    });
    return ordem.map(function (g) {
      var a = g[0];
      g.forEach(function (x) { var da = toDate(a.horarioDt), db = toDate(x.horarioDt); if (db && (!da || db < da)) a = x; });
      var nomes = []; g.forEach(function (x) { if (x.site && nomes.indexOf(x.site) < 0) nomes.push(x.site); });
      var op = aberta[up(a.enderecoId)];
      var causas = []; g.forEach(function (x) { if (x.causa && causas.indexOf(x.causa) < 0) causas.push(x.causa); });
      return { end: a.enderecoId || '', nomes: nomes, qtd: g.length, regiao: a.regiao || 'OTHERS', desde: toDate(a.horarioDt), causas: causas, tsk: op ? tskInfo(op.t) : null };
    });
  };

  /* ================= casamento sites × topologia ================= */
  function casar(ix, g) {
    var achou = {}, via = {};
    function tenta(nome, origem) {
      var k = up(nome); if (!k) return;
      var ids = ix.byName[k] || ix.byName[strip(k)] || ix.byStrip[strip(k)] || [];
      ids.forEach(function (id) { achou[id] = 1; if (!via[id]) via[id] = origem; });
    }
    (g.nomes || []).forEach(function (n) { tenta(n, 'nome'); });
    var e = up(g.end), mw = e && ix.mwEnd[e];
    if (mw) mw.sites.forEach(function (n) { tenta(n, 'enlace MW'); });
    return { ids: Object.keys(achou), via: via };
  }
  function caminho(ix, id) {
    var p = [], n = ix.nodes[id], d = 0;
    while (n && n.pid && d++ < 40) { n = ix.nodes[n.pid]; if (n) p.unshift(n.nome.split('|')[0]); }
    return p;
  }
  function chaveG(g) { return up(g.end) || (g.nomes || []).join(','); }

  /* falhas que NÃO valem para ponto comum (são do próprio site, não de transporte): Sistema Irradiante e Predição de Indisponibilidade */
  var RE_IGNORA = /IRRADIANTE|PREDICAO INDISP/;
  function semAcento(x) { return up(x).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function falhaIgnorada(g) { return RE_IGNORA.test([g.tsk && g.tsk.falha].concat(g.causas || []).map(semAcento).join(' | ')); }

  CC.analisar = function (todos) {
    var ix = indice(); if (!ix) return null;
    var sites = [], ignorados = [];
    todos.forEach(function (g) { if (falhaIgnorada(g)) ignorados.push(g); else sites.push(g); });
    var falha = {};           // id do nó → [{ g, via }]
    var semMatch = [], totSites = 0, totMapeados = 0, gruposMapeados = 0, lugares = {};   // lugares: site → TODAS as posições (pais) dele na árvore
    sites.forEach(function (g) {
      var q = g.qtd || 1; totSites += q;
      var m = casar(ix, g);
      if (!m.ids.length) { semMatch.push(g); return; }
      gruposMapeados++; totMapeados += q; lugares[chaveG(g)] = m.ids;
      m.ids.forEach(function (id) { (falha[id] = falha[id] || []).push({ g: g, via: m.via[id] }); });
    });
    var failDesc = {}, direto = {}, dentro = {}, diretoG = {};
    Object.keys(falha).forEach(function (id) {       // cada posição do site na árvore conta: o site é procurado debaixo de TODOS os pais onde aparece
      var n = ix.nodes[id], d = 0;
      if (n && n.pid) {
        direto[n.pid] = (direto[n.pid] || 0) + 1;
        var og = diretoG[n.pid] || (diretoG[n.pid] = {}); falha[id].forEach(function (r) { og[chaveG(r.g)] = 1; });       // sites DIFERENTES ligados direto ao pai
      }
      while (n && n.pid && d++ < 40) {
        failDesc[n.pid] = (failDesc[n.pid] || 0) + 1;
        (dentro[n.pid] = dentro[n.pid] || []).push(id);
        n = ix.nodes[n.pid];
      }
    });
    function nDiretos(id) { return Object.keys(diretoG[id] || {}).length; }
    var cand = Object.keys(failDesc).map(function (id) {
      var total = ix.desc[id] || 1;
      return { id: id, falhos: failDesc[id], diretos: direto[id] || 0, filhos: (ix.kids[id] || []).length, total: total, pct: failDesc[id] / total };
    }).filter(function (c) { return c.diretos >= 1 && !!falha[c.id]; })      // concentrador = site que está FORA e derrubou 1 OU MAIS filhos DIRETAMENTE ligados a ele (uma central como o ARJO01, que nem está fora, não conta)
      .sort(function (a, b) { return b.falhos - a.falhos || b.pct - a.pct; });
    function ehAncestral(anc, desc) { var n = ix.nodes[desc], d = 0; while (n && n.pid && d++ < 40) { if (n.pid === anc) return true; n = ix.nodes[n.pid]; } return false; }
    // se a cadeia acima do candidato também está fora (cada nó até o ancestral candidato falhou), a falha vem de cima: fica o ancestral
    function cadeiaFora(anc, id) { var n = ix.nodes[id], d = 0; if (!falha[id]) return false; while (n && n.pid && d++ < 40) { if (n.pid === anc) return true; if (!falha[n.pid]) return false; n = ix.nodes[n.pid]; } return false; }
    var mantidos = cand.filter(function (c) { return !cand.some(function (o) { return o !== c && ehAncestral(o.id, c.id) && cadeiaFora(o.id, c.id); }); });
    var cobertos = {};
    function monta(c, marca) {
      var n = ix.nodes[c.id], vistos = {}, lista = [], ids = (dentro[c.id] || []).slice();
      if (falha[c.id]) ids.push(c.id);
      ids.forEach(function (fid) { if (marca) cobertos[fid] = 1; (falha[fid] || []).forEach(function (r) { var k = chaveG(r.g); if (!vistos[k]) { vistos[k] = 1; lista.push(r.g); } }); });
      var nSites = 0, comTsk = 0, semTsk = 0, tsks = [], vt = {}, tskNo = null;
      lista.forEach(function (g) {
        var q = g.qtd || 1; nSites += q; if (g.tsk) comTsk += q; else semTsk += q;
        if (g.tsk && !vt[g.tsk.os]) { vt[g.tsk.os] = 1; tsks.push(Object.assign({ site: g.nomes[0] || g.end, end: g.end }, g.tsk)); }
      });
      (falha[c.id] || []).forEach(function (r) { if (!tskNo && r.g.tsk) tskNo = r.g.tsk; });
      var fr = c.filhos ? c.diretos / c.filhos : 0;
      var conf = (c.diretos >= 3 && fr >= 0.5) ? 'alta' : (fr >= 0.5 || c.diretos >= 3 ? 'média' : 'baixa');
      return { id: c.id, nome: n.nome.split('|')[0], aliases: n.nome, rotulo: n.rotulo, caminho: caminho(ix, c.id), total: c.total, falhos: c.falhos, diretos: c.diretos, filhos: c.filhos, pct: c.pct,
        proprioFora: !!falha[c.id], grupos: lista, nSites: nSites, comTsk: comTsk, semTsk: semTsk, confianca: conf, tsks: tsks, tskNo: tskNo, idsFalha: ids, falhaPorNo: falha };
    }
    var suspeitos = mantidos.slice(0, 120).map(function (c) { return monta(c, true); });
    // PAIS EM COMUM: ponto que NÃO está fora, mas tem 2+ sites fora ligados direto a ele (pelo menos 20% dos filhos) e ainda não foi explicado por um concentrador fora
    var jaSusp = {}; suspeitos.forEach(function (x) { jaSusp[x.id] = 1; });
    var pais = Object.keys(diretoG).map(function (id) {
      var hits = nDiretos(id), filhos = (ix.kids[id] || []).length; return { id: id, hits: hits, filhos: filhos, ratio: filhos ? hits / filhos : 0 };
    }).filter(function (c) {
      if (falha[c.id] || jaSusp[c.id] || c.hits < 2 || c.ratio < 0.2) return false;
      return (dentro[c.id] || []).some(function (fid) { return !cobertos[fid]; });
    }).sort(function (a, b) { return b.hits - a.hits || b.ratio - a.ratio; }).slice(0, 60).map(function (c) {
      var total = ix.desc[c.id] || 1;
      return monta({ id: c.id, falhos: failDesc[c.id], diretos: c.hits, filhos: c.filhos, total: total, pct: failDesc[c.id] / total }, false);
    });
    // ACERTOS = sites fora ligados direto ao ponto (+1 se o próprio ponto está fora). O de mais acertos é a maior correlação e é grifado.
    var melhor = null;
    suspeitos.concat(pais).forEach(function (x) {
      x.nDiretos = nDiretos(x.id); x.acertos = x.nDiretos + (x.proprioFora ? 1 : 0);
      if (!melhor || x.acertos > melhor.acertos || (x.acertos === melhor.acertos && x.nDiretos / (x.filhos || 1) > melhor.nDiretos / (melhor.filhos || 1))) melhor = x;
    });
    if (melhor) melhor.melhor = true;
    var aneis = [];
    ((TRJ.topologia && TRJ.topologia.aneis) || []).forEach(function (r) {
      var gs = [], vistos = {};
      r.nos.forEach(function (nm) {
        (ix.byName[up(nm)] || []).forEach(function (id) { (falha[id] || []).forEach(function (x) { var k = chaveG(x.g); if (!vistos[k]) { vistos[k] = 1; gs.push(x.g); } }); });
      });
      if (gs.length >= 2) aneis.push({ nome: r.nome, total: r.nos.length, grupos: gs });
    });
    var isolados = Object.keys(falha).filter(function (id) { return !cobertos[id]; }).length;
    return { suspeitos: suspeitos, pais: pais, lugares: lugares, aneis: aneis, semMatch: semMatch, ignorados: ignorados, stats: { totSites: totSites, totMapeados: totMapeados, gruposTot: sites.length, gruposMapeados: gruposMapeados, isolados: isolados, totIgnorados: ignorados.reduce(function (a, g) { return a + (g.qtd || 1); }, 0) } };
  };

  /* ================= duplicidades / eventos múltiplos por nota de abertura (coluna CP) ================= */
  function normNota(s) { return up(s).replace(/\s+/g, ' ').slice(0, 300); }
  CC.duplicidades = function (tasks) {
    indexaEventos(tasks);
    var lista = D.dedupPorTsk(tasks || []).filter(function (t) {
      var st = D.normalize(t.status);
      return (st === 'NAO INICIADO' || st === 'INICIADO' || st === 'PENDENTE') && D.isTicketCorretiva(t.tipoAtividade);
    }).map(function (t) { return Object.assign(tskInfo(t), { site: t.siteId || '', nota: t.notaAbertura || '' }); });
    var temNota = lista.some(function (t) { return !!t.nota; });
    function ordena(a) { return a.slice().sort(function (x, y) { return tsMs(x) - tsMs(y); }); }
    function monta(extra, ts) {
      var o = ordena(ts), principal = o[o.length - 1];           // fim do SLA mais longo = principal (ganha tempo)
      return Object.assign(extra, { tsks: o, principal: principal });
    }
    // 1) mesmo END_ID + mesma nota de abertura
    var gi = {}, porEnd = {};
    lista.forEach(function (t) {
      if (!t.end) return;
      (porEnd[up(t.end)] = porEnd[up(t.end)] || []).push(t);
      if (!t.nota) return;
      var k = up(t.end) + '|' + normNota(t.nota); (gi[k] = gi[k] || []).push(t);
    });
    var iguais = [], emIguais = {};
    Object.keys(gi).forEach(function (k) { var ts = gi[k]; if (ts.length < 2) return; ts.forEach(function (t) { emIguais[t.os] = 1; }); iguais.push(monta({ tipo: 'igual', end: ts[0].end, site: ts[0].site, nota: ts[0].nota }, ts)); });
    // 2) mesmo END_ID, notas diferentes (avaliar)
    var mesmoEnd = [];
    Object.keys(porEnd).forEach(function (e) {
      var ts = porEnd[e]; if (ts.length < 2) return;
      if (ts.every(function (t) { return emIguais[t.os]; })) return;
      mesmoEnd.push(monta({ tipo: 'mesmoEnd', end: ts[0].end, site: ts[0].site, nota: '' }, ts));
    });
    iguais.sort(function (a, b) { return b.tsks.length - a.tsks.length; });
    mesmoEnd.sort(function (a, b) { return b.tsks.length - a.tsks.length; });
    return { iguais: iguais, mesmoEnd: mesmoEnd, temNota: temNota, totalTsks: lista.length };
  };

  /* ================= textos de associação ================= */
  /* máscara do diário: TICKET = a TSK que será associada · OBS cita o EVENTO principal (coluna GF), nunca a TSK principal */
  CC.mascara = function (neId, ticket, evento) {
    return ['ISOC MONITORACAO ACESSO (ASSOCIAÇÃO DE ATIVIDADES)', 'NE ID / ELEMENTO: ' + (neId || '—'), 'TICKET: ' + (ticket || '—'),
      'OBS: Prezados, favor atrelar ao evento principal ' + (evento || '[EVENTO NÃO ENCONTRADO]')].join('\n');
  };
  CC.msgAssociar = function (filho, evento) { return 'Associa o "' + filho + '" ao evento "' + (evento || '[EVENTO NÃO ENCONTRADO]') + '"'; };

  var ESCOLHA = {};     // chave do bloco → { p: TSK principal (null = padrão), x: { TSK: true } = TSKs que NÃO serão associadas }
  /* bloco de associação: TSKs, principal e "associar" editáveis por linha, máscara / mensagem */
  function blocoAssoc(h, A, chave, tsks, principalPadrao, rotuloVazio) {
    var cor = A.COR;
    var st = ESCOLHA[chave] || (ESCOLHA[chave] = { p: null, x: {} });
    var wrap = h('div', { class: 'cc-assoc' });
    var inp = h('input', { type: 'text', class: 'cc-inp', placeholder: rotuloVazio || 'TSK principal', value: st.p != null ? st.p : (principalPadrao || '') });
    inp.addEventListener('input', function () { st.p = inp.value; pinta(); });
    var tab = h('table', { class: 'cc-tab' });
    tab.appendChild(h('thead', null, [h('tr', null, ['Papel', 'TSK', 'Evento', 'Site', 'Falha', 'Prio', 'Criada', 'Fim do SLA'].map(function (t) { return h('th', { text: t }); }))]));
    var tb = h('tbody'); tab.appendChild(tb);
    var resumo = h('div', { class: 'cc-resumo' });
    var evTxt = h('span', { class: 'cc-evento' });
    function principal() { return (inp.value || '').trim(); }
    function eventoPrincipal() { return CC.eventoDe(principal(), tsks); }
    function filhos() { var p = up(principal()); return tsks.filter(function (t) { return up(t.os) !== p && !st.x[t.os]; }); }
    function pinta() {
      tb.innerHTML = ''; var p = up(principal());
      tsks.slice().sort(function (a, b) { return tsMs(a) - tsMs(b); }).forEach(function (t) {
        var eh = up(t.os) === p, excl = !eh && !!st.x[t.os], vt = vencTxt(t.venc);
        var papel = h('td', { class: 'cc-papel' });
        if (eh) papel.appendChild(h('span', { class: 'cc-pb prin', text: '★ PRINCIPAL' }));
        else {
          papel.appendChild(h('button', { type: 'button', class: 'cc-pb ' + (excl ? 'off' : 'on'), title: excl ? 'Marcar para associar' : 'Desmarcar (não associar esta TSK)', text: excl ? '☐ NÃO ASSOCIAR' : '☑ ASSOCIAR',
            onclick: function () { if (st.x[t.os]) delete st.x[t.os]; else st.x[t.os] = true; pinta(); } }));
          papel.appendChild(h('button', { type: 'button', class: 'cc-pb star', title: 'Tornar esta TSK a principal', text: '★',
            onclick: function () { inp.value = t.os; st.p = t.os; delete st.x[t.os]; pinta(); } }));
        }
        tb.appendChild(h('tr', { class: (eh ? 'prin' : '') + (excl ? ' excl' : ''), dataset: { osSel: t.os } }, [
          papel,
          h('td', null, [h('span', { class: 'op-tsk', dataset: { os: t.os }, text: t.os })]),
          h('td', { text: t.evento || '—' }),
          h('td', { text: t.site || '', title: 'END_ID ' + (t.end || '') }), h('td', { text: t.falha || '—' }),
          h('td', { text: t.prio || '' }), h('td', { text: t.criacao ? fmtDt(t.criacao) : '—' }),
          h('td', { class: 'cc-venc', style: { color: vt.cor }, title: fmtDt(t.venc), text: vt.txt })
        ]));
      });
      var ev = eventoPrincipal();
      evTxt.textContent = principal() ? (ev ? 'Evento principal: ' + ev : 'Evento principal não encontrado') : '';
      evTxt.style.color = ev ? '' : '#d68910';
      var n = filhos().length;
      resumo.textContent = n + ' TSK(s) a associar' + (principal() ? ' ao ' + principal() : '') + (tsks.length - n - (tsks.some(function (t) { return up(t.os) === p; }) ? 1 : 0) > 0 ? ' · ' + (tsks.length - n - (tsks.some(function (t) { return up(t.os) === p; }) ? 1 : 0)) + ' desmarcada(s)' : '');
    }
    pinta();
    var vazio = rotuloVazio || 'TSK PRINCIPAL';
    var acts = h('div', { class: 'cc-acts' }, [
      h('label', { class: 'cc-lbl' }, [h('span', { text: 'TSK principal:' }), inp]),
      evTxt,
      A.autenticado ? h('button', { class: 'op-btn', type: 'button', title: 'Uma linha por TSK a associar: Associa o "TSK" ao evento principal', text: '📋 Mensagem p/ equipe', onclick: function () {
        var f = filhos(); if (!f.length) { A.copiar('', 'Nada a associar'); return; }
        A.copiar(f.map(function (t) { return CC.msgAssociar(t.os, eventoPrincipal()); }).join('\n'), f.length + ' linha(s) copiada(s)');
      } }) : null,
      h('button', { class: 'op-btn', type: 'button', title: 'Máscara do diário de trabalho (ISOC) de cada TSK a associar', text: '📋 Máscaras de associação', onclick: function () {
        var f = filhos(); if (!f.length) { A.copiar('', 'Nada a associar'); return; }
        A.copiar(f.map(function (t) { return CC.mascara(t.siteId || t.site, t.os, eventoPrincipal()); }).join('\n\n'), f.length + ' máscara(s) copiada(s)');
      } }),
      resumo
    ]);
    wrap.appendChild(acts); wrap.appendChild(tab);
    return wrap;
  }

  /* vencimento simplificado: "VENCE EM 1h20min" / "VENCIDO A 10h10min" */
  function durTxt(min) {
    var a = Math.abs(Math.round(min)); if (a < 60) return a + 'min';
    var hh = Math.floor(a / 60), mm = a % 60; if (hh < 48) return hh + 'h' + ('0' + mm).slice(-2) + 'min';
    return Math.floor(hh / 24) + 'd' + (hh % 24) + 'h';
  }
  function vencTxt(venc) {
    if (!venc) return { txt: 'SEM PRAZO', cor: '#6b7280' };
    var min = Math.round((venc.getTime() - Date.now()) / 60000);
    return min < 0 ? { txt: 'VENCIDO A ' + durTxt(min), cor: '#c62839' } : { txt: 'VENCE EM ' + durTxt(min), cor: min <= 120 ? '#d68910' : '#168a47' };
  }
  function principalDe(tsks) { var m = null; tsks.forEach(function (t) { if (!m || tsMs(t) > tsMs(m)) m = t; }); return m; }

  /* ================= diagrama (SVG) ================= */
  CC.vendoDiagrama = false;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, txt) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (txt != null) e.textContent = txt; return e; }
  function cortaTxt(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  var PAN_OFF = null;   // remove os ouvintes de arrastar do diagrama anterior

  function desenharDiagrama(box, res, s, A, voltar) {
    var U = TRJ.ui, h = U.h, ix = indice();
    if (PAN_OFF) PAN_OFF();
    CC.vendoDiagrama = true;
    box.innerHTML = '';
    var falhaIds = {}; s.idsFalha.forEach(function (id) { falhaIds[id] = 1; });
    var memo = {};
    function temFalha(id) { if (memo[id] != null) return memo[id]; var r = !!falhaIds[id]; if (!r) (ix.kids[id] || []).forEach(function (k) { if (temFalha(k)) r = true; }); return (memo[id] = r); }
    var mostrarTodos = false, escala = 1, base = { w: 1, h: 1, susX: 0 }, svgEl = null;
    var area = h('div', { class: 'cc-dg-area' });
    function sair() { if (PAN_OFF) PAN_OFF(); CC.vendoDiagrama = false; voltar(); }
    function aplicaEscala(centro) {
      if (!svgEl) return;
      var antes = { sl: area.scrollLeft, st: area.scrollTop, cw: area.clientWidth, ch: area.clientHeight, e: svgEl.__e || 1 };
      svgEl.__e = escala; svgEl.setAttribute('width', Math.round(base.w * escala)); svgEl.setAttribute('height', Math.round(base.h * escala));
      if (centro) { var f = escala / antes.e; area.scrollLeft = (antes.sl + antes.cw / 2) * f - antes.cw / 2; area.scrollTop = (antes.st + antes.ch / 2) * f - antes.ch / 2; }
    }
    function zoom(f) { escala = Math.max(0.35, Math.min(2.2, escala * f)); aplicaEscala(true); }
    function ajustar() { escala = Math.max(0.35, Math.min(1.2, (area.clientWidth - 8) / base.w)); aplicaEscala(false); area.scrollLeft = 0; area.scrollTop = 0; }

    var barra = h('div', { class: 'cc-dg-bar' });
    barra.appendChild(h('button', { class: 'op-btn go', type: 'button', text: '← Voltar à Causa comum', onclick: sair }));
    barra.appendChild(h('b', { class: 'cc-nome', text: s.nome }));
    barra.appendChild(h('span', { class: 'cc-meta', text: s.falhos + ' de ' + s.total + ' pontos abaixo fora · ' + s.nSites + ' site(s) · ' + (s.proprioFora ? 'ele + ' : '') + s.nDiretos + ' fora ligado(s) direto' }));
    if (s.melhor) barra.appendChild(h('span', { class: 'op-tag cc-best-tag', text: 'MAIOR CORRELAÇÃO' }));
    var lbl = h('label', { class: 'op-chip op-tgl' }, [h('input', { type: 'checkbox' }), h('span', { text: 'Mostrar todos os pontos' })]);
    lbl.querySelector('input').addEventListener('change', function (e) { mostrarTodos = e.target.checked; desenha(); });
    barra.appendChild(lbl);
    barra.appendChild(h('span', { class: 'cc-zoom' }, [
      h('button', { class: 'op-btn', type: 'button', title: 'Reduzir', text: '−', onclick: function () { zoom(0.85); } }),
      h('button', { class: 'op-btn', type: 'button', title: 'Ajustar à tela', text: 'Ajustar', onclick: ajustar }),
      h('button', { class: 'op-btn', type: 'button', title: 'Ampliar', text: '+', onclick: function () { zoom(1.18); } })
    ]));
    box.appendChild(barra);
    box.appendChild(h('div', { class: 'cc-legend' }, [
      s.proprioFora ? h('span', { class: 'lg sus', text: 'Concentrador (cai e derruba os filhos)' }) : h('span', { class: 'lg pai', text: 'Pai em comum' }), h('span', { class: 'lg fora', text: 'Site fora SEM TSK' }), h('span', { class: 'lg tsk', text: 'Site fora COM TSK' }),
      h('span', { class: 'lg ok', text: 'Sem falha' }), h('span', { class: 'lg rota', text: 'Caminho até a raiz' }), s.melhor ? h('span', { class: 'lg melhor', text: 'Maior correlação (grifado)' }) : null,
      h('span', { class: 'cc-dica', text: 'Arraste para mover · Ctrl + roda do mouse (ou + / −) para zoom · passe o mouse ou clique numa TSK para ver os detalhes' })
    ]));
    box.appendChild(area);

    function desenha() {
      area.innerHTML = '';
      var anc = [], n = ix.nodes[s.id], d = 0;
      while (n && n.pid && d++ < 40) { n = ix.nodes[n.pid]; if (n) anc.unshift(n); }
      var acima = Math.max(0, anc.length - 4); anc = anc.slice(-4);
      var colW = 224, rowH = 46, nodeW = 200, nodeH = 36, pad = 16;
      var itens = [], arestas = [], folha = 0, maxCol = 0;
      anc.forEach(function (a, i) { itens.push({ id: a.id, col: i + (acima ? 1 : 0), y: 0, tipo: 'rota' }); });
      var b0 = anc.length + (acima ? 1 : 0);
      function visita(id, col) {
        var it = { id: id, col: col, tipo: id === s.id ? (s.proprioFora ? 'sus' : 'pai') : (falhaIds[id] ? 'falha' : 'ok'), ocultos: 0 };
        maxCol = Math.max(maxCol, col);
        var fs = (ix.kids[id] || []), vis = fs.filter(function (k) { return mostrarTodos || temFalha(k); });
        it.ocultos = fs.length - vis.length;
        if (!vis.length) it.y = folha++; else {
          var ys = vis.map(function (k) { var c = visita(k, col + 1); arestas.push([id, k]); return c.y; });
          it.y = (ys[0] + ys[ys.length - 1]) / 2;
        }
        itens.push(it); return it;
      }
      var raiz = visita(s.id, b0);
      var cadeia = itens.filter(function (x) { return x.tipo === 'rota'; });
      cadeia.forEach(function (x, i) { x.y = raiz.y; if (i > 0) arestas.push([cadeia[i - 1].id, x.id]); });
      if (cadeia.length) arestas.push([cadeia[cadeia.length - 1].id, s.id]);
      var W = (maxCol + 1) * colW + pad * 2, H = Math.max(1, folha) * rowH + pad * 2;
      var el = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'cc-svg' });
      var pos = {}; itens.forEach(function (x) { pos[x.id] = { x: pad + x.col * colW, y: pad + x.y * rowH }; });
      if (acima) {
        el.appendChild(svg('text', { x: pad, y: pad + raiz.y * rowH + 22, class: 'cc-acima' }, '… +' + acima + ' nível(is) acima'));
        arestas.push(['__acima__', cadeia.length ? cadeia[0].id : s.id]); pos.__acima__ = { x: pad - 6, y: pad + raiz.y * rowH };
      }
      arestas.forEach(function (a) {
        var p = pos[a[0]], q = pos[a[1]]; if (!p || !q) return;
        var x1 = p.x + (a[0] === '__acima__' ? 90 : nodeW), y1 = p.y + nodeH / 2, x2 = q.x, y2 = q.y + nodeH / 2, mx = (x1 + x2) / 2;
        var forte = a[0] === s.id || (falhaIds[a[0]] && falhaIds[a[1]]);
        var grife = s.melhor && (forte || a[0] === '__acima__' || cadeia.some(function (c2) { return c2.id === a[0]; }));       // rota de maior correlação: da raiz até os sites fora
        el.appendChild(svg('path', { d: 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2, class: 'cc-edge' + (forte ? ' f' : '') + (grife ? ' best' : '') }));
      });
      itens.forEach(function (x) {
        var n2 = ix.nodes[x.id], p = pos[x.id], regs = s.falhaPorNo[x.id], g = (falhaIds[x.id] && regs && regs[0] && regs[0].g) || null;
        var outros = g ? ((res.lugares && res.lugares[chaveG(g)]) || []).filter(function (id2) { return id2 !== x.id; }) : [];       // outras posições (outros pais) do mesmo site
        var cls = 'cc-nd ' + x.tipo + (g ? (g.tsk ? ' tsk' : ' sem') : '') + (s.melhor && x.tipo !== 'ok' ? ' best' : '');
        var gr = svg('g', { class: cls, transform: 'translate(' + p.x + ',' + p.y + ')' });
        if (g && g.tsk) { gr.setAttribute('data-os', g.tsk.os); gr.setAttribute('data-end', g.end || ''); }
        gr.appendChild(svg('title', {}, n2.nome + (n2.rotulo ? '\n' + n2.rotulo : '') + (g ? '\nEND_ID ' + g.end + ' · ' + (g.tsk ? g.tsk.os + ' (' + g.tsk.prio + ')' : 'SEM TSK') : '') + (outros.length ? '\nTambém aparece sob: ' + outros.map(function (id2) { var p2 = ix.nodes[ix.nodes[id2].pid]; return p2 ? p2.nome.split('|')[0] : '(raiz)'; }).join(' · ') : '')));
        gr.appendChild(svg('rect', { width: nodeW, height: nodeH, rx: 8 }));
        gr.appendChild(svg('text', { x: 10, y: 15, class: 'n1' }, cortaTxt(n2.nome.split('|')[0], 22)));
        var l2 = g ? (g.tsk ? g.tsk.os + ' · ' + g.tsk.prio : 'SEM TSK') : cortaTxt(n2.rotulo.replace(/^\(\d+\)\s*/, ''), 32);
        if (x.tipo === 'sus') l2 = 'CONCENTRADOR · ' + l2;
        if (x.tipo === 'pai') l2 = 'PAI EM COMUM · ' + l2;
        gr.appendChild(svg('text', { x: 10, y: 29, class: 'n2' }, l2));
        if (x.ocultos) gr.appendChild(svg('text', { x: nodeW - 8, y: 15, class: 'n3', 'text-anchor': 'end' }, '+' + x.ocultos));
        if (outros.length) gr.appendChild(svg('text', { x: nodeW - 8, y: 29, class: 'n3', 'text-anchor': 'end' }, '+' + outros.length + ' pai' + (outros.length > 1 ? 's' : '')));
        el.appendChild(gr);
      });
      area.appendChild(el); svgEl = el; base = { w: W, h: H, susX: pad + b0 * colW };
      aplicaEscala(false);
      area.scrollLeft = Math.max(0, base.susX * escala - 60); area.scrollTop = 0;
    }
    desenha();

    /* arrastar para mover (sem barra de rolagem) + roda do mouse; clique sem arrastar abre os detalhes da TSK */
    var pan = { on: false, x: 0, y: 0, sl: 0, st: 0, mov: false };
    function down(e) { if (e.button !== 0) return; pan.on = true; pan.mov = false; pan.x = e.clientX; pan.y = e.clientY; pan.sl = area.scrollLeft; pan.st = area.scrollTop; area.classList.add('arr'); e.preventDefault(); }
    function move(e) {
      if (!pan.on) return; var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) pan.mov = true;
      area.scrollLeft = pan.sl - dx; area.scrollTop = pan.st - dy;
    }
    function up2() { pan.on = false; area.classList.remove('arr'); }
    function roda(e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoom(e.deltaY < 0 ? 1.12 : 0.89);
      else { area.scrollTop += e.deltaY; area.scrollLeft += e.deltaX || (e.shiftKey ? e.deltaY : 0); }
    }
    function clique(e) {
      if (pan.mov) { pan.mov = false; e.stopPropagation(); return; }
      var g = e.target.closest ? e.target.closest('[data-os]') : null; if (!g) return;
      e.stopPropagation();       // não deixa o clique "fora" fechar o balão que vai ser fixado agora
      g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
    }
    area.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up2);
    area.addEventListener('wheel', roda, { passive: false }); area.addEventListener('click', clique);
    PAN_OFF = function () { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up2); PAN_OFF = null; };
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(box);
  }

  /* ================= diagrama: topologia completa (canvas) =================
   * Layout "icicle": cada nó ocupa uma altura proporcional à quantidade de pontos (folhas) abaixo dele, então o pai
   * fica como uma caixa alta que cobre o bloco dos filhos. Desenhado em <canvas> (só o que está na tela), por isso
   * o arrastar / zoom continuam leves mesmo com milhares de nós. */
  function desenharTopologiaCompleta(box, res, A, voltar) {
    var U = TRJ.ui, h = U.h, C = TRJ.constants, ix = indice();
    if (!ix) { voltar(); return; }
    if (PAN_OFF) PAN_OFF();
    CC.vendoDiagrama = true;
    box.innerHTML = '';

    var COL_W = 324, NODE_W = 184, PAD = 28, UNIT = 40, VAO = 4, ROOT_GAP = 40, MARK_R = 5, ZMIN = 0.04, ZMAX = 4;
    var ACENTOS = ['#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6', '#1abc9c', '#e84393', '#95a5a6'];

    var falhaIds = {};
    if (res) {
      (res.suspeitos || []).forEach(function (s) { (s.idsFalha || []).forEach(function (id) { falhaIds[id] = 1; }); });
      (res.pais || []).forEach(function (s) { (s.idsFalha || []).forEach(function (id) { falhaIds[id] = 1; }); });
    }

    /* ── layout (iterativo: sem recursão) ── */
    var allIds = Object.keys(ix.nodes), it = {}, ordem = [], visited = {}, raizes = [], maxCol = 0;
    function novoItem(id, pai, col) {
      var n = ix.nodes[id], nomes = String(n.nome).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var o = { id: id, n: n, pai: pai, col: col, kids: [], leaves: 1, maxCol: col, top: 0, x: PAD + col * COL_W, y: 0, h: 0, cy: 0,
        falha: !!falhaIds[id], nKids: (ix.kids[id] || []).length, desc: ix.desc[id] || 0, nome1: nomes[0] || id, alias: nomes.slice(1),
        rot: String(n.rotulo || '').replace(/^\(\d+\)\s*/, ''), fit: null, lab: null };
      it[id] = o; ordem.push(o); visited[id] = true; if (col > maxCol) maxCol = col; return o;
    }
    function montar(rootId) {
      var r = novoItem(rootId, null, 0), pilha = [r]; raizes.push(r);
      while (pilha.length) {
        var o = pilha.pop();
        (ix.kids[o.id] || []).forEach(function (k) {
          if (visited[k] || !ix.nodes[k]) return;
          var c = novoItem(k, o, o.col + 1); o.kids.push(c); pilha.push(c);
        });
      }
    }
    allIds.filter(function (id) { var n = ix.nodes[id]; return !n.pid || !ix.nodes[n.pid]; })
      .sort(function (a, b) { return (ix.desc[b] || 0) - (ix.desc[a] || 0); })
      .forEach(function (id) { if (!visited[id]) montar(id); });
    allIds.forEach(function (id) { if (!visited[id]) montar(id); });          // ciclos / sobras: viram raízes
    for (var i = ordem.length - 1; i >= 0; i--) {                              // folhas e coluna mais funda de cada subárvore
      var o = ordem[i];
      if (o.kids.length) { var s = 0, mc = o.col; o.kids.forEach(function (c) { s += c.leaves; if (c.maxCol > mc) mc = c.maxCol; }); o.leaves = s; o.maxCol = mc; }
    }
    var curY = PAD;
    raizes.forEach(function (r) { r.top = curY; curY += r.leaves * UNIT + ROOT_GAP; });
    var cols = [];
    ordem.forEach(function (o) {                                               // pai sempre antes dos filhos
      var run = o.top;
      o.kids.forEach(function (c) { c.top = run; run += c.leaves * UNIT; });
      o.y = o.top + VAO / 2; o.h = o.leaves * UNIT - VAO; o.cy = o.y + o.h / 2;
      (cols[o.col] = cols[o.col] || []).push(o);
    });
    cols.forEach(function (c) { c.sort(function (a, b) { return a.y - b.y; }); });
    var W = (maxCol + 1) * COL_W + PAD * 2, H = curY - ROOT_GAP + PAD;
    var falhaPorNo = {};                                                      // id do nó → [{ g: grupo de sites fora (END_ID, TSK, desde, causas…) }]
    if (res) (res.suspeitos || []).concat(res.pais || []).forEach(function (s) { if (s.falhaPorNo && !Object.keys(falhaPorNo).length) falhaPorNo = s.falhaPorNo; });

    /* ── estado de vista / foco / busca ── */
    var tx = 0, ty = 0, sc = 1, cw = 1, ch = 1, dpr = 1;
    var focoId = null, focoSub = null, buscaId = null, hoverId = null, temFalhaVisivel = false;
    var matchIds = [], matchTerm = '', matchIdx = -1;
    var cntBusca, inputBusca, area, cv, ctx, tip, rafId = null, pedido = false, timer = null, ro = null, offTema = null;
    var cores = null, fonte = 'system-ui, sans-serif';

    function lerCores() {
      var cs = getComputedStyle(area), v = function (k, d) { var x = cs.getPropertyValue(k).trim(); return x || d; };
      var bg = 'transparent', el = area;
      while (el && el.nodeType === 1) { var b = getComputedStyle(el).backgroundColor; if (b && b !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(b)) { bg = b; break; } el = el.parentElement; }
      if (bg === 'transparent') bg = v('--trj-bg', '#0a0a0f');
      cores = { bg: bg, card: v('--trj-card2', '#1a1a24'), borda: v('--trj-border2', 'rgba(255,140,0,.32)'), fg: v('--trj-fg', '#f0f0f0'),
        muted: v('--trj-muted', '#8a8a93'), red: v('--trj-red', '#e74c3c'), prim: v('--trj-primary', '#ff8c00'), clara: !!(TRJ.theme && TRJ.theme.isLight && TRJ.theme.isLight()) };
      fonte = cs.fontFamily || fonte;
    }

    /* ── ajuda de desenho ── */
    function rr(x, y, w, hh, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, hh, r);
      else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    }
    function ajusta(txt, maxW, ini) {            // corta o texto para caber (reticências no fim; ou no começo quando ini=true)
      if (ctx.measureText(txt).width <= maxW) return txt;
      var a = 0, b = txt.length;
      while (a < b) { var m = (a + b + 1) >> 1, t = ini ? '…' + txt.slice(txt.length - m) : txt.slice(0, m) + '…'; if (ctx.measureText(t).width <= maxW) a = m; else b = m - 1; }
      return a ? (ini ? '…' + txt.slice(txt.length - a) : txt.slice(0, a) + '…') : '…';
    }
    function linhasDe(o) {                        // texto de cada caixa (montado uma vez; depende só da largura fixa)
      if (o.fit) return o.fit;
      var L = [], mw = NODE_W - 22;
      ctx.font = 'bold 12px ' + fonte; L.push({ t: ajusta(o.nome1, mw), k: 'n' });
      ctx.font = '10px ' + fonte;
      if (o.falha) L.push({ t: 'FORA', k: 'f' });
      o.alias.slice(0, 3).forEach(function (a) { L.push({ t: ajusta(a, mw), k: 'a' }); });
      if (o.nKids) L.push({ t: o.nKids + (o.nKids === 1 ? ' filho' : ' filhos') + (o.desc > o.nKids ? ' · ' + o.desc + ' no total' : ''), k: 'c' });
      return (o.fit = L);
    }
    function rotuloDe(o) {                        // texto do enlace pai → filho, desenhado sobre a linha
      if (o.lab) return o.lab;
      ctx.font = '9px ' + fonte;
      return (o.lab = { t: ajusta(o.rot, COL_W - NODE_W - MARK_R - 22, true), ruim: !/ATIVO/i.test(o.rot) });
    }

    /* ── desenho principal (só o que aparece na tela) ── */
    function desenhar() {
      if (!area.isConnected) return;
      if (!cores) lerCores();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
      ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * tx, dpr * ty);
      var vx0 = -tx / sc - 12, vy0 = -ty / sc - 12, vx1 = vx0 + cw / sc + 24, vy1 = vy0 + ch / sc + 24;
      var comTexto = sc >= 0.32, comRot = sc >= 0.55, arred = sc >= 0.2, comMarca = sc >= 0.12;
      var fase = 0.5 + 0.5 * Math.sin(Date.now() / 1800 * Math.PI * 2);
      var visiveis = [], c, o, k, n;

      /* nós visíveis: busca binária por coluna (as caixas de uma coluna não se sobrepõem) */
      var c0 = Math.max(0, Math.floor((vx0 - PAD) / COL_W)), c1 = Math.min(cols.length - 1, Math.floor((vx1 - PAD) / COL_W));
      for (c = c0; c <= c1; c++) {
        var arr = cols[c]; if (!arr) continue;
        var lo = 0, hi = arr.length;
        while (lo < hi) { var m = (lo + hi) >> 1; if (arr[m].y + arr[m].h < vy0) lo = m + 1; else hi = m; }
        for (k = lo; k < arr.length && arr[k].y <= vy1; k++) visiveis.push(arr[k]);
      }
      /* arestas: uma lista por tipo (normal / fora / apagada pelo foco) → 3 traçados no total */
      var eN = new Path2D(), eF = new Path2D(), eD = new Path2D(), nEN = 0, nEF = 0, nED = 0, rotulos = [];
      /* toda aresta pai→filho cuja caixa do filho OU do pai aparece (inclui as que cruzam a tela de ponta a ponta) */
      var vistos = {}, lista = [];
      function pega(x) { if (x.pai && !vistos[x.id]) { vistos[x.id] = 1; lista.push(x); } }
      visiveis.forEach(function (x) { pega(x); x.kids.forEach(pega); });
      lista.forEach(function (x) {
        var p = x.pai, x1 = p.x + NODE_W + MARK_R, y1 = p.cy, x2 = x.x, y2 = x.cy;
        if (Math.max(y1, y2) < vy0 || Math.min(y1, y2) > vy1 || x2 < vx0 || x1 > vx1) return;
        var mx = (x1 + x2) / 2, alvo;
        if (focoSub && !(focoSub[x.id] && focoSub[p.id])) { alvo = eD; nED++; }
        else if (x.falha && p.falha) { alvo = eF; nEF++; } else { alvo = eN; nEN++; }
        alvo.moveTo(x1, y1); alvo.bezierCurveTo(mx, y1, mx, y2, x2, y2);
        if (comRot && x.rot && !(focoSub && !(focoSub[x.id] && focoSub[p.id]))) rotulos.push(x);
      });
      ctx.lineJoin = 'round';
      if (nED) { ctx.globalAlpha = 0.06; ctx.strokeStyle = cores.muted; ctx.lineWidth = 1.2; ctx.stroke(eD); ctx.globalAlpha = 1; }
      if (nEN) { ctx.globalAlpha = focoSub ? 0.95 : 0.55; ctx.strokeStyle = focoSub ? cores.fg : cores.muted; ctx.lineWidth = focoSub ? 1.6 : 1.3; ctx.stroke(eN); ctx.globalAlpha = 1; }
      if (nEF) { ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 2.4; ctx.stroke(eF); }

      /* rótulos dos enlaces (sobre a linha, perto do filho) */
      if (rotulos.length) {
        ctx.font = '9px ' + fonte; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = cores.bg;
        rotulos.forEach(function (x) {
          var L = rotuloDe(x), cx = x.x - (COL_W - NODE_W - MARK_R) * 0.5 + 4;
          ctx.strokeText(L.t, cx, x.cy); ctx.fillStyle = L.ruim ? '#e0a030' : cores.muted; ctx.fillText(L.t, cx, x.cy);
        });
      }

      /* caixas: as fora do foco primeiro (apagadas), depois as do foco */
      temFalhaVisivel = false;
      function caixa(x, apagada) {
        var fx = x.x, fy = x.y, fh = x.h, ac = ACENTOS[x.col % ACENTOS.length], sel = (x.id === buscaId), hov = (x.id === hoverId);
        if (apagada) ctx.globalAlpha = 0.12;
        if (arred) rr(fx, fy, NODE_W, fh, 7); else { ctx.beginPath(); ctx.rect(fx, fy, NODE_W, fh); }
        ctx.fillStyle = x.falha ? (cores.clara ? 'rgba(198,40,57,.16)' : 'rgba(231,76,60,.22)') : cores.card; ctx.fill();
        if (x.falha && !apagada) { temFalhaVisivel = true; ctx.strokeStyle = 'rgba(231,76,60,' + (0.6 + 0.4 * fase).toFixed(2) + ')'; ctx.lineWidth = 2.2 + fase * 1.6; }
        else { ctx.strokeStyle = x.falha ? cores.red : cores.borda; ctx.lineWidth = 1.3; }
        ctx.stroke();
        if (arred) { ctx.fillStyle = ac; ctx.fillRect(fx + 1, fy + 5, 3.5, Math.max(2, fh - 10)); }
        if (comMarca && x.nKids) {                                              // bolinha na borda direita: de onde saem os filhos
          ctx.beginPath(); ctx.arc(fx + NODE_W, x.cy, MARK_R, 0, 6.2832); ctx.fillStyle = cores.bg; ctx.fill();
          ctx.lineWidth = 1.8; ctx.strokeStyle = ac; ctx.stroke();
        }
        if (sel || hov) { rr(fx - 1.5, fy - 1.5, NODE_W + 3, fh + 3, 8); ctx.lineWidth = sel ? 3.2 : 2; ctx.strokeStyle = sel ? '#ffe066' : cores.prim; ctx.stroke(); }
        if (comTexto && !apagada) {
          var Ls = linhasDe(x), cabem = Math.max(1, Math.floor((fh - 8 - 13) / 12) + 1), q = Math.min(Ls.length, cabem);
          var bh = 13 + (q - 1) * 12, vt = Math.max(fy, vy0 + 12), vb = Math.min(fy + fh, vy1 - 12);     // texto acompanha a parte visível das caixas altas
          var topo = Math.max(fy + 4, Math.min((vt + vb) / 2 - bh / 2, fy + fh - 4 - bh));
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; var cx2 = fx + NODE_W / 2 + 2;
          for (var j = 0; j < q; j++) {
            var l = Ls[j], yy = j ? topo + 13 + (j - 1) * 12 + 6 : topo + 7;
            if (l.k === 'n') { ctx.font = 'bold 12px ' + fonte; ctx.fillStyle = cores.fg; }
            else if (l.k === 'f') { ctx.font = 'bold 10px ' + fonte; ctx.fillStyle = cores.red; }
            else { ctx.font = '10px ' + fonte; ctx.fillStyle = cores.muted; }
            ctx.fillText(l.t, cx2, yy);
          }
        }
        if (apagada) ctx.globalAlpha = 1;
      }
      if (focoSub) visiveis.forEach(function (x) { if (!focoSub[x.id]) caixa(x, true); });
      visiveis.forEach(function (x) { if (!focoSub || focoSub[x.id]) caixa(x, false); });
      if (area) area.setAttribute('data-vis', String(visiveis.length));
    }
    function pedir() { if (pedido) return; pedido = true; rafId = requestAnimationFrame(function () { pedido = false; rafId = null; desenhar(); }); }

    /* ── câmera ── */
    function clampSc(s) { return Math.max(ZMIN, Math.min(ZMAX, s)); }
    function zoomAt(ns, px, py) { ns = clampSc(ns); var r = ns / sc; tx = px - (px - tx) * r; ty = py - (py - ty) * r; sc = ns; pedir(); }
    function zoom(f) { zoomAt(sc * f, cw / 2, ch / 2); }
    function ajustar() { sc = clampSc(Math.min(1, (cw - 16) / W)); tx = 8; ty = 8; pedir(); }
    function enquadrar(o) {                       // enquadra a subárvore inteira do nó (a caixa dele já cobre todos os filhos na vertical)
      var rw = (o.maxCol - o.col + 1) * COL_W - (COL_W - NODE_W) + 40, rh = o.h + 40;
      sc = clampSc(Math.min(cw / rw, ch / rh, 1.2)); tx = cw / 2 - (o.x + rw / 2 - 20) * sc; ty = ch / 2 - (o.y + o.h / 2) * sc; pedir();
    }
    function centrar(o, minSc, maxSc) {
      sc = Math.min(maxSc || ZMAX, Math.max(minSc, sc));
      tx = cw / 2 - (o.x + NODE_W / 2) * sc; ty = ch / 2 - o.cy * sc; pedir();
    }

    /* ── foco (subárvore) / busca ── */
    function getSubtree(id) {
      var sub = {}, queue = [id];
      while (queue.length) { var nid = queue.pop(); if (sub[nid]) continue; sub[nid] = true; (ix.kids[nid] || []).forEach(function (k) { if (!sub[k]) queue.push(k); }); }
      return sub;
    }
    function aplicarFoco(id) { focoId = id; focoSub = getSubtree(id); pedir(); }
    function removerFoco() { focoId = null; focoSub = null; buscaId = null; pedir(); }
    function limparBusca() { if (inputBusca) inputBusca.value = ''; matchIds = []; matchTerm = ''; matchIdx = -1; if (cntBusca) cntBusca.textContent = ''; }
    function focarNo(id) { var o = it[id]; if (!o) return; buscaId = id; aplicarFoco(id); centrar(o, 0.9, 1.3); }
    function buscar(avancar) {
      var t = inputBusca.value.trim().toUpperCase();
      if (!t) { limparBusca(); removerFoco(); return; }
      if (t !== matchTerm) {
        matchTerm = t; matchIdx = -1; matchIds = [];
        ordem.forEach(function (o) { if (o.n.nome.toUpperCase().indexOf(t) >= 0 || o.id.toUpperCase().indexOf(t) >= 0 || (o.n.rotulo && o.n.rotulo.toUpperCase().indexOf(t) >= 0)) matchIds.push(o.id); });
      }
      if (!matchIds.length) { cntBusca.textContent = '0 resultados'; removerFoco(); return; }
      matchIdx = avancar ? (matchIdx + 1) % matchIds.length : 0;
      focarNo(matchIds[matchIdx]);
      cntBusca.textContent = (matchIdx + 1) + ' / ' + matchIds.length;
    }
    function sair() { if (PAN_OFF) PAN_OFF(); CC.vendoDiagrama = false; voltar(); }

    /* ── cabeçalho e controles ── */
    var styleEl = document.createElement('style');
    styleEl.textContent = '.cc-topo-area{cursor:grab;overflow:hidden;position:relative;user-select:none;height:calc(100vh - 270px);min-height:400px;}' +
      '.cc-topo-area.arr{cursor:grabbing;}.cc-topo-area.sobre{cursor:pointer;}.cc-topo-area canvas{display:block;position:absolute;top:0;left:0;width:100%;height:100%;}' +
      '.cc-topo-tip{position:absolute;z-index:5;pointer-events:none;max-width:380px;padding:7px 10px;border-radius:8px;font-size:11px;line-height:1.45;background:var(--trj-popover,#1a1a24);color:var(--trj-fg,#f0f0f0);border:1px solid var(--trj-border2,rgba(255,140,0,.32));box-shadow:0 6px 18px var(--trj-shadow,rgba(0,0,0,.5));display:none;}' +
      '.cc-topo-tip .t{font-size:13px;font-weight:800;margin-bottom:2px;}.cc-topo-tip .m{color:var(--trj-muted,#8a8a93);}.cc-topo-tip .r{color:var(--trj-red,#e74c3c);font-weight:800;margin-top:5px;border-top:1px solid var(--trj-border2,rgba(255,140,0,.32));padding-top:4px;}.cc-topo-tip .x{color:#d68910;font-weight:800;}';
    box.appendChild(styleEl);

    var hdr = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px 8px', borderBottom: '1px solid var(--op-divider,#2a2a38)', flexWrap: 'wrap' } });
    hdr.appendChild(h('button', { class: 'op-btn go', type: 'button', text: '← Causa Comum', onclick: sair }));
    hdr.appendChild(h('b', { style: { fontSize: '13px', letterSpacing: '.07em', flex: '1' }, text: 'TOPOLOGIA COMPLETA' }));
    var nFalha = Object.keys(falhaIds).length;
    if (nFalha) hdr.appendChild(h('span', { class: 'op-tag', style: { background: '#e74c3c', fontSize: '11px' }, text: nFalha + ' fora' }));
    box.appendChild(hdr);

    var ctls = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'var(--op-bg2,rgba(0,0,0,.18))', borderBottom: '1px solid var(--op-divider,#2a2a38)', flexWrap: 'wrap' } });
    inputBusca = h('input', { type: 'text', class: 'trj-input', placeholder: 'Buscar site…  (Enter = próximo)' });
    inputBusca.style.cssText = 'width:188px;height:28px;font-size:12px;padding:2px 10px;flex-shrink:0;';
    cntBusca = h('span', { style: { fontSize: '11px', color: 'var(--op-muted,#8a8a93)', minWidth: '66px' }, text: '' });
    inputBusca.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return; e.preventDefault();
      buscar(inputBusca.value.trim().toUpperCase() === matchTerm && matchIdx >= 0);
    });
    inputBusca.addEventListener('input', function () { if (!inputBusca.value.trim()) { limparBusca(); removerFoco(); } });
    ctls.appendChild(inputBusca); ctls.appendChild(cntBusca);
    /* ir direto para uma árvore (raiz) */
    var sel = h('select', { class: 'trj-input', title: 'Ir direto para uma árvore da topologia' });
    sel.style.cssText = 'height:28px;font-size:12px;padding:2px 8px;max-width:210px;';
    sel.appendChild(h('option', { value: '', text: 'Ir para a árvore…' }));
    raizes.filter(function (r) { return r.kids.length; }).forEach(function (r) { sel.appendChild(h('option', { value: r.id, text: r.nome1 + ' · ' + r.desc + ' abaixo' })); });
    sel.addEventListener('change', function () { var o = it[sel.value]; if (o) enquadrar(o); sel.value = ''; });
    ctls.appendChild(sel);
    ctls.appendChild(h('span', { style: { flex: '1' } }));
    ctls.appendChild(h('span', { style: { display: 'flex', gap: '4px', marginLeft: '6px' } }, [
      h('button', { class: 'op-btn', type: 'button', title: 'Reduzir', text: '−', onclick: function () { zoom(0.8); } }),
      h('button', { class: 'op-btn', type: 'button', title: 'Voltar ao início', text: 'Ajustar', onclick: ajustar }),
      h('button', { class: 'op-btn', type: 'button', title: 'Ampliar', text: '+', onclick: function () { zoom(1.25); } })
    ]));
    box.appendChild(ctls);
    box.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--op-muted,#8a8a93)', padding: '3px 14px 5px' }, text: 'Arraste para mover · roda do mouse = zoom · clique numa caixa = destacar o que está abaixo · duplo clique = enquadrar · clique no fundo = limpar' }));

    area = h('div', { class: 'cc-topo-area' });
    cv = document.createElement('canvas'); area.appendChild(cv);
    tip = h('div', { class: 'cc-topo-tip' }); area.appendChild(tip);
    box.appendChild(area);
    ctx = cv.getContext('2d');

    function medir() {
      cw = Math.max(200, area.clientWidth || 700); ch = Math.max(200, area.clientHeight || 500); dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); pedir();
    }
    lerCores(); medir();
    sc = clampSc(Math.min(0.6, cw / W * 0.9)); tx = 8; ty = 8; pedir();
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { if (area.isConnected) medir(); }); ro.observe(area); } else window.addEventListener('resize', medir);
    if (TRJ.theme && TRJ.theme.onChange) TRJ.theme.onChange(function () { if (!area.isConnected) return; setTimeout(function () { lerCores(); pedir(); }, 30); });
    timer = setInterval(function () {                                       // pulsar das caixas "fora": só redesenha se alguma está na tela e ninguém está arrastando
      if (!area.isConnected) { clearInterval(timer); return; }
      if (temFalhaVisivel && !pan.on && !document.hidden) pedir();
    }, 90);

    /* ── interação ── */
    var pan = { on: false, x: 0, y: 0, tx0: 0, ty0: 0, mov: false };
    function acharNo(clientX, clientY) {
      var r = area.getBoundingClientRect(), wx = (clientX - r.left - tx) / sc, wy = (clientY - r.top - ty) / sc;
      var c = Math.floor((wx - PAD) / COL_W); if (c < 0 || !cols[c]) return null;
      if (wx < PAD + c * COL_W || wx > PAD + c * COL_W + NODE_W) return null;
      var arr = cols[c], lo = 0, hi = arr.length - 1;
      while (lo <= hi) { var m = (lo + hi) >> 1, x = arr[m]; if (wy < x.y) hi = m - 1; else if (wy > x.y + x.h) lo = m + 1; else return x; }
      return null;
    }
    function caminhoDe(o) { var p = [], x = o.pai; while (x) { p.unshift(x.nome1); x = x.pai; } return p; }
    function mostrarTip(o, e) {
      var r = area.getBoundingClientRect(), rows = [];
      function lin(cls, txt) { if (txt) rows.push([cls, txt]); }
      lin('t', o.n.nome.split('|')[0]);
      if (o.alias.length) lin('m', 'Também: ' + o.alias.join(' · '));
      var cam = caminhoDe(o);
      lin('m', cam.length ? 'Caminho: ' + (cam.length > 4 ? '… › ' : '') + cam.slice(-4).join(' › ') : 'Origem da árvore');
      if (o.rot) lin('m', 'Enlace: ' + o.rot);
      lin('m', o.nKids ? o.nKids + ' filho(s) direto(s) · ' + o.desc + ' ponto(s) abaixo' : 'Sem filhos (ponto final)');
      if (o.falha) {
        lin('r', 'FORA');
        (falhaPorNo[o.id] || []).slice(0, 3).forEach(function (rf) {
          var g = rf.g || {}, t = g.tsk;
          lin('d', 'END_ID ' + (g.end || '—') + (g.regiao ? ' · ' + ((C && C.REGIAO_LABELS && C.REGIAO_LABELS[g.regiao]) || g.regiao) : '') + (g.qtd > 1 ? ' · ' + g.qtd + ' sites' : ''));
          if (g.desde) lin('d', 'Fora desde ' + fmtDt(g.desde));
          if (g.causas && g.causas.length) lin('d', 'Causa: ' + g.causas.join(' / '));
          if (t) { var vt = vencTxt(t.venc); lin('d', 'TSK ' + t.os + ' (' + t.prio + ')' + (t.status ? ' · ' + t.status : '') + ' · ' + vt.txt); if (t.falha) lin('d', 'Falha: ' + t.falha); }
          else lin('x', 'SEM TSK');
        });
      }
      tip.innerHTML = '';
      rows.forEach(function (rw) { var d = document.createElement('div'); d.className = rw[0]; d.textContent = rw[1]; tip.appendChild(d); });
      tip.style.display = 'block';
      var x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x + tip.offsetWidth > r.width - 6) x = e.clientX - r.left - tip.offsetWidth - 14;
      if (y + tip.offsetHeight > r.height - 6) y = e.clientY - r.top - tip.offsetHeight - 14;
      tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
    }
    var movePend = null, movePAg = false;
    function down(e) {
      if (e.button !== 0) return;
      pan.on = true; pan.mov = false; pan.x = e.clientX; pan.y = e.clientY; pan.tx0 = tx; pan.ty0 = ty;
      area.classList.add('arr'); tip.style.display = 'none'; e.preventDefault();
    }
    function move(e) {
      if (pan.on) {
        var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) pan.mov = true;
        tx = pan.tx0 + dx; ty = pan.ty0 + dy; pedir(); return;
      }
      if (e.target !== cv) return;
      movePend = e;                                                          // passar o mouse: no máx. 1 busca de caixa por quadro
      if (movePAg) return; movePAg = true;
      requestAnimationFrame(function () {
        movePAg = false; var ev = movePend; movePend = null; if (!ev || pan.on || !area.isConnected) return;
        var o = acharNo(ev.clientX, ev.clientY), id = o ? o.id : null;
        area.classList.toggle('sobre', !!o);
        if (id !== hoverId) { hoverId = id; pedir(); }
        if (o) mostrarTip(o, ev); else tip.style.display = 'none';
      });
    }
    function up2() { if (!pan.on) return; pan.on = false; area.classList.remove('arr'); }
    function roda(e) {
      e.preventDefault(); var r = area.getBoundingClientRect(), f = Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0016);
      zoomAt(sc * f, e.clientX - r.left, e.clientY - r.top);
    }
    function clique(e) {
      if (pan.mov) { pan.mov = false; return; }
      var o = acharNo(e.clientX, e.clientY);
      if (o) { buscaId = null; if (focoId === o.id) { limparBusca(); removerFoco(); } else { limparBusca(); aplicarFoco(o.id); } }
      else if (focoSub) { limparBusca(); removerFoco(); }
    }
    function duplo(e) { var o = acharNo(e.clientX, e.clientY); if (o) { aplicarFoco(o.id); enquadrar(o); } }
    area.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up2);
    area.addEventListener('mouseleave', function () { tip.style.display = 'none'; if (hoverId) { hoverId = null; pedir(); } });
    area.addEventListener('wheel', roda, { passive: false }); area.addEventListener('click', clique); area.addEventListener('dblclick', duplo);
    PAN_OFF = function () {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up2); window.removeEventListener('resize', medir);
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (timer) { clearInterval(timer); timer = null; }
      if (ro) { ro.disconnect(); ro = null; }
      PAN_OFF = null;
    };
    CC._topo = { it: it, ordem: ordem, cols: cols, W: W, H: H, estado: function () { return { tx: tx, ty: ty, sc: sc, cw: cw, ch: ch, focoId: focoId }; }, enquadrar: enquadrar, centrar: centrar, aplicarFoco: aplicarFoco };   // usado nos testes
  }

  /* ================= tela: pontos comuns (topologia) ================= */
  function textoCopia(s) {
    var l = ['*CAUSA COMUM PROVÁVEL: ' + s.nome + '*' + (s.rotulo ? ' (' + s.rotulo + ')' : ''), s.falhos + ' de ' + s.total + ' pontos abaixo estão fora (' + Math.round(s.pct * 100) + '%)'];
    if (s.caminho.length) l.push('Caminho: ' + s.caminho.join(' > ') + ' > ' + s.nome);
    s.grupos.forEach(function (g) { l.push('• ' + (g.nomes.join(', ') || '—') + ' / ' + (g.end || '—') + ' · ' + (g.tsk ? g.tsk.os + ' (' + (g.tsk.prio || '') + ')' : 'SEM TSK')); });
    return l.join('\n');
  }
  CC.render = function (box, res, A) {
    var U = TRJ.ui, h = U.h;
    function lista() { CC.vendoDiagrama = false; CC.render(box, res, A); }
    box.innerHTML = '';
    if (!res) { box.appendChild(h('div', { class: 'op-empty', text: 'Topologia não carregada.' })); return; }
    var st = res.stats, pctMap = st.totSites ? Math.round(st.totMapeados / st.totSites * 100) : 0;
    box.appendChild(h('div', { class: 'cc-intro' }, [
      h('span', { class: 'cc-cov', text: st.totMapeados + ' de ' + st.totSites + ' sites (' + pctMap + '%) têm correspondência no diagrama · ' + res.suspeitos.length + ' concentrador' + (res.suspeitos.length !== 1 ? 'es' : '') + ((res.pais || []).length ? ' · ' + res.pais.length + ' pai' + (res.pais.length !== 1 ? 's' : '') + ' com vários sites fora' : '') + (st.totIgnorados ? ' · ' + st.totIgnorados + ' site(s) desconsiderado(s) pelo tipo de falha' : '') }),
    ]));
    box.appendChild(h('div', { style: { textAlign: 'right', padding: '2px 2px 10px' } }, [
      h('button', { class: 'op-btn', type: 'button', style: { fontWeight: '600', letterSpacing: '.04em' }, text: 'TOPOLOGIA COMPLETA →', onclick: function () { desenharTopologiaCompleta(box, res, A, lista); } })
    ]));
    if (!res.suspeitos.length && !(res.pais || []).length) box.appendChild(h('div', { class: 'op-empty', text: 'Nenhum ponto comum encontrado com os filtros atuais. 👏' }));
    function cartao(s, i) {
      var cor = s.confianca === 'alta' ? A.COR.red : (s.confianca === 'média' ? A.COR.amber : A.COR.gray);
      var card = h('div', { class: 'cc-card' + (s.melhor ? ' melhor' : ''), style: { borderLeftColor: cor } });
      card.appendChild(h('div', { class: 'cc-top' }, [
        h('span', { class: 'cc-rank', text: '#' + (i + 1) }),
        h('b', { class: 'cc-nome', text: s.nome }),
        s.proprioFora ? h('span', { class: 'op-tag', style: { background: A.COR.red }, title: 'O próprio site está fora e derrubou os filhos ligados diretamente a ele', text: 'CONCENTRADOR FORA' })
          : h('span', { class: 'op-tag', style: { background: A.COR.blue }, title: 'O ponto não está fora, mas vários sites ligados direto a ele caíram juntos', text: 'PAI EM COMUM' }),
        s.melhor ? h('span', { class: 'op-tag', style: { background: '#d4a017', color: '#1c1204' }, title: 'Ponto com mais sites fora ligados direto a ele', text: 'MAIOR CORRELAÇÃO' }) : null,
        h('span', { class: 'op-tag', style: { background: cor }, title: 'Confiança da hipótese', text: 'confiança ' + s.confianca }),
        h('span', { class: 'cc-sp' }),
        h('button', { class: 'op-btn', type: 'button', title: 'Mostra a rota em comum e os ramos com falha', text: '🌳 Ver no diagrama', onclick: function () { desenharDiagrama(box, res, s, A, lista); } }),
        h('button', { class: 'op-copy mini', type: 'button', style: { order: 0, opacity: 1 }, text: '📋 Copiar', onclick: function () { A.copiar(textoCopia(s), 'Resumo copiado'); } })
      ]));
      if (s.rotulo) card.appendChild(h('div', { class: 'op-sub', text: s.rotulo }));
      if (s.caminho.length) card.appendChild(h('div', { class: 'cc-path', text: 'Caminho: ' + s.caminho.join(' › ') + ' › ' + s.nome }));
      card.appendChild(h('div', { class: 'cc-meta', html: '<b>' + s.falhos + '</b> de ' + s.total + ' pontos abaixo estão fora (' + Math.round(s.pct * 100) + '%) · <b>' + s.nDiretos + '</b> de ' + s.filhos + ' filho(s) direto(s) · <b>' + s.nSites + '</b> site(s) afetado(s): <span style="color:' + A.COR.green + '">' + s.comTsk + ' com TSK</span> · <span style="color:' + A.COR.red + '">' + s.semTsk + ' sem TSK</span>' }));
      var chips = h('div', { class: 'cc-sites' });
      s.grupos.forEach(function (g) {
        chips.appendChild(h('span', { class: 'cc-site' + (g.tsk ? '' : ' sem') }, [
          h('b', { text: (g.nomes[0] || g.end || '—') + (g.nomes.length > 1 ? ' +' + (g.nomes.length - 1) : '') }),
          g.tsk ? h('span', { class: 'op-tsk', dataset: { os: g.tsk.os }, text: g.tsk.os }) : h('span', { class: 'cc-sem', text: 'SEM TSK' })
        ]));
      });
      card.appendChild(chips);
      // associação ao evento principal
      if (s.tsks.length) {
        var padrao = s.tskNo ? s.tskNo.os : (s.tsks.length >= 2 ? principalDe(s.tsks).os : '');
        card.appendChild(h('div', { class: 'cc-assoc-t', html: '<b>Associação ao evento principal</b>' + (s.tskNo || s.tsks.length >= 2 ? '' : ' — informe a TSK principal.') }));
        card.appendChild(blocoAssoc(h, A, 'topo|' + s.id, s.tsks, padrao, 'TSK principal do ' + s.nome));
      }
      box.appendChild(card);
    }
    res.suspeitos.forEach(cartao);
    if ((res.pais || []).length) {
      box.appendChild(h('div', { class: 'op-ph', style: { color: A.COR.blue, marginTop: '14px' } }, [h('span', { text: 'Pais com vários sites fora · ' + res.pais.length })]));
      res.pais.forEach(cartao);
    }
    if (res.aneis.length) {
      box.appendChild(h('div', { class: 'op-ph', style: { color: A.COR.purple, marginTop: '14px' } }, [h('span', { text: 'Anéis lógicos com 2+ pontos fora · ' + res.aneis.length })]));
      res.aneis.forEach(function (a) {
        box.appendChild(h('div', { class: 'cc-card', style: { borderLeftColor: A.COR.purple } }, [
          h('div', { class: 'cc-top' }, [h('b', { class: 'cc-nome', text: a.nome }), h('span', { class: 'cc-meta', text: a.grupos.length + ' de ' + a.total + ' pontos do anel fora' })]),
          h('div', { class: 'cc-sites' }, a.grupos.map(function (g) { return h('span', { class: 'cc-site' }, [h('b', { text: g.nomes[0] || g.end })]); }))
        ]));
      });
    }
    if (res.semMatch.length) {
      box.appendChild(h('details', { class: 'cc-sem-match' }, [
        h('summary', { text: 'Sites sem correspondência no diagrama: ' + res.semMatch.reduce(function (a, g) { return a + (g.qtd || 1); }, 0) + ' site(s) em ' + res.semMatch.length + ' END_ID(s)' }),
        h('div', { class: 'cc-sites' }, res.semMatch.map(function (g) {
          return h('span', { class: 'cc-site sem', title: g.end }, [h('b', { text: (g.nomes[0] || '—') + (g.nomes.length > 1 ? ' +' + (g.nomes.length - 1) : '') }), h('span', { class: 'cc-sem', text: g.end || '' })]);
        }))
      ]));
    }
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(box);
  };

  /* ================= tela: associações por duplicidade ================= */
  CC.renderAssociacoes = function (box, dup, A, qual) {
    var U = TRJ.ui, h = U.h, cor = A.COR;
    box.innerHTML = '';
    if (!dup.temNota) {
      box.appendChild(h('div', { class: 'op-banner', text: 'ℹ A nota de abertura ainda não foi carregada. Reimporte os arquivos de atividades em “Importar dados”.' }));
    }
    var grupos = qual === 'mesmoEnd' ? dup.mesmoEnd : dup.iguais;
    var intro = qual === 'mesmoEnd' ? 'TSKs abertas no mesmo site com notas de abertura diferentes.' : 'TSKs abertas no mesmo site com a mesma nota de abertura.';
    box.appendChild(h('div', { class: 'cc-intro', text: intro }));
    if (!grupos.length) { box.appendChild(h('div', { class: 'op-empty', text: 'Nada neste radar com os filtros atuais. 👏' })); return; }
    grupos.forEach(function (g, i) {
      var titulo = g.end + (g.site ? ' · ' + g.site : '');
      var card = h('div', { class: 'cc-card', style: { borderLeftColor: g.tipo === 'igual' ? cor.red : cor.amber } });
      card.appendChild(h('div', { class: 'cc-top' }, [
        h('span', { class: 'cc-rank', text: '#' + (i + 1) }), h('b', { class: 'cc-nome', text: titulo }),
        h('span', { class: 'op-tag', style: { background: g.tipo === 'igual' ? cor.red : cor.amber }, text: g.tsks.length + ' TSKs' })
      ]));
      if (g.nota) card.appendChild(h('div', { class: 'cc-nota', title: g.nota, text: 'Nota de abertura: ' + String(g.nota).replace(/\s+/g, ' ').slice(0, 260) }));
      card.appendChild(blocoAssoc(h, A, g.tipo + '|' + g.end, g.tsks, g.principal ? g.principal.os : '', 'TSK principal'));
      box.appendChild(card);
    });
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(box);
  };
})(window.TRJ = window.TRJ || {});
