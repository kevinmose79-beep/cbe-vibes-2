import { describe, it, expect, beforeEach } from 'vitest';
import { api, KEYS, setStorage, getStorage } from '../lib/storage';
import { Examination, Student, Mark, ClassStream, Subject, Grade } from '../types';
import { calculateExamResults } from '../services/analysisEngine';
import { filterSubjectsForExamStructure } from '../components/MarksMonitoringView';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Forensic Marks Pagination, Cache Reconciliation & Monitoring/Merit Preservation', () => {
  const examId = 'fd7183f9-f223-498e-8fb7-468cf397432a';
  const grade6ClassId = '6ed8a9ed-d33b-4976-9076-fd175d22f60e';
  const grade6StreamId = 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6';

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

  const ivine: Student = {
    id: 'fe6c0883-5c78-4cc2-8102-5567976907ee',
    admission_number: '067',
    full_name: 'IVINE CHEROTICH',
    class_id: grade6ClassId,
    stream_id: grade6StreamId,
    grade: 'Grade 6',
    gender: 'F',
    active: true,
  };

  const sheilla: Student = {
    id: 'fe5b82c5-4280-4f33-81f8-8ecbdb165fb4',
    admission_number: '092',
    full_name: 'SHEILLA CHEPKEMOI',
    class_id: grade6ClassId,
    stream_id: grade6StreamId,
    grade: 'Grade 6',
    gender: 'F',
    active: true,
  };

  const subjects: Subject[] = [
    { id: 'sub_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_intsci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'PP1–Grade 9', category: 'Core' },
    { id: 'sub_agn', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core' },
  ];

  const classes: ClassStream[] = [
    {
      id: grade6ClassId,
      stream_id: grade6StreamId,
      class_name: 'Grade 6',
      stream: 'A',
      education_level: 'Upper Primary',
      allocated_subject_ids: subjects.map((s) => s.id),
      capacity: 50,
      status: 'Active',
    },
  ];

  const grades: Grade[] = [
    { id: 'g_ee', grade: 'EE', grade_code: 'EE', performance_level: 'EE', points: 4, minimum_score: 80, maximum_score: 100, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'g_me', grade: 'ME', grade_code: 'ME', performance_level: 'ME', points: 3, minimum_score: 60, maximum_score: 79, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'g_ae', grade: 'AE', grade_code: 'AE', performance_level: 'AE', points: 2, minimum_score: 40, maximum_score: 59, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'g_be', grade: 'BE', grade_code: 'BE', performance_level: 'BE', points: 1, minimum_score: 0, maximum_score: 39, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
  ];

  beforeEach(() => {
    setStorage(KEYS.EXAMS, [mockExam]);
    setStorage(KEYS.STUDENTS, [ivine, sheilla]);
    setStorage(KEYS.SUBJECTS, subjects);
    setStorage(KEYS.CLASSES, classes);
  });

  it('Requirement 1 & 2: Handles >1,000 marks (1,020 marks) without truncation or dropping', () => {
    // Generate 1,020 marks simulating full exam cohort
    const fullExamMarks: Mark[] = [];

    // First 1,000 marks for other students
    for (let i = 0; i < 100; i++) {
      const sId = `std-uuid-${i}`;
      subjects.forEach((sub, subIdx) => {
        fullExamMarks.push({
          id: `mark-${i}-${subIdx}`,
          student_id: sId,
          subject_id: sub.id,
          exam_id: examId,
          marks: 70,
          raw_score: 70,
          out_of: 100,
          special_status: 'Normal',
        });
      });
    }

    // Next 20 marks placed at indices 1,000 to 1,019 (Ivine and Sheilla)
    subjects.forEach((sub, idx) => {
      fullExamMarks.push({
        id: `mark-ivine-${idx}`,
        student_id: ivine.id,
        subject_id: sub.id,
        exam_id: examId,
        marks: 75 + idx,
        raw_score: 75 + idx,
        out_of: 100,
        special_status: 'Normal',
      });
      fullExamMarks.push({
        id: `mark-sheilla-${idx}`,
        student_id: sheilla.id,
        subject_id: sub.id,
        exam_id: examId,
        marks: 65 + idx,
        raw_score: 65 + idx,
        out_of: 100,
        special_status: 'Normal',
      });
    });

    expect(fullExamMarks.length).toBe(1020);

    // Save to storage
    setStorage(KEYS.MARKS, fullExamMarks);

    const storedMarks = api.getMarks();
    expect(storedMarks.length).toBe(1020);

    const ivineMarks = storedMarks.filter((m) => m.student_id === ivine.id && m.exam_id === examId);
    const sheillaMarks = storedMarks.filter((m) => m.student_id === sheilla.id && m.exam_id === examId);

    expect(ivineMarks.length).toBe(10);
    expect(sheillaMarks.length).toBe(10);
  });

  it('Requirement 4 & 5 & 8: Marks Monitoring accurately resolves all 10 subjects including Agriculture', () => {
    const monitoredSubjects = filterSubjectsForExamStructure(subjects, mockExam, classes[0]);
    expect(monitoredSubjects.length).toBe(10);
    expect(monitoredSubjects.some((s) => s.subject_code === 'AGN')).toBe(true);
    expect(monitoredSubjects.some((s) => s.subject_code === 'SS&CRE')).toBe(false); // CUSTOM SST+CRE papers
  });

  it('Requirement 9 & 10: Merit List calculation computes complete totals and ranking for Ivine and Sheilla', () => {
    const ivineMarks: Mark[] = subjects.map((sub, idx) => ({
      id: `mark-ivine-${idx}`,
      student_id: ivine.id,
      subject_id: sub.id,
      exam_id: examId,
      marks: 80,
      raw_score: 80,
      out_of: 100,
      special_status: 'Normal',
    }));

    const sheillaMarks: Mark[] = subjects.map((sub, idx) => ({
      id: `mark-sheilla-${idx}`,
      student_id: sheilla.id,
      subject_id: sub.id,
      exam_id: examId,
      marks: 70,
      raw_score: 70,
      out_of: 100,
      special_status: 'Normal',
    }));

    const allMarks = [...ivineMarks, ...sheillaMarks];
    setStorage(KEYS.MARKS, allMarks);

    const results = calculateExamResults(
      examId,
      [ivine, sheilla],
      allMarks,
      grades,
      classes,
      subjects,
      mockExam
    );

    expect(results.length).toBe(2);

    const ivineRes = results.find((r) => r.student_id === ivine.id);
    const sheillaRes = results.find((r) => r.student_id === sheilla.id);

    expect(ivineRes).toBeDefined();
    expect(sheillaRes).toBeDefined();

    // Ivine scored higher, should be stream position 1
    expect(ivineRes?.stream_position).toBe(1);
    expect(sheillaRes?.stream_position).toBe(2);
  });

  it('Requirement 11 & 12: Agriculture rule strictly adheres to isAgricultureIncludedInCompositeExam', () => {
    // 1. When include_agriculture is false -> Agriculture excluded
    const examWithoutAgn: Examination = {
      ...mockExam,
      id: 'exam_no_agn',
      include_agriculture: false,
    };
    const subsNoAgn = filterSubjectsForExamStructure(subjects, examWithoutAgn, classes[0]);
    expect(subsNoAgn.some((s) => s.subject_code === 'AGN')).toBe(false);

    // 2. When include_agriculture is true -> Agriculture included
    const examWithAgn: Examination = {
      ...mockExam,
      id: 'exam_with_agn',
      include_agriculture: true,
    };
    const subsWithAgn = filterSubjectsForExamStructure(subjects, examWithAgn, classes[0]);
    expect(subsWithAgn.some((s) => s.subject_code === 'AGN')).toBe(true);
  });
});
