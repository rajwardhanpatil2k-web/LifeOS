const DECLINE_MESSAGE =
  "I can't advise on that. For pain, injuries, supplements or skin reactions, please check with a doctor or dermatologist.";

const CHECKS = [
  ["diagnosis", /\bdiagnos(?:is|e|ed|ing)\b|\bdo i have (?:a |an )?(?:rotator|tear|sprain|fracture|injur)/i],
  ["dosage", /\b(?:dosage|doses?|milligrams?|mg)\b|\bhow much (?:creatine|protein|omega|supplement|amla|oil)\b|\bwhat dose\b/i],
  ["safety", /\b(?:is it safe|safe to)\b/i],
  ["skin", /\b(?:rash(?:es)?|itch(?:ing|y)?|infect(?:ed|ion)?|bleed(?:ing)?|scalp (?:reaction|irritat\w*))\b/i],
  ["injury", /\b(?:injur(?:y|ed|ies)|torn|tears?|sprain(?:ed)?|fractur(?:e|ed)|swollen|swelling)\b/i],
  ["symptom", /\b(?:symptoms?|dizzy|dizziness|nausea|nauseous|numb(?:ness)?)\b/i],
  ["pain", /\b(?:pain(?:ful)?|hurts?|hurting|aches?|aching|sore(?:ness)?)\b/i],
];

function classifySafety(transcript) {
  const text = String(transcript || "");
  for (const [category, pattern] of CHECKS) {
    if (pattern.test(text)) return { category };
  }
  return null;
}

module.exports = { classifySafety, DECLINE_MESSAGE, CHECKS };
