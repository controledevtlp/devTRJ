/* Página: Causa comum & Associações (dashboard autenticado — visão do gestor)
 * Pontos comuns de falha pela topologia + radar de TSKs que podem ser associadas (duplicidades / controlador). */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, CC = TRJ.causaComum;
  var COR = { red: '#c62839', amber: '#d68910', green: '#168a47', blue: '#1f6fb5', purple: '#7d3c98', gray: '#6b7280', orange: '#b85a00' };
  var state = { sub: 'topo', regiao: 'TODAS' };

  function copiar(txt, msg) {
    if (!txt) { U.toast(msg || 'Nada para copiar', 'info'); return; }
    function ok() { U.toast(msg || 'Copiado', 'ok'); }
    function fb() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) ok(); else U.toast('Não foi possível copiar.', 'err'); } catch (e) { U.toast('Não foi possível copiar.', 'err'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fb); else fb();
  }

  /* balão de detalhes da TSK (hover rápido / botão direito fixa), igual ao do link do operador */
  var LS_COORDS = 'trj_coordMap';
  function lsCoords() { try { return JSON.parse(localStorage.getItem(LS_COORDS) || 'null'); } catch (e) { return null; } }
  function instalarBalao(data, app) {
    if (!TRJ.tipTsk) return;
    var porTsk = {};
    (data.tasksEnriched || []).forEach(function (t) { var k = String(t.osNumero || '').toUpperCase(); if (k) (porTsk[k] = porTsk[k] || []).push(t); });
    Object.keys(porTsk).forEach(function (k) { porTsk[k].sort(function (a, b) { return (Number(b.sequenciaId) || 0) - (Number(a.sequenciaId) || 0); }); });
    TRJ.tipTsk.instalar({
      rows: function (os) { return porTsk[String(os).toUpperCase()] || []; },
      copiar: copiar,
      coord: {
        get: function (end) {
          var cm = lsCoords() || TRJ.defaultCoordMap || {}, e = String(end || '').trim().toLowerCase(), v = null;
          Object.keys(cm).some(function (k) { if (k.toLowerCase() === e) { v = cm[k]; return true; } return false; });
          return v && v.length >= 2 && isFinite(+v[0]) && isFinite(+v[1]) ? [+v[0], +v[1]] : null;
        },
        salvar: async function (end, lat, lon) {
          var cm = lsCoords() || {}; cm[end] = [lat, lon];
          try { localStorage.setItem(LS_COORDS, JSON.stringify(cm)); } catch (e) {}
          var falhou = null;
          try { if (TRJ.api && TRJ.api.saveMapaCoords) await TRJ.api.saveMapaCoords(cm); } catch (e) { falhou = e; }       // o servidor junta com o que já existe
          try { if (TRJ.api && TRJ.api.saveCoordVALID_CAD) await TRJ.api.saveCoordVALID_CAD([{ endId: end, coord: lat.toFixed(6) + ', ' + lon.toFixed(6) }]); } catch (e) {}
          if (falhou) throw new Error('Gravada neste navegador, mas não no banco: ' + (falhou.message || falhou));
        }
      },
      abrirMapa: function (end) { TRJ._mapaFocoEnd = end; app.navigate('#/mapa'); }
    });
  }

  TRJ.pages.causaComum = function (container, ctx) {
    var data = ctx.data, h = U.h;
    if (!data) { container.appendChild(h('div', { class: 'trj-card p-6', text: 'Sem dados carregados.' })); return; }
    var A = { COR: COR, copiar: copiar, autenticado: true };
    instalarBalao(data, ctx.app);
    var temTopo = CC && CC.disponivel();

    var grupos = CC.gruposSites(data);
    var dupAll = CC.duplicidades(data.tasksEnriched);
    function regiaoOk(r) { return state.regiao === 'TODAS' || (r || 'OTHERS') === state.regiao; }
    var gruposF = grupos.filter(function (g) { return regiaoOk(g.regiao); });
    var res = temTopo ? CC.analisar(gruposF) : null;
    function filtraDup(arr) { return arr.map(function (g) { var ts = g.tsks.filter(function (t) { return regiaoOk(t.regiao); }); return ts.length >= 2 ? Object.assign({}, g, { tsks: ts, principal: ts[ts.length - 1] }) : null; }).filter(Boolean); }
    var dup = { iguais: filtraDup(dupAll.iguais), mesmoEnd: filtraDup(dupAll.mesmoEnd), controladores: filtraDup(dupAll.controladores), temNota: dupAll.temNota };
    if (!temTopo && state.sub === 'topo') state.sub = 'iguais';

    var selReg = h('select', { class: 'trj-select', style: { width: 'auto' }, onchange: function () { state.regiao = this.value; ctx.app.render(); } },
      [h('option', { value: 'TODAS', text: 'Todas as regiões' })].concat(C.REGIOES.map(function (r) { return h('option', { value: r, text: C.REGIAO_LABELS[r] || r, selected: state.regiao === r ? 'selected' : null }); })));
    container.appendChild(U.pageHeader('Causa comum & Associações', 'Pontos comuns de falha na topologia e TSKs que podem ser associadas (falha por evento, não por tarefa)', h('div', { class: 'flex items-center gap-2 flex-wrap' }, [selReg])));

    var tabs = [
      ['topo', '🌳 Pontos comuns (concentradores fora)', res ? res.suspeitos.length : null],
      ['iguais', '♊ Duplicidades (mesmo END_ID + mesma nota)', dup.iguais.length],
      ['mesmoEnd', '📍 Mesmo END_ID, notas diferentes', dup.mesmoEnd.length],
      ['controlador', '📡 Alarme em comum (mesmo controlador)', dup.controladores.length]
    ].filter(function (t) { return t[0] !== 'topo' || temTopo; });
    var barra = h('div', { class: 'op-tabs', style: { marginBottom: '12px' } }, tabs.map(function (t) {
      return h('button', { class: 'op-tab' + (state.sub === t[0] ? ' active' : ''), type: 'button', onclick: function () { state.sub = t[0]; ctx.app.render(); } },
        [t[1], t[2] != null ? h('span', { class: 'n', text: String(t[2]) }) : null]);
    }));
    container.appendChild(barra);
    var box = h('div', { class: 'cc-box' }); container.appendChild(box);
    if (state.sub === 'topo' && res) CC.render(box, res, A);
    else CC.renderAssociacoes(box, dup, A, state.sub);
  };
})(window.TRJ = window.TRJ || {});
