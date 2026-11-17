// Clique no ícone da extensão: injeta o robô na aba (ou reabre o painel se já estiver na página).
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['robo-tais.js'] });
  } catch (e) {
    console.warn('Robô Tais: não foi possível abrir nesta aba. Use o Telegram Web ou o Portal TIM.', e);
  }
});

// Clique real (de confiança) a pedido do robô. Só é usado quando o clique comum não funciona na página.
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || msg.tipo !== 'clique-real' || !sender.tab) return false;
  cliqueReal(sender.tab.id, msg.x, msg.y).then(() => responder({ ok: true }), e => responder({ ok: false, erro: String((e && e.message) || e) }));
  return true;
});
async function cliqueReal(tabId, x, y) {
  const alvo = { tabId };
  await chrome.debugger.attach(alvo, '1.3');
  try {
    const p = { x, y, button: 'left', clickCount: 1, pointerType: 'mouse' };
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' });
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', buttons: 1 }, p));
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased' }, p));
  } finally {
    try { await chrome.debugger.detach(alvo); } catch (e) { }
  }
}
