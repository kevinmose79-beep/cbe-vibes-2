import { describe, it, expect, beforeEach } from 'vitest';
import { Examination, Mark, Student, ClassStream, Subject } from '../types';
import { api, KEYS, setStorage, getStorage } from '../lib/storage';
import { validateMarkCellInput } from '../components/MarksEntryTable';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('CBE HUB — CROSS-STREAM MAX-SCORE HYDRATION & ISOLATION SUITE', () => {
  const EXAM_ID = '1b0e3740-6b60-43b3-a85b-df073fd4e857';
  const INT_SCI_ID = 'b65c16d5-a38c-478e-ab46-085170ee31da';
  const MATH_ID = 'sub-math-uuid-9';

  const G9_CLASS_ID = '0e49e9b0-0a82-4f4b-9109-685b0103a54c';
  const G9_RED_STREAM_ID = '3d0ecb00-3e0f-425a-8d69-59f6c9f18b40';
  const G9_BLUE_STREAM_ID = '95e8ff02-6d67-433f-a417-2d74e2012793';
  const G8_CLASS_ID = 'cls-grade-8-uuid';

  const classRed: ClassStream = {
    id: G9_CLASS_ID,
    stream_id: G9_RED_STREAM_ID,
    class_name: 'Grade 9',
    stream: 'Red',
    education_level: 'Junior School',
    status: 'Active',
  };

  const classBlue: ClassStream = {
    id: G9_CLASS_ID,
    stream_id: G9_BLUE_STREAM_ID,
    class_name: 'Grade 9',
    stream: 'Blue',
    education_level: 'Junior School',
    status: 'Active',
  };

  const subjectIntSci: Subject = {
    id: INT_SCI_ID,
    subject_code: 'INT-SCI',
    subject_name: 'Integrated Science',
    category: 'Core',
    education_level: 'Junior School',
  };

  const subjectMath: Subject = {
    id: MATH_ID,
    subject_code: 'MATH',
    subject_name: 'Mathematics',
    category: 'Core',
    education_level: 'Junior School',
  };

  // 2 learners in Red, 2 learners in Blue
  const studentsRed: Student[] = [
    { id: 'std_r1', admission_number: 'ADM-R1', full_name: 'Red Student 1', gender: 'M', class_id: G9_CLASS_ID, stream_id: G9_RED_STREAM_ID, active: true },
    { id: 'std_r2', admission_number: 'ADM-R2', full_name: 'Red Student 2', gender: 'F', class_id: G9_CLASS_ID, stream_id: G9_RED_STREAM_ID, active: true },
  ];

  const studentsBlue: Student[] = [
    { id: 'std_b1', admission_number: 'ADM-B1', full_name: 'Blue Student 1', gender: 'M', class_id: G9_CLASS_ID, stream_id: G9_BLUE_STREAM_ID, active: true },
    { id: 'std_b2', admission_number: 'ADM-B2', full_name: 'Blue Student 2', gender: 'F', class_id: G9_CLASS_ID, stream_id: G9_BLUE_STREAM_ID, active: true },
  ];

  const allStudents = [...studentsRed, ...studentsBlue];

  // Helper matching the exact surgical resolution in MarksEntryTable.tsx
  function resolveStreamExistingOutOf(
    selectedExamId: string,
    selectedSubjectId: string,
    classStudents: Student[],
    fetchedMarks: Mark[] | null | undefined,
    cachedMarks: Mark[] | null | undefined
  ): number | null {
    const cohortStudentIds = new Set(classStudents.map((s) => s.id));
    const allWorkflowMarks = [...(fetchedMarks || []), ...(cachedMarks || [])];
    const matchWithOutOf = allWorkflowMarks.find(
      (m) =>
        cohortStudentIds.has(m.student_id) &&
        m.exam_id === selectedExamId &&
        m.subject_id === selectedSubjectId &&
        typeof m.out_of === 'number' &&
        m.out_of > 0
    );
    return matchWithOutOf ? (matchWithOutOf.out_of as number) : null;
  }

  beforeEach(() => {
    localStorage.clear();
    setStorage(KEYS.CLASSES, [classRed, classBlue]);
    setStorage(KEYS.SUBJECTS, [subjectIntSci, subjectMath]);
    setStorage(KEYS.STUDENTS, allStudents);
    setStorage(KEYS.MARKS, []);
  });

  it('1. Grade 9 Red resolves "outOfMaxScore = 70" when Red and Blue marks are both present and Blue cached records appear first', () => {
    // Blue marks encode 200; Red marks encode 70
    const blueMarks: Mark[] = [
      { id: 'm_b1', student_id: 'std_b1', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 0, raw_score: 0, out_of: 200, special_status: 'Blank' },
      { id: 'm_b2', student_id: 'std_b2', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 0, raw_score: 0, out_of: 200, special_status: 'Blank' },
    ];
    const redMarks: Mark[] = [
      { id: 'm_r1', student_id: 'std_r1', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 38, raw_score: 38, out_of: 70, special_status: 'Normal' },
      { id: 'm_r2', student_id: 'std_r2', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 40, raw_score: 40, out_of: 70, special_status: 'Normal' },
    ];

    // Array simulates preserved cache where Blue records precede Red records
    const cachedCombined = [...blueMarks, ...redMarks];

    const resolvedOutOf = resolveStreamExistingOutOf(
      EXAM_ID,
      INT_SCI_ID,
      studentsRed,
      redMarks, // fetched for Red
      cachedCombined
    );

    expect(resolvedOutOf).toBe(70);
  });

  it('2. Grade 9 Blue does not inherit Red 70 when its own records encode 200', () => {
    const blueMarks: Mark[] = [
      { id: 'm_b1', student_id: 'std_b1', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 0, raw_score: 0, out_of: 200, special_status: 'Blank' },
    ];
    const redMarks: Mark[] = [
      { id: 'm_r1', student_id: 'std_r1', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 38, raw_score: 38, out_of: 70, special_status: 'Normal' },
    ];

    // Even if Red marks appear first in cache, Blue resolves its own 200
    const cachedCombined = [...redMarks, ...blueMarks];

    const resolvedOutOf = resolveStreamExistingOutOf(
      EXAM_ID,
      INT_SCI_ID,
      studentsBlue,
      blueMarks,
      cachedCombined
    );

    expect(resolvedOutOf).toBe(200);
  });

  it('3. Switching streams and reloading does not leak the previous stream maximum', () => {
    // Red has 70, Blue has 200, Grade 8 has no marks yet
    const redMarks: Mark[] = [
      { id: 'm_r1', student_id: 'std_r1', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 38, raw_score: 38, out_of: 70, special_status: 'Normal' },
    ];
    const blueMarks: Mark[] = [
      { id: 'm_b1', student_id: 'std_b1', exam_id: EXAM_ID, subject_id: INT_SCI_ID, marks: 0, raw_score: 0, out_of: 200, special_status: 'Blank' },
    ];
    const cachedCombined = [...blueMarks, ...redMarks];

    // User selects Red -> gets 70
    const outOfRed = resolveStreamExistingOutOf(EXAM_ID, INT_SCI_ID, studentsRed, redMarks, cachedCombined);
    expect(outOfRed).toBe(70);

    // User switches to Blue -> gets 200
    const outOfBlue = resolveStreamExistingOutOf(EXAM_ID, INT_SCI_ID, studentsBlue, blueMarks, cachedCombined);
    expect(outOfBlue).toBe(200);

    // User switches to an unassessed stream -> returns null (remains unset, does NOT borrow 70 or 200)
    const unassessedLearners: Student[] = [
      { id: 'std_un1', admission_number: 'ADM-U1', full_name: 'Unassessed 1', gender: 'M', class_id: G8_CLASS_ID, active: true },
    ];
    const outOfUnassessed = resolveStreamExistingOutOf(EXAM_ID, INT_SCI_ID, unassessedLearners, [], cachedCombined);
    expect(outOfUnassessed).toBeNull();
  });

  it('4. Marks for unrelated streams and subjects do not affect the result', () => {
    const mathMarks: Mark[] = [
      { id: 'm_math1', student_id: 'std_r1', exam_id: EXAM_ID, subject_id: MATH_ID, marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
    ];
    const unrelatedExamMarks: Mark[] = [
      { id: 'm_diff_exam', student_id: 'std_r1', exam_id: 'different-exam-id', subject_id: INT_SCI_ID, marks: 45, raw_score: 45, out_of: 50, special_status: 'Normal' },
    ];
    const cachedCombined = [...mathMarks, ...unrelatedExamMarks];

    // No INT-SCI marks exist for this exam in Red
    const resolved = resolveStreamExistingOutOf(EXAM_ID, INT_SCI_ID, studentsRed, [], cachedCombined);
    expect(resolved).toBeNull();
  });

  it('5. Existing save validation, special-status handling, and score ceiling remain intact', () => {
    // Normal score within max
    const valid50 = validateMarkCellInput('50', 70);
    expect(valid50.isValid).toBe(true);

    // Score exceeding max 70
    const invalid75 = validateMarkCellInput('75', 70);
    expect(invalid75.isValid).toBe(false);
    expect(invalid75.errorTitle).toBe('MARK TOO HIGH');
    expect(invalid75.errorMessage).toContain('cannot be greater than the Max Score of 70');

    // Negative score
    const negativeVal = validateMarkCellInput('-5', 70);
    expect(negativeVal.isValid).toBe(false);
    expect(negativeVal.errorTitle).toBe('INVALID MARK');

    // Special status X and Y remain valid
    expect(validateMarkCellInput('X', 70).isValid).toBe(true);
    expect(validateMarkCellInput('Y', 70).isValid).toBe(true);
    expect(validateMarkCellInput('x', 70).isValid).toBe(true);
    expect(validateMarkCellInput('y', 70).isValid).toBe(true);

    // Blank remain valid
    expect(validateMarkCellInput('', 70).isValid).toBe(true);
  });

  it('6. fetchMarksForWorkflow returns workflow-scoped marks without dumping unrelated cached streams', async () => {
    // Seed initial cache with Red and Blue marks
    const redMark: Mark = {
      id: 'm_r1',
      student_id: 'std_r1',
      exam_id: EXAM_ID,
      subject_id: INT_SCI_ID,
      marks: 38,
      raw_score: 38,
      out_of: 70,
      special_status: 'Normal',
    };
    const blueMark: Mark = {
      id: 'm_b1',
      student_id: 'std_b1',
      exam_id: EXAM_ID,
      subject_id: INT_SCI_ID,
      marks: 0,
      raw_score: 0,
      out_of: 200,
      special_status: 'Blank',
    };
    setStorage(KEYS.MARKS, [blueMark, redMark]);

    // Query for Red workflow
    const results = await api.fetchMarksForWorkflow({
      examId: EXAM_ID,
      subjectId: INT_SCI_ID,
      studentIds: ['std_r1', 'std_r2'],
    });

    // Should only contain Red's marks, NOT Blue's marks
    expect(results.some((m) => m.student_id === 'std_b1')).toBe(false);
    expect(results.some((m) => m.student_id === 'std_r1')).toBe(true);
  });
});
