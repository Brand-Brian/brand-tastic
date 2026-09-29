const dns = require("dns").promises;
const net = require("net");

const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended"];

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function validate(input) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(input) ? input : "https://" + input); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost") return null;
  if (net.isIP(host)) return isPrivate(host) ? null : u;
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) return null;
  } catch { return null; }
  return u;
}

async function get(url, max = 1500000) {
  let current = await validate(url);
  for (let i = 0; i < 5 && current; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(current.href, {
        redirect: "manual", signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandTasticAEOBot/1.0; +https://brand-tastic.ca)", "Accept": "text/html,text/plain,*/*" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = await validate(new URL(res.headers.get("location"), current).href);
        continue;
      }
      const text = (await res.text()).slice(0, max);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, text, url: current.href };
    } catch { return null; } finally { clearTimeout(t); }
  }
  return null;
}

const strip = s => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i")); return m ? m[1] : ""; };
const meta = (html, key) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) if ([attr(t, "name"), attr(t, "property")].some(v => v.toLowerCase() === key)) return attr(t, "content");
  return "";
};

function schemaTypes(html) {
  const types = new Set();
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      if (n["@type"]) [].concat(n["@type"]).forEach(t => types.add(String(t)));
      Object.values(n).forEach(walk);
    }
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, ""))); } catch {}
  }
  return { count: blocks.length, types: [...types] };
}

function blockedBots(robots) {
  const blocked = new Set();
  let agents = [], lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!lastWasAgent) agents = []; agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (k === "disallow" && v === "/") AI_BOTS.forEach(b => { if (agents.includes(b.toLowerCase())) blocked.add(b); });
  }
  return [...blocked];
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  let input;
  try { input = String(JSON.parse(event.body).url || "").trim().slice(0, 300); } catch { input = ""; }
  if (!input) return { statusCode: 400, headers, body: JSON.stringify({ error: "Enter your website address." }) };

  const page = await get(input);
  if (!page || !page.ok) return { statusCode: 422, headers, body: JSON.stringify({ error: "We couldn't reach that site. Check the address and try again." }) };

  const html = page.text;
  const origin = new URL(page.url).origin;
  const [robots, llms, sitemap] = await Promise.all([get(origin + "/robots.txt", 200000), get(origin + "/llms.txt", 200000), get(origin + "/sitemap.xml", 200000)]);

  const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const visible = strip(body.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " "));
  const words = visible ? visible.split(" ").length : 0;
  const scripts = (html.match(/<script\b/gi) || []).length;
  const h1s = (html.match(/<h1\b[\s\S]*?<\/h1>/gi) || []).map(strip).filter(Boolean);
  const h2s = (html.match(/<h2\b[\s\S]*?<\/h2>/gi) || []).map(strip).filter(Boolean);
  const h3s = (html.match(/<h3\b[\s\S]*?<\/h3>/gi) || []).map(strip).filter(Boolean);
  const questionHeads = [...h2s, ...h3s].filter(h => h.trim().endsWith("?")).length;
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const description = meta(html, "description");
  const canonical = ((html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [""])[0].match(/href=["']([^"']+)/i) || [])[1] || "";
  const ogTitle = meta(html, "og:title"), ogImage = meta(html, "og:image");
  const lang = ((html.match(/<html\b[^>]*>/i) || [""])[0].match(/lang=["']([^"']+)/i) || [])[1] || "";
  const schema = schemaTypes(html);
  const has = re => schema.types.some(t => re.test(t));
  const links = (html.match(/<a\b[^>]*href=["'][^"']+["']/gi) || []).map(a => attr(a, "href"));
  const internal = links.filter(h => h.startsWith("/") && !h.startsWith("//") || h.includes(new URL(page.url).hostname)).length;
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const withAlt = imgs.filter(i => attr(i, "alt").trim()).length;
  const blocked = robots && robots.ok ? blockedBots(robots.text) : [];
  const clientRendered = words < 150 && scripts >= 3;
  const isText = r => r && r.ok && !/<html/i.test(r.text.slice(0, 500));

  const checks = [
    ["title", "Title tag (about 30-65 characters)", title.length >= 30 && title.length <= 65, `${title.length} characters`, 8],
    ["description", "Meta description (about 100-165 characters)", description.length >= 100 && description.length <= 165, `${description.length} characters`, 8],
    ["h1", "Exactly one H1", h1s.length === 1, `${h1s.length} found`, 8],
    ["h2", "Structured H2 sections (3+)", h2s.length >= 3, `${h2s.length} found`, 5],
    ["questions", "Question-style headings that match how people ask AI", questionHeads >= 2, `${questionHeads} found`, 5],
    ["content", "Enough readable text in the raw HTML (300+ words)", words >= 300, `${words} words${clientRendered ? " (page appears to render client-side)" : ""}`, 12],
    ["jsonld", "Structured data (JSON-LD) present", schema.count > 0, schema.types.join(", ") || "none", 8],
    ["entity", "Organization, business or person schema", has(/^(Organization|LocalBusiness|ProfessionalService|Person|Corporation|Brand)$/), "", 8],
    ["faq", "FAQ schema", has(/^FAQPage$/), "", 8],
    ["canonical", "Canonical URL set", !!canonical, canonical, 4],
    ["og", "Open Graph title and image", !!ogTitle && !!ogImage, "", 4],
    ["links", "Internal links (10+)", internal >= 10, `${internal} found`, 5],
    ["alt", "Image alt text (80%+ of images)", imgs.length === 0 || withAlt / imgs.length >= 0.8, `${withAlt}/${imgs.length} images`, 4],
    ["lang", "Language declared", !!lang, lang, 2],
    ["bots", "AI crawlers allowed in robots.txt", blocked.length === 0, blocked.length ? "blocked: " + blocked.join(", ") : "", 8],
    ["llms", "llms.txt file", isText(llms), "", 4],
    ["sitemap", "XML sitemap", !!(sitemap && sitemap.ok && /<urlset|<sitemapindex/i.test(sitemap.text)), "", 4],
    ["https", "HTTPS", page.url.startsWith("https://"), "", 3],
  ].map(([id, label, pass, detail, weight]) => ({ id, label, pass: !!pass, detail, weight }));

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(checks.filter(c => c.pass).reduce((s, c) => s + c.weight, 0) / total * 100);

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      url: page.url, score, checks, clientRendered,
      facts: { title, description, h1s: h1s.slice(0, 3), h2s: h2s.slice(0, 12), schemaTypes: schema.types, wordCount: words, blockedBots: blocked },
      excerpt: visible.slice(0, 1800),
    }),
  };
};
