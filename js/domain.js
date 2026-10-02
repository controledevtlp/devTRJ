/* Logica de dominio TRJ (portado de lib/domain/*.ts) */
(function (TRJ) {
  var C = TRJ.constants;
  var D = {};

  function up(s) { return (s == null ? '' : s).toString().toUpperCase().trim(); }
  function normalize(s) {
    return (s == null ? '' : s).toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // ===================== CORREÇÃO DE ACENTOS BAGUNÇADOS (mojibake) =====================
  // O painel de origem às vezes entrega texto corrompido tipo "IntervenûÏûÈo"
  // em vez de "Intervenção". Isso é texto UTF-8 que foi mal-lido como a
  // codificação "HP Roman-8" (um charset antigo de impressoras/terminais HP)
  // em algum ponto da cadeia de origem. A correção é o caminho inverso:
  // reinterpreta cada caractere como um byte HP Roman-8 e decodifica o
  // resultado como UTF-8. Se o texto já estiver correto, o passo de
  // decodificação falha (não é uma sequência UTF-8 válida) e devolvemos o
  // texto original sem alterar nada — por isso é seguro aplicar sempre.
  var HP_ROMAN8_CHAR_TO_BYTE = {
    'À': 161, 'Â': 162, 'È': 163, 'Ê': 164, 'Ë': 165, 'Î': 166, 'Ï': 167, '´': 168, 'ˋ': 169, 'ˆ': 170,
    '¨': 171, '˜': 172, 'Ù': 173, 'Û': 174, '₤': 175, '¯': 176, 'Ý': 177, 'ý': 178, '°': 179, 'Ç': 180,
    'ç': 181, 'Ñ': 182, 'ñ': 183, '¡': 184, '¿': 185, '¤': 186, '£': 187, '¥': 188, '§': 189, 'ƒ': 190,
    '¢': 191, 'â': 192, 'ê': 193, 'ô': 194, 'û': 195, 'á': 196, 'é': 197, 'ó': 198, 'ú': 199, 'à': 200,
    'è': 201, 'ò': 202, 'ù': 203, 'ä': 204, 'ë': 205, 'ö': 206, 'ü': 207, 'Å': 208, 'î': 209, 'Ø': 210,
    'Æ': 211, 'å': 212, 'í': 213, 'ø': 214, 'æ': 215, 'Ä': 216, 'ì': 217, 'Ö': 218, 'Ü': 219, 'É': 220,
    'ï': 221, 'ß': 222, 'Ô': 223, 'Á': 224, 'Ã': 225, 'ã': 226, 'Ð': 227, 'ð': 228, 'Í': 229, 'Ì': 230,
    'Ó': 231, 'Ò': 232, 'Õ': 233, 'õ': 234, 'Š': 235, 'š': 236, 'Ú': 237, 'Ÿ': 238, 'ÿ': 239, 'Þ': 240,
    'þ': 241, '·': 242, 'µ': 243, '¶': 244, '¾': 245, '—': 246, '¼': 247, '½': 248, 'ª': 249, 'º': 250,
    '«': 251, '■': 252, '»': 253, '±': 254
  };
  var CP1253_CHAR_TO_BYTE = {
    '΅': 161, 'Ά': 162, '£': 163, '¤': 164, '¥': 165, '¦': 166, '§': 167, '¨': 168, '©': 169, '«': 171,
    '¬': 172, '­': 173, '®': 174, '―': 175, '°': 176, '±': 177, '²': 178, '³': 179, '΄': 180, 'µ': 181,
    '¶': 182, '·': 183, 'Έ': 184, 'Ή': 185, 'Ί': 186, '»': 187, 'Ό': 188, '½': 189, 'Ύ': 190, 'Ώ': 191,
    'ΐ': 192, 'Α': 193, 'Β': 194, 'Γ': 195, 'Δ': 196, 'Ε': 197, 'Ζ': 198, 'Η': 199, 'Θ': 200, 'Ι': 201,
    'Κ': 202, 'Λ': 203, 'Μ': 204, 'Ν': 205, 'Ξ': 206, 'Ο': 207, 'Π': 208, 'Ρ': 209, 'Σ': 211, 'Τ': 212,
    'Υ': 213, 'Φ': 214, 'Χ': 215, 'Ψ': 216, 'Ω': 217, 'Ϊ': 218, 'Ϋ': 219, 'ά': 220, 'έ': 221, 'ή': 222,
    'ί': 223, 'ΰ': 224, 'α': 225, 'β': 226, 'γ': 227, 'δ': 228, 'ε': 229, 'ζ': 230, 'η': 231, 'θ': 232,
    'ι': 233, 'κ': 234, 'λ': 235, 'μ': 236, 'ν': 237, 'ξ': 238, 'ο': 239, 'π': 240, 'ρ': 241, 'ς': 242,
    'σ': 243, 'τ': 244, 'υ': 245, 'φ': 246, 'χ': 247, 'ψ': 248, 'ω': 249, 'ϊ': 250, 'ϋ': 251, 'ό': 252,
    'ύ': 253, 'ώ': 254
  };

  // Mapeamento ISO-8859-10 → caractere UTF-8 correto.
  // Quando a Genesis page serve UTF-8 mas o browser interpreta os bytes de
  // continuação (0xA0-0xBF) usando ISO-8859-10 em vez de Latin-1, os
  // caracteres acentuados do português ficam corrompidos com este padrão:
  //   á (UTF-8: C3 A1) → "Ã" + "Ą" (U+0104, porque 0xA1 em ISO-8859-10 = Ą)
  //   ã (UTF-8: C3 A3) → "Ã" + "Ģ" (U+0122, porque 0xA3 em ISO-8859-10 = Ģ)
  //   ç (UTF-8: C3 A7) → "Ã" + "§" (U+00A7, § é igual em ISO-8859-10 e Latin-1)
  //   é (UTF-8: C3 A9) → "Ã" + "Đ" (U+0110, porque 0xA9 em ISO-8859-10 = Đ)
  // Mapeamento ISO-8859-2 → char UTF-8 correto (trigger = Ă U+0102).
  // O Genesis está a servir UTF-8 mas o browser interpreta 0xC3 como Ă (ISO-8859-2)
  // em vez de Ã (Latin-1/ISO-8859-10). Por isso "á" aparece como "ĂĄ", "ã" como "ĂŁ", etc.
  var ISO8859_2_C3_MAP = {
    // C1 range (0x80-0x9F) → maiúsculas acentuadas
    '\u0080':'À','\u0081':'Á','\u0082':'Â','\u0083':'Ã','\u0084':'Ä','\u0085':'Å',
    '\u0086':'Æ','\u0087':'Ç','\u0088':'È','\u0089':'É','\u008A':'Ê','\u008B':'Ë',
    '\u008C':'Ì','\u008D':'Í','\u008E':'Î','\u008F':'Ï','\u0090':'Ð','\u0091':'Ñ',
    '\u0092':'Ò','\u0093':'Ó','\u0094':'Ô','\u0095':'Õ','\u0096':'Ö','\u0097':'×',
    '\u0098':'Ø','\u0099':'Ù','\u009A':'Ú','\u009B':'Û','\u009C':'Ü','\u009D':'Ý',
    '\u009E':'Þ','\u009F':'ß',
    // 0xA0-0xBF → minúsculas e outros acentuados (mapeamento ISO-8859-2)
    '\u00A0':'à',  // 0xA0 NBSP   → à
    '\u0104':'á',  // 0xA1 Ą     → á
    '\u02D8':'â',  // 0xA2 ˘     → â
    '\u0141':'ã',  // 0xA3 Ł     → ã  ← chave: Ł ≠ Ģ (ISO-8859-10)
    '\u00A4':'ä',  // 0xA4 ¤     → ä
    '\u013D':'å',  // 0xA5 Ľ     → å
    '\u015A':'æ',  // 0xA6 Ś     → æ
    '\u00A7':'ç',  // 0xA7 §     → ç  (igual em ambos codecs)
    '\u00A8':'è',  // 0xA8 ¨     → è
    '\u0160':'é',  // 0xA9 Š     → é  ← chave: Š ≠ Đ (ISO-8859-10)
    '\u015E':'ê',  // 0xAA Ş     → ê
    '\u0164':'ë',  // 0xAB Ť     → ë
    '\u0179':'ì',  // 0xAC Ź     → ì
    '\u00AD':'í',  // 0xAD soft  → í  (igual)
    '\u017D':'î',  // 0xAE Ž     → î
    '\u017B':'ï',  // 0xAF Ż     → ï
    '\u00B0':'ð',  // 0xB0 °     → ð  (igual)
    '\u0105':'ñ',  // 0xB1 ą     → ñ  (igual)
    '\u02DB':'ò',  // 0xB2 ˛     → ò
    '\u0142':'ó',  // 0xB3 ł     → ó  ← chave: ł ≠ ģ (ISO-8859-10)
    '\u00B4':'ô',  // 0xB4 ´     → ô
    '\u013E':'õ',  // 0xB5 ľ     → õ
    '\u015B':'ö',  // 0xB6 ś     → ö
    '\u02C7':'÷',  // 0xB7 ˇ     → ÷
    '\u00B8':'ø',  // 0xB8 ¸     → ø
    '\u0161':'ù',  // 0xB9 š     → ù
    '\u015F':'ú',  // 0xBA ş     → ú
    '\u0165':'û',  // 0xBB ť     → û
    '\u017A':'ü',  // 0xBC ź     → ü
    '\u02DD':'ý',  // 0xBD ˝     → ý
    '\u017E':'þ',  // 0xBE ž     → þ  (igual)
    '\u017C':'ÿ'   // 0xBF ż     → ÿ
  };

  var ISO8859_10_C3_MAP = {
    // Range C1 (0x80-0x9F) — maiúsculas acentuadas (Á,Â,Ã,Ç,É,Ó,Ú,Ü,etc.)
    // UTF-8 [0xC3, 0x8X] lido como 'Ã' + char-controle U+008X/U+009X
    '\u0080': 'À',  // U+00C0
    '\u0081': 'Á',  // U+00C1
    '\u0082': 'Â',  // U+00C2
    '\u0083': 'Ã',  // U+00C3
    '\u0084': 'Ä',  // U+00C4
    '\u0085': 'Å',  // U+00C5
    '\u0086': 'Æ',  // U+00C6
    '\u0087': 'Ç',  // U+00C7
    '\u0088': 'È',  // U+00C8
    '\u0089': 'É',  // U+00C9
    '\u008A': 'Ê',  // U+00CA
    '\u008B': 'Ë',  // U+00CB
    '\u008C': 'Ì',  // U+00CC
    '\u008D': 'Í',  // U+00CD
    '\u008E': 'Î',  // U+00CE
    '\u008F': 'Ï',  // U+00CF
    '\u0090': 'Ð',  // U+00D0
    '\u0091': 'Ñ',  // U+00D1
    '\u0092': 'Ò',  // U+00D2
    '\u0093': 'Ó',  // U+00D3
    '\u0094': 'Ô',  // U+00D4
    '\u0095': 'Õ',  // U+00D5
    '\u0096': 'Ö',  // U+00D6
    '\u0097': '×',  // U+00D7
    '\u0098': 'Ø',  // U+00D8
    '\u0099': 'Ù',  // U+00D9
    '\u009A': 'Ú',  // U+00DA ← "Última" estava quebrando aqui
    '\u009B': 'Û',  // U+00DB
    '\u009C': 'Ü',  // U+00DC
    '\u009D': 'Ý',  // U+00DD
    '\u009E': 'Þ',  // U+00DE
    '\u009F': 'ß',  // U+00DF
    // Range 0xA0-0xBF — minúsculas/outros acentuados via ISO-8859-10
    '\u00A0': 'à',  // 0xA0 NBSP  → à
    '\u0104': 'á',  // 0xA1 Ą    → á
    '\u0112': 'â',  // 0xA2 Ē    → â
    '\u0122': 'ã',  // 0xA3 Ģ    → ã
    '\u012A': 'ä',  // 0xA4 Ī    → ä
    '\u0128': 'å',  // 0xA5 Ĩ    → å
    '\u0136': 'æ',  // 0xA6 Ķ    → æ
    '\u00A7': 'ç',  // 0xA7 §    → ç
    '\u013B': 'è',  // 0xA8 Ļ    → è
    '\u0110': 'é',  // 0xA9 Đ    → é
    '\u0160': 'ê',  // 0xAA Š    → ê
    '\u0166': 'ë',  // 0xAB Ŧ    → ë
    '\u017D': 'ì',  // 0xAC Ž    → ì
    '\u00AD': 'í',  // 0xAD soft hyphen → í
    '\u016A': 'î',  // 0xAE Ū    → î
    '\u014A': 'ï',  // 0xAF Ŋ    → ï
    '\u00B0': 'ð',  // 0xB0 °    → ð
    '\u0105': 'ñ',  // 0xB1 ą    → ñ
    '\u0113': 'ò',  // 0xB2 ē    → ò
    '\u0123': 'ó',  // 0xB3 ģ    → ó
    '\u012B': 'ô',  // 0xB4 ī    → ô
    '\u0129': 'õ',  // 0xB5 ĩ    → õ
    '\u0137': 'ö',  // 0xB6 ķ    → ö
    '\u013C': 'ø',  // 0xB8 ļ    → ø
    '\u0111': 'ù',  // 0xB9 đ    → ù
    '\u0161': 'ú',  // 0xBA š    → ú
    '\u0167': 'û',  // 0xBB ŧ    → û
    '\u017E': 'ü',  // 0xBC ž    → ü
    '\u2015': 'ý',  // 0xBD ―   → ý
    '\u016B': 'þ',  // 0xBE ū    → þ
    '\u014B': 'ÿ'   // 0xBF ŋ    → ÿ
  };

  var _decoderUtf8Strict = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8', { fatal: true }) : null;

  function corrigirAcentos(texto) {
    if (!texto || typeof texto !== 'string') return texto;

    // 1ª tentativa: ISO-8859-2 (trigger = Ă U+0102) — padrão atual do Genesis
    if (texto.indexOf('\u0102') >= 0) {
      var hasIso2 = false;
      for (var i2 = 0; i2 < texto.length - 1; i2++) {
        if (texto[i2] === '\u0102' && ISO8859_2_C3_MAP[texto[i2 + 1]] !== undefined) {
          hasIso2 = true; break;
        }
      }
      if (hasIso2) {
        return texto.replace(/\u0102(.)/g, function (m, c) {
          return ISO8859_2_C3_MAP[c] !== undefined ? ISO8859_2_C3_MAP[c] : m;
        });
      }
    }

    // 2ª tentativa: ISO-8859-10 (trigger = Ã U+00C3) — padrão anterior do Genesis
    if (texto.indexOf('Ã') >= 0) {
      var hasIso10 = false;
      for (var ci = 0; ci < texto.length - 1; ci++) {
        if (texto[ci] === 'Ã' && ISO8859_10_C3_MAP[texto[ci + 1]] !== undefined) {
          hasIso10 = true; break;
        }
      }
      if (hasIso10) {
        return texto.replace(/Ã(.)/g, function(m, c) {
          return ISO8859_10_C3_MAP[c] !== undefined ? ISO8859_10_C3_MAP[c] : m;
        });
      }
    }

    if (!_decoderUtf8Strict) return texto;

    // 3ª tentativa: UTF-8 lido como Latin-1 simples (0xC2/0xC3 + byte < 0xFF)
    var temMojibake = false;
    for (var mi = 0; mi < texto.length - 1; mi++) {
      var mc = texto.charCodeAt(mi);
      if ((mc === 0xC2 || mc === 0xC3) && texto.charCodeAt(mi + 1) >= 0x80 && texto.charCodeAt(mi + 1) <= 0xBF) {
        temMojibake = true; break;
      }
    }
    if (temMojibake) {
      var bytes = []; var todoLatin1 = true;
      for (var li = 0; li < texto.length; li++) {
        var lc = texto.charCodeAt(li);
        if (lc > 0xFF) { todoLatin1 = false; break; }
        bytes.push(lc);
      }
      if (todoLatin1) {
        try { return _decoderUtf8Strict.decode(new Uint8Array(bytes)); }
        catch (e) { /* não é UTF-8 válido */ }
      }
    }

    // 4ª tentativa: HP Roman-8
    // IMPORTANTE: inclui passthrough de C1 (0x80-0x9F) — quando o byte HP
    // Roman-8 original é 0xC3 (→'û') seguido de 0x89 (C1 control), o par
    // forma UTF-8 [0xC3,0x89] = 'É'. Sem o passthrough, tentarTabela
    // retornaria null ao encontrar chr(0x89) fora da tabela, e o texto
    // permaneceria corrompido (ex.: "TûC." em vez de "TÉC.").
    function tentarTabela(t, tabela, c1passthrough) {
      var bs = [], k, cod, b;
      for (k = 0; k < t.length; k++) {
        cod = t.charCodeAt(k);
        if (cod < 0x80) { bs.push(cod); continue; }
        if (c1passthrough && cod >= 0x80 && cod <= 0x9F) { bs.push(cod); continue; }
        b = tabela[t[k]];
        if (b == null) return null;
        bs.push(b);
      }
      try { return _decoderUtf8Strict.decode(new Uint8Array(bs)); }
      catch (e) { return null; }
    }
    var r1 = tentarTabela(texto, HP_ROMAN8_CHAR_TO_BYTE, true);  // c1passthrough=true
    if (r1 != null) return r1;

    // 5ª tentativa: CP1253 (Windows-1253 / Grego)
    var r2 = tentarTabela(texto, CP1253_CHAR_TO_BYTE, false);
    if (r2 != null) return r2;

    return texto;
  }
  D.corrigirAcentos = corrigirAcentos;

  // ===================== REGIAO (region.ts) =====================
  var CRITERIOS_FILA = {
    'TRJ-RJ-ZNO01-ANG01': 'INTERIOR',
    'TRJ-RJ-INT01-CBF01': 'INTERIOR',
    'TRJ-RJ-INT01-NFB03': 'INTERIOR',
    'TRJ-RJ-INT01-PET04': 'INTERIOR',
    'TRJ-RJ-INT01-VRD05': 'INTERIOR',
    'OPERADOR_CSM_FMT-RJ_INT_INT': 'INTERIOR',
    'TRJ-ES-EPS01-SMT02': 'ESPIRITO SANTO',
    'TRJ-ES-EPS01-CIM01': 'ESPIRITO SANTO',
    'TRJ-ES-EPS01-VIT03': 'ESPIRITO SANTO',
    'TRJ-RJ-INT01-CPS02': 'ESPIRITO SANTO',
    'OPERADOR_CSM_FMT-ES_EPS': 'ESPIRITO SANTO',
    'TRJ-RJ-GRD01-ZSL01': 'GRANDE RJ',
    'TRJ-RJ-BXD01-NIT02': 'GRANDE RJ',
    'OPERADOR_CSM_FMT-RJ-GRD01-ZSL01': 'GRANDE RJ',
    'TRJ-RJ-BXD01-BXD01': 'BAIXADA',
    'OPERADOR_CSM_FMT-RJ_BXD01-BXD01': 'BAIXADA',
    'TRJ-RJ-ZNO01-ZOE02': 'ZONA OESTE',
    'OPERADOR_CSM_FMT-BXB_ZOE': 'ZONA OESTE',
    'OPERADOR_CSM_TRJ': 'ZONA OESTE'
  };

  function mapearPorCodigoFila(texto) {
    var s = up(texto);
    if (!s) return null;
    for (var k in CRITERIOS_FILA) {
      if (CRITERIOS_FILA.hasOwnProperty(k) && s.indexOf(k) >= 0) return CRITERIOS_FILA[k];
    }
    if (s.indexOf('NIT02') >= 0 || s.indexOf('NIT01') >= 0) return 'GRANDE RJ';
    if (s.indexOf('ANG01') >= 0) return 'INTERIOR';
    if (s.indexOf('CPS02') >= 0 || s.indexOf('CPS01') >= 0) return 'ESPIRITO SANTO';
    if (s.indexOf('ZSL01') >= 0 || s.indexOf('GRD01') >= 0) return 'GRANDE RJ';
    if (s.indexOf('ZOE02') >= 0 || s.indexOf('ZNO01') >= 0 || s.indexOf('BXB_ZOE') >= 0) return 'ZONA OESTE';
    if (s.indexOf('BXD01') >= 0 || s.indexOf('_BXD') >= 0) return 'BAIXADA';
    if (s.indexOf('INT01') >= 0 || s.indexOf('_INT_') >= 0 || s.indexOf('INT_INT') >= 0) return 'INTERIOR';
    if (s.indexOf('EPS01') >= 0 || s.indexOf('_ES_') >= 0 || s.indexOf('ES-EPS') >= 0 ||
        s.indexOf('-ES_') >= 0 || s.indexOf('VIT03') >= 0 || s.indexOf('SMT02') >= 0 || s.indexOf('CIM01') >= 0)
      return 'ESPIRITO SANTO';
    return null;
  }

  function mapearRegiaoPorArea(novaArea) {
    var s = up(novaArea);
    if (!s) return 'OTHERS';
    if (s.indexOf('INTERIOR') >= 0 || s.indexOf('COSTA VERDE') >= 0) return 'INTERIOR';
    if (s.indexOf('BAIXADA') >= 0) return 'BAIXADA';
    if (s.indexOf('ESPIRITO SANTO') >= 0 || s.indexOf('ES -') >= 0 || s.indexOf('ES_') >= 0 || s.indexOf('CAMPOS') >= 0) return 'ESPIRITO SANTO';
    if (s.indexOf('NITEROI') >= 0 || s.indexOf('NITERÓI') >= 0) return 'GRANDE RJ';
    if (s.indexOf('ZONA OESTE') >= 0 || s.indexOf('OESTE') >= 0 || s.indexOf('ZOE') >= 0) return 'ZONA OESTE';
    if (s.indexOf('ZONA NORTE') >= 0 || s.indexOf('ZONA SUL') >= 0) return 'GRANDE RJ';
    return 'OTHERS';
  }

  function mapearRegiaoPorCoordenador(coordenador) {
    var s = up(coordenador);
    if (!s) return 'OTHERS';
    if (s.indexOf('INTERIOR') >= 0 || s.indexOf('COSTA VERDE') >= 0 || s.indexOf('CAMPOS') >= 0) return 'INTERIOR';
    if (s.indexOf('BAIXADA') >= 0) return 'BAIXADA';
    if (s.indexOf('ESPIRITO SANTO') >= 0 || s.indexOf('ES -') >= 0) return 'ESPIRITO SANTO';
    if (s.indexOf('ZONA OESTE') >= 0 || s.indexOf('OESTE') >= 0) return 'ZONA OESTE';
    if (s.indexOf('CENTRO') >= 0 || s.indexOf('ZONA SUL') >= 0 || s.indexOf('ZONA NORTE') >= 0 || s.indexOf('NITEROI') >= 0) return 'GRANDE RJ';
    return 'OTHERS';
  }

  function determinarRegiao(filaAtual, microarea, valid) {
    var porFila = mapearPorCodigoFila(filaAtual || '') || mapearPorCodigoFila(microarea || '');
    if (porFila) return porFila;
    if (valid) {
      var porArea = mapearRegiaoPorArea(valid.novaArea);
      if (porArea !== 'OTHERS') return porArea;
      var porCoord = mapearRegiaoPorCoordenador(valid.coordenador);
      if (porCoord !== 'OTHERS') return porCoord;
    }
    return 'OTHERS';
  }

  // ===================== DATETIME (datetime.ts) =====================
  function parsePlatformDate(valor, baseDate) {
    if (!valor) return null;
    var s = String(valor).trim();
    if (!s) return null;
    var m = s.match(/(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      var p1 = parseInt(m[1], 10);
      var p2 = parseInt(m[2], 10);
      var yy = m[3] ? parseInt(m[3], 10) : (baseDate || new Date()).getFullYear();
      if (yy < 100) yy += 2000;
      var hh = parseInt(m[4], 10);
      var mi = parseInt(m[5], 10);
      var ss = m[6] ? parseInt(m[6], 10) : 0;
      var dia, mes;
      if (p1 > 12) { dia = p1; mes = p2; }
      else if (p2 > 12) { mes = p1; dia = p2; }
      else { dia = p1; mes = p2; }
      var d = new Date(yy, mes - 1, dia, hh, mi, ss);
      if (!isNaN(d.getTime())) return d;
    }
    // Data SEM horário, ex.: "28/06/26" — é o formato da coluna "Data Base"
    // da planilha, que serve de data-base pra combinar com campos que só
    // trazem a hora (ex.: "Fim"/encerramento, que costuma vir só "10:17").
    var mDate = s.match(/^(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?$/);
    if (mDate) {
      var dp1 = parseInt(mDate[1], 10);
      var dp2 = parseInt(mDate[2], 10);
      var dyy = mDate[3] ? parseInt(mDate[3], 10) : (baseDate || new Date()).getFullYear();
      if (dyy < 100) dyy += 2000;
      var ddia, dmes;
      if (dp1 > 12) { ddia = dp1; dmes = dp2; }
      else if (dp2 > 12) { dmes = dp1; ddia = dp2; }
      else { ddia = dp1; dmes = dp2; }
      var d0 = new Date(dyy, dmes - 1, ddia, 0, 0, 0);
      if (!isNaN(d0.getTime())) return d0;
    }
    var mh = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (mh && baseDate) {
      var d2 = new Date(baseDate);
      d2.setHours(parseInt(mh[1], 10), parseInt(mh[2], 10), mh[3] ? parseInt(mh[3], 10) : 0, 0);
      return d2;
    }
    var iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;
    return null;
  }

  function toDate(d) {
    if (!d) return null;
    var date = (typeof d === 'string' || typeof d === 'number') ? new Date(d) : d;
    return isNaN(date.getTime()) ? null : date;
  }

  function formatarDuracao(totalMin) {
    var abs = Math.abs(Math.round(totalMin));
    var dias = Math.floor(abs / 1440);
    var horas = Math.floor((abs % 1440) / 60);
    var min = abs % 60;
    var out = '';
    if (dias > 0) out += dias + 'd ';
    if (horas > 0 || dias > 0) out += horas + 'h';
    out += String(min).padStart(2, '0') + 'min';
    return out.trim();
  }

  function formatarDataBR(d) {
    if (!d) return '—';
    var date = (typeof d === 'string' || typeof d === 'number') ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    }).format(date);
  }

  // Data compacta pro espaço apertado dos drills: "28/06 14:30" (sem ano).
  function formatarDataCompacta(d) {
    if (!d) return '—';
    var date = (typeof d === 'string' || typeof d === 'number') ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    var parts = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    }).formatToParts(date);
    var map = {}; parts.forEach(function (p) { map[p.type] = p.value; });
    return map.day + '/' + map.month + ' ' + map.hour + ':' + map.minute;
  }

  // Vencimento em linguagem simples: "VENCE EM 30min" / "VENCE EM 1h30" /
  // "VENCIDO A 1h30" — junto com a cor sugerida (verde = ainda dentro do
  // prazo, vermelho = já venceu), pra usar direto nos drills.
  function formatarVencimentoSimples(vencimentoCalc, now) {
    if (!vencimentoCalc) return { texto: '—', cor: null };
    var venc = (typeof vencimentoCalc === 'string' || typeof vencimentoCalc === 'number') ? new Date(vencimentoCalc) : vencimentoCalc;
    if (isNaN(venc.getTime())) return { texto: '—', cor: null };
    now = now || new Date();
    var diffMin = Math.round((venc.getTime() - now.getTime()) / 60000);
    var venceu = diffMin < 0;
    var abs = Math.abs(diffMin);
    var horas = Math.floor(abs / 60);
    var min = abs % 60;
    var txt;
    if (horas > 0 && min > 0) txt = horas + 'h' + String(min).padStart(2, '0');
    else if (horas > 0) txt = horas + 'h';
    else txt = min + 'min';
    return { texto: (venceu ? 'VENCIDO A ' : 'VENCE EM ') + txt, cor: venceu ? '#e74c3c' : '#2ecc71', venceu: venceu };
  }

  function getAgingBucket(minutos) {
    for (var i = 0; i < C.AGING_BUCKETS.length; i++) {
      var b = C.AGING_BUCKETS[i];
      if (minutos >= b.min && minutos < b.max) return b.label;
    }
    return C.AGING_BUCKETS[C.AGING_BUCKETS.length - 1].label;
  }

  // ===================== SLA (sla.ts) =====================
  var STATUS_BACKLOG = ['NÃO INICIADO', 'NAO INICIADO', 'INICIADO', 'PENDENTE'];
  var STATUS_FECHADO = ['CONCLUÍDA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO'];

  function isBacklogStatus(status) {
    var s = up(status);
    if (STATUS_FECHADO.indexOf(s) >= 0) return false;
    if (STATUS_BACKLOG.indexOf(s) >= 0) return true;
    return s !== '';
  }

  function computeSla(task, prazoMap, now) {
    var criacao = toDate(task.dataCriacao);
    var isBacklog = isBacklogStatus(task.status);
    var falha = up(task.tipoFalha);
    var agingMinutos = criacao ? Math.round((now.getTime() - criacao.getTime()) / 60000) : null;

    if (falha.indexOf('PREDICAO INDISP') >= 0 || falha.indexOf('PREDIÇÃO INDISP') >= 0) {
      return { vencimentoCalc: null, fonteSla: 'PREDITIVA', statusSla: 'PREDITIVA', minutosRestantes: null, agingMinutos: agingMinutos, isBacklog: isBacklog };
    }

    var vencimento = null;
    var fonte = 'SEM DADOS';
    var venPlat = parsePlatformDate(task.vencimentoSla, criacao);
    if (venPlat) {
      vencimento = venPlat; fonte = 'SLA CONT';
    } else if (criacao) {
      var prazo = prazoMap[up(task.prioridade)] || 0;
      if (prazo > 0) {
        vencimento = new Date(criacao.getTime() + prazo * 3600 * 1000);
        fonte = 'SLA CAL';
      }
    }

    if (!vencimento) {
      return { vencimentoCalc: null, fonteSla: 'SEM DADOS', statusSla: isBacklog ? 'INDEFINIDO' : 'CONCLUIDO', minutosRestantes: null, agingMinutos: agingMinutos, isBacklog: isBacklog };
    }

    var minutosRestantes = Math.round((vencimento.getTime() - now.getTime()) / 60000);
    var statusSla;
    if (!isBacklog) statusSla = 'CONCLUIDO';
    else statusSla = minutosRestantes < 0 ? 'FORA DO SLA' : 'DENTRO DO SLA';

    return { vencimentoCalc: vencimento, fonteSla: fonte, statusSla: statusSla, minutosRestantes: minutosRestantes, agingMinutos: agingMinutos, isBacklog: isBacklog };
  }

  function montarPrazoMap(override) {
    var m = {};
    for (var k in C.SLA_PADRAO_HORAS) if (C.SLA_PADRAO_HORAS.hasOwnProperty(k)) m[k] = C.SLA_PADRAO_HORAS[k];
    if (override) for (var k2 in override) if (override.hasOwnProperty(k2)) {
      var v = parseFloat(override[k2]);
      if (!isNaN(v)) m[k2] = v;
    }
    return m;
  }

  // ===================== TICKETS (tickets.ts) =====================
  function isTicketCorretiva(tipoAtividade) {
    return normalize(tipoAtividade).indexOf('CORRETIV') >= 0;
  }

  function categoriaManual(tipoAtividade) {
    var t = normalize(tipoAtividade);
    if (t.indexOf('PREVENT') >= 0) return 'prev';
    if (t.indexOf('CONJUNT') >= 0) return 'conj';
    if (t.indexOf('WO') >= 0 || t.indexOf('WORK ORDER') >= 0) return 'wo';
    return 'outras';
  }

  function classificarCciCampo(filaAtual) {
    return normalize(filaAtual).indexOf('OPERADOR_') >= 0 ? 'CCI' : 'Campo';
  }

  function dedupPorTsk(rows) {
    var best = {};
    var semOs = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var k = ((r.osNumero == null ? '' : r.osNumero).toString()).trim();
      if (!k) { semOs.push(r); continue; }
      var cur = best[k];
      var sid = (r.sequenciaId == null ? -1 : Number(r.sequenciaId));
      if (!cur || sid > (cur.sequenciaId == null ? -1 : Number(cur.sequenciaId))) best[k] = r;
    }
    var out = [];
    for (var kk in best) if (best.hasOwnProperty(kk)) out.push(best[kk]);
    return out.concat(semOs);
  }

  function separarTicketsManuais(rows, jaDeduplicado) {
    var base = jaDeduplicado ? rows : dedupPorTsk(rows);
    var tickets = [], manuais = [];
    for (var i = 0; i < base.length; i++) {
      if (isTicketCorretiva(base[i].tipoAtividade)) tickets.push(base[i]);
      else manuais.push(base[i]);
    }
    return { tickets: tickets, manuais: manuais };
  }

  // ===================== CAUSA (causa.ts) =====================
  function agruparCausa(causa) {
    var s = up(causa);
    if (!s) return 'Outros';
    if (s.indexOf('FURTO') >= 0 || s.indexOf('VANDAL') >= 0 || s.indexOf('ROUBO') >= 0) return 'Furto';
    if (s.indexOf('ENERGIA') >= 0 || s.indexOf('ENERG') >= 0) return 'Energia';
    if (s.indexOf('FO') >= 0 || s.indexOf('FIBRA') >= 0 || s.indexOf('ROMPIMENTO') >= 0) return 'Fibra';
    if (s.indexOf('TX') >= 0 || s.indexOf('TRANSMISS') >= 0 || s.indexOf('PROVEDOR') >= 0 || s.indexOf('MW') >= 0 || s.indexOf('BACKHAUL') >= 0) return 'Transmissão';
    return 'Outros';
  }

  D.up = up;
  D.normalize = normalize;
  D.determinarRegiao = determinarRegiao;
  D.mapearRegiaoPorArea = mapearRegiaoPorArea;
  D.mapearRegiaoPorCoordenador = mapearRegiaoPorCoordenador;
  D.parsePlatformDate = parsePlatformDate;
  D.toDate = toDate;
  D.formatarDuracao = formatarDuracao;
  D.formatarDataBR = formatarDataBR;
  D.formatarDataCompacta = formatarDataCompacta;
  D.formatarVencimentoSimples = formatarVencimentoSimples;
  D.getAgingBucket = getAgingBucket;
  D.isBacklogStatus = isBacklogStatus;
  D.computeSla = computeSla;
  D.montarPrazoMap = montarPrazoMap;
  D.isTicketCorretiva = isTicketCorretiva;
  D.categoriaManual = categoriaManual;
  D.classificarCciCampo = classificarCciCampo;
  D.dedupPorTsk = dedupPorTsk;
  D.separarTicketsManuais = separarTicketsManuais;
  D.agruparCausa = agruparCausa;

  TRJ.domain = D;
})(window.TRJ = window.TRJ || {});
