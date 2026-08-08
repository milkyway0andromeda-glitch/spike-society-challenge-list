const levelList = document.getElementById("level-list");
const playerList = document.getElementById("player-list");

let levels = [];
let players = [];


// ==========================
// LOAD DATA
// ==========================

async function loadData() {
    try {
        const [levelsResponse, playersResponse] = await Promise.all([
            fetch("data/levels.json"),
            fetch("data/players.json")
        ]);

        levels = await levelsResponse.json();
        players = await playersResponse.json();

        renderLevels();
        renderLeaderboard();

    } catch (error) {
        console.error("Failed to load data:", error);
    }
}


// ==========================
// LEVEL LIST
// ==========================

function renderLevels() {
    levelList.innerHTML = "";

    const sortedLevels = [...levels].sort(
        (a, b) => a.rank - b.rank
    );

    sortedLevels.forEach(level => {
        const levelElement = document.createElement("div");

        levelElement.className = "level-card";

        levelElement.innerHTML = `
            <div class="level-rank">
                #${level.rank}
            </div>

            <img
                class="level-image"
                src="${level.image}"
                alt="${level.name}"
            >

            <div class="level-info">
                <div class="level-name">
                    ${level.name}
                </div>

                <div class="level-points">
                    ${level.points} POINTS
                </div>
            </div>
        `;

        levelList.appendChild(levelElement);
    });
}


// ==========================
// CALCULATE PLAYER POINTS
// ==========================

function calculatePlayerPoints(player) {
    let total = 0;

    player.completed.forEach(levelId => {
        const level = levels.find(
            level => level.id === levelId
        );

        if (level) {
            total += level.points;
        }
    });

    return total;
}


// ==========================
// LEADERBOARD
// ==========================

function renderLeaderboard() {
    playerList.innerHTML = "";

    const rankedPlayers = players
        .map(player => {
            return {
                ...player,
                points: calculatePlayerPoints(player)
            };
        })
        .sort((a, b) => b.points - a.points);

    rankedPlayers.forEach((player, index) => {
        const playerElement = document.createElement("div");

        playerElement.className = "player-card";

        const rank = index + 1;

        playerElement.innerHTML = `
            <div class="player-rank">
                #${rank}
            </div>

            <div class="player-name">
                ${player.name}
            </div>

            <div class="player-points">
                ${player.points} pts
            </div>
        `;

        playerList.appendChild(playerElement);
    });
}


// ==========================
// TAB SWITCHING
// ==========================

const buttons = document.querySelectorAll(".nav-button");
const pages = document.querySelectorAll(".page");

buttons.forEach(button => {
    button.addEventListener("click", () => {

        buttons.forEach(btn =>
            btn.classList.remove("active")
        );

        pages.forEach(page =>
            page.classList.remove("active-page")
        );

        button.classList.add("active");

        const pageName = button.dataset.page;

        document
            .getElementById(`${pageName}-page`)
            .classList.add("active-page");
    });
});


// ==========================
// START SITE
// ==========================

loadData();