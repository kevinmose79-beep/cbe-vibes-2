import rawJsPDF from 'jspdf';
const jsPDF = (rawJsPDF as any).jsPDF || rawJsPDF;
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { savePdf, saveFile } from '../utils/fileDownloader';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Mark,
  Grade,
  Teacher,
  getEducationLevelForGrade,
  getMeritListDisplayCode,
  getShortCbeCode,
  getApplicableSubjectsForGrade,
  getStreamOrderIndex,
} from '../types';
import {
  calculateExamResults,
  getGradeForMark,
  CBE_8_POINT_GRADES,
  getLearnerReportSubjects,
  validateCalculationData,
} from './analysisEngine';
import { getFilteredStudents, getClassCohortStudents, getClassStreamLabel, formatStandardExamCode } from '../utils/filterUtils';
import { getLearnerClassAtExamTime } from './historicalContextResolver';
import { evaluateMark, formatPercentage, formatAverageMark, formatTwoDecimalAverage, isUpperPrimaryCompOrInsha, isEnglishLanguage, isKiswahiliLugha, isSocialStudies, isChristianReligiousEducation, isDirectSSCRE, getSSCREComponentMaxMarks, isAgricultureIncludedInCompositeExam, isAgricultureSubject, getUpperPrimaryMeritListSubjectPartition } from '../utils/markUtils';
import { getDisplayExamName, isGrade6OpenerTerm32026 } from '../utils/examDisplayUtils';
import {
  calculatePrimaryCbeLevelCounts,
  calculateJuniorCbeLevelCounts,
} from './cbeLevelCountsEngine';

function findStudentMarkForExporter(
  marks: Mark[],
  studentId: string,
  subject: Subject | undefined,
  examId: string,
  subjects: Subject[] = []
): Mark | undefined {
  if (!subject) return undefined;
  const isTargetDirectSsCre = isDirectSSCRE(subject);
  return marks.find(
    (m) =>
      String(m.student_id) === String(studentId) &&
      String(m.exam_id) === String(examId) &&
      (String(m.subject_id) === String(subject.id) ||
        (isTargetDirectSsCre &&
          (isDirectSSCRE({ id: m.subject_id }) ||
            subjects.some((s) => s.id === m.subject_id && isDirectSSCRE(s)))))
  );
}

export interface MeritListData {
  school: School;
  exam?: Examination;
  exams?: Examination[];
  comparisonExamId?: string;
  selectedClassId: string;
  selectedStreamId?: string;
  classes: ClassStream[];
  teachers?: Teacher[];
  students: Student[];
  subjects: Subject[];
  marks: Mark[];
  grades: Grade[];
  generatedBy?: string;
}

export interface MeritListClassTeacherInfo {
  isAllStreams: boolean;
  specificTeacherName?: string;
  streamTeachers: Array<{ streamName: string; teacherName: string }>;
  summaryText: string;
}

export function resolveMeritListClassTeachers(
  classes: ClassStream[] = [],
  teachers: Teacher[] = [],
  selectedClassId: string = 'all',
  selectedStreamId?: string,
  targetGrade?: string,
  targetStudents: Student[] = []
): MeritListClassTeacherInfo {
  const isStreamAll =
    !selectedStreamId ||
    selectedStreamId === 'all' ||
    selectedStreamId === 'All Streams';

  const getTeacherForClassStream = (cs?: ClassStream | null): string => {
    if (!cs) return 'NOT ASSIGNED';
    if (cs.class_teacher_id) {
      const byId = teachers.find((t) => t.id === cs.class_teacher_id);
      if (byId && byId.teacher_name) return byId.teacher_name.trim();
    }
    const byOfId = teachers.find(
      (t) =>
        t.is_class_teacher &&
        (t.class_teacher_of_id === cs.stream_id ||
          t.class_teacher_of_id === cs.id ||
          (cs.stream_id && t.class_teacher_of_id === cs.stream_id))
    );
    if (byOfId && byOfId.teacher_name) return byOfId.teacher_name.trim();

    return 'NOT ASSIGNED';
  };

  // Case 1: Specific Stream Selected
  if (!isStreamAll) {
    const targetStream =
      classes.find((c) => c.stream_id === selectedStreamId || c.id === selectedStreamId) ||
      classes.find(
        (c) =>
          c.stream &&
          c.stream.toLowerCase() === (selectedStreamId || '').toLowerCase() &&
          (!targetGrade || (c.class_name || '').toLowerCase() === targetGrade.toLowerCase())
      ) ||
      classes.find(
        (c) => c.stream && c.stream.toLowerCase() === (selectedStreamId || '').toLowerCase()
      );

    const teacherName = getTeacherForClassStream(targetStream);
    const streamName = targetStream?.stream || selectedStreamId || '';
    return {
      isAllStreams: false,
      specificTeacherName: teacherName,
      streamTeachers: [
        {
          streamName,
          teacherName,
        },
      ],
      summaryText: teacherName,
    };
  }

  // Case 2: All Streams Selected
  let relevantStreams = classes.filter((c) => {
    if (selectedClassId && selectedClassId !== 'all') {
      return (
        c.id === selectedClassId ||
        (targetGrade && (c.class_name || '').toLowerCase() === targetGrade.toLowerCase())
      );
    }
    if (targetGrade) {
      return (c.class_name || '').toLowerCase() === targetGrade.toLowerCase();
    }
    return true;
  });

  if (relevantStreams.length === 0 && targetStudents.length > 0) {
    const studentStreamNames = Array.from(
      new Set(
        targetStudents
          .map((s) => s.stream_id || (s as any).stream_name || '')
          .filter(Boolean)
      )
    );
    relevantStreams = classes.filter(
      (c) =>
        studentStreamNames.includes(c.stream_id || '') ||
        studentStreamNames.includes(c.id) ||
        studentStreamNames.includes(c.stream)
    );
  }

  const seenStreams = new Set<string>();
  const uniqueStreams: ClassStream[] = [];
  for (const cs of relevantStreams) {
    const key = (cs.stream_id || cs.stream || cs.id).toLowerCase();
    if (!seenStreams.has(key)) {
      seenStreams.add(key);
      uniqueStreams.push(cs);
    }
  }

  uniqueStreams.sort((a, b) => {
    const idxA = getStreamOrderIndex(a.stream);
    const idxB = getStreamOrderIndex(b.stream);
    if (idxA !== idxB) return idxA - idxB;
    return (a.stream || '').localeCompare(b.stream || '');
  });

  const streamTeachers = uniqueStreams.map((cs) => {
    const streamName = (cs.stream || 'DEFAULT').toUpperCase();
    const teacherName = getTeacherForClassStream(cs);
    return {
      streamName,
      teacherName,
    };
  });

  const summaryText =
    streamTeachers.length > 0
      ? streamTeachers.map((st) => `${st.streamName} — ${st.teacherName}`).join(' | ')
      : 'NOT ASSIGNED';

  return {
    isAllStreams: true,
    streamTeachers,
    summaryText,
  };
}


function populateComparisonResults(
  results: any[],
  comparisonExamId: string | undefined,
  allStudents: any[],
  marks: any[],
  grades: any[],
  classes: any[],
  allSubjects: any[],
  allExams?: any[]
) {
  if (!comparisonExamId) return;
  const compExamObj = (allExams || []).find(
    (e) => e.id === comparisonExamId || (e as any).exam_code === comparisonExamId || e.exam_name === comparisonExamId
  );
  const comparisonMap = new Map<string, any>();
  const compResults = calculateExamResults(comparisonExamId, allStudents, marks, grades, classes, allSubjects, compExamObj);
  compResults.forEach((r) => {
    if (r.student_id) {
      comparisonMap.set(String(r.student_id).toLowerCase().trim(), r);
    }
    const matchedStudent = (allStudents || []).find((s) => s.id === r.student_id);
    if (matchedStudent?.admission_number) {
      comparisonMap.set(String(matchedStudent.admission_number).toLowerCase().trim(), r);
    }
  });

  results.forEach((r) => {
    const matchedStudent = (allStudents || []).find((s) => s.id === r.student_id);
    const key = r.student_id ? String(r.student_id).toLowerCase().trim() : '';
    const admKey = matchedStudent?.admission_number ? String(matchedStudent.admission_number).toLowerCase().trim() : '';

    const prev = comparisonMap.get(key) || (admKey ? comparisonMap.get(admKey) : undefined);
    if (prev && (prev.position > 0 || prev.class_position > 0 || prev.stream_position > 0)) {
      r.previous_position = prev.position > 0 ? prev.position : null;
      r.previous_class_position = prev.class_position > 0
        ? prev.class_position
        : (prev.stream_position > 0 ? prev.stream_position : null);
    } else {
      r.previous_position = null;
      r.previous_class_position = null;
    }
  });
}

// Convert image URL to base64 for jsPDF (max 240px asset optimization)
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
    }, 5000);

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

export function sortSubjectsByStandardOrder<T extends Record<string, any>>(subjects: T[]): T[] {
  if (!subjects || subjects.length <= 1) return subjects || [];

  const orderMap: Record<string, number> = {
    // Official Standard Order:
    'ENG': 1,
    'ENGLISH': 1,

    'COMP': 2,
    'ENGLISH COMPOSITION': 2,
    'COMPOSITION': 2,

    'KIS': 3,
    'KISW': 3,
    'KISWAHILI': 3,

    'INSHA': 4,
    'KISWAHILI INSHA': 4,

    'MATH': 5,
    'MAT': 5,
    'MATHEMATICS': 5,
    'MATHS': 5,

    'SCT': 6,
    'INT-SCI': 6,
    'INT SCI': 6,
    'SCI': 6,
    'INT/SC': 6,
    'INTEGRATED SCIENCE': 6,

    'CAS': 7,
    'CA': 7,
    'CREATIVE ARTS AND SPORTS': 7,
    'CREATIVE ARTS & SPORTS': 7,
    'CREATIVE ARTS': 7,
    'CREAT UP': 7,

    'SS&CRE': 8,
    'SS & CRE': 8,
    'SOCIAL STUDIES&CRE': 8,
    'SOCIAL STUDIES & CRE': 8,
    'SS': 8,
    'SST': 8,
    'SOCIAL STUDIES': 8,

    'CRE': 9,
    'C.R.E': 9,
    'CHRISTIAN RELIGIOUS EDUCATION': 9,

    'AGN': 10,
    'AGR': 10,
    'AGRI': 10,
    'AGRIC': 10,
    'AGRICULTURE AND NUTRITION': 10,
    'AGRICULTURE & NUTRITION': 10,
    'AGRICULTURE': 10,

    'PRE TECH': 11,
    'PRE-TECH': 11,
    'PTS': 11,
    'PRE-TECHNICAL STUDIES': 11,
  };

  return [...subjects].sort((a, b) => {
    const codeA = getShortCbeCode(a.subject_code || '', a.subject_name || '');
    const codeB = getShortCbeCode(b.subject_code || '', b.subject_name || '');

    const posA = orderMap[codeA] ?? (orderMap[(a.subject_code || '').toUpperCase()] ?? 99);
    const posB = orderMap[codeB] ?? (orderMap[(b.subject_code || '').toUpperCase()] ?? 99);

    if (posA !== posB) return posA - posB;
    return (a.subject_code || a.subject_name || '').localeCompare(b.subject_code || b.subject_name || '');
  });
}

function getSubjectFullName(sb: { subject_code: string; subject_name: string }, eduLevel?: string): string {
  const code = getShortCbeCode(sb.subject_code, sb.subject_name, eduLevel);
  let name = sb.subject_name || '';

  if (code === 'PRE TECH' && !name.toLowerCase().includes('pre')) {
    name = 'Pre-Technical Studies';
  } else if (code === 'ENG' && !name) {
    name = 'English';
  } else if (code === 'KIS' && !name) {
    name = 'Kiswahili';
  } else if (code === 'MAT' && !name) {
    name = 'Mathematics';
  } else if (code === 'SCT' && !name) {
    name = 'Science & Technology';
  } else if ((code === 'INT-SCI' || code === 'SCI') && (!name || name === 'Science')) {
    name = 'Integrated Science';
  } else if (code === 'SS&CRE' && !name) {
    name = 'Social Studies&CRE';
  } else if (code === 'SST' && !name) {
    name = 'Social Studies';
  } else if (code === 'CA' && (!name || name === 'Creative Arts')) {
    name = 'Creative Arts';
  } else if (code === 'CAS' && (!name || name === 'Creative Arts & Sports')) {
    name = 'Creative Arts and Sports';
  } else if (code === 'CRE' && (!name || name === 'CRE' || name.includes('Religious'))) {
    name = 'Christian Religious Education';
  } else if ((code === 'AGN' || code === 'AGR') && (!name || name === 'Agriculture' || name === 'Agriculture & Nutrition')) {
    name = 'Agriculture and Nutrition';
  }

  const cleanName = name.trim();
  if (cleanName.toUpperCase().startsWith(`${code} -`)) {
    return cleanName;
  }
  return `${code} - ${cleanName}`;
}

export function getFullLearningAreaName(sb: { subject_code?: string; subject_name?: string }, eduLevel?: string): string {
  const code = getShortCbeCode(sb.subject_code || '', sb.subject_name || '', eduLevel);
  const rawName = (sb.subject_name || '').trim();

  if (code === 'ENG' || rawName.toUpperCase().includes('ENGLISH')) return 'English';
  if (code === 'KIS' || rawName.toUpperCase().includes('KISWAHILI')) return 'Kiswahili';
  if (code === 'MATH' || code === 'MAT' || rawName.toUpperCase().includes('MATHEMATICS') || rawName.toUpperCase() === 'MATHS' || rawName.toUpperCase() === 'MATH') return 'Mathematics';
  if (code === 'INT-SCI' || code === 'INT SCI' || code === 'SCI' || rawName.toUpperCase().includes('INTEGRATED SCIENCE')) return 'Integrated Science';
  if (code === 'CAS' || rawName.toUpperCase().includes('CREATIVE ARTS')) return 'Creative Arts and Sports';
  if (code === 'SST' || rawName.toUpperCase() === 'SOCIAL STUDIES') return 'Social Studies';
  if (code === 'CRE' || rawName.toUpperCase().includes('RELIGIOUS')) return 'Christian Religious Education';
  if (code === 'AGN' || code === 'AGR' || rawName.toUpperCase().includes('AGRICULTURE')) return 'Agriculture and Nutrition';
  if (code === 'PRE TECH' || code === 'PRE-TECH' || code === 'PTS' || rawName.toUpperCase().includes('TECHNICAL')) return 'Pre-Technical Studies';

  return rawName || sb.subject_code || 'Learning Area';
}

// --- 1. GENERATE MERIT LIST PDF ---
export async function downloadMeritListPDF(data: MeritListData): Promise<void> {
  const {
    school,
    exam,
    selectedClassId,
    selectedStreamId = 'all',
    classes = [],
    teachers = [],
    students = [],
    subjects = [],
    marks = [],
    grades = [],
    generatedBy = 'Administrator',
  } = data;

  const targetStudents = getFilteredStudents(students, classes, selectedClassId, selectedStreamId, exam);
  const firstTargetStudent = targetStudents[0];
  const firstHistCtx = firstTargetStudent && exam ? getLearnerClassAtExamTime(firstTargetStudent, exam, classes) : null;
  const targetClass = classes.find(
    (c) => c.id === (selectedClassId !== 'all' ? selectedClassId : (firstHistCtx?.class_id || firstTargetStudent?.class_id))
  );
  const targetGrade = targetClass?.class_name || firstHistCtx?.class_name || firstHistCtx?.grade || firstTargetStudent?.grade || '';
  const eduLevel = getEducationLevelForGrade(targetGrade);

  if (eduLevel === 'Pre-Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Upper Primary') {
    return generatePrimaryMeritListPDF(data, eduLevel);
  }

  const examId = exam?.id || '';
  const streamNameStr = getClassStreamLabel(classes, selectedClassId, selectedStreamId);
  const rawCohortSubjects = targetClass ? getLearnerReportSubjects(firstTargetStudent || {} as any, targetClass, subjects, teachers || []) : [];
  let cohortSubjects = sortSubjectsByStandardOrder(rawCohortSubjects);

  if (cohortSubjects.length === 0) {
    const fallbackSubjects = getApplicableSubjectsForGrade(targetGrade || 'Grade 7', subjects);
    cohortSubjects = sortSubjectsByStandardOrder(fallbackSubjects);
  }

  if (cohortSubjects.length === 0 && subjects.length > 0) {
    const jsSubjects = subjects.filter(
      (s) => s.status !== 'Archived' && ((s.education_level as string) === 'Junior School' || (s.education_level as string) === 'Junior Secondary')
    );
    cohortSubjects = sortSubjectsByStandardOrder(jsSubjects);
  }

  // Full general class cohort (all streams belonging to this grade/class level)
  const classCohortStudents = getClassCohortStudents(students, classes, selectedClassId, targetGrade, exam, targetStudents);

  // Calculate authoritative results across the entire general class cohort
  const allCohortResults = calculateExamResults(examId, classCohortStudents, marks, grades, classes, cohortSubjects, exam);
  populateComparisonResults(allCohortResults, data.comparisonExamId, students, marks, grades, classes, subjects, data.exams);

  // When filtering by a specific stream, select only the target stream's results
  const targetStudentIdSet = new Set(targetStudents.map((s) => s.id));
  const results = selectedStreamId !== 'all'
    ? allCohortResults.filter((r) => targetStudentIdSet.has(r.student_id))
    : allCohortResults;

  // Validate calculation engine output
  const validation = validateCalculationData(results, marks, grades, cohortSubjects);
  if (!validation.isValid) {
    console.error('Calculation Validation Errors:', validation.errors);
    throw new Error(`Calculation Engine Validation Failed:\n${validation.errors.join('\n')}`);
  }

  // Sort learners for display by authoritative position ascending (complete learners first), with total_marks descending as fallback
  results.sort((a, b) => (a.position || 999) - (b.position || 999) || (b.total_marks || 0) - (a.total_marks || 0));

  const assessedResults = results.filter((r) => (r.subject_count || 0) > 0);
  const assessedStudentIds = new Set(assessedResults.map((r) => r.student_id));
  const assessedStudents = targetStudents.filter((s) => assessedStudentIds.has(s.id));
  const countAssessed = assessedResults.length;
  const totalLearners = targetStudents.length;

  // Class Mean Mark = average percentage score across assessed learners ONLY
  const totalStudentAverages = assessedResults.reduce((acc, r) => acc + r.average, 0);
  const overallClassAverageNum = countAssessed > 0 ? totalStudentAverages / countAssessed : 0;
  const overallClassAverage = formatAverageMark(overallClassAverageNum);

  // Mean Points = average points across assessed learners ONLY
  const totalStudentAvgPoints = assessedResults.reduce((acc, r) => acc + (r.average_points || (r.subject_count > 0 ? r.total_points / r.subject_count : 0)), 0);
  const meanPointsNum = countAssessed > 0 ? totalStudentAvgPoints / countAssessed : 0;
  const meanPoints = meanPointsNum.toFixed(2);

  // Standard 9 CBE Subjects
  const defaultSubjectCodes = ['ENG', 'KIS', 'MATH', 'INT SCI', 'CAS', 'SST', 'CRE', 'AGN', 'PRE-TECH'];

  // Resolve active subjects matching target cohort
  const activeSubjects = cohortSubjects;
  const subjectCodes = activeSubjects.length > 0
    ? activeSubjects.map((sb) => {
        const short = getShortCbeCode(sb.subject_code, sb.subject_name, eduLevel);
        if (short === 'PRE TECH') return 'PRE-TECH';
        if (short === 'INT-SCI') return 'INT SCI';
        if (short === 'MAT') return 'MATH';
        if (short === 'AGR' || short === 'AGRI') return 'AGN';
        if (short === 'C.R.E') return 'CRE';
        return short;
      })
    : defaultSubjectCodes;

  const formattedSubjectHeaders = subjectCodes;

  // Calculate Subject Statistics for Footer Table & track assessed status using evaluateMark
  const subjectStatsMap: Record<string, { avg: number; avgPts: number; gradeCode: string; isAssessed: boolean }> = {};
  activeSubjects.forEach((sb, idx) => {
    const code = formattedSubjectHeaders[idx] || sb.subject_code;
    const subjMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(sb.id));
    
    // Filter only normal, valid numerical marks for target assessed students
    const validSubjMarks = subjMarks
      .filter((m) => assessedStudentIds.has(m.student_id))
      .map((m) => ({ student_id: m.student_id, info: evaluateMark(m) }))
      .filter((item) => item.info.status === 'Normal' && item.info.percentage !== null);

    const count = validSubjMarks.length;
    if (count > 0) {
      const sumPct = validSubjMarks.reduce((acc, item) => acc + item.info.percentage!, 0);
      const avgPct = count > 0 ? sumPct / count : 0;
      const gr = getGradeForMark(avgPct, grades);

      const ptsSum = validSubjMarks.reduce((acc, item) => {
        const g = getGradeForMark(item.info.percentage!, grades);
        return acc + g.points;
      }, 0);
      const avgPts = parseFloat((ptsSum / count).toFixed(2));

      subjectStatsMap[code] = {
        avg: avgPct,
        avgPts: avgPts,
        gradeCode: gr.grade_code || 'ME1',
        isAssessed: true,
      };
    } else {
      subjectStatsMap[code] = {
        avg: 0,
        avgPts: 0,
        gradeCode: '',
        isAssessed: false,
      };
    }
  });

  // Calculate raw average total marks obtained and maximum possible marks based on curriculum learning areas
  const totalClassRawObtained = assessedResults.reduce((acc, r) => acc + (r.total_marks || 0), 0);
  const avgTotalObtained = countAssessed > 0 ? Math.round(totalClassRawObtained / countAssessed) : 0;
  const isUpperPrimaryLevel = (eduLevel as string) === 'Upper Primary' || (eduLevel as string) === 'upper_primary' || Boolean(targetGrade && ['Grade 4', 'Grade 5', 'Grade 6'].includes(targetGrade));
  // If Upper Primary, dynamically determine whether cohort was assessed out of 700 (with Agriculture) or 600
  const maxAssessedTotalInCohort = assessedResults.reduce((max, r) => Math.max(max, r.total_max_marks || 0), 0);
  const classCurriculumMax = isUpperPrimaryLevel
    ? (maxAssessedTotalInCohort > 0 ? maxAssessedTotalInCohort : 600)
    : (activeSubjects.length > 0
        ? activeSubjects.length * 100
        : ((eduLevel as string) === 'junior_school' || eduLevel === 'Junior School' ? 900 : (eduLevel as string) === 'lower_primary' || eduLevel === 'Lower Primary' ? 400 : 600));
  const avgTotalMax = classCurriculumMax;

  const classAvgScoreSum = `${formatAverageMark(overallClassAverageNum)} (Mean Total: ${avgTotalObtained} / ${avgTotalMax})`;

  // Initialize A4 Landscape Document (297mm x 210mm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 10;
  const marginTop = 12;
  const marginBottom = 12;
  const contentWidth = pageWidth - marginX * 2; // 277mm

  // Base64 Logo fetch
  const base64Logo = school.logo_url ? await getBase64ImageFromUrl(school.logo_url) : null;

  // Dates
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  // Column Headers matching exact spec
  const tableHeadTitles = [
    'S.NO',
    'ADM NO.',
    'LEARNER NAME',
    'STREAM',
    'STR. POS.',
    'OVR POS',
    'PRV STR POS',
    'PRV OVR POS',
    ...formattedSubjectHeaders,
    'SUB. ENTRY',
    'TOTAL MARKS',
    'AVG MARKS',
    'TOTAL PTS',
    'AVG PTS',
    'CBE LEVEL',
  ];

  // Build Table Rows
  const tableRows = results.map((r, idx) => {
    const std = targetStudents.find((s) => s.id === r.student_id);
    const histCtx = std && exam ? getLearnerClassAtExamTime(std, exam, classes) : null;
    const cls = classes.find((c) => c.id === (histCtx?.class_id || std?.class_id));
    const streamStr = histCtx
      ? (histCtx.historical_context_resolved ? (histCtx.stream_name || cls?.stream || '-') : '-')
      : (cls?.stream ? cls.stream : '-');
    const isComplete = r.is_complete !== false;
    const overallPos = isComplete && r.position && r.position > 0 ? `${r.position}` : '-';
    const streamRank = isComplete && (r.class_position || r.position) && ((r.class_position || r.position) > 0) ? `${r.class_position || r.position}` : '-';

    // Previous positions (from comparison exam)
    const prevOvrPos = (r as any).previous_position != null ? `${(r as any).previous_position}` : '-';
    const prevStrPos = (r as any).previous_class_position != null ? `${(r as any).previous_class_position}` : '-';

    // Subject cells format: "MARK CBE_CODE" e.g. "82 EE2" or "X" / "Y" / "-"
    const subjectCells = activeSubjects.length > 0
      ? activeSubjects.map((sb, sbIdx) => {
          const code = formattedSubjectHeaders[sbIdx] || getShortCbeCode(sb.subject_code, sb.subject_name);
          const stStats = subjectStatsMap[code];

          // If subject was not assessed in the examination, leave cell blank
          if (stStats && !stStats.isAssessed) {
            return '';
          }

          const stdMark = marks.find(
            (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
          );
          const markInfo = evaluateMark(stdMark);

          if (markInfo.status === 'X') {
            return 'X';
          }
          if (markInfo.status === 'Y') {
            return 'Y';
          }
          if (markInfo.status === 'Blank' || markInfo.percentage === null) {
            return '-';
          }

          const displayedPct = Math.round(markInfo.percentage);
          const gr = getGradeForMark(markInfo.percentage, grades);
          return `${displayedPct} ${gr.grade_code || 'ME1'}`;
        })
      : formattedSubjectHeaders.map(() => '-');

    const subEntry = activeSubjects.filter((sb) => {
      const m = marks.find(
        (mk) => String(mk.student_id) === String(r.student_id) && String(mk.subject_id) === String(sb.id) && String(mk.exam_id) === String(examId)
      );
      const info = evaluateMark(m);
      return info.status === 'Normal' && info.percentage !== null;
    }).length;

    const isAssessed = subEntry > 0;
    const assessedCnt = isAssessed ? subEntry : 1;
    const avgPtsNum = r.average_points !== undefined && r.average_points !== null && r.average_points > 0
      ? r.average_points
      : (r.total_points / assessedCnt);
    const avgPts = isComplete && isAssessed ? avgPtsNum.toFixed(2) : '-';
    const overallLevelObj = getGradeForMark(r.average, grades);

    const gradeCode = isComplete
      ? (overallLevelObj.grade_code || 'ME1')
      : isAssessed
      ? `Prov (${overallLevelObj.grade_code || 'ME1'})`
      : 'Pending';

    return [
      `${idx + 1}`,
      std?.admission_number || '-',
      (std?.full_name || 'UNKNOWN LEARNER').toUpperCase(),
      streamStr !== '-' ? streamStr.toUpperCase() : '-',
      streamRank,
      overallPos,
      prevStrPos,
      prevOvrPos,
      ...subjectCells,
      `${subEntry}`,
      isAssessed ? `${Math.round(r.total_marks)}` : '-',
      isComplete && isAssessed ? formatAverageMark(r.average) : isAssessed ? `${formatAverageMark(r.average)} (P)` : '-',
      isComplete && isAssessed ? `${r.total_points}` : '-',
      avgPts,
      gradeCode,
    ];
  });

  // Proportional Column Widths matching official template geometry (277mm printable width)
  const numSubjs = formattedSubjectHeaders.length || 1;
  const sumMetaW = 98; // 7.5 + 12.5 + 40 + 12 + 6.5 + 6.5 + 6.5 + 6.5 = 98mm (S.NO 7.5mm, ADM 12.5mm, Learner Name 40mm, Stream 12mm)
  const sumSummaryW = 62; // 7 + 10 + 11 + 10 + 10 + 14 = 62mm (TOTAL MARKS tightened to 10mm)
  const availSubjW = (contentWidth - sumMetaW - sumSummaryW) / numSubjs;

  const columnStyles: Record<number, any> = {
    0: { cellWidth: 7.5, halign: 'center', fontStyle: 'normal' },
    1: { cellWidth: 12.5, halign: 'center', fontStyle: 'normal' },
    2: { cellWidth: 40, halign: 'left', cellPadding: { top: 0.3, bottom: 0.3, left: 1.2, right: 0.3 }, fontStyle: 'normal' },
    3: { cellWidth: 12, halign: 'center', fontStyle: 'normal' },
    4: { cellWidth: 6.5, halign: 'center', fontStyle: 'normal' },
    5: { cellWidth: 6.5, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] },
    6: { cellWidth: 6.5, halign: 'center', fontStyle: 'normal' },
    7: { cellWidth: 6.5, halign: 'center', fontStyle: 'normal' },
  };

  const startSubjIdx = 8;
  for (let i = 0; i < numSubjs; i++) {
    columnStyles[startSubjIdx + i] = { cellWidth: availSubjW, halign: 'center', fontStyle: 'normal' };
  }

  const startSummIdx = startSubjIdx + numSubjs;
  columnStyles[startSummIdx]     = { cellWidth: 7, halign: 'center', fontStyle: 'normal' };
  columnStyles[startSummIdx + 1] = { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };
  columnStyles[startSummIdx + 2] = { cellWidth: 11, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };
  columnStyles[startSummIdx + 3] = { cellWidth: 10, halign: 'center', fontStyle: 'normal' };
  columnStyles[startSummIdx + 4] = { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };
  columnStyles[startSummIdx + 5] = { cellWidth: 14, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };

  const subjectColIndices = Array.from({ length: numSubjs }, (_, k) => startSubjIdx + k);
  // ONLY rotate vertical titles (Positions and Summary columns), NOT Subject or metadata titles
  const rotatedHeaderIndices = [4, 5, 6, 7, startSummIdx, startSummIdx + 1, startSummIdx + 2, startSummIdx + 3, startSummIdx + 4, startSummIdx + 5];

  // Function to Render Official Document Header (FIRST PAGE ONLY)
  const renderDocumentHeader = () => {
    let textLeft = marginX;

    if (base64Logo) {
      const { dataUrl, width, height } = base64Logo;
      let logoDisplayW = 16;
      let logoDisplayH = 16;
      if (width && height && height > 0) {
        const aspect = width / height;
        if (aspect >= 1) {
          logoDisplayW = 16;
          logoDisplayH = Math.min(16, 16 / aspect);
        } else {
          logoDisplayH = 16;
          logoDisplayW = Math.min(16, 16 * aspect);
        }
      }
      const logoX = marginX;
      const logoY = 6.0 + (16 - logoDisplayH) / 2;
      try {
        doc.addImage(dataUrl, 'PNG', logoX, logoY, logoDisplayW, logoDisplayH);
      } catch (err) {
        console.warn('Failed to embed merit list logo:', err);
      }
      textLeft = marginX + logoDisplayW + 4;
    }

    // Line 1: School Name (Emerald Teal)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0, 135, 103);
    const schoolNameStr = (school.school_name || 'MUCHORWE JUNIOR SCHOOL').toUpperCase();
    doc.text(schoolNameStr, textLeft, 10);

    // Line 2: Report Title (Black)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text("REPORT: LEARNERS' PERFORMANCE MERIT LIST", textLeft, 15.5);

    // Line 3: Metadata Line (Left Aligned)
    const metaY = 21.0;
    doc.setFontSize(8);

    const classNameStr = getClassStreamLabel(classes, selectedClassId, selectedStreamId);
    const termStr = String(exam?.term || 'Term 2');
    const yearStr = String(exam?.year || '2026');
    const examNameStr = (getDisplayExamName(exam?.exam_name) || 'ENDTERM 2').toUpperCase();
    const examCodeStr = formatStandardExamCode(targetGrade || classNameStr, exam);

    const teacherInfo = resolveMeritListClassTeachers(
      classes,
      teachers,
      selectedClassId,
      selectedStreamId,
      targetGrade,
      targetStudents
    );

    const isAllStreams = teacherInfo.isAllStreams;

    if (!isAllStreams) {
      // Specific Stream Selected (2 Metadata Lines to prevent overflow beyond page margins)
      // Line 1: Class, Stream, Teacher, Term, Year (at Y = 19.0)
      const metaY1 = 19.0;
      doc.setFontSize(7.8);

      let curX1 = textLeft;
      const itemGap = 4.5;

      const renderItem1 = (label: string, value: string, underline = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, curX1, metaY1);
        curX1 += doc.getTextWidth(label) + 1.0;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 85, 204);
        doc.text(value, curX1, metaY1);
        const valW = doc.getTextWidth(value);
        if (underline) {
          doc.setDrawColor(0, 85, 204);
          doc.setLineWidth(0.3);
          doc.line(curX1, metaY1 + 0.6, curX1 + valW, metaY1 + 0.6);
        }
        curX1 += valW + itemGap;
      };

      const streamDisplay =
        classes.find((c) => c.stream_id === selectedStreamId || c.id === selectedStreamId)?.stream ||
        streamNameStr;

      renderItem1('CLASS:', (targetGrade || 'Grade 8').toUpperCase(), false);
      renderItem1('STREAM:', streamDisplay.toUpperCase());
      renderItem1('CLASS TEACHER:', teacherInfo.specificTeacherName || 'NOT ASSIGNED');
      renderItem1('TERM:', termStr);
      renderItem1('YEAR:', yearStr);

      // Line 2: Exam Name & Exam Code (at Y = 23.5)
      const metaY2 = 23.5;
      let curX2 = textLeft;

      const renderItem2 = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, curX2, metaY2);
        curX2 += doc.getTextWidth(label) + 1.0;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 85, 204);
        doc.text(value, curX2, metaY2);
        const valW = doc.getTextWidth(value);
        curX2 += valW + itemGap;
      };

      renderItem2('EXAM NAME:', examNameStr);
      renderItem2('EXAM CODE:', examCodeStr);
    } else {
      // All Streams Selected (2 Metadata Lines)
      // Line 1: Basic Exam & Class Metadata (at Y = 19.0)
      const metaY1 = 19.0;
      doc.setFontSize(7.8);

      let curX = textLeft;
      const itemGap = 5.0;

      const renderItem1 = (label: string, value: string, underline = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, curX, metaY1);
        curX += doc.getTextWidth(label) + 1.0;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 85, 204);
        doc.text(value, curX, metaY1);
        const valW = doc.getTextWidth(value);
        if (underline) {
          doc.setDrawColor(0, 85, 204);
          doc.setLineWidth(0.3);
          doc.line(curX, metaY1 + 0.6, curX + valW, metaY1 + 0.6);
        }
        curX += valW + itemGap;
      };

      renderItem1('CLASS:', (targetGrade || 'Grade 8').toUpperCase(), false);
      renderItem1('STREAM:', 'ALL STREAMS');
      renderItem1('TERM:', termStr);
      renderItem1('YEAR:', yearStr);
      renderItem1('EXAM NAME:', examNameStr);
      renderItem1('EXAM CODE:', examCodeStr);

      // Line 2: Stream-Specific Teachers Metadata (at Y = 23.5)
      const metaY2 = 23.5;
      let curX2 = textLeft;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('CLASS TEACHERS:', curX2, metaY2);
      curX2 += doc.getTextWidth('CLASS TEACHERS:') + 1.2;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 85, 204);
      doc.text(teacherInfo.summaryText, curX2, metaY2);
    }
  };

  const teacherInfoJS = resolveMeritListClassTeachers(
    classes,
    teachers,
    selectedClassId,
    selectedStreamId,
    targetGrade,
    targetStudents
  );

  // Run autoTable for Main Student Matrix
  autoTable(doc, {
    startY: 27, // Page 1 starts below official 2-line metadata header
    margin: { left: marginX, right: marginX, top: marginTop, bottom: marginBottom },
    head: [tableHeadTitles],
    body: tableRows,
    theme: 'grid',
    showHead: 'everyPage', // Repeat ONLY table headers on new pages
    styles: {
      fontSize: 7.2,
      cellPadding: { top: 0.25, bottom: 0.25, left: 0.3, right: 0.3 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      fillColor: [255, 255, 255],
      valign: 'middle',
      halign: 'center',
      minCellHeight: 3.6,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: numSubjs > 11 ? Math.max(5.0, 7.0 - (numSubjs - 11) * 0.3) : 7.0,
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 18,
    },
    columnStyles: columnStyles,
    didDrawPage: (d) => {
      // Document Header appears ONLY ONCE on the first page
      if (d.pageNumber === 1) {
        renderDocumentHeader();
      }
    },
    willDrawCell: (d) => {
      // Clear default text for rotated headers and subject cells
      if (d.section === 'head' && rotatedHeaderIndices.includes(d.column.index)) {
        d.cell.text = [];
      }
      if (d.section === 'body' && subjectColIndices.includes(d.column.index)) {
        d.cell.text = [];
      }
    },
    didDrawCell: (d) => {
      // 1. Render Rotated Header Titles (90 degrees counter-clockwise)
      if (d.section === 'head' && rotatedHeaderIndices.includes(d.column.index)) {
        const cell = d.cell;
        const title = tableHeadTitles[d.column.index];
        if (title) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(0, 0, 0);
          const x = cell.x + cell.width / 2 + 1.1;
          const y = cell.y + cell.height - 1.8;
          doc.text(title, x, y, { angle: 90 });
        }
      }

      // 2. Render Single-Line Subject Cells: "84 EE2" (Mark + Space + Grade Code)
      if (d.section === 'body' && subjectColIndices.includes(d.column.index)) {
        const cell = d.cell;
        const rowData = tableRows[d.row.index];
        if (!rowData) return;
        const rawVal = String(rowData[d.column.index] || '').trim();
        const centerX = cell.x + cell.width / 2;
        const centerY = cell.y + cell.height / 2;

        if (!rawVal) {
          return;
        }

        if (rawVal.includes(' ')) {
          const spaceIdx = rawVal.indexOf(' ');
          const markStr = rawVal.substring(0, spaceIdx);
          const gradeCodeStr = rawVal.substring(spaceIdx + 1);

          let subjFontSize = 7.2;
          if (availSubjW < 10) {
            subjFontSize = Math.min(7.2, Math.max(4.2, (availSubjW - 0.4) / 1.15));
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(subjFontSize);

          let markW = doc.getTextWidth(markStr);
          let spaceW = doc.getTextWidth(' ');
          let gradeW = doc.getTextWidth(gradeCodeStr);
          let totalW = markW + spaceW + gradeW;

          if (totalW > cell.width - 0.4 && totalW > 0) {
            subjFontSize = Math.max(3.8, subjFontSize * ((cell.width - 0.4) / totalW));
            doc.setFontSize(subjFontSize);
            markW = doc.getTextWidth(markStr);
            spaceW = doc.getTextWidth(' ');
            gradeW = doc.getTextWidth(gradeCodeStr);
            totalW = markW + spaceW + gradeW;
          }

          const startX = centerX - totalW / 2;
          const yPos = centerY + 0.65; // Vertical centering offset

          // Mark in normal font weight black
          doc.setTextColor(0, 0, 0);
          doc.text(markStr, startX, yPos);

          // Grade code in normal font weight blue
          if (gradeCodeStr && gradeCodeStr !== '-') {
            doc.setTextColor(0, 85, 204);
            doc.text(gradeCodeStr, startX + markW + spaceW, yPos);
          } else if (gradeCodeStr === '-') {
            doc.setTextColor(140, 140, 140);
            doc.text('-', startX + markW + spaceW, yPos);
          }
        } else {
          let subjFontSize = 7.2;
          if (availSubjW < 10) {
            subjFontSize = Math.min(7.2, Math.max(4.2, (availSubjW - 0.4) / 1.15));
          }
          if (rawVal === 'X' || rawVal === 'Y') {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(220, 38, 38);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
          }
          doc.setFontSize(subjFontSize);
          let textW = doc.getTextWidth(rawVal);
          if (textW > cell.width - 0.4 && textW > 0) {
            subjFontSize = Math.max(3.8, subjFontSize * ((cell.width - 0.4) / textW));
            doc.setFontSize(subjFontSize);
          }
          doc.text(rawVal, centerX, centerY + 0.65, { align: 'center' });
        }
      }
    },
  });

  // --- CBE LEVEL COUNTS SUMMARY TABLE (JUNIOR SCHOOL) ---
  const isAllStreams =
    !selectedStreamId ||
    selectedStreamId === 'all' ||
    selectedStreamId === 'All Streams';

  const gradeLabel = (targetGrade && targetGrade.trim())
    ? targetGrade.trim().toUpperCase()
    : 'GENERAL CLASS';

  const juniorCountsRows = calculateJuniorCbeLevelCounts(results, students, classes, exam, {
    includeGeneralClass: isAllStreams,
    generalClassLabel: gradeLabel,
  });

  const juniorCountsHead = [
    [
      'STREAM',
      'EE1',
      'EE2',
      'ME1',
      'ME2',
      'AE1',
      'AE2',
      'BE1',
      'BE2',
      'PROVISIONAL',
      'PENDING',
      'TOTAL LEARNERS',
    ],
  ];

  const juniorCountsBody = juniorCountsRows.map((row) => [
    row.stream.toUpperCase(),
    String(row.ee1),
    String(row.ee2),
    String(row.me1),
    String(row.me2),
    String(row.ae1),
    String(row.ae2),
    String(row.be1),
    String(row.be2),
    String(row.provisional),
    String(row.pending),
    String(row.totalLearners),
  ]);

  // Proportional column widths matching Junior School printable width (277mm)
  // Stream: 37mm, 8 Sublevels: 20mm each (160mm total), Provisional: 26mm, Pending: 22mm, Total: 32mm = 277mm
  const juniorCountsColStyles: Record<number, any> = {
    0: { cellWidth: 37, halign: 'left', cellPadding: { top: 0.8, bottom: 0.8, left: 2.0, right: 0.8 }, fontStyle: 'bold' },
    1: { cellWidth: 20, halign: 'center' },
    2: { cellWidth: 20, halign: 'center' },
    3: { cellWidth: 20, halign: 'center' },
    4: { cellWidth: 20, halign: 'center' },
    5: { cellWidth: 20, halign: 'center' },
    6: { cellWidth: 20, halign: 'center' },
    7: { cellWidth: 20, halign: 'center' },
    8: { cellWidth: 20, halign: 'center' },
    9: { cellWidth: 26, halign: 'center' },
    10: { cellWidth: 22, halign: 'center' },
    11: { cellWidth: 32, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] },
  };

  // @ts-ignore
  let finalY = (doc as any).lastAutoTable.finalY + 4;

  // Space calculation to keep ENTIRE final summary together on the same page:
  // 1. Subject Stats Table (4 rows: Header + AVG. MARKS + AVG. POINTS + PERFORMANCE LEVEL): ~17.5mm
  // 2. Gap to banner: 3.5mm
  // 3. CLASS AVERAGE MARKS Banner: 3.5mm
  // 4. CBE Section Heading: 2.5mm
  // 5. CBE Level Counts Table: header ~4.8mm + (cbeRowCount * 4.2mm)
  // 6. Gap to Individual Learning Areas table: 3.5mm
  // 7. Individual Learning Areas Heading: 2.5mm
  // 8. Individual Learning Areas Table: header ~4.8mm + (subjRowCount * 3.6mm)
  // 9. Gap to notes: 3.5mm
  // 10. Notes & breathing room: ~10.0mm
  // Fixed overhead: 17.5 + 3.5 + 3.5 + 2.5 + 4.8 + 3.5 + 2.5 + 4.8 + 3.5 + 10.0 = 56.1mm -> 58.0mm safe bound
  const cbeRowCount = juniorCountsRows.length;
  const subjRowCount = activeSubjects.length;
  const totalSummarySectionSpace = 58.0 + (cbeRowCount * 4.2) + (subjRowCount * 3.6);
  const usableBottom = pageHeight - marginBottom; // 198mm

  // Keep entire final summary together (Subject Stats -> CLASS AVERAGE MARKS -> CBE Table -> Individual Learning Areas Table -> Notes).
  // If the complete section cannot fit in remaining space on current page, move to a fresh page.
  if (finalY + totalSummarySectionSpace > usableBottom) {
    doc.addPage();
    finalY = marginTop + 4;
  }

  // --- FOOTER / SUMMARY SECTION (LAST PAGE ONLY) ---
  // Reuse identical canonical subject headers from Page 1 to ensure 100% label consistency
  const summarySubjHeaders = formattedSubjectHeaders;

  const summaryHead = [['LEARNING AREA', ...summarySubjHeaders, 'CLASS AVG']];

  const summaryRowMarks = [
    'AVG. MARKS',
    ...formattedSubjectHeaders.map((code) => {
      const st = subjectStatsMap[code];
      return st && st.isAssessed ? formatTwoDecimalAverage(st.avg) : '';
    }),
    formatTwoDecimalAverage(overallClassAverageNum),
  ];

  const summaryRowPoints = [
    'AVG. POINTS',
    ...formattedSubjectHeaders.map((code) => {
      const st = subjectStatsMap[code];
      return st && st.isAssessed ? st.avgPts.toFixed(2) : '';
    }),
    meanPointsNum.toFixed(2),
  ];

  const summaryRowLevels = [
    'PERFORMANCE LEVEL',
    ...formattedSubjectHeaders.map((code) => {
      const st = subjectStatsMap[code];
      return st && st.isAssessed ? st.gradeCode : '';
    }),
    getGradeForMark(overallClassAverageNum, grades).grade_code || 'ME1',
  ];

  // Align summary table columns with main table
  const summaryColStyles: Record<number, any> = {
    0: { cellWidth: sumMetaW, fontStyle: 'bold', halign: 'left' },
  };
  for (let i = 0; i < numSubjs; i++) {
    summaryColStyles[i + 1] = { cellWidth: availSubjW, halign: 'center' };
  }
  summaryColStyles[numSubjs + 1] = { cellWidth: sumSummaryW, fontStyle: 'bold', halign: 'center' };

  autoTable(doc, {
    startY: finalY,
    margin: { left: marginX, right: marginX },
    head: summaryHead,
    body: [summaryRowMarks, summaryRowPoints, summaryRowLevels],
    theme: 'grid',
    styles: {
      fontSize: 6.2,
      cellPadding: { top: 1.0, bottom: 1.0, left: 0.5, right: 0.5 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      fillColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
      minCellHeight: 4.0,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 6.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 4.5,
    },
    columnStyles: summaryColStyles,
    didParseCell: (d) => {
      // Row 2 is "PERFORMANCE LEVEL": bold text with blue accent for subject codes and class average
      if (d.section === 'body' && d.row.index === 2) {
        d.cell.styles.fontStyle = 'bold';
        if (d.column.index > 0) {
          d.cell.styles.textColor = [0, 85, 204];
        }
      }
    },
  });

  // @ts-ignore
  let summaryY = (doc as any).lastAutoTable.finalY + 3.5;

  // Prominently displayed overall metrics
  const avgTotalObtainedVal = countAssessed > 0 ? totalClassRawObtained / countAssessed : 0;
  const classAvgMarksValStr = avgTotalObtainedVal > 0 ? formatTwoDecimalAverage(avgTotalObtainedVal) : formatTwoDecimalAverage(overallClassAverageNum);
  const outOfText = classCurriculumMax > 0 ? ` (OUT OF ${classCurriculumMax})` : '';
  const prominentText = `CLASS AVERAGE MARKS: ${classAvgMarksValStr}${outOfText}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  doc.text(prominentText, pageWidth / 2, summaryY, { align: 'center' });

  summaryY += 3.5;

  if (juniorCountsRows.length > 0) {
    const cbeTableHeightEstimate = 7.3 + (cbeRowCount * 4.2);
    if (summaryY + Math.max(22.0, cbeTableHeightEstimate) > usableBottom) {
      doc.addPage();
      summaryY = marginTop + 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(0, 0, 0);
    doc.text('CBE PERFORMANCE LEVELS COUNTS', marginX, summaryY, { align: 'left' });
    summaryY += 2.5;

    autoTable(doc, {
      startY: summaryY,
      margin: { left: marginX, right: marginX, top: marginTop, bottom: marginBottom },
      showHead: 'everyPage',
      head: juniorCountsHead,
      body: juniorCountsBody,
      theme: 'grid',
      styles: {
        fontSize: 6.6,
        cellPadding: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.18,
        fillColor: [255, 255, 255],
        halign: 'center',
        valign: 'middle',
        minCellHeight: 4.0,
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 6.6,
        lineColor: [0, 0, 0],
        lineWidth: 0.18,
        halign: 'center',
        valign: 'middle',
        minCellHeight: 4.6,
      },
      columnStyles: juniorCountsColStyles,
      didParseCell: (d) => {
        if (d.section === 'body' && juniorCountsRows[d.row.index]?.isGeneralClass) {
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // @ts-ignore
    summaryY = (doc as any).lastAutoTable.finalY + 3.5;
  } else {
    summaryY += 1.0;
  }

  // --- INDIVIDUAL LEARNING AREAS PERFORMANCE LEVELS COUNT (JUNIOR SCHOOL) ---
  if (activeSubjects.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(0, 0, 0);
    doc.text('INDIVIDUAL LEARNING AREAS PERFORMANCE LEVELS COUNT', marginX, summaryY, { align: 'left' });
    summaryY += 2.5;

    const juniorLearningAreaHead = [
      [
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
        'Entries',
        'Average Marks',
        'Average Points',
        'Subject Performance Level',
      ],
    ];

    const juniorLearningAreaBody: string[][] = activeSubjects.map((sb, idx) => {
      const code = formattedSubjectHeaders[idx] || sb.subject_code;
      const learningAreaName = getFullLearningAreaName(sb, eduLevel);

      let ee1 = 0;
      let ee2 = 0;
      let me1 = 0;
      let me2 = 0;
      let ae1 = 0;
      let ae2 = 0;
      let be1 = 0;
      let be2 = 0;
      let countX = 0;
      let countY = 0;

      targetStudents.forEach((std) => {
        const stdMark = findStudentMarkForExporter(marks, std.id, sb, examId, subjects);
        const evalInfo = evaluateMark(stdMark);

        if (evalInfo.status === 'Normal' && evalInfo.percentage !== null) {
          const gr = getGradeForMark(evalInfo.percentage, grades);
          const gradeCode = gr.grade_code || '';
          switch (gradeCode) {
            case 'EE1': ee1++; break;
            case 'EE2': ee2++; break;
            case 'ME1': me1++; break;
            case 'ME2': me2++; break;
            case 'AE1': ae1++; break;
            case 'AE2': ae2++; break;
            case 'BE1': be1++; break;
            case 'BE2': be2++; break;
          }
        } else if (evalInfo.status === 'X') {
          countX++;
        } else if (evalInfo.status === 'Y') {
          countY++;
        }
        // Note: status === 'Blank' is not counted in EE1-BE2, X, or Y per mandatory rule
      });

      const st = subjectStatsMap[code];
      const avgMarksStr = st && st.isAssessed ? formatTwoDecimalAverage(st.avg) : '-';
      const avgPointsStr = st && st.isAssessed ? st.avgPts.toFixed(2) : '-';
      const subjectPerfLevelStr = st && st.isAssessed ? (st.gradeCode || 'ME1') : '-';

      return [
        learningAreaName,
        String(ee1),
        String(ee2),
        String(me1),
        String(me2),
        String(ae1),
        String(ae2),
        String(be1),
        String(be2),
        String(countX),
        String(countY),
        String(targetStudents.length), // Entries
        avgMarksStr,
        avgPointsStr,
        subjectPerfLevelStr,
      ];
    });

    const juniorLearningAreaColStyles: Record<number, any> = {
      0: { cellWidth: 42, halign: 'left', cellPadding: { top: 0.65, bottom: 0.65, left: 1.5, right: 0.8 }, fontStyle: 'bold' },
      1: { cellWidth: 13, halign: 'center' },
      2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 13, halign: 'center' },
      4: { cellWidth: 13, halign: 'center' },
      5: { cellWidth: 13, halign: 'center' },
      6: { cellWidth: 13, halign: 'center' },
      7: { cellWidth: 13, halign: 'center' },
      8: { cellWidth: 13, halign: 'center' },
      9: { cellWidth: 12, halign: 'center' },
      10: { cellWidth: 12, halign: 'center' },
      11: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      12: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      13: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      14: { cellWidth: 37, halign: 'center' },
    };

    autoTable(doc, {
      startY: summaryY,
      margin: { left: marginX, right: marginX, top: marginTop, bottom: marginBottom },
      showHead: 'everyPage',
      head: juniorLearningAreaHead,
      body: juniorLearningAreaBody,
      theme: 'grid',
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
      columnStyles: juniorLearningAreaColStyles,
      didParseCell: (d) => {
        if (d.section === 'body') {
          if (d.column.index === 9 || d.column.index === 10) {
            if (d.cell.raw !== '0') {
              d.cell.styles.textColor = [220, 38, 38];
              d.cell.styles.fontStyle = 'bold';
            } else {
              d.cell.styles.textColor = [0, 0, 0];
              d.cell.styles.fontStyle = 'normal';
            }
          }
          if (d.column.index === 14) {
            if (d.cell.raw !== '-') {
              d.cell.styles.textColor = [0, 85, 204];
              d.cell.styles.fontStyle = 'bold';
            } else {
              d.cell.styles.textColor = [0, 0, 0];
              d.cell.styles.fontStyle = 'normal';
            }
          }
        }
      },
    });

    // @ts-ignore
    summaryY = (doc as any).lastAutoTable.finalY + 3.5;
  }

  // Safety check: ensure notes fit before footer boundary (only triggers if stream count was extraordinary)
  const notesHeight = selectedStreamId !== 'all' ? 10.0 : 7.0;
  if (summaryY + notesHeight > usableBottom) {
    doc.addPage();
    summaryY = marginTop + 4;
  }

  // Calculation Notes
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text('• Learner position is assigned using Total Marks', marginX + 4, summaryY);
  if (selectedStreamId !== 'all') {
    summaryY += 3.5;
    const rankedStreamCount = results.filter((r) => r.is_complete !== false && (r.class_position ? r.class_position > 0 : r.position > 0)).length;
    const rankedOverallCount = allCohortResults.filter((r) => r.is_complete !== false && r.position > 0).length;
    doc.text(
      `• STR. POS is rank within stream (${rankedStreamCount} ranked of ${totalLearners} learners); OVR POS is rank within general class (${rankedOverallCount} ranked of ${classCohortStudents.length} learners)`,
      marginX + 4,
      summaryY
    );
  }
  summaryY += 3.5;
  doc.text('• Learner performance level is calculated using Average Marks', marginX + 4, summaryY);

  // Footer & Page Numbers on ALL pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 5;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.line(marginX, footerY - 2.5, marginX + contentWidth, footerY - 2.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Report generated on: ${dateStr} at ${timeStr}  Page ${i}/${totalPages}`,
      marginX + contentWidth,
      footerY,
      { align: 'right' }
    );
  }

  // Save PDF file
  const fileName = `CBE_Merit_List_${streamNameStr.replace(/\s+/g, '_')}_${(getDisplayExamName(exam?.exam_name) || 'Exam').replace(/\s+/g, '_')}.pdf`;
  await savePdf(doc, fileName);
}

// --- 1B. GENERATE PRE-PRIMARY, LOWER & UPPER PRIMARY MERIT LIST PDF ---
async function generatePrimaryMeritListPDF(data: MeritListData, eduLevel: 'Pre-Primary' | 'Lower Primary' | 'Upper Primary'): Promise<void> {
  const {
    school,
    exam,
    selectedClassId,
    selectedStreamId = 'all',
    classes = [],
    teachers = [],
    students = [],
    subjects = [],
    marks = [],
    grades = [],
  } = data;

  const examId = exam?.id || '';
  const targetStudents = getFilteredStudents(students, classes, selectedClassId, selectedStreamId, exam);
  const streamNameStr = getClassStreamLabel(classes, selectedClassId, selectedStreamId);

  const firstTargetStudent = targetStudents[0];
  const firstHistCtx = firstTargetStudent && exam ? getLearnerClassAtExamTime(firstTargetStudent, exam, classes) : null;
  const targetClass = classes.find(
    (c) => c.id === (selectedClassId !== 'all' ? selectedClassId : (firstHistCtx?.class_id || firstTargetStudent?.class_id))
  );
  const targetGrade = targetClass?.class_name || firstHistCtx?.class_name || firstHistCtx?.grade || firstTargetStudent?.grade || (eduLevel === 'Pre-Primary' ? 'PP1' : eduLevel === 'Lower Primary' ? 'Grade 2' : 'Grade 5');

  const sortPrimarySubjects = (subjs: Subject[]) => {
    if (eduLevel === 'Pre-Primary') {
      const ppOrderMap: Record<string, number> = {
        'PP-MATH': 1,
        'PP-PCA': 2,
        'PP-CRE': 3,
        'PP-ENV': 4,
        'PP-LANG': 5,
      };
      return [...subjs].sort((a, b) => {
        const cA = (a.subject_code || '').toUpperCase().trim();
        const cB = (b.subject_code || '').toUpperCase().trim();
        const posA = ppOrderMap[cA] ?? 99;
        const posB = ppOrderMap[cB] ?? 99;
        if (posA !== posB) return posA - posB;
        return (a.subject_name || '').localeCompare(b.subject_name || '');
      });
    }
    return sortSubjectsByStandardOrder(subjs);
  };

  const rawActiveSubjects = targetClass ? getLearnerReportSubjects(firstTargetStudent || {} as any, targetClass, subjects, teachers || []) : [];
  let activeSubjects = sortPrimarySubjects(rawActiveSubjects);

  if (activeSubjects.length === 0) {
    const fallbackSubjects = getApplicableSubjectsForGrade(targetGrade, subjects);
    activeSubjects = sortPrimarySubjects(fallbackSubjects);
  }

  // Full general class cohort (all streams belonging to this grade/class level)
  const classCohortStudents = getClassCohortStudents(students, classes, selectedClassId, targetGrade, exam, targetStudents);

  // Calculate authoritative results across the entire general class cohort
  const allCohortResults = calculateExamResults(examId, classCohortStudents, marks, grades, classes, activeSubjects, exam);
  populateComparisonResults(allCohortResults, data.comparisonExamId, students, marks, grades, classes, subjects, data.exams);

  // When filtering by a specific stream, select only the target stream's results
  const targetStudentIdSet = new Set(targetStudents.map((s) => s.id));
  const results = selectedStreamId !== 'all'
    ? allCohortResults.filter((r) => targetStudentIdSet.has(r.student_id))
    : allCohortResults;

  const validation = validateCalculationData(results, marks, grades, activeSubjects);
  if (!validation.isValid) {
    console.error('Calculation Validation Errors:', validation.errors);
    throw new Error(`Calculation Engine Validation Failed:\n${validation.errors.join('\n')}`);
  }

  // Sort learners for display by authoritative position ascending (complete learners first), with total_marks descending as fallback
  results.sort((a, b) => (a.position || 999) - (b.position || 999) || (b.total_marks || 0) - (a.total_marks || 0));

  const isStandalone = exam?.assessment_structure === 'Standalone';
  if (isStandalone) {
    activeSubjects = activeSubjects.filter((s) => {
      const code = (s.subject_code || '').toUpperCase();
      const name = (s.subject_name || '').toUpperCase();
      return code !== 'COMP' && !name.includes('COMPOSITION') && code !== 'INSHA' && !name.includes('INSHA') && !isDirectSSCRE(s);
    });
  }

  const partition = getUpperPrimaryMeritListSubjectPartition({
    activeSubjects,
    subjects,
    exam,
    targetClass,
    eduLevel,
    targetGrade,
    isStandalone,
    marks,
  });

  const isUpperPrimary = partition.isUpperPrimary;
  const isAgnIncluded = partition.isAgnIncluded;
  const engLangSubj = partition.engLangSubj;
  const engCompSubj = partition.engCompSubj;
  const kiswLughaSubj = partition.kiswLughaSubj;
  const kiswInshaSubj = partition.kiswInshaSubj;
  const sstSubj = partition.sstSubj;
  const creSubj = partition.creSubj;
  const directSsCreSubj = partition.directSsCreSubj;

  const hasUpperPrimaryEng = partition.hasUpperPrimaryEng;
  const hasUpperPrimaryKisw = partition.hasUpperPrimaryKisw;
  const hasUpperPrimarySsCre = partition.hasUpperPrimarySsCre;
  const otherUpperPrimarySubjects = partition.otherUpperPrimarySubjects;

  const subjectHeaders = activeSubjects.map((sb) => {
    if (eduLevel === 'Pre-Primary' || eduLevel === 'Lower Primary') {
      return (sb.subject_code || '').toUpperCase().trim();
    }
    return getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel);
  });

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 7;
  const contentWidth = pageWidth - marginX * 2; // 283mm

  // Base64 Logo fetch (processed once per PDF export)
  const base64Logo = school.logo_url ? await getBase64ImageFromUrl(school.logo_url) : null;

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  // Build tableHead for autoTable (1-tier or 2-tier for Upper Primary)
  let tableHead: any[][];
  let tableHeadTitles: string[] = [];
  let displaySubjColsCount = activeSubjects.length;

  if (isUpperPrimary) {
    displaySubjColsCount = (hasUpperPrimaryEng ? 3 : 0) + (hasUpperPrimaryKisw ? 3 : 0) + otherUpperPrimarySubjects.length + (hasUpperPrimarySsCre ? 3 : 0);

    const row1: any[] = [
      { content: 'S.NO', rowSpan: 2 },
      { content: 'ADM NO', rowSpan: 2 },
      { content: 'LEARNER NAME', rowSpan: 2 },
      { content: 'STREAM', rowSpan: 2 },
      { content: 'STR. POS.', rowSpan: 2 },
      { content: 'OVR POS', rowSpan: 2 },
      { content: 'PRV STR POS', rowSpan: 2 },
      { content: 'PRV OVR POS', rowSpan: 2 },
    ];

    if (hasUpperPrimaryEng) {
      row1.push({ content: 'ENGLISH', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } });
    }
    if (hasUpperPrimaryKisw) {
      row1.push({ content: 'KISWAHILI', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } });
    }
    otherUpperPrimarySubjects.forEach((sb) => {
      row1.push({ content: getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel), rowSpan: 2 });
    });
    if (hasUpperPrimarySsCre) {
      row1.push({ content: 'SS&CRE', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } });
    }

    row1.push(
      { content: 'TOTAL MARKS', rowSpan: 2 },
      { content: 'AVG MARKS', rowSpan: 2 },
      { content: 'TOTAL PTS', rowSpan: 2 },
      { content: 'AVG PTS', rowSpan: 2 },
      { content: 'CBE LEVEL', rowSpan: 2 }
    );

    const row2: any[] = [];
    if (hasUpperPrimaryEng) {
      row2.push('ENG', 'COMP', '%');
    }
    if (hasUpperPrimaryKisw) {
      row2.push('KISW', 'INSHA', '%');
    }
    if (hasUpperPrimarySsCre) {
      row2.push('SST', 'CRE', '%');
    }

    tableHead = [row1, row2];

    tableHeadTitles = [
      'S.NO',
      'ADM NO',
      'LEARNER NAME',
      'STREAM',
      'STR. POS.',
      'OVR POS',
      'PRV STR POS',
      'PRV OVR POS',
      ...(hasUpperPrimaryEng ? ['ENG', 'COMP', '%'] : []),
      ...(hasUpperPrimaryKisw ? ['KISW', 'INSHA', '%'] : []),
      ...otherUpperPrimarySubjects.map((s) => getMeritListDisplayCode(s.subject_code, s.subject_name, eduLevel)),
      ...(hasUpperPrimarySsCre ? ['SST', 'CRE', '%'] : []),
      'TOTAL MARKS',
      'AVG MARKS',
      'TOTAL PTS',
      'AVG PTS',
      'CBE LEVEL',
    ];
  } else {
    tableHeadTitles = [
      'S.NO',
      'ADM NO',
      'LEARNER NAME',
      'STREAM',
      'STR. POS.',
      'OVR POS',
      'PRV STR POS',
      'PRV OVR POS',
      ...subjectHeaders,
      'TOTAL MARKS',
      'AVG MARKS',
      'TOTAL PTS',
      'AVG PTS',
      'CBE LEVEL',
    ];
    tableHead = [tableHeadTitles];
  }

  const tableRows = results.map((r, idx) => {
    const std = targetStudents.find((s) => s.id === r.student_id);
    const histCtx = std && exam ? getLearnerClassAtExamTime(std, exam, classes) : null;
    const cls = classes.find((c) => c.id === (histCtx?.class_id || std?.class_id));
    const streamStr = histCtx
      ? (histCtx.historical_context_resolved ? (histCtx.stream_name || cls?.stream || '-') : '-')
      : (cls?.stream ? cls.stream : '-');
    const isComplete = r.is_complete !== false;
    const overallPos = isComplete && r.position && r.position > 0 ? `${r.position}` : '-';
    const streamRank = isComplete && (r.class_position || r.position) && ((r.class_position || r.position) > 0) ? `${r.class_position || r.position}` : '-';

    const prevOvrPos = (r as any).previous_position != null ? `${(r as any).previous_position}` : '-';
    const prevStrPos = (r as any).previous_class_position != null ? `${(r as any).previous_class_position}` : '-';

    let subjectCells: string[] = [];

    if (isUpperPrimary) {
      const getRawDisplay = (sb?: Subject) => {
        if (!sb) return '-';
        const stdMark = marks.find(
          (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
        );
        const info = evaluateMark(stdMark, { isUpperPrimaryCompOrInsha: true, subject: sb, classObj: cls, educationLevel: eduLevel });
        if (info.status === 'X') return 'X';
        if (info.status === 'Y') return 'Y';
        if (info.status === 'Blank' || info.percentage === null) return '-';
        return `${info.displayScore}`;
      };

      const getCompositePctDisplay = (langSubj?: Subject, compSubj?: Subject) => {
        const m1 = langSubj ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(langSubj.id) && String(m.exam_id) === String(examId)) : null;
        const m2 = compSubj ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(compSubj.id) && String(m.exam_id) === String(examId)) : null;

        const info1 = m1 ? evaluateMark(m1, { isUpperPrimaryCompOrInsha: true, subject: langSubj, classObj: cls, educationLevel: eduLevel }) : null;
        const info2 = m2 ? evaluateMark(m2, { isUpperPrimaryCompOrInsha: true, subject: compSubj, classObj: cls, educationLevel: eduLevel }) : null;

        if (info1?.status === 'X' || info2?.status === 'X') return 'X';
        if (info1?.status === 'Y' || info2?.status === 'Y') return 'Y';

        let sumRaw = 0;
        let hasAny = false;
        const s1 = info1 && info1.status === 'Normal' ? (typeof info1.rawScore === 'number' && !isNaN(info1.rawScore) ? info1.rawScore : Number(info1.displayScore)) : null;
        if (s1 !== null && !isNaN(s1)) {
          sumRaw += s1;
          hasAny = true;
        }
        const s2 = info2 && info2.status === 'Normal' ? (typeof info2.rawScore === 'number' && !isNaN(info2.rawScore) ? info2.rawScore : Number(info2.displayScore)) : null;
        if (s2 !== null && !isNaN(s2)) {
          sumRaw += s2;
          hasAny = true;
        }

        if (!hasAny) return '-';
        const roundedPct = Math.round(sumRaw);
        const gr = getGradeForMark(roundedPct, grades, eduLevel, targetGrade);
        const code = gr.grade_code || gr.performance_level || 'ME';
        return `${roundedPct} ${code}`;
      };

      const getSsCreCompositePctDisplay = (sSub?: Subject, cSub?: Subject) => {
        const m1 = sSub ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sSub.id) && String(m.exam_id) === String(examId)) : null;
        const m2 = cSub ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(cSub.id) && String(m.exam_id) === String(examId)) : null;

        const info1 = m1 ? evaluateMark(m1, { subject: sSub, classObj: cls, educationLevel: eduLevel }) : null;
        const info2 = m2 ? evaluateMark(m2, { subject: cSub, classObj: cls, educationLevel: eduLevel }) : null;

        const valid1 = info1 && (info1.status === 'Normal' || info1.status === 'X' || info1.status === 'Y');
        const valid2 = info2 && (info2.status === 'Normal' || info2.status === 'X' || info2.status === 'Y');

        if (sSub && !valid1) return '-';
        if (cSub && !valid2) return '-';

        if (info1?.status === 'X' && info2?.status === 'X') return 'X';
        if (info1?.status === 'Y' || info2?.status === 'Y') return 'Y';

        const s1 = info1 && info1.status === 'Normal' ? (typeof info1.rawScore === 'number' && !isNaN(info1.rawScore) ? info1.rawScore : Number(info1.displayScore)) : 0;
        const s2 = info2 && info2.status === 'Normal' ? (typeof info2.rawScore === 'number' && !isNaN(info2.rawScore) ? info2.rawScore : Number(info2.displayScore)) : 0;

        const sumRaw = s1 + s2;
        const sstCreMaxes = getSSCREComponentMaxMarks(exam?.ss_cre_structure || 'A') || { sstMax: 30, creMax: 20, ssCreMax: 50 };
        const pct = (sumRaw / sstCreMaxes.ssCreMax) * 100;
        const roundedPct = Math.round(pct);
        const gr = getGradeForMark(roundedPct, grades, eduLevel, targetGrade);
        const code = gr.grade_code || gr.performance_level || 'ME';
        return `${roundedPct} ${code}`;
      };

      if (hasUpperPrimaryEng) {
        subjectCells.push(getRawDisplay(engLangSubj));
        subjectCells.push(getRawDisplay(engCompSubj));
        subjectCells.push(getCompositePctDisplay(engLangSubj, engCompSubj));
      }

      if (hasUpperPrimaryKisw) {
        subjectCells.push(getRawDisplay(kiswLughaSubj));
        subjectCells.push(getRawDisplay(kiswInshaSubj));
        subjectCells.push(getCompositePctDisplay(kiswLughaSubj, kiswInshaSubj));
      }

      otherUpperPrimarySubjects.forEach((sb) => {
        const stdMark = findStudentMarkForExporter(marks, r.student_id, sb, examId, subjects);
        const markInfo = evaluateMark(stdMark, {
          subject: sb,
          classObj: cls,
          educationLevel: eduLevel,
        });
        if (markInfo.status === 'X') {
          subjectCells.push('X');
        } else if (markInfo.status === 'Y') {
          subjectCells.push('Y');
        } else if (markInfo.status === 'Blank' || markInfo.percentage === null) {
          subjectCells.push('-');
        } else {
          const roundedVal = Math.round(markInfo.percentage);
          const gr = getGradeForMark(markInfo.percentage, grades, eduLevel, targetGrade);
          const defaultCode = 'ME';
          subjectCells.push(`${roundedVal} ${gr.grade_code || gr.performance_level || defaultCode}`);
        }
      });

      if (hasUpperPrimarySsCre) {
        subjectCells.push(getRawDisplay(sstSubj));
        subjectCells.push(getRawDisplay(creSubj));
        subjectCells.push(getSsCreCompositePctDisplay(sstSubj, creSubj));
      }
    } else {
      subjectCells = activeSubjects.map((sb) => {
        const stdMark = marks.find(
          (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
        );
        const isCompInsha = isUpperPrimaryCompOrInsha(sb, cls, eduLevel);
        const markInfo = evaluateMark(stdMark, {
          isUpperPrimaryCompOrInsha: isCompInsha,
          subject: sb,
          classObj: cls,
          educationLevel: eduLevel,
        });
        if (markInfo.status === 'X') return 'X';
        if (markInfo.status === 'Y') return 'Y';
        if (markInfo.status === 'Blank' || markInfo.percentage === null) return '-';

        const roundedVal = Math.round(markInfo.percentage);
        const scoreDisplay = isCompInsha ? markInfo.displayScore : roundedVal;
        const gr = getGradeForMark(markInfo.percentage, grades, eduLevel, targetGrade);
        const defaultCode = ((eduLevel as string) === 'Upper Primary' || (eduLevel as string) === 'Lower Primary' || (eduLevel as string) === 'Pre-Primary') ? 'ME' : 'ME1';
        return `${scoreDisplay} ${gr.grade_code || gr.performance_level || defaultCode}`;
      });
    }

    const subEntry = activeSubjects.filter((sb) => {
      const m = marks.find(
        (mk) => String(mk.student_id) === String(r.student_id) && String(mk.subject_id) === String(sb.id) && String(mk.exam_id) === String(examId)
      );
      const info = evaluateMark(m, {
        subject: sb,
        classObj: cls,
        educationLevel: eduLevel,
      });
      return info.status === 'Normal' && info.percentage !== null;
    }).length;

    const isAssessed = subEntry > 0;
    const assessedCnt = isAssessed ? subEntry : 1;
    const avgPtsNum = r.average_points !== undefined && r.average_points !== null && r.average_points > 0
      ? r.average_points
      : (r.total_points / assessedCnt);
    const avgPts = isComplete && isAssessed ? avgPtsNum.toFixed(2) : '-';

    const overallLevelObj = getGradeForMark(r.average, grades, eduLevel, targetGrade);
    const defaultOverallCode = (eduLevel === 'Upper Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Pre-Primary') ? 'ME' : 'ME1';
    const levelCode = overallLevelObj.grade_code || overallLevelObj.performance_level || defaultOverallCode;

    const gradeCode = isComplete
      ? levelCode
      : isAssessed
      ? `Prov (${levelCode})`
      : 'Pending';

    return [
      `${idx + 1}`,
      std?.admission_number || '-',
      (std?.full_name || 'UNKNOWN').toUpperCase(),
      streamStr !== '-' ? streamStr.toUpperCase() : '-',
      streamRank,
      overallPos,
      prevStrPos,
      prevOvrPos,
      ...subjectCells,
      isAssessed ? `${Math.round(r.total_marks)}` : '-',
      isComplete && isAssessed ? formatAverageMark(r.average) : isAssessed ? `${formatAverageMark(r.average)} (P)` : '-',
      isComplete && isAssessed ? `${r.total_points}` : '-',
      avgPts,
      gradeCode,
    ];
  });

  const numSubjs = displaySubjColsCount || 1;
  const sumMetaW = 94; // 7.5 + 12 + 40.5 + 10 + 6 + 6 + 6 + 6 = 94mm (S.NO 7.5mm, ADM 12mm, Name 40.5mm, Stream 10mm, 4 ranks 24mm)
  const sumSummaryW = 54.5; // 10 + 11 + 10 + 9.5 + 14 = 54.5mm (CBE LEVEL allocated 14mm to ensure "Prov (ME)" never wraps)
  const availableSubjWidth = (contentWidth - sumMetaW - sumSummaryW) / numSubjs;

  const columnStyles: Record<number, any> = {
    0: { cellWidth: 7.5, halign: 'center', fontStyle: 'normal' },
    1: { cellWidth: 12, halign: 'center', fontStyle: 'normal' },
    2: { cellWidth: 40.5, halign: 'left', cellPadding: { top: 0.3, bottom: 0.3, left: 1.0, right: 0.6 }, fontStyle: 'normal' },
    3: { cellWidth: 10, halign: 'center', fontStyle: 'normal' },
    4: { cellWidth: 6, halign: 'center', fontStyle: 'normal' },
    5: { cellWidth: 6, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] },
    6: { cellWidth: 6, halign: 'center', fontStyle: 'normal' },
    7: { cellWidth: 6, halign: 'center', fontStyle: 'normal' },
  };

  const startSubjIdx = 8;
  const subjColWidths: number[] = [];

  if (isUpperPrimary) {
    // Determine individual column widths for Upper Primary: compact for raw mark cells, wider for composite % and standard subjects
    // 8.2mm for raw cells ensures COMP and INSHA fit comfortably on a single line without wrapping
    const rawColCount = (hasUpperPrimaryEng ? 2 : 0) + (hasUpperPrimaryKisw ? 2 : 0) + (hasUpperPrimarySsCre ? 2 : 0);
    const wideColCount = (hasUpperPrimaryEng ? 1 : 0) + (hasUpperPrimaryKisw ? 1 : 0) + (hasUpperPrimarySsCre ? 1 : 0) + otherUpperPrimarySubjects.length;

    const rawColWidth = 8.2;
    const totalRawWidth = rawColCount * rawColWidth;
    const totalAvailForWide = Math.max(wideColCount * 12.0, contentWidth - sumMetaW - sumSummaryW - totalRawWidth);
    const wideColWidth = wideColCount > 0 ? totalAvailForWide / wideColCount : 13.5;

    if (hasUpperPrimaryEng) {
      subjColWidths.push(rawColWidth, rawColWidth, wideColWidth);
    }
    if (hasUpperPrimaryKisw) {
      subjColWidths.push(rawColWidth, rawColWidth, wideColWidth);
    }
    otherUpperPrimarySubjects.forEach(() => {
      subjColWidths.push(wideColWidth);
    });
    if (hasUpperPrimarySsCre) {
      subjColWidths.push(rawColWidth, rawColWidth, wideColWidth);
    }

    for (let i = 0; i < numSubjs; i++) {
      columnStyles[startSubjIdx + i] = { cellWidth: subjColWidths[i] || availableSubjWidth, halign: 'center', fontStyle: 'normal' };
    }
  } else {
    for (let i = 0; i < numSubjs; i++) {
      columnStyles[startSubjIdx + i] = { cellWidth: availableSubjWidth, halign: 'center', fontStyle: 'normal' };
    }
  }

  const startSummIdx = startSubjIdx + numSubjs;
  columnStyles[startSummIdx]     = { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };
  columnStyles[startSummIdx + 1] = { cellWidth: 11, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };
  columnStyles[startSummIdx + 2] = { cellWidth: 10, halign: 'center', fontStyle: 'normal' };
  columnStyles[startSummIdx + 3] = { cellWidth: 9.5, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };
  columnStyles[startSummIdx + 4] = { cellWidth: 14, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] };

  const subjectColIndices = Array.from({ length: numSubjs }, (_, k) => startSubjIdx + k);
  const rotatedHeaderIndices = [0, 4, 5, 6, 7, startSummIdx, startSummIdx + 1, startSummIdx + 2, startSummIdx + 3, startSummIdx + 4];

  const teacherInfo = resolveMeritListClassTeachers(
    classes,
    teachers,
    selectedClassId,
    selectedStreamId,
    targetGrade,
    targetStudents
  );

  const renderDocumentHeader = (_pageNo: number) => {
    let textLeft = marginX;

    if (base64Logo) {
      const { dataUrl, width, height } = base64Logo;
      let logoDisplayW = 16;
      let logoDisplayH = 16;
      if (width && height && height > 0) {
        const aspect = width / height;
        if (aspect >= 1) {
          logoDisplayW = 16;
          logoDisplayH = Math.min(16, 16 / aspect);
        } else {
          logoDisplayH = 16;
          logoDisplayW = Math.min(16, 16 * aspect);
        }
      }
      const logoX = marginX;
      const logoY = 6.0 + (16 - logoDisplayH) / 2;
      try {
        doc.addImage(dataUrl, 'PNG', logoX, logoY, logoDisplayW, logoDisplayH);
      } catch (err) {
        console.warn('Failed to embed primary merit list logo:', err);
      }
      textLeft = marginX + logoDisplayW + 4;
    }

    // Line 1: School Name (Emerald Teal)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 135, 103);
    const schoolNameStr = (school.school_name || 'School Name Not Configured').toUpperCase();
    doc.text(schoolNameStr, textLeft, 10);

    // Line 2: Report Title (Black)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text("REPORT: LEARNERS' PERFORMANCE MERIT LIST", textLeft, 15.5);

    const classNameStr = getClassStreamLabel(classes, selectedClassId, selectedStreamId);
    const termStr = String(exam?.term || 'Term 2');
    const yearStr = String(exam?.year || '2026');
    const examNameStr = (getDisplayExamName(exam?.exam_name) || 'MID-TERM ASSESSMENT').toUpperCase();
    const examCodeStr = formatStandardExamCode(targetGrade || classNameStr, exam);

    const streamDisplay =
      classes.find((c) => c.stream_id === selectedStreamId || c.id === selectedStreamId)?.stream ||
      streamNameStr;

    if (!teacherInfo.isAllStreams) {
      // Specific Stream Selected (2 Metadata Lines to prevent overflow beyond page margins)
      // Line 1: Class, Stream, Teacher, Term, Year (at Y = 19.0)
      const metaY1 = 19.0;
      doc.setFontSize(7.5);

      let curX1 = textLeft;
      const itemGap = 4.5;

      const renderItem1 = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, curX1, metaY1);
        curX1 += doc.getTextWidth(label) + 1.0;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 85, 204);
        doc.text(value, curX1, metaY1);
        curX1 += doc.getTextWidth(value) + itemGap;
      };

      renderItem1('CLASS: ', targetGrade);
      renderItem1('STREAM: ', streamDisplay);
      renderItem1('CLASS TEACHER: ', teacherInfo.specificTeacherName || 'NOT ASSIGNED');
      renderItem1('TERM: ', termStr);
      renderItem1('YEAR: ', yearStr);

      // Line 2: Exam Name & Exam Code (at Y = 23.5)
      const metaY2 = 23.5;
      let curX2 = textLeft;

      const renderItem2 = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, curX2, metaY2);
        curX2 += doc.getTextWidth(label) + 1.0;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 85, 204);
        doc.text(value, curX2, metaY2);
        curX2 += doc.getTextWidth(value) + itemGap;
      };

      renderItem2('EXAM NAME: ', examNameStr);
      renderItem2('EXAM CODE: ', examCodeStr);
    } else {
      // All Streams Selected (2 Metadata Lines)
      // Line 1: Basic Exam & Class Metadata (at Y = 19.0)
      const metaY1 = 19.0;
      doc.setFontSize(7.5);

      let curX = textLeft;
      const itemGap = 5.0;

      const renderItem1 = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(label, curX, metaY1);
        curX += doc.getTextWidth(label) + 1.0;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 85, 204);
        doc.text(value, curX, metaY1);
        curX += doc.getTextWidth(value) + itemGap;
      };

      renderItem1('CLASS: ', targetGrade);
      renderItem1('STREAM: ', 'All Streams');
      renderItem1('TERM: ', termStr);
      renderItem1('YEAR: ', yearStr);
      renderItem1('EXAM NAME: ', examNameStr);
      renderItem1('EXAM CODE: ', examCodeStr);

      // Line 2: Stream-Specific Teachers Metadata (at Y = 23.5)
      const metaY2 = 23.5;
      let curX2 = textLeft;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('CLASS TEACHERS: ', curX2, metaY2);
      curX2 += doc.getTextWidth('CLASS TEACHERS: ') + 1.2;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 85, 204);
      doc.text(teacherInfo.summaryText, curX2, metaY2);
    }
  };

  autoTable(doc, {
    startY: 27,
    margin: { left: marginX, right: marginX, top: 12, bottom: 12 },
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    showHead: 'everyPage',
    styles: {
      fontSize: 6.8,
      cellPadding: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      fillColor: [255, 255, 255],
      valign: 'middle',
      halign: 'center',
      minCellHeight: 3.6,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: isUpperPrimary ? 6.2 : (numSubjs > 11 ? Math.max(5.0, 7.0 - (numSubjs - 11) * 0.3) : 7.0),
      cellPadding: { top: 0.25, bottom: 0.25, left: 0.2, right: 0.2 },
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      halign: 'center',
      valign: 'middle',
      minCellHeight: isUpperPrimary ? 9 : 18,
    },
    columnStyles: columnStyles,
    didDrawPage: (d) => {
      if (d.pageNumber === 1) {
        renderDocumentHeader(d.pageNumber);
      }
    },
    willDrawCell: (d) => {
      if (d.section === 'head' && d.row.index === 0 && rotatedHeaderIndices.includes(d.column.index)) {
        d.cell.text = [];
      }
      if (d.section === 'body' && subjectColIndices.includes(d.column.index)) {
        d.cell.text = [];
      }
    },
    didDrawCell: (d) => {
      // 1. Render Rotated Header Titles for position & summary columns (90 degrees counter-clockwise)
      if (d.section === 'head' && d.row.index === 0 && rotatedHeaderIndices.includes(d.column.index)) {
        const cell = d.cell;
        const title = tableHeadTitles[d.column.index];
        if (title) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(0, 0, 0);
          const x = cell.x + cell.width / 2 + 1.1;
          const y = cell.y + cell.height - 1.8;
          doc.text(title, x, y, { angle: 90 });
        }
      }

      // 2. Render Single-Line Subject Cells: "MARK CBE_LEVEL" or "RAW_MARK"
      if (d.section === 'body' && subjectColIndices.includes(d.column.index)) {
        const cell = d.cell;
        const rowData = tableRows[d.row.index];
        if (!rowData) return;
        const rawVal = String(rowData[d.column.index] || '').trim();
        const centerX = cell.x + cell.width / 2;
        const centerY = cell.y + cell.height / 2;

        if (!rawVal) {
          return;
        }

        if (rawVal.includes(' ')) {
          const spaceIdx = rawVal.indexOf(' ');
          const markStr = rawVal.substring(0, spaceIdx);
          const gradeCodeStr = rawVal.substring(spaceIdx + 1);

          let subjFontSize = 7.2;
          if (availableSubjWidth < 10) {
            subjFontSize = Math.min(7.2, Math.max(4.2, (availableSubjWidth - 0.4) / 1.15));
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(subjFontSize);

          let markW = doc.getTextWidth(markStr);
          let spaceW = doc.getTextWidth(' ');
          let gradeW = doc.getTextWidth(gradeCodeStr);
          let totalW = markW + spaceW + gradeW;

          if (totalW > cell.width - 0.4 && totalW > 0) {
            subjFontSize = Math.max(3.8, subjFontSize * ((cell.width - 0.4) / totalW));
            doc.setFontSize(subjFontSize);
            markW = doc.getTextWidth(markStr);
            spaceW = doc.getTextWidth(' ');
            gradeW = doc.getTextWidth(gradeCodeStr);
            totalW = markW + spaceW + gradeW;
          }

          const startX = centerX - totalW / 2;
          const yPos = centerY + 0.65;

          // Mark in normal font weight black
          doc.setTextColor(0, 0, 0);
          doc.text(markStr, startX, yPos);

          // Grade code in normal font weight blue
          if (gradeCodeStr && gradeCodeStr !== '-') {
            doc.setTextColor(0, 85, 204);
            doc.text(gradeCodeStr, startX + markW + spaceW, yPos);
          } else if (gradeCodeStr === '-') {
            doc.setTextColor(140, 140, 140);
            doc.text('-', startX + markW + spaceW, yPos);
          }
        } else {
          let subjFontSize = 7.2;
          if (availableSubjWidth < 10) {
            subjFontSize = Math.min(7.2, Math.max(4.2, (availableSubjWidth - 0.4) / 1.15));
          }
          if (rawVal === 'X' || rawVal === 'Y') {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(220, 38, 38);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
          }
          doc.setFontSize(subjFontSize);
          let textW = doc.getTextWidth(rawVal);
          if (textW > cell.width - 0.4 && textW > 0) {
            subjFontSize = Math.max(3.8, subjFontSize * ((cell.width - 0.4) / textW));
            doc.setFontSize(subjFontSize);
          }
          doc.text(rawVal, centerX, centerY + 0.65, { align: 'center' });
        }
      }
    },
  });

  // =========================================================================
  // --- FOOTER / SUMMARY SECTION (LAST PAGE ONLY) ---
  // =========================================================================

  // 1. Calculations & Metrics for End-of-Report Sections
  const assessedResults = results.filter((r) => {
    const stdMarks = marks.filter((m) => String(m.student_id) === String(r.student_id) && String(m.exam_id) === String(examId));
    return stdMarks.some((m) => {
      const info = evaluateMark(m);
      return info.status === 'Normal' && info.percentage !== null;
    });
  });

  const assessedStudentIds = new Set(assessedResults.map((r) => r.student_id));
  const countAssessed = assessedResults.length;

  // Class Mean Mark = average percentage score across assessed learners ONLY
  const totalStudentAverages = assessedResults.reduce((acc, r) => acc + r.average, 0);
  const overallClassAverageNum = countAssessed > 0 ? totalStudentAverages / countAssessed : 0;

  // Class Average (Marks) = sum of total marks obtained by all assessed learners ÷ number of assessed learners
  const totalAssessedMarksSum = assessedResults.reduce((acc, r) => acc + (r.total_marks || 0), 0);

  // Mean Points = average points across assessed learners ONLY
  const totalStudentAvgPoints = assessedResults.reduce(
    (acc, r) => acc + (r.average_points !== undefined && r.average_points !== null && r.average_points > 0 ? r.average_points : (r.subject_count > 0 ? r.total_points / r.subject_count : 0)),
    0
  );
  const meanPointsNum = countAssessed > 0 ? totalStudentAvgPoints / countAssessed : 0;

  // Summary Table Configuration & Stats for Footer
  let summarySubjHeaders: string[] = [];
  let summaryMarksList: string[] = [];
  let summaryPointsList: string[] = [];
  let summaryLevelsList: string[] = [];

  if (isUpperPrimary) {
    // English raw and composite stats
    let engLangAvgStr = '';
    let engCompAvgStr = '';
    let engPctAvgStr = '';
    let engPtsOnlyStr = '';
    let engLevelCodeStr = '';

    if (hasUpperPrimaryEng) {
      if (engLangSubj) {
        const vMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(engLangSubj.id) && assessedStudentIds.has(m.student_id))
          .map((m) => evaluateMark(m, { isUpperPrimaryCompOrInsha: true, subject: engLangSubj, educationLevel: eduLevel }))
          .filter((i) => i.status === 'Normal')
          .map((i) => typeof i.rawScore === 'number' && !isNaN(i.rawScore) ? i.rawScore : Number(i.displayScore))
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vMarks.length > 0) {
          const avg = vMarks.reduce((acc, v) => acc + v, 0) / vMarks.length;
          engLangAvgStr = formatTwoDecimalAverage(avg);
        }
      }
      if (engCompSubj) {
        const vMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(engCompSubj.id) && assessedStudentIds.has(m.student_id))
          .map((m) => evaluateMark(m, { isUpperPrimaryCompOrInsha: true, subject: engCompSubj, educationLevel: eduLevel }))
          .filter((i) => i.status === 'Normal')
          .map((i) => typeof i.rawScore === 'number' && !isNaN(i.rawScore) ? i.rawScore : Number(i.displayScore))
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vMarks.length > 0) {
          const avg = vMarks.reduce((acc, v) => acc + v, 0) / vMarks.length;
          engCompAvgStr = formatTwoDecimalAverage(avg);
        }
      }
      // English Composite
      const validLearnersEng = assessedResults.map((r) => {
        const m1 = engLangSubj ? marks.find((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(engLangSubj.id) && String(m.student_id) === String(r.student_id)) : null;
        const m2 = engCompSubj ? marks.find((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(engCompSubj.id) && String(m.student_id) === String(r.student_id)) : null;
        const i1 = m1 ? evaluateMark(m1, { isUpperPrimaryCompOrInsha: true, subject: engLangSubj, educationLevel: eduLevel }) : null;
        const i2 = m2 ? evaluateMark(m2, { isUpperPrimaryCompOrInsha: true, subject: engCompSubj, educationLevel: eduLevel }) : null;
        let sum = 0;
        let hasAny = false;
        const s1 = i1 && i1.status === 'Normal' ? (typeof i1.rawScore === 'number' && !isNaN(i1.rawScore) ? i1.rawScore : Number(i1.displayScore)) : null;
        if (s1 !== null && !isNaN(s1)) { sum += s1; hasAny = true; }
        const s2 = i2 && i2.status === 'Normal' ? (typeof i2.rawScore === 'number' && !isNaN(i2.rawScore) ? i2.rawScore : Number(i2.displayScore)) : null;
        if (s2 !== null && !isNaN(s2)) { sum += s2; hasAny = true; }
        return hasAny ? sum : null;
      }).filter((s): s is number => s !== null);

      if (validLearnersEng.length > 0) {
        const avg = validLearnersEng.reduce((a, b) => a + b, 0) / validLearnersEng.length;
        engPctAvgStr = formatTwoDecimalAverage(avg);
        const gr = getGradeForMark(avg, grades, eduLevel, targetGrade);
        const ptsSum = validLearnersEng.reduce((acc, pct) => {
          const g = getGradeForMark(pct, grades, eduLevel, targetGrade);
          return acc + g.points;
        }, 0);
        const avgPts = ptsSum / validLearnersEng.length;
        engPtsOnlyStr = avgPts.toFixed(2);
        engLevelCodeStr = gr.grade_code || gr.performance_level || 'ME';
      }
    }

    // Kiswahili raw and composite stats
    let kiswLughaAvgStr = '';
    let kiswInshaAvgStr = '';
    let kiswPctAvgStr = '';
    let kiswPtsOnlyStr = '';
    let kiswLevelCodeStr = '';

    if (hasUpperPrimaryKisw) {
      if (kiswLughaSubj) {
        const vMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(kiswLughaSubj.id) && assessedStudentIds.has(m.student_id))
          .map((m) => evaluateMark(m, { isUpperPrimaryCompOrInsha: true, subject: kiswLughaSubj, educationLevel: eduLevel }))
          .filter((i) => i.status === 'Normal')
          .map((i) => typeof i.rawScore === 'number' && !isNaN(i.rawScore) ? i.rawScore : Number(i.displayScore))
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vMarks.length > 0) {
          const avg = vMarks.reduce((acc, v) => acc + v, 0) / vMarks.length;
          kiswLughaAvgStr = formatTwoDecimalAverage(avg);
        }
      }
      if (kiswInshaSubj) {
        const vMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(kiswInshaSubj.id) && assessedStudentIds.has(m.student_id))
          .map((m) => evaluateMark(m, { isUpperPrimaryCompOrInsha: true, subject: kiswInshaSubj, educationLevel: eduLevel }))
          .filter((i) => i.status === 'Normal')
          .map((i) => typeof i.rawScore === 'number' && !isNaN(i.rawScore) ? i.rawScore : Number(i.displayScore))
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vMarks.length > 0) {
          const avg = vMarks.reduce((acc, v) => acc + v, 0) / vMarks.length;
          kiswInshaAvgStr = formatTwoDecimalAverage(avg);
        }
      }
      // Kiswahili Composite
      const validLearnersKisw = assessedResults.map((r) => {
        const m1 = kiswLughaSubj ? marks.find((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(kiswLughaSubj.id) && String(m.student_id) === String(r.student_id)) : null;
        const m2 = kiswInshaSubj ? marks.find((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(kiswInshaSubj.id) && String(m.student_id) === String(r.student_id)) : null;
        const i1 = m1 ? evaluateMark(m1, { isUpperPrimaryCompOrInsha: true, subject: kiswLughaSubj, educationLevel: eduLevel }) : null;
        const i2 = m2 ? evaluateMark(m2, { isUpperPrimaryCompOrInsha: true, subject: kiswInshaSubj, educationLevel: eduLevel }) : null;
        let sum = 0;
        let hasAny = false;
        const s1 = i1 && i1.status === 'Normal' ? (typeof i1.rawScore === 'number' && !isNaN(i1.rawScore) ? i1.rawScore : Number(i1.displayScore)) : null;
        if (s1 !== null && !isNaN(s1)) { sum += s1; hasAny = true; }
        const s2 = i2 && i2.status === 'Normal' ? (typeof i2.rawScore === 'number' && !isNaN(i2.rawScore) ? i2.rawScore : Number(i2.displayScore)) : null;
        if (s2 !== null && !isNaN(s2)) { sum += s2; hasAny = true; }
        return hasAny ? sum : null;
      }).filter((s): s is number => s !== null);

      if (validLearnersKisw.length > 0) {
        const avg = validLearnersKisw.reduce((a, b) => a + b, 0) / validLearnersKisw.length;
        kiswPctAvgStr = formatTwoDecimalAverage(avg);
        const gr = getGradeForMark(avg, grades, eduLevel, targetGrade);
        const ptsSum = validLearnersKisw.reduce((acc, pct) => {
          const g = getGradeForMark(pct, grades, eduLevel, targetGrade);
          return acc + g.points;
        }, 0);
        const avgPts = ptsSum / validLearnersKisw.length;
        kiswPtsOnlyStr = avgPts.toFixed(2);
        kiswLevelCodeStr = gr.grade_code || gr.performance_level || 'ME';
      }
    }

    summarySubjHeaders = [
      ...(hasUpperPrimaryEng ? ['ENG', 'COMP', 'ENG %'] : []),
      ...(hasUpperPrimaryKisw ? ['KISW', 'INSHA', 'KISW %'] : []),
      ...otherUpperPrimarySubjects.map((s) => getMeritListDisplayCode(s.subject_code, s.subject_name, eduLevel)),
      ...(hasUpperPrimarySsCre ? ['SST', 'CRE', 'SS&CRE %'] : []),
    ];

    // SS&CRE raw and composite stats
    let sstAvgStr = '';
    let creAvgStr = '';
    let ssCrePctAvgStr = '';
    let ssCrePtsOnlyStr = '';
    let ssCreLevelCodeStr = '';

    if (hasUpperPrimarySsCre) {
      if (sstSubj) {
        const vMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(sstSubj.id) && assessedStudentIds.has(m.student_id))
          .map((m) => evaluateMark(m, { subject: sstSubj, educationLevel: eduLevel }))
          .filter((i) => i.status === 'Normal')
          .map((i) => typeof i.rawScore === 'number' && !isNaN(i.rawScore) ? i.rawScore : Number(i.displayScore))
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vMarks.length > 0) {
          const avg = vMarks.reduce((acc, v) => acc + v, 0) / vMarks.length;
          sstAvgStr = formatTwoDecimalAverage(avg);
        }
      }
      if (creSubj) {
        const vMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(creSubj.id) && assessedStudentIds.has(m.student_id))
          .map((m) => evaluateMark(m, { subject: creSubj, educationLevel: eduLevel }))
          .filter((i) => i.status === 'Normal')
          .map((i) => typeof i.rawScore === 'number' && !isNaN(i.rawScore) ? i.rawScore : Number(i.displayScore))
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vMarks.length > 0) {
          const avg = vMarks.reduce((acc, v) => acc + v, 0) / vMarks.length;
          creAvgStr = formatTwoDecimalAverage(avg);
        }
      }
      // SS&CRE Composite Stat
      const sstCreMaxes = exam?.ss_cre_structure ? (getSSCREComponentMaxMarks(exam.ss_cre_structure) || { sstMax: 30, creMax: 20, ssCreMax: 50 }) : { sstMax: 30, creMax: 20, ssCreMax: 50 };
      const validLearnersSsCre = assessedResults.map((r) => {
        const m1 = sstSubj ? marks.find((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(sstSubj.id) && String(m.student_id) === String(r.student_id)) : null;
        const m2 = creSubj ? marks.find((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(creSubj.id) && String(m.student_id) === String(r.student_id)) : null;
        const i1 = m1 ? evaluateMark(m1, { subject: sstSubj, educationLevel: eduLevel }) : null;
        const i2 = m2 ? evaluateMark(m2, { subject: creSubj, educationLevel: eduLevel }) : null;
        let sum = 0;
        let hasAny = false;
        const s1 = i1 && i1.status === 'Normal' ? (typeof i1.rawScore === 'number' && !isNaN(i1.rawScore) ? i1.rawScore : Number(i1.displayScore)) : null;
        if (s1 !== null && !isNaN(s1)) { sum += s1; hasAny = true; }
        const s2 = i2 && i2.status === 'Normal' ? (typeof i2.rawScore === 'number' && !isNaN(i2.rawScore) ? i2.rawScore : Number(i2.displayScore)) : null;
        if (s2 !== null && !isNaN(s2)) { sum += s2; hasAny = true; }
        return hasAny ? (sum / sstCreMaxes.ssCreMax) * 100 : null;
      }).filter((s): s is number => s !== null);

      if (validLearnersSsCre.length > 0) {
        const avg = validLearnersSsCre.reduce((a, b) => a + b, 0) / validLearnersSsCre.length;
        ssCrePctAvgStr = formatTwoDecimalAverage(avg);
        const gr = getGradeForMark(avg, grades, eduLevel, targetGrade);
        const ptsSum = validLearnersSsCre.reduce((acc, pct) => {
          const g = getGradeForMark(pct, grades, eduLevel, targetGrade);
          return acc + g.points;
        }, 0);
        const avgPts = ptsSum / validLearnersSsCre.length;
        ssCrePtsOnlyStr = avgPts.toFixed(2);
        ssCreLevelCodeStr = gr.grade_code || gr.performance_level || 'ME';
      }
    }

    summaryMarksList = [
      ...(hasUpperPrimaryEng ? [engLangAvgStr, engCompAvgStr, engPctAvgStr] : []),
      ...(hasUpperPrimaryKisw ? [kiswLughaAvgStr, kiswInshaAvgStr, kiswPctAvgStr] : []),
      ...otherUpperPrimarySubjects.map((sb) => {
        const isSbDirectSsCre = isDirectSSCRE(sb);
        const subjMarks = marks.filter(
          (m) =>
            String(m.exam_id) === String(examId) &&
            (String(m.subject_id) === String(sb.id) ||
              (isSbDirectSsCre &&
                (isDirectSSCRE({ id: m.subject_id }) ||
                  subjects.some((s) => s.id === m.subject_id && isDirectSSCRE(s)))))
        );
        const validSubjMarks = subjMarks
          .filter((m) => assessedStudentIds.has(m.student_id))
          .map((m) => ({ student_id: m.student_id, info: evaluateMark(m) }))
          .filter((item) => item.info.status === 'Normal' && item.info.percentage !== null);
        if (validSubjMarks.length > 0) {
          const avg = validSubjMarks.reduce((acc, item) => acc + item.info.percentage!, 0) / validSubjMarks.length;
          return formatTwoDecimalAverage(avg);
        }
        return '';
      }),
      ...(hasUpperPrimarySsCre ? [sstAvgStr, creAvgStr, ssCrePctAvgStr] : []),
    ];

    summaryPointsList = [
      ...(hasUpperPrimaryEng ? ['', '', engPtsOnlyStr] : []),
      ...(hasUpperPrimaryKisw ? ['', '', kiswPtsOnlyStr] : []),
      ...otherUpperPrimarySubjects.map((sb) => {
        const isSbDirectSsCre = isDirectSSCRE(sb);
        const subjMarks = marks.filter(
          (m) =>
            String(m.exam_id) === String(examId) &&
            (String(m.subject_id) === String(sb.id) ||
              (isSbDirectSsCre &&
                (isDirectSSCRE({ id: m.subject_id }) ||
                  subjects.some((s) => s.id === m.subject_id && isDirectSSCRE(s)))))
        );
        const validSubjMarks = subjMarks
          .filter((m) => assessedStudentIds.has(m.student_id))
          .map((m) => ({ student_id: m.student_id, info: evaluateMark(m) }))
          .filter((item) => item.info.status === 'Normal' && item.info.percentage !== null);
        if (validSubjMarks.length > 0) {
          const count = validSubjMarks.length;
          const avgPct = validSubjMarks.reduce((acc, item) => acc + item.info.percentage!, 0) / count;
          const ptsSum = validSubjMarks.reduce((acc, item) => {
            const g = getGradeForMark(item.info.percentage!, grades, eduLevel, targetGrade);
            return acc + g.points;
          }, 0);
          const avgPts = parseFloat((ptsSum / count).toFixed(2));
          return avgPts.toFixed(2);
        }
        return '';
      }),
      ...(hasUpperPrimarySsCre ? ['', '', ssCrePtsOnlyStr] : []),
    ];

    summaryLevelsList = [
      ...(hasUpperPrimaryEng ? ['', '', engLevelCodeStr] : []),
      ...(hasUpperPrimaryKisw ? ['', '', kiswLevelCodeStr] : []),
      ...otherUpperPrimarySubjects.map((sb) => {
        const isSbDirectSsCre = isDirectSSCRE(sb);
        const subjMarks = marks.filter(
          (m) =>
            String(m.exam_id) === String(examId) &&
            (String(m.subject_id) === String(sb.id) ||
              (isSbDirectSsCre &&
                (isDirectSSCRE({ id: m.subject_id }) ||
                  subjects.some((s) => s.id === m.subject_id && isDirectSSCRE(s)))))
        );
        const validSubjMarks = subjMarks
          .filter((m) => assessedStudentIds.has(m.student_id))
          .map((m) => ({ student_id: m.student_id, info: evaluateMark(m) }))
          .filter((item) => item.info.status === 'Normal' && item.info.percentage !== null);
        if (validSubjMarks.length > 0) {
          const count = validSubjMarks.length;
          const avgPct = validSubjMarks.reduce((acc, item) => acc + item.info.percentage!, 0) / count;
          const gr = getGradeForMark(avgPct, grades, eduLevel, targetGrade);
          return gr.grade_code || gr.performance_level || 'ME';
        }
        return '';
      }),
      ...(hasUpperPrimarySsCre ? ['', '', ssCreLevelCodeStr] : []),
    ];
  } else {
    // Calculate Subject Statistics for Footer Table & track assessed status using evaluateMark
    const subjectStatsMap: Record<string, { avg: number; avgPts: number; gradeCode: string; isAssessed: boolean }> = {};
    activeSubjects.forEach((sb, idx) => {
      const code = subjectHeaders[idx] || sb.subject_code;
      const subjMarks = marks.filter((m) => String(m.exam_id) === String(examId) && String(m.subject_id) === String(sb.id));

      // Filter only normal, valid numerical marks for target assessed students
      const validSubjMarks = subjMarks
        .filter((m) => assessedStudentIds.has(m.student_id))
        .map((m) => ({ student_id: m.student_id, info: evaluateMark(m) }))
        .filter((item) => item.info.status === 'Normal' && item.info.percentage !== null);

      const count = validSubjMarks.length;
      if (count > 0) {
        const sumPct = validSubjMarks.reduce((acc, item) => acc + item.info.percentage!, 0);
        const avgPct = count > 0 ? sumPct / count : 0;
        const gr = getGradeForMark(avgPct, grades, eduLevel, targetGrade);

        const ptsSum = validSubjMarks.reduce((acc, item) => {
          const g = getGradeForMark(item.info.percentage!, grades, eduLevel, targetGrade);
          return acc + g.points;
        }, 0);
        const avgPts = parseFloat((ptsSum / count).toFixed(2));
        const defaultSubjCode = ((eduLevel as string) === 'Upper Primary' || (eduLevel as string) === 'Lower Primary' || (eduLevel as string) === 'Pre-Primary') ? 'ME' : 'ME1';

        subjectStatsMap[code] = {
          avg: avgPct,
          avgPts: avgPts,
          gradeCode: gr.grade_code || gr.performance_level || defaultSubjCode,
          isAssessed: true,
        };
      } else {
        subjectStatsMap[code] = {
          avg: 0,
          avgPts: 0,
          gradeCode: '',
          isAssessed: false,
        };
      }
    });

    // Reuse identical canonical subject headers from Page 1 to ensure 100% label consistency
    summarySubjHeaders = subjectHeaders;

    summaryMarksList = subjectHeaders.map((code) => {
      const st = subjectStatsMap[code];
      return st && st.isAssessed ? formatTwoDecimalAverage(st.avg) : '';
    });

    summaryPointsList = subjectHeaders.map((code) => {
      const st = subjectStatsMap[code];
      return st && st.isAssessed ? st.avgPts.toFixed(2) : '';
    });

    summaryLevelsList = subjectHeaders.map((code) => {
      const st = subjectStatsMap[code];
      return st && st.isAssessed ? st.gradeCode : '';
    });
  }

  // --- CBE LEVEL COUNTS SUMMARY TABLE (PRIMARY SCHOOL) ---
  const isAllStreams =
    !selectedStreamId ||
    selectedStreamId === 'all' ||
    selectedStreamId === 'All Streams';

  const gradeLabel = (targetGrade && targetGrade.trim())
    ? targetGrade.trim().toUpperCase()
    : 'GENERAL CLASS';

  const primaryCountsRows = calculatePrimaryCbeLevelCounts(results, students, classes, exam, {
    includeGeneralClass: isAllStreams,
    generalClassLabel: gradeLabel,
  });

  const primaryCountsHead = [
    [
      'STREAM',
      'EE',
      'ME',
      'AE',
      'BE',
      'PROVISIONAL',
      'PENDING',
      'TOTAL LEARNERS',
    ],
  ];

  const primaryCountsBody = primaryCountsRows.map((row) => [
    row.stream.toUpperCase(),
    String(row.ee),
    String(row.me),
    String(row.ae),
    String(row.be),
    String(row.provisional),
    String(row.pending),
    String(row.totalLearners),
  ]);

  // Proportional column widths matching Primary School printable width (283mm)
  // Stream: 45mm, EE: 32mm, ME: 32mm, AE: 32mm, BE: 32mm, Provisional: 35mm, Pending: 32mm, Total: 43mm = 283mm
  const primaryCountsColStyles: Record<number, any> = {
    0: { cellWidth: 45, halign: 'left', cellPadding: { top: 0.8, bottom: 0.8, left: 2.0, right: 0.8 }, fontStyle: 'bold' },
    1: { cellWidth: 32, halign: 'center' },
    2: { cellWidth: 32, halign: 'center' },
    3: { cellWidth: 32, halign: 'center' },
    4: { cellWidth: 32, halign: 'center' },
    5: { cellWidth: 35, halign: 'center' },
    6: { cellWidth: 32, halign: 'center' },
    7: { cellWidth: 43, halign: 'center', fontStyle: 'bold', textColor: [0, 85, 204] },
  };

  // @ts-ignore
  let finalY = (doc as any).lastAutoTable.finalY + 4;

  // Space calculation to keep ENTIRE final summary together on the same page:
  // 1. Subject Stats Table (4 rows: Header + AVG. MARKS + AVG. POINTS + PERFORMANCE LEVEL): ~17.5mm
  // 2. Gap to banner: 3.5mm
  // 3. CLASS AVERAGE MARKS Banner: 3.5mm
  // 4. CBE Section Heading: 2.5mm
  // 5. CBE Level Counts Table: header ~4.8mm + (cbeRowCount * 4.2mm)
  // 6. Gap to notes: 3.5mm
  // 7. Notes & breathing room: ~10.0mm
  // Fixed overhead: 17.5 + 3.5 + 3.5 + 2.5 + 4.8 + 3.5 + 10.0 = 45.3mm -> 48.0mm safe bound
  const cbeRowCount = primaryCountsRows.length;
  const totalSummarySectionSpace = 48.0 + (cbeRowCount * 4.2);
  const usableBottom = pageHeight - 12; // 198mm

  // Keep entire final summary together (Subject Stats -> CLASS AVERAGE MARKS -> CBE Table -> Notes).
  // If the complete section cannot fit in remaining space on current page, move the WHOLE section together to a fresh page.
  if (finalY + totalSummarySectionSpace > usableBottom) {
    doc.addPage();
    finalY = 12 + 4;
  }

  const summaryHead = [['LEARNING AREA', ...summarySubjHeaders, 'CLASS AVG']];

  const summaryRowMarks = [
    'AVG. MARKS',
    ...summaryMarksList,
    formatTwoDecimalAverage(overallClassAverageNum),
  ];

  const defaultOverallCode = (eduLevel === 'Upper Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Pre-Primary') ? 'ME' : 'ME1';
  const overallGradeObj = getGradeForMark(overallClassAverageNum, grades, eduLevel, targetGrade);

  const summaryRowPoints = [
    'AVG. POINTS',
    ...summaryPointsList,
    meanPointsNum.toFixed(2),
  ];

  const summaryRowLevels = [
    'PERFORMANCE LEVEL',
    ...summaryLevelsList,
    overallGradeObj.grade_code || overallGradeObj.performance_level || defaultOverallCode,
  ];

  // Align summary table columns with main table
  const summaryColStyles: Record<number, any> = {
    0: { cellWidth: sumMetaW, fontStyle: 'bold', halign: 'left' },
  };
  for (let i = 0; i < numSubjs; i++) {
    summaryColStyles[i + 1] = { cellWidth: (isUpperPrimary && subjColWidths[i]) ? subjColWidths[i] : availableSubjWidth, halign: 'center' };
  }
  summaryColStyles[numSubjs + 1] = { cellWidth: sumSummaryW, fontStyle: 'bold', halign: 'center' };

  autoTable(doc, {
    startY: finalY,
    margin: { left: marginX, right: marginX },
    head: summaryHead,
    body: [summaryRowMarks, summaryRowPoints, summaryRowLevels],
    theme: 'grid',
    styles: {
      fontSize: 6.2,
      cellPadding: { top: 1.0, bottom: 1.0, left: 0.5, right: 0.5 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      fillColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
      minCellHeight: 4.0,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 6.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 4.5,
    },
    columnStyles: summaryColStyles,
    didParseCell: (d) => {
      // Row 2 is "PERFORMANCE LEVEL": bold text with blue accent for subject codes and class average
      if (d.section === 'body' && d.row.index === 2) {
        d.cell.styles.fontStyle = 'bold';
        if (d.column.index > 0) {
          d.cell.styles.textColor = [0, 85, 204];
        }
      }
    },
  });

  // @ts-ignore
  let summaryY = (doc as any).lastAutoTable.finalY + 3.5;

  // Prominently displayed overall metrics
  const avgTotalObtainedVal = countAssessed > 0 ? totalAssessedMarksSum / countAssessed : 0;
  const classAvgMarksValStr = avgTotalObtainedVal > 0 ? formatTwoDecimalAverage(avgTotalObtainedVal) : formatTwoDecimalAverage(overallClassAverageNum);
  const classCurriculumMax = isUpperPrimary
    ? ((hasUpperPrimaryEng ? 1 : 0) + (hasUpperPrimaryKisw ? 1 : 0) + (hasUpperPrimarySsCre ? 1 : 0) + otherUpperPrimarySubjects.length) * 100
    : (activeSubjects.length > 0
        ? activeSubjects.length * 100
        : ((eduLevel as string) === 'junior_school' || (eduLevel as string) === 'Junior School' ? 900 : (eduLevel as string) === 'lower_primary' || (eduLevel as string) === 'Lower Primary' ? 300 : 600));
  const outOfText = classCurriculumMax > 0 ? ` (OUT OF ${classCurriculumMax})` : '';
  const prominentText = `CLASS AVERAGE MARKS: ${classAvgMarksValStr}${outOfText}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  doc.text(prominentText, pageWidth / 2, summaryY, { align: 'center' });

  summaryY += 3.5;

  if (primaryCountsRows.length > 0) {
    const cbeTableHeightEstimate = 7.3 + (cbeRowCount * 4.2);
    if (summaryY + Math.max(22.0, cbeTableHeightEstimate) > usableBottom) {
      doc.addPage();
      summaryY = 12 + 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(0, 0, 0);
    doc.text('CBE PERFORMANCE LEVELS COUNTS', marginX, summaryY, { align: 'left' });
    summaryY += 2.5;

    autoTable(doc, {
      startY: summaryY,
      margin: { left: marginX, right: marginX, top: 12, bottom: 12 },
      showHead: 'everyPage',
      head: primaryCountsHead,
      body: primaryCountsBody,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.18,
        fillColor: [255, 255, 255],
        halign: 'center',
        valign: 'middle',
        minCellHeight: 4.0,
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
        minCellHeight: 4.6,
      },
      columnStyles: primaryCountsColStyles,
      didParseCell: (d) => {
        if (d.section === 'body' && primaryCountsRows[d.row.index]?.isGeneralClass) {
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // @ts-ignore
    summaryY = (doc as any).lastAutoTable.finalY + 3.5;
  } else {
    summaryY += 1.0;
  }

  // Safety check: ensure notes fit before footer boundary (only triggers if stream count was extraordinary)
  const notesHeight = selectedStreamId !== 'all' ? 10.0 : 7.0;
  if (summaryY + notesHeight > usableBottom) {
    doc.addPage();
    summaryY = 12 + 4;
  }

  // Calculation Notes
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text('• Learner position is assigned using Total Marks', marginX + 4, summaryY);
  if (selectedStreamId !== 'all') {
    summaryY += 3.5;
    const rankedStreamCount = results.filter((r) => r.is_complete !== false && (r.class_position ? r.class_position > 0 : r.position > 0)).length;
    const rankedOverallCount = allCohortResults.filter((r) => r.is_complete !== false && r.position > 0).length;
    doc.text(
      `• STR. POS is rank within stream (${rankedStreamCount} ranked of ${targetStudents.length} learners); OVR POS is rank within general class (${rankedOverallCount} ranked of ${classCohortStudents.length} learners)`,
      marginX + 4,
      summaryY
    );
  }
  summaryY += 3.5;
  doc.text('• Learner performance level is calculated using Average Marks', marginX + 4, summaryY);

  // FOOTER & PAGE NUMBERS ON ALL PAGES
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 5;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.line(marginX, footerY - 2.5, marginX + contentWidth, footerY - 2.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Report generated on: ${dateStr} at ${timeStr}    Page ${i}/${totalPages}`,
      marginX + contentWidth,
      footerY,
      { align: 'right' }
    );
  }

  const fileName = `CBC_${eduLevel.replace(/\s+/g, '_')}_Merit_List_${targetGrade.replace(/\s+/g, '_')}_${streamNameStr.replace(/\s+/g, '_')}.pdf`;
  await savePdf(doc, fileName);
}

function currentClassLabel(classes: ClassStream[], classId: string): string {
  if (!classId || classId === 'all') return 'Grade 8';
  const cls = classes.find((c) => c.id === classId);
  return cls ? cls.class_name : 'Grade 8';
}




// --- 2. GENERATE MERIT LIST EXCEL (.xlsx) ---
export async function downloadMeritListExcel(data: MeritListData): Promise<void> {
  const {
    school,
    exam,
    selectedClassId,
    selectedStreamId = 'all',
    classes = [],
    teachers = [],
    students = [],
    subjects = [],
    marks = [],
    grades = [],
    generatedBy = 'Administrator',
  } = data;

  const examId = exam?.id || '';
  const targetStudents = getFilteredStudents(students, classes, selectedClassId, selectedStreamId, exam);
  const streamNameStr = getClassStreamLabel(classes, selectedClassId, selectedStreamId);

  // Determine applicable subjects for target cohort grade
  const firstTargetStudent = targetStudents[0];
  const firstHistCtx = firstTargetStudent && exam ? getLearnerClassAtExamTime(firstTargetStudent, exam, classes) : null;
  const targetClass = classes.find(
    (c) => c.id === (selectedClassId !== 'all' ? selectedClassId : (firstHistCtx?.class_id || firstTargetStudent?.class_id))
  );
  const targetGrade = targetClass?.class_name || firstHistCtx?.class_name || firstHistCtx?.grade || firstTargetStudent?.grade || '';
  const eduLevel = getEducationLevelForGrade(targetGrade);

  const sortPrimarySubjects = (subjs: Subject[]) => {
    if (eduLevel === 'Pre-Primary') {
      const ppOrderMap: Record<string, number> = {
        'PP-MATH': 1,
        'PP-PCA': 2,
        'PP-CRE': 3,
        'PP-ENV': 4,
        'PP-LANG': 5,
      };
      return [...subjs].sort((a, b) => {
        const cA = (a.subject_code || '').toUpperCase().trim();
        const cB = (b.subject_code || '').toUpperCase().trim();
        const posA = ppOrderMap[cA] ?? 99;
        const posB = ppOrderMap[cB] ?? 99;
        if (posA !== posB) return posA - posB;
        return (a.subject_name || '').localeCompare(b.subject_name || '');
      });
    }
    return sortSubjectsByStandardOrder(subjs);
  };

  const rawActiveSubjects = targetClass ? getLearnerReportSubjects(firstTargetStudent || {} as any, targetClass, subjects, teachers || []) : [];
  let activeSubjects = sortPrimarySubjects(rawActiveSubjects);

  if (activeSubjects.length === 0) {
    const fallbackSubjects = getApplicableSubjectsForGrade(targetGrade || 'Grade 9', subjects);
    activeSubjects = sortPrimarySubjects(fallbackSubjects);
  }

  if (activeSubjects.length === 0 && subjects.length > 0) {
    const levelSubjects = subjects.filter(
      (s) => s.status !== 'Archived' && (eduLevel ? (s.education_level as string) === eduLevel : true)
    );
    activeSubjects = sortPrimarySubjects(levelSubjects.length > 0 ? levelSubjects : subjects);
  }

  // Full general class cohort (all streams belonging to this grade/class level)
  const classCohortStudents = getClassCohortStudents(students, classes, selectedClassId, targetGrade, exam, targetStudents);

  // Calculate results matching Merit List & PDF
  const allCohortResults = calculateExamResults(examId, classCohortStudents, marks, grades, classes, activeSubjects, exam);
  populateComparisonResults(allCohortResults, data.comparisonExamId, students, marks, grades, classes, subjects, data.exams);

  // When filtering by a specific stream, select only the target stream's results
  const targetStudentIdSet = new Set(targetStudents.map((s) => s.id));
  const results = selectedStreamId !== 'all'
    ? allCohortResults.filter((r) => targetStudentIdSet.has(r.student_id))
    : allCohortResults;

  const validation = validateCalculationData(results, marks, grades, activeSubjects);
  if (!validation.isValid) {
    console.error('Calculation Validation Errors:', validation.errors);
    throw new Error(`Calculation Engine Validation Failed:\n${validation.errors.join('\n')}`);
  }

  // Sort learners for display by authoritative position ascending (complete learners first), with total_marks descending as fallback
  results.sort((a, b) => (a.position || 999) - (b.position || 999) || (b.total_marks || 0) - (a.total_marks || 0));

  const wb = XLSX.utils.book_new();

  const examCodeStr = formatStandardExamCode(targetGrade || streamNameStr, exam);

  const isStandalone = exam?.assessment_structure === 'Standalone';
  if (isStandalone) {
    activeSubjects = activeSubjects.filter((s) => {
      const code = (s.subject_code || '').toUpperCase();
      const name = (s.subject_name || '').toUpperCase();
      return code !== 'COMP' && !name.includes('COMPOSITION') && code !== 'INSHA' && !name.includes('INSHA') && !isDirectSSCRE(s);
    });
  }

  const partition = getUpperPrimaryMeritListSubjectPartition({
    activeSubjects,
    subjects,
    exam,
    targetClass,
    eduLevel,
    targetGrade,
    isStandalone,
    marks,
  });

  const isUpperPrimary = partition.isUpperPrimary;
  const isAgnIncluded = partition.isAgnIncluded;
  const engLangSubj = partition.engLangSubj;
  const engCompSubj = partition.engCompSubj;
  const kiswLughaSubj = partition.kiswLughaSubj;
  const kiswInshaSubj = partition.kiswInshaSubj;
  const sstSubj = partition.sstSubj;
  const creSubj = partition.creSubj;
  const directSsCreSubj = partition.directSsCreSubj;

  const hasUpperPrimaryEng = partition.hasUpperPrimaryEng;
  const hasUpperPrimaryKisw = partition.hasUpperPrimaryKisw;
  const hasUpperPrimarySsCre = partition.hasUpperPrimarySsCre;
  const otherUpperPrimarySubjects = partition.otherUpperPrimarySubjects;

  // Header Rows
  const sheetData: any[][] = [
    [(school.school_name || 'School Name Not Configured').toUpperCase()],
    [`LEARNERS' PERFORMANCE MERIT LIST - ${getDisplayExamName(exam?.exam_name) || 'Assessment'} (${exam?.term || 'Term 2'} ${exam?.year || 2026})`],
    [`Class/Stream: ${streamNameStr}`, `Exam Code: ${examCodeStr}`, `Date Generated: ${new Date().toLocaleDateString()}`, `Generated By: ${generatedBy}`],
    [], // Empty row
  ];

  const subjectHeaders = isUpperPrimary
    ? [
        ...(hasUpperPrimaryEng ? ['ENG', 'COMP', 'ENG %'] : []),
        ...(hasUpperPrimaryKisw ? ['KISW', 'INSHA', 'KISW %'] : []),
        ...otherUpperPrimarySubjects.map((sb) => getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel)),
        ...(hasUpperPrimarySsCre ? ['SST', 'CRE', 'SS&CRE %'] : []),
      ]
    : activeSubjects.map((sb) => {
        if (eduLevel === 'Pre-Primary' || eduLevel === 'Lower Primary') {
          return (sb.subject_code || '').toUpperCase().trim();
        }
        return getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel);
      });

  // Table Column Headers matching Merit List & PDF
  const headers = [
    'S.NO',
    'ADM NO',
    'LEARNER NAME',
    'STREAM',
    'STR. POS.',
    'OVR POS',
    'PRV STR POS',
    'PRV OVR POS',
    ...subjectHeaders,
    'TOTAL MARKS',
    'AVG %',
    'TOTAL PTS',
    'AVG PTS',
    'CBE LEVEL',
    'GRADE CODE',
  ];

  sheetData.push(headers);

  // Student Rows
  results.forEach((r, idx) => {
    const std = targetStudents.find((s) => s.id === r.student_id);
    const histCtx = std && exam ? getLearnerClassAtExamTime(std, exam, classes) : null;
    const cls = classes.find((c) => c.id === (histCtx?.class_id || std?.class_id));
    const streamStr = histCtx
      ? (histCtx.historical_context_resolved ? (histCtx.stream_name || cls?.stream || '-') : '-')
      : (cls?.stream ? cls.stream : '-');
    const isComplete = r.is_complete !== false;

    const overallPos = isComplete && r.position && r.position > 0 ? `${r.position}` : '-';
    const streamRank = isComplete && (r.class_position || r.position) && ((r.class_position || r.position) > 0) ? `${r.class_position || r.position}` : '-';
    const prevOvrPos = (r as any).previous_position != null ? `${(r as any).previous_position}` : '-';
    const prevStrPos = (r as any).previous_class_position != null ? `${(r as any).previous_class_position}` : '-';

    let subjectCells: string[] = [];

    if (isUpperPrimary) {
      const getRawDisplay = (sb?: Subject) => {
        if (!sb) return '-';
        const stdMark = marks.find(
          (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
        );
        const info = evaluateMark(stdMark, { isUpperPrimaryCompOrInsha: true, subject: sb, classObj: cls, educationLevel: eduLevel });
        if (info.status === 'X') return 'X';
        if (info.status === 'Y') return 'Y';
        if (info.status === 'Blank' || info.percentage === null) return '-';
        return `${info.displayScore}`;
      };

      const getCompositePctDisplay = (langSubj?: Subject, compSubj?: Subject) => {
        const m1 = langSubj ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(langSubj.id) && String(m.exam_id) === String(examId)) : null;
        const m2 = compSubj ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(compSubj.id) && String(m.exam_id) === String(examId)) : null;

        const info1 = m1 ? evaluateMark(m1, { isUpperPrimaryCompOrInsha: true, subject: langSubj, classObj: cls, educationLevel: eduLevel }) : null;
        const info2 = m2 ? evaluateMark(m2, { isUpperPrimaryCompOrInsha: true, subject: compSubj, classObj: cls, educationLevel: eduLevel }) : null;

        if (info1?.status === 'X' || info2?.status === 'X') return 'X';
        if (info1?.status === 'Y' || info2?.status === 'Y') return 'Y';

        let sumRaw = 0;
        let hasAny = false;
        const s1 = info1 && info1.status === 'Normal' ? (typeof info1.rawScore === 'number' && !isNaN(info1.rawScore) ? info1.rawScore : Number(info1.displayScore)) : null;
        if (s1 !== null && !isNaN(s1)) {
          sumRaw += s1;
          hasAny = true;
        }
        const s2 = info2 && info2.status === 'Normal' ? (typeof info2.rawScore === 'number' && !isNaN(info2.rawScore) ? info2.rawScore : Number(info2.displayScore)) : null;
        if (s2 !== null && !isNaN(s2)) {
          sumRaw += s2;
          hasAny = true;
        }

        if (!hasAny) return '-';
        const roundedPct = Math.round(sumRaw);
        const gr = getGradeForMark(roundedPct, grades, eduLevel, targetGrade);
        const code = gr.grade_code || gr.performance_level || 'ME';
        return `${roundedPct} ${code}`;
      };

      const getSsCreCompositePctDisplay = (sSub?: Subject, cSub?: Subject) => {
        const m1 = sSub ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sSub.id) && String(m.exam_id) === String(examId)) : null;
        const m2 = cSub ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(cSub.id) && String(m.exam_id) === String(examId)) : null;

        const info1 = m1 ? evaluateMark(m1, { subject: sSub, classObj: cls, educationLevel: eduLevel }) : null;
        const info2 = m2 ? evaluateMark(m2, { subject: cSub, classObj: cls, educationLevel: eduLevel }) : null;

        const valid1 = info1 && (info1.status === 'Normal' || info1.status === 'X' || info1.status === 'Y');
        const valid2 = info2 && (info2.status === 'Normal' || info2.status === 'X' || info2.status === 'Y');

        if (sSub && !valid1) return '-';
        if (cSub && !valid2) return '-';

        if (info1?.status === 'X' && info2?.status === 'X') return 'X';
        if (info1?.status === 'Y' || info2?.status === 'Y') return 'Y';

        const s1 = info1 && info1.status === 'Normal' ? (typeof info1.rawScore === 'number' && !isNaN(info1.rawScore) ? info1.rawScore : Number(info1.displayScore)) : 0;
        const s2 = info2 && info2.status === 'Normal' ? (typeof info2.rawScore === 'number' && !isNaN(info2.rawScore) ? info2.rawScore : Number(info2.displayScore)) : 0;

        const sumRaw = s1 + s2;
        const sstCreMaxes = exam?.ss_cre_structure ? (getSSCREComponentMaxMarks(exam.ss_cre_structure) || { sstMax: 30, creMax: 20, ssCreMax: 50 }) : { sstMax: 30, creMax: 20, ssCreMax: 50 };
        const pct = (sumRaw / sstCreMaxes.ssCreMax) * 100;
        const roundedPct = Math.round(pct);
        const gr = getGradeForMark(roundedPct, grades, eduLevel, targetGrade);
        const code = gr.grade_code || gr.performance_level || 'ME';
        return `${roundedPct} ${code}`;
      };

      if (hasUpperPrimaryEng) {
        subjectCells.push(getRawDisplay(engLangSubj));
        subjectCells.push(getRawDisplay(engCompSubj));
        subjectCells.push(getCompositePctDisplay(engLangSubj, engCompSubj));
      }

      if (hasUpperPrimaryKisw) {
        subjectCells.push(getRawDisplay(kiswLughaSubj));
        subjectCells.push(getRawDisplay(kiswInshaSubj));
        subjectCells.push(getCompositePctDisplay(kiswLughaSubj, kiswInshaSubj));
      }

      otherUpperPrimarySubjects.forEach((sb) => {
        const stdMark = findStudentMarkForExporter(marks, r.student_id, sb, examId, subjects);
        const markInfo = evaluateMark(stdMark, {
          subject: sb,
          classObj: cls,
          educationLevel: eduLevel,
        });
        if (markInfo.status === 'X') {
          subjectCells.push('X');
        } else if (markInfo.status === 'Y') {
          subjectCells.push('Y');
        } else if (markInfo.status === 'Blank' || markInfo.percentage === null) {
          subjectCells.push('-');
        } else {
          const roundedVal = Math.round(markInfo.percentage);
          const gr = getGradeForMark(markInfo.percentage, grades, eduLevel, targetGrade);
          const defaultCode = 'ME';
          subjectCells.push(`${roundedVal} ${gr.grade_code || gr.performance_level || defaultCode}`);
        }
      });

      if (hasUpperPrimarySsCre) {
        subjectCells.push(getRawDisplay(sstSubj));
        subjectCells.push(getRawDisplay(creSubj));
        subjectCells.push(getSsCreCompositePctDisplay(sstSubj, creSubj));
      }
    } else {
      subjectCells = activeSubjects.map((sb) => {
        const stdMark = marks.find(
          (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
        );
        const isCompInsha = isUpperPrimaryCompOrInsha(sb, cls, eduLevel);
        const markInfo = evaluateMark(stdMark, {
          isUpperPrimaryCompOrInsha: isCompInsha,
          subject: sb,
          classObj: cls,
          educationLevel: eduLevel,
        });
        if (markInfo.status === 'X') return 'X';
        if (markInfo.status === 'Y') return 'Y';
        if (markInfo.status === 'Blank' || markInfo.percentage === null) return '-';

        const roundedVal = Math.round(markInfo.percentage);
        const scoreDisplay = isCompInsha ? markInfo.displayScore : roundedVal;
        const gr = getGradeForMark(markInfo.percentage, grades, eduLevel, targetGrade);
        const defaultSubCode1 = (eduLevel === 'Upper Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Pre-Primary') ? 'ME' : 'ME1';
        return `${scoreDisplay} ${gr.grade_code || gr.performance_level || defaultSubCode1}`;
      });
    }

    const subEntry = activeSubjects.filter((sb) => {
      const m = marks.find(
        (mk) => String(mk.student_id) === String(r.student_id) && String(mk.subject_id) === String(sb.id) && String(mk.exam_id) === String(examId)
      );
      const info = evaluateMark(m, {
        subject: sb,
        classObj: cls,
        educationLevel: eduLevel,
      });
      return info.status === 'Normal' && info.percentage !== null;
    }).length;

    const isAssessed = subEntry > 0;
    const assessedCnt = isAssessed ? subEntry : 1;
    const avgPtsNum = r.average_points !== undefined && r.average_points !== null && r.average_points > 0
      ? r.average_points
      : (r.total_points / assessedCnt);
    const avgPts = isComplete && isAssessed ? avgPtsNum.toFixed(2) : '-';

    const overallLevelObj = getGradeForMark(r.average, grades, eduLevel, targetGrade);

    const cbeLevel = isComplete
      ? (overallLevelObj.performance_level || 'ME')
      : isAssessed
      ? (overallLevelObj.performance_level || 'ME')
      : '-';

    const defaultOverallCode1 = (eduLevel === 'Upper Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Pre-Primary') ? 'ME' : 'ME1';
    const levelCode1 = overallLevelObj.grade_code || overallLevelObj.performance_level || defaultOverallCode1;

    const gradeCode = isComplete
      ? levelCode1
      : isAssessed
      ? `Prov (${levelCode1})`
      : 'Pending';

    const row: any[] = [
      `${idx + 1}`,
      std?.admission_number || '-',
      (std?.full_name || 'UNKNOWN').toUpperCase(),
      streamStr !== '-' ? streamStr.toUpperCase() : '-',
      streamRank,
      overallPos,
      prevStrPos,
      prevOvrPos,
      ...subjectCells,
      isAssessed ? r.total_marks : '-',
      isComplete && isAssessed ? formatPercentage(r.average, true) : isAssessed ? `${formatPercentage(r.average, true)} (P)` : '-',
      isComplete && isAssessed ? r.total_points : '-',
      avgPts,
      cbeLevel,
      gradeCode,
    ];
    sheetData.push(row);
  });

  sheetData.push([]); // Empty row

  // Subject Analysis Section
  sheetData.push(['LEARNING AREA PERFORMANCE ANALYSIS']);
  sheetData.push(['Learning Area Code', 'Learning Area Name', 'Class Average (%)', 'Performance Level', 'Grade Code', 'Avg Points']);

  const subjectStats = activeSubjects.map((sb) => {
    const targetSubjMarks = marks.filter(
      (m) =>
        m.exam_id === examId &&
        m.subject_id === sb.id &&
        targetStudents.some((s) => s.id === m.student_id)
    );
    let sum = 0;
    let count = 0;
    targetSubjMarks.forEach((m) => {
      const markInfo = evaluateMark(m);
      if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
        sum += markInfo.percentage;
        count++;
      }
    });
    const avg = count > 0 ? sum / count : 0;
    const gr = getGradeForMark(avg, grades);
    return {
      code: sb.subject_code,
      name: sb.subject_name,
      avg,
      level: gr.performance_level,
      grade_code: gr.grade_code,
      points: gr.points,
    };
  });

  subjectStats.sort((a, b) => b.avg - a.avg);

  subjectStats.forEach((sb) => {
    sheetData.push([sb.code, sb.name, formatTwoDecimalAverage(sb.avg), sb.level, sb.grade_code, sb.points]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set Auto Column Widths for readability in Excel
  const colWidths = headers.map((h, i) => {
    if (i === 0) return { wch: 8 }; // Serial No
    if (i === 1) return { wch: 12 }; // Adm No
    if (i === 2) return { wch: 30 }; // Learner Name
    if (i === 3) return { wch: 14 }; // Stream
    if (i >= 4 && i <= 7) return { wch: 10 }; // Positions
    if (i > 7 && i < headers.length - 6) return { wch: 12 }; // Subject Columns (e.g. '82 EE2')
    return { wch: 14 }; // Summary Columns
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Merit List');

  const fileName = `Merit_List_${streamNameStr.replace(/\s+/g, '_')}.xlsx`;
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  if (isNative) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFile(wbout, fileName, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: `Share ${fileName}`,
    });
  } else {
    XLSX.writeFile(wb, fileName);
  }
}

// --- 3. GENERATE MERIT LIST CSV (.csv) ---
export async function downloadMeritListCSV(data: MeritListData): Promise<void> {
  const {
    school,
    exam,
    selectedClassId,
    selectedStreamId = 'all',
    classes = [],
    teachers = [],
    students = [],
    subjects = [],
    marks = [],
    grades = [],
  } = data;

  const examId = exam?.id || '';
  const targetStudents = getFilteredStudents(students, classes, selectedClassId, selectedStreamId, exam);
  const streamNameStr = getClassStreamLabel(classes, selectedClassId, selectedStreamId);

  const firstTargetStudent = targetStudents[0];
  const firstHistCtx = firstTargetStudent && exam ? getLearnerClassAtExamTime(firstTargetStudent, exam, classes) : null;
  const targetClass = classes.find(
    (c) => c.id === (selectedClassId !== 'all' ? selectedClassId : (firstHistCtx?.class_id || firstTargetStudent?.class_id))
  );
  const targetGrade = targetClass?.class_name || firstHistCtx?.class_name || firstHistCtx?.grade || firstTargetStudent?.grade || '';
  const eduLevel = getEducationLevelForGrade(targetGrade);

  const sortPrimarySubjects = (subjs: Subject[]) => {
    if (eduLevel === 'Pre-Primary') {
      const ppOrderMap: Record<string, number> = {
        'PP-MATH': 1,
        'PP-PCA': 2,
        'PP-CRE': 3,
        'PP-ENV': 4,
        'PP-LANG': 5,
      };
      return [...subjs].sort((a, b) => {
        const cA = (a.subject_code || '').toUpperCase().trim();
        const cB = (b.subject_code || '').toUpperCase().trim();
        const posA = ppOrderMap[cA] ?? 99;
        const posB = ppOrderMap[cB] ?? 99;
        if (posA !== posB) return posA - posB;
        return (a.subject_name || '').localeCompare(b.subject_name || '');
      });
    }
    return sortSubjectsByStandardOrder(subjs);
  };

  const rawActiveSubjects = targetClass ? getLearnerReportSubjects(firstTargetStudent || {} as any, targetClass, subjects, teachers || []) : [];
  let activeSubjects = sortPrimarySubjects(rawActiveSubjects);

  if (activeSubjects.length === 0) {
    const fallbackSubjects = getApplicableSubjectsForGrade(targetGrade, subjects);
    activeSubjects = sortPrimarySubjects(fallbackSubjects);
  }

  if (activeSubjects.length === 0 && subjects.length > 0) {
    const levelSubjects = subjects.filter(
      (s) => s.status !== 'Archived' && (eduLevel ? (s.education_level as string) === eduLevel : true)
    );
    activeSubjects = sortPrimarySubjects(levelSubjects.length > 0 ? levelSubjects : subjects);
  }

  // Full general class cohort (all streams belonging to this grade/class level)
  const classCohortStudents = getClassCohortStudents(students, classes, selectedClassId, targetGrade, exam, targetStudents);

  const allCohortResults = calculateExamResults(examId, classCohortStudents, marks, grades, classes, activeSubjects, exam);
  populateComparisonResults(allCohortResults, data.comparisonExamId, students, marks, grades, classes, subjects, data.exams);

  // When filtering by a specific stream, select only the target stream's results
  const targetStudentIdSet = new Set(targetStudents.map((s) => s.id));
  const results = selectedStreamId !== 'all'
    ? allCohortResults.filter((r) => targetStudentIdSet.has(r.student_id))
    : allCohortResults;

  const validation = validateCalculationData(results, marks, grades, activeSubjects);
  if (!validation.isValid) {
    console.error('Calculation Validation Errors:', validation.errors);
    throw new Error(`Calculation Engine Validation Failed:\n${validation.errors.join('\n')}`);
  }

  // Sort learners for display by authoritative position ascending (complete learners first), with total_marks descending as fallback
  results.sort((a, b) => (a.position || 999) - (b.position || 999) || (b.total_marks || 0) - (a.total_marks || 0));

  const csvRows: string[] = [];

  const examCodeStr = formatStandardExamCode(targetGrade || streamNameStr, exam);

  const isStandalone = exam?.assessment_structure === 'Standalone';
  if (isStandalone) {
    activeSubjects = activeSubjects.filter((s) => {
      const code = (s.subject_code || '').toUpperCase();
      const name = (s.subject_name || '').toUpperCase();
      return code !== 'COMP' && !name.includes('COMPOSITION') && code !== 'INSHA' && !name.includes('INSHA') && !isDirectSSCRE(s);
    });
  }

  const partition = getUpperPrimaryMeritListSubjectPartition({
    activeSubjects,
    subjects,
    exam,
    targetClass,
    eduLevel,
    targetGrade,
    isStandalone,
    marks,
  });

  const isUpperPrimary = partition.isUpperPrimary;
  const isAgnIncluded = partition.isAgnIncluded;
  const engLangSubj = partition.engLangSubj;
  const engCompSubj = partition.engCompSubj;
  const kiswLughaSubj = partition.kiswLughaSubj;
  const kiswInshaSubj = partition.kiswInshaSubj;
  const sstSubj = partition.sstSubj;
  const creSubj = partition.creSubj;
  const directSsCreSubj = partition.directSsCreSubj;

  const hasUpperPrimaryEng = partition.hasUpperPrimaryEng;
  const hasUpperPrimaryKisw = partition.hasUpperPrimaryKisw;
  const hasUpperPrimarySsCre = partition.hasUpperPrimarySsCre;
  const otherUpperPrimarySubjects = partition.otherUpperPrimarySubjects;

  // Header
  csvRows.push(`"${school.school_name || 'School Name Not Configured'}"`);
  csvRows.push(`"LEARNERS' PERFORMANCE MERIT LIST - ${getDisplayExamName(exam?.exam_name) || 'Assessment'}"`);
  csvRows.push(`"Class/Stream: ${streamNameStr}","Exam Code: ${examCodeStr}","Date: ${new Date().toLocaleDateString()}"`);
  csvRows.push('');

  const subjectHeaders = isUpperPrimary
    ? [
        ...(hasUpperPrimaryEng ? ['ENG', 'COMP', 'ENG %'] : []),
        ...(hasUpperPrimaryKisw ? ['KISW', 'INSHA', 'KISW %'] : []),
        ...otherUpperPrimarySubjects.map((sb) => getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel)),
        ...(hasUpperPrimarySsCre ? ['SST', 'CRE', 'SS&CRE %'] : []),
      ]
    : activeSubjects.map((sb) => {
        if (eduLevel === 'Pre-Primary' || eduLevel === 'Lower Primary') {
          return (sb.subject_code || '').toUpperCase().trim();
        }
        return getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel);
      });

  const headers = [
    'S.NO',
    'ADM NO',
    'LEARNER NAME',
    'STREAM',
    'STR. POS.',
    'OVR POS',
    'PRV STR POS',
    'PRV OVR POS',
    ...subjectHeaders,
    'TOTAL MARKS',
    'AVG %',
    'TOTAL PTS',
    'AVG PTS',
    'CBE LEVEL',
    'GRADE CODE',
  ];

  csvRows.push(headers.map((h) => `"${h}"`).join(','));

  results.forEach((r, idx) => {
    const std = targetStudents.find((s) => s.id === r.student_id);
    const histCtx = std && exam ? getLearnerClassAtExamTime(std, exam, classes) : null;
    const cls = classes.find((c) => c.id === (histCtx?.class_id || std?.class_id));
    const streamStr = histCtx
      ? (histCtx.historical_context_resolved ? (histCtx.stream_name || cls?.stream || '-') : '-')
      : (cls?.stream ? cls.stream : '-');
    const isComplete = r.is_complete !== false;

    const overallPos = r.position && r.position > 0 ? `${r.position}` : '-';
    const streamRank = (r.class_position || r.position) && ((r.class_position || r.position) > 0) ? `${r.class_position || r.position}` : '-';
    const prevOvrPos = (r as any).previous_position != null ? `${(r as any).previous_position}` : '-';
    const prevStrPos = (r as any).previous_class_position != null ? `${(r as any).previous_class_position}` : '-';

    let subjectCells: string[] = [];

    if (isUpperPrimary) {
      const getRawDisplay = (sb?: Subject) => {
        if (!sb) return '-';
        const stdMark = marks.find(
          (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
        );
        const info = evaluateMark(stdMark, { isUpperPrimaryCompOrInsha: true, subject: sb, classObj: cls, educationLevel: eduLevel });
        if (info.status === 'X') return 'X';
        if (info.status === 'Y') return 'Y';
        if (info.status === 'Blank' || info.percentage === null) return '-';
        return `${info.displayScore}`;
      };

      const getCompositePctDisplay = (langSubj?: Subject, compSubj?: Subject) => {
        const m1 = langSubj ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(langSubj.id) && String(m.exam_id) === String(examId)) : null;
        const m2 = compSubj ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(compSubj.id) && String(m.exam_id) === String(examId)) : null;

        const info1 = m1 ? evaluateMark(m1, { isUpperPrimaryCompOrInsha: true, subject: langSubj, classObj: cls, educationLevel: eduLevel }) : null;
        const info2 = m2 ? evaluateMark(m2, { isUpperPrimaryCompOrInsha: true, subject: compSubj, classObj: cls, educationLevel: eduLevel }) : null;

        if (info1?.status === 'X' || info2?.status === 'X') return 'X';
        if (info1?.status === 'Y' || info2?.status === 'Y') return 'Y';

        let sumRaw = 0;
        let hasAny = false;
        const s1 = info1 && info1.status === 'Normal' ? (typeof info1.rawScore === 'number' && !isNaN(info1.rawScore) ? info1.rawScore : Number(info1.displayScore)) : null;
        if (s1 !== null && !isNaN(s1)) {
          sumRaw += s1;
          hasAny = true;
        }
        const s2 = info2 && info2.status === 'Normal' ? (typeof info2.rawScore === 'number' && !isNaN(info2.rawScore) ? info2.rawScore : Number(info2.displayScore)) : null;
        if (s2 !== null && !isNaN(s2)) {
          sumRaw += s2;
          hasAny = true;
        }

        if (!hasAny) return '-';
        const roundedPct = Math.round(sumRaw);
        const gr = getGradeForMark(roundedPct, grades, eduLevel, targetGrade);
        const code = gr.grade_code || gr.performance_level || 'ME';
        return `${roundedPct} ${code}`;
      };

      const getSsCreCompositePctDisplay = (sSub?: Subject, cSub?: Subject) => {
        const m1 = sSub ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sSub.id) && String(m.exam_id) === String(examId)) : null;
        const m2 = cSub ? marks.find((m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(cSub.id) && String(m.exam_id) === String(examId)) : null;

        const info1 = m1 ? evaluateMark(m1, { subject: sSub, classObj: cls, educationLevel: eduLevel }) : null;
        const info2 = m2 ? evaluateMark(m2, { subject: cSub, classObj: cls, educationLevel: eduLevel }) : null;

        const valid1 = info1 && (info1.status === 'Normal' || info1.status === 'X' || info1.status === 'Y');
        const valid2 = info2 && (info2.status === 'Normal' || info2.status === 'X' || info2.status === 'Y');

        if (sSub && !valid1) return '-';
        if (cSub && !valid2) return '-';

        if (info1?.status === 'X' && info2?.status === 'X') return 'X';
        if (info1?.status === 'Y' || info2?.status === 'Y') return 'Y';

        const s1 = info1 && info1.status === 'Normal' ? (typeof info1.rawScore === 'number' && !isNaN(info1.rawScore) ? info1.rawScore : Number(info1.displayScore)) : 0;
        const s2 = info2 && info2.status === 'Normal' ? (typeof info2.rawScore === 'number' && !isNaN(info2.rawScore) ? info2.rawScore : Number(info2.displayScore)) : 0;

        const sumRaw = s1 + s2;
        const sstCreMaxes = exam?.ss_cre_structure ? (getSSCREComponentMaxMarks(exam.ss_cre_structure) || { sstMax: 30, creMax: 20, ssCreMax: 50 }) : { sstMax: 30, creMax: 20, ssCreMax: 50 };
        const pct = (sumRaw / sstCreMaxes.ssCreMax) * 100;
        const roundedPct = Math.round(pct);
        const gr = getGradeForMark(roundedPct, grades, eduLevel, targetGrade);
        const code = gr.grade_code || gr.performance_level || 'ME';
        return `${roundedPct} ${code}`;
      };

      if (hasUpperPrimaryEng) {
        subjectCells.push(getRawDisplay(engLangSubj));
        subjectCells.push(getRawDisplay(engCompSubj));
        subjectCells.push(getCompositePctDisplay(engLangSubj, engCompSubj));
      }

      if (hasUpperPrimaryKisw) {
        subjectCells.push(getRawDisplay(kiswLughaSubj));
        subjectCells.push(getRawDisplay(kiswInshaSubj));
        subjectCells.push(getCompositePctDisplay(kiswLughaSubj, kiswInshaSubj));
      }

      otherUpperPrimarySubjects.forEach((sb) => {
        const stdMark = findStudentMarkForExporter(marks, r.student_id, sb, examId, subjects);
        const markInfo = evaluateMark(stdMark, {
          subject: sb,
          classObj: cls,
          educationLevel: eduLevel,
        });
        if (markInfo.status === 'X') {
          subjectCells.push('X');
        } else if (markInfo.status === 'Y') {
          subjectCells.push('Y');
        } else if (markInfo.status === 'Blank' || markInfo.percentage === null) {
          subjectCells.push('-');
        } else {
          const roundedVal = Math.round(markInfo.percentage);
          const gr = getGradeForMark(markInfo.percentage, grades, eduLevel, targetGrade);
          const defaultCode = 'ME';
          subjectCells.push(`${roundedVal} ${gr.grade_code || gr.performance_level || defaultCode}`);
        }
      });

      if (hasUpperPrimarySsCre) {
        subjectCells.push(getRawDisplay(sstSubj));
        subjectCells.push(getRawDisplay(creSubj));
        subjectCells.push(getSsCreCompositePctDisplay(sstSubj, creSubj));
      }
    } else {
      subjectCells = activeSubjects.map((sb) => {
        const stdMark = marks.find(
          (m) => String(m.student_id) === String(r.student_id) && String(m.subject_id) === String(sb.id) && String(m.exam_id) === String(examId)
        );
        const isCompInsha = isUpperPrimaryCompOrInsha(sb, cls, eduLevel);
        const markInfo = evaluateMark(stdMark, {
          isUpperPrimaryCompOrInsha: isCompInsha,
          subject: sb,
          classObj: cls,
          educationLevel: eduLevel,
        });
        if (markInfo.status === 'X') return 'X';
        if (markInfo.status === 'Y') return 'Y';
        if (markInfo.status === 'Blank' || markInfo.percentage === null) return '-';

        const roundedVal = Math.round(markInfo.percentage);
        const scoreDisplay = isCompInsha ? markInfo.displayScore : roundedVal;
        const gr = getGradeForMark(markInfo.percentage, grades, eduLevel, targetGrade);
        const defaultSubCode2 = (eduLevel === 'Upper Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Pre-Primary') ? 'ME' : 'ME1';
        return `${scoreDisplay} ${gr.grade_code || gr.performance_level || defaultSubCode2}`;
      });
    }

    const subEntry = activeSubjects.filter((sb) => {
      const m = marks.find(
        (mk) => String(mk.student_id) === String(r.student_id) && String(mk.subject_id) === String(sb.id) && String(mk.exam_id) === String(examId)
      );
      const info = evaluateMark(m, {
        subject: sb,
        classObj: cls,
        educationLevel: eduLevel,
      });
      return info.status === 'Normal' && info.percentage !== null;
    }).length;

    const isAssessed = subEntry > 0;
    const assessedCnt = isAssessed ? subEntry : 1;
    const avgPtsNum = r.average_points !== undefined && r.average_points !== null && r.average_points > 0
      ? r.average_points
      : (r.total_points / assessedCnt);
    const avgPts = isComplete && isAssessed ? avgPtsNum.toFixed(2) : '-';

    const overallLevelObj = getGradeForMark(r.average, grades, eduLevel, targetGrade);

    const cbeLevel = isComplete
      ? (overallLevelObj.performance_level || 'ME')
      : isAssessed
      ? (overallLevelObj.performance_level || 'ME')
      : '-';

    const defaultOverallCode2 = (eduLevel === 'Upper Primary' || eduLevel === 'Lower Primary' || eduLevel === 'Pre-Primary') ? 'ME' : 'ME1';
    const levelCode2 = overallLevelObj.grade_code || overallLevelObj.performance_level || defaultOverallCode2;

    const gradeCode = isComplete
      ? levelCode2
      : isAssessed
      ? `Prov (${levelCode2})`
      : 'Pending';

    const row: (string | number)[] = [
      `${idx + 1}`,
      std?.admission_number || '-',
      (std?.full_name || 'UNKNOWN').toUpperCase(),
      streamStr !== '-' ? streamStr.toUpperCase() : '-',
      streamRank,
      overallPos,
      prevStrPos,
      prevOvrPos,
      ...subjectCells,
      isAssessed ? Math.round(r.total_marks) : '-',
      isComplete && isAssessed ? formatPercentage(r.average, true) : isAssessed ? `${formatPercentage(r.average, true)} (P)` : '-',
      isComplete && isAssessed ? r.total_points : '-',
      avgPts,
      cbeLevel,
      gradeCode,
    ];

    csvRows.push(row.map((cell) => `"${cell}"`).join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const fileName = `Merit_List_${streamNameStr.replace(/\s+/g, '_')}.csv`;
  await saveFile(blob, fileName, { mimeType: 'text/csv;charset=utf-8;' });
}
