import './setupLocalStorage';
import { describe, it, expect } from 'vitest';
import { Subject } from '../types';
import {
  getUpperPrimaryStandaloneSubjects,
  getUpperPrimaryCanonicalSubjects,
} from '../services/terminalResultsEngine';

describe('Upper Primary Standalone Subject Resolver (Step 2B Phase 1)', () => {
  const customSubjects: Subject[] = [
    { id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb_up_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb_up_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb_up_mat', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sb_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sb_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sb_up_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb_up_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary', category: 'Core' },
  ];

  it('1. Returns 8 subjects in expected order when Agriculture is included (include_agriculture: true)', () => {
    const subjects = getUpperPrimaryStandaloneSubjects(customSubjects, { include_agriculture: true });
    expect(subjects).toHaveLength(8);

    const codes = subjects.map((s) => s.subject_code);
    expect(codes).toEqual([
      'ENG',
      'KIS',
      'MATH',
      'INT-SCI',
      'SST',
      'CRE',
      'AGN',
      'CAS',
    ]);

    const names = subjects.map((s) => s.subject_name);
    expect(names).toEqual([
      'English',
      'Kiswahili',
      'Mathematics',
      'Integrated Science',
      'Social Studies',
      'Christian Religious Education',
      'Agriculture',
      'Creative Arts and Sports',
    ]);
  });

  it('2. Returns 7 subjects in expected order when Agriculture is explicitly omitted (include_agriculture: false)', () => {
    const subjects = getUpperPrimaryStandaloneSubjects(customSubjects, { include_agriculture: false });
    expect(subjects).toHaveLength(7);

    const codes = subjects.map((s) => s.subject_code);
    expect(codes).toEqual([
      'ENG',
      'KIS',
      'MATH',
      'INT-SCI',
      'SST',
      'CRE',
      'CAS',
    ]);

    expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(false);
  });

  it('3. Respects existing fallbacks for undefined configuration (defaults to including Agriculture -> 8 subjects)', () => {
    const subjectsDefault = getUpperPrimaryStandaloneSubjects(customSubjects);
    expect(subjectsDefault).toHaveLength(8);
    expect(subjectsDefault.map((s) => s.subject_code)).toEqual([
      'ENG',
      'KIS',
      'MATH',
      'INT-SCI',
      'SST',
      'CRE',
      'AGN',
      'CAS',
    ]);

    const subjectsUndefined = getUpperPrimaryStandaloneSubjects(customSubjects, { include_agriculture: undefined });
    expect(subjectsUndefined).toHaveLength(8);

    const subjectsNull = getUpperPrimaryStandaloneSubjects(customSubjects, { include_agriculture: null });
    expect(subjectsNull).toHaveLength(8);
  });

  it('4. Supports boolean shorthand for options argument', () => {
    const withAg = getUpperPrimaryStandaloneSubjects(customSubjects, true);
    expect(withAg).toHaveLength(8);
    expect(withAg.map((s) => s.subject_code)).toContain('AGN');

    const withoutAg = getUpperPrimaryStandaloneSubjects(customSubjects, false);
    expect(withoutAg).toHaveLength(7);
    expect(withoutAg.map((s) => s.subject_code)).not.toContain('AGN');
  });

  it('5. Supports object configuration as first argument', () => {
    const res1 = getUpperPrimaryStandaloneSubjects({ subjects: customSubjects, include_agriculture: false });
    expect(res1).toHaveLength(7);
    expect(res1.map((s) => s.subject_code)).not.toContain('AGN');

    const res2 = getUpperPrimaryStandaloneSubjects({ subjects: customSubjects, include_agriculture: true });
    expect(res2).toHaveLength(8);
    expect(res2.map((s) => s.subject_code)).toContain('AGN');
  });

  it('6. Works with default seedData when no subjects are provided', () => {
    const subjects = getUpperPrimaryStandaloneSubjects();
    expect(subjects).toHaveLength(8);
    expect(subjects.map((s) => s.subject_code)).toEqual([
      'ENG',
      'KIS',
      'MATH',
      'INT-SCI',
      'SST',
      'CRE',
      'AGN',
      'CAS',
    ]);
  });

  it('7. Preserves subject IDs when provided in pool', () => {
    const subjects = getUpperPrimaryStandaloneSubjects(customSubjects, { include_agriculture: true });
    expect(subjects.find((s) => s.subject_code === 'ENG')?.id).toBe('sb_up_eng');
    expect(subjects.find((s) => s.subject_code === 'KIS')?.id).toBe('sb_up_kis');
    expect(subjects.find((s) => s.subject_code === 'MATH')?.id).toBe('sb_up_mat');
    expect(subjects.find((s) => s.subject_code === 'INT-SCI')?.id).toBe('sb_sci');
    expect(subjects.find((s) => s.subject_code === 'SST')?.id).toBe('sb_sst');
    expect(subjects.find((s) => s.subject_code === 'CRE')?.id).toBe('sb_cre');
    expect(subjects.find((s) => s.subject_code === 'AGN')?.id).toBe('a9bf02ee-5e4e-46fa-b7d5-39f77657821f');
    expect(subjects.find((s) => s.subject_code === 'CAS')?.id).toBe('sb_up_cas');
  });

  it('8. Does not touch or change getUpperPrimaryCanonicalSubjects (Composite remains 6 learning areas)', () => {
    const compositeSubjects = getUpperPrimaryCanonicalSubjects(customSubjects);
    expect(compositeSubjects).toHaveLength(6);
    expect(compositeSubjects.map((s) => s.subject_code)).toEqual([
      'ENG',
      'KIS',
      'MATH',
      'INT-SCI',
      'CAS',
      'SS&CRE',
    ]);
  });
});
