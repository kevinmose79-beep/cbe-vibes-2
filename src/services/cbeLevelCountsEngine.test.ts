import { describe, it, expect } from 'vitest';
import {
  calculateCbeLevelCounts,
  calculatePrimaryCbeLevelCounts,
  calculateJuniorCbeLevelCounts,
  resolveLearnerStreamName,
  resolveEducationTier,
  PrimaryCbeLevelCountsRow,
  JuniorCbeLevelCountsRow,
} from './cbeLevelCountsEngine';
import { Result, Student, ClassStream, Examination, Subject, Mark, Grade } from '../types';
import { calculateExamResults } from './analysisEngine';

describe('CBE Level Counts Engine (src/services/cbeLevelCountsEngine.ts)', () => {
  const mockClasses: ClassStream[] = [
    { id: 'cls-p6-east', class_name: 'Grade 6', stream: 'East', stream_id: 'str-p6-east', education_level: 'Upper Primary' },
    { id: 'cls-p6-west', class_name: 'Grade 6', stream: 'West', stream_id: 'str-p6-west', education_level: 'Upper Primary' },
    { id: 'cls-p6-north', class_name: 'Grade 6', stream: 'North', stream_id: 'str-p6-north', education_level: 'Upper Primary' },
    { id: 'cls-j8-blue', class_name: 'Grade 8', stream: 'Blue', stream_id: 'str-j8-blue', education_level: 'Junior School' },
    { id: 'cls-j8-green', class_name: 'Grade 8', stream: 'Green', stream_id: 'str-j8-green', education_level: 'Junior School' },
    { id: 'cls-j8-red', class_name: 'Grade 8', stream: 'Red', stream_id: 'str-j8-red', education_level: 'Junior School' },
  ];

  const mockExamPrimary: Examination = {
    id: 'exam-p6-term2',
    exam_name: 'Grade 6 Mid Term 2 2026',
    year: 2026,
    term: 'Term 2',
    start_date: '2026-06-15',
    education_level: 'Upper Primary',
    status: 'Open',
    exam_type: 'Mid-Term',
    max_marks: 100,
    date_created: '2026-06-10',
  };

  const mockExamJunior: Examination = {
    id: 'exam-j8-term2',
    exam_name: 'Grade 8 Mid Term 2 2026',
    year: 2026,
    term: 'Term 2',
    start_date: '2026-06-15',
    education_level: 'Junior School',
    status: 'Open',
    exam_type: 'Mid-Term',
    max_marks: 100,
    date_created: '2026-06-10',
  };

  const createStudent = (id: string, name: string, classId: string, streamId: string, grade = 'Grade 6'): Student => ({
    id,
    admission_number: `ADM-${id}`,
    full_name: name,
    gender: 'M',
    class_id: classId,
    stream_id: streamId,
    active: true,
    grade: grade as any,
  });

  const createResult = (
    studentId: string,
    isComplete: boolean,
    subjectCount: number,
    gradeCode: string,
    totalMarks = 300,
    average = 75,
    examId = 'exam-p6-term2'
  ): Result => ({
    id: `res_${examId}_${studentId}`,
    student_id: studentId,
    exam_id: examId,
    total_marks: totalMarks,
    subject_count: subjectCount,
    average,
    total_points: 10,
    average_points: 3.5,
    grade_code: gradeCode,
    performance_level: gradeCode,
    grade: gradeCode,
    points: isComplete ? 4 : 0,
    position: isComplete ? 1 : 0,
    class_position: isComplete ? 1 : 0,
    stream_position: isComplete ? 1 : 0,
    remarks: isComplete ? 'Good' : 'Provisional',
    is_complete: isComplete,
    status: isComplete ? 'Complete' : 'Provisional',
  });

  // 1. Primary complete learners in EE, ME, AE and BE
  it('1. correctly counts complete Primary learners in EE, ME, AE, and BE', () => {
    const students = [
      createStudent('s1', 'Learner One', 'cls-p6-east', 'str-p6-east'),
      createStudent('s2', 'Learner Two', 'cls-p6-east', 'str-p6-east'),
      createStudent('s3', 'Learner Three', 'cls-p6-east', 'str-p6-east'),
      createStudent('s4', 'Learner Four', 'cls-p6-east', 'str-p6-east'),
    ];

    const results = [
      createResult('s1', true, 5, 'EE', 450, 90),
      createResult('s2', true, 5, 'ME', 375, 75),
      createResult('s3', true, 5, 'AE', 260, 52),
      createResult('s4', true, 5, 'BE', 150, 30),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.stream).toBe('East');
    expect(row.ee).toBe(1);
    expect(row.me).toBe(1);
    expect(row.ae).toBe(1);
    expect(row.be).toBe(1);
    expect(row.provisional).toBe(0);
    expect(row.pending).toBe(0);
    expect(row.totalLearners).toBe(4);
  });

  // 2. Junior complete learners in all eight sublevels
  it('2. correctly counts complete Junior learners in all eight sublevels (EE1 to BE2)', () => {
    const juniorGrades = ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'];
    const students = juniorGrades.map((g, idx) =>
      createStudent(`js_${idx + 1}`, `Learner JS ${g}`, 'cls-j8-blue', 'str-j8-blue', 'Grade 8')
    );

    const results = juniorGrades.map((g, idx) =>
      createResult(`js_${idx + 1}`, true, 9, g, 700 - idx * 50, 85 - idx * 7, mockExamJunior.id)
    );

    const rows = calculateJuniorCbeLevelCounts(results, students, mockClasses, mockExamJunior);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.stream).toBe('Blue');
    expect(row.ee1).toBe(1);
    expect(row.ee2).toBe(1);
    expect(row.me1).toBe(1);
    expect(row.me2).toBe(1);
    expect(row.ae1).toBe(1);
    expect(row.ae2).toBe(1);
    expect(row.be1).toBe(1);
    expect(row.be2).toBe(1);
    expect(row.provisional).toBe(0);
    expect(row.pending).toBe(0);
    expect(row.totalLearners).toBe(8);
  });

  // 3. Provisional learners with some assessed subjects
  it('3. places incomplete learners with subject_count > 0 exclusively in PROVISIONAL', () => {
    const students = [
      createStudent('sp1', 'Prov Student 1', 'cls-p6-east', 'str-p6-east'),
      createStudent('sp2', 'Prov Student 2', 'cls-p6-east', 'str-p6-east'),
    ];

    const results = [
      createResult('sp1', false, 3, 'Prov (ME)', 210, 70),
      createResult('sp2', false, 1, 'Prov (BE)', 35, 35),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.provisional).toBe(2);
    expect(row.pending).toBe(0);
    expect(row.ee).toBe(0);
    expect(row.me).toBe(0);
    expect(row.ae).toBe(0);
    expect(row.be).toBe(0);
    expect(row.totalLearners).toBe(2);
  });

  // 4. Pending learners with no assessed subjects
  it('4. places incomplete learners with subject_count === 0 exclusively in PENDING', () => {
    const students = [
      createStudent('pd1', 'Pending Student 1', 'cls-p6-east', 'str-p6-east'),
      createStudent('pd2', 'Pending Student 2', 'cls-p6-east', 'str-p6-east'),
    ];

    const results = [
      createResult('pd1', false, 0, '-', 0, 0),
      createResult('pd2', false, 0, 'Pending', 0, 0),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.pending).toBe(2);
    expect(row.provisional).toBe(0);
    expect(row.ee).toBe(0);
    expect(row.me).toBe(0);
    expect(row.ae).toBe(0);
    expect(row.be).toBe(0);
    expect(row.totalLearners).toBe(2);
  });

  // 5. Valid zero marks
  it('5. counts learners who sat all subjects and scored 0 as COMPLETE in BE or BE2, NOT Pending', () => {
    const stdPrimary = createStudent('s_zero_p', 'Zero Primary', 'cls-p6-east', 'str-p6-east');
    const resPrimary = createResult('s_zero_p', true, 5, 'BE', 0, 0);

    const primaryRows = calculatePrimaryCbeLevelCounts([resPrimary], [stdPrimary], mockClasses, mockExamPrimary);
    expect(primaryRows[0].be).toBe(1);
    expect(primaryRows[0].pending).toBe(0);
    expect(primaryRows[0].provisional).toBe(0);
    expect(primaryRows[0].totalLearners).toBe(1);

    const stdJunior = createStudent('s_zero_j', 'Zero Junior', 'cls-j8-blue', 'str-j8-blue', 'Grade 8');
    const resJunior = createResult('s_zero_j', true, 9, 'BE2', 0, 0, mockExamJunior.id);

    const juniorRows = calculateJuniorCbeLevelCounts([resJunior], [stdJunior], mockClasses, mockExamJunior);
    expect(juniorRows[0].be2).toBe(1);
    expect(juniorRows[0].pending).toBe(0);
    expect(juniorRows[0].provisional).toBe(0);
    expect(juniorRows[0].totalLearners).toBe(1);
  });

  // 6. X/Y or other incomplete results
  it('6. handles X/Y marks: partial subjects assessed counts as PROVISIONAL, all absent/missing as PENDING', () => {
    const sPartial = createStudent('s_part', 'Partial Student X', 'cls-p6-east', 'str-p6-east');
    const sAllAbsent = createStudent('s_abs', 'All Absent Student Y', 'cls-p6-east', 'str-p6-east');

    // Partial student sat 2 subjects, 3 subjects were X
    const resPartial = createResult('s_part', false, 2, 'Prov (AE)', 105, 52.5);
    // All absent student had all Y, 0 subjects assessed
    const resAllAbsent = createResult('s_abs', false, 0, '-', 0, 0);

    const rows = calculatePrimaryCbeLevelCounts([resPartial, resAllAbsent], [sPartial, sAllAbsent], mockClasses, mockExamPrimary);
    expect(rows[0].provisional).toBe(1);
    expect(rows[0].pending).toBe(1);
    expect(rows[0].totalLearners).toBe(2);
  });

  // 7. Stream grouping and established stream order
  it('7. groups All Streams into separate rows and sorts by established PREFERRED_STREAMS order', () => {
    // East, West, North -> PREFERRED_STREAMS order has East, West, North in that order
    const students = [
      createStudent('sw1', 'West Learner', 'cls-p6-west', 'str-p6-west'),
      createStudent('sn1', 'North Learner', 'cls-p6-north', 'str-p6-north'),
      createStudent('se1', 'East Learner', 'cls-p6-east', 'str-p6-east'),
    ];

    const results = [
      createResult('sw1', true, 5, 'ME'),
      createResult('sn1', true, 5, 'AE'),
      createResult('se1', true, 5, 'EE'),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(3);
    // Order: East -> West -> North
    expect(rows[0].stream).toBe('East');
    expect(rows[0].ee).toBe(1);
    expect(rows[0].totalLearners).toBe(1);

    expect(rows[1].stream).toBe('West');
    expect(rows[1].me).toBe(1);
    expect(rows[1].totalLearners).toBe(1);

    expect(rows[2].stream).toBe('North');
    expect(rows[2].ae).toBe(1);
    expect(rows[2].totalLearners).toBe(1);
  });

  // 8. Historical stream resolution for the exam
  it('8. uses getLearnerClassAtExamTime to resolve historical stream if student was promoted', () => {
    const studentWithPromo: Student = {
      id: 's_promoted',
      admission_number: 'ADM-PROMO',
      full_name: 'Promoted Learner',
      gender: 'M',
      // Current live class is Grade 7 Blue in 2027
      class_id: 'cls-j7-blue',
      stream_id: 'str-j7-blue',
      active: true,
      grade: 'Grade 7',
      promotion_history: [
        {
          id: 'pr-1',
          student_id: 's_promoted',
          from_class_id: 'cls-p6-west',
          from_grade: 'Grade 6',
          to_class_id: 'cls-j7-blue',
          to_grade: 'Grade 7',
          academic_year_id: 'ay-2027',
          date_promoted: '2027-01-05',
        },
      ],
    };

    // The exam took place in June 2026, before the Jan 2027 promotion
    const result = createResult('s_promoted', true, 5, 'EE');

    const rows = calculatePrimaryCbeLevelCounts([result], [studentWithPromo], mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    // Must be resolved to historical class cls-p6-west -> stream West
    expect(rows[0].stream).toBe('West');
    expect(rows[0].ee).toBe(1);
    expect(rows[0].totalLearners).toBe(1);
  });

  // 9. Single-stream cohort isolation (contract: pre-filtered cohort supplied by caller)
  it('9. calculates and reconciles a pre-filtered single-stream cohort correctly', () => {
    // The caller/exporter passes a cohort that contains only the selected stream (East)
    const students = [
      createStudent('s_e1', 'East One', 'cls-p6-east', 'str-p6-east'),
      createStudent('s_e2', 'East Two', 'cls-p6-east', 'str-p6-east'),
    ];

    const results = [
      createResult('s_e1', true, 5, 'ME'),
      createResult('s_e2', true, 5, 'BE'),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    expect(rows[0].stream).toBe('East');
    expect(rows[0].me).toBe(1);
    expect(rows[0].be).toBe(1);
    expect(rows[0].totalLearners).toBe(2);
  });

  // 10. Every learner counted exactly once
  it('10. ensures every learner in results is counted exactly once', () => {
    const students = [
      createStudent('l1', 'Learner 1', 'cls-p6-east', 'str-p6-east'),
      createStudent('l2', 'Learner 2', 'cls-p6-east', 'str-p6-east'),
      createStudent('l3', 'Learner 3', 'cls-p6-east', 'str-p6-east'),
      createStudent('l4', 'Learner 4', 'cls-p6-east', 'str-p6-east'),
      createStudent('l5', 'Learner 5', 'cls-p6-east', 'str-p6-east'),
      createStudent('l6', 'Learner 6', 'cls-p6-east', 'str-p6-east'),
    ];

    const results = [
      createResult('l1', true, 5, 'EE'),
      createResult('l2', true, 5, 'ME'),
      createResult('l3', true, 5, 'AE'),
      createResult('l4', true, 5, 'BE'),
      createResult('l5', false, 3, 'Prov (ME)'),
      createResult('l6', false, 0, '-'),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const categorySum = row.ee + row.me + row.ae + row.be + row.provisional + row.pending;
    expect(categorySum).toBe(6);
    expect(row.totalLearners).toBe(6);
  });

  // 11. Unsupported grade code and missing student errors
  it('11. throws a descriptive error for unsupported grade code or missing student', () => {
    const std = createStudent('s_bad', 'Bad Grade Learner', 'cls-p6-east', 'str-p6-east');
    const resBadGrade = createResult('s_bad', true, 5, 'INVALID_GRADE');

    expect(() => {
      calculatePrimaryCbeLevelCounts([resBadGrade], [std], mockClasses, mockExamPrimary);
    }).toThrowError(/Unsupported grade code "INVALID_GRADE"/);

    // Missing student
    expect(() => {
      calculatePrimaryCbeLevelCounts([createResult('nonexistent', true, 5, 'EE')], [], mockClasses, mockExamPrimary);
    }).toThrowError(/Unable to resolve student/);
  });

  // 12. Duplicate or inconsistent result handling
  it('12. throws when duplicate student results or inconsistent status fields are detected', () => {
    const std = createStudent('s_dup', 'Dup Student', 'cls-p6-east', 'str-p6-east');
    const res1 = createResult('s_dup', true, 5, 'EE');
    const res2 = createResult('s_dup', true, 5, 'ME');

    // Duplicate detection
    expect(() => {
      calculatePrimaryCbeLevelCounts([res1, res2], [std], mockClasses, mockExamPrimary);
    }).toThrowError(/Duplicate result found for student ID "s_dup"/);

    // Inconsistent: is_complete=true but subject_count=0
    const resInconsistent1 = createResult('s_dup', true, 0, 'EE');
    expect(() => {
      calculatePrimaryCbeLevelCounts([resInconsistent1], [std], mockClasses, mockExamPrimary);
    }).toThrowError(/marked is_complete=true but subject_count is 0/);

    // Inconsistent: is_complete=false but status='Complete'
    const resInconsistent2: Result = {
      ...createResult('s_dup', false, 3, 'Prov (ME)'),
      status: 'Complete',
    };
    expect(() => {
      calculatePrimaryCbeLevelCounts([resInconsistent2], [std], mockClasses, mockExamPrimary);
    }).toThrowError(/is_complete is false but status='Complete'/);
  });

  // 13. Reconciliation of category totals with each stream's learner count and results.length
  it('13. reconciles category totals with totalLearners and results.length across multiple streams', () => {
    const students = [
      createStudent('m_e1', 'East 1', 'cls-p6-east', 'str-p6-east'),
      createStudent('m_e2', 'East 2', 'cls-p6-east', 'str-p6-east'),
      createStudent('m_w1', 'West 1', 'cls-p6-west', 'str-p6-west'),
      createStudent('m_w2', 'West 2', 'cls-p6-west', 'str-p6-west'),
      createStudent('m_w3', 'West 3', 'cls-p6-west', 'str-p6-west'),
      createStudent('m_n1', 'North 1', 'cls-p6-north', 'str-p6-north'),
    ];

    const results = [
      createResult('m_e1', true, 5, 'EE'),
      createResult('m_e2', false, 2, 'Prov (ME)'),
      createResult('m_w1', true, 5, 'ME'),
      createResult('m_w2', true, 5, 'AE'),
      createResult('m_w3', false, 0, '-'),
      createResult('m_n1', true, 5, 'BE'),
    ];

    const rows = calculatePrimaryCbeLevelCounts(results, students, mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(3);

    const eastRow = rows.find((r) => r.stream === 'East')!;
    expect(eastRow.ee + eastRow.me + eastRow.ae + eastRow.be + eastRow.provisional + eastRow.pending).toBe(eastRow.totalLearners);
    expect(eastRow.totalLearners).toBe(2);

    const westRow = rows.find((r) => r.stream === 'West')!;
    expect(westRow.ee + westRow.me + westRow.ae + westRow.be + westRow.provisional + westRow.pending).toBe(westRow.totalLearners);
    expect(westRow.totalLearners).toBe(3);

    const northRow = rows.find((r) => r.stream === 'North')!;
    expect(northRow.ee + northRow.me + northRow.ae + northRow.be + northRow.provisional + northRow.pending).toBe(northRow.totalLearners);
    expect(northRow.totalLearners).toBe(1);

    const totalAllStreams = rows.reduce((acc, r) => acc + r.totalLearners, 0);
    expect(totalAllStreams).toBe(results.length);
  });

  // Universal dispatch test
  it('14. calculateCbeLevelCounts dispatches to Primary or Junior based on eduLevel or grade', () => {
    const stdPrimary = createStudent('sp', 'Primary Learner', 'cls-p6-east', 'str-p6-east');
    const resPrimary = createResult('sp', true, 5, 'EE');

    const primaryOut = calculateCbeLevelCounts([resPrimary], [stdPrimary], mockClasses, 'Upper Primary', mockExamPrimary) as PrimaryCbeLevelCountsRow[];
    expect(primaryOut[0]).toHaveProperty('ee');
    expect(primaryOut[0]).not.toHaveProperty('ee1');

    const stdJunior = createStudent('sj', 'Junior Learner', 'cls-j8-blue', 'str-j8-blue', 'Grade 8');
    const resJunior = createResult('sj', true, 9, 'EE1', 800, 88, mockExamJunior.id);

    const juniorOut = calculateCbeLevelCounts([resJunior], [stdJunior], mockClasses, 'Junior School', mockExamJunior) as JuniorCbeLevelCountsRow[];
    expect(juniorOut[0]).toHaveProperty('ee1');
    expect(juniorOut[0]).not.toHaveProperty('ee');
  });

  // 15. Historical class resolution when the student's current class appears earlier in the classes array
  it('15. resolves historical stream correctly when current promoted class appears earlier in classes array', () => {
    // Class array with promoted class (Grade 7 Blue) placed BEFORE historical class (Grade 6 East)
    const classesOrdered: ClassStream[] = [
      { id: 'cls-j7-blue', class_name: 'Grade 7', stream: 'Blue', stream_id: 'str-j7-blue', education_level: 'Junior School' },
      { id: 'cls-p6-east', class_name: 'Grade 6', stream: 'East', stream_id: 'str-p6-east', education_level: 'Upper Primary' },
    ];

    const student: Student = {
      id: 's_promoted_earlier',
      admission_number: 'ADM-EARLIER',
      full_name: 'Promoted Student Earlier',
      gender: 'M',
      class_id: 'cls-j7-blue',
      stream_id: 'str-j7-blue',
      active: true,
      grade: 'Grade 7',
      promotion_history: [
        {
          id: 'pr-early',
          student_id: 's_promoted_earlier',
          from_class_id: 'cls-p6-east',
          from_grade: 'Grade 6',
          to_class_id: 'cls-j7-blue',
          to_grade: 'Grade 7',
          academic_year_id: 'ay-2027',
          date_promoted: '2027-01-05',
        },
      ],
    };

    // June 2026 exam -> historical class is Grade 6 East
    const resolvedStream = resolveLearnerStreamName(student, classesOrdered, mockExamPrimary);
    expect(resolvedStream).toBe('East');

    const result = createResult('s_promoted_earlier', true, 5, 'EE');
    const rows = calculatePrimaryCbeLevelCounts([result], [student], classesOrdered, mockExamPrimary);
    expect(rows).toHaveLength(1);
    expect(rows[0].stream).toBe('East');
  });

  // 16. Unresolved historical context returns '-' rather than leaking the live stream
  it('16. returns "-" for stream when historical context exists but is unresolved, without leaking live stream', () => {
    // Two Grade 6 streams exist, but promotion history only recorded from_grade: 'Grade 6' without from_class_id
    const studentWithAmbiguity: Student = {
      id: 's_ambig',
      admission_number: 'ADM-AMBIG',
      full_name: 'Ambiguous Promo Student',
      gender: 'F',
      class_id: 'cls-j8-blue',
      stream_id: 'str-j8-blue',
      active: true,
      grade: 'Grade 8',
      promotion_history: [
        {
          id: 'pr-ambig',
          student_id: 's_ambig',
          from_grade: 'Grade 6', // No from_class_id and multiple Grade 6 streams exist -> unresolved
          to_grade: 'Grade 8',
          to_class_id: 'cls-j8-blue',
          date_promoted: '2027-01-05',
        },
      ],
    };

    const resolvedStream = resolveLearnerStreamName(studentWithAmbiguity, mockClasses, mockExamPrimary);
    // Must return '-' matching the standard PDF exporter, NOT the live stream 'Blue'
    expect(resolvedStream).toBe('-');

    const result = createResult('s_ambig', true, 5, 'ME');
    const rows = calculatePrimaryCbeLevelCounts([result], [studentWithAmbiguity], mockClasses, mockExamPrimary);
    expect(rows).toHaveLength(1);
    expect(rows[0].stream).toBe('-');
    expect(rows[0].me).toBe(1);
  });

  // 17. Missing or unstreamed class records do not crash and resolve to '-'
  it('17. handles missing class records and unstreamed classes safely without crashing', () => {
    // Unstreamed class (e.g. PP1 or single-stream school with stream: '')
    const unstreamedClasses: ClassStream[] = [
      { id: 'cls-pp1', class_name: 'PP1', stream: '', education_level: 'Pre-Primary' },
    ];
    const stdUnstreamed: Student = {
      id: 's_unstreamed',
      admission_number: 'ADM-UNSTR',
      full_name: 'Unstreamed Learner',
      gender: 'M',
      class_id: 'cls-pp1',
      active: true,
      grade: 'PP1',
    };
    expect(resolveLearnerStreamName(stdUnstreamed, unstreamedClasses, null)).toBe('-');

    // Learner with unmapped class_id
    const stdOrphan: Student = {
      id: 's_orphan',
      admission_number: 'ADM-ORPHAN',
      full_name: 'Orphan Learner',
      gender: 'F',
      class_id: 'cls-deleted-or-missing',
      active: true,
      grade: 'Grade 6',
    };
    expect(resolveLearnerStreamName(stdOrphan, mockClasses, null)).toBe('-');

    const resOrphan = createResult('s_orphan', true, 5, 'BE');
    const rows = calculatePrimaryCbeLevelCounts([resOrphan], [stdOrphan], mockClasses, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].stream).toBe('-');
    expect(rows[0].be).toBe(1);
  });

  // 18. Real calculateExamResults output integration test
  it('18. processes genuine calculateExamResults output accurately with all levels and reconciliation', () => {
    const examE2E: Examination = {
      id: 'exam-e2e-real',
      exam_name: 'Grade 8 End-Term 2 2026',
      year: 2026,
      term: 'Term 2',
      start_date: '2026-06-15',
      education_level: 'Junior School',
      status: 'Open',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const subjectMath: Subject = {
      id: 'sb-js-math',
      subject_name: 'Mathematics',
      subject_code: 'MATH',
      category: 'Core',
      education_level: 'Junior School',
    };

    const grades: Grade[] = [
      { id: 'g-ee1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 8, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
      { id: 'g-me1', grade_code: 'ME1', performance_level: 'ME', minimum_score: 60, maximum_score: 74, points: 6, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
      { id: 'g-ae1', grade_code: 'AE1', performance_level: 'AE', minimum_score: 30, maximum_score: 40, points: 4, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
      { id: 'g-be2', grade_code: 'BE2', performance_level: 'BE', minimum_score: 0, maximum_score: 10, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
    ];

    const e2eStudents: Student[] = [
      createStudent('real_1', 'Alice High', 'cls-j8-blue', 'str-j8-blue', 'Grade 8'),
      createStudent('real_2', 'Bob Medium', 'cls-j8-blue', 'str-j8-blue', 'Grade 8'),
      createStudent('real_3', 'Charlie Absent', 'cls-j8-blue', 'str-j8-blue', 'Grade 8'),
    ];

    const marks: Mark[] = [
      { id: 'm-1', student_id: 'real_1', subject_id: 'sb-js-math', exam_id: examE2E.id, marks: 95, percentage: 95, out_of: 100, status: 'Normal' },
      { id: 'm-2', student_id: 'real_2', subject_id: 'sb-js-math', exam_id: examE2E.id, marks: 68, percentage: 68, out_of: 100, status: 'Normal' },
      // Charlie has no marks -> subject_count = 0, is_complete = false -> Pending
    ];

    // Generate genuine results from real calculation engine
    const genuineResults = calculateExamResults(
      examE2E.id,
      e2eStudents,
      marks,
      grades,
      mockClasses,
      [subjectMath],
      examE2E
    );

    expect(genuineResults).toHaveLength(3);

    const counts = calculateJuniorCbeLevelCounts(genuineResults, e2eStudents, mockClasses, examE2E);
    expect(counts).toHaveLength(1);
    const blueRow = counts[0];
    expect(blueRow.stream).toBe('Blue');
    expect(blueRow.ee1).toBe(1);
    expect(blueRow.me1).toBe(1);
    expect(blueRow.pending).toBe(1);
    expect(blueRow.provisional).toBe(0);
    expect(blueRow.totalLearners).toBe(3);
  });
});
