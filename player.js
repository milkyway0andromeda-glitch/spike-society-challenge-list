const playerProfile = document.getElementById("player-profile");

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCompletedLevels(levels, playerName) {
  return levels
    .filter(level => {
      const isVictor = Array.isArray(level.victors)
        && level.victors.includes(playerName);
      return isVictor || level.verifier === playerName;
    })
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}

function renderPlayerProfile(player, levels, players) {
  const completedLevels = getCompletedLevels(levels, player.name);
  const totalPoints = completedLevels.reduce(
    (total, level) => total + (Number(level.points) || 0),
    0
  );

  const leaderboard = players
    .map(entry => {
      const completed = getCompletedLevels(levels, entry.name);
      const points = completed.reduce(
        (total, level) => total + (Number(level.points) || 0),
        0
      );
      return { name: entry.name, points };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const rank = leaderboard.findIndex(entry => entry.name === player.name) + 1;
  const hardest = completedLevels[0];
  const mainLevels = levels.filter(level => Number(level.rank) <= SSCLPoints.MAIN_LIST_END);
  const extendedLevels = levels.filter(level => Number(level.rank) > SSCLPoints.MAIN_LIST_END);
  const completedIds = new Set(completedLevels.map(level => level.id));

  const completedMainList = mainLevels.length > 0
    && mainLevels.every(level => completedIds.has(level.id));
  const completedExtendedList = extendedLevels.length > 0
    && extendedLevels.every(level => completedIds.has(level.id));

  const completionRows = completedLevels.length
    ? completedLevels.map(level => `
        <a class="profile-level" href="level.html?id=${encodeURIComponent(level.id)}">
          <span class="profile-level-rank">#${level.rank}</span>
          <img src="${escapeHTML(level.image)}" alt="" loading="lazy">
          <span class="profile-level-title">${escapeHTML(level.name)}</span>
          <strong>${SSCLPoints.formatPointsHTML(level.points)} PTS</strong>
        </a>
      `).join("")
    : '<div class="no-victors">No completed challenges yet.</div>';

  document.title = `${player.name} - Spike Society`;
  playerProfile.innerHTML = `
    <div class="page-header">
      <h1>${escapeHTML(player.name)}</h1>
      <p>Spike Society player profile</p>
    </div>
    ${completedMainList ? `
      <div class="main-list-complete">
        MAIN LIST COMPLETIONIST
        <span>Completed every challenge on the Main List!</span>
      </div>
    ` : ""}
    ${completedExtendedList ? `
      <div class="main-list-complete">
        EXTENDED LIST COMPLETIONIST
        <span>Completed every challenge on the Extended List!</span>
      </div>
    ` : ""}
    <div class="profile-stats">
      <div><small>LEADERBOARD RANK</small><strong>#${rank}</strong></div>
      <div><small>TOTAL POINTS</small><strong>${SSCLPoints.formatPointsHTML(totalPoints)}</strong></div>
      <div><small>LEVELS BEATEN</small><strong>${completedLevels.length} / ${levels.length}</strong></div>
      <div>
        <small>HARDEST COMPLETION</small>
        <strong>${hardest ? `#${hardest.rank} — ${escapeHTML(hardest.name)}` : "None yet"}</strong>
      </div>
    </div>
    <section class="profile-completions">
      <div class="panel-title">COMPLETED CHALLENGES <span>${completedLevels.length}</span></div>
      ${completionRows}
    </section>
  `;
}

async function loadPlayerProfile() {
  try {
    const [levelsResponse, playersResponse] = await Promise.all([
      fetch("data/levels.json"),
      fetch("data/players.json")
    ]);

    if (!levelsResponse.ok || !playersResponse.ok) {
      throw new Error("Could not load leaderboard data.");
    }

    const [rawLevels, players] = await Promise.all([
      levelsResponse.json(),
      playersResponse.json()
    ]);

    if (!Array.isArray(rawLevels) || !Array.isArray(players)) {
      throw new Error("Leaderboard data has an invalid format.");
    }

    const playerName = new URLSearchParams(window.location.search).get("name");
    const player = players.find(entry => entry.name === playerName);

    if (!player) {
      playerProfile.innerHTML = `
        <div class="error-message">
          Player not found.
          <a href="index.html#leaderboard">Return to leaderboard</a>
        </div>
      `;
      return;
    }

    const levels = SSCLPoints.applyPoints(rawLevels);
    renderPlayerProfile(player, levels, players);
  } catch (error) {
    console.error("Unable to load player profile:", error);
    playerProfile.innerHTML = `<div class="error-message">${escapeHTML(error.message || "Unable to load this profile.")}</div>`;
  }
}

loadPlayerProfile();
