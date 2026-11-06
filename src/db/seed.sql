-- ============================================================================
-- ProductionPulse BPMS - Database Seed Script
-- Target: Clean Slate with Whitelisted Super Admins
-- ============================================================================

-- Clean purge of all existing records
BEGIN;

TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE time_logs CASCADE;
TRUNCATE TABLE tasks CASCADE;
TRUNCATE TABLE project_memberships CASCADE;
TRUNCATE TABLE projects CASCADE;
TRUNCATE TABLE access_requests CASCADE;
DELETE FROM users WHERE email NOT IN ('modelatech2026@gmail.com', 'sushoovandas@gmail.com');

-- Pre-seed Whitelisted Super Admins
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

COMMIT;
