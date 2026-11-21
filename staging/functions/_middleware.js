// Password gate for the staging site (Cloudflare Pages runs this before every page).
// The password is NOT in the code: it is the STAGING_PASSWORD setting you type into Cloudflare yourself.
// Visitors get the browser's password box; the user name can be anything.
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const A = new Uint8Array(x), B = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];   // compares every byte, so the time taken never hints at the password
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  if (!env.STAGING_PASSWORD) {
    return new Response("The staging site is locked until a password is set (Cloudflare > this project > Settings > Variables and secrets > STAGING_PASSWORD).", { status: 503 });
  }
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (await same(given, env.STAGING_PASSWORD)) return next();
    } catch (e) { /* fall through to the password box */ }
  }
  return new Response("Staging site: password needed.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="MoMS staging", charset="UTF-8"', "Cache-Control": "no-store" } });
}
