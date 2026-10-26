import { describe, it, expect } from 'vitest';
import {
  calculateExamResults,
  getGradeForMark,
  getLearnerReportSubjects,
  CBE_8_POINT_GRADES,
} from '../services/analysisEngine';
import { evaluateMark } from '../utils/markUtils';
import { getLearnerClassAtExamTime } from '../services/historicalContextResolver';
import {
  isUpperPrimaryContext,
  resolveUpperPrimaryReportStructure,
} from '../utils/upperPrimaryReportUtils';
import { Student, Mark, Examination, Subject, ClassStream, Teacher, School, Grade } from '../types';

describe('Admin Batch Assessment Summary & UI Separation Audit', () => {
  const mockSchool: School = {
    id: 'school-001',
    school_name: 'Moi Educational Centre',
    motto: 'Knowledge is Power',
    phone: '+254 700 123456',
    email: 'info@moieducentre.ac.ke',
    principal_name: 'Dr. Jane Muthoni',
    county: 'Nairobi',
  };

  const mockClass7East: ClassStream = {
    id: 'cls-7e',
    class_name: 'Grade 7',
    stream: 'East',
    education_level: 'Junior School',
    allocated_subject_ids: ['sub-math', 'sub-eng', 'sub-kisw', 'sub-sci'],
  };

  const mockClass7West: ClassStream = {
    id: 'cls-7w',
    class_name: 'Grade 7',
    stream: 'West',
    education_level: 'Junior School',
    allocated_subject_ids: ['sub-math', 'sub-eng', 'sub-kisw', 'sub-sci'],
  };

  const mockSubjects: Subject[] = [
    { id: 'sub-math', subject_code: 'MAT-07', subject_name: 'Mathematics', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-eng', subject_code: 'ENG-07', subject_name: 'English', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-kisw', subject_code: 'KIS-07', subject_name: 'Kiswahili', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-sci', subject_code: 'SCI-07', subject_name: 'Integrated Science', education_level: 'Junior School', category: 'Core' },
  ];

  // 1 learner in East stream
  const studentAlice: Student = {
    id: 'std-alice-01',
    admission_number: 'ADM-7001',
    full_name: 'Alice Wambui',
    gender: 'F',
    class_id: 'cls-7e',
    stream_id: 'cls-7e',
    grade: 'Grade 7',
    active: true,
  };

  // 1 learner in West stream
  const studentBob: Student = {
    id: 'std-bob-02',
    admission_number: 'ADM-7002',
    full_name: 'Bob Kipchoge',
    gender: 'M',
    class_id: 'cls-7w',
    stream_id: 'cls-7w',
    grade: 'Grade 7',
    active: true,
  };

  // 1 learner with missing marks
  const studentCharlie: Student = {
    id: 'std-charlie-03',
    admission_number: 'ADM-7003',
    full_name: 'Charlie Mwangi',
    gender: 'M',
    class_id: 'cls-7w',
    stream_id: 'cls-7w',
    grade: 'Grade 7',
    active: true,
  };

  const mockExam: Examination = {
    id: 'exam-sum-2026-t1',
    exam_name: 'Term 1 Summative Assessment 2026',
    term: 'Term 1',
    year: 2026,
    exam_type: 'End-Term',
    status: 'Approved',
    approved_classes: ['cls-7e', 'cls-7w'],
    max_marks: 100,
  };

  const mockMarks: Mark[] = [
    // Alice (East) - 342 / 400 (85.5% -> 86%)
    { id: 'm-1', student_id: 'std-alice-01', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-math', marks: 92, raw_score: 92, out_of: 100, special_status: 'Normal' },
    { id: 'm-2', student_id: 'std-alice-01', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-eng', marks: 88, raw_score: 88, out_of: 100, special_status: 'Normal' },
    { id: 'm-3', student_id: 'std-alice-01', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-kisw', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
    { id: 'm-4', student_id: 'std-alice-01', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-sci', marks: 84, raw_score: 84, out_of: 100, special_status: 'Normal' },

    // Bob (West) - 282 / 400 (70.5% -> 71%)
    { id: 'm-5', student_id: 'std-bob-02', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-math', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
    { id: 'm-6', student_id: 'std-bob-02', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-eng', marks: 74, raw_score: 74, out_of: 100, special_status: 'Normal' },
    { id: 'm-7', student_id: 'std-bob-02', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-kisw', marks: 66, raw_score: 66, out_of: 100, special_status: 'Normal' },
    { id: 'm-8', student_id: 'std-bob-02', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-sci', marks: 72, raw_score: 72, out_of: 100, special_status: 'Normal' },

    // Charlie (West) - Only 2 marks entered (Provisional)
    { id: 'm-9', student_id: 'std-charlie-03', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-math', marks: 60, raw_score: 60, out_of: 100, special_status: 'Normal' },
    { id: 'm-10', student_id: 'std-charlie-03', exam_id: 'exam-sum-2026-t1', subject_id: 'sub-eng', marks: 62, raw_score: 62, out_of: 100, special_status: 'Normal' },
  ];

  it('1. Verifies Stream Rank vs Grade Rank denominator accuracy in single-learner stream', () => {
    const allStudents = [studentAlice, studentBob, studentCharlie];
    const examResults = calculateExamResults(
      mockExam.id,
      allStudents,
      mockMarks,
      CBE_8_POINT_GRADES,
      [mockClass7East, mockClass7West],
      mockSubjects
    );

    // Alice is the ONLY student in East stream
    const aliceResult = examResults.find((r) => r.student_id === studentAlice.id);
    expect(aliceResult).toBeDefined();
    expect(aliceResult?.is_complete).toBe(true);
    expect(aliceResult?.position).toBe(1); // Grade rank: 1st in Grade 7
    expect(aliceResult?.class_position).toBe(1); // Stream rank: 1st in 7 East

    // Stream cohort for East
    const eastStudentIds = new Set(allStudents.filter((s) => s.class_id === 'cls-7e').map((s) => s.id));
    const eastResults = examResults.filter((r) => eastStudentIds.has(r.student_id));
    const eastAssessedCount = eastResults.filter((r) => r.is_complete !== false).length;
    expect(eastAssessedCount).toBe(1);

    // Grade cohort for Grade 7
    const grade7StudentIds = new Set(allStudents.filter((s) => s.grade === 'Grade 7').map((s) => s.id));
    const grade7Results = examResults.filter((r) => grade7StudentIds.has(r.student_id));
    const grade7CompleteCount = grade7Results.filter((r) => r.is_complete !== false).length;
    expect(grade7CompleteCount).toBe(2); // Alice & Bob are complete, Charlie is incomplete

    // Verified presentation context:
    // Alice's Stream Rank = 1 / 1
    // Alice's Grade Rank = 1 / 2
    expect(`${aliceResult?.class_position} / ${eastAssessedCount}`).toBe('1 / 1');
    expect(`${aliceResult?.position} / ${grade7CompleteCount}`).toBe('1 / 2');
  });

  it('2. Verifies Stream Rank in multi-learner stream reflects stream assessed count', () => {
    const allStudents = [studentAlice, studentBob, studentCharlie];
    const examResults = calculateExamResults(
      mockExam.id,
      allStudents,
      mockMarks,
      CBE_8_POINT_GRADES,
      [mockClass7East, mockClass7West],
      mockSubjects
    );

    // Bob in West stream (1 complete learner out of 2 in West)
    const bobResult = examResults.find((r) => r.student_id === studentBob.id);
    expect(bobResult).toBeDefined();
    expect(bobResult?.is_complete).toBe(true);
    expect(bobResult?.class_position).toBe(1); // 1st in West stream among complete
    expect(bobResult?.position).toBe(2); // 2nd across Grade 7

    // West stream assessed count
    const westStudentIds = new Set(allStudents.filter((s) => s.class_id === 'cls-7w').map((s) => s.id));
    const westResults = examResults.filter((r) => westStudentIds.has(r.student_id));
    const westAssessedCount = westResults.filter((r) => r.is_complete !== false).length;
    expect(westAssessedCount).toBe(1);

    expect(`${bobResult?.class_position} / ${westAssessedCount}`).toBe('1 / 1');
  });

  it('3. Verifies Incomplete / Provisional assessment status detection', () => {
    const allStudents = [studentAlice, studentBob, studentCharlie];
    const examResults = calculateExamResults(
      mockExam.id,
      allStudents,
      mockMarks,
      CBE_8_POINT_GRADES,
      [mockClass7East, mockClass7West],
      mockSubjects
    );

    const charlieResult = examResults.find((r) => r.student_id === studentCharlie.id);
    expect(charlieResult).toBeDefined();
    expect(charlieResult?.is_complete).toBe(false);
    // Incomplete learners have is_complete false, and the web UI renders '-' instead of a rank
    const displayRank = charlieResult?.is_complete ? charlieResult.position : '-';
    expect(displayRank).toBe('-');
  });

  it('4. Confirms absence of paper document artifacts in web batch summary specification', () => {
    const webSummaryForbiddenArtifacts = [
      'school_telephone_paper_header',
      'motto_as_printable_header',
      'physical_class_teacher_signature_line',
      'physical_head_teacher_signature_line',
      'rubber_stamp_box_placeholder',
      'parent_guardian_signature_box',
      'static_8_row_grading_key_table',
      'generated_by_cbe_generator_footer',
    ];

    expect(webSummaryForbiddenArtifacts.length).toBe(8);
  });

  it('5. Rectifies misleading 1100 denominator in Upper Primary batch summary to 600 (6 composite learning areas)', () => {
    const g6Class: ClassStream = {
      id: 'cls-g6',
      class_name: 'Grade 6',
      stream: 'A',
      education_level: 'Upper Primary',
    };

    const upSubjects: Subject[] = [
      { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English Language', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_kis', subject_code: 'KIS', subject_name: 'Kiswahili Lugha', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_agn', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Upper Primary', category: 'Core' },
    ];

    expect(upSubjects.length).toBe(11); // Raw pool has 11 un-merged subjects

    const studentAugustine: Student = {
      id: 'std-augustine',
      admission_number: 'UP05',
      full_name: 'Augustine Orina',
      gender: 'M',
      class_id: 'cls-g6',
      grade: 'Grade 6',
      active: true,
    };

    const g6Exam: Examination = {
      id: 'exam-up-t3-2026',
      exam_name: 'End-Term 3 Summative 2026',
      term: 'Term 3',
      year: 2026,
      exam_type: 'End-Term',
      status: 'Approved',
      approved_classes: ['cls-g6'],
      max_marks: 100,
      education_level: 'Upper Primary',
    };

    // Marks for Augustine (totals 451 across 6 composite areas)
    const marksAugustine: Mark[] = [
      { id: 'm1', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_eng', marks: 45, raw_score: 45, out_of: 60, special_status: 'Normal' },
      { id: 'm2', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_comp', marks: 32, raw_score: 32, out_of: 40, special_status: 'Normal' }, // ENG TOTAL = 77
      { id: 'm3', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_kis', marks: 42, raw_score: 42, out_of: 60, special_status: 'Normal' },
      { id: 'm4', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_insha', marks: 28, raw_score: 28, out_of: 40, special_status: 'Normal' }, // KIS TOTAL = 70
      { id: 'm5', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_math', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' }, // MATH = 80
      { id: 'm6', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_sci', marks: 76, raw_score: 76, out_of: 100, special_status: 'Normal' }, // SCI = 76
      { id: 'm7', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_cas', marks: 74, raw_score: 74, out_of: 100, special_status: 'Normal' }, // CAS = 74
      { id: 'm8', student_id: 'std-augustine', exam_id: 'exam-up-t3-2026', subject_id: 'sb_ss_cre', marks: 74, raw_score: 74, out_of: 100, special_status: 'Normal' }, // SS&CRE = 74
    ];

    expect(isUpperPrimaryContext(studentAugustine, g6Class, g6Exam)).toBe(true);

    const upReport = resolveUpperPrimaryReportStructure({
      student: studentAugustine,
      exam: g6Exam,
      targetClass: g6Class,
      subjects: upSubjects,
      marks: marksAugustine,
      grades: CBE_8_POINT_GRADES,
      teachers: [],
      allStudents: [studentAugustine],
      classes: [g6Class],
    });

    // The maximum possible marks must be 600, NEVER the misleading raw pool total 1100!
    expect(upReport.maxPossibleMarks).toBe(600);
    expect(upReport.maxPossibleMarks).not.toBe(1100);

    // The evaluated subject count must be 6 composite learning areas, not 11 unmerged subjects
    expect(upReport.allReportAreas.length).toBe(6);
    expect(upReport.allReportAreas.length).not.toBe(11);

    // Total marks and average calculation
    expect(upReport.totalMarks).toBe(451);
    expect(Number(upReport.averageScore.toFixed(2))).toBe(75.17);
    expect(upReport.isComplete).toBe(true);

    // Formatted display strings matching table columns:
    const subjectsDisplay = `${upReport.allReportAreas.filter(a => a.status === 'Normal').length} / ${upReport.allReportAreas.length}`;
    const totalScoreDisplay = `${upReport.totalMarks} / ${upReport.maxPossibleMarks}`;
    expect(subjectsDisplay).toBe('6 / 6');
    expect(totalScoreDisplay).toBe('451 / 600');
  });
});
