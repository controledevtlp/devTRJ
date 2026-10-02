/* Parser do HTML do painel G.E.N.E.S.I.S (portado de genesis-parser.ts) */
(function (TRJ) {
  var G = {};

  function decodeEntities(s) {
    if (!s) return '';
    return s
      .replace(/&#(\d+);/g, function (_, n) { var code = parseInt(n, 10); return isFinite(code) ? String.fromCharCode(code) : ''; })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
  }
  function stripTags(s) { return (s == null ? '' : s).replace(/<[^>]*>/g, ''); }
  function cellText(innerHtml) { return decodeEntities(stripTags(innerHtml)).replace(/\s+/g, ' ').trim(); }
  function rawAttr(tagAttrs, name) {
    var m = tagAttrs.match(new RegExp(name + '\\s*=\\s*"([\\s\\S]*?)"', 'i'));
    return m ? m[1] : null;
  }
  function attr(tagAttrs, name) {
    var v = rawAttr(tagAttrs, name);
    return v == null ? null : decodeEntities(v).replace(/\s+/g, ' ').trim();
  }
  function nn(s) {
    if (s == null) return null;
    var t = s.replace(/\s+/g, ' ').trim();
    if (!t) return null;
    var compact = t.replace(/\s/g, '');
    if (compact === '/' || compact === '//' || compact === '#' || compact === '') return null;
    return t;
  }
  function toInt(s) {
    var m = (s == null ? '' : s).match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function parseGenesisHtml(html) {
    if (!html) return [];
    var rows = [];
    var rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    var rowMatch;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      var rowInner = rowMatch[1];
      if (!/<input[^>]*type\s*=\s*"checkbox"/i.test(rowInner)) continue;
      var tds = [];
      var tdRe = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
      var tm;
      while ((tm = tdRe.exec(rowInner)) !== null) tds.push({ attrs: tm[1], inner: tm[2] });
      if (tds.length < 18) continue;

      var get = function (i) { return tds[i] ? cellText(tds[i].inner) : ''; };
      var getAttr = function (i, name) { return tds[i] ? attr(tds[i].attrs, name) : null; };
      var getRawAttr = function (i, name) { return tds[i] ? rawAttr(tds[i].attrs, name) : null; };

      var site = nn(get(7));
      if (!site) {
        var nameM = tds[0] && tds[0].inner.match(/name\s*=\s*"([^"]*)"/i);
        site = nameM ? decodeEntities(nameM[1]).trim() : null;
      }
      var gsbi = ((getAttr(3, 'title') || get(3) || '').toUpperCase()) || null;

      var anf = null;
      var anfTitle = (getAttr(9, 'title') || '').trim();
      var anfText = get(9).trim();
      if (/^\d+$/.test(anfTitle)) anf = anfTitle;
      else if (/^\d+$/.test(anfText)) anf = anfText;

      var eveTitle = getRawAttr(12, 'title') || '';
      var statusM = eveTitle.match(/Status:\s*([^\n\r]+)/i);
      var statusEvento = statusM ? decodeEntities(statusM[1]).trim() : null;
      var eve = nn(get(12));
      var detalhe = nn(get(15));

      rows.push({
        site: site,
        horario: nn(get(1)),
        downtime: nn(get(2)),
        gsbi: gsbi,
        qtdFurtos: toInt(get(4)),
        qtdCelulas: toInt(get(5)),
        tecnologia: nn(get(6)),
        enderecoId: nn(get(8)),
        anf: anf,
        cidadeUf: nn(get(10)),
        infra: nn(get(11)),
        eve: eve,
        statusEvento: statusEvento,
        previsao: nn(get(13)),
        causa: nn(get(14)),
        detalhe: detalhe,
        alarme: nn(get(16)),
        peso: toInt(get(17))
      });
    }
    return rows;
  }

  function horarioDtDeDowntime(downtime, base) {
    if (!downtime) return null;
    var s = downtime.trim();
    if (!/\d+\s*[amdh]/i.test(s)) return null;
    var num = function (re) { var m = s.match(re); return m ? parseInt(m[1], 10) : 0; };
    var anos = num(/(\d+)\s*a/i);
    var meses = num(/(\d+)\s*m/i);
    var dias = num(/(\d+)\s*d/i);
    var horas = num(/(\d+)\s*h/i);
    var totalHoras = (anos * 365 + meses * 30 + dias) * 24 + horas;
    var ref = base ? base.getTime() : Date.now();
    return new Date(ref - totalHoras * 3600 * 1000);
  }

  function ehGenesisHtml(html) {
    if (!html) return false;
    var h = html.toLowerCase();
    if (h.indexOf('painel_online_peso') >= 0) return true;
    if (h.indexOf('id="tabela"') >= 0 && h.indexOf('checkbox') >= 0) return true;
    if (h.indexOf('gsbi') >= 0 && (h.indexOf('downtime') >= 0 || h.indexOf('end_id') >= 0) && h.indexOf('<table') >= 0) return true;
    return false;
  }

  G.parseGenesisHtml = parseGenesisHtml;
  G.horarioDtDeDowntime = horarioDtDeDowntime;
  G.ehGenesisHtml = ehGenesisHtml;
  TRJ.genesis = G;
})(window.TRJ = window.TRJ || {});
