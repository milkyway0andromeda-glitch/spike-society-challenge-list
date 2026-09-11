const ALLOWED_RETURN_ORIGINS = [
  "https://milkyway0andromeda-glitch.github.io"
];

function cors(origin) {
  const allowed = ALLOWED_RETURN_ORIGINS.includes(origin) ? origin : ALLOWED_RETURN_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
}

function fromB64urlText(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0)));
}

async function signState(payload, secret) {
  const body = b64urlText(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function verifyState(value, secret) {
  const [body, signature] = value.split(".");
  if (!body || !signature) throw new Error("Invalid state");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const padded = signature.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((signature.length + 3) % 4);
  const sig = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
  if (!ok) throw new Error("Invalid state signature");
  return JSON.parse(fromB64urlText(body));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (url.pathname === "/login") {
      const returnTo = url.searchParams.get("return_to");
      if (!returnTo) return new Response("Missing return_to", { status: 400 });
      const target = new URL(returnTo);
      if (!ALLOWED_RETURN_ORIGINS.includes(target.origin)) return new Response("Return URL not allowed", { status: 400 });

      const callback = returnTo;
      const statePayload = await signState({ returnTo, expires: Date.now() + 10 * 60 * 1000 }, env.STATE_SECRET);
      const auth = new URL("https://github.com/login/oauth/authorize");
      auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      auth.searchParams.set("redirect_uri", callback);
      auth.searchParams.set("state", statePayload);
      return Response.redirect(auth.toString(), 302);
    }

    if (url.pathname === "/exchange" && request.method === "POST") {
      const body = await request.json();
      let parsed;
      try { parsed = await verifyState(body.state, env.STATE_SECRET); } catch { return Response.json({ error: "Invalid login state" }, { status: 400, headers: cors(origin) }); }
      if (!parsed?.returnTo || parsed.expires < Date.now()) return Response.json({ error: "Expired login state" }, { status: 400, headers: cors(origin) });
      if (body.redirect_uri !== parsed.returnTo) return Response.json({ error: "Redirect mismatch" }, { status: 400, headers: cors(origin) });

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: body.code,
          redirect_uri: body.redirect_uri
        })
      });
      const data = await tokenRes.json();
      if (!tokenRes.ok || !data.access_token) return Response.json({ error: data.error_description || data.error || "Token exchange failed" }, { status: 400, headers: cors(origin) });
      return Response.json({ access_token: data.access_token }, { headers: { ...cors(origin), "Cache-Control": "no-store" } });
    }

    return new Response("Spike Society OAuth worker", { status: 200 });
  }
};
