import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import {
  generateTerminalMeritDataset,
  formatSubjectResultCell,
} from '../services/terminalMeritListExporter';
import { Student, Subject, Grade, ClassStream, Mark, School } from '../types';

describe('Terminal Merit List Assessment Scope & False X Fix', () => {
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
      id: 'cls-g7',
      class_name: 'Grade 7',
      stream: 'A',
      stream_id: 'stream-g7a',
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

  const studentA: Student = {
    id: 'st-01',
    admission_number: 'ADM-001',
    full_name: 'Jane Doe',
    first_name: 'Jane',
    last_name: 'Doe',
    gender: 'F',
    grade: 'Grade 7',
    stream_id: 'stream-g7a',
    class_id: 'cls-g7',
    active: true,
    enrolment_status: 'active',
  };

  const studentB: Student = {
    id: 'st-02',
    admission_number: 'ADM-002',
    full_name: 'John Smith',
    first_name: 'John',
    last_name: 'Smith',
    gender: 'M',
    grade: 'Grade 7',
    stream_id: 'stream-g7a',
    class_id: 'cls-g7',
    active: true,
    enrolment_status: 'active',
  };

  // Term 2 official contributing assessments
  const term2ContributingAssessments: ContributingAssessmentRef[] = [
    { id: 'exam-t2-mid', exam_name: 'Term 2 Midterm', status: 'Approved', out_of: 50, max_marks: 50, isOfficial: true } as any,
    { id: 'exam-t2-end', exam_name: 'Term 2 Endterm', status: 'Approved', out_of: 50, max_marks: 50, isOfficial: true } as any,
  ];

  it('1. Verifies that source code does not contain unsafe combinedMarks expansion loop', () => {
    const viewPath = path.resolve(__dirname, '../components/terminal/TerminalResultsView.tsx');
    const content = fs.readFileSync(viewPath, 'utf8');

    // Ensure the old unsafe loop that pushed matchedExam to effectiveContributing is absent
    expect(content).not.toMatch(/for\s*\(\s*const\s+m\s+of\s+combinedMarks\s*\)\s*\{[\s\S]*?effectiveContributing\.push/);
    // Ensure effectiveContributing uses meritContributingAssessments directly
    expect(content).toContain('const effectiveContributing = meritContributingAssessments;');
  });

  it('2. Prevents unrelated assessment leakage: learner with marks for required assessments receives valid results (NO false X) even when historical marks exist', () => {
    // Both learners have Term 2 marks. Student A also has an old Term 1 mark from another exam.
    // In the old broken code, that old Term 1 exam ID was injected into effectiveContributing,
    // which caused Student B to receive 'X' because Student B had no marks for the old Term 1 exam!
    const marks: Mark[] = [
      // Student A marks for Term 2
      { id: 'm-1', student_id: 'st-01', exam_id: 'exam-t2-mid', subject_id: 'sub-math', score: 40, marks: 40, out_of: 50 } as any,
      { id: 'm-2', student_id: 'st-01', exam_id: 'exam-t2-end', subject_id: 'sub-math', score: 45, marks: 45, out_of: 50 } as any,
      // Student A historical mark from Term 1 (unrelated exam!)
      { id: 'm-3', student_id: 'st-01', exam_id: 'exam-t1-opener-unrelated', subject_id: 'sub-math', score: 35, marks: 35, out_of: 50 } as any,

      // Student B marks for Term 2 (complete for Term 2!)
      { id: 'm-4', student_id: 'st-02', exam_id: 'exam-t2-mid', subject_id: 'sub-math', score: 38, marks: 38, out_of: 50 } as any,
      { id: 'm-5', student_id: 'st-02', exam_id: 'exam-t2-end', subject_id: 'sub-math', score: 42, marks: 42, out_of: 50 } as any,
    ];

    // Authoritative scoped contributing assessments are ONLY Term 2 assessments
    const effectiveContributing = term2ContributingAssessments;

    // Compute Student B's results
    const studentBMarks = marks.filter((m) => m.student_id === 'st-02');
    const studentBResults = calculateLearnerTerminalResults({
      learnerId: studentB.id,
      subjectIds: ['sub-math'],
      contributingAssessments: effectiveContributing,
      marks: studentBMarks,
      grades: mockGrades,
      educationLevel: 'Junior School',
      gradeName: 'Grade 7',
      subjects: mockSubjects,
    });

    const mathResultB = studentBResults.get('sub-math');
    expect(mathResultB).toBeDefined();
    // Student B has both Term 2 assessments completed -> MUST be complete and NOT 'X'
    expect(mathResultB?.isComplete).toBe(true);
    expect(mathResultB?.status).toBe('Complete');
    expect(mathResultB?.terminalPercentage).toBe(80); // (38/50 + 42/50) / 2 = 80%

    // Formatted cell must NOT be special X
    const cellB = formatSubjectResultCell(mathResultB);
    expect(cellB.isSpecial).toBe(false);
    expect(cellB.pctText).toBe('80');
    expect(cellB.specialCode).toBe('');

    // Compute Student A's results
    const studentAMarks = marks.filter((m) => m.student_id === 'st-01');
    const studentAResults = calculateLearnerTerminalResults({
      learnerId: studentA.id,
      subjectIds: ['sub-math'],
      contributingAssessments: effectiveContributing,
      marks: studentAMarks,
      grades: mockGrades,
      educationLevel: 'Junior School',
      gradeName: 'Grade 7',
      subjects: mockSubjects,
    });

    const mathResultA = studentAResults.get('sub-math');
    expect(mathResultA).toBeDefined();
    expect(mathResultA?.isComplete).toBe(true);
    expect(mathResultA?.status).toBe('Complete');
    expect(mathResultA?.terminalPercentage).toBe(85); // (40/50 + 45/50) / 2 = 85%
    const cellA = formatSubjectResultCell(mathResultA);
    expect(cellA.isSpecial).toBe(false);
    expect(cellA.pctText).toBe('85');
    expect(cellA.specialCode).toBe('');
  });

  it('3. Preserves T-09: A learner missing a genuinely required assessment STILL receives X', () => {
    // Student C only did Midterm, missing Endterm
    const studentCMarks: Mark[] = [
      { id: 'm-c1', student_id: 'st-03', exam_id: 'exam-t2-mid', subject_id: 'sub-math', score: 40, marks: 40, out_of: 50 } as any,
    ];

    const results = calculateLearnerTerminalResults({
      learnerId: 'st-03',
      subjectIds: ['sub-math'],
      contributingAssessments: term2ContributingAssessments,
      marks: studentCMarks,
      grades: mockGrades,
      educationLevel: 'Junior School',
      gradeName: 'Grade 7',
      subjects: mockSubjects,
    });

    const mathResult = results.get('sub-math');
    expect(mathResult).toBeDefined();
    // Missing Endterm -> must be incomplete and status INCOMPLETE (X)
    expect(mathResult?.isComplete).toBe(false);
    expect(mathResult?.status).toBe('INCOMPLETE (X)');
    expect(mathResult?.terminalPercentage).toBeNull();

    const cell = formatSubjectResultCell(mathResult);
    expect(cell.isSpecial).toBe(true);
    expect(cell.pctText).toBe('X');
    expect(cell.specialCode).toBe('X');
  });

  it('4. Full merit dataset generation displays valid scores and rankings without false X', () => {
    const marks: Mark[] = [
      { id: 'm-1', student_id: 'st-01', exam_id: 'exam-t2-mid', subject_id: 'sub-math', score: 40, marks: 40, out_of: 50 } as any,
      { id: 'm-2', student_id: 'st-01', exam_id: 'exam-t2-end', subject_id: 'sub-math', score: 45, marks: 45, out_of: 50 } as any,
      { id: 'm-3', student_id: 'st-01', exam_id: 'exam-t1-opener-unrelated', subject_id: 'sub-math', score: 35, marks: 35, out_of: 50 } as any,
      { id: 'm-4', student_id: 'st-02', exam_id: 'exam-t2-mid', subject_id: 'sub-math', score: 38, marks: 38, out_of: 50 } as any,
      { id: 'm-5', student_id: 'st-02', exam_id: 'exam-t2-end', subject_id: 'sub-math', score: 42, marks: 42, out_of: 50 } as any,
    ];

    const learnerResultsMap = new Map();
    for (const st of [studentA, studentB]) {
      const stMarks = marks.filter((m) => m.student_id === st.id);
      const res = calculateLearnerTerminalResults({
        learnerId: st.id,
        subjectIds: ['sub-math'],
        contributingAssessments: term2ContributingAssessments,
        marks: stMarks,
        grades: mockGrades,
        educationLevel: 'Junior School',
        gradeName: 'Grade 7',
        subjects: mockSubjects,
      });
      learnerResultsMap.set(st.id, res);
    }

    const dataset = generateTerminalMeritDataset({
      school: mockSchool,
      academicYear: 2026,
      term: 'Term 2',
      grade: 'Grade 7',
      selectedStreamId: 'stream-g7a',
      classes: mockClasses,
      students: [studentA, studentB],
      subjects: mockSubjects,
      teachers: [],
      grades: mockGrades,
      isProvisionalMode: false,
      learnerResultsMap,
    });

    expect(dataset.learners.length).toBe(2);
    for (const learnerRow of dataset.learners) {
      expect(learnerRow.isRankable).toBe(true);
      const mathRes = learnerRow.subjectResults.get('sub-math');
      expect(mathRes).toBeDefined();
      expect(mathRes?.isComplete).toBe(true);
      const cell = formatSubjectResultCell(mathRes);
      expect(cell.isSpecial).toBe(false);
      expect(cell.pctText).not.toBe('X');
    }
  });
});
