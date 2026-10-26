import { describe, it, expect } from 'vitest';
import { Student, ClassStream, Subject, Teacher } from '../types';
import {
  isLearnerInSelectedClassStream,
  resolveSubjectTeacherName,
  getStreamNameForLearner,
  resolveLearnerClassStream,
  getClassTeachersString,
} from '../services/terminalMeritListExporter';

describe('Terminal Merit List Stream Isolation & Teacher Resolution', () => {
  // 1. Setup mock classes
  const classG9Blue: ClassStream = {
    id: 'cls_g9_parent',
    stream_id: 'cs_g9_blue',
    class_name: 'Grade 9',
    stream: 'Blue',
  };

  const classG9Red: ClassStream = {
    id: 'cls_g9_parent',
    stream_id: 'cs_g9_red',
    class_name: 'Grade 9',
    stream: 'Red',
  };

  // 2. Setup mock students
  const studentG9Blue: Student = {
    id: 'st_blue_1',
    full_name: 'Blue Learner',
    admission_number: 'ADM_B1',
    class_id: 'cls_g9_parent',
    stream_id: 'cs_g9_blue',
    grade: 'Grade 9',
    gender: 'M',
    active: true,
  };

  const studentG9Red: Student = {
    id: 'st_red_1',
    full_name: 'Red Learner',
    admission_number: 'ADM_R1',
    class_id: 'cls_g9_parent',
    stream_id: 'cs_g9_red',
    grade: 'Grade 9',
    gender: 'F',
    active: true,
  };

  // 3. Setup mock teachers with stream-specific allocations
  const teachers: Teacher[] = [
    {
      id: 'tch_blue_math',
      teacher_name: 'Mr. Blue Math',
      phone: '0700000001',
      email: 'blue.math@school.ac.ke',
      allocations: [
        {
          id: 'alloc_1',
          subject_id: 'sb_mat',
          class_id: 'cls_g9_parent',
          stream_id: 'cs_g9_blue',
          education_level: 'Junior School',
        },
      ],
    },
    {
      id: 'tch_red_math',
      teacher_name: 'Mr. Red Math',
      phone: '0700000002',
      email: 'red.math@school.ac.ke',
      allocations: [
        {
          id: 'alloc_2',
          subject_id: 'sb_mat',
          class_id: 'cls_g9_parent',
          stream_id: 'cs_g9_red',
          education_level: 'Junior School',
        },
      ],
    },
  ];

  it('filters learners by stream correctly', () => {
    expect(isLearnerInSelectedClassStream(studentG9Blue, classG9Blue)).toBe(true);
    expect(isLearnerInSelectedClassStream(studentG9Red, classG9Blue)).toBe(false);
    expect(isLearnerInSelectedClassStream(studentG9Red, classG9Red)).toBe(true);
  });

  it('resolves stream-specific subject teachers correctly', () => {
    const blueMathTeacher = resolveSubjectTeacherName('sb_mat', 'cls_g9_parent', 'cs_g9_blue', teachers);
    const redMathTeacher = resolveSubjectTeacherName('sb_mat', 'cls_g9_parent', 'cs_g9_red', teachers);
    const unassignedTeacher = resolveSubjectTeacherName('sb_eng', 'cls_g9_parent', 'cs_g9_blue', teachers);

    expect(blueMathTeacher).toBe('Mr. Blue Math');
    expect(redMathTeacher).toBe('Mr. Red Math');
    expect(unassignedTeacher).toBe('');
  });

  it('resolves stream names for learners accurately without selecting sibling stream', () => {
    const blueStreamName = getStreamNameForLearner(studentG9Blue, [classG9Blue, classG9Red]);
    const redStreamName = getStreamNameForLearner(studentG9Red, [classG9Blue, classG9Red]);

    expect(blueStreamName).toBe('BLUE');
    expect(redStreamName).toBe('RED');
  });

  it('resolves ClassStream using explicit ordered resolution', () => {
    // 1. Exact stream UUID match
    expect(resolveLearnerClassStream(studentG9Blue, [classG9Blue, classG9Red])?.stream_id).toBe('cs_g9_blue');
    expect(resolveLearnerClassStream(studentG9Red, [classG9Blue, classG9Red])?.stream_id).toBe('cs_g9_red');

    // 2. Unambiguous parent class fallback when single stream
    const singleStreamClass: ClassStream = {
      id: 'cls_single',
      stream_id: 'cs_single_a',
      class_name: 'Grade 1',
      stream: 'A',
    };
    const studentSingle: Student = {
      id: 'st_s1',
      full_name: 'Solo Learner',
      admission_number: 'ADM_S1',
      class_id: 'cls_single',
      grade: 'Grade 1',
      gender: 'M',
      active: true,
    };
    expect(resolveLearnerClassStream(studentSingle, [singleStreamClass])?.stream_id).toBe('cs_single_a');

    // 3. Ambiguous parent class with multiple sibling streams returns undefined
    const studentAmbiguous: Student = {
      id: 'st_ambig',
      full_name: 'Ambig Learner',
      admission_number: 'ADM_AMB',
      class_id: 'cls_g9_parent',
      grade: 'Grade 9',
      gender: 'M',
      active: true,
    };
    expect(resolveLearnerClassStream(studentAmbiguous, [classG9Blue, classG9Red])).toBeUndefined();
    // Stream name for ambiguous learner returns placeholder '—'
    expect(getStreamNameForLearner(studentAmbiguous, [classG9Blue, classG9Red])).toBe('—');
  });

  it('formats class teachers string correctly for single stream and all streams', () => {
    const classTeacherBlue: Teacher = {
      id: 'tch_ct_blue',
      teacher_name: 'Mrs. Blue Head',
      is_class_teacher: true,
      class_teacher_of_id: 'cs_g9_blue',
      phone: '0700000010',
      email: 'ct.blue@school.ac.ke',
    };
    const classTeacherRed: Teacher = {
      id: 'tch_ct_red',
      teacher_name: 'Mr. Red Head',
      is_class_teacher: true,
      class_teacher_of_id: 'cs_g9_red',
      phone: '0700000020',
      email: 'ct.red@school.ac.ke',
    };

    // Single stream view returns direct teacher name
    const blueStr = getClassTeachersString('Grade 9', [classG9Blue, classG9Red], [classTeacherBlue, classTeacherRed], 'cs_g9_blue');
    expect(blueStr).toBe('Mrs. Blue Head');

    // All streams view lists attributed streams
    const allStr = getClassTeachersString('Grade 9', [classG9Blue, classG9Red], [classTeacherBlue, classTeacherRed], 'all');
    expect(allStr).toContain('BLUE: Mrs. Blue Head');
    expect(allStr).toContain('RED: Mr. Red Head');
  });
});
