/* =====================================================================
 * config.js  —  CONFIGURAÇÃO DO SITE
 * ---------------------------------------------------------------------
 * Cole aqui a URL do seu Web App do Apps Script (a que termina em /exec).
 * Veja o passo a passo no arquivo LEIA-ME.md.
 *
 * Exemplo:
 *   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb..../exec"
 * ===================================================================== */
(function (TRJ) {
  TRJ.config = {
    // >>>>>>>>>>>>>>  COLE A URL DO SEU APPS SCRIPT AQUI  <<<<<<<<<<<<<<
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbz0Ttfcj5Dl5ITu73M6e2Ke7vR3NFfp54UZmSV1VaYqKRsTgOdvcxVwyzkAni5RgCbPcQ/exec",

    // Nome exibido no topo (pode personalizar)
    APP_NAME: "CONTROLE TRJ",
    APP_SUB: "Operacional",

    // Intervalo de auto-atualização do dashboard (segundos). 0 = desligado.
    AUTO_REFRESH_SEG: 0
  };
})(window.TRJ = window.TRJ || {});
