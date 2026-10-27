const PAIN_LINE =
  "Sharp or joint pain means stop that movement. Dull muscle effort is normal. If pain persists, please see a professional.";

function withPainNote(items) {
  return (items || []).map((item) => {
    const plain = typeof item.toObject === "function" ? item.toObject() : { ...item };
    if (plain.domain === "fitness" || plain.category === "workout") plain.safetyNote = PAIN_LINE;
    return plain;
  });
}

module.exports = { PAIN_LINE, withPainNote };
