import { describe, it, expect } from 'vitest';
import { Subject, Mark, Grade, Examination, ClassStream } from '../types';
import { isAgricultureIncludedInCompositeExam } from '../utils/markUtils';
import { calculateExamResults, CBE_4_POINT_GRADES } from '../services/analysisEngine';

describe('Exam-Level Optional Agriculture for Upper Primary Composite', () => {
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

  const ssCreSub: Subject = {
    id: 'sb_up_ss_cre',
    subject_code: 'SS&CRE',
    subject_name: 'Social Studies & CRE',
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

  const allSubjects = [engLangSub, engCompSub, kiswLangSub, kiswInshaSub, mathSub, sciSub, casSub, ssCreSub, sstSub, creSub, agnSub];

  const classWithoutAgn: ClassStream = {
    id: 'cls_no_agn',
    class_name: 'Grade 6 East',
    stream: 'East',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_up_eng', 'sb_up_comp', 'sb_up_kis', 'sb_up_insha', 'sb_up_math', 'sb_up_sci', 'sb_up_cas', 'sb_up_ss_cre'],
  };

  const classWithAgn: ClassStream = {
    id: 'cls_with_agn',
    class_name: 'Grade 6 West',
    stream: 'West',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_up_eng', 'sb_up_comp', 'sb_up_kis', 'sb_up_insha', 'sb_up_math', 'sb_up_sci', 'sb_up_cas', 'sb_up_ss_cre', agnUuid],
  };

  const grades: Grade[] = CBE_4_POINT_GRADES;

  const student1 = { id: 'std_1', admission_number: 'ADM001', full_name: 'Student One', class_id: 'cls_no_agn', grade: 'Grade 6' as const };
  const student2 = { id: 'std_2', admission_number: 'ADM002', full_name: 'Student Two', class_id: 'cls_with_agn', grade: 'Grade 6' as const };

  const student1FullMarks: Mark[] = [
    { id: 'm1', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_eng', marks: 50, raw_score: 50, out_of: 60 },
    { id: 'm2', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_comp', marks: 40, raw_score: 40, out_of: 40 },
    { id: 'm3', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_kis', marks: 50, raw_score: 50, out_of: 60 },
    { id: 'm4', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_insha', marks: 30, raw_score: 30, out_of: 40 },
    { id: 'm5', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_math', marks: 80, raw_score: 80, out_of: 100 },
    { id: 'm6', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_sci', marks: 75, raw_score: 75, out_of: 100 },
    { id: 'm7', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_cas', marks: 70, raw_score: 70, out_of: 100 },
    { id: 'm8', student_id: 'std_1', exam_id: 'ex_1', subject_id: 'sb_up_ss_cre', marks: 65, raw_score: 65, out_of: 100 },
    { id: 'm9', student_id: 'std_1', exam_id: 'ex_1', subject_id: agnUuid, marks: 85, raw_score: 85, out_of: 100 },
  ];

  it('TEST 1: Upper Primary Composite with include_agriculture = true + class has no AGN -> /700 Structure', () => {
    const exam: Examination = {
      id: 'ex_1',
      exam_name: 'Test Exam AGN ON',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      assessment_structure: 'Composite',
      ss_cre_structure: 'B',
      include_agriculture: true,
      education_level: 'Upper Primary',
      class_id: classWithoutAgn.id,
    };

    expect(isAgricultureIncludedInCompositeExam(exam, classWithoutAgn, allSubjects)).toBe(true);

    const results = calculateExamResults(exam.id, [student1 as any], student1FullMarks, grades, [classWithoutAgn], allSubjects, exam);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(700);
    expect(results[0].subject_count).toBe(7);
  });

  it('TEST 2: Upper Primary Composite with include_agriculture = false + class has AGN -> /600 Structure', () => {
    const exam: Examination = {
      id: 'ex_2',
      exam_name: 'Test Exam AGN OFF',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      assessment_structure: 'Composite',
      ss_cre_structure: 'B',
      include_agriculture: false,
      education_level: 'Upper Primary',
      class_id: classWithAgn.id,
    };

    const ex2Marks = student1FullMarks.map(m => ({ ...m, exam_id: 'ex_2', student_id: 'std_2' }));

    expect(isAgricultureIncludedInCompositeExam(exam, classWithAgn, allSubjects)).toBe(false);

    const results = calculateExamResults(exam.id, [student2 as any], ex2Marks, grades, [classWithAgn], allSubjects, exam);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(600);
    expect(results[0].subject_count).toBe(6);
  });

  it('TEST 3: Historical Exam with include_agriculture = undefined/null + class has no AGN -> /600 Fallback', () => {
    const exam: Examination = {
      id: 'ex_hist_1',
      exam_name: 'Historical Exam No AGN Class',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      assessment_structure: 'Composite',
      ss_cre_structure: 'B',
      include_agriculture: undefined,
      education_level: 'Upper Primary',
      class_id: classWithoutAgn.id,
    };

    const exHist1Marks = student1FullMarks.map(m => ({ ...m, exam_id: 'ex_hist_1' }));

    expect(isAgricultureIncludedInCompositeExam(exam, classWithoutAgn, allSubjects)).toBe(false);

    const results = calculateExamResults(exam.id, [student1 as any], exHist1Marks, grades, [classWithoutAgn], allSubjects, exam);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(600);
    expect(results[0].subject_count).toBe(6);
  });

  it('TEST 4: Historical Exam with include_agriculture = undefined/null + class has AGN -> /700 Fallback', () => {
    const exam: Examination = {
      id: 'ex_hist_2',
      exam_name: 'Historical Exam AGN Class',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      assessment_structure: 'Composite',
      ss_cre_structure: 'B',
      include_agriculture: undefined,
      education_level: 'Upper Primary',
      class_id: classWithAgn.id,
    };

    const exHist2Marks = student1FullMarks.map(m => ({ ...m, exam_id: 'ex_hist_2', student_id: 'std_2' }));

    expect(isAgricultureIncludedInCompositeExam(exam, classWithAgn, allSubjects)).toBe(true);

    const results = calculateExamResults(exam.id, [student2 as any], exHist2Marks, grades, [classWithAgn], allSubjects, exam);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(700);
    expect(results[0].subject_count).toBe(7);
  });

  it('TEST 5: Standalone Upper Primary Exam -> /800 Compulsory Agriculture', () => {
    const exam: Examination = {
      id: 'ex_standalone',
      exam_name: 'Standalone Upper Primary Exam',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      assessment_structure: 'Standalone',
      education_level: 'Upper Primary',
      class_id: classWithoutAgn.id,
    };

    const standaloneMarks: Mark[] = [
      { id: 'm1', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_eng', marks: 80, raw_score: 80, out_of: 100 },
      { id: 'm2', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_kis', marks: 70, raw_score: 70, out_of: 100 },
      { id: 'm3', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_math', marks: 85, raw_score: 85, out_of: 100 },
      { id: 'm4', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_sci', marks: 75, raw_score: 75, out_of: 100 },
      { id: 'm5', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_sst', marks: 65, raw_score: 65, out_of: 100 },
      { id: 'm6', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_cre', marks: 60, raw_score: 60, out_of: 100 },
      { id: 'm7', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: agnUuid, marks: 90, raw_score: 90, out_of: 100 },
      { id: 'm8', student_id: 'std_1', exam_id: 'ex_standalone', subject_id: 'sb_up_cas', marks: 70, raw_score: 70, out_of: 100 },
    ];

    const results = calculateExamResults(exam.id, [student1 as any], standaloneMarks, grades, [classWithoutAgn], allSubjects, exam);
    expect(results).toHaveLength(1);
    expect(results[0].total_max_marks).toBe(800);
    expect(results[0].subject_count).toBe(8);
  });
});
