import './setupLocalStorage';
import { describe, it, expect, beforeEach } from 'vitest';
import { api, initDatabase, setStorage, KEYS, getStorage } from '../lib/storage';
import { Examination, User, AcademicYear, SchoolTerm } from '../types';

describe('api.updateExamination approved_classes Persistence & Scope Test Suite', () => {
  const ayUuid = '44444444-5555-6666-7777-888888888888';
  const termUuid = '99999999-aaaa-bbbb-cccc-dddddddddddd';

  const mockAy: AcademicYear = {
    id: ayUuid,
    year: 2026,
    status: 'Active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  };

  const mockTerm: SchoolTerm = {
    id: termUuid,
    academic_year_id: ayUuid,
    year: 2026,
    term_name: 'Term 3',
    status: 'Active',
    opening_date: '2026-09-01',
    closing_date: '2026-11-30',
  };

  const mockAdminUser: User = {
    id: 'usr_admin_1',
    username: 'admin',
    name: 'Administrator',
    email: 'admin@school.ac.ke',
    role: 'admin',
  };

  beforeEach(() => {
    setStorage(KEYS.ACADEMIC_YEARS, [mockAy]);
    setStorage(KEYS.SCHOOL_TERMS, [mockTerm]);
  });

  it('A. Retains existing approved_classes and approved_levels when edited via updateExamination', async () => {
    const existingExam: Examination = {
      id: 'ex_approved_test_01',
      exam_name: 'Grade 6 KPSEA Test Approved Persistence',
      academic_year_id: ayUuid,
      term_id: termUuid,
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: true,
      approved_classes: ['cls_g6_b'],
      approved_levels: ['Upper Primary'],
    };

    setStorage(KEYS.EXAMS, [existingExam]);

    // Perform update
    const updatePayload: Examination = {
      ...existingExam,
      exam_name: 'Grade 6 KPSEA Test Approved Persistence Title Updated',
    };

    const updatedResult = await api.updateExamination(updatePayload, mockAdminUser);

    expect(updatedResult.approved_classes).toEqual(['cls_g6_b']);
    expect(updatedResult.approved_levels).toEqual(['Upper Primary']);

    // Check storage reload
    const stored = getStorage<Examination[]>(KEYS.EXAMS, []);
    const reloaded = stored.find((e) => e.id === existingExam.id);
    expect(reloaded?.approved_classes).toEqual(['cls_g6_b']);
    expect(reloaded?.approved_levels).toEqual(['Upper Primary']);
  });

  it('B. Explicitly changed approved_classes in updatePayload are persisted correctly', async () => {
    const existingExam: Examination = {
      id: 'ex_approved_test_02',
      exam_name: 'Grade 6 KPSEA Test Approved Changes',
      academic_year_id: ayUuid,
      term_id: termUuid,
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: true,
      approved_classes: ['cls_g6_b'],
      approved_levels: ['Upper Primary'],
    };

    setStorage(KEYS.EXAMS, [existingExam]);

    const updatePayload: Examination = {
      ...existingExam,
      approved_classes: ['cls_g6_b', 'cls_g6_r'],
    };

    const updatedResult = await api.updateExamination(updatePayload, mockAdminUser);

    expect(updatedResult.approved_classes).toEqual(['cls_g6_b', 'cls_g6_r']);

    const stored = getStorage<Examination[]>(KEYS.EXAMS, []);
    const reloaded = stored.find((e) => e.id === existingExam.id);
    expect(reloaded?.approved_classes).toEqual(['cls_g6_b', 'cls_g6_r']);
  });

  it('C. education_level behavior remains intact (Upper Primary -> Upper Primary, All Levels -> undefined)', async () => {
    const examWithLevel: Examination = {
      id: 'ex_level_test_01',
      exam_name: 'Target Level Exam',
      education_level: 'Upper Primary',
      max_marks: 100,
      term: 'Term 3',
      year: 2026,
      status: 'Draft',
      exam_type: 'Mid-Term',
    };

    setStorage(KEYS.EXAMS, [examWithLevel]);

    const updated1 = await api.updateExamination({ ...examWithLevel, education_level: 'Upper Primary' }, mockAdminUser);
    expect(updated1.education_level).toBe('Upper Primary');

    const updated2 = await api.updateExamination({ ...examWithLevel, education_level: undefined }, mockAdminUser);
    expect(updated2.education_level).toBeUndefined();
  });

  it('D, E, F, G. applicable_classes, class_id, assessment_structure, and include_agriculture behavior remain intact', async () => {
    const fullExam: Examination = {
      id: 'ex_full_test_01',
      exam_name: 'Full Field Verification Exam',
      term: 'Term 3',
      year: 2026,
      status: 'Draft',
      exam_type: 'Mid-Term',
      education_level: 'Upper Primary',
      max_marks: 100,
      class_id: undefined,
      applicable_classes: ['cls_g6_b'],
      assessment_structure: 'Composite',
      include_agriculture: true,
      approved_classes: [],
      approved_levels: [],
    };

    setStorage(KEYS.EXAMS, [fullExam]);

    const updated = await api.updateExamination({ ...fullExam, max_marks: 100 }, mockAdminUser);

    expect(updated.class_id).toBeUndefined();
    expect(updated.applicable_classes).toEqual(['cls_g6_b']);
    expect(updated.assessment_structure).toBe('Composite');
    expect(updated.include_agriculture).toBe(true);
    expect(updated.approved_classes).toEqual([]);
    expect(updated.approved_levels).toEqual([]);
  });
});
