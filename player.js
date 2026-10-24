const escapeHTML = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
(async function () {
 const target=document.getElementById("player-profile");
 try {
  const [lr,pr]=await Promise.all([fetch("data/levels.json"),fetch("data/players.json")]);
  if(!lr.ok||!pr.ok) throw new Error("Could not load leaderboard data");
  const levels=SSCLPoints.applyPoints(await lr.json()),players=await pr.json();
  const name=new URLSearchParams(location.search).get("name");
  const player=players.find(p=>p.name===name);
  if(!player) {target.innerHTML='<div class="error-message">Player not found. <a href="index.html#leaderboard">Return to leaderboard</a></div>';return;}
  const completedFor=p=>levels.filter(l=>(Array.isArray(l.victors)&&l.victors.includes(p.name))||l.verifier===p.name).sort((a,b)=>a.rank-b.rank);
  const done=completedFor(player),points=done.reduce((sum,l)=>sum+(Number(l.points)||0),0);
  const rankings=players.map(p=>({name:p.name,points:completedFor(p).reduce((s,l)=>s+(Number(l.points)||0),0)})).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));
  const rank=rankings.findIndex(p=>p.name===name)+1;
  const hardest=done[0];
  const mainLevels=levels.filter(l=>Number(l.rank)<=25);
  const extendedLevels=levels.filter(l=>Number(l.rank)>25);
  const doneIds=new Set(done.map(l=>l.id));
  const mainComplete=mainLevels.length>0 && mainLevels.every(l=>doneIds.has(l.id));
  const extendedComplete=extendedLevels.length>0 && extendedLevels.every(l=>doneIds.has(l.id));
  target.innerHTML=`<div class="page-header"><h1>${escapeHTML(player.name)}</h1><p>Spike Society player profile</p></div>
  ${mainComplete?'<div class="main-list-complete">MAIN LIST COMPLETIONIST <span>Completed every challenge on the Main List!</span></div>':''}
  ${extendedComplete?'<div class="main-list-complete extended-list-complete">EXTENDED LIST COMPLETIONIST <span>Completed every challenge on the Extended List!</span></div>':''}
  <div class="profile-stats"><div><small>LEADERBOARD RANK</small><strong>#${rank}</strong></div><div><small>TOTAL POINTS</small><strong>${SSCLPoints.formatPoints(points)}</strong></div><div><small>LEVELS BEATEN</small><strong>${done.length} / ${levels.length}</strong></div><div><small>HARDEST COMPLETION</small><strong>${hardest?`#${hardest.rank} — ${escapeHTML(hardest.name)}`:'None yet'}</strong></div></div>
  <section class="profile-completions"><div class="panel-title">COMPLETED CHALLENGES <span>${done.length}</span></div>${done.length?done.map(l=>`<a class="profile-level" href="level.html?id=${encodeURIComponent(l.id)}"><span class="profile-level-rank">#${l.rank}</span><img src="${escapeHTML(l.image)}" alt="" loading="lazy"><span class="profile-level-title">${escapeHTML(l.name)}</span><strong>${SSCLPoints.formatPoints(l.points)} PTS</strong></a>`).join(""):'<div class="no-victors">No completed challenges yet.</div>'}</section>`;
 }catch(e){target.innerHTML=`<div class="error-message">${escapeHTML(e.message)}</div>`;}
})();