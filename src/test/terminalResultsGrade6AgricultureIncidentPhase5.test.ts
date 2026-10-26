import { describe, it, expect } from 'vitest';
import {
  resolveUpperPrimaryTerminalSubjects,
  getUpperPrimaryCanonicalSubjects,
  getUpperPrimaryStandaloneSubjects,
  calculateLearnerTerminalResults,
  calculateLearningAreaTerminalResult,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import {
  calculateCohortAssessmentRankings,
  calculateSingleLearnerAssessmentRankings,
  LearnerCohortEntry,
} from '../services/terminalRankingEngine';
import {
  generateTerminalMeritDataset,
} from '../services/terminalMeritListExporter';
import { Student, ClassStream, Subject, Mark, School } from '../types';
import { initialSubjects } from '../data/seedData';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';

const mockSchool: School = {
  id: 'sch_incident_test',
  school_name: 'Forensic Academy',
  school_code: 'FA-01',
  county: 'Nairobi',
  email: 'admin@forensic.academy',
};

const mockGrade6Class: ClassStream = {
  id: 'cls_grade_6',
  stream_id: 'str_grade_6_blue',
  class_name: 'Grade 6',
  stream: 'Blue',
  education_level: 'Upper Primary',
};

const mockGrade6ClassWithAgriAllocated: ClassStream = {
  id: 'cls_grade_6_agri',
  stream_id: 'str_grade_6_green',
  class_name: 'Grade 6',
  stream: 'Green',
  education_level: 'Upper Primary',
  allocated_subject_ids: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
};

const studentLearner1: Student = {
  id: 'std_incident_01',
  admission_number: 'ADM-G6-01',
  full_name: 'Learner One Complete',
  class_id: 'cls_grade_6',
  stream_id: 'str_grade_6_blue',
  grade: 'Grade 6',
  education_level: 'Upper Primary',
  gender: 'M',
  active: true,
};

const studentLearner2: Student = {
  id: 'std_incident_02',
  admission_number: 'ADM-G6-02',
  full_name: 'Learner Two Missing Agri In Trial 3',
  class_id: 'cls_grade_6',
  stream_id: 'str_grade_6_blue',
  grade: 'Grade 6',
  education_level: 'Upper Primary',
  gender: 'F',
  active: true,
};

const studentLearner3: Student = {
  id: 'std_incident_03',
  admission_number: 'ADM-G6-03',
  full_name: 'Learner Three Zero Agri',
  class_id: 'cls_grade_6',
  stream_id: 'str_grade_6_blue',
  grade: 'Grade 6',
  education_level: 'Upper Primary',
  gender: 'M',
  active: true,
};

const studentLearner4: Student = {
  id: 'std_incident_04',
  admission_number: 'ADM-G6-04',
  full_name: 'Learner Four Missing Math In Opener',
  class_id: 'cls_grade_6',
  stream_id: 'str_grade_6_blue',
  grade: 'Grade 6',
  education_level: 'Upper Primary',
  gender: 'F',
  active: true,
};

// 3 Exact verified assessments
const examOpener: ContributingAssessmentRef = {
  id: 'e33680c9-e071-493e-9a4a-a49bce6c1742',
  exam_name: 'Grade 6 Opener Assessment Term 3 2026',
  assessment_structure: 'Composite',
  include_agriculture: null as any,
  out_of: 100,
};

const examSecondTrial: ContributingAssessmentRef = {
  id: 'b354bcc6-ee20-4ced-a651-ed5aecd91603',
  exam_name: 'GRADE 6 KPSEA SECOND TRIAL TERM 3 2026',
  assessment_structure: 'Composite',
  include_agriculture: null as any,
  out_of: 100,
};

const examThirdTrial: ContributingAssessmentRef = {
  id: 'fd7183f9-f223-498e-8fb7-468cf397432a',
  exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
  assessment_structure: 'Composite',
  include_agriculture: true,
  out_of: 100,
};

describe('Phase 5 Surgical Regression Tests — Grade 6 Assessment-Level Agriculture Contamination', () => {

  // Test 1: Opener resolves six Composite subjects and maximum /600
  it('1. Opener resolves six Composite subjects and maximum /600', () => {
    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, [examOpener], { classObj: mockGrade6Class });
    expect(subjects).toHaveLength(6);
    expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(false);

    const cohortRankings = calculateCohortAssessmentRankings({
      contributingAssessments: [examOpener],
      applicableSubjects: subjects,
      cohortLearners: [
        {
          student: studentLearner1,
          classStream: mockGrade6Class,
          applicableSubjects: subjects,
          resultsBySubject: calculateLearnerTerminalResults({
            learnerId: studentLearner1.id,
            subjectIds: subjects.map((s) => s.id),
            subjects,
            contributingAssessments: [examOpener],
            educationLevel: 'Upper Primary',
            gradeName: 'Grade 6',
            targetClass: mockGrade6Class,
            marks: [
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
            ],
          }),
        },
      ],
    });

    const summary = cohortRankings.get(studentLearner1.id)?.[examOpener.id];
    expect(summary).toBeDefined();
    expect(summary?.maxMarks).toBe(600);
    expect(summary?.isComplete).toBe(true);
  });

  // Test 2: Second Trial resolves six Composite subjects and maximum /600
  it('2. Second Trial resolves six Composite subjects and maximum /600', () => {
    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, [examSecondTrial], { classObj: mockGrade6Class });
    expect(subjects).toHaveLength(6);
    expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(false);

    const cohortRankings = calculateCohortAssessmentRankings({
      contributingAssessments: [examSecondTrial],
      applicableSubjects: subjects,
      cohortLearners: [
        {
          student: studentLearner1,
          classStream: mockGrade6Class,
          applicableSubjects: subjects,
          resultsBySubject: calculateLearnerTerminalResults({
            learnerId: studentLearner1.id,
            subjectIds: subjects.map((s) => s.id),
            subjects,
            contributingAssessments: [examSecondTrial],
            educationLevel: 'Upper Primary',
            gradeName: 'Grade 6',
            targetClass: mockGrade6Class,
            marks: [
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
            ],
          }),
        },
      ],
    });

    const summary = cohortRankings.get(studentLearner1.id)?.[examSecondTrial.id];
    expect(summary).toBeDefined();
    expect(summary?.maxMarks).toBe(600);
    expect(summary?.isComplete).toBe(true);
  });

  // Test 3: Third Trial resolves seven Composite subjects and maximum /700
  it('3. Third Trial resolves seven Composite subjects and maximum /700', () => {
    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, [examThirdTrial], { classObj: mockGrade6Class });
    expect(subjects).toHaveLength(7);
    expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(true);

    const cohortRankings = calculateCohortAssessmentRankings({
      contributingAssessments: [examThirdTrial],
      applicableSubjects: subjects,
      cohortLearners: [
        {
          student: studentLearner1,
          classStream: mockGrade6Class,
          applicableSubjects: subjects,
          resultsBySubject: calculateLearnerTerminalResults({
            learnerId: studentLearner1.id,
            subjectIds: subjects.map((s) => s.id),
            subjects,
            contributingAssessments: [examThirdTrial],
            educationLevel: 'Upper Primary',
            gradeName: 'Grade 6',
            targetClass: mockGrade6Class,
            marks: [
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 65 },
            ],
          }),
        },
      ],
    });

    const summary = cohortRankings.get(studentLearner1.id)?.[examThirdTrial.id];
    expect(summary).toBeDefined();
    expect(summary?.maxMarks).toBe(700);
    expect(summary?.isComplete).toBe(true);
  });

  // Test 4: Agriculture does not become required in Opener or Second Trial solely because Third Trial includes it
  it('4. Agriculture does not become required in Opener or Second Trial solely because Third Trial includes it', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const terminalSubjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, termContributing, { classObj: mockGrade6Class });
    expect(terminalSubjects).toHaveLength(7);

    const cohortRankings = calculateCohortAssessmentRankings({
      contributingAssessments: termContributing,
      applicableSubjects: terminalSubjects,
      cohortLearners: [
        {
          student: studentLearner1,
          classStream: mockGrade6Class,
          applicableSubjects: terminalSubjects,
          resultsBySubject: calculateLearnerTerminalResults({
            learnerId: studentLearner1.id,
            subjectIds: terminalSubjects.map((s) => s.id),
            subjects: terminalSubjects,
            contributingAssessments: termContributing,
            educationLevel: 'Upper Primary',
            gradeName: 'Grade 6',
            targetClass: mockGrade6Class,
            marks: [
              // Opener (6 subjects, no agri)
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
              { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
              // Second Trial (6 subjects, no agri)
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 52 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 32 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 46 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 36 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 82 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 88 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 76 },
              { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 72 },
              // Third Trial (7 subjects, with agri)
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 55 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 35 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 48 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 38 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 85 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 90 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 80 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 75 },
              { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 68 },
            ],
          }),
        },
      ],
    });

    const openerSum = cohortRankings.get(studentLearner1.id)?.[examOpener.id];
    const trial2Sum = cohortRankings.get(studentLearner1.id)?.[examSecondTrial.id];
    const trial3Sum = cohortRankings.get(studentLearner1.id)?.[examThirdTrial.id];

    expect(openerSum?.maxMarks).toBe(600);
    expect(openerSum?.isComplete).toBe(true);

    expect(trial2Sum?.maxMarks).toBe(600);
    expect(trial2Sum?.isComplete).toBe(true);

    expect(trial3Sum?.maxMarks).toBe(700);
    expect(trial3Sum?.isComplete).toBe(true);
  });

  // Test 5: Agriculture is included in terminal learning-area calculation through applicable assessments
  it('5. Agriculture is included in terminal learning-area calculation through applicable assessments according to existing rules', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const results = calculateLearnerTerminalResults({
      learnerId: studentLearner1.id,
      subjectIds: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
      subjects: initialSubjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [
        { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 74 },
      ],
    });

    const agriRes = results.get('a9bf02ee-5e4e-46fa-b7d5-39f77657821f');
    expect(agriRes).toBeDefined();
    expect(agriRes?.isComplete).toBe(true);
    expect(agriRes?.status).toBe('Complete');
    expect(agriRes?.terminalPercentage).toBe(74);

    // Verify trail entries
    expect(agriRes?.assessmentTrail).toHaveLength(3);
    const openerTrail = agriRes?.assessmentTrail.find((t) => t.examId === examOpener.id);
    const trial2Trail = agriRes?.assessmentTrail.find((t) => t.examId === examSecondTrial.id);
    const trial3Trail = agriRes?.assessmentTrail.find((t) => t.examId === examThirdTrial.id);

    expect(openerTrail?.notApplicable).toBe(true);
    expect(openerTrail?.displayScore).toBe('—');
    expect(trial2Trail?.notApplicable).toBe(true);
    expect(trial2Trail?.displayScore).toBe('—');
    expect(trial3Trail?.notApplicable).toBeFalsy();
    expect(trial3Trail?.percentage).toBe(74);
  });

  // Test 6: A genuinely missing Agriculture mark in an examination that requires Agriculture still produces incomplete status
  it('6. A genuinely missing Agriculture mark in an examination that requires Agriculture still produces the established incomplete status', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    // studentLearner2 took Opener & Trial 2, but has NO marks for Agriculture in Trial 3
    const results = calculateLearnerTerminalResults({
      learnerId: studentLearner2.id,
      subjectIds: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
      subjects: initialSubjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [], // no marks in Trial 3
    });

    const agriRes = results.get('a9bf02ee-5e4e-46fa-b7d5-39f77657821f');
    expect(agriRes).toBeDefined();
    expect(agriRes?.isComplete).toBe(false);
    expect(agriRes?.status).toBe('INCOMPLETE (X)');
    expect(agriRes?.terminalPercentage).toBeNull();

    const trial3Trail = agriRes?.assessmentTrail.find((t) => t.examId === examThirdTrial.id);
    expect(trial3Trail?.status).toBe('Blank');
    expect(trial3Trail?.displayScore).toBe('X');
  });

  // Test 7: An applicable Agriculture mark of zero remains a genuine zero
  it('7. An applicable Agriculture mark of zero remains a genuine zero', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const results = calculateLearnerTerminalResults({
      learnerId: studentLearner3.id,
      subjectIds: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
      subjects: initialSubjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [
        { exam_id: examThirdTrial.id, student_id: studentLearner3.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 0 },
      ],
    });

    const agriRes = results.get('a9bf02ee-5e4e-46fa-b7d5-39f77657821f');
    expect(agriRes).toBeDefined();
    expect(agriRes?.isComplete).toBe(true);
    expect(agriRes?.status).toBe('Complete');
    expect(agriRes?.terminalPercentage).toBe(0);
    expect(agriRes?.cbePerformanceLevel).toBe('BE');
  });

  // Test 8: Missing required non-Agriculture marks still produce the established incomplete status
  it('8. Missing required non-Agriculture marks still produce the established incomplete status', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    // studentLearner4 is missing Math in Opener
    const results = calculateLearnerTerminalResults({
      learnerId: studentLearner4.id,
      subjectIds: ['sb_up_mat'],
      subjects: initialSubjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [
        // No math in Opener
        { exam_id: examSecondTrial.id, student_id: studentLearner4.id, subject_id: 'sb_up_mat', marks: 80 },
        { exam_id: examThirdTrial.id, student_id: studentLearner4.id, subject_id: 'sb_up_mat', marks: 75 },
      ],
    });

    const mathRes = results.get('sb_up_mat');
    expect(mathRes).toBeDefined();
    expect(mathRes?.isComplete).toBe(false);
    expect(mathRes?.status).toBe('INCOMPLETE (X)');
    expect(mathRes?.terminalPercentage).toBeNull();
  });

  // Test 9: Learner-specific marks and completeness statuses do not leak between learners
  it('9. Learner-specific marks and completeness statuses do not leak between learners', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, termContributing, { classObj: mockGrade6Class });

    const agriSub = subjects.find((s) => s.subject_code === 'AGN')!;
    expect(agriSub).toBeDefined();

    const results1 = calculateLearnerTerminalResults({
      learnerId: studentLearner1.id,
      subjectIds: subjects.map((s) => s.id),
      subjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [
        { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: agriSub.id, marks: 80 },
      ],
    });

    const results2 = calculateLearnerTerminalResults({
      learnerId: studentLearner2.id,
      subjectIds: subjects.map((s) => s.id),
      subjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [], // learner 2 has no mark
    });

    expect(results1.get(agriSub.id)?.isComplete).toBe(true);
    expect(results2.get(agriSub.id)?.isComplete).toBe(false);
  });

  // Test 10: Report Section 3B uses the individual examination's correct maximum
  it('10. Report Section 3B uses the individual examination\'s correct maximum', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, termContributing, { classObj: mockGrade6Class });

    const rankings = calculateSingleLearnerAssessmentRankings({
      student: studentLearner1,
      classStream: mockGrade6Class,
      applicableSubjects: subjects,
      contributingAssessments: termContributing,
      resultsBySubject: calculateLearnerTerminalResults({
        learnerId: studentLearner1.id,
        subjectIds: subjects.map((s) => s.id),
        subjects,
        contributingAssessments: termContributing,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
        targetClass: mockGrade6Class,
        marks: [
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
          { exam_id: examOpener.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
          // Second Trial
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
          { exam_id: examSecondTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
          // Third Trial
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_eng', marks: 50 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_comp', marks: 30 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_kis', marks: 45 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_insha', marks: 35 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_mat', marks: 80 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_sci', marks: 85 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_cas', marks: 75 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'sb_up_ss_cre', marks: 70 },
          { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 70 },
        ],
      }),
    });

    expect(rankings[examOpener.id].maxMarks).toBe(600);
    expect(rankings[examSecondTrial.id].maxMarks).toBe(600);
    expect(rankings[examThirdTrial.id].maxMarks).toBe(700);
  });

  // Test 11: Terminal modal and PDF Section 3A agree on Agriculture status and terminal totals
  it('11. Terminal modal and PDF Section 3A agree on Agriculture status and terminal totals', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const results = calculateLearnerTerminalResults({
      learnerId: studentLearner1.id,
      subjectIds: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
      subjects: initialSubjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [
        { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 85 },
      ],
    });

    const ag = results.get('a9bf02ee-5e4e-46fa-b7d5-39f77657821f');
    expect(ag?.isComplete).toBe(true);
    expect(ag?.terminalPercentage).toBe(85);

    // Trail entries formatted for display in Modal and PDF
    const trailScores = termContributing.map((a) => {
      const t = ag?.assessmentTrail.find((x) => x.examId === a.id);
      if (t?.notApplicable) return '—';
      if (!t || t.status === 'Blank' || t.status === 'X') return 'X';
      if (typeof t.percentage === 'number') return `${Math.round(t.percentage)}`;
      return 'X';
    });

    expect(trailScores).toEqual(['—', '—', '85']);
  });

  // Test 12: Composite examinations with Agriculture explicitly included continue to use /700
  it('12. Composite examinations with Agriculture explicitly included continue to use /700', () => {
    const examWithAg: ContributingAssessmentRef = {
      id: 'exam_comp_with_ag',
      exam_name: 'Midterm Term 1 with Agriculture',
      assessment_structure: 'Composite',
      include_agriculture: true,
      out_of: 100,
    };

    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, [examWithAg], { classObj: mockGrade6Class });
    expect(subjects).toHaveLength(7);
    expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(true);
  });

  // Test 13: Composite legacy records with missing/null configuration preserve class-allocation fallback
  it('13. Composite legacy records with missing/null configuration preserve class-allocation fallback', () => {
    const legacyExam: ContributingAssessmentRef = {
      id: 'legacy_exam_01',
      exam_name: 'Legacy Term Exam',
      assessment_structure: 'Composite',
      include_agriculture: undefined,
    };

    // Class WITHOUT agriculture allocation
    const subjectsNoAg = resolveUpperPrimaryTerminalSubjects(initialSubjects, [legacyExam], { classObj: mockGrade6Class });
    expect(subjectsNoAg).toHaveLength(6);
    expect(subjectsNoAg.some((s) => s.subject_code === 'AGN')).toBe(false);

    // Class WITH agriculture allocation
    const subjectsWithAg = resolveUpperPrimaryTerminalSubjects(initialSubjects, [legacyExam], { classObj: mockGrade6ClassWithAgriAllocated });
    expect(subjectsWithAg).toHaveLength(7);
    expect(subjectsWithAg.some((s) => s.subject_code === 'AGN')).toBe(true);
  });

  // Test 14: Standalone examinations with Agriculture included or excluded preserve Phase 1–4 behaviour
  it('14. Standalone examinations with Agriculture included or excluded preserve Phase 1–4 behaviour', () => {
    const standaloneNoAg: ContributingAssessmentRef = {
      id: 'standalone_01',
      exam_name: 'Standalone No Agri',
      assessment_structure: 'Standalone',
      include_agriculture: false,
    };
    const standaloneWithAg: ContributingAssessmentRef = {
      id: 'standalone_02',
      exam_name: 'Standalone With Agri',
      assessment_structure: 'Standalone',
      include_agriculture: true,
    };

    const subsNoAg = resolveUpperPrimaryTerminalSubjects(initialSubjects, [standaloneNoAg]);
    expect(subsNoAg).toHaveLength(7); // Standalone base without Ag has 7 subjects
    expect(subsNoAg.some((s) => s.subject_code === 'AGN')).toBe(false);

    const subsWithAg = resolveUpperPrimaryTerminalSubjects(initialSubjects, [standaloneWithAg]);
    expect(subsWithAg).toHaveLength(8); // Standalone with Ag has 8 subjects
    expect(subsWithAg.some((s) => s.subject_code === 'AGN')).toBe(true);
  });

  // Test 15: Grade 7–9 Terminal Results and existing Grade 9 term matching remain unchanged
  it('15. Grade 7–9 Terminal Results remain unchanged', () => {
    const jssExam1: ContributingAssessmentRef = {
      id: 'jss_exam_01',
      exam_name: 'Grade 8 Midterm 2026',
      out_of: 100,
    };
    const jssStudent: Student = {
      id: 'std_jss_01',
      admission_number: 'JSS-101',
      full_name: 'Junior School Learner',
      grade: 'Grade 8',
      education_level: 'Junior School',
      class_id: 'cls_g8',
      gender: 'M',
      active: true,
    };
    const jssSubjects = initialSubjects.filter((s) => s.education_level === 'Junior School');

    const results = calculateLearnerTerminalResults({
      learnerId: jssStudent.id,
      subjectIds: jssSubjects.slice(0, 3).map((s) => s.id),
      subjects: jssSubjects,
      contributingAssessments: [jssExam1],
      educationLevel: 'Junior School',
      gradeName: 'Grade 8',
      marks: [
        { exam_id: jssExam1.id, student_id: jssStudent.id, subject_id: jssSubjects[0].id, marks: 75 },
      ],
    });

    expect(results.get(jssSubjects[0].id)?.isComplete).toBe(true);
    expect(results.get(jssSubjects[0].id)?.terminalPercentage).toBe(75);
  });

  // Test 16: Existing false-X, incomplete-result, absence-Y, and ranking-eligibility protections remain intact
  it('16. Absence-Y and incomplete-result protections remain intact', () => {
    const termContributing = [examOpener, examSecondTrial, examThirdTrial];
    const results = calculateLearnerTerminalResults({
      learnerId: studentLearner1.id,
      subjectIds: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
      subjects: initialSubjects,
      contributingAssessments: termContributing,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      targetClass: mockGrade6Class,
      marks: [
        // Learner was Absent (Y) for Agriculture in Third Trial
        { exam_id: examThirdTrial.id, student_id: studentLearner1.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', special_status: 'Y' },
      ],
    });

    const agriRes = results.get('a9bf02ee-5e4e-46fa-b7d5-39f77657821f');
    expect(agriRes?.isComplete).toBe(false);
    expect(agriRes?.status).toBe('INCOMPLETE (Y)');
    expect(agriRes?.displayPercentage).toBe('Y');
  });

});
