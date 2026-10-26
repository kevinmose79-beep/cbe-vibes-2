import { describe, it, expect } from 'vitest';
import { Subject, ClassStream, Examination, Student, Mark, Grade, School, Teacher } from '../types';
import { getUpperPrimaryMeritListSubjectPartition } from '../utils/markUtils';
import { downloadMeritListPDF, downloadMeritListExcel, downloadMeritListCSV } from '../services/meritListExporter';
import { initialSchool, initialGrades, initialTeachers } from '../data/seedData';

describe('Upper Primary Merit List SS&CRE Arrangements A & B Verification', () => {
  // Upper Primary catalogue with all candidate subjects
  const engLangSubj: Subject = { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Upper Primary', category: 'Core' };
  const engCompSubj: Subject = { id: 'sb_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' };
  const kiswLughaSubj: Subject = { id: 'sb_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Upper Primary', category: 'Core' };
  const kiswInshaSubj: Subject = { id: 'sb_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' };
  const mathSubj: Subject = { id: 'sb_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary', category: 'Core' };
  const sctSubj: Subject = { id: 'sb_sct', subject_code: 'SCT', subject_name: 'Science and Technology', education_level: 'Upper Primary', category: 'Core' };
  const caSubj: Subject = { id: 'sb_ca', subject_code: 'CA', subject_name: 'Creative Arts', education_level: 'Upper Primary', category: 'Core' };
  const sstSubj: Subject = { id: 'sb_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Upper Primary', category: 'Core' };
  const creSubj: Subject = { id: 'sb_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Upper Primary', category: 'Core' };
  const directSsCreSubj: Subject = { id: 'sb_up_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary', category: 'Core' };
  const agnSubj: Subject = { id: 'sb_agn', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Upper Primary', category: 'Core' };

  const fullUpperPrimarySubjects: Subject[] = [
    engLangSubj,
    engCompSubj,
    kiswLughaSubj,
    kiswInshaSubj,
    mathSubj,
    sctSubj,
    caSubj,
    sstSubj,
    creSubj,
    directSsCreSubj,
    agnSubj,
  ];

  const classG4: ClassStream = { id: 'cls_g4', class_name: 'Grade 4', stream: 'North', education_level: 'Upper Primary' };
  const classG5: ClassStream = { id: 'cls_g5', class_name: 'Grade 5', stream: 'East', education_level: 'Upper Primary' };
  const classG6: ClassStream = { id: 'cls_g6', class_name: 'Grade 6', stream: 'West', education_level: 'Upper Primary' };

  describe('Arrangement A: Direct combined SS&CRE', () => {
    const directExam: Examination = {
      id: 'exam_direct_sscre',
      exam_name: 'Grade 5 Term 2 Assessment',
      term: 'Term 2',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'End-Term',
      max_marks: 100,
      ss_cre_structure: undefined, // Arrangement A: No component structure
      include_agriculture: true,
    };

    it('displays SS&CRE as one combined learning area and strictly excludes separate SST and CRE columns (Grade 5)', () => {
      const partition = getUpperPrimaryMeritListSubjectPartition({
        activeSubjects: fullUpperPrimarySubjects,
        subjects: fullUpperPrimarySubjects,
        exam: directExam,
        targetClass: classG5,
        targetGrade: 'Grade 5',
      });

      expect(partition.isUpperPrimary).toBe(true);
      expect(partition.hasUpperPrimarySsCre).toBe(false); // Arrangement A
      expect(partition.hasUpperPrimaryEng).toBe(true);
      expect(partition.hasUpperPrimaryKisw).toBe(true);

      // Check otherUpperPrimarySubjects
      const codes = partition.otherUpperPrimarySubjects.map((s) => s.subject_code);
      expect(codes).toContain('SS&CRE');
      expect(codes).not.toContain('SST');
      expect(codes).not.toContain('CRE');

      // Verify no duplicate SS&CRE
      const ssCreCount = codes.filter((c) => c === 'SS&CRE').length;
      expect(ssCreCount).toBe(1);
    });

    it('works across Grade 4 and Grade 6 under Arrangement A', () => {
      // Grade 4
      const pG4 = getUpperPrimaryMeritListSubjectPartition({
        activeSubjects: fullUpperPrimarySubjects,
        subjects: fullUpperPrimarySubjects,
        exam: { ...directExam, exam_name: 'Grade 4 Assessment' },
        targetClass: classG4,
        targetGrade: 'Grade 4',
      });
      expect(pG4.hasUpperPrimarySsCre).toBe(false);
      expect(pG4.otherUpperPrimarySubjects.some((s) => s.subject_code === 'SS&CRE')).toBe(true);
      expect(pG4.otherUpperPrimarySubjects.some((s) => s.subject_code === 'SST')).toBe(false);
      expect(pG4.otherUpperPrimarySubjects.some((s) => s.subject_code === 'CRE')).toBe(false);

      // Grade 6
      const pG6 = getUpperPrimaryMeritListSubjectPartition({
        activeSubjects: fullUpperPrimarySubjects,
        subjects: fullUpperPrimarySubjects,
        exam: { ...directExam, exam_name: 'Grade 6 Assessment' },
        targetClass: classG6,
        targetGrade: 'Grade 6',
      });
      expect(pG6.hasUpperPrimarySsCre).toBe(false);
      expect(pG6.otherUpperPrimarySubjects.some((s) => s.subject_code === 'SS&CRE')).toBe(true);
      expect(pG6.otherUpperPrimarySubjects.some((s) => s.subject_code === 'SST')).toBe(false);
      expect(pG6.otherUpperPrimarySubjects.some((s) => s.subject_code === 'CRE')).toBe(false);
    });

    it('adds canonical SS&CRE when activeSubjects only contained component SST and CRE', () => {
      const activeWithoutDirect = fullUpperPrimarySubjects.filter((s) => s.subject_code !== 'SS&CRE');
      const partition = getUpperPrimaryMeritListSubjectPartition({
        activeSubjects: activeWithoutDirect,
        subjects: fullUpperPrimarySubjects,
        exam: directExam,
        targetClass: classG6,
        targetGrade: 'Grade 6',
      });

      expect(partition.hasUpperPrimarySsCre).toBe(false);
      expect(partition.otherUpperPrimarySubjects.some((s) => s.subject_code === 'SS&CRE')).toBe(true);
      expect(partition.otherUpperPrimarySubjects.some((s) => s.subject_code === 'SST')).toBe(false);
      expect(partition.otherUpperPrimarySubjects.some((s) => s.subject_code === 'CRE')).toBe(false);
    });
  });

  describe('Arrangement B: Component-based SS&CRE', () => {
    const componentExamStructureA: Examination = {
      id: 'exam_comp_a',
      exam_name: 'Grade 6 KPSEA Rehearsal',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Mid-Term',
      max_marks: 100,
      ss_cre_structure: 'A', // 30 SST + 20 CRE = 50 SS&CRE
      include_agriculture: true,
    };

    const componentExamCustom: Examination = {
      id: 'exam_comp_custom',
      exam_name: 'Grade 5 KPSEA Trial',
      term: 'Term 2',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Mid-Term',
      max_marks: 100,
      ss_cre_structure: 'CUSTOM:25:15', // 25 SST + 15 CRE = 40 SS&CRE
      include_agriculture: false,
    };

    it('enables grouped layout (hasUpperPrimarySsCre = true) and excludes direct SS&CRE from otherUpperPrimarySubjects', () => {
      const partition = getUpperPrimaryMeritListSubjectPartition({
        activeSubjects: fullUpperPrimarySubjects,
        subjects: fullUpperPrimarySubjects,
        exam: componentExamStructureA,
        targetClass: classG6,
        targetGrade: 'Grade 6',
      });

      expect(partition.hasUpperPrimarySsCre).toBe(true);
      expect(partition.sstSubj?.subject_code).toBe('SST');
      expect(partition.creSubj?.subject_code).toBe('CRE');

      // Neither direct SS&CRE nor standalone SST/CRE should be in otherUpperPrimarySubjects
      const otherCodes = partition.otherUpperPrimarySubjects.map((s) => s.subject_code);
      expect(otherCodes).not.toContain('SS&CRE');
      expect(otherCodes).not.toContain('SST');
      expect(otherCodes).not.toContain('CRE');

      // Other subjects remain intact
      expect(otherCodes).toContain('MATH');
      expect(otherCodes).toContain('SCT');
      expect(otherCodes).toContain('CA');
      expect(otherCodes).toContain('AGN');
    });

    it('respects include_agriculture = false under Arrangement B', () => {
      const partition = getUpperPrimaryMeritListSubjectPartition({
        activeSubjects: fullUpperPrimarySubjects,
        subjects: fullUpperPrimarySubjects,
        exam: componentExamCustom,
        targetClass: classG5,
        targetGrade: 'Grade 5',
      });

      expect(partition.hasUpperPrimarySsCre).toBe(true);
      const otherCodes = partition.otherUpperPrimarySubjects.map((s) => s.subject_code);
      expect(otherCodes).not.toContain('AGN');
      expect(otherCodes).not.toContain('SS&CRE');
      expect(otherCodes).not.toContain('SST');
      expect(otherCodes).not.toContain('CRE');
    });
  });

  describe('Exports Consistency (PDF, Excel, CSV)', () => {
    const student1: Student = {
      id: 'std_1',
      admission_number: 'ADM-001',
      full_name: 'Grace Wanjiru',
      gender: 'F',
      class_id: classG6.id,
      stream_id: classG6.id,
      grade: 'Grade 6',
      active: true,
    };

    const directMarks: Mark[] = [
      { id: 'm_eng', student_id: 'std_1', subject_id: engLangSubj.id, exam_id: 'exam_direct_sscre', raw_score: 45, out_of: 60, special_status: 'Normal' },
      { id: 'm_comp', student_id: 'std_1', subject_id: engCompSubj.id, exam_id: 'exam_direct_sscre', raw_score: 30, out_of: 40, special_status: 'Normal' },
      { id: 'm_kis', student_id: 'std_1', subject_id: kiswLughaSubj.id, exam_id: 'exam_direct_sscre', raw_score: 48, out_of: 60, special_status: 'Normal' },
      { id: 'm_insha', student_id: 'std_1', subject_id: kiswInshaSubj.id, exam_id: 'exam_direct_sscre', raw_score: 28, out_of: 40, special_status: 'Normal' },
      { id: 'm_math', student_id: 'std_1', subject_id: mathSubj.id, exam_id: 'exam_direct_sscre', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm_sct', student_id: 'std_1', subject_id: sctSubj.id, exam_id: 'exam_direct_sscre', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
      { id: 'm_ca', student_id: 'std_1', subject_id: caSubj.id, exam_id: 'exam_direct_sscre', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
      { id: 'm_sscre', student_id: 'std_1', subject_id: directSsCreSubj.id, exam_id: 'exam_direct_sscre', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
      { id: 'm_agn', student_id: 'std_1', subject_id: agnSubj.id, exam_id: 'exam_direct_sscre', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
    ];

    it('exports PDF, Excel, and CSV successfully for Arrangement A without error', async () => {
      const data = {
        school: initialSchool,
        exam: {
          id: 'exam_direct_sscre',
          exam_name: 'Grade 6 Assessment Term 2',
          term: 'Term 2',
          year: 2026,
          academic_year_id: 'ay_2026',
          education_level: 'Upper Primary',
          status: 'Published' as const,
          exam_type: 'End-Term' as const,
          max_marks: 100,
          ss_cre_structure: undefined,
          include_agriculture: true,
        },
        selectedClassId: classG6.id,
        selectedStreamId: 'all',
        classes: [classG6],
        teachers: initialTeachers,
        students: [student1],
        subjects: fullUpperPrimarySubjects,
        marks: directMarks,
        grades: initialGrades,
        eduLevel: 'Upper Primary',
      };

      await expect(downloadMeritListPDF(data as any)).resolves.not.toThrow();
      await expect(downloadMeritListExcel(data as any)).resolves.not.toThrow();
      await expect(downloadMeritListCSV(data as any)).resolves.not.toThrow();
    });

    it('exports PDF, Excel, and CSV successfully for Arrangement B without error', async () => {
      const componentMarks: Mark[] = [
        { id: 'm_eng', student_id: 'std_1', subject_id: engLangSubj.id, exam_id: 'exam_comp_a', raw_score: 45, out_of: 60, special_status: 'Normal' },
        { id: 'm_comp', student_id: 'std_1', subject_id: engCompSubj.id, exam_id: 'exam_comp_a', raw_score: 30, out_of: 40, special_status: 'Normal' },
        { id: 'm_kis', student_id: 'std_1', subject_id: kiswLughaSubj.id, exam_id: 'exam_comp_a', raw_score: 48, out_of: 60, special_status: 'Normal' },
        { id: 'm_insha', student_id: 'std_1', subject_id: kiswInshaSubj.id, exam_id: 'exam_comp_a', raw_score: 28, out_of: 40, special_status: 'Normal' },
        { id: 'm_math', student_id: 'std_1', subject_id: mathSubj.id, exam_id: 'exam_comp_a', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_sct', student_id: 'std_1', subject_id: sctSubj.id, exam_id: 'exam_comp_a', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
        { id: 'm_ca', student_id: 'std_1', subject_id: caSubj.id, exam_id: 'exam_comp_a', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
        { id: 'm_sst', student_id: 'std_1', subject_id: sstSubj.id, exam_id: 'exam_comp_a', marks: 24, raw_score: 24, out_of: 30, special_status: 'Normal' },
        { id: 'm_cre', student_id: 'std_1', subject_id: creSubj.id, exam_id: 'exam_comp_a', marks: 16, raw_score: 16, out_of: 20, special_status: 'Normal' },
        { id: 'm_agn', student_id: 'std_1', subject_id: agnSubj.id, exam_id: 'exam_comp_a', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      ];

      const data = {
        school: initialSchool,
        exam: {
          id: 'exam_comp_a',
          exam_name: 'Grade 6 Assessment Term 3',
          term: 'Term 3',
          year: 2026,
          academic_year_id: 'ay_2026',
          education_level: 'Upper Primary',
          status: 'Published' as const,
          exam_type: 'End-Term' as const,
          max_marks: 100,
          ss_cre_structure: 'A' as const,
          include_agriculture: true,
        },
        selectedClassId: classG6.id,
        selectedStreamId: 'all',
        classes: [classG6],
        teachers: initialTeachers,
        students: [student1],
        subjects: fullUpperPrimarySubjects,
        marks: componentMarks,
        grades: initialGrades,
        eduLevel: 'Upper Primary',
      };

      await expect(downloadMeritListPDF(data as any)).resolves.not.toThrow();
      await expect(downloadMeritListExcel(data as any)).resolves.not.toThrow();
      await expect(downloadMeritListCSV(data as any)).resolves.not.toThrow();
    });
  });
});
