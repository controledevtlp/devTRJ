/* =====================================================================
 * tip-tsk.js — balão de detalhes da TSK (mesma lógica do link do operador) para o dashboard autenticado
 * ---------------------------------------------------------------------
 *  • Passar o mouse numa TSK  → balão rápido (onde está, vencimento, último update resumido, coordenada…)
 *  • Botão direito na TSK / linha → FIXA o balão: update completo e copiável, pendência completa, coordenada
 *    (abrir no mapa, Google Maps, copiar — ou cadastrar na hora), copiar a TSK. Fecha com clique fora, Esc ou ✕.
 *
 * Marcação esperada: elemento com data-os="TSK…" (hover e botão direito) ou linha com data-os-sel="TSK…" (botão direito).
 * TRJ.tipTsk.instalar({ rows(os) → [linhas da TSK, mais nova primeiro], coord: { get(end), salvar(end, lat, lon) → Promise },
 *                       abrirMapa(end), copiar(txt, msg) })
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var U = TRJ.ui, D = TRJ.domain, h = U.h, esc = U.esc;
  var COR = { red: '#c62839', amber: '#d68910', green: '#168a47', blue: '#1f6fb5', purple: '#7d3c98', gray: '#6b7280', orange: '#b85a00' };
  var ST_INFO = {
    'INICIADO': { l: 'INICIADO', cor: COR.green }, 'NAO INICIADO': { l: 'NÃO INICIADO', cor: COR.orange },
    'PENDENTE': { l: 'PENDENCIADA', cor: COR.purple }, 'CONCLUIDA': { l: 'CONCLUÍDA', cor: COR.blue }, 'CANCELADA': { l: 'CANCELADA', cor: COR.gray }
  };
  var API = TRJ.tipTsk = {};
  var cfg = null, tipEl = null, tipPin = false, tipFor = null, tipCtx = null, instalado = false;

  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  function toDate(v) { if (!v) return null; var d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
  function fmtDur(min) {
    var a = Math.abs(Math.round(min)); if (a < 60) return a + 'min';
    var hh = Math.floor(a / 60), mm = a % 60; if (hh < 48) return hh + 'h' + (mm ? ('0' + mm).slice(-2) : '');
    return Math.floor(hh / 24) + 'd ' + (hh % 24) + 'h';
  }
  function fmtDt(d) { return d ? D.formatarDataCompacta(d) : '—'; }
  function corTempo(rest) { if (rest == null) return COR.gray; if (rest < 0) return COR.red; if (rest <= 120) return COR.amber; return COR.green; }
  function stInfo(status) { return ST_INFO[D.normalize(status)] || { l: String(status || '—').toUpperCase(), cor: COR.gray }; }
  function ln(k, v) { return '<div class="ln"><span>' + k + '</span><span>' + v + '</span></div>'; }
  function btn(act, txt, title) { return '<button type="button" class="tb" data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + txt + '</button>'; }
  function osDe(el) { return el.getAttribute('data-os') || el.getAttribute('data-os-sel') || ''; }

  function lerCoord(txt) {
    var s = String(txt || '').trim(); if (!s) return { erro: 'Informe latitude e longitude.' };
    var m = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s) || /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s), a, b;
    if (m) { a = parseFloat(m[1]); b = parseFloat(m[2]); }
    else {
      var t = s.match(/-?\d+(?:[.,]\d+)?/g);
      if (!t || t.length !== 2) return { erro: 'Use o formato: latitude, longitude (ex.: -22.9071, -43.1743).' };
      a = parseFloat(t[0].replace(',', '.')); b = parseFloat(t[1].replace(',', '.'));
    }
    if (!isFinite(a) || !isFinite(b)) return { erro: 'Coordenada inválida.' };
    var br = function (la, lo) { return la >= -34.5 && la <= 5.5 && lo >= -74.5 && lo <= -32; };
    if (!br(a, b)) return { erro: br(b, a) ? 'Parece que latitude e longitude estão invertidas. Informe primeiro a latitude.' : 'Essa coordenada está fora do Brasil. Confira os sinais.' };
    return { lat: Math.round(a * 1e6) / 1e6, lon: Math.round(b * 1e6) / 1e6 };
  }

  function html(os, full) {
    var rows = cfg.rows(os);
    if (!rows || !rows.length) return '<b>' + esc(os) + '</b><div class="tx">Sem detalhes nos dados carregados.</div>';
    var t = rows[0], si = stInfo(t.status), now = Date.now(), OP = TRJ.operador;
    var reg = OP ? OP.classificar(t.isocDJ) : { dj: '', nome: '', grupo: null };
    var criacao = D.parsePlatformDate(t.dataCriacaoAS) || toDate(t.dataCriacao), venc = toDate(t.vencimentoCalc);
    tipCtx = { os: t.osNumero, end: t.enderecoId || '', site: t.siteId || '', upd: '', pend: '', lat: null, lon: null };
    var out = '<div class="hd"><span>' + esc(t.osNumero) + '</span><span class="st" style="background:' + si.cor + '">' + si.l + '</span>' +
      (full ? '<span class="hdb">' + btn('copiar-tsk', '📋 TSK', 'Copiar o número da TSK') + btn('fechar', '✕', 'Fechar (Esc)') + '</span>' : '') + '</div>';
    out += ln('Onde está', esc(t.filaAtual || '—'));
    if (t.tipoFalha) out += ln('Falha', esc(t.tipoFalha));
    if (reg.dj) out += ln('Regra criadora', esc(reg.nome) + (reg.grupo ? ' <b>(' + (reg.grupo === 'FIXA' ? 'FIXA' : 'MÓVEL') + ')</b>' : ''));
    out += ln('Site / END_ID', esc((t.siteId || '—') + ' / ' + (t.enderecoId || '—')));
    if (criacao) out += ln('Criada', fmtDt(criacao) + ' <span class="tx">(há ' + fmtDur((now - criacao.getTime()) / 60000) + ')</span>');
    if (venc) { var rest = Math.round((venc.getTime() - now) / 60000); out += ln('Vencimento', fmtDt(venc) + ' <b style="color:' + corTempo(rest) + '">' + (rest < 0 ? 'atrasada ' : 'vence em ') + fmtDur(rest) + '</b>'); }
    var upd = U.classificarUltimoBloco ? U.classificarUltimoBloco(t.motivoCancelamento) : null;
    if (upd && upd.estado !== 'sem' && upd.dt) {
      out += ln('Último update', fmtDt(upd.dt) + ' <span class="tx">(há ' + fmtDur((now - upd.dt.getTime()) / 60000) + ')</span>');
      if (upd.texto) {
        if (full) {
          tipCtx.upd = (upd.autor ? upd.autor + ' — ' : '') + fmtDt(upd.dt) + '\n' + String(upd.texto);
          out += '<div class="msg full">' + (upd.autor ? '<b>' + esc(upd.autor) + '</b><br>' : '') + esc(String(upd.texto)) + '</div><div class="ac">' + btn('copiar-upd', '📋 Copiar update') + '</div>';
        } else {
          var msg = String(upd.texto).replace(/\s+/g, ' ');
          out += '<div class="msg">' + (upd.autor ? '<b>' + esc(upd.autor) + '</b><br>' : '') + '“' + esc(msg.slice(0, 260)) + (msg.length > 260 ? '…' : '') + '”</div>';
        }
      }
    } else out += ln('Último update', '<b style="color:' + COR.red + '">sem atualização do operador</b>');

    if (t.enderecoId) {
      var cd = cfg.coord.get(t.enderecoId);
      if (!full) out += ln('Coordenada', cd ? 'cadastrada' : '<b style="color:' + COR.orange + '">sem coordenada — botão direito para cadastrar</b>');
      else if (cd) {
        tipCtx.lat = cd[0]; tipCtx.lon = cd[1];
        out += ln('Coordenada', '<span class="mono">' + cd[0].toFixed(6) + ', ' + cd[1].toFixed(6) + '</span>');
        out += '<div class="ac">' + btn('mapa', '🗺 Abrir no mapa', 'Abre o Mapa Operacional já em cima deste site') +
          '<a class="tb" href="https://www.google.com/maps/search/?api=1&query=' + cd[0] + ',' + cd[1] + '" target="_blank" rel="noopener">↗ Google Maps</a>' + btn('copiar-coord', '📋 Copiar') + '</div>';
      } else {
        out += ln('Coordenada', '<b style="color:' + COR.orange + '">não cadastrada</b>');
        out += '<div class="cad"><input type="text" data-coord placeholder="-22.9071, -43.1743 (ou link do Maps)" autocomplete="off">' + btn('salvar-coord', '💾 Cadastrar') + '<div class="err" data-err></div></div>';
      }
    }
    var bg = String(t.motivoCancelamento || ''), m = /TRAMITA[ÇC][ÃA]O OU SUSPENS[ÃA]O:/i.exec(bg);
    if (m && rows.some(function (r) { return D.normalize(r.status) === 'PENDENTE'; })) {
      if (!full) out += ln('Pendência', esc(bg.slice(m.index, m.index + 200).replace(/\s+/g, ' ')) + '…');
      else {
        var ptxt = '';
        try { var ents = U.parseEntradasDiario ? U.parseEntradasDiario(bg) : []; for (var k = ents.length - 1; k >= 0 && !ptxt; k--) if (/TRAMITA[ÇC][ÃA]O OU SUSPENS[ÃA]O:/i.test(ents[k].mensagem || '')) ptxt = ents[k].mensagem; } catch (e) {}
        if (!ptxt) ptxt = bg.slice(m.index, m.index + 3000);
        tipCtx.pend = ptxt;
        out += '<div class="ln"><span>Pendência</span><span></span></div><div class="msg full pend">' + esc(ptxt) + '</div><div class="ac">' + btn('copiar-pend', '📋 Copiar pendência') + '</div>';
      }
    }
    var mv = [], ult = '';
    rows.slice(0, 6).reverse().forEach(function (r) { var s = stInfo(r.status).l + ' → ' + String(r.filaAtual || '—').slice(0, 34); if (s !== ult) { mv.push(s); ult = s; } });
    if (mv.length > 1) out += '<div class="mv"><b>Movimentação:</b><br>' + mv.map(esc).join('<br>') + '</div>';
    out += '<div class="mv">' + (full ? 'Fixado — clique fora ou Esc para fechar' : 'Botão direito: fixar os detalhes') + '</div>';
    return out;
  }

  function pos(el, pt) {
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight, x, y;
    if (pt) { x = pt.x + 6; y = pt.y + 6; }
    else { var r = el.getBoundingClientRect(); x = r.left; y = r.bottom + 8; if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8); }
    x = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - tw - 8));
    y = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - th - 8));
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function show(el, fixar, pt) {
    var os = osDe(el); if (!os || !cfg) return;
    tipFor = el; tipPin = !!fixar;
    tipEl.className = 'op-tip' + (fixar ? ' pin' : '');
    tipEl.innerHTML = html(os, !!fixar); tipEl.style.display = 'block';
    if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(tipEl);
    pos(el, pt);
  }
  function hide(force) { if (tipPin && !force) return; tipEl.style.display = 'none'; tipEl.classList.remove('pin'); tipFor = null; tipPin = false; }
  function reabrir() { if (tipPin && tipCtx) { tipEl.innerHTML = html(tipCtx.os, true); if (TRJ.theme && TRJ.theme.adapt) TRJ.theme.adapt(tipEl); } }

  async function salvarCoord() {
    var inp = tipEl.querySelector('[data-coord]'), err = tipEl.querySelector('[data-err]'), b = tipEl.querySelector('[data-act="salvar-coord"]');
    if (!inp || !tipCtx) return;
    var r = lerCoord(inp.value); if (r.erro) { err.textContent = r.erro; return; }
    err.textContent = ''; b.disabled = true;
    try { await cfg.coord.salvar(tipCtx.end, r.lat, r.lon); U.toast('Coordenada gravada: ' + tipCtx.end, 'ok'); reabrir(); }
    catch (e) { b.disabled = false; err.textContent = (e && e.message) || 'Não foi possível gravar.'; }
  }

  API.instalar = function (opts) {
    cfg = opts;
    if (instalado) { hide(true); return; }
    instalado = true;
    tipEl = document.createElement('div'); tipEl.id = 'tip-tsk'; tipEl.className = 'op-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl);
    document.addEventListener('mouseover', function (e) {
      if (tipPin || !cfg) return;
      var el = e.target.closest ? e.target.closest('[data-os]') : null;
      if (el) { if (el !== tipFor) show(el); } else if (tipFor) hide();
    });
    window.addEventListener('scroll', function () { if (!tipPin) hide(); }, true);
    document.addEventListener('contextmenu', function (e) {
      if (!cfg || !document.body.contains(tipEl)) return;
      if (e.target.closest && e.target.closest('#tip-tsk')) return;
      var el = e.target.closest ? (e.target.closest('[data-os]') || e.target.closest('[data-os-sel]')) : null;
      if (!el || !osDe(el)) return;
      e.preventDefault(); hide(true); show(el, true, { x: e.clientX, y: e.clientY });
    });
    document.addEventListener('click', function (e) { if (tipPin && !(e.target.closest && e.target.closest('#tip-tsk'))) hide(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && tipPin) hide(true); });
    window.addEventListener('hashchange', function () { hide(true); });
    tipEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null; if (!b || !tipCtx) return;
      var a = b.getAttribute('data-act');
      if (a === 'fechar') hide(true);
      else if (a === 'copiar-tsk') cfg.copiar(tipCtx.os, 'TSK copiada');
      else if (a === 'copiar-upd') cfg.copiar(tipCtx.upd, 'Último update copiado');
      else if (a === 'copiar-pend') cfg.copiar(tipCtx.pend, 'Pendência copiada');
      else if (a === 'copiar-coord') cfg.copiar(tipCtx.lat + ', ' + tipCtx.lon, 'Coordenada copiada');
      else if (a === 'mapa') { var end = tipCtx.end; hide(true); cfg.abrirMapa(end); }
      else if (a === 'salvar-coord') salvarCoord();
    });
    tipEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-coord]')) { e.preventDefault(); salvarCoord(); } });
  };
  API.fechar = function () { if (tipEl) hide(true); };
})(window.TRJ = window.TRJ || {});
