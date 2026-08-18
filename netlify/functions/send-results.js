const https = require("https");

function resendRequest(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL  = process.env.NOTIFY_EMAIL || "brian@brand-tastic.ca";
  const FROM_EMAIL    = "LinkedIn Audit <audit@brand-tastic.ca>";

  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing RESEND_API_KEY" }) };
  }

  let lead, results, modules;
  try {
    ({ lead, results, modules } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  // Build results HTML
  const resultSections = modules
    .filter(m => results[m.id])
    .map(m => {
      const raw = results[m.id] || "";
      const sections = raw.split(/\n##\s+/).filter(Boolean).map(p => {
        const nl = p.indexOf("\n");
        if (nl === -1) return { title: p.trim(), body: "" };
        return { title: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
      });

      const sectionHtml = sections.map(s => `
        <div style="margin-bottom:20px;">
          ${s.title ? `<div style="font-size:10px;color:#EF9F27;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;margin-bottom:10px;font-family:Arial,sans-serif;">${s.title}</div>` : ""}
          <div style="font-size:14px;color:#C8C2BA;line-height:1.85;white-space:pre-wrap;font-family:Georgia,serif;">${s.body}</div>
        </div>
      `).join("");

      return `
        <div style="margin-bottom:36px;border-top:1px solid #1E1E1E;padding-top:32px;">
          <div style="margin-bottom:20px;">
            <span style="font-size:11px;color:#EF9F27;font-family:Arial,sans-serif;font-weight:700;letter-spacing:0.12em;">${m.num} — </span>
            <span style="font-size:18px;color:#F0EBE3;font-family:Georgia,serif;font-weight:600;">${m.full}</span>
          </div>
          <div style="background:#131313;border:1px solid #1E1E1E;border-radius:10px;padding:24px 26px;">${sectionHtml}</div>
        </div>
      `;
    }).join("");

  const userEmailHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0A0A;">
<div style="max-width:620px;margin:0 auto;padding:48px 32px;background:#0A0A0A;color:#F0EBE3;">
  <div style="margin-bottom:48px;">
    <div style="font-size:10px;color:#EF9F27;letter-spacing:0.25em;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;margin-bottom:20px;">Brand-Tastic — LinkedIn Audit Suite</div>
    <h1 style="font-family:Georgia,serif;font-size:36px;font-weight:700;color:#F0EBE3;margin:0 0 18px;line-height:1.15;">Your audit results,<br><span style="color:#EF9F27;">${lead.name}.</span></h1>
    <p style="font-size:15px;color:#6B6560;line-height:1.8;margin:0;font-family:Arial,sans-serif;">Everything below is specific to your profile, your audience, and the outcome you want your profile to drive.</p>
  </div>
  ${resultSections}
  <div style="background:#111111;border:1px solid #1E1E1E;border-radius:14px;padding:36px 32px;margin-top:40px;">
    <div style="font-size:10px;color:#EF9F27;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;margin-bottom:16px;">Want more AI agents like this one?</div>
    <h3 style="font-family:Georgia,serif;font-size:20px;color:#F0EBE3;margin:0 0 14px;font-weight:600;">Brand-Tastic builds AI execution engines for growing companies.</h3>
    <p style="font-size:14px;color:#6B6560;line-height:1.8;margin:0 0 24px;font-family:Arial,sans-serif;">From AI-powered lead magnets to full marketing automation stacks — built, deployed, and running in weeks.</p>
    <a href="https://brand-tastic.ca/ai-execution" style="display:inline-block;background:#EF9F27;color:#0A0A0A;border-radius:7px;padding:13px 26px;font-size:14px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">See Our AI Agents →</a>
  </div>
  <div style="margin-top:40px;padding-top:24px;border-top:1px solid #161616;">
    <p style="font-size:12px;color:#2E2B28;margin:0;font-family:Arial,sans-serif;">Brand-Tastic · brand-tastic.ca · Vancouver &amp; Halifax</p>
  </div>
</div>
</body></html>`;

  const notifyHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:0 auto;padding:36px 28px;">
  <div style="border-left:3px solid #EF9F27;padding-left:16px;margin-bottom:28px;">
    <div style="font-size:11px;color:#EF9F27;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">New Lead — LinkedIn Audit Suite</div>
    <h2 style="font-size:22px;color:#111;margin:0;font-weight:700;">${lead.name}</h2>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;font-size:13px;color:#888;width:100px;">Name</td><td style="padding:10px 0;font-size:14px;color:#111;font-weight:600;">${lead.name}</td></tr>
    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;font-size:13px;color:#888;">Email</td><td style="padding:10px 0;font-size:14px;"><a href="mailto:${lead.email}" style="color:#EF9F27;">${lead.email}</a></td></tr>
    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;font-size:13px;color:#888;">LinkedIn</td><td style="padding:10px 0;font-size:14px;"><a href="https://${lead.linkedin}" style="color:#EF9F27;">${lead.linkedin}</a></td></tr>
    <tr><td style="padding:10px 0;font-size:13px;color:#888;">Time</td><td style="padding:10px 0;font-size:13px;color:#444;">${new Date().toUTCString()}</td></tr>
  </table>
  <a href="mailto:${lead.email}" style="display:inline-block;background:#EF9F27;color:#0A0A0A;border-radius:6px;padding:11px 22px;font-size:13px;font-weight:700;text-decoration:none;">Reply to ${lead.name} →</a>
</div>
</body></html>`;

  try {
    await Promise.all([
      resendRequest({ from: FROM_EMAIL, to: lead.email,    subject: "Your LinkedIn Audit Results — Brand-Tastic", html: userEmailHtml }, RESEND_API_KEY),
      resendRequest({ from: FROM_EMAIL, to: NOTIFY_EMAIL,  subject: `New audit lead: ${lead.name} (${lead.linkedin})`, html: notifyHtml }, RESEND_API_KEY),
    ]);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
