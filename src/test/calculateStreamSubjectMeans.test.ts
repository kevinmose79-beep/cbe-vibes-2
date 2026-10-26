import './setupLocalStorage';
import { describe, it, expect } from 'vitest';
import { calculateStreamSubjectMeans } from '../utils/markUtils';
import { Mark, Subject } from '../types';

describe('calculateStreamSubjectMeans (Phase 3A & Phase 3E Quorum)', () => {
  const examId = 'exam_term1_2026';
  const otherExamId = 'exam_term2_2026';

  const streamStudents = ['std_1', 'std_2', 'std_3', 'std_4', 'std_5'];
  const outsideStudents = ['std_out_1', 'std_out_2'];

  const testSubjects: Subject[] = [
    {
      id: 'sub_eng',
      subject_name: 'English',
      subject_code: 'ENG',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
    {
      id: 'sub_kisw',
      subject_name: 'Kiswahili',
      subject_code: 'KISW',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
    {
      id: 'sub_math',
      subject_name: 'Mathematics',
      subject_code: 'MATH',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
    {
      id: 'sub_sci',
      subject_name: 'Integrated Science',
      subject_code: 'SCI',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
  ];

  it('1. Calculates the correct mean of valid numerical percentages', () => {
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'm3', student_id: 'std_3', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    // (80 + 70 + 60) / 3 = 210 / 3 = 70
    expect(means['sub_eng']).toBe(70);
  });

  it('2. Includes genuine assessed 0% in both numerator and denominator', () => {
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_math', exam_id: examId, marks: 100 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_math', exam_id: examId, marks: 0, special_status: 'Normal' },
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    // (100 + 0) / 2 = 50%
    // If 0 were excluded, it would falsely report 100%.
    expect(means['sub_math']).toBe(50);
  });

  it('3. Excludes "X" (Missing Mark) from both numerator and denominator', () => {
    // If only 1 valid learner exists and the other is X, quorum is not met -> null
    const marksSingleWithX: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, special_status: 'X' },
    ];
    const meansSingle = calculateStreamSubjectMeans(marksSingleWithX, streamStudents, examId, testSubjects);
    expect(meansSingle['sub_eng']).toBeNull();

    // When 2 valid learners exist and a 3rd is X, quorum is met -> (80 + 60) / 2 = 70
    const marksQuorumWithX: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
      { id: 'm3', student_id: 'std_3', subject_id: 'sub_eng', exam_id: examId, special_status: 'X' },
    ];
    const meansQuorum = calculateStreamSubjectMeans(marksQuorumWithX, streamStudents, examId, testSubjects);
    expect(meansQuorum['sub_eng']).toBe(70);
  });

  it('4. Excludes "Y" (Absent / Irregularity) from both numerator and denominator', () => {
    // If only 1 valid learner exists and the other is Y, quorum is not met -> null
    const marksSingleWithY: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_kisw', exam_id: examId, marks: 90 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_kisw', exam_id: examId, special_status: 'Y', irregularity_reason: 'Absent' },
    ];
    const meansSingle = calculateStreamSubjectMeans(marksSingleWithY, streamStudents, examId, testSubjects);
    expect(meansSingle['sub_kisw']).toBeNull();

    // When 2 valid learners exist and a 3rd is Y, quorum is met -> (90 + 70) / 2 = 80
    const marksQuorumWithY: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_kisw', exam_id: examId, marks: 90 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_kisw', exam_id: examId, marks: 70 },
      { id: 'm3', student_id: 'std_3', subject_id: 'sub_kisw', exam_id: examId, special_status: 'Y', irregularity_reason: 'Absent' },
    ];
    const meansQuorum = calculateStreamSubjectMeans(marksQuorumWithY, streamStudents, examId, testSubjects);
    expect(meansQuorum['sub_kisw']).toBe(80);
  });

  it('5. Excludes blank or unentered marks from the calculation', () => {
    // If only 1 valid learner exists and the other is Blank, quorum is not met -> null
    const marksSingleWithBlank: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 75 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_sci', exam_id: examId, special_status: 'Blank' },
    ];
    const meansSingle = calculateStreamSubjectMeans(marksSingleWithBlank, streamStudents, examId, testSubjects);
    expect(meansSingle['sub_sci']).toBeNull();

    // When 2 valid learners exist and a 3rd is Blank, quorum is met -> (75 + 85) / 2 = 80
    const marksQuorumWithBlank: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 75 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_sci', exam_id: examId, marks: 85 },
      { id: 'm3', student_id: 'std_3', subject_id: 'sub_sci', exam_id: examId, special_status: 'Blank' },
    ];
    const meansQuorum = calculateStreamSubjectMeans(marksQuorumWithBlank, streamStudents, examId, testSubjects);
    expect(meansQuorum['sub_sci']).toBe(80);
  });

  it('6. Returns null (not zero) when no valid assessed marks exist for a subject', () => {
    const marks: Mark[] = [
      // All students are absent or missing in Integrated Science
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, special_status: 'X' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_sci', exam_id: examId, special_status: 'Y' },
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    // No valid assessed scores -> must be null, never 0
    expect(means['sub_sci']).toBeNull();
  });

  it('7. Excludes marks from another examination', () => {
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
      // Other exam marks for same students and subject
      { id: 'm3', student_id: 'std_1', subject_id: 'sub_eng', exam_id: otherExamId, marks: 100 },
      { id: 'm4', student_id: 'std_2', subject_id: 'sub_eng', exam_id: otherExamId, marks: 100 },
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    // Only m1 & m2 belong to examId -> mean is (60 + 80) / 2 = 70
    expect(means['sub_eng']).toBe(70);
  });

  it('8. Excludes marks from learners outside the stream cohort', () => {
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_math', exam_id: examId, marks: 50 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_math', exam_id: examId, marks: 70 },
      // Outside stream students in different stream/grade
      { id: 'm3', student_id: outsideStudents[0], subject_id: 'sub_math', exam_id: examId, marks: 100 },
      { id: 'm4', student_id: outsideStudents[1], subject_id: 'sub_math', exam_id: examId, marks: 100 },
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    // Only std_1 & std_2 are in stream -> mean is (50 + 70) / 2 = 60
    expect(means['sub_math']).toBe(60);
  });

  it('9. Calculates independent means for multiple subjects simultaneously', () => {
    const marks: Mark[] = [
      // English: std_1=70, std_2=80 -> mean 75
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 80 },

      // Kiswahili: std_1=65, std_2=55 -> mean 60
      { id: 'm3', student_id: 'std_1', subject_id: 'sub_kisw', exam_id: examId, marks: 65 },
      { id: 'm4', student_id: 'std_2', subject_id: 'sub_kisw', exam_id: examId, marks: 55 },

      // Mathematics: std_1=0, std_2=100 -> mean 50
      { id: 'm5', student_id: 'std_1', subject_id: 'sub_math', exam_id: examId, marks: 0 },
      { id: 'm6', student_id: 'std_2', subject_id: 'sub_math', exam_id: examId, marks: 100 },

      // Integrated Science: no marks -> null
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    expect(means).toEqual({
      sub_eng: 75,
      sub_kisw: 60,
      sub_math: 50,
      sub_sci: null,
    });
  });

  it('10. Does NOT mutate input marks, student IDs, or subjects', () => {
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 82 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 78 },
    ];
    const marksClone = JSON.parse(JSON.stringify(marks));
    const streamStudentsClone = [...streamStudents];
    const subjectsClone = JSON.parse(JSON.stringify(testSubjects));

    calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    expect(marks).toEqual(marksClone);
    expect(streamStudents).toEqual(streamStudentsClone);
    expect(testSubjects).toEqual(subjectsClone);
  });

  it('11. Correctly deduplicates multiple marks for the same student and subject', () => {
    const marks: Mark[] = [
      // std_1 has an older mark of 60 and newer mark of 80
      { id: 'm1_old', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 60, updated_at: '2026-03-01T10:00:00Z' },
      { id: 'm1_new', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 80, updated_at: '2026-03-02T10:00:00Z' },
      // std_2 has 70
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
    ];

    const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

    // std_1 counts once with 80; std_2 has 70 -> (80 + 70) / 2 = 75
    expect(means['sub_eng']).toBe(75);
  });

  it('12. Safely handles malformed records, null values, and empty inputs', () => {
    const malformedMarks: any[] = [
      null,
      undefined,
      {},
      { exam_id: examId }, // missing student_id & subject_id
      { exam_id: examId, student_id: 'std_1' }, // missing subject_id
      { exam_id: examId, student_id: 'std_1', subject_id: 'sub_eng', marks: 'NaN' },
    ];

    expect(() => calculateStreamSubjectMeans(malformedMarks, streamStudents, examId, testSubjects)).not.toThrow();

    const emptyResult = calculateStreamSubjectMeans([], streamStudents, examId, testSubjects);
    expect(emptyResult['sub_eng']).toBeNull();
    expect(emptyResult['sub_math']).toBeNull();

    const noStreamResult = calculateStreamSubjectMeans(malformedMarks, [], examId, testSubjects);
    expect(noStreamResult['sub_eng']).toBeNull();
  });

  it('13. Accurately applies Math.round() nearest whole percentage convention', () => {
    // 3 students: 70, 71, 72 -> sum 213 / 3 = 71.0 -> 71
    // 3 students: 70, 71, 71 -> sum 212 / 3 = 70.666... -> 71
    // 3 students: 70, 70, 71 -> sum 211 / 3 = 70.333... -> 70
    const marksRoundUp: Mark[] = [
      { id: 'r1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'r2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 71 },
      { id: 'r3', student_id: 'std_3', subject_id: 'sub_eng', exam_id: examId, marks: 71 },
    ];
    const meansUp = calculateStreamSubjectMeans(marksRoundUp, streamStudents, examId, ['sub_eng']);
    expect(meansUp['sub_eng']).toBe(71);

    const marksRoundDown: Mark[] = [
      { id: 'r1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'r2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
      { id: 'r3', student_id: 'std_3', subject_id: 'sub_eng', exam_id: examId, marks: 71 },
    ];
    const meansDown = calculateStreamSubjectMeans(marksRoundDown, streamStudents, examId, ['sub_eng']);
    expect(meansDown['sub_eng']).toBe(70);
  });

  it('14. Valid newer updated_at takes precedence over older valid timestamp regardless of order', () => {
    // Newer first, older second: std_1 has 90 (newer) and 50 (older), std_2 has 70 -> mean (90 + 70) / 2 = 80
    const marksNewerFirst: Mark[] = [
      { id: 'm1_new', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 90, updated_at: '2026-03-05T12:00:00Z' },
      { id: 'm1_old', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 50, updated_at: '2026-03-01T08:00:00Z' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
    ];
    const means1 = calculateStreamSubjectMeans(marksNewerFirst, ['std_1', 'std_2'], examId, ['sub_eng']);
    expect(means1['sub_eng']).toBe(80);

    // Older first, newer second: newer must overwrite older -> mean (90 + 70) / 2 = 80
    const marksOlderFirst: Mark[] = [
      { id: 'm1_old', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 50, updated_at: '2026-03-01T08:00:00Z' },
      { id: 'm1_new', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 90, updated_at: '2026-03-05T12:00:00Z' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
    ];
    const means2 = calculateStreamSubjectMeans(marksOlderFirst, ['std_1', 'std_2'], examId, ['sub_eng']);
    expect(means2['sub_eng']).toBe(80);
  });

  it('15. Never lets an un-timestamped duplicate overwrite a record with a valid timestamp', () => {
    // Valid timestamp first, un-timestamped duplicate second; std_2 has 75 -> mean (85 + 75) / 2 = 80
    const marks: Mark[] = [
      { id: 'm1_valid', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 85, updated_at: '2026-03-01T10:00:00Z' },
      { id: 'm1_untimestamped', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 40 }, // missing updated_at
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 75 },
    ];
    const means = calculateStreamSubjectMeans(marks, ['std_1', 'std_2'], examId, ['sub_eng']);
    // Valid timestamped record (85) must be preserved -> (85 + 75) / 2 = 80
    expect(means['sub_eng']).toBe(80);
  });

  it('16. Valid timestamp takes precedence over a missing or malformed timestamp', () => {
    // Malformed/invalid date string encountered first, valid timestamp second; std_2 has 72
    const marks: Mark[] = [
      { id: 'm1_bad', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 40, updated_at: 'not-a-valid-date' },
      { id: 'm1_valid', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 88, updated_at: '2026-03-02T10:00:00Z' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 72 },
    ];
    const means = calculateStreamSubjectMeans(marks, ['std_1', 'std_2'], examId, ['sub_eng']);
    expect(means['sub_eng']).toBe(80); // (88 + 72) / 2 = 80

    // Valid timestamp first, malformed date string second (must NOT overwrite valid)
    const marksReverse: Mark[] = [
      { id: 'm1_valid', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 88, updated_at: '2026-03-02T10:00:00Z' },
      { id: 'm1_bad', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 40, updated_at: 'invalid-iso-string' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 72 },
    ];
    const meansReverse = calculateStreamSubjectMeans(marksReverse, ['std_1', 'std_2'], examId, ['sub_eng']);
    expect(meansReverse['sub_eng']).toBe(80);
  });

  it('17. Equal valid timestamps follow a deterministic tie rule (last encountered wins)', () => {
    const marks: Mark[] = [
      { id: 'm1_a', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 70, updated_at: '2026-03-01T10:00:00Z' },
      { id: 'm1_b', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 76, updated_at: '2026-03-01T10:00:00Z' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 84 },
    ];
    const means = calculateStreamSubjectMeans(marks, ['std_1', 'std_2'], examId, ['sub_eng']);
    // std_1 resolves to 76; std_2 is 84 -> (76 + 84) / 2 = 80
    expect(means['sub_eng']).toBe(80);
  });

  it('18. Missing or malformed timestamps on both records follow deterministic last-encountered rule', () => {
    // Both missing updated_at; std_2 has 76
    const marksMissing: Mark[] = [
      { id: 'm1_a', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
      { id: 'm1_b', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 64 },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 76 },
    ];
    const meansMissing = calculateStreamSubjectMeans(marksMissing, ['std_1', 'std_2'], examId, ['sub_eng']);
    // std_1 resolves to 64; std_2 is 76 -> (64 + 76) / 2 = 70
    expect(meansMissing['sub_eng']).toBe(70);

    // Both malformed updated_at; std_2 has 72
    const marksMalformed: Mark[] = [
      { id: 'm1_a', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 60, updated_at: 'bad-1' },
      { id: 'm1_b', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 68, updated_at: 'bad-2' },
      { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 72 },
    ];
    const meansMalformed = calculateStreamSubjectMeans(marksMalformed, ['std_1', 'std_2'], examId, ['sub_eng']);
    // std_1 resolves to 68; std_2 is 72 -> (68 + 72) / 2 = 70
    expect(meansMalformed['sub_eng']).toBe(70);
  });

  describe('Phase 3E: Minimum Cohort Quorum Verification', () => {
    it('19. One learner has Science = 80%, with no assessed peer: mean is "null"', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 80 },
      ];
      const means = calculateStreamSubjectMeans(marks, streamStudents, examId, ['sub_sci']);
      // Zero peers assessed -> exactly null, learner mark must never become the stream mean
      expect(means['sub_sci']).toBeNull();
    });

    it('20. Two learners have English = 80% and 60%: mean is 70%', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
        { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
      ];
      const means = calculateStreamSubjectMeans(marks, streamStudents, examId, ['sub_eng']);
      // (80 + 60) / 2 = 70
      expect(means['sub_eng']).toBe(70);
    });

    it('21. Two learners have English = 0% and 60%: mean is 30%', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 0, special_status: 'Normal' },
        { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 60 },
      ];
      const means = calculateStreamSubjectMeans(marks, streamStudents, examId, ['sub_eng']);
      // (0 + 60) / 2 = 30
      expect(means['sub_eng']).toBe(30);
    });

    it('22. A subject with only one valid mark remains "null", even when other subjects have enough assessed learners', () => {
      const marks: Mark[] = [
        // English: 2 learners assessed -> mean (80 + 60) / 2 = 70
        { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 80 },
        { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 60 },

        // Kiswahili: 3 learners assessed -> mean (70 + 75 + 80) / 3 = 75
        { id: 'm3', student_id: 'std_1', subject_id: 'sub_kisw', exam_id: examId, marks: 70 },
        { id: 'm4', student_id: 'std_2', subject_id: 'sub_kisw', exam_id: examId, marks: 75 },
        { id: 'm5', student_id: 'std_3', subject_id: 'sub_kisw', exam_id: examId, marks: 80 },

        // Science: ONLY 1 learner assessed -> MUST remain null
        { id: 'm6', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 85 },
      ];

      const means = calculateStreamSubjectMeans(marks, streamStudents, examId, testSubjects);

      expect(means['sub_eng']).toBe(70);
      expect(means['sub_kisw']).toBe(75);
      expect(means['sub_sci']).toBeNull();
    });

    it('23. Duplicate marks for the same learner do not count as multiple learners toward the minimum quorum', () => {
      const marks: Mark[] = [
        // std_1 has 3 duplicate records for Science
        { id: 'm1', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 75, updated_at: '2026-03-01T10:00:00Z' },
        { id: 'm2', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 80, updated_at: '2026-03-02T10:00:00Z' },
        { id: 'm3', student_id: 'std_1', subject_id: 'sub_sci', exam_id: examId, marks: 85, updated_at: '2026-03-03T10:00:00Z' },
      ];

      const means = calculateStreamSubjectMeans(marks, streamStudents, examId, ['sub_sci']);

      // Only 1 distinct learner assessed -> MUST remain null despite multiple rows
      expect(means['sub_sci']).toBeNull();
    });

    it('24. Exam and stream isolation still work with minimum cohort quorum', () => {
      const marks: Mark[] = [
        // Grade 7 Stream A (examId): std_1=70, std_2=80 -> mean 75
        { id: 'm1', student_id: 'std_1', subject_id: 'sub_eng', exam_id: examId, marks: 70 },
        { id: 'm2', student_id: 'std_2', subject_id: 'sub_eng', exam_id: examId, marks: 80 },

        // Grade 7 Stream A (otherExamId): ONLY std_1=95 -> mean null
        { id: 'm3', student_id: 'std_1', subject_id: 'sub_eng', exam_id: otherExamId, marks: 95 },

        // Outside Stream: std_out_1=90, std_out_2=90 -> must not contribute to streamStudents
        { id: 'm4', student_id: outsideStudents[0], subject_id: 'sub_eng', exam_id: examId, marks: 90 },
        { id: 'm5', student_id: outsideStudents[1], subject_id: 'sub_eng', exam_id: examId, marks: 90 },
      ];

      // Stream A in examId: quorum met (std_1 & std_2) -> 75
      const meansStreamA = calculateStreamSubjectMeans(marks, streamStudents, examId, ['sub_eng']);
      expect(meansStreamA['sub_eng']).toBe(75);

      // Stream A in otherExamId: only std_1 assessed -> null
      const meansOtherExam = calculateStreamSubjectMeans(marks, streamStudents, otherExamId, ['sub_eng']);
      expect(meansOtherExam['sub_eng']).toBeNull();

      // Outside Stream cohort alone (not in streamStudents): streamStudents only has 0 valid marks -> null
      const meansOutsideOnly = calculateStreamSubjectMeans(marks, outsideStudents, otherExamId, ['sub_eng']);
      expect(meansOutsideOnly['sub_eng']).toBeNull();
    });
  });
});
