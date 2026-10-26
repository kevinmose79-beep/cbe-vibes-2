/**
 * KJSEA (Kenya Junior School Education Assessment) Domain Types
 * Grade 9 National Assessment Module
 * 
 * Contract Invariants:
 * 1. Examination-year statuses: strictly lowercase 'open' and 'closed'.
 * 2. Learning-area entry statuses: 'Normal', 'Absent', 'Irregularity', 'Pending', 'Not Released'.
 * 3. Achievement levels: 'EE1' (8), 'EE2' (7), 'ME1' (6), 'ME2' (5), 'AE1' (4), 'AE2' (3), 'BE1' (2), 'BE2' (1).
 * 4. Non-Normal statuses ('Absent', 'Irregularity', 'Pending', 'Not Released') must have null level and null points.
 * 5. Database calculates and validates points authoritatively. Frontend points are for advisory UI display only.
 * 6. The status_recorded column is a non-nullable boolean (default: false).
 */

// ==============================================================================
// 1. Core Enumerations and Constants
// ==============================================================================

export type KJSEAExamYearStatus = 'open' | 'closed';

export const KJSEA_EXAM_YEAR_STATUSES: readonly KJSEAExamYearStatus[] = ['open', 'closed'] as const;

export type KJSEASubjectCode =
  | 'ENG'
  | 'KIS'
  | 'MATH'
  | 'INT SCI'
  | 'CAS'
  | 'SST'
  | 'CRE'
  | 'AGN'
  | 'PRE-TECH';

export const KJSEA_SUBJECT_CODES: readonly KJSEASubjectCode[] = [
  'ENG',
  'KIS',
  'MATH',
  'INT SCI',
  'CAS',
  'SST',
  'CRE',
  'AGN',
  'PRE-TECH',
] as const;

export interface KJSEALearningAreaMeta {
  code: KJSEASubjectCode;
  name: string;
  displayOrder: number;
}

export const KJSEA_LEARNING_AREAS_META: readonly KJSEALearningAreaMeta[] = [
  { code: 'ENG', name: 'English', displayOrder: 1 },
  { code: 'KIS', name: 'Kiswahili', displayOrder: 2 },
  { code: 'MATH', name: 'Mathematics', displayOrder: 3 },
  { code: 'INT SCI', name: 'Integrated Science', displayOrder: 4 },
  { code: 'CAS', name: 'Creative Arts and Sports', displayOrder: 5 },
  { code: 'SST', name: 'Social Studies', displayOrder: 6 },
  { code: 'CRE', name: 'Christian Religious Education', displayOrder: 7 },
  { code: 'AGN', name: 'Agriculture and Nutrition', displayOrder: 8 },
  { code: 'PRE-TECH', name: 'Pre-Technical Studies', displayOrder: 9 },
] as const;

export type KJSEAAchievementLevel =
  | 'EE1'
  | 'EE2'
  | 'ME1'
  | 'ME2'
  | 'AE1'
  | 'AE2'
  | 'BE1'
  | 'BE2';

export const KJSEA_ACHIEVEMENT_LEVELS: readonly KJSEAAchievementLevel[] = [
  'EE1',
  'EE2',
  'ME1',
  'ME2',
  'AE1',
  'AE2',
  'BE1',
  'BE2',
] as const;

export const KJSEA_LEVEL_POINTS_MAP: Record<KJSEAAchievementLevel, number> = {
  EE1: 8,
  EE2: 7,
  ME1: 6,
  ME2: 5,
  AE1: 4,
  AE2: 3,
  BE1: 2,
  BE2: 1,
} as const;

export type KJSEAEntryStatus =
  | 'Normal'
  | 'Absent'
  | 'Irregularity'
  | 'Pending'
  | 'Not Released';

export const KJSEA_ENTRY_STATUSES: readonly KJSEAEntryStatus[] = [
  'Normal',
  'Absent',
  'Irregularity',
  'Pending',
  'Not Released',
] as const;

// ==============================================================================
// 2. Database Entities (Matching Live Supabase Schema)
// ==============================================================================

/**
 * Corresponds to public.kjsea_exam_years
 */
export interface KJSEAExamYear {
  id: string; // UUID
  exam_year: number; // e.g. 2026
  status: KJSEAExamYearStatus; // 'open' | 'closed'
  created_at: string;
  updated_at: string;
}

/**
 * Corresponds to public.kjsea_learning_areas
 */
export interface KJSEALearningArea {
  subject_code: KJSEASubjectCode | string;
  subject_name: string;
  display_order: number;
  active: boolean;
}

/**
 * Corresponds to public.kjsea_student_results (Parent Record)
 */
export interface KJSEAStudentResult {
  id: string; // UUID
  exam_year_id: string; // UUID references kjsea_exam_years(id)
  student_id: string; // UUID references students(id)
  created_at: string;
  updated_at: string;
  created_by?: string | null; // UUID references auth.users(id)
  finalised_at?: string | null;
  finalised_by?: string | null; // UUID
}

/**
 * Corresponds to public.kjsea_level_entries (Child Record)
 */
export interface KJSEALevelEntry {
  id: string; // UUID
  student_result_id: string; // UUID references kjsea_student_results(id)
  subject_code: KJSEASubjectCode | string;
  achievement_level: KJSEAAchievementLevel | null;
  points: number | null;
  status: KJSEAEntryStatus;
  status_recorded: boolean; // Non-nullable boolean, default false
  created_at: string;
  updated_at: string;
}

/**
 * Corresponds to public.kjsea_audit_logs
 */
export interface KJSEAAuditLog {
  id: string; // UUID
  action_type: string;
  entity_id: string;
  details?: Record<string, unknown> | null;
  created_at: string;
}

// ==============================================================================
// 3. Composite and Analytical Types
// ==============================================================================

/**
 * Hydrated Student Result with Level Entries and Learner details
 */
export interface KJSEAStudentResultWithEntries extends KJSEAStudentResult {
  entries: KJSEALevelEntry[];
  student?: {
    id: string;
    admission_number: string;
    full_name: string;
    gender: 'M' | 'F';
    stream_id?: string;
    stream_name?: string;
    class_id?: string;
  };
}

/**
 * Stream & Cohort Merit List Row
 */
export interface KJSEAMeritRow {
  student_id: string;
  admission_number: string;
  full_name: string;
  gender: 'M' | 'F';
  stream_id: string;
  stream_name: string;
  is_finalised: boolean;
  entries: Record<string, KJSEALevelEntry | undefined>;
  total_points: number | null; // null if incomplete, absent, or irregularity
  mean_points: number | null;
  qualifies_for_ranking: boolean; // Must have valid 'Normal' status across all 9 learning areas
  stream_rank?: number | null; // Shared rank for ties (standard competition: 1, 2, 2, 4)
  overall_rank?: number | null;
  remarks?: string;
}

// ==============================================================================
// 4. RPC Contract Payloads
// ==============================================================================

/**
 * Item payload expected by kjsea_save_draft RPC
 * Invariant: Do NOT send points! Database calculates & validates points.
 */
export interface KJSEADraftEntryPayload {
  subject_code: KJSEASubjectCode | string;
  status: KJSEAEntryStatus;
  achievement_level: KJSEAAchievementLevel | null;
}

export interface KJSEAServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: string;
  };
}

// ==============================================================================
// 5. Validation Helpers
// ==============================================================================

export function isValidKJSEASubjectCode(code: unknown): code is KJSEASubjectCode {
  if (typeof code !== 'string') return false;
  return KJSEA_SUBJECT_CODES.includes(code as KJSEASubjectCode);
}

export function isValidKJSEAAchievementLevel(level: unknown): level is KJSEAAchievementLevel {
  if (typeof level !== 'string') return false;
  return KJSEA_ACHIEVEMENT_LEVELS.includes(level as KJSEAAchievementLevel);
}

export function isValidKJSEAEntryStatus(status: unknown): status is KJSEAEntryStatus {
  if (typeof status !== 'string') return false;
  return KJSEA_ENTRY_STATUSES.includes(status as KJSEAEntryStatus);
}

/**
 * Advisory client-side points lookup.
 * The database remains the authoritative calculation engine.
 */
export function getKJSEAPointsAdvisory(
  level: KJSEAAchievementLevel | string | null | undefined,
  status: KJSEAEntryStatus = 'Normal'
): number | null {
  if (status !== 'Normal' || !level) {
    return null;
  }
  if (isValidKJSEAAchievementLevel(level)) {
    return KJSEA_LEVEL_POINTS_MAP[level];
  }
  return null;
}

/**
 * Validates draft entries payload before calling kjsea_save_draft
 */
export function validateKJSEADraftEntries(
  entries: unknown
): { isValid: boolean; error?: string } {
  if (!Array.isArray(entries)) {
    return { isValid: false, error: 'Draft entries must be an array.' };
  }

  if (entries.length === 0) {
    return { isValid: false, error: 'At least one learning area entry is required.' };
  }

  const seenCodes = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as KJSEADraftEntryPayload;
    if (!entry || typeof entry !== 'object') {
      return { isValid: false, error: `Invalid entry object at index ${i}.` };
    }

    if (!isValidKJSEASubjectCode(entry.subject_code)) {
      return {
        isValid: false,
        error: `Invalid subject code "${entry.subject_code}" at index ${i}. Must be one of the 9 approved CBE learning areas.`,
      };
    }

    if (seenCodes.has(entry.subject_code)) {
      return {
        isValid: false,
        error: `Duplicate subject code "${entry.subject_code}" detected in draft entries.`,
      };
    }
    seenCodes.add(entry.subject_code);

    if (!isValidKJSEAEntryStatus(entry.status)) {
      return {
        isValid: false,
        error: `Invalid entry status "${entry.status}" for subject "${entry.subject_code}".`,
      };
    }

    if (entry.status === 'Normal') {
      if (!entry.achievement_level || !isValidKJSEAAchievementLevel(entry.achievement_level)) {
        return {
          isValid: false,
          error: `Normal status for "${entry.subject_code}" requires a valid achievement level (EE1–BE2).`,
        };
      }
    } else {
      if (entry.achievement_level !== null && entry.achievement_level !== undefined) {
        return {
          isValid: false,
          error: `Non-Normal status "${entry.status}" for "${entry.subject_code}" must not have an achievement level.`,
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Validates mandatory reason for reopening a finalised result or discarded draft
 */
export function validateMandatoryReason(
  reason: string | null | undefined,
  actionLabel = 'This action'
): { isValid: boolean; error?: string } {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return {
      isValid: false,
      error: `${actionLabel} requires a mandatory, non-empty audit reason.`,
    };
  }

  if (reason.trim().length < 5) {
    return {
      isValid: false,
      error: `${actionLabel} reason must be at least 5 characters long.`,
    };
  }

  return { isValid: true };
}
