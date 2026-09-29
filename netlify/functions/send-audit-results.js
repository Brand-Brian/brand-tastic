const https = require("https");

const TOOLS = {
  aeo: { label: "Free AEO Audit", subject: "Your AEO Audit Results — Brand-Tastic", intro: "Here is how AI answer engines see your website, and what to fix first." },
  visibility: { label: "AI Visibility Audit", subject: "Your AI Visibility Audit — Brand-Tastic", intro: "Here is how visible your brand is to AI assistants, and how to become the answer they give." },
};

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function send(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.resend.com", path: "/emails", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Authorization: `Bearer ${apiKey}` },
    }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve({ status: res.statusCode, body: d })); });
    req.on("error", reject); req.write(body); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const key = process.env.RESEND_API_KEY;
  const notify = process.env.NOTIFY_EMAIL || "brian@brand-tastic.ca";
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: "Missing RESEND_API_KEY" }) };

  let tool, lead, results, score;
  try { ({ tool, lead, results, score } = JSON.parse(event.body)); } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid request" }) }; }
  const cfg = TOOLS[tool];
  if (!cfg || !lead || !/\S+@\S+\.\S+/.test(lead.email || "") || typeof results !== "string") return { statusCode: 400, body: JSON.stringify({ error: "Invalid request" }) };
  results = results.slice(0, 20000);
  const name = esc(String(lead.name || "").slice(0, 80)), site = esc(String(lead.website || "").slice(0, 200));

  const sections = results.split(/\n##\s+/).filter(Boolean).map(p => {
    const nl = p.indexOf("\n");
    return nl === -1 ? { t: p.trim(), b: "" } : { t: p.slice(0, nl).trim(), b: p.slice(nl + 1).trim() };
  }).map(s => `<div style="margin-bottom:20px;">${s.t ? `<div style="font-size:10px;color:#EF9F27;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;margin-bottom:10px;font-family:Arial,sans-serif;">${esc(s.t)}</div>` : ""}<div style="font-size:14px;color:#C8C2BA;line-height:1.85;white-space:pre-wrap;font-family:Georgia,serif;">${esc(s.b)}</div></div>`).join("");

  const userHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0A0A0A;"><div style="max-width:620px;margin:0 auto;padding:48px 32px;background:#0A0A0A;color:#F0EBE3;">
<div style="font-size:10px;color:#EF9F27;letter-spacing:0.25em;text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;margin-bottom:20px;">Brand-Tastic — ${esc(cfg.label)}</div>
<h1 style="font-family:Georgia,serif;font-size:34px;color:#F0EBE3;margin:0 0 16px;line-height:1.15;">Your results, <span style="color:#EF9F27;">${name}.</span></h1>
<p style="font-size:15px;color:#6B6560;line-height:1.8;margin:0 0 8px;font-family:Arial,sans-serif;">${esc(cfg.intro)}</p>
<p style="font-size:13px;color:#6B6560;margin:0 0 36px;font-family:Arial,sans-serif;">${site}${score != null ? ` · Score ${esc(score)}/100` : ""}</p>
<div style="background:#131313;border:1px solid #1E1E1E;border-radius:10px;padding:24px 26px;">${sections}</div>
<div style="background:#111;border:1px solid #1E1E1E;border-radius:14px;padding:32px;margin-top:36px;">
<h3 style="font-family:Georgia,serif;font-size:20px;color:#F0EBE3;margin:0 0 12px;">Want this fixed, not just found?</h3>
<p style="font-size:14px;color:#6B6560;line-height:1.8;margin:0 0 22px;font-family:Arial,sans-serif;">Brand-Tastic builds and runs the marketing systems behind results like these.</p>
<a href="https://brand-tastic.ca/ai-execution" style="display:inline-block;background:#EF9F27;color:#0A0A0A;border-radius:7px;padding:13px 26px;font-size:14px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">See how we work →</a></div>
<p style="font-size:12px;color:#2E2B28;margin:36px 0 0;font-family:Arial,sans-serif;">Brand-Tastic · brand-tastic.ca · Vancouver &amp; Halifax</p></div></body></html>`;

  const notifyHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:24px;"><div style="border-left:3px solid #EF9F27;padding-left:14px;margin-bottom:20px;"><div style="font-size:11px;color:#EF9F27;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">New lead — ${esc(cfg.label)}</div><h2 style="margin:6px 0 0;font-size:20px;">${name}</h2></div><p style="font-size:14px;line-height:1.8;">Email: ${esc(lead.email)}<br>Website: ${site}${score != null ? `<br>Score: ${esc(score)}/100` : ""}</p></div>`;

  try {
    const from = `${cfg.label} <audit@brand-tastic.ca>`;
    await Promise.all([
      send({ from, to: lead.email, subject: cfg.subject, html: userHtml }, key),
      send({ from, to: notify, subject: `New ${cfg.label} lead: ${lead.name} (${lead.website})`, html: notifyHtml }, key),
    ]);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
