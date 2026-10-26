import { describe, it, expect } from 'vitest';
import { Examination, ClassStream, Subject, User, Teacher } from '../types';
import { isAgricultureSubject, isAgricultureIncludedInCompositeExam } from '../utils/markUtils';
import { getAccessibleSubjects } from '../utils/rbacUtils';

describe('Marks Entry Exam-Level Agriculture Dropdown Inclusion', () => {
  const subjects: Subject[] = [
    { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_mat', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
  ];

  const classWithoutAgn: ClassStream = {
    id: 'cls_g6_no_agn',
    class_name: 'Grade 6',
    stream: 'East',
    stream_id: 'str_g6a',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_eng', 'sb_comp', 'sb_kis', 'sb_insha', 'sb_mat', 'sb_sci', 'sb_sst', 'sb_cre', 'sb_cas'],
  };

  const classWithAgn: ClassStream = {
    id: 'cls_g6_with_agn',
    class_name: 'Grade 6',
    stream: 'West',
    stream_id: 'str_g6b',
    education_level: 'Upper Primary',
    allocated_subject_ids: ['sb_eng', 'sb_comp', 'sb_kis', 'sb_insha', 'sb_mat', 'sb_sci', 'sb_sst', 'sb_cre', 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', 'sb_cas'],
  };

  // Pure logic replicating the updated componentAdjustedGradeSubjects in MarksEntryTable.tsx
  function resolveMarksEntryGradeSubjects(
    classObj: ClassStream,
    examObj: Examination,
    allSubjects: Subject[]
  ): Subject[] {
    // 1. Initial subjects for class
    let allocated = allSubjects.filter(s => classObj.allocated_subject_ids?.includes(s.id));
    
    // 2. Exam-Level Agriculture Adjustment
    const isAgnIncluded = examObj.assessment_structure === 'Standalone' || isAgricultureIncludedInCompositeExam(examObj, classObj, allSubjects);
    if (isAgnIncluded) {
      const hasAgn = allocated.some(s => isAgricultureSubject(s));
      if (!hasAgn) {
        const agnSubject = allSubjects.find(s => isAgricultureSubject(s));
        if (agnSubject) {
          allocated = [...allocated, agnSubject];
        }
      }
    } else {
      allocated = allocated.filter(s => !isAgricultureSubject(s));
    }

    return allocated;
  }

  it('1. Includes Agriculture in Marks Entry dropdown when exam has include_agriculture = true, even if class lacks AGN allocation', () => {
    const examWithAgn: Examination = {
      id: 'ex_g6_kpsea',
      exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: true,
    };

    const result = resolveMarksEntryGradeSubjects(classWithoutAgn, examWithAgn, subjects);
    const hasAgn = result.some(s => isAgricultureSubject(s));

    expect(hasAgn).toBe(true);
    expect(result.find(s => s.subject_code === 'AGN')).toBeDefined();
  });

  it('2. Excludes Agriculture from Marks Entry dropdown when exam has include_agriculture = false, even if class has AGN allocation', () => {
    const examWithoutAgn: Examination = {
      id: 'ex_g6_no_agn',
      exam_name: 'GRADE 6 KPSEA EXCLUDE AGN 2026',
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: false,
    };

    const result = resolveMarksEntryGradeSubjects(classWithAgn, examWithoutAgn, subjects);
    const hasAgn = result.some(s => isAgricultureSubject(s));

    expect(hasAgn).toBe(false);
  });

  it('3. Falls back to class allocation when include_agriculture is NULL/undefined (Historical exam)', () => {
    const historicalExam: Examination = {
      id: 'ex_historical',
      exam_name: 'Historical Grade 6 Exam',
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: undefined,
    };

    const resClassWithoutAgn = resolveMarksEntryGradeSubjects(classWithoutAgn, historicalExam, subjects);
    expect(resClassWithoutAgn.some(s => isAgricultureSubject(s))).toBe(false);

    const resClassWithAgn = resolveMarksEntryGradeSubjects(classWithAgn, historicalExam, subjects);
    expect(resClassWithAgn.some(s => isAgricultureSubject(s))).toBe(true);
  });

  it('4. Preserves Agriculture via getAccessibleSubjects for Class Teacher when include_agriculture = true', () => {
    const classTeacherUser: User = {
      id: 'usr_ct_1',
      username: 'teacher1',
      email: 'teacher1@school.ac.ke',
      name: 'Class Teacher Grade 6',
      role: 'class_teacher',
      teacher_id: 'tch_1',
    };

    const classTeacherObj: Teacher = {
      id: 'tch_1',
      user_id: 'usr_ct_1',
      teacher_name: 'Class Teacher Grade 6',
      email: 'teacher1@school.ac.ke',
      phone: '+254700000000',
      is_class_teacher: true,
      class_teacher_of_id: 'str_g6a', // Class Teacher for Grade 6 East (classWithoutAgn)
      status: 'Active',
    };

    const examWithAgn: Examination = {
      id: 'ex_g6_kpsea',
      exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: true,
    };

    const accessible = getAccessibleSubjects(
      classTeacherUser,
      classTeacherObj,
      subjects,
      'str_g6a',
      [classWithoutAgn],
      examWithAgn
    );

    const hasAgn = accessible.some(s => isAgricultureSubject(s));
    expect(hasAgn).toBe(true);
    expect(accessible.find(s => s.subject_code === 'AGN')).toBeDefined();
  });
});
