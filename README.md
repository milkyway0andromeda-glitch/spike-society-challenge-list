# Spike Society Challenge List — MOD login version

This version uses your Cloudflare Worker + GitHub App.

## What visitors see
- Logged out: `SIGN IN WITH GITHUB`
- Signed in without repo write access: their GitHub avatar/name, but **no MOD button**
- Signed in with write/admin access: `MOD` appears
- Opening `mod.html` directly still checks GitHub permission and blocks non-mods

## One last Worker update
The website needs the Worker to proxy the MOD page's file reads/writes securely.

1. Open your `spike-society-auth` Worker in Cloudflare.
2. Click **Edit code**.
3. Replace the Worker with the contents of `cloudflare-worker.js` from this ZIP.
4. Click **Deploy**.

Keep these Worker variables/secrets:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`
- `SITE_URL` = `https://milkyway0andromeda-glitch.github.io/spike-society-challenge-list`

Your GitHub App callback should remain:
`https://spike-society-auth.milkyway0andromeda.workers.dev/callback`

## Upload the site
Upload/replace the repository files from this ZIP. Do **not** upload `cloudflare-worker.js` to GitHub Pages if you don't want it there; it contains no secret, but it is only supplied as a convenient copy for Cloudflare.

The MOD page can:
- add a level at any placement and automatically shift ranks
- move existing levels and renumber ranks
- add/remove victors
- upload a thumbnail
- write the resulting JSON/image files directly back to GitHub
