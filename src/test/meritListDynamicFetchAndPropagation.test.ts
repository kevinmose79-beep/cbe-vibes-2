import { describe, it, expect, beforeEach } from 'vitest';
import { api, KEYS, setStorage } from '../lib/storage';
import { Examination, Student, Mark, ClassStream, Subject, Grade } from '../types';
import { calculateExamResults, CBE_8_POINT_GRADES } from '../services/analysisEngine';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Merit List Dynamic Fetch and Cohort Calculation Integrity Test', () => {
  const examId = 'fd7183f9-f223-498e-8fb7-468cf397432a';
  const mockExam: Examination = {
    id: examId,
    exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    education_level: 'Upper Primary',
    assessment_structure: 'Composite',
    ss_cre_structure: 'CUSTOM:25:15',
    include_agriculture: true,
    status: 'Published',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockClass: ClassStream = {
    id: '6ed8a9ed-d33b-4976-9076-fd175d22f60e',
    class_name: 'Grade 6',
    stream: 'A',
    education_level: 'Upper Primary',
    stream_id: 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
  };

  const mockSubjects: Subject[] = [
    { id: 's_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Grade 4–9', category: 'Core' },
  ];

  const mockStudents: Student[] = [
    {
      id: 'fe6c0883-5c78-4cc2-8102-5567976907ee',
      admission_number: '067',
      full_name: 'IVINE CHEROTICH',
      class_id: mockClass.id,
      stream_id: mockClass.stream_id,
      gender: 'F',
      active: true,
    },
    {
      id: 'fe5b82c5-4280-4f33-81f8-8ecbdb165fb4',
      admission_number: '092',
      full_name: 'SHEILLA CHEPKEMOI',
      class_id: mockClass.id,
      stream_id: mockClass.stream_id,
      gender: 'F',
      active: true,
    },
  ];

  const mockMarks: Mark[] = [
    { id: 'm1', student_id: mockStudents[0].id, subject_id: 's_eng', exam_id: examId, score: 80, out_of: 100, special_status: 'Normal' },
    { id: 'm2', student_id: mockStudents[0].id, subject_id: 's_math', exam_id: examId, score: 75, out_of: 100, special_status: 'Normal' },
    { id: 'm3', student_id: mockStudents[0].id, subject_id: 's_sci', exam_id: examId, score: 85, out_of: 100, special_status: 'Normal' },
    { id: 'm4', student_id: mockStudents[1].id, subject_id: 's_eng', exam_id: examId, score: 90, out_of: 100, special_status: 'Normal' },
    { id: 'm5', student_id: mockStudents[1].id, subject_id: 's_math', exam_id: examId, score: 88, out_of: 100, special_status: 'Normal' },
    { id: 'm6', student_id: mockStudents[1].id, subject_id: 's_sci', exam_id: examId, score: 92, out_of: 100, special_status: 'Normal' },
  ];

  beforeEach(() => {
    setStorage(KEYS.EXAMS, [mockExam]);
    setStorage(KEYS.STUDENTS, mockStudents);
    setStorage(KEYS.CLASSES, [mockClass]);
    setStorage(KEYS.SUBJECTS, mockSubjects);
    setStorage(KEYS.MARKS, mockMarks);
  });

  it('calculates merit list results for all learners in cohort when marks are populated', () => {
    const results = calculateExamResults(
      examId,
      mockStudents,
      mockMarks,
      CBE_8_POINT_GRADES,
      [mockClass],
      mockSubjects,
      mockExam
    );

    expect(results).toHaveLength(2);

    const sheilla = results.find((r) => r.student_id === mockStudents[1].id);
    const ivine = results.find((r) => r.student_id === mockStudents[0].id);

    expect(sheilla).toBeDefined();
    expect(sheilla?.total_marks).toBe(270);
    expect(sheilla?.position).toBe(1);

    expect(ivine).toBeDefined();
    expect(ivine?.total_marks).toBe(240);
    expect(ivine?.position).toBe(2);
  });
});
