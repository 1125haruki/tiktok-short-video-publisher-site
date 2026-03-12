const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function html(body, init = {}) {
  return new Response(
    `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TikTok OAuth</title><style>body{font-family:system-ui,sans-serif;background:#f6f8fa;color:#1f2328;margin:0;padding:40px}main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d0d7de;border-radius:16px;padding:24px}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}</style></head><body><main>${body}</main></body></html>`,
    {
      ...init,
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...(init.headers || {}),
      },
    }
  );
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

async function signState(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(sig));
}

async function createStateBundle(secret) {
  const nonce = randomToken(18);
  const verifier = randomToken(48);
  const signed = await signState(secret, `${nonce}.${verifier}`);
  return {
    state: `${nonce}.${signed}`,
    verifier,
  };
}

async function verifyState(secret, state, verifier) {
  if (!state || !verifier || !state.includes(".")) return false;
  const [nonce, sentSig] = state.split(".", 2);
  const expected = await signState(secret, `${nonce}.${verifier}`);
  return sentSig === expected;
}

function redactedToken(token) {
  if (!token) return null;
  if (token.length <= 10) return `${token.slice(0, 2)}...`;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

async function handleConnect(request, env) {
  const url = new URL(request.url);
  const stateBundle = await createStateBundle(env.STATE_SECRET);
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    response_type: "code",
    scope: env.TIKTOK_SCOPE || "video.upload",
    redirect_uri: env.TIKTOK_REDIRECT_URI,
    state: stateBundle.state,
  });

  // Web app flow can use OAuth v2 without query params on redirect URI.
  const response = Response.redirect(`${AUTH_URL}?${params.toString()}`, 302);
  response.headers.append(
    "Set-Cookie",
    `tt_state_verifier=${stateBundle.verifier}; HttpOnly; Secure; SameSite=Lax; Path=/tiktok; Max-Age=600`
  );
  response.headers.append(
    "Access-Control-Allow-Origin",
    env.ALLOWED_ORIGIN || "*"
  );
  return response;
}

async function exchangeToken(code, env) {
  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: env.TIKTOK_REDIRECT_URI,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.message || "Token exchange failed");
  }
  return payload;
}

async function forwardTokenBundle(bundle, env) {
  if (!env.TOKEN_SINK_URL) return null;
  const response = await fetch(env.TOKEN_SINK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.TOKEN_SINK_BEARER
        ? { Authorization: `Bearer ${env.TOKEN_SINK_BEARER}` }
        : {}),
    },
    body: JSON.stringify({
      provider: "tiktok",
      receivedAt: new Date().toISOString(),
      bundle,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token sink failed with status ${response.status}`);
  }
  return { ok: true, status: response.status };
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const cookieHeader = request.headers.get("Cookie") || "";
  const verifierMatch = cookieHeader.match(/(?:^|;\s*)tt_state_verifier=([^;]+)/);
  const verifier = verifierMatch ? verifierMatch[1] : "";

  if (error) {
    return html(
      `<h1>TikTok authorization failed</h1><p><code>${error}</code></p><p>${errorDescription || ""}</p>`,
      { status: 400 }
    );
  }

  if (!code) {
    return html("<h1>Missing code</h1><p>TikTok did not return an authorization code.</p>", {
      status: 400,
    });
  }

  const validState = await verifyState(env.STATE_SECRET, state, verifier);
  if (!validState) {
    return html("<h1>Invalid state</h1><p>CSRF check failed.</p>", { status: 400 });
  }

  try {
    const tokenBundle = await exchangeToken(code, env);
    let sinkResult = null;
    if (env.TOKEN_SINK_URL) {
      sinkResult = await forwardTokenBundle(tokenBundle, env);
    }

    return html(
      `<h1>TikTok authorization succeeded</h1>
       <p>Token exchange completed on the server side.</p>
       <ul>
         <li>open_id: <code>${tokenBundle.open_id || "n/a"}</code></li>
         <li>scope: <code>${tokenBundle.scope || "n/a"}</code></li>
         <li>access_token: <code>${redactedToken(tokenBundle.access_token) || "n/a"}</code></li>
         <li>refresh_token: <code>${redactedToken(tokenBundle.refresh_token) || "n/a"}</code></li>
         <li>sink: <code>${sinkResult ? "forwarded" : "not configured"}</code></li>
       </ul>`,
      {
        status: 200,
        headers: {
          "Set-Cookie":
            "tt_state_verifier=; HttpOnly; Secure; SameSite=Lax; Path=/tiktok; Max-Age=0",
        },
      }
    );
  } catch (err) {
    return html(
      `<h1>Token exchange failed</h1><p>${String(err.message || err)}</p>`,
      { status: 500 }
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/tiktok/health") {
      return json({
        ok: true,
        path: url.pathname,
        configured: Boolean(
          env.TIKTOK_CLIENT_KEY &&
            env.TIKTOK_CLIENT_SECRET &&
            env.TIKTOK_REDIRECT_URI &&
            env.STATE_SECRET
        ),
        scope: env.TIKTOK_SCOPE || "video.upload",
      });
    }

    if (
      !env.TIKTOK_CLIENT_KEY ||
      !env.TIKTOK_CLIENT_SECRET ||
      !env.TIKTOK_REDIRECT_URI ||
      !env.STATE_SECRET
    ) {
      return json(
        {
          error: "misconfigured_worker",
          message: "Required environment variables are missing.",
        },
        { status: 500 }
      );
    }

    if (url.pathname === "/tiktok/connect") {
      return handleConnect(request, env);
    }

    if (url.pathname === "/tiktok/callback") {
      return handleCallback(request, env);
    }

    return html(
      `<h1>TikTok OAuth Worker</h1>
       <p>Use <code>/tiktok/connect</code> to start authorization.</p>
       <p>Use <code>/tiktok/health</code> to verify deployment.</p>`,
      { status: 200 }
    );
  },
};
