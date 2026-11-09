Spike Society source patch

Replace the matching files in your repository:
- admin.css
- mod.js
- player.js
- points.js
- script.js
- style.css

Included:
- Plain, compact MOD page styling; existing MOD tools and GitHub workflow remain in place.
- Player profile title uses "Name's" and subtitle "player profile".
- Completionist awards render below the statistic boxes as compact matching cards, with the Extended award retaining its blue-violet color.
- Legacy List display for levels at placement #76 and below, with creator and placement only.
- Legacy levels receive zero points, have victors cleared, and have position history removed; victor edits are rejected in MOD.
- Darker neutral gray theme and white points-related text.

Validation: node --check passed for player.js, script.js, points.js, and mod.js.

Important: this patch keeps the existing Worker endpoints and authentication flow. It does not change the Cloudflare Worker. Review the Legacy placement behavior in a test branch before deploying; the existing move-level form can move entries within the current ordered list, but the admin UI does not yet have a separate Legacy-specific placement selector.
