import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  generateJuniorSchoolReportPDF,
  generateUpperPrimaryReportPDF,
  generateLowerPrimaryReportPDF,
  generatePrePrimaryReportPDF,
  createReportCardPDFDoc,
  shortenCustomComment,
  getConciseSubjectDefaultComment,
  PDFReportData,
} from '../services/pdfReportGenerator';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Teacher,
  Grade,
  Mark,
  GradeName,
} from '../types';

describe('Phase 2: Subject Comments and CBE Key Readability Verification', () => {
  const mockSchool: School = {
    id: 'sch-phase2',
    school_name: 'EXCELLENCE ACADEMY',
    county: 'Nairobi',
    email: 'info@excellence.ac.ke',
    phone: '0711223344',
  };

  const primaryGrades: Grade[] = [
    { id: 'p-1', grade_code: 'EE', performance_level: 'EE', minimum_score: 80, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'p-2', grade_code: 'ME', performance_level: 'ME', minimum_score: 50, maximum_score: 79, points: 3, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'p-3', grade_code: 'AE', performance_level: 'AE', minimum_score: 30, maximum_score: 49, points: 2, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'p-4', grade_code: 'BE', performance_level: 'BE', minimum_score: 0, maximum_score: 29, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
  ];

  const juniorGrades: Grade[] = [
    { id: 'j-1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 8, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'j-2', grade_code: 'EE2', performance_level: 'EE', minimum_score: 75, maximum_score: 89, points: 7, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'j-3', grade_code: 'ME1', performance_level: 'ME', minimum_score: 58, maximum_score: 74, points: 6, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'j-4', grade_code: 'ME2', performance_level: 'ME', minimum_score: 41, maximum_score: 57, points: 5, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'j-5', grade_code: 'AE1', performance_level: 'AE', minimum_score: 31, maximum_score: 40, points: 4, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'j-6', grade_code: 'AE2', performance_level: 'AE', minimum_score: 21, maximum_score: 30, points: 3, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'j-7', grade_code: 'BE1', performance_level: 'BE', minimum_score: 11, maximum_score: 20, points: 2, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
    { id: 'j-8', grade_code: 'BE2', performance_level: 'BE', minimum_score: 0, maximum_score: 10, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
  ];

  const mockExam: Examination = {
    id: 'exam-p2',
    exam_name: 'Term 1 Main Assessment 2026',
    term: 'Term 1',
    year: 2026,
    max_marks: 100,
    exam_type: 'End-Term',
    status: 'Approved',
  };

  const mockClasses: ClassStream[] = [
    { id: 'cls-pp1', class_name: 'PP1', stream: 'East', education_level: 'Pre-Primary', class_teacher_id: 'tr-01', allocated_subject_ids: ['sb-math'] },
    { id: 'cls-g3', class_name: 'Grade 3', stream: 'North', education_level: 'Lower Primary', class_teacher_id: 'tr-01', allocated_subject_ids: ['sb-math'] },
    { id: 'cls-g5', class_name: 'Grade 5', stream: 'South', education_level: 'Upper Primary', class_teacher_id: 'tr-01', allocated_subject_ids: ['sb-math'] },
    { id: 'cls-g8', class_name: 'Grade 8', stream: 'West', education_level: 'Junior School', class_teacher_id: 'tr-01', allocated_subject_ids: ['sb-math', 'sb-kisw'] },
  ];

  const mockTeachers: Teacher[] = [
    {
      id: 'tr-01',
      teacher_name: 'Tr. Joyce Muthoni',
      email: 'muthoni@excellence.ac.ke',
      phone: '0711223344',
      allocations: [
        { id: 'al-1', education_level: 'Junior School', class_id: 'cls-g8', stream_id: 'cls-g8', subject_id: 'sb-math' },
        { id: 'al-2', education_level: 'Junior School', class_id: 'cls-g8', stream_id: 'cls-g8', subject_id: 'sb-kisw' },
        { id: 'al-3', education_level: 'Upper Primary', class_id: 'cls-g5', stream_id: 'cls-g5', subject_id: 'sb-math' },
        { id: 'al-4', education_level: 'Lower Primary', class_id: 'cls-g3', stream_id: 'cls-g3', subject_id: 'sb-math' },
        { id: 'al-5', education_level: 'Pre-Primary', class_id: 'cls-pp1', stream_id: 'cls-pp1', subject_id: 'sb-math' },
      ],
    },
  ];

  function trackDocContent(doc: jsPDF) {
    const renderedTexts: string[] = [];
    const origText = doc.text.bind(doc);
    doc.text = function (text: any, ...args: any[]) {
      if (typeof text === 'string') {
        renderedTexts.push(text);
      } else if (Array.isArray(text)) {
        text.forEach((t) => typeof t === 'string' && renderedTexts.push(t));
      }
      return (origText as any)(text, ...args);
    } as any;
    return renderedTexts;
  }

  describe('Comment Shortening and Concise Default Generators', () => {
    it('shortenCustomComment preserves already concise comments untouched', () => {
      const concise = 'Expresses ideas clearly; improve grammar.';
      expect(shortenCustomComment(concise)).toBe(concise);
      const mathConcise = 'Good understanding; practise problem-solving.';
      expect(shortenCustomComment(mathConcise)).toBe(mathConcise);
    });

    it('shortenCustomComment shortens multi-sentence comments to the first complete sentence', () => {
      const multi = 'Consistent effort and high mathematical aptitude. Needs to practice geometry more frequently.';
      expect(shortenCustomComment(multi)).toBe('Consistent effort and high mathematical aptitude.');
    });

    it('shortenCustomComment cleanly trims excessively long comments without mid-word cutting', () => {
      const veryLong = 'The learner has demonstrated remarkable dedication thorough conceptual clarity and exceptional participation across every topic assessed this term with outstanding mastery.';
      const result = shortenCustomComment(veryLong);
      expect(result.endsWith('...')).toBe(true);
      // Does not cut any word in half
      const words = result.replace('...', '').trim().split(/\s+/);
      expect(words.length).toBeLessThanOrEqual(12);
      expect(words.every((w) => /^[a-zA-Z]+$/.test(w))).toBe(true);
    });

    it('getConciseSubjectDefaultComment generates short, natural Zeraki-style remarks of 2 to 6 words', () => {
      const testCases = [
        { subject: 'Mathematics', score: 85, expected: 'Excellent work, keep it up' },
        { subject: 'Mathematics', score: 60, expected: 'Good work, practise problem-solving' },
        { subject: 'Mathematics', score: 40, expected: 'Practise calculations regularly' },
        { subject: 'Mathematics', score: 20, expected: 'Needs more practice in calculations' },
        { subject: 'English Language', score: 90, expected: 'Excellent reading and comprehension' },
        { subject: 'English Language', score: 65, expected: 'Good progress, improve grammar' },
        { subject: 'English Language', score: 35, expected: 'Practise reading and grammar' },
        { subject: 'English Language', score: 15, expected: 'Needs more reading practice' },
        { subject: 'Integrated Science', score: 70, expected: 'Good progress, aim higher' },
        { subject: 'Social Studies', score: 65, expected: 'Good progress, aim higher' },
        { subject: 'Creative Arts', score: 80, expected: 'Very good practical work' },
        { subject: 'Agriculture', score: 78, expected: 'Very good practical skills' },
      ];

      for (const tc of testCases) {
        const comment = getConciseSubjectDefaultComment(tc.subject, tc.score);
        expect(comment).toBe(tc.expected);
        const wordCount = comment.split(/\s+/).filter(Boolean).length;
        expect(wordCount).toBeGreaterThanOrEqual(2);
        expect(wordCount).toBeLessThanOrEqual(6);
      }
    });
  });

  describe('Change A: Subject Table Headers & Columns (8-column specification)', () => {
    it('Junior School report includes exact headers with COMMENTS and FACILITATOR', async () => {
      const student: Student = {
        id: 'std-js-1',
        admission_number: 'ADM-JS-01',
        full_name: 'Brian Kiprop',
        first_name: 'Brian',
        last_name: 'Kiprop',
        gender: 'M',
        class_id: 'cls-g8',
        grade: 'Grade 8',
        active: true,
      };

      const jsSubjects: Subject[] = [
        { id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 8'] },
        { id: 'sb-kisw', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 8'] },
      ];

      const marks: Mark[] = [
        { id: 'm-1', student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 82, special_status: 'Normal' },
        { id: 'm-2', student_id: student.id, subject_id: 'sb-kisw', exam_id: mockExam.id, marks: 76, special_status: 'Normal' },
      ];

      const customComment = 'Good understanding; practise problem-solving.';
      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: jsSubjects,
        marks,
        grades: juniorGrades,
        teachers: mockTeachers,
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
        savedRemarks: {
          student_id: student.id,
          exam_id: mockExam.id,
          subject_comments: {
            'sb-math': customComment,
          },
        },
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const texts = trackDocContent(doc);
      await generateJuniorSchoolReportPDF(pdfData, doc);

      // Verify page count is strictly 1
      expect(doc.getNumberOfPages()).toBe(1);

      // Verify headers
      expect(texts.includes('LEARNING AREA')).toBe(true);
      expect(texts.includes('COMMENTS')).toBe(true);
      expect(texts.includes('FACILITATOR')).toBe(true);
      expect(texts.includes('INSTRUCTOR')).toBe(false);

      // Verify custom subject comment appears
      expect(texts.some((t) => t.includes(customComment))).toBe(true);

      // Verify authentic Kiswahili comment appears for Kiswahili
      expect(texts.some((t) => t.includes('Kazi Bora Sana - Amepita Matarajio'))).toBe(true);
    });

    it('Upper Primary report includes exact headers with COMMENTS and FACILITATOR', async () => {
      const student: Student = {
        id: 'std-up-1',
        admission_number: 'ADM-UP-01',
        full_name: 'Amina Mohamed',
        first_name: 'Amina',
        last_name: 'Mohamed',
        gender: 'F',
        class_id: 'cls-g5',
        grade: 'Grade 5',
        active: true,
      };

      const upSubjects: Subject[] = [
        { id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' },
      ];

      const marks: Mark[] = [
        { id: 'm-up-1', student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 88, special_status: 'Normal' },
      ];

      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: upSubjects,
        marks,
        grades: primaryGrades,
        teachers: mockTeachers,
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
        savedRemarks: {
          student_id: student.id,
          exam_id: mockExam.id,
          subject_comments: {
            'sb-math': 'Consistent effort and high mathematical aptitude.',
          },
        },
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const texts = trackDocContent(doc);
      await generateUpperPrimaryReportPDF(pdfData, doc);

      expect(doc.getNumberOfPages()).toBe(1);
      expect(texts.includes('COMMENTS')).toBe(true);
      expect(texts.includes('FACILITATOR')).toBe(true);
      expect(texts.includes('INSTRUCTOR')).toBe(false);
      expect(texts.some((t) => t.includes('Consistent effort and high mathematical aptitude.'))).toBe(true);
    });

    it('Lower Primary report includes exact headers with COMMENTS and FACILITATOR and concise default comment', async () => {
      const student: Student = {
        id: 'std-lp-1',
        admission_number: 'ADM-LP-01',
        full_name: 'David Ndungu',
        first_name: 'David',
        last_name: 'Ndungu',
        gender: 'M',
        class_id: 'cls-g3',
        grade: 'Grade 3',
        active: true,
      };

      const lpSubjects: Subject[] = [
        { id: 'sb-math', subject_name: 'Mathematics Activities', subject_code: 'MAT', category: 'Core' },
      ];

      const marks: Mark[] = [
        { id: 'm-lp-1', student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 65, special_status: 'Normal' },
      ];

      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: lpSubjects,
        marks,
        grades: primaryGrades,
        teachers: mockTeachers,
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const texts = trackDocContent(doc);
      await generateLowerPrimaryReportPDF(pdfData, doc);

      expect(doc.getNumberOfPages()).toBe(1);
      expect(texts.includes('COMMENTS')).toBe(true);
      expect(texts.includes('FACILITATOR')).toBe(true);
      expect(texts.includes('INSTRUCTOR')).toBe(false);
      // Concise Zeraki-style comment for 65% in Mathematics
      expect(texts.some((t) => t.includes('Good work, practise problem-solving'))).toBe(true);
    });

    it('Pre-Primary report includes exact headers with COMMENTS and FACILITATOR', async () => {
      const student: Student = {
        id: 'std-pp-1',
        admission_number: 'ADM-PP-01',
        full_name: 'Clara Wanjiku',
        first_name: 'Clara',
        last_name: 'Wanjiku',
        gender: 'F',
        class_id: 'cls-pp1',
        grade: 'PP1',
        active: true,
      };

      const ppSubjects: Subject[] = [
        { id: 'sb-math', subject_name: 'Mathematical Activities', subject_code: 'MAT', category: 'Core' },
      ];

      const marks: Mark[] = [
        { id: 'm-pp-1', student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 90, special_status: 'Normal' },
      ];

      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: ppSubjects,
        marks,
        grades: primaryGrades,
        teachers: mockTeachers,
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const texts = trackDocContent(doc);
      await generatePrePrimaryReportPDF(pdfData, doc);

      expect(doc.getNumberOfPages()).toBe(1);
      expect(texts.includes('COMMENTS')).toBe(true);
      expect(texts.includes('FACILITATOR')).toBe(true);
      expect(texts.includes('INSTRUCTOR')).toBe(false);
      expect(texts.some((t) => t.includes('Excellent work, keep it up'))).toBe(true);
    });
  });

  describe('Change B: Simplified CBE Level Key Title', () => {
    it('Junior School renders exact title "CBE LEVEL KEY" without explanatory subtitle', async () => {
      const student: Student = {
        id: 'std-js-cbe',
        admission_number: 'ADM-JS-KEY',
        full_name: 'Kevin Ochieng',
        first_name: 'Kevin',
        last_name: 'Ochieng',
        gender: 'M',
        class_id: 'cls-g8',
        grade: 'Grade 8',
        active: true,
      };

      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: [{ id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' }],
        marks: [{ id: 'm-1', student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 80, special_status: 'Normal' }],
        grades: juniorGrades,
        teachers: mockTeachers,
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const texts = trackDocContent(doc);
      await generateJuniorSchoolReportPDF(pdfData, doc);

      // Title must be exactly "CBE LEVEL KEY"
      expect(texts.includes('CBE LEVEL KEY')).toBe(true);
      // Explanatory subtitle must NOT be present
      expect(texts.some((t) => t.includes('8-LEVEL JUNIOR SCHOOL PERFORMANCE SCALE'))).toBe(false);

      // All 8 levels preserved with points and ranges
      expect(texts.some((t) => t.includes('EE1 (90–100%) • 8 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('EE2 (75–89%) • 7 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('ME1 (58–74%) • 6 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('ME2 (41–57%) • 5 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('AE1 (31–40%) • 4 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('AE2 (21–30%) • 3 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('BE1 (11–20%) • 2 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('BE2 (1–10%) • 1 Point'))).toBe(true);
    });

    it('Primary School renders exact title "CBE LEVEL KEY" without explanatory subtitle', async () => {
      const student: Student = {
        id: 'std-p-cbe',
        admission_number: 'ADM-P-KEY',
        full_name: 'Faith Chebet',
        first_name: 'Faith',
        last_name: 'Chebet',
        gender: 'F',
        class_id: 'cls-g5',
        grade: 'Grade 5',
        active: true,
      };

      const pdfData: PDFReportData = {
        student,
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: [{ id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' }],
        marks: [{ id: 'm-1', student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 75, special_status: 'Normal' }],
        grades: primaryGrades,
        teachers: mockTeachers,
        allStudents: [student],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const texts = trackDocContent(doc);
      await generateUpperPrimaryReportPDF(pdfData, doc);

      // Title must be exactly "CBE LEVEL KEY"
      expect(texts.includes('CBE LEVEL KEY')).toBe(true);
      // Explanatory subtitle must NOT be present
      expect(texts.some((t) => t.includes('4-LEVEL PRIMARY SCHOOL PERFORMANCE SCALE'))).toBe(false);

      // All 4 levels preserved with points and ranges
      expect(texts.some((t) => t.includes('EE (80–100%) • 4 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('ME (50–79%) • 3 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('AE (30–49%) • 2 Points'))).toBe(true);
      expect(texts.some((t) => t.includes('BE (0–29%) • 1 Point'))).toBe(true);
    });
  });

  describe('Single-Page Invariant across all 4 tiers', () => {
    it('maintains exactly 1 page per learner in createReportCardPDFDoc', async () => {
      const gradesToTest: { grade: GradeName; classId: string }[] = [
        { grade: 'PP1', classId: 'cls-pp1' },
        { grade: 'Grade 3', classId: 'cls-g3' },
        { grade: 'Grade 5', classId: 'cls-g5' },
        { grade: 'Grade 8', classId: 'cls-g8' },
      ];

      for (const { grade, classId } of gradesToTest) {
        const student: Student = {
          id: `std-${grade}`,
          admission_number: `ADM-${grade}`,
          full_name: `Learner ${grade}`,
          first_name: 'Learner',
          last_name: grade,
          gender: 'M',
          class_id: classId,
          grade,
          active: true,
        };

        const pdfData: PDFReportData = {
          student,
          school: mockSchool,
          exam: mockExam,
          classes: mockClasses,
          subjects: [{ id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' }],
          marks: [{ id: `m-${grade}`, student_id: student.id, subject_id: 'sb-math', exam_id: mockExam.id, marks: 70, special_status: 'Normal' }],
          grades: grade === 'Grade 8' ? juniorGrades : primaryGrades,
          teachers: mockTeachers,
          allStudents: [student],
          nextTermOpeningDate: '2026-05-04',
        };

        const doc = await createReportCardPDFDoc(pdfData);
        expect(doc.getNumberOfPages()).toBe(1);
      }
    });
  });
});
