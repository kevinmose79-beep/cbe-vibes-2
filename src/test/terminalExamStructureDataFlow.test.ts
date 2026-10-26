import { describe, it, expect } from 'vitest';
import {
  filterEligibleTerminalAssessments,
  discoverTerminalAssessments,
} from '../services/terminalAssessmentDiscovery';
import { filterMeritContributingAssessments } from '../components/terminal/TerminalResultsView';
import { Examination, Student, ClassStream } from '../types';
import { ContributingAssessmentRef } from '../services/terminalResultsEngine';

describe('Step 1: Terminal Results Exam Structure & Agriculture Data Flow', () => {
  const mockClassStream: ClassStream = {
    id: 'class-g6-east',
    stream_id: 'stream-g6-east-uuid',
    class_name: 'Grade 6',
    stream: 'East',
    education_level: 'Upper Primary',
    status: 'Active',
  };

  const mockStudent: Student = {
    id: 'std-brian',
    first_name: 'Brian',
    last_name: 'Ochieng',
    full_name: 'Brian Ochieng',
    gender: 'M',
    admission_number: 'ADM-601',
    class_id: 'class-g6-east',
    stream_id: 'stream-g6-east-uuid',
    grade: 'Grade 6',
    education_level: 'Upper Primary',
    active: true,
    enrolment_status: 'active',
    admission_date: '2026-01-05',
    intake_year: 2026,
    intake_term: 'Term 1',
  };

  const createBaseExam = (overrides: Partial<Examination>): Examination => ({
    id: 'exam-' + Math.random().toString(36).substring(2, 9),
    exam_name: 'Upper Primary Exam',
    term: 'Term 1',
    year: 2026,
    academic_year_id: 'year-2026-uuid',
    term_id: 'term-1-uuid',
    status: 'Approved',
    exam_type: 'CAT',
    max_marks: 100,
    start_date: '2026-02-15',
    education_level: 'Upper Primary',
    approved_classes: ['stream-g6-east-uuid'],
    ...overrides,
  });

  describe('Requirement 1 & 2: assessment_structure retention', () => {
    it('Composite exam retains assessment_structure: "Composite"', async () => {
      const exam = createBaseExam({
        id: 'exam-composite-up',
        exam_name: 'Grade 6 Opener (Composite)',
        assessment_structure: 'Composite',
      });

      const contributing = filterEligibleTerminalAssessments([exam], {
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
      });

      expect(contributing).toHaveLength(1);
      expect(contributing[0].assessment_structure).toBe('Composite');

      // Also verify via full discovery pipeline
      const discovery = await discoverTerminalAssessments({
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
        examinations: [exam],
      });
      expect(discovery.contributingAssessments[0].assessment_structure).toBe('Composite');
    });

    it('Standalone exam retains assessment_structure: "Standalone"', async () => {
      const exam = createBaseExam({
        id: 'exam-standalone-up',
        exam_name: 'Grade 6 Mid-Term (Standalone)',
        assessment_structure: 'Standalone',
      });

      const contributing = filterEligibleTerminalAssessments([exam], {
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
      });

      expect(contributing).toHaveLength(1);
      expect(contributing[0].assessment_structure).toBe('Standalone');

      // Also verify via full discovery pipeline
      const discovery = await discoverTerminalAssessments({
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
        examinations: [exam],
      });
      expect(discovery.contributingAssessments[0].assessment_structure).toBe('Standalone');
    });
  });

  describe('Requirement 3 & 4: include_agriculture retention', () => {
    it('include_agriculture: true remains true', async () => {
      const exam = createBaseExam({
        id: 'exam-agri-true',
        exam_name: 'Grade 6 Assessment with Agriculture',
        assessment_structure: 'Composite',
        include_agriculture: true,
      });

      const contributing = filterEligibleTerminalAssessments([exam], {
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
      });

      expect(contributing).toHaveLength(1);
      expect(contributing[0].include_agriculture).toBe(true);

      const discovery = await discoverTerminalAssessments({
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
        examinations: [exam],
      });
      expect(discovery.contributingAssessments[0].include_agriculture).toBe(true);
    });

    it('include_agriculture: false remains false', async () => {
      const exam = createBaseExam({
        id: 'exam-agri-false',
        exam_name: 'Grade 6 Assessment without Agriculture',
        assessment_structure: 'Composite',
        include_agriculture: false,
      });

      const contributing = filterEligibleTerminalAssessments([exam], {
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
      });

      expect(contributing).toHaveLength(1);
      expect(contributing[0].include_agriculture).toBe(false);

      const discovery = await discoverTerminalAssessments({
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
        examinations: [exam],
      });
      expect(discovery.contributingAssessments[0].include_agriculture).toBe(false);
    });
  });

  describe('Requirement 5: missing or null legacy values handling', () => {
    it('missing/undefined values remain undefined without inventing defaults', () => {
      const legacyExam = createBaseExam({
        id: 'exam-legacy-missing',
        exam_name: 'Historical Assessment 2025',
        // Neither assessment_structure nor include_agriculture specified
      });

      const contributing = filterEligibleTerminalAssessments([legacyExam], {
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
      });

      expect(contributing).toHaveLength(1);
      expect(contributing[0].assessment_structure).toBeUndefined();
      expect(contributing[0].include_agriculture).toBeUndefined();
    });

    it('explicit null values from legacy database rows remain null', () => {
      const legacyExam = createBaseExam({
        id: 'exam-legacy-nulls',
        exam_name: 'Legacy Assessment Null Fields',
        assessment_structure: null as any,
        include_agriculture: null as any,
      });

      const contributing = filterEligibleTerminalAssessments([legacyExam], {
        academicYearId: 'year-2026-uuid',
        termId: 'term-1-uuid',
        student: mockStudent,
        classStream: mockClassStream,
      });

      expect(contributing).toHaveLength(1);
      expect(contributing[0].assessment_structure).toBeNull();
      expect(contributing[0].include_agriculture).toBeNull();
    });
  });

  describe('Requirement 6: filterMeritContributingAssessments preserves both fields', () => {
    it('does not silently discard assessment_structure or include_agriculture when filtering merit assessments', () => {
      const compositeExam = createBaseExam({
        id: 'exam-merit-composite',
        exam_name: 'Grade 6 Composite Merit Exam',
        assessment_structure: 'Composite',
        include_agriculture: true,
      });

      const standaloneExam = createBaseExam({
        id: 'exam-merit-standalone',
        exam_name: 'Grade 6 Standalone Merit Exam',
        assessment_structure: 'Standalone',
        include_agriculture: false,
      });

      const legacyExam = createBaseExam({
        id: 'exam-merit-legacy',
        exam_name: 'Grade 6 Legacy Exam',
        assessment_structure: undefined,
        include_agriculture: undefined,
      });

      const meritRefs: ContributingAssessmentRef[] = filterMeritContributingAssessments({
        exams: [compositeExam, standaloneExam, legacyExam],
        viewingYear: { year: 2026, id: 'year-2026-uuid' },
        viewingTerm: { term_name: 'Term 1', id: 'term-1-uuid' },
        meritGrade: 'Grade 6',
        isStaff: true,
        classes: [mockClassStream],
      });

      expect(meritRefs).toHaveLength(3);

      const compositeRef = meritRefs.find((r) => r.id === 'exam-merit-composite');
      const standaloneRef = meritRefs.find((r) => r.id === 'exam-merit-standalone');
      const legacyRef = meritRefs.find((r) => r.id === 'exam-merit-legacy');

      expect(compositeRef).toBeDefined();
      expect(compositeRef?.assessment_structure).toBe('Composite');
      expect(compositeRef?.include_agriculture).toBe(true);

      expect(standaloneRef).toBeDefined();
      expect(standaloneRef?.assessment_structure).toBe('Standalone');
      expect(standaloneRef?.include_agriculture).toBe(false);

      expect(legacyRef).toBeDefined();
      expect(legacyRef?.assessment_structure).toBeUndefined();
      expect(legacyRef?.include_agriculture).toBeUndefined();
    });
  });
});
