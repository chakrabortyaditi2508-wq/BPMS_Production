export type Discipline =
  | 'ACS'
  | 'MEP'
  | 'SCAN TO BIM'
  | 'CAD'
  | 'BIM - ACS'
  | 'BIM - MEP'
  | 'Structure'
  | 'Structural'
  | 'MEP - HVAC'
  | 'MEP - Electrical'
  | 'MEP - Plumbing'
  | 'SES'
  | 'Fire Protection'
  | 'Façade / Envelope'
  | 'Coordination & QA'
  | 'Infrastructure'
  | 'AI & Automation'
  | 'Estimation';

export const PRIMARY_DISCIPLINES = [
  "ACS",
  "MEP",
  "SCAN TO BIM",
  "CAD",
  "BIM - ACS",
  "Structure",
  "Structural",
  "BIM - MEP",
  "MEP - HVAC",
  "MEP - Electrical",
  "MEP - Plumbing",
  "SES",
  "Fire Protection",
  "Façade / Envelope",
  "Coordination & QA",
  "Infrastructure",
  "AI & Automation",
  "Estimation"
];

export type LODLevel =
  | 'LOD 100'
  | 'LOD 200'
  | 'LOD 300'
  | 'LOD 350'
  | 'LOD 400'
  | 'LOD 500';

export const PROJECT_STATUS_OPTIONS = [
  'WIP',
  'On Track',
  'At Risk',
  'HOLD',
  'CLOSED',
  'Completed',
  'Delayed',
  'Pending Kickoff',
] as const;

export type ProjectStatus =
  | 'WIP'
  | 'On Track'
  | 'At Risk'
  | 'HOLD'
  | 'CLOSED'
  | 'Completed'
  | 'Delayed'
  | 'Pending Kickoff'
  | string;

export const ROLE_TITLES = [
  'Super Admin',
  'BIM Director',
  'Lead BIM Coordinator',
  'Senior Structural Specialist',
  'Architectural BIM Specialist',
  'Senior MEP Modeler',
  'QA/QC & Clash Specialist',
  'Computational BIM Engineer',
  'Assistant Manager',
  'Manager',
  'Intern',
  'Fresher',
  'CEO',
  'CFO',
  'CMO',
  'COO',
  'CTO',
] as const;

export const ROLE_OPTIONS = ROLE_TITLES;

export type EmployeeRole =
  | typeof ROLE_TITLES[number]
  | 'BIM Project Manager'
  | string;

export type ActivityType =
  | 'Drawing'
  | 'Input Document study'
  | 'Estimation'
  | 'QA & QC'
  | 'RFI , Mark up & issue Creation'
  | 'Dynamo Script Making'
  | 'Addins & Pluggins Creation'
  | '3D Detailed Modeling'
  | 'Clash Detection & Resolution'
  | 'Construction Documentation & Sheets'
  | 'Parametric Family Creation'
  | 'Coordination & Navisworks Review'
  | 'COBie & Asset Data Entry'
  | 'Scan-to-BIM Point Cloud Modeling'
  | '2D to 3D Conversion'
  | 'AI & Automation';

export interface TaskItem {
  id: string;
  projectId: string;
  name: string;
  discipline: Discipline;
  lod: LODLevel;
  estimatedHours: number;
  completedHours: number;
  status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed';
  assignedEmployeeId: string;
  dueDate: string;
}

export interface Milestone {
  id: string;
  title: string;
  targetDate: string;
  completionDate?: string;
  status: 'completed' | 'in-progress' | 'upcoming' | 'delayed';
  deliverableDescription: string;
  lodRequirement: LODLevel;
}

export interface ClashRecord {
  id: string;
  disciplineA: Discipline;
  disciplineB: Discipline;
  severity: 'Critical' | 'Major' | 'Minor';
  status: 'New' | 'Active' | 'Reviewed' | 'Resolved';
  elementRef: string;
  locationDescription: string;
  assignedToEmployeeId: string;
  identifiedDate: string;
  resolvedDate?: string;
}

export interface DailyWorkLog {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  date: string; // YYYY-MM-DD
  hoursLogged: number;
  discipline: Discipline;
  activityType: ActivityType;
  taskName: string;
  lodStage: LODLevel;
  notes: string;
  billable: boolean;
  timestamp: string;
  memberEmail?: string;
  userEmail?: string;
  userId?: string;
  memberId?: string;
  isTestEntry?: boolean;
  loggedBy?: string;
  createdAt?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: EmployeeRole;
  primaryDiscipline: Discipline;
  discipline?: Discipline;
  hourlyRate?: number;
  experienceYears?: number;
  weeklyCapacityHours: number; // typically 40
  activeProjectIds: string[];
  skills: string[];
  status: 'Active' | 'On Leave' | 'High Workload' | 'Suspended' | 'deleted';
  isDeleted?: boolean;
  phone?: string;
}

export interface BimProject {
  id: string;
  code: string; // e.g. BIM-2026-08
  name: string;
  clientName: string;
  buildingType: string; // e.g. Healthcare, Commercial High-Rise, Data Center
  location: string;
  grossFloorAreaSqm: number;
  startDate: string;
  targetCompletionDate: string;
  plannedDeliveryDate?: string;
  actualDeliveredDate?: string;
  status: ProjectStatus;
  totalEstimatedHours: number;
  estimatedHours?: number;
  manualEstimatedHoursOverride?: number;
  changedHours?: number;
  additionalHours?: number;
  manualChangedHoursOverride?: number;
  totalCompletedHours?: number;
  totalLogged?: number;
  manualHoursOverride?: number;
  manualHoursBaseLogged?: number;
  isManualLoggedOverride?: boolean;
  currentLOD: LODLevel;
  targetLOD: LODLevel;
  budgetAmount: number;
  disciplines: Discipline[];
  milestones: Milestone[];
  tasks: TaskItem[];
  clashes: ClashRecord[];
  assignedEmployeeIds: string[];
  description: string;
  cloudModelUrn?: string;
}

export type ThemeMode = 'dark' | 'light';

export interface EmailNotificationSettings {
  enabled: boolean;
  recipients: string[];
  includePdfAttachment: boolean;
  includeClashSummary: boolean;
  includeHoursBreakdown: boolean;
}

export interface GeneratedStakeholderReport {
  id: string;
  projectId: string;
  projectName: string;
  generatedAt: string;
  period: string;
  audience: string;
  executiveSummary: string;
  overallHealthStatus: 'On Track' | 'Needs Attention' | 'Critical Risk';
  emailNotificationSent?: boolean;
  emailRecipients?: string[];
  hoursAnalysis: {
    burnEfficiency: string;
    completionRate: string;
    velocityAssessment: string;
    forecastedCompletion: string;
  };
  lodAndDeliverables: {
    currentStage: string;
    highlights: string[];
    keyAchievements: string[];
  };
  clashAndQualityStatus: {
    totalClashes: string;
    highSeverityRisks: string[];
    coordinationQualityScore: string;
  };
  risksAndMitigations: Array<{
    risk: string;
    impact: 'High' | 'Medium' | 'Low';
    mitigationAction: string;
    owner: string;
  }>;
  stakeholderRecommendations: string[];
  nextPeriodPriorities: string[];
}

export type AccessLevel = 'Super Admin' | 'Director' | 'BIM Admin' | 'Project Manager' | 'Editor' | 'Viewer';

export interface UserAccessRecord {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  accessLevel: AccessLevel;
  canEditProjects: boolean;
  canEditHours: boolean;
  canManageTeam: boolean;
  canDeleteRecords: boolean;
  canExportReports: boolean;
  assignedProjectIds: string[];
  status: 'Active' | 'Invited' | 'Suspended' | 'Pending Approval';
  lastActive: string;
}

export type BimServiceType =
  | 'BIM - ACS'
  | 'Structure'
  | 'MEP - HVAC'
  | 'MEP - Electrical'
  | 'MEP - Plumbing'
  | 'CAD'
  | 'SES'
  | 'BIM - MEP'
  | 'Façade / Envelope'
  | 'Coordination & QA'
  | 'Fire Protection'
  | 'AI & Automation'
  | 'Estimation'
  | 'SCAN TO BIM'
  | 'ACS'
  | 'MEP';

export type PrimaryDiscipline =
  | 'Architectural'
  | 'Structural'
  | 'BIM - MEP'
  | 'MEP'
  | 'Point Cloud / Scan to BIM Specialist'
  | 'CAD Specialist'
  | 'BIM Management / QA/QC'
  | 'AI & Automation';

export type BimTaskType =
  | 'Clash Detection'
  | 'Parameter Population'
  | '3D Modeling'
  | '2D Sheet Generation'
  | 'QC/QA Audit'
  | 'COBie Data Entry'
  | 'AI & Automation';

export type AllocationPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface ResourceAllocationItem {
  id: string;
  projectId: string;
  projectName: string;
  employeeId: string;
  memberId?: string;
  assignedTo?: string;
  employeeName: string;
  assignedToName?: string;
  memberName?: string;
  employeeRole: string;
  memberEmail?: string;
  assignedToEmail?: string;
  discipline: 'BIM - ACS' | 'BIM - MEP' | 'Architectural' | 'Structural' | 'MEP' | 'Infrastructure' | 'Coordination & QA' | 'AI & Automation' | Discipline;
  lod?: 'LOD 200' | 'LOD 300' | 'LOD 350' | 'LOD 400';
  projectPhase: 'Schematic Design' | 'Design Development' | 'Construction Documentation' | 'Fabrication / As-Built';
  taskType: BimTaskType;
  targetElementOrZone?: string; // e.g. MOD-MEP-LVL02-ZONE-B
  assignedHours: number;
  viewFrequency: 'Daily' | 'Weekly';
  startDate: string;
  dueDate: string;
  priority?: AllocationPriority;
  status: 'Allocated' | 'In Progress' | 'Completed' | 'Delayed';
  notes?: string;
  updatedAt?: string;
}

export interface ProjectFeedbackItem {
  id: string;
  projectId: string;
  projectName: string;
  clientName?: string;
  rating: number; // 1 to 5 stars
  feedbackText: string;
  category: 'Quality of BIM Deliverables' | 'Delivery Speed & Milestones' | 'Clash Resolution & Coordination' | 'Communication & Responsiveness' | 'General Client Satisfaction';
  authorName: string;
  authorRole: 'Client Stakeholder' | 'BIM Lead Reviewer' | 'QA/QC Auditor' | 'Principal Architect' | 'General Contractor';
  date: string;
  sentiment: 'positive' | 'neutral' | 'constructive';
  status: 'Published' | 'Under Review' | 'Action Item Created';
  tags: string[];
  actionItem?: string;
}

export type ViewTab =
  | 'dashboard'
  | 'projects'
  | 'daily-tracker'
  | 'project-members'
  | 'employees'
  | 'assign-hours'
  | 'project-feedback'
  | 'clash-lod'
  | 'stakeholder-reports'
  | 'admin-nexus';

export type UserApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'pending_approval'
  | 'pending'
  | 'active'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type UserRole = 'SUPER_ADMIN' | 'DIRECTOR' | 'PROJECT_MANAGER' | 'MANAGER' | 'EDITOR' | 'VIEWER';

export interface UserDatabaseModel {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface OnboardingRequest {
  id: string;
  googleId?: string;
  email: string;
  name: string;
  fullName?: string;
  discipline?: string;
  assignedDiscipline?: Discipline | string;
  orgDiscipline?: Discipline | string;
  reasonForAccess?: string;
  createdAt?: string;
  avatar?: string;
  role?: string;
  requestedRole: string;
  primaryDiscipline?: Discipline | string;
  requestedAt?: string;
  requestTimestamp: string;
  timestamp?: string;
  status: UserApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  assignedRole?: UserRole;
  assignedAccessLevel?: AccessLevel;
  notes?: string;
  organization?: string;
  accessReason?: string;
  isDeleted?: boolean;
}

export type SecurityRole =
  | 'Super Admin'
  | 'Director'
  | 'Project Manager'
  | 'BIM Specialist'
  | 'Lead Coordinator'
  | 'Editor'
  | 'Viewer';

export interface OrganizationalPermissions {
  canViewAnalytics: boolean;
  canEditProjects: boolean;
  canLogHours: boolean;
  canManageTeam: boolean;
  canAccessAdminNexus: boolean;
  canDeleteRecords: boolean;
  canExportReports: boolean;
  canManageSecurity: boolean;
  canAssignHours: boolean;
  canReviewClashes: boolean;
}

export interface SessionTokenInfo {
  token: string;
  issuedAt: string;
  expiresAt: string;
  ipAddress: string;
  deviceLabel: string;
  browser: string;
  is2FAVerified: boolean;
  lastActive: string;
}

export interface TwoFactorConfig {
  isEnabled: boolean;
  secret?: string;
  enrolledAt?: string;
  backupCodes: string[];
  usedBackupCodes: string[];
}

export interface AuthUser {
  id: string;
  googleId?: string;
  email: string;
  name: string;
  role: string;
  appRole?: UserRole;
  status: UserApprovalStatus;
  isAdmin: boolean;
  accessLevel: AccessLevel;
  avatar?: string;
  organization?: string;
  accessReason?: string;
  requestTimestamp?: string;
  password?: string;
  twoFactor?: TwoFactorConfig;
  twoFactorEnabled?: boolean;
  session?: SessionTokenInfo;
  securityRole?: SecurityRole;
  permissions?: OrganizationalPermissions;
}

export interface AdminAuditLog {
  id: string;
  action:
    | 'approved'
    | 'rejected'
    | 'role_changed'
    | 'permission_toggled'
    | 'permission_changed'
    | 'access_level_changed'
    | 'user_deleted'
    | 'joined'
    | 'user_joined'
    | 'access_requested';
  targetUserEmail: string;
  targetUserName: string;
  performedBy: string;
  timestamp: string;
  details: string;
}
