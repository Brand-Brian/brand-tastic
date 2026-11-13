// DRAFT, UNTESTED, not active. Copy to netlify/edge-functions/basic-auth.ts at the repo root.
// Shared-password gate. Credentials come from Netlify environment variables, never from code.
// Set PILOT_USER and PILOT_PASS in the Netlify site settings (mark as secret).
export default async (request: Request) => {
  const user = Netlify.env.get("PILOT_USER");
  const pass = Netlify.env.get("PILOT_PASS");
  if (!user || !pass) return new Response("Gate not configured", { status: 503 }); // fail closed
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch { /* malformed header: fall through to 401 */ }
    const [u, ...rest] = decoded.split(":");
    if (decoded && u === user && rest.join(":") === pass) return; // let the request through
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Proposed pilot concept", charset="UTF-8"', "Cache-Control": "no-store" },
  });
};
export const config = { path: "/travel/*" };
