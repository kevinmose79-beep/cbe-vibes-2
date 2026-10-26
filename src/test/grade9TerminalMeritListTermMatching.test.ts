import { describe, it, expect } from 'vitest';
import {
  isExamMatchingTerm,
  filterMeritContributingAssessments,
} from '../components/terminal/TerminalResultsView';
import { Examination, ClassStream } from '../types';

describe('Grade 9 Terminal Merit List Term Matching & Assessment Filtering', () => {
  const term3Uuid = '4da99451-11a0-4488-b84f-086bff5e2126';
  const term2Uuid = 'b1b46b17-c979-4824-aad7-31545b5ef212';
  const term1Uuid = '53b37694-bb12-426f-bac0-1eba3ca3d9c8';
  const academicYear2026Id = '69ebb4c9-8f38-43ec-81c1-bb41d7488363';

  const viewingYear2026 = {
    id: academicYear2026Id,
    year: 2026,
  };

  const viewingTerm3 = {
    id: term3Uuid,
    term_name: 'Term 3',
  };

  const mockClasses: ClassStream[] = [
    {
      id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      class_name: 'Grade 9',
      stream: 'Blue',
      stream_id: 'str-g9-blue',
      education_level: 'Junior School',
    },
    {
      id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      class_name: 'Grade 9',
      stream: 'Red',
      stream_id: 'str-g9-red',
      education_level: 'Junior School',
    },
    {
      id: 'b05f2767-ed87-44b2-854d-9b5ac54756d9',
      class_name: 'Grade 7',
      stream: 'Blue',
      stream_id: 'str-g7-blue',
      education_level: 'Junior School',
    },
    {
      id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad',
      class_name: 'Grade 8',
      stream: 'Red',
      stream_id: 'str-g8-red',
      education_level: 'Junior School',
    },
  ];

  // Test 1: A selected Term 3 UUID matches an examination with the same term_id, even if the UUID differs from the term name
  it('1. Selected Term 3 UUID matches an examination with the same term_id, even if UUID differs from term name', () => {
    const examWithTermIdOnly = {
      term_id: term3Uuid,
      term: 'Custom Label / Discrepant Name' as any,
    };
    expect(isExamMatchingTerm(examWithTermIdOnly, viewingTerm3)).toBe(true);

    const examWithUuidAndNoTerm = {
      term_id: term3Uuid,
    };
    expect(isExamMatchingTerm(examWithUuidAndNoTerm, viewingTerm3)).toBe(true);
  });

  // Test 2: A legacy examination with term: "Term 3" and no term_id matches Term 3
  it('2. Legacy examination with term: "Term 3" and no term_id matches Term 3', () => {
    const legacyExam = {
      term: 'Term 3' as any,
    };
    expect(isExamMatchingTerm(legacyExam, viewingTerm3)).toBe(true);

    // Case-insensitivity check
    const legacyExamLowerCase = {
      term: 'term 3' as any,
    };
    expect(isExamMatchingTerm(legacyExamLowerCase, viewingTerm3)).toBe(true);
  });

  // Test 3: A Term 2 examination does not match Term 3
  it('3. Term 2 examination does not match Term 3', () => {
    const term2Exam = {
      term_id: term2Uuid,
      term: 'Term 2' as any,
    };
    expect(isExamMatchingTerm(term2Exam, viewingTerm3)).toBe(false);

    const term2LegacyExam = {
      term: 'Term 2' as any,
    };
    expect(isExamMatchingTerm(term2LegacyExam, viewingTerm3)).toBe(false);
  });

  // Test 4: A different term UUID does not match merely because both records contain non-empty term IDs
  it('4. Different term UUID does not match merely because both records contain non-empty term IDs', () => {
    const differentUuidExam = {
      term_id: '11111111-2222-3333-4444-555555555555',
      term: 'Term 3' as any,
    };
    expect(isExamMatchingTerm(differentUuidExam, viewingTerm3)).toBe(false);

    const term1Exam = {
      term_id: term1Uuid,
      term: 'Term 1' as any,
    };
    expect(isExamMatchingTerm(term1Exam, viewingTerm3)).toBe(false);
  });

  // Test 5: Missing term data does not accidentally match every term
  it('5. Missing term data does not accidentally match every term', () => {
    expect(isExamMatchingTerm({}, viewingTerm3)).toBe(false);
    expect(isExamMatchingTerm({ term_id: '', term: '' as any }, viewingTerm3)).toBe(false);
    expect(isExamMatchingTerm({ term_id: '   ' }, viewingTerm3)).toBe(false);

    const validExam = { term_id: term3Uuid, term: 'Term 3' as any };
    expect(isExamMatchingTerm(validExam, null)).toBe(false);
    expect(isExamMatchingTerm(validExam, undefined)).toBe(false);
    expect(isExamMatchingTerm(validExam, { id: '', term_name: '' })).toBe(false);
  });

  // Test 6: Academic-year, grade and stream filters remain effective
  it('6. Academic-year, grade and stream filters remain effective', () => {
    const grade8Exam: Examination = {
      id: 'ex-g8',
      exam_name: 'Grade 8 Midterm',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      class_id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad', // Grade 8 class
    };

    const year2025Exam: Examination = {
      id: 'ex-2025',
      exam_name: 'GRADE 9 2025 Exam',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2025,
      academic_year_id: 'f64f3abd-b9be-4ca4-b857-d59a8d36d2f1',
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
    };

    const sbaMultiClassExam: Examination = {
      id: '94257bd6-cd77-4e16-966c-89b82634a36b',
      exam_name: 'SBA KNEC Assessment Junior 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Junior School',
      applicable_classes: [
        'b05f2767-ed87-44b2-854d-9b5ac54756d9', // Grade 7
        'c79816ee-1324-4abb-b5ad-d974f232b2ad', // Grade 8
      ],
    };

    const res = filterMeritContributingAssessments({
      exams: [grade8Exam, year2025Exam, sbaMultiClassExam],
      viewingYear: viewingYear2026,
      viewingTerm: viewingTerm3,
      meritGrade: 'Grade 9',
      isStaff: true,
      isProvisionalMode: false,
      classes: mockClasses,
    });

    expect(res).toEqual([]);
  });

  // Test 7: Official Mode includes the two approved Grade 9 trials and excludes the provisional Opener
  it('7. Official Mode includes the two approved Grade 9 trials and excludes the provisional Opener', () => {
    const openerExam: Examination = {
      id: '0b7d0d82-2014-4d55-a067-d045b3b289e2',
      exam_name: 'Grade 9 Opener Assessment Term 3 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      education_level: 'Junior School',
    };

    const secondTrial: Examination = {
      id: 'd510e285-d5b9-4a42-9bd1-94ffbb3587ce',
      exam_name: 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      education_level: 'Junior School',
    };

    const thirdTrial: Examination = {
      id: 'd6817f6e-16aa-415a-a985-fe139eb39582',
      exam_name: 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      education_level: 'Junior School',
    };

    const officialAssessments = filterMeritContributingAssessments({
      exams: [openerExam, secondTrial, thirdTrial],
      viewingYear: viewingYear2026,
      viewingTerm: viewingTerm3,
      meritGrade: 'Grade 9',
      isStaff: true,
      isProvisionalMode: false,
      classes: mockClasses,
    });

    expect(officialAssessments.map((a) => a.id)).toEqual([secondTrial.id, thirdTrial.id]);
    expect(officialAssessments.find((a) => a.id === openerExam.id)).toBeUndefined();
    expect(officialAssessments).toHaveLength(2);
  });

  // Test 8: Provisional Mode includes the two approved trials and the provisional Opener
  it('8. Provisional Mode includes the two approved trials and the provisional Opener', () => {
    const openerExam: Examination = {
      id: '0b7d0d82-2014-4d55-a067-d045b3b289e2',
      exam_name: 'Grade 9 Opener Assessment Term 3 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      education_level: 'Junior School',
    };

    const secondTrial: Examination = {
      id: 'd510e285-d5b9-4a42-9bd1-94ffbb3587ce',
      exam_name: 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      education_level: 'Junior School',
    };

    const thirdTrial: Examination = {
      id: 'd6817f6e-16aa-415a-a985-fe139eb39582',
      exam_name: 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026',
      term: 'Term 3',
      term_id: term3Uuid,
      year: 2026,
      academic_year_id: academicYear2026Id,
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
      class_id: '0e49e9b0-0a82-4f4b-9109-685b0103a54c',
      education_level: 'Junior School',
    };

    const provisionalAssessments = filterMeritContributingAssessments({
      exams: [openerExam, secondTrial, thirdTrial],
      viewingYear: viewingYear2026,
      viewingTerm: viewingTerm3,
      meritGrade: 'Grade 9',
      isStaff: true,
      isProvisionalMode: true,
      classes: mockClasses,
    });

    expect(provisionalAssessments.map((a) => a.id)).toEqual([
      openerExam.id,
      secondTrial.id,
      thirdTrial.id,
    ]);
    expect(provisionalAssessments).toHaveLength(3);
  });
});
