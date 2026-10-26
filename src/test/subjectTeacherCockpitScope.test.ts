import { describe, it, expect } from 'vitest';
import { ClassStream, Examination, Teacher } from '../types';
import { isClassInExamScope } from '../utils/filterUtils';

describe('Subject Teacher Cockpit Scope Integrity', () => {
  const grade7RedClass: ClassStream = {
    id: 'b05f2767-ed87-44b2-854d-9b5ac54756d9',
    stream_id: '6fb92a1a-7e30-4022-b536-9ce1005b46c7',
    class_name: 'Grade 7',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const francisTeacher: Teacher = {
    id: '12699b07-cb2f-4f19-89dc-cbfd7efd3bfa',
    teacher_name: 'Francis',
    email: 'francis@school.ac.ke',
    phone: '+254700000000',
    is_class_teacher: false,
    allocations: [
      {
        id: 'alloc_francis_1',
        subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f',
        class_id: 'b05f2767-ed87-44b2-854d-9b5ac54756d9',
        stream_id: '6fb92a1a-7e30-4022-b536-9ce1005b46c7',
        class_name: 'Grade 7',
        stream: 'Red',
        education_level: 'Junior School',
      },
    ],
  };

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

  const sbaJuniorExam: Examination = {
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

  const allSchoolExams = [grade9ThirdTrialExam, sbaJuniorExam];

  it('filters candidate exams to only those applicable to Francis assigned class', () => {
    const assignedClasses = [grade7RedClass];
    const applicableExams = allSchoolExams.filter((e) =>
      assignedClasses.some((cls) => isClassInExamScope(cls, e))
    );

    expect(applicableExams.length).toBe(1);
    expect(applicableExams[0].exam_name).toBe('SBA KNEC Assessment Junior 2026');
    expect(applicableExams.some((e) => e.exam_name === 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026')).toBe(false);
  });

  it('excludes out-of-scope allocations from being linked to an exam not targeting that class', () => {
    // If activeExam is Grade 9 Third Trial, Grade 7 Red is NOT in scope
    expect(isClassInExamScope(grade7RedClass, grade9ThirdTrialExam)).toBe(false);

    // If activeExam is SBA Junior, Grade 7 Red IS in scope
    expect(isClassInExamScope(grade7RedClass, sbaJuniorExam)).toBe(true);
  });
});
