import {
  Mark,
  SubjectStatus,
  normalizeGradeName,
  Subject,
  UpperPrimarySSCREStructure,
  Examination,
  Student,
  ClassStream,
  Teacher,
  getEducationLevelForGrade,
  extractGradeName,
  getAllocatedSubjectsForClass,
  getApplicableSubjectsForGrade,
  sortSubjectsByStandardOrder,
  getMeritListDisplayCode,
} from '../types';
import { isGrade6OpenerTerm32026 } from './examDisplayUtils';

export interface EvaluatedMark {
  status: SubjectStatus;
  percentage: number | null;
  rawScore: number | null;
  outOf: number;
  irregularityReason?: string;
  displayScore: string;
  displayPercentage: string;
  displayStatus: string;
  isRawScoreOnly?: boolean;
}

/**
 * Verifies whether an assessment, subject, and class context represent Upper Primary English Composition (COMP) or Kiswahili Insha (INSHA).
 * Strict boundaries:
 * - Upper Primary Grades 4, 5 and 6 ONLY
 * - Subject code "COMP" or "INSHA" ONLY
 * Does NOT apply to Pre-Primary, Lower Primary, Junior School, English generally (ENG), Kiswahili generally (KIS/KISW), or other Upper Primary subjects.
 */
export function isUpperPrimaryCompOrInsha(
  subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null,
  classObj?: { class_name?: string; education_level?: string } | null,
  educationLevel?: string | null,
  examOrStructure?: Examination | { assessment_structure?: string } | string | null
): boolean {
  if (!subject) return false;

  const isStandalone =
    typeof examOrStructure === 'object' && examOrStructure !== null
      ? (examOrStructure as any).assessment_structure === 'Standalone'
      : examOrStructure === 'Standalone';
  if (isStandalone) return false;

  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();

  const isSyntheticComposite = id.startsWith('synth_') || id.includes('composite');
  if (isSyntheticComposite) return false;

  const isCompOrInshaCode = code === 'COMP' || code === 'INSHA' || name.includes('COMPOSITION') || name.includes('INSHA') || id.includes('_comp') || id.includes('_insha');
  if (!isCompOrInshaCode) return false;

  // Resolve resolved education level from classObj, explicit educationLevel, or subject.education_level
  let resolvedLevel: string | undefined = undefined;
  if (classObj) {
    if (classObj.class_name) {
      resolvedLevel = getEducationLevelForGrade(classObj.class_name);
    } else if (classObj.education_level) {
      resolvedLevel = classObj.education_level;
    }
  }

  if (!resolvedLevel && educationLevel) {
    resolvedLevel = educationLevel;
  }

  if (!resolvedLevel && subject.education_level) {
    resolvedLevel = subject.education_level;
  }

  return resolvedLevel === 'Upper Primary';
}

/**
 * Verifies whether an assessment, subject, and class context represent Upper Primary English Language (ENG) or Kiswahili Lugha (KIS/KISW) - marked out of 60.
 * Strict boundaries:
 * - Upper Primary Grades 4, 5 and 6 ONLY
 * Does NOT apply to Pre-Primary, Lower Primary (Grades 1-3), Junior School (Grades 7-9), or Composition/Insha (COMP/INSHA).
 */
export function isUpperPrimaryLanguage(
  subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null,
  classObj?: { class_name?: string; education_level?: string } | null,
  educationLevel?: string | null,
  examOrStructure?: Examination | { assessment_structure?: string } | string | null
): boolean {
  if (!subject) return false;

  const isStandalone =
    typeof examOrStructure === 'object' && examOrStructure !== null
      ? (examOrStructure as any).assessment_structure === 'Standalone'
      : examOrStructure === 'Standalone';
  if (isStandalone) return false;

  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();

  const isCompOrInshaCode = code === 'COMP' || code === 'INSHA' || name.includes('COMPOSITION') || name.includes('INSHA') || id.includes('_comp') || id.includes('_insha');
  if (isCompOrInshaCode) return false;

  const isSyntheticComposite = id.startsWith('synth_') || id.includes('composite');
  if (isSyntheticComposite) return false;

  const isLangCode = isEnglishLanguage(subject) || isKiswahiliLugha(subject);
  if (!isLangCode) return false;

  // Resolve resolved education level from classObj, explicit educationLevel, or subject.education_level
  let resolvedLevel: string | undefined = undefined;
  if (classObj) {
    if (classObj.class_name) {
      resolvedLevel = getEducationLevelForGrade(classObj.class_name);
    } else if (classObj.education_level) {
      resolvedLevel = classObj.education_level;
    }
  }

  if (!resolvedLevel && educationLevel) {
    resolvedLevel = educationLevel;
  }

  if (!resolvedLevel && subject.education_level) {
    resolvedLevel = subject.education_level;
  }

  return resolvedLevel === 'Upper Primary';
}

export function isAgricultureSubject(
  subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null
): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toLowerCase();
  const id = (subject.id || '').trim().toLowerCase();
  return (
    id === 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f' ||
    id === 'sb_agn' ||
    id === 'sb_up_agn' ||
    code === 'AGN' ||
    code === 'AGR' ||
    name.includes('agriculture')
  );
}

export function isAgricultureAllocatedToClass(
  classObj?: { id?: string; allocated_subject_ids?: string[] } | null,
  subjects: { id: string; subject_code?: string; code?: string; subject_name?: string; name?: string }[] = []
): boolean {
  if (!classObj || !classObj.allocated_subject_ids || classObj.allocated_subject_ids.length === 0) {
    return false;
  }
  return classObj.allocated_subject_ids.some((idOrCode) => {
    const s = subjects.find((sub) => sub.id === idOrCode || sub.subject_code === idOrCode);
    if (s && isAgricultureSubject(s)) return true;
    const str = String(idOrCode).trim().toUpperCase();
    return (
      str === 'A9BF02EE-5E4E-46FA-B7D5-39F77657821F' ||
      str === 'AGN' ||
      str === 'AGR' ||
      str === 'SB_AGN' ||
      str === 'SB_UP_AGN'
    );
  });
}

/**
 * Authoritative helper to determine whether Agriculture is included in an Upper Primary Composite exam.
 * Rule: Explicit exam setting (true/false) > Historical class allocation fallback (when null/undefined).
 */
export function isAgricultureIncludedInCompositeExam(
  exam?: Examination | { include_agriculture?: boolean } | null,
  classObj?: { id?: string; allocated_subject_ids?: string[] } | null,
  subjects: { id: string; subject_code?: string; code?: string; subject_name?: string; name?: string }[] = []
): boolean {
  if (exam?.include_agriculture === true) return true;
  if (exam?.include_agriculture === false) return false;

  return isAgricultureAllocatedToClass(classObj, subjects);
}

export function evaluateMark(
  mark?: Mark | null,
  options?: {
    isUpperPrimaryCompOrInsha?: boolean;
    isUpperPrimaryLanguage?: boolean;
    subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null;
    classObj?: { class_name?: string; education_level?: string } | null;
    educationLevel?: string | null;
    examination?: Examination | { assessment_structure?: string } | null;
  }
): EvaluatedMark {
  if (!mark) {
    return {
      status: 'Blank',
      percentage: null,
      rawScore: null,
      outOf: 100,
      displayScore: '',
      displayPercentage: '',
      displayStatus: 'Blank',
    };
  }

  const rawMarkStr = typeof mark.marks === 'string' ? (mark.marks as string).trim().toUpperCase() : '';

  // Explicit status check
  if (mark.special_status === 'X' || rawMarkStr === 'X') {
    return {
      status: 'X',
      percentage: null,
      rawScore: null,
      outOf: mark.out_of && mark.out_of <= 50 ? mark.out_of : 100,
      displayScore: 'X',
      displayPercentage: 'X',
      displayStatus: 'X (Missing Mark)',
    };
  }

  if (mark.special_status === 'Y' || rawMarkStr === 'Y') {
    const reason = mark.irregularity_reason || 'Absent';
    return {
      status: 'Y',
      percentage: null,
      rawScore: null,
      outOf: mark.out_of && mark.out_of <= 50 ? mark.out_of : 100,
      irregularityReason: reason,
      displayScore: 'Y',
      displayPercentage: 'Y',
      displayStatus: `Y (${reason})`,
    };
  }

  if (mark.special_status === 'Blank' || rawMarkStr === 'BLANK' || rawMarkStr === '-') {
    return {
      status: 'Blank',
      percentage: null,
      rawScore: null,
      outOf: mark.out_of && mark.out_of <= 50 ? mark.out_of : 100,
      displayScore: '',
      displayPercentage: '',
      displayStatus: 'Blank',
    };
  }

  // Normal numerical score
  const numRaw = typeof mark.raw_score === 'number' && !isNaN(mark.raw_score)
    ? mark.raw_score
    : (typeof (mark as any).score === 'number' && !isNaN((mark as any).score))
      ? (mark as any).score
      : (typeof mark.raw_score === 'string' && (mark.raw_score as string).trim() !== '' && !isNaN(Number(mark.raw_score)))
        ? Number(mark.raw_score)
        : (typeof (mark as any).score === 'string' && ((mark as any).score as string).trim() !== '' && !isNaN(Number((mark as any).score)))
          ? Number((mark as any).score)
          : NaN;

  const numMarks = typeof mark.marks === 'number' && !isNaN(mark.marks)
    ? mark.marks
    : (typeof mark.marks === 'string' && (mark.marks as string).trim() !== '' && !isNaN(Number(mark.marks)))
      ? Number(mark.marks)
      : (typeof (mark as any).percentage === 'number' && !isNaN((mark as any).percentage))
        ? (mark as any).percentage
        : NaN;

  const hasRawScore = !isNaN(numRaw);
  const hasMarks = !isNaN(numMarks);

  if (hasRawScore || hasMarks) {
    const rawScore = hasRawScore ? numRaw : numMarks;
    const isStandaloneExam =
      options?.examination && typeof options.examination === 'object'
        ? (options.examination as any).assessment_structure === 'Standalone'
        : (options?.examination as unknown) === 'Standalone';
    const isCompInsha = !isStandaloneExam && (options?.isUpperPrimaryCompOrInsha ?? (
      options?.subject ? isUpperPrimaryCompOrInsha(options.subject, options.classObj, options.educationLevel) : false
    ));
    const isLang60 = !isStandaloneExam && (options?.isUpperPrimaryLanguage ?? (
      options?.subject ? isUpperPrimaryLanguage(options.subject, options.classObj, options.educationLevel, options?.examination) : false
    ));

    if (isCompInsha) {
      let outOf = 40;
      if (mark.out_of && mark.out_of > 0 && mark.out_of <= 50) {
        outOf = mark.out_of;
      } else {
        outOf = 40;
      }
      const percentage = outOf > 0 ? (rawScore / outOf) * 100 : rawScore;
      const clampedPct = Math.min(100, Math.max(0, percentage));
      return {
        status: 'Normal',
        percentage: clampedPct,
        rawScore,
        outOf,
        displayScore: `${rawScore}`,
        displayPercentage: `${rawScore}`,
        displayStatus: 'Normal',
        isRawScoreOnly: true,
      };
    }

    let outOf = 100;
    if (isLang60) {
      if (mark.out_of && mark.out_of > 60) {
        outOf = mark.out_of;
      } else {
        outOf = mark.out_of && mark.out_of > 0 && mark.out_of <= 60 ? mark.out_of : 60;
      }
    } else {
      outOf = mark.out_of && mark.out_of > 0 ? mark.out_of : 100;
    }
    const percentage = outOf > 0 ? (rawScore / outOf) * 100 : rawScore;
    const clampedPct = Math.min(100, Math.max(0, percentage));

    return {
      status: 'Normal',
      percentage: clampedPct,
      rawScore,
      outOf,
      displayScore: outOf !== 100 ? `${rawScore}/${outOf}` : formatPercentage(clampedPct),
      displayPercentage: formatPercentage(clampedPct, true),
      displayStatus: 'Normal',
    };
  }

  return {
    status: 'Blank',
    percentage: null,
    rawScore: null,
    outOf: 100,
    displayScore: '',
    displayPercentage: '',
    displayStatus: 'Blank',
  };
}

export const IRREGULARITY_REASONS = [
  'Absent',
  'Examination Malpractice',
  'Withheld Result',
  'Medical Absence',
  'Exempted',
];

/**
 * Consistently rounds a percentage value to the nearest whole number integer, returning a number.
 * E.g., 74.2 -> 74, 74.5 -> 75, 74.8 -> 75
 */
export function roundPercentage(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return null;
  return Math.round(num);
}

/**
 * Formats a percentage or average mark for user display.
 * Displays whole numbers where appropriate (e.g. 56%), or max 1 decimal place without trailing zeros (e.g. 56.3%).
 */
export function formatPercentage(
  val: number | string | null | undefined,
  includeSymbol: boolean = false,
  fallback: string = '-'
): string {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);

  const rounded = roundPercentage(num);
  if (rounded === null) return fallback;

  const str = String(rounded);
  return includeSymbol ? `${str}%` : str;
}

/**
 * Formats an Average Mark for Merit List display to exactly one decimal place.
 * E.g., 78 -> "78.0", 78.456 -> "78.5", 91.24 -> "91.2", 100 -> "100.0", null -> "-"
 */
export function formatAverageMark(
  val: number | string | null | undefined,
  fallback: string = '-'
): string {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback;
  return (Math.round(num * 10) / 10).toFixed(1);
}

/**
 * Formats a Learning Area / Subject Average Mark for Merit List summary display to exactly two decimal places.
 * E.g., 85.666... -> "85.67", 75 -> "75.00", 59.4 -> "59.40", 68.125 -> "68.13", 80 -> "80.00", null -> "-"
 */
export function formatTwoDecimalAverage(
  val: number | string | null | undefined,
  fallback: string = '-'
): string {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback;
  return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Utility to consistently round a numerical mark or percentage to the nearest integer.
 * Handles numbers, numeric strings, and null/undefined values gracefully.
 */
export function roundMark(mark: number | string | null | undefined): number | null {
  if (mark === null || mark === undefined || mark === '') return null;
  const num = typeof mark === 'number' ? mark : parseFloat(String(mark));
  if (isNaN(num)) return null;
  return Math.round(num);
}

/**
 * Abbreviates CBE performance levels to short form (EE, ME, AE, BE).
 */
export function getAbbreviatedLevel(levelStr?: string | null, gradeCode?: string | null): string {
  if (gradeCode) {
    const gc = gradeCode.toUpperCase();
    if (gc.startsWith('EE')) return 'EE';
    if (gc.startsWith('ME')) return 'ME';
    if (gc.startsWith('AE')) return 'AE';
    if (gc.startsWith('BE')) return 'BE';
  }
  if (!levelStr) return '-';
  const str = levelStr.trim().toUpperCase();
  if (str.includes('EXCEEDING') || str === 'EE') return 'EE';
  if (str.includes('MEETING') || str === 'ME') return 'ME';
  if (str.includes('APPROACHING') || str === 'AE') return 'AE';
  if (str.includes('BELOW') || str === 'BE') return 'BE';
  if (str === 'ABSENT' || str === 'X') return 'Absent';
  if (str === 'IRREGULARITY' || str === 'Y') return 'Irregularity';
  if (str === 'PENDING' || str === 'PROVISIONAL') return 'Pending';
  return levelStr;
}

/**
 * Returns concise 1-2 word remarks for tables (e.g., Outstanding, Excellent, Good, Satisfactory, Developing, Needs Support, Intervention Required).
 */
export function getShortRemark(remarkStr?: string | null, gradeCode?: string | null): string {
  if (gradeCode) {
    const gc = gradeCode.toUpperCase();
    if (gc === 'EE1') return 'Outstanding';
    if (gc === 'EE2') return 'Excellent';
    if (gc === 'ME1') return 'Good';
    if (gc === 'ME2') return 'Satisfactory';
    if (gc === 'AE1') return 'Developing';
    if (gc === 'AE2') return 'Needs Support';
    if (gc === 'BE1') return 'Needs Support';
    if (gc === 'BE2') return 'Intervention Required';
  }

  if (!remarkStr) return '-';
  const upper = remarkStr.toUpperCase();
  if (upper.includes('OUTSTANDING')) return 'Outstanding';
  if (upper.includes('EXCELLENT')) return 'Excellent';
  if (upper.includes('GOOD')) return 'Good';
  if (upper.includes('SATISFACTORY')) return 'Satisfactory';
  if (upper.includes('DEVELOPING')) return 'Developing';
  if (upper.includes('NEEDS MORE PRACTICE') || upper.includes('NEEDS PRACTICE')) return 'Needs Support';
  if (upper.includes('NEEDS SUPPORT')) return 'Needs Support';
  if (upper.includes('INTERVENTION') || upper.includes('IMMEDIATE SUPPORT')) return 'Intervention Required';
  if (upper.includes('ABSENT')) return 'Absent';
  if (upper.includes('IRREGULARITY')) return 'Irregularity';
  if (upper.includes('PENDING') || upper.includes('PROVISIONAL')) return 'Pending';

  return remarkStr.length > 20 ? `${remarkStr.substring(0, 18)}..` : remarkStr;
}

export interface CompositeLanguageResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  rawScore: number;
  outOf: number;
  percentage: number;
  componentMarks: {
    language?: { rawScore: number; outOf: number; markRecord?: Mark };
    compositionOrInsha?: { rawScore: number; outOf: number; markRecord?: Mark };
  };
}

/**
 * Checks if a subject is English Language (non-composition)
 */
export function isEnglishLanguage(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (code === 'COMP' || name.includes('COMPOSITION') || id.includes('_comp')) return false;
  return code === 'ENG' || code === 'ENGLISH' || name.includes('ENGLISH') || id.includes('eng');
}

/**
 * Checks if a subject is English Composition (component marked out of 40)
 */
export function isEnglishComposition(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'COMP' || code === 'ENG COMP' || name.includes('COMPOSITION') || id.includes('_comp');
}

/**
 * Checks if a subject is Kiswahili Lugha (non-insha)
 */
export function isKiswahiliLugha(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (code === 'INSHA' || name.includes('INSHA') || id.includes('_insha')) return false;
  return code === 'KIS' || code === 'KISW' || code === 'KISWAHILI' || name.includes('KISWAHILI') || name.includes('LUGHA') || id.includes('kis');
}

/**
 * Checks if a subject is Kiswahili Insha (component marked out of 40)
 */
export function isKiswahiliInsha(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'INSHA' || code === 'KIS INSHA' || name.includes('INSHA') || id.includes('_insha');
}

/**
 * Checks if a subject is Mathematics
 */
export function isMathematics(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'MATH' || code === 'MATHS' || code === 'MATHEMATICS' || name.includes('MATH') || id.includes('math');
}

/**
 * Checks if a subject is Integrated Science / Science
 */
export function isIntegratedScience(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'IS' || code === 'INT SCI' || code === 'SCI' || name.includes('INTEGRATED SCIENCE') || name.includes('SCIENCE') || id.includes('sci');
}

/**
 * Checks if a subject is Creative Arts & Sports (CAS)
 */
export function isCreativeArts(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'CAS' || code === 'CREATIVE ARTS' || code === 'ART' || name.includes('CREATIVE ARTS') || name.includes('CAS') || id.includes('art') || id.includes('cas');
}
/**
 * Checks if a subject represents Social Studies (standalone component, non-composite).
 */
export function isSocialStudies(subject?: { subject_code?: string; code?: string; id?: string; subject_name?: string; name?: string; learning_area?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (
    code === 'SS&CRE' ||
    code === 'SS & CRE' ||
    code === 'SS/CRE' ||
    code === 'SST&CRE' ||
    code === 'SST/CRE' ||
    name.includes('SS&CRE') ||
    name.includes('SOCIAL STUDIES&CRE') ||
    name.includes('SOCIAL STUDIES & CRE') ||
    id === 'sb_up_ss_cre' ||
    id === 'f8255683-1d59-46a7-881a-04a25d45d972'
  ) {
    return false;
  }
  return (
    code === 'SST' ||
    code === 'SST UP' ||
    name === 'SOCIAL STUDIES' ||
    id === 'sb_sst' ||
    id === 'sb_up_sst' ||
    id === 'dff8e7fc-bb0d-41c5-b451-e6b6f3361409'
  );
}

/**
 * Checks if a subject represents Christian Religious Education (standalone component, non-composite).
 */
export function isChristianReligiousEducation(subject?: { subject_code?: string; code?: string; id?: string; subject_name?: string; name?: string; learning_area?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (
    code === 'SS&CRE' ||
    code === 'SS & CRE' ||
    code === 'SS/CRE' ||
    code === 'SST&CRE' ||
    code === 'SST/CRE' ||
    name.includes('SS&CRE') ||
    name.includes('SOCIAL STUDIES&CRE') ||
    name.includes('SOCIAL STUDIES & CRE') ||
    id === 'sb_up_ss_cre' ||
    id === 'f8255683-1d59-46a7-881a-04a25d45d972'
  ) {
    return false;
  }
  return (
    code === 'CRE' ||
    code === 'C.R.E' ||
    code === 'C.R.E.' ||
    name === 'CHRISTIAN RELIGIOUS EDUCATION' ||
    id === 'sb_cre' ||
    id === 'sb_up_cre' ||
    id === 'e784b5fc-dab9-4105-bb49-fce1d1a84cf7'
  );
}

/**
 * Checks if a subject is historical direct Social Studies & CRE.
 */
export function isDirectSSCRE(subject?: { subject_code?: string; code?: string; id?: string; subject_name?: string; name?: string; learning_area?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return (
    id === 'f8255683-1d59-46a7-881a-04a25d45d972' ||
    id === 'sb_up_ss_cre' ||
    id === 'synth_ss_cre_composite' ||
    id === 'f8255683-1d59-46a7-881a-04a25d45d972' ||
    code === 'SS&CRE' ||
    code === 'SS & CRE' ||
    code === 'SS/CRE' ||
    code === 'SST&CRE' ||
    code === 'SST/CRE' ||
    name.includes('SS&CRE') ||
    name.includes('SOCIAL STUDIES&CRE') ||
    name.includes('SOCIAL STUDIES & CRE') ||
    name.includes('SOCIAL STUDIES AND CRE') ||
    name.includes('SOCIAL STUDIES & C.R.E') ||
    name.includes('SOCIAL STUDIES AND RELIGIOUS EDUCATION')
  );
}

/**
 * Checks whether an entity, class, student, or grade string corresponds to Upper Primary Grade 4 or Grade 5.
 * In Kenya CBE curriculum, Grades 4 and 5 assess Social Studies and CRE as a single merged learning area (SS&CRE).
 */
export function isGrade4Or5(entity?: string | { class_name?: string; grade?: string } | null): boolean {
  if (!entity) return false;
  const str = typeof entity === 'string'
    ? entity
    : (entity.class_name || entity.grade || '');
  const normalized = extractGradeName(str) || str;
  return (
    normalized === 'Grade 4' ||
    normalized === 'Grade 5' ||
    str.includes('Grade 4') ||
    str.includes('Grade 5')
  );
}

/**
 * Detects whether there are any marks for separate Social Studies (SST) and Christian Religious Education (CRE)
 * for a specific student and/or exam.
 * Returns true if separate marks exist (so the report form displays separate SST & CRE).
 * Returns false if no marks exist for separate SST and CRE (so the report form displays the merged marks).
 */
export function hasSeparateSstAndCreMarks(
  student?: { id?: string; admission_number?: string } | null,
  exam?: { id?: string; exam_code?: string; exam_name?: string; name?: string } | null,
  marks?: Mark[] | null,
  subjects: Subject[] = []
): boolean {
  if (!exam || !marks || marks.length === 0) return false;

  const examId = exam.id;
  const examCode = (exam as any).exam_code;
  const examName = exam.exam_name || (exam as any).name;

  const isExamMatch = (mExamId: string) => {
    return (
      mExamId === examId ||
      (examCode && mExamId === examCode) ||
      (examName && mExamId === examName)
    );
  };

  const isStudentMatch = (stdId: string | undefined | null) => {
    if (!student) return true;
    if (!stdId) return false;
    const sIdStr = String(stdId).trim().toLowerCase();
    return (
      (student.id && String(student.id).trim().toLowerCase() === sIdStr) ||
      (student.admission_number && String(student.admission_number).trim().toLowerCase() === sIdStr)
    );
  };

  // 1. Check student-level first (if student is provided)
  if (student) {
    let hasStudentSst = false;
    let hasStudentCre = false;

    for (const m of marks) {
      if (!isExamMatch(m.exam_id) || !isStudentMatch(m.student_id)) continue;
      const subj = subjects.find((s) => s.id === m.subject_id || s.subject_code === m.subject_id) || { id: m.subject_id };
      if (isDirectSSCRE(subj) || isDirectSSCRE({ id: m.subject_id })) continue;

      const ev = evaluateMark(m);
      if (ev.status === 'Normal' && ev.rawScore !== null && !isNaN(ev.rawScore)) {
        if (isSocialStudies(subj) || isSocialStudies({ id: m.subject_id })) hasStudentSst = true;
        if (isChristianReligiousEducation(subj) || isChristianReligiousEducation({ id: m.subject_id })) hasStudentCre = true;
      }
    }

    if (hasStudentSst || hasStudentCre) {
      return true;
    }
  }

  // 2. Check exam-wide across all students in the exam
  let hasExamSst = false;
  let hasExamCre = false;

  for (const m of marks) {
    if (!isExamMatch(m.exam_id)) continue;
    const subj = subjects.find((s) => s.id === m.subject_id || s.subject_code === m.subject_id) || { id: m.subject_id };
    if (isDirectSSCRE(subj) || isDirectSSCRE({ id: m.subject_id })) continue;

    const ev = evaluateMark(m);
    if (ev.status === 'Normal' && ev.rawScore !== null && !isNaN(ev.rawScore)) {
      if (isSocialStudies(subj) || isSocialStudies({ id: m.subject_id })) hasExamSst = true;
      if (isChristianReligiousEducation(subj) || isChristianReligiousEducation({ id: m.subject_id })) hasExamCre = true;
      if (hasExamSst && hasExamCre) return true;
    }
  }

  return hasExamSst && hasExamCre;
}

/**
 * Given an ss_cre_structure ('A' | 'B' | 'C' | 'CUSTOM:<sstMax>:<creMax>'), returns the configured maximum scores for SST and CRE.
 */
export function getSSCREComponentMaxMarks(structure?: UpperPrimarySSCREStructure | string | null): { sstMax: number; creMax: number; ssCreMax: number } | null {
  if (!structure) return null;
  const s = String(structure).trim().toUpperCase();
  if (s === 'A') {
    return { sstMax: 30, creMax: 20, ssCreMax: 50 };
  }
  if (s === 'B') {
    return { sstMax: 10, creMax: 10, ssCreMax: 20 };
  }
  if (s === 'C') {
    return { sstMax: 20, creMax: 30, ssCreMax: 50 };
  }

  // Strict Custom format: "CUSTOM:<sstMax>:<creMax>"
  const match = s.match(/^CUSTOM:(\d+):(\d+)$/);
  if (match) {
    const sstMax = parseInt(match[1], 10);
    const creMax = parseInt(match[2], 10);
    if (Number.isInteger(sstMax) && sstMax > 0 && Number.isInteger(creMax) && creMax > 0) {
      return { sstMax, creMax, ssCreMax: sstMax + creMax };
    }
  }

  return null;
}

/**
 * For Upper Primary students, merges ENG (/60) + COMP (/40) into English (/100),
 * KISW (/60) + INSHA (/40) into Kiswahili (/100),
 * and SST + CRE into SS&CRE based on the authoritative examination ss_cre_structure ('A', 'B', or 'C').
 *
 * Preserves historical direct SS&CRE marks (sb_up_ss_cre) and enforces explicit conflict surfacing
 * if both direct and component marks exist for the same learner in the same assessment.
 */
export function getUpperPrimaryCompositeSubjectMarks(
  studentMarks: Mark[],
  subjects: { id: string; subject_code?: string; code?: string; subject_name?: string; name?: string; education_level?: string }[],
  educationLevel?: string | null,
  examOrStructure?: Examination | UpperPrimarySSCREStructure | string | null
): {
  processedMarks: Mark[];
  syntheticSubjects: Subject[];
} {
  const isStandalone =
    typeof examOrStructure === 'object' && examOrStructure !== null
      ? (examOrStructure as any).assessment_structure === 'Standalone'
      : examOrStructure === 'Standalone';

  if (educationLevel !== 'Upper Primary' || isStandalone) {
    return { processedMarks: studentMarks, syntheticSubjects: [] };
  }

  let engLangSub: any = null;
  let engCompSub: any = null;
  let kiswLangSub: any = null;
  let kiswInshaSub: any = null;
  let sstSub: any = null;
  let creSub: any = null;
  let directSsCreSub: any = null;

  subjects.forEach(s => {
    if (!engLangSub && isEnglishLanguage(s) && !isEnglishComposition(s)) engLangSub = s;
    if (!engCompSub && isEnglishComposition(s)) engCompSub = s;
    if (!kiswLangSub && isKiswahiliLugha(s) && !isKiswahiliInsha(s)) kiswLangSub = s;
    if (!kiswInshaSub && isKiswahiliInsha(s)) kiswInshaSub = s;
    if (!sstSub && isSocialStudies(s)) sstSub = s;
    if (!creSub && isChristianReligiousEducation(s)) creSub = s;
    if (!directSsCreSub && isDirectSSCRE(s)) directSsCreSub = s;
  });

  const processed: Mark[] = [];
  const syntheticSubs: any[] = [];
  const handledSubjectIds = new Set<string>();

  // 1. English Composite: ENG (60) + COMP (40) -> English (100)
  if (engLangSub && engCompSub) {
    handledSubjectIds.add(engLangSub.id);
    handledSubjectIds.add(engCompSub.id);

    const engMark = studentMarks.find((m) => {
      if (m.subject_id === engLangSub.id || m.subject_id === 'sb_up_eng' || m.subject_id === 'sb_eng') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isEnglishLanguage(sub) && !isEnglishComposition(sub);
      return isEnglishLanguage({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name }) &&
             !isEnglishComposition({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });
    const compMark = studentMarks.find((m) => {
      if (m.subject_id === engCompSub.id || m.subject_id === 'sb_up_comp' || m.subject_id === 'COMP') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isEnglishComposition(sub);
      return isEnglishComposition({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });

    const evalEng = evaluateMark(engMark);
    const evalComp = evaluateMark(compMark, { isUpperPrimaryCompOrInsha: true, subject: engCompSub, educationLevel: 'Upper Primary' });

    const synthId = 'synth_english_composite';
    syntheticSubs.push({
      id: synthId,
      subject_name: 'English',
      subject_code: 'ENG',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    if (evalEng.status === 'Y' || evalComp.status === 'Y') {
      processed.push({
        id: 'synth_mark_english',
        exam_id: engMark?.exam_id || compMark?.exam_id || '',
        student_id: engMark?.student_id || compMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'Y',
        irregularity_reason: evalEng.irregularityReason || evalComp.irregularityReason || 'Irregularity',
        is_synthetic: true,
      });
    } else if (evalEng.status === 'Normal' && evalComp.status === 'Normal') {
      const engRaw = evalEng.rawScore ?? 0;
      const compRaw = evalComp.rawScore ?? 0;
      const totalRaw = engRaw + compRaw;

      processed.push({
        id: 'synth_mark_english',
        exam_id: engMark?.exam_id || compMark?.exam_id || '',
        student_id: engMark?.student_id || compMark?.student_id || '',
        subject_id: synthId,
        score: totalRaw,
        marks: totalRaw,
        raw_score: totalRaw,
        out_of: 100,
        percentage: totalRaw,
        special_status: 'Normal',
        is_synthetic: true,
      });
    } else if (evalEng.status !== 'Blank' || evalComp.status !== 'Blank') {
      // Either one or both components are present but not both Normal (e.g. one Normal + one Blank/X, or X + X)
      processed.push({
        id: 'synth_mark_english',
        exam_id: engMark?.exam_id || compMark?.exam_id || '',
        student_id: engMark?.student_id || compMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Incomplete',
        is_synthetic: true,
      });
    }
  }

  // 2. Kiswahili Composite: KIS (60) + INSHA (40) -> Kiswahili (100)
  if (kiswLangSub && kiswInshaSub) {
    handledSubjectIds.add(kiswLangSub.id);
    handledSubjectIds.add(kiswInshaSub.id);

    const kiswMark = studentMarks.find((m) => {
      if (m.subject_id === kiswLangSub.id || m.subject_id === 'sb_up_kis' || m.subject_id === 'sb_kis') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isKiswahiliLugha(sub) && !isKiswahiliInsha(sub);
      return isKiswahiliLugha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name }) &&
             !isKiswahiliInsha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });
    const inshaMark = studentMarks.find((m) => {
      if (m.subject_id === kiswInshaSub.id || m.subject_id === 'sb_up_insha' || m.subject_id === 'INSHA') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isKiswahiliInsha(sub);
      return isKiswahiliInsha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });

    const evalKisw = evaluateMark(kiswMark);
    const evalInsha = evaluateMark(inshaMark, { isUpperPrimaryCompOrInsha: true, subject: kiswInshaSub, educationLevel: 'Upper Primary' });

    const synthId = 'synth_kiswahili_composite';
    syntheticSubs.push({
      id: synthId,
      subject_name: 'Kiswahili',
      subject_code: 'KIS',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    if (evalKisw.status === 'Y' || evalInsha.status === 'Y') {
      processed.push({
        id: 'synth_mark_kiswahili',
        exam_id: kiswMark?.exam_id || inshaMark?.exam_id || '',
        student_id: kiswMark?.student_id || inshaMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'Y',
        irregularity_reason: evalKisw.irregularityReason || evalInsha.irregularityReason || 'Irregularity',
        is_synthetic: true,
      });
    } else if (evalKisw.status === 'Normal' && evalInsha.status === 'Normal') {
      const kiswRaw = evalKisw.rawScore ?? 0;
      const inshaRaw = evalInsha.rawScore ?? 0;
      const totalRaw = kiswRaw + inshaRaw;

      processed.push({
        id: 'synth_mark_kiswahili',
        exam_id: kiswMark?.exam_id || inshaMark?.exam_id || '',
        student_id: kiswMark?.student_id || inshaMark?.student_id || '',
        subject_id: synthId,
        score: totalRaw,
        marks: totalRaw,
        raw_score: totalRaw,
        out_of: 100,
        percentage: totalRaw,
        special_status: 'Normal',
        is_synthetic: true,
      });
    } else if (evalKisw.status !== 'Blank' || evalInsha.status !== 'Blank') {
      // Either one or both components are present but not both Normal (e.g. one Normal + one Blank/X, or X + X)
      processed.push({
        id: 'synth_mark_kiswahili',
        exam_id: kiswMark?.exam_id || inshaMark?.exam_id || '',
        student_id: kiswMark?.student_id || inshaMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Incomplete',
        is_synthetic: true,
      });
    }
  }

  // 3. Social Studies & CRE Composite (SST + CRE -> SS&CRE)
  // Authoritative CBE Upper Primary Resolution Rule:
  // - If the assessment is explicitly configured for Option B / component structure ('A' | 'B' | 'C'),
  //   SST + CRE component marks are AUTHORITATIVE. Any in-memory direct mark is cleanly handled and superseded.
  // - If the assessment uses the historical/merged model (no ss_cre_structure) and a direct SS&CRE mark exists,
  //   the direct SS&CRE mark is AUTHORITATIVE and preserved intact. Component-shaped data in memory is not used to override it.
  // - If neither structure is specified, but only component marks are present, we dynamically synthesize the composite using inferred maxes.
  
  let explicitStructure: UpperPrimarySSCREStructure | null = null;
  if (typeof examOrStructure === 'string') {
    const s = examOrStructure.trim().toUpperCase();
    if (getSSCREComponentMaxMarks(s) !== null) {
      explicitStructure = s as UpperPrimarySSCREStructure;
    }
  } else if (examOrStructure && typeof examOrStructure === 'object') {
    const s = (examOrStructure as any).ss_cre_structure;
    if (s) {
      const su = String(s).trim().toUpperCase();
      if (getSSCREComponentMaxMarks(su) !== null) {
        explicitStructure = su as UpperPrimarySSCREStructure;
      }
    }
  }

  const sstMark = studentMarks.find((m) => {
    if (sstSub && m.subject_id === sstSub.id) return true;
    if (m.subject_id === 'sb_sst' || m.subject_id === 'sb_up_sst') return true;
    const sub = subjects.find((s) => s.id === m.subject_id);
    if (sub) return isSocialStudies(sub);
    return isSocialStudies({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
  });
  const creMark = studentMarks.find((m) => {
    if (creSub && m.subject_id === creSub.id) return true;
    if (m.subject_id === 'sb_cre' || m.subject_id === 'sb_up_cre') return true;
    const sub = subjects.find((s) => s.id === m.subject_id);
    if (sub) return isChristianReligiousEducation(sub);
    return isChristianReligiousEducation({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
  });
  const directSsCreMark = studentMarks.find((m) => {
    if (directSsCreSub && m.subject_id === directSsCreSub.id) return true;
    if (m.subject_id === 'sb_up_ss_cre' || m.subject_id === 'synth_ss_cre_composite' || m.subject_id === 'SS&CRE') return true;
    const sub = subjects.find((s) => s.id === m.subject_id);
    if (sub) return isDirectSSCRE(sub);
    return isDirectSSCRE({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
  });

  const evalDirect = evaluateMark(directSsCreMark);
  const evalSst = evaluateMark(sstMark);
  const evalCre = evaluateMark(creMark);

  const hasDirectMark = evalDirect.status === 'Normal' || evalDirect.status === 'X' || evalDirect.status === 'Y';
  const hasComponentMarks = evalSst.status === 'Normal' || evalSst.status === 'X' || evalSst.status === 'Y' ||
                            evalCre.status === 'Normal' || evalCre.status === 'X' || evalCre.status === 'Y';

  // Determine whether component marks or direct marks are authoritative
  // In Grades 4 and 5 (or any case where the learner was assessed directly on SS&CRE without separate SST/CRE papers),
  // direct SS&CRE mark is authoritative.
  const hasSsCreCompositeContext = Boolean(explicitStructure) || Boolean(directSsCreSub) || (Boolean(sstSub) && Boolean(creSub)) || (Boolean(sstMark) && Boolean(creMark));
  const isComponentAuthoritative = Boolean(explicitStructure) && hasComponentMarks;
  const isDirectAuthoritative = (!explicitStructure || !hasComponentMarks) && hasDirectMark;
  const isComponentFallback = !explicitStructure && !hasDirectMark && hasComponentMarks && hasSsCreCompositeContext;

  if (isComponentAuthoritative || isComponentFallback) {
    let structureCode = explicitStructure;
    if (!structureCode) {
      const sstOutOf = sstMark?.out_of || (sstMark as any)?.max_score;
      const creOutOf = creMark?.out_of || (creMark as any)?.max_score;
      if (sstOutOf === 10 || creOutOf === 10) {
        structureCode = 'B';
      } else if (sstOutOf === 30 || creOutOf === 20) {
        structureCode = 'A';
      } else if (sstOutOf === 20 || creOutOf === 30) {
        structureCode = 'C';
      } else {
        structureCode = 'B';
      }
    }
    const sstCreMaxes = getSSCREComponentMaxMarks(structureCode);

    if (directSsCreMark) handledSubjectIds.add(directSsCreMark.subject_id);
    if (sstSub) handledSubjectIds.add(sstSub.id);
    if (creSub) handledSubjectIds.add(creSub.id);
    if (sstMark) handledSubjectIds.add(sstMark.subject_id);
    if (creMark) handledSubjectIds.add(creMark.subject_id);

    const synthId = directSsCreSub?.id || 'sb_up_ss_cre';
    syntheticSubs.push({
      id: synthId,
      subject_name: directSsCreSub?.subject_name || 'Social Studies&CRE',
      subject_code: directSsCreSub?.subject_code || 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    const isSstSubmitted = evalSst.status === 'Normal' || evalSst.status === 'X' || evalSst.status === 'Y';
    const isCreSubmitted = evalCre.status === 'Normal' || evalCre.status === 'X' || evalCre.status === 'Y';

    if (evalSst.status === 'Y' || evalCre.status === 'Y') {
      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: sstCreMaxes?.ssCreMax || 50,
        percentage: 0,
        special_status: 'Y',
        irregularity_reason: evalSst.irregularityReason || evalCre.irregularityReason || 'Irregularity',
        is_synthetic: true,
      });
    } else if (evalSst.status === 'X' && evalCre.status === 'X') {
      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: sstCreMaxes?.ssCreMax || 50,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Absent',
        is_synthetic: true,
      });
    } else if (isSstSubmitted && isCreSubmitted) {
      // Both components submitted (could be Normal+Normal or Normal+X)
      const sstRaw = evalSst.status === 'Normal' ? (evalSst.rawScore ?? 0) : 0;
      const creRaw = evalCre.status === 'Normal' ? (evalCre.rawScore ?? 0) : 0;
      const totalRaw = sstRaw + creRaw;
      const totalMax = sstCreMaxes?.ssCreMax || 50;
      const pct = totalMax > 0 ? (totalRaw / totalMax) * 100 : totalRaw;

      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        score: totalRaw,
        marks: totalRaw,
        raw_score: totalRaw,
        out_of: totalMax,
        percentage: pct,
        is_synthetic: true,
      });
    } else if (isSstSubmitted || isCreSubmitted) {
      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: sstCreMaxes?.ssCreMax || 50,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Incomplete',
        is_synthetic: true,
      });
    }
  } else if (isDirectAuthoritative) {
    if (directSsCreMark) handledSubjectIds.add(directSsCreMark.subject_id);
    if (sstSub) handledSubjectIds.add(sstSub.id);
    if (creSub) handledSubjectIds.add(creSub.id);
    if (sstMark) handledSubjectIds.add(sstMark.subject_id);
    if (creMark) handledSubjectIds.add(creMark.subject_id);

    const rawDirect = evalDirect.status === 'Normal' ? (evalDirect.rawScore ?? Number(directSsCreMark?.score) ?? 0) : 0;
    const directOutOf = Number(directSsCreMark?.out_of || 50);

    const synthId = directSsCreSub?.id || 'sb_up_ss_cre';
    syntheticSubs.push({
      id: synthId,
      subject_name: directSsCreSub?.subject_name || 'Social Studies&CRE',
      subject_code: directSsCreSub?.subject_code || 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    const pct = directOutOf > 0 ? (rawDirect / directOutOf) * 100 : rawDirect;
    processed.push({
      id: directSsCreMark?.id || 'synth_mark_ss_cre',
      exam_id: directSsCreMark?.exam_id || '',
      student_id: directSsCreMark?.student_id || '',
      subject_id: synthId,
      score: directSsCreMark?.score ?? pct,
      marks: directSsCreMark?.marks ?? pct,
      raw_score: rawDirect,
      out_of: directOutOf,
      percentage: pct,
      special_status: directSsCreMark?.special_status,
      irregularity_reason: directSsCreMark?.irregularity_reason,
      is_synthetic: directSsCreMark?.is_synthetic ?? false,
    });
  }

  // 4. Pass through all other unhandled marks (including direct historical SS&CRE marks)
  studentMarks.forEach(m => {
    if (!handledSubjectIds.has(m.subject_id)) {
      processed.push(m);
    }
  });

  return { processedMarks: processed, syntheticSubjects: syntheticSubs };
}

/**
 * Resolves authoritative subjects and marks for learner report cards, summaries, and PDF generators.
 * For Upper Primary (Grades 4–6):
 * - SST + CRE are resolved into the calculated SS&CRE composite result.
 * - SST and CRE component rows are excluded from the final reporting subject list.
 * - The calculated SS&CRE composite mark is returned in the resolved marks array.
 * For other education levels (e.g. Junior School Grades 7–9):
 * - Subjects and marks pass through without composite merging (preserving separate SST and CRE).
 */
export function resolveLearnerReportSubjectsAndMarks(
  student: Student,
  classObj: ClassStream | undefined,
  subjects: Subject[],
  teachers: Teacher[] | undefined,
  exam: Examination | undefined,
  rawMarks: Mark[]
): {
  reportSubjects: Subject[];
  reportMarks: Mark[];
} {
  // 1. Determine raw applicable subjects for this student
  let rawSubjects: Subject[] = [];
  if (classObj && classObj.allocated_subject_ids && classObj.allocated_subject_ids.length > 0) {
    rawSubjects = getAllocatedSubjectsForClass(classObj, subjects);
  } else {
    const stdGrade = classObj?.class_name || student?.grade || '';
    rawSubjects = getApplicableSubjectsForGrade(stdGrade, subjects);
  }

  // 2. Identify education level
  const gradeStr = student?.grade || classObj?.class_name || '';
  const eduLevel = classObj?.education_level || (exam?.education_level && (exam.education_level as string) !== 'All Levels' ? exam.education_level : null) || getEducationLevelForGrade(gradeStr);
  const normalizedGrade = extractGradeName(gradeStr) || gradeStr;
  const isUpperPrimary = eduLevel === 'Upper Primary' || ['Grade 4', 'Grade 5', 'Grade 6'].includes(normalizedGrade as any);

  // If not Upper Primary (e.g. Junior School Grade 7-9), return raw subjects and marks directly
  if (!isUpperPrimary) {
    return {
      reportSubjects: rawSubjects,
      reportMarks: rawMarks,
    };
  }

  // Standalone Upper Primary:
  // For Grade 4 & 5: SS&CRE is ALWAYS merged (7 learning areas with Agriculture, or 6 without). Exclude COMP, INSHA, and separate SST & CRE.
  // For Grade 6: 8 separate assessed learning areas (ENG, KIS, MATH, INT-SCI, SST, CRE, AGN, CAS).
  if (exam?.assessment_structure === 'Standalone') {
    const isG45 = isGrade4Or5(student) || isGrade4Or5(classObj);
    if (isG45) {
      const standaloneSubjects = rawSubjects.filter((sb) => {
        if (isEnglishComposition(sb) || isKiswahiliInsha(sb) || isSocialStudies(sb) || isChristianReligiousEducation(sb)) return false;
        return true;
      });
      if (!standaloneSubjects.some(isDirectSSCRE)) {
        const directSubj = subjects.find(isDirectSSCRE) || {
          id: 'f8255683-1d59-46a7-881a-04a25d45d972',
          subject_name: 'Social Studies&CRE',
          subject_code: 'SS&CRE',
          category: 'Core' as const,
          education_level: 'Upper Primary',
          applicable_grades: ['Grade 4', 'Grade 5'] as any,
        };
        standaloneSubjects.push(directSubj);
      }
      const standaloneMarks = rawMarks.filter((m) => {
        const sub = subjects.find((s) => s.id === m.subject_id);
        if (sub && (isEnglishComposition(sub) || isKiswahiliInsha(sub) || isSocialStudies(sub) || isChristianReligiousEducation(sub))) return false;
        return true;
      });
      return {
        reportSubjects: standaloneSubjects,
        reportMarks: standaloneMarks,
      };
    }

    const standaloneSubjects = rawSubjects.filter((sb) => {
      if (isEnglishComposition(sb) || isKiswahiliInsha(sb) || isDirectSSCRE(sb)) return false;
      return true;
    });
    const standaloneMarks = rawMarks.filter((m) => {
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub && (isEnglishComposition(sub) || isKiswahiliInsha(sub) || isDirectSSCRE(sub))) return false;
      return true;
    });
    return {
      reportSubjects: standaloneSubjects,
      reportMarks: standaloneMarks,
    };
  }

  // 3. Match marks for this specific learner
  const matchesStudent = (stdId: string | undefined | null) => {
    if (!stdId) return false;
    const str = String(stdId).trim().toLowerCase();
    if (student.id && String(student.id).trim().toLowerCase() === str) return true;
    if (student.admission_number && String(student.admission_number).trim().toLowerCase() === str) return true;
    return false;
  };

  const studentRawMarks = rawMarks.filter((m) => matchesStudent(m.student_id));
  const otherMarks = rawMarks.filter((m) => !matchesStudent(m.student_id));

  // 4. Run authoritative composite subject mark processing for Upper Primary
  const compositeResult = getUpperPrimaryCompositeSubjectMarks(
    studentRawMarks,
    rawSubjects,
    'Upper Primary',
    exam
  );

  // 5. Build final reporting subjects list for Upper Primary:
  // Exclude component subjects (SST and CRE), and if Composite, exclude Agriculture if not included in exam
  const isAgnIncluded = isAgricultureIncludedInCompositeExam(exam, classObj, subjects);
  const filteredSubjects = rawSubjects.filter((sb) => {
    if (isSocialStudies(sb) || isChristianReligiousEducation(sb)) return false;
    if (isAgricultureSubject(sb) && !isAgnIncluded) return false;
    return true;
  });

  // Ensure SS&CRE composite subject is present
  if (!filteredSubjects.some(isDirectSSCRE)) {
    const directSubj = subjects.find(isDirectSSCRE) || compositeResult.syntheticSubjects.find(isDirectSSCRE) || {
      id: 'sb_up_ss_cre',
      subject_name: 'Social Studies&CRE',
      subject_code: 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
      applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] as any,
    };
    filteredSubjects.push(directSubj);
  }

  // Combine other students' marks, the student's raw marks for non-component learning areas (ENG, COMP, KIS, INSHA, MATH, SCIENCE, CAS, etc.),
  // and the processed composite marks (e.g. SS&CRE composite mark)
  const nonComponentStudentRawMarks = studentRawMarks.filter(
    (m) => !isSocialStudies({ id: m.subject_id }) && !isChristianReligiousEducation({ id: m.subject_id })
  );

  const combinedStudentMarks = [...nonComponentStudentRawMarks];
  compositeResult.processedMarks.forEach((cm) => {
    if (!combinedStudentMarks.some((m) => m.id === cm.id || (m.subject_id === cm.subject_id && m.exam_id === cm.exam_id))) {
      combinedStudentMarks.push(cm);
    }
  });

  const reportMarks = [...otherMarks, ...combinedStudentMarks];

  return {
    reportSubjects: filteredSubjects,
    reportMarks,
  };
}

/**
 * Central examination-aware subject filter for Marks Monitoring, Stream Approvals & Readiness.
 * - When an examination defines component SST + CRE papers (exam.ss_cre_structure is set),
 *   the direct merged SS&CRE subject is not an expected paper.
 * - For Upper Primary Composite examinations, Agriculture inclusion is determined by
 *   the authoritative helper isAgricultureIncludedInCompositeExam(exam, classObj, subjects).
 * - For Standalone or non-Upper Primary examinations, Agriculture is retained unless
 *   explicitly disabled (exam.include_agriculture === false).
 */
export function filterSubjectsForExamStructure(
  subjects: Subject[],
  exam?: Examination | null,
  classObj?: ClassStream | { id?: string; allocated_subject_ids?: string[]; class_name?: string; education_level?: string } | null,
  allSubjects?: Subject[]
): Subject[] {
  if (!exam) return subjects;

  const isStandalone = exam.assessment_structure === 'Standalone';
  const isUpperPrimary =
    exam.education_level === 'Upper Primary' ||
    (!exam.education_level &&
      (classObj?.education_level === 'Upper Primary' ||
        (classObj?.class_name && ['Grade 4', 'Grade 5', 'Grade 6'].some((g) => classObj.class_name?.includes(g))) ||
        subjects.some(
          (s) =>
            s.education_level === 'Upper Primary' ||
            (s.applicable_grades && s.applicable_grades.some((g) => ['Grade 4', 'Grade 5', 'Grade 6'].includes(g)))
        )));

  const poolSubjects = allSubjects && allSubjects.length > 0 ? allSubjects : subjects;

  const isAgnIncluded =
    isUpperPrimary && !isStandalone
      ? isAgricultureIncludedInCompositeExam(exam, classObj, poolSubjects)
      : exam.include_agriculture !== false;

  const isG45 = isGrade4Or5(classObj);

  return subjects.filter((subject) => {
    if (isG45) {
      // In Grades 4 and 5, Social Studies and CRE are ALWAYS taught and assessed as the merged SS&CRE subject.
      // Separate SST and CRE papers are NEVER expected for Grades 4 & 5.
      if (isSocialStudies(subject) || isChristianReligiousEducation(subject)) {
        return false;
      }
      if (isDirectSSCRE(subject)) {
        return true;
      }
    } else {
      // When the examination uses component SST + CRE papers (Grade 6 KPSEA),
      // the direct SS&CRE subject is not an expected paper.
      if (exam.ss_cre_structure && isDirectSSCRE(subject)) {
        return false;
      }
    }

    // Agriculture exclusion rule
    if (isAgricultureSubject(subject) && !isAgnIncluded) {
      return false;
    }

    return true;
  });
}

export interface UpperPrimaryMeritListPartition {
  isUpperPrimary: boolean;
  isStandalone: boolean;
  isAgnIncluded: boolean;
  hasUpperPrimaryEng: boolean;
  hasUpperPrimaryKisw: boolean;
  hasUpperPrimarySsCre: boolean;
  engLangSubj?: Subject;
  engCompSubj?: Subject;
  kiswLughaSubj?: Subject;
  kiswInshaSubj?: Subject;
  sstSubj?: Subject;
  creSubj?: Subject;
  directSsCreSubj?: Subject;
  otherUpperPrimarySubjects: Subject[];
}

/**
 * Authoritatively partitions Upper Primary subjects for Merit List presentation & exports (Web UI, PDF, Excel, CSV).
 * Strictly guarantees consistency across all outputs:
 * - Arrangement A (Direct combined SS&CRE): SS&CRE is rendered as a single learning area. Standalone SST and CRE columns are strictly excluded.
 * - Arrangement B (Component-based SS&CRE): SS&CRE is rendered with the grouped sub-columns (SST, CRE, %), direct SS&CRE is excluded from other subjects, and SST & CRE are excluded from standalone columns.
 */
export function getUpperPrimaryMeritListSubjectPartition(params: {
  activeSubjects: Subject[];
  subjects?: Subject[];
  exam?: any;
  targetClass?: any;
  eduLevel?: string;
  targetGrade?: string;
  isStandalone?: boolean;
  marks?: Mark[];
}): UpperPrimaryMeritListPartition {
  const {
    activeSubjects,
    subjects = [],
    exam,
    targetClass,
    eduLevel,
    targetGrade,
    isStandalone: explicitStandalone,
    marks,
  } = params;

  const resolvedLevel = eduLevel || (targetClass?.education_level) || getEducationLevelForGrade(targetGrade || targetClass?.class_name || '');
  const isStandalone =
    explicitStandalone !== undefined
      ? explicitStandalone
      : ((resolvedLevel === 'Upper Primary' ||
          resolvedLevel === 'upper_primary' ||
          Boolean(targetGrade && ['Grade 4', 'Grade 5', 'Grade 6'].includes(targetGrade)) ||
          Boolean(targetClass?.class_name && ['Grade 4', 'Grade 5', 'Grade 6'].includes(targetClass.class_name))) &&
          exam?.assessment_structure === 'Standalone');

  const isUpperPrimary =
    (resolvedLevel === 'Upper Primary' ||
      resolvedLevel === 'upper_primary' ||
      Boolean(targetGrade && ['Grade 4', 'Grade 5', 'Grade 6'].includes(targetGrade)) ||
      Boolean(targetClass?.class_name && ['Grade 4', 'Grade 5', 'Grade 6'].includes(targetClass.class_name))) &&
    !isStandalone;

  if (!isUpperPrimary) {
    return {
      isUpperPrimary: false,
      isStandalone,
      isAgnIncluded: true,
      hasUpperPrimaryEng: false,
      hasUpperPrimaryKisw: false,
      hasUpperPrimarySsCre: false,
      otherUpperPrimarySubjects: [],
    };
  }

  const poolSubjects = subjects.length > 0 ? subjects : activeSubjects;
  const isAgnIncluded = isAgricultureIncludedInCompositeExam(exam, targetClass, poolSubjects);

  const engLangSubj = activeSubjects.find((s) => isEnglishLanguage(s)) || poolSubjects.find((s) => isEnglishLanguage(s));
  const engCompSubj =
    activeSubjects.find(
      (s) =>
        !isEnglishLanguage(s) &&
        !isKiswahiliLugha(s) &&
        ((s.subject_code || '').toUpperCase() === 'COMP' ||
          (s.subject_name || '').toUpperCase().includes('COMPOSITION') ||
          (s.subject_code && (s.subject_code.toUpperCase().includes('COMP') || s.subject_code.toUpperCase().includes('ENG-COMP'))))
    ) ||
    poolSubjects.find(
      (s) =>
        !isEnglishLanguage(s) &&
        !isKiswahiliLugha(s) &&
        ((s.subject_code || '').toUpperCase() === 'COMP' ||
          (s.subject_name || '').toUpperCase().includes('COMPOSITION') ||
          (s.subject_code && (s.subject_code.toUpperCase().includes('COMP') || s.subject_code.toUpperCase().includes('ENG-COMP'))))
    );

  const kiswLughaSubj = activeSubjects.find((s) => isKiswahiliLugha(s)) || poolSubjects.find((s) => isKiswahiliLugha(s));
  const kiswInshaSubj =
    activeSubjects.find(
      (s) =>
        !isKiswahiliLugha(s) &&
        ((s.subject_code || '').toUpperCase() === 'INSHA' ||
          (s.subject_name || '').toUpperCase().includes('INSHA') ||
          (s.subject_code && s.subject_code.toUpperCase().includes('INSHA')))
    ) ||
    poolSubjects.find(
      (s) =>
        !isKiswahiliLugha(s) &&
        ((s.subject_code || '').toUpperCase() === 'INSHA' ||
          (s.subject_name || '').toUpperCase().includes('INSHA') ||
          (s.subject_code && s.subject_code.toUpperCase().includes('INSHA')))
    );

  const sstSubj = activeSubjects.find((s) => isSocialStudies(s)) || poolSubjects.find((s) => isSocialStudies(s));
  const creSubj = activeSubjects.find((s) => isChristianReligiousEducation(s)) || poolSubjects.find((s) => isChristianReligiousEducation(s));
  const directSsCreSubj =
    activeSubjects.find((s) => isDirectSSCRE(s)) || poolSubjects.find((s) => isDirectSSCRE(s));

  const hasUpperPrimaryEng = Boolean(engLangSubj || engCompSubj);
  const hasUpperPrimaryKisw = Boolean(kiswLughaSubj || kiswInshaSubj);

  // Check structure: if explicit structure exists ('A' | 'B' | 'C' | 'CUSTOM:...'),
  // OR if G6 Opener 2026 has separate marks, use component structure
  let effectiveStructure = exam?.ss_cre_structure;
  if (!effectiveStructure && exam && isGrade6OpenerTerm32026(exam) && marks && marks.length > 0) {
    if (hasSeparateSstAndCreMarks(null, exam, marks, poolSubjects)) {
      effectiveStructure = 'A';
    }
  }

  // Arrangement B (Component-based): when assessment explicitly specifies ss_cre_structure ('A', 'B', 'C', 'CUSTOM:...') AND component subjects exist
  const hasUpperPrimarySsCre =
    Boolean(effectiveStructure && getSSCREComponentMaxMarks(effectiveStructure) !== null) &&
    Boolean(sstSubj || creSubj);

  // Filter other subjects:
  // - Exclude English Lang & Comp (rendered in 3-tier English group)
  // - Exclude Kiswahili Lugha & Insha (rendered in 3-tier Kiswahili group)
  // - In Upper Primary Composite mode, SST and CRE are component subjects, NEVER standalone columns
  // - Exclude direct SS&CRE ONLY when the 3-tier component group (hasUpperPrimarySsCre) is active
  // - Exclude Agriculture if !isAgnIncluded
  const excludedSubjIds = new Set<string>();
  if (engLangSubj) excludedSubjIds.add(engLangSubj.id);
  if (engCompSubj) excludedSubjIds.add(engCompSubj.id);
  if (kiswLughaSubj) excludedSubjIds.add(kiswLughaSubj.id);
  if (kiswInshaSubj) excludedSubjIds.add(kiswInshaSubj.id);

  if (sstSubj) excludedSubjIds.add(sstSubj.id);
  if (creSubj) excludedSubjIds.add(creSubj.id);
  activeSubjects.forEach((s) => {
    if (isSocialStudies(s) || isChristianReligiousEducation(s)) {
      excludedSubjIds.add(s.id);
    }
  });

  if (hasUpperPrimarySsCre) {
    if (directSsCreSubj) excludedSubjIds.add(directSsCreSubj.id);
    activeSubjects.forEach((s) => {
      if (isDirectSSCRE(s)) {
        excludedSubjIds.add(s.id);
      }
    });
  }

  let otherUpperPrimarySubjects = activeSubjects.filter(
    (s) => !excludedSubjIds.has(s.id) && (!isAgnIncluded ? !isAgricultureSubject(s) : true)
  );

  // In Arrangement A (Direct combined SS&CRE): ensure the combined SS&CRE subject is present
  if (!hasUpperPrimarySsCre && !otherUpperPrimarySubjects.some((s) => isDirectSSCRE(s))) {
    const canonicalSsCre =
      directSsCreSubj ||
      poolSubjects.find(isDirectSSCRE) || {
        id: 'f8255683-1d59-46a7-881a-04a25d45d972',
        subject_code: 'SS&CRE',
        subject_name: 'Social Studies & CRE',
        education_level: 'Upper Primary',
        category: 'Core' as const,
        applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] as any,
      };
    otherUpperPrimarySubjects.push(canonicalSsCre);
  }

  // Ensure Agriculture is included if required by exam settings but missing from active subjects
  if (isAgnIncluded && !otherUpperPrimarySubjects.some(isAgricultureSubject)) {
    const agnSub = poolSubjects.find(isAgricultureSubject) || {
      id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f',
      subject_code: 'AGN',
      subject_name: 'Agriculture',
      education_level: 'Upper Primary',
      category: 'Core' as const,
      applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] as any,
    };
    otherUpperPrimarySubjects.push(agnSub);
  }

  // Deduplicate otherUpperPrimarySubjects by display code
  const seenCodes = new Set<string>();
  otherUpperPrimarySubjects = otherUpperPrimarySubjects.filter((s) => {
    const code = getMeritListDisplayCode(s.subject_code, s.subject_name, 'Upper Primary');
    if (seenCodes.has(code)) return false;
    seenCodes.add(code);
    return true;
  });

  // Ensure standard CBE order for other subjects
  otherUpperPrimarySubjects = sortSubjectsByStandardOrder(otherUpperPrimarySubjects);

  const resolvedDirectSsCre =
    directSsCreSubj ||
    poolSubjects.find(isDirectSSCRE) ||
    otherUpperPrimarySubjects.find(isDirectSSCRE);

  return {
    isUpperPrimary: true,
    isStandalone: false,
    isAgnIncluded,
    hasUpperPrimaryEng,
    hasUpperPrimaryKisw,
    hasUpperPrimarySsCre,
    engLangSubj,
    engCompSubj,
    kiswLughaSubj,
    kiswInshaSubj,
    sstSubj,
    creSubj,
    directSsCreSubj: resolvedDirectSsCre,
    otherUpperPrimarySubjects,
  };
}

/**
 * Calculates per-subject stream mean percentages for Junior School regular report cards.
 *
 * Requirements & Invariants:
 * - Deterministic, pure calculation helper (no mutations, no network or global state).
 * - Scoped strictly to the specified examination ID and stream student IDs.
 * - Uses evaluateMark() for percentage conversion and validity.
 * - Genuine assessed zero scores (0%) are included in both sum and denominator.
 * - Missing ('X'), absent/irregular ('Y'), blank, unentered and invalid marks are excluded from both numerator and denominator.
 * - If no valid assessed scores exist for a subject in the stream, returns null (never zero).
 * - Rounds the final subject mean percentage to the nearest whole integer via Math.round(),
 *   matching CBE Hub report card and analysis engine conventions.
 * - Deduplicates multiple mark rows for the same learner and subject, ensuring each learner contributes at most once.
 */
export function calculateStreamSubjectMeans(
  marks: Mark[],
  streamStudentIds: Set<string> | string[] | ReadonlySet<string>,
  examId: string,
  subjects?: Array<string | Subject | { id: string; subject_code?: string }>
): Record<string, number | null> {
  const result: Record<string, number | null> = {};

  // 1. Initialize requested subjects with null
  const targetSubjectIds: string[] = [];
  if (Array.isArray(subjects) && subjects.length > 0) {
    for (const sb of subjects) {
      const id = typeof sb === 'string' ? sb.trim() : sb?.id ? String(sb.id).trim() : '';
      if (id) {
        targetSubjectIds.push(id);
        result[id] = null;
      }
    }
  }

  // 2. Short-circuit on missing inputs
  if (!Array.isArray(marks) || marks.length === 0 || !examId) {
    return result;
  }

  const streamSet = streamStudentIds instanceof Set
    ? (streamStudentIds as Set<string>)
    : new Set(Array.isArray(streamStudentIds) ? streamStudentIds : Array.from(streamStudentIds || []));

  if (streamSet.size === 0) {
    return result;
  }

  // 3. Map: subject_id -> Map<student_id, { percentage: number; updatedAt?: string }>
  const subjectStudentMarks = new Map<string, Map<string, { percentage: number; updatedAt?: string }>>();

  for (const rawMark of marks) {
    if (!rawMark || typeof rawMark !== 'object') continue;
    if (rawMark.exam_id !== examId) continue;

    const studentId = rawMark.student_id ? String(rawMark.student_id).trim() : '';
    if (!studentId || !streamSet.has(studentId)) continue;

    const subjectId = rawMark.subject_id ? String(rawMark.subject_id).trim() : '';
    if (!subjectId) continue;

    // Normalise special_status / status alias for evaluateMark
    const markToEvaluate: Mark = (!rawMark.special_status && rawMark.status)
      ? { ...rawMark, special_status: rawMark.status }
      : rawMark;

    const evaluated = evaluateMark(markToEvaluate);

    // Only genuine, valid evaluated marks (including 0%) are accepted
    if (evaluated.status === 'Normal' && evaluated.percentage !== null && !isNaN(evaluated.percentage)) {
      let studentMap = subjectStudentMarks.get(subjectId);
      if (!studentMap) {
        studentMap = new Map();
        subjectStudentMarks.set(subjectId, studentMap);
      }

      const existing = studentMap.get(studentId);
      if (!existing) {
        studentMap.set(studentId, {
          percentage: evaluated.percentage,
          updatedAt: rawMark.updated_at,
        });
      } else {
        const parseTime = (ts?: string) => (ts ? new Date(ts).getTime() : NaN);
        const newTime = parseTime(rawMark.updated_at);
        const oldTime = parseTime(existing.updatedAt);
        const hasValidNewTime = !isNaN(newTime);
        const hasValidOldTime = !isNaN(oldTime);

        if (hasValidNewTime && hasValidOldTime) {
          // Both timestamps valid: strictly newer wins. If timestamps are identical, deterministic tie rule: latter encountered wins.
          if (newTime >= oldTime) {
            studentMap.set(studentId, {
              percentage: evaluated.percentage,
              updatedAt: rawMark.updated_at,
            });
          }
        } else if (hasValidNewTime && !hasValidOldTime) {
          // Valid timestamp takes precedence over missing or malformed timestamp
          studentMap.set(studentId, {
            percentage: evaluated.percentage,
            updatedAt: rawMark.updated_at,
          });
        } else if (!hasValidNewTime && hasValidOldTime) {
          // Never let an un-timestamped or malformed duplicate overwrite a record with a valid timestamp
        } else {
          // Both timestamps missing or malformed: deterministic tie rule: latter encountered wins
          studentMap.set(studentId, {
            percentage: evaluated.percentage,
            updatedAt: rawMark.updated_at,
          });
        }
      }
    }
  }

  // 4. Compute stream means
  // Minimum cohort quorum invariant (Phase 3E):
  // Calculate a subject mean only when at least two distinct learners have valid assessed marks
  // for that subject in the specified exam and stream.
  // If zero or one distinct learner has a valid mark, return null for that subject.
  if (targetSubjectIds.length > 0) {
    for (const subId of targetSubjectIds) {
      const studentMap = subjectStudentMarks.get(subId);
      if (studentMap && studentMap.size >= 2) {
        let sum = 0;
        studentMap.forEach((entry) => {
          sum += entry.percentage;
        });
        result[subId] = Math.round(sum / studentMap.size);
      } else {
        result[subId] = null;
      }
    }
  } else {
    subjectStudentMarks.forEach((studentMap, subId) => {
      if (studentMap.size >= 2) {
        let sum = 0;
        studentMap.forEach((entry) => {
          sum += entry.percentage;
        });
        result[subId] = Math.round(sum / studentMap.size);
      } else {
        result[subId] = null;
      }
    });
  }

  return result;
}
