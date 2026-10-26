import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { savePdf, saveFile } from '../utils/fileDownloader';
import { ensureSafeJsPdf } from '../utils/pdfSafeUtils';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Mark,
  Grade,
  Teacher,
  LearnerReportComment,
  LearnerRankingMetadata,
  getEducationLevelForGrade,
  EducationLevel,
  getMeritListDisplayCode,
} from '../types';
import {
  calculateExamResults,
  getGradeForMark,
  calculateSubjectRank,
  calculateBatchCohortSubjectRanks,
  getLearnerReportSubjects,
  getSubjectDefaultComment,
} from './analysisEngine';
import { getDisplayExamName, isGrade6OpenerTerm32026 } from '../utils/examDisplayUtils';
import { getLearnerClassAtExamTime, getStreamCohortStudentIds, getGradeCohortStudentIds } from './historicalContextResolver';
import {
  evaluateMark,
  formatPercentage,
  isSocialStudies,
  isChristianReligiousEducation,
  isDirectSSCRE,
  hasSeparateSstAndCreMarks,
  resolveLearnerReportSubjectsAndMarks,
  isAgricultureSubject,
  isAgricultureAllocatedToClass,
  isAgricultureIncludedInCompositeExam,
  isEnglishComposition,
  isKiswahiliInsha,
  calculateStreamSubjectMeans,
} from '../utils/markUtils';
import {
  resolveUpperPrimaryReportStructure,
  UpperPrimaryConsolidatedArea,
  UpperPrimaryStandardArea,
} from '../utils/upperPrimaryReportUtils';
import { formatKenyaDate } from '../utils/kenyaDateUtils';
import { isKiswahiliSubject, getKiswahiliDefaultComment } from '../utils/kiswahiliCommentValidator';
import { resolveSubjectTeacher, resolveClassTeacher } from '../utils/teacherResolutionUtils';
import { stripSurroundingQuotes } from '../utils/filterUtils';
import { generatePersonalizedLearnerComment } from './learnerCommentGenerator';
import { formatDateToKenyaHumanReadable, isGrade9Term3Report, isNextTermOpeningDateRequired } from './nextTermOpeningDateResolver';
import { buildLearnerTrajectory } from './learnerTrajectoryEngine';

export const PDF_COLORS = {
  PRIMARY_NAVY: [6, 78, 59] as [number, number, number],
  NAVY_DARK: [6, 78, 59] as [number, number, number],
  SLATE_HEADER: [6, 78, 59] as [number, number, number],
  SLATE_MUTED: [71, 85, 105] as [number, number, number],
  SLATE_TEXT: [51, 65, 85] as [number, number, number],
  SLATE_DARK_TEXT: [15, 23, 42] as [number, number, number],
  WHITE: [255, 255, 255] as [number, number, number],
  SLATE_LIGHT: [248, 250, 252] as [number, number, number],
  BORDER_SLATE: [203, 213, 225] as [number, number, number],
  CARD_BG: [255, 255, 255] as [number, number, number],
  METRIC_LABEL: [209, 250, 229] as [number, number, number],
  METRIC_AVG: [255, 255, 255] as [number, number, number],
  METRIC_LEVEL: [255, 255, 255] as [number, number, number],
  HOI_BG: [254, 253, 248] as [number, number, number],
  HOI_BORDER: [229, 215, 185] as [number, number, number],
  HOI_LABEL: [6, 78, 59] as [number, number, number],
  EE: [4, 120, 87] as [number, number, number],
  ME: [30, 64, 175] as [number, number, number],
  AE: [180, 83, 9] as [number, number, number],
  BE: [190, 18, 60] as [number, number, number],
};

export function drawPerformanceProgressionGraph(
  doc: jsPDF,
  data: PDFReportData,
  currentY: number,
  contentWidth: number,
  marginX: number
): number {
  return currentY;
}

export interface PDFReportData {
  student: Student;
  school: School;
  exam?: Examination;
  allExams?: Examination[];
  classes: ClassStream[];
  subjects: Subject[];
  marks: Mark[];
  grades: Grade[];
  teachers?: Teacher[];
  allStudents: Student[];
  savedRemarks?: LearnerReportComment;
  nextTermOpeningDate?: string;
  aggregateRanking?: LearnerRankingMetadata;
  precalculatedExamResults?: any;
  precalculatedSubjectRanks?: Map<string, string>;
  precalculatedCohortInfo?: {
    gradeStudentIds: Set<string>;
    streamStudentIds: Set<string>;
    totalGradeAssessedStudents: number;
    streamAssessedStudentsCount: number;
    streamSubjectMeans?: Record<string, number | null>;
  };
}

function drawPdfImage(
  doc: jsPDF,
  imageDataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
  alias?: string
): boolean {
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) return false;

  const urlLower = imageDataUrl.toLowerCase();
  let primaryFormat: 'PNG' | 'JPEG' | 'WEBP' = 'PNG';
  if (
    urlLower.includes('data:image/jpeg') ||
    urlLower.includes('data:image/jpg') ||
    urlLower.endsWith('.jpg') ||
    urlLower.endsWith('.jpeg')
  ) {
    primaryFormat = 'JPEG';
  } else if (urlLower.includes('data:image/webp') || urlLower.endsWith('.webp')) {
    primaryFormat = 'WEBP';
  }

  const formatsToTry: Array<'PNG' | 'JPEG' | 'WEBP'> = [
    primaryFormat,
    primaryFormat === 'PNG' ? 'JPEG' : 'PNG',
    'WEBP',
  ];

  for (const fmt of formatsToTry) {
    try {
      if (alias) {
        doc.addImage(imageDataUrl, fmt, x, y, w, h, alias, 'FAST');
      } else {
        doc.addImage(imageDataUrl, fmt, x, y, w, h);
      }
      return true;
    } catch {
      // try next format
    }
  }

  try {
    if (alias) {
      (doc as any).addImage(imageDataUrl, x, y, w, h, alias, 'FAST');
    } else {
      (doc as any).addImage(imageDataUrl, x, y, w, h);
    }
    return true;
  } catch {
    return false;
  }
}

export function resolvePDFLearnerContext(
  student: Student,
  exam: Examination | undefined,
  classes: ClassStream[]
) {
  const examContext = exam ? getLearnerClassAtExamTime(student, exam, classes) : null;
  const isHistoricalContext = examContext?.is_historical === true;

  let targetClass =
    (classes || []).find(
      (c) =>
        student.stream_id &&
        (c.stream_id === student.stream_id || c.id === student.stream_id)
    ) || (classes || []).find((c) => c.id === student.class_id);

  if (isHistoricalContext) {
    if (examContext.historical_context_resolved && examContext.class_id) {
      targetClass =
        (classes || []).find(
          (c) =>
            examContext.stream_id &&
            (c.stream_id === examContext.stream_id || c.id === examContext.stream_id)
        ) ||
        (classes || []).find((c) => c.id === examContext.class_id) ||
        ({
          id: examContext.class_id,
          stream_id: examContext.stream_id,
          class_name: examContext.class_name,
          stream: examContext.stream_name,
          education_level: getEducationLevelForGrade(examContext.grade),
        } as ClassStream);
    } else {
      targetClass = undefined;
    }
  }

  const targetClassId = isHistoricalContext
    ? examContext?.class_id || ''
    : student.class_id || '';

  const targetStreamId = isHistoricalContext
    ? examContext?.stream_id || targetClass?.stream_id || ''
    : student.stream_id || targetClass?.stream_id || '';

  const classNameStr = isHistoricalContext
    ? examContext?.full_class_name || 'Unknown Grade'
    : targetClass
    ? `${targetClass.class_name} - ${targetClass.stream}`
    : student.class_id || student.grade || 'Grade 7';

  const studentGrade = isHistoricalContext
    ? examContext?.grade || 'Unknown Grade'
    : student.grade || targetClass?.class_name || '';

  const effectiveStudent: Student = isHistoricalContext
    ? {
        ...student,
        class_id: targetClassId,
        stream_id: targetStreamId,
        grade: studentGrade as Student['grade'],
      }
    : student;

  return {
    examContext,
    isHistoricalContext,
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  };
}

export function getLearnerReportSubjectsForExam(
  student: Student,
  classObj: ClassStream | undefined,
  subjects: Subject[],
  teachers: Teacher[] | undefined,
  exam: Examination | undefined,
  marks?: Mark[]
): Subject[] {
  const raw = getLearnerReportSubjects(student, classObj, subjects, teachers);
  const isUpperPrimary =
    (exam?.education_level || classObj?.education_level) === 'Upper Primary';
  const isG6OpenerT3 = exam && isGrade6OpenerTerm32026(exam);
  let effectiveExam = exam;

  if (isG6OpenerT3) {
    const hasSeparateMarks = hasSeparateSstAndCreMarks(student, exam, marks, subjects);
    if (hasSeparateMarks) {
      effectiveExam = !exam.ss_cre_structure
        ? { ...exam, ss_cre_structure: 'A' as const }
        : exam;
    } else {
      effectiveExam = { ...exam, ss_cre_structure: undefined };
    }
  }

  if (!isUpperPrimary) return raw;

  const isStandalone = exam?.assessment_structure === 'Standalone';
  const isAgnIncluded = isAgricultureIncludedInCompositeExam(exam, classObj, subjects);

  if (isStandalone) {
    return raw.filter((sb) => {
      if (isEnglishComposition(sb) || isKiswahiliInsha(sb) || isDirectSSCRE(sb)) return false;
      return true;
    });
  }

  const filtered = raw.filter((sb) => {
    if (isSocialStudies(sb) || isChristianReligiousEducation(sb)) return false;
    if (isAgricultureSubject(sb) && !isAgnIncluded) return false;
    return true;
  });

  if (!filtered.some(isDirectSSCRE)) {
    const directSubj = subjects.find(isDirectSSCRE) || {
      id: 'sb_up_ss_cre',
      subject_name: 'Social Studies&CRE',
      subject_code: 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
      applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] as any,
    };
    filtered.push(directSubj);
  }

  return filtered;
}

export function resolveNextTermOpeningDate(data: PDFReportData): string {
  const rawDate = (
    data.nextTermOpeningDate ||
    data.savedRemarks?.next_term_opening_date ||
    ''
  ).trim();
  if (!rawDate) {
    const isRequired = isNextTermOpeningDateRequired({
      student: data.student,
      exam: data.exam,
      classes: data.classes,
      grade: data.student?.grade,
      term: data.exam?.term,
    });
    if (isRequired) {
      throw new Error('Next Term Opening Date is required for official report card PDF generation');
    }
    return '';
  }

  return formatDateToKenyaHumanReadable(rawDate) || rawDate;
}

// In-memory cache for processed/downscaled base64 logos (URL -> optimized result)
const logoCache = new Map<string, { dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG' }>();

// Helper to convert image URL or base64 to optimized base64 data URL for jsPDF
export async function getBase64ImageFromUrl(
  imageUrl?: string | null
): Promise<{ dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG' } | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  const trimmed = imageUrl.trim();
  const cached = logoCache.get(trimmed);
  if (cached) {
    return cached;
  }

  // If running in Node.js / SSR environment without standard DOM Image
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    if (trimmed.startsWith('data:')) {
      const isJpeg = trimmed.includes('data:image/jpeg') || trimmed.includes('data:image/jpg');
      const res = { dataUrl: trimmed, width: 240, height: 240, format: isJpeg ? ('JPEG' as const) : ('PNG' as const) };
      logoCache.set(trimmed, res);
      return res;
    }
    return null;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      const img = new Image();
      // Only set crossOrigin for remote http(s) URLs; do NOT set for data: URIs (prevents canvas tainting / CORS failures)
      if (!trimmed.startsWith('data:')) {
        img.crossOrigin = 'Anonymous';
      }
      img.onload = () => {
        clearTimeout(timer);
        try {
          const MAX_DIM = 240;
          let width = img.naturalWidth || img.width || 240;
          let height = img.naturalHeight || img.height || 240;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);

            // Determine if image contains alpha/transparency
            let hasAlpha = false;
            try {
              const imgData = ctx.getImageData(0, 0, width, height);
              const data = imgData.data;
              for (let i = 3; i < data.length; i += 16) {
                if (data[i] < 250) {
                  hasAlpha = true;
                  break;
                }
              }
            } catch {
              // ignore
            }

            // Export as crisp JPEG (quality 0.85) if opaque for 8x smaller KB size, or PNG if transparent
            const format = hasAlpha ? 'PNG' : 'JPEG';
            const dataUrl = canvas.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', 0.85);
            const result = { dataUrl, width, height, format: format as 'PNG' | 'JPEG' };
            logoCache.set(trimmed, result);
            resolve(result);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = trimmed;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// -------------------------------------------------------------
// BLACK & WHITE ASSESSMENT REPORT PRESENTATION HELPERS
// -------------------------------------------------------------

/**
 * Draws the school's logo as a faint, centered background watermark behind report content.
 * Follows strict safety invariants:
 * - Does not modify currentY, margins, or page layout.
 * - Restores jsPDF graphics state using try/finally to prevent leaking opacity to subsequent drawing.
 * - Handles missing/empty/invalid logo gracefully without throwing.
 * - Centers the watermark vertically in the main content area with preserved aspect ratio.
 */
export function drawReportBackgroundWatermark(
  doc: jsPDF,
  logoObj: { dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG' } | null,
  pageWidth: number = 210,
  pageHeight: number = 297
): void {
  if (!logoObj || !logoObj.dataUrl || typeof logoObj.dataUrl !== 'string' || !logoObj.dataUrl.trim()) {
    return;
  }

  try {
    const { dataUrl, width, height, format = 'PNG' } = logoObj;

    // Target watermark diameter/box: ~95mm to sit handsomely in the page body
    const maxWatermarkSize = 95;
    let w = maxWatermarkSize;
    let h = maxWatermarkSize;

    if (width && height && height > 0) {
      const aspect = width / height;
      if (aspect >= 1) {
        w = maxWatermarkSize;
        h = maxWatermarkSize / aspect;
      } else {
        h = maxWatermarkSize;
        w = maxWatermarkSize * aspect;
      }
    }

    // Center horizontally on page (cx = 105mm)
    const x = (pageWidth - w) / 2;
    // Center vertically in the body content area (page center cy ~ 148.5mm)
    const y = (pageHeight - h) / 2;

    const anyDoc = doc as any;
    const hasGState = typeof anyDoc.GState === 'function' && typeof anyDoc.setGState === 'function';
    const hasSaveRestore = typeof anyDoc.saveGraphicsState === 'function' && typeof anyDoc.restoreGraphicsState === 'function';

    if (hasSaveRestore) {
      anyDoc.saveGraphicsState();
    }

    try {
      if (hasGState) {
        // Subtle, professional faint watermark (~14% opacity for print & digital legibility)
        anyDoc.setGState(new anyDoc.GState({ opacity: 0.14 }));
      }

      if (typeof doc.addImage === 'function') {
        doc.addImage(dataUrl, format, x, y, w, h, 'school_report_watermark', 'FAST');
      }
    } finally {
      if (hasSaveRestore) {
        anyDoc.restoreGraphicsState();
      } else if (hasGState) {
        anyDoc.setGState(new anyDoc.GState({ opacity: 1.0 }));
      }
    }
  } catch (err) {
    // Failsafe: Never allow watermark drawing failure to abort report generation
    console.warn('Could not draw school background watermark on report card:', err);
  }
}

async function drawBwReportHeader(
  doc: jsPDF,
  school: School,
  exam: Examination | undefined,
  currentY: number,
  pageWidth: number
): Promise<number> {
  const logoObj = await getBase64ImageFromUrl(school.logo_url);

  if (logoObj) {
    const { dataUrl, width, height, format = 'PNG' } = logoObj;
    let logoDisplayW = 14;
    let logoDisplayH = 14;
    if (width && height && height > 0) {
      const aspect = width / height;
      if (aspect >= 1) {
        logoDisplayW = 14;
        logoDisplayH = Math.min(14, 14 / aspect);
      } else {
        logoDisplayH = 14;
        logoDisplayW = Math.min(14, 14 * aspect);
      }
    }
    const logoX = (pageWidth - logoDisplayW) / 2;
    try {
      doc.addImage(dataUrl, format, logoX, currentY, logoDisplayW, logoDisplayH, 'school_report_logo', 'FAST');
      currentY += logoDisplayH + 1.5;
    } catch (err) {
      console.warn('Failed to embed school logo in PDF:', err);
    }
  }

  // School Name (Uppercase, Bold, Centered)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    (school.school_name || 'School Name Not Configured').toUpperCase(),
    pageWidth / 2,
    currentY + 3.5,
    { align: 'center' }
  );
  currentY += 4.5;

  // School Motto (No quotes, Centered)
  if (school.motto) {
    const cleanMotto = stripSurroundingQuotes(school.motto);
    if (cleanMotto) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(cleanMotto, pageWidth / 2, currentY + 3, { align: 'center' });
      currentY += 4.5;
    }
  }

  currentY += 1.5;

  // Report Title (Bold, Centered)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNER ASSESSMENT REPORT', pageWidth / 2, currentY + 3, { align: 'center' });
  currentY += 4.5;

  // Term & Year (Bold, Centered)
  const termStr = (exam?.term || 'Term 3').toUpperCase();
  const yearStr = String(exam?.year || new Date().getFullYear());
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`${termStr} • ${yearStr}`, pageWidth / 2, currentY + 3, { align: 'center' });
  currentY += 5.5;

  return currentY;
}

function drawBwLearnerInfo(
  doc: jsPDF,
  student: Student,
  targetClass: ClassStream | undefined,
  exam: Examination | undefined,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 17;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  const learnerName =
    (student.full_name || `${student.first_name || ''} ${student.last_name || ''}`)
      .trim()
      .toUpperCase() || 'LEARNER';
  const admNo = student.admission_number || '-';
  const gradeStr = (student.grade || targetClass?.class_name || 'GRADE').toUpperCase();
  const streamStr = (targetClass?.stream || (student as any).stream || '-').toUpperCase();
  const examDisplayName = getDisplayExamName(exam?.exam_name) || 'ASSESSMENT';

  const col1X = marginX + 3;
  const col1ValX = marginX + 28;
  const col2X = marginX + 112;
  const col2ValX = marginX + 132;

  // Row 1: LEARNER & ADM NO.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNER', col1X, currentY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(learnerName, col1ValX, currentY + 4.5, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.text('ADM NO.', col2X, currentY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(admNo, col2ValX, currentY + 4.5, { maxWidth: 55 });

  // Row 2: GRADE & STREAM
  doc.setFont('helvetica', 'bold');
  doc.text('GRADE', col1X, currentY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(gradeStr, col1ValX, currentY + 9.5, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.text('STREAM', col2X, currentY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(streamStr, col2ValX, currentY + 9.5, { maxWidth: 55 });

  // Row 3: ASSESSMENT
  doc.setFont('helvetica', 'bold');
  doc.text('ASSESSMENT', col1X, currentY + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    examDisplayName.toUpperCase(),
    col1ValX,
    currentY + 14.5,
    { maxWidth: 155 }
  );

  return currentY + boxH + 2.5;
}

function drawBwAssessmentSummary(
  doc: jsPDF,
  summaryData: {
    totalMarks: number;
    maxPossibleMarks: number;
    averageScore: number;
    overallLevel: string;
    totalPoints: number;
    maxPossiblePoints: number;
    streamRank: string;
    streamTotal: number;
    overallRank: string;
    overallTotal: number;
    isComplete: boolean;
  },
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 20;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  // Section Header: ASSESSMENT SUMMARY
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  doc.text('ASSESSMENT SUMMARY', marginX + contentWidth / 2, currentY + 3.8, {
    align: 'center',
  });
  doc.line(marginX, currentY + 5.2, marginX + contentWidth, currentY + 5.2);

  // Row 1 (4 Columns): TOTAL SCORE | AVERAGE | CBE LEVEL | TOTAL POINTS
  const colW4 = contentWidth / 4;
  const row1LabelY = currentY + 8.4;
  const row1ValY = currentY + 12.4;

  const scoreStr = `${summaryData.totalMarks} / ${summaryData.maxPossibleMarks}`;
  const avgStr = formatPercentage(summaryData.averageScore, true);
  const levelStr = summaryData.isComplete ? summaryData.overallLevel : 'Pending';
  const ptsStr = summaryData.isComplete
    ? `${summaryData.totalPoints} / ${summaryData.maxPossiblePoints}`
    : '-';

  const row1Metrics = [
    { label: 'TOTAL SCORE', val: scoreStr },
    { label: 'AVERAGE', val: avgStr },
    { label: 'CBE LEVEL', val: levelStr },
    { label: 'TOTAL POINTS', val: ptsStr },
  ];

  row1Metrics.forEach((m, i) => {
    const cx = marginX + i * colW4 + colW4 / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(m.label, cx, row1LabelY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(m.val, cx, row1ValY, { align: 'center' });
    if (i > 0) {
      doc.line(
        marginX + i * colW4,
        currentY + 5.2,
        marginX + i * colW4,
        currentY + 14.0
      );
    }
  });

  doc.line(marginX, currentY + 14.0, marginX + contentWidth, currentY + 14.0);

  // Row 2 (2 Columns): STREAM RANK | OVERALL RANK
  const colW2 = contentWidth / 2;
  const row2Y = currentY + 18.0;

  const sRankStr =
    summaryData.isComplete && summaryData.streamRank !== 'Not Ranked'
      ? `${summaryData.streamRank} OF ${summaryData.streamTotal}`
      : summaryData.streamRank;

  const oRankStr =
    summaryData.isComplete && summaryData.overallRank !== 'Not Ranked'
      ? `${summaryData.overallRank} OF ${summaryData.overallTotal}`
      : summaryData.overallRank;

  // Stream Rank (Col 1)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('STREAM RANK:', marginX + 18, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(sRankStr, marginX + 44, row2Y);

  doc.line(
    marginX + colW2,
    currentY + 14.0,
    marginX + colW2,
    currentY + boxH
  );

  // Overall Rank (Col 2)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('OVERALL RANK:', marginX + colW2 + 18, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(oRankStr, marginX + colW2 + 46, row2Y);

  return currentY + boxH + 2.5;
}

function drawBwRemarks(
  doc: jsPDF,
  ctName: string,
  ctComment: string,
  hoiName: string,
  hoiComment: string,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  // Teacher's Remarks Box
  const boxH1 = 13.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("CLASS TEACHER'S REMARKS", marginX + 3, currentY + 3.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  const ctFullText = `Class Teacher (Tr. ${ctName}): ${ctComment}`;
  doc.text(ctFullText, marginX + 3, currentY + 7.8, {
    maxWidth: contentWidth - 6,
  });

  currentY += boxH1 + 2.0;

  // Head of Institution Remarks Box
  const boxH2 = 13.5;
  doc.rect(marginX, currentY, contentWidth, boxH2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('HEAD OF INSTITUTION REMARKS', marginX + 3, currentY + 3.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  const hoiFullText = `Head of Institution (${hoiName}): ${hoiComment}`;
  doc.text(hoiFullText, marginX + 3, currentY + 7.8, {
    maxWidth: contentWidth - 6,
  });

  currentY += boxH2 + 2.0;

  return currentY;
}

function drawBwCbeKey(
  doc: jsPDF,
  isJuniorSchool: boolean,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  if (isJuniorSchool) {
    // 8-Level Junior School Performance Scale (4 columns x 2 rows)
    const headerH = 3.6;
    const rowH = 5.2;
    const boxH = headerH + rowH * 2; // 14.0 mm
    const numCols = 4;
    const colW = contentWidth / numCols; // 47.5 mm

    // Outer border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(marginX, currentY, contentWidth, boxH);

    // Header background & title
    doc.setFillColor(243, 244, 246);
    doc.rect(marginX, currentY, contentWidth, headerH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(0, 0, 0);
    doc.text('CBE LEVEL KEY', marginX + 3, currentY + 2.6);

    // Row divider
    doc.line(marginX, currentY + headerH + rowH, marginX + contentWidth, currentY + headerH + rowH);

    // Column dividers
    for (let c = 1; c < numCols; c++) {
      const colX = marginX + c * colW;
      doc.line(colX, currentY + headerH, colX, currentY + boxH);
    }

    // 8 Level items
    const levels = [
      // Row 1
      [
        { code: 'EE1 (90–100%)', pts: '8 Points', desc: 'Exceeding Expectations' },
        { code: 'EE2 (75–89%)', pts: '7 Points', desc: 'Exceeding Expectations' },
        { code: 'ME1 (58–74%)', pts: '6 Points', desc: 'Meeting Expectations' },
        { code: 'ME2 (41–57%)', pts: '5 Points', desc: 'Meeting Expectations' },
      ],
      // Row 2
      [
        { code: 'AE1 (31–40%)', pts: '4 Points', desc: 'Approaching Expectations' },
        { code: 'AE2 (21–30%)', pts: '3 Points', desc: 'Approaching Expectations' },
        { code: 'BE1 (11–20%)', pts: '2 Points', desc: 'Below Expectations' },
        { code: 'BE2 (1–10%)', pts: '1 Point', desc: 'Below Expectations' },
      ],
    ];

    levels.forEach((row, rIdx) => {
      const cellY = currentY + headerH + rIdx * rowH;
      row.forEach((item, cIdx) => {
        const cellX = marginX + cIdx * colW;
        // Line 1: Code and Points in bold 6.8pt
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(0, 0, 0);
        doc.text(`${item.code} • ${item.pts}`, cellX + 2.2, cellY + 2.3);

        // Line 2: Descriptor in normal 6.0pt
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.0);
        doc.setTextColor(40, 40, 40);
        doc.text(item.desc, cellX + 2.2, cellY + 4.3);
      });
    });

    return currentY + boxH + 2.0;
  } else {
    // 4-Level Primary School Performance Scale (4 columns x 1 row)
    const headerH = 3.6;
    const rowH = 5.6;
    const boxH = headerH + rowH; // 9.2 mm
    const numCols = 4;
    const colW = contentWidth / numCols; // 47.5 mm

    // Outer border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(marginX, currentY, contentWidth, boxH);

    // Header background & title
    doc.setFillColor(243, 244, 246);
    doc.rect(marginX, currentY, contentWidth, headerH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(0, 0, 0);
    doc.text('CBE LEVEL KEY', marginX + 3, currentY + 2.6);

    // Column dividers
    for (let c = 1; c < numCols; c++) {
      const colX = marginX + c * colW;
      doc.line(colX, currentY + headerH, colX, currentY + boxH);
    }

    const levels = [
      { code: 'EE (80–100%)', pts: '4 Points', desc: 'Exceeding Expectations' },
      { code: 'ME (50–79%)', pts: '3 Points', desc: 'Meeting Expectations' },
      { code: 'AE (30–49%)', pts: '2 Points', desc: 'Approaching Expectations' },
      { code: 'BE (0–29%)', pts: '1 Point', desc: 'Below Expectations' },
    ];

    const cellY = currentY + headerH;
    levels.forEach((item, cIdx) => {
      const cellX = marginX + cIdx * colW;
      // Line 1: Code and Points in bold 7.0pt
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.0);
      doc.setTextColor(0, 0, 0);
      doc.text(`${item.code} • ${item.pts}`, cellX + 2.5, cellY + 2.5);

      // Line 2: Descriptor in normal 6.2pt
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(40, 40, 40);
      doc.text(item.desc, cellX + 2.5, cellY + 4.7);
    });

    return currentY + boxH + 2.0;
  }
}

/**
 * Safely shortens excessively long custom teacher remarks without blind truncation.
 * Invariants:
 * 1. Preserves already concise remarks (up to ~13 words, single sentence).
 * 2. If multi-sentence, selects the first complete sentence.
 * 3. Never splits mid-word; truncates cleanly on word boundaries with an ellipsis only when necessary.
 */
export function shortenCustomComment(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = stripSurroundingQuotes(raw.trim());
  if (!cleaned) return '';

  // Split into sentences (handles '.', '!', '?')
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstSentence = sentences[0] || cleaned;
  const firstSentenceWords = firstSentence.split(/\s+/).filter(Boolean);

  // If multi-sentence and first sentence is a reasonable remark (up to 13 words), use first sentence
  if (sentences.length > 1 && firstSentenceWords.length >= 3 && firstSentenceWords.length <= 13) {
    return firstSentence;
  }

  // If single sentence and already concise (up to 13 words), preserve completely
  if (firstSentenceWords.length <= 13 && !cleaned.includes('\n')) {
    return cleaned;
  }

  // If first sentence is still too long (> 13 words), find a natural clause break (;, :) between word 5 and 12
  const clauseMatch = firstSentence.match(/^([^;:\n]{20,80})[;:]/);
  if (clauseMatch) {
    const clauseWords = clauseMatch[1].trim().split(/\s+/).filter(Boolean);
    if (clauseWords.length >= 5 && clauseWords.length <= 13) {
      return clauseMatch[1].trim() + '.';
    }
  }

  // Otherwise, cleanly take the first 11 words with an ellipsis, never breaking a word
  return firstSentenceWords.slice(0, 11).join(' ') + '...';
}

/**
 * Generates a short, natural Zeraki-style CBE subject remark (2–6 words)
 * consistent with the learner's actual performance and subject domain.
 */
export function getConciseSubjectDefaultComment(
  subjectName: string = '',
  percentage: number | null | undefined
): string {
  if (percentage === null || percentage === undefined || isNaN(percentage)) {
    return 'Missing assessment (X)';
  }

  const score = Math.round(percentage);
  const name = subjectName.toLowerCase();

  // 1. Mathematics / Numeracy
  if (name.includes('math')) {
    if (score >= 75) return 'Excellent work, keep it up';
    if (score >= 50) return 'Good work, practise problem-solving';
    if (score >= 30) return 'Practise calculations regularly';
    return 'Needs more practice in calculations';
  }

  // 2. English / Literacy / Languages
  if (name.includes('english') || name.includes('literacy') || name.includes('reading') || name.includes('language')) {
    if (score >= 75) return 'Excellent reading and comprehension';
    if (score >= 50) return 'Good progress, improve grammar';
    if (score >= 30) return 'Practise reading and grammar';
    return 'Needs more reading practice';
  }

  // 3. Science / Integrated Science / Environmental / Science & Tech
  if (name.includes('science') || name.includes('environmental')) {
    if (score >= 75) return 'Excellent understanding of science';
    if (score >= 50) return 'Good progress, aim higher';
    if (score >= 30) return 'Revise scientific concepts regularly';
    return 'Needs more revision in science';
  }

  // 4. Creative Arts / Sports / Music / Art / Craft / Physical Education
  if (name.includes('creative') || name.includes('art') || name.includes('music') || name.includes('craft') || name.includes('sport') || name.includes('physical')) {
    if (score >= 75) return 'Very good practical work';
    if (score >= 50) return 'Good progress, keep practising';
    if (score >= 30) return 'More practical practice needed';
    return 'Needs more practice';
  }

  // 5. Social Studies / Religious Education (CRE / IRE / HRE) / SST
  if (
    name.includes('social') ||
    /\bcre\b/.test(name) ||
    name.includes('c.r.e') ||
    name.includes('ire') ||
    name.includes('hre') ||
    name.includes('religious') ||
    name.includes('christian') ||
    name.includes('islamic') ||
    name.includes('sst')
  ) {
    if (score >= 75) return 'Very good work, keep it up';
    if (score >= 50) return 'Good progress, aim higher';
    if (score >= 30) return 'Revise topics regularly';
    return 'Needs regular revision';
  }

  // 6. Agriculture / Pre-Technical / Home Science / Business
  if (name.includes('agri') || name.includes('tech') || name.includes('home sci') || name.includes('business')) {
    if (score >= 75) return 'Very good practical skills';
    if (score >= 50) return 'Good work, aim higher';
    if (score >= 30) return 'More practical practice needed';
    return 'Needs more practice';
  }

  // 7. General CBE Fallback
  if (score >= 75) return 'Excellent work, keep it up';
  if (score >= 50) return 'Good work, aim higher';
  if (score >= 30) return 'Can do better, aim higher';
  return 'Needs more practice';
}

/**
 * Direct helper for flexible default Kiswahili comments in report generation.
 */
export function getFlexibleKiswahiliSubjectComment(
  scoreOrPercentage: number | null | undefined,
  status?: string,
  irregularityReason?: string,
  options?: {
    subject?: Subject | { subject_name?: string; subject_code?: string; id?: string; name?: string; code?: string } | null;
    student?: Student | { id?: string; admission_number?: string; full_name?: string } | null;
    seed?: string | number;
    learningAreaType?: 'lugha' | 'insha' | 'activities' | 'general';
    educationLevel?: string;
  }
): string {
  return getKiswahiliDefaultComment(scoreOrPercentage, status, irregularityReason, options);
}

/**
 * Resolves the subject-level comment for a given learning area in regular report forms.
 * Follows strict priority:
 * 1. Custom subject comment from savedRemarks.subject_comments (keyed by subject ID or name/code),
 *    shortened if excessively long without changing meaning.
 * 2. Authentic Kiswahili assessment remarks if subject is Kiswahili (supporting varied comments,
 *    learning area matching, and deterministic variation per learner).
 * 3. Concise domain-tailored CBE mastery comment based on percentage score (5–12 words, 1 sentence).
 * 4. Special status handling for Irregularity ('Y') or Missing ('X').
 */
export function resolveReportSubjectComment(
  subject: Subject,
  markInfo: { status: 'Normal' | 'X' | 'Y' | 'Blank'; percentage: number | null; irregularityReason?: string },
  savedRemarks?: LearnerReportComment,
  student?: Student | { id?: string; admission_number?: string; full_name?: string } | null,
  educationLevel?: string
): string {
  const customComments = savedRemarks?.subject_comments;
  const customComment =
    customComments?.[subject.id] ||
    (subject.subject_name ? customComments?.[subject.subject_name] : undefined) ||
    (subject.subject_code ? customComments?.[subject.subject_code] : undefined);
  if (customComment && typeof customComment === 'string' && customComment.trim()) {
    return shortenCustomComment(customComment);
  }

  const isKisw = isKiswahiliSubject(subject);
  if (isKisw) {
    return getKiswahiliDefaultComment(
      markInfo.percentage,
      markInfo.status,
      markInfo.irregularityReason,
      {
        subject,
        student,
        educationLevel,
      }
    );
  }

  if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
    return getConciseSubjectDefaultComment(subject.subject_name, markInfo.percentage);
  } else if (markInfo.status === 'Y') {
    return `Irregularity (${markInfo.irregularityReason || 'Absent'})`;
  } else {
    return 'Missing Assessment (X)';
  }
}

function drawBwSignatures(
  doc: jsPDF,
  classTeacher: Teacher | undefined,
  school: School,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 14.5;
  const colW = contentWidth / 3;

  const sigBoxes = [
    { title: 'CLASS TEACHER', label: 'Signature: __________' },
    { title: 'HEAD OF INSTITUTION', label: 'Sign & Seal: __________' },
    { title: 'PARENT / GUARDIAN', label: 'Signature: __________' },
  ];

  sigBoxes.forEach((sig, idx) => {
    const x = marginX + idx * colW;
    const boxW = colW - (idx === 2 ? 0 : 2);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(x, currentY, boxW, boxH);

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(sig.title, x + boxW / 2, currentY + 3.8, { align: 'center' });

    let drawn = false;
    if (idx === 0 && classTeacher?.signature_url) {
      drawn = drawPdfImage(
        doc,
        classTeacher.signature_url,
        x + boxW / 2 - 14,
        currentY + 4.5,
        28,
        7.5,
        `sig_ct_${classTeacher.id || 'default'}`
      );
    } else if (idx === 1 && school?.stamp_url) {
      drawn = drawPdfImage(
        doc,
        school.stamp_url,
        x + boxW / 2 - 14,
        currentY + 4.5,
        28,
        7.5,
        'school_stamp'
      );
    }

    if (!drawn) {
      doc.setFontSize(6.8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(sig.label, x + boxW / 2, currentY + 10.8, { align: 'center' });
    }
  });

  return currentY + boxH + 2.5;
}

export interface GraphValuePoint {
  x: number;
  y: number;
  pct: number;
  subjectIndex: number;
}

export interface GraphLabelPosition {
  series: 'stream' | 'learner';
  x: number;
  y: number; // text baseline
  pct: number;
  text: string;
  subjectIndex: number;
}

// Helper for drawing sharp, solid vector diamond markers in jsPDF
function drawDiamond(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(15, 23, 42);
  doc.triangle(cx, cy - r, cx + r, cy, cx, cy + r, 'F');
  doc.triangle(cx, cy - r, cx - r, cy, cx, cy + r, 'F');
}

/**
 * Computes non-overlapping value label positions for Junior School Subject Performance Comparison Graph.
 *
 * Requirements & Invariants:
 * - Both series use the exact same x-coordinate aligned with subject labels.
 * - Learner values placed ABOVE their markers (yl < marker.y).
 * - Stream Mean values placed BELOW their markers (ys > marker.y).
 * - Boundary handling: values near 0% kept strictly above baseline and subject short codes (<= Y_MAX);
 *   values near 100% kept within container box below header and legend (>= Y_MIN).
 * - Deterministic collision avoidance guarantees minimum vertical separation between labels.
 */
export function computeGraphValueLabelPositions(
  learnerPoints: GraphValuePoint[],
  streamPoints: GraphValuePoint[],
  plotTop: number,
  plotBottom: number,
  currentY: number,
  boxH: number
): { learnerLabels: GraphLabelPosition[]; streamLabels: GraphLabelPosition[] } {
  const learnerLabels: GraphLabelPosition[] = [];
  const streamLabels: GraphLabelPosition[] = [];

  const Y_MIN = currentY + 4.2; // Keep inside container box and below header/legend
  const Y_MAX = plotBottom - 0.5; // Keep strictly above x-axis tick and subject codes
  const MIN_VERT_SEP = 2.4; // Minimum vertical distance between text baselines (mm)

  // Index points by subjectIndex
  const learnerMap = new Map<number, GraphValuePoint>();
  learnerPoints.forEach((p) => learnerMap.set(p.subjectIndex, p));

  const streamMap = new Map<number, GraphValuePoint>();
  streamPoints.forEach((p) => streamMap.set(p.subjectIndex, p));

  // Collect all unique subject indices
  const allSubjectIndices = Array.from(
    new Set([...learnerMap.keys(), ...streamMap.keys()])
  ).sort((a, b) => a - b);

  for (const idx of allSubjectIndices) {
    const lPt = learnerMap.get(idx);
    const sPt = streamMap.get(idx);

    if (lPt && sPt) {
      // Invariant: Learner values placed ABOVE their markers (yl < lPt.y).
      // Stream Mean values placed BELOW their markers (ys > sPt.y).
      let yl = lPt.y - 2.0;
      let ys = sPt.y + 2.8;

      // Boundary clamping
      if (yl < Y_MIN) yl = Y_MIN;
      if (yl > Y_MAX) yl = Y_MAX;
      if (ys < Y_MIN) ys = Y_MIN;
      if (ys > Y_MAX) ys = Y_MAX;

      // Ensure minimum vertical separation (MIN_VERT_SEP)
      const currentSep = Math.abs(yl - ys);
      if (currentSep < MIN_VERT_SEP) {
        const needed = MIN_VERT_SEP - currentSep;
        if (ys >= yl) {
          // ys is below yl (larger y in PDF space)
          if (ys + needed / 2 > Y_MAX) {
            ys = Y_MAX;
            yl = Math.max(Y_MIN, ys - MIN_VERT_SEP);
          } else if (yl - needed / 2 < Y_MIN) {
            yl = Y_MIN;
            ys = Math.min(Y_MAX, yl + MIN_VERT_SEP);
          } else {
            yl -= needed / 2;
            ys += needed / 2;
          }
        } else {
          // yl is below ys (larger y in PDF space)
          if (yl + needed / 2 > Y_MAX) {
            yl = Y_MAX;
            ys = Math.max(Y_MIN, yl - MIN_VERT_SEP);
          } else if (ys - needed / 2 < Y_MIN) {
            ys = Y_MIN;
            yl = Math.min(Y_MAX, ys + MIN_VERT_SEP);
          } else {
            ys -= needed / 2;
            yl += needed / 2;
          }
        }
      }

      // Hard containment checks
      if (yl < Y_MIN) yl = Y_MIN;
      if (yl > Y_MAX) yl = Y_MAX;
      if (ys < Y_MIN) ys = Y_MIN;
      if (ys > Y_MAX) ys = Y_MAX;

      streamLabels.push({
        series: 'stream',
        x: sPt.x,
        y: ys,
        pct: sPt.pct,
        text: `${Math.round(sPt.pct)}`,
        subjectIndex: idx,
      });

      learnerLabels.push({
        series: 'learner',
        x: lPt.x,
        y: yl,
        pct: lPt.pct,
        text: `${Math.round(lPt.pct)}`,
        subjectIndex: idx,
      });
    } else if (lPt) {
      // Only Learner exists (place above point by default, below if near 100%)
      let yl = lPt.pct >= 98 ? lPt.y + 2.8 : lPt.y - 2.0;
      if (yl < Y_MIN) yl = Y_MIN;
      if (yl > Y_MAX) yl = Y_MAX;

      learnerLabels.push({
        series: 'learner',
        x: lPt.x,
        y: yl,
        pct: lPt.pct,
        text: `${Math.round(lPt.pct)}`,
        subjectIndex: idx,
      });
    } else if (sPt) {
      // Only Stream Mean exists (place below point by default, above if near 0%)
      let ys = sPt.pct <= 5 ? sPt.y - 2.0 : sPt.y + 2.8;
      if (ys > Y_MAX) ys = Y_MAX;
      if (ys < Y_MIN) ys = Y_MIN;

      streamLabels.push({
        series: 'stream',
        x: sPt.x,
        y: ys,
        pct: sPt.pct,
        text: `${Math.round(sPt.pct)}`,
        subjectIndex: idx,
      });
    }
  }

  // Cross-subject clearance check
  const allLabels = [...streamLabels, ...learnerLabels].sort((a, b) => a.x - b.x);
  for (let i = 0; i < allLabels.length - 1; i++) {
    const cur = allLabels[i];
    const nxt = allLabels[i + 1];
    if (cur.subjectIndex !== nxt.subjectIndex) {
      const dx = nxt.x - cur.x;
      const dy = Math.abs(nxt.y - cur.y);
      if (dx < 3.2 && dy < 2.0) {
        if (nxt.y >= cur.y) {
          nxt.y = Math.min(Y_MAX, nxt.y + 1.2);
          cur.y = Math.max(Y_MIN, cur.y - 1.2);
        } else {
          cur.y = Math.min(Y_MAX, cur.y + 1.2);
          nxt.y = Math.max(Y_MIN, nxt.y - 1.2);
        }
      }
    }
  }

  return { learnerLabels, streamLabels };
}

/**
 * Draws the Junior School Subject Performance Comparison Graph.
 * Option A: Connected Line Graph
 *
 * Requirements & Invariants:
 * 1. Learner series: green solid connected line with circle markers.
 * 2. Stream Mean series: dark grey/black dashed connected line with diamond markers.
 * 3. Align markers: Both series use the exact same x-coordinate for each subject,
 *    directly aligned with the subject labels (no horizontal offset).
 * 4. Prevent overlapping labels: Learner values above their points; Stream Mean values below.
 * 5. Y-axis: 0–100% range with gridlines at 0%, 25%, 50%, 75%, 100%, with "%" in axis labels.
 * 6. Legend: Kept at top right with line and marker indicators.
 * 7. Chart height: Preserves current chart height.
 * 8. Page layout: Kept on one A4 page.
 */
export function drawJuniorSchoolSubjectComparisonGraph(
  doc: jsPDF,
  learnerSubjects: Subject[],
  studentMarks: Mark[],
  streamSubjectMeans: Record<string, number | null>,
  currentY: number,
  marginX: number,
  contentWidth: number,
  examId: string,
  studentId: string,
  targetClass?: ClassStream
): number {
  const targetSigTop = 264.0;
  const availableSpace = targetSigTop - 3.5 - currentY;
  if (availableSpace < 22 || !learnerSubjects || learnerSubjects.length === 0) {
    return currentY;
  }

  const boxH = Math.min(48, Math.max(26, availableSpace));

  // 1. Surrounding Container
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  // 2. Title & Distinct Series Legend (Top Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  doc.text('SUBJECT PERFORMANCE COMPARISON', marginX + 3.5, currentY + 3.8);

  const legY = currentY + 3.8;
  const leg1X = marginX + contentWidth - 52;
  const leg2X = marginX + contentWidth - 24;

  // Legend 1: Stream Mean (clean dark grey/black dashed wings + diamond marker)
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  (doc as any).setLineDashPattern?.([], 0);
  (doc as any).setLineDash?.([]);
  doc.line(leg1X, legY - 0.9, leg1X + 1.8, legY - 0.9);
  doc.line(leg1X + 3.2, legY - 0.9, leg1X + 5.0, legY - 0.9);
  drawDiamond(doc, leg1X + 2.5, legY - 0.9, 1.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(0, 0, 0);
  doc.text('Stream Mean', leg1X + 6.2, legY);

  // Legend 2: Learner (green solid line + circle marker)
  doc.setDrawColor(4, 120, 87);
  doc.setLineWidth(0.35);
  doc.line(leg2X, legY - 0.9, leg2X + 5, legY - 0.9);
  doc.setFillColor(5, 150, 105);
  doc.circle(leg2X + 2.5, legY - 0.9, 1.15, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(4, 120, 87);
  doc.text('Learner', leg2X + 6.2, legY);

  // 3. Plot Geometry
  const plotLeft = marginX + 11.5;
  const plotRight = marginX + contentWidth - 4;
  const plotWidth = plotRight - plotLeft;
  const plotTop = currentY + 6.2;
  const plotBottom = currentY + boxH - 5.5;
  const plotHeight = plotBottom - plotTop;

  // 4. Vertical Grid Lines & Ticks (0%, 25%, 50%, 75%, 100%)
  const yTicks = [0, 25, 50, 75, 100];
  for (const val of yTicks) {
    const y = plotBottom - (val / 100) * plotHeight;
    doc.setDrawColor(228, 228, 228);
    doc.setLineWidth(0.15);
    doc.line(plotLeft, y, plotRight, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.setTextColor(100, 100, 100);
    doc.text(`${val}%`, plotLeft - 1.2, y + 0.8, { align: 'right' });
  }

  // 5. X-Axis Baseline
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(plotLeft, plotBottom, plotRight, plotBottom);

  // 6. Compute Data Points (Both series directly aligned with xc, no horizontal offset)
  const N = learnerSubjects.length;
  const learnerPoints: GraphValuePoint[] = [];
  const streamPoints: GraphValuePoint[] = [];

  learnerSubjects.forEach((sb, i) => {
    const xc = N === 1 ? plotLeft + plotWidth / 2 : plotLeft + (i + 0.5) * (plotWidth / N);

    // Subject baseline tick
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(xc, plotBottom, xc, plotBottom + 0.8);

    // Subtle category column guide
    doc.setDrawColor(240, 240, 240);
    doc.setLineWidth(0.15);
    doc.line(xc, plotTop, xc, plotBottom);

    // Subject label (verified short display code)
    const code = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Junior School');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(0, 0, 0);
    doc.text(code, xc, plotBottom + 3.6, { align: 'center' });

    // Learner mark percentage
    const stdMark = studentMarks.find(
      (m) => m.student_id === studentId && (m.subject_id === sb.id || m.subject_id === sb.subject_code) && m.exam_id === examId
    );
    const ev = evaluateMark(stdMark, { subject: sb, classObj: targetClass, educationLevel: 'Junior School' });
    const hasLearner = ev.status === 'Normal' && ev.percentage !== null && !isNaN(ev.percentage);

    // Stream mean percentage
    const meanVal = streamSubjectMeans ? (streamSubjectMeans[sb.id] ?? (sb.subject_code ? streamSubjectMeans[sb.subject_code] : null)) : null;
    const hasStream = meanVal !== null && meanVal !== undefined && !isNaN(meanVal);

    if (hasLearner) {
      const learnerPct = Math.min(100, Math.max(0, ev.percentage!));
      const learnerY = plotBottom - (learnerPct / 100) * plotHeight;
      learnerPoints.push({ x: xc, y: learnerY, pct: learnerPct, subjectIndex: i });
    }

    if (hasStream) {
      const meanPct = Math.min(100, Math.max(0, meanVal!));
      const meanY = plotBottom - (meanPct / 100) * plotHeight;
      streamPoints.push({ x: xc, y: meanY, pct: meanPct, subjectIndex: i });
    }
  });

  // 7. Render Connected Lines (Only connecting adjacent assessed subjects)
  // Stream Mean Connected Line: dark grey/black dashed connected line
  if (streamPoints.length > 1) {
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.35);
    (doc as any).setLineDashPattern?.([1.8, 1.2], 0);
    (doc as any).setLineDash?.([1.8, 1.2], 0);
    for (let i = 0; i < streamPoints.length - 1; i++) {
      if (streamPoints[i + 1].subjectIndex === streamPoints[i].subjectIndex + 1) {
        doc.line(streamPoints[i].x, streamPoints[i].y, streamPoints[i + 1].x, streamPoints[i + 1].y);
      }
    }
    (doc as any).setLineDashPattern?.([], 0);
    (doc as any).setLineDash?.([]);
  }

  // Learner Connected Line: green solid connected line
  if (learnerPoints.length > 1) {
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.4);
    (doc as any).setLineDashPattern?.([], 0);
    (doc as any).setLineDash?.([]);
    for (let i = 0; i < learnerPoints.length - 1; i++) {
      if (learnerPoints[i + 1].subjectIndex === learnerPoints[i].subjectIndex + 1) {
        doc.line(learnerPoints[i].x, learnerPoints[i].y, learnerPoints[i + 1].x, learnerPoints[i + 1].y);
      }
    }
  }

  // 8. Render Markers
  // Stream Mean Series: Solid Dark Diamond
  streamPoints.forEach((pt) => {
    drawDiamond(doc, pt.x, pt.y, 1.3);
  });

  // Learner Series: Green circle marker with outline
  learnerPoints.forEach((pt) => {
    doc.setFillColor(5, 150, 105);
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.35);
    doc.circle(pt.x, pt.y, 1.2, 'FD');
  });

  // 9. Compute Non-Overlapping Value Label Positions
  const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
    learnerPoints,
    streamPoints,
    plotTop,
    plotBottom,
    currentY,
    boxH
  );

  // Render Learner Labels (Bold emerald green, 5.0pt, placed above marker)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(4, 120, 87);
  learnerLabels.forEach((lbl) => {
    doc.text(lbl.text, lbl.x, lbl.y, { align: 'center' });
  });

  // Render Stream Mean Labels (Bold solid dark slate, 5.0pt, placed below marker)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(15, 23, 42);
  streamLabels.forEach((lbl) => {
    doc.text(lbl.text, lbl.x, lbl.y, { align: 'center' });
  });

  // 10. Unavailable notice if stream comparison data missing
  if (streamPoints.length === 0 && learnerPoints.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.8);
    doc.setTextColor(110, 110, 110);
    doc.text('Stream comparison data unavailable for this cohort.', plotLeft + plotWidth / 2, currentY + 3.8, { align: 'center' });
  }

  return currentY + boxH + 2.5;
}

/**
 * Calculates per-subject/area stream mean percentages for Upper Primary regular report cards.
 *
 * Invariants & CBE Rules:
 * - Scoped strictly to the examination ID and stream student IDs.
 * - Supports both Composite and Standalone assessment structures.
 * - For Composite assessments: calculates each learner's consolidated subject result first
 *   (e.g., English Lang /60 + Comp /40 -> English /100; Kiswahili Lugha /60 + Insha /40 -> Kiswahili /100;
 *   SS&CRE composite -> /100), then computes the stream mean across the consolidated percentages.
 * - Genuine assessed zero scores (0%) are included in both sum and denominator.
 * - Missing ('X'), absent/irregular ('Y'), blank and unassessed marks are excluded from both numerator and denominator.
 * - Minimum cohort quorum: At least two distinct learners must have valid assessed marks for that area;
 *   if 0 or 1 learner has a valid score, returns null (never zero or invented).
 * - Deduplicates learners so each distinct student ID contributes at most once.
 */
export function calculateUpperPrimaryStreamSubjectMeans(options: {
  marks: Mark[];
  streamStudentIds: Set<string> | string[] | ReadonlySet<string>;
  exam?: Examination;
  subjects: Subject[];
  classes?: ClassStream[];
  allStudents?: Student[];
  targetClass?: ClassStream;
  grades?: Grade[];
  teachers?: Teacher[];
}): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  const {
    marks = [],
    streamStudentIds,
    exam,
    subjects = [],
    classes = [],
    allStudents = [],
    targetClass,
    grades = [],
    teachers = [],
  } = options;

  if (!exam?.id || !marks || marks.length === 0) {
    return result;
  }

  const streamSet = streamStudentIds instanceof Set
    ? (streamStudentIds as Set<string>)
    : new Set(Array.isArray(streamStudentIds) ? streamStudentIds : Array.from(streamStudentIds || []));

  if (streamSet.size === 0) {
    return result;
  }

  const streamMarks = marks.filter(
    (m) => m && m.exam_id === exam.id && m.student_id && streamSet.has(String(m.student_id).trim())
  );

  const subjectLearnerPercentages = new Map<string, Map<string, number>>();

  for (const studentId of streamSet) {
    const peerStudent = allStudents.find((s) => s.id === studentId || s.admission_number === studentId) ||
      ({
        id: studentId,
        grade: targetClass?.class_name || 'Grade 5',
        class_id: targetClass?.id,
        stream_id: targetClass?.stream_id,
      } as Student);

    const peerReport = resolveUpperPrimaryReportStructure({
      student: peerStudent,
      exam,
      targetClass,
      subjects,
      marks: streamMarks,
      grades,
      teachers,
      allStudents,
      classes,
    });

    for (const area of peerReport.allReportAreas) {
      if (area.status === 'Normal' && area.percentage !== null && !isNaN(area.percentage)) {
        const pct = Math.min(100, Math.max(0, area.percentage));
        const keysToRegister = [area.id, (area as any).subjectId, area.code, area.name].filter(Boolean) as string[];

        for (const k of keysToRegister) {
          let sMap = subjectLearnerPercentages.get(k);
          if (!sMap) {
            sMap = new Map<string, number>();
            subjectLearnerPercentages.set(k, sMap);
          }
          sMap.set(studentId, pct);
        }
      }
    }
  }

  subjectLearnerPercentages.forEach((studentMap, key) => {
    if (studentMap.size >= 2) {
      let sum = 0;
      studentMap.forEach((pct) => {
        sum += pct;
      });
      result[key] = Math.round(sum / studentMap.size);
    } else {
      result[key] = null;
    }
  });

  return result;
}

/**
 * Draws the Upper Primary Subject Performance Comparison Graph.
 *
 * Requirements & Invariants:
 * 1. Learner series: green solid connected line with circle markers.
 * 2. Stream Mean series: dark grey/black dashed connected line with diamond markers.
 * 3. Align markers: Both series use the exact same x-coordinate for each subject.
 * 4. Value labels: Learner values above their points; Stream Mean values below (collision avoidance via computeGraphValueLabelPositions).
 * 5. Y-axis: 0–100% range with gridlines at 0%, 25%, 50%, 75%, 100%, with "%" in axis labels.
 * 6. Missing marks: Not plotted as 0%; lines break across gaps. Genuine 0% remains valid at baseline.
 * 7. Page layout: Kept on one A4 page with dynamic boxH headroom management.
 */
export function drawUpperPrimarySubjectComparisonGraph(
  doc: jsPDF,
  reportAreas: (UpperPrimaryConsolidatedArea | UpperPrimaryStandardArea)[],
  streamSubjectMeans: Record<string, number | null>,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const targetSigTop = 264.0;
  const availableSpace = targetSigTop - 3.5 - currentY;
  if (availableSpace < 22 || !reportAreas || reportAreas.length === 0) {
    return currentY;
  }

  const boxH = Math.min(48, Math.max(26, availableSpace));

  // 1. Surrounding Container
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  // 2. Title & Distinct Series Legend (Top Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  doc.text('SUBJECT PERFORMANCE COMPARISON', marginX + 3.5, currentY + 3.8);

  const legY = currentY + 3.8;
  const leg1X = marginX + contentWidth - 52;
  const leg2X = marginX + contentWidth - 24;

  // Legend 1: Stream Mean (clean dark grey/black dashed wings + diamond marker)
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  (doc as any).setLineDashPattern?.([], 0);
  (doc as any).setLineDash?.([]);
  doc.line(leg1X, legY - 0.9, leg1X + 1.8, legY - 0.9);
  doc.line(leg1X + 3.2, legY - 0.9, leg1X + 5.0, legY - 0.9);
  drawDiamond(doc, leg1X + 2.5, legY - 0.9, 1.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(0, 0, 0);
  doc.text('Stream Mean', leg1X + 6.2, legY);

  // Legend 2: Learner (green solid line + circle marker)
  doc.setDrawColor(4, 120, 87);
  doc.setLineWidth(0.35);
  doc.line(leg2X, legY - 0.9, leg2X + 5, legY - 0.9);
  doc.setFillColor(5, 150, 105);
  doc.circle(leg2X + 2.5, legY - 0.9, 1.15, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(4, 120, 87);
  doc.text('Learner', leg2X + 6.2, legY);

  // 3. Plot Geometry
  const plotLeft = marginX + 11.5;
  const plotRight = marginX + contentWidth - 4;
  const plotWidth = plotRight - plotLeft;
  const plotTop = currentY + 6.2;
  const plotBottom = currentY + boxH - 5.5;
  const plotHeight = plotBottom - plotTop;

  // 4. Vertical Grid Lines & Ticks (0%, 25%, 50%, 75%, 100%)
  const yTicks = [0, 25, 50, 75, 100];
  for (const val of yTicks) {
    const y = plotBottom - (val / 100) * plotHeight;
    doc.setDrawColor(228, 228, 228);
    doc.setLineWidth(0.15);
    doc.line(plotLeft, y, plotRight, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.setTextColor(100, 100, 100);
    doc.text(`${val}%`, plotLeft - 1.2, y + 0.8, { align: 'right' });
  }

  // 5. X-Axis Baseline
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(plotLeft, plotBottom, plotRight, plotBottom);

  // 6. Compute Data Points (Both series directly aligned with xc, no horizontal offset)
  const N = reportAreas.length;
  const learnerPoints: GraphValuePoint[] = [];
  const streamPoints: GraphValuePoint[] = [];

  reportAreas.forEach((area, i) => {
    const xc = N === 1 ? plotLeft + plotWidth / 2 : plotLeft + (i + 0.5) * (plotWidth / N);

    // Subject baseline tick
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(xc, plotBottom, xc, plotBottom + 0.8);

    // Subtle category column guide
    doc.setDrawColor(240, 240, 240);
    doc.setLineWidth(0.15);
    doc.line(xc, plotTop, xc, plotBottom);

    // Subject label (verified short display code)
    const code = getMeritListDisplayCode(area.code || (area as any).subject_code, area.name || (area as any).subject_name, 'Upper Primary');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(0, 0, 0);
    doc.text(code, xc, plotBottom + 3.6, { align: 'center' });

    // Learner mark percentage
    const hasLearner = area.status === 'Normal' && area.percentage !== null && !isNaN(area.percentage);

    // Stream mean percentage
    const meanVal = streamSubjectMeans
      ? (streamSubjectMeans[area.id] ??
         ((area as any).subjectId ? streamSubjectMeans[(area as any).subjectId] : null) ??
         (area.code ? streamSubjectMeans[area.code] : null) ??
         (area.name ? streamSubjectMeans[area.name] : null))
      : null;
    const hasStream = meanVal !== null && meanVal !== undefined && !isNaN(meanVal);

    if (hasLearner) {
      const learnerPct = Math.min(100, Math.max(0, area.percentage!));
      const learnerY = plotBottom - (learnerPct / 100) * plotHeight;
      learnerPoints.push({ x: xc, y: learnerY, pct: learnerPct, subjectIndex: i });
    }

    if (hasStream) {
      const meanPct = Math.min(100, Math.max(0, meanVal!));
      const meanY = plotBottom - (meanPct / 100) * plotHeight;
      streamPoints.push({ x: xc, y: meanY, pct: meanPct, subjectIndex: i });
    }
  });

  // 7. Render Connected Lines (Only connecting adjacent assessed subjects)
  // Stream Mean Connected Line: dark grey/black dashed connected line
  if (streamPoints.length > 1) {
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.35);
    (doc as any).setLineDashPattern?.([1.8, 1.2], 0);
    (doc as any).setLineDash?.([1.8, 1.2], 0);
    for (let i = 0; i < streamPoints.length - 1; i++) {
      if (streamPoints[i + 1].subjectIndex === streamPoints[i].subjectIndex + 1) {
        doc.line(streamPoints[i].x, streamPoints[i].y, streamPoints[i + 1].x, streamPoints[i + 1].y);
      }
    }
    (doc as any).setLineDashPattern?.([], 0);
    (doc as any).setLineDash?.([]);
  }

  // Learner Connected Line: green solid connected line
  if (learnerPoints.length > 1) {
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.4);
    (doc as any).setLineDashPattern?.([], 0);
    (doc as any).setLineDash?.([]);
    for (let i = 0; i < learnerPoints.length - 1; i++) {
      if (learnerPoints[i + 1].subjectIndex === learnerPoints[i].subjectIndex + 1) {
        doc.line(learnerPoints[i].x, learnerPoints[i].y, learnerPoints[i + 1].x, learnerPoints[i + 1].y);
      }
    }
  }

  // 8. Render Markers
  // Stream Mean Series: Solid Dark Diamond
  streamPoints.forEach((pt) => {
    drawDiamond(doc, pt.x, pt.y, 1.3);
  });

  // Learner Series: Green circle marker with outline
  learnerPoints.forEach((pt) => {
    doc.setFillColor(5, 150, 105);
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.35);
    doc.circle(pt.x, pt.y, 1.2, 'FD');
  });

  // 9. Compute Non-Overlapping Value Label Positions
  const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
    learnerPoints,
    streamPoints,
    plotTop,
    plotBottom,
    currentY,
    boxH
  );

  // Render Learner Labels (Bold emerald green, 5.0pt, placed above marker)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(4, 120, 87);
  learnerLabels.forEach((lbl) => {
    doc.text(lbl.text, lbl.x, lbl.y, { align: 'center' });
  });

  // Render Stream Mean Labels (Bold dark slate, 5.0pt, placed below marker)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(15, 23, 42);
  streamLabels.forEach((lbl) => {
    doc.text(lbl.text, lbl.x, lbl.y, { align: 'center' });
  });

  // 10. Unavailable notice if stream comparison data missing
  if (streamPoints.length === 0 && learnerPoints.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.8);
    doc.setTextColor(110, 110, 110);
    doc.text('Stream comparison data unavailable for this cohort.', plotLeft + plotWidth / 2, currentY + 3.8, { align: 'center' });
  }

  return currentY + boxH + 2.5;
}

/**
 * Calculates per-subject stream mean percentages for Lower Primary regular report cards.
 *
 * Invariants & CBE Rules:
 * - Scoped strictly to the examination ID and stream student IDs.
 * - Assesses the three standard Lower Primary learning areas directly out of 100:
 *   English (ENG / sb_lp_eng), Kiswahili (KIS / sb_lp_kis), Integrated Learning Area (ILA / sb_lp_ila).
 * - Genuine assessed zero scores (0%) are included in both sum and denominator.
 * - Missing ('X'), absent/irregular ('Y'), blank and unassessed marks are excluded from both numerator and denominator.
 * - Minimum cohort quorum: At least two distinct learners must have valid assessed marks for that area;
 *   if 0 or 1 learner has a valid score, returns null (never zero or invented).
 * - Deduplicates learners so each distinct student ID contributes at most once.
 */
export function calculateLowerPrimaryStreamSubjectMeans(options: {
  marks: Mark[];
  streamStudentIds: Set<string> | string[] | ReadonlySet<string>;
  examId: string;
  subjects?: Subject[];
}): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  const {
    marks = [],
    streamStudentIds,
    examId,
    subjects = [],
  } = options;

  if (!examId || !marks || marks.length === 0) {
    return result;
  }

  const streamSet = streamStudentIds instanceof Set
    ? (streamStudentIds as Set<string>)
    : new Set(Array.isArray(streamStudentIds) ? streamStudentIds : Array.from(streamStudentIds || []));

  if (streamSet.size === 0) {
    return result;
  }

  const streamMarks = marks.filter(
    (m) => m && m.exam_id === examId && m.student_id && streamSet.has(String(m.student_id).trim())
  );

  const defaultLpSubjects: Subject[] = [
    { id: 'sb_lp_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_lp_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_lp_mat', subject_code: 'MATH', subject_name: 'Mathematics', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_lp_ila', subject_code: 'ILA', subject_name: 'Integrated Learning Area', category: 'Core', education_level: 'Lower Primary' },
  ];

  const standardLpOrder = ['ENG', 'KIS', 'MATH', 'ILA'];
  const subjectsByCode = new Map<string, Subject>();
  for (const sb of subjects || []) {
    const code = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Lower Primary');
    if (standardLpOrder.includes(code) && !subjectsByCode.has(code)) {
      subjectsByCode.set(code, sb);
    }
  }

  const targetSubjects: Subject[] = standardLpOrder.map((code) => {
    return subjectsByCode.get(code) || defaultLpSubjects.find((s) => s.subject_code === code)!;
  });

  const subjectLearnerPercentages = new Map<string, Map<string, number>>();

  for (const studentId of streamSet) {
    for (const sb of targetSubjects) {
      const code = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Lower Primary');
      const stdMark = streamMarks.find(
        (m) =>
          String(m.student_id).trim() === studentId &&
          (m.subject_id === sb.id ||
           (sb.subject_code && m.subject_id === sb.subject_code) ||
           (code === 'ENG' && (m.subject_id === 'sb_lp_eng' || m.subject_id === 'ENG' || m.subject_id === 'LP-ENG' || m.subject_id === 'LP-LIT')) ||
           (code === 'KIS' && (m.subject_id === 'sb_lp_kis' || m.subject_id === 'KIS' || m.subject_id === 'LP-KSL')) ||
           (code === 'MATH' && (m.subject_id === 'sb_lp_mat' || m.subject_id === 'sb_lp_math' || m.subject_id === 'MATH' || m.subject_id === 'adca967d-5cca-4752-8c76-b4d7c53a31b2' || m.subject_id === 'LP-MATH' || m.subject_id === 'MAT LP')) ||
           (code === 'ILA' && (m.subject_id === 'sb_lp_ila' || m.subject_id === 'ILA' || m.subject_id === 'LP-ILA')))
      );

      if (stdMark) {
        const markToEvaluate: Mark = (!stdMark.special_status && stdMark.status)
          ? { ...stdMark, special_status: stdMark.status }
          : stdMark;
        const evalRes = evaluateMark(markToEvaluate, { subject: sb, educationLevel: 'Lower Primary' });

        if (evalRes.status === 'Normal' && evalRes.percentage !== null && !isNaN(evalRes.percentage)) {
          const pct = Math.min(100, Math.max(0, evalRes.percentage));
          const keysToRegister = [
            sb.id,
            sb.subject_code,
            sb.subject_name,
            code,
            code === 'ENG' ? 'sb_lp_eng' : null,
            code === 'KIS' ? 'sb_lp_kis' : null,
            code === 'MATH' ? 'sb_lp_mat' : null,
            code === 'MATH' ? 'sb_lp_math' : null,
            code === 'MATH' ? 'adca967d-5cca-4752-8c76-b4d7c53a31b2' : null,
            code === 'ILA' ? 'sb_lp_ila' : null,
          ].filter(Boolean) as string[];

          for (const k of keysToRegister) {
            let sMap = subjectLearnerPercentages.get(k);
            if (!sMap) {
              sMap = new Map<string, number>();
              subjectLearnerPercentages.set(k, sMap);
            }
            sMap.set(studentId, pct);
          }
        }
      }
    }
  }

  targetSubjects.forEach((sb) => {
    const code = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Lower Primary');
    const keys = [
      sb.id,
      sb.subject_code,
      sb.subject_name,
      code,
      code === 'ENG' ? 'sb_lp_eng' : null,
      code === 'KIS' ? 'sb_lp_kis' : null,
      code === 'MATH' ? 'sb_lp_mat' : null,
      code === 'MATH' ? 'sb_lp_math' : null,
      code === 'MATH' ? 'adca967d-5cca-4752-8c76-b4d7c53a31b2' : null,
      code === 'ILA' ? 'sb_lp_ila' : null,
    ].filter(Boolean) as string[];

    let studentMap: Map<string, number> | undefined = undefined;
    for (const k of keys) {
      if (subjectLearnerPercentages.has(k)) {
        studentMap = subjectLearnerPercentages.get(k);
        break;
      }
    }

    if (studentMap && studentMap.size >= 2) {
      let sum = 0;
      studentMap.forEach((pct) => {
        sum += pct;
      });
      const mean = Math.round(sum / studentMap.size);
      for (const k of keys) {
        result[k] = mean;
      }
    } else {
      for (const k of keys) {
        result[k] = null;
      }
    }
  });

  return result;
}

/**
 * Draws the Lower Primary Subject Performance Comparison Graph.
 *
 * Requirements & Invariants:
 * 1. Learner series: green solid connected line with circle markers.
 * 2. Stream Mean series: dark grey/black dashed connected line with diamond markers.
 * 3. Align markers: Both series use the exact same x-coordinate for each subject.
 * 4. Value labels: Learner values above their points; Stream Mean values below (collision avoidance via computeGraphValueLabelPositions).
 * 5. Y-axis: 0–100% range with gridlines at 0%, 25%, 50%, 75%, 100%, with "%" in axis labels.
 * 6. Missing marks: Not plotted as 0%; lines break across gaps. Genuine 0% remains valid at baseline.
 * 7. Page layout: Kept on one A4 page with dynamic boxH headroom management.
 * 8. Learning areas: Exactly the 3 Lower Primary learning areas: ENG, KIS, ILA in standard order.
 */
export function drawLowerPrimarySubjectComparisonGraph(
  doc: jsPDF,
  learnerSubjects: Subject[],
  studentMarks: Mark[],
  streamSubjectMeans: Record<string, number | null>,
  currentY: number,
  marginX: number,
  contentWidth: number,
  examId: string,
  studentId: string,
  targetClass?: ClassStream
): number {
  const targetSigTop = 264.0;
  const availableSpace = targetSigTop - 3.5 - currentY;
  if (availableSpace < 22 || !learnerSubjects || learnerSubjects.length === 0) {
    return currentY;
  }

  const boxH = Math.min(48, Math.max(26, availableSpace));

  // 1. Surrounding Container
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  // 2. Title & Distinct Series Legend (Top Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  doc.text('SUBJECT PERFORMANCE COMPARISON', marginX + 3.5, currentY + 3.8);

  const legY = currentY + 3.8;
  const leg1X = marginX + contentWidth - 52;
  const leg2X = marginX + contentWidth - 24;

  // Legend 1: Stream Mean (clean dark grey/black dashed wings + diamond marker)
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  (doc as any).setLineDashPattern?.([], 0);
  (doc as any).setLineDash?.([]);
  doc.line(leg1X, legY - 0.9, leg1X + 1.8, legY - 0.9);
  doc.line(leg1X + 3.2, legY - 0.9, leg1X + 5.0, legY - 0.9);
  drawDiamond(doc, leg1X + 2.5, legY - 0.9, 1.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(0, 0, 0);
  doc.text('Stream Mean', leg1X + 6.2, legY);

  // Legend 2: Learner (green solid line + circle marker)
  doc.setDrawColor(4, 120, 87);
  doc.setLineWidth(0.35);
  doc.line(leg2X, legY - 0.9, leg2X + 5, legY - 0.9);
  doc.setFillColor(5, 150, 105);
  doc.circle(leg2X + 2.5, legY - 0.9, 1.15, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(4, 120, 87);
  doc.text('Learner', leg2X + 6.2, legY);

  // 3. Plot Geometry
  const plotLeft = marginX + 11.5;
  const plotRight = marginX + contentWidth - 4;
  const plotWidth = plotRight - plotLeft;
  const plotTop = currentY + 6.2;
  const plotBottom = currentY + boxH - 5.5;
  const plotHeight = plotBottom - plotTop;

  // 4. Vertical Grid Lines & Ticks (0%, 25%, 50%, 75%, 100%)
  const yTicks = [0, 25, 50, 75, 100];
  for (const val of yTicks) {
    const y = plotBottom - (val / 100) * plotHeight;
    doc.setDrawColor(228, 228, 228);
    doc.setLineWidth(0.15);
    doc.line(plotLeft, y, plotRight, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.setTextColor(100, 100, 100);
    doc.text(`${val}%`, plotLeft - 1.2, y + 0.8, { align: 'right' });
  }

  // 5. X-Axis Baseline
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(plotLeft, plotBottom, plotRight, plotBottom);

  // 6. Ensure exactly the Lower Primary learning areas in standard order: ENG, KIS, MATH, ILA
  const standardLpOrder = ['ENG', 'KIS', 'MATH', 'ILA'];
  const defaultLpSubjects: Subject[] = [
    { id: 'sb_lp_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_lp_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_lp_mat', subject_code: 'MATH', subject_name: 'Mathematics', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_lp_ila', subject_code: 'ILA', subject_name: 'Integrated Learning Area', category: 'Core', education_level: 'Lower Primary' },
  ];

  const subjectsByCode = new Map<string, Subject>();
  for (const sb of learnerSubjects || []) {
    const code = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Lower Primary');
    if (standardLpOrder.includes(code) && !subjectsByCode.has(code)) {
      subjectsByCode.set(code, sb);
    }
  }

  const subjectsToPlot: Subject[] = standardLpOrder.map((code) => {
    return subjectsByCode.get(code) || defaultLpSubjects.find((s) => s.subject_code === code)!;
  });

  const N = subjectsToPlot.length;
  const learnerPoints: GraphValuePoint[] = [];
  const streamPoints: GraphValuePoint[] = [];

  subjectsToPlot.forEach((sb, i) => {
    const xc = N === 1 ? plotLeft + plotWidth / 2 : plotLeft + (i + 0.5) * (plotWidth / N);

    // Subject baseline tick
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(xc, plotBottom, xc, plotBottom + 0.8);

    // Subtle category column guide
    doc.setDrawColor(240, 240, 240);
    doc.setLineWidth(0.15);
    doc.line(xc, plotTop, xc, plotBottom);

    // Subject label (verified short display code: ENG, KIS, MATH, ILA)
    const code = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Lower Primary');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(0, 0, 0);
    doc.text(code, xc, plotBottom + 3.6, { align: 'center' });

    // Learner mark percentage
    const stdMark = studentMarks.find(
      (m) =>
        m.student_id === studentId &&
        m.exam_id === examId &&
        (m.subject_id === sb.id ||
         (sb.subject_code && m.subject_id === sb.subject_code) ||
         (code === 'ENG' && (m.subject_id === 'sb_lp_eng' || m.subject_id === 'ENG' || m.subject_id === 'LP-ENG' || m.subject_id === 'LP-LIT')) ||
         (code === 'KIS' && (m.subject_id === 'sb_lp_kis' || m.subject_id === 'KIS' || m.subject_id === 'LP-KSL')) ||
         (code === 'MATH' && (m.subject_id === 'sb_lp_mat' || m.subject_id === 'sb_lp_math' || m.subject_id === 'MATH' || m.subject_id === 'adca967d-5cca-4752-8c76-b4d7c53a31b2' || m.subject_id === 'LP-MATH' || m.subject_id === 'MAT LP')) ||
         (code === 'ILA' && (m.subject_id === 'sb_lp_ila' || m.subject_id === 'ILA' || m.subject_id === 'LP-ILA')))
    );
    const markToEvaluate: Mark | undefined = stdMark
      ? ((!stdMark.special_status && stdMark.status) ? { ...stdMark, special_status: stdMark.status } : stdMark)
      : undefined;
    const ev = evaluateMark(markToEvaluate, { subject: sb, classObj: targetClass, educationLevel: 'Lower Primary' });
    const hasLearner = ev.status === 'Normal' && ev.percentage !== null && !isNaN(ev.percentage);

    // Stream mean percentage
    const meanVal = streamSubjectMeans
      ? (streamSubjectMeans[sb.id] ??
         (sb.subject_code ? streamSubjectMeans[sb.subject_code] : null) ??
         (code ? streamSubjectMeans[code] : null) ??
         (code === 'ENG' ? streamSubjectMeans['sb_lp_eng'] : null) ??
         (code === 'KIS' ? streamSubjectMeans['sb_lp_kis'] : null) ??
         (code === 'MATH' ? (streamSubjectMeans['sb_lp_mat'] ?? streamSubjectMeans['sb_lp_math'] ?? streamSubjectMeans['adca967d-5cca-4752-8c76-b4d7c53a31b2'] ?? streamSubjectMeans['MATH']) : null) ??
         (code === 'ILA' ? streamSubjectMeans['sb_lp_ila'] : null) ??
         (sb.subject_name ? streamSubjectMeans[sb.subject_name] : null))
      : null;
    const hasStream = meanVal !== null && meanVal !== undefined && !isNaN(meanVal);

    if (hasLearner) {
      const learnerPct = Math.min(100, Math.max(0, ev.percentage!));
      const learnerY = plotBottom - (learnerPct / 100) * plotHeight;
      learnerPoints.push({ x: xc, y: learnerY, pct: learnerPct, subjectIndex: i });
    }

    if (hasStream) {
      const meanPct = Math.min(100, Math.max(0, meanVal!));
      const meanY = plotBottom - (meanPct / 100) * plotHeight;
      streamPoints.push({ x: xc, y: meanY, pct: meanPct, subjectIndex: i });
    }
  });

  // 7. Render Connected Lines (Only connecting adjacent assessed subjects)
  // Stream Mean Connected Line: dark grey/black dashed connected line
  if (streamPoints.length > 1) {
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.35);
    (doc as any).setLineDashPattern?.([1.8, 1.2], 0);
    (doc as any).setLineDash?.([1.8, 1.2], 0);
    for (let i = 0; i < streamPoints.length - 1; i++) {
      if (streamPoints[i + 1].subjectIndex === streamPoints[i].subjectIndex + 1) {
        doc.line(streamPoints[i].x, streamPoints[i].y, streamPoints[i + 1].x, streamPoints[i + 1].y);
      }
    }
    (doc as any).setLineDashPattern?.([], 0);
    (doc as any).setLineDash?.([]);
  }

  // Learner Connected Line: green solid connected line
  if (learnerPoints.length > 1) {
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.4);
    (doc as any).setLineDashPattern?.([], 0);
    (doc as any).setLineDash?.([]);
    for (let i = 0; i < learnerPoints.length - 1; i++) {
      if (learnerPoints[i + 1].subjectIndex === learnerPoints[i].subjectIndex + 1) {
        doc.line(learnerPoints[i].x, learnerPoints[i].y, learnerPoints[i + 1].x, learnerPoints[i + 1].y);
      }
    }
  }

  // 8. Render Markers
  // Stream Mean Series: Solid Dark Diamond
  streamPoints.forEach((pt) => {
    drawDiamond(doc, pt.x, pt.y, 1.3);
  });

  // Learner Series: Green circle marker with outline
  learnerPoints.forEach((pt) => {
    doc.setFillColor(5, 150, 105);
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.35);
    doc.circle(pt.x, pt.y, 1.2, 'FD');
  });

  // 9. Compute Non-Overlapping Value Label Positions
  const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
    learnerPoints,
    streamPoints,
    plotTop,
    plotBottom,
    currentY,
    boxH
  );

  // Render Learner Labels (Bold emerald green, 5.0pt, placed above marker)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(4, 120, 87);
  learnerLabels.forEach((lbl) => {
    doc.text(lbl.text, lbl.x, lbl.y, { align: 'center' });
  });

  // Render Stream Mean Labels (Bold dark slate, 5.0pt, placed below marker)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(15, 23, 42);
  streamLabels.forEach((lbl) => {
    doc.text(lbl.text, lbl.x, lbl.y, { align: 'center' });
  });

  // 10. Unavailable notice if stream comparison data missing
  if (streamPoints.length === 0 && learnerPoints.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.8);
    doc.setTextColor(110, 110, 110);
    doc.text('Stream comparison data unavailable for this cohort.', plotLeft + plotWidth / 2, currentY + 3.8, { align: 'center' });
  }

  return currentY + boxH + 2.5;
}

// -------------------------------------------------------------
// 1. JUNIOR SCHOOL REPORT CARD PDF GENERATOR (Grades 7 - 9)
// -------------------------------------------------------------
export async function generateJuniorSchoolReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const examId = exam?.id || '';
  const {
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  } = resolvePDFLearnerContext(student, exam, classes);

  const learnerSubjects = getLearnerReportSubjectsForExam(
    effectiveStudent,
    targetClass,
    subjects,
    teachers,
    exam
  );
  const examResults =
    data.precalculatedExamResults ||
    calculateExamResults(
      examId,
      allStudents,
      marks,
      grades,
      classes,
      subjects,
      exam
    );
  const studentResult = examResults.find((r) => r.student_id === student.id);
  const isAssessmentComplete = data.aggregateRanking
    ? data.aggregateRanking.is_complete
    : studentResult
    ? studentResult.is_complete !== false
    : false;

  const totalMarks =
    data.aggregateRanking?.total_marks !== undefined
      ? data.aggregateRanking.total_marks
      : studentResult?.total_marks || 0;
  const averageScore =
    data.aggregateRanking?.average !== undefined
      ? data.aggregateRanking.average
      : studentResult?.average || 0;
  const totalPoints = isAssessmentComplete
    ? data.aggregateRanking?.total_points !== undefined
      ? data.aggregateRanking.total_points
      : studentResult?.total_points || 0
    : 0;
  const overallGradeCode = isAssessmentComplete
    ? data.aggregateRanking?.grade_code ||
      studentResult?.grade_code ||
      studentResult?.grade ||
      'ME1'
    : 'Pending';
  const overallRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.overall_rank
      ? `${data.aggregateRanking.overall_rank}`
      : 'Not Ranked'
    : isAssessmentComplete && studentResult?.position
    ? `${studentResult.position}`
    : 'Not Ranked';
  const streamRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.stream_rank
      ? `${data.aggregateRanking.stream_rank}`
      : 'Not Ranked'
    : isAssessmentComplete &&
      (studentResult?.class_position || studentResult?.position)
    ? `${studentResult.class_position || studentResult.position}`
    : 'Not Ranked';

  // Authoritative grade cohort (across streams)
  const gradeStudentIds = data.precalculatedCohortInfo?.gradeStudentIds ||
    getGradeCohortStudentIds(student, allStudents, exam, classes);
  const gradeResults = examResults.filter((r) => gradeStudentIds.has(r.student_id));
  const totalGradeAssessedStudents = data.aggregateRanking?.overall_total
    ? data.aggregateRanking.overall_total
    : (data.precalculatedCohortInfo?.totalGradeAssessedStudents ??
       (gradeResults.filter((r) => r.is_complete !== false).length || gradeResults.length || 1));

  // Authoritative stream cohort
  const streamStudentIds = data.precalculatedCohortInfo?.streamStudentIds ||
    getStreamCohortStudentIds(student, allStudents, exam, classes);
  const streamResults = examResults.filter((r) => streamStudentIds.has(r.student_id));
  const streamAssessedStudentsCount = data.aggregateRanking?.stream_total
    ? data.aggregateRanking.stream_total
    : (data.precalculatedCohortInfo?.streamAssessedStudentsCount ??
       (streamResults.filter((r) => r.is_complete !== false).length || streamResults.length || 1));

  // Authoritative stream subject means (for comparison graph)
  // Reuses batch precalculatedCohortInfo if available.
  // For single report in teacher/admin views with peer marks, calculates synchronously.
  // Invariant: Never calculate stream mean from an individual learner's marks alone.
  const hasPeerData = streamStudentIds.size > 1 && marks && marks.some((m) => m.student_id !== student.id && streamStudentIds.has(m.student_id));
  const streamSubjectMeans: Record<string, number | null> =
    data.precalculatedCohortInfo?.streamSubjectMeans ||
    (examId && hasPeerData
      ? calculateStreamSubjectMeans(marks, streamStudentIds, examId, learnerSubjects)
      : {});

  const evaluatedSubjectCount = learnerSubjects.length || 1;
  const maxPossibleMarks = evaluatedSubjectCount * 100;
  const maxPossiblePoints = evaluatedSubjectCount * 8;

  // Background watermark painted first, behind all content
  const logoObj = await getBase64ImageFromUrl(school?.logo_url);
  drawReportBackgroundWatermark(doc, logoObj, pageWidth, 297);

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwAssessmentSummary(
    doc,
    {
      totalMarks,
      maxPossibleMarks,
      averageScore,
      overallLevel: overallGradeCode,
      totalPoints,
      maxPossiblePoints,
      streamRank,
      streamTotal: streamAssessedStudentsCount,
      overallRank,
      overallTotal: totalGradeAssessedStudents,
      isComplete: isAssessmentComplete,
    },
    currentY,
    marginX,
    contentWidth
  );

  // Learning Areas Performance Table
  const tableRows = learnerSubjects.map((sb) => {
    const stdMark = marks.find(
      (m) => m.student_id === student.id && m.subject_id === sb.id && m.exam_id === examId
    );
    const markInfo = evaluateMark(stdMark, {
      subject: sb,
      classObj: targetClass,
      educationLevel: 'Junior School',
    });

    let scoreDisplay = 'X';
    let pctDisplay = 'X';
    let levelDisplay = 'X';
    let pointsDisplay = 'X';

    if (isKiswahiliSubject(sb)) {
      if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
        const gr = getGradeForMark(markInfo.percentage, grades, 'Junior School', studentGrade);
        const roundedScore = Math.round(markInfo.percentage);
        scoreDisplay = `${roundedScore}/100`;
        pctDisplay = `${roundedScore}`;
        levelDisplay = gr.grade_code || gr.grade || '';
        pointsDisplay = `${gr.points}`;
      } else if (markInfo.status === 'Y') {
        scoreDisplay = 'Y';
        pctDisplay = 'Y';
        levelDisplay = 'Y';
        pointsDisplay = 'Y';
      }
    } else if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      const gr = getGradeForMark(markInfo.percentage, grades, 'Junior School', studentGrade);
      const roundedScore = Math.round(markInfo.percentage);
      scoreDisplay = `${roundedScore}/100`;
      pctDisplay = `${roundedScore}`;
      levelDisplay = gr.grade_code || gr.grade || '';
      pointsDisplay = `${gr.points}`;
    } else if (markInfo.status === 'Y') {
      scoreDisplay = 'Y';
      pctDisplay = 'Y';
      levelDisplay = 'Y';
      pointsDisplay = 'Y';
    }

    const subjectRankStr =
      markInfo.status === 'Normal'
        ? (data.precalculatedSubjectRanks?.get(sb.id) ||
           data.precalculatedSubjectRanks?.get(sb.subject_code || '') ||
           calculateSubjectRank(
             effectiveStudent,
             sb.id,
             examId,
             allStudents,
             classes,
             marks,
             subjects
           ))
        : '-';
    const commentStr = resolveReportSubjectComment(sb, markInfo, savedRemarks, effectiveStudent, 'Junior School');
    const subjTeacher = resolveSubjectTeacher(teachers, sb.id, targetClassId, targetStreamId);
    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

    return [
      sb.subject_name,
      scoreDisplay,
      pctDisplay,
      levelDisplay,
      pointsDisplay,
      subjectRankStr,
      commentStr,
      teacherNameStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'COMMENTS', 'FACILITATOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.3,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
      fillColor: false,
    },
    alternateRowStyles: {
      fillColor: false,
    },
    bodyStyles: {
      fillColor: false,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.0,
      halign: 'center',
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 38, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 15 },
      2: { halign: 'center', cellWidth: 11 },
      3: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 13 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'left', cellWidth: 55 },
      7: { halign: 'left', cellWidth: 30 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'class_teacher',
    isProvisional: !isAssessmentComplete,
  });
  const defaultHoiComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'hoi',
    isProvisional: !isAssessmentComplete,
  });

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, true, currentY, marginX, contentWidth);

  // Junior School Subject Performance Comparison Graph (Stream Mean vs Learner)
  currentY = drawJuniorSchoolSubjectComparisonGraph(
    doc,
    learnerSubjects,
    marks,
    streamSubjectMeans,
    currentY,
    marginX,
    contentWidth,
    examId,
    student.id,
    targetClass
  );

  const sigY = Math.max(currentY + 2.0, 263.5);
  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    sigY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// 2. UPPER PRIMARY REPORT CARD PDF GENERATOR (Grades 4 - 6)
// -------------------------------------------------------------
export async function generateUpperPrimaryReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const examId = exam?.id || '';
  const {
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  } = resolvePDFLearnerContext(student, exam, classes);

  const customSubjectComments = savedRemarks?.subject_comments || {};
  const upReport = resolveUpperPrimaryReportStructure({
    student: effectiveStudent,
    exam,
    targetClass,
    subjects,
    marks,
    grades,
    teachers,
    allStudents,
    classes,
    customSubjectComments,
    precalculatedSubjectRanks: data.precalculatedSubjectRanks,
  });

  const examResults =
    data.precalculatedExamResults ||
    calculateExamResults(
      examId,
      allStudents,
      marks,
      grades,
      classes,
      subjects,
      exam
    );
  const studentResult = examResults.find((r) => r.student_id === student.id);
  const isAssessmentComplete = upReport.isComplete;
  const totalMarks = upReport.totalMarks;
  const averageScore = upReport.averageScore;
  const totalPoints = upReport.totalPoints;
  const overallGradeCode = upReport.overallGradeCode;
  const overallRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.overall_rank
      ? `${data.aggregateRanking.overall_rank}`
      : 'Not Ranked'
    : isAssessmentComplete && studentResult?.position
    ? `${studentResult.position}`
    : 'Not Ranked';
  const streamRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.stream_rank
      ? `${data.aggregateRanking.stream_rank}`
      : 'Not Ranked'
    : isAssessmentComplete &&
      (studentResult?.class_position || studentResult?.position)
    ? `${studentResult.class_position || studentResult.position}`
    : 'Not Ranked';

  // Authoritative grade cohort (across streams)
  const gradeStudentIds = data.precalculatedCohortInfo?.gradeStudentIds ||
    getGradeCohortStudentIds(student, allStudents, exam, classes);
  const gradeResults = examResults.filter((r) => gradeStudentIds.has(r.student_id));
  const totalGradeAssessedStudents = data.aggregateRanking?.overall_total
    ? data.aggregateRanking.overall_total
    : (data.precalculatedCohortInfo?.totalGradeAssessedStudents ??
       (gradeResults.filter((r) => r.is_complete !== false).length || gradeResults.length || 1));

  // Authoritative stream cohort
  const streamStudentIds = data.precalculatedCohortInfo?.streamStudentIds ||
    getStreamCohortStudentIds(student, allStudents, exam, classes);
  const streamResults = examResults.filter((r) => streamStudentIds.has(r.student_id));
  const streamAssessedStudentsCount = data.aggregateRanking?.stream_total
    ? data.aggregateRanking.stream_total
    : (data.precalculatedCohortInfo?.streamAssessedStudentsCount ??
       (streamResults.filter((r) => r.is_complete !== false).length || streamResults.length || 1));

  // Authoritative stream subject means (for comparison graph)
  // Reuses batch precalculatedCohortInfo if available.
  // For single report in teacher/admin views with peer marks, calculates synchronously.
  // Invariant: Never calculate stream mean from an individual learner's marks alone.
  const hasPeerData = streamStudentIds.size > 1 && marks && marks.some((m) => m.student_id !== student.id && streamStudentIds.has(m.student_id));
  const streamSubjectMeans: Record<string, number | null> =
    data.precalculatedCohortInfo?.streamSubjectMeans ||
    (examId && hasPeerData
      ? calculateUpperPrimaryStreamSubjectMeans({
          marks,
          streamStudentIds,
          exam,
          subjects,
          classes,
          allStudents,
          targetClass,
          grades,
          teachers,
        })
      : {});

  const maxPossibleMarks = upReport.maxPossibleMarks;
  const maxPossiblePoints = upReport.maxPossiblePoints;

  // Background watermark painted first, behind all content
  const logoObj = await getBase64ImageFromUrl(school?.logo_url);
  drawReportBackgroundWatermark(doc, logoObj, pageWidth, 297);

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwAssessmentSummary(
    doc,
    {
      totalMarks,
      maxPossibleMarks,
      averageScore,
      overallLevel: overallGradeCode,
      totalPoints,
      maxPossiblePoints,
      streamRank,
      streamTotal: streamAssessedStudentsCount,
      overallRank,
      overallTotal: totalGradeAssessedStudents,
      isComplete: isAssessmentComplete,
    },
    currentY,
    marginX,
    contentWidth
  );

  // Learning Areas Table (Upper Primary Composite Structure)
  const tableRows: any[] = [];
  upReport.allReportAreas.forEach((area) => {
    const rawCustom = customSubjectComments[area.id] ||
      (area.code ? customSubjectComments[area.code] : '') ||
      (area.name ? customSubjectComments[area.name] : '') ||
      area.customComment;

    let areaComment = '';
    if (rawCustom && typeof rawCustom === 'string' && rawCustom.trim()) {
      areaComment = shortenCustomComment(rawCustom);
    } else if (area.isKiswahili) {
      areaComment = getKiswahiliDefaultComment(area.percentage, area.status, undefined, {
        subject: { subject_name: area.name, subject_code: area.code, id: area.id },
        student: effectiveStudent,
        educationLevel: 'Upper Primary',
      });
    } else if (area.status === 'Normal' && area.percentage !== null) {
      areaComment = getConciseSubjectDefaultComment(area.name, area.percentage);
    } else if (area.status === 'Y') {
      areaComment = 'Irregularity (Absent)';
    } else {
      areaComment = 'Missing Assessment (X)';
    }

    if (area.isConsolidated && (area as any).components) {
      const compArea = area as any;
      compArea.components.forEach((c: any) => {
        tableRows.push([
          `  • ${c.name} (Max ${c.maxScore})`,
          c.displayScore,
          '-',
          '-',
          '-',
          '-',
          '-',
          c.teacherName || '',
        ]);
      });
      // Composite Summary Row
      tableRows.push([
        area.name,
        area.displayScore,
        area.percentage !== null ? `${Math.round(area.percentage)}` : area.status,
        area.gradeCode || area.performanceLevel || '',
        `${area.points}`,
        area.rank || '-',
        areaComment,
        area.teacherName || '',
      ]);
    } else {
      tableRows.push([
        area.name,
        area.displayScore,
        area.percentage !== null ? `${Math.round(area.percentage)}` : area.status,
        area.gradeCode || area.performanceLevel || '',
        `${area.points}`,
        area.rank || '-',
        areaComment,
        area.teacherName || '',
      ]);
    }
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'COMMENTS', 'FACILITATOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.3,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
      fillColor: false,
    },
    alternateRowStyles: {
      fillColor: false,
    },
    bodyStyles: {
      fillColor: false,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.0,
      halign: 'center',
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 38, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 15 },
      2: { halign: 'center', cellWidth: 11 },
      3: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 13 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'left', cellWidth: 55 },
      7: { halign: 'left', cellWidth: 30 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects,
    grades,
    averageScore,
    commentType: 'class_teacher',
    isProvisional: !isAssessmentComplete,
  });
  const defaultHoiComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects,
    grades,
    averageScore,
    commentType: 'hoi',
    isProvisional: !isAssessmentComplete,
  });

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, false, currentY, marginX, contentWidth);

  // Upper Primary Subject Performance Comparison Graph (Stream Mean vs Learner)
  currentY = drawUpperPrimarySubjectComparisonGraph(
    doc,
    upReport.allReportAreas,
    streamSubjectMeans,
    currentY,
    marginX,
    contentWidth
  );

  const sigY = Math.max(currentY + 2.0, 263.5);
  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    sigY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// 3. LOWER PRIMARY REPORT CARD PDF GENERATOR (Grades 1 - 3)
// -------------------------------------------------------------
export async function generateLowerPrimaryReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const examId = exam?.id || '';
  const {
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  } = resolvePDFLearnerContext(student, exam, classes);

  const { reportSubjects: learnerSubjects } = resolveLearnerReportSubjectsAndMarks(
    effectiveStudent,
    targetClass,
    subjects,
    teachers,
    exam,
    marks
  );
  const examResults =
    data.precalculatedExamResults ||
    calculateExamResults(
      examId,
      allStudents,
      marks,
      grades,
      classes,
      subjects,
      exam
    );
  const studentResult = examResults.find((r) => r.student_id === student.id);
  const isAssessmentComplete = data.aggregateRanking
    ? data.aggregateRanking.is_complete
    : studentResult
    ? studentResult.is_complete !== false
    : false;

  const totalMarks =
    data.aggregateRanking?.total_marks !== undefined
      ? data.aggregateRanking.total_marks
      : studentResult?.total_marks || 0;
  const averageScore =
    data.aggregateRanking?.average !== undefined
      ? data.aggregateRanking.average
      : studentResult?.average || 0;
  const totalPoints = isAssessmentComplete
    ? data.aggregateRanking?.total_points !== undefined
      ? data.aggregateRanking.total_points
      : studentResult?.total_points || 0
    : 0;
  const overallGradeCode = isAssessmentComplete
    ? data.aggregateRanking?.grade_code ||
      studentResult?.grade_code ||
      studentResult?.grade ||
      'ME'
    : 'Pending';
  const overallRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.overall_rank
      ? `${data.aggregateRanking.overall_rank}`
      : 'Not Ranked'
    : isAssessmentComplete && studentResult?.position
    ? `${studentResult.position}`
    : 'Not Ranked';
  const streamRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.stream_rank
      ? `${data.aggregateRanking.stream_rank}`
      : 'Not Ranked'
    : isAssessmentComplete &&
      (studentResult?.class_position || studentResult?.position)
    ? `${studentResult.class_position || studentResult.position}`
    : 'Not Ranked';

  // Authoritative grade cohort (across streams)
  const gradeStudentIds = data.precalculatedCohortInfo?.gradeStudentIds ||
    getGradeCohortStudentIds(student, allStudents, exam, classes);
  const gradeResults = examResults.filter((r) => gradeStudentIds.has(r.student_id));
  const totalGradeAssessedStudents = data.aggregateRanking?.overall_total
    ? data.aggregateRanking.overall_total
    : (data.precalculatedCohortInfo?.totalGradeAssessedStudents ??
       (gradeResults.filter((r) => r.is_complete !== false).length || gradeResults.length || 1));

  // Authoritative stream cohort
  const streamStudentIds = data.precalculatedCohortInfo?.streamStudentIds ||
    getStreamCohortStudentIds(student, allStudents, exam, classes);
  const streamResults = examResults.filter((r) => streamStudentIds.has(r.student_id));
  const streamAssessedStudentsCount = data.aggregateRanking?.stream_total
    ? data.aggregateRanking.stream_total
    : (data.precalculatedCohortInfo?.streamAssessedStudentsCount ??
       (streamResults.filter((r) => r.is_complete !== false).length || streamResults.length || 1));

  // Authoritative stream subject means (for comparison graph)
  // Reuses batch precalculatedCohortInfo if available.
  // For single report in teacher/admin views with peer marks, calculates synchronously.
  // Invariant: Never calculate stream mean from an individual learner's marks alone.
  const hasPeerData = streamStudentIds.size > 1 && marks && marks.some((m) => m.student_id !== student.id && streamStudentIds.has(m.student_id));
  const streamSubjectMeans: Record<string, number | null> =
    data.precalculatedCohortInfo?.streamSubjectMeans ||
    (examId && hasPeerData
      ? calculateLowerPrimaryStreamSubjectMeans({
          marks,
          streamStudentIds,
          examId,
          subjects: learnerSubjects,
        })
      : {});

  const evaluatedSubjectCount = learnerSubjects.length || 1;
  const maxPossibleMarks = evaluatedSubjectCount * 100;
  const maxPossiblePoints = evaluatedSubjectCount * 4;

  // Background watermark painted first, behind all content
  const logoObj = await getBase64ImageFromUrl(school?.logo_url);
  drawReportBackgroundWatermark(doc, logoObj, pageWidth, 297);

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwAssessmentSummary(
    doc,
    {
      totalMarks,
      maxPossibleMarks,
      averageScore,
      overallLevel: overallGradeCode,
      totalPoints,
      maxPossiblePoints,
      streamRank,
      streamTotal: streamAssessedStudentsCount,
      overallRank,
      overallTotal: totalGradeAssessedStudents,
      isComplete: isAssessmentComplete,
    },
    currentY,
    marginX,
    contentWidth
  );

  // Table of Learning Areas
  const tableRows = learnerSubjects.map((sb) => {
    const stdMark = marks.find(
      (m) => m.student_id === student.id && m.subject_id === sb.id && m.exam_id === examId
    );
    const markInfo = evaluateMark(stdMark, {
      subject: sb,
      classObj: targetClass,
      educationLevel: 'Lower Primary',
    });

    let scoreDisplay = 'X';
    let pctDisplay = 'X';
    let levelDisplay = 'X';
    let pointsDisplay = 'X';

    if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      const gr = getGradeForMark(markInfo.percentage, grades, 'Lower Primary', studentGrade);
      const roundedScore = Math.round(markInfo.percentage);
      scoreDisplay = `${roundedScore}/100`;
      pctDisplay = `${roundedScore}`;
      levelDisplay = gr.grade_code || gr.grade || '';
      pointsDisplay = `${gr.points}`;
    } else if (markInfo.status === 'Y') {
      scoreDisplay = 'Y';
      pctDisplay = 'Y';
      levelDisplay = 'Y';
      pointsDisplay = 'Y';
    }

    const subjectRankStr =
      markInfo.status === 'Normal'
        ? (data.precalculatedSubjectRanks?.get(sb.id) ||
           data.precalculatedSubjectRanks?.get(sb.subject_code || '') ||
           calculateSubjectRank(
             effectiveStudent,
             sb.id,
             examId,
             allStudents,
             classes,
             marks,
             subjects
           ))
        : '-';
    const commentStr = resolveReportSubjectComment(sb, markInfo, savedRemarks, effectiveStudent, 'Lower Primary');
    const subjTeacher = resolveSubjectTeacher(teachers, sb.id, targetClassId, targetStreamId);
    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

    return [
      sb.subject_name,
      scoreDisplay,
      pctDisplay,
      levelDisplay,
      pointsDisplay,
      subjectRankStr,
      commentStr,
      teacherNameStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'COMMENTS', 'FACILITATOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.3,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
      fillColor: false,
    },
    alternateRowStyles: {
      fillColor: false,
    },
    bodyStyles: {
      fillColor: false,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.0,
      halign: 'center',
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 38, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 15 },
      2: { halign: 'center', cellWidth: 11 },
      3: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 13 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'left', cellWidth: 55 },
      7: { halign: 'left', cellWidth: 30 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'class_teacher',
    isProvisional: !isAssessmentComplete,
  });
  const defaultHoiComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'hoi',
    isProvisional: !isAssessmentComplete,
  });

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, false, currentY, marginX, contentWidth);

  // Lower Primary Subject Performance Comparison Graph (Stream Mean vs Learner)
  currentY = drawLowerPrimarySubjectComparisonGraph(
    doc,
    learnerSubjects,
    marks,
    streamSubjectMeans,
    currentY,
    marginX,
    contentWidth,
    examId,
    student.id,
    targetClass
  );

  const sigY = Math.max(currentY + 2.0, 263.5);
  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    sigY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// 4. PRE-PRIMARY REPORT CARD PDF GENERATOR (PP1 - PP2)
// -------------------------------------------------------------
export async function generatePrePrimaryReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const { targetClass, targetClassId, targetStreamId, effectiveStudent } =
    resolvePDFLearnerContext(student, exam, classes);
  const learnerSubjects = getLearnerReportSubjectsForExam(
    effectiveStudent,
    targetClass,
    subjects,
    teachers,
    exam
  );
  const examId = exam?.id || '';

  // Background watermark painted first, behind all content
  const logoObj = await getBase64ImageFromUrl(school?.logo_url);
  drawReportBackgroundWatermark(doc, logoObj, pageWidth, 297);

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  // Table of Learning Areas
  const tableRows = learnerSubjects.map((sb) => {
    const stdMark = marks.find(
      (m) => m.student_id === student.id && m.subject_id === sb.id && m.exam_id === examId
    );
    const markInfo = evaluateMark(stdMark, {
      subject: sb,
      classObj: targetClass,
      educationLevel: 'Pre-Primary',
    });

    let scoreDisplay = 'X';
    let pctDisplay = 'X';
    let levelDisplay = 'X';
    let pointsDisplay = 'X';

    if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      const gr = getGradeForMark(markInfo.percentage, grades, 'Pre-Primary', 'PP1');
      const roundedScore = Math.round(markInfo.percentage);
      scoreDisplay = `${roundedScore}/100`;
      pctDisplay = `${roundedScore}`;
      levelDisplay = gr.grade_code || gr.grade || '';
      pointsDisplay = `${gr.points}`;
    } else if (markInfo.status === 'Y') {
      scoreDisplay = 'Y';
      pctDisplay = 'Y';
      levelDisplay = 'Y';
      pointsDisplay = 'Y';
    }

    const commentStr = resolveReportSubjectComment(sb, markInfo, savedRemarks, effectiveStudent, 'Pre-Primary');
    const subjTeacher = resolveSubjectTeacher(teachers, sb.id, targetClassId, targetStreamId);
    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

    return [
      sb.subject_name,
      scoreDisplay,
      pctDisplay,
      levelDisplay,
      pointsDisplay,
      '-',
      commentStr,
      teacherNameStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'COMMENTS', 'FACILITATOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.3,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
      fillColor: false,
    },
    alternateRowStyles: {
      fillColor: false,
    },
    bodyStyles: {
      fillColor: false,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.0,
      halign: 'center',
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 38, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 15 },
      2: { halign: 'center', cellWidth: 11 },
      3: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 13 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'left', cellWidth: 55 },
      7: { halign: 'left', cellWidth: 30 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = 'The learner shows good developmental milestones in all learning activities.';
  const defaultHoiComment = 'Commendable growth in foundational competencies.';

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, false, currentY, marginX, contentWidth);

  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    currentY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// MAIN ENTRY POINT FOR PDF DOCUMENT GENERATION
// -------------------------------------------------------------
export async function createReportCardPDFDoc(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const { student, exam, classes } = data;
  const { studentGrade } = resolvePDFLearnerContext(student, exam, classes);
  const eduLevel: EducationLevel = getEducationLevelForGrade(studentGrade);

  switch (eduLevel) {
    case 'Pre-Primary':
      return generatePrePrimaryReportPDF(data, existingDoc);
    case 'Lower Primary':
      return generateLowerPrimaryReportPDF(data, existingDoc);
    case 'Upper Primary':
      return generateUpperPrimaryReportPDF(data, existingDoc);
    case 'Junior School':
    default:
      return generateJuniorSchoolReportPDF(data, existingDoc);
  }
}

// Download single learner PDF
export async function downloadSingleReportCardPDF(data: PDFReportData): Promise<void> {
  const doc = await createReportCardPDFDoc(data);
  const rawStudentName =
    data.student?.full_name || (data.student as any)?.name || 'Learner';
  const cleanStudentName = String(rawStudentName)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanAdm = String(data.student?.admission_number || 'ADM').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const fileName = `${cleanAdm}_${cleanStudentName}_ReportCard.pdf`;
  await savePdf(doc, fileName);
}

// Download batch combined PDF of report cards (One master PDF document, exactly 1 page per learner)
export async function downloadAllReportCardsCombinedPDF(
  dataList: PDFReportData[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!dataList || dataList.length === 0) return;

  const total = dataList.length;
  const masterDoc = ensureSafeJsPdf(
    new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );

  // Pre-load and cache the school logo ONCE before looping over all learners
  if (dataList[0]?.school?.logo_url) {
    try {
      await getBase64ImageFromUrl(dataList[0].school.logo_url);
    } catch {
      // ignore
    }
  }

  // Helper to resolve cohort info per unique grade and stream once across the batch
  const gradeCohortCache = new Map<string, { gradeStudentIds: Set<string>; totalGradeAssessedStudents: number }>();
  const streamCohortCache = new Map<string, {
    streamStudentIds: Set<string>;
    streamAssessedStudentsCount: number;
    streamSubjectMeans: Record<string, number | null>;
  }>();

  const resolveBatchCohortInfo = (
    itemStudent: Student,
    itemExam: Examination | undefined,
    itemClasses: ClassStream[] | undefined,
    allStd: Student[],
    sharedResults: any[]
  ) => {
    const { studentGrade, targetStreamId, targetClassId, effectiveStudent } = resolvePDFLearnerContext(itemStudent, itemExam, itemClasses);
    const gradeKey = (studentGrade || effectiveStudent.grade || '').toLowerCase().trim();
    const streamKey = `${itemExam?.id || 'no_exam'}__${gradeKey}__${(targetStreamId || targetClassId || effectiveStudent.stream_id || '').toLowerCase().trim()}`;

    let gradeInfo = gradeCohortCache.get(gradeKey);
    if (!gradeInfo) {
      const gradeStudentIds = getGradeCohortStudentIds(effectiveStudent, allStd, itemExam, itemClasses || []);
      const gradeResults = (sharedResults || []).filter((r: any) => gradeStudentIds.has(r.student_id));
      const totalGradeAssessedStudents = gradeResults.filter((r: any) => r.is_complete !== false).length || gradeResults.length || 1;
      gradeInfo = { gradeStudentIds, totalGradeAssessedStudents };
      gradeCohortCache.set(gradeKey, gradeInfo);
    }

    let streamInfo = streamCohortCache.get(streamKey);
    if (!streamInfo) {
      const streamStudentIds = getStreamCohortStudentIds(effectiveStudent, allStd, itemExam, itemClasses || []);
      const streamResults = (sharedResults || []).filter((r: any) => streamStudentIds.has(r.student_id));
      const streamAssessedStudentsCount = streamResults.filter((r: any) => r.is_complete !== false).length || streamResults.length || 1;

      // Calculate stream subject means once per unique exam + grade + stream combination across the batch
      let streamSubjectMeans: Record<string, number | null> = {};
      if (itemExam?.id && streamStudentIds.size > 0 && firstItem?.subjects?.length) {
        const eduLevel = getEducationLevelForGrade(studentGrade);
        if (eduLevel === 'Upper Primary') {
          const streamClass = (itemClasses || []).find((c) => c.id === targetClassId) || firstItem?.classes?.find((c) => c.id === targetClassId);
          streamSubjectMeans = calculateUpperPrimaryStreamSubjectMeans({
            marks: firstItem.marks || [],
            streamStudentIds,
            exam: itemExam,
            subjects: firstItem.subjects,
            classes: itemClasses || firstItem.classes || [],
            allStudents: allStd,
            targetClass: streamClass,
            grades: firstItem.grades || [],
            teachers: firstItem.teachers || [],
          });
        } else if (eduLevel === 'Lower Primary') {
          streamSubjectMeans = calculateLowerPrimaryStreamSubjectMeans({
            marks: firstItem.marks || [],
            streamStudentIds,
            examId: itemExam.id,
            subjects: firstItem.subjects,
          });
        } else {
          streamSubjectMeans = calculateStreamSubjectMeans(
            firstItem.marks || [],
            streamStudentIds,
            itemExam.id,
            firstItem.subjects
          );
        }
      }

      streamInfo = { streamStudentIds, streamAssessedStudentsCount, streamSubjectMeans };
      streamCohortCache.set(streamKey, streamInfo);
    }

    return {
      gradeStudentIds: gradeInfo.gradeStudentIds,
      streamStudentIds: streamInfo.streamStudentIds,
      totalGradeAssessedStudents: gradeInfo.totalGradeAssessedStudents,
      streamAssessedStudentsCount: streamInfo.streamAssessedStudentsCount,
      streamSubjectMeans: streamInfo.streamSubjectMeans,
    };
  };

  // Pre-calculate shared exam results and batch subject ranks ONCE for the batch
  let sharedExamResults: any = undefined;
  let batchSubjectRanksMap: Map<string, Map<string, string>> | undefined = undefined;

  const firstItem = dataList[0];
  if (firstItem?.exam?.id && firstItem.allStudents?.length) {
    try {
      sharedExamResults = calculateExamResults(
        firstItem.exam.id,
        firstItem.allStudents,
        firstItem.marks || [],
        firstItem.grades || [],
        firstItem.classes || [],
        firstItem.subjects || [],
        firstItem.exam
      );

      // Pre-calculate cohort subject rankings once for the entire batch
      const batchStudents = dataList.map((d) => d.student);
      batchSubjectRanksMap = calculateBatchCohortSubjectRanks(
        firstItem.exam.id,
        batchStudents,
        firstItem.allStudents,
        firstItem.classes,
        firstItem.marks || [],
        firstItem.subjects
      );
    } catch {
      // fallback to per-learner calculation
    }
  }

  for (let i = 0; i < total; i++) {
    const item = dataList[i];
    if (sharedExamResults && !item.precalculatedExamResults) {
      item.precalculatedExamResults = sharedExamResults;
    }
    if (!item.precalculatedCohortInfo && sharedExamResults && item.allStudents?.length) {
      item.precalculatedCohortInfo = resolveBatchCohortInfo(
        item.student,
        item.exam,
        item.classes,
        item.allStudents,
        sharedExamResults
      );
    }
    if (batchSubjectRanksMap && !item.precalculatedSubjectRanks) {
      const studentRanks = batchSubjectRanksMap.get(item.student.id) ||
        (item.student.admission_number ? batchSubjectRanksMap.get(item.student.admission_number) : undefined);
      if (studentRanks) {
        item.precalculatedSubjectRanks = studentRanks;
      }
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
    if (i > 0) {
      masterDoc.addPage('a4', 'portrait');
    }
    await createReportCardPDFDoc(item, masterDoc);
    // Yield execution to browser event loop to smoothly update progress UI
    if (i % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const examName = getDisplayExamName(firstItem?.exam?.exam_name) || 'Report';
  const year = firstItem?.exam?.year || new Date().getFullYear();
  const { classNameStr } = resolvePDFLearnerContext(
    firstItem.student,
    firstItem.exam,
    firstItem.classes
  );

  const cleanClass = String(classNameStr || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanExam = String(examName || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');

  const fileName = `Report_Forms_${cleanExam}_${year}_${cleanClass}.pdf`;
  await savePdf(masterDoc, fileName);
}

// Download batch ZIP of report cards (Kept for compatibility)
export async function downloadAllReportCardsZIP(
  dataList: PDFReportData[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const total = dataList.length;

  if (total === 0) return;

  // Pre-load and cache the school logo ONCE
  if (dataList[0]?.school?.logo_url) {
    try {
      await getBase64ImageFromUrl(dataList[0].school.logo_url);
    } catch {
      // ignore
    }
  }

  // Pre-calculate shared exam results and batch subject ranks ONCE for the ZIP batch
  let sharedExamResults: any = undefined;
  let batchSubjectRanksMap: Map<string, Map<string, string>> | undefined = undefined;
  const gradeCohortCache = new Map<string, { gradeStudentIds: Set<string>; totalGradeAssessedStudents: number }>();
  const streamCohortCache = new Map<string, {
    streamStudentIds: Set<string>;
    streamAssessedStudentsCount: number;
    streamSubjectMeans: Record<string, number | null>;
  }>();

  const resolveZipCohortInfo = (
    itemStudent: Student,
    itemExam: Examination | undefined,
    itemClasses: ClassStream[] | undefined,
    allStd: Student[],
    sharedResults: any[]
  ) => {
    const { studentGrade, targetStreamId, targetClassId, effectiveStudent } = resolvePDFLearnerContext(itemStudent, itemExam, itemClasses);
    const gradeKey = (studentGrade || effectiveStudent.grade || '').toLowerCase().trim();
    const streamKey = `${itemExam?.id || 'no_exam'}__${gradeKey}__${(targetStreamId || targetClassId || effectiveStudent.stream_id || '').toLowerCase().trim()}`;

    let gradeInfo = gradeCohortCache.get(gradeKey);
    if (!gradeInfo) {
      const gradeStudentIds = getGradeCohortStudentIds(effectiveStudent, allStd, itemExam, itemClasses || []);
      const gradeResults = (sharedResults || []).filter((r: any) => gradeStudentIds.has(r.student_id));
      const totalGradeAssessedStudents = gradeResults.filter((r: any) => r.is_complete !== false).length || gradeResults.length || 1;
      gradeInfo = { gradeStudentIds, totalGradeAssessedStudents };
      gradeCohortCache.set(gradeKey, gradeInfo);
    }

    let streamInfo = streamCohortCache.get(streamKey);
    if (!streamInfo) {
      const streamStudentIds = getStreamCohortStudentIds(effectiveStudent, allStd, itemExam, itemClasses || []);
      const streamResults = (sharedResults || []).filter((r: any) => streamStudentIds.has(r.student_id));
      const streamAssessedStudentsCount = streamResults.filter((r: any) => r.is_complete !== false).length || streamResults.length || 1;

      // Calculate stream subject means once per unique exam + grade + stream combination across the batch
      let streamSubjectMeans: Record<string, number | null> = {};
      if (itemExam?.id && streamStudentIds.size > 0 && firstItem?.subjects?.length) {
        const eduLevel = getEducationLevelForGrade(studentGrade);
        if (eduLevel === 'Upper Primary') {
          const streamClass = (itemClasses || []).find((c) => c.id === targetClassId) || firstItem?.classes?.find((c) => c.id === targetClassId);
          streamSubjectMeans = calculateUpperPrimaryStreamSubjectMeans({
            marks: firstItem.marks || [],
            streamStudentIds,
            exam: itemExam,
            subjects: firstItem.subjects,
            classes: itemClasses || firstItem.classes || [],
            allStudents: allStd,
            targetClass: streamClass,
            grades: firstItem.grades || [],
            teachers: firstItem.teachers || [],
          });
        } else if (eduLevel === 'Lower Primary') {
          streamSubjectMeans = calculateLowerPrimaryStreamSubjectMeans({
            marks: firstItem.marks || [],
            streamStudentIds,
            examId: itemExam.id,
            subjects: firstItem.subjects,
          });
        } else {
          streamSubjectMeans = calculateStreamSubjectMeans(
            firstItem.marks || [],
            streamStudentIds,
            itemExam.id,
            firstItem.subjects
          );
        }
      }

      streamInfo = { streamStudentIds, streamAssessedStudentsCount, streamSubjectMeans };
      streamCohortCache.set(streamKey, streamInfo);
    }

    return {
      gradeStudentIds: gradeInfo.gradeStudentIds,
      streamStudentIds: streamInfo.streamStudentIds,
      totalGradeAssessedStudents: gradeInfo.totalGradeAssessedStudents,
      streamAssessedStudentsCount: streamInfo.streamAssessedStudentsCount,
      streamSubjectMeans: streamInfo.streamSubjectMeans,
    };
  };

  const firstItem = dataList[0];
  if (firstItem?.exam?.id && firstItem.allStudents?.length) {
    try {
      sharedExamResults = calculateExamResults(
        firstItem.exam.id,
        firstItem.allStudents,
        firstItem.marks || [],
        firstItem.grades || [],
        firstItem.classes || [],
        firstItem.subjects || [],
        firstItem.exam
      );

      const batchStudents = dataList.map((d) => d.student);
      batchSubjectRanksMap = calculateBatchCohortSubjectRanks(
        firstItem.exam.id,
        batchStudents,
        firstItem.allStudents,
        firstItem.classes,
        firstItem.marks || [],
        firstItem.subjects
      );
    } catch {
      // fallback
    }
  }

  for (let i = 0; i < total; i++) {
    const item = dataList[i];
    if (sharedExamResults && !item.precalculatedExamResults) {
      item.precalculatedExamResults = sharedExamResults;
    }
    if (!item.precalculatedCohortInfo && sharedExamResults && item.allStudents?.length) {
      item.precalculatedCohortInfo = resolveZipCohortInfo(
        item.student,
        item.exam,
        item.classes,
        item.allStudents,
        sharedExamResults
      );
    }
    if (batchSubjectRanksMap && !item.precalculatedSubjectRanks) {
      const studentRanks = batchSubjectRanksMap.get(item.student.id) ||
        (item.student.admission_number ? batchSubjectRanksMap.get(item.student.admission_number) : undefined);
      if (studentRanks) {
        item.precalculatedSubjectRanks = studentRanks;
      }
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
    const doc = await createReportCardPDFDoc(item);
    const pdfBlob = doc.output('blob');
    const rawStudentName =
      item.student?.full_name || (item.student as any)?.name || 'Learner';
    const cleanStudentName = String(rawStudentName)
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanAdm = String(item.student?.admission_number || 'ADM').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const fileName = `${cleanAdm}_${cleanStudentName}_ReportCard.pdf`;
    zip.file(fileName, pdfBlob);
  }

  const firstExam =
    getDisplayExamName(dataList[0]?.exam?.exam_name) || 'Class_Report_Cards';
  const zipName = `Learner_Report_Cards_${String(firstExam || 'Assessment').replace(
    /\s+/g,
    '_'
  )}.zip`;

  const content = await zip.generateAsync({ type: 'blob' });
  await saveFile(content, zipName, { mimeType: 'application/zip' });
}
