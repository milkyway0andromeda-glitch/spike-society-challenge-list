const levelList = document.getElementById("level-list");
const playerList = document.getElementById("player-list");

let levels = [];
let players = [];

async function loadData() {
  try {
    const [levelResponse, playerResponse] = await Promise.all([
      fetch("data/levels.json"),
      fetch("data/players.json")
    ]);

    if (!levelResponse.ok) throw new Error(`levels.json returned ${levelResponse.status}`);
    if (!playerResponse.ok) throw new Error(`players.json returned ${playerResponse.status}`);

    levels = await levelResponse.json();
    players = await playerResponse.json();

    renderLevels();
    renderLeaderboard();
  } catch (error) {
    console.error(error);
    const message = `<div class="error-message">Failed to load challenge data.</div>`;
    levelList.innerHTML = message;
    playerList.innerHTML = message;
  }
}

function renderLevels() {
  levelList.innerHTML = "";
  const sortedLevels = [...levels].sort((a, b) => a.rank - b.rank);

  sortedLevels.forEach(level => {
    const card = document.createElement("a");
    card.className = `level-card rank-${level.rank}`;
    card.href = `level.html?id=${encodeURIComponent(level.id)}`;

    card.innerHTML = `
      <div class="level-rank">#${level.rank}</div>
      <div class="level-image-wrap">
        <img class="level-image" src="${escapeAttribute(level.image)}" alt="${escapeAttribute(level.name)} thumbnail" loading="lazy">
      </div>
      <div class="level-info">
        <div class="level-name">${escapeHTML(level.name)}</div>
        <div class="level-creator">Created by ${escapeHTML(level.creator)}</div>
      </div>
      <div class="level-side">
        <div class="level-points">${level.points}<span>POINT${level.points === 1 ? "" : "S"}</span></div>
      </div>
    `;
    levelList.appendChild(card);
  });
}

function calculatePlayerPoints(player) {
    const completedIds = new Set(player.completed);

    let total = 0;

    levels.forEach(level => {
        const completedNormally =
            completedIds.has(level.id);

        const isVerifier =
            level.verifier === player.name;

        if (completedNormally || isVerifier) {
            total += level.points;
        }
    });

    return total;
}

function renderLeaderboard() {
  playerList.innerHTML = "";

  const rankedPlayers = players
    .map(player => ({ ...player, points: calculatePlayerPoints(player) }))
    .sort((a, b) => b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name));

  rankedPlayers.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "player-card";
    row.innerHTML = `
      <div class="player-rank">#${index + 1}</div>
      <div class="player-name">${escapeHTML(player.name)}</div>
      <div class="player-points">${player.points} Points</div>
    `;
    playerList.appendChild(row);
  });
}

document.querySelectorAll(".nav-button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-button").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active-page"));
    button.classList.add("active");
    document.getElementById(`${button.dataset.page}-page`).classList.add("active-page");
  });
});

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttribute(value) { return escapeHTML(value); }

loadData();
