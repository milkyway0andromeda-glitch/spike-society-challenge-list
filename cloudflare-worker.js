const OWNER = "milkyway0andromeda-glitch";
const REPO = "spike-society-challenge-list";
const BRANCH = "main";

const MOD_USERS = [
  "milkyway0andromeda-glitch",
  "LimeTime03"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return new Response(
          "Spike Society auth worker is online."
        );
      }

      if (url.pathname === "/login") {
        return startLogin(request, env);
      }

      if (url.pathname === "/callback") {
        return finishLogin(request, env);
      }

      if (url.pathname === "/me") {
        return getMe(request, env);
      }

      if (url.pathname === "/repo-file") {
        return repoFile(request, env);
      }

      if (request.method === "OPTIONS") {
        return corsPreflight(env);
      }

      return new Response(
        "Not found",
        { status: 404 }
      );

    } catch (err) {
      console.error(err);

      return json(
        {
          ok: false,
          error: "server_error",
          message:
            err instanceof Error
              ? err.message
              : String(err)
        },
        500,
        env
      );
    }
  }
};


// ============================================================
// LOGIN
// ============================================================

async function startLogin(request, env) {
  // Create a random OAuth state.
  const state =
    base64url(
      crypto.getRandomValues(
        new Uint8Array(24)
      )
    );

  // Sign/encrypt the state so we don't need an OAuth cookie.
  const stateToken =
    await encryptSession(
      {
        state,
        exp:
          Date.now() +
          10 * 60 * 1000
      },
      env.SESSION_SECRET
    );

  const callback =
    new URL(
      "/callback",
      request.url
    ).toString();

  const github =
    new URL(
      "https://github.com/login/oauth/authorize"
    );

  github.searchParams.set(
    "client_id",
    env.GITHUB_CLIENT_ID
  );

  github.searchParams.set(
    "redirect_uri",
    callback
  );

  github.searchParams.set(
    "scope",
    "read:user repo"
  );

  // The encrypted state is what GitHub sends back.
  github.searchParams.set(
    "state",
    stateToken
  );

  return Response.redirect(
    github.toString(),
    302
  );
}


// ============================================================
// CALLBACK
// ============================================================

async function finishLogin(
  request,
  env
) {
  const url =
    new URL(request.url);

  const code =
    url.searchParams.get(
      "code"
    );

  const returnedState =
    url.searchParams.get(
      "state"
    );

  if (!code || !returnedState) {
    return authFailure(
      env,
      "GitHub did not return a login code."
    );
  }

  // Verify/decrypt OAuth state.
  let savedState;

  try {
    savedState =
      await decryptSession(
        returnedState,
        env.SESSION_SECRET
      );
  } catch (err) {
    console.error(
      "OAuth state decrypt failed:",
      err
    );

    return authFailure(
      env,
      "Invalid login session."
    );
  }

  if (
    !savedState ||
    !savedState.state ||
    !savedState.exp ||
    Date.now() >
      savedState.exp
  ) {
    return authFailure(
      env,
      "Login session expired. Please try again."
    );
  }

  // The returned state token itself is encrypted,
  // so successful decryption proves it was created
  // by this Worker.
  if (!savedState.state) {
    return authFailure(
      env,
      "Invalid login state."
    );
  }


  // ==========================================================
  // EXCHANGE CODE FOR GITHUB TOKEN
  // ==========================================================

  const callback =
    new URL(
      "/callback",
      request.url
    ).toString();

  const tokenResponse =
    await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          "User-Agent":
            "Spike-Society-Mod"
        },

        body:
          JSON.stringify({
            client_id:
              env.GITHUB_CLIENT_ID,

            client_secret:
              env.GITHUB_CLIENT_SECRET,

            code,

            redirect_uri:
              callback
          })
      }
    );

  const tokenData =
    await tokenResponse.json();

  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {
    console.error(
      "GitHub token exchange failed:",
      tokenData
    );

    return authFailure(
      env,
      "GitHub login failed."
    );
  }

  const githubToken =
    tokenData.access_token;


  // ==========================================================
  // GET USER
  // ==========================================================

  const userResponse =
    await githubApi(
      "https://api.github.com/user",
      githubToken
    );

  if (!userResponse.ok) {
    return authFailure(
      env,
      "Could not read your GitHub account."
    );
  }

  const user =
    await userResponse.json();


  // ==========================================================
  // MOD ACCESS
  // ==========================================================

  const access =
    await getModAccess(
      user.login,
      githubToken
    );

  console.log(
    "GitHub login:",
    user.login
  );

  console.log(
    "Permission:",
    access.permission
  );

  console.log(
    "Contributor:",
    access.contributor
  );

  console.log(
    "Explicit MOD:",
    access.explicitMod
  );

  console.log(
    "Can MOD:",
    access.canMod
  );


  // ==========================================================
  // CREATE SESSION TOKEN
  // ==========================================================

  const sessionToken =
    await encryptSession(
      {
        githubToken,
        login:
          user.login,

        avatar:
          user.avatar_url ||
          null,

        exp:
          Date.now() +
          8 * 60 * 60 * 1000
      },
      env.SESSION_SECRET
    );


  // IMPORTANT:
  //
  // Your auth.js expects github_session
  // in the URL hash.
  //
  const redirectUrl =
    `${env.SITE_URL}/#github_session=${encodeURIComponent(
      sessionToken
    )}`;

  return Response.redirect(
    redirectUrl,
    302
  );
}


// ============================================================
// MOD ACCESS
// ============================================================

async function getModAccess(
  login,
  token
) {
  let permission =
    "none";

  let contributor =
    false;


  // ----------------------------------------------------------
  // EXPLICIT MOD USERS
  // ----------------------------------------------------------

  const explicitMod =
    MOD_USERS.some(
      username =>
        username.toLowerCase() ===
        login.toLowerCase()
    );


  // ----------------------------------------------------------
  // OWNER
  // ----------------------------------------------------------

  if (
    login.toLowerCase() ===
    OWNER.toLowerCase()
  ) {
    return {
      permission:
        "admin",

      contributor:
        true,

      explicitMod:
        true,

      canMod:
        true
    };
  }


  // ----------------------------------------------------------
  // COLLABORATOR PERMISSION
  // ----------------------------------------------------------

  try {
    const response =
      await githubApi(
        `https://api.github.com/repos/${OWNER}/${REPO}/collaborators/${encodeURIComponent(login)}/permission`,
        token
      );

    if (response.ok) {
      const data =
        await response.json();

      permission =
        data.permission ||
        "none";
    }

  } catch (err) {
    console.error(
      "Permission check failed:",
      err
    );
  }


  // ----------------------------------------------------------
  // CONTRIBUTOR CHECK
  // ----------------------------------------------------------

  try {
    contributor =
      await isRepoContributor(
        login,
        token
      );

  } catch (err) {
    console.error(
      "Contributor check failed:",
      err
    );
  }


  // ----------------------------------------------------------
  // FINAL RESULT
  // ----------------------------------------------------------

  const canMod =
    explicitMod ||
    permission === "admin" ||
    permission === "write" ||
    contributor;

  return {
    permission,
    contributor,
    explicitMod,
    canMod
  };
}


// ============================================================
// CONTRIBUTOR CHECK
// ============================================================

async function isRepoContributor(
  login,
  token
) {
  const target =
    String(login).toLowerCase();

  for (
    let page = 1;
    page <= 10;
    page++
  ) {
    const response =
      await githubApi(
        `https://api.github.com/repos/${OWNER}/${REPO}/contributors?per_page=100&page=${page}`,
        token
      );

    if (!response.ok) {
      console.error(
        "Contributor request failed:",
        response.status
      );

      return false;
    }

    const contributors =
      await response.json();

    if (
      !Array.isArray(
        contributors
      ) ||
      contributors.length === 0
    ) {
      return false;
    }

    for (
      const contributor of
      contributors
    ) {
      if (
        contributor &&
        contributor.login &&
        contributor.login.toLowerCase() ===
          target
      ) {
        return true;
      }
    }

    if (
      contributors.length < 100
    ) {
      return false;
    }
  }

  return false;
}


// ============================================================
// /ME
// ============================================================

async function getMe(
  request,
  env
) {
  if (
    request.method ===
    "OPTIONS"
  ) {
    return corsPreflight(env);
  }

  const auth =
    await authorize(
      request,
      env
    );

  if (!auth.ok) {
    return json(
      {
        authenticated:
          false,

        canMod:
          false
      },
      auth.status,
      env
    );
  }

  return json(
    {
      authenticated:
        true,

      login:
        auth.session.login,

      avatar:
        auth.session.avatar,

      permission:
        auth.permission,

      contributor:
        auth.contributor,

      explicitMod:
        auth.explicitMod,

      canMod:
        auth.canMod
    },
    200,
    env
  );
}


// ============================================================
// REPO FILE
// ============================================================

async function repoFile(
  request,
  env
) {
  if (
    request.method ===
    "OPTIONS"
  ) {
    return corsPreflight(env);
  }

  const auth =
    await authorize(
      request,
      env
    );

  if (!auth.ok) {
    return json(
      {
        error:
          "unauthorized",

        message:
          "MOD access required."
      },
      auth.status,
      env
    );
  }

  if (!auth.canMod) {
    return json(
      {
        error:
          "forbidden",

        message:
          "Your GitHub account does not have MOD access."
      },
      403,
      env
    );
  }


  // ----------------------------------------------------------
  // GET
  // ----------------------------------------------------------

  if (
    request.method ===
    "GET"
  ) {
    const path =
      new URL(request.url)
        .searchParams
        .get("path") ||
      "";

    if (
      !safeRepoPath(path)
    ) {
      return json(
        {
          error:
            "bad_path",

          message:
            "Invalid repository path."
        },
        400,
        env
      );
    }

    const response =
      await githubApi(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(BRANCH)}`,
        auth.session.githubToken
      );

    const body =
      await response.text();

    return new Response(
      body,
      {
        status:
          response.status,

        headers:
          corsHeaders(
            env,
            {
              "Content-Type":
                "application/json",

              "Cache-Control":
                "no-store"
            }
          )
      }
    );
  }


  // ----------------------------------------------------------
  // PUT
  // ----------------------------------------------------------

  if (
    request.method ===
    "PUT"
  ) {
    const body =
      await request.json();

    const path =
      String(
        body.path ||
        ""
      );

    if (
      !safeRepoPath(path)
    ) {
      return json(
        {
          error:
            "bad_path",

          message:
            "Invalid repository path."
        },
        400,
        env
      );
    }

    if (
      typeof body.content !==
        "string" ||
      !body.content
    ) {
      return json(
        {
          error:
            "bad_content",

          message:
            "Missing file content."
        },
        400,
        env
      );
    }

    const payload = {
      message:
        String(
          body.message ||
          "Update Spike Society data"
        ),

      content:
        body.content,

      branch:
        BRANCH
    };

    if (body.sha) {
      payload.sha =
        String(body.sha);
    }

    const response =
      await githubApi(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeRepoPath(path)}`,
        auth.session.githubToken,
        {
          method:
            "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      return json(
        {
          error:
            "github_error",

          message:
            data.message ||
            "GitHub update failed."
        },
        response.status,
        env
      );
    }

    return json(
      {
        ok:
          true,

        sha:
          data.content?.sha ||
          null,

        commit:
          data.commit?.sha ||
          null
      },
      200,
      env
    );
  }


  return json(
    {
      error:
        "method_not_allowed"
    },
    405,
    env
  );
}


// ============================================================
// AUTHORIZE SESSION
// ============================================================

async function authorize(
  request,
  env
) {
  const token =
    getBearerToken(
      request
    );

  if (!token) {
    return {
      ok:
        false,

      status:
        401
    };
  }

  let session;

  try {
    session =
      await decryptSession(
        token,
        env.SESSION_SECRET
      );

  } catch {
    return {
      ok:
        false,

      status:
        401
    };
  }

  if (
    !session ||
    !session.exp ||
    Date.now() >
      session.exp ||
    !session.githubToken ||
    !session.login
  ) {
    return {
      ok:
        false,

      status:
        401
    };
  }


  // Re-check access every request.
  const access =
    await getModAccess(
      session.login,
      session.githubToken
    );

  return {
    ok:
      true,

    status:
      200,

    session,

    permission:
      access.permission,

    contributor:
      access.contributor,

    explicitMod:
      access.explicitMod,

    canMod:
      access.canMod
  };
}


// ============================================================
// GITHUB API
// ============================================================

async function githubApi(
  url,
  token,
  options = {}
) {
  const headers =
    new Headers(
      options.headers || {}
    );

  headers.set(
    "Accept",
    "application/vnd.github+json"
  );

  headers.set(
    "Authorization",
    `Bearer ${token}`
  );

  headers.set(
    "X-GitHub-Api-Version",
    "2022-11-28"
  );

  headers.set(
    "User-Agent",
    "Spike-Society-Mod"
  );

  return fetch(
    url,
    {
      ...options,
      headers
    }
  );
}


// ============================================================
// BEARER TOKEN
// ============================================================

function getBearerToken(
  request
) {
  const header =
    request.headers.get(
      "Authorization"
    ) || "";

  if (
    header.startsWith(
      "Bearer "
    )
  ) {
    return header.slice(7);
  }

  return null;
}


// ============================================================
// AUTH FAILURE
// ============================================================

function authFailure(
  env,
  message
) {
  return Response.redirect(
    `${env.SITE_URL}/#github_auth_error=${encodeURIComponent(
      message
    )}`,
    302
  );
}


// ============================================================
// JSON
// ============================================================

function json(
  data,
  status,
  env
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers:
        corsHeaders(
          env,
          {
            "Content-Type":
              "application/json",

            "Cache-Control":
              "no-store"
          }
        )
    }
  );
}


// ============================================================
// CORS
// ============================================================

function corsPreflight(
  env
) {
  return new Response(
    null,
    {
      status:
        204,

      headers:
        corsHeaders(
          env
        )
    }
  );
}


function corsHeaders(
  env,
  extra = {}
) {
  return {
    "Access-Control-Allow-Origin":
      env.SITE_URL,

    "Access-Control-Allow-Headers":
      "Authorization, Content-Type",

    "Access-Control-Allow-Methods":
      "GET, PUT, OPTIONS",

    "Access-Control-Max-Age":
      "86400",

    "Vary":
      "Origin",

    ...extra
  };
}


// ============================================================
// SESSION ENCRYPTION
// ============================================================

async function getEncryptionKey(
  secret
) {
  const material =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        secret
      )
    );

  return crypto.subtle.importKey(
    "raw",
    material,
    {
      name:
        "AES-GCM"
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}


async function encryptSession(
  value,
  secret
) {
  const key =
    await getEncryptionKey(
      secret
    );

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const plain =
    new TextEncoder().encode(
      JSON.stringify(value)
    );

  const cipher =
    await crypto.subtle.encrypt(
      {
        name:
          "AES-GCM",

        iv
      },
      key,
      plain
    );

  const combined =
    new Uint8Array(
      iv.length +
      cipher.byteLength
    );

  combined.set(
    iv,
    0
  );

  combined.set(
    new Uint8Array(cipher),
    iv.length
  );

  return base64url(
    combined
  );
}


async function decryptSession(
  token,
  secret
) {
  const combined =
    fromBase64url(
      token
    );

  const iv =
    combined.slice(
      0,
      12
    );

  const cipher =
    combined.slice(
      12
    );

  const key =
    await getEncryptionKey(
      secret
    );

  const plain =
    await crypto.subtle.decrypt(
      {
        name:
          "AES-GCM",

        iv
      },
      key,
      cipher
    );

  return JSON.parse(
    new TextDecoder().decode(
      plain
    )
  );
}


// ============================================================
// BASE64URL
// ============================================================

function base64url(
  bytes
) {
  let binary =
    "";

  for (
    const byte of bytes
  ) {
    binary +=
      String.fromCharCode(
        byte
      );
  }

  return btoa(binary)
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/g,
      ""
    );
}


function fromBase64url(
  value
) {
  let base64 =
    value
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      );

  while (
    base64.length % 4
  ) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


// ============================================================
// REPOSITORY PATH SAFETY
// ============================================================

function safeRepoPath(
  path
) {
  if (
    !path ||
    path.includes("..") ||
    path.startsWith("/") ||
    path.includes("\\")
  ) {
    return false;
  }

  return (
    path ===
      "data/levels.json" ||

    path ===
      "data/players.json" ||

    /^images\/[A-Za-z0-9._-]+$/
      .test(path)
  );
}


function encodeRepoPath(
  path
) {
  return path
    .split("/")
    .map(
      encodeURIComponent
    )
    .join("/");
}