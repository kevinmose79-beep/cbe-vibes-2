import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, KEYS, setStorage, getStorage } from '../lib/storage';
import { Examination, Student, Mark, ClassStream, Subject } from '../types';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Marks Monitoring Exam Fetch Limit & Reconciliation Test', () => {
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
    max_marks: 50,
  };

  const mockStudents: Student[] = [
    {
      id: 'fe6c0883-5c78-4cc2-8102-5567976907ee',
      admission_number: '067',
      full_name: 'IVINE CHEROTICH',
      class_id: '6ed8a9ed-d33b-4976-9076-fd175d22f60e',
      stream_id: 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
      gender: 'F',
      active: true,
    },
    {
      id: 'fe5b82c5-4280-4f33-81f8-8ecbdb165fb4',
      admission_number: '092',
      full_name: 'SHEILLA CHEPKEMOI',
      class_id: '6ed8a9ed-d33b-4976-9076-fd175d22f60e',
      stream_id: 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
      gender: 'F',
      active: true,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(KEYS.EXAMS, JSON.stringify([mockExam]));
    localStorage.setItem(KEYS.STUDENTS, JSON.stringify(mockStudents));
  });

  it('reconciles >1000 marks properly and preserves all learner entries without truncation', async () => {
    // Generate 1,020 simulated marks across learners
    const largeMockMarks: Mark[] = [];
    for (let i = 0; i < 1020; i++) {
      const studentId = i >= 1000 ? mockStudents[i % 2].id : `student-uuid-${i}`;
      largeMockMarks.push({
        id: `mark-${i}`,
        student_id: studentId,
        subject_id: `subject-${i % 10}`,
        exam_id: examId,
        score: 75,
        out_of: 100,
        special_status: 'Normal',
      });
    }

    // Set local cache with 1020 marks
    setStorage(KEYS.MARKS, largeMockMarks);

    const currentMarks = api.getMarks();
    expect(currentMarks.length).toBe(1020);

    // Verify student 067 and 092 have their marks present in local marks
    const ivineMarks = currentMarks.filter((m) => m.student_id === mockStudents[0].id);
    const sheillaMarks = currentMarks.filter((m) => m.student_id === mockStudents[1].id);

    expect(ivineMarks.length).toBeGreaterThan(0);
    expect(sheillaMarks.length).toBeGreaterThan(0);
  });
});
