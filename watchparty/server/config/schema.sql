-- ============================================================
-- WatchParty — Full Supabase Schema
-- Paste this into your Supabase SQL Editor and click Run
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color  TEXT DEFAULT '#6C63FF',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  invite_code  TEXT UNIQUE NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id   UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id    UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT NOT NULL,
  type       TEXT DEFAULT 'text',
  content    TEXT,
  voice_url  TEXT,
  duration   FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  filename    TEXT,
  source_type TEXT DEFAULT 'upload',
  source_url  TEXT,
  file_size   BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room     ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_room       ON videos(room_id);
