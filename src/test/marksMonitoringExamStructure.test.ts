import { describe, it, expect } from 'vitest';
import { Subject, Examination } from '../types';
import { filterSubjectsForExamStructure } from '../components/MarksMonitoringView';

describe('Marks Monitoring Exam Structure Filter Tests (Tests A-G)', () => {
  // Upper Primary subjects catalogue sample
  const engSubject: Subject = { id: 's_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Grade 4–9', category: 'Core' };
  const compSubject: Subject = { id: 's_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' };
  const kisSubject: Subject = { id: 's_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Grade 4–9', category: 'Core' };
  const inshaSubject: Subject = { id: 's_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' };
  const mathSubject: Subject = { id: 's_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core' };
  const intSciSubject: Subject = { id: 's_intsci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Grade 4–9', category: 'Core' };
  const casSubject: Subject = { id: 's_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Grade 4–9', category: 'Core' };
  const sstSubject: Subject = { id: 's_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Grade 4–9', category: 'Core' };
  const creSubject: Subject = { id: 's_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'PP1–Grade 9', category: 'Core' };
  const agnSubject: Subject = { id: 's_agn', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core' };
  const ssCreSubject: Subject = { id: 's_sscre', subject_code: 'SS&CRE', subject_name: 'Social Studies&CRE', education_level: 'Upper Primary', category: 'Core' };

  const upperPrimaryCatalogue: Subject[] = [
    engSubject,
    compSubject,
    kisSubject,
    inshaSubject,
    mathSubject,
    intSciSubject,
    casSubject,
    sstSubject,
    creSubject,
    agnSubject,
    ssCreSubject,
  ];

  // Lower Primary subjects sample
  const lpSubjects: Subject[] = [
    { id: 's_lp_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Lower Primary', category: 'Core' },
    { id: 's_lp_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Lower Primary', category: 'Core' },
    { id: 's_lp_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Lower Primary', category: 'Core' },
    { id: 's_lp_ila', subject_code: 'ILA', subject_name: 'Integrated Learning Area', education_level: 'Lower Primary', category: 'Core' },
  ];

  // Junior School subjects sample
  const jsSubjects: Subject[] = [
    engSubject,
    kisSubject,
    mathSubject,
    intSciSubject,
    casSubject,
    sstSubject,
    creSubject,
    agnSubject,
    { id: 's_pretech', subject_code: 'PRE-TECH', subject_name: 'Pre-Technical Studies', education_level: 'Grade 4–9', category: 'Core' },
  ];

  it('Test A: Grade 6 KPSEA Third Trial (ss_cre_structure = CUSTOM:25:15, include_agriculture = true)', () => {
    const exam: Examination = {
      id: 'exam_g6_third_trial',
      exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      ss_cre_structure: 'CUSTOM:25:15',
      include_agriculture: true,
      education_level: 'Upper Primary',
    };

    const monitored = filterSubjectsForExamStructure(upperPrimaryCatalogue, exam);
    expect(monitored.length).toBe(10);
    expect(monitored.some((s) => s.subject_code === 'SS&CRE')).toBe(false);
    expect(monitored.some((s) => s.subject_code === 'SST')).toBe(true);
    expect(monitored.some((s) => s.subject_code === 'CRE')).toBe(true);
    expect(monitored.some((s) => s.subject_code === 'AGN')).toBe(true);
  });

  it('Test B: Direct SS&CRE examination (ss_cre_structure = null)', () => {
    const exam: Examination = {
      id: 'exam_direct_sscre',
      exam_name: 'Grade 6 Opener Assessment Term 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      ss_cre_structure: null,
      education_level: 'Upper Primary',
    };

    const monitored = filterSubjectsForExamStructure(upperPrimaryCatalogue, exam);
    expect(monitored.some((s) => s.subject_code === 'SS&CRE')).toBe(true);
  });

  it('Test C: Agriculture excluded (include_agriculture = false)', () => {
    const exam: Examination = {
      id: 'exam_no_agn',
      exam_name: 'Grade 5 Assessment',
      term: 'Term 3',
      year: 2026,
      status: 'Open',
      exam_type: 'End-Term',
      max_marks: 100,
      ss_cre_structure: 'CUSTOM:25:15',
      include_agriculture: false,
      education_level: 'Upper Primary',
    };

    const monitored = filterSubjectsForExamStructure(upperPrimaryCatalogue, exam);
    expect(monitored.some((s) => s.subject_code === 'AGN')).toBe(false);
    expect(monitored.some((s) => s.subject_code === 'SS&CRE')).toBe(false);
    expect(monitored.length).toBe(9);
  });

  it('Test D: Agriculture included (include_agriculture = true)', () => {
    const exam: Examination = {
      id: 'exam_with_agn',
      exam_name: 'Grade 5 Assessment With AGN',
      term: 'Term 3',
      year: 2026,
      status: 'Open',
      exam_type: 'End-Term',
      max_marks: 100,
      include_agriculture: true,
      education_level: 'Upper Primary',
    };

    const monitored = filterSubjectsForExamStructure(upperPrimaryCatalogue, exam);
    expect(monitored.some((s) => s.subject_code === 'AGN')).toBe(true);
  });

  it('Test E: Historical Agriculture fallback (include_agriculture = null / undefined)', () => {
    const examNull: Examination = {
      id: 'exam_null_agn',
      exam_name: 'Legacy Exam Null',
      term: 'Term 3',
      year: 2026,
      status: 'Open',
      exam_type: 'End-Term',
      max_marks: 100,
      include_agriculture: null,
      education_level: 'Upper Primary',
    };

    const examUndefined: Examination = {
      id: 'exam_undef_agn',
      exam_name: 'Legacy Exam Undefined',
      term: 'Term 3',
      year: 2026,
      status: 'Open',
      exam_type: 'End-Term',
      max_marks: 100,
      education_level: 'Upper Primary',
    };

    const classWithAgn = { id: 'c_agn', allocated_subject_ids: ['s_agn'] };
    const classWithoutAgn = { id: 'c_no_agn', allocated_subject_ids: ['s_eng', 's_math'] };

    // When class has Agriculture allocated, Agriculture is included via authoritative fallback
    const monitoredNullWithAgn = filterSubjectsForExamStructure(upperPrimaryCatalogue, examNull, classWithAgn);
    expect(monitoredNullWithAgn.some((s) => s.subject_code === 'AGN')).toBe(true);

    const monitoredUndefWithAgn = filterSubjectsForExamStructure(upperPrimaryCatalogue, examUndefined, classWithAgn);
    expect(monitoredUndefWithAgn.some((s) => s.subject_code === 'AGN')).toBe(true);

    // When class has NO Agriculture allocation (like Grade 6 Red / Blue), Agriculture is excluded
    const monitoredNullWithoutAgn = filterSubjectsForExamStructure(upperPrimaryCatalogue, examNull, classWithoutAgn);
    expect(monitoredNullWithoutAgn.some((s) => s.subject_code === 'AGN')).toBe(false);

    const monitoredUndefWithoutAgn = filterSubjectsForExamStructure(upperPrimaryCatalogue, examUndefined, classWithoutAgn);
    expect(monitoredUndefWithoutAgn.some((s) => s.subject_code === 'AGN')).toBe(false);

    // When no class context is provided, unallocated fallback excludes Agriculture
    const monitoredNullNoClass = filterSubjectsForExamStructure(upperPrimaryCatalogue, examNull);
    expect(monitoredNullNoClass.some((s) => s.subject_code === 'AGN')).toBe(false);
  });

  it('Test H: Grade 6 KPSEA Second Trial Term 3 2026 excludes Agriculture and direct SS&CRE', () => {
    const kpseaSecondTrial: Examination = {
      id: 'b354bcc6-ee20-4ced-a651-8f599ce7db58',
      exam_name: 'GRADE 6 KPSEA SECOND TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Mid-Term',
      assessment_structure: 'Composite',
      max_marks: 100,
      ss_cre_structure: 'B',
      include_agriculture: null,
      education_level: 'Upper Primary',
    };

    // Grade 6 Red has no Agriculture allocation
    const grade6Red = {
      id: 'f358ed2e-fd9f-47aa-8622-a9bb997375e7',
      class_name: 'Grade 6',
      stream: 'Red',
      allocated_subject_ids: ['s_eng', 's_comp', 's_kis', 's_insha', 's_math', 's_intsci', 's_cas', 's_sst', 's_cre'],
    };

    const monitored = filterSubjectsForExamStructure(upperPrimaryCatalogue, kpseaSecondTrial, grade6Red);
    // Agriculture must NOT appear
    expect(monitored.some((s) => s.subject_code === 'AGN')).toBe(false);
    // Direct SS&CRE must NOT appear (Structure B uses component SST + CRE)
    expect(monitored.some((s) => s.subject_code === 'SS&CRE')).toBe(false);
    // Components SST and CRE must appear
    expect(monitored.some((s) => s.subject_code === 'SST')).toBe(true);
    expect(monitored.some((s) => s.subject_code === 'CRE')).toBe(true);
  });

  it('Test I: Standalone Upper Primary preserves Agriculture unless explicitly disabled', () => {
    const standaloneNull: Examination = {
      id: 'exam_standalone_null',
      exam_name: 'Grade 6 Standalone Null',
      term: 'Term 3',
      year: 2026,
      status: 'Open',
      exam_type: 'End-Term',
      assessment_structure: 'Standalone',
      max_marks: 100,
      include_agriculture: null,
      education_level: 'Upper Primary',
    };

    const standaloneExcluded: Examination = {
      id: 'exam_standalone_false',
      exam_name: 'Grade 6 Standalone Excluded',
      term: 'Term 3',
      year: 2026,
      status: 'Open',
      exam_type: 'End-Term',
      assessment_structure: 'Standalone',
      max_marks: 100,
      include_agriculture: false,
      education_level: 'Upper Primary',
    };

    const monitoredNull = filterSubjectsForExamStructure(upperPrimaryCatalogue, standaloneNull);
    expect(monitoredNull.some((s) => s.subject_code === 'AGN')).toBe(true);

    const monitoredExcluded = filterSubjectsForExamStructure(upperPrimaryCatalogue, standaloneExcluded);
    expect(monitoredExcluded.some((s) => s.subject_code === 'AGN')).toBe(false);
  });

  it('Test F: Lower Primary monitoring regression (4 core subjects)', () => {
    const exam: Examination = {
      id: 'exam_lp_midterm',
      exam_name: 'LOWER PRIMARY MID-TERM ASSESSMENT TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Lower Primary',
    };

    const monitored = filterSubjectsForExamStructure(lpSubjects, exam);
    expect(monitored.length).toBe(4);
    expect(monitored.map((s) => s.subject_code)).toEqual(['ENG', 'KIS', 'MATH', 'ILA']);
  });

  it('Test G: Junior School monitoring regression', () => {
    const exam: Examination = {
      id: 'exam_js_knec',
      exam_name: 'SBA KNEC Assessment Junior 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Provisional',
      exam_type: 'Mid-Term',
      max_marks: 100,
      education_level: 'Junior School',
    };

    const monitored = filterSubjectsForExamStructure(jsSubjects, exam);
    expect(monitored.length).toBe(9);
    expect(monitored.some((s) => s.subject_code === 'SS&CRE')).toBe(false);
    expect(monitored.some((s) => s.subject_code === 'SST')).toBe(true);
    expect(monitored.some((s) => s.subject_code === 'CRE')).toBe(true);
    expect(monitored.some((s) => s.subject_code === 'PRE-TECH')).toBe(true);
  });
});
