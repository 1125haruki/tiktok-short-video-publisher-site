const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url";
const CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const DIRECT_POST_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const UPLOAD_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const STATUS_FETCH_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

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

function withCors(request, env, response) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = env.ALLOWED_ORIGIN || "";
  if (origin && origin === allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function preflight(request, env) {
  const response = new Response(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("Access-Control-Request-Headers") ||
      "Content-Type, X-TikTok-Access-Token, X-TikTok-Scope, X-TikTok-Open-Id"
  );
  return withCors(request, env, response);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function parseCookies(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader.split(/;\s*/).reduce((acc, part) => {
    if (!part) return acc;
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function cookie(name, value, maxAge = 86400 * 7) {
  return `${name}=${encodeURIComponent(value)}; Path=/tiktok; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

function clearCookie(name) {
  return `${name}=; Path=/tiktok; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

function parseScopeList(scopeValue = "") {
  return scopeValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasScope(scopeValue, requiredScope) {
  return parseScopeList(scopeValue).includes(requiredScope);
}

function parseHeaderSession(request) {
  const accessToken = request.headers.get("X-TikTok-Access-Token") || "";
  if (!accessToken) return null;
  return {
    accessToken,
    scope: request.headers.get("X-TikTok-Scope") || "",
    openId: request.headers.get("X-TikTok-Open-Id") || "",
    source: "header",
  };
}

function createTikTokError(payload, fallback, status = 400) {
  const err = new Error(
    payload?.error?.message ||
      payload?.error_description ||
      payload?.message ||
      payload?.error ||
      fallback
  );
  err.code = payload?.error?.code || payload?.error || "tiktok_error";
  err.status = status;
  return err;
}

function assertTikTokOk(response, payload, fallback) {
  if (!response.ok || payload?.error?.code !== "ok") {
    throw createTikTokError(payload, fallback, response.status);
  }
}

function requireAccessToken(request, env) {
  const headerSession = parseHeaderSession(request);
  if (headerSession?.accessToken) {
    return { ok: true, session: headerSession };
  }

  const cookies = parseCookies(request);
  if (!cookies.tt_access_token) {
    return {
      ok: false,
      response: withCors(
        request,
        env,
        json({ error: "not_connected", message: "Connect TikTok first." }, { status: 401 })
      ),
    };
  }
  return {
    ok: true,
    session: {
      accessToken: cookies.tt_access_token,
      scope: cookies.tt_scope || "",
      openId: cookies.tt_open_id || "",
      source: "cookie",
    },
  };
}

function requireScope(request, env, session, scope) {
  if (hasScope(session.scope || "", scope)) {
    return { ok: true };
  }
  return {
    ok: false,
    response: withCors(
      request,
      env,
      json(
        {
          error: "missing_scope",
          message: `Reconnect TikTok with the ${scope} scope before using this action.`,
          requiredScope: scope,
          currentScope: parseScopeList(session.scope || ""),
        },
        { status: 403 }
      )
    ),
  };
}

async function fetchUserInfo(accessToken) {
  const response = await fetch(USER_INFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  assertTikTokOk(response, payload, "User info request failed");
  return payload.data?.user || null;
}

async function queryCreatorInfo(accessToken) {
  const response = await fetch(CREATOR_INFO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  assertTikTokOk(response, payload, "Creator info request failed");
  return payload.data || null;
}

async function uploadDraft(accessToken, videoUrl) {
  const response = await fetch(UPLOAD_INIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assertTikTokOk(response, payload, "Upload init failed");
  return payload.data || null;
}

async function createDirectPost(accessToken, requestBody) {
  const body = {
    post_info: {
      privacy_level: requestBody.privacyLevel,
      disable_comment: !Boolean(requestBody.allowComment),
      disable_duet: !Boolean(requestBody.allowDuet),
      disable_stitch: !Boolean(requestBody.allowStitch),
      brand_content_toggle: Boolean(requestBody.brandContentToggle),
      brand_organic_toggle: Boolean(requestBody.brandOrganicToggle),
      is_aigc: Boolean(requestBody.isAigc),
    },
    source_info: {
      source: "PULL_FROM_URL",
      video_url: requestBody.videoUrl,
    },
  };

  if (requestBody.title) {
    body.post_info.title = requestBody.title;
  }

  if (
    Number.isFinite(requestBody.videoCoverTimestampMs) &&
    requestBody.videoCoverTimestampMs >= 0
  ) {
    body.post_info.video_cover_timestamp_ms = requestBody.videoCoverTimestampMs;
  }

  const response = await fetch(DIRECT_POST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  assertTikTokOk(response, payload, "Direct post init failed");
  return payload.data || null;
}

async function fetchPublishStatus(accessToken, publishId) {
  const response = await fetch(STATUS_FETCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      publish_id: publishId,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assertTikTokOk(response, payload, "Status fetch failed");
  return payload.data || null;
}

async function handleConnect(request, env) {
  const stateBundle = await createStateBundle(env.STATE_SECRET);
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    response_type: "code",
    scope: env.TIKTOK_SCOPE || "video.upload",
    redirect_uri: env.TIKTOK_REDIRECT_URI,
    state: stateBundle.state,
  });

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: `${AUTH_URL}?${params.toString()}`,
    },
  });
  response.headers.append("Set-Cookie", cookie("tt_state_verifier", stateBundle.verifier, 600));
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
    throw createTikTokError(payload, "Token exchange failed", response.status);
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

function buildReturnUrl(env, tokenBundle) {
  const baseReturnUrl = env.APP_RETURN_URL
    ? `${env.APP_RETURN_URL}${env.APP_RETURN_URL.includes("?") ? "&" : "?"}connected=1`
    : env.ALLOWED_ORIGIN || "/";

  if (env.CLIENT_SESSION_BRIDGE !== "fragment") {
    return baseReturnUrl;
  }

  const fragment = new URLSearchParams({
    tt_access_token: tokenBundle.access_token || "",
    tt_scope: tokenBundle.scope || "",
    tt_open_id: tokenBundle.open_id || "",
  });
  return `${baseReturnUrl}#${fragment.toString()}`;
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const cookies = parseCookies(request);
  const verifier = cookies.tt_state_verifier || "";

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
    const returnUrl = buildReturnUrl(env, tokenBundle);

    const response = html(
      `<h1>TikTok authorization succeeded</h1>
       <p>Token exchange completed on the server side.</p>
       <ul>
         <li>open_id: <code>${tokenBundle.open_id || "n/a"}</code></li>
         <li>scope: <code>${tokenBundle.scope || "n/a"}</code></li>
         <li>access_token: <code>${redactedToken(tokenBundle.access_token) || "n/a"}</code></li>
         <li>refresh_token: <code>${redactedToken(tokenBundle.refresh_token) || "n/a"}</code></li>
         <li>sink: <code>${sinkResult ? "forwarded" : "not configured"}</code></li>
       </ul>
       <p><a href="${returnUrl}">Return to the workspace</a></p>
       <script>setTimeout(() => { location.href = ${JSON.stringify(returnUrl)}; }, 1800);</script>`,
      {
        status: 200,
      }
    );
    response.headers.append("Set-Cookie", clearCookie("tt_state_verifier"));
    response.headers.append(
      "Set-Cookie",
      cookie("tt_access_token", tokenBundle.access_token, tokenBundle.expires_in || 86400)
    );
    response.headers.append(
      "Set-Cookie",
      cookie(
        "tt_refresh_token",
        tokenBundle.refresh_token,
        tokenBundle.refresh_expires_in || 86400 * 30
      )
    );
    response.headers.append(
      "Set-Cookie",
      cookie("tt_open_id", tokenBundle.open_id || "", tokenBundle.expires_in || 86400)
    );
    response.headers.append(
      "Set-Cookie",
      cookie("tt_scope", tokenBundle.scope || "", tokenBundle.expires_in || 86400)
    );
    return response;
  } catch (err) {
    return html(`<h1>Token exchange failed</h1><p>${String(err.message || err)}</p>`, {
      status: 500,
    });
  }
}

async function handleSession(request, env) {
  const access = requireAccessToken(request, env);
  if (!access.ok) {
    return withCors(
      request,
      env,
      json({
        connected: false,
      })
    );
  }

  try {
    const user = await fetchUserInfo(access.session.accessToken);
    return withCors(
      request,
      env,
      json({
        connected: true,
        scope: access.session.scope || "",
        scopeList: parseScopeList(access.session.scope || ""),
        user,
      })
    );
  } catch (err) {
    const response = withCors(
      request,
      env,
      json(
        {
          connected: false,
          error: String(err.message || err),
        },
        { status: 401 }
      )
    );
    response.headers.append("Set-Cookie", clearCookie("tt_access_token"));
    response.headers.append("Set-Cookie", clearCookie("tt_refresh_token"));
    response.headers.append("Set-Cookie", clearCookie("tt_open_id"));
    response.headers.append("Set-Cookie", clearCookie("tt_scope"));
    return response;
  }
}

async function handleCreatorInfo(request, env) {
  const access = requireAccessToken(request, env);
  if (!access.ok) return access.response;

  const scopeCheck = requireScope(request, env, access.session, "video.publish");
  if (!scopeCheck.ok) return scopeCheck.response;

  try {
    const data = await queryCreatorInfo(access.session.accessToken);
    return withCors(request, env, json({ ok: true, data }));
  } catch (err) {
    return withCors(
      request,
      env,
      json(
        {
          error: err.code || "creator_info_failed",
          message: String(err.message || err),
        },
        { status: err.status || 400 }
      )
    );
  }
}

async function handleUploadDraft(request, env) {
  const access = requireAccessToken(request, env);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => ({}));
  const videoUrl = body.videoUrl;
  if (!videoUrl) {
    return withCors(
      request,
      env,
      json({ error: "missing_video_url", message: "videoUrl is required." }, { status: 400 })
    );
  }

  try {
    const data = await uploadDraft(access.session.accessToken, videoUrl);
    return withCors(
      request,
      env,
      json({
        ok: true,
        mode: "upload_fallback",
        publishId: data.publish_id,
      })
    );
  } catch (err) {
    return withCors(
      request,
      env,
      json(
        {
          error: err.code || "upload_failed",
          message: String(err.message || err),
        },
        { status: err.status || 400 }
      )
    );
  }
}

async function handleDirectPost(request, env) {
  const access = requireAccessToken(request, env);
  if (!access.ok) return access.response;

  const scopeCheck = requireScope(request, env, access.session, "video.publish");
  if (!scopeCheck.ok) return scopeCheck.response;

  const body = await request.json().catch(() => ({}));
  if (!body.videoUrl) {
    return withCors(
      request,
      env,
      json({ error: "missing_video_url", message: "videoUrl is required." }, { status: 400 })
    );
  }
  if (!body.privacyLevel) {
    return withCors(
      request,
      env,
      json({ error: "missing_privacy_level", message: "privacyLevel is required." }, { status: 400 })
    );
  }

  try {
    const data = await createDirectPost(access.session.accessToken, body);
    return withCors(
      request,
      env,
      json({
        ok: true,
        mode: "direct_post",
        publishId: data.publish_id,
      })
    );
  } catch (err) {
    return withCors(
      request,
      env,
      json(
        {
          error: err.code || "direct_post_failed",
          message: String(err.message || err),
        },
        { status: err.status || 400 }
      )
    );
  }
}

async function handleStatus(request, env) {
  const access = requireAccessToken(request, env);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const publishId = url.searchParams.get("publish_id");
  if (!publishId) {
    return withCors(
      request,
      env,
      json({ error: "missing_publish_id", message: "publish_id is required." }, { status: 400 })
    );
  }

  try {
    const data = await fetchPublishStatus(access.session.accessToken, publishId);
    return withCors(request, env, json({ ok: true, data }));
  } catch (err) {
    return withCors(
      request,
      env,
      json(
        {
          error: err.code || "status_failed",
          message: String(err.message || err),
        },
        { status: err.status || 400 }
      )
    );
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return preflight(request, env);
      }

      if (url.pathname === "/tiktok/health") {
        return withCors(
          request,
          env,
          json({
            ok: true,
            path: url.pathname,
            configured: Boolean(
              env.TIKTOK_CLIENT_KEY &&
                env.TIKTOK_CLIENT_SECRET &&
                env.TIKTOK_REDIRECT_URI &&
                env.STATE_SECRET
            ),
            scope: env.TIKTOK_SCOPE || "video.upload",
            scopeList: parseScopeList(env.TIKTOK_SCOPE || "video.upload"),
            capabilities: {
              session: true,
              uploadDraft: true,
              creatorInfo: hasScope(env.TIKTOK_SCOPE || "", "video.publish"),
              directPost: hasScope(env.TIKTOK_SCOPE || "", "video.publish"),
              status: true,
            },
            sessionBridge: env.CLIENT_SESSION_BRIDGE || "cookie",
          })
        );
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

      if (url.pathname === "/tiktok/session") {
        return handleSession(request, env);
      }

      if (url.pathname === "/tiktok/creator-info" && request.method === "POST") {
        return handleCreatorInfo(request, env);
      }

      if (url.pathname === "/tiktok/direct-post" && request.method === "POST") {
        return handleDirectPost(request, env);
      }

      if (url.pathname === "/tiktok/upload-draft" && request.method === "POST") {
        return handleUploadDraft(request, env);
      }

      if (url.pathname === "/tiktok/status") {
        return handleStatus(request, env);
      }

      return html(
        `<h1>TikTok OAuth Worker</h1>
         <p>Use <code>/tiktok/connect</code> to start authorization.</p>
         <p>Use <code>/tiktok/session</code> to inspect the current connection.</p>
         <p>Use <code>/tiktok/creator-info</code> to load creator posting settings for Direct Post review.</p>
         <p>Use <code>/tiktok/direct-post</code> to initialize a Direct Post publish request.</p>
         <p>Use <code>/tiktok/upload-draft</code> to initialize the Upload API fallback flow.</p>
         <p>Use <code>/tiktok/health</code> to verify deployment and active scopes.</p>`,
        { status: 200 }
      );
    } catch (err) {
      return html(`<h1>Worker exception</h1><p><code>${String(err?.message || err)}</code></p>`, {
        status: 500,
      });
    }
  },
};
