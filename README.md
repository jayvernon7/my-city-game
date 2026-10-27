## Phone controller / shared-screen mode

Use **Play With Friends** on a computer/TV browser to create a multiplayer
room. The room lobby displays a **QR code** and **Copy Phone Join Link**;
a QR code is also available in the upper-right **☰ → Phone Join QR** menu
while playing. Guests scan the QR with their phone camera, enter a display
name, and join using the mobile-friendly [`controller.html`](./controller.html).
They can roll, buy, pass, and end their own turns, and privately see their
balance, properties, and jail status. The shared computer keeps rendering
the 3D board. Server-side RPCs enforce membership and whose turn it is.

From the full-game **☰ → Controller Mode** menu, a player can switch the
*same device* to its controller layout, then select **Full Game** to return.
The homepage also links directly to **Phone Controller** for entering a code
manually. QR codes are generated in the browser; room codes are embedded in
the links and **do not grant control of an existing player** without their
authenticated session.

**Current limitation:** Each different phone is a distinct Supabase
anonymous account, so it joins as a distinct room member. The TV host's
own phone cannot independently assume the host's existing identity.
Host controls remain accessible on the computer/TV or by switching the
*host's same authenticated device* to controller mode. Trades have not been
implemented in the multiplayer backend; this first controller supports
the actions already verified by the server. No SQL migration is required.

# MY CITY — 3D animated board prototype

An original 40-space property game with a **real Three.js 3D board**, 3D pawns that hop around the board, a smooth camera that **follows each space**, working dice, property purchases, sample rent, Chance/Community Chest, a Casino event, Jail and a simple solo computer opponent.

This is an independent learning/game-development prototype. All 40 original custom space names are in `board-data.js`, and are in the correct clockwise order. The visual labels and game logic share exactly the same list, so names and positions cannot drift apart.

## Files
- `index.html` — page structure and pinned Three.js import map
- `styles.css` — game interface and mobile styling
- `board-data.js` — one source of truth for the 40 spaces
- `scene3d.js` — Three.js scene, tiles, buildings, dice, tokens, smooth camera, picking/drag/zoom
- `app.js` — turns, purchases, money, saving and solo bot

## Run locally

Since the game uses browser JavaScript modules, don't double-click the HTML file. Serve the folder from a local server. Example, if you have Python installed:

```bash
cd my-city-3d
python -m http.server 8000
```

Open `http://localhost:8000` in Chrome or Edge. **An internet connection is required**: `index.html` loads Three.js version `0.186.1` from jsDelivr. The rest of the code is local.

## Put it on GitHub Pages

1. Create a **new repository** (example: `my-city-game`), so your existing NBA League site stays untouched.
2. Upload the **contents** of this folder to the repository root. `index.html` must be at the root, alongside the `.js` and `.css` files.
3. Repository → Settings → Pages → Build and deployment → **Deploy from a branch**, choose `main` and `/ (root)`, then Save.
4. GitHub Pages will give you a URL for the playable site. Allow a short delay for publication.

No bundler, Node, paid hosting, database, or API key is required for this initial prototype. Once the board feels right, Supabase can handle multiplayer game rooms and shared state.

## Camera
- **Follow piece** (default): the camera smoothly tracks the active 3D pawn around all 40 spaces. During a roll, the pawn travels one tile at a time.
- **Full board**: pull back to view the entire board.
- **Drag**: orbit/tilt the camera.
- **Mouse wheel**: zoom in/out. On mobile, drag to orbit; toggle Full board to frame the entire board.
- **Click a tile** to inspect its name, color group, price, owner and sample rent.
- **R** to roll, **V** to switch cameras (when keyboard focus is not on a control).

## Game modes and boundaries
- Solo vs Computer (basic buy/skip strategy).
- 2–4 players on one device (pass the device).
- Progress auto-saves in that browser's `localStorage`. New game resets only this prototype.
- Prices, rent and Casino/Chance events are **placeholder rules** that can be changed.
- No online multiplayer, 3D character assets or smartphone/TV pairing yet. Those are later development stages.

## Roulette side table (visual preview only)

The new `roulette3d.js` module renders a physical American **double-zero**
roulette table beside the My City board. It has a green felt betting layout
with 0 and 00, all 36 numbers in their standard arrangement, three 2-to-1
column bets, 1st/2nd/3rd 12, red/black, even/odd, and high/low. The decorative
38-pocket wheel uses the standard American wheel number sequence and colors.

After each completed dice roll, the camera moves to the adjacent roulette
table and shows a noninteractive preview panel. Players can choose
**Back to Board** to return to My City. The future **Play** action is visibly
marked coming soon. No bets, wagers, spins, chips, or roulette results change
the game yet; that logic will be implemented after its rules are decided.

## Multiplayer room menu and host-controlled end game

The top-right room ID box has been replaced by a **three-horizontal-line menu**.
Opening it shows the room ID (with a copy button), **Settings** (camera
view and optional activity-feed visibility), and **End Game** **only for
the room host while a match is playing**.

**Required one-time Supabase update:** run
[`supabase/mycity_end_game.sql`](./supabase/mycity_end_game.sql)
in your **My City** Supabase project's SQL Editor. This creates
`mc_end_game`, which verifies the caller is the host, locks the room,
and marks the ongoing match as finished. All clients polling the room
will see that no further Roll/Buy/Pass/End Turn actions are allowed.
A confirmation appears before the host ends a game. End Game **does not
delete** room records, member balances or property ownership.

## Shared multiplayer activity feed

A minimal bottom-left activity feed shows the **five newest events** during
multiplayer games. Its format is `Player name: activity`. As a sixth event
arrives, the oldest of the previous five disappears automatically. The log
syncs to every room member (approximately every 1.3 seconds) and never exposes
another player's balance or owned-property list.

**Required one-time Supabase update:** run
[`supabase/mycity_activity_log.sql`](./supabase/mycity_activity_log.sql)
in the **My City** project's SQL Editor. The script creates the
`mc_activity_log` table, server-side triggers for joins/starts, dice rolls,
purchases, passes, turn endings and money changes, and the membership-checked
`mc_recent_activity` function. Existing rooms remain intact, but activity
begins recording only after this migration is installed.

## Cancel or leave a multiplayer room

**One-time setup:** In your My City Supabase project's SQL Editor, run
[`supabase/mycity_cancel_room.sql`](./supabase/mycity_cancel_room.sql)
to enable the new **Cancel Room** and **Leave Room** buttons.

While the room is **waiting in the lobby**:
- The host may **Back to Rooms** without deleting the room; write down the
  invite code if you plan to rejoin later.
- The host may **Cancel Room** to permanently close that room for everyone.
  A confirmation is shown; the database enforces host-only cancellation.
- Other players may **Leave Room** to remove their membership without
  affecting the host or remaining players.

After a game starts, returning to the rooms menu only leaves the current
screen. It doesn't cancel the ongoing match. This first version does not
support deleting active matches from the lobby.

## Online multiplayer (new — setup required)

**The online frontend and the Supabase backend schema have been committed but
cannot function until the Supabase project is connected and the SQL is run.**

1. In Supabase **SQL Editor**, run the contents of
   [supabase/mycity_multiplayer.sql](./supabase/mycity_multiplayer.sql)
   **in your intended My City Supabase project**. The script creates only
   `mc_*` tables and functions (it does not edit The NBA League tables).
2. In Supabase **Authentication → Providers**, enable **Anonymous sign-ins**.
   These are persistent, anonymous Supabase Auth user accounts per browser,
   not just arbitrary player names, so membership can be verified.
3. In Supabase's project API settings, copy the **Project URL** and
   **publishable key** (or legacy **anon** public key). Paste them inside
   [online-config.js](./online-config.js) as strings. **Never paste a
   service_role or secret key into this frontend.** The publishable key is
   intended to be publicly distributed; the server validates every action.
4. Once GitHub Pages deploys, open
   `https://jayvernon7.github.io/my-city-game/online.html` or choose
   **Play With Friends** on the home page.
5. Create a room (2–4 players), share the invite link or 8-character code,
   and have friends open it on their own devices. The host starts the match
   once at least two players join. A connected browser retains its player
   identity in Supabase Auth storage.
6. Only the active player may Roll Dice, Buy, Pass or End Turn. The SQL checks
   membership and turn order and performs purchases, rent, cash transfers,
   dice rolls and turn changes transactionally. Other players see their
   **own balance and private owned-property list**, never another player's
   balance or holdings. Names, positions, active turn and dice rolls sync
   via near-real-time polling (approximately 1.3 seconds).
7. The existing **Play Solo** stays separate and continues working locally.
   Roulette remains a non-playing 3D visual preview.

**Testing:** use two different browsers/devices (or one normal window and
one private window) to join the same room. Make sure each is a separate
anonymous account. Do not expect a second tab of the *same* browser profile
to count as an additional player because it shares the same auth identity.

**Security:** room tables have RLS enabled with no direct data access for
anon/authenticated clients. Only authenticated, membership-checked,
`security definer` RPC functions are granted to the clients. Cash and
property ownership are calculated and stored on the server. This is an early
multiplayer prototype; fuller account recovery, presence, turn timers, and
disconnect handling can be added later.

## Development pieces — names reserved for future rules

These names are explicitly defined in `board-data.js` and should be used
consistently when we add the building and upgrade rules:

- **houses** — small **silver** 3D building blocks.
- **hotels** — taller **gold** 3D building blocks.

**Placement rule:** houses and hotels may appear **only on top of the
colored strip of a property**. They must not overlap the property's printed
name, appear on a blank non-property space, or sit in the central board.

**No houses or hotels are currently displayed.** Their definitions and placement rules remain in the code for later gameplay development. Any future placements will follow the property color-strip rule.

## Board validation

Run `node tests/board.test.mjs` to verify that all 40 names and special-space positions match the design. This is optional and does not affect the deployed game.

## Notes
The positions are tested programmatically: GO index 0 (bottom-right), Bowling Avenue index 1 (directly left), Chance index 7 (between Campbell Rd and Robbins Dr), Community Chest index 33 (between Greenfield Rd and 7 Mile), and Coyle index 39 (directly above GO).

Three.js is open source (MIT license). The game uses procedurally built meshes and custom drawn textures; no MONOPOLY GO! assets or source code were used.
