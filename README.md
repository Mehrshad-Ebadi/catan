# Hex Harbor — Online hex-island game (2–6 players)

A multiplayer, browser-based **Catan-style** strategy game with original visual design, no proprietary artwork, and **no external npm dependencies**. Games take place in private rooms with 6-character codes.

## Quick start

You need **Node.js 18 or newer**.

```bash
cd hex-harbor-online
npm start
```

On the same computer, open **http://localhost:3000**. Click **Create a new room**, choose a name, and share the room link with friends. Once 2–6 players have joined, the host clicks **Start the game**.

To play from **different places on the internet**, you must host this Node server publicly (for example on Render, Railway, Fly.io, or a VPS). When you deploy, make sure the server listens on the platform-provided `PORT`. This project already does that. Share your hosted HTTPS URL with friends, not `localhost`.

To test on **different computers on the same Wi-Fi**, run the server on one computer and open `http://YOUR-COMPUTER-LAN-IP:3000` on the other computers (allow the port through your firewall).

## Rules included

- 2–6 players on a 30-hex island, two opening settlement/road placements in snake order.
- Roll two dice, collect lumber / brick / wool / grain / ore from bordering numbered hexes.
- Build roads, settlements, and cities. Settlements obey the distance rule; you need a connected road after setup.
- 7 triggers random discard of half the resources of every player holding more than 7, then active player moves the robber and automatically steals one randomly chosen resource from a random eligible adjacent rival.
- Trade resources with other players via offers and accept/reject; or trade 4 of one resource for 1 with the bank.
- Development cards: Knights, Victory Points, Road Building, Year of Plenty, Monopoly.
- Largest Army (3+ played knights) and Longest Road (5+ connected edges) are worth 2 victory points; no roads may continue through an opponent settlement.
- First to **10 victory points** wins. Only the current player may take building actions. The server verifies each move.
- Player hands and unplayed development card identities are visible only to their owner. Room state is kept in memory.

## Important differences from official Catan

Hex Harbor is a fan-made, simplified implementation, **not the official Catan game or a licensed product**. Its 5–6 player version does **not** implement the edition-specific paired-player/special-building phase, port trade discounts, manually choosing discards, or choosing whom to rob when several targets are adjacent. Development point cards count openly in the scoreboard rather than being hidden. There are no persistence/accounts, bots, observers, or anti-cheat protections beyond server-side rule validation. Room state disappears if the server restarts. These can be extended later.

## Useful commands

```bash
npm start                # start server on port 3000
PORT=8080 npm start      # use another port
npm test                 # run rules and multiplayer API tests
```

## Project files

- `server.js` — HTTP API, private room sessions, live Server-Sent Events updates, static file server
- `game.js` — board generation, legality checks, turn and resource rules, victory conditions
- `public/index.html` — the web application page
- `public/styles.css` — responsive interface and original theme
- `public/app.js` — client-side room UI, clickable SVG board, chat, actions
- `tests/` — automated tests

## Security & hosting

Tokens are stored in the browser's local storage and must be kept private. Room invite URLs contain only room codes, not player tokens. For an internet deployment, use HTTPS and consider server-side persistence, anti-spam, authentication, and rate limiting before opening the game to the public.

## Example deployment using Render

Create a repository containing the project files and connect it as a new **Web Service** on Render. The included `render.yaml` specifies the Node runtime and start command. Alternatively, enter `npm install` as the build command and `npm start` as the start command manually. When deployed, use the public HTTPS URL to create and join rooms. For stable, uninterrupted game nights, use a hosting option that does not automatically sleep or restart the process; this version keeps room state only in memory.
