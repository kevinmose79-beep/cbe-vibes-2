import rawJsPDF from 'jspdf';
const jsPDF = (rawJsPDF as any).jsPDF || rawJsPDF;
import autoTable from 'jspdf-autotable';
import { savePdf } from '../utils/fileDownloader';
import {
  Student,
  School,
  Examination,
  Subject,
  ClassStream,
  Teacher,
  getStudentFullName,
  getEducationLevelForGrade,
  getAllocatedSubjectsForClass,
  getApplicableSubjectsForGrade,
  sortSubjectsByStandardOrder,
  getMeritListDisplayCode,
} from '../types';
import { getFilteredStudents, getClassStreamLabel } from '../utils/filterUtils';
import { formatKenyaDate } from '../utils/kenyaDateUtils';
import { getDisplayExamName } from '../utils/examDisplayUtils';
import {
  isEnglishLanguage,
  isEnglishComposition,
  isKiswahiliLugha,
  isKiswahiliInsha,
  isSocialStudies,
  isChristianReligiousEducation,
  isDirectSSCRE,
  getSSCREComponentMaxMarks,
  isAgricultureSubject,
  isAgricultureIncludedInCompositeExam,
} from '../utils/markUtils';
import { api } from '../lib/storage';

/**
 * Converts an image URL / base64 string to a monochrome (grayscale) Data URL
 * suitable for pure black and white PDF documents, downscaling to print-optimal dimensions.
 */
async function convertImageToMonochromeDataUrl(imageUrl?: string | null): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const MAX_DIM = 240; // 240px produces crisp resolution for a 15mm PDF logo
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
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              data[i] = gray;     // R
              data[i + 1] = gray; // G
              data[i + 2] = gray; // B
            }
            ctx.putImageData(imgData, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, width, height });
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
      img.src = imageUrl;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export interface ScoreSheetColumn {
  id: string;
  code: string;
  name: string;
  maxScore: number;
  subHeader?: string;
}

export interface ScoreSheetPDFOptions {
  school: School;
  exam?: Examination | null;
  subject?: Subject | null;
  outOfMaxScore?: string | number;
  selectedClassId: string;
  selectedStreamId?: string;
  students: Student[];
  subjects?: Subject[];
  classes: ClassStream[];
  teachers?: Teacher[];
  generatedBy?: string;
}

/**
 * Resolves the dynamic score sheet subject columns for the given class, level, and exam configuration.
 * Adheres strictly to CBE curriculum structures across:
 * - Lower Primary (Grades 1-3): ENG, KIS, MATH, ILA (all /100)
 * - Upper Primary (Grades 4-6):
 *    - Standalone Exam: standard single subjects (ENG, KIS, MATH, INT SCI, CAS, SST, CRE, AGN if allocated) /100
 *    - Composite Exam:
 *        - English: Language (/60), Composition (/40), or individual component if standalone
 *        - Kiswahili: Lugha (/60), Insha (/40), or individual component if standalone
 *        - Mathematics: (/100)
 *        - Integrated Science: (/100)
 *        - Creative Arts and Sports: (/100)
 *        - Social Studies & CRE: SST (/sstMax), CRE (/creMax) according to exam ss_cre_structure ('A', 'B', 'C', or CUSTOM)
 *        - Agriculture: (/100) if included via isAgricultureIncludedInCompositeExam
 * - Junior School (Grades 7-9):
 *    - Standalone 9 learning areas: ENG, KIS, MATH, INT-SCI, CAS, SST, CRE, AGN, PRE-TECH (/100)
 */
export function resolveScoreSheetColumns(
  targetClassObj: ClassStream | undefined,
  allSubjects: Subject[],
  exam?: Examination | null
): ScoreSheetColumn[] {
  const className = targetClassObj?.class_name || '';
  const eduLevel = targetClassObj?.education_level || getEducationLevelForGrade(className);

  // 1. Resolve candidate cohort subjects for this class
  let poolSubjects = targetClassObj
    ? getAllocatedSubjectsForClass(targetClassObj, allSubjects)
    : (className ? getApplicableSubjectsForGrade(className, allSubjects) : allSubjects);

  if (!poolSubjects || poolSubjects.length === 0) {
    poolSubjects = allSubjects.filter((s) => s.status !== 'Archived');
  }

  const isStandaloneExam = exam?.assessment_structure === 'Standalone';
  const columns: ScoreSheetColumn[] = [];

  // =========================================================================
  // LOWER PRIMARY (Grades 1-3)
  // =========================================================================
  if (eduLevel === 'Lower Primary') {
    const sorted = sortSubjectsByStandardOrder(poolSubjects);
    const seenCodes = new Set<string>();

    for (const sb of sorted) {
      const displayCode = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Lower Primary');
      if (seenCodes.has(displayCode)) continue;
      seenCodes.add(displayCode);

      columns.push({
        id: sb.id,
        code: displayCode,
        name: sb.subject_name,
        maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
      });
    }

    return columns;
  }

  // =========================================================================
  // UPPER PRIMARY (Grades 4-6)
  // =========================================================================
  if (eduLevel === 'Upper Primary') {
    const isAgnIncluded = isStandaloneExam || isAgricultureIncludedInCompositeExam(exam, targetClassObj, allSubjects);

    if (isStandaloneExam) {
      // In standalone Upper Primary exams, subjects are standalone (/100) without component splits
      const sorted = sortSubjectsByStandardOrder(
        poolSubjects.filter((s) => {
          if (isEnglishComposition(s) || isKiswahiliInsha(s) || isDirectSSCRE(s)) return false;
          if (isAgricultureSubject(s) && !isAgnIncluded) return false;
          return true;
        })
      );

      const seenCodes = new Set<string>();
      for (const sb of sorted) {
        const displayCode = getMeritListDisplayCode(sb.subject_code, sb.subject_name, 'Upper Primary');
        if (seenCodes.has(displayCode)) continue;
        seenCodes.add(displayCode);

        columns.push({
          id: sb.id,
          code: displayCode,
          name: sb.subject_name,
          maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
        });
      }

      return columns;
    }

    // UPPER PRIMARY COMPOSITE ASSESSMENT STRUCTURE
    // 1. English: Language (ENG /60) and Composition (COMP /40)
    const hasEnglishLang = poolSubjects.some((s) => isEnglishLanguage(s) && !isEnglishComposition(s));
    const hasEnglishComp = poolSubjects.some((s) => isEnglishComposition(s));
    if (hasEnglishLang || hasEnglishComp) {
      columns.push({
        id: 'up_eng_lang',
        code: 'ENG',
        name: 'English (Language)',
        maxScore: 60,
      });
      columns.push({
        id: 'up_eng_comp',
        code: 'COMP',
        name: 'English Composition',
        maxScore: 40,
      });
    }

    // 2. Kiswahili: Lugha (KIS /60) and Insha (INSHA /40)
    const hasKiswLang = poolSubjects.some((s) => isKiswahiliLugha(s) && !isKiswahiliInsha(s));
    const hasKiswInsha = poolSubjects.some((s) => isKiswahiliInsha(s));
    if (hasKiswLang || hasKiswInsha) {
      columns.push({
        id: 'up_kis_lugha',
        code: 'KIS',
        name: 'Kiswahili (Lugha)',
        maxScore: 60,
      });
      columns.push({
        id: 'up_kis_insha',
        code: 'INSHA',
        name: 'Kiswahili Insha',
        maxScore: 40,
      });
    }

    // 3. Mathematics (/100)
    const mathSub = poolSubjects.find((s) => (s.subject_code || '').toUpperCase().includes('MAT') || (s.subject_name || '').toUpperCase().includes('MATH'));
    if (mathSub) {
      columns.push({
        id: mathSub.id,
        code: 'MATH',
        name: 'Mathematics',
        maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
      });
    }

    // 4. Integrated Science (/100)
    const sciSub = poolSubjects.find((s) => (s.subject_code || '').toUpperCase().includes('SCI') || (s.subject_name || '').toUpperCase().includes('SCIENCE'));
    if (sciSub) {
      columns.push({
        id: sciSub.id,
        code: 'INT SCI',
        name: 'Integrated Science',
        maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
      });
    }

    // 5. Creative Arts and Sports (/100)
    const casSub = poolSubjects.find((s) => (s.subject_code || '').toUpperCase().includes('CA') || (s.subject_name || '').toUpperCase().includes('CREATIVE'));
    if (casSub) {
      columns.push({
        id: casSub.id,
        code: 'CAS',
        name: 'Creative Arts & Sports',
        maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
      });
    }

    // 6. Social Studies & CRE (Component Breakdown or Direct)
    const sstSub = poolSubjects.find(isSocialStudies);
    const creSub = poolSubjects.find(isChristianReligiousEducation);
    const directSsCre = poolSubjects.find(isDirectSSCRE);

    const sstCreMaxes = exam?.ss_cre_structure ? getSSCREComponentMaxMarks(exam.ss_cre_structure) : null;
    if (sstCreMaxes) {
      columns.push({
        id: 'up_sst',
        code: 'SST',
        name: 'Social Studies',
        maxScore: sstCreMaxes.sstMax,
      });
      columns.push({
        id: 'up_cre',
        code: 'CRE',
        name: 'C.R.E',
        maxScore: sstCreMaxes.creMax,
      });
    } else if (sstSub && creSub && !directSsCre) {
      // Default to Structure A (30/20) if separate components exist without explicit structure
      columns.push({
        id: sstSub.id,
        code: 'SST',
        name: 'Social Studies',
        maxScore: 30,
      });
      columns.push({
        id: creSub.id,
        code: 'CRE',
        name: 'C.R.E',
        maxScore: 20,
      });
    } else if (directSsCre) {
      columns.push({
        id: directSsCre.id,
        code: 'SS&CRE',
        name: 'Social Studies & CRE',
        maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 50,
      });
    }

    // 7. Agriculture (included if authorized)
    if (isAgnIncluded) {
      const agnSub = poolSubjects.find(isAgricultureSubject);
      if (agnSub) {
        columns.push({
          id: agnSub.id,
          code: 'AGN',
          name: 'Agriculture',
          maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
        });
      }
    }

    return columns;
  }

  // =========================================================================
  // JUNIOR SCHOOL (Grades 7-9) & DEFAULT LEVEL
  // =========================================================================
  const sorted = sortSubjectsByStandardOrder(poolSubjects);
  const seenCodes = new Set<string>();

  for (const sb of sorted) {
    if (isEnglishComposition(sb) || isKiswahiliInsha(sb) || isDirectSSCRE(sb)) continue;

    const displayCode = getMeritListDisplayCode(sb.subject_code, sb.subject_name, eduLevel);
    if (seenCodes.has(displayCode)) continue;
    seenCodes.add(displayCode);

    columns.push({
      id: sb.id,
      code: displayCode,
      name: sb.subject_name,
      maxScore: exam?.max_marks && exam.max_marks > 0 ? exam.max_marks : 100,
    });
  }

  return columns;
}

/**
 * Exports a professional, clean, black-and-white, A4 landscape Score Sheet PDF.
 * Displays all applicable subjects as dynamic columns and all learners in the selected class as rows.
 */
export async function exportScoreSheetPDF(options: ScoreSheetPDFOptions): Promise<void> {
  const {
    school,
    exam,
    selectedClassId,
    selectedStreamId = 'all',
    students = [],
    subjects: providedSubjects,
    classes = [],
  } = options;

  // 1. Resolve available subjects
  const allSubjects = (providedSubjects && providedSubjects.length > 0)
    ? providedSubjects
    : (typeof api !== 'undefined' && api.getSubjects ? api.getSubjects() : []);

  // 2. Resolve target Class and Stream objects
  const targetClassObj =
    classes.find((c) => c.stream_id === selectedStreamId || c.id === selectedStreamId) ||
    classes.find((c) => c.stream_id === selectedClassId || c.id === selectedClassId) ||
    classes.find((c) => (c.class_name || '').toLowerCase() === (selectedClassId || '').toLowerCase());

  // 3. Filter target learners matching selected class & stream context
  let targetStudents = getFilteredStudents(students, classes, selectedClassId, selectedStreamId, exam);

  if (!targetStudents || targetStudents.length === 0) {
    if (targetClassObj) {
      targetStudents = getFilteredStudents(
        students,
        classes,
        targetClassObj.class_name,
        targetClassObj.stream_id || targetClassObj.id,
        exam
      );
    }
  }

  if (!targetStudents || targetStudents.length === 0) {
    // Direct matching fallback for active learners
    targetStudents = students.filter((st) => {
      if (!st || st.active === false || (st as any).enrolment_status === 'future') return false;
      if (selectedClassId === 'all') return true;
      if (targetClassObj) {
        if (st.stream_id && (st.stream_id === targetClassObj.stream_id || st.stream_id === targetClassObj.id)) {
          return true;
        }
        if (st.class_id && st.class_id === targetClassObj.id) {
          return true;
        }
      }
      return st.class_id === selectedClassId || st.stream_id === selectedClassId;
    });
  }

  if (!targetStudents || targetStudents.length === 0) {
    throw new Error('No learner records found for the selected class scope.');
  }

  // Sort students alphabetically by full name (or admission number fallback)
  const sortedStudents = [...targetStudents].sort((a, b) => {
    const nameA = getStudentFullName(a) || a.full_name || '';
    const nameB = getStudentFullName(b) || b.full_name || '';
    if (nameA && nameB && nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }
    const admA = a.admission_number || (a as any).adm_no || '';
    const admB = b.admission_number || (b as any).adm_no || '';
    return admA.localeCompare(admB, undefined, { numeric: true });
  });

  // 4. Resolve Dynamic Subject Columns
  const subjectColumns = resolveScoreSheetColumns(targetClassObj, allSubjects, exam);
  if (subjectColumns.length === 0) {
    throw new Error('No applicable learning areas found for the selected class.');
  }

  // 5. Setup A4 Landscape Document (297mm x 210mm)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2; // 281mm
  const marginBottom = 8;

  // Format header strings
  const fullClassDisplay = getClassStreamLabel(classes, selectedClassId, selectedStreamId);
  const schoolNameStr = (school?.school_name || 'MUCHORWE COMPREHENSIVE SCHOOL').toUpperCase();
  const examNameStr = exam ? getDisplayExamName(exam.exam_name) : 'EXAMINATION';
  const termStr = exam?.term || 'Term 1';
  const yearStr = exam?.year ? String(exam.year) : String(new Date().getFullYear());

  // Assessment date: use exam.start_date, exam.date_created, exam.created_at, or today
  const rawExamDate = exam?.start_date || (exam as any)?.date_created || (exam as any)?.created_at || new Date();
  const assessmentDateStr = formatKenyaDate(rawExamDate);

  // Logo monochrome asset
  const logoObj = await convertImageToMonochromeDataUrl(school?.logo_url);

  // 6. Calculate Dynamic Column Widths across 281mm usable landscape width
  // Fixed widths: No (8mm), Adm No (18mm), Learner Name (52mm) = 78mm
  const fixedWidthsTotal = 8 + 18 + 52;
  const remainingForSubjects = contentWidth - fixedWidthsTotal; // 203mm
  const numSubjectCols = subjectColumns.length;
  const colWidth = remainingForSubjects / numSubjectCols;

  const columnStyles: Record<number, any> = {
    0: { halign: 'center', cellWidth: 8 },
    1: { halign: 'center', cellWidth: 18 },
    2: { halign: 'left', cellWidth: 52 },
  };

  for (let c = 0; c < numSubjectCols; c++) {
    columnStyles[3 + c] = { halign: 'center', cellWidth: colWidth };
  }

  // 7. Construct Two-Tier Table Header
  // Row 1: No. (rowSpan 2) | Adm No. (rowSpan 2) | Learner Name (rowSpan 2) | <Subject 1 Code> | <Subject 2 Code> ...
  // Row 2: /Max1 | /Max2 ... (or empty string in Junior School)
  const targetClassName = targetClassObj?.class_name || (selectedClassId !== 'all' ? selectedClassId : '');
  const eduLevel = targetClassObj?.education_level || getEducationLevelForGrade(targetClassName);
  const isJuniorSchool =
    eduLevel === 'Junior School' ||
    /Grade\s*[789]|G[789]|grade_?[789]/i.test(targetClassName) ||
    /Grade\s*[789]|G[789]|grade_?[789]/i.test(selectedClassId || '');

  const headerRow1: any[] = [
    { content: 'No.', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
    { content: 'Adm No.', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
    { content: 'Learner Name', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
    ...subjectColumns.map((col) => ({
      content: col.code,
      styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' },
    })),
  ];

  const headerRow2: any[] = [
    ...subjectColumns.map((col) => ({
      content: isJuniorSchool ? '' : `/${col.maxScore}`,
      styles: { valign: 'middle', halign: 'center', fontStyle: 'normal', fontSize: 7 },
    })),
  ];

  const tableHead = [headerRow1, headerRow2];

  // Table Body: blank spaces for handwritten score entries
  const tableBody = sortedStudents.map((st, idx) => {
    const admNo = st.admission_number || (st as any).adm_no || '-';
    const name = (getStudentFullName(st) || st.full_name || '').toUpperCase();

    return [
      String(idx + 1),
      admNo,
      name,
      ...Array(numSubjectCols).fill(''),
    ];
  });

  // 8. Render Header Drawing Function (Strict Black & White ASCII-aligned Header)
  const drawPageHeader = () => {
    const headerTopY = 5;
    const headerBoxHeight = 27; // Ultra-compact 27mm header ensures 42+ learners fit on Page 1

    // Outer border of header box (Strictly solid black lines)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(marginX, headerTopY, contentWidth, headerBoxHeight);

    // Inner horizontal divider splitting Top (School Info) and Bottom (Metadata Grid)
    const midDividerY = headerTopY + 12;
    doc.line(marginX, midDividerY, marginX + contentWidth, midDividerY);

    // School Crest (Upper Left)
    const logoBoxW = 18;
    const logoDividerX = marginX + logoBoxW;
    doc.line(logoDividerX, headerTopY, logoDividerX, midDividerY);

    if (logoObj) {
      const { dataUrl, width, height } = logoObj;
      let displayW = 9.5;
      let displayH = 9.5;
      if (width && height && height > 0) {
        const aspect = width / height;
        if (aspect >= 1) {
          displayW = 9.5;
          displayH = Math.min(9.5, 9.5 / aspect);
        } else {
          displayH = 9.5;
          displayW = Math.min(9.5, 9.5 * aspect);
        }
      }
      const logoX = marginX + (logoBoxW - displayW) / 2;
      const logoY = headerTopY + (12 - displayH) / 2;

      try {
        doc.addImage(dataUrl, 'PNG', logoX, logoY, displayW, displayH);
      } catch (err) {
        console.warn('Failed to embed monochrome school crest:', err);
      }
    }

    // Top Right School Title & SCORE SHEET
    const titleAreaCenterX = (logoDividerX + marginX + contentWidth) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text(schoolNameStr, titleAreaCenterX, headerTopY + 5, { align: 'center' });

    doc.setFontSize(9);
    doc.text('SCORE SHEET', titleAreaCenterX, headerTopY + 9.5, { align: 'center' });

    // Metadata Grid (Bottom section: midDividerY to midDividerY + 15)
    // Vertical splitter dividing Left and Right metadata columns
    const metaSplitX = marginX + 175;
    doc.line(metaSplitX, midDividerY, metaSplitX, headerTopY + headerBoxHeight);

    doc.setFontSize(7.2);

    // Left Column: Exam, Class, Date
    const leftTextX = marginX + 3;
    const line1Y = midDividerY + 4;
    const line2Y = midDividerY + 8.5;
    const line3Y = midDividerY + 13;

    // Line 1: Exam
    doc.setFont('helvetica', 'bold');
    doc.text('Exam   :', leftTextX, line1Y);
    doc.setFont('helvetica', 'normal');
    const examDisplayCapped = examNameStr.length > 58 ? `${examNameStr.substring(0, 55)}...` : examNameStr;
    doc.text(examDisplayCapped, leftTextX + 15, line1Y);

    // Line 2: Class
    doc.setFont('helvetica', 'bold');
    doc.text('Class  :', leftTextX, line2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(fullClassDisplay, leftTextX + 15, line2Y);

    // Line 3: Assessment Date
    doc.setFont('helvetica', 'bold');
    doc.text('Date   :', leftTextX, line3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(assessmentDateStr, leftTextX + 15, line3Y);

    // Right Column: Term, Year
    const rightTextX = metaSplitX + 3;

    doc.setFont('helvetica', 'bold');
    doc.text('Term  :', rightTextX, line1Y);
    doc.setFont('helvetica', 'normal');
    doc.text(termStr, rightTextX + 14, line1Y);

    doc.setFont('helvetica', 'bold');
    doc.text('Year  :', rightTextX, line2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(yearStr, rightTextX + 14, line2Y);
  };

  // 9. Render Table with autoTable
  // Header height: 27mm + 5mm start -> table starts cleanly at Y = 33.5mm
  const startTableY = 33.5;

  autoTable(doc, {
    startY: startTableY,
    margin: { left: marginX, right: marginX, top: 8, bottom: 6 },
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'auto',
    styles: {
      fontSize: 7.2,
      cellPadding: { top: 0.4, bottom: 0.4, left: 0.8, right: 0.8 }, // Allows 42+ learners on Page 1
      textColor: [0, 0, 0],
      valign: 'middle',
      lineColor: [0, 0, 0], // Strict black borders
      lineWidth: 0.25,
      fontStyle: 'normal',
    },
    headStyles: {
      fillColor: [255, 255, 255], // Strictly white background
      textColor: [0, 0, 0], // Strictly black text
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7.5,
      cellPadding: { top: 0.6, bottom: 0.6, left: 0.8, right: 0.8 },
      lineColor: [0, 0, 0], // Strictly black border lines
      lineWidth: 0.35,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255], // Strictly white
    },
    columnStyles,
    didDrawPage: (data) => {
      // Draw school header on Page 1 only
      if (data.pageNumber === 1) {
        drawPageHeader();
      }
    },
  });

  // 10. Footers on all pages (Black text, minimal footprint)
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(`${schoolNameStr} • SCORE SHEET`, marginX, footerY, { align: 'left' });
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, footerY, { align: 'right' });
  }

  // 11. Save PDF file
  const cleanClassName = fullClassDisplay.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanExamName = examNameStr ? `_${examNameStr.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const fileName = `${cleanClassName}${cleanExamName}_Score_Sheet.pdf`;
  await savePdf(doc, fileName);
}
