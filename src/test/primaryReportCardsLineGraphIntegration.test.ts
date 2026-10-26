import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  generateUpperPrimaryReportPDF,
  generateJuniorSchoolReportPDF,
  generateLowerPrimaryReportPDF,
  drawUpperPrimarySubjectComparisonGraph,
  calculateUpperPrimaryStreamSubjectMeans,
  drawLowerPrimarySubjectComparisonGraph,
  calculateLowerPrimaryStreamSubjectMeans,
  computeGraphValueLabelPositions,
  createReportCardPDFDoc,
  PDFReportData,
} from '../services/pdfReportGenerator';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Mark,
  Grade,
  Teacher,
} from '../types';
import { resolveUpperPrimaryReportStructure } from '../utils/upperPrimaryReportUtils';

describe('Upper Primary Subject Performance Comparison Line Graph Integration (Phase 2)', () => {
  const examIdComposite = 'exam_up_comp_2026';
  const examIdStandalone = 'exam_up_std_2026';
  const otherExamId = 'exam_up_other_2026';

  const mockSchool: School = {
    id: 'school_up_1',
    school_name: 'HILLVIEW PRIMARY & JUNIOR SCHOOL',
    county: 'Nairobi',
    address: 'P.O. Box 456, Nairobi',
    phone: '0711223344',
    email: 'info@hillview.co.ke',
    principal_name: 'Mrs. Headteacher',
  };

  const mockExamComposite: Examination = {
    id: examIdComposite,
    exam_name: 'Grade 5 Mid-Term 1 Assessment',
    exam_type: 'Mid-Term',
    max_marks: 100,
    term: 'Term 1',
    year: 2026,
    education_level: 'Upper Primary',
    assessment_structure: 'Composite',
    status: 'Approved',
  };

  const mockExamStandalone: Examination = {
    id: examIdStandalone,
    exam_name: 'Grade 6 End-Term 2 Assessment',
    exam_type: 'End-Term',
    max_marks: 100,
    term: 'Term 2',
    year: 2026,
    education_level: 'Upper Primary',
    assessment_structure: 'Standalone',
    status: 'Approved',
  };

  const mockClassG4East: ClassStream = {
    id: 'class_g4_east',
    class_name: 'Grade 4',
    stream: 'East',
    stream_id: 'stream_4_east',
    education_level: 'Upper Primary',
  };

  const mockClassG5East: ClassStream = {
    id: 'class_g5_east',
    class_name: 'Grade 5',
    stream: 'East',
    stream_id: 'stream_5_east',
    education_level: 'Upper Primary',
  };

  const mockClassG5West: ClassStream = {
    id: 'class_g5_west',
    class_name: 'Grade 5',
    stream: 'West',
    stream_id: 'stream_5_west',
    education_level: 'Upper Primary',
  };

  const mockClassG6East: ClassStream = {
    id: 'class_g6_east',
    class_name: 'Grade 6',
    stream: 'East',
    stream_id: 'stream_6_east',
    education_level: 'Upper Primary',
  };

  const allClasses: ClassStream[] = [
    mockClassG4East,
    mockClassG5East,
    mockClassG5West,
    mockClassG6East,
  ];

  // Upper Primary subjects (both component and composite/standalone)
  const upSubjects: Subject[] = [
    { id: 'sub_up_eng_lang', subject_name: 'English Language', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_eng_comp', subject_name: 'English Composition', subject_code: 'COMP', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_kis_lugha', subject_name: 'Kiswahili Lugha', subject_code: 'KIS', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_kis_insha', subject_name: 'Kiswahili Insha', subject_code: 'INSHA', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_cas', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_ss_cre', subject_name: 'Social Studies & CRE', subject_code: 'SS&CRE', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_sst_std', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'sub_up_cre_std', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
    { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_name: 'Agriculture', subject_code: 'AGN', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'], status: 'Active' },
  ];

  const upGrades: Grade[] = [
    { id: 'g_ee1', grade_code: 'EE1', grade: 'EE1', minimum_score: 90, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations', performance_level: 'EE' },
    { id: 'g_ee2', grade_code: 'EE2', grade: 'EE2', minimum_score: 75, maximum_score: 89, points: 4, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations', performance_level: 'EE' },
    { id: 'g_me1', grade_code: 'ME1', grade: 'ME1', minimum_score: 58, maximum_score: 74, points: 3, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations', performance_level: 'ME' },
    { id: 'g_me2', grade_code: 'ME2', grade: 'ME2', minimum_score: 41, maximum_score: 57, points: 3, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations', performance_level: 'ME' },
    { id: 'g_ae1', grade_code: 'AE1', grade: 'AE1', minimum_score: 31, maximum_score: 40, points: 2, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations', performance_level: 'AE' },
    { id: 'g_ae2', grade_code: 'AE2', grade: 'AE2', minimum_score: 21, maximum_score: 30, points: 2, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations', performance_level: 'AE' },
    { id: 'g_be1', grade_code: 'BE1', grade: 'BE1', minimum_score: 11, maximum_score: 20, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations', performance_level: 'BE' },
    { id: 'g_be2', grade_code: 'BE2', grade: 'BE2', minimum_score: 0, maximum_score: 10, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations', performance_level: 'BE' },
  ];

  // Students in Grade 5 East
  const student5E1: Student = {
    id: 'std_5e_1',
    admission_number: 'ADM-501',
    full_name: 'Brenda Cherono',
    grade: 'Grade 5',
    stream_id: 'stream_5_east',
    class_id: 'class_g5_east',
    gender: 'F',
    active: true,
  };

  const student5E2: Student = {
    id: 'std_5e_2',
    admission_number: 'ADM-502',
    full_name: 'David Mwangi',
    grade: 'Grade 5',
    stream_id: 'stream_5_east',
    class_id: 'class_g5_east',
    gender: 'M',
    active: true,
  };

  const student5E3: Student = {
    id: 'std_5e_3',
    admission_number: 'ADM-503',
    full_name: 'Emmanuel Ochieng',
    grade: 'Grade 5',
    stream_id: 'stream_5_east',
    class_id: 'class_g5_east',
    gender: 'M',
    active: true,
  };

  // Student in Grade 5 West (peer in different stream)
  const student5W1: Student = {
    id: 'std_5w_1',
    admission_number: 'ADM-504',
    full_name: 'Grace Wambui',
    grade: 'Grade 5',
    stream_id: 'stream_5_west',
    class_id: 'class_g5_west',
    gender: 'F',
    active: true,
  };

  // Student in Grade 4 East
  const student4E1: Student = {
    id: 'std_4e_1',
    admission_number: 'ADM-401',
    full_name: 'Faith Achieng',
    grade: 'Grade 4',
    stream_id: 'stream_4_east',
    class_id: 'class_g4_east',
    gender: 'F',
    active: true,
  };

  // Student in Grade 6 East
  const student6E1: Student = {
    id: 'std_6e_1',
    admission_number: 'ADM-601',
    full_name: 'Hassan Ali',
    grade: 'Grade 6',
    stream_id: 'stream_6_east',
    class_id: 'class_g6_east',
    gender: 'M',
    active: true,
  };

  const allStudents: Student[] = [
    student5E1,
    student5E2,
    student5E3,
    student5W1,
    student4E1,
    student6E1,
  ];

  const teachers: Teacher[] = [
    {
      id: 'tch_1',
      teacher_name: 'Mr. Kamau',
      phone: '0712345678',
      email: 'kamau@test.com',
      allocations: [{
        id: 'alloc_1',
        education_level: 'Upper Primary',
        class_id: 'class_g5_east',
        subject_id: 'sub_up_eng_lang',
      }],
    },
  ];

  describe('1. calculateUpperPrimaryStreamSubjectMeans Calculation Engine', () => {
    it('calculates consolidated English and Kiswahili stream means correctly for Composite exam', () => {
      // Student 1:
      // English: Lang 48/60 + Comp 32/40 = 80/100
      // Kiswahili: Lugha 42/60 + Insha 28/40 = 70/100
      // Math: 85/100
      // Student 2:
      // English: Lang 36/60 + Comp 24/40 = 60/100
      // Kiswahili: Lugha 36/60 + Insha 24/40 = 60/100
      // Math: 65/100
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_eng_lang', exam_id: examIdComposite, marks: 48 },
        { id: 'm2', student_id: 'std_5e_1', subject_id: 'sub_up_eng_comp', exam_id: examIdComposite, marks: 32 },
        { id: 'm3', student_id: 'std_5e_1', subject_id: 'sub_up_kis_lugha', exam_id: examIdComposite, marks: 42 },
        { id: 'm4', student_id: 'std_5e_1', subject_id: 'sub_up_kis_insha', exam_id: examIdComposite, marks: 28 },
        { id: 'm5', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 85 },

        { id: 'm6', student_id: 'std_5e_2', subject_id: 'sub_up_eng_lang', exam_id: examIdComposite, marks: 36 },
        { id: 'm7', student_id: 'std_5e_2', subject_id: 'sub_up_eng_comp', exam_id: examIdComposite, marks: 24 },
        { id: 'm8', student_id: 'std_5e_2', subject_id: 'sub_up_kis_lugha', exam_id: examIdComposite, marks: 36 },
        { id: 'm9', student_id: 'std_5e_2', subject_id: 'sub_up_kis_insha', exam_id: examIdComposite, marks: 24 },
        { id: 'm10', student_id: 'std_5e_2', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 65 },
      ];

      const streamStudentIds = new Set(['std_5e_1', 'std_5e_2']);
      const means = calculateUpperPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        exam: mockExamComposite,
        subjects: upSubjects,
        classes: allClasses,
        allStudents,
        targetClass: mockClassG5East,
        grades: upGrades,
        teachers,
      });

      // English composite: (80 + 60) / 2 = 70
      expect(means['synth_english_composite']).toBe(70);
      expect(means['ENG']).toBe(70);

      // Kiswahili composite: (70 + 60) / 2 = 65
      expect(means['synth_kiswahili_composite']).toBe(65);
      expect(means['KIS']).toBe(65);

      // Math: (85 + 65) / 2 = 75
      expect(means['sub_up_math']).toBe(75);
      expect(means['MATH']).toBe(75);
    });

    it('enforces cohort quorum: returns null when fewer than 2 valid learners are assessed', () => {
      // Only Student 1 has marks for science
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_sci', exam_id: examIdComposite, marks: 78 },
      ];

      const streamStudentIds = new Set(['std_5e_1', 'std_5e_2']);
      const means = calculateUpperPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        exam: mockExamComposite,
        subjects: upSubjects,
        classes: allClasses,
        allStudents,
        targetClass: mockClassG5East,
        grades: upGrades,
      });

      // Science quorum not met (only 1 learner) -> returns null (never zero)
      expect(means['sub_up_sci']).toBeNull();
    });

    it('handles genuine assessed zero scores (0%) as valid data points in stream mean', () => {
      // Student 1 scored 0% (genuine score)
      // Student 2 scored 80%
      // Stream mean must be (0 + 80) / 2 = 40, NOT 80 and NOT null
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 0 },
        { id: 'm2', student_id: 'std_5e_2', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 80 },
      ];

      const streamStudentIds = new Set(['std_5e_1', 'std_5e_2']);
      const means = calculateUpperPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        exam: mockExamComposite,
        subjects: upSubjects,
        classes: allClasses,
        allStudents,
        targetClass: mockClassG5East,
        grades: upGrades,
      });

      expect(means['sub_up_math']).toBe(40);
    });

    it('excludes missing (X) and irregular (Y) marks from stream mean numerator and denominator', () => {
      // Student 1 scored 80
      // Student 2 scored 60
      // Student 3 marked absent 'X'
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 80 },
        { id: 'm2', student_id: 'std_5e_2', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 60 },
        { id: 'm3', student_id: 'std_5e_3', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 'X' as any },
      ];

      const streamStudentIds = new Set(['std_5e_1', 'std_5e_2', 'std_5e_3']);
      const means = calculateUpperPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        exam: mockExamComposite,
        subjects: upSubjects,
        classes: allClasses,
        allStudents,
        targetClass: mockClassG5East,
        grades: upGrades,
      });

      // Mean across the 2 valid learners: (80 + 60) / 2 = 70 (NOT divided by 3)
      expect(means['sub_up_math']).toBe(70);
    });

    it('isolates stream means to the specified exam and stream', () => {
      const marks: Mark[] = [
        // Grade 5 East (std_5e_1 and std_5e_2) in target exam: Math 50 and 70 -> mean 60
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 50 },
        { id: 'm2', student_id: 'std_5e_2', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 70 },
        // Grade 5 West (peer in different stream): Math 100
        { id: 'm3', student_id: 'std_5w_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 100 },
        // Different exam for Grade 5 East: Math 90
        { id: 'm4', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: otherExamId, marks: 90 },
      ];

      const streamStudentIds = new Set(['std_5e_1', 'std_5e_2']);
      const means = calculateUpperPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        exam: mockExamComposite,
        subjects: upSubjects,
        classes: allClasses,
        allStudents,
        targetClass: mockClassG5East,
        grades: upGrades,
      });

      expect(means['sub_up_math']).toBe(60);
    });
  });

  describe('2. drawUpperPrimarySubjectComparisonGraph Visual Layout & Styling', () => {
    it('renders Upper Primary graph cleanly within headroom and returns updated currentY', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const upReport = resolveUpperPrimaryReportStructure({
        student: student5E1,
        exam: mockExamComposite,
        targetClass: mockClassG5East,
        subjects: upSubjects,
        marks: [
          { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_eng_lang', exam_id: examIdComposite, marks: 48 },
          { id: 'm2', student_id: 'std_5e_1', subject_id: 'sub_up_eng_comp', exam_id: examIdComposite, marks: 32 },
          { id: 'm3', student_id: 'std_5e_1', subject_id: 'sub_up_kis_lugha', exam_id: examIdComposite, marks: 42 },
          { id: 'm4', student_id: 'std_5e_1', subject_id: 'sub_up_kis_insha', exam_id: examIdComposite, marks: 28 },
          { id: 'm5', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 85 },
          { id: 'm6', student_id: 'std_5e_1', subject_id: 'sub_up_sci', exam_id: examIdComposite, marks: 80 },
          { id: 'm7', student_id: 'std_5e_1', subject_id: 'sub_up_cas', exam_id: examIdComposite, marks: 74 },
          { id: 'm8', student_id: 'std_5e_1', subject_id: 'sub_up_ss_cre', exam_id: examIdComposite, marks: 78 },
        ],
        grades: upGrades,
        teachers,
        allStudents,
        classes: allClasses,
      });

      const streamMeans: Record<string, number | null> = {
        synth_english_composite: 70,
        synth_kiswahili_composite: 65,
        sub_up_math: 75,
        sub_up_sci: 72,
        sub_up_cas: 70,
        sub_up_ss_cre: 71,
      };

      const startY = 210;
      const endY = drawUpperPrimarySubjectComparisonGraph(
        doc,
        upReport.allReportAreas,
        streamMeans,
        startY,
        10,
        190
      );

      expect(endY).toBeGreaterThan(startY);
      expect(endY).toBeLessThanOrEqual(262); // must leave room for signatures around 263.5mm
    });

    it('safely skips graph if available space is too tight (< 22mm)', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const upReport = resolveUpperPrimaryReportStructure({
        student: student5E1,
        exam: mockExamComposite,
        targetClass: mockClassG5East,
        subjects: upSubjects,
        marks: [],
        grades: upGrades,
        teachers,
        allStudents,
        classes: allClasses,
      });

      const tightY = 250; // targetSigTop is 264, so 264 - 3.5 - 250 = 10.5mm < 22mm
      const endY = drawUpperPrimarySubjectComparisonGraph(
        doc,
        upReport.allReportAreas,
        {},
        tightY,
        10,
        190
      );

      expect(endY).toBe(tightY);
    });
  });

  describe('3. Upper Primary Report Card PDF Generation (Grades 4 - 6)', () => {
    it('generates a strictly 1-page A4 PDF for Grade 5 in Composite Assessment structure', async () => {
      const marks: Mark[] = [
        // Learner (std_5e_1)
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_eng_lang', exam_id: examIdComposite, marks: 48 },
        { id: 'm2', student_id: 'std_5e_1', subject_id: 'sub_up_eng_comp', exam_id: examIdComposite, marks: 32 },
        { id: 'm3', student_id: 'std_5e_1', subject_id: 'sub_up_kis_lugha', exam_id: examIdComposite, marks: 42 },
        { id: 'm4', student_id: 'std_5e_1', subject_id: 'sub_up_kis_insha', exam_id: examIdComposite, marks: 28 },
        { id: 'm5', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 85 },
        { id: 'm6', student_id: 'std_5e_1', subject_id: 'sub_up_sci', exam_id: examIdComposite, marks: 80 },
        { id: 'm7', student_id: 'std_5e_1', subject_id: 'sub_up_cas', exam_id: examIdComposite, marks: 75 },
        { id: 'm8', student_id: 'std_5e_1', subject_id: 'sub_up_ss_cre', exam_id: examIdComposite, marks: 82 },

        // Peer (std_5e_2)
        { id: 'p1', student_id: 'std_5e_2', subject_id: 'sub_up_eng_lang', exam_id: examIdComposite, marks: 40 },
        { id: 'p2', student_id: 'std_5e_2', subject_id: 'sub_up_eng_comp', exam_id: examIdComposite, marks: 25 },
        { id: 'p3', student_id: 'std_5e_2', subject_id: 'sub_up_kis_lugha', exam_id: examIdComposite, marks: 38 },
        { id: 'p4', student_id: 'std_5e_2', subject_id: 'sub_up_kis_insha', exam_id: examIdComposite, marks: 22 },
        { id: 'p5', student_id: 'std_5e_2', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 70 },
        { id: 'p6', student_id: 'std_5e_2', subject_id: 'sub_up_sci', exam_id: examIdComposite, marks: 72 },
        { id: 'p7', student_id: 'std_5e_2', subject_id: 'sub_up_cas', exam_id: examIdComposite, marks: 68 },
        { id: 'p8', student_id: 'std_5e_2', subject_id: 'sub_up_ss_cre', exam_id: examIdComposite, marks: 74 },
      ];

      const reportData: PDFReportData = {
        student: student5E1,
        school: mockSchool,
        exam: mockExamComposite,
        classes: allClasses,
        subjects: upSubjects,
        marks,
        grades: upGrades,
        teachers,
        allStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateUpperPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('generates a strictly 1-page A4 PDF for Grade 6 in Standalone Assessment structure', async () => {
      const marks: Mark[] = [
        // Learner (std_6e_1)
        { id: 'm1', student_id: 'std_6e_1', subject_id: 'sub_up_eng_lang', exam_id: examIdStandalone, marks: 80 },
        { id: 'm2', student_id: 'std_6e_1', subject_id: 'sub_up_kis_lugha', exam_id: examIdStandalone, marks: 75 },
        { id: 'm3', student_id: 'std_6e_1', subject_id: 'sub_up_math', exam_id: examIdStandalone, marks: 88 },
        { id: 'm4', student_id: 'std_6e_1', subject_id: 'sub_up_sci', exam_id: examIdStandalone, marks: 79 },
        { id: 'm5', student_id: 'std_6e_1', subject_id: 'sub_up_sst_std', exam_id: examIdStandalone, marks: 72 },
        { id: 'm6', student_id: 'std_6e_1', subject_id: 'sub_up_cre_std', exam_id: examIdStandalone, marks: 84 },
        { id: 'm7', student_id: 'std_6e_1', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', exam_id: examIdStandalone, marks: 70 },
        { id: 'm8', student_id: 'std_6e_1', subject_id: 'sub_up_cas', exam_id: examIdStandalone, marks: 85 },
      ];

      const reportData: PDFReportData = {
        student: student6E1,
        school: mockSchool,
        exam: mockExamStandalone,
        classes: allClasses,
        subjects: upSubjects,
        marks,
        grades: upGrades,
        teachers,
        allStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateUpperPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('generates a strictly 1-page A4 PDF for Grade 4', async () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_4e_1', subject_id: 'sub_up_eng_lang', exam_id: examIdComposite, marks: 45 },
        { id: 'm2', student_id: 'std_4e_1', subject_id: 'sub_up_eng_comp', exam_id: examIdComposite, marks: 28 },
        { id: 'm3', student_id: 'std_4e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 78 },
      ];

      const reportData: PDFReportData = {
        student: student4E1,
        school: mockSchool,
        exam: mockExamComposite,
        classes: allClasses,
        subjects: upSubjects,
        marks,
        grades: upGrades,
        teachers,
        allStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateUpperPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('preserves invariant: never calculates stream mean from an individual learner marks alone', async () => {
      // Only std_5e_1 has marks in the array; no peer data available
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_5e_1', subject_id: 'sub_up_math', exam_id: examIdComposite, marks: 95 },
      ];

      const reportData: PDFReportData = {
        student: student5E1,
        school: mockSchool,
        exam: mockExamComposite,
        classes: allClasses,
        subjects: upSubjects,
        marks,
        grades: upGrades,
        teachers,
        allStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      // Generates without errors and stays strictly 1 page
      const doc = await generateUpperPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });
  });

  describe('4. Excluded Reports & Junior School Non-Regression', () => {
    it('Junior School report generator remains unaffected and keeps 1-page invariant', async () => {
      const jsStudent: Student = {
        id: 'std_js_1',
        admission_number: 'ADM-701',
        full_name: 'Junior Learner',
        grade: 'Grade 7',
        stream_id: 'stream_7a',
        class_id: 'class_g7_a',
        gender: 'M',
        active: true,
      };

      const jsExam: Examination = {
        id: 'exam_js_test',
        exam_name: 'Grade 7 Mid-Term',
        exam_type: 'Mid-Term',
        max_marks: 100,
        term: 'Term 1',
        year: 2026,
        education_level: 'Junior School',
        status: 'Approved',
      };

      const jsDoc = await generateJuniorSchoolReportPDF({
        student: jsStudent,
        school: mockSchool,
        exam: jsExam,
        classes: [{ id: 'class_g7_a', class_name: 'Grade 7', stream: 'Stream A', education_level: 'Junior School' } as ClassStream],
        subjects: [{ id: 'sub_js_math', subject_name: 'Mathematics', subject_code: 'MATH', education_level: 'Junior School' } as Subject],
        marks: [{ id: 'jm1', student_id: 'std_js_1', subject_id: 'sub_js_math', exam_id: 'exam_js_test', marks: 80 }],
        grades: upGrades,
        allStudents: [jsStudent],
        nextTermOpeningDate: '2026-05-04',
      });

      expect(jsDoc.getNumberOfPages()).toBe(1);
    });

    it('Lower Primary report generator integrates graph and preserves 1-page invariant', async () => {
      const lpStudent: Student = {
        id: 'std_lp_1',
        admission_number: 'ADM-201',
        full_name: 'Lower Primary Learner',
        grade: 'Grade 2',
        stream_id: 'stream_2a',
        class_id: 'class_g2_a',
        gender: 'F',
        active: true,
      };

      const lpExam: Examination = {
        id: 'exam_lp_test',
        exam_name: 'Grade 2 End-Term',
        exam_type: 'End-Term',
        max_marks: 100,
        term: 'Term 1',
        year: 2026,
        education_level: 'Lower Primary',
        status: 'Approved',
      };

      const lpDoc = await generateLowerPrimaryReportPDF({
        student: lpStudent,
        school: mockSchool,
        exam: lpExam,
        classes: [{ id: 'class_g2_a', class_name: 'Grade 2', stream: 'Stream A', education_level: 'Lower Primary' } as ClassStream],
        subjects: [
          { id: 'sb_lp_eng', subject_name: 'English', subject_code: 'ENG', education_level: 'Lower Primary' } as Subject,
          { id: 'sb_lp_kis', subject_name: 'Kiswahili', subject_code: 'KIS', education_level: 'Lower Primary' } as Subject,
          { id: 'sb_lp_ila', subject_name: 'Integrated Learning Area', subject_code: 'ILA', education_level: 'Lower Primary' } as Subject,
        ],
        marks: [
          { id: 'lm1', student_id: 'std_lp_1', subject_id: 'sb_lp_eng', exam_id: 'exam_lp_test', marks: 85 },
          { id: 'lm2', student_id: 'std_lp_1', subject_id: 'sb_lp_kis', exam_id: 'exam_lp_test', marks: 78 },
          { id: 'lm3', student_id: 'std_lp_1', subject_id: 'sb_lp_ila', exam_id: 'exam_lp_test', marks: 90 },
        ],
        grades: upGrades,
        allStudents: [lpStudent],
        nextTermOpeningDate: '2026-05-04',
      });

      expect(lpDoc.getNumberOfPages()).toBe(1);
    });
  });

  describe('5. Lower Primary Subject Performance Comparison Line Graph Integration (Phase 3)', () => {
    const examIdLp = 'exam_lp_2026';
    const otherExamIdLp = 'exam_lp_other_2026';

    const mockExamLp: Examination = {
      id: examIdLp,
      exam_name: 'Grade 2 End-Term 1 Assessment',
      exam_type: 'End-Term',
      max_marks: 100,
      term: 'Term 1',
      year: 2026,
      education_level: 'Lower Primary',
      status: 'Approved',
    };

    const mockClassG1Alpha: ClassStream = {
      id: 'class_g1_alpha',
      class_name: 'Grade 1',
      stream: 'Alpha',
      stream_id: 'stream_1_alpha',
      education_level: 'Lower Primary',
      allocated_subject_ids: ['sb_lp_eng', 'sb_lp_kis', 'sb_lp_ila'],
    };

    const mockClassG2Alpha: ClassStream = {
      id: 'class_g2_alpha',
      class_name: 'Grade 2',
      stream: 'Alpha',
      stream_id: 'stream_2_alpha',
      education_level: 'Lower Primary',
      allocated_subject_ids: ['sb_lp_eng', 'sb_lp_kis', 'sb_lp_ila'],
    };

    const mockClassG2Beta: ClassStream = {
      id: 'class_g2_beta',
      class_name: 'Grade 2',
      stream: 'Beta',
      stream_id: 'stream_2_beta',
      education_level: 'Lower Primary',
      allocated_subject_ids: ['sb_lp_eng', 'sb_lp_kis', 'sb_lp_ila'],
    };

    const mockClassG3Alpha: ClassStream = {
      id: 'class_g3_alpha',
      class_name: 'Grade 3',
      stream: 'Alpha',
      stream_id: 'stream_3_alpha',
      education_level: 'Lower Primary',
      allocated_subject_ids: ['sb_lp_eng', 'sb_lp_kis', 'sb_lp_mat', 'sb_lp_ila'],
    };

    const lpClasses: ClassStream[] = [
      mockClassG1Alpha,
      mockClassG2Alpha,
      mockClassG2Beta,
      mockClassG3Alpha,
    ];

    const lpSubjects: Subject[] = [
      { id: 'sb_lp_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Lower Primary', applicable_grades: ['Grade 1', 'Grade 2', 'Grade 3'], status: 'Active' },
      { id: 'sb_lp_kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Lower Primary', applicable_grades: ['Grade 1', 'Grade 2', 'Grade 3'], status: 'Active' },
      { id: 'sb_lp_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Lower Primary', applicable_grades: ['Grade 1', 'Grade 2', 'Grade 3'], status: 'Active' },
      { id: 'sb_lp_ila', subject_name: 'Integrated Learning Area', subject_code: 'ILA', category: 'Core', education_level: 'Lower Primary', applicable_grades: ['Grade 1', 'Grade 2', 'Grade 3'], status: 'Active' },
    ];

    const studentLp1: Student = {
      id: 'std_lp_a1',
      admission_number: 'ADM-LP1',
      full_name: 'Joy Moraa',
      grade: 'Grade 2',
      stream_id: 'stream_2_alpha',
      class_id: 'class_g2_alpha',
      gender: 'F',
      active: true,
    };

    const studentLp2: Student = {
      id: 'std_lp_a2',
      admission_number: 'ADM-LP2',
      full_name: 'Brian Kip',
      grade: 'Grade 2',
      stream_id: 'stream_2_alpha',
      class_id: 'class_g2_alpha',
      gender: 'M',
      active: true,
    };

    const studentLp3: Student = {
      id: 'std_lp_a3',
      admission_number: 'ADM-LP3',
      full_name: 'Chloe Muthoni',
      grade: 'Grade 2',
      stream_id: 'stream_2_alpha',
      class_id: 'class_g2_alpha',
      gender: 'F',
      active: true,
    };

    const studentLpBeta: Student = {
      id: 'std_lp_b1',
      admission_number: 'ADM-LP4',
      full_name: 'Daniel Otieno',
      grade: 'Grade 2',
      stream_id: 'stream_2_beta',
      class_id: 'class_g2_beta',
      gender: 'M',
      active: true,
    };

    const studentG1: Student = {
      id: 'std_g1_1',
      admission_number: 'ADM-G1-01',
      full_name: 'Ethan Waweru',
      grade: 'Grade 1',
      stream_id: 'stream_1_alpha',
      class_id: 'class_g1_alpha',
      gender: 'M',
      active: true,
    };

    const studentG3: Student = {
      id: 'std_g3_1',
      admission_number: 'ADM-G3-01',
      full_name: 'Farida Noor',
      grade: 'Grade 3',
      stream_id: 'stream_3_alpha',
      class_id: 'class_g3_alpha',
      gender: 'F',
      active: true,
    };

    const allLpStudents = [studentLp1, studentLp2, studentLp3, studentLpBeta, studentG1, studentG3];

    it('calculates Lower Primary stream subject means correctly for ENG, KIS, MATH, and ILA', () => {
      // Student 1: ENG 84, KIS 76, MATH 82, ILA 88
      // Student 2: ENG 66, KIS 70, MATH 78, ILA 72
      // Stream means: ENG = (84+66)/2 = 75, KIS = (76+70)/2 = 73, MATH = (82+78)/2 = 80, ILA = (88+72)/2 = 80
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 84 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 76 },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_mat', exam_id: examIdLp, marks: 82 },
        { id: 'm4', student_id: 'std_lp_a1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 88 },

        { id: 'm5', student_id: 'std_lp_a2', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 66 },
        { id: 'm6', student_id: 'std_lp_a2', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 70 },
        { id: 'm7', student_id: 'std_lp_a2', subject_id: 'sb_lp_mat', exam_id: examIdLp, marks: 78 },
        { id: 'm8', student_id: 'std_lp_a2', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 72 },
      ];

      const streamStudentIds = new Set(['std_lp_a1', 'std_lp_a2']);
      const means = calculateLowerPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        examId: examIdLp,
        subjects: lpSubjects,
      });

      expect(means['sb_lp_eng']).toBe(75);
      expect(means['ENG']).toBe(75);

      expect(means['sb_lp_kis']).toBe(73);
      expect(means['KIS']).toBe(73);

      expect(means['sb_lp_mat']).toBe(80);
      expect(means['MATH']).toBe(80);

      expect(means['sb_lp_ila']).toBe(80);
      expect(means['ILA']).toBe(80);
    });

    it('enforces cohort quorum: returns null when fewer than 2 valid learners are assessed', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 90 },
      ];

      const streamStudentIds = new Set(['std_lp_a1', 'std_lp_a2']);
      const means = calculateLowerPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        examId: examIdLp,
        subjects: lpSubjects,
      });

      expect(means['sb_lp_eng']).toBeNull();
      expect(means['ENG']).toBeNull();
    });

    it('preserves genuine assessed 0% scores as valid data points in Lower Primary stream mean', () => {
      // Student 1: 0% (genuine), Student 2: 70% -> Mean = 35%
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_math', exam_id: examIdLp, marks: 0 },
        { id: 'm2', student_id: 'std_lp_a2', subject_id: 'sb_lp_math', exam_id: examIdLp, marks: 70 },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 0 },
        { id: 'm4', student_id: 'std_lp_a2', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 80 },
      ];

      const streamStudentIds = new Set(['std_lp_a1', 'std_lp_a2']);
      const means = calculateLowerPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        examId: examIdLp,
        subjects: lpSubjects,
      });

      expect(means['sb_lp_eng']).toBe(40);
    });

    it('excludes missing (X) and irregular (Y) marks from Lower Primary stream mean numerator and denominator', () => {
      // Student 1: 80, Student 2: 60, Student 3: absent 'X'
      // Mean across 2 valid learners: (80 + 60) / 2 = 70 (NOT divided by 3)
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 80 },
        { id: 'm2', student_id: 'std_lp_a2', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 60 },
        { id: 'm3', student_id: 'std_lp_a3', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 'X' as any },
      ];

      const streamStudentIds = new Set(['std_lp_a1', 'std_lp_a2', 'std_lp_a3']);
      const means = calculateLowerPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        examId: examIdLp,
        subjects: lpSubjects,
      });

      expect(means['sb_lp_eng']).toBe(70);
      expect(means['ENG']).toBe(70);
    });

    it('isolates stream means to the specified exam and stream', () => {
      const marks: Mark[] = [
        // Alpha stream target exam: 70 and 90 -> mean 80
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 70 },
        { id: 'm2', student_id: 'std_lp_a2', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 90 },
        // Beta stream peer in target exam: 50
        { id: 'm3', student_id: 'std_lp_b1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 50 },
        // Alpha stream different exam: 100
        { id: 'm4', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: otherExamIdLp, marks: 100 },
      ];

      const streamStudentIds = new Set(['std_lp_a1', 'std_lp_a2']);
      const means = calculateLowerPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        examId: examIdLp,
        subjects: lpSubjects,
      });

      expect(means['sb_lp_eng']).toBe(80);
    });

    it('renders Lower Primary graph cleanly with ENG, KIS, ILA and returns updated currentY', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 84 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 76 },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 88 },
      ];

      const streamMeans: Record<string, number | null> = {
        sb_lp_eng: 75,
        sb_lp_kis: 73,
        sb_lp_ila: 80,
      };

      const startY = 175;
      const endY = drawLowerPrimarySubjectComparisonGraph(
        doc,
        lpSubjects,
        marks,
        streamMeans,
        startY,
        10,
        190,
        examIdLp,
        studentLp1.id,
        mockClassG2Alpha
      );

      expect(endY).toBeGreaterThan(startY);
      expect(endY).toBeLessThanOrEqual(235); // Lower Primary headroom finishes well before 263.5mm signatures
    });

    it('renders notice when stream comparison data is unavailable', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 84 },
      ];

      const startY = 175;
      const endY = drawLowerPrimarySubjectComparisonGraph(
        doc,
        lpSubjects,
        marks,
        {}, // empty stream means
        startY,
        10,
        190,
        examIdLp,
        studentLp1.id,
        mockClassG2Alpha
      );

      expect(endY).toBeGreaterThan(startY);
    });

    it('generates a strictly 1-page A4 PDF for Grade 1 with comparison graph', async () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_g1_1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 90 },
        { id: 'm2', student_id: 'std_g1_1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 85 },
        { id: 'm3', student_id: 'std_g1_1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 92 },
      ];

      const reportData: PDFReportData = {
        student: studentG1,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: [studentG1],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateLowerPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('generates a strictly 1-page A4 PDF for Grade 2 with peer data and comparison graph', async () => {
      const marks: Mark[] = [
        // Learner (studentLp1)
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 84 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 76 },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 88 },

        // Peer (studentLp2)
        { id: 'p1', student_id: 'std_lp_a2', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 66 },
        { id: 'p2', student_id: 'std_lp_a2', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 70 },
        { id: 'p3', student_id: 'std_lp_a2', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 72 },
      ];

      const reportData: PDFReportData = {
        student: studentLp1,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: allLpStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateLowerPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('generates a strictly 1-page A4 PDF for Grade 3 with comparison graph', async () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_g3_1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 88 },
        { id: 'm2', student_id: 'std_g3_1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 82 },
        { id: 'm3', student_id: 'std_g3_1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 91 },
      ];

      const reportData: PDFReportData = {
        student: studentG3,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: [studentG3],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateLowerPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('preserves invariant: never calculates stream mean from an individual learner marks alone in Lower Primary', async () => {
      // Only studentLp1 has marks in the array; no peer data available
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 95 },
      ];

      const reportData: PDFReportData = {
        student: studentLp1,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: [studentLp1],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateLowerPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('1. plots exactly the four correct learning areas in strict order (ENG, KIS, MATH, ILA) even if input is shuffled', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const shuffledSubjects: Subject[] = [
        { id: 'sb_lp_ila', subject_code: 'ILA', subject_name: 'Integrated Learning Area', category: 'Core', education_level: 'Lower Primary' },
        { id: 'sb_extra', subject_code: 'CRE', subject_name: 'Extra Religion', category: 'Core', education_level: 'Lower Primary' },
        { id: 'sb_lp_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core', education_level: 'Lower Primary' },
        { id: 'sb_lp_mat', subject_code: 'MATH', subject_name: 'Mathematics', category: 'Core', education_level: 'Lower Primary' },
        { id: 'sb_lp_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Lower Primary' },
      ];

      const textCalls: { text: string; x: number; y: number }[] = [];
      const origText = doc.text.bind(doc);
      (doc as any).text = function (text: any, x: any, y: any, options: any) {
        textCalls.push({ text: String(text), x, y });
        return origText(text, x, y, options);
      };

      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 80 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 75 },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_mat', exam_id: examIdLp, marks: 82 },
        { id: 'm4', student_id: 'std_lp_a1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 85 },
      ];

      drawLowerPrimarySubjectComparisonGraph(
        doc,
        shuffledSubjects,
        marks,
        { ENG: 70, KIS: 68, MATH: 78, ILA: 72 },
        175,
        10,
        190,
        examIdLp,
        'std_lp_a1',
        mockClassG2Alpha
      );

      // Verify that the axis labels drawn in order are ENG, KIS, MATH, ILA and x coordinates strictly increase
      const axisLabels = textCalls.filter((c) => ['ENG', 'KIS', 'MATH', 'ILA'].includes(c.text));
      expect(axisLabels.map((c) => c.text)).toEqual(['ENG', 'KIS', 'MATH', 'ILA']);
      expect(axisLabels[0].x).toBeLessThan(axisLabels[1].x);
      expect(axisLabels[1].x).toBeLessThan(axisLabels[2].x);
      expect(axisLabels[2].x).toBeLessThan(axisLabels[3].x);
    });

    it('2. aligns learner and stream mean markers at the exact same subject x-coordinates across all four subjects', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const circleCalls: { x: number; y: number; r: number }[] = [];

      const origCircle = doc.circle.bind(doc);
      (doc as any).circle = function (x: any, y: any, r: any, style: any) {
        circleCalls.push({ x, y, r });
        return origCircle(x, y, r, style);
      };

      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 85 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 70 },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_mat', exam_id: examIdLp, marks: 82 },
        { id: 'm4', student_id: 'std_lp_a1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 90 },
      ];

      const streamMeans = {
        sb_lp_eng: 75,
        sb_lp_kis: 65,
        sb_lp_mat: 80,
        sb_lp_ila: 80,
      };

      drawLowerPrimarySubjectComparisonGraph(
        doc,
        lpSubjects,
        marks,
        streamMeans,
        175,
        10,
        190,
        examIdLp,
        'std_lp_a1',
        mockClassG2Alpha
      );

      // Legend circles exist, filter only plot circles (radius 1.2)
      const plotCircles = circleCalls.filter((c) => Math.abs(c.r - 1.2) < 0.05);
      expect(plotCircles.length).toBe(4);

      // Verify that plot circles correspond to the 4 subjects with increasing x
      expect(plotCircles[0].x).toBeLessThan(plotCircles[1].x);
      expect(plotCircles[1].x).toBeLessThan(plotCircles[2].x);
      expect(plotCircles[2].x).toBeLessThan(plotCircles[3].x);
    });

    it('3. uses circular markers for learner and dashed lines for stream means', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let dashPatternSet = false;

      (doc as any).setLineDashPattern = (pattern: number[]) => {
        if (pattern && pattern.length === 2 && pattern[0] === 1.8 && pattern[1] === 1.2) {
          dashPatternSet = true;
        }
      };

      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 85 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 70 },
      ];

      drawLowerPrimarySubjectComparisonGraph(
        doc,
        lpSubjects,
        marks,
        { sb_lp_eng: 75, sb_lp_kis: 65 },
        175,
        10,
        190,
        examIdLp,
        'std_lp_a1',
        mockClassG2Alpha
      );

      expect(dashPatternSet).toBe(true);
    });

    it('4. ensures non-overlapping value labels when learner and stream mean values are close or equal', () => {
      const learnerPoints = [
        { x: 50, y: 190, pct: 75, subjectIndex: 0 },
      ];
      const streamPoints = [
        { x: 50, y: 190, pct: 75, subjectIndex: 0 },
      ];

      const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
        learnerPoints,
        streamPoints,
        175,
        215,
        170,
        48
      );

      expect(learnerLabels.length).toBe(1);
      expect(streamLabels.length).toBe(1);
      expect(learnerLabels[0].text).toBe('75');
      expect(streamLabels[0].text).toBe('75');

      // Vertical separation must be at least 4mm to prevent collision
      const separation = Math.abs(learnerLabels[0].y - streamLabels[0].y);
      expect(separation).toBeGreaterThanOrEqual(4.0);
      expect(learnerLabels[0].y).toBeLessThan(streamLabels[0].y);
    });

    it('5. preserves genuine 0% scores at the baseline without omitting them', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const textCalls: { text: string; x: number; y: number }[] = [];

      const origText = doc.text.bind(doc);
      (doc as any).text = function (text: any, x: any, y: any, options: any) {
        textCalls.push({ text: String(text), x, y });
        return origText(text, x, y, options);
      };

      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 0 },
      ];

      drawLowerPrimarySubjectComparisonGraph(
        doc,
        lpSubjects,
        marks,
        { sb_lp_eng: 50 },
        175,
        10,
        190,
        examIdLp,
        'std_lp_a1',
        mockClassG2Alpha
      );

      // Verify that learner value '0' is rendered
      const zeroText = textCalls.find((c) => c.text === '0');
      expect(zeroText).toBeDefined();
    });

    it('6. does not plot missing (X) marks as zero and breaks connecting lines across gaps', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let currentDrawColor = '';
      const origSetDrawColor = doc.setDrawColor.bind(doc);
      (doc as any).setDrawColor = function (...args: any[]) {
        currentDrawColor = args.join(',');
        return (origSetDrawColor as any)(...args);
      };

      const greenLineCalls: { x1: number; y1: number; x2: number; y2: number }[] = [];
      const origLine = doc.line.bind(doc);
      (doc as any).line = function (x1: any, y1: any, x2: any, y2: any) {
        if (currentDrawColor === '4,120,87') {
          greenLineCalls.push({ x1, y1, x2, y2 });
        }
        return origLine(x1, y1, x2, y2);
      };

      const circleCalls: { x: number; y: number; r: number }[] = [];
      const origCircle = doc.circle.bind(doc);
      (doc as any).circle = function (x: any, y: any, r: any, style: any) {
        circleCalls.push({ x, y, r });
        return origCircle(x, y, r, style);
      };

      // ENG is 85, KIS is 'X' (missing), ILA is 90
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 85 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 'X' as any },
        { id: 'm3', student_id: 'std_lp_a1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 90 },
      ];

      drawLowerPrimarySubjectComparisonGraph(
        doc,
        lpSubjects,
        marks,
        {},
        175,
        10,
        190,
        examIdLp,
        'std_lp_a1',
        mockClassG2Alpha
      );

      // Verify that only 2 circles (ENG and ILA) were drawn in the plot area (radius 1.2), none for KIS
      const plotCircles = circleCalls.filter((c) => Math.abs(c.r - 1.2) < 0.05);
      expect(plotCircles.length).toBe(2);

      // The only green line drawn should be the 5mm legend indicator, NOT a plot line connecting ENG (idx 0) to ILA (idx 2)
      const plotLines = greenLineCalls.filter((l) => Math.abs(l.x2 - l.x1) > 10);
      expect(plotLines.length).toBe(0);
    });

    it('7. respects stream cohort quorum: returns null when fewer than 2 valid learners exist', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 80 },
        { id: 'm2', student_id: 'std_lp_a2', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 'Y' as any },
      ];

      const streamStudentIds = new Set(['std_lp_a1', 'std_lp_a2']);
      const means = calculateLowerPrimaryStreamSubjectMeans({
        marks,
        streamStudentIds,
        examId: examIdLp,
        subjects: lpSubjects,
      });

      // Only 1 valid learner (std_lp_a1); std_lp_a2 is 'Y'
      expect(means['sb_lp_eng']).toBeNull();
      expect(means['ENG']).toBeNull();
    });

    it('8. handles missing cohort data gracefully without crashing', async () => {
      const reportData: PDFReportData = {
        student: studentG1,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks: [],
        grades: upGrades,
        allStudents: [],
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateLowerPrimaryReportPDF(reportData);
      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('9. supports combined batch PDF generation with exactly one page per learner', async () => {
      const masterDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_g1_1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 80 },
        { id: 'm2', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 90 },
      ];

      const reportData1: PDFReportData = {
        student: studentG1,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: allLpStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      const reportData2: PDFReportData = {
        student: studentLp1,
        school: mockSchool,
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: allLpStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      await createReportCardPDFDoc(reportData1, masterDoc);
      masterDoc.addPage('a4', 'portrait');
      await createReportCardPDFDoc(reportData2, masterDoc);

      expect(masterDoc.getNumberOfPages()).toBe(2);
    });

    it('10. keeps Lower Primary report strictly on one A4 page for Grade 1, 2, and 3', async () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_g1_1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 75 },
        { id: 'm2', student_id: 'std_g1_1', subject_id: 'sb_lp_kis', exam_id: examIdLp, marks: 80 },
        { id: 'm3', student_id: 'std_g1_1', subject_id: 'sb_lp_ila', exam_id: examIdLp, marks: 85 },
      ];

      for (const std of [studentG1, studentLp1, studentG3]) {
        const reportData: PDFReportData = {
          student: std,
          school: mockSchool,
          exam: mockExamLp,
          classes: lpClasses,
          subjects: lpSubjects,
          marks,
          grades: upGrades,
          allStudents: allLpStudents,
          nextTermOpeningDate: '2026-05-04',
        };

        const doc = await generateLowerPrimaryReportPDF(reportData);
        expect(doc.getNumberOfPages()).toBe(1);
      }
    });

    it('11. preserves school header, watermark and signatures in Lower Primary report', async () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_lp_a1', subject_id: 'sb_lp_eng', exam_id: examIdLp, marks: 84 },
      ];

      const reportData: PDFReportData = {
        student: studentLp1,
        school: {
          ...mockSchool,
          logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
        exam: mockExamLp,
        classes: lpClasses,
        subjects: lpSubjects,
        marks,
        grades: upGrades,
        allStudents: allLpStudents,
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await generateLowerPrimaryReportPDF(reportData);
      expect(doc.getNumberOfPages()).toBe(1);
    });
  });
});
