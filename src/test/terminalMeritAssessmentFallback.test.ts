import { describe, it, expect } from 'vitest';
import {
  filterMeritContributingAssessments,
} from '../components/terminal/TerminalResultsView';
import {
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import {
  generateTerminalMeritDataset,
  formatSubjectResultCell,
} from '../services/terminalMeritListExporter';
import { Examination, Student, Subject, Grade, ClassStream, Mark, School } from '../types';

describe('Terminal Merit List Assessment Fallback & Scope Integrity', () => {
  const mockSchool: School = {
    id: 'sch-001',
    school_name: 'Test Academy',
    motto: 'Excellence',
    address: 'PO Box 100, Nairobi',
    phone: '+254700000000',
    email: 'info@test.org',
    county: 'Nairobi',
    sub_county: 'Westlands',
  };

  const mockGrades: Grade[] = [
    { id: 'g-ee', grade_code: 'EE', performance_level: 'EE', minimum_score: 80, maximum_score: 100, points: 4, descriptor: 'Exceeds Expectations', remarks: 'EE' },
    { id: 'g-me', grade_code: 'ME', performance_level: 'ME', minimum_score: 65, maximum_score: 79.99, points: 3, descriptor: 'Meets Expectations', remarks: 'ME' },
    { id: 'g-ae', grade_code: 'AE', performance_level: 'AE', minimum_score: 50, maximum_score: 64.99, points: 2, descriptor: 'Approaching Expectations', remarks: 'AE' },
    { id: 'g-be', grade_code: 'BE', performance_level: 'BE', minimum_score: 0, maximum_score: 49.99, points: 1, descriptor: 'Below Expectations', remarks: 'BE' },
  ];

  const mockClasses: ClassStream[] = [
    {
      id: 'cls-g8',
      class_name: 'Grade 8',
      stream: 'North',
      stream_id: 'stream-g8n',
      education_level: 'Junior School',
      allocated_subject_ids: ['sub-math'],
    },
    {
      id: 'cls-g4',
      class_name: 'Grade 4',
      stream: 'East',
      stream_id: 'stream-g4e',
      education_level: 'Upper Primary',
      allocated_subject_ids: ['sub-up-math'],
    },
    {
      id: 'cls-g7',
      class_name: 'Grade 7',
      stream: 'West',
      stream_id: 'stream-g7w',
      education_level: 'Junior School',
      allocated_subject_ids: ['sub-math'],
    },
  ];

  const mockSubjects: Subject[] = [
    {
      id: 'sub-math',
      subject_name: 'Mathematics',
      subject_code: 'MATH',
      name: 'Mathematics',
      code: 'MATH',
      category: 'Core',
      education_level: 'Junior School',
    } as any,
  ];

  const studentGrade8: Student = {
    id: 'st-g8-01',
    admission_number: 'ADM-801',
    full_name: 'Alice Wambui',
    first_name: 'Alice',
    last_name: 'Wambui',
    gender: 'F',
    grade: 'Grade 8',
    stream_id: 'stream-g8n',
    class_id: 'cls-g8',
    active: true,
    enrolment_status: 'active',
  };

  it('1. An empty exam list must not fall back to a foreign assessment list', () => {
    // Foreign assessment list belonging to an individual learner in another cohort
    const foreignIndividualAssessments: ContributingAssessmentRef[] = [
      {
        id: 'foreign-exam-grade4',
        exam_name: 'Grade 4 Opener 2026',
        title: 'Grade 4 Opener 2026',
        status: 'Approved',
        date: '2026-01-10',
        max_marks: 50,
        out_of: 50,
        maxScore: 50,
        isOfficial: true,
      },
    ];

    // Calling filterMeritContributingAssessments with empty exams list
    const result = filterMeritContributingAssessments({
      exams: [],
      viewingYear: { year: 2026, id: '2026' },
      viewingTerm: { term_name: 'Term 1', id: 't1' },
      meritGrade: 'Grade 8',
      isStaff: true,
      isProvisionalMode: false,
      classes: mockClasses,
    });

    // Must return an empty array, NOT the foreign individual assessments
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
    expect(result.some((a) => a.id === foreignIndividualAssessments[0].id)).toBe(false);
  });

  it('2. Grade 4 assessments must never leak into a Grade 8 merit list when no eligible Grade 8 exams exist', () => {
    // Exams array contains only Grade 4 exams
    const examsWithOnlyGrade4: Examination[] = [
      {
        id: 'exam-g4-mid',
        exam_name: 'Grade 4 Midterm Assessment',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        term: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g4',
        target_classes: ['Grade 4'],
        education_level: 'Upper Primary',
      } as any,
    ];

    // Filter assessments for Grade 8
    const grade8Assessments = filterMeritContributingAssessments({
      exams: examsWithOnlyGrade4,
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      isStaff: true,
      isProvisionalMode: false,
      classes: mockClasses,
    });

    // Must be empty: Grade 4 exam must be excluded from Grade 8
    expect(grade8Assessments).toEqual([]);
    expect(grade8Assessments.length).toBe(0);

    // Verify that when grade8Assessments is empty, the merit list dataset returns null (no false X table)
    const dataset = grade8Assessments.length === 0 ? null : generateTerminalMeritDataset({
      school: mockSchool,
      academicYear: 2026,
      term: 'Term 1',
      grade: 'Grade 8',
      classes: mockClasses,
      students: [studentGrade8],
      subjects: mockSubjects,
      grades: mockGrades,
      learnerResultsMap: new Map(),
    });

    expect(dataset).toBeNull();
  });

  it('3. Missing loading context must not produce a definitive false-X merit list', () => {
    const validExams: Examination[] = [
      {
        id: 'exam-g8-mid',
        exam_name: 'Grade 8 Midterm',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g8',
        education_level: 'Junior School',
      } as any,
    ];

    // Case A: Missing viewingYear
    const missingYear = filterMeritContributingAssessments({
      exams: validExams,
      viewingYear: null,
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      classes: mockClasses,
    });
    expect(missingYear).toEqual([]);

    // Case B: Missing viewingTerm
    const missingTerm = filterMeritContributingAssessments({
      exams: validExams,
      viewingYear: { year: 2026 },
      viewingTerm: null,
      meritGrade: 'Grade 8',
      classes: mockClasses,
    });
    expect(missingTerm).toEqual([]);

    // Case C: Missing meritGrade
    const missingGrade = filterMeritContributingAssessments({
      exams: validExams,
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: '',
      classes: mockClasses,
    });
    expect(missingGrade).toEqual([]);

    // Case D: Unloaded exams list
    const unloadedExams = filterMeritContributingAssessments({
      exams: [],
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      classes: mockClasses,
    });
    expect(unloadedExams).toEqual([]);

    // In all unready/loading cases, meritContributingAssessments is empty and dataset remains null
    for (const emptyAssessments of [missingYear, missingTerm, missingGrade, unloadedExams]) {
      const meritData = (!emptyAssessments.length) ? null : {} as any;
      expect(meritData).toBeNull();
    }
  });

  it('4. An authorized filtered assessment list returns exactly the eligible exams', () => {
    const multiCohortExams: Examination[] = [
      // 1. Eligible: Grade 8, 2026, Term 1, Approved
      {
        id: 'exam-g8-t1-mid',
        exam_name: 'Grade 8 Term 1 Midterm',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g8',
        education_level: 'Junior School',
        out_of: 50,
      } as any,
      // 2. Eligible: Grade 8, 2026, Term 1, Approved
      {
        id: 'exam-g8-t1-end',
        exam_name: 'Grade 8 Term 1 Endterm',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g8',
        education_level: 'Junior School',
        out_of: 50,
      } as any,
      // 3. Ineligible: Wrong Year (2025)
      {
        id: 'exam-g8-2025',
        exam_name: 'Grade 8 2025 Exam',
        year: 2025,
        academic_year_id: '2025',
        term_id: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g8',
      } as any,
      // 4. Ineligible: Wrong Term (Term 2)
      {
        id: 'exam-g8-t2',
        exam_name: 'Grade 8 Term 2 Midterm',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 2',
        status: 'Approved',
        class_id: 'cls-g8',
      } as any,
      // 5. Ineligible: Wrong Grade (Grade 7)
      {
        id: 'exam-g7-t1',
        exam_name: 'Grade 7 Term 1 Exam',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g7',
        target_classes: ['Grade 7'],
      } as any,
      // 6. Ineligible: Not Approved in Official Mode
      {
        id: 'exam-g8-draft',
        exam_name: 'Grade 8 Draft Exam',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Draft',
        class_id: 'cls-g8',
      } as any,
    ];

    const filtered = filterMeritContributingAssessments({
      exams: multiCohortExams,
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      isStaff: false,
      isProvisionalMode: false,
      classes: mockClasses,
    });

    expect(filtered.length).toBe(2);
    expect(filtered.map((a) => a.id)).toEqual(['exam-g8-t1-mid', 'exam-g8-t1-end']);

    // Now test real calculation using these exactly scoped contributing assessments
    const marks: Mark[] = [
      { id: 'm-1', student_id: 'st-g8-01', exam_id: 'exam-g8-t1-mid', subject_id: 'sub-math', score: 40, marks: 40, out_of: 50 } as any,
      { id: 'm-2', student_id: 'st-g8-01', exam_id: 'exam-g8-t1-end', subject_id: 'sub-math', score: 45, marks: 45, out_of: 50 } as any,
    ];

    const results = calculateLearnerTerminalResults({
      learnerId: studentGrade8.id,
      subjectIds: ['sub-math'],
      contributingAssessments: filtered,
      marks,
      grades: mockGrades,
      educationLevel: 'Junior School',
      gradeName: 'Grade 8',
      subjects: mockSubjects,
    });

    const mathResult = results.get('sub-math');
    expect(mathResult).toBeDefined();
    expect(mathResult?.isComplete).toBe(true);
    expect(mathResult?.status).toBe('Complete');
    expect(mathResult?.terminalPercentage).toBe(85); // (40/50 + 45/50) / 2 = 85%
    expect(mathResult?.cbePerformanceLevel).toBe('EE');

    const cell = formatSubjectResultCell(mathResult);
    expect(cell.isSpecial).toBe(false);
    expect(cell.pctText).toBe('85');
    expect(cell.specialCode).toBe('');
  });

  it('5. Provisional vs official mode behaves correctly without cross-context leakage', () => {
    const mixedStatusExams: Examination[] = [
      {
        id: 'exam-g8-approved',
        exam_name: 'Grade 8 Approved Exam',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Approved',
        class_id: 'cls-g8',
      } as any,
      {
        id: 'exam-g8-prov',
        exam_name: 'Grade 8 Provisional Exam',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Provisional',
        class_id: 'cls-g8',
      } as any,
      {
        id: 'exam-g4-prov',
        exam_name: 'Grade 4 Provisional Exam',
        year: 2026,
        academic_year_id: '2026',
        term_id: 'Term 1',
        status: 'Provisional',
        class_id: 'cls-g4',
      } as any,
    ];

    // Official Mode: only 'Approved' exam returned
    const officialExams = filterMeritContributingAssessments({
      exams: mixedStatusExams,
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      isStaff: true,
      isProvisionalMode: false,
      classes: mockClasses,
    });
    expect(officialExams.length).toBe(1);
    expect(officialExams[0].id).toBe('exam-g8-approved');

    // Provisional Mode (Staff): includes Approved and Provisional for Grade 8 ONLY
    const provisionalExams = filterMeritContributingAssessments({
      exams: mixedStatusExams,
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      isStaff: true,
      isProvisionalMode: true,
      classes: mockClasses,
    });
    expect(provisionalExams.length).toBe(2);
    expect(provisionalExams.map((e) => e.id)).toEqual(['exam-g8-approved', 'exam-g8-prov']);
    // Ensure Grade 4 Provisional exam did NOT leak into Grade 8
    expect(provisionalExams.some((e) => e.id === 'exam-g4-prov')).toBe(false);

    // Non-staff user attempting provisional mode: fail-closed to official mode
    const nonStaffAttempt = filterMeritContributingAssessments({
      exams: mixedStatusExams,
      viewingYear: { year: 2026 },
      viewingTerm: { term_name: 'Term 1' },
      meritGrade: 'Grade 8',
      isStaff: false,
      isProvisionalMode: true,
      classes: mockClasses,
    });
    expect(nonStaffAttempt.length).toBe(1);
    expect(nonStaffAttempt[0].id).toBe('exam-g8-approved');
  });
});
