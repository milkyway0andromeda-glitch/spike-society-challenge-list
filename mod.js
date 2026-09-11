const REPO_OWNER = "milkyway0andromeda-glitch";
const REPO_NAME = "spike-society-challenge-list";
const BRANCH = "main";

let levels = [];
let players = [];
let originalLevels = [];
let originalPlayers = [];
let fileShas = { levels: null, players: null };
let pendingImages = [];
let changes = [];

const $ = id => document.getElementById(id);

$("add-level-form").addEventListener("submit", addLevel);
$("move-level-form").addEventListener("submit", moveLevel);
$("add-victor-form").addEventListener("submit", addVictor);
$("remove-victor-form").addEventListener("submit", removeVictor);
$("remove-victor-level-select").addEventListener("change", refreshRemoveVictorOptions);
$("save-button").addEventListener("click", saveChanges);
$("discard-button").addEventListener("click", discardChanges);

async function initializeMod() {
  const auth = window.SpikeAuth;
  if (!auth || !auth.token) {
    window.location.replace("index.html");
    return;
  }
  try {
    await auth.refreshIdentity();
    if (!auth.canModerate()) {
      setConnectionStatus(`@${auth.user?.login || "This account"} does not have write access to the repository.`, "error");
      $("admin-workspace").classList.add("disabled-workspace");
      return;
    }
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
    changes = [];
    pendingImages = [];
    $("admin-workspace").classList.remove("disabled-workspace");
    refreshUI();
    setConnectionStatus(`Signed in as @${auth.user.login} • ${auth.permission} access`, "success");
  } catch (error) {
    console.error(error);
    setConnectionStatus(error.message || "Could not connect to GitHub.", "error");
  }
}

$("logout-button").addEventListener("click", () => {
  SpikeAuth.logout();
  window.location.replace("index.html");
});

async function getRepoFile(path) {
  const response = await githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`);
  if (!response.ok) throw new Error(await githubError(response));
  return response.json();
}

async function githubFetch(path, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${SpikeAuth.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
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
  if (level.verifier.toLowerCase() === playerName.toLowerCase()) {
    return setSaveStatus(`${playerName} is already the verifier, so they already receive this level's points.`, "error");
  }
  if (level.victors.some(name => name.toLowerCase() === playerName.toLowerCase())) {
    return setSaveStatus(`${playerName} is already a victor of ${level.name}.`, "error");
  }

  const canonicalName = ensurePlayer(playerName);
  level.victors.push(canonicalName);
  changes.push(`Added ${canonicalName} as a victor of ${level.name}`);
  $("victor-player").value = "";
  refreshUI();
  setSaveStatus("Victor added to pending changes.", "success");
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
  const levelOptions = ordered.map(level => `<option value="${escapeAttribute(level.id)}">#${level.rank} — ${escapeHTML(level.name)}</option>`).join("");
  $("move-level-select").innerHTML = levelOptions;
  $("victor-level-select").innerHTML = levelOptions;
  $("remove-victor-level-select").innerHTML = levelOptions;
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
  $("remove-victor-player-select").innerHTML = victors.length
    ? victors.map(name => `<option value="${escapeAttribute(name)}">${escapeHTML(name)}</option>`).join("")
    : `<option value="">No victors</option>`;
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
  if (!originalLevels.length && !originalPlayers.length) return;
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
    // Upload any new thumbnails first so a level never points at a missing image after JSON is saved.
    for (const image of pendingImages) {
      await putBinaryFile(image.path, image.file, `Add thumbnail for ${image.path.split('/').pop()}`);
    }

    fileShas.levels = await putJsonFile("data/levels.json", levels, fileShas.levels, "Update challenge list");
    fileShas.players = await putJsonFile("data/players.json", players, fileShas.players, "Update challenge players");

    originalLevels = structuredClone(levels);
    originalPlayers = structuredClone(players);
    pendingImages = [];
    changes = [];
    refreshUI();
    setSaveStatus("Saved to GitHub successfully. GitHub Pages may take a short moment to publish the commit.", "success");
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
  const body = {
    message,
    content: encodeBase64Utf8(text),
    branch: BRANCH,
    sha
  };
  const response = await githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodePath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await githubError(response));
  const result = await response.json();
  return result.content.sha;
}

async function putBinaryFile(path, file, message) {
  let sha;
  const existing = await githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`);
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) throw new Error(await githubError(existing));

  const base64 = await fileToBase64(file);
  const body = { message, content: base64, branch: BRANCH };
  if (sha) body.sha = sha;

  const response = await githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodePath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await githubError(response));
}

function sortedLevels() { return [...levels].sort((a, b) => a.rank - b.rank); }
function normalizeRanks() { levels = sortedLevels(); levels.forEach((level, index) => level.rank = index + 1); }
function clampRank(rank, max) { return Math.max(1, Math.min(Number.isFinite(rank) ? Math.floor(rank) : max, max)); }
function uniqueSlug(base) { let id = base || "level"; let n = 2; while (levels.some(level => level.id === id)) id = `${base}-${n++}`; return id; }
function slugify(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function extensionForImage(file) { if (file.type === "image/jpeg") return "jpg"; if (file.type === "image/webp") return "webp"; return "png"; }
function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}
function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubError(response) {
  try {
    const data = await response.json();
    if (response.status === 401) return "GitHub rejected the token. Check that it is valid.";
    if (response.status === 403) return "GitHub denied access. The token needs Contents: Read and write permission for this repository.";
    if (response.status === 404) return "Repository/file not found, or the token does not have access to it.";
    if (response.status === 409) return "GitHub reported a file conflict. Reconnect to load the newest version, then try again.";
    return data.message || `GitHub returned ${response.status}.`;
  } catch {
    return `GitHub returned ${response.status}.`;
  }
}

function setConnectionStatus(message, type) { const el=$("connection-status"); el.textContent=message; el.className=`admin-status ${type}`; }
function setSaveStatus(message, type) { const el=$("save-status"); el.textContent=message; el.className=`admin-status ${type}`; }
function escapeHTML(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function escapeAttribute(value) { return escapeHTML(value); }

initializeMod();
