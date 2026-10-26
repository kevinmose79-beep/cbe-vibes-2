import { describe, it, expect } from 'vitest';
import { Examination, ClassStream, Subject, getAllocatedSubjectsForClass } from '../types';
import { filterSubjectsForExamStructure } from '../components/MarksMonitoringView';

describe('Marks Monitoring - Grade 6 KPSEA Second Trial Term 3 2026 Agriculture Verification', () => {
  // Subjects in catalogue
  const subjects: Subject[] = [
    { id: 's_eng', subject_code: 'ENG', subject_name: 'English Language', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' },
    { id: 's_kis', subject_code: 'KIS', subject_name: 'Kiswahili Lugha', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' },
    { id: 's_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_intsci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'PP1–Grade 9', category: 'Core' },
    { id: 's_agn', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core' },
    { id: 's_sscre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary', category: 'Core' },
  ];

  // Exact KPSEA Second Trial exam from database
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

  // Grade 6 Red & Blue (neither has Agriculture allocated)
  const grade6Red: ClassStream = {
    id: 'f358ed2e-fd9f-47aa-8622-a9bb997375e7',
    class_name: 'Grade 6',
    stream: 'Red',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['s_eng', 's_comp', 's_kis', 's_insha', 's_math', 's_intsci', 's_cas', 's_sst', 's_cre'],
    status: 'Active',
  };

  const grade6Blue: ClassStream = {
    id: 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
    class_name: 'Grade 6',
    stream: 'Blue',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['s_eng', 's_comp', 's_kis', 's_insha', 's_math', 's_intsci', 's_cas', 's_sst', 's_cre'],
    status: 'Active',
  };

  it('Scenario 1: Class Teacher Monitoring resolves subjects excluding Agriculture and direct SS&CRE for Grade 6 Red', () => {
    // Replicates ClassTeacherMarksMonitoringView applicableSubjects logic
    const subs = getAllocatedSubjectsForClass(grade6Red, subjects);
    const validSubs = (subs || []).filter((s): s is Subject => Boolean(s && s.id));
    const monitoredSubjects = filterSubjectsForExamStructure(validSubs, kpseaSecondTrial, grade6Red, subjects);

    const codes = monitoredSubjects.map((s) => s.subject_code);
    expect(codes).not.toContain('AGN');
    expect(codes).not.toContain('SS&CRE');
    expect(codes).toContain('ENG');
    expect(codes).toContain('COMP');
    expect(codes).toContain('KIS');
    expect(codes).toContain('INSHA');
    expect(codes).toContain('MATH');
    expect(codes).toContain('INT-SCI');
    expect(codes).toContain('CAS');
    expect(codes).toContain('SST');
    expect(codes).toContain('CRE');
  });

  it('Scenario 2: Class Teacher Monitoring resolves subjects excluding Agriculture for Grade 6 Blue', () => {
    const subs = getAllocatedSubjectsForClass(grade6Blue, subjects);
    const validSubs = (subs || []).filter((s): s is Subject => Boolean(s && s.id));
    const monitoredSubjects = filterSubjectsForExamStructure(validSubs, kpseaSecondTrial, grade6Blue, subjects);

    const codes = monitoredSubjects.map((s) => s.subject_code);
    expect(codes).not.toContain('AGN');
    expect(codes).not.toContain('SS&CRE');
  });

  it('Scenario 3: When class has no allocated_subject_ids (falls back to catalogue), Agriculture is still filtered out for KPSEA Second Trial', () => {
    const grade6Unallocated: ClassStream = {
      id: 'g6_unallocated',
      class_name: 'Grade 6',
      stream: 'Green',
      education_level: 'Upper Primary',
      allocated_subject_ids: [],
      status: 'Active',
    };

    const subs = getAllocatedSubjectsForClass(grade6Unallocated, subjects);
    const validSubs = (subs || []).filter((s): s is Subject => Boolean(s && s.id));
    const monitoredSubjects = filterSubjectsForExamStructure(validSubs, kpseaSecondTrial, grade6Unallocated, subjects);

    const codes = monitoredSubjects.map((s) => s.subject_code);
    expect(codes).not.toContain('AGN');
  });

  it('Scenario 4: When an exam explicitly includes Agriculture (include_agriculture: true), Agriculture is preserved', () => {
    const examWithAgn: Examination = {
      ...kpseaSecondTrial,
      id: 'exam_with_agn',
      include_agriculture: true,
    };

    const subs = getAllocatedSubjectsForClass(grade6Red, subjects);
    // If Agriculture was in the catalogue or candidate pool:
    const candidateSubs = [...subs, subjects.find((s) => s.subject_code === 'AGN')!];
    const monitoredSubjects = filterSubjectsForExamStructure(candidateSubs, examWithAgn, grade6Red, subjects);

    const codes = monitoredSubjects.map((s) => s.subject_code);
    expect(codes).toContain('AGN');
  });

  it('Scenario 5: When exam is Standalone Upper Primary with include_agriculture: null, Agriculture is preserved', () => {
    const standaloneExam: Examination = {
      ...kpseaSecondTrial,
      id: 'exam_standalone',
      assessment_structure: 'Standalone',
    };

    const candidateSubs = [...subjects];
    const monitoredSubjects = filterSubjectsForExamStructure(candidateSubs, standaloneExam, grade6Red, subjects);

    const codes = monitoredSubjects.map((s) => s.subject_code);
    expect(codes).toContain('AGN');
  });
});
