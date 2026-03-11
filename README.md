# All India Public Radio

A WarGames-styled internet radio platform on a map of India. Users can place virtual radio stations anywhere on an interactive map of India, program them with YouTube audio or text-to-speech segments, and broadcast live to listeners tuning in from a shared map view.

---

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Run Instructions](#run-instructions)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Future Plans](#future-plans)

---

## Project Description

**All India Public Radio** is a web-based, retro-themed radio broadcasting platform inspired by the aesthetic of 1980s war-room interfaces. It lets anyone become a radio station operator — without any hardware.

### Key Features

- 🗺️ **Map-Based Station Creation** — Drop a station pin anywhere on the interactive Leaflet.js map of India.
- 🎵 **YouTube Segments** — Queue YouTube videos as audio-only broadcast segments.
- 🔊 **Text-to-Speech (TTS) Segments** — Add spoken-word announcements using browser-based TTS.
- 📡 **Live Broadcasting** — Go live from your station; listeners can tune in through the shared map in real time.
- 🔐 **User Accounts** — Register and log in to manage your own stations and segment schedules.

---

## Tech Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Runtime      | [Node.js](https://nodejs.org/) (v18+) |
| Web Framework| Express.js                          |
| Database     | SQLite (via `better-sqlite3`)       |
| Frontend Map | [Leaflet.js](https://leafletjs.com/) |
| Tile Layer   | OpenStreetMap / compatible CDN      |
| Audio        | YouTube IFrame API, Web Speech API  |
| Templating   | EJS (or plain HTML + fetch)         |
| Auth         | Session-based (express-session)     |

---

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) **v18 or later**
- **npm** v9 or later (bundled with Node.js)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Edelfikter/Radio-India-.git
cd Radio-India-
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize the Database

The app uses a local SQLite database. Run the initialization script to create the required tables:

```bash
npm run db:init
```

> If no `db:init` script is present, the database is created automatically on first run.

---

## Run Instructions

### Start the Development Server

```bash
npm start
```

The application will be available at:

```
http://localhost:3000
```

> The default port is **3000**. To use a different port, set the `PORT` environment variable:
> ```bash
> PORT=8080 npm start
> ```

---

## Usage Guide

### 1. Register / Login

1. Open `http://localhost:3000` in your browser.
2. Click **Register** to create a new account (username + password).
3. Log in with your credentials. Your session is preserved across page reloads.

### 2. Create a Station

1. After logging in, click anywhere on the map of India.
2. A dialog will prompt you to name your new station.
3. Confirm to place the station pin on the map.

### 3. Add Segments to a Station

1. Click your station pin to open its control panel.
2. Choose a segment type:
   - **YouTube** — paste a YouTube video URL; the audio track will be queued.
   - **Text-to-Speech** — type a message; it will be read aloud using the browser's speech engine.
3. Arrange segments in your desired playback order.

### 4. Go Live / Listen

1. From your station's control panel, click **Go Live** to begin broadcasting.
2. Listeners visiting the map will see your station highlighted as active.
3. Click an active station pin to tune in and hear the current broadcast.

---

## Troubleshooting

### Map Does Not Load / Tiles Are Missing

**Symptom:** The Leaflet map appears but shows grey tiles or no map imagery.

**Cause:** A firewall, corporate proxy, or ISP may be blocking requests to the OpenStreetMap tile CDN (`tile.openstreetmap.org`).

**Fix options:**
- Check your network connection and ensure `*.openstreetmap.org` is not blocked.
- Switch to an alternative tile provider in the Leaflet configuration (e.g., [Carto](https://carto.com/basemaps/), [Stamen](http://maps.stamen.com/)).
- If behind a proxy, configure the `HTTP_PROXY` / `HTTPS_PROXY` environment variables.

### Leaflet.js Fails to Load

**Symptom:** Browser console shows `Leaflet is not defined` or map container is blank.

**Cause:** The Leaflet CDN URL may be unreachable.

**Fix:** Self-host Leaflet by downloading it from [https://leafletjs.com/download.html](https://leafletjs.com/download.html) and updating the `<script>` and `<link>` tags in your HTML to point to the local files.

### YouTube Audio Does Not Play

**Symptom:** YouTube segments are queued but produce no sound.

**Cause:** Autoplay may be blocked by the browser, or the video may be region-restricted.

**Fix:**
- Interact with the page first (click anywhere) to satisfy browser autoplay policies.
- Use YouTube videos that are publicly available in your region.

### Port Already in Use

**Symptom:** `Error: listen EADDRINUSE :::3000`

**Fix:** Stop the process using port 3000, or run the server on a different port:
```bash
PORT=3001 npm start
```

---

## Future Plans

- 🌐 **Multi-region maps** — Expand beyond India to support global station placement.
- 📅 **Scheduled Broadcasting** — Let station operators schedule future broadcast times.
- 💬 **Live Listener Chat** — A real-time chat overlay for active broadcasts.
- 🎙️ **Microphone Input** — Allow live voice broadcasting directly from the browser.
- 📱 **Mobile-Responsive UI** — Improve the map and control panel layout for mobile devices.
- 🔒 **OAuth Login** — Support sign-in via Google or GitHub.
- 🗂️ **Station Archives** — Record and replay past broadcasts on demand.