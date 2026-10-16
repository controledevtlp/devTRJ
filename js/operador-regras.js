/* =====================================================================
 * operador-regras.js — Regra criadora (coluna DJ da planilha de TSKs → campo isocDJ)
 * ---------------------------------------------------------------------
 * Separa a operação em MÓVEL e FIXA.
 *  • Padrão: as duas listas abaixo (um nome por linha, igual ao texto da coluna DJ).
 *  • Ajustes feitos na tela (mover uma regra de lado, incluir regra nova) ficam gravados NESTE
 *    navegador e valem por cima do padrão. Para valer para toda a equipe, repita o ajuste aqui.
 * A comparação ignora acentos, maiúsculas e espaços repetidos.
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var OP = TRJ.operador = TRJ.operador || {};
  var LS_KEY = 'trj_operador_regras_v1';

  OP.REGRAS = {
    MOVEL: [
      'ISOC MONITORACAO ACESSO',
      'ISOC MONITORACAO ACESSO FA',
      'ISOC SUPORTE ACESSO',
      'ISOC MONITORACAO ACESSO BA',
      'ISOC MONITORACAO ACESSO RS',
      'Regional TLE',
      'Regional TRJ',
      'MASSIVA EM ABERTO INFRACO',
      'MABE - TLE',
      'ISOC SERVICOS FIXO PREMIUM CLASS'
    ],
    FIXA: [
      'ISOC MONITORACAO TRANSPORTE DADOS',
      'ISOC MONITORACAO TRANSPORTE TX',
      'ISOC MONITORACAO TRANSPORTE LIVE',
      'ISOC SUPORTE TRANSPORTE TX',
      'LAYER TRANSPORTE OTIMIZAÇÃO',
      'LAYER TRANSPORTE SATELITE',
      'LAYER TRANSPORTE BACKHAUL',
      'LAYER TRANSPORTE BBIP',
      'DSOC B2B SERVICOS PREMIUM CLASS MASSIVAS',
      'BCC ONLINE',
      'BCC OFFLINE',
      'ISOC SERVICOS FIXO TRANSMISSAO',
      'ISOC SERVICOS FIXO DADOS E VOZ',
      'ISOC SERVICOS FIXO MASSIVAS',
      // Lista adicional informada sem categoria — assumida FIXA (transporte/backhaul). Ajuste aqui se for outra.
      'ISOC MONITORACAO SOM',
      'A&I_BACKHAUL TLE',
      'Metro & Regional End to End',
      'DSOC ANALISE CHANGE MANAGEMENT',
      'LAYER BACKHAUL TSP'
    ]
  };

  function norm(s) {
    return (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }
  OP.norm = norm;

  /* ---------- ajustes locais ---------- */
  var cfg = { mover: {}, extras: [] };
  try { var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (s) { cfg.mover = s.mover || {}; cfg.extras = s.extras || []; } } catch (e) {}
  function salvar() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} tabela = null; cache = {}; }

  var tabela = null;   // [{ grupo, nome, key, extra, movida }]
  var cache = {};
  function build() {
    tabela = [];
    function add(nome, grupoPadrao, extra) {
      var k = norm(nome);
      if (!k || tabela.some(function (x) { return x.key === k; })) return;
      var mv = cfg.mover[k];
      tabela.push({ grupo: mv || grupoPadrao, nome: nome, key: k, extra: !!extra, movida: !!mv && mv !== grupoPadrao });
    }
    ['MOVEL', 'FIXA'].forEach(function (g) { OP.REGRAS[g].forEach(function (n) { add(n, g, false); }); });
    cfg.extras.forEach(function (x) { add(x.nome, x.grupo, true); });
  }
  OP.regrasLista = function () { if (!tabela) build(); return tabela.slice(); };

  OP.mover = function (nome, grupo) {
    var k = norm(nome); if (!k) return;
    cfg.mover[k] = grupo === 'FIXA' ? 'FIXA' : 'MOVEL';
    // regra incluída pelo usuário: muda direto o grupo dela
    cfg.extras.forEach(function (x) { if (norm(x.nome) === k) x.grupo = cfg.mover[k]; });
    salvar();
  };
  OP.adicionar = function (nome, grupo) {
    nome = (nome || '').trim(); if (!nome) return false;
    var k = norm(nome);
    if (OP.regrasLista().some(function (x) { return x.key === k; })) { OP.mover(nome, grupo); return true; }   // já existe: só muda de lado
    cfg.extras.push({ nome: nome, grupo: grupo === 'FIXA' ? 'FIXA' : 'MOVEL' });
    salvar(); return true;
  };
  OP.remover = function (nome) {     // só regras incluídas pelo usuário
    var k = norm(nome);
    cfg.extras = cfg.extras.filter(function (x) { return norm(x.nome) !== k; });
    delete cfg.mover[k]; salvar();
  };
  OP.restaurarPadrao = function () { cfg = { mover: {}, extras: [] }; salvar(); };
  OP.temAjustes = function () { return !!(cfg.extras.length || Object.keys(cfg.mover).length); };

  /* → { grupo: 'MOVEL'|'FIXA'|null, nome: texto da regra (ou o próprio DJ se não reconhecida), dj: texto original } */
  OP.classificar = function (dj) {
    if (!tabela) build();
    var k = norm(dj);
    if (cache[k]) return cache[k];
    var res = { grupo: null, nome: (dj == null ? '' : String(dj).trim()), dj: dj || '' };
    if (k) {
      var exato = tabela.filter(function (x) { return x.key === k; })[0];
      if (exato) res = { grupo: exato.grupo, nome: exato.nome, dj: dj };
      else {
        // a coluna DJ pode vir com complemento: usa a regra conhecida mais longa contida no texto
        var cont = tabela.filter(function (x) { return k.indexOf(x.key) >= 0; })
          .sort(function (a, b) { return b.key.length - a.key.length; })[0];
        if (cont) res = { grupo: cont.grupo, nome: cont.nome, dj: dj };
      }
    }
    cache[k] = res;
    return res;
  };
})(window.TRJ = window.TRJ || {});
