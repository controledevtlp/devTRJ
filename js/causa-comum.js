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
    var semMatch = [], totSites = 0, totMapeados = 0, gruposMapeados = 0;
    sites.forEach(function (g) {
      var q = g.qtd || 1; totSites += q;
      var m = casar(ix, g);
      if (!m.ids.length) { semMatch.push(g); return; }
      gruposMapeados++; totMapeados += q;
      m.ids.forEach(function (id) { (falha[id] = falha[id] || []).push({ g: g, via: m.via[id] }); });
    });
    var failDesc = {}, direto = {}, dentro = {};
    Object.keys(falha).forEach(function (id) {
      var n = ix.nodes[id], d = 0;
      if (n && n.pid) direto[n.pid] = (direto[n.pid] || 0) + 1;
      while (n && n.pid && d++ < 40) {
        failDesc[n.pid] = (failDesc[n.pid] || 0) + 1;
        (dentro[n.pid] = dentro[n.pid] || []).push(id);
        n = ix.nodes[n.pid];
      }
    });
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
    var suspeitos = mantidos.slice(0, 120).map(function (c) {
      var n = ix.nodes[c.id], vistos = {}, lista = [], ids = (dentro[c.id] || []).slice();
      if (falha[c.id]) ids.push(c.id);
      ids.forEach(function (fid) { cobertos[fid] = 1; (falha[fid] || []).forEach(function (r) { var k = chaveG(r.g); if (!vistos[k]) { vistos[k] = 1; lista.push(r.g); } }); });
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
    });
    var aneis = [];
    ((TRJ.topologia && TRJ.topologia.aneis) || []).forEach(function (r) {
      var gs = [], vistos = {};
      r.nos.forEach(function (nm) {
        (ix.byName[up(nm)] || []).forEach(function (id) { (falha[id] || []).forEach(function (x) { var k = chaveG(x.g); if (!vistos[k]) { vistos[k] = 1; gs.push(x.g); } }); });
      });
      if (gs.length >= 2) aneis.push({ nome: r.nome, total: r.nos.length, grupos: gs });
    });
    var isolados = Object.keys(falha).filter(function (id) { return !cobertos[id]; }).length;
    return { suspeitos: suspeitos, aneis: aneis, semMatch: semMatch, ignorados: ignorados, stats: { totSites: totSites, totMapeados: totMapeados, gruposTot: sites.length, gruposMapeados: gruposMapeados, isolados: isolados, totIgnorados: ignorados.reduce(function (a, g) { return a + (g.qtd || 1); }, 0) } };
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
    barra.appendChild(h('span', { class: 'cc-meta', text: s.falhos + ' de ' + s.total + ' pontos abaixo fora · ' + s.nSites + ' site(s)' }));
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
      h('span', { class: 'lg sus', text: 'Concentrador (cai e derruba os filhos)' }), h('span', { class: 'lg fora', text: 'Site fora SEM TSK' }), h('span', { class: 'lg tsk', text: 'Site fora COM TSK' }),
      h('span', { class: 'lg ok', text: 'Sem falha' }), h('span', { class: 'lg rota', text: 'Caminho até a raiz' }),
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
        var it = { id: id, col: col, tipo: id === s.id ? 'sus' : (falhaIds[id] ? 'falha' : 'ok'), ocultos: 0 };
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
        el.appendChild(svg('path', { d: 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2, class: 'cc-edge' + (forte ? ' f' : '') }));
      });
      itens.forEach(function (x) {
        var n2 = ix.nodes[x.id], p = pos[x.id], regs = s.falhaPorNo[x.id], g = (falhaIds[x.id] && regs && regs[0] && regs[0].g) || null;
        var cls = 'cc-nd ' + x.tipo + (g ? (g.tsk ? ' tsk' : ' sem') : '');
        var gr = svg('g', { class: cls, transform: 'translate(' + p.x + ',' + p.y + ')' });
        if (g && g.tsk) { gr.setAttribute('data-os', g.tsk.os); gr.setAttribute('data-end', g.end || ''); }
        gr.appendChild(svg('title', {}, n2.nome + (n2.rotulo ? '\n' + n2.rotulo : '') + (g ? '\nEND_ID ' + g.end + ' · ' + (g.tsk ? g.tsk.os + ' (' + g.tsk.prio + ')' : 'SEM TSK') : '')));
        gr.appendChild(svg('rect', { width: nodeW, height: nodeH, rx: 8 }));
        gr.appendChild(svg('text', { x: 10, y: 15, class: 'n1' }, cortaTxt(n2.nome.split('|')[0], 22)));
        var l2 = g ? (g.tsk ? g.tsk.os + ' · ' + g.tsk.prio : 'SEM TSK') : cortaTxt(n2.rotulo.replace(/^\(\d+\)\s*/, ''), 32);
        if (x.tipo === 'sus') l2 = 'CONCENTRADOR · ' + l2;
        gr.appendChild(svg('text', { x: 10, y: 29, class: 'n2' }, l2));
        if (x.ocultos) gr.appendChild(svg('text', { x: nodeW - 8, y: 15, class: 'n3', 'text-anchor': 'end' }, '+' + x.ocultos));
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
      h('span', { class: 'cc-cov', text: st.totMapeados + ' de ' + st.totSites + ' sites (' + pctMap + '%) têm correspondência no diagrama · ' + res.suspeitos.length + ' concentrador' + (res.suspeitos.length !== 1 ? 'es' : '') + (st.totIgnorados ? ' · ' + st.totIgnorados + ' site(s) desconsiderado(s) pelo tipo de falha' : '') })
    ]));
    if (!res.suspeitos.length) box.appendChild(h('div', { class: 'op-empty', text: 'Nenhum concentrador fora encontrado com os filtros atuais. 👏' }));
    res.suspeitos.forEach(function (s, i) {
      var cor = s.confianca === 'alta' ? A.COR.red : (s.confianca === 'média' ? A.COR.amber : A.COR.gray);
      var card = h('div', { class: 'cc-card', style: { borderLeftColor: cor } });
      card.appendChild(h('div', { class: 'cc-top' }, [
        h('span', { class: 'cc-rank', text: '#' + (i + 1) }),
        h('b', { class: 'cc-nome', text: s.nome }),
        h('span', { class: 'op-tag', style: { background: A.COR.red }, title: 'O próprio site está fora e derrubou os filhos ligados diretamente a ele', text: 'CONCENTRADOR FORA' }),
        h('span', { class: 'op-tag', style: { background: cor }, title: 'Confiança da hipótese', text: 'confiança ' + s.confianca }),
        h('span', { class: 'cc-sp' }),
        h('button', { class: 'op-btn', type: 'button', title: 'Mostra a rota em comum e os ramos com falha', text: '🌳 Ver no diagrama', onclick: function () { desenharDiagrama(box, res, s, A, lista); } }),
        h('button', { class: 'op-copy mini', type: 'button', style: { order: 0, opacity: 1 }, text: '📋 Copiar', onclick: function () { A.copiar(textoCopia(s), 'Resumo copiado'); } })
      ]));
      if (s.rotulo) card.appendChild(h('div', { class: 'op-sub', text: s.rotulo }));
      if (s.caminho.length) card.appendChild(h('div', { class: 'cc-path', text: 'Caminho: ' + s.caminho.join(' › ') + ' › ' + s.nome }));
      card.appendChild(h('div', { class: 'cc-meta', html: '<b>' + s.falhos + '</b> de ' + s.total + ' pontos abaixo estão fora (' + Math.round(s.pct * 100) + '%) · <b>' + s.diretos + '</b> de ' + s.filhos + ' filho(s) direto(s) · <b>' + s.nSites + '</b> site(s) afetado(s): <span style="color:' + A.COR.green + '">' + s.comTsk + ' com TSK</span> · <span style="color:' + A.COR.red + '">' + s.semTsk + ' sem TSK</span>' }));
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
    });
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
