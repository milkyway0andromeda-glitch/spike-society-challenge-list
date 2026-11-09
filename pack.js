const packDetail = document.getElementById("pack-detail");

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safePackColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#55aaff";
}

function renderPack(pack, levels) {
  document.title = `${pack.name} - Spike Society Packs`;

  const color = safePackColor(pack.color);
  const gradientEnd = pack.gradient
    ? safePackColor(pack.gradient)
    : color;
  const levelIds = Array.isArray(pack.levelIds) ? pack.levelIds : [];

  const levelCards = levelIds
    .map((levelId, index) => {
      const level = levels.find(item => item.id === levelId);
      if (!level) return "";

      return `
        <a class="pack-level" href="level.html?id=${encodeURIComponent(level.id)}">
          <span class="pack-level-number">#${index + 1}</span>
          <img src="${escapeHTML(level.image)}" alt="" loading="lazy">
          <div>
            <div class="pack-level-name">${escapeHTML(level.name)}</div>
            <div class="pack-level-meta">LIST #${level.rank} · ${escapeHTML(level.creator)}</div>
          </div>
          <span class="pack-level-number">${SSCLPoints.formatPointsHTML(level.points)} PTS</span>
        </a>
      `;
    })
    .join("");

  packDetail.className = "";
  packDetail.innerHTML = `
    <section class="pack-detail-header" style="--pack-color:${color};--pack-end:${gradientEnd}">
      <h1>${escapeHTML(pack.name)}</h1>
      <p>${levelIds.length} challenges in this pack</p>
    </section>
    ${levelCards || '<div class="no-victors">This pack has no levels yet.</div>'}
  `;
}

async function loadPack() {
  try {
    const [packsResponse, levelsResponse] = await Promise.all([
      fetch("data/packs.json"),
      fetch("data/levels.json")
    ]);

    if (!packsResponse.ok || !levelsResponse.ok) {
      throw new Error("Pack data is currently unavailable.");
    }

    const [packs, rawLevels] = await Promise.all([
      packsResponse.json(),
      levelsResponse.json()
    ]);

    if (!Array.isArray(packs) || !Array.isArray(rawLevels)) {
      throw new Error("Pack data has an invalid format.");
    }

    const packId = new URLSearchParams(window.location.search).get("id");
    const pack = packs.find(item => String(item.id) === String(packId));

    if (!pack) {
      throw new Error("Pack not found.");
    }

    const levels = SSCLPoints.applyPoints(rawLevels);
    renderPack(pack, levels);
  } catch (error) {
    console.error("Unable to load pack:", error);
    packDetail.className = "error-message";
    packDetail.textContent = error.message || "Unable to load this pack.";
  }
}

loadPack();
