/* =====================================================================
 * causa-comum.js — PILOTO: pontos comuns de falha (topologia MW/FO × sites fora)
 * ---------------------------------------------------------------------
 * Usa a árvore do diagrama de topologia (js/data/topologia-trj.js, gerada por
 * diagrama-topologia/gerar_topologia_operador.js) para achar, entre os sites fora de agora, os nós
 * (hubs / enlaces de subida) debaixo dos quais vários sites caíram juntos.
 *
 * Regra (a mesma do "colar falhas" do diagrama): um nó vira suspeito quando 2+ filhos diretos estão fora,
 * ou quando metade ou mais dos pontos abaixo dele estão fora. Se um suspeito mais específico (filho)
 * explica quase todo o grupo, o ancestral mais alto é descartado.
 *
 * API:  TRJ.causaComum.disponivel()
 *       TRJ.causaComum.analisar(sites)  — sites = [{ end, nomes[], qtd, regiao, tsk, desde }]
 *       TRJ.causaComum.render(container, resultado, ajudas)
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var CC = TRJ.causaComum = {};

  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  /* tira prefixos de tecnologia/rádio: "SR-PRTI12", "4G-VITR09", "18NLRJIG08" → "PRTI12", "VITR09", "RJIG08" */
  function strip(k) { return k.replace(/^(?:(?:SR|4G|5G|5D|3G|2G|NR|LTE)[-_ ]|\d{0,2}NL)/, ''); }

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
      String(n.nome).split('|').forEach(function (a) { a = up(a); if (!a) return; add(byName, a, n.id); add(byStrip, strip(a), n.id); });
    });
    (T.mw || []).forEach(function (r) {
      [[r[0], r[1]], [r[2], r[3]]].forEach(function (p) {
        var e = up(p[0]); if (!e || e === 'DESCONHECIDO') return;
        var o = mwEnd[e] || (mwEnd[e] = { sites: [], enlaces: [] });
        if (p[1] && o.sites.indexOf(up(p[1])) < 0) o.sites.push(up(p[1]));
        o.enlaces.push(r);
      });
    });
    // quantidade de descendentes por nó
    var desc = {};
    function calc(id, prof) { if (desc[id] != null) return desc[id]; if (prof > 60) return 0; var c = 0; (kids[id] || []).forEach(function (k) { c += 1 + calc(k, prof + 1); }); return (desc[id] = c); }
    Object.keys(nodes).forEach(function (id) { calc(id, 0); });
    IDX_DE = T;
    return (IDX = { nodes: nodes, kids: kids, byName: byName, byStrip: byStrip, mwEnd: mwEnd, desc: desc });
  }
  CC.disponivel = function () { return !!TRJ.topologia && !!indice(); };

  /* nós do diagrama que correspondem a um grupo (END_ID) de sites fora */
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

  CC.analisar = function (sites) {
    var ix = indice(); if (!ix) return null;
    var falha = {};           // id do nó → [grupos]
    var semMatch = [], totSites = 0, totMapeados = 0, gruposMapeados = 0;
    sites.forEach(function (g) {
      var q = g.qtd || 1; totSites += q;
      var m = casar(ix, g);
      if (!m.ids.length) { semMatch.push(g); return; }
      gruposMapeados++; totMapeados += q;
      m.ids.forEach(function (id) { (falha[id] = falha[id] || []).push({ g: g, via: m.via[id] }); });
    });
    // contadores por ancestral
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
    }).filter(function (c) { return c.falhos >= 2 && (c.diretos >= 2 || c.pct >= 0.5); })
      .sort(function (a, b) { return b.falhos - a.falhos || b.pct - a.pct; });
    // descarta o ancestral quando um filho mais específico explica quase todo o grupo
    function ehAncestral(anc, desc) { var n = ix.nodes[desc], d = 0; while (n && n.pid && d++ < 40) { if (n.pid === anc) return true; n = ix.nodes[n.pid]; } return false; }
    var mantidos = [];
    cand.forEach(function (c) {
      var superado = cand.some(function (o) { return o !== c && ehAncestral(c.id, o.id) && o.falhos >= c.falhos - 1; });
      if (!superado) mantidos.push(c);
    });
    var cobertos = {};
    var suspeitos = mantidos.slice(0, 40).map(function (c) {
      var n = ix.nodes[c.id], grupos = {}, ids = dentro[c.id] || [];
      var lista = [];
      ids.forEach(function (fid) { cobertos[fid] = 1; (falha[fid] || []).forEach(function (r) { var k = up(r.g.end) || r.g.nomes.join(','); if (!grupos[k]) { grupos[k] = 1; lista.push(r.g); } }); });
      if (falha[c.id]) (falha[c.id]).forEach(function (r) { var k = up(r.g.end) || r.g.nomes.join(','); if (!grupos[k]) { grupos[k] = 1; lista.push(r.g); } });
      var nSites = 0, comTsk = 0, semTsk = 0;
      lista.forEach(function (g) { var q = g.qtd || 1; nSites += q; if (g.tsk) comTsk += q; else semTsk += q; });
      var fr = c.filhos ? c.diretos / c.filhos : 0;   // fração dos filhos diretos que caíram
      var conf = (c.diretos >= 3 && (fr >= 0.5 || falha[c.id])) || (c.falhos >= 3 && c.pct >= 0.5) ? 'alta' : ((c.diretos >= 2 || c.pct >= 0.5) ? 'média' : 'baixa');
      return { id: c.id, nome: n.nome.split('|')[0], aliases: n.nome, rotulo: n.rotulo, caminho: caminho(ix, c.id), total: c.total, falhos: c.falhos, diretos: c.diretos, filhos: c.filhos, pct: c.pct,
        proprioFora: !!falha[c.id], grupos: lista, nSites: nSites, comTsk: comTsk, semTsk: semTsk, confianca: conf };
    });
    // anéis lógicos do diagrama com 2+ pontos fora
    var aneis = [];
    ((TRJ.topologia && TRJ.topologia.aneis) || []).forEach(function (r) {
      var gs = [], vistos = {};
      r.nos.forEach(function (nm) {
        var ids = ix.byName[up(nm)] || [];
        ids.forEach(function (id) { (falha[id] || []).forEach(function (x) { var k = up(x.g.end) || x.g.nomes.join(','); if (!vistos[k]) { vistos[k] = 1; gs.push(x.g); } }); });
      });
      if (gs.length >= 2) aneis.push({ nome: r.nome, total: r.nos.length, grupos: gs });
    });
    var isolados = Object.keys(falha).filter(function (id) { return !cobertos[id]; }).length;
    return { suspeitos: suspeitos, aneis: aneis, semMatch: semMatch, stats: { totSites: totSites, totMapeados: totMapeados, gruposTot: sites.length, gruposMapeados: gruposMapeados, isolados: isolados } };
  };

  /* ---------- tela ---------- */
  function textoCopia(s) {
    var l = ['*CAUSA COMUM PROVÁVEL: ' + s.nome + '*' + (s.rotulo ? ' (' + s.rotulo + ')' : ''), s.falhos + ' de ' + s.total + ' pontos abaixo estão fora (' + Math.round(s.pct * 100) + '%)'];
    if (s.caminho.length) l.push('Caminho: ' + s.caminho.join(' > ') + ' > ' + s.nome);
    s.grupos.forEach(function (g) { l.push('• ' + (g.nomes.join(', ') || '—') + ' / ' + (g.end || '—') + ' · ' + (g.tsk ? g.tsk.os + ' (' + (g.tsk.prio || '') + ')' : 'SEM TSK')); });
    return l.join('\n');
  }
  CC.render = function (box, res, A) {
    var U = TRJ.ui, h = U.h, esc = U.esc;
    box.innerHTML = '';
    if (!res) { box.appendChild(h('div', { class: 'op-empty', text: 'Topologia não carregada.' })); return; }
    var st = res.stats, pctMap = st.totSites ? Math.round(st.totMapeados / st.totSites * 100) : 0;
    box.appendChild(h('div', { class: 'cc-intro' }, [
      h('b', { text: 'Pontos comuns de falha (piloto). ' }),
      h('span', { text: 'Cruza os sites fora de agora com a árvore do diagrama de topologia: se vários sites debaixo do mesmo hub/enlace caíram juntos, o suspeito é o hub ou o enlace de subida — comece por ele. ' }),
      h('span', { class: 'cc-cov', text: st.totMapeados + ' de ' + st.totSites + ' sites (' + pctMap + '%) têm correspondência no diagrama · ' + res.suspeitos.length + ' suspeito' + (res.suspeitos.length !== 1 ? 's' : '') })
    ]));
    if (!res.suspeitos.length) box.appendChild(h('div', { class: 'op-empty', text: 'Nenhum ponto comum de falha encontrado com os filtros atuais. 👏' }));
    res.suspeitos.forEach(function (s, i) {
      var cor = s.confianca === 'alta' ? A.COR.red : (s.confianca === 'média' ? A.COR.amber : A.COR.gray);
      var card = h('div', { class: 'cc-card', style: { borderLeftColor: cor } });
      card.appendChild(h('div', { class: 'cc-top' }, [
        h('span', { class: 'cc-rank', text: '#' + (i + 1) }),
        h('b', { class: 'cc-nome', text: s.nome }),
        s.proprioFora ? h('span', { class: 'op-tag', style: { background: A.COR.red }, text: 'ELE MESMO ESTÁ FORA' }) : null,
        h('span', { class: 'op-tag', style: { background: cor }, title: 'Confiança da hipótese', text: 'confiança ' + s.confianca }),
        h('span', { class: 'cc-sp' }),
        h('button', { class: 'op-copy mini', type: 'button', style: { order: 0, opacity: 1 }, text: '📋 Copiar', onclick: function () { A.copiar(textoCopia(s), 'Resumo copiado'); } })
      ]));
      if (s.rotulo) card.appendChild(h('div', { class: 'op-sub', text: s.rotulo }));
      if (s.caminho.length) card.appendChild(h('div', { class: 'cc-path', text: 'Caminho: ' + s.caminho.join(' › ') + ' › ' + s.nome }));
      card.appendChild(h('div', { class: 'cc-bar', title: s.falhos + ' de ' + s.total }, [h('i', { style: { width: Math.max(3, Math.round(s.pct * 100)) + '%', background: cor } })]));
      card.appendChild(h('div', { class: 'cc-meta', html: '<b>' + s.falhos + '</b> de ' + s.total + ' pontos abaixo estão fora (' + Math.round(s.pct * 100) + '%) · <b>' + s.diretos + '</b> de ' + s.filhos + ' filho(s) direto(s) · <b>' + s.nSites + '</b> site(s) afetado(s): <span style="color:' + A.COR.green + '">' + s.comTsk + ' com TSK</span> · <span style="color:' + A.COR.red + '">' + s.semTsk + ' sem TSK</span>' }));
      var chips = h('div', { class: 'cc-sites' });
      s.grupos.forEach(function (g) {
        chips.appendChild(h('span', { class: 'cc-site' + (g.tsk ? '' : ' sem') }, [
          h('b', { text: (g.nomes[0] || g.end || '—') + (g.nomes.length > 1 ? ' +' + (g.nomes.length - 1) : '') }),
          g.tsk ? h('span', { class: 'op-tsk', dataset: { os: g.tsk.os }, text: g.tsk.os }) : h('span', { class: 'cc-sem', text: 'SEM TSK' })
        ]));
      });
      card.appendChild(chips);
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
      var det = h('details', { class: 'cc-sem-match' }, [
        h('summary', { text: 'Sem correspondência no diagrama: ' + res.semMatch.reduce(function (a, g) { return a + (g.qtd || 1); }, 0) + ' site(s) em ' + res.semMatch.length + ' END_ID(s) — não entram na análise (podem ser pontas de rádio fora da árvore MW/FO, ou falta cadastrar no diagrama)' }),
        h('div', { class: 'cc-sites' }, res.semMatch.map(function (g) {
          return h('span', { class: 'cc-site sem', title: g.end }, [h('b', { text: (g.nomes[0] || '—') + (g.nomes.length > 1 ? ' +' + (g.nomes.length - 1) : '') }), h('span', { class: 'cc-sem', text: g.end || '' })]);
        }))
      ]);
      box.appendChild(det);
    }
  };
})(window.TRJ = window.TRJ || {});
