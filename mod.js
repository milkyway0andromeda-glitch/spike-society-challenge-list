let levels = [];
let players = [];
let originalLevels = [];
let originalPlayers = [];
let fileShas = { levels: null, players: null };
let pendingImages = [];
let changes = [];

const $ = id => document.getElementById(id);

window.addEventListener("DOMContentLoaded", initMod);

async function initMod() {
  try {
    consumeRedirectSession();
    const session = sessionStorage.getItem(SESSION_KEY);
    if (!session) return denyAccess();

    const me = await workerFetch("/me");
    if (!me.ok) return denyAccess();
    const user = await me.json();
    if (!user.canMod) return denyAccess();

    const [levelsFile, playersFile] = await Promise.all([
      getRepoFile("data/levels.json"),
      getRepoFile("data/players.json")
    ]);

    levels = JSON.parse(decodeBase64Utf8(levelsFile.content));
    players = JSON.parse(decodeBase64Utf8(playersFile.content));
    normalizeRanks();

    originalLevels = structuredClone(levels);
    originalPlayers = structuredClone(players);
    fileShas.levels = levelsFile.sha;
    fileShas.players = playersFile.sha;

    $("mod-loading").remove();
    $("admin-workspace").hidden = false;
    $("admin-workspace").classList.remove("disabled-workspace");

    $("add-level-form").addEventListener("submit", addLevel);
    $("move-level-form").addEventListener("submit", moveLevel);
    $("add-victor-form").addEventListener("submit", addVictor);
    $("remove-victor-form").addEventListener("submit", removeVictor);
    $("remove-victor-level-select").addEventListener("change", refreshRemoveVictorOptions);
    $("save-button").addEventListener("click", saveChanges);
    $("discard-button").addEventListener("click", discardChanges);
    refreshUI();
  } catch (error) {
  console.error(error);
  denyAccess("Could not load MOD tools: " + (error.message || error));
}
}

function consumeRedirectSession() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const session = hash.get("github_session");
  if (session) {
    sessionStorage.setItem(SESSION_KEY, session);
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function denyAccess(message = "You do not have MOD access to this repository.") {
  const loading = $("mod-loading");
  if (loading) loading.innerHTML = `<div class="admin-panel-body"><div class="admin-status error">${escapeHTML(message)}</div><div class="admin-actions"><a class="admin-button" href="index.html">BACK</a></div></div>`;
  $("admin-workspace").hidden = true;
}

async function workerFetch(path, options = {}) {
  const session = sessionStorage.getItem(SESSION_KEY);
  const headers = new Headers(options.headers || {});
  if (session) headers.set("Authorization", `Bearer ${session}`);
  return fetch(`${AUTH_WORKER}${path}`, { ...options, headers });
}

async function getRepoFile(path) {
  const response = await workerFetch(`/repo-file?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(await workerError(response));
  return response.json();
}

function addLevel(event) {
  event.preventDefault();
  const name = $("level-name").value.trim();
  const id = uniqueSlug(slugify(name));
  const desiredRank = clampRank(Number($("level-rank").value), levels.length + 1);
  const imageFile = $("level-image-file").files[0] || null;
  const extension = imageFile ? extensionForImage(imageFile) : "png";
  const imagePath = `images/${id}.${extension}`;

  const level = {
    id,
    gdId: Number($("level-gd-id").value),
    rank: desiredRank,
    name,
    points: Number($("level-points").value),
    creator: $("level-creator").value.trim(),
    verifier: $("level-verifier").value.trim(),
    video: $("level-video").value.trim(),
    image: imagePath,
    victors: []
  };

  const ordered = sortedLevels();
  ordered.splice(desiredRank - 1, 0, level);
  levels = ordered;
  normalizeRanks();
  ensurePlayer(level.verifier);
  if (imageFile) pendingImages.push({ path: imagePath, file: imageFile });
  changes.push(`Added ${name} at #${desiredRank}`);
  event.target.reset();
  refreshUI();
}

function moveLevel(event) {
  event.preventDefault();
  const id = $("move-level-select").value;
  const desiredRank = clampRank(Number($("move-level-rank").value), levels.length);
  const ordered = sortedLevels();
  const oldIndex = ordered.findIndex(level => level.id === id);
  if (oldIndex < 0) return;
  const [level] = ordered.splice(oldIndex, 1);
  ordered.splice(desiredRank - 1, 0, level);
  levels = ordered;
  normalizeRanks();
  changes.push(`Moved ${level.name} from #${oldIndex + 1} to #${desiredRank}`);
  refreshUI();
}

function addVictor(event) {
  event.preventDefault();
  const level = levels.find(item => item.id === $("victor-level-select").value);
  const playerName = $("victor-player").value.trim();
  if (!level || !playerName) return;
  level.victors = Array.isArray(level.victors) ? level.victors : [];
  if (level.verifier.toLowerCase() === playerName.toLowerCase()) return setSaveStatus(`${playerName} is already the verifier.`, "error");
  if (level.victors.some(name => name.toLowerCase() === playerName.toLowerCase())) return setSaveStatus(`${playerName} is already a victor of ${level.name}.`, "error");
  const canonicalName = ensurePlayer(playerName);
  level.victors.push(canonicalName);
  changes.push(`Added ${canonicalName} as a victor of ${level.name}`);
  $("victor-player").value = "";
  refreshUI();
}

function removeVictor(event) {
  event.preventDefault();
  const level = levels.find(item => item.id === $("remove-victor-level-select").value);
  const playerName = $("remove-victor-player-select").value;
  if (!level || !playerName) return;
  const index = level.victors.findIndex(name => name === playerName);
  if (index < 0) return;
  level.victors.splice(index, 1);
  changes.push(`Removed ${playerName} as a victor of ${level.name}`);
  refreshUI();
}

function ensurePlayer(name) {
  const existing = players.find(player => player.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.name;
  players.push({ name, completed: [] });
  return name;
}

function refreshUI() {
  const ordered = sortedLevels();
  const options = ordered.map(level => `<option value="${escapeAttribute(level.id)}">#${level.rank} — ${escapeHTML(level.name)}</option>`).join("");
  $("move-level-select").innerHTML = options;
  $("victor-level-select").innerHTML = options;
  $("remove-victor-level-select").innerHTML = options;
  $("player-options").innerHTML = [...players].sort((a,b)=>a.name.localeCompare(b.name)).map(player => `<option value="${escapeAttribute(player.name)}"></option>`).join("");
  $("level-rank").max = levels.length + 1;
  $("level-rank").value = levels.length + 1;
  $("move-level-rank").max = Math.max(1, levels.length);
  refreshRemoveVictorOptions();
  refreshPendingSummary();
}

function refreshRemoveVictorOptions() {
  const level = levels.find(item => item.id === $("remove-victor-level-select").value);
  const victors = level && Array.isArray(level.victors) ? level.victors : [];
  $("remove-victor-player-select").innerHTML = victors.length ? victors.map(name => `<option value="${escapeAttribute(name)}">${escapeHTML(name)}</option>`).join("") : `<option value="">No victors</option>`;
}

function refreshPendingSummary() {
  if (!changes.length) {
    $("pending-summary").textContent = "No changes yet.";
    $("save-button").disabled = true;
    return;
  }
  $("pending-summary").innerHTML = `<strong>${changes.length} pending change${changes.length === 1 ? "" : "s"}</strong><ul>${changes.map(change => `<li>${escapeHTML(change)}</li>`).join("")}</ul>`;
  $("save-button").disabled = false;
}

function discardChanges() {
  levels = structuredClone(originalLevels);
  players = structuredClone(originalPlayers);
  pendingImages = [];
  changes = [];
  refreshUI();
  setSaveStatus("Pending changes discarded.", "muted");
}

async function saveChanges() {
  if (!changes.length) return;
  $("save-button").disabled = true;
  $("discard-button").disabled = true;
  setSaveStatus("Saving to GitHub…", "muted");

  try {
    for (const image of pendingImages) {
      const existing = await workerFetch(`/repo-file?path=${encodeURIComponent(image.path)}`);
      let sha = null;
      if (existing.ok) sha = (await existing.json()).sha;
      else if (existing.status !== 404) throw new Error(await workerError(existing));
      await putRepoFile(image.path, await fileToBase64(image.file), sha, `Add thumbnail for ${image.path.split('/').pop()}`);
    }

    fileShas.levels = await putJsonFile("data/levels.json", levels, fileShas.levels, "Update challenge list");
    fileShas.players = await putJsonFile("data/players.json", players, fileShas.players, "Update challenge players");

    originalLevels = structuredClone(levels);
    originalPlayers = structuredClone(players);
    pendingImages = [];
    changes = [];
    refreshUI();
    setSaveStatus("Saved to GitHub successfully. GitHub Pages may take a moment to update.", "success");
  } catch (error) {
    console.error(error);
    setSaveStatus(error.message || "Save failed.", "error");
    $("save-button").disabled = false;
  } finally {
    $("discard-button").disabled = false;
  }
}

async function putJsonFile(path, data, sha, message) {
  const text = JSON.stringify(data, null, 2) + "\n";
  return putRepoFile(path, encodeBase64Utf8(text), sha, message);
}

async function putRepoFile(path, content, sha, message) {
  const response = await workerFetch("/repo-file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, sha, message })
  });
  if (!response.ok) throw new Error(await workerError(response));
  const result = await response.json();
  return result.sha;
}

async function workerError(response) {
  try {
    const data = await response.json();
    return data.message || data.error || `Request failed with ${response.status}.`;
  } catch { return `Request failed with ${response.status}.`; }
}

function sortedLevels() { return [...levels].sort((a,b)=>a.rank-b.rank); }
function normalizeRanks() {
  levels.forEach((level, index) => {
    level.rank = index + 1;
  });
}
function clampRank(rank,max) { return Math.max(1, Math.min(Number.isFinite(rank)?Math.floor(rank):max,max)); }
function uniqueSlug(base) { let id=base||"level"; let n=2; while(levels.some(level=>level.id===id)) id=`${base}-${n++}`; return id; }
function slugify(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function extensionForImage(file) { if(file.type==="image/jpeg") return "jpg"; if(file.type==="image/webp") return "webp"; return "png"; }
function fileToBase64(file) { return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result).split(",")[1]); r.onerror=reject; r.readAsDataURL(file); }); }
function encodeBase64Utf8(text) { const bytes=new TextEncoder().encode(text); let binary=""; bytes.forEach(byte=>binary+=String.fromCharCode(byte)); return btoa(binary); }
function decodeBase64Utf8(base64) { const binary=atob(base64.replace(/\n/g,"")); const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function setSaveStatus(message,type) { const el=$("save-status"); el.textContent=message; el.className=`admin-status ${type}`; }
function escapeHTML(value) { return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function escapeAttribute(value) { return escapeHTML(value); }
