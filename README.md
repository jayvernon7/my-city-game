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

## Development pieces — names reserved for future rules

These names are explicitly defined in `board-data.js` and should be used
consistently when we add the building and upgrade rules:

- **houses** — small **silver** 3D building blocks.
- **hotels** — taller **gold** 3D building blocks.

**Placement rule:** houses and hotels may appear **only on top of the
colored strip of a property**. They must not overlap the property's printed
name, appear on a blank non-property space, or sit in the central board.

The prototype currently places **one house on Marlowe (index 37, space #38)**
and **one hotel on Coyle (index 39, space #40)** as *visual samples*.
They do not affect ownership, rent, purchase prices, or rules yet.

## Board validation

Run `node tests/board.test.mjs` to verify that all 40 names and special-space positions match the design. This is optional and does not affect the deployed game.

## Notes
The positions are tested programmatically: GO index 0 (bottom-right), Bowling Avenue index 1 (directly left), Chance index 7 (between Campbell Rd and Robbins Dr), Community Chest index 33 (between Greenfield Rd and 7 Mile), and Coyle index 39 (directly above GO).

Three.js is open source (MIT license). The game uses procedurally built meshes and custom drawn textures; no MONOPOLY GO! assets or source code were used.
