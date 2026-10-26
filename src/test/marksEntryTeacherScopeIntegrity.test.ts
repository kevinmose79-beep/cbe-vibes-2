import { describe, it, expect } from 'vitest';
import { ClassStream, Examination, Teacher, Subject, User } from '../types';
import { isClassInExamScope } from '../utils/filterUtils';
import { getAccessibleClasses, getAccessibleSubjects } from '../utils/rbacUtils';

describe('Marks Entry Teacher Scope Integrity', () => {
  const grade7RedClass: ClassStream = {
    id: 'b05f2767-ed87-44b2-854d-9b5ac54756d9',
    stream_id: '6fb92a1a-7e30-4022-b536-9ce1005b46c7',
    class_name: 'Grade 7',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const grade9RedClass: ClassStream = {
    id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
    stream_id: '95e8ff02-6d67-433f-a417-2d74e2012793',
    class_name: 'Grade 9',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const agricultureSubject: Subject = {
    id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f',
    subject_name: 'Agriculture',
    subject_code: 'AGN',
    category: 'Core',
    education_level: 'Grade 4–9',
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

  const francisUser: User = {
    id: 'user_francis',
    name: 'Francis',
    role: 'subject_teacher',
    email: 'francis@cbe.ac.ke',
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

  const sbaPrimaryExam: Examination = {
    id: '71fdb671-9438-4834-b0fc-f61d67c24e90',
    exam_name: 'SBA KNEC Assessment Primary 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Draft',
    exam_type: 'Mid-Term',
    max_marks: 100,
    class_id: null as any,
    education_level: null as any,
    applicable_classes: [],
  };

  const allClasses = [grade7RedClass, grade9RedClass];
  const allSubjects = [agricultureSubject];
  const allExams = [grade9ThirdTrialExam, sbaJuniorExam, sbaPrimaryExam];

  it('correctly filters entryExams for a subject teacher to only relevant assessments', () => {
    const accessibleClasses = getAccessibleClasses(francisUser, francisTeacher, allClasses);
    expect(accessibleClasses.length).toBe(1);
    expect(accessibleClasses[0].class_name).toBe('Grade 7');

    const entryExams = allExams.filter((ex) => {
      return accessibleClasses.some((c) => {
        if (!isClassInExamScope(c, ex)) return false;
        const classSubs = getAccessibleSubjects(francisUser, francisTeacher, allSubjects, c.stream_id || c.id, allClasses, ex);
        return classSubs.length > 0;
      });
    });

    expect(entryExams.length).toBe(1);
    expect(entryExams[0].exam_name).toBe('SBA KNEC Assessment Junior 2026');
    expect(entryExams.some((e) => e.exam_name === 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026')).toBe(false);
    expect(entryExams.some((e) => e.exam_name === 'SBA KNEC Assessment Primary 2026')).toBe(false);
  });
});
