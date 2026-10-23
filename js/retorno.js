/* =====================================================================
 * retorno.js — CONTROLE DE RETORNO (suspensão / tramitação → volta para a fila)
 * ---------------------------------------------------------------------
 * Lê o histórico de linhas de cada TSK (uma linha por mudança de estado, vinda dos xlsx de atividades) e
 * monta um "episódio" para cada suspensão (estado "pendente"):
 *   início  = hora da linha pendente (coluna FT)         · quem suspendeu = Usuário Executor (FX) da linha pendente
 *   caminho = Responsabilidade (DK) > Sub área (DV)       · motivo = Nota de Suspensão (CS) · 3ª escolha = FW · área = AA
 *   previsto = Data/Hora de Reinício (AW), quando o caminho aceita
 *   fim     = 1ª linha seguinte: Não iniciado/Iniciado → RETORNOU À FILA · Concluída/Cancelada → ENCERRADA · nenhuma → SUSPENSA
 * Classe do retorno:  ANTECIPADO (voltou antes do AW) · NO_PRAZO (voltou no/depois do AW) · SEM_PREVISAO (sem AW)
 *
 * TRJ.retorno.analisar(tasksEnriched) → { eventos[], temCampos, catalogo }
 * TRJ.retorno.compactar(eventos) / expandir(arr) → formato enxuto do snapshot público
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var D = TRJ.domain;
  var R = TRJ.retorno = {};

  function up(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }
  function sa(s) { return up(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '); }   // sem acento, caixa alta
  function parseDt(v) {
    if (!v) return null; if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = String(v).trim(), m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var d = D.parsePlatformDate(s); return d && !isNaN(d.getTime()) ? d : null;
  }
  /* "TLP-T3429608-THIAGO DIAS DA SENHORA(T3429608)" → { nome, sistema:false } · "Routing(routing)" → sistema */
  function pessoa(v) {
    var s = String(v == null ? '' : v).trim(); if (!s) return { nome: '(sem usuário)', sistema: false };
    s = s.replace(/\([^)]*\)\s*$/, '').replace(/^TLP-T\d+-/i, '').trim();
    var sist = /^(routing|app |system|sistema|integra|api )/i.test(s);
    return { nome: sist ? 'Sistema (' + s + ')' : s, sistema: sist };
  }
  R.pessoa = pessoa;

  /* FIBRA_T?? (duas letras do contrato no fim) vira o mesmo caminho em qualquer contrato */
  function normDV(dv) { var s = String(dv || '').trim(); return /^FIBRA_T[A-Za-z]{2}$/i.test(s) ? 'FIBRA_TXX' : s; }
  R.normDV = normDV;

  /* escolhas conhecidas (as que o Lucas listou); o que não estiver aqui aparece como NOVO para receber um nome */
  var CONHECIDOS = {
    caminho: ['Gestão de Acesso > Gestão de Acesso', 'iSOC > FIELD', 'iSOC > ACESSO', 'iSOC > ACESSO BA', 'iSOC > SOM', 'iSOC > REDE METRO', 'Parceira de Campo > Retorno Centralizado', 'Outro Contrato > FIBRA_TXX'],
    motivo: ['Restrição de Acesso', 'GMG Ativo no site', 'Condições Climáticas', 'Atividade em Torre', 'Área de Risco', 'Aguardando Sobressalente',
      // Motivo da Suspensão (GJ) do caminho iSOC > FIELD > FIELD
      'ATIVIDADE TORRE HORÁRIO NOTURNO', 'Acesso ETD', 'Aguardando terceiros / Chave', 'Anatel - Greve', 'Anatel - Impedimento de Acesso (Segurança Pública)', 'DESLOCAMENTO DE GMG', 'DESLOCAMENTO DE SOBRESSALENTE',
      'ELABORAÇÃO DE ORÇAMENTO', 'FALHA DE ENERGIA CONCESSIONÁRIA', 'GMG ATIVO NO SITE', 'INTEMPÉRIE CLIMATICA', 'RECUPERAÇÃO DE VANDALISMO', 'RESTRIÇÃO DE ACESSO', 'ÁREA DE RISCO'],
    tram: ['Tramitação autorizada', 'Ausência de sinal TX alugada', 'Atividade de implantação', 'Acesso depende de ação do Layer',
      // motivos de TRAMITAÇÃO (Motivo da Tramitação, FW) listados pelo Lucas
      'Anatel - Greve', 'Anatel - Impedimento de Acesso (Segurança Pública)', 'Corte de Energia pela Concessionaria', 'Não possui sobressalente no CM', 'Orçamento Entregue', 'Queda de Torre'],
    area: ['Acesso', 'FIELD', 'FMO', 'Gestão de Acesso', 'Retorno Centralizado', 'Transporte']
  };
  var CONH_SET = {}; Object.keys(CONHECIDOS).forEach(function (k) { CONH_SET[k] = {}; CONHECIDOS[k].forEach(function (v) { CONH_SET[k][sa(v)] = 1; }); });
  R.conhecido = function (tipo, valor) { return !!(CONH_SET[tipo] && CONH_SET[tipo][sa(valor)]); };

  R.CLASSES = {
    ANTECIPADO: { rot: 'Retornou ANTES do planejado', cor: '#c62839' },
    SEM_PREVISAO: { rot: 'Retornou sem previsão', cor: '#d68910' },
    NO_PRAZO: { rot: 'Retornou no prazo', cor: '#168a47' },
    SUSPENSA: { rot: 'Ainda suspensa', cor: '#1f6fb5' },
    ENCERRADA: { rot: 'Encerrada suspensa', cor: '#6b7280' }
  };

  /* iSOC > FIELD > FIELD (Responsabilidade > Sub área > Área) = SUSPENSÃO; qualquer outro caminho = TRAMITAÇÃO */
  /* SUSPENSÃO só para os motivos da lista abaixo (coluna GJ "Motivo da Suspensão"). Os 3 últimos são os nomes antigos usados na Nota de Suspensão (CS).
     "Anatel - Greve" e "Anatel - Impedimento de Acesso" existem nas DUAS listas: quem decide é a coluna em que vieram (GJ = suspensão, FW = tramitação). */
  var MOTIVOS_SUSP = ['ATIVIDADE TORRE HORÁRIO NOTURNO', 'Acesso ETD', 'Aguardando terceiros / Chave', 'Anatel - Greve', 'Anatel - Impedimento de Acesso (Segurança Pública)', 'DESLOCAMENTO DE GMG', 'DESLOCAMENTO DE SOBRESSALENTE',
    'ELABORAÇÃO DE ORÇAMENTO', 'FALHA DE ENERGIA CONCESSIONÁRIA', 'GMG ATIVO NO SITE', 'INTEMPÉRIE CLIMATICA', 'RECUPERAÇÃO DE VANDALISMO', 'RESTRIÇÃO DE ACESSO', 'ÁREA DE RISCO',
    'Condições Climáticas', 'Atividade em Torre', 'Aguardando Sobressalente'];
  var SUSP_SET = {}; MOTIVOS_SUSP.forEach(function (m) { SUSP_SET[sa(m)] = 1; });
  R.ehMotivoSusp = function (m) { return !!SUSP_SET[sa(m)]; };
  R.TIPOS = { SUSPENSAO: { rot: 'Suspensão', cor: '#7d3c98' }, TRAMITACAO: { rot: 'Tramitação', cor: '#1f6fb5' } };
  /* tempo até voltar para a fila */
  R.FAIXAS = [['inst', 'Instantâneo (até 5 min)', 5], ['1h', 'Até 1 h', 60], ['4h', '1 a 4 h', 240], ['12h', '4 a 12 h', 720], ['24h', '12 a 24 h', 1440], ['mais', 'Mais de 24 h', Infinity]];
  R.faixaDe = function (min) { if (min == null) return null; for (var i = 0; i < R.FAIXAS.length; i++) if (min <= R.FAIXAS[i][2]) return R.FAIXAS[i][0]; return 'mais'; };

  R.analisar = function (tasks) {
    var now = Date.now(), por = {};
    (tasks || []).forEach(function (t) { var k = up(t.osNumero); if (k) (por[k] = por[k] || []).push(t); });
    var eventos = [], temCampos = false, inferidas = 0, catalogo = { caminho: {}, motivo: {}, tram: {}, area: {} };
    function reg(tipo, valor) { if (!valor) return; var c = catalogo[tipo][valor] || (catalogo[tipo][valor] = { n: 0, novo: !R.conhecido(tipo, valor) }); c.n++; }
    function txt(v) { return String(v == null ? '' : v).trim(); }
    function temCampoSusp(r) { return !!(txt(r.responsabilidade) || txt(r.subArea) || txt(r.areaSusp) || txt(r.motivoSuspensao) || txt(r.notaSuspensao) || txt(r.dataReinicio)); }
    function assinatura(r) { return [txt(r.responsabilidade), txt(r.subArea), txt(r.areaSusp), txt(r.motivoSuspensao), txt(r.notaSuspensao), txt(r.dataReinicio)].join('|'); }

    Object.keys(por).forEach(function (k) {
      var rows = por[k].slice().sort(function (a, b) { return (Number(a.sequenciaId) || 0) - (Number(b.sequenciaId) || 0); });
      if (!D.isTicketCorretiva(rows[rows.length - 1].tipoAtividade)) return;
      var prioFallback = ''; rows.forEach(function (r) { if (r.prioridade) prioFallback = up(r.prioridade); });
      var last = rows[rows.length - 1];

      /* monta o episódio: ri = 1ª linha da suspensão · rp = linha com as escolhas · nxt = linha seguinte · inst = suspensão que já aparece como "voltou" na própria linha */
      function evento(ri, rp, nxt, inf) {
        var ini = inf ? null : (parseDt(ri.dataCriacao) || parseDt(rp.dataCriacao)), dk = txt(rp.responsabilidade), dv = normDV(rp.subArea), area = txt(rp.areaSusp);
        var caminho = (dk || dv) ? (dk && dv ? dk + ' > ' + dv : (dk || dv)) : '(sem caminho)';
        if (temCampoSusp(rp) || rp.dataReinicio || rp.notaSuspensao) temCampos = true;
        var prev = parseDt(rp.dataReinicio), quem = pessoa(rp.quemEncerrou), classe, ret = null, retPor = null, st = nxt ? D.normalize(nxt.status) : '';
        if (inf) { ret = parseDt(ri.dataCriacao); retPor = quem; quem = { nome: '(início não identificado)', sistema: false }; }
        else if (nxt && (st === 'NAO INICIADO' || st === 'INICIADO')) { ret = parseDt(nxt.dataCriacao); retPor = pessoa(nxt.quemEncerrou); }
        if (ret) classe = prev ? ((ret.getTime() < prev.getTime() - 60000) ? 'ANTECIPADO' : 'NO_PRAZO') : 'SEM_PREVISAO';
        else classe = nxt ? 'ENCERRADA' : 'SUSPENSA';
        var gj = txt(rp.motivoSuspensao), fw = txt(rp.motivoTramitacao), nota = txt(rp.notaSuspensao);
        var tipo = gj ? 'SUSPENSAO' : (fw ? 'TRAMITACAO' : (R.ehMotivoSusp(nota) ? 'SUSPENSAO' : 'TRAMITACAO'));
        var motivo = tipo === 'SUSPENSAO' ? (gj || nota) : (fw || nota || gj), fimMs = ret ? ret.getTime() : now;
        var susMin = ini ? Math.round((fimMs - ini.getTime()) / 60000) : null;
        eventos.push({
          os: ri.osNumero, site: rp.siteId || last.siteId || '', end: rp.enderecoId || last.enderecoId || '', regiao: rp.regiao || last.regiao || 'OTHERS',
          prio: up(rp.prioridade) || prioFallback || '—', tipo: tipo, origem: inf ? 'inferida' : 'historico', caminho: caminho, dk: dk, dv: dv, area: area,
          motivo: motivo, nota: txt(rp.notaSuspensao), tram: txt(rp.motivoTramitacao), quem: quem.nome, quemSistema: quem.sistema, inicio: ini, previsto: prev, retorno: ret,
          retornoPor: retPor ? retPor.nome : '', retornoSistema: retPor ? retPor.sistema : false, classe: classe,
          deltaMin: prev && ret ? Math.round((prev.getTime() - ret.getTime()) / 60000) : null, suspensaMin: susMin, faixa: ret ? R.faixaDe(susMin) : null,
          vencidoSemRetorno: classe === 'SUSPENSA' && !!prev && prev.getTime() < now, statusAtual: last.status || '', fila: last.filaAtual || ''
        });
        reg('caminho', caminho === '(sem caminho)' ? '' : caminho); reg(tipo === 'SUSPENSAO' ? 'motivo' : 'tram', motivo); reg('area', area);
      }

      for (var i = 0; i < rows.length; i++) {
        var st0 = D.normalize(rows[i].status), antes = i > 0 ? D.normalize(rows[i - 1].status) : '';
        if (st0 !== 'PENDENTE') {
          // a linha já está em Não iniciado/Iniciado mas carrega a nota/previsão/escolhas de uma suspensão (sem linha "pendente" antes no arquivo):
          // a suspensão já aconteceu e a TSK voltou para a fila — conta uma vez (ignora repetição da mesma nota nas linhas seguintes)
          if ((st0 === 'NAO INICIADO' || st0 === 'INICIADO') && antes !== 'PENDENTE' && temCampoSusp(rows[i]) && !(i > 0 && assinatura(rows[i - 1]) === assinatura(rows[i]))) { inferidas++; evento(rows[i], rows[i], null, true); }
          continue;
        }
        if (antes === 'PENDENTE') continue;                                        // continuação da mesma suspensão
        var j = i; while (j + 1 < rows.length && D.normalize(rows[j + 1].status) === 'PENDENTE') j++;
        evento(rows[i], rows[j], rows[j + 1] || null, false);
        i = j;
      }
    });
    eventos.sort(function (a, b) { return ((b.retorno || b.inicio || 0) - (a.retorno || a.inicio || 0)); });
    return { eventos: eventos, temCampos: temCampos, catalogo: catalogo, inferidas: inferidas };
  };

  /* ---------- formato enxuto para o snapshot (dashboard público e devGERAL) ----------
   * Os episódios saem do histórico de linhas das TSKs, que só o painel autenticado tem; por isso são calculados lá e publicados.
   * Ficam de fora os campos que dependem da hora de agora (tempo parado, retorno vencido): quem lê recalcula com expandir().
   * Entram todas as ainda pendentes e o que voltou/encerrou nos últimos 45 dias. Mesma estrutura copiada em siteGERAL/index.html. */
  R.compactar = function (eventos) {
    var corte = Date.now() - 45 * 86400000, out = [];
    function ms(d) { return d ? d.getTime() : null; }
    (eventos || []).forEach(function (e) {
      var ref = e.retorno || e.inicio;
      if (e.classe !== 'SUSPENSA' && ref && ref.getTime() < corte) return;
      out.push({ o: e.os, s: e.site, e: e.end, r: e.regiao, p: e.prio, t: e.tipo === 'SUSPENSAO' ? 'S' : 'T', i: e.origem === 'inferida' ? 1 : 0, c: e.caminho, m: e.motivo,
        n: (e.nota || '').slice(0, 160), ar: e.area, q: e.quem, qs: e.quemSistema ? 1 : 0, a: ms(e.inicio), v: ms(e.previsto), b: ms(e.retorno), rp: e.retornoPor, rs: e.retornoSistema ? 1 : 0, k: e.classe, d: e.deltaMin });
    });
    return out;
  };
  R.expandir = function (arr) {
    var now = Date.now();
    return (arr || []).map(function (x) {
      var ini = x.a ? new Date(x.a) : null, prev = x.v ? new Date(x.v) : null, ret = x.b ? new Date(x.b) : null;
      var susMin = ini ? Math.round(((ret ? ret.getTime() : now) - ini.getTime()) / 60000) : null;
      return { os: x.o, site: x.s || '', end: x.e || '', regiao: x.r || 'OTHERS', prio: x.p || '—', tipo: x.t === 'S' ? 'SUSPENSAO' : 'TRAMITACAO', origem: x.i ? 'inferida' : 'historico',
        caminho: x.c || '(sem caminho)', dk: '', dv: '', area: x.ar || '', motivo: x.m || '', nota: x.n || '', tram: '', quem: x.q || '(sem usuário)', quemSistema: !!x.qs,
        inicio: ini, previsto: prev, retorno: ret, retornoPor: x.rp || '', retornoSistema: !!x.rs, classe: x.k, deltaMin: x.d == null ? null : x.d,
        suspensaMin: susMin, faixa: ret ? R.faixaDe(susMin) : null, vencidoSemRetorno: x.k === 'SUSPENSA' && !!prev && prev.getTime() < now, statusAtual: '', fila: '' };
    });
  };
})(window.TRJ = window.TRJ || {});
