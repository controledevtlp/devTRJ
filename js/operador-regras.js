/* =====================================================================
 * operador-regras.js — Regra criadora (coluna DJ da planilha de TSKs → campo isocDJ)
 * ---------------------------------------------------------------------
 * Separa a operação em MÓVEL e FIXA. Para mudar uma regra de lado, ou incluir uma nova,
 * basta editar as duas listas abaixo (um nome por linha, igual ao texto da coluna DJ).
 * A comparação ignora acentos, maiúsculas e espaços repetidos.
 * ===================================================================== */
(function (TRJ) {
  'use strict';
  var OP = TRJ.operador = TRJ.operador || {};

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
      'MABE - TLE'
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
      'ISOC SERVICOS FIXO PREMIUM CLASS',
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

  var tabela = null;   // [{ grupo, nome, key }]
  function build() {
    tabela = [];
    ['MOVEL', 'FIXA'].forEach(function (g) {
      OP.REGRAS[g].forEach(function (nome) {
        var k = norm(nome);
        if (!tabela.some(function (x) { return x.key === k; })) tabela.push({ grupo: g, nome: nome, key: k });
      });
    });
  }
  OP.regrasLista = function () { if (!tabela) build(); return tabela.slice(); };

  var cache = {};
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
