const OWNER = "milkyway0andromeda-glitch";
const REPO = "spike-society-challenge-list";
const BRANCH = "main";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/") return new Response("Spike Society auth worker is online.");
      if (url.pathname === "/login") return startLogin(request, env);
      if (url.pathname === "/callback") return finishLogin(request, env);
      if (url.pathname === "/me") return getMe(request, env);
      if (url.pathname === "/repo-file") return repoFile(request, env);
      if (request.method === "OPTIONS") return corsPreflight(env);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(err);
      return json({ ok:false, error:"server_error", message:err instanceof Error ? err.message : String(err) }, 500, env);
    }
  }
};

async function startLogin(request, env) {
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const stateToken = await encryptSession({ state, exp:Date.now()+10*60*1000 }, env.SESSION_SECRET);
  const callback = new URL("/callback", request.url).toString();
  const github = new URL("https://github.com/login/oauth/authorize");
  github.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  github.searchParams.set("redirect_uri", callback);
  github.searchParams.set("state", state);
  const headers = new Headers({ Location:github.toString() });
  headers.append("Set-Cookie", `spike_oauth_state=${stateToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return new Response(null, { status:302, headers });
}

async function finishLogin(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code || !returnedState) return authFailure(env,"GitHub did not return a login code.");
  const cookies = parseCookies(request.headers.get("Cookie")||"");
  if (!cookies.spike_oauth_state) return authFailure(env,"Login session expired. Please try again.");
  let savedState;
  try { savedState = await decryptSession(cookies.spike_oauth_state, env.SESSION_SECRET); }
  catch { return authFailure(env,"Invalid login session."); }
  if (savedState.state !== returnedState || !savedState.exp || Date.now()>savedState.exp) return authFailure(env,"GitHub login state did not match.");

  const callback = new URL("/callback", request.url).toString();
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method:"POST",
    headers:{ Accept:"application/json", "Content-Type":"application/json", "User-Agent":"Spike-Society-Mod" },
    body:JSON.stringify({ client_id:env.GITHUB_CLIENT_ID, client_secret:env.GITHUB_CLIENT_SECRET, code, redirect_uri:callback })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) return authFailure(env,"GitHub login failed.");

  const githubToken = tokenData.access_token;
  const userResponse = await githubApi("https://api.github.com/user", githubToken);
  if (!userResponse.ok) return authFailure(env,"Could not read your GitHub account.");
  const user = await userResponse.json();
  const permission = await getPermission(user.login, githubToken);
  const canMod = permission === "admin" || permission === "write";
  const sessionToken = await encryptSession({ githubToken, login:user.login, avatar:user.avatar_url, exp:Date.now()+8*60*60*1000 }, env.SESSION_SECRET);
  const headers = new Headers({ Location:`${env.SITE_URL}/#github_session=${encodeURIComponent(sessionToken)}` });
  headers.append("Set-Cookie", "spike_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return new Response(null,{status:302,headers});
}

async function getMe(request, env) {
  if (request.method === "OPTIONS") return corsPreflight(env);
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ authenticated:false, canMod:false }, auth.status, env);
  return json({ authenticated:true, login:auth.session.login, avatar:auth.session.avatar, permission:auth.permission, canMod:auth.canMod }, 200, env);
}

async function repoFile(request, env) {
  if (request.method === "OPTIONS") return corsPreflight(env);
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error:"unauthorized", message:"MOD access required." }, auth.status, env);
  if (!auth.canMod) return json({ error:"forbidden", message:"Your GitHub account does not have write access." }, 403, env);

  if (request.method === "GET") {
    const path = new URL(request.url).searchParams.get("path") || "";
    if (!safeRepoPath(path)) return json({error:"bad_path",message:"Invalid repository path."},400,env);
    const response = await githubApi(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(BRANCH)}`, auth.session.githubToken);
    const body = await response.text();
    return new Response(body,{status:response.status,headers:corsHeaders(env,{"Content-Type":"application/json","Cache-Control":"no-store"})});
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const path = String(body.path || "");
    if (!safeRepoPath(path)) return json({error:"bad_path",message:"Invalid repository path."},400,env);
    if (typeof body.content !== "string" || !body.content) return json({error:"bad_content",message:"Missing file content."},400,env);
    const payload = { message:String(body.message||"Update Spike Society data"), content:body.content, branch:BRANCH };
    if (body.sha) payload.sha = String(body.sha);
    const response = await githubApi(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeRepoPath(path)}`, auth.session.githubToken, {
      method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) return json({error:"github_error",message:data.message||"GitHub update failed."},response.status,env);
    return json({ok:true,sha:data.content?.sha||null,commit:data.commit?.sha||null},200,env);
  }

  return json({error:"method_not_allowed"},405,env);
}

async function authorize(request, env) {
  const token = getBearerToken(request);
  if (!token) return {ok:false,status:401};
  let session;
  try { session = await decryptSession(token, env.SESSION_SECRET); }
  catch { return {ok:false,status:401}; }
  if (!session.exp || Date.now()>session.exp || !session.githubToken || !session.login) return {ok:false,status:401};
  const permission = await getPermission(session.login, session.githubToken);
  return {ok:true,status:200,session,permission,canMod:permission==="admin"||permission==="write"};
}

async function getPermission(login, token) {
  const response = await githubApi(`https://api.github.com/repos/${OWNER}/${REPO}/collaborators/${encodeURIComponent(login)}/permission`,token);
  if (!response.ok) return "none";
  const data = await response.json();
  return data.permission || "none";
}

function safeRepoPath(path) {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  return path === "data/levels.json" || path === "data/players.json" || /^images\/[A-Za-z0-9._-]+$/.test(path);
}
function encodeRepoPath(path){return path.split("/").map(encodeURIComponent).join("/");}
async function githubApi(url,token,options={}){const h=new Headers(options.headers||{});h.set("Accept","application/vnd.github+json");h.set("Authorization",`Bearer ${token}`);h.set("X-GitHub-Api-Version","2022-11-28");h.set("User-Agent","Spike-Society-Mod");return fetch(url,{...options,headers:h});}
function getBearerToken(request){const h=request.headers.get("Authorization")||"";return h.startsWith("Bearer ")?h.slice(7):null;}
function authFailure(env,message){return Response.redirect(`${env.SITE_URL}/#github_auth_error=${encodeURIComponent(message)}`,302);}
function json(data,status,env){return new Response(JSON.stringify(data),{status,headers:corsHeaders(env,{"Content-Type":"application/json","Cache-Control":"no-store"})});}
function corsPreflight(env){return new Response(null,{status:204,headers:corsHeaders(env)});}
function corsHeaders(env,extra={}){return {"Access-Control-Allow-Origin":env.SITE_URL,"Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, PUT, OPTIONS","Access-Control-Max-Age":"86400",Vary:"Origin",...extra};}
async function getEncryptionKey(secret){const material=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));return crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["encrypt","decrypt"]);}
async function encryptSession(value,secret){const key=await getEncryptionKey(secret);const iv=crypto.getRandomValues(new Uint8Array(12));const plain=new TextEncoder().encode(JSON.stringify(value));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);const combined=new Uint8Array(iv.length+cipher.byteLength);combined.set(iv,0);combined.set(new Uint8Array(cipher),iv.length);return base64url(combined);}
async function decryptSession(token,secret){const combined=fromBase64url(token);const iv=combined.slice(0,12);const cipher=combined.slice(12);const key=await getEncryptionKey(secret);const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher);return JSON.parse(new TextDecoder().decode(plain));}
function base64url(bytes){let b="";for(const byte of bytes)b+=String.fromCharCode(byte);return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function fromBase64url(value){let b=value.replace(/-/g,"+").replace(/_/g,"/");while(b.length%4)b+="=";const binary=atob(b);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function parseCookies(header){const cookies={};for(const part of header.split(";")){const i=part.indexOf("=");if(i===-1)continue;cookies[part.slice(0,i).trim()]=part.slice(i+1).trim();}return cookies;}
