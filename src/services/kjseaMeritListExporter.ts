import rawJsPDF from 'jspdf';
import type { jsPDF as JsPDFDocument } from 'jspdf';
const jsPDF = (rawJsPDF as any).jsPDF || rawJsPDF;
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { savePdf, saveFile } from '../utils/fileDownloader';
import {
  School,
  Examination,
  ClassStream,
  Student,
} from '../types';
import {
  KJSEA_LEARNING_AREAS_META,
  KJSEASubjectCode,
  KJSEA_LEVEL_POINTS_MAP,
  KJSEAStudentResultWithEntries,
  KJSEALevelEntry,
} from '../types/kjsea';
import { getLearnerClassAtExamTime } from './historicalContextResolver';
import { kjseaService } from './kjseaService';
import { api, getSupabaseClient, sanitizeClass } from '../lib/storage';

// ==============================================================================
// 1. Constants & Types
// ==============================================================================

export const KJSEA_MERIT_HEADERS = [
  'S.NO',
  'ADMISSION NO',
  'LEARNER NAME',
  'STREAM',
  'STR POS',
  'OVR POS',
  'ENG',
  'KIS',
  'MATH',
  'INT SCI',
  'CAS',
  'SST',
  'CRE',
  'AGN',
  'PRE-TECH',
  'SUB ENTRY',
  'TOTAL POINTS',
  'AVG POINTS',
] as const;

export const ROTATED_HEADER_INDICES = [4, 5, 15, 16, 17] as const; // STR POS, OVR POS, SUB ENTRY, TOTAL POINTS, AVG POINTS
export const ROTATED_HEADER_NAMES = ['STR POS', 'OVR POS', 'SUB ENTRY', 'TOTAL POINTS', 'AVG POINTS'] as const;

export const KJSEA_SUBJECT_STATS_HEADERS = [
  'Learning Area',
  'EE1',
  'EE2',
  'ME1',
  'ME2',
  'AE1',
  'AE2',
  'BE1',
  'BE2',
  'X',
  'Y',
  'NR',
  '-',
  'Entries',
  'Average Points',
] as const;

/**
 * Display formatting helper for KJSEA Merit List PDF.
 * Replaces every user-visible underscore ("_") with a hyphen ("-").
 */
export function formatPdfDisplayText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/_/g, '-');
}

export interface KJSEASubjectStatsRow {
  learningArea: string;
  subjectCode: string;
  ee1: number;
  ee2: number;
  me1: number;
  me2: number;
  ae1: number;
  ae2: number;
  be1: number;
  be2: number;
  x: number;
  y: number;
  nr: number;
  pending: number;
  entries: number;
  averagePoints: string;
}

export interface KJSEAMeritCandidate {
  sNo: number;
  studentId: string;
  admissionNumber: string;
  learnerName: string;
  streamName: string;
  streamId?: string;
  isStreamResolved: boolean;
  strPos: string;
  ovrPos: string;
  subjects: Record<string, string>; // subject_code -> display string ('EE1', 'X', 'Y', '—', 'NR')
  subEntry: number;
  totalPoints: number;
  averagePoints: string;
  qualifiesForRanking: boolean;
}

export interface KJSEAMeritExportData {
  examYear: number;
  examYearId: string;
  isAllStreams: boolean;
  selectedStreamId?: string;
  selectedStreamName?: string;
  school: Partial<School>;
  base64Logo?: { dataUrl: string; width: number; height: number } | null;
  candidates: KJSEAMeritCandidate[];
  totalCandidates: number;
  rankedCount: number;
  generatedBy?: string;
  generatedAt: string;
}

export interface KJSEAMeritExportOptions {
  examYearId: string;
  examYear: number;
  selectedStreamId?: string;
  selectedStreamName?: string;
  generatedBy?: string;
}

// ==============================================================================
// 2. Candidate Evaluation & Ranking Engine
// ==============================================================================

/**
 * Standard Competition Ranking (1, 2, 2, 4)
 */
function assignStandardCompetitionRanks(
  candidates: Array<{ id: string; totalPoints: number }>
): Map<string, number> {
  const rankMap = new Map<string, number>();
  for (let i = 0; i < candidates.length; i++) {
    if (i > 0 && candidates[i].totalPoints === candidates[i - 1].totalPoints) {
      rankMap.set(candidates[i].id, rankMap.get(candidates[i - 1].id)!);
    } else {
      rankMap.set(candidates[i].id, i + 1);
    }
  }
  return rankMap;
}

/**
 * Formats a single subject cell according to the approved status conventions:
 * - Normal with achievement level -> level only (e.g. "EE1")
 * - Absent -> "X"
 * - Irregularity -> "Y"
 * - Not Released -> "NR"
 * - Pending or untouched -> "—"
 */
export function formatSubjectCell(entry: KJSEALevelEntry | undefined): {
  displayText: string;
  isEntered: boolean;
  points: number;
  isNormalWithLevel: boolean;
} {
  if (!entry) {
    return { displayText: '—', isEntered: false, points: 0, isNormalWithLevel: false };
  }

  const status = entry.status;
  if (status === 'Normal') {
    if (entry.achievement_level && KJSEA_LEVEL_POINTS_MAP[entry.achievement_level] !== undefined) {
      return {
        displayText: entry.achievement_level,
        isEntered: true,
        points: KJSEA_LEVEL_POINTS_MAP[entry.achievement_level],
        isNormalWithLevel: true,
      };
    }
    return { displayText: '—', isEntered: false, points: 0, isNormalWithLevel: false };
  }

  if (status === 'Absent') {
    return { displayText: 'X', isEntered: true, points: 0, isNormalWithLevel: false };
  }

  if (status === 'Irregularity') {
    return { displayText: 'Y', isEntered: true, points: 0, isNormalWithLevel: false };
  }

  if (status === 'Not Released') {
    return { displayText: 'NR', isEntered: true, points: 0, isNormalWithLevel: false };
  }

  // 'Pending' or any other unrecognised status
  return { displayText: '—', isEntered: false, points: 0, isNormalWithLevel: false };
}

/**
 * Calculates Class Average Points using ranking-eligible candidates only.
 * Each eligible candidate has a total points score out of 72.
 */
export function computeKJSEAClassAveragePoints(candidates: KJSEAMeritCandidate[]): {
  classAverageStr: string;
  eligibleCount: number;
  sumPoints: number;
  bannerText: string;
} {
  const eligible = (candidates || []).filter((c) => c.qualifiesForRanking === true);
  if (eligible.length === 0) {
    return {
      classAverageStr: '—',
      eligibleCount: 0,
      sumPoints: 0,
      bannerText: 'CLASS AVERAGE POINTS: — (OUT OF 72)',
    };
  }

  const sumPoints = eligible.reduce((acc, c) => acc + (c.totalPoints || 0), 0);
  const avg = Math.round((sumPoints / eligible.length + Number.EPSILON) * 100) / 100;
  const classAverageStr = avg.toFixed(2);
  return {
    classAverageStr,
    eligibleCount: eligible.length,
    sumPoints,
    bannerText: `CLASS AVERAGE POINTS: ${classAverageStr} (OUT OF 72)`,
  };
}

/**
 * Computes the 12-category breakdown, valid entries, and average points for each of the
 * 9 approved KJSEA learning areas in strict curriculum sequence.
 */
export function computeKJSEASubjectStats(candidates: KJSEAMeritCandidate[]): KJSEASubjectStatsRow[] {
  const cohort = candidates || [];
  return KJSEA_LEARNING_AREAS_META.map((meta) => {
    let ee1 = 0;
    let ee2 = 0;
    let me1 = 0;
    let me2 = 0;
    let ae1 = 0;
    let ae2 = 0;
    let be1 = 0;
    let be2 = 0;
    let x = 0;
    let y = 0;
    let nr = 0;
    let pending = 0;

    cohort.forEach((c) => {
      const raw = String(c.subjects?.[meta.code] || '—').trim();
      switch (raw) {
        case 'EE1': ee1++; break;
        case 'EE2': ee2++; break;
        case 'ME1': me1++; break;
        case 'ME2': me2++; break;
        case 'AE1': ae1++; break;
        case 'AE2': ae2++; break;
        case 'BE1': be1++; break;
        case 'BE2': be2++; break;
        case 'X': x++; break;
        case 'Y': y++; break;
        case 'NR': nr++; break;
        default:
          pending++; // accounts for '—', '-', empty, null, or malformed entries
          break;
      }
    });

    const entries = ee1 + ee2 + me1 + me2 + ae1 + ae2 + be1 + be2;
    const pointsSum =
      ee1 * 8 +
      ee2 * 7 +
      me1 * 6 +
      me2 * 5 +
      ae1 * 4 +
      ae2 * 3 +
      be1 * 2 +
      be2 * 1;

    const averagePoints = entries > 0
      ? (Math.round((pointsSum / entries + Number.EPSILON) * 100) / 100).toFixed(2)
      : '—';

    return {
      learningArea: meta.name,
      subjectCode: meta.code,
      ee1,
      ee2,
      me1,
      me2,
      ae1,
      ae2,
      be1,
      be2,
      x,
      y,
      nr,
      pending,
      entries,
      averagePoints,
    };
  });
}

/**
 * Transforms raw results, learners, and class definitions into the authoritative
 * candidate cohort with verified historical streams and competition rankings.
 */
export function processKJSEAMeritCandidates(
  results: KJSEAStudentResultWithEntries[],
  students: Student[],
  classes: ClassStream[],
  examYear: number,
  filterStreamId?: string,
  filterStreamName?: string
): {
  allCandidates: KJSEAMeritCandidate[];
  filteredCandidates: KJSEAMeritCandidate[];
} {
  const studentMap = new Map<string, Student>();
  students.forEach((s) => studentMap.set(s.id, s));

  // Mock examination structure to drive historicalContextResolver
  const examMock: Examination = {
    id: `kjsea-exam-${examYear}`,
    exam_name: `KJSEA ${examYear}`,
    year: examYear,
    education_level: 'Junior School',
    class_id: 'all',
    status: 'Published',
  } as Examination;

  // 1. Process basic candidate data and subject metrics
  interface IntermediateCandidate {
    resultId: string;
    studentId: string;
    admissionNumber: string;
    learnerName: string;
    streamName: string;
    streamId?: string;
    isStreamResolved: boolean;
    subjects: Record<string, string>;
    subEntry: number;
    totalPoints: number;
    qualifiesForRanking: boolean;
  }

  const intermediateList: IntermediateCandidate[] = [];

  for (const res of results) {
    const student = studentMap.get(res.student_id);
    const admissionNumber = student?.admission_number || '—';
    const learnerName = student?.full_name || 'Candidate';

    // Historical Stream Resolution
    let streamName = 'Unresolved';
    let streamId: string | undefined = undefined;
    let isStreamResolved = false;

    if (student) {
      const examContext = getLearnerClassAtExamTime(student, examMock, classes);
      if (examContext.historical_context_resolved && examContext.stream_name) {
        streamName = examContext.stream_name;
        streamId = examContext.stream_id || undefined;
        isStreamResolved = true;
      } else if (examContext.stream_name) {
        streamName = examContext.stream_name;
        streamId = examContext.stream_id || undefined;
        isStreamResolved = false;
      }
    }

    // Process all 9 learning areas in exact approved sequence
    let subEntryCount = 0;
    let totalPointsSum = 0;
    let normalWithLevelCount = 0;
    const subjectsRecord: Record<string, string> = {};

    const entriesMap = new Map<string, KJSEALevelEntry>();
    (res.entries || []).forEach((e) => entriesMap.set(e.subject_code, e));

    KJSEA_LEARNING_AREAS_META.forEach((meta) => {
      const entry = entriesMap.get(meta.code);
      const parsed = formatSubjectCell(entry);
      subjectsRecord[meta.code] = parsed.displayText;
      if (parsed.isEntered) {
        subEntryCount += 1;
      }
      if (parsed.isNormalWithLevel) {
        normalWithLevelCount += 1;
        totalPointsSum += parsed.points;
      }
    });

    // Ranking Rule: All 9 subjects must be Normal with valid achievement level
    const qualifiesForRanking = normalWithLevelCount === 9;

    intermediateList.push({
      resultId: res.id,
      studentId: res.student_id,
      admissionNumber,
      learnerName,
      streamName,
      streamId,
      isStreamResolved,
      subjects: subjectsRecord,
      subEntry: subEntryCount,
      totalPoints: totalPointsSum,
      qualifiesForRanking,
    });
  }

  // 2. Compute Overall Ranking across the entire Grade 9 cohort
  const eligibleOverall = intermediateList
    .filter((c) => c.qualifiesForRanking)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const overallRankMap = assignStandardCompetitionRanks(
    eligibleOverall.map((c) => ({ id: c.studentId, totalPoints: c.totalPoints }))
  );

  // 3. Compute Stream Rankings independently per stream for verified stream members
  const streamRankMap = new Map<string, number>(); // studentId -> stream rank

  // Group verified eligible candidates by stream
  const eligibleByStream = new Map<string, typeof intermediateList>();
  intermediateList.forEach((c) => {
    if (c.qualifiesForRanking && c.isStreamResolved && c.streamName !== 'Unresolved') {
      const key = c.streamName.toLowerCase().trim();
      const list = eligibleByStream.get(key) || [];
      list.push(c);
      eligibleByStream.set(key, list);
    }
  });

  eligibleByStream.forEach((streamCandidates) => {
    const sortedStream = [...streamCandidates].sort((a, b) => b.totalPoints - a.totalPoints);
    const streamRanks = assignStandardCompetitionRanks(
      sortedStream.map((c) => ({ id: c.studentId, totalPoints: c.totalPoints }))
    );
    streamRanks.forEach((rank, id) => streamRankMap.set(id, rank));
  });

  // 4. Assemble complete All Candidates list
  const allCandidates: KJSEAMeritCandidate[] = intermediateList.map((c) => {
    const ovrRank = overallRankMap.get(c.studentId);
    const strRank = streamRankMap.get(c.studentId);

    const ovrPos = c.qualifiesForRanking && ovrRank !== undefined ? String(ovrRank) : '—';
    const strPos = c.qualifiesForRanking && strRank !== undefined ? String(strRank) : '—';
    const averagePoints = c.qualifiesForRanking ? (c.totalPoints / 9).toFixed(2) : '—';

    return {
      sNo: 0, // Assigned after sorting
      studentId: c.studentId,
      admissionNumber: c.admissionNumber,
      learnerName: c.learnerName,
      streamName: c.streamName,
      streamId: c.streamId,
      isStreamResolved: c.isStreamResolved,
      strPos,
      ovrPos,
      subjects: c.subjects,
      subEntry: c.subEntry,
      totalPoints: c.totalPoints,
      averagePoints,
      qualifiesForRanking: c.qualifiesForRanking,
    };
  });

  // Sort function: Ranked first by totalPoints DESC, then tie-break by learnerName ASC, then admission ASC.
  // Ineligible candidates sorted by totalPoints DESC, then learnerName ASC.
  const sortCandidates = (list: KJSEAMeritCandidate[]): KJSEAMeritCandidate[] => {
    return [...list].sort((a, b) => {
      // 1. Ranking eligibility first
      if (a.qualifiesForRanking && !b.qualifiesForRanking) return -1;
      if (!a.qualifiesForRanking && b.qualifiesForRanking) return 1;

      // 2. Total points descending
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      // 3. Deterministic tie-break without altering competition rank
      const nameComp = a.learnerName.localeCompare(b.learnerName);
      if (nameComp !== 0) return nameComp;

      return a.admissionNumber.localeCompare(b.admissionNumber);
    });
  };

  const sortedAll = sortCandidates(allCandidates).map((c, idx) => ({
    ...c,
    sNo: idx + 1,
  }));

  // 5. Filter for stream-specific report when requested
  let filteredCandidates: KJSEAMeritCandidate[] = sortedAll;

  if (filterStreamId || filterStreamName) {
    filteredCandidates = sortedAll.filter((c) => {
      // Must be a verified historical member of the stream
      if (!c.isStreamResolved || c.streamName === 'Unresolved') {
        return false;
      }
      if (filterStreamId && c.streamId === filterStreamId) {
        return true;
      }
      if (
        filterStreamName &&
        c.streamName.toLowerCase().trim() === filterStreamName.toLowerCase().trim()
      ) {
        return true;
      }
      return false;
    });

    // Re-index S.NO sequentially for the stream-specific report
    filteredCandidates = sortCandidates(filteredCandidates).map((c, idx) => ({
      ...c,
      sNo: idx + 1,
    }));
  }

  return {
    allCandidates: sortedAll,
    filteredCandidates,
  };
}

// Helper to convert image URL to base64 for jsPDF (max 240px asset optimization)
async function getBase64ImageFromUrl(
  imageUrl?: string | null
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  const trimmed = imageUrl.trim();

  // If running in Node.js / SSR environment without standard DOM Image
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    if (trimmed.startsWith('data:')) {
      return { dataUrl: trimmed, width: 240, height: 240 };
    }
    return null;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (trimmed.startsWith('data:')) {
        resolve({ dataUrl: trimmed, width: 240, height: 240 });
      } else {
        resolve(null);
      }
    }, 4000);

    try {
      const img = new Image();
      const isDataUrl = trimmed.startsWith('data:');

      // Do NOT set crossOrigin on inline data: URIs (avoids security/taint issues in Chromium/WebKit)
      if (!isDataUrl) {
        img.crossOrigin = 'Anonymous';
      }

      img.onload = () => {
        clearTimeout(timer);
        try {
          const MAX_DIM = 240; // 240px maximum embedded dimension provides crisp >350 DPI for 16mm logo while keeping payload < 30KB
          let width = img.naturalWidth || img.width || 240;
          let height = img.naturalHeight || img.height || 240;

          if (typeof document === 'undefined' || !document.createElement) {
            resolve({ dataUrl: trimmed, width, height });
            return;
          }

          let targetW = width;
          let targetH = height;

          if (targetW > MAX_DIM || targetH > MAX_DIM) {
            if (targetW >= targetH) {
              targetH = Math.max(1, Math.round((targetH * MAX_DIM) / targetW));
              targetW = MAX_DIM;
            } else {
              targetW = Math.max(1, Math.round((targetW * MAX_DIM) / targetH));
              targetH = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, width: targetW, height: targetH });
          } else {
            resolve(isDataUrl ? { dataUrl: trimmed, width, height } : null);
          }
        } catch {
          resolve(isDataUrl ? { dataUrl: trimmed, width: img.naturalWidth || 240, height: img.naturalHeight || 240 } : null);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        if (isDataUrl) {
          resolve({ dataUrl: trimmed, width: 240, height: 240 });
        } else {
          resolve(null);
        }
      };

      img.src = trimmed;
    } catch {
      clearTimeout(timer);
      resolve(trimmed.startsWith('data:') ? { dataUrl: trimmed, width: 240, height: 240 } : null);
    }
  });
}

/**
 * Authoritatively retrieves examination cohort data and prepares merit list candidates.
 */
export async function getKJSEAMeritExportData(
  options: KJSEAMeritExportOptions
): Promise<KJSEAMeritExportData> {
  const { examYearId, examYear, selectedStreamId, selectedStreamName, generatedBy } = options;

  // 1. Authoritative results from Supabase via verified KJSEA service
  const resultsRes = await kjseaService.getResultsForExamYear(examYearId);
  if (!resultsRes.success || !resultsRes.data) {
    throw new Error(resultsRes.error?.message || 'Failed to fetch KJSEA results for this examination year.');
  }

  const existingResults = resultsRes.data;
  const isAllStreams = !selectedStreamId;

  // 2. Authoritative Grade 9 enrolled learner cohort via verified KJSEA service
  const cohortRes = await kjseaService.getGrade9Learners();
  if (!cohortRes.success || !cohortRes.data) {
    throw new Error(cohortRes.error?.message || 'Failed to retrieve Grade 9 cohort for merit list.');
  }
  const grade9Cohort = cohortRes.data;

  // Map existing results by student_id
  const resultMap = new Map<string, KJSEAStudentResultWithEntries>();
  existingResults.forEach((r) => {
    if (r.student_id) {
      resultMap.set(r.student_id, r);
    }
  });

  // Build complete results collection: reuse saved result if present, otherwise construct virtual blank result
  const completeResults: KJSEAStudentResultWithEntries[] = grade9Cohort.map((learner) => {
    const existing = resultMap.get(learner.id);
    if (existing) {
      return existing;
    }
    return {
      id: `virtual-${learner.id}`,
      exam_year_id: examYearId,
      student_id: learner.id,
      created_at: '',
      updated_at: '',
      entries: [],
    };
  });

  // Include any existing result whose student_id is outside the live Grade 9 cohort (e.g. historical promoted candidates)
  const cohortStudentIdSet = new Set(grade9Cohort.map((l) => l.id));
  existingResults.forEach((r) => {
    if (r.student_id && !cohortStudentIdSet.has(r.student_id)) {
      completeResults.push(r);
    }
  });

  // 3. Map students array for candidate metadata resolution
  const cachedStudents = api.getAllStudentsForMarks();
  const studentMap = new Map<string, Student>();
  cachedStudents.forEach((s) => studentMap.set(s.id, s));

  // Add all Grade 9 cohort learners into studentMap so every candidate has demographic metadata
  grade9Cohort.forEach((learner) => {
    if (!studentMap.has(learner.id)) {
      studentMap.set(learner.id, {
        id: learner.id,
        admission_number: learner.admission_number || '—',
        full_name: learner.full_name || 'Candidate',
        gender: learner.gender || 'M',
        class_id: learner.class_id || '',
        stream_id: learner.stream_id || undefined,
        active: Boolean(learner.active),
        promotion_history: [],
      } as Student);
    }
  });

  // Fallback for any other student IDs present in completeResults but missing from studentMap
  const allResultStudentIds = completeResults.map((r) => r.student_id).filter(Boolean);
  const missingStudentIds = allResultStudentIds.filter((id) => !studentMap.has(id));
  if (missingStudentIds.length > 0) {
    try {
      const client = getSupabaseClient();
      if (client) {
        const { data: dbStudents } = await client
          .from('students')
          .select('*')
          .in('id', missingStudentIds);
        (dbStudents || []).forEach((row: any) => {
          studentMap.set(row.id, {
            id: row.id,
            admission_number: row.admission_number || '—',
            full_name: row.full_name || 'Candidate',
            gender: row.gender || 'M',
            class_id: row.class_id || '',
            stream_id: row.stream_id || undefined,
            active: Boolean(row.active),
            promotion_history: row.promotion_history || [],
          } as Student);
        });
      }
    } catch {
      // Safe fallback if student lookup error occurs
    }
  }

  const students = Array.from(studentMap.values());

  // 4. Resolve class & stream definitions safely
  let classes = api.getClasses();
  if (!classes || classes.length === 0) {
    const client = getSupabaseClient();
    if (client) {
      const [{ data: dbClasses, error: cErr }, { data: dbStreams, error: sErr }] = await Promise.all([
        client.from('classes').select('*'),
        client.from('streams').select('*'),
      ]);
      if (cErr || sErr) {
        throw new Error(
          `Failed to load authoritative class/stream data: ${cErr?.message || sErr?.message || 'Database query error'}`
        );
      }
      const merged: ClassStream[] = [];
      (dbClasses || []).forEach((c: any) => {
        const cStreams = (dbStreams || []).filter((s: any) => s.class_id === c.id);
        if (cStreams.length > 0) {
          cStreams.forEach((st: any) => {
            merged.push(
              sanitizeClass({
                id: c.id,
                stream_id: st.id,
                class_name: c.class_name,
                stream: st.stream_name || 'A',
                capacity: st.capacity || c.capacity || 40,
                class_teacher_id: st.class_teacher_id || undefined,
                education_level: c.education_level || 'Junior School',
                status: c.status || 'Active',
                allocated_subject_ids: [],
              })
            );
          });
        } else {
          merged.push(sanitizeClass(c));
        }
      });
      classes = merged;
    } else {
      throw new Error('Supabase client unavailable to resolve class and stream data.');
    }
  }

  let school: Partial<School> = {};
  try {
    school = api.getSchool() || {};
  } catch {
    school = { school_name: 'CBE Academy' };
  }

  // 5. Resolve actual stream name if stream ID was provided without stream name
  let resolvedFilterStreamName = selectedStreamName;
  if (selectedStreamId && !resolvedFilterStreamName) {
    const matchedClass = classes.find(
      (c) => c.stream_id === selectedStreamId || c.id === selectedStreamId
    );
    resolvedFilterStreamName = matchedClass?.stream || '';
  }

  // 6. Process candidate rankings
  const { allCandidates, filteredCandidates } = processKJSEAMeritCandidates(
    completeResults,
    students,
    classes,
    examYear,
    selectedStreamId,
    resolvedFilterStreamName
  );

  const candidates = isAllStreams ? allCandidates : filteredCandidates;
  const rankedCount = candidates.filter((c) => c.qualifiesForRanking).length;

  // 7. Resolve school logo if available
  let base64Logo: { dataUrl: string; width: number; height: number } | null = null;
  if (school.logo_url) {
    try {
      base64Logo = await getBase64ImageFromUrl(school.logo_url);
    } catch {
      base64Logo = null;
    }
  }

  return {
    examYear,
    examYearId,
    isAllStreams,
    selectedStreamId,
    selectedStreamName: resolvedFilterStreamName,
    school,
    base64Logo,
    candidates,
    totalCandidates: candidates.length,
    rankedCount,
    generatedBy,
    generatedAt: new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  };
}

// ==============================================================================
// 4. PDF Exporter Implementation
// ==============================================================================

export function generateKJSEAMeritPDFDocument(exportData: KJSEAMeritExportData): JsPDFDocument {
  const { examYear, isAllStreams, selectedStreamName, school, candidates } =
    exportData;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Display integrity: replace every user-visible underscore ("_") with a hyphen ("-")
  const origText = doc.text.bind(doc);
  doc.text = function (text: any, ...args: any[]) {
    const sanitize = (t: any): any => {
      if (typeof t === 'string') return t.replace(/_/g, '-');
      if (Array.isArray(t)) return t.map(sanitize);
      return t;
    };
    return origText(sanitize(text), ...args);
  };

  const pageWidth = doc.internal.pageSize.getWidth(); // ~297mm
  const marginX = 10;

  // Document Header (appears above table on first page only)
  const renderDocumentHeader = () => {
    // 1. Resolve & embed School Logo on both left and right (capped at 18 mm max height/box, preserving aspect ratio)
    let logoDisplayW = 0;
    let logoDisplayH = 0;

    const resolvedLogo = exportData.base64Logo || (
      exportData.school?.logo_url && exportData.school.logo_url.startsWith('data:')
        ? { dataUrl: exportData.school.logo_url, width: 240, height: 240 }
        : null
    );

    const MAX_LOGO_BOX = 18; // 18mm max height bounding box
    const logoAreaTopY = 4.5; // Top Y position for logo bounding area

    if (resolvedLogo && resolvedLogo.dataUrl) {
      const { dataUrl, width, height } = resolvedLogo;
      let w = MAX_LOGO_BOX;
      let h = MAX_LOGO_BOX;
      if (width && height && height > 0) {
        const aspect = width / height;
        if (aspect >= 1) {
          w = MAX_LOGO_BOX;
          h = Math.min(MAX_LOGO_BOX, MAX_LOGO_BOX / aspect);
        } else {
          h = MAX_LOGO_BOX;
          w = Math.min(MAX_LOGO_BOX, MAX_LOGO_BOX * aspect);
        }
      }
      logoDisplayW = w;
      logoDisplayH = h;

      const logoY = logoAreaTopY + (MAX_LOGO_BOX - logoDisplayH) / 2;
      const leftLogoX = marginX; // 10mm
      const rightLogoX = pageWidth - marginX - logoDisplayW; // 297 - 10 - w

      // Left Logo
      try {
        doc.addImage(dataUrl, 'PNG', leftLogoX, logoY, logoDisplayW, logoDisplayH);
      } catch (err) {
        console.warn('Failed to embed left KJSEA merit list logo:', err);
      }

      // Right Logo (symmetrical)
      try {
        doc.addImage(dataUrl, 'PNG', rightLogoX, logoY, logoDisplayW, logoDisplayH);
      } catch (err) {
        console.warn('Failed to embed right KJSEA merit list logo:', err);
      }
    }

    // 2. Mathematically centered text block at actual horizontal midpoint
    const centerX = pageWidth / 2; // 148.5mm for landscape A4

    // Line 1 — School name: emerald green [0, 135, 103], prominent bold font (~14 pt) with width guard
    const rawSchoolName = (school.school_name || 'CBE MANAGEMENT SYSTEM').trim().toUpperCase();
    const schoolNameStr = formatPdfDisplayText(rawSchoolName);
    let schoolFontSize = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(schoolFontSize);
    // Width guard: keep school name comfortably between left and right logo boundaries
    const sideReserved = logoDisplayW > 0 ? marginX + logoDisplayW + 5 : marginX + 10;
    const maxCenterTextWidth = pageWidth - 2 * sideReserved;
    while (doc.getTextWidth(schoolNameStr) > maxCenterTextWidth && schoolFontSize > 9) {
      schoolFontSize -= 0.5;
      doc.setFontSize(schoolFontSize);
    }
    doc.setTextColor(0, 135, 103);
    doc.text(schoolNameStr, centerX, 9.5, { align: 'center' });

    // Line 2 — Report: "Report: KJSEA [YEAR] RESULTS" in pure black [0, 0, 0] bold
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.0);
    doc.setTextColor(0, 0, 0);
    doc.text(formatPdfDisplayText(`Report: KJSEA ${examYear} RESULTS`), centerX, 14.5, { align: 'center' });

    // Line 3 — Consolidated Class & Stream on one line in royal blue [0, 85, 204], no underline
    const streamLabelRaw = isAllStreams
      ? 'ALL STREAMS'
      : (selectedStreamName ? selectedStreamName.trim().toUpperCase() : 'SELECTED STREAM');
    const classStreamStr = formatPdfDisplayText(`CLASS: GRADE 9 | STREAM: ${streamLabelRaw}`);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 85, 204);
    doc.text(classStreamStr, centerX, 19.0, { align: 'center' });

    // Line 4 — Thin horizontal divider rule beneath the header across printable width
    const dividerY = 23.0;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(marginX, dividerY, pageWidth - marginX, dividerY);
  };

  // Convert candidates into rows matching the 18 columns with display formatting
  const tableRows = candidates.map((c) => [
    c.sNo,
    formatPdfDisplayText(c.admissionNumber),
    formatPdfDisplayText(c.learnerName),
    formatPdfDisplayText((c.streamName || '—').toUpperCase()),
    formatPdfDisplayText(c.strPos),
    formatPdfDisplayText(c.ovrPos),
    formatPdfDisplayText(c.subjects['ENG'] || '—'),
    formatPdfDisplayText(c.subjects['KIS'] || '—'),
    formatPdfDisplayText(c.subjects['MATH'] || '—'),
    formatPdfDisplayText(c.subjects['INT SCI'] || '—'),
    formatPdfDisplayText(c.subjects['CAS'] || '—'),
    formatPdfDisplayText(c.subjects['SST'] || '—'),
    formatPdfDisplayText(c.subjects['CRE'] || '—'),
    formatPdfDisplayText(c.subjects['AGN'] || '—'),
    formatPdfDisplayText(c.subjects['PRE-TECH'] || '—'),
    !c.subEntry ? '—' : c.subEntry,
    !c.subEntry ? '—' : c.totalPoints,
    formatPdfDisplayText(c.averagePoints),
  ]);

  // Column Styles distributed across the 277mm printable width (297mm page width - 10mm left margin - 10mm right margin)
  const columnStyles: Record<number, any> = {
    0: { cellWidth: 8, halign: 'center' }, // S.NO
    1: { cellWidth: 18, halign: 'center' }, // ADMISSION NO
    2: { cellWidth: 46, halign: 'left', cellPadding: { top: 0.25, bottom: 0.25, left: 1.2, right: 0.4 } }, // LEARNER NAME
    3: { cellWidth: 16, halign: 'center' }, // STREAM
    4: { cellWidth: 11, halign: 'center' }, // STR POS (rotated)
    5: { cellWidth: 11, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] }, // OVR POS (rotated, bold blue)
    6: { cellWidth: 14, halign: 'center' }, // ENG
    7: { cellWidth: 14, halign: 'center' }, // KIS
    8: { cellWidth: 14, halign: 'center' }, // MATH
    9: { cellWidth: 14, halign: 'center' }, // INT SCI
    10: { cellWidth: 14, halign: 'center' }, // CAS
    11: { cellWidth: 14, halign: 'center' }, // SST
    12: { cellWidth: 14, halign: 'center' }, // CRE
    13: { cellWidth: 14, halign: 'center' }, // AGN
    14: { cellWidth: 14, halign: 'center' }, // PRE-TECH
    15: { cellWidth: 11, halign: 'center' }, // SUB ENTRY (rotated)
    16: { cellWidth: 14, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] }, // TOTAL POINTS (rotated, bold blue)
    17: { cellWidth: 16, halign: 'center' }, // AVG POINTS (rotated, regular dark black)
  };

  // Prepare header titles: pass empty string for rotated columns so autoTable does not
  // measure horizontal text length during column width resolution.
  const displayHeaders = (KJSEA_MERIT_HEADERS as readonly string[]).map((h, idx) =>
    (ROTATED_HEADER_INDICES as readonly number[]).includes(idx) ? '' : formatPdfDisplayText(h)
  );

  autoTable(doc, {
    startY: 26,
    margin: { left: 10, right: 10, top: 12, bottom: 10 },
    tableWidth: 277,
    head: [displayHeaders],
    body: tableRows.length > 0 ? tableRows : [['—', '—', 'No candidates found for this cohort', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—'].map(formatPdfDisplayText)],
    theme: 'grid',
    showHead: 'everyPage', // Repeat table header on subsequent pages
    styles: {
      fontSize: 7.2,
      cellPadding: { top: 0.25, bottom: 0.25, left: 0.4, right: 0.4 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      fillColor: [255, 255, 255],
      valign: 'middle',
      minCellHeight: 3.6,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 6.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 22, // Vertical clearance for 90° rotated titles
    },
    columnStyles,
    didDrawPage: (data) => {
      if (data.pageNumber === 1) {
        renderDocumentHeader();
      }
    },
    willDrawCell: (data) => {
      // Clear default text for the 5 rotated headers so autoTable doesn't draw horizontal text
      if (data.section === 'head' && (ROTATED_HEADER_INDICES as readonly number[]).includes(data.column.index)) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      // Render genuine 90° rotated header text for the 5 specified columns in pure black
      if (data.section === 'head' && (ROTATED_HEADER_INDICES as readonly number[]).includes(data.column.index)) {
        const titleText = formatPdfDisplayText(KJSEA_MERIT_HEADERS[data.column.index]);
        if (titleText) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.0);
          doc.setTextColor(0, 0, 0);
          const titleLen = doc.getTextWidth(titleText);
          const x = data.cell.x + data.cell.width / 2 + 0.75;
          const y = data.cell.y + (data.cell.height + titleLen) / 2;
          doc.text(titleText, x, y, { angle: 90 });
        }
      }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const raw = String(data.cell.raw ?? '').trim();
        // Special statuses: Absent ('X') and Irregularity ('Y') in bold crimson red
        if (raw === 'X' || raw === 'Y') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (raw === '—' || raw === '-') {
          // Missing / pending result dashes in muted medium grey
          data.cell.styles.textColor = [140, 140, 140];
          data.cell.styles.fontStyle = 'normal';
        } else if (data.column.index >= 6 && data.column.index <= 14) {
          // Subject achievement-level codes in regular royal blue
          if (['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'].includes(raw)) {
            data.cell.styles.textColor = [0, 85, 204];
            data.cell.styles.fontStyle = 'normal';
          }
        }
      }
    },
  });

  // --- SUMMARY / STATISTICS SECTION ---
  // @ts-ignore
  const candidateAutoTable = (doc as any).lastAutoTable;
  (doc as any).candidateAutoTable = candidateAutoTable;
  let finalY = candidateAutoTable?.finalY || 26;
  const usableBottom = 198.0; // 202.5mm footer rule - 4.5mm safety clearance
  const totalSummarySpace = 68.0; // Complete space for banner, heading, 15-col table, and notes

  // If the complete statistics section cannot fit in remaining space on current page, move to a fresh page
  if (finalY + totalSummarySpace > usableBottom) {
    doc.addPage();
    finalY = 16.0;
  } else {
    finalY += 4.0;
  }

  let summaryY = finalY;

  // 1. Class Average Points banner
  const classAvgData = computeKJSEAClassAveragePoints(candidates);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  doc.text(classAvgData.bannerText, pageWidth / 2, summaryY, { align: 'center' });

  summaryY += 4.0;

  // 2. Individual Learning Areas Performance Levels Count Heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.setTextColor(0, 0, 0);
  doc.text('INDIVIDUAL LEARNING AREAS PERFORMANCE LEVELS COUNT', marginX, summaryY, { align: 'left' });

  summaryY += 2.5;

  // 3. Subject Statistics Table (15 columns, Option A: exactly 277mm)
  const subjectStats = computeKJSEASubjectStats(candidates);
  const statsRows = subjectStats.map((st) => [
    formatPdfDisplayText(st.learningArea),
    String(st.ee1),
    String(st.ee2),
    String(st.me1),
    String(st.me2),
    String(st.ae1),
    String(st.ae2),
    String(st.be1),
    String(st.be2),
    String(st.x),
    String(st.y),
    String(st.nr),
    String(st.pending),
    String(st.entries),
    formatPdfDisplayText(st.averagePoints),
  ]);

  const statsColumnStyles: Record<number, any> = {
    0: { cellWidth: 53, halign: 'left', fontStyle: 'bold', cellPadding: { top: 0.65, bottom: 0.65, left: 1.5, right: 0.8 } },
    1: { cellWidth: 14, halign: 'center' },
    2: { cellWidth: 14, halign: 'center' },
    3: { cellWidth: 14, halign: 'center' },
    4: { cellWidth: 14, halign: 'center' },
    5: { cellWidth: 14, halign: 'center' },
    6: { cellWidth: 14, halign: 'center' },
    7: { cellWidth: 14, halign: 'center' },
    8: { cellWidth: 14, halign: 'center' },
    9: { cellWidth: 13, halign: 'center' },
    10: { cellWidth: 13, halign: 'center' },
    11: { cellWidth: 13, halign: 'center' },
    12: { cellWidth: 13, halign: 'center' },
    13: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
    14: { cellWidth: 36, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] },
  };

  autoTable(doc, {
    startY: summaryY,
    margin: { left: marginX, right: marginX, top: 12, bottom: 10 },
    tableWidth: 277,
    head: [KJSEA_SUBJECT_STATS_HEADERS.map(formatPdfDisplayText)],
    body: statsRows,
    theme: 'grid',
    showHead: 'everyPage',
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 0.65, bottom: 0.65, left: 0.5, right: 0.5 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      fillColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
      minCellHeight: 3.5,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 6.0,
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 4.6,
    },
    columnStyles: statsColumnStyles,
    didParseCell: (d) => {
      if (d.section === 'body') {
        // Special statuses: X and Y in bold crimson red if non-zero
        if (d.column.index === 9 || d.column.index === 10) {
          if (d.cell.raw !== '0') {
            d.cell.styles.textColor = [220, 38, 38];
            d.cell.styles.fontStyle = 'bold';
          }
        }
        // NR and Pending in muted grey if non-zero
        if (d.column.index === 11 || d.column.index === 12) {
          if (d.cell.raw !== '0') {
            d.cell.styles.textColor = [140, 140, 140];
          }
        }
        // Average Points in bold royal blue
        if (d.column.index === 14) {
          if (d.cell.raw !== '—' && d.cell.raw !== '-') {
            d.cell.styles.textColor = [0, 85, 204];
            d.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  // @ts-ignore
  const summaryAutoTable = (doc as any).lastAutoTable;
  (doc as any).summaryAutoTable = summaryAutoTable;
  // Restore lastAutoTable to point to candidateAutoTable so existing table assertions continue to reference the candidate table
  (doc as any).lastAutoTable = candidateAutoTable;

  summaryY = summaryAutoTable?.finalY ? summaryAutoTable.finalY + 3.5 : summaryY + 40;

  // 4. Brief Calculation Notes
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text('• Learner position is assigned using Total Points across 9 learning areas.', marginX + 4, summaryY);
  summaryY += 3.5;
  doc.text('• Class Average Points includes ranking-eligible candidates only (complete results across all 9 learning areas).', marginX + 4, summaryY);
  summaryY += 3.5;
  doc.text('• Entries represents valid achievement-level entries (EE1-BE2); X, Y, NR, and - are accounted for separately.', marginX + 4, summaryY);

  // Footer: dividing rule, timestamp, and Page X/Y on all pages matching regular CBE
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const contentWidth = 277;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = 210 - 5; // 205mm

    // Thin grey dividing line [180, 180, 180]
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.line(marginX, footerY - 2.5, marginX + contentWidth, footerY - 2.5);

    // Dark grey italic 6.5pt footer text
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(
      formatPdfDisplayText(`Report generated on: ${dateStr} at ${timeStr}  Page ${i}/${totalPages}`),
      marginX + contentWidth,
      footerY,
      { align: 'right' }
    );
  }

  return doc;
}

// ==============================================================================
// 5. Excel Exporter Implementation with OpenXML 90° Header Rotation
// ==============================================================================

/**
 * Injects OpenXML 90° textRotation alignment into an XLSX ZIP archive.
 *
 * Adds an <xf> with textRotation="90" in xl/styles.xml and assigns its style index
 * to cells E, F, P, Q, R on the header row in xl/worksheets/sheet1.xml.
 */
export async function injectExcelHeaderRotation(
  xlsxBytes: Uint8Array | ArrayBuffer,
  headerRowNum = 5
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(xlsxBytes);

  // 1. Process xl/styles.xml
  const stylesFile = zip.file('xl/styles.xml');
  if (!stylesFile) {
    throw new Error('Invalid XLSX package: missing xl/styles.xml');
  }
  let stylesXml = await stylesFile.async('text');

  // Match cellXfs count
  const cellXfsMatch = stylesXml.match(/<cellXfs[^>]*count="(\d+)"[^>]*>/);
  if (!cellXfsMatch) {
    throw new Error('Invalid xl/styles.xml: cellXfs element not found');
  }

  const currentCount = parseInt(cellXfsMatch[1], 10);
  const newStyleIndex = currentCount; // 0-indexed, so new index is currentCount

  // Rotated header style definition (textRotation="90")
  const rotatedXf = `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" textRotation="90" wrapText="1"/></xf>`;

  // Increment count attribute
  stylesXml = stylesXml.replace(
    /(<cellXfs[^>]*count=")(\d+)("[^>]*>)/,
    `$1${currentCount + 1}$3`
  );

  // Insert before closing tag
  stylesXml = stylesXml.replace('</cellXfs>', `${rotatedXf}</cellXfs>`);
  zip.file('xl/styles.xml', stylesXml);

  // 2. Process worksheet (sheet1.xml or matching sheet*.xml)
  const worksheetFiles = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
  const targetSheetFile = worksheetFiles.length > 0 ? worksheetFiles[0] : zip.file('xl/worksheets/sheet1.xml');

  if (!targetSheetFile) {
    throw new Error('Invalid XLSX package: missing worksheet xml');
  }

  let sheetXml = await targetSheetFile.async('text');

  // Exactly these five columns on the header row:
  // Col 5: E ("STR POS")
  // Col 6: F ("OVR POS")
  // Col 16: P ("SUB ENTRY")
  // Col 17: Q ("TOTAL POINTS")
  // Col 18: R ("AVG POINTS")
  const rotatedColLetters = ['E', 'F', 'P', 'Q', 'R'];

  for (const col of rotatedColLetters) {
    const cellRef = `${col}${headerRowNum}`;
    // Match cell opening tag, e.g. <c r="E5" ...> or <c r="E5">
    const cellRegex = new RegExp(`(<c\\b[^>]*\\br="${cellRef}"[^>]*>)`, 'g');
    sheetXml = sheetXml.replace(cellRegex, (match) => {
      if (match.includes('s="')) {
        return match.replace(/s="\d+"/, `s="${newStyleIndex}"`);
      } else {
        return match.replace(`r="${cellRef}"`, `r="${cellRef}" s="${newStyleIndex}"`);
      }
    });
  }

  zip.file(targetSheetFile.name, sheetXml);

  // 3. Re-generate valid ZIP archive
  return await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
}

/**
 * Builds the complete XLSX binary Uint8Array with genuine 90° header rotation.
 */
export async function buildKJSEAMeritExcelBuffer(
  exportData: KJSEAMeritExportData
): Promise<Uint8Array> {
  const { examYear, isAllStreams, selectedStreamName, school, candidates, generatedBy, generatedAt } =
    exportData;

  const schoolName = (school.school_name || 'CBE MANAGEMENT SYSTEM').toUpperCase();
  const reportTitle = `KJSEA ${examYear} RESULTS — ${
    isAllStreams
      ? 'ALL STREAMS MERIT LIST'
      : `STREAM MERIT LIST (${selectedStreamName ? selectedStreamName.toUpperCase() : 'SELECTED STREAM'})`
  }`;

  // Rows layout:
  // Row 1: School Name
  // Row 2: Report Title
  // Row 3: Metadata
  // Row 4: Blank
  // Row 5: Table Headers (18 columns)
  // Row 6+: Data rows
  const metaLine = `Generated on ${generatedAt}  |  Total Candidates: ${candidates.length}  |  Eligible for Ranking: ${exportData.rankedCount}${
    generatedBy ? `  |  Generated by: ${generatedBy}` : ''
  }`;

  const sheetData: (string | number)[][] = [
    [schoolName],
    [reportTitle],
    [metaLine],
    [], // Blank Row 4
    [...KJSEA_MERIT_HEADERS], // Row 5: Exact 18 uppercase headers
  ];

  candidates.forEach((c) => {
    sheetData.push([
      c.sNo,
      c.admissionNumber,
      c.learnerName,
      c.streamName,
      c.strPos,
      c.ovrPos,
      c.subjects['ENG'] || '—',
      c.subjects['KIS'] || '—',
      c.subjects['MATH'] || '—',
      c.subjects['INT SCI'] || '—',
      c.subjects['CAS'] || '—',
      c.subjects['SST'] || '—',
      c.subjects['CRE'] || '—',
      c.subjects['AGN'] || '—',
      c.subjects['PRE-TECH'] || '—',
      !c.subEntry ? '—' : c.subEntry,
      !c.subEntry ? '—' : c.totalPoints,
      c.averagePoints,
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column Widths
  ws['!cols'] = [
    { wch: 7 }, // S.NO
    { wch: 16 }, // ADMISSION NO
    { wch: 28 }, // LEARNER NAME
    { wch: 14 }, // STREAM
    { wch: 10 }, // STR POS
    { wch: 10 }, // OVR POS
    { wch: 8 }, // ENG
    { wch: 8 }, // KIS
    { wch: 8 }, // MATH
    { wch: 9 }, // INT SCI
    { wch: 8 }, // CAS
    { wch: 8 }, // SST
    { wch: 8 }, // CRE
    { wch: 8 }, // AGN
    { wch: 10 }, // PRE-TECH
    { wch: 11 }, // SUB ENTRY
    { wch: 13 }, // TOTAL POINTS
    { wch: 15 }, // AVG POINTS
  ];

  // Row Heights (giving ample vertical clearance on Row 5 for 90° rotated headers)
  ws['!rows'] = [
    { hpt: 22 }, // Row 1
    { hpt: 20 }, // Row 2
    { hpt: 16 }, // Row 3
    { hpt: 8 }, // Row 4 (blank)
    { hpt: 68 }, // Row 5: 90° Rotated headers height
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Merit List');

  // Write base XLSX package
  const baseBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Post-process with JSZip to inject genuine 90° textRotation into OpenXML
  return await injectExcelHeaderRotation(baseBytes, 5);
}

// ==============================================================================
// 6. Public Export Action Handlers (PDF & Excel)
// ==============================================================================

/**
 * Exports and downloads the KJSEA Merit List as PDF.
 */
export async function exportKJSEAMeritListPDF(
  options: KJSEAMeritExportOptions
): Promise<void> {
  const exportData = await getKJSEAMeritExportData(options);
  const doc = generateKJSEAMeritPDFDocument(exportData);

  const safeStream = (exportData.selectedStreamName || 'Stream')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = exportData.isAllStreams
    ? `KJSEA_${exportData.examYear}_Merit_List_All_Streams.pdf`
    : `KJSEA_${exportData.examYear}_Merit_List_Stream_${safeStream}.pdf`;

  await savePdf(doc, filename);
}

/**
 * Exports and downloads the KJSEA Merit List as Excel (.xlsx).
 */
export async function exportKJSEAMeritListExcel(
  options: KJSEAMeritExportOptions
): Promise<void> {
  const exportData = await getKJSEAMeritExportData(options);
  const finalXlsxBytes = await buildKJSEAMeritExcelBuffer(exportData);

  const safeStream = (exportData.selectedStreamName || 'Stream')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = exportData.isAllStreams
    ? `KJSEA_${exportData.examYear}_Merit_List_All_Streams.xlsx`
    : `KJSEA_${exportData.examYear}_Merit_List_Stream_${safeStream}.xlsx`;

  await saveFile(finalXlsxBytes, filename, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
