const REPO_OWNER = "milkyway0andromeda-glitch";
const REPO_NAME = "spike-society-challenge-list";
const AUTH_BASE = (window.SPIKE_AUTH_BASE_URL || "").replace(/\/$/, "");

const Auth = {
  token: sessionStorage.getItem("spike_github_token") || "",
  user: JSON.parse(sessionStorage.getItem("spike_github_user") || "null"),
  permission: sessionStorage.getItem("spike_repo_permission") || "",

  configured() {
    return Boolean(AUTH_BASE);
  },

  async beginLogin() {
    if (!this.configured()) {
      throw new Error("GitHub sign-in is not configured yet. Set SPIKE_AUTH_BASE_URL in auth-config.js after deploying the OAuth worker.");
    }
    const returnTo = new URL("index.html", window.location.href).href;
    window.location.href = `${AUTH_BASE}/login?return_to=${encodeURIComponent(returnTo)}`;
  },

  async finishLoginFromCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state || !this.configured()) return false;

    const response = await fetch(`${AUTH_BASE}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, redirect_uri: new URL("index.html", window.location.href).href })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error(data.error || "GitHub sign-in failed.");

    this.token = data.access_token;
    sessionStorage.setItem("spike_github_token", this.token);
    history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    await this.refreshIdentity();
    return true;
  },

  async refreshIdentity() {
    if (!this.token) return null;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2026-03-10"
    };

    const [userRes, repoRes] = await Promise.all([
      fetch("https://api.github.com/user", { headers }),
      fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, { headers })
    ]);
    if (!userRes.ok || !repoRes.ok) {
      this.logout();
      throw new Error("Could not verify your GitHub account or repository access.");
    }

    const user = await userRes.json();
    const repo = await repoRes.json();
    const p = repo.permissions || {};
    const permission = p.admin ? "admin" : p.maintain ? "maintain" : p.push ? "push" : p.triage ? "triage" : p.pull ? "pull" : "none";

    this.user = user;
    this.permission = permission;
    sessionStorage.setItem("spike_github_user", JSON.stringify(user));
    sessionStorage.setItem("spike_repo_permission", permission);
    return { user, permission };
  },

  canModerate() {
    return ["push", "maintain", "admin"].includes(this.permission);
  },

  logout() {
    this.token = "";
    this.user = null;
    this.permission = "";
    sessionStorage.removeItem("spike_github_token");
    sessionStorage.removeItem("spike_github_user");
    sessionStorage.removeItem("spike_repo_permission");
  }
};

window.SpikeAuth = Auth;
