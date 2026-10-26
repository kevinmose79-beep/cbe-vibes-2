import {
  Result,
  Student,
  ClassStream,
  Examination,
  EducationLevel,
  getEducationLevelForGrade,
  getStreamOrderIndex,
} from '../types';
import { getLearnerClassAtExamTime } from './historicalContextResolver';

export type PrimaryCbeGradeCode = 'EE' | 'ME' | 'AE' | 'BE';

export type JuniorCbeGradeCode =
  | 'EE1'
  | 'EE2'
  | 'ME1'
  | 'ME2'
  | 'AE1'
  | 'AE2'
  | 'BE1'
  | 'BE2';

export const PRIMARY_CBE_GRADES: readonly PrimaryCbeGradeCode[] = [
  'EE',
  'ME',
  'AE',
  'BE',
] as const;

export const JUNIOR_CBE_GRADES: readonly JuniorCbeGradeCode[] = [
  'EE1',
  'EE2',
  'ME1',
  'ME2',
  'AE1',
  'AE2',
  'BE1',
  'BE2',
] as const;

export interface PrimaryCbeLevelCountsRow {
  stream: string;
  ee: number;
  me: number;
  ae: number;
  be: number;
  provisional: number;
  pending: number;
  totalLearners: number;
  isGeneralClass?: boolean;
}

export interface JuniorCbeLevelCountsRow {
  stream: string;
  ee1: number;
  ee2: number;
  me1: number;
  me2: number;
  ae1: number;
  ae2: number;
  be1: number;
  be2: number;
  provisional: number;
  pending: number;
  totalLearners: number;
  isGeneralClass?: boolean;
}

export interface CbeLevelCountsOptions {
  includeGeneralClass?: boolean;
  generalClassLabel?: string;
}

export type CbeLevelCountsRow = PrimaryCbeLevelCountsRow | JuniorCbeLevelCountsRow;

/**
 * Aggregates individual stream rows into a single General Class row for Junior School.
 */
export function buildJuniorGeneralClassRow(
  rows: JuniorCbeLevelCountsRow[],
  label: string = 'General Class'
): JuniorCbeLevelCountsRow {
  const streamRows = rows.filter((r) => !r.isGeneralClass);
  return {
    stream: label,
    ee1: streamRows.reduce((sum, r) => sum + r.ee1, 0),
    ee2: streamRows.reduce((sum, r) => sum + r.ee2, 0),
    me1: streamRows.reduce((sum, r) => sum + r.me1, 0),
    me2: streamRows.reduce((sum, r) => sum + r.me2, 0),
    ae1: streamRows.reduce((sum, r) => sum + r.ae1, 0),
    ae2: streamRows.reduce((sum, r) => sum + r.ae2, 0),
    be1: streamRows.reduce((sum, r) => sum + r.be1, 0),
    be2: streamRows.reduce((sum, r) => sum + r.be2, 0),
    provisional: streamRows.reduce((sum, r) => sum + r.provisional, 0),
    pending: streamRows.reduce((sum, r) => sum + r.pending, 0),
    totalLearners: streamRows.reduce((sum, r) => sum + r.totalLearners, 0),
    isGeneralClass: true,
  };
}

/**
 * Aggregates individual stream rows into a single General Class row for Primary School.
 */
export function buildPrimaryGeneralClassRow(
  rows: PrimaryCbeLevelCountsRow[],
  label: string = 'General Class'
): PrimaryCbeLevelCountsRow {
  const streamRows = rows.filter((r) => !r.isGeneralClass);
  return {
    stream: label,
    ee: streamRows.reduce((sum, r) => sum + r.ee, 0),
    me: streamRows.reduce((sum, r) => sum + r.me, 0),
    ae: streamRows.reduce((sum, r) => sum + r.ae, 0),
    be: streamRows.reduce((sum, r) => sum + r.be, 0),
    provisional: streamRows.reduce((sum, r) => sum + r.provisional, 0),
    pending: streamRows.reduce((sum, r) => sum + r.pending, 0),
    totalLearners: streamRows.reduce((sum, r) => sum + r.totalLearners, 0),
    isGeneralClass: true,
  };
}

/**
 * Normalises an education level string or grade to either 'Primary' or 'Junior'.
 * Pre-Primary, Lower Primary, and Upper Primary use the 4-level Primary scale.
 * Junior School / Junior Secondary use the 8-sublevel Junior scale.
 */
export function resolveEducationTier(
  eduLevelOrGrade: EducationLevel | string
): 'Primary' | 'Junior' {
  const str = String(eduLevelOrGrade || '').trim();
  if (
    str === 'Junior School' ||
    str === 'Junior Secondary' ||
    str === 'junior_school' ||
    str === 'junior_secondary'
  ) {
    return 'Junior';
  }
  if (
    str === 'Pre-Primary' ||
    str === 'Lower Primary' ||
    str === 'Upper Primary' ||
    str === 'pre_primary' ||
    str === 'lower_primary' ||
    str === 'upper_primary'
  ) {
    return 'Primary';
  }

  // Attempt resolving from grade name (e.g. 'Grade 7', 'PP1', 'Grade 4')
  const resolved = getEducationLevelForGrade(str);
  if (resolved === 'Junior School') {
    return 'Junior';
  }
  return 'Primary';
}

/**
 * Resolves the stream display name for a learner at exam time.
 * Uses historical promotion context when an examination is provided.
 *
 * Rules:
 * - Uses getLearnerClassAtExamTime when the exam is supplied.
 * - Resolves the class using the historical class ID when historical context provides one.
 * - Never substitutes a learner's current live stream when historical context exists but is unresolved.
 * - An unresolved historical stream produces '-', matching the existing standard exporter.
 * - A missing class record does not automatically crash the export; follows the existing exporter’s stream-display behaviour.
 * - A learner with no stream assignment is represented consistently with the exporter ('-').
 * - A current stream is used only when there is no historical context to apply.
 */
export function resolveLearnerStreamName(
  student: Student,
  classes: ClassStream[],
  exam?: Examination | null
): string {
  if (!student) {
    throw new Error('Cannot resolve stream for null or undefined student record.');
  }

  const histCtx = exam ? getLearnerClassAtExamTime(student, exam, classes) : null;
  const cls = classes.find((c) => c.id === (histCtx?.class_id || student.class_id));

  if (histCtx) {
    return histCtx.historical_context_resolved
      ? (histCtx.stream_name || cls?.stream || '-')
      : '-';
  }

  return cls?.stream && cls.stream.trim() ? cls.stream.trim() : '-';
}

/**
 * Calculates authoritative CBE Level Counts for Primary School classes
 * (Pre-Primary, Lower Primary, and Upper Primary).
 *
 * CONTRACT:
 * - "results" must be the exact cohort supplied by the corresponding exporter
 *   (e.g., pre-filtered for a single stream when a stream filter is active,
 *   or containing the full class cohort when "All Streams" is active).
 * - The helper counts and reconciles each represented stream in the given results.
 *
 * Columns: STREAM | EE | ME | AE | BE | PROVISIONAL | PENDING | TOTAL LEARNERS
 */
export function calculatePrimaryCbeLevelCounts(
  results: Result[],
  students: Student[],
  classes: ClassStream[],
  exam?: Examination | null,
  options?: CbeLevelCountsOptions
): PrimaryCbeLevelCountsRow[] {
  if (!results || results.length === 0) {
    return [];
  }

  const seenStudentIds = new Set<string>();
  const streamGroups = new Map<string, PrimaryCbeLevelCountsRow>();

  for (const r of results) {
    if (!r) continue;

    // Detect duplicate learner results in the cohort
    if (seenStudentIds.has(r.student_id)) {
      throw new Error(
        `Duplicate result found for student ID "${r.student_id}" in results cohort.`
      );
    }
    seenStudentIds.add(r.student_id);

    const std = students.find((s) => s.id === r.student_id);
    if (!std) {
      throw new Error(
        `Unable to resolve student for result ID "${r.id}" (student ID: "${r.student_id}").`
      );
    }

    const streamName = resolveLearnerStreamName(std, classes, exam);

    if (!streamGroups.has(streamName)) {
      streamGroups.set(streamName, {
        stream: streamName,
        ee: 0,
        me: 0,
        ae: 0,
        be: 0,
        provisional: 0,
        pending: 0,
        totalLearners: 0,
      });
    }

    const row = streamGroups.get(streamName)!;
    const isComplete = r.is_complete === true;
    const assessedCount = r.subject_count ?? 0;

    // Consistency check: complete learner must have assessed subjects
    if (isComplete && assessedCount === 0) {
      throw new Error(
        `Inconsistent status fields for learner "${std.full_name}" (${r.student_id}): marked is_complete=true but subject_count is 0.`
      );
    }

    // Consistency check: is_complete=false but status='Complete'
    if (!isComplete && r.status === 'Complete') {
      throw new Error(
        `Inconsistent status fields for learner "${std.full_name}" (${r.student_id}): is_complete is false but status='Complete'.`
      );
    }

    if (isComplete) {
      const code = String(r.grade_code || r.grade || r.performance_level || '').trim().toUpperCase();
      if (!PRIMARY_CBE_GRADES.includes(code as PrimaryCbeGradeCode)) {
        throw new Error(
          `Unsupported grade code "${r.grade_code}" for complete result in Primary School (learner "${std.full_name}", ID "${r.student_id}"). Expected EE, ME, AE, or BE.`
        );
      }

      switch (code as PrimaryCbeGradeCode) {
        case 'EE':
          row.ee += 1;
          break;
        case 'ME':
          row.me += 1;
          break;
        case 'AE':
          row.ae += 1;
          break;
        case 'BE':
          row.be += 1;
          break;
      }
    } else {
      // Incomplete learner: partial subjects -> PROVISIONAL, no assessed subjects -> PENDING
      if (assessedCount > 0) {
        row.provisional += 1;
      } else {
        row.pending += 1;
      }
    }

    row.totalLearners += 1;
  }

  // Validate each stream and calculate totals
  let totalLearnersSum = 0;
  const rows = Array.from(streamGroups.values());

  for (const row of rows) {
    const sumCategories =
      row.ee + row.me + row.ae + row.be + row.provisional + row.pending;
    if (sumCategories !== row.totalLearners) {
      throw new Error(
        `Category counts reconciliation failed for stream "${row.stream}": sum of categories (${sumCategories}) !== totalLearners (${row.totalLearners}).`
      );
    }
    totalLearnersSum += row.totalLearners;
  }

  if (totalLearnersSum !== results.length) {
    throw new Error(
      `Total learners reconciliation failed: sum of stream totals (${totalLearnersSum}) !== results.length (${results.length}).`
    );
  }

  // Sort rows according to established stream order
  rows.sort((a, b) => {
    const idxA = getStreamOrderIndex(a.stream);
    const idxB = getStreamOrderIndex(b.stream);
    if (idxA !== idxB) return idxA - idxB;
    return a.stream.localeCompare(b.stream);
  });

  // When multiple streams are present in All Streams report, append General Class aggregate row
  if (options?.includeGeneralClass && rows.length > 1) {
    const generalClassRow = buildPrimaryGeneralClassRow(rows, options.generalClassLabel);
    rows.push(generalClassRow);
  }

  return rows;
}

/**
 * Calculates authoritative CBE Level Counts for Junior School classes (Grades 7–9).
 *
 * CONTRACT:
 * - "results" must be the exact cohort supplied by the corresponding exporter
 *   (e.g., pre-filtered for a single stream when a stream filter is active,
 *   or containing the full class cohort when "All Streams" is active).
 * - The helper counts and reconciles each represented stream in the given results.
 *
 * Columns: STREAM | EE1 | EE2 | ME1 | ME2 | AE1 | AE2 | BE1 | BE2 | PROVISIONAL | PENDING | TOTAL LEARNERS
 */
export function calculateJuniorCbeLevelCounts(
  results: Result[],
  students: Student[],
  classes: ClassStream[],
  exam?: Examination | null,
  options?: CbeLevelCountsOptions
): JuniorCbeLevelCountsRow[] {
  if (!results || results.length === 0) {
    return [];
  }

  const seenStudentIds = new Set<string>();
  const streamGroups = new Map<string, JuniorCbeLevelCountsRow>();

  for (const r of results) {
    if (!r) continue;

    // Detect duplicate learner results in the cohort
    if (seenStudentIds.has(r.student_id)) {
      throw new Error(
        `Duplicate result found for student ID "${r.student_id}" in results cohort.`
      );
    }
    seenStudentIds.add(r.student_id);

    const std = students.find((s) => s.id === r.student_id);
    if (!std) {
      throw new Error(
        `Unable to resolve student for result ID "${r.id}" (student ID: "${r.student_id}").`
      );
    }

    const streamName = resolveLearnerStreamName(std, classes, exam);

    if (!streamGroups.has(streamName)) {
      streamGroups.set(streamName, {
        stream: streamName,
        ee1: 0,
        ee2: 0,
        me1: 0,
        me2: 0,
        ae1: 0,
        ae2: 0,
        be1: 0,
        be2: 0,
        provisional: 0,
        pending: 0,
        totalLearners: 0,
      });
    }

    const row = streamGroups.get(streamName)!;
    const isComplete = r.is_complete === true;
    const assessedCount = r.subject_count ?? 0;

    // Consistency check: complete learner must have assessed subjects
    if (isComplete && assessedCount === 0) {
      throw new Error(
        `Inconsistent status fields for learner "${std.full_name}" (${r.student_id}): marked is_complete=true but subject_count is 0.`
      );
    }

    // Consistency check: is_complete=false but status='Complete'
    if (!isComplete && r.status === 'Complete') {
      throw new Error(
        `Inconsistent status fields for learner "${std.full_name}" (${r.student_id}): is_complete is false but status='Complete'.`
      );
    }

    if (isComplete) {
      const code = String(r.grade_code || r.grade || r.performance_level || '').trim().toUpperCase();
      if (!JUNIOR_CBE_GRADES.includes(code as JuniorCbeGradeCode)) {
        throw new Error(
          `Unsupported grade code "${r.grade_code}" for complete result in Junior School (learner "${std.full_name}", ID "${r.student_id}"). Expected EE1, EE2, ME1, ME2, AE1, AE2, BE1, or BE2.`
        );
      }

      switch (code as JuniorCbeGradeCode) {
        case 'EE1':
          row.ee1 += 1;
          break;
        case 'EE2':
          row.ee2 += 1;
          break;
        case 'ME1':
          row.me1 += 1;
          break;
        case 'ME2':
          row.me2 += 1;
          break;
        case 'AE1':
          row.ae1 += 1;
          break;
        case 'AE2':
          row.ae2 += 1;
          break;
        case 'BE1':
          row.be1 += 1;
          break;
        case 'BE2':
          row.be2 += 1;
          break;
      }
    } else {
      // Incomplete learner: partial subjects -> PROVISIONAL, no assessed subjects -> PENDING
      if (assessedCount > 0) {
        row.provisional += 1;
      } else {
        row.pending += 1;
      }
    }

    row.totalLearners += 1;
  }

  // Validate each stream and calculate totals
  let totalLearnersSum = 0;
  const rows = Array.from(streamGroups.values());

  for (const row of rows) {
    const sumCategories =
      row.ee1 +
      row.ee2 +
      row.me1 +
      row.me2 +
      row.ae1 +
      row.ae2 +
      row.be1 +
      row.be2 +
      row.provisional +
      row.pending;
    if (sumCategories !== row.totalLearners) {
      throw new Error(
        `Category counts reconciliation failed for stream "${row.stream}": sum of categories (${sumCategories}) !== totalLearners (${row.totalLearners}).`
      );
    }
    totalLearnersSum += row.totalLearners;
  }

  if (totalLearnersSum !== results.length) {
    throw new Error(
      `Total learners reconciliation failed: sum of stream totals (${totalLearnersSum}) !== results.length (${results.length}).`
    );
  }

  // Sort rows according to established stream order
  rows.sort((a, b) => {
    const idxA = getStreamOrderIndex(a.stream);
    const idxB = getStreamOrderIndex(b.stream);
    if (idxA !== idxB) return idxA - idxB;
    return a.stream.localeCompare(b.stream);
  });

  // When multiple streams are present in All Streams report, append General Class aggregate row
  if (options?.includeGeneralClass && rows.length > 1) {
    const generalClassRow = buildJuniorGeneralClassRow(rows, options.generalClassLabel);
    rows.push(generalClassRow);
  }

  return rows;
}

/**
 * Universal CBE Level Counts entry point.
 * Dispatches to Primary or Junior calculation based on eduLevel or target grade.
 *
 * CONTRACT:
 * - "results" must be the exact cohort supplied by the corresponding exporter.
 */
export function calculateCbeLevelCounts(
  results: Result[],
  students: Student[],
  classes: ClassStream[],
  eduLevel: EducationLevel | string,
  exam?: Examination | null,
  options?: CbeLevelCountsOptions
): PrimaryCbeLevelCountsRow[] | JuniorCbeLevelCountsRow[] {
  const tier = resolveEducationTier(eduLevel);
  if (tier === 'Junior') {
    return calculateJuniorCbeLevelCounts(results, students, classes, exam, options);
  }
  return calculatePrimaryCbeLevelCounts(results, students, classes, exam, options);
}
