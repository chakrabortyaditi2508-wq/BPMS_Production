/**
 * ProductionPulse BPMS - Relational SQL Database Layer & TypeScript Definitions
 * 
 * Complies with PostgreSQL Relational Schema:
 * - users
 * - access_requests
 * - projects
 * - project_memberships
 * - tasks
 * - time_logs
 * - audit_logs
 */

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'BIM_DIRECTOR'
  | 'BIM_COORDINATOR'
  | 'BIM_SPECIALIST'
  | 'EDITOR'
  | 'VIEWER';

export type AvailabilityStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export type BimDiscipline =
  | 'BIM - ACS'
  | 'Structure'
  | 'MEP - HVAC'
  | 'MEP - Electrical'
  | 'MEP - Plumbing'
  | 'Fire Protection'
  | 'Façade / Envelope'
  | 'Coordination & QA'
  | 'AI & Automation';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'BLOCKED';

export type LodLevel =
  | 'LOD_100'
  | 'LOD_200'
  | 'LOD_300'
  | 'LOD_350'
  | 'LOD_400'
  | 'LOD_500';

export interface SqlUser {
  id: string; // UUID
  full_name: string;
  email: string;
  phone_number?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  primary_discipline: BimDiscipline;
  weekly_capacity_hrs: number;
  availability_status: AvailabilityStatus;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqlAccessRequest {
  id: string; // UUID
  full_name: string;
  email: string;
  requested_role: UserRole;
  discipline: BimDiscipline;
  reason_for_access?: string | null;
  rejection_reason?: string | null;
  status: RequestStatus;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqlProject {
  id: string; // UUID
  name: string;
  code: string;
  client_name?: string | null;
  status: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  budget_hours: number;
  lead_bim_coordinator_id?: string | null;
  description?: string | null;
  target_lod: LodLevel;
  created_at: string;
  updated_at: string;
}

export interface SqlProjectMembership {
  id: string; // UUID
  project_id: string;
  user_id: string;
  role_in_project: string;
  allocated_hours_per_week: number;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface SqlTask {
  id: string; // UUID
  project_id: string;
  assigned_user_id?: string | null;
  title: string;
  description?: string | null;
  discipline: BimDiscipline;
  lod_level: LodLevel;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string | null;
  estimated_hours: number;
  actual_hours: number;
  created_at: string;
  updated_at: string;
}

export interface SqlTimeLog {
  id: string; // UUID
  user_id: string;
  project_id: string;
  task_id?: string | null;
  log_date: string;
  hours_logged: number;
  discipline: string;
  lod_stage: string;
  notes?: string | null;
  billable: boolean;
  created_at: string;
  updated_at: string;
}

export interface SqlAuditLog {
  id: string; // UUID
  action: string;
  performed_by_user_id?: string | null;
  target_entity: string;
  target_entity_id: string;
  details?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
}

/**
 * Default pre-seeded Super Admin accounts
 */
export const PRE_SEEDED_SUPER_ADMINS: Readonly<SqlUser[]> = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    full_name: 'Aditi Chakraborty',
    email: 'modelatech2026@gmail.com',
    phone_number: null,
    avatar_url: null,
    role: 'SUPER_ADMIN',
    primary_discipline: 'AI & Automation',
    weekly_capacity_hrs: 40,
    availability_status: 'ACTIVE',
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    full_name: 'Sushoovan Das',
    email: 'sushoovandas@gmail.com',
    phone_number: null,
    avatar_url: null,
    role: 'SUPER_ADMIN',
    primary_discipline: 'Coordination & QA',
    weekly_capacity_hrs: 40,
    availability_status: 'ACTIVE',
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const PRE_SEEDED_SUPER_ADMIN = PRE_SEEDED_SUPER_ADMINS[0];
