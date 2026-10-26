import { describe, it, expect } from 'vitest';
import { Student, Examination, Subject, Grade, ClassStream, Mark } from '../types';
import { buildLearnerTrajectory } from '../services/learnerTrajectoryEngine';
import { formatCbePerformanceLevel } from '../utils/examDisplayUtils';

describe('Learner Profile: Exam Approval & Performance Level Formatting', () => {
  const grades: Grade[] = [
    { id: 'g1', grade_code: 'EE1', minimum_score: 90, maximum_score: 100, points: 4, performance_level: 'EE', remarks: 'Exceeding Expectations', descriptor: 'Very High' },
    { id: 'g2', grade_code: 'EE2', minimum_score: 80, maximum_score: 89, points: 4, performance_level: 'EE', remarks: 'Exceeding Expectations', descriptor: 'High' },
    { id: 'g3', grade_code: 'ME1', minimum_score: 70, maximum_score: 79, points: 3, performance_level: 'ME', remarks: 'Meeting Expectations', descriptor: 'Good' },
    { id: 'g4', grade_code: 'ME2', minimum_score: 60, maximum_score: 69, points: 3, performance_level: 'ME', remarks: 'Meeting Expectations', descriptor: 'Adequate' },
    { id: 'g5', grade_code: 'AE1', minimum_score: 50, maximum_score: 59, points: 2, performance_level: 'AE', remarks: 'Approaching Expectations', descriptor: 'Fair' },
    { id: 'g6', grade_code: 'AE2', minimum_score: 40, maximum_score: 49, points: 2, performance_level: 'AE', remarks: 'Approaching Expectations', descriptor: 'Low' },
    { id: 'g7', grade_code: 'BE1', minimum_score: 20, maximum_score: 39, points: 1, performance_level: 'BE', remarks: 'Below Expectations', descriptor: 'Needs Support' },
    { id: 'g8', grade_code: 'BE2', minimum_score: 0, maximum_score: 19, points: 1, performance_level: 'BE', remarks: 'Below Expectations', descriptor: 'Critical' },
  ];

  const classes: ClassStream[] = [
    { id: 'cls_4', class_name: 'Grade 4', stream: 'East', education_level: 'Upper Primary' },
    { id: 'cls_7', class_name: 'Grade 7', stream: 'East', education_level: 'Junior School' },
    { id: 'cls_8', class_name: 'Grade 8', stream: 'East', education_level: 'Junior School' },
    { id: 'cls_9', class_name: 'Grade 9', stream: 'East', education_level: 'Junior School' },
  ];

  const subjects: Subject[] = [
    { id: 'sb_mat', subject_code: 'MAT', subject_name: 'Mathematics', education_level: 'Junior School', category: 'Core' },
    { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Junior School', category: 'Core' },
  ];

  const juniorStudent: Student = {
    id: 'std_jss',
    admission_number: 'ADM-901',
    full_name: 'Faith Wairimu',
    class_id: 'cls_9',
    grade: 'Grade 9',
    gender: 'F',
    active: true,
    education_level: 'Junior School',
  };

  const primaryStudent: Student = {
    id: 'std_pri',
    admission_number: 'ADM-401',
    full_name: 'David Kimani',
    class_id: 'cls_4',
    grade: 'Grade 4',
    gender: 'M',
    active: true,
    education_level: 'Upper Primary',
  };

  describe('1. Exam Approval Enforcement', () => {
    const approvedExam: Examination = {
      id: 'ex_approved',
      exam_name: 'Grade 9 Opener Assessment Term 3 2026',
      year: 2026,
      term: 'Term 3',
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
    };

    const draftExam: Examination = {
      id: 'ex_draft',
      exam_name: 'Grade 9 Mid-Term Assessment Term 3 2026',
      year: 2026,
      term: 'Term 3',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
    };

    const openExam: Examination = {
      id: 'ex_open',
      exam_name: 'Grade 9 End-Term Assessment Term 3 2026',
      year: 2026,
      term: 'Term 3',
      status: 'Open',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_jss', exam_id: 'ex_approved', subject_id: 'sb_mat', marks: 85, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'std_jss', exam_id: 'ex_draft', subject_id: 'sb_mat', marks: 90, out_of: 100, special_status: 'Normal' },
      { id: 'm3', student_id: 'std_jss', exam_id: 'ex_open', subject_id: 'sb_mat', marks: 95, out_of: 100, special_status: 'Normal' },
    ];

    it('only includes Approved examinations in the learner trajectory, excluding Draft and Open exams', () => {
      const trajectory = buildLearnerTrajectory(
        juniorStudent,
        [approvedExam, draftExam, openExam],
        marks,
        subjects,
        grades,
        classes
      );

      expect(trajectory.all_milestones.length).toBe(1);
      expect(trajectory.all_milestones[0].exam_id).toBe('ex_approved');
      expect(trajectory.usable_milestones.length).toBe(1);
      expect(trajectory.usable_milestones[0].exam_id).toBe('ex_approved');
    });
  });

  describe('2. Performance Level Formatting by Education Level', () => {
    it('Junior School returns sub-level codes (EE1, EE2, ME1, ME2, AE1, AE2, BE1, BE2) and NEVER EE(EE1)', () => {
      expect(formatCbePerformanceLevel('EE', 'EE1', 'Junior School')).toBe('EE1');
      expect(formatCbePerformanceLevel('EE', 'EE2', 'Grade 9')).toBe('EE2');
      expect(formatCbePerformanceLevel('ME', 'ME1', 'Grade 8')).toBe('ME1');
      expect(formatCbePerformanceLevel('ME', 'ME2', 'Grade 7')).toBe('ME2');
      expect(formatCbePerformanceLevel('AE', 'AE1', 'Junior School')).toBe('AE1');
      expect(formatCbePerformanceLevel('AE', 'AE2', 'Grade 9')).toBe('AE2');
      expect(formatCbePerformanceLevel('BE', 'BE1', 'Grade 8')).toBe('BE1');
      expect(formatCbePerformanceLevel('BE', 'BE2', 'Grade 7')).toBe('BE2');

      // Verify no parenthetical combination like EE(EE1) is returned
      const result = formatCbePerformanceLevel('EE', 'EE1', 'Grade 9');
      expect(result).not.toContain('(');
      expect(result).not.toContain(')');
      expect(result).toBe('EE1');
    });

    it('Other levels (Lower Primary, Upper Primary, Pre-Primary) return base performance levels (EE, ME, AE, BE)', () => {
      expect(formatCbePerformanceLevel('EE', 'EE1', 'Upper Primary')).toBe('EE');
      expect(formatCbePerformanceLevel('EE', 'EE2', 'Grade 6')).toBe('EE');
      expect(formatCbePerformanceLevel('ME', 'ME1', 'Grade 4')).toBe('ME');
      expect(formatCbePerformanceLevel('ME', 'ME2', 'Lower Primary')).toBe('ME');
      expect(formatCbePerformanceLevel('AE', 'AE1', 'Grade 3')).toBe('AE');
      expect(formatCbePerformanceLevel('AE', 'AE2', 'Grade 1')).toBe('AE');
      expect(formatCbePerformanceLevel('BE', 'BE1', 'Pre-Primary')).toBe('BE');
      expect(formatCbePerformanceLevel('BE', 'BE2', 'PP2')).toBe('BE');
    });
  });

  describe('3. Stream Resolution Integrity for Multi-Stream Classes', () => {
    const multiStreamClasses: ClassStream[] = [
      { id: 'g9-parent-id', stream_id: 'g9-blue-id', class_name: 'Grade 9', stream: 'Blue', education_level: 'Junior School' },
      { id: 'g9-parent-id', stream_id: 'g9-red-id', class_name: 'Grade 9', stream: 'Red', education_level: 'Junior School' },
    ];

    const studentRed: Student = {
      id: 'std_rose',
      admission_number: '167',
      full_name: 'Rose Wanjiru',
      class_id: 'g9-parent-id',
      stream_id: 'g9-red-id',
      gender: 'F',
      active: true,
      education_level: 'Junior School',
      grade: 'Grade 9',
    };

    const studentBlue: Student = {
      id: 'std_kemuma',
      admission_number: '111',
      full_name: 'Rose Kemuma',
      class_id: 'g9-parent-id',
      stream_id: 'g9-blue-id',
      gender: 'F',
      active: true,
      education_level: 'Junior School',
      grade: 'Grade 9',
    };

    function resolveClassStream(student: Student, classList: ClassStream[]) {
      const classObj =
        (student.stream_id ? (classList || []).find((c) => c.stream_id === student.stream_id || c.id === student.stream_id) : undefined) ||
        (student.class_id ? (classList || []).find((c) => c.id === student.class_id || c.stream_id === student.class_id) : undefined) ||
        (classList || []).find(
          (c) =>
            (c.class_name && student.class_id && c.class_name === student.class_id) ||
            (`${c.class_name || ''} ${c.stream || ''}`.trim().toLowerCase() === String(student.class_id || '').trim().toLowerCase())
        );
      return classObj ? `${classObj.class_name} ${classObj.stream}`.trim() : (student.grade || student.class_id || '');
    }

    it('resolves Rose Wanjiru to Grade 9 Red using stream_id and never hallucinates Grade 9 Blue', () => {
      const resolvedRed = resolveClassStream(studentRed, multiStreamClasses);
      expect(resolvedRed).toBe('Grade 9 Red');
      expect(resolvedRed).not.toBe('Grade 9 Blue');
    });

    it('resolves Rose Kemuma to Grade 9 Blue using stream_id', () => {
      const resolvedBlue = resolveClassStream(studentBlue, multiStreamClasses);
      expect(resolvedBlue).toBe('Grade 9 Blue');
    });
  });
});
