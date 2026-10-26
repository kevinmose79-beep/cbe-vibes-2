import { describe, it, expect } from 'vitest';
import { evaluateMark } from '../utils/markUtils';
import { Teacher, ClassStream, Subject, Examination, Mark, Student, GradeName } from '../types';
import { computeTeacherExamReminder } from '../utils/teacherExamReminderUtils';

describe('Subject Teacher Dashboard Mark Progress & Performance Forensic Tests', () => {
  // Common Subjects
  const agnSubject: Subject = {
    id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f',
    subject_code: 'AGN',
    subject_name: 'Agriculture',
    category: 'Core',
    education_level: 'Junior School',
  };

  const intSciSubject: Subject = {
    id: 'sci_01',
    subject_code: 'INT-SCI',
    subject_name: 'Integrated Science',
    category: 'Core',
    education_level: 'Junior School',
  };

  const subjects = [agnSubject, intSciSubject];

  // Classes & Streams
  const grade7Red: ClassStream = {
    id: 'cls_g7',
    stream_id: 'strm_g7_red',
    class_name: 'Grade 7',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const grade7Blue: ClassStream = {
    id: 'cls_g7',
    stream_id: 'strm_g7_blue',
    class_name: 'Grade 7',
    stream: 'Blue',
    education_level: 'Junior School',
  };

  const grade8Red: ClassStream = {
    id: 'cls_g8',
    stream_id: 'strm_g8_red',
    class_name: 'Grade 8',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const classes = [grade7Red, grade7Blue, grade8Red];

  // Teacher Francis with 3 Allocations
  const francisTeacher: Teacher = {
    id: '12699b07-cb2f-4f19-89dc-cbfd7efd3bfa',
    teacher_name: 'Francis',
    email: 'francis@school.ac.ke',
    phone: '+254700000000',
    is_class_teacher: false,
    allocations: [
      {
        id: 'alloc_1',
        subject_id: agnSubject.id,
        class_id: grade7Red.id,
        stream_id: grade7Red.stream_id,
        class_name: 'Grade 7',
        stream: 'Red',
        education_level: 'Junior School',
      },
      {
        id: 'alloc_2',
        subject_id: agnSubject.id,
        class_id: grade7Blue.id,
        stream_id: grade7Blue.stream_id,
        class_name: 'Grade 7',
        stream: 'Blue',
        education_level: 'Junior School',
      },
      {
        id: 'alloc_3',
        subject_id: intSciSubject.id,
        class_id: grade8Red.id,
        stream_id: grade8Red.stream_id,
        class_name: 'Grade 8',
        stream: 'Red',
        education_level: 'Junior School',
      },
    ],
  };

  // Examination
  const sbaJuniorExam: Examination = {
    id: '94257bd6-cd77-4e16-966c-89b82634a36b',
    exam_name: 'SBA KNEC Assessment Junior 2026',
    term: 'Term 3',
    year: 2026,
    status: 'Provisional',
    exam_type: 'Mid-Term',
    max_marks: 100,
    education_level: 'Junior School',
    applicable_classes: [grade7Red.id, grade8Red.id],
  };

  // Helper to generate students for a stream
  const createStudents = (count: number, cls: ClassStream, prefix: string): Student[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `${prefix}_std_${i + 1}`,
      admission_number: `${prefix}_ADM_${i + 1}`,
      full_name: `${prefix} Student ${i + 1}`,
      class_id: cls.id,
      stream_id: cls.stream_id,
      active: true,
      grade: cls.class_name as GradeName,
      gender: 'M',
    }));
  };

  const g7RedStudents = createStudents(49, grade7Red, 'g7r'); // 49 students
  const g7BlueStudents = createStudents(46, grade7Blue, 'g7b'); // 46 students
  const g8RedStudents = createStudents(37, grade8Red, 'g8r'); // 37 students
  const allStudents = [...g7RedStudents, ...g7BlueStudents, ...g8RedStudents];

  describe('1. Shared Mark Evaluator Rules', () => {
    it('treats { marks: 0, raw_score: 0, special_status: "Blank" } as unentered (status: "Blank")', () => {
      const blankMark: Mark = {
        id: 'm_blank',
        student_id: 'std_1',
        subject_id: agnSubject.id,
        exam_id: sbaJuniorExam.id,
        marks: 0,
        raw_score: 0,
        score: 0,
        special_status: 'Blank',
        out_of: 100,
      } as any;

      const evaluated = evaluateMark(blankMark);
      expect(evaluated.status).toBe('Blank');
      expect(evaluated.percentage).toBeNull();
      expect(evaluated.rawScore).toBeNull();

      // Completion predicate: Normal, X, Y are entered; Blank is not
      const isEntered = evaluated.status === 'Normal' || evaluated.status === 'X' || evaluated.status === 'Y';
      expect(isEntered).toBe(false);
    });

    it('treats a genuine numerical zero score as entered (status: "Normal")', () => {
      const genuineZeroMark: Mark = {
        id: 'm_zero',
        student_id: 'std_2',
        subject_id: agnSubject.id,
        exam_id: sbaJuniorExam.id,
        marks: 0,
        raw_score: 0,
        score: 0,
        special_status: null,
        out_of: 100,
      } as any;

      const evaluated = evaluateMark(genuineZeroMark);
      expect(evaluated.status).toBe('Normal');
      expect(evaluated.percentage).toBe(0);
      expect(evaluated.rawScore).toBe(0);

      const isEntered = evaluated.status === 'Normal' || evaluated.status === 'X' || evaluated.status === 'Y';
      expect(isEntered).toBe(true);
    });

    it('retains completion behaviour for X (Absent) and Y (Irregularity)', () => {
      const markX: Mark = {
        id: 'm_x',
        student_id: 'std_3',
        subject_id: agnSubject.id,
        exam_id: sbaJuniorExam.id,
        special_status: 'X',
      } as any;

      const markY: Mark = {
        id: 'm_y',
        student_id: 'std_4',
        subject_id: agnSubject.id,
        exam_id: sbaJuniorExam.id,
        special_status: 'Y',
        irregularity_reason: 'Absent',
      } as any;

      const evalX = evaluateMark(markX);
      const evalY = evaluateMark(markY);

      expect(evalX.status).toBe('X');
      expect(evalY.status).toBe('Y');

      expect(evalX.status === 'Normal' || evalX.status === 'X' || evalX.status === 'Y').toBe(true);
      expect(evalY.status === 'Normal' || evalY.status === 'X' || evalY.status === 'Y').toBe(true);
    });
  });

  describe('2. Performance Statistics Exclusions', () => {
    it('excludes Blank, X, and Y from performance means and grade distributions, while retaining genuine zero', () => {
      const marksToAnalyze: Mark[] = [
        // 1 genuine zero
        { id: 'm1', student_id: 's1', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, marks: 0, raw_score: 0, special_status: null, out_of: 100 } as any,
        // 1 normal high score 80
        { id: 'm2', student_id: 's2', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, marks: 80, raw_score: 80, special_status: null, out_of: 100 } as any,
        // 1 normal medium score 60
        { id: 'm3', student_id: 's3', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, marks: 60, raw_score: 60, special_status: null, out_of: 100 } as any,
        // 2 blank records
        { id: 'm4', student_id: 's4', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, marks: 0, raw_score: 0, special_status: 'Blank', out_of: 100 } as any,
        { id: 'm5', student_id: 's5', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, marks: 0, raw_score: 0, special_status: 'Blank', out_of: 100 } as any,
        // 1 Absent X
        { id: 'm6', student_id: 's6', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, special_status: 'X' } as any,
        // 1 Irregularity Y
        { id: 'm7', student_id: 's7', subject_id: agnSubject.id, exam_id: sbaJuniorExam.id, special_status: 'Y' } as any,
      ];

      // Simulate the updated teacherPerformanceStats logic
      let ee = 0;
      let me = 0;
      let ae = 0;
      let be = 0;
      let totalScore = 0;
      let scoredCount = 0;

      marksToAnalyze.forEach((m) => {
        const evaluated = evaluateMark(m);
        if (evaluated.status !== 'Normal' || evaluated.percentage === null || isNaN(evaluated.percentage)) {
          return;
        }

        const pct = evaluated.percentage;
        totalScore += pct;
        scoredCount++;

        if (pct >= 75) ee++;
        else if (pct >= 41) me++;
        else if (pct >= 21) ae++;
        else be++;
      });

      const avgPercentage = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

      // Only the 3 Normal marks (0, 80, 60) must be counted
      expect(scoredCount).toBe(3);
      expect(totalScore).toBe(0 + 80 + 60); // 140
      expect(avgPercentage).toBe(Math.round(140 / 3)); // 47%
      expect(ee).toBe(1); // 80%
      expect(me).toBe(1); // 60%
      expect(ae).toBe(0);
      expect(be).toBe(1); // 0% genuine zero
      // Blank records must NOT be counted in BE
      expect(be).not.toBe(3);
    });
  });

  describe('3. Exact Audit Verification Targets for Teacher Francis', () => {
    // Construct the exact test dataset:
    // - Grade 7 Red Agriculture (49 learners): 47 entered (marks: 70), 2 blank records { marks: 0, raw_score: 0, special_status: 'Blank' }
    // - Grade 7 Blue Agriculture (46 learners): 46 entered (marks: 75), 0 blank records
    // - Grade 8 Red Integrated Science (37 learners): 36 entered (marks: 80), 1 blank record { marks: 0, raw_score: 0, special_status: 'Blank' }
    const marks: Mark[] = [];

    // Grade 7 Red Agriculture
    g7RedStudents.forEach((st, idx) => {
      if (idx < 47) {
        marks.push({
          id: `m_g7r_${idx}`,
          student_id: st.id,
          subject_id: agnSubject.id,
          exam_id: sbaJuniorExam.id,
          marks: 70,
          raw_score: 70,
          score: 70,
          special_status: null,
          out_of: 100,
        } as any);
      } else {
        // 2 blank records
        marks.push({
          id: `m_g7r_${idx}`,
          student_id: st.id,
          subject_id: agnSubject.id,
          exam_id: sbaJuniorExam.id,
          marks: 0,
          raw_score: 0,
          score: 0,
          special_status: 'Blank',
          out_of: 100,
        } as any);
      }
    });

    // Grade 7 Blue Agriculture
    g7BlueStudents.forEach((st, idx) => {
      marks.push({
        id: `m_g7b_${idx}`,
        student_id: st.id,
        subject_id: agnSubject.id,
        exam_id: sbaJuniorExam.id,
        marks: 75,
        raw_score: 75,
        score: 75,
        special_status: null,
        out_of: 100,
      } as any);
    });

    // Grade 8 Red Integrated Science
    g8RedStudents.forEach((st, idx) => {
      if (idx < 36) {
        marks.push({
          id: `m_g8r_${idx}`,
          student_id: st.id,
          subject_id: intSciSubject.id,
          exam_id: sbaJuniorExam.id,
          marks: 80,
          raw_score: 80,
          score: 80,
          special_status: null,
          out_of: 100,
        } as any);
      } else {
        // 1 blank record
        marks.push({
          id: `m_g8r_${idx}`,
          student_id: st.id,
          subject_id: intSciSubject.id,
          exam_id: sbaJuniorExam.id,
          marks: 0,
          raw_score: 0,
          score: 0,
          special_status: 'Blank',
          out_of: 100,
        } as any);
      }
    });

    it('Grade 7 Red Agriculture: computes 47/49 entered, 2 remaining, approx 96%', () => {
      const alloc = francisTeacher.allocations[0];
      const cls = grade7Red;
      const subj = agnSubject;

      const enrolledLearners = allStudents.filter((s) => s.stream_id === cls.stream_id);
      expect(enrolledLearners.length).toBe(49);

      const enrolledStudentIds = new Set(enrolledLearners.map((s) => s.id));
      const enteredStudentIds = new Set<string>();

      marks.forEach((m) => {
        if (
          m.exam_id === sbaJuniorExam.id &&
          (m.subject_id === subj.id || (subj.subject_code && m.subject_id === subj.subject_code)) &&
          enrolledStudentIds.has(m.student_id)
        ) {
          const evaluated = evaluateMark(m);
          if (evaluated.status === 'Normal' || evaluated.status === 'X' || evaluated.status === 'Y') {
            enteredStudentIds.add(m.student_id);
          }
        }
      });

      const enteredMarksCount = enteredStudentIds.size;
      const missingCount = Math.max(0, enrolledLearners.length - enteredMarksCount);
      const percentage = Math.round((enteredMarksCount / enrolledLearners.length) * 100);

      expect(enteredMarksCount).toBe(47);
      expect(missingCount).toBe(2);
      expect(percentage).toBe(96);
    });

    it('Grade 7 Blue Agriculture: computes 46/46 entered, complete, 100%', () => {
      const cls = grade7Blue;
      const subj = agnSubject;

      const enrolledLearners = allStudents.filter((s) => s.stream_id === cls.stream_id);
      expect(enrolledLearners.length).toBe(46);

      const enrolledStudentIds = new Set(enrolledLearners.map((s) => s.id));
      const enteredStudentIds = new Set<string>();

      marks.forEach((m) => {
        if (
          m.exam_id === sbaJuniorExam.id &&
          (m.subject_id === subj.id || (subj.subject_code && m.subject_id === subj.subject_code)) &&
          enrolledStudentIds.has(m.student_id)
        ) {
          const evaluated = evaluateMark(m);
          if (evaluated.status === 'Normal' || evaluated.status === 'X' || evaluated.status === 'Y') {
            enteredStudentIds.add(m.student_id);
          }
        }
      });

      const enteredMarksCount = enteredStudentIds.size;
      const missingCount = Math.max(0, enrolledLearners.length - enteredMarksCount);
      const percentage = Math.round((enteredMarksCount / enrolledLearners.length) * 100);

      expect(enteredMarksCount).toBe(46);
      expect(missingCount).toBe(0);
      expect(percentage).toBe(100);
    });

    it('Grade 8 Red Integrated Science: computes 36/37 entered, 1 remaining, approx 97%', () => {
      const cls = grade8Red;
      const subj = intSciSubject;

      const enrolledLearners = allStudents.filter((s) => s.stream_id === cls.stream_id);
      expect(enrolledLearners.length).toBe(37);

      const enrolledStudentIds = new Set(enrolledLearners.map((s) => s.id));
      const enteredStudentIds = new Set<string>();

      marks.forEach((m) => {
        if (
          m.exam_id === sbaJuniorExam.id &&
          (m.subject_id === subj.id || (subj.subject_code && m.subject_id === subj.subject_code)) &&
          enrolledStudentIds.has(m.student_id)
        ) {
          const evaluated = evaluateMark(m);
          if (evaluated.status === 'Normal' || evaluated.status === 'X' || evaluated.status === 'Y') {
            enteredStudentIds.add(m.student_id);
          }
        }
      });

      const enteredMarksCount = enteredStudentIds.size;
      const missingCount = Math.max(0, enrolledLearners.length - enteredMarksCount);
      const percentage = Math.round((enteredMarksCount / enrolledLearners.length) * 100);

      expect(enteredMarksCount).toBe(36);
      expect(missingCount).toBe(1);
      expect(percentage).toBe(97);
    });

    it('computes Total missing marks = 3, and Attention Required = 2 incomplete allocations', () => {
      // Simulate all 3 allocations
      const allocationProgressResults = francisTeacher.allocations.map((alloc) => {
        const cls = classes.find((c) => c.stream_id === alloc.stream_id)!;
        const subj = subjects.find((s) => s.id === alloc.subject_id)!;

        const enrolledLearners = allStudents.filter((s) => s.stream_id === cls.stream_id);
        const enrolledStudentIds = new Set(enrolledLearners.map((s) => s.id));
        const enteredStudentIds = new Set<string>();

        marks.forEach((m) => {
          if (
            m.exam_id === sbaJuniorExam.id &&
            (m.subject_id === subj.id || (subj.subject_code && m.subject_id === subj.subject_code)) &&
            enrolledStudentIds.has(m.student_id)
          ) {
            const evaluated = evaluateMark(m);
            if (evaluated.status === 'Normal' || evaluated.status === 'X' || evaluated.status === 'Y') {
              enteredStudentIds.add(m.student_id);
            }
          }
        });

        const enteredMarksCount = enteredStudentIds.size;
        const missingCount = Math.max(0, enrolledLearners.length - enteredMarksCount);
        const isComplete = enrolledLearners.length > 0 && enteredMarksCount === enrolledLearners.length;

        return {
          allocationKey: `${subj.id}_${cls.stream_id}`,
          totalStudents: enrolledLearners.length,
          enteredMarksCount,
          missingCount,
          isComplete,
          status: isComplete ? 'Complete' : 'In Progress',
        };
      });

      // Total missing marks across all allocations
      const totalMissingMarks = allocationProgressResults.reduce((acc, a) => acc + a.missingCount, 0);
      expect(totalMissingMarks).toBe(3); // 2 in G7 Red + 0 in G7 Blue + 1 in G8 Red = 3

      // Attention Required counts incomplete allocations
      const attentionItems = allocationProgressResults.filter(
        (a) => a.totalStudents > 0 && a.missingCount > 0 && a.status !== 'Locked'
      );
      expect(attentionItems.length).toBe(2); // exactly 2 incomplete allocations!
    });

    it('confirms computeTeacherExamReminder produces matching results for the teacher', () => {
      const reminder = computeTeacherExamReminder({
        teacher: francisTeacher,
        exams: [sbaJuniorExam],
        classes,
        subjects,
        students: allStudents,
        marks,
      });

      expect(reminder.subjectTeacherSummary).toBeDefined();
      const subSummary = reminder.subjectTeacherSummary!;

      expect(subSummary.totalAllocations).toBe(3);
      expect(subSummary.completedAllocations).toBe(1); // G7 Blue Agriculture
      expect(subSummary.incompleteAllocations).toBe(2); // G7 Red Agriculture, G8 Red Integrated Science
      expect(subSummary.totalMissingMarks).toBe(3); // 2 + 1 = 3
    });
  });
});
