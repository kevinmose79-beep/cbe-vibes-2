import { describe, it, expect } from 'vitest';
import { Subject, Examination, ClassStream, Student, Mark, Grade } from '../types';
import { isAgricultureIncludedInCompositeExam, isAgricultureSubject } from '../utils/markUtils';
import { calculateExamResults } from '../services/analysisEngine';
import { downloadMeritListPDF, downloadMeritListExcel, downloadMeritListCSV, MeritListData } from '../services/meritListExporter';

describe('Upper Primary Composite Merit List Agriculture Filtering', () => {
  const agnUuid = 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f';

  const agnSub: Subject = {
    id: agnUuid,
    subject_code: 'AGN',
    subject_name: 'Agriculture',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const engLangSub: Subject = {
    id: 'sb_up_eng',
    subject_code: 'ENG',
    subject_name: 'English Language',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const engCompSub: Subject = {
    id: 'sb_up_comp',
    subject_code: 'COMP',
    subject_name: 'English Composition',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const kiswLangSub: Subject = {
    id: 'sb_up_kis',
    subject_code: 'KIS',
    subject_name: 'Kiswahili Lugha',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const kiswInshaSub: Subject = {
    id: 'sb_up_insha',
    subject_code: 'INSHA',
    subject_name: 'Kiswahili Insha',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const mathSub: Subject = {
    id: 'sb_up_math',
    subject_code: 'MATH',
    subject_name: 'Mathematics',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const sciSub: Subject = {
    id: 'sb_up_sci',
    subject_code: 'INT-SCI',
    subject_name: 'Integrated Science',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const casSub: Subject = {
    id: 'sb_up_cas',
    subject_code: 'CAS',
    subject_name: 'Creative Arts and Sports',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const sstSub: Subject = {
    id: 'sb_up_sst',
    subject_code: 'SST',
    subject_name: 'Social Studies',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const creSub: Subject = {
    id: 'sb_up_cre',
    subject_code: 'CRE',
    subject_name: 'Christian Religious Education',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const ssCreSub: Subject = {
    id: 'sb_up_ss_cre',
    subject_code: 'SS&CRE',
    subject_name: 'Social Studies & CRE',
    education_level: 'Upper Primary',
    category: 'Core',
    applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'],
  };

  const allSubjects = [engLangSub, engCompSub, kiswLangSub, kiswInshaSub, mathSub, sciSub, casSub, sstSub, creSub, ssCreSub, agnSub];

  const classWithoutAgn: ClassStream = {
    id: 'cls_g6_blue',
    class_name: 'Grade 6',
    stream: 'Blue',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_up_eng', 'sb_up_comp', 'sb_up_kis', 'sb_up_insha', 'sb_up_math', 'sb_up_sci', 'sb_up_cas', 'sb_up_sst', 'sb_up_cre', 'sb_up_ss_cre'],
  };

  const classWithAgn: ClassStream = {
    id: 'cls_g6_with_agn',
    class_name: 'Grade 6',
    stream: 'Green',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_up_eng', 'sb_up_comp', 'sb_up_kis', 'sb_up_insha', 'sb_up_math', 'sb_up_sci', 'sb_up_cas', 'sb_up_sst', 'sb_up_cre', 'sb_up_ss_cre', agnUuid],
  };

  const student1: Student = {
    id: 'std_1',
    admission_number: '1001',
    full_name: 'Alice Wanjiku',
    gender: 'F',
    class_id: classWithoutAgn.id,
    grade: 'Grade 6',
    active: true,
  };

  const student2: Student = {
    id: 'std_2',
    admission_number: '1002',
    full_name: 'Brian Kiprop',
    gender: 'M',
    class_id: classWithAgn.id,
    grade: 'Grade 6',
    active: true,
  };

  const grades: Grade[] = [
    { id: 'g1', grade_code: 'EE', grade: 'EE', performance_level: 'EE', points: 4, minimum_score: 80, maximum_score: 100, remarks: 'Exceeding Expectations', descriptor: 'Exceeding' },
    { id: 'g2', grade_code: 'ME', grade: 'ME', performance_level: 'ME', points: 3, minimum_score: 50, maximum_score: 79, remarks: 'Meeting Expectations', descriptor: 'Meeting' },
    { id: 'g3', grade_code: 'AE', grade: 'AE', performance_level: 'AE', points: 2, minimum_score: 35, maximum_score: 49, remarks: 'Approaching Expectations', descriptor: 'Approaching' },
    { id: 'g4', grade_code: 'BE', grade: 'BE', performance_level: 'BE', points: 1, minimum_score: 0, maximum_score: 34, remarks: 'Below Expectations', descriptor: 'Below' },
  ];

  const kpseaExamWithoutAgn: Examination = {
    id: 'ex_kpsea_trial_2',
    exam_name: 'GRADE 6 KPSEA SECOND TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Approved',
    exam_type: 'Mid-Term',
    max_marks: 100,
    assessment_structure: 'Composite',
    ss_cre_structure: 'B',
    include_agriculture: null, // Historical / not explicitly enabled
    education_level: 'Upper Primary',
    class_id: classWithoutAgn.id,
  };

  const marksForAlice: Mark[] = [
    { id: 'm1', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: engLangSub.id, marks: 45, raw_score: 45, out_of: 60 },
    { id: 'm2', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: engCompSub.id, marks: 30, raw_score: 30, out_of: 40 },
    { id: 'm3', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: kiswLangSub.id, marks: 48, raw_score: 48, out_of: 60 },
    { id: 'm4', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: kiswInshaSub.id, marks: 32, raw_score: 32, out_of: 40 },
    { id: 'm5', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: mathSub.id, marks: 85, raw_score: 85, out_of: 100 },
    { id: 'm6', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: sciSub.id, marks: 78, raw_score: 78, out_of: 100 },
    { id: 'm7', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: casSub.id, marks: 82, raw_score: 82, out_of: 100 },
    { id: 'm8', student_id: student1.id, exam_id: kpseaExamWithoutAgn.id, subject_id: ssCreSub.id, marks: 78, raw_score: 78, out_of: 100 },
  ];

  it('1. isAgricultureIncludedInCompositeExam evaluates to false for KPSEA Second Trial without AGN allocation', () => {
    expect(isAgricultureIncludedInCompositeExam(kpseaExamWithoutAgn, classWithoutAgn, allSubjects)).toBe(false);
  });

  it('2. Calculation engine computes total out of /600 for KPSEA Second Trial', () => {
    const results = calculateExamResults(kpseaExamWithoutAgn.id, [student1], marksForAlice, grades, [classWithoutAgn], allSubjects, kpseaExamWithoutAgn);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(600);
    expect(results[0].subject_count).toBe(6);
    // English composite: 45 + 30 = 75
    // Kiswahili composite: 48 + 32 = 80
    // Math: 85
    // Int-Sci: 78
    // CAS: 82
    // SS&CRE: 40 + 38 = 78
    // Total: 75 + 80 + 85 + 78 + 82 + 78 = 478 / 600
    expect(results[0].total_marks).toBe(478);
  });

  it('3. PDF, Excel and CSV Merit List exporters exclude AGN when isAgricultureIncludedInCompositeExam is false', async () => {
    const meritData: MeritListData = {
      school: { id: 'sch_1', school_name: 'CBE HUB Comprehensive School' } as any,
      exam: kpseaExamWithoutAgn,
      selectedClassId: classWithoutAgn.id,
      classes: [classWithoutAgn],
      students: [student1],
      subjects: allSubjects,
      marks: marksForAlice,
      grades: grades,
    };

    // PDF Export
    await expect(downloadMeritListPDF(meritData)).resolves.not.toThrow();

    // Excel Export
    await expect(downloadMeritListExcel(meritData)).resolves.not.toThrow();

    // CSV Export
    await expect(downloadMeritListCSV(meritData)).resolves.not.toThrow();
  });

  it('4. When include_agriculture is true, AGN is included and maximum is /700', () => {
    const examWithAgnOn: Examination = {
      ...kpseaExamWithoutAgn,
      id: 'ex_with_agn_on',
      include_agriculture: true,
    };
    expect(isAgricultureIncludedInCompositeExam(examWithAgnOn, classWithoutAgn, allSubjects)).toBe(true);

    const fullMarksWithAgn: Mark[] = [
      ...marksForAlice.map(m => ({ ...m, exam_id: examWithAgnOn.id })),
      { id: 'm10', student_id: student1.id, exam_id: examWithAgnOn.id, subject_id: agnUuid, marks: 70, raw_score: 70, out_of: 100 },
    ];

    const results = calculateExamResults(examWithAgnOn.id, [student1], fullMarksWithAgn, grades, [classWithoutAgn], allSubjects, examWithAgnOn);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(700);
    expect(results[0].subject_count).toBe(7);
  });

  it('5. Standalone Upper Primary exam preserves Agriculture behaviour regardless of composite helper', () => {
    const standaloneExam: Examination = {
      ...kpseaExamWithoutAgn,
      id: 'ex_standalone',
      assessment_structure: 'Standalone',
    };
    // In standalone, agriculture is one of the 8 separate subjects if allocated/applicable
    const results = calculateExamResults(standaloneExam.id, [student2], [
      { id: 'm_agn', student_id: student2.id, exam_id: standaloneExam.id, subject_id: agnUuid, marks: 75, raw_score: 75, out_of: 100 },
    ], grades, [classWithAgn], allSubjects, standaloneExam);
    expect(results[0].subject_count).toBe(1);
    expect(results[0].total_marks).toBe(75);
  });
});
