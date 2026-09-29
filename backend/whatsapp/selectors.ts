export const WHATSAPP_URL = 'https://web.whatsapp.com/';

/**
 * WhatsApp Web DOM selectors, in priority order. The page changes often: when a step stops
 * working, the error names the missing element so this file can be updated. These selectors
 * only locate visible UI elements; nothing here hides or disguises the automation.
 */
export const SELECTORS = {
  loggedIn: ['#pane-side', '#side'],
  loginQr: ['canvas[aria-label]', 'div[data-ref] canvas', '[data-testid="qrcode"]'],
  composer: ['footer div[contenteditable="true"][role="textbox"]', 'footer div[contenteditable="true"]'],
  modal: ['div[data-animate-modal-popup="true"]', 'div[role="dialog"]'],
  modalButton: 'button, div[role="button"]',
  attachButton: [
    'footer button[aria-label="Anexar"]',
    'footer button[aria-label="Attach"]',
    'footer [title="Anexar"]',
    'footer [title="Attach"]',
    'footer span[data-icon="plus-rounded"]',
    'footer span[data-icon="plus"]',
    'footer span[data-icon="attach-menu-plus"]',
    'footer span[data-icon="clip"]',
  ],
  imageInput: [
    'input[type="file"][accept*="image"][accept*="video"]',
    'input[type="file"][accept*="image"]',
  ],
  captionBox: [
    '[aria-label*="legenda" i]:is([contenteditable="true"], textarea, input)',
    '[aria-label*="caption" i]:is([contenteditable="true"], textarea, input)',
    '[aria-placeholder*="legenda" i], [placeholder*="legenda" i]',
    '[aria-placeholder*="caption" i], [placeholder*="caption" i]',
  ],
  /** Any kind of text field; used to find the caption box structurally, near the preview send button. */
  textField: '[contenteditable]:not([contenteditable="false"]), textarea, input[type="text"], [role="textbox"]',
  /** Areas whose fields are never the caption: the chat composer and the chat-list search. */
  captionExclusions: ['#main footer', '#side'],
  mediaSendButton: [
    'div[role="button"][aria-label="Enviar"]:not(footer *)',
    'div[role="button"][aria-label="Send"]:not(footer *)',
    'span[data-icon="wds-ic-send-filled"]:not(footer *)',
    'span[data-icon="send"]:not(footer *)',
  ],
  /** Every message row of the open chat (sent and received). */
  messageRow: '#main [data-id]',
  pendingIcon: '[data-icon="msg-time"]',
} as const;

export const INVALID_NUMBER_TEXT = /inv[aá]lido|invalid|n[aã]o est[aá] no whatsapp|isn.t on whatsapp|not on whatsapp/i;
export const OTHER_SESSION_TEXT = /outra janela|another window|usar aqui|use here/i;
