// Clique no ícone da extensão: injeta o robô na aba (ou reabre o painel se já estiver na página).
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['robo-tais.js'] });
  } catch (e) {
    console.warn('Robô Tais: não foi possível abrir nesta aba. Use o Telegram Web ou o Portal TIM.', e);
  }
});
