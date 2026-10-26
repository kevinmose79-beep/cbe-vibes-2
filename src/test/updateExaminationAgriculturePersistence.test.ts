import './setupLocalStorage';
import { describe, it, expect, beforeEach } from 'vitest';
import { api, setStorage, getStorage, KEYS } from '../lib/storage';
import { Examination, ClassStream, Subject, User, AcademicYear, SchoolTerm } from '../types';
import { isAgricultureSubject, isAgricultureIncludedInCompositeExam } from '../utils/markUtils';
import { getAccessibleSubjects } from '../utils/rbacUtils';

describe('updateExamination Agriculture Persistence & Marks Entry Pipeline', () => {
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

  const classWithoutAgn: ClassStream = {
    id: 'cls_g6_no_agn_test',
    class_name: 'Grade 6',
    stream: 'East',
    stream_id: 'str_g6_no_agn',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_eng', 'sb_comp', 'sb_kis', 'sb_insha', 'sb_mat', 'sb_sci', 'sb_sst', 'sb_cre', 'sb_cas'],
  };

  const sampleSubjects: Subject[] = [
    { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core' },
    { id: 'sb_comp', subject_code: 'COMP', subject_name: 'English Composition', category: 'Core' },
    { id: 'sb_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core' },
    { id: 'sb_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', category: 'Core' },
    { id: 'sb_mat', subject_code: 'MATH', subject_name: 'Mathematics', category: 'Core' },
    { id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', category: 'Core' },
    { id: 'sb_sst', subject_code: 'SST', subject_name: 'Social Studies', category: 'Core' },
    { id: 'sb_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', category: 'Core' },
    { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', category: 'Core' },
    { id: 'sb_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', category: 'Core' },
  ];

  beforeEach(() => {
    setStorage(KEYS.ACADEMIC_YEARS, [mockAy]);
    setStorage(KEYS.SCHOOL_TERMS, [mockTerm]);
  });

  it('1. TRUE SEMANTICS: include_agriculture = true survives updateExamination and includes Agriculture in Marks Entry for unallocated class (/700)', async () => {
    const initialExam: Examination = {
      id: 'ex_persistence_test_1',
      exam_name: 'Grade 6 KPSEA Test 1',
      academic_year_id: ayUuid,
      term_id: termUuid,
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: undefined,
    };

    setStorage(KEYS.EXAMS, [initialExam]);

    // Admin updates examination to turn Include Agriculture ON
    const updatePayload: Examination = {
      ...initialExam,
      include_agriculture: true,
    };

    const updatedResult = await api.updateExamination(updatePayload, mockAdminUser);

    // Verify persistence
    expect(updatedResult.include_agriculture).toBe(true);

    // Reload from storage
    const storedList = getStorage<Examination[]>(KEYS.EXAMS, []);
    const reloaded = storedList.find((e) => e.id === initialExam.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.include_agriculture).toBe(true);

    // Verify Marks Entry Subject Pipeline
    const isAgnIncluded = isAgricultureIncludedInCompositeExam(reloaded, classWithoutAgn, sampleSubjects);
    expect(isAgnIncluded).toBe(true);

    const accessible = getAccessibleSubjects(
      mockAdminUser,
      null,
      sampleSubjects,
      classWithoutAgn.stream_id,
      [classWithoutAgn],
      reloaded
    );

    expect(accessible.some(isAgricultureSubject)).toBe(true);
  });

  it('2. FALSE SEMANTICS: include_agriculture = false survives updateExamination and excludes Agriculture (/600)', async () => {
    const initialExam: Examination = {
      id: 'ex_persistence_test_2',
      exam_name: 'Grade 6 KPSEA Test 2',
      academic_year_id: ayUuid,
      term_id: termUuid,
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: true,
    };

    setStorage(KEYS.EXAMS, [initialExam]);

    // Admin updates examination to turn Include Agriculture OFF
    const updatePayload: Examination = {
      ...initialExam,
      include_agriculture: false,
    };

    const updatedResult = await api.updateExamination(updatePayload, mockAdminUser);

    // Verify persistence
    expect(updatedResult.include_agriculture).toBe(false);

    // Reload from storage
    const storedList = getStorage<Examination[]>(KEYS.EXAMS, []);
    const reloaded = storedList.find((e) => e.id === initialExam.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.include_agriculture).toBe(false);

    // Verify Marks Entry Subject Pipeline
    const isAgnIncluded = isAgricultureIncludedInCompositeExam(reloaded, classWithoutAgn, sampleSubjects);
    expect(isAgnIncluded).toBe(false);
  });

  it('3. HISTORICAL NULL SEMANTICS: include_agriculture = undefined remains undefined and uses historical class allocation fallback', async () => {
    const historicalExam: Examination = {
      id: 'ex_persistence_test_3',
      exam_name: 'Historical Grade 6 Exam',
      academic_year_id: ayUuid,
      term_id: termUuid,
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: undefined,
    };

    setStorage(KEYS.EXAMS, [historicalExam]);

    const updatePayload: Examination = {
      ...historicalExam,
      exam_name: 'Historical Grade 6 Exam Updated Title',
    };

    const updatedResult = await api.updateExamination(updatePayload, mockAdminUser);

    expect(updatedResult.include_agriculture).toBeUndefined();

    const storedList = getStorage<Examination[]>(KEYS.EXAMS, []);
    const reloaded = storedList.find((e) => e.id === historicalExam.id);
    expect(reloaded?.include_agriculture).toBeUndefined();

    // Fall back to class allocation check (which is false for classWithoutAgn)
    const isAgnIncluded = isAgricultureIncludedInCompositeExam(reloaded, classWithoutAgn, sampleSubjects);
    expect(isAgnIncluded).toBe(false);
  });
});
