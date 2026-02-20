# All India Public Radio

A WarGames/WOPR-styled internet radio platform on a map of India. Users create "radio stations" as pins on a dark tactical map. Stations broadcast ordered playlists of YouTube videos and TTS announcements live and in sync — no streaming server required.

---

## Features

- **Authenticated users** can create up to 3 radio stations, placed as pins on a map of India
- **Stations** have ordered playlists of YouTube video segments and SAM/TTS announcement segments
- **Live broadcasting** — the station goes live with a timestamp; any listener who tunes in syncs to the exact position in the playlist using simple math
- **Global chat** via socket.io with rate limiting and history
- **WOPR/WarGames aesthetic** — CRT scanlines, phosphor cyan-on-black, pulsing radar pins
- **Fully client-rendered SPA** — map is 100vw × 100vh with all panels floating on top

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + Express + socket.io |
| Database | SQLite (better-sqlite3) |
| Auth | bcryptjs + JWT |
| Map | Leaflet.js + CartoDB Dark Matter |
| YouTube | IFrame Player API |
| TTS | Web Speech API (SAM-style robotic voice) |
| Frontend | Vanilla JS, no framework |

---

## Setup

### Prerequisites

- Node.js >= 18.0.0
- npm

### Install

```bash
git clone <repo-url>
cd Radio-India-
npm install
```

### Run

```bash
npm start
```

The server starts on port 3000 (or `$PORT` environment variable).  
Open http://localhost:3000

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `all-india-public-radio-secret-dev` | JWT signing secret (change in production!) |

---

## File Structure

```
├── server/
│   ├── index.js              # Express + socket.io entry point
│   ├── db.js                 # SQLite setup
│   ├── schema.sql            # Database schema
│   ├── routes/
│   │   ├── auth.js           # Register, login, me
│   │   ├── stations.js       # CRUD stations
│   │   ├── segments.js       # CRUD segments
│   │   ├── broadcast.js      # Go live, stop, now
│   │   └── youtube.js        # YouTube embed validation
│   ├── middleware/
│   │   └── auth.js           # JWT middleware
│   ├── services/
│   │   ├── tts.js            # TTS audio helpers
│   │   └── youtube.js        # YouTube validation helper
│   └── chat/
│       └── socket.js         # socket.io global chat + station rooms
│
├── public/
│   ├── index.html            # Single page app
│   ├── css/
│   │   ├── main.css          # Layout, CRT effects, base styles
│   │   ├── map.css           # Map filter, pin styles, radar pulse
│   │   ├── panels.css        # Terminal-style floating panels
│   │   └── chat.css          # Draggable chat panel
│   └── js/
│       ├── app.js            # Entry point, initializes all modules
│       ├── map.js            # Leaflet map, pins
│       ├── auth.js           # Login/register modal
│       ├── station.js        # Station popup, create/edit/delete
│       ├── segments.js       # Segment list, add/reorder/remove
│       ├── player.js         # Playback sync, YouTube + TTS
│       ├── chat.js           # Chat client, draggable panel
│       └── utils.js          # Helpers, API fetch wrapper
│
├── package.json
└── README.md
```

---

## API Reference

### Auth
- `POST /api/auth/register` — `{ username, password }` → `{ token, username }`
- `POST /api/auth/login` — `{ username, password }` → `{ token, username }`
- `GET /api/auth/me` — returns current user (auth required)

### Stations
- `GET /api/stations` — all stations (map pins)
- `GET /api/stations/:id` — station detail + segments
- `POST /api/stations` — create station (auth, max 3 per user)
- `PUT /api/stations/:id` — update station (owner, not live)
- `DELETE /api/stations/:id` — delete station (owner, not live)

### Segments
- `GET /api/stations/:id/segments` — list segments in order
- `POST /api/stations/:id/segments` — add segment (owner, not live)
- `PUT /api/stations/:id/segments/:segId` — edit segment
- `DELETE /api/stations/:id/segments/:segId` — remove segment
- `PUT /api/stations/:id/segments/reorder` — reorder `{ order: [id, id, ...] }`

### Broadcast
- `POST /api/stations/:id/live` — go live (requires ≥1 segment)
- `POST /api/stations/:id/stop` — stop broadcast
- `GET /api/stations/:id/now` — current sync position

### YouTube
- `GET /api/youtube/validate?v=VIDEO_ID` — validate + get title (auth required)

### Stats
- `GET /api/stats` — `{ stations_total, stations_live, users_total, listeners_online, server_time }`

---

## How Broadcasting Works

Broadcasting requires **no streaming server**. It's pure math:

1. When a station goes live, the server records a `broadcast_start` timestamp
2. The station's "timeline" is the sum of all segment durations
3. Any client that tunes in calculates:
   ```
   elapsed_ms = Date.now() - broadcast_start
   position_ms = loop ? elapsed_ms % total_ms : min(elapsed_ms, total_ms)
   ```
4. Walk the segment list to find which segment the position falls in
5. For YouTube: load the IFrame player and call `seekTo(offset)`
6. For TTS: generate speech and advance to next segment after duration

---

## Deployment (Render / Glitch / Railway)

1. Push code to GitHub
2. Connect to Render (or similar), set start command to `npm start`
3. Set environment variable `JWT_SECRET` to a random secret
4. The SQLite database is written to `radio.sqlite` in the project root

> **Note**: On free-tier hosting with ephemeral filesystems, the SQLite database resets on restart. For persistence, consider mounting a disk or migrating to PostgreSQL.
