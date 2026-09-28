const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: CORS });

async function anthropicRequest(payload) {
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch (e) {
    throw new Error("Failed to parse response: " + text.slice(0, 200));
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(500, { error: "Missing ANTHROPIC_API_KEY env var" });
  }

  let system, userMessage;
  try {
    ({ system, userMessage } = await req.json());
  } catch (e) {
    return json(400, { error: "Invalid request body" });
  }

  try {
    const { status, body } = await anthropicRequest({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    if (status !== 200 || body.error) {
      return json(status, { error: body.error?.message || JSON.stringify(body.error) });
    }

    return json(200, { result: body.content[0].text });
  } catch (err) {
    if (err.name === "TimeoutError") return json(500, { error: "Request timed out" });
    return json(500, { error: err.message });
  }
};
