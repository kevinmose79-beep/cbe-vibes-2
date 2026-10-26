import { describe, it, expect } from 'vitest';
import { ClassStream, Examination } from '../types';
import { isClassInExamScope } from '../utils/filterUtils';

describe('Surgical Audit Verification: applicable_classes Scope Rules', () => {
  // Test ClassStreams mimicking database facts
  const grade7Class: ClassStream = {
    id: 'b05f2767-ed87-44b2-854d-9b5ac54756d9',
    class_name: 'Grade 7',
    stream: 'Blue',
    education_level: 'Junior School',
  };

  const grade8Class: ClassStream = {
    id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad',
    class_name: 'Grade 8',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const grade9Class: ClassStream = {
    id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
    class_name: 'Grade 9',
    stream: 'Blue',
    education_level: 'Junior School',
  };

  // 1. SBA KNEC Assessment Junior 2026 (class_id = null, applicable_classes targeting Grade 7 & Grade 8)
  const sbaExam: Examination = {
    id: '94257bd6-cd77-4e16-966c-89b82634a36b',
    exam_name: 'SBA KNEC Assessment Junior 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Provisional',
    exam_type: 'Mid-Term',
    max_marks: 100,
    class_id: null as any,
    education_level: 'Junior School',
    applicable_classes: [
      'b05f2767-ed87-44b2-854d-9b5ac54756d9', // Grade 7
      'c79816ee-1324-4abb-b5ad-d974f232b2ad', // Grade 8
    ],
  };

  // 2. GRADE 9 KJSEA THIRD TRIAL TERM 3 2026 (class_id = Grade 9 Class UUID)
  const grade9ThirdTrialExam: Examination = {
    id: 'd6817f6e-16aa-415a-a985-fe139eb39582',
    exam_name: 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Draft',
    exam_type: 'Mid-Term',
    max_marks: 100,
    class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c', // Grade 9
    education_level: 'Junior School',
    applicable_classes: [],
  };

  it('Test 1: SBA -> Grade 7 matches explicitly via applicable_classes', () => {
    expect(isClassInExamScope(grade7Class, sbaExam)).toBe(true);
  });

  it('Test 2: SBA -> Grade 8 matches explicitly via applicable_classes', () => {
    expect(isClassInExamScope(grade8Class, sbaExam)).toBe(true);
  });

  it('Test 3: SBA -> Grade 9 fails because Grade 9 is excluded from applicable_classes, overriding level fallback', () => {
    expect(isClassInExamScope(grade9Class, sbaExam)).toBe(false);
  });

  it('Test 4: Grade 9 Third Trial -> Grade 7 fails because Grade 7 is not the direct target class_id', () => {
    expect(isClassInExamScope(grade7Class, grade9ThirdTrialExam)).toBe(false);
  });

  it('Test 5: Grade 9 Third Trial -> Grade 8 fails because Grade 8 is not the direct target class_id', () => {
    expect(isClassInExamScope(grade8Class, grade9ThirdTrialExam)).toBe(false);
  });

  it('Test 6: Grade 9 Third Trial -> Grade 9 matches explicitly via class_id', () => {
    expect(isClassInExamScope(grade9Class, grade9ThirdTrialExam)).toBe(true);
  });

  it('Regression Test 1: Level-wide exam with no explicit targeting matches all classes in the level', () => {
    const levelWideExam: Examination = {
      id: 'level-wide-js',
      exam_name: 'Junior School Practice Test',
      term: 'Term 3',
      year: 2026,
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      class_id: null as any,
      education_level: 'Junior School',
      applicable_classes: [],
    };

    expect(isClassInExamScope(grade7Class, levelWideExam)).toBe(true);
    expect(isClassInExamScope(grade8Class, levelWideExam)).toBe(true);
    expect(isClassInExamScope(grade9Class, levelWideExam)).toBe(true);
  });
});
