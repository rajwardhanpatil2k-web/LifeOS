// Thin OpenAI wrapper over global fetch — no SDK dependency needed on Node 18+.
//
// Every call here is optional by design: if the key is missing, the network is
// down, or OpenAI returns garbage, callers get null and fall back to the
// deterministic numbers. The AI only ever narrates stats we computed
// ourselves, so a failure degrades the copy, never the data.

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 20000;

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  return key && key.startsWith("sk-") ? key : null;
}

function isAiEnabled() {
  return !!apiKey();
}

async function chatJson({ system, user, schema, schemaName, model, maxTokens = 700, temperature = 0.4 }) {
  const key = apiKey();
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature,
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
      return null;
    }

    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return null;

    return {
      data: JSON.parse(content),
      model: payload.model,
      usage: payload.usage || null,
    };
  } catch (err) {
    console.warn("OpenAI call failed:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatJson, isAiEnabled, DEFAULT_MODEL };
