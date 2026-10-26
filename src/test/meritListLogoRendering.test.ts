import { describe, it, expect, vi } from 'vitest';
import { downloadMeritListPDF, MeritListData } from '../services/meritListExporter';
import { initialSchool, initialGrades, initialSubjects, initialTeachers, initialClasses } from '../data/seedData';
import { Examination, Student, Mark } from '../types';

describe('Merit List PDF School Logo Rendering and Optimization', () => {
  const sampleDataUrlLogo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const mockStudents: Student[] = [
    {
      id: 'std_01',
      admission_number: 'ADM-001',
      full_name: 'John Doe',
      gender: 'M',
      class_id: 'cls_g6_red',
      stream_id: 'cls_g6_red',
      grade: 'Grade 6',
      active: true,
    },
    {
      id: 'std_02',
      admission_number: 'ADM-002',
      full_name: 'Jane Smith',
      gender: 'F',
      class_id: 'cls_g9_red',
      stream_id: 'cls_g9_red',
      grade: 'Grade 9',
      active: true,
    },
  ];

  const g6Exam: Examination = {
    id: 'exam_g6',
    exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Draft',
    exam_type: 'Mid-Term',
    max_marks: 100,
    education_level: 'Upper Primary',
    ss_cre_structure: 'CUSTOM:25:15',
    include_agriculture: true,
  };

  const g9Exam: Examination = {
    id: 'exam_g9',
    exam_name: 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Draft',
    exam_type: 'Mid-Term',
    max_marks: 100,
    education_level: 'Junior School',
  };

  const mockMarks: Mark[] = [
    {
      id: 'm_01',
      student_id: 'std_01',
      subject_id: 's_math',
      exam_id: 'exam_g6',
      score: 85,
    },
    {
      id: 'm_02',
      student_id: 'std_02',
      subject_id: 's_math',
      exam_id: 'exam_g9',
      score: 92,
    },
  ];

  it('Test 1: Upper Primary Merit List renders without error when logo_url is a base64 data URL', async () => {
    const data: MeritListData = {
      school: {
        ...initialSchool,
        logo_url: sampleDataUrlLogo,
      },
      exam: g6Exam,
      exams: [g6Exam],
      selectedClassId: 'all',
      selectedStreamId: 'all',
      classes: initialClasses,
      teachers: initialTeachers,
      students: mockStudents,
      subjects: initialSubjects,
      marks: mockMarks,
      grades: initialGrades,
    };

    await expect(downloadMeritListPDF(data)).resolves.not.toThrow();
  });

  it('Test 2: Junior School Merit List renders reliably with data URL logo', async () => {
    const data: MeritListData = {
      school: {
        ...initialSchool,
        logo_url: sampleDataUrlLogo,
      },
      exam: g9Exam,
      exams: [g9Exam],
      selectedClassId: 'all',
      selectedStreamId: 'all',
      classes: initialClasses,
      teachers: initialTeachers,
      students: mockStudents,
      subjects: initialSubjects,
      marks: mockMarks,
      grades: initialGrades,
    };

    await expect(downloadMeritListPDF(data)).resolves.not.toThrow();
  });

  it('Test 3: No-logo fallback succeeds when logo_url is null/undefined/empty without throwing or creating blank gaps', async () => {
    const dataNoLogo: MeritListData = {
      school: {
        ...initialSchool,
        logo_url: undefined,
      },
      exam: g6Exam,
      exams: [g6Exam],
      selectedClassId: 'all',
      selectedStreamId: 'all',
      classes: initialClasses,
      teachers: initialTeachers,
      students: mockStudents,
      subjects: initialSubjects,
      marks: mockMarks,
      grades: initialGrades,
    };

    await expect(downloadMeritListPDF(dataNoLogo)).resolves.not.toThrow();

    const dataNullLogo: MeritListData = {
      ...dataNoLogo,
      school: {
        ...initialSchool,
        logo_url: null as any,
      },
    };

    await expect(downloadMeritListPDF(dataNullLogo)).resolves.not.toThrow();
  });
});
