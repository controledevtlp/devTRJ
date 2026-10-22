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

  /* FIBRA_T?? de qualquer contrato (TRJ, TMG, TNE…) vira o mesmo caminho */
  function normDV(dv) { var s = String(dv || '').trim(); return /^FIBRA_T[A-Za-z]{2}$/i.test(s) ? 'FIBRA_TXX' : s; }
  R.normDV = normDV;

  /* escolhas conhecidas (as que o Lucas listou); o que não estiver aqui aparece como NOVO para receber um nome */
  var CONHECIDOS = {
    caminho: ['Gestão de Acesso > Gestão de Acesso', 'iSOC > FIELD', 'iSOC > ACESSO', 'iSOC > ACESSO BA', 'iSOC > SOM', 'iSOC > REDE METRO', 'Parceira de Campo > Retorno Centralizado', 'Outro Contrato > FIBRA_TXX'],
    motivo: ['Restrição de Acesso', 'GMG Ativo no site', 'Condições Climáticas', 'Atividade em Torre', 'Área de Risco', 'Aguardando Sobressalente'],
    tram: ['Tramitação autorizada', 'Ausência de sinal TX alugada', 'Atividade de implantação', 'Acesso depende de ação do Layer'],
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

  R.analisar = function (tasks) {
    var now = Date.now(), por = {};
    (tasks || []).forEach(function (t) { var k = up(t.osNumero); if (k) (por[k] = por[k] || []).push(t); });
    var eventos = [], temCampos = false, catalogo = { caminho: {}, motivo: {}, tram: {}, area: {} };
    function reg(tipo, valor) { if (!valor) return; var c = catalogo[tipo][valor] || (catalogo[tipo][valor] = { n: 0, novo: !R.conhecido(tipo, valor) }); c.n++; }
    Object.keys(por).forEach(function (k) {
      var rows = por[k].slice().sort(function (a, b) { return (Number(a.sequenciaId) || 0) - (Number(b.sequenciaId) || 0); });
      if (!D.isTicketCorretiva(rows[rows.length - 1].tipoAtividade)) return;
      var prioFallback = ''; rows.forEach(function (r) { if (r.prioridade) prioFallback = up(r.prioridade); });
      for (var i = 0; i < rows.length; i++) {
        if (D.normalize(rows[i].status) !== 'PENDENTE') continue;
        if (i > 0 && D.normalize(rows[i - 1].status) === 'PENDENTE') continue;      // continuação da mesma suspensão
        var j = i; while (j + 1 < rows.length && D.normalize(rows[j + 1].status) === 'PENDENTE') j++;
        var p = rows[j], ini = parseDt(rows[i].dataCriacao) || parseDt(p.dataCriacao), nxt = rows[j + 1] || null;
        var dk = String(p.responsabilidade || '').trim(), dv = normDV(p.subArea);
        var caminho = (dk || dv) ? (dk && dv ? dk + ' > ' + dv : (dk || dv)) : '(sem caminho)';
        if (dk || dv || p.areaSusp || p.notaSuspensao || p.dataReinicio) temCampos = true;
        var prev = parseDt(p.dataReinicio), quem = pessoa(p.quemEncerrou), classe, ret = null, retPor = null, st = nxt ? D.normalize(nxt.status) : '';
        if (nxt && (st === 'NAO INICIADO' || st === 'INICIADO')) {
          ret = parseDt(nxt.dataCriacao); retPor = pessoa(nxt.quemEncerrou);
          classe = prev ? ((ret && ret.getTime() < prev.getTime() - 60000) ? 'ANTECIPADO' : 'NO_PRAZO') : 'SEM_PREVISAO';
        } else if (nxt) classe = 'ENCERRADA'; else classe = 'SUSPENSA';
        var last = rows[rows.length - 1], fimMs = ret ? ret.getTime() : now;
        eventos.push({
          os: rows[i].osNumero, site: p.siteId || last.siteId || '', end: p.enderecoId || last.enderecoId || '', regiao: p.regiao || last.regiao || 'OTHERS',
          prio: up(p.prioridade) || prioFallback || '—', caminho: caminho, dk: dk, dv: dv, area: String(p.areaSusp || '').trim(), motivo: String(p.notaSuspensao || '').trim(),
          tram: String(p.motivoTramitacao || '').trim(), quem: quem.nome, quemSistema: quem.sistema, inicio: ini, previsto: prev, retorno: ret, retornoPor: retPor ? retPor.nome : '', retornoSistema: retPor ? retPor.sistema : false,
          classe: classe, deltaMin: prev && ret ? Math.round((prev.getTime() - ret.getTime()) / 60000) : null,
          suspensaMin: ini ? Math.round((fimMs - ini.getTime()) / 60000) : null,
          vencidoSemRetorno: classe === 'SUSPENSA' && !!prev && prev.getTime() < now,
          statusAtual: last.status || '', fila: last.filaAtual || ''
        });
        reg('caminho', caminho === '(sem caminho)' ? '' : caminho); reg('motivo', String(p.notaSuspensao || '').trim()); reg('tram', String(p.motivoTramitacao || '').trim()); reg('area', String(p.areaSusp || '').trim());
        i = j;
      }
    });
    eventos.sort(function (a, b) { return ((b.retorno || b.inicio || 0) - (a.retorno || a.inicio || 0)); });
    return { eventos: eventos, temCampos: temCampos, catalogo: catalogo };
  };
})(window.TRJ = window.TRJ || {});
