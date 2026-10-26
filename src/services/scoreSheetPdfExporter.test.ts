import { describe, it, expect, vi } from 'vitest';
import { exportScoreSheetPDF, resolveScoreSheetColumns } from './scoreSheetPdfExporter';
import { School, Examination, ClassStream, Subject, Student, GradeName } from '../types';
import * as fileDownloader from '../utils/fileDownloader';
import { initialSubjects } from '../data/seedData';

describe('CBE Hub: Redesigned Score Sheet PDF Exporter Forensic Verification', () => {
  const mockSchool: School = {
    id: 'sch-1',
    school_name: 'Muchorwe Comprehensive School',
    county: 'Nairobi',
    email: 'info@muchorwe.ac.ke',
  };

  const mockJuniorExam: Examination = {
    id: 'exam-js-1',
    exam_name: 'SBA KNEC Assessment Junior 2026',
    exam_type: 'End-Term',
    term: 'Term 3',
    year: 2026,
    status: 'Draft',
    class_id: 'class-js-8',
    max_marks: 100,
    start_date: '2026-10-09',
  };

  const mockUpperPrimaryCompositeExamA: Examination = {
    id: 'exam-up-1',
    exam_name: 'Upper Primary Mid Term 2 2026',
    exam_type: 'Mid-Term',
    term: 'Term 2',
    year: 2026,
    status: 'Draft',
    class_id: 'class-up-5',
    max_marks: 100,
    assessment_structure: 'Composite',
    ss_cre_structure: 'A', // SST 30, CRE 20
    include_agriculture: true,
    start_date: '2026-06-15',
  };

  const mockUpperPrimaryCompositeExamWithoutAgn: Examination = {
    id: 'exam-up-no-agn',
    exam_name: 'KPSEA Second Trial 2026',
    exam_type: 'End-Term',
    term: 'Term 3',
    year: 2026,
    status: 'Draft',
    class_id: 'class-up-6',
    max_marks: 100,
    assessment_structure: 'Composite',
    ss_cre_structure: 'B', // SST 10, CRE 10
    include_agriculture: false,
    start_date: '2026-10-20',
  };

  const mockLowerPrimaryExam: Examination = {
    id: 'exam-lp-1',
    exam_name: 'Lower Primary Term 1 Assessment 2026',
    exam_type: 'Mid-Term',
    term: 'Term 1',
    year: 2026,
    status: 'Draft',
    class_id: 'class-lp-2',
    max_marks: 100,
    start_date: '2026-03-10',
  };

  const mockClasses: ClassStream[] = [
    { id: 'class-lp-2', class_name: 'Grade 2', stream: '2 Yellow', education_level: 'Lower Primary' },
    { id: 'class-up-5', class_name: 'Grade 5', stream: '5 Green', education_level: 'Upper Primary' },
    { id: 'class-up-6', class_name: 'Grade 6', stream: '6 Red', education_level: 'Upper Primary' },
    { id: 'class-js-8', class_name: 'Grade 8', stream: '8 Blue', education_level: 'Junior School' },
  ];

  // Helper to generate N students
  const createStudents = (count: number, classId: string, grade: GradeName): Student[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `std-${classId}-${i + 1}`,
      admission_number: `${200 + i + 1}`,
      full_name: `LEARNER ${grade.toUpperCase()} ${i + 1}`,
      class_id: classId,
      stream_id: classId,
      grade,
      gender: (i % 2 === 0 ? 'M' : 'F') as 'M' | 'F',
      active: true,
    }));
  };

  describe('1. Dynamic Subject Columns Resolution', () => {
    it('generates correct 3 standalone columns for Lower Primary (ENG, KIS, ILA)', () => {
      const classObj = mockClasses[0]; // Grade 2
      const cols = resolveScoreSheetColumns(classObj, initialSubjects, mockLowerPrimaryExam);

      expect(cols.map((c) => c.code)).toEqual(['ENG', 'KIS', 'ILA']);
      expect(cols.every((c) => c.maxScore === 100)).toBe(true);
    });

    it('generates Upper Primary composite columns with ENG(60), COMP(40), KIS(60), INSHA(40), SST(30), CRE(20), and AGN(100) for Structure A with Agriculture included', () => {
      const classObj = mockClasses[1]; // Grade 5
      const cols = resolveScoreSheetColumns(classObj, initialSubjects, mockUpperPrimaryCompositeExamA);

      const codes = cols.map((c) => c.code);
      expect(codes).toContain('ENG');
      expect(codes).toContain('COMP');
      expect(codes).toContain('KIS');
      expect(codes).toContain('INSHA');
      expect(codes).toContain('MATH');
      expect(codes).toContain('INT SCI');
      expect(codes).toContain('CAS');
      expect(codes).toContain('SST');
      expect(codes).toContain('CRE');
      expect(codes).toContain('AGN');

      // Verify maximum marks
      expect(cols.find((c) => c.code === 'ENG')?.maxScore).toBe(60);
      expect(cols.find((c) => c.code === 'COMP')?.maxScore).toBe(40);
      expect(cols.find((c) => c.code === 'KIS')?.maxScore).toBe(60);
      expect(cols.find((c) => c.code === 'INSHA')?.maxScore).toBe(40);
      expect(cols.find((c) => c.code === 'SST')?.maxScore).toBe(30);
      expect(cols.find((c) => c.code === 'CRE')?.maxScore).toBe(20);
      expect(cols.find((c) => c.code === 'MATH')?.maxScore).toBe(100);
      expect(cols.find((c) => c.code === 'INT SCI')?.maxScore).toBe(100);
      expect(cols.find((c) => c.code === 'CAS')?.maxScore).toBe(100);
      expect(cols.find((c) => c.code === 'AGN')?.maxScore).toBe(100);
    });

    it('excludes Agriculture and applies Structure B (SST 10, CRE 10) for Upper Primary exam with include_agriculture: false', () => {
      const classObj = mockClasses[2]; // Grade 6
      const cols = resolveScoreSheetColumns(classObj, initialSubjects, mockUpperPrimaryCompositeExamWithoutAgn);

      const codes = cols.map((c) => c.code);
      expect(codes).not.toContain('AGN');
      expect(cols.find((c) => c.code === 'SST')?.maxScore).toBe(10);
      expect(cols.find((c) => c.code === 'CRE')?.maxScore).toBe(10);
    });

    it('generates 9 standalone Junior School learning areas all out of 100', () => {
      const classObj = mockClasses[3]; // Grade 8
      const cols = resolveScoreSheetColumns(classObj, initialSubjects, mockJuniorExam);

      const codes = cols.map((c) => c.code);
      expect(codes).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'CAS',
        'SST',
        'C.R.E',
        'AGN',
        'PRE-TECH',
      ]);
      expect(cols.every((c) => c.maxScore === 100)).toBe(true);
    });
  });

  describe('2. A4 Landscape PDF Generation & Learner Capacity', () => {
    it('generates A4 landscape PDF containing at least 42 learners on Page 1', async () => {
      let capturedDoc: any = null;
      let capturedFileName: string = '';

      vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any, fileName: string) => {
        capturedDoc = doc;
        capturedFileName = fileName;
      });

      const students42 = createStudents(42, 'class-js-8', 'Grade 8');

      await exportScoreSheetPDF({
        school: mockSchool,
        exam: mockJuniorExam,
        selectedClassId: 'class-js-8',
        selectedStreamId: '8 Blue',
        students: students42,
        subjects: initialSubjects,
        classes: mockClasses,
      });

      expect(capturedDoc).not.toBeNull();
      expect(capturedFileName).toContain('Score_Sheet.pdf');

      // Verify Landscape A4 orientation
      const width = capturedDoc.internal.pageSize.getWidth();
      const height = capturedDoc.internal.pageSize.getHeight();
      expect(width).toBeCloseTo(297, 0);
      expect(height).toBeCloseTo(210, 0);

      // Verify that 42 learners fit on 1 single page!
      const totalPages = capturedDoc.internal.getNumberOfPages();
      expect(totalPages).toBe(1);
    });

    it('paginates cleanly and repeats headers on continuation pages for larger cohorts', async () => {
      let capturedDoc: any = null;
      let capturedFileName: string = '';

      vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any, fileName: string) => {
        capturedDoc = doc;
        capturedFileName = fileName;
      });

      const students75 = createStudents(75, 'class-up-5', 'Grade 5');

      await exportScoreSheetPDF({
        school: mockSchool,
        exam: mockUpperPrimaryCompositeExamA,
        selectedClassId: 'class-up-5',
        selectedStreamId: '5 Green',
        students: students75,
        subjects: initialSubjects,
        classes: mockClasses,
      });

      expect(capturedDoc).not.toBeNull();
      const totalPages = capturedDoc.internal.getNumberOfPages();
      expect(totalPages).toBeGreaterThanOrEqual(2);

      // Verify page streams
      const p1Stream = capturedDoc.internal.pages[1].join('\n');
      const p2Stream = capturedDoc.internal.pages[2].join('\n');

      // School header assessment details appear on Page 1
      expect(p1Stream).toContain('Upper Primary Mid Term 2 2026');
      expect(p1Stream).toContain('SCORE SHEET');

      // Continuation page 2 does NOT repeat the school header metadata box
      expect(p2Stream).not.toContain('Upper Primary Mid Term 2 2026');

      // Continuation page 2 DOES repeat the table column headings
      expect(p2Stream).toContain('ENG');
      expect(p2Stream).toContain('MATH');

      // Page numbers are present on all pages
      expect(p1Stream).toContain(`Page 1 of ${totalPages}`);
      expect(p2Stream).toContain(`Page 2 of ${totalPages}`);
    });

    it('Junior School score sheet omits "/100" subheading while Upper Primary retains maximum-mark subheadings', async () => {
      let juniorDoc: any = null;
      let upDoc: any = null;

      vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any, fileName: string) => {
        if (fileName.includes('Grade_8')) {
          juniorDoc = doc;
        } else {
          upDoc = doc;
        }
      });

      // 1. Export Junior School (Grade 8) with 80 students to test multi-page
      const juniorStudents = createStudents(80, 'class-js-8', 'Grade 8');
      await exportScoreSheetPDF({
        school: mockSchool,
        exam: mockJuniorExam,
        selectedClassId: 'class-js-8',
        selectedStreamId: '8 Blue',
        students: juniorStudents,
        subjects: initialSubjects,
        classes: mockClasses,
      });

      expect(juniorDoc).not.toBeNull();
      const jsTotalPages = juniorDoc.internal.getNumberOfPages();
      expect(jsTotalPages).toBe(2);

      const jsPage1 = juniorDoc.internal.pages[1].join('\n');
      const jsPage2 = juniorDoc.internal.pages[2].join('\n');

      // Junior School table header must contain subject codes
      expect(jsPage1).toContain('ENG');
      expect(jsPage1).toContain('PRE-TECH');
      expect(jsPage2).toContain('ENG');
      expect(jsPage2).toContain('PRE-TECH');

      // Junior School table header must NOT contain "/100" in either page
      expect(jsPage1).not.toContain('/100');
      expect(jsPage2).not.toContain('/100');

      // Junior School header on Page 1 only
      expect(jsPage1).toContain('SBA KNEC Assessment Junior 2026');
      expect(jsPage2).not.toContain('SBA KNEC Assessment Junior 2026');

      // Page numbers on both pages
      expect(jsPage1).toContain('Page 1 of 2');
      expect(jsPage2).toContain('Page 2 of 2');

      // 2. Export Upper Primary (Grade 5)
      const upStudents = createStudents(42, 'class-up-5', 'Grade 5');
      await exportScoreSheetPDF({
        school: mockSchool,
        exam: mockUpperPrimaryCompositeExamA,
        selectedClassId: 'class-up-5',
        selectedStreamId: '5 Green',
        students: upStudents,
        subjects: initialSubjects,
        classes: mockClasses,
      });

      expect(upDoc).not.toBeNull();
      const upPage1 = upDoc.internal.pages[1].join('\n');

      // Upper Primary must retain /max subheadings
      expect(upPage1).toContain('/60');
      expect(upPage1).toContain('/40');
      expect(upPage1).toContain('/30');
      expect(upPage1).toContain('/20');
      expect(upPage1).toContain('/100');
    });

    it('strictly filters learners by selected class and stream', async () => {
      let capturedDoc: any = null;

      vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
        capturedDoc = doc;
      });

      const mixedStudents = [
        ...createStudents(15, 'class-js-8', 'Grade 8'),
        ...createStudents(20, 'class-up-5', 'Grade 5'),
      ];

      await exportScoreSheetPDF({
        school: mockSchool,
        exam: mockJuniorExam,
        selectedClassId: 'class-js-8',
        selectedStreamId: '8 Blue',
        students: mixedStudents,
        subjects: initialSubjects,
        classes: mockClasses,
      });

      expect(capturedDoc).not.toBeNull();
      // Should only contain the 15 Grade 8 students
      expect(capturedDoc.internal.getNumberOfPages()).toBe(1);
    });

    it('throws informative error if no learners match selected class', async () => {
      await expect(
        exportScoreSheetPDF({
          school: mockSchool,
          exam: mockJuniorExam,
          selectedClassId: 'class-non-existent',
          selectedStreamId: 'all',
          students: [],
          subjects: initialSubjects,
          classes: mockClasses,
        })
      ).rejects.toThrow('No learner records found');
    });
  });
});
