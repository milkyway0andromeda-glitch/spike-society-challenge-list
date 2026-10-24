// SSCL automatic scoring: 50.00 at #1, 10.00 at #25; extended levels earn less.
// Display decimals in a smaller font without changing the underlying score.
(function (global) {
  function pointsForRank(rank) {
    rank = Math.floor(Number(rank));
    if (!Number.isFinite(rank) || rank < 1) return 0;
    let value;
    if (rank <= 25) {
      value = 10 + 40 * Math.pow((25 - rank) / 24, 1.35);
    } else {
      value = 1 + 8.75 * Math.exp(-(rank - 26) / 32);
    }
    return Math.round(value * 100) / 100;
  }
  function applyPoints(levels) {
    if (!Array.isArray(levels)) return levels;
    for (const level of levels) level.points = pointsForRank(level.rank);
    return levels;
  }
  function formatPoints(points) {
    return (Number(points) || 0).toFixed(2);
  }
  function formatPointsHTML(points) {
    const [whole, fraction] = formatPoints(points).split('.');
    return `<span class="points-number">${whole}<span class="points-fraction">.${fraction}</span></span>`;
  }
  global.SSCLPoints = { pointsForRank, applyPoints, formatPoints, formatPointsHTML, MAIN_LIST_END: 25 };
})(window);
