// SSCL automatic scoring. Main List: #1-25; Extended List: #26 onward.
// Values are calculated from placement, never from a manually entered points field.
(function (global) {
  function pointsForRank(rank) {
    rank = Math.floor(Number(rank));
    if (!Number.isFinite(rank) || rank < 1) return 0;
    let points;
    if (rank <= 25) {
      points = 5 + 45 * Math.pow((25 - rank) / 24, 1.55);
    } else {
      points = 0.5 + 4.2 * Math.exp(-(rank - 26) / 35);
    }
    return Math.round(points * 100) / 100;
  }
  function applyPoints(levels) {
    if (!Array.isArray(levels)) return levels;
    for (const level of levels) level.points = pointsForRank(level.rank);
    return levels;
  }
  function formatPoints(points) {
    return Number(Number(points || 0).toFixed(2)).toString();
  }
  global.SSCLPoints = { pointsForRank, applyPoints, formatPoints, MAIN_LIST_END: 25 };
})(window);
