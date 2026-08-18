const https = require("https");

function anthropicRequest(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      timeout: 25000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error("Failed to parse response: " + data.slice(0, 200)));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Missing ANTHROPIC_API_KEY env var" }) };
  }

  let system, userMessage;
  try {
    ({ system, userMessage } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  try {
    const { status, body } = await anthropicRequest({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    if (status !== 200 || body.error) {
      return {
        statusCode: status,
        headers: CORS,
        body: JSON.stringify({ error: body.error?.message || JSON.stringify(body.error) }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ result: body.content[0].text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
