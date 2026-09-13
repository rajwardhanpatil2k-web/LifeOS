// Shared between the QR generator script (plain Node, CommonJS) and the
// in-app scanner (Metro/Babel, which interops with module.exports fine).
//
// Print the QR code generated from this token and stick it somewhere that
// forces you out of bed (bathroom mirror, kitchen) — the morning alarm can
// only be silenced by holding this exact code in the camera for 15s.
const WAKE_TOKEN = "LIFEOS-WAKE-7F3A9C";
const WAKE_QR_VALUE = `lifeos-wake:${WAKE_TOKEN}`;
const WAKE_HOLD_MS = 15000;
const WAKE_DEEP_LINK_SCHEME = "lifeos";
const WAKE_DEEP_LINK_PATH = "wake-alarm";

module.exports = {
  WAKE_TOKEN,
  WAKE_QR_VALUE,
  WAKE_HOLD_MS,
  WAKE_DEEP_LINK_SCHEME,
  WAKE_DEEP_LINK_PATH,
};
