import { describe, it, expect } from 'vitest';
import {
  isExamMatchingTerm,
  filterMeritContributingAssessments,
} from './TerminalResultsView';
import { Examination, ClassStream } from '../../types';

describe('Grade 9 Terminal Merit List Term Matching & Discovery', () => {
  const viewingYear2026 = {
    id: '69ebb4c9-8f38-43ec-81c1-bb41d7488363',
    year: 2026,
  };

  const viewingTerm3 = {
    id: '4da99451-11a0-4488-b84f-086bff5e2126',
    term_name: 'Term 3',
  };

  const grade9Classes: ClassStream[] = [
    {
      id: 'grade9-blue-id',
      class_name: 'Grade 9',
      stream: 'Blue',
      education_level: 'Junior School',
      stream_id: 'stream-blue-id',
    },
    {
      id: 'grade9-red-id',
      class_name: 'Grade 9',
      stream: 'Red',
      education_level: 'Junior School',
      stream_id: 'stream-red-id',
    },
  ];

  describe('isExamMatchingTerm', () => {
    it('Requirement 1: Matches selected Term 3 UUID when e.term_id matches viewingTerm.id even if UUID differs from term name', () => {
      const exam = {
        term_id: '4da99451-11a0-4488-b84f-086bff5e2126',
        term: 'Different Label',
      };
      expect(isExamMatchingTerm(exam, viewingTerm3)).toBe(true);
    });

    it('Requirement 2: Matches legacy examination with term: "Term 3" and no term_id', () => {
      const exam = {
        term: 'Term 3',
      };
      expect(isExamMatchingTerm(exam, viewingTerm3)).toBe(true);
    });

    it('Requirement 2 (case-insensitive): Matches "term 3" against "Term 3"', () => {
      const exam = {
        term: 'term 3',
      };
      expect(isExamMatchingTerm(exam, viewingTerm3)).toBe(true);
    });

    it('Requirement 3: Term 2 examination does not match Term 3', () => {
      const exam = {
        term_id: 'term-2-uuid',
        term: 'Term 2',
      };
      expect(isExamMatchingTerm(exam, viewingTerm3)).toBe(false);
    });

    it('Requirement 4: Different term UUID does not match merely because both contain non-empty term IDs', () => {
      const exam = {
        term_id: '11111111-2222-3333-4444-555555555555',
        term: 'Term 3', // Both have UUIDs, so UUID mismatch strictly rejects
      };
      expect(isExamMatchingTerm(exam, viewingTerm3)).toBe(false);
    });

    it('Requirement 5: Missing or empty term data does not match every term', () => {
      expect(isExamMatchingTerm({}, viewingTerm3)).toBe(false);
      expect(isExamMatchingTerm({ term: '', term_id: '' }, viewingTerm3)).toBe(false);
      expect(isExamMatchingTerm({ term: 'Term 3' }, null)).toBe(false);
      expect(isExamMatchingTerm({ term: 'Term 3' }, undefined)).toBe(false);
      expect(isExamMatchingTerm({ term: 'Term 3' }, { id: '', term_name: '' })).toBe(false);
    });

    it('Requirement 3 & 4: Safe legacy fallback for non-UUID e.term_id matching term_name', () => {
      const legacyExam = {
        term_id: 'Term 3', // legacy non-UUID ID
      };
      expect(isExamMatchingTerm(legacyExam, viewingTerm3)).toBe(true);
    });
  });

  describe('filterMeritContributingAssessments', () => {
    const trial2: Examination = {
      id: 'trial-2-id',
      exam_name: 'GRADE 9 KJSEA SECOND TRIAL',
      academic_year_id: '69ebb4c9-8f38-43ec-81c1-bb41d7488363',
      year: 2026,
      term_id: '4da99451-11a0-4488-b84f-086bff5e2126',
      term: 'Term 3',
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Junior School',
      applicable_classes: ['grade9-blue-id', 'grade9-red-id'],
      created_at: '2026-09-01',
    };

    const trial3: Examination = {
      id: 'trial-3-id',
      exam_name: 'THIRD TRIAL TERM 3 2026',
      academic_year_id: '69ebb4c9-8f38-43ec-81c1-bb41d7488363',
      year: 2026,
      term_id: '4da99451-11a0-4488-b84f-086bff5e2126',
      term: 'Term 3',
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Junior School',
      applicable_classes: ['grade9-blue-id', 'grade9-red-id'],
      created_at: '2026-10-01',
    };

    const openerProvisional: Examination = {
      id: 'opener-id',
      exam_name: 'Grade 9 Opener Assessment Term 3 2026',
      academic_year_id: '69ebb4c9-8f38-43ec-81c1-bb41d7488363',
      year: 2026,
      term_id: '4da99451-11a0-4488-b84f-086bff5e2126',
      term: 'Term 3',
      status: 'Provisional',
      exam_type: 'Opener',
      max_marks: 100,
      education_level: 'Junior School',
      applicable_classes: ['grade9-blue-id', 'grade9-red-id'],
      created_at: '2026-08-01',
    };

    const grade8Exam: Examination = {
      id: 'g8-exam-id',
      exam_name: 'Grade 8 Midterm Term 3 2026',
      academic_year_id: '69ebb4c9-8f38-43ec-81c1-bb41d7488363',
      year: 2026,
      term_id: '4da99451-11a0-4488-b84f-086bff5e2126',
      term: 'Term 3',
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Junior School',
      applicable_classes: ['grade8-class-id'],
      created_at: '2026-09-10',
    };

    const term2Exam: Examination = {
      id: 't2-exam-id',
      exam_name: 'GRADE 9 KJSEA FIRST TRIAL TERM 2',
      academic_year_id: '69ebb4c9-8f38-43ec-81c1-bb41d7488363',
      year: 2026,
      term_id: 'term-2-uuid',
      term: 'Term 2',
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Junior School',
      applicable_classes: ['grade9-blue-id', 'grade9-red-id'],
      created_at: '2026-05-01',
    };

    it('Requirement 7: Official Mode includes the two approved Grade 9 trials and excludes provisional Opener', () => {
      const exams = [trial2, trial3, openerProvisional, grade8Exam, term2Exam];
      const results = filterMeritContributingAssessments({
        exams,
        viewingYear: viewingYear2026,
        viewingTerm: viewingTerm3,
        meritGrade: 'Grade 9',
        isStaff: true,
        isProvisionalMode: false,
        classes: grade9Classes,
      });

      expect(results.map((r) => r.id)).toEqual(['trial-2-id', 'trial-3-id']);
    });

    it('Requirement 8: Provisional Mode includes the two approved trials AND the provisional Opener', () => {
      const exams = [trial2, trial3, openerProvisional, grade8Exam, term2Exam];
      const results = filterMeritContributingAssessments({
        exams,
        viewingYear: viewingYear2026,
        viewingTerm: viewingTerm3,
        meritGrade: 'Grade 9',
        isStaff: true,
        isProvisionalMode: true,
        classes: grade9Classes,
      });

      expect(results.map((r) => r.id)).toEqual(['trial-2-id', 'trial-3-id', 'opener-id']);
    });

    it('Requirement 6: Academic-year, grade, and stream filters remain fully effective', () => {
      // Different academic year
      const exams = [
        {
          ...trial2,
          year: 2025,
          academic_year_id: '2025-year-uuid',
        },
      ];
      const results = filterMeritContributingAssessments({
        exams,
        viewingYear: viewingYear2026,
        viewingTerm: viewingTerm3,
        meritGrade: 'Grade 9',
        isStaff: true,
        isProvisionalMode: false,
        classes: grade9Classes,
      });
      expect(results.length).toBe(0);
    });
  });
});
