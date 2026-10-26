import './setupLocalStorage';
import { describe, it, expect } from 'vitest';
import {
  calculateLearningAreaTerminalResult,
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
  resolveContributingAssessmentsStructure,
} from '../services/terminalResultsEngine';
import { initialGrades, initialSubjects } from '../data/seedData';
import { Student, Mark } from '../types';

describe('Phase 2 — Upper Primary Standalone Mark Calculation Engine', () => {
  const mockStandaloneAssessments: ContributingAssessmentRef[] = [
    {
      id: 'exam_up_standalone_opener',
      exam_name: 'Grade 6 Opener (Standalone)',
      max_marks: 100,
      out_of: 100,
      assessment_structure: 'Standalone',
      status: 'Approved',
    },
    {
      id: 'exam_up_standalone_midterm',
      exam_name: 'Grade 6 Midterm (Standalone)',
      max_marks: 100,
      out_of: 100,
      assessment_structure: 'Standalone',
      status: 'Approved',
    },
  ];

  const student: Student = {
    id: 'std_up_sa_01',
    admission_number: 'ADM-602',
    first_name: 'Kevin',
    last_name: 'Otieno',
    full_name: 'Kevin Otieno',
    grade: 'Grade 6',
    education_level: 'Upper Primary',
    class_id: 'cls_grade_6',
    gender: 'M',
    active: true,
  };

  describe('1. Standalone Subject Calculations (/100 Independent)', () => {
    it('calculates English directly out of 100 without requiring Composition', () => {
      // English mark present /100, NO Composition mark provided in the database
      const marks: Mark[] = [
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_eng', score: 82, raw_score: 82, out_of: 100, marks: 82 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_eng', score: 88, raw_score: 88, out_of: 100, marks: 88 },
      ];

      const res = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_eng',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      expect(res.isComplete).toBe(true);
      expect(res.status).toBe('Complete');
      // Mean: (82 + 88) / 2 = 85 -> EE, 4 points
      expect(res.terminalPercentage).toBe(85);
      expect(res.cbePerformanceLevel).toBe('EE');
      expect(res.points).toBe(4);
      expect(res.assessmentTrail).toHaveLength(2);
      expect(res.assessmentTrail[0].status).toBe('Normal');
      expect(res.assessmentTrail[0].rawScore).toBe(82);
      expect(res.assessmentTrail[1].status).toBe('Normal');
      expect(res.assessmentTrail[1].rawScore).toBe(88);
    });

    it('calculates Kiswahili directly out of 100 without requiring Insha', () => {
      // Kiswahili mark present /100, NO Insha mark provided
      const marks: Mark[] = [
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_kis', score: 70, raw_score: 70, out_of: 100, marks: 70 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_kis', score: 74, raw_score: 74, out_of: 100, marks: 74 },
      ];

      const res = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_kis',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      expect(res.isComplete).toBe(true);
      expect(res.status).toBe('Complete');
      // Mean: (70 + 74) / 2 = 72 -> ME, 3 points
      expect(res.terminalPercentage).toBe(72);
      expect(res.cbePerformanceLevel).toBe('ME');
      expect(res.points).toBe(3);
    });

    it('calculates Social Studies and CRE independently out of 100', () => {
      const marks: Mark[] = [
        // Social Studies marks
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_sst', score: 65, raw_score: 65, out_of: 100, marks: 65 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_sst', score: 75, raw_score: 75, out_of: 100, marks: 75 },
        // CRE marks
        { id: 'm3', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_cre', score: 90, raw_score: 90, out_of: 100, marks: 90 },
        { id: 'm4', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_cre', score: 92, raw_score: 92, out_of: 100, marks: 92 },
      ];

      const sstRes = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_sst',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      const creRes = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_cre',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      // SST: (65 + 75) / 2 = 70% -> ME, 3 points
      expect(sstRes.isComplete).toBe(true);
      expect(sstRes.terminalPercentage).toBe(70);
      expect(sstRes.cbePerformanceLevel).toBe('ME');
      expect(sstRes.points).toBe(3);

      // CRE: (90 + 92) / 2 = 91% -> EE, 4 points
      expect(creRes.isComplete).toBe(true);
      expect(creRes.terminalPercentage).toBe(91);
      expect(creRes.cbePerformanceLevel).toBe('EE');
      expect(creRes.points).toBe(4);
    });

    it('calculates Agriculture independently when included in Standalone', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', score: 80, raw_score: 80, out_of: 100, marks: 80 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', score: 84, raw_score: 84, out_of: 100, marks: 84 },
      ];

      const agRes = calculateLearningAreaTerminalResult({
        subjectId: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      expect(agRes.isComplete).toBe(true);
      expect(agRes.terminalPercentage).toBe(82);
      expect(agRes.cbePerformanceLevel).toBe('EE');
      expect(agRes.points).toBe(4);
    });
  });

  describe('2. Learner Isolation & False-X Protections in Standalone', () => {
    it('isolates learner marks: another learner having marks does NOT mark this learner complete', () => {
      const marks: Mark[] = [
        // std_other has marks, student std_up_sa_01 does not
        { id: 'm1', student_id: 'std_other', exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_eng', score: 82, raw_score: 82, out_of: 100, marks: 82 },
        { id: 'm2', student_id: 'std_other', exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_eng', score: 88, raw_score: 88, out_of: 100, marks: 88 },
      ];

      const res = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_eng',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      expect(res.isComplete).toBe(false);
      expect(res.status).toBe('INCOMPLETE (X)');
      expect(res.terminalPercentage).toBeNull();
      expect(res.cbePerformanceLevel).toBeNull();
    });

    it('preserves genuine zero marks (0 is a valid score, not X or missing)', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_mat', score: 0, raw_score: 0, out_of: 100, marks: 0 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_mat', score: 50, raw_score: 50, out_of: 100, marks: 50 },
      ];

      const res = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_mat',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      expect(res.isComplete).toBe(true);
      expect(res.status).toBe('Complete');
      // Mean: (0 + 50) / 2 = 25 -> BE, 1 point
      expect(res.terminalPercentage).toBe(25);
      expect(res.cbePerformanceLevel).toBe('BE');
      expect(res.points).toBe(1);
    });

    it('correctly handles absence (special_status: "Y") producing INCOMPLETE (Y)', () => {
      const marks: Mark[] = [
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_mat', score: 80, raw_score: 80, out_of: 100, marks: 80 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_mat', special_status: 'Y', out_of: 100 },
      ];

      const res = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_mat',
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        learnerId: student.id,
      });

      expect(res.isComplete).toBe(false);
      expect(res.status).toBe('INCOMPLETE (Y)');
      expect(res.displayPercentage).toBe('Y');
      expect(res.terminalPercentage).toBeNull();
    });
  });

  describe('3. calculateLearnerTerminalResults with Standalone Structure', () => {
    it('returns 8 independent learning areas when Agriculture is included', () => {
      const marks: Mark[] = [
        // English
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_eng', score: 80, raw_score: 80, out_of: 100, marks: 80 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_eng', score: 80, raw_score: 80, out_of: 100, marks: 80 },
        // Kiswahili
        { id: 'm3', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_kis', score: 70, raw_score: 70, out_of: 100, marks: 70 },
        { id: 'm4', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_kis', score: 70, raw_score: 70, out_of: 100, marks: 70 },
        // Mathematics
        { id: 'm5', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_mat', score: 90, raw_score: 90, out_of: 100, marks: 90 },
        { id: 'm6', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_mat', score: 90, raw_score: 90, out_of: 100, marks: 90 },
        // Science
        { id: 'm7', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_sci', score: 85, raw_score: 85, out_of: 100, marks: 85 },
        { id: 'm8', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_sci', score: 85, raw_score: 85, out_of: 100, marks: 85 },
        // SST
        { id: 'm9', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_sst', score: 60, raw_score: 60, out_of: 100, marks: 60 },
        { id: 'm10', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_sst', score: 60, raw_score: 60, out_of: 100, marks: 60 },
        // CRE
        { id: 'm11', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_cre', score: 95, raw_score: 95, out_of: 100, marks: 95 },
        { id: 'm12', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_cre', score: 95, raw_score: 95, out_of: 100, marks: 95 },
        // Agriculture
        { id: 'm13', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', score: 75, raw_score: 75, out_of: 100, marks: 75 },
        { id: 'm14', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', score: 75, raw_score: 75, out_of: 100, marks: 75 },
        // CAS
        { id: 'm15', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_cas', score: 88, raw_score: 88, out_of: 100, marks: 88 },
        { id: 'm16', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_cas', score: 88, raw_score: 88, out_of: 100, marks: 88 },
      ];

      const resultMap = calculateLearnerTerminalResults({
        learnerId: student.id,
        subjectIds: ['sb_up_eng', 'sb_up_kis', 'sb_up_mat', 'sb_sci', 'sb_up_sst', 'sb_up_cre', 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', 'sb_up_cas'],
        contributingAssessments: mockStandaloneAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        subjects: initialSubjects,
      });

      // Confirm all 8 learning areas exist and are complete
      expect(resultMap.get('sb_up_eng')?.terminalPercentage).toBe(80);
      expect(resultMap.get('sb_up_kis')?.terminalPercentage).toBe(70);
      expect(resultMap.get('sb_up_mat')?.terminalPercentage).toBe(90);
      expect(resultMap.get('sb_sci')?.terminalPercentage).toBe(85);
      expect(resultMap.get('sb_up_sst')?.terminalPercentage).toBe(60);
      expect(resultMap.get('sb_up_cre')?.terminalPercentage).toBe(95);
      expect(resultMap.get('a9bf02ee-5e4e-46fa-b7d5-39f77657821f')?.terminalPercentage).toBe(75);
      expect(resultMap.get('sb_up_cas')?.terminalPercentage).toBe(88);
    });

    it('returns 7 independent learning areas when Agriculture is excluded (include_agriculture === false)', () => {
      const assessmentsWithoutAg: ContributingAssessmentRef[] = mockStandaloneAssessments.map((a) => ({
        ...a,
        include_agriculture: false,
      }));

      const marks: Mark[] = [
        { id: 'm1', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_eng', score: 80, raw_score: 80, out_of: 100, marks: 80 },
        { id: 'm2', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_eng', score: 80, raw_score: 80, out_of: 100, marks: 80 },
        { id: 'm3', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_kis', score: 70, raw_score: 70, out_of: 100, marks: 70 },
        { id: 'm4', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_kis', score: 70, raw_score: 70, out_of: 100, marks: 70 },
        { id: 'm5', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_mat', score: 90, raw_score: 90, out_of: 100, marks: 90 },
        { id: 'm6', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_mat', score: 90, raw_score: 90, out_of: 100, marks: 90 },
        { id: 'm7', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_sci', score: 85, raw_score: 85, out_of: 100, marks: 85 },
        { id: 'm8', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_sci', score: 85, raw_score: 85, out_of: 100, marks: 85 },
        { id: 'm9', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_sst', score: 60, raw_score: 60, out_of: 100, marks: 60 },
        { id: 'm10', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_sst', score: 60, raw_score: 60, out_of: 100, marks: 60 },
        { id: 'm11', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_cre', score: 95, raw_score: 95, out_of: 100, marks: 95 },
        { id: 'm12', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_cre', score: 95, raw_score: 95, out_of: 100, marks: 95 },
        { id: 'm15', student_id: student.id, exam_id: 'exam_up_standalone_opener', subject_id: 'sb_up_cas', score: 88, raw_score: 88, out_of: 100, marks: 88 },
        { id: 'm16', student_id: student.id, exam_id: 'exam_up_standalone_midterm', subject_id: 'sb_up_cas', score: 88, raw_score: 88, out_of: 100, marks: 88 },
      ];

      const resultMap = calculateLearnerTerminalResults({
        learnerId: student.id,
        subjectIds: ['sb_up_eng', 'sb_up_kis', 'sb_up_mat', 'sb_sci', 'sb_up_sst', 'sb_up_cre', 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', 'sb_up_cas'],
        contributingAssessments: assessmentsWithoutAg,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        subjects: initialSubjects,
      });

      // Agriculture should NOT be in the result map
      expect(resultMap.has('a9bf02ee-5e4e-46fa-b7d5-39f77657821f')).toBe(false);
      // The other 7 learning areas exist and are complete
      expect(resultMap.get('sb_up_eng')?.terminalPercentage).toBe(80);
      expect(resultMap.get('sb_up_kis')?.terminalPercentage).toBe(70);
      expect(resultMap.get('sb_up_mat')?.terminalPercentage).toBe(90);
      expect(resultMap.get('sb_sci')?.terminalPercentage).toBe(85);
      expect(resultMap.get('sb_up_sst')?.terminalPercentage).toBe(60);
      expect(resultMap.get('sb_up_cre')?.terminalPercentage).toBe(95);
      expect(resultMap.get('sb_up_cas')?.terminalPercentage).toBe(88);
    });
  });

  describe('4. Mixed Structure Isolation & Protection', () => {
    it('detects mixed Composite and Standalone assessments and blocks calculation with INCOMPATIBLE_STRUCTURE', () => {
      const mixedAssessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_comp',
          exam_name: 'Composite Opener Exam',
          max_marks: 100,
          assessment_structure: 'Composite',
        },
        {
          id: 'exam_sa',
          exam_name: 'Standalone Midterm Exam',
          max_marks: 100,
          assessment_structure: 'Standalone',
        },
      ];

      const structureInfo = resolveContributingAssessmentsStructure(mixedAssessments);
      expect(structureInfo.isMixed).toBe(true);
      expect(structureInfo.isIncompatible).toBe(true);
      expect(structureInfo.structure).toBe('Mixed');

      const res = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_eng',
        contributingAssessments: mixedAssessments,
        marks: [],
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(res.isComplete).toBe(false);
      expect(res.status).toBe('INCOMPATIBLE_STRUCTURE');
      expect(res.incompatibleStructure).toBe(true);
      expect(res.displayPercentage).toBe('Incompatible');
      expect(res.incompatibilityReason).toContain('Incompatible assessment structures');
    });
  });
});
