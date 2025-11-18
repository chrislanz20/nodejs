-- Migration: Add team_members and activity_log tables
-- Created: 2025-01-17

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Viewer',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  CONSTRAINT team_members_email_client_unique UNIQUE (client_id, email),
  CONSTRAINT team_members_role_check CHECK (role IN ('Admin', 'Sales', 'Support', 'Viewer'))
);

-- Activity Log table
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  team_member_id INTEGER REFERENCES team_members(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  call_id TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_team_members_client_id ON team_members(client_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(active);
CREATE INDEX IF NOT EXISTS idx_activity_log_team_member_id ON activity_log(team_member_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_client_id ON activity_log(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Comments
COMMENT ON TABLE team_members IS 'Team members who can access client dashboards';
COMMENT ON TABLE activity_log IS 'Activity tracking for team members';
COMMENT ON COLUMN team_members.role IS 'Admin: Full access, Sales: View + export, Support: View only, Viewer: Read-only';
