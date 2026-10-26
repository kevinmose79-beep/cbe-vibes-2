import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  calculateStreamSubjectMeans,
} from '../utils/markUtils';
import {
  generateJuniorSchoolReportPDF,
  drawJuniorSchoolSubjectComparisonGraph,
  computeGraphValueLabelPositions,
  GraphValuePoint,
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
} from '../types';

describe('Junior School Subject Performance Comparison Graph Integration (Phase 3C)', () => {
  const examId = 'exam_term1_js_2026';
  const otherExamId = 'exam_term2_js_2026';

  const mockSchool: School = {
    id: 'school_1',
    school_name: 'TEST JUNIOR ACADEMY',
    county: 'Nairobi',
    address: 'P.O. Box 100, Nairobi',
    phone: '0712345678',
    email: 'info@testacademy.co.ke',
    principal_name: 'Dr. Principal',
  };

  const mockExam: Examination = {
    id: examId,
    exam_name: 'Term 1 Mid-Term Assessment',
    exam_type: 'Mid-Term',
    max_marks: 100,
    term: 'Term 1',
    year: 2026,
    education_level: 'Junior School',
    status: 'Approved',
  };

  const mockStream7A: ClassStream = {
    id: 'class_g7_a',
    class_name: 'Grade 7',
    stream: 'Stream A',
    stream_id: 'stream_7a',
    education_level: 'Junior School',
  };

  const mockStream7B: ClassStream = {
    id: 'class_g7_b',
    class_name: 'Grade 7',
    stream: 'Stream B',
    stream_id: 'stream_7b',
    education_level: 'Junior School',
  };

  const mockStream8A: ClassStream = {
    id: 'class_g8_a',
    class_name: 'Grade 8',
    stream: 'Stream A',
    stream_id: 'stream_8a',
    education_level: 'Junior School',
  };

  const mockStream9A: ClassStream = {
    id: 'class_g9_a',
    class_name: 'Grade 9',
    stream: 'Stream A',
    stream_id: 'stream_9a',
    education_level: 'Junior School',
  };

  const testSubjects: Subject[] = [
    { id: 'sub_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_kisw', subject_name: 'Kiswahili', subject_code: 'KISW', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_sci', subject_name: 'Integrated Science', subject_code: 'SCI', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_ss', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_pre', subject_name: 'Pre-Technical Studies', subject_code: 'PTS', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_agr', subject_name: 'Agriculture', subject_code: 'AGR', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    { id: 'sub_cas', subject_name: 'Creative Arts & Sports', subject_code: 'CAS', category: 'Core', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
  ];

  const studentA1: Student = {
    id: 'std_7a_1',
    admission_number: 'ADM-001',
    full_name: 'Alice Wanjiku',
    grade: 'Grade 7',
    stream_id: 'stream_7a',
    class_id: 'class_g7_a',
    gender: 'F',
    active: true,
  };

  const studentA2: Student = {
    id: 'std_7a_2',
    admission_number: 'ADM-002',
    full_name: 'Bob Kiprop',
    grade: 'Grade 7',
    stream_id: 'stream_7a',
    class_id: 'class_g7_a',
    gender: 'M',
    active: true,
  };

  const studentA3: Student = {
    id: 'std_7a_3',
    admission_number: 'ADM-003',
    full_name: 'Charlie Omondi',
    grade: 'Grade 7',
    stream_id: 'stream_7a',
    class_id: 'class_g7_a',
    gender: 'M',
    active: true,
  };

  const studentB1: Student = {
    id: 'std_7b_1',
    admission_number: 'ADM-004',
    full_name: 'Diana Mutua',
    grade: 'Grade 7',
    stream_id: 'stream_7b',
    class_id: 'class_g7_b',
    gender: 'F',
    active: true,
  };

  const studentGrade8: Student = {
    id: 'std_8a_1',
    admission_number: 'ADM-005',
    full_name: 'Evan Maina',
    grade: 'Grade 8',
    stream_id: 'stream_8a',
    class_id: 'class_g8_a',
    gender: 'M',
    active: true,
  };

  const studentGrade9: Student = {
    id: 'std_9a_1',
    admission_number: 'ADM-006',
    full_name: 'Faith Chebet',
    grade: 'Grade 9',
    stream_id: 'stream_9a',
    class_id: 'class_g9_a',
    gender: 'F',
    active: true,
  };

  const allStudents = [studentA1, studentA2, studentA3, studentB1, studentGrade8, studentGrade9];
  const classes = [mockStream7A, mockStream7B, mockStream8A, mockStream9A];

  const testGrades: Grade[] = [
    { id: 'g1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 8, remarks: 'Outstanding', descriptor: 'Exceeding Expectations' },
    { id: 'g2', grade_code: 'EE2', performance_level: 'EE', minimum_score: 75, maximum_score: 89, points: 7, remarks: 'Excellent', descriptor: 'Exceeding Expectations' },
    { id: 'g3', grade_code: 'ME1', performance_level: 'ME', minimum_score: 58, maximum_score: 74, points: 6, remarks: 'Good', descriptor: 'Meeting Expectations' },
    { id: 'g4', grade_code: 'ME2', performance_level: 'ME', minimum_score: 41, maximum_score: 57, points: 5, remarks: 'Satisfactory', descriptor: 'Meeting Expectations' },
    { id: 'g5', grade_code: 'AE1', performance_level: 'AE', minimum_score: 31, maximum_score: 40, points: 4, remarks: 'Developing', descriptor: 'Approaching Expectations' },
    { id: 'g6', grade_code: 'AE2', performance_level: 'AE', minimum_score: 21, maximum_score: 30, points: 3, remarks: 'Needs Support', descriptor: 'Approaching Expectations' },
    { id: 'g7', grade_code: 'BE1', performance_level: 'BE', minimum_score: 11, maximum_score: 20, points: 2, remarks: 'Needs Support', descriptor: 'Below Expectations' },
    { id: 'g8', grade_code: 'BE2', performance_level: 'BE', minimum_score: 0, maximum_score: 10, points: 1, remarks: 'Intervention Required', descriptor: 'Below Expectations' },
  ];

  it('1. Calculates accurate stream means from peer marks for Grade 7 Stream A', () => {
    const marks: Mark[] = [
      // Stream 7A English marks: std_1=80, std_2=70, std_3=60 -> Mean: 70
      { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      { id: 'm2', student_id: 'std_7a_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'm3', student_id: 'std_7a_3', subject_id: 'sub_eng', exam_id: examId, marks: 60 },

      // Stream 7A Math marks: std_1=90, std_2=0 (genuine zero), std_3=60 -> (90+0+60)/3 = 50
      { id: 'm4', student_id: 'std_7a_1', subject_id: 'sub_math', exam_id: examId, marks: 90 },
      { id: 'm5', student_id: 'std_7a_2', subject_id: 'sub_math', exam_id: examId, marks: 0, special_status: 'Normal' },
      { id: 'm6', student_id: 'std_7a_3', subject_id: 'sub_math', exam_id: examId, marks: 60 },

      // Stream 7B marks (outside Stream A): should not affect Stream A
      { id: 'm7', student_id: 'std_7b_1', subject_id: 'sub_eng', exam_id: examId, marks: 100 },
      { id: 'm8', student_id: 'std_7b_1', subject_id: 'sub_math', exam_id: examId, marks: 100 },
    ];

    const streamStudentIds = new Set(['std_7a_1', 'std_7a_2', 'std_7a_3']);
    const streamMeans = calculateStreamSubjectMeans(marks, streamStudentIds, examId, testSubjects);

    expect(streamMeans['sub_eng']).toBe(70);
    expect(streamMeans['sub_math']).toBe(50);
  });

  it('2. Enforces isolation across examinations, grades, and streams', () => {
    const marks: Mark[] = [
      // Grade 7 Stream A: Math 50
      { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_math', exam_id: examId, marks: 50 },
      { id: 'm2', student_id: 'std_7a_2', subject_id: 'sub_math', exam_id: examId, marks: 50 },

      // Grade 7 Stream B: Math 80 (with 2 learners meeting cohort quorum)
      { id: 'm3_1', student_id: 'std_7b_1', subject_id: 'sub_math', exam_id: examId, marks: 80 },
      { id: 'm3_2', student_id: 'std_7b_2', subject_id: 'sub_math', exam_id: examId, marks: 80 },

      // Grade 8 Stream A: Math 65 (with 2 learners meeting cohort quorum)
      { id: 'm4_1', student_id: 'std_8a_1', subject_id: 'sub_math', exam_id: examId, marks: 65 },
      { id: 'm4_2', student_id: 'std_8a_2', subject_id: 'sub_math', exam_id: examId, marks: 65 },

      // Other Exam mark for Grade 7 Stream A: Math 100
      { id: 'm5', student_id: 'std_7a_1', subject_id: 'sub_math', exam_id: otherExamId, marks: 100 },
    ];

    // Query Grade 7 Stream A
    const means7A = calculateStreamSubjectMeans(marks, ['std_7a_1', 'std_7a_2'], examId, ['sub_math']);
    expect(means7A['sub_math']).toBe(50);

    // Query Grade 7 Stream B
    const means7B = calculateStreamSubjectMeans(marks, ['std_7b_1', 'std_7b_2'], examId, ['sub_math']);
    expect(means7B['sub_math']).toBe(80);

    // Query Grade 8 Stream A
    const means8A = calculateStreamSubjectMeans(marks, ['std_8a_1', 'std_8a_2'], examId, ['sub_math']);
    expect(means8A['sub_math']).toBe(65);
  });

  it('3. Renders a single-page A4 Junior School report containing the comparison graph', async () => {
    const marks: Mark[] = [
      // Student 1 (Alice)
      { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 82 },
      { id: 'm2', student_id: 'std_7a_1', subject_id: 'sub_kisw', exam_id: examId, marks: 78 },
      { id: 'm3', student_id: 'std_7a_1', subject_id: 'sub_math', exam_id: examId, marks: 85 },
      { id: 'm4', student_id: 'std_7a_1', subject_id: 'sub_sci', exam_id: examId, marks: 80 },
      { id: 'm5', student_id: 'std_7a_1', subject_id: 'sub_ss', exam_id: examId, marks: 74 },
      { id: 'm6', student_id: 'std_7a_1', subject_id: 'sub_cre', exam_id: examId, marks: 88 },
      { id: 'm7', student_id: 'std_7a_1', subject_id: 'sub_pre', exam_id: examId, marks: 70 },
      { id: 'm8', student_id: 'std_7a_1', subject_id: 'sub_agr', exam_id: examId, marks: 76 },
      { id: 'm9', student_id: 'std_7a_1', subject_id: 'sub_cas', exam_id: examId, marks: 84 },

      // Student 2 (Bob - Peer in Stream 7A)
      { id: 'm10', student_id: 'std_7a_2', subject_id: 'sub_eng', exam_id: examId, marks: 68 },
      { id: 'm11', student_id: 'std_7a_2', subject_id: 'sub_kisw', exam_id: examId, marks: 72 },
      { id: 'm12', student_id: 'std_7a_2', subject_id: 'sub_math', exam_id: examId, marks: 65 },
      { id: 'm13', student_id: 'std_7a_2', subject_id: 'sub_sci', exam_id: examId, marks: 70 },
      { id: 'm14', student_id: 'std_7a_2', subject_id: 'sub_ss', exam_id: examId, marks: 66 },
      { id: 'm15', student_id: 'std_7a_2', subject_id: 'sub_cre', exam_id: examId, marks: 80 },
      { id: 'm16', student_id: 'std_7a_2', subject_id: 'sub_pre', exam_id: examId, marks: 60 },
      { id: 'm17', student_id: 'std_7a_2', subject_id: 'sub_agr', exam_id: examId, marks: 64 },
      { id: 'm18', student_id: 'std_7a_2', subject_id: 'sub_cas', exam_id: examId, marks: 76 },
    ];

    const reportData: PDFReportData = {
      student: studentA1,
      school: mockSchool,
      exam: mockExam,
      classes,
      subjects: testSubjects,
      marks,
      grades: testGrades,
      allStudents,
      nextTermOpeningDate: '2026-05-04',
    };

    const doc = await generateJuniorSchoolReportPDF(reportData);

    // Verify it stays strictly on 1 page
    const pageCount = doc.getNumberOfPages();
    expect(pageCount).toBe(1);
  });

  it('4. Handles Grade 8 and Grade 9 reports with 1-page A4 invariant preserved', async () => {
    const marksGrade8: Mark[] = [
      { id: 'm8_1', student_id: 'std_8a_1', subject_id: 'sub_eng', exam_id: examId, marks: 75 },
      { id: 'm8_2', student_id: 'std_8a_1', subject_id: 'sub_math', exam_id: examId, marks: 82 },
    ];

    const doc8 = await generateJuniorSchoolReportPDF({
      student: studentGrade8,
      school: mockSchool,
      exam: mockExam,
      classes,
      subjects: testSubjects,
      marks: marksGrade8,
      grades: testGrades,
      allStudents,
      nextTermOpeningDate: '2026-05-04',
    });

    expect(doc8.getNumberOfPages()).toBe(1);

    const marksGrade9: Mark[] = [
      { id: 'm9_1', student_id: 'std_9a_1', subject_id: 'sub_eng', exam_id: examId, marks: 88 },
      { id: 'm9_2', student_id: 'std_9a_1', subject_id: 'sub_math', exam_id: examId, marks: 91 },
    ];

    const doc9 = await generateJuniorSchoolReportPDF({
      student: studentGrade9,
      school: mockSchool,
      exam: mockExam,
      classes,
      subjects: testSubjects,
      marks: marksGrade9,
      grades: testGrades,
      allStudents,
      nextTermOpeningDate: '2026-05-04',
    });

    expect(doc9.getNumberOfPages()).toBe(1);
  });

  it('5. Gracefully handles absence of peer marks without throwing or inventing averages', () => {
    // Only student 1's marks, no peer marks
    const isolatedMarks: Mark[] = [
      { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
    ];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    expect(() => {
      drawJuniorSchoolSubjectComparisonGraph(
        doc,
        testSubjects.slice(0, 4),
        isolatedMarks,
        {}, // Empty stream subject means (peer data unavailable)
        180,
        10,
        190,
        examId,
        'std_7a_1',
        mockStream7A
      );
    }).not.toThrow();
  });

  it('6. Correctly uses precalculated batch cohort stream subject means when supplied', async () => {
    // Precalculated stream means provided directly from batch cache
    const precalculatedMeans: Record<string, number | null> = {
      sub_eng: 75,
      sub_kisw: 70,
      sub_math: 68,
      sub_sci: 72,
    };

    const reportData: PDFReportData = {
      student: studentA1,
      school: mockSchool,
      exam: mockExam,
      classes,
      subjects: testSubjects.slice(0, 4),
      marks: [
        { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      ],
      grades: testGrades,
      allStudents,
      nextTermOpeningDate: '2026-05-04',
      precalculatedCohortInfo: {
        gradeStudentIds: new Set(['std_7a_1']),
        streamStudentIds: new Set(['std_7a_1']),
        totalGradeAssessedStudents: 1,
        streamAssessedStudentsCount: 1,
        streamSubjectMeans: precalculatedMeans,
      },
    };

    const doc = await generateJuniorSchoolReportPDF(reportData);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('7. Renders the graph series with Stream Mean (dashed line + diamond markers) and Learner (solid line + circle markers)', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Track jsPDF drawing calls
    const drawnLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const drawnCircles: Array<{ x: number; y: number; r: number; style?: string }> = [];
    const drawnTriangles: Array<{ x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; style?: string }> = [];
    const drawnTexts: Array<{ text: string; x: number; y: number }> = [];

    const origLine = doc.line.bind(doc);
    const origCircle = doc.circle.bind(doc);
    const origText = doc.text.bind(doc);
    const origTriangle = (doc as any).triangle ? (doc as any).triangle.bind(doc) : undefined;

    doc.line = ((x1: number, y1: number, x2: number, y2: number) => {
      drawnLines.push({ x1, y1, x2, y2 });
      return origLine(x1, y1, x2, y2);
    }) as any;

    doc.circle = ((x: number, y: number, r: number, style?: string) => {
      drawnCircles.push({ x, y, r, style });
      return origCircle(x, y, r, style as any);
    }) as any;

    if (origTriangle) {
      (doc as any).triangle = ((x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string) => {
        drawnTriangles.push({ x1, y1, x2, y2, x3, y3, style });
        return origTriangle(x1, y1, x2, y2, x3, y3, style);
      });
    }

    doc.text = ((text: any, x: number, y: number, options?: any) => {
      drawnTexts.push({ text: String(text), x, y });
      return origText(text, x, y, options);
    }) as any;

    const studentMarks: Mark[] = [
      { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      { id: 'm2', student_id: 'std_7a_1', subject_id: 'sub_math', exam_id: examId, marks: 90 },
    ];
    const streamMeans: Record<string, number | null> = {
      sub_eng: 70,
      sub_math: 60,
    };

    const nextY = drawJuniorSchoolSubjectComparisonGraph(
      doc,
      testSubjects.slice(0, 2), // English & Mathematics
      studentMarks,
      streamMeans,
      180,
      10,
      190,
      examId,
      'std_7a_1',
      mockStream7A
    );

    // Verify container height returned
    expect(nextY).toBeGreaterThan(180);

    // Verify title text rendered
    const hasTitle = drawnTexts.some((t) => t.text.includes('SUBJECT PERFORMANCE COMPARISON'));
    expect(hasTitle).toBe(true);

    // Verify legend texts rendered exactly
    const hasStreamMeanLegend = drawnTexts.some((t) => t.text === 'Stream Mean');
    const hasLearnerLegend = drawnTexts.some((t) => t.text === 'Learner');
    expect(hasStreamMeanLegend).toBe(true);
    expect(hasLearnerLegend).toBe(true);

    // Verify tick labels 0%, 25%, 50%, 75%, 100% rendered
    expect(drawnTexts.some((t) => t.text === '0%')).toBe(true);
    expect(drawnTexts.some((t) => t.text === '50%')).toBe(true);
    expect(drawnTexts.some((t) => t.text === '100%')).toBe(true);

    // Verify diamond markers (drawn via triangles with style 'F') for Stream Mean and circular markers ('FD') for Learner
    const hasDiamondMarkers = drawnTriangles.some((t) => t.style === 'F');
    const hasCircleMarkers = drawnCircles.some((c) => c.style === 'FD');
    expect(hasDiamondMarkers).toBe(true);
    expect(hasCircleMarkers).toBe(true);
  });

  it('8. Verifies stream mean caching isolates unique exam/grade/stream combinations across batch', () => {
    // 5 students across 2 streams (3 in Stream A, 2 in Stream B)
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      { id: 'm2', student_id: 'std_7a_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'm3', student_id: 'std_7a_3', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
      { id: 'm4', student_id: 'std_7b_1', subject_id: 'sub_eng', exam_id: examId, marks: 90 },
      { id: 'm5', student_id: 'std_7b_2', subject_id: 'sub_eng', exam_id: examId, marks: 90 },
    ];

    // Stream A mean = (80 + 70 + 60) / 3 = 70
    const meansA = calculateStreamSubjectMeans(marks, ['std_7a_1', 'std_7a_2', 'std_7a_3'], examId, ['sub_eng']);
    expect(meansA['sub_eng']).toBe(70);

    // Stream B mean = (90 + 90) / 2 = 90
    const meansB = calculateStreamSubjectMeans(marks, ['std_7b_1', 'std_7b_2'], examId, ['sub_eng']);
    expect(meansB['sub_eng']).toBe(90);

    // Isolated results: Stream A and Stream B never overwrite each other
    expect(meansA['sub_eng']).not.toBe(meansB['sub_eng']);
  });

  it('9. Preserves 1-page A4 invariant with higher subject count (12 subjects) in Grade 7/8/9', async () => {
    const twelveSubjects: Subject[] = [
      ...testSubjects,
      { id: 'sub_fre', subject_name: 'French', subject_code: 'FRE', category: 'Optional', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
      { id: 'sub_comp', subject_name: 'Computer Science', subject_code: 'CSC', category: 'Optional', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
      { id: 'sub_mus', subject_name: 'Music', subject_code: 'MUS', category: 'Optional', education_level: 'Junior School', applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'], status: 'Active' },
    ];

    const twelveMarks: Mark[] = twelveSubjects.map((s, idx) => ({
      id: `m_12_${idx}`,
      student_id: 'std_7a_1',
      subject_id: s.id,
      exam_id: examId,
      marks: 70 + (idx % 25),
    }));

    // Add peer marks for stream comparison
    const peerMarks: Mark[] = twelveSubjects.map((s, idx) => ({
      id: `m_peer_12_${idx}`,
      student_id: 'std_7a_2',
      subject_id: s.id,
      exam_id: examId,
      marks: 65 + (idx % 20),
    }));

    const doc = await generateJuniorSchoolReportPDF({
      student: studentA1,
      school: mockSchool,
      exam: mockExam,
      classes,
      subjects: twelveSubjects,
      marks: [...twelveMarks, ...peerMarks],
      grades: testGrades,
      allStudents,
      nextTermOpeningDate: '2026-05-04',
    });

    // Strictly 1 page
    expect(doc.getNumberOfPages()).toBe(1);
  });

  describe('Phase 3C.1: Non-Overlapping Graph Value Label Verification', () => {
    const currentY = 230;
    const boxH = 28;
    const plotTop = currentY + 5.5; // 235.5
    const plotBottom = currentY + boxH - 5.0; // 253.0
    const plotHeight = plotBottom - plotTop; // 17.5

    it('10. Equal percentage values (e.g. 22% vs 22%) produce non-overlapping labels with Learner above and Stream Mean below', () => {
      const pct = 22;
      const y = plotBottom - (pct / 100) * plotHeight;
      const x = 50;

      const learnerPoints = [{ x: x - 2.5, y, pct, subjectIndex: 0 }];
      const streamPoints = [{ x: x + 2.5, y, pct, subjectIndex: 0 }];

      const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
        learnerPoints,
        streamPoints,
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(learnerLabels).toHaveLength(1);
      expect(streamLabels).toHaveLength(1);

      const sLbl = streamLabels[0];
      const lLbl = learnerLabels[0];

      expect(sLbl.text).toBe('22');
      expect(lLbl.text).toBe('22');

      // Learner label must be ABOVE its marker (smaller Y)
      expect(lLbl.y).toBeLessThan(y);
      // Stream Mean label must be BELOW its marker (larger Y)
      expect(sLbl.y).toBeGreaterThan(y);

      // Must be non-overlapping with at least 2.4mm vertical separation
      const verticalSeparation = sLbl.y - lLbl.y;
      expect(verticalSeparation).toBeGreaterThanOrEqual(2.4);

      // Horizontal coordinates reflect distinct series positioning
      expect(lLbl.x).toBeLessThan(sLbl.x);
    });

    it('11. One-point differences (23% vs 22% and 22% vs 23%) produce non-overlapping labels', () => {
      // Case A: Stream Mean 23%, Learner 22%
      const sY_A = plotBottom - (23 / 100) * plotHeight;
      const lY_A = plotBottom - (22 / 100) * plotHeight;
      const resA = computeGraphValueLabelPositions(
        [{ x: 47.5, y: lY_A, pct: 22, subjectIndex: 0 }],
        [{ x: 52.5, y: sY_A, pct: 23, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(resA.streamLabels[0].text).toBe('23');
      expect(resA.learnerLabels[0].text).toBe('22');
      // Learner above, Stream Mean below
      expect(resA.learnerLabels[0].y).toBeLessThan(resA.streamLabels[0].y);
      expect(resA.streamLabels[0].y - resA.learnerLabels[0].y).toBeGreaterThanOrEqual(2.4);

      // Case B: Stream Mean 22%, Learner 23%
      const sY_B = plotBottom - (22 / 100) * plotHeight;
      const lY_B = plotBottom - (23 / 100) * plotHeight;
      const resB = computeGraphValueLabelPositions(
        [{ x: 47.5, y: lY_B, pct: 23, subjectIndex: 0 }],
        [{ x: 52.5, y: sY_B, pct: 22, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(resB.streamLabels[0].text).toBe('22');
      expect(resB.learnerLabels[0].text).toBe('23');
      // Learner above, Stream Mean below
      expect(resB.learnerLabels[0].y).toBeLessThan(resB.streamLabels[0].y);
      expect(resB.streamLabels[0].y - resB.learnerLabels[0].y).toBeGreaterThanOrEqual(2.4);
    });

    it('12. User screenshot scenarios (MATH: 17% Stream vs 22% Learner; KIS: 70% Stream vs 65% Learner) do not overlap', () => {
      // MATH: Stream Mean 17%, Learner 22%
      const sY_math = plotBottom - (17 / 100) * plotHeight;
      const lY_math = plotBottom - (22 / 100) * plotHeight;
      const resMath = computeGraphValueLabelPositions(
        [{ x: 57.5, y: lY_math, pct: 22, subjectIndex: 0 }],
        [{ x: 62.5, y: sY_math, pct: 17, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(resMath.streamLabels[0].text).toBe('17');
      expect(resMath.learnerLabels[0].text).toBe('22');
      // Learner above (smaller Y), Stream Mean below (larger Y)
      expect(resMath.learnerLabels[0].y).toBeLessThan(resMath.streamLabels[0].y);
      expect(resMath.streamLabels[0].y - resMath.learnerLabels[0].y).toBeGreaterThanOrEqual(2.4);

      // KIS: Stream Mean 70%, Learner 65%
      const sY_kis = plotBottom - (70 / 100) * plotHeight;
      const lY_kis = plotBottom - (65 / 100) * plotHeight;
      const resKis = computeGraphValueLabelPositions(
        [{ x: 37.5, y: lY_kis, pct: 65, subjectIndex: 0 }],
        [{ x: 42.5, y: sY_kis, pct: 70, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(resKis.streamLabels[0].text).toBe('70');
      expect(resKis.learnerLabels[0].text).toBe('65');
      // Learner above, Stream Mean below
      expect(resKis.learnerLabels[0].y).toBeLessThan(resKis.streamLabels[0].y);
      expect(resKis.streamLabels[0].y - resKis.learnerLabels[0].y).toBeGreaterThanOrEqual(2.4);
    });

    it('13. 0% boundary cases keep labels strictly above x-axis and subject codes without clipping', () => {
      // Both at 0%
      const y0 = plotBottom; // 0%
      const res0 = computeGraphValueLabelPositions(
        [{ x: 47.5, y: y0, pct: 0, subjectIndex: 0 }],
        [{ x: 52.5, y: y0, pct: 0, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      const sLbl = res0.streamLabels[0];
      const lLbl = res0.learnerLabels[0];

      expect(sLbl.text).toBe('0');
      expect(lLbl.text).toBe('0');

      // Both labels must be inside graph area strictly above plotBottom - 0.5mm
      // to avoid overlapping with x-axis tick (plotBottom + 0.8) and subject codes (plotBottom + 3.4)
      expect(sLbl.y).toBeLessThanOrEqual(plotBottom - 0.5);
      expect(lLbl.y).toBeLessThanOrEqual(plotBottom - 0.5);

      // Horizontal separation ensures no collision even when both flip above baseline
      expect(sLbl.x - lLbl.x).toBeGreaterThanOrEqual(4.0);

      // 1% Stream Mean vs 0% Learner
      const y1 = plotBottom - (1 / 100) * plotHeight;
      const res1 = computeGraphValueLabelPositions(
        [{ x: 47.5, y: y0, pct: 0, subjectIndex: 0 }],
        [{ x: 52.5, y: y1, pct: 1, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(res1.streamLabels[0].y).toBeLessThanOrEqual(plotBottom - 0.5);
      expect(res1.learnerLabels[0].y).toBeLessThanOrEqual(plotBottom - 0.5);
      expect(res1.streamLabels[0].x - res1.learnerLabels[0].x).toBeGreaterThanOrEqual(4.0);
    });

    it('14. 100% boundary cases keep labels inside container below top edge without clipping', () => {
      // Both at 100%
      const y100 = plotTop;
      const res100 = computeGraphValueLabelPositions(
        [{ x: 47.5, y: y100, pct: 100, subjectIndex: 0 }],
        [{ x: 52.5, y: y100, pct: 100, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      const sLbl = res100.streamLabels[0];
      const lLbl = res100.learnerLabels[0];

      expect(sLbl.text).toBe('100');
      expect(lLbl.text).toBe('100');

      // Must be inside container box (currentY + 4.2mm or greater, staying below header/legend)
      expect(sLbl.y).toBeGreaterThanOrEqual(currentY + 4.2);
      expect(lLbl.y).toBeGreaterThanOrEqual(currentY + 4.2);

      // Horizontal separation between series labels
      expect(sLbl.x - lLbl.x).toBeGreaterThanOrEqual(4.0);

      // 100% Stream Mean vs 99% Learner
      const y99 = plotTop + (1 / 100) * plotHeight;
      const res99 = computeGraphValueLabelPositions(
        [{ x: 47.5, y: y99, pct: 99, subjectIndex: 0 }],
        [{ x: 52.5, y: y100, pct: 100, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(res99.streamLabels[0].y).toBeGreaterThanOrEqual(currentY + 4.2);
      expect(res99.learnerLabels[0].y).toBeGreaterThanOrEqual(currentY + 4.2);
      expect(res99.streamLabels[0].x - res99.learnerLabels[0].x).toBeGreaterThanOrEqual(4.0);
    });

    it('15. Adjacent subject labels maintain clearance across subjects', () => {
      const x0 = 40;
      const x1 = 58; // 18mm apart
      const y = plotBottom - (50 / 100) * plotHeight;

      const learnerPoints = [
        { x: x0 - 2.5, y, pct: 50, subjectIndex: 0 },
        { x: x1 - 2.5, y, pct: 50, subjectIndex: 1 },
      ];
      const streamPoints = [
        { x: x0 + 2.5, y, pct: 50, subjectIndex: 0 },
        { x: x1 + 2.5, y, pct: 50, subjectIndex: 1 },
      ];

      const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
        learnerPoints,
        streamPoints,
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(learnerLabels).toHaveLength(2);
      expect(streamLabels).toHaveLength(2);

      // At each subject, vertical separation >= 2.4mm
      expect(streamLabels[0].y - learnerLabels[0].y).toBeGreaterThanOrEqual(2.4);
      expect(streamLabels[1].y - learnerLabels[1].y).toBeGreaterThanOrEqual(2.4);

      // Across subjects, horizontal distance is well separated
      expect(streamLabels[1].x - streamLabels[0].x).toBeGreaterThan(15);
      expect(learnerLabels[1].x - learnerLabels[0].x).toBeGreaterThan(15);
    });

    it('16. End-to-end PDF report generation with screenshot marks (MATH 22/17, KIS 70/65) confirms 1-page A4 and no error', async () => {
      const marksWithCollisions: Mark[] = [
        // English: Stream Mean 70, Learner 80
        { id: 'mc_1', student_id: 'std_7a_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
        { id: 'mc_2', student_id: 'std_7a_2', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
        // Kiswahili: Stream Mean 65, Learner 70 (or 70 vs 65)
        { id: 'mc_3', student_id: 'std_7a_1', subject_id: 'sub_kisw', exam_id: examId, marks: 65 },
        { id: 'mc_4', student_id: 'std_7a_2', subject_id: 'sub_kisw', exam_id: examId, marks: 75 }, // (65+75)/2 = 70
        // Math: Stream Mean 17, Learner 22
        { id: 'mc_5', student_id: 'std_7a_1', subject_id: 'sub_math', exam_id: examId, marks: 22 },
        { id: 'mc_6', student_id: 'std_7a_2', subject_id: 'sub_math', exam_id: examId, marks: 12 }, // (22+12)/2 = 17
        // Integrated Science: Stream Mean 35, Learner 35 (EQUAL!)
        { id: 'mc_7', student_id: 'std_7a_1', subject_id: 'sub_sci', exam_id: examId, marks: 35 },
        { id: 'mc_8', student_id: 'std_7a_2', subject_id: 'sub_sci', exam_id: examId, marks: 35 },
      ];

      const doc = await generateJuniorSchoolReportPDF({
        student: studentA1,
        school: mockSchool,
        exam: mockExam,
        classes,
        subjects: testSubjects.slice(0, 4),
        marks: marksWithCollisions,
        grades: testGrades,
        allStudents,
        nextTermOpeningDate: '2026-05-04',
      });

      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('17. Confirmed defect reproduction: 23% vs 22% produces Learner label above and Stream Mean label below with >= 2.4mm separation', () => {
      // Stream Mean 23%, Learner 22%
      const sY = plotBottom - (23 / 100) * plotHeight;
      const lY = plotBottom - (22 / 100) * plotHeight;
      const res = computeGraphValueLabelPositions(
        [{ x: 47.5, y: lY, pct: 22, subjectIndex: 0 }],
        [{ x: 52.5, y: sY, pct: 23, subjectIndex: 0 }],
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(res.streamLabels).toHaveLength(1);
      expect(res.learnerLabels).toHaveLength(1);

      const sLbl = res.streamLabels[0];
      const lLbl = res.learnerLabels[0];

      expect(sLbl.text).toBe('23');
      expect(lLbl.text).toBe('22');

      // Learner label positioned ABOVE marker (smaller y in PDF space)
      expect(lLbl.y).toBeLessThan(lY);
      // Stream Mean label positioned BELOW marker (larger y in PDF space)
      expect(sLbl.y).toBeGreaterThan(sY);

      // Learner label is above Stream Mean label
      expect(lLbl.y).toBeLessThan(sLbl.y);

      // Must be non-overlapping with at least 2.4mm vertical separation
      expect(sLbl.y - lLbl.y).toBeGreaterThanOrEqual(2.4);

      // Physical horizontal separation between series
      expect(sLbl.x - lLbl.x).toBeGreaterThanOrEqual(4.0);
    });

    it('18. Direct jsPDF vector rendering test: intercepts doc.text calls in drawJuniorSchoolSubjectComparisonGraph for 23% vs 22%', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const testSubjectsSubset = [testSubjects[0]]; // 1 subject for isolated focus
      const singleExamMarks: Mark[] = [
        { id: 'm_test_1', student_id: 'std_test', subject_id: testSubjects[0].id, exam_id: examId, marks: 22 },
      ];
      const streamMeans = { [testSubjects[0].id]: 23 };

      const capturedTexts: Array<{ text: string; x: number; y: number; fontSize: number; fontStyle: string }> = [];
      const originalText = doc.text.bind(doc);
      (doc as any).text = function (text: any, x: any, y: any, options: any) {
        capturedTexts.push({
          text: String(text),
          x: Number(x),
          y: Number(y),
          fontSize: (doc as any).internal?.getFontSize?.() || 0,
          fontStyle: (doc as any).internal?.getFont?.()?.fontStyle || 'normal',
        });
        return originalText(text, x, y, options);
      };

      drawJuniorSchoolSubjectComparisonGraph(
        doc,
        testSubjectsSubset,
        singleExamMarks,
        streamMeans,
        currentY,
        10,
        190,
        examId,
        'std_test',
        classes[0]
      );

      // Locate captured value labels for "23" and "22"
      const sText = capturedTexts.find((t) => t.text === '23');
      const lText = capturedTexts.find((t) => t.text === '22');

      expect(sText).toBeDefined();
      expect(lText).toBeDefined();

      // Learner label "22" is positioned ABOVE
      expect(lText!.y).toBeLessThan(sText!.y);
      // Stream Mean label "23" is positioned BELOW
      expect(sText!.y - lText!.y).toBeGreaterThanOrEqual(2.4);

      // Both labels are strictly inside graph vertical bounds (computed from availableSpace)
      expect(lText!.y).toBeGreaterThanOrEqual(currentY + 4.2);
      expect(sText!.y).toBeLessThanOrEqual(currentY + 30.5 - 5.5 - 0.5);

      // Both series are aligned on the exact same subject x-coordinate
      expect(sText!.x).toBe(lText!.x);
    });

    it('19. Handles adjacent subjects with close X and Y coordinates with deterministic collision avoidance', () => {
      const x0 = 50;
      const x1 = 52.5; // only 2.5mm apart horizontally
      const y = plotBottom - (50 / 100) * plotHeight;

      const learnerPoints = [
        { x: x0 - 2.5, y, pct: 50, subjectIndex: 0 },
        { x: x1 - 2.5, y, pct: 50, subjectIndex: 1 },
      ];
      const streamPoints = [
        { x: x0 + 2.5, y, pct: 50, subjectIndex: 0 },
        { x: x1 + 2.5, y, pct: 50, subjectIndex: 1 },
      ];

      const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
        learnerPoints,
        streamPoints,
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(learnerLabels).toHaveLength(2);
      expect(streamLabels).toHaveLength(2);

      // Check all 4 labels are non-overlapping
      const allLabels = [...streamLabels, ...learnerLabels];
      for (let i = 0; i < allLabels.length; i++) {
        for (let j = i + 1; j < allLabels.length; j++) {
          const a = allLabels[i];
          const b = allLabels[j];
          const dx = Math.abs(a.x - b.x);
          const dy = Math.abs(a.y - b.y);
          // With 2D bounding boxes, either dx >= 2.0 or dy >= 2.0
          expect(dx >= 2.0 || dy >= 2.0).toBe(true);
        }
      }
    });

    it('20. Validates all named problematic pairs: ENG 36/38, KIS 65/66, C.R.E 46/45, AGN 63/64, PRE-TECH 38/40, MATH 0/20, SST 100/100', () => {
      const problematicPairs = [
        { name: 'ENG', learner: 36, stream: 38 },
        { name: 'KIS', learner: 65, stream: 66 },
        { name: 'C.R.E', learner: 46, stream: 45 },
        { name: 'AGN', learner: 63, stream: 64 },
        { name: 'PRE-TECH', learner: 38, stream: 40 },
        { name: 'MATH', learner: 0, stream: 20 },
        { name: 'SST', learner: 100, stream: 100 },
        { name: 'INT-SCI', learner: 70, stream: 70 },
        { name: 'CAS', learner: 55, stream: 55 },
      ];

      const learnerPts: GraphValuePoint[] = [];
      const streamPts: GraphValuePoint[] = [];

      problematicPairs.forEach((pair, idx) => {
        const xc = 30 + idx * 18;
        const yl = plotBottom - (pair.learner / 100) * plotHeight;
        const ys = plotBottom - (pair.stream / 100) * plotHeight;
        learnerPts.push({ x: xc - 2.5, y: yl, pct: pair.learner, subjectIndex: idx });
        streamPts.push({ x: xc + 2.5, y: ys, pct: pair.stream, subjectIndex: idx });
      });

      const { learnerLabels, streamLabels } = computeGraphValueLabelPositions(
        learnerPts,
        streamPts,
        plotTop,
        plotBottom,
        currentY,
        boxH
      );

      expect(learnerLabels).toHaveLength(problematicPairs.length);
      expect(streamLabels).toHaveLength(problematicPairs.length);

      // Verify each pair has non-overlapping bounding boxes
      for (let i = 0; i < problematicPairs.length; i++) {
        const lLbl = learnerLabels.find((l) => l.subjectIndex === i)!;
        const sLbl = streamLabels.find((s) => s.subjectIndex === i)!;

        expect(lLbl).toBeDefined();
        expect(sLbl).toBeDefined();

        // Horizontal separation >= 4.0mm
        expect(sLbl.x - lLbl.x).toBeGreaterThanOrEqual(4.0);

        // Vertical containment within graph
        expect(lLbl.y).toBeGreaterThanOrEqual(currentY + 4.2);
        expect(lLbl.y).toBeLessThanOrEqual(plotBottom - 0.5);
        expect(sLbl.y).toBeGreaterThanOrEqual(currentY + 4.2);
        expect(sLbl.y).toBeLessThanOrEqual(plotBottom - 0.5);

        // MATH 0% must be strictly above baseline (plotBottom)
        if (problematicPairs[i].name === 'MATH') {
          expect(lLbl.y).toBeLessThan(plotBottom - 1.0);
        }
      }
    });
  });
});

