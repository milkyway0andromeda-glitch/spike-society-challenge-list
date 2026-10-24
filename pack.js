const target = document.getElementById("pack-detail");
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const safeColor = v => /^#[0-9a-fA-F]{6}$/.test(v || "") ? v : "#55aaff";
(async () => { try {
 const [pr,lr] = await Promise.all([fetch("data/packs.json"),fetch("data/levels.json")]);
 if(!pr.ok || !lr.ok) throw Error("Data unavailable");
 const [packs,rawLevels] = await Promise.all([pr.json(),lr.json()]);
 const levels = SSCLPoints.applyPoints(rawLevels);
 const pack = packs.find(p => p.id === new URLSearchParams(location.search).get("id"));
 if(!pack) throw Error("Pack not found");
 document.title = `${pack.name} - Spike Society Packs`;
 const color=safeColor(pack.color), end=pack.gradient?safeColor(pack.gradient):color;
 const cards=(pack.levelIds||[]).map((id,i)=>{const l=levels.find(x=>x.id===id);if(!l)return "";return `<a class="pack-level" href="level.html?id=${encodeURIComponent(l.id)}"><span class="pack-level-number">#${i+1}</span><img src="${esc(l.image)}" alt=""><div><div class="pack-level-name">${esc(l.name)}</div><div class="pack-level-meta">LIST #${l.rank} · ${esc(l.creator)}</div></div><span class="pack-level-number">${SSCLPoints.formatPoints(l.points)} PTS</span></a>`}).join("");
 target.className="";target.innerHTML=`<section class="pack-detail-header" style="--pack-color:${color};--pack-end:${end}"><h1>${esc(pack.name)}</h1><p>${(pack.levelIds||[]).length} challenges in this pack</p></section>${cards || '<div class="no-victors">This pack has no levels yet.</div>'}`;
} catch(e) { target.className="error-message";target.textContent=e.message; }})();
