const AUTH_WORKER = "https://spike-society-auth.milkyway0andromeda.workers.dev";
const SESSION_KEY = "spike_github_session";

function consumeAuthRedirect() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const session = hash.get("github_session");
  const error = hash.get("github_auth_error");

  if (session) {
    sessionStorage.setItem(SESSION_KEY, session);
    history.replaceState(null, "", location.pathname + location.search);
  } else if (error) {
    sessionStorage.removeItem(SESSION_KEY);
    history.replaceState(null, "", location.pathname + location.search);
    console.error("GitHub login failed:", error);
  }
}

function getAuthSession() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

function signInWithGitHub() {
  location.href = `${AUTH_WORKER}/login`;
}

function signOutGitHub() {
  sessionStorage.removeItem(SESSION_KEY);
  location.href = "index.html";
}

async function getCurrentGitHubUser() {
  const session = getAuthSession();
  if (!session) return null;

  const response = await fetch(`${AUTH_WORKER}/me`, {
    headers: { Authorization: `Bearer ${session}` }
  });

  if (!response.ok) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }

  return response.json();
}

async function setupAuthNav() {
  consumeAuthRedirect();
  const slot = document.getElementById("auth-nav-slot");
  if (!slot) return;

  const session = getAuthSession();
  if (!session) {
    slot.innerHTML = `<button class="nav-button auth-button" id="github-signin">SIGN IN WITH GITHUB</button>`;
    document.getElementById("github-signin").addEventListener("click", signInWithGitHub);
    return;
  }

  try {
    const user = await getCurrentGitHubUser();
    if (!user) return setupAuthNav();

    if (user.canMod) {
      slot.innerHTML = `
        <a class="nav-button mod-nav" href="mod.html">MOD</a>
        <button class="nav-button auth-user" id="github-signout" title="Signed in as ${escapeAuthHtml(user.login)} — click to sign out">
          <img src="${escapeAuthHtml(user.avatar)}" alt="" class="auth-avatar">${escapeAuthHtml(user.login)}
        </button>`;
      document.getElementById("github-signout").addEventListener("click", signOutGitHub);
    } else {
      slot.innerHTML = `
        <button class="nav-button auth-user" id="github-signout" title="Signed in as ${escapeAuthHtml(user.login)} — no MOD access. Click to sign out">
          <img src="${escapeAuthHtml(user.avatar)}" alt="" class="auth-avatar">${escapeAuthHtml(user.login)}
        </button>`;
      document.getElementById("github-signout").addEventListener("click", signOutGitHub);
    }
  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(SESSION_KEY);
    slot.innerHTML = `<button class="nav-button auth-button" id="github-signin">SIGN IN WITH GITHUB</button>`;
    document.getElementById("github-signin").addEventListener("click", signInWithGitHub);
  }
}

function escapeAuthHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", setupAuthNav);
