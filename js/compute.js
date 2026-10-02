/* Agregacoes e enriquecimento (portado de app/api/*) */
(function (TRJ) {
  var C = TRJ.constants;
  var D = TRJ.domain;
  var G = TRJ.genesis;
  var C2 = {};

  function up(s) { return (s == null ? '' : s).toString().toUpperCase().trim(); }

  // Filtra incidentes pela região escolhida no Dashboard, mas sempre mantém
  // "OTHERS" (sem cadastro) visível, independente do filtro selecionado —
  // assim o operador não perde de vista o que falta cadastrar.
  function incidentesPorFiltro(incidentsEnriched, regiaoFiltro) {
    if (!regiaoFiltro || regiaoFiltro === 'TODAS') return incidentsEnriched;
    return incidentsEnriched.filter(function (inc) {
      var r = inc.regiao || 'OTHERS';
      return r === regiaoFiltro || r === 'OTHERS';
    });
  }
  function cidadeDe(cidadeUf) {
    if (!cidadeUf) return null;
    var parte = cidadeUf.split('/')[0];
    parte = parte ? parte.trim() : '';
    return parte || null;
  }
  function validFor(map, enderecoId, siteId) {
    if (!map) return null;
    var k1 = up(enderecoId), k2 = up(siteId);
    return (k1 && map[k1]) || (k2 && map[k2]) || null;
  }

  // ---- IDs presentes em tasks/incidents para o lookupCities ----
  function collectIds(tasks, incidents) {
    var set = {};
    (tasks || []).forEach(function (t) {
      if (t.enderecoId) set[up(t.enderecoId)] = true;
      if (t.siteId) set[up(t.siteId)] = true;
    });
    (incidents || []).forEach(function (r) {
      if (r.enderecoId) set[up(r.enderecoId)] = true;
      if (r.site) set[up(r.site)] = true;
    });
    return Object.keys(set);
  }

  // ---- Enriquecimento de TASKS (regiao/cidade/SLA) ----
  function enrichTasks(rawTasks, validMap, prazoMap, now) {
    now = now || new Date();
    return (rawTasks || []).map(function (t) {
      var v = validFor(validMap, t.enderecoId, t.siteId);
      var regiao = D.determinarRegiao(t.filaAtual, t.microarea, v);
      var cidade = (v && v.cidade) || null;
      var sla = D.computeSla(t, prazoMap, now);
      var baseParaFim = D.parsePlatformDate(t.dataBase) || D.toDate(t.dataCriacao);
      var fimCalc = D.parsePlatformDate(t.fim, baseParaFim);

      // Para tarefas CANCELADAS (coluna N vazia), extrai a data de cancelamento
      // da primeira linha do texto do "Diário de Trabalho" (coluna BG), que
      // tem o formato "DD/MM/AAAA HH:MM:SS - ...". A primeira ocorrência é a
      // ação mais recente (o texto vem em ordem decrescente).
      var cancelacaoCalc = null;
      if (!fimCalc) {
        var bgTexto = (t.motivoCancelamento || '').toString();
        var mBg = bgTexto.match(/(\d{1,2}\/\d{2}\/\d{4}[ T]\d{1,2}:\d{2})/);
        if (mBg) cancelacaoCalc = D.parsePlatformDate(mBg[1]);
      }

      return Object.assign({}, t, {
        sequenciaId: t.sequenciaId === '' || t.sequenciaId == null ? null : Number(t.sequenciaId),
        regiao: regiao,
        cidade: cidade,
        fimCalc: fimCalc,
        cancelacaoCalc: cancelacaoCalc,
        vencimentoCalc: sla.vencimentoCalc,
        fonteSla: sla.fonteSla,
        statusSla: sla.statusSla
      });
    });
  }

  // ---- Enriquecimento de INCIDENTES vindos da planilha (so adiciona regiao) ----
  function enrichIncidents(rawIncidents, validMap) {
    return (rawIncidents || []).map(function (r) {
      var v = validFor(validMap, r.enderecoId, r.site);
      var regiao = D.determinarRegiao(null, null, v);
      return Object.assign({}, r, {
        qtdFurtos: Number(r.qtdFurtos || 0),
        qtdCelulas: Number(r.qtdCelulas || 0),
        regiao: regiao
      });
    });
  }

  // ---- Converte linhas do painel G.E.N.E.S.I.S em registros de incidente ----
  function derivarStatusTrat(r) {
    var ev = (r.statusEvento || '').toLowerCase();
    if (ev && ev !== 'não iniciado' && ev !== 'nao iniciado') return 'EM TRATAMENTO';
    if (r.previsao || r.causa) return 'EM TRATAMENTO';
    return 'ATIVO';
  }

  // Remove o trecho de alarme EVE que o Genesis JavaScript appenda ao campo detalhe (td9).
  // IMPORTANTE: esta função roda APÓS corrigirAcentos, portanto o texto já
  // está devidamente acentuado e os padrões de alarme são reconhecíveis.
  function limparDetalheGenesis(texto) {
    if (!texto) return null;
    var t = texto;

    // 1. Remove "Última atualização do evento: ..."
    t = t.replace(/\n?[Úû][lú]?ltima\s+atualiza[çã][oã]?\s+do\s+evento[\s\S]*$/i, '').trim();

    // 2. Remove bloco EVE: " | ... | Nome da BSC:" (inclui falha-type antes)
    t = t.replace(/\s*(?:\|[^|\n]*)*\|\s*[^|\n]*Nome\s+da\s+BSC:[\s\S]*/i, '').trim();
    t = t.replace(/\s*\|\s*-?NE:\s*[\s\S]*/i, '').trim();
    t = t.replace(/\s*\|\s*Subrack\s+No[\s\S]*/i, '').trim();
    t = t.replace(/\s*\|\s*AdditionalInfo:[\s\S]*/i, '').trim();
    t = t.replace(/\s*\|\s*Raio-X:[\s\S]*/i, '').trim();
    // tipo de falha isolado no final: "| Climatização" ou "| Tx Terceira"
    t = t.replace(/\s*\|\s*[A-ZÀÁÂÃÇÉÍÓÚÜ][a-zàáâãçéíóúü]{3,}[^|]*$/, '').trim();

    // 3. Se o restante é puro alarme EVE → descartar
    var temTecnico = /[Tt][eé][cn]/i.test(t) || /GMG\b/i.test(t) || /TSK\d/i.test(t) ||
                     /\b(acion|verific|resfri|abastec|deslig|local|ciente|FMMT)/i.test(t) ||
                     /^[\d]{2}\/[\d]{2}/.test(t.trim());
    var ehEvePuro = /^(Indisponibilidade\s+(Total|Parcial)|N[ãa]o\s+Classificado|Tx\s+Terceira|Climatiza|Energia\s+AC|Predicao|Predi[çã]ao|\*\*\*ALARME)/i.test(t.trim());
    if (ehEvePuro && !temTecnico) return null;

    return t.trim() || null;
  }

  // Extrai o timestamp de última atualização inserido pelos operadores no final
  // do campo detalhe do GENESIS, no formato "- DD/MM/YY HH:MM" ou "- DD/MM/YYYY HH:MM".
  function extrairTimestampDetalheGenesis(texto) {
    if (!texto) return null;
    var m = texto.match(/[-–]\s*(\d{1,2}\/\d{2}\/\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*$/);
    if (!m) return null;
    var p = m[1].trim().match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!p) return null;
    var a = +p[3]; if (a < 100) a += 2000;
    var dt = new Date(a, +p[2]-1, +p[1], +p[4], +p[5], p[6]?+p[6]:0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function genesisToIncidents(genesisRows, validMap) {
    var base = new Date();
    return (genesisRows || []).map(function (r) {
      var site0 = D.corrigirAcentos(r.site);
      var causa0 = D.corrigirAcentos(r.causa);
      var detalheRaw = D.corrigirAcentos(r.detalhe);
      var ultimaAtGenesis = extrairTimestampDetalheGenesis(detalheRaw);
      var detalhe0 = limparDetalheGenesis(detalheRaw);
      var alarme0 = D.corrigirAcentos(r.alarme);
      var infra0 = D.corrigirAcentos(r.infra);
      var cidadeUf0 = D.corrigirAcentos(r.cidadeUf);
      var previsao0 = D.corrigirAcentos(r.previsao);
      var statusEvento0 = D.corrigirAcentos(r.statusEvento);
      var v = validFor(validMap, r.enderecoId, site0);
      var cidade = (v && v.cidade) || cidadeDe(cidadeUf0);
      var anf = r.anf || null;
      var horarioDt = G.horarioDtDeDowntime(r.downtime, base) || D.parsePlatformDate(r.horario, base);
      var obs = [r.eve ? ('EVE ' + r.eve) : null, alarme0 ? ('Alarme: ' + alarme0) : null].filter(Boolean).join(' | ') || null;
      return {
        site: site0 || null,
        horario: r.horario || null,
        horarioDt: horarioDt ? horarioDt.toISOString() : null,
        downtime: r.downtime || null,
        gsbi: r.gsbi || null,
        qtdFurtos: r.qtdFurtos || 0,
        qtdCelulas: r.qtdCelulas || 0,
        tecnologia: r.tecnologia || null,
        enderecoId: r.enderecoId || null,
        anf: anf,
        cidadeUf: cidadeUf0 || null,
        cidade: cidade || null,
        infra: infra0 || null,
        statusEvento: statusEvento0 || null,
        previsao: previsao0 || null,
        causa: causa0 || null,
        causaGrupo: D.agruparCausa(causa0),
        detalhe: detalhe0 || null,
        obs: obs,
        tsk: null,
        ultimaAtGenesis: ultimaAtGenesis ? ultimaAtGenesis.toISOString() : null,
        statusTrat: derivarStatusTrat(r)
      };
    });
  }

  // ===================== DASHBOARD =====================
  function dashboard(tasksEnriched, incidentsEnriched, filtros) {
    filtros = filtros || {};
    var now = Date.now();
    var regiaoFiltro = filtros.regiao || 'TODAS';
    var prioFiltros = filtros.prioridades && filtros.prioridades.length ? filtros.prioridades
      : (filtros.prioridade && filtros.prioridade !== 'TODAS' ? [filtros.prioridade] : []);

    var tasks = tasksEnriched.filter(function (t) {
      if (regiaoFiltro !== 'TODAS' && (t.regiao || 'OTHERS') !== regiaoFiltro) return false;
      if (prioFiltros.length && prioFiltros.indexOf(up(t.prioridade)) < 0) return false;
      return true;
    });

    var sep = D.separarTicketsManuais(tasks);
    var tickets = sep.tickets, manuais = sep.manuais;

    // Regra de negócio: Backlog Geral e Aging consideram somente "Não Iniciado" e "Iniciado".
    // PENDENTE fica fora da contabilização principal (continua visível em SLA por Região,
    // drills detalhados e outras visualizações via isBacklogStatus / isBacklogSimples).
    //
    // IMPORTANTE: Deduplicar por TSK (maior sequenciaId = row mais recente) ANTES de filtrar.
    // Sem isso, um chamado com rows antigos "Iniciado" e row novo "Concluída" apareceria
    // no Prazos a Vencer pois o row antigo passaria pelo filtro de status.
    var _s = function (t) { var s = (t.status || '').toString().trim().toUpperCase(); return s; };
    var ticketsDedup = D.dedupPorTsk(tickets); // um row por TSK (o de maior sequenciaId)
    var backlog = ticketsDedup.filter(function (t) {
      var s = _s(t);
      return (s === 'NÃO INICIADO' || s === 'NAO INICIADO' || s === 'INICIADO') && !!t.dataCriacaoAS;
    });

    // Separa CONCLUIDA de CANCELADA — o VBA só conta SLA para CONCLUIDA.
    // CANCELADA corretiva (por automação ou por associação) aparece no donut
    // de Atividades Manuais, não no cálculo Dentro/Fora do SLA.
    var concluidas = tickets.filter(function (t) {
      var s = (t.status || '').toUpperCase().trim();
      return s === 'CONCLUÍDA' || s === 'CONCLUIDA';
    });
    var canceladasCorretivas = tickets.filter(function (t) {
      var s = (t.status || '').toUpperCase().trim();
      return s === 'CANCELADA' || s === 'CANCELADO';
    });

    var fora = backlog.filter(function (t) { return t.statusSla === 'FORA DO SLA'; });
    var dentro = backlog.filter(function (t) { return t.statusSla === 'DENTRO DO SLA'; });
    // Backlog Indefinido = sem prazo definido (INDEFINIDO/SEM DADOS) OU prazo calculado
    // pelo sistema (SLA CAL = coluna U vazia, prazo estimado por prioridade).
    // A coluna U vazia indica que não há SLA formal registrado → indefinido para a gestão.
    var indef = backlog.filter(function (t) {
      return t.statusSla === 'INDEFINIDO' || t.fonteSla === 'SEM DADOS' || t.fonteSla === 'SLA CAL';
    });
    var preditiva = tickets.filter(function (t) { return t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA'; });

    function encerradaDentro(t) {
      if (!t.fimCalc || !t.vencimentoCalc) return null;
      return new Date(t.fimCalc).getTime() <= new Date(t.vencimentoCalc).getTime();
    }
    var encDentro = 0, encFora = 0;
    concluidas.forEach(function (t) { var r = encerradaDentro(t); if (r === true) encDentro++; else if (r === false) encFora++; });
    var baseEnc = encDentro + encFora;
    var slaGeral;
    if (baseEnc > 0) slaGeral = Math.round((encDentro / baseEnc) * 1000) / 10;
    else { var baseBl = dentro.length + fora.length; slaGeral = baseBl > 0 ? Math.round((dentro.length / baseBl) * 1000) / 10 : 0; }

    var kpis = {
      foraSla: fora.length, backlogTotal: backlog.length, backlogIndef: indef.length,
      preditiva: preditiva.length, produtividade: concluidas.length, slaGeral: slaGeral
    };

    // Aging — backlog já é filtrado para tasks com dataCriacaoAS (regra de negócio).
    var agingCount = C.AGING_BUCKETS.map(function () { return 0; });
    backlog.forEach(function (t) {
      // dataCriacaoAS é garantido pelo filtro de backlog acima
      var _agingDt = (t.dataCriacaoAS instanceof Date) ? t.dataCriacaoAS
                   : D.parsePlatformDate(t.dataCriacaoAS);
      if (!_agingDt || isNaN(_agingDt.getTime())) return; // anomalia extrema → ignora
      var idade = Math.round((now - _agingDt.getTime()) / 60000);
      var idx = C.AGING_BUCKETS.findIndex(function (b) { return idade >= b.min && idade < b.max; });
      if (idx >= 0) agingCount[idx]++;
    });
    var aging = C.AGING_BUCKETS.map(function (b, i) { return { label: b.label, total: agingCount[i], cor: C.AGING_CORES[i] }; });

    // Vencimento — mesmo recorte do painel original: só considera tickets
    // "dentro do SLA" que vencem dentro de 6h30 (390min) a partir de agora.
    // Sem esse limite, a faixa "> 6h" acumularia todo o backlog futuro
    // (mesmo prazos de dias/semanas), em vez de só o que está prestes a vencer.
    var LIMITE_VENCIMENTO_MIN = 390;
    var vencCount = C.VENCIMENTO_BUCKETS.map(function () { return 0; });
    dentro.forEach(function (t) {
      if (!t.vencimentoCalc) return;
      var rest = Math.round((new Date(t.vencimentoCalc).getTime() - now) / 60000);
      if (rest < 0 || rest > LIMITE_VENCIMENTO_MIN) return;
      var idx = C.VENCIMENTO_BUCKETS.findIndex(function (b) { return rest >= b.min && rest < b.max; });
      if (idx >= 0) vencCount[idx]++;
    });
    var prazosVencimento = C.VENCIMENTO_BUCKETS.map(function (b, i) { return { label: b.label, total: vencCount[i], cor: b.cor }; });

    // Incidentes filtrados pela região selecionada — mas "OTHERS" (sem
    // cadastro) continua sempre visível em qualquer filtro, pra não perder
    // de vista o que falta cadastrar.
    var incFiltrados = incidentesPorFiltro(incidentsEnriched, regiaoFiltro);

    // Sites fora por regiao (incidentes ativos)
    var sfRegMap = {};
    incFiltrados.forEach(function (inc) {
      if (up(inc.statusTrat) === 'RESOLVIDO') return;
      var reg = inc.regiao || 'OTHERS';
      sfRegMap[reg] = (sfRegMap[reg] || 0) + 1;
    });
    var sitesForaRegiao = C.REGIOES.map(function (r) { return { regiao: r, label: C.REGIAO_LABELS[r] || r, total: sfRegMap[r] || 0 }; })
      .filter(function (x) { return x.total > 0; });

    // SLA por regiao (backlog)
    var slaRegMap = {};
    backlog.forEach(function (t) {
      var r = t.regiao || 'OTHERS';
      if (!slaRegMap[r]) slaRegMap[r] = { dentro: 0, fora: 0 };
      if (t.statusSla === 'FORA DO SLA') slaRegMap[r].fora++;
      else if (t.statusSla === 'DENTRO DO SLA') slaRegMap[r].dentro++;
    });
    var slaPorRegiao = C.REGIOES.map(function (r) { return { regiao: r, label: C.REGIAO_LABELS[r] || r, dentro: (slaRegMap[r] && slaRegMap[r].dentro) || 0, fora: (slaRegMap[r] && slaRegMap[r].fora) || 0 }; })
      .filter(function (x) { return x.dentro + x.fora > 0; });

    // Atividades manuais + canceladas corretivas
    // Canceladas corretivas (BG = motivo): "ASSOCIAÇÃO DE ATIVIDADES" = por associação (não-auto); demais = automação.
    var wo = 0, prev = 0, conj = 0, outras = 0, cancelAuto = 0, cancelAssoc = 0;
    manuais.forEach(function (t) {
      switch (D.categoriaManual(t.tipoAtividade)) {
        case 'prev': prev++; break; case 'conj': conj++; break; case 'wo': wo++; break; default: outras++;
      }
    });
    canceladasCorretivas.forEach(function (t) {
      var motivo = (t.motivoCancelamento || '').toString().toUpperCase();
      if (motivo.indexOf('ASSOCIA') >= 0) cancelAssoc++;
      else cancelAuto++;
    });
    var atividadesManuais = [
      { name: 'Atividade WO', value: wo },
      { name: 'Atividade Preventiva', value: prev },
      { name: 'Atividade Conjunta', value: conj },
      { name: 'Cancel. Automação', value: cancelAuto },
      { name: 'Cancel. Associação', value: cancelAssoc },
      { name: 'Outras', value: outras }
    ].filter(function (x) { return x.value > 0; });

    // Produtividade — encerradas (corretiva), separadas em Dentro/Fora do SLA;
    // as PREDITIVAS encerradas contam à parte (não fazem sentido como
    // "dentro/fora do SLA reativo"), mas continuam somando no total geral.
    var prod = { Geral: { dentro: 0, fora: 0, preditiva: 0 }, CCI: { dentro: 0, fora: 0, preditiva: 0 }, Campo: { dentro: 0, fora: 0, preditiva: 0 } };
    var prodEncDentro = 0, prodEncFora = 0, prodEncPreditiva = 0;
    concluidas.forEach(function (t) {
      var cat = D.classificarCciCampo(t.filaAtual);
      if (t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA') {
        prodEncPreditiva++; prod.Geral.preditiva++; prod[cat].preditiva++;
        return;
      }
      var r = encerradaDentro(t); if (r === null) return;
      if (r) { prodEncDentro++; prod.Geral.dentro++; prod[cat].dentro++; }
      else { prodEncFora++; prod.Geral.fora++; prod[cat].fora++; }
    });
    var produtividade = ['Geral', 'CCI', 'Campo'].map(function (c) { return { categoria: c, dentro: prod[c].dentro, fora: prod[c].fora, preditiva: prod[c].preditiva }; });

    // Top cidades (incidentes ativos, já filtrados pela região — OTHERS sempre visível)
    var ativos = incFiltrados.filter(function (i) { return up(i.statusTrat) !== 'RESOLVIDO'; });
    var totalSitesFora = ativos.length;
    var anfMap = {}; C.ANF_LIST.forEach(function (a) { anfMap[a] = 0; });
    var cidMap = {};
    ativos.forEach(function (inc) {
      var anf = (inc.anf || '').toString().trim();
      if (anf in anfMap) anfMap[anf]++;
      var cid = up(inc.cidade) || 'N/D';
      cidMap[cid] = (cidMap[cid] || 0) + 1;
    });
    var porAnf = C.ANF_LIST.map(function (a) {
      return { anf: 'ANF ' + a, anfRaw: a, total: anfMap[a], pct: totalSitesFora > 0 ? Math.round((anfMap[a] / totalSitesFora) * 1000) / 10 : 0 };
    });
    var maxCid = Math.max.apply(null, [1].concat(Object.keys(cidMap).map(function (k) { return cidMap[k]; })));
    var cidades = Object.keys(cidMap).map(function (cidade) { return { cidade: cidade, total: cidMap[cidade], pct: Math.round((cidMap[cidade] / maxCid) * 100) }; })
      .sort(function (a, b) { return b.total - a.total; }).slice(0, 25);

    return {
      kpis: kpis, aging: aging, prazosVencimento: prazosVencimento, sitesForaRegiao: sitesForaRegiao,
      slaPorRegiao: slaPorRegiao, atividadesManuais: atividadesManuais, produtividade: produtividade,
      topCidades: { totalSitesFora: totalSitesFora, porAnf: porAnf, cidades: cidades },
      atualizadoEm: new Date().toISOString()
    };
  }

  // ===================== SLA (pagina) =====================
  function slaPage(tasksEnriched, prazoMap) {
    var tasks = D.dedupPorTsk(tasksEnriched).filter(function (t) { return D.isTicketCorretiva(t.tipoAtividade); });
    function aderencia(list) {
      var fora = list.filter(function (t) { return t.statusSla === 'FORA DO SLA'; }).length;
      var dentro = list.filter(function (t) { return t.statusSla === 'DENTRO DO SLA'; }).length;
      var aval = fora + dentro;
      return { fora: fora, dentro: dentro, aval: aval, pct: aval > 0 ? Math.round((dentro / aval) * 1000) / 10 : 0 };
    }
    var porPrioridade = C.PRIORIDADES.map(function (p) {
      var list = tasks.filter(function (t) { return up(t.prioridade) === p; });
      var a = aderencia(list);
      return Object.assign({ prioridade: p, prazoHoras: prazoMap[p], total: list.length }, a);
    });
    var porRegiao = C.REGIOES.map(function (r) {
      var list = tasks.filter(function (t) { return (t.regiao || 'OTHERS') === r; });
      var a = aderencia(list);
      return Object.assign({ regiao: r, label: C.REGIAO_LABELS[r] || r, total: list.length }, a);
    }).filter(function (x) { return x.total > 0; });
    var geral = aderencia(tasks);
    return { porPrioridade: porPrioridade, porRegiao: porRegiao, geral: geral, prazoMap: prazoMap };
  }

  // ===================== REGIONAL (pagina) =====================
  function isBacklogSimples(status) {
    var s = up(status);
    // Somente Não Iniciado e Iniciado — mesmo critério do Backlog Total e Aging.
    // Pendente fica fora da contabilização principal de SLA.
    return s === 'NÃO INICIADO' || s === 'NAO INICIADO' || s === 'INICIADO';
  }
  function regionalPage(tasksEnriched) {
    var tasks = D.dedupPorTsk(tasksEnriched).filter(function (t) { return D.isTicketCorretiva(t.tipoAtividade); });
    var resumo = C.REGIOES.map(function (r) {
      var list = tasks.filter(function (t) { return (t.regiao || 'OTHERS') === r; });
      var backlog = list.filter(function (t) { return isBacklogSimples(t.status); });
      var fora = list.filter(function (t) { return t.statusSla === 'FORA DO SLA'; }).length;
      var dentro = list.filter(function (t) { return t.statusSla === 'DENTRO DO SLA'; }).length;
      var aval = fora + dentro;
      return {
        regiao: r, label: C.REGIAO_LABELS[r] || r, total: list.length, backlog: backlog.length,
        foraSla: fora, dentroSla: dentro, aderencia: aval > 0 ? Math.round((dentro / aval) * 1000) / 10 : 0
      };
    }).filter(function (x) { return x.total > 0; });
    return { resumo: resumo };
  }

  // ===================== INCIDENTES (pagina) =====================
  var LIMIAR_MASSIVA = 4;
  function incidentsPage(incidentsEnriched, filtros) {
    filtros = filtros || {};
    var status = filtros.status || '';
    var anf = filtros.anf || '';
    var q = (filtros.q || '').trim().toUpperCase();

    var rows = incidentsEnriched.filter(function (r) {
      if (status && status !== 'TODAS' && up(r.statusTrat) !== up(status)) return false;
      if (anf && anf !== 'TODAS' && (r.anf || '').toString().trim() !== anf) return false;
      if (q) {
        var hay = ((r.site || '') + ' ' + (r.enderecoId || '') + ' ' + (r.cidade || '') + ' ' + (r.causa || '')).toUpperCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) {
      var ta = a.horarioDt ? new Date(a.horarioDt).getTime() : 0;
      var tb = b.horarioDt ? new Date(b.horarioDt).getTime() : 0;
      return tb - ta;
    });

    // Massivas (todos ativos, ignora filtros)
    var todos = incidentsEnriched.filter(function (r) { return up(r.statusTrat) !== 'RESOLVIDO'; });
    var anfAtivos = {};
    todos.forEach(function (t) {
      var a = (t.anf || '').toString().trim() || 'N/D';
      if (!anfAtivos[a]) anfAtivos[a] = { sites: 0, cidades: {} };
      anfAtivos[a].sites++;
      var cid = (t.cidade || t.cidadeUf || 'N/D').toString();
      anfAtivos[a].cidades[cid] = (anfAtivos[a].cidades[cid] || 0) + 1;
    });
    var massivas = Object.keys(anfAtivos).filter(function (a) { return a !== 'N/D' && anfAtivos[a].sites >= LIMIAR_MASSIVA; })
      .map(function (a) {
        var v = anfAtivos[a];
        return {
          anf: a, label: C.ANF_LABELS[a] || ('ANF ' + a), total: v.sites,
          cidades: Object.keys(v.cidades).map(function (cidade) { return { cidade: cidade, qtd: v.cidades[cidade] }; }).sort(function (x, y) { return y.qtd - x.qtd; })
        };
      }).sort(function (x, y) { return y.total - x.total; });
    var anfsMassivas = {}; massivas.forEach(function (m) { anfsMassivas[m.anf] = true; });
    var rowsComFlag = rows.map(function (r) {
      return Object.assign({}, r, { emMassiva: up(r.statusTrat) !== 'RESOLVIDO' && !!anfsMassivas[(r.anf || '').toString().trim()] });
    });

    var porAnf = {}, porCausa = {}, porGsbi = {}, furtos = 0, celulas = 0;
    rows.forEach(function (r) {
      porAnf[r.anf || 'N/D'] = (porAnf[r.anf || 'N/D'] || 0) + 1;
      porCausa[r.causaGrupo || 'Outros'] = (porCausa[r.causaGrupo || 'Outros'] || 0) + 1;
      porGsbi[r.gsbi || 'N/D'] = (porGsbi[r.gsbi || 'N/D'] || 0) + 1;
      furtos += Number(r.qtdFurtos || 0); celulas += Number(r.qtdCelulas || 0);
    });
    function toArr(o) { return Object.keys(o).map(function (k) { return { name: k, value: o[k] }; }); }

    return {
      rows: rowsComFlag, total: rows.length, massivas: massivas, limiarMassiva: LIMIAR_MASSIVA,
      resumo: {
        ativos: rows.filter(function (r) { return up(r.statusTrat) === 'ATIVO'; }).length,
        emTratamento: rows.filter(function (r) { return up(r.statusTrat) === 'EM TRATAMENTO'; }).length,
        resolvidos: rows.filter(function (r) { return up(r.statusTrat) === 'RESOLVIDO'; }).length,
        furtos: furtos, celulas: celulas, massivasCount: massivas.length,
        porAnf: toArr(porAnf), porCausa: toArr(porCausa), porGsbi: toArr(porGsbi)
      }
    };
  }

  // ===================== DRILL (linhas detalhadas) =====================
  // Retorna a lista de tasks (corretiva) que atende ao tipo de drill.
  function drillTasks(tasksEnriched, spec, filtros) {
    filtros = filtros || {};
    var tasks = tasksEnriched.filter(function (t) {
      if (filtros.regiao && filtros.regiao !== 'TODAS' && (t.regiao || 'OTHERS') !== filtros.regiao) return false;
      var _pf = filtros.prioridades && filtros.prioridades.length ? filtros.prioridades
        : (filtros.prioridade && filtros.prioridade !== 'TODAS' ? [filtros.prioridade] : []);
      if (_pf.length && _pf.indexOf(up(t.prioridade)) < 0) return false;
      return true;
    });
    var sep = D.separarTicketsManuais(tasks);
    var tickets = sep.tickets, manuais = sep.manuais;
    // Backlog contável = Corretiva + Não Iniciado/Iniciado (sem Pendente, mesma regra do dashboard)
    var backlog = tickets.filter(function (t) {
      var s = (t.status || '').toString().trim().toUpperCase();
      return s === 'NÃO INICIADO' || s === 'NAO INICIADO' || s === 'INICIADO';
    });
    var concluidas = tickets.filter(function (t) {
      var s = (t.status || '').toUpperCase().trim();
      return s === 'CONCLUÍDA' || s === 'CONCLUIDA';
    });
    function encDentro(t) { if (!t.fimCalc || !t.vencimentoCalc) return null; return new Date(t.fimCalc).getTime() <= new Date(t.vencimentoCalc).getTime(); }
    var now = Date.now();
    var tipo = spec.tipo, arg = spec.arg;

    // Prioridade numérica pra ordenação (P1=1 … P5=5, sem prioridade = 999)
    function priNum(t) { var m = (t.prioridade || '').match(/\d+/); return m ? parseInt(m[0], 10) : 999; }

    // helper de ordenação: por região, depois P1→P5
    function sortRegiaoP(arr) {
      var regiaoOrder = C.REGIOES || [];
      function priNum(t) { var m = (t.prioridade || '').match(/\d+/); return m ? parseInt(m[0], 10) : 999; }
      function regIdx(t) { var i = regiaoOrder.indexOf(t.regiao || 'OTHERS'); return i >= 0 ? i : 999; }
      return arr.slice().sort(function (a, b) {
        var dr = regIdx(a) - regIdx(b); if (dr !== 0) return dr;
        return priNum(a) - priNum(b);
      });
    }

    switch (tipo) {
      case 'foraSla': return sortRegiaoP(backlog.filter(function (t) { return t.statusSla === 'FORA DO SLA'; }));
      case 'backlogTotal': return sortRegiaoP(backlog);
      case 'backlogIndef': return sortRegiaoP(backlog.filter(function (t) { return t.statusSla === 'INDEFINIDO' || t.fonteSla === 'SEM DADOS' || t.fonteSla === 'SLA CAL'; }));
      case 'preditiva': return tickets.filter(function (t) { return t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA'; });
      case 'produtividade': return concluidas;
      case 'aging': {
        var b = C.AGING_BUCKETS[parseInt(arg, 10)]; if (!b) return [];
        // Ordem crescente: tarefa mais antiga (menor dataCriacaoAS) primeiro
        return backlog.filter(function (t) {
          var _dt = (t.dataCriacaoAS instanceof Date) ? t.dataCriacaoAS : D.parsePlatformDate(t.dataCriacaoAS);
          if (!_dt || isNaN(_dt.getTime())) return false;
          var idade2 = Math.round((now - _dt.getTime()) / 60000);
          return idade2 >= b.min && idade2 < b.max;
        }).sort(function (a, b2) {
          // ascendente por data de criação = mais antiga primeiro
          function dtMs(x) {
            var _d = (x.dataCriacaoAS instanceof Date) ? x.dataCriacaoAS : D.parsePlatformDate(x.dataCriacaoAS);
            return (_d && !isNaN(_d.getTime())) ? _d.getTime() : 0;
          }
          return dtMs(a) - dtMs(b2);
        });
      }
      case 'vencimento': {
        var vb = C.VENCIMENTO_BUCKETS[parseInt(arg, 10)]; if (!vb) return [];
        return backlog.filter(function (t) {
          if (t.statusSla !== 'DENTRO DO SLA' || !t.vencimentoCalc) return false;
          var rest = Math.round((new Date(t.vencimentoCalc).getTime() - now) / 60000);
          return rest >= 0 && rest >= vb.min && rest < vb.max;
        }).sort(function (a, b2) {
          var ra = a.regiao || 'OTHERS', rb = b2.regiao || 'OTHERS';
          if (ra !== rb) return ra.localeCompare(rb);
          return priNum(a) - priNum(b2);
        });
      }
      case 'slaRegiao': {
        var parts = (arg || '').split('|'); var reg = parts[0]; var lado = parts[1];
        return backlog.filter(function (t) {
          return (t.regiao || 'OTHERS') === reg && t.statusSla === (lado === 'fora' ? 'FORA DO SLA' : 'DENTRO DO SLA');
        }).sort(function (a, b2) { return priNum(a) - priNum(b2); });
      }
      case 'regiaoBacklog': return backlog.filter(function (t) { return (t.regiao || 'OTHERS') === arg; });
      case 'regiaoTotal': return tickets.filter(function (t) { return (t.regiao || 'OTHERS') === arg; });
      case 'regiaoSla': {
        var p2 = (arg || '').split('|'); var reg2 = p2[0]; var lado2 = p2[1];
        return tickets.filter(function (t) {
          return (t.regiao || 'OTHERS') === reg2 && t.statusSla === (lado2 === 'fora' ? 'FORA DO SLA' : 'DENTRO DO SLA');
        }).sort(function (a, b2) { return priNum(a) - priNum(b2); });
      }
      case 'prioridadeSla': {
        var p3 = (arg || '').split('|'); var prio = p3[0]; var lado3 = p3[1];
        var list = D.dedupPorTsk(tickets).filter(function (t) { return up(t.prioridade) === prio; });
        if (!lado3) return list.filter(function (t) { return t.statusSla === 'DENTRO DO SLA' || t.statusSla === 'FORA DO SLA'; });
        return list.filter(function (t) { return t.statusSla === (lado3 === 'fora' ? 'FORA DO SLA' : 'DENTRO DO SLA'); });
      }
      case 'atividades': return manuais.filter(function (t) { return D.categoriaManual(t.tipoAtividade) === arg; });
      case 'cancelCorretiva': {
        var canceladasDrill = tickets.filter(function (t) {
          var s = (t.status || '').toUpperCase().trim();
          return s === 'CANCELADA' || s === 'CANCELADO';
        });
        return canceladasDrill.filter(function (t) {
          var motivo = (t.motivoCancelamento || '').toString().toUpperCase();
          var ehAssoc = motivo.indexOf('ASSOCIA') >= 0;
          return arg === 'assoc' ? ehAssoc : !ehAssoc;
        });
      }
      case 'produtividadeCat': {
        var p4 = (arg || '').split('|'); var cat = p4[0]; var lado4 = p4[1];
        return concluidas.filter(function (t) {
          if (cat !== 'Geral' && D.classificarCciCampo(t.filaAtual) !== cat) return false;
          var ehPreditiva = (t.statusSla === 'PREDITIVA' || t.fonteSla === 'PREDITIVA');
          if (lado4 === 'preditiva') return ehPreditiva;
          if (ehPreditiva) return false;
          var r = encDentro(t); if (r === null) return false;
          return lado4 === 'fora' ? r === false : r === true;
        });
      }
      default: return [];
    }
  }

  function drillIncidents(incidentsEnriched, spec) {
    var ativos = incidentsEnriched.filter(function (i) { return up(i.statusTrat) !== 'RESOLVIDO'; });
    var filtrado;
    if (spec.tipo === 'sitesFora') {
      // arg=null significa TODOS os incidentes ativos
      filtrado = spec.arg == null ? ativos : ativos.filter(function (i) { return (i.regiao || 'OTHERS') === spec.arg; });
    } else if (spec.tipo === 'sitesForaAgrupado') {
      filtrado = spec.arg == null ? agruparIncidentesPorEndId(ativos) :
        agruparIncidentesPorEndId(ativos.filter(function (i) { return (i.regiao || 'OTHERS') === spec.arg; }));
    } else if (spec.tipo === 'anf') filtrado = ativos.filter(function (i) { return (i.anf || '').toString().trim() === spec.arg; });
    else if (spec.tipo === 'cidade') filtrado = ativos.filter(function (i) { return up(i.cidade) === up(spec.arg); });
    else filtrado = [];
    return filtrado;
  }

  // ---- Agrupa incidentes com o mesmo END_ID em uma única linha ----
  // Mantém a ordem original dos sites (a página de origem já vem da mais
  // recente p/ mais antiga) e usa o horário MAIS ANTIGO do grupo — ou seja,
  // o momento em que a "primeira tecnologia" daquele END_ID caiu.
  function agruparIncidentesPorEndId(incidents) {
    var grupos = {}, ordem = [];
    (incidents || []).forEach(function (inc) {
      var key = (inc.enderecoId || '').toString().trim().toUpperCase();
      if (!key) { ordem.push([inc]); return; } // sem END_ID: não tem como agrupar, mantém como está
      if (!grupos[key]) { grupos[key] = []; ordem.push(grupos[key]); }
      grupos[key].push(inc);
    });
    return ordem.map(function (items) {
      if (items.length === 1) return items[0];
      var maisAntigo = items[0];
      for (var i = 1; i < items.length; i++) {
        var ta = maisAntigo.horarioDt ? new Date(maisAntigo.horarioDt).getTime() : Infinity;
        var tb = items[i].horarioDt ? new Date(items[i].horarioDt).getTime() : Infinity;
        if (tb < ta) maisAntigo = items[i];
      }
      var sites = [], tecs = [];
      items.forEach(function (it) {
        if (it.site && sites.indexOf(it.site) < 0) sites.push(it.site);
        if (it.tecnologia && tecs.indexOf(it.tecnologia) < 0) tecs.push(it.tecnologia);
      });
      return Object.assign({}, maisAntigo, {
        site: sites.join(', '),
        tecnologia: tecs.length ? tecs.join(', ') : maisAntigo.tecnologia,
        agrupado: true,
        qtdAgrupados: items.length
      });
    });
  }

  C2.collectIds = collectIds;
  C2.enrichTasks = enrichTasks;
  C2.enrichIncidents = enrichIncidents;
  C2.genesisToIncidents = genesisToIncidents;
  C2.dashboard = dashboard;
  C2.slaPage = slaPage;
  C2.regionalPage = regionalPage;
  C2.incidentsPage = incidentsPage;
  C2.drillTasks = drillTasks;
  C2.drillIncidents = drillIncidents;
  C2.agruparIncidentesPorEndId = agruparIncidentesPorEndId;
  TRJ.compute = C2;
})(window.TRJ = window.TRJ || {});
