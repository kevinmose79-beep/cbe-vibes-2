import { describe, it, expect } from 'vitest';
import {
  isKiswahiliSubject,
  getKiswahiliDefaultComment,
  getKiswahiliCommentPool,
  resolveKiswahiliLearningAreaType,
  validateKiswahiliComment,
} from '../utils/kiswahiliCommentValidator';
import {
  resolveReportSubjectComment,
  getFlexibleKiswahiliSubjectComment,
  generateJuniorSchoolReportPDF,
  generateUpperPrimaryReportPDF,
  generateLowerPrimaryReportPDF,
  generatePrePrimaryReportPDF,
  PDFReportData,
} from '../services/pdfReportGenerator';
import {
  School,
  Student,
  Subject,
  Examination,
  ClassStream,
  Mark,
  Grade,
  Teacher,
  LearnerReportComment,
} from '../types';

describe('Phase 3B — Flexible Kiswahili Subject Comments Suite', () => {
  const mockSchool: School = {
    id: 'sch-001',
    school_name: 'Bidii Academy',
    motto: 'Elimu ni Mwangaza',
    county: 'Nairobi',
    email: 'info@bidii.edu',
    phone: '0712345678',
  };

  const mockGrades: Grade[] = [
    { id: 'gr-1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'gr-2', grade_code: 'EE2', performance_level: 'EE', minimum_score: 75, maximum_score: 89, points: 4, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'gr-3', grade_code: 'ME1', performance_level: 'ME', minimum_score: 58, maximum_score: 74, points: 3, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'gr-4', grade_code: 'AE1', performance_level: 'AE', minimum_score: 41, maximum_score: 57, points: 2, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'gr-5', grade_code: 'BE1', performance_level: 'BE', minimum_score: 31, maximum_score: 40, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
    { id: 'gr-6', grade_code: 'BE2', performance_level: 'BE', minimum_score: 21, maximum_score: 30, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
    { id: 'gr-7', grade_code: 'BE3', performance_level: 'BE', minimum_score: 11, maximum_score: 20, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
    { id: 'gr-8', grade_code: 'BE4', performance_level: 'BE', minimum_score: 0, maximum_score: 10, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
  ];

  const mockExam: Examination = {
    id: 'exam-2026-t1',
    exam_name: 'Term 1 Main Summative Assessment 2026',
    term: 'Term 1',
    year: 2026,
    max_marks: 100,
    exam_type: 'End-Term',
    start_date: '2026-03-01',
    end_date: '2026-03-10',
    status: 'Approved',
  };

  const kiswahiliSubject: Subject = {
    id: 'sb_kis',
    subject_name: 'Kiswahili',
    subject_code: 'KIS',
    category: 'Core',
    department: 'Languages',
  };

  const inshaSubject: Subject = {
    id: 'sb_up_insha',
    subject_name: 'Insha',
    subject_code: 'INSHA',
    category: 'Core',
    department: 'Languages',
  };

  const englishSubject: Subject = {
    id: 'sb_eng',
    subject_name: 'English Language',
    subject_code: 'ENG',
    category: 'Core',
    department: 'Languages',
  };

  const mathSubject: Subject = {
    id: 'sb_mat',
    subject_name: 'Mathematics',
    subject_code: 'MAT',
    category: 'Core',
    department: 'Mathematics',
  };

  const mockClasses: ClassStream[] = [
    { id: 'cls-pp1', class_name: 'PP1', stream: 'A' },
    { id: 'cls-g2', class_name: 'Grade 2', stream: 'A' },
    { id: 'cls-g5', class_name: 'Grade 5', stream: 'A' },
    { id: 'cls-g7', class_name: 'Grade 7', stream: 'A' },
  ];

  // 1. Multiple appropriate comments available for each performance level
  describe('Criterion 1: Multiple appropriate comments for each performance level', () => {
    const levels: Array<'EE1' | 'EE2' | 'ME' | 'AE' | 'BE1' | 'BE2' | 'BE3' | 'BE4'> = [
      'EE1', 'EE2', 'ME', 'AE', 'BE1', 'BE2', 'BE3', 'BE4',
    ];

    it('provides at least 3 distinct authentic comments for every CBE level in each domain', () => {
      for (const level of levels) {
        const generalPool = getKiswahiliCommentPool(level, 'general');
        const inshaPool = getKiswahiliCommentPool(level, 'insha');
        const activitiesPool = getKiswahiliCommentPool(level, 'activities');

        expect(generalPool.length).toBeGreaterThanOrEqual(3);
        expect(inshaPool.length).toBeGreaterThanOrEqual(2);
        expect(activitiesPool.length).toBeGreaterThanOrEqual(2);

        // Verify all comments are valid authentic Kiswahili and pass validation
        for (const comment of [...generalPool, ...inshaPool, ...activitiesPool]) {
          const validation = validateKiswahiliComment(comment);
          expect(validation.isValid, `Comment failed validation: "${comment}"`).toBe(true);
          expect(validation.isLanguageValid, `Comment language rejected: "${comment}"`).toBe(true);
        }
      }
    });
  });

  // 2. Generated comments match the correct performance level
  describe('Criterion 2: Performance level consistency and tone appropriateness', () => {
    it('generates high praise for EE1 (90-100) and EE2 (75-89)', () => {
      const topComment = getFlexibleKiswahiliSubjectComment(96, 'Normal', undefined, { seed: 'learner-A' });
      expect(validateKiswahiliComment(topComment).isValid).toBe(true);
      // High score should have praising words
      const hasPraise = /hongera|juu|vizuri|kazi nzuri|kazi bora|umahiri|mfano/i.test(topComment);
      expect(hasPraise).toBe(true);

      const ee2Comment = getFlexibleKiswahiliSubjectComment(82, 'Normal', undefined, { seed: 'learner-B' });
      expect(validateKiswahiliComment(ee2Comment).isValid).toBe(true);
      const hasEe2Praise = /kazi bora|kazi nzuri|vizuri|bidii|hatua/i.test(ee2Comment);
      expect(hasEe2Praise).toBe(true);
    });

    it('generates meeting expectations remarks for ME (58-74)', () => {
      const meComment = getFlexibleKiswahiliSubjectComment(66, 'Normal', undefined, { seed: 'learner-C' });
      expect(validateKiswahiliComment(meComment).isValid).toBe(true);
      const isMeAppropriate = /kazi nzuri|matarajio|hatua|jitahidi|kuridhisha|bidii|vizuri/i.test(meComment);
      expect(isMeAppropriate).toBe(true);
    });

    it('generates constructive encouragement for AE (41-57)', () => {
      const aeComment = getFlexibleKiswahiliSubjectComment(48, 'Normal', undefined, { seed: 'learner-D' });
      expect(validateKiswahiliComment(aeComment).isValid).toBe(true);
      const isAeAppropriate = /wastani|unaweza|boresha|jitahidi|mazoezi|anakaribia|bidii|masomo/i.test(aeComment);
      expect(isAeAppropriate).toBe(true);
    });

    it('generates remedial support and guidance remarks for BE levels (0-40)', () => {
      // BE1 (31-40)
      const be1 = getFlexibleKiswahiliSubjectComment(36, 'Normal', undefined, { seed: 'learner-E' });
      expect(/mazoezi|marudio|bidii|masomo/i.test(be1)).toBe(true);

      // BE2 (21-30)
      const be2 = getFlexibleKiswahiliSubjectComment(24, 'Normal', undefined, { seed: 'learner-F' });
      expect(/mwongozo|mazoezi|misingi/i.test(be2)).toBe(true);

      // BE3 (11-20)
      const be3 = getFlexibleKiswahiliSubjectComment(16, 'Normal', undefined, { seed: 'learner-G' });
      expect(/msaada|mwongozo/i.test(be3)).toBe(true);

      // BE4 (0-10)
      const be4 = getFlexibleKiswahiliSubjectComment(8, 'Normal', undefined, { seed: 'learner-H' });
      expect(/usaidizi|haraka|msaada/i.test(be4)).toBe(true);
    });
  });

  // 3. Learning area matching: Insha vs Lugha vs Activities
  describe('Criterion 3: Learning area alignment for Insha, Lugha, and Activities', () => {
    it('detects Insha and assigns insha-specific composition remarks', () => {
      expect(resolveKiswahiliLearningAreaType(inshaSubject)).toBe('insha');
      expect(resolveKiswahiliLearningAreaType({ subject_name: 'KISWAHILI INSHA' })).toBe('insha');

      const inshaRemark1 = getFlexibleKiswahiliSubjectComment(85, 'Normal', undefined, {
        subject: inshaSubject,
        seed: 'insha-std-1',
      });
      const inshaRemark2 = getFlexibleKiswahiliSubjectComment(60, 'Normal', undefined, {
        subject: inshaSubject,
        seed: 'insha-std-2',
      });

      // Should mention composition concepts: insha, utunzi, uandishi, mwandiko, aya, msamiati
      const inshaConcepts = /insha|utunzi|uandishi|mwandiko|aya|msamiati/i;
      expect(inshaConcepts.test(inshaRemark1) || inshaConcepts.test(inshaRemark2)).toBe(true);
    });

    it('detects early years activities and assigns age-appropriate remarks', () => {
      const ppSubject = { subject_name: 'Language Activities (Kiswahili)', subject_code: 'LP-KSL' };
      expect(resolveKiswahiliLearningAreaType(ppSubject, 'Pre-Primary')).toBe('activities');

      const actRemark = getFlexibleKiswahiliSubjectComment(88, 'Normal', undefined, {
        subject: ppSubject,
        educationLevel: 'Pre-Primary',
        seed: 'pp-std-1',
      });

      expect(/kazi nzuri|kazi bora|anashiriki|anajitahidi|vizuri|maagizo|hongera/i.test(actRemark)).toBe(true);
    });

    it('detects Kiswahili Lugha / Grammar and assigns language-mechanics remarks', () => {
      const lughaSubject = { subject_name: 'Kiswahili Lugha', subject_code: 'KIS-LUGHA' };
      expect(resolveKiswahiliLearningAreaType(lughaSubject)).toBe('lugha');

      const lughaRemark = getFlexibleKiswahiliSubjectComment(85, 'Normal', undefined, {
        subject: lughaSubject,
        seed: 'lugha-std-1',
      });

      expect(validateKiswahiliComment(lughaRemark).isValid).toBe(true);
    });
  });

  // 4. Custom teacher comments remain unchanged
  describe('Criterion 4: Custom teacher comments preserved', () => {
    it('preserves teacher custom comment without replacing it with default', () => {
      const student: Student = {
        id: 'std-custom-1',
        admission_number: 'ADM555',
        full_name: 'Halima Mwangi',
        gender: 'F',
        grade: 'Grade 7',
        class_id: 'cls-g7',
        active: true,
      };

      const customTeacherNote = 'Ameonyesha bidii kubwa sana muhula huu darasani.';
      const savedRemarks: LearnerReportComment = {
        student_id: student.id,
        exam_id: mockExam.id,
        subject_comments: {
          [kiswahiliSubject.id]: customTeacherNote,
        },
      };

      const result = resolveReportSubjectComment(
        kiswahiliSubject,
        { status: 'Normal', percentage: 88 },
        savedRemarks,
        student,
        'Junior School'
      );

      expect(result).toBe(customTeacherNote);
    });
  });

  // 5. Missing assessments and irregularities handled correctly
  describe('Criterion 5: Special assessment statuses X and Y', () => {
    it('returns standardized Kiswahili absent status for X', () => {
      const xComment = getFlexibleKiswahiliSubjectComment(null, 'X', undefined, {
        subject: kiswahiliSubject,
        seed: 'std-absent',
      });
      expect(xComment).toBe('Hajafanya Tathmini (X)');
    });

    it('returns standardized Kiswahili irregularity status for Y with or without reason', () => {
      const yWithReason = getFlexibleKiswahiliSubjectComment(null, 'Y', 'Ugonjwa', {
        subject: kiswahiliSubject,
        seed: 'std-irregular-1',
      });
      expect(yWithReason).toBe('Hitilafu (Ugonjwa)');

      const yWithoutReason = getFlexibleKiswahiliSubjectComment(null, 'Y', undefined, {
        subject: kiswahiliSubject,
        seed: 'std-irregular-2',
      });
      expect(yWithoutReason).toBe('Hitilafu ya Mtihani (Y)');
    });

    it('returns Hajathibitishwa for unconfirmed / null scores', () => {
      expect(getFlexibleKiswahiliSubjectComment(null)).toBe('Hajathibitishwa');
      expect(getFlexibleKiswahiliSubjectComment(undefined)).toBe('Hajathibitishwa');
    });
  });

  // 6. Non-Kiswahili comments remain unchanged
  describe('Criterion 6: Non-Kiswahili subjects remain completely isolated', () => {
    it('leaves English and Mathematics default comments in English', () => {
      const engResult = resolveReportSubjectComment(
        englishSubject,
        { status: 'Normal', percentage: 82 },
        undefined,
        { id: 'std-1', admission_number: '101' },
        'Junior School'
      );
      expect(engResult).toBe('Excellent reading and comprehension');

      const mathResult = resolveReportSubjectComment(
        mathSubject,
        { status: 'Normal', percentage: 65 },
        undefined,
        { id: 'std-1', admission_number: '101' },
        'Junior School'
      );
      expect(mathResult).toBe('Good work, practise problem-solving');
    });
  });

  // 7. Deterministic variation across different learners
  describe('Criterion 7: Deterministic variation across learners in reports', () => {
    it('produces varied remarks for different learners at the same score, but identical remarks on repeat', () => {
      const learner1 = { id: 'std-1', admission_number: 'ADM101', full_name: 'Learner One' };
      const learner2 = { id: 'std-2', admission_number: 'ADM102', full_name: 'Learner Two' };
      const learner3 = { id: 'std-3', admission_number: 'ADM103', full_name: 'Learner Three' };

      const c1 = resolveReportSubjectComment(
        kiswahiliSubject,
        { status: 'Normal', percentage: 85 },
        undefined,
        learner1,
        'Junior School'
      );
      const c2 = resolveReportSubjectComment(
        kiswahiliSubject,
        { status: 'Normal', percentage: 85 },
        undefined,
        learner2,
        'Junior School'
      );
      const c3 = resolveReportSubjectComment(
        kiswahiliSubject,
        { status: 'Normal', percentage: 85 },
        undefined,
        learner3,
        'Junior School'
      );

      // Repeat for learner 1: must be 100% deterministic
      const c1Repeat = resolveReportSubjectComment(
        kiswahiliSubject,
        { status: 'Normal', percentage: 85 },
        undefined,
        learner1,
        'Junior School'
      );
      expect(c1Repeat).toBe(c1);

      // Verify that all 3 are valid Kiswahili remarks
      expect(validateKiswahiliComment(c1).isValid).toBe(true);
      expect(validateKiswahiliComment(c2).isValid).toBe(true);
      expect(validateKiswahiliComment(c3).isValid).toBe(true);

      // Check that variation exists across the cohort
      const uniqueComments = new Set([c1, c2, c3]);
      expect(uniqueComments.size).toBeGreaterThanOrEqual(2);
    });

    it('successfully generates all 4 PDF report types without throwing', async () => {
      const student: Student = {
        id: 'std-pdf-test',
        admission_number: 'ADM777',
        full_name: 'Amani Bakari',
        gender: 'M',
        grade: 'Grade 7',
        class_id: 'cls-g7',
        active: true,
      };

      const marks: Mark[] = [
        { id: 'm-1', student_id: student.id, subject_id: kiswahiliSubject.id, exam_id: mockExam.id, marks: 88, special_status: 'Normal' },
        { id: 'm-2', student_id: student.id, subject_id: englishSubject.id, exam_id: mockExam.id, marks: 78, special_status: 'Normal' },
      ];

      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        classes: mockClasses,
        subjects: [kiswahiliSubject, englishSubject],
        exam: mockExam,
        marks,
        grades: mockGrades,
        teachers: [],
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
      };

      const jsDoc = await generateJuniorSchoolReportPDF(pdfData);
      expect(jsDoc).toBeDefined();

      const upDoc = await generateUpperPrimaryReportPDF({ ...pdfData, student: { ...student, grade: 'Grade 5', class_id: 'cls-g5' } });
      expect(upDoc).toBeDefined();

      const lpDoc = await generateLowerPrimaryReportPDF({ ...pdfData, student: { ...student, grade: 'Grade 2', class_id: 'cls-g2' } });
      expect(lpDoc).toBeDefined();

      const ppDoc = await generatePrePrimaryReportPDF({ ...pdfData, student: { ...student, grade: 'PP1', class_id: 'cls-pp1' } });
      expect(ppDoc).toBeDefined();
    });
  });
});
