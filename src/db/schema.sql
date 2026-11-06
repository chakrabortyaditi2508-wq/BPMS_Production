-- ============================================================================
-- ProductionPulse BPMS - Relational SQL Database Architecture (PostgreSQL)
-- Phase: Enterprise Relational Migration (Clean Slate Architecture)
-- Purge: Zero legacy/stale records imported. Clean initialization.
-- Seed: Single Super Admin (modelatech2026@gmail.com)
-- ============================================================================

-- Ensure UUID generator extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMS & DOMAINS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'SUPER_ADMIN',
        'ADMIN',
        'BIM_DIRECTOR',
        'BIM_COORDINATOR',
        'BIM_SPECIALIST',
        'EDITOR',
        'VIEWER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE availability_status AS ENUM (
        'ACTIVE',
        'INACTIVE',
        'ON_LEAVE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE bim_discipline AS ENUM (
        'BIM - ACS',
        'Structure',
        'MEP - HVAC',
        'MEP - Electrical',
        'MEP - Plumbing',
        'Fire Protection',
        'Façade / Envelope',
        'Coordination & QA',
        'AI & Automation'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE request_status AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'ACTIVE',
        'ON_HOLD',
        'COMPLETED',
        'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM (
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'TODO',
        'IN_PROGRESS',
        'REVIEW',
        'COMPLETED',
        'BLOCKED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lod_level AS ENUM (
        'LOD_100',
        'LOD_200',
        'LOD_300',
        'LOD_350',
        'LOD_400',
        'LOD_500'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. AUTOMATIC UPDATED_AT TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. TABLES DEFINITIONS
-- ============================================================================

-- Table A: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'VIEWER',
    primary_discipline bim_discipline NOT NULL DEFAULT 'BIM - ACS',
    weekly_capacity_hrs INT NOT NULL DEFAULT 40 CHECK (weekly_capacity_hrs >= 0 AND weekly_capacity_hrs <= 168),
    availability_status availability_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Table B: access_requests (Sign-in & Gating Queue)
CREATE TABLE IF NOT EXISTS access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    requested_role user_role NOT NULL DEFAULT 'EDITOR',
    discipline bim_discipline NOT NULL DEFAULT 'BIM - ACS',
    reason_for_access TEXT,
    rejection_reason TEXT,
    status request_status NOT NULL DEFAULT 'PENDING',
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_access_requests_updated_at ON access_requests;
CREATE TRIGGER trg_access_requests_updated_at
    BEFORE UPDATE ON access_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Table C: projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(150),
    status project_status NOT NULL DEFAULT 'ACTIVE',
    start_date DATE,
    end_date DATE,
    budget_hours NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    lead_bim_coordinator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    target_lod lod_level NOT NULL DEFAULT 'LOD_300',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Table D: project_memberships (Many-to-Many junction)
CREATE TABLE IF NOT EXISTS project_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_project VARCHAR(100) NOT NULL DEFAULT 'BIM Modeler',
    allocated_hours_per_week NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (allocated_hours_per_week >= 0),
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_user UNIQUE (project_id, user_id)
);

DROP TRIGGER IF EXISTS trg_project_memberships_updated_at ON project_memberships;
CREATE TRIGGER trg_project_memberships_updated_at
    BEFORE UPDATE ON project_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Table E: tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    discipline bim_discipline NOT NULL DEFAULT 'BIM - ACS',
    lod_level lod_level NOT NULL DEFAULT 'LOD_300',
    priority task_priority NOT NULL DEFAULT 'MEDIUM',
    status task_status NOT NULL DEFAULT 'TODO',
    due_date DATE,
    estimated_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    actual_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Table F: time_logs / work_logs (Daily Hour Tracking & Timesheets)
CREATE TABLE IF NOT EXISTS time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_logged NUMERIC(5,2) NOT NULL CHECK (hours_logged >= 0 AND hours_logged <= 24),
    discipline VARCHAR(100) NOT NULL DEFAULT 'BIM - ACS',
    lod_stage VARCHAR(50) NOT NULL DEFAULT 'LOD 300',
    notes TEXT,
    billable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_time_logs_updated_at ON time_logs;
CREATE TRIGGER trg_time_logs_updated_at
    BEFORE UPDATE ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Table G: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    performed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_entity VARCHAR(100) NOT NULL,
    target_entity_id VARCHAR(255) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. PERFORMANCE & CONSTRAINT INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_availability ON users(availability_status);

CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created ON access_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(code);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_bim_coordinator_id);

CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_project_memberships_proj ON project_memberships(project_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_time_logs_user_date ON time_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_project_date ON time_logs(project_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_task ON time_logs(task_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================================
-- 5. CLEAN SLATE PURGE & INITIAL PRE-SEEDED SUPER ADMIN
-- ============================================================================

-- Purge any stale development/test data
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE time_logs CASCADE;
TRUNCATE TABLE tasks CASCADE;
TRUNCATE TABLE project_memberships CASCADE;
TRUNCATE TABLE projects CASCADE;
TRUNCATE TABLE access_requests CASCADE;
DELETE FROM users WHERE email NOT IN ('modelatech2026@gmail.com', 'sushoovandas@gmail.com');

-- Seed the authorized Super Admin accounts
INSERT INTO users (
    id,
    full_name,
    email,
    role,
    primary_discipline,
    weekly_capacity_hrs,
    availability_status
) VALUES 
(
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Aditi Chakraborty',
    'modelatech2026@gmail.com',
    'SUPER_ADMIN',
    'AI & Automation',
    40,
    'ACTIVE'
),
(
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'Sushoovan Das',
    'sushoovandas@gmail.com',
    'SUPER_ADMIN',
    'Coordination & QA',
    40,
    'ACTIVE'
) ON CONFLICT (email) DO UPDATE SET
    role = 'SUPER_ADMIN',
    availability_status = 'ACTIVE',
    updated_at = NOW();

-- Record initial audit trail for migration
INSERT INTO audit_logs (
    action,
    performed_by_user_id,
    target_entity,
    target_entity_id,
    details
) VALUES (
    'DATABASE_MIGRATION_INITIALIZED',
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'SYSTEM',
    'RELATIONAL_SQL_V1',
    '{"message": "ProductionPulse BPMS migrated to Relational SQL Database with clean slate.", "superAdmins": ["modelatech2026@gmail.com", "sushoovandas@gmail.com"]}'::jsonb
);
