/**
 * Prevents Angular change detection from
 * running with certain Web Component callbacks
 */
// eslint-disable-next-line no-underscore-dangle
(window as any).__Zone_disable_customElements = true;
// Evita crash do Zone.js quando speechSynthesis não está disponível no WebView Android
// eslint-disable-next-line no-underscore-dangle
(window as any).__Zone_disable_speechSynthesis = true;
