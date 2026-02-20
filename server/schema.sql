CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    is_live INTEGER DEFAULT 0,
    loop INTEGER DEFAULT 1,
    broadcast_start DATETIME DEFAULT NULL,
    fade_ms INTEGER DEFAULT 2000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('youtube', 'tts')),
    youtube_video_id TEXT DEFAULT NULL,
    youtube_title TEXT DEFAULT NULL,
    start_offset_sec REAL DEFAULT 0,
    end_offset_sec REAL DEFAULT NULL,
    tts_text TEXT DEFAULT NULL,
    tts_audio_url TEXT DEFAULT NULL,
    duration_sec REAL NOT NULL,
    fade_in_ms INTEGER DEFAULT 0,
    fade_out_ms INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stations_owner ON stations(owner_id);
CREATE INDEX IF NOT EXISTS idx_segments_station ON segments(station_id, position);
