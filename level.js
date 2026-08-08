const levelPage = document.getElementById("level-page");

async function loadLevel() {
  try {
    const params = new URLSearchParams(window.location.search);
    const levelId = params.get("id");
    if (!levelId) throw new Error("No challenge ID supplied.");

    const response = await fetch("data/levels.json");
    if (!response.ok) throw new Error(`levels.json returned ${response.status}`);

    const levels = await response.json();
    const level = levels.find(item => item.id === levelId);
    if (!level) throw new Error(`Challenge "${levelId}" was not found.`);

    renderLevel(level);
  } catch (error) {
    console.error(error);
    levelPage.innerHTML = `
      <div class="error-message">
        Challenge could not be loaded.<br><br>
        <a href="index.html">← Back to list</a>
      </div>
    `;
  }
}

function renderLevel(level) {
  document.title = `${level.name} - Spike Society Challenge List`;

  const youtubeEmbed = getYouTubeEmbedURL(level.video);
  const victors = Array.isArray(level.victors) ? level.victors : [];

  const victorHTML = victors.length === 0
    ? `<div class="no-victors">No victors yet.</div>`
    : victors.map((victor, index) => `
        <div class="victor-row">
          <div class="victor-rank">#${index + 1}</div>
          <div class="victor-name">${escapeHTML(victor)}</div>
        </div>
      `).join("");

  const videoHTML = youtubeEmbed
    ? `
      <div class="verification-video">
        <iframe
          src="${youtubeEmbed}"
          title="${escapeAttribute(level.name)} verification"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>
    `
    : `
      <div class="verification-video no-video">
        <div>
          <strong>No verification video</strong>
          <span>Add a YouTube URL to this challenge in levels.json.</span>
        </div>
      </div>
    `;

  levelPage.innerHTML = `
    <section class="detail-hero">
      <div class="detail-rank">#${level.rank}</div>
      <div class="detail-thumbnail-wrap">
        <img class="detail-thumbnail" src="${escapeAttribute(level.image)}" alt="${escapeAttribute(level.name)} thumbnail">
      </div>
      <div class="detail-title-area">
        <h1>${escapeHTML(level.name)}</h1>
        <div class="detail-creator">Created by <strong>${escapeHTML(level.creator)}</strong></div>
      </div>
      <div class="detail-points">
        ${level.points}
        <span>POINT${level.points === 1 ? "" : "S"}</span>
      </div>
    </section>

    <section class="detail-grid">
      <div class="video-panel">
        <div class="panel-title">VERIFICATION</div>
        ${videoHTML}
        ${level.video ? `
          <a class="youtube-button" href="${escapeAttribute(level.video)}" target="_blank" rel="noopener noreferrer">
            WATCH ON YOUTUBE
          </a>
        ` : ""}
      </div>

      <aside class="info-panel">
        <div class="panel-title">LEVEL INFORMATION</div>
        <div class="info-row">
          <div class="info-label">CREATOR</div>
          <div class="info-value">${escapeHTML(level.creator)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">VERIFIER</div>
          <div class="info-value">${escapeHTML(level.verifier)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">LEVEL ID</div>
          <div class="info-value level-id-value">${escapeHTML(level.gdId)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">LIST POSITION</div>
          <div class="info-value">#${level.rank}</div>
        </div>
        <div class="info-row">
          <div class="info-label">POINTS</div>
          <div class="info-value blue-value">${level.points}</div>
        </div>
      </aside>
    </section>

    <section class="victors-panel">
      <div class="panel-title victors-title">
        <span>VICTORS</span>
        <span class="victor-count">${victors.length}</span>
      </div>
      <div class="victor-list">${victorHTML}</div>
    </section>
  `;
}

function getYouTubeEmbedURL(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    let videoId = null;

    if (parsed.hostname === "youtu.be" || parsed.hostname === "www.youtu.be") {
      videoId = parsed.pathname.replace("/", "").split("/")[0];
    } else if (
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "m.youtube.com"
    ) {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v");
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/")[2];
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2];
      }
    }

    return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : null;
  } catch {
    return null;
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttribute(value) { return escapeHTML(value); }

loadLevel();
