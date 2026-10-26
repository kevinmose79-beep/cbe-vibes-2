import { describe, it, expect } from 'vitest';
import {
  resolveUpperPrimaryTerminalSubjects,
  getUpperPrimaryCanonicalSubjects,
  getUpperPrimaryStandaloneSubjects,
  calculateLearnerTerminalResults,
  resolveContributingAssessmentsStructure,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import {
  generateTerminalMeritDataset,
  exportTerminalMeritListToCsv,
} from '../services/terminalMeritListExporter';
import {
  calculateCohortTerminalRankings,
  calculateCohortAssessmentRankings,
  LearnerCohortEntry,
} from '../services/terminalRankingEngine';
import { Student, ClassStream, Subject, Mark, School, Grade } from '../types';
import { initialSubjects } from '../data/seedData';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';

const mockSchool: School = {
  id: 'sch_e2e_1',
  school_name: 'St. Jude Model Academy',
  school_code: 'SJMA',
  county: 'Nairobi',
  email: 'admin@stjude.academy',
};

const mockClassG5: ClassStream = {
  id: 'cls_e2e_g5',
  stream_id: 'cs_e2e_g5_north',
  class_name: 'Grade 5',
  stream: 'North',
  education_level: 'Upper Primary',
};

const mockClassG5WithAgn: ClassStream = {
  id: 'cls_e2e_g5_agn',
  stream_id: 'cs_e2e_g5_agn_stream',
  class_name: 'Grade 5',
  stream: 'Green',
  education_level: 'Upper Primary',
  allocated_subject_ids: ['a9bf02ee-5e4e-46fa-b7d5-39f77657821f'],
};

const studentAlpha: Student = {
  id: 'st_e2e_alpha',
  admission_number: 'ADM-101',
  full_name: 'Alpha Mwangi',
  class_id: 'cls_e2e_g5',
  stream_id: 'cs_e2e_g5_north',
  grade: 'Grade 5',
  education_level: 'Upper Primary',
  gender: 'M',
  active: true,
  enrolment_status: 'active',
};

const studentBeta: Student = {
  id: 'st_e2e_beta',
  admission_number: 'ADM-102',
  full_name: 'Beta Achieng',
  class_id: 'cls_e2e_g5',
  stream_id: 'cs_e2e_g5_north',
  grade: 'Grade 5',
  education_level: 'Upper Primary',
  gender: 'F',
  active: true,
  enrolment_status: 'active',
};

const studentGammaIncomplete: Student = {
  id: 'st_e2e_gamma',
  admission_number: 'ADM-103',
  full_name: 'Gamma Mutua',
  class_id: 'cls_e2e_g5',
  stream_id: 'cs_e2e_g5_north',
  grade: 'Grade 5',
  education_level: 'Upper Primary',
  gender: 'M',
  active: true,
  enrolment_status: 'active',
};

describe('Upper Primary Terminal Results — Phase 4: End-to-End Verification and Safety Audit', () => {

  // =========================================================================
  // 1. SCENARIO A: Composite, Agriculture Excluded (/600 Max)
  // =========================================================================
  describe('Scenario A: Composite with Agriculture Excluded (/600 Max)', () => {
    const compositeAssessmentsNoAg: ContributingAssessmentRef[] = [
      {
        id: 'exam_comp_no_ag_1',
        exam_name: 'Midterm Composite 2026',
        assessment_structure: 'Composite',
        include_agriculture: false,
        out_of: 100,
      },
    ];

    it('resolves exactly 6 canonical Composite learning areas', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, compositeAssessmentsNoAg);
      expect(subjects).toHaveLength(6);
      expect(subjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'CAS',
        'SS&CRE',
      ]);
      expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(false);
    });

    it('calculates English & Kiswahili composites, SS&CRE, and sets total maximum to /600', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, compositeAssessmentsNoAg);

      const alphaMarks: Mark[] = [
        { id: 'm_a_1', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_eng', marks: 45, raw_score: 45, out_of: 50, special_status: 'Normal' },
        { id: 'm_a_2', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_comp', marks: 35, raw_score: 35, out_of: 40, special_status: 'Normal' },
        { id: 'm_a_3', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_kis', marks: 40, raw_score: 40, out_of: 50, special_status: 'Normal' },
        { id: 'm_a_4', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_insha', marks: 32, raw_score: 32, out_of: 40, special_status: 'Normal' },
        { id: 'm_a_5', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_mat', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_a_6', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_sci', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
        { id: 'm_a_7', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_sst', marks: 24, raw_score: 24, out_of: 30, special_status: 'Normal' },
        { id: 'm_a_8', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_cre', marks: 16, raw_score: 16, out_of: 20, special_status: 'Normal' },
        { id: 'm_a_9', exam_id: 'exam_comp_no_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_cas', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
      ];

      const resultsMap = new Map();
      resultsMap.set(
        'st_e2e_alpha',
        calculateLearnerTerminalResults({
          learnerId: 'st_e2e_alpha',
          subjectIds: subjects.map((s) => s.id),
          contributingAssessments: compositeAssessmentsNoAg,
          marks: alphaMarks,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects,
        })
      );

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_e2e_g5_north',
        classes: [mockClassG5],
        students: [studentAlpha],
        subjects: initialSubjects,
        learnerResultsMap: resultsMap,
        contributingAssessments: compositeAssessmentsNoAg,
      });

      expect(dataset.activeSubjects).toHaveLength(6);
      expect(dataset.summaryStats.classCurriculumMax).toBe(600);
      const row = dataset.learners[0];
      expect(row.isRankable).toBe(true);
      expect(row.terminalTotalMarks).toBeGreaterThan(0);
      expect(row.terminalTotalMarks).toBeLessThanOrEqual(600);
      expect(row.displayPosition).toBe('1');
    });
  });

  // =========================================================================
  // 2. SCENARIO B: Composite, Agriculture Included (/700 Max)
  // =========================================================================
  describe('Scenario B: Composite with Agriculture Included (/700 Max)', () => {
    const compositeAssessmentsWithAg: ContributingAssessmentRef[] = [
      {
        id: 'exam_comp_with_ag_1',
        exam_name: 'Midterm Composite with AGN',
        assessment_structure: 'Composite',
        include_agriculture: true,
        out_of: 100,
      },
    ];

    it('resolves the 6 canonical Composite learning areas plus Agriculture (7 subjects)', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, compositeAssessmentsWithAg);
      expect(subjects).toHaveLength(7);
      expect(subjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'CAS',
        'SS&CRE',
        'AGN',
      ]);
    });

    it('builds /700 merit list and preserves SS&CRE structure when Agriculture is included', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, compositeAssessmentsWithAg);

      const alphaMarksWithAg: Mark[] = [
        { id: 'm_b_1', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_eng', marks: 45, raw_score: 45, out_of: 50, special_status: 'Normal' },
        { id: 'm_b_2', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_comp', marks: 35, raw_score: 35, out_of: 40, special_status: 'Normal' },
        { id: 'm_b_3', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_kis', marks: 40, raw_score: 40, out_of: 50, special_status: 'Normal' },
        { id: 'm_b_4', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_insha', marks: 32, raw_score: 32, out_of: 40, special_status: 'Normal' },
        { id: 'm_b_5', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_mat', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_b_6', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_sci', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
        { id: 'm_b_7', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_sst', marks: 24, raw_score: 24, out_of: 30, special_status: 'Normal' },
        { id: 'm_b_8', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_cre', marks: 16, raw_score: 16, out_of: 20, special_status: 'Normal' },
        { id: 'm_b_9', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'sb_up_cas', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
        { id: 'm_b_10', exam_id: 'exam_comp_with_ag_1', student_id: 'st_e2e_alpha', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      ];

      const resultsMap = new Map();
      resultsMap.set(
        'st_e2e_alpha',
        calculateLearnerTerminalResults({
          learnerId: 'st_e2e_alpha',
          subjectIds: subjects.map((s) => s.id),
          contributingAssessments: compositeAssessmentsWithAg,
          marks: alphaMarksWithAg,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects,
        })
      );

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_e2e_g5_north',
        classes: [mockClassG5],
        students: [studentAlpha],
        subjects: initialSubjects,
        learnerResultsMap: resultsMap,
        contributingAssessments: compositeAssessmentsWithAg,
      });

      expect(dataset.activeSubjects).toHaveLength(7);
      expect(dataset.summaryStats.classCurriculumMax).toBe(700);
      const row = dataset.learners[0];
      expect(row.isRankable).toBe(true);
      expect(row.terminalTotalMarks).toBe(80 + 72 + 80 + 85 + 78 + 80 + 70); // 545
      expect(row.terminalTotalMarks).toBeLessThanOrEqual(700);
      expect(row.displayPosition).toBe('1');
    });
  });

  // =========================================================================
  // 3. SCENARIO C: Standalone, Agriculture Excluded (/700 Max)
  // =========================================================================
  describe('Scenario C: Standalone with Agriculture Excluded (/700 Max)', () => {
    const standaloneNoAg: ContributingAssessmentRef[] = [
      {
        id: 'exam_sa_no_ag_e2e',
        exam_name: 'Standalone No Ag Exam',
        assessment_structure: 'Standalone',
        include_agriculture: false,
        out_of: 100,
      },
    ];

    it('resolves exactly 7 independent learning areas in approved order', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standaloneNoAg);
      expect(subjects).toHaveLength(7);
      expect(subjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'SST',
        'CRE',
        'CAS',
      ]);
      expect(subjects.some((s) => s.subject_code === 'AGN')).toBe(false);
    });

    it('calculates English and Kiswahili out of 100 without requiring Comp/Insha', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standaloneNoAg);

      // Alpha has direct English (85) and direct Kiswahili (80), NO composition or insha
      const alphaStandaloneMarks: Mark[] = [
        { id: 'm_c1', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_eng', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
        { id: 'm_c2', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_kis', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_c3', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_mat', marks: 90, raw_score: 90, out_of: 100, special_status: 'Normal' },
        { id: 'm_c4', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_sci', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
        { id: 'm_c5', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_sst', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_c6', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_cre', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
        { id: 'm_c7', exam_id: 'exam_sa_no_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_cas', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
      ];

      const results = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: standaloneNoAg,
        marks: alphaStandaloneMarks,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      // English is complete directly
      const engRes = results.get('sb_up_eng');
      expect(engRes?.isComplete).toBe(true);
      expect(engRes?.terminalPercentage).toBe(85);

      // Kiswahili is complete directly
      const kisRes = results.get('sb_up_kis');
      expect(kisRes?.isComplete).toBe(true);
      expect(kisRes?.terminalPercentage).toBe(80);

      // Merit list dataset maximum is exactly 700
      const resultsMap = new Map();
      resultsMap.set('st_e2e_alpha', results);

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_e2e_g5_north',
        classes: [mockClassG5],
        students: [studentAlpha],
        subjects: initialSubjects,
        learnerResultsMap: resultsMap,
        contributingAssessments: standaloneNoAg,
      });

      expect(dataset.summaryStats.classCurriculumMax).toBe(700);
      expect(dataset.learners[0].terminalTotalMarks).toBe(85 + 80 + 90 + 75 + 70 + 65 + 85); // 550
      expect(dataset.learners[0].displayPosition).toBe('1');
    });
  });

  // =========================================================================
  // 4. SCENARIO D: Standalone, Agriculture Included (/800 Max)
  // =========================================================================
  describe('Scenario D: Standalone with Agriculture Included (/800 Max)', () => {
    const standaloneWithAg: ContributingAssessmentRef[] = [
      {
        id: 'exam_sa_with_ag_e2e',
        exam_name: 'Standalone With Ag Exam',
        assessment_structure: 'Standalone',
        include_agriculture: true,
        out_of: 100,
      },
    ];

    it('resolves 8 independent learning areas with Agriculture included', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standaloneWithAg);
      expect(subjects).toHaveLength(8);
      expect(subjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'SST',
        'CRE',
        'AGN',
        'CAS',
      ]);
    });

    it('computes all 8 subjects independently out of 100 with /800 max in merit list & ranking', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standaloneWithAg);

      const alphaMarks8: Mark[] = [
        { id: 'm_d1', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_eng', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d2', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_kis', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d3', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_mat', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d4', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_sci', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d5', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_sst', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d6', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_cre', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d7', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
        { id: 'm_d8', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_alpha', subject_id: 'sb_up_cas', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      ];

      const betaMarks8: Mark[] = [
        { id: 'm_d21', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_up_eng', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d22', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_up_kis', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d23', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_up_mat', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d24', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_sci', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d25', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_up_sst', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d26', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_up_cre', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d27', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
        { id: 'm_d28', exam_id: 'exam_sa_with_ag_e2e', student_id: 'st_e2e_beta', subject_id: 'sb_up_cas', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      ];

      const resultsMap = new Map();
      resultsMap.set('st_e2e_alpha', calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: standaloneWithAg,
        marks: alphaMarks8,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      }));
      resultsMap.set('st_e2e_beta', calculateLearnerTerminalResults({
        learnerId: 'st_e2e_beta',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: standaloneWithAg,
        marks: betaMarks8,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      }));

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_e2e_g5_north',
        classes: [mockClassG5],
        students: [studentAlpha, studentBeta],
        subjects: initialSubjects,
        learnerResultsMap: resultsMap,
        contributingAssessments: standaloneWithAg,
      });

      expect(dataset.summaryStats.classCurriculumMax).toBe(800);
      expect(dataset.learners[0].terminalTotalMarks).toBe(640);
      expect(dataset.learners[0].displayPosition).toBe('1');
      expect(dataset.learners[1].terminalTotalMarks).toBe(560);
      expect(dataset.learners[1].displayPosition).toBe('2');
    });
  });

  // =========================================================================
  // 5. AGRICULTURE FALLBACK COMPLIANCE
  // =========================================================================
  describe('Agriculture Fallback Rules Audit', () => {
    it('Standalone with include_agriculture === true -> 8 subjects (/800)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(initialSubjects, [
        { id: 'e1', exam_name: 'E1', assessment_structure: 'Standalone', include_agriculture: true },
      ]);
      expect(subs).toHaveLength(8);
    });

    it('Standalone with include_agriculture === false -> 7 subjects (/700)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(initialSubjects, [
        { id: 'e1', exam_name: 'E1', assessment_structure: 'Standalone', include_agriculture: false },
      ]);
      expect(subs).toHaveLength(7);
      expect(subs.some((s) => s.subject_code === 'AGN')).toBe(false);
    });

    it('Standalone with include_agriculture === null -> 8 subjects (/800 fallback)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(initialSubjects, [
        { id: 'e1', exam_name: 'E1', assessment_structure: 'Standalone', include_agriculture: null as any },
      ]);
      expect(subs).toHaveLength(8);
    });

    it('Standalone with include_agriculture === undefined -> 8 subjects (/800 fallback)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(initialSubjects, [
        { id: 'e1', exam_name: 'E1', assessment_structure: 'Standalone' },
      ]);
      expect(subs).toHaveLength(8);
    });

    it('Composite with include_agriculture === false -> 6 subjects (/600)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(initialSubjects, [
        { id: 'e1', exam_name: 'E1', assessment_structure: 'Composite', include_agriculture: false },
      ]);
      expect(subs).toHaveLength(6);
    });

    it('Composite with include_agriculture === true -> 7 subjects (/700)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(initialSubjects, [
        { id: 'e1', exam_name: 'E1', assessment_structure: 'Composite', include_agriculture: true },
      ]);
      expect(subs).toHaveLength(7);
      expect(subs.some((s) => s.subject_code === 'AGN')).toBe(true);
    });

    it('Composite with include_agriculture === undefined and class without AGN -> 6 subjects (/600 fallback)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(
        initialSubjects,
        [{ id: 'e1', exam_name: 'E1', assessment_structure: 'Composite' }],
        { classObj: mockClassG5 }
      );
      expect(subs).toHaveLength(6);
    });

    it('Composite with include_agriculture === undefined and class with AGN allocated -> 7 subjects (/700 fallback)', () => {
      const subs = resolveUpperPrimaryTerminalSubjects(
        initialSubjects,
        [{ id: 'e1', exam_name: 'E1', assessment_structure: 'Composite' }],
        { classObj: mockClassG5WithAgn }
      );
      expect(subs).toHaveLength(7);
      expect(subs.some((s) => s.subject_code === 'AGN')).toBe(true);
    });
  });

  // =========================================================================
  // 6. INCOMPLETE RESULTS, ABSENCE AND FALSE-X PROTECTIONS
  // =========================================================================
  describe('Incomplete Results, Genuine Zero & False-X Protections', () => {
    const assessmentRef: ContributingAssessmentRef = {
      id: 'exam_guard',
      exam_name: 'Guard Exam',
      assessment_structure: 'Standalone',
      include_agriculture: false,
      out_of: 100,
    };
    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, [assessmentRef]);

    it('1. A genuine numerical mark of 0 remains 0 and is complete', () => {
      const marksZero: Mark[] = subjects.map((sb) => ({
        id: `m_zero_${sb.id}`,
        exam_id: 'exam_guard',
        student_id: 'st_e2e_alpha',
        subject_id: sb.id,
        marks: 0,
        raw_score: 0,
        score: 0,
        out_of: 100,
        special_status: 'Normal',
      }));

      const results = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: [assessmentRef],
        marks: marksZero,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      const mathRes = results.get('sb_up_mat');
      expect(mathRes?.isComplete).toBe(true);
      expect(mathRes?.status).toBe('Complete');
      expect(mathRes?.terminalPercentage).toBe(0);
    });

    it('2. A genuinely missing required mark is reported as incomplete (X)', () => {
      // Omit Mathematics
      const marksMissingMath = subjects
        .filter((s) => s.subject_code !== 'MATH')
        .map((sb) => ({
          id: `m_miss_${sb.id}`,
          exam_id: 'exam_guard',
          student_id: 'st_e2e_alpha',
          subject_id: sb.id,
          marks: 70,
          raw_score: 70,
          out_of: 100,
          special_status: 'Normal',
        }));

      const results = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: [assessmentRef],
        marks: marksMissingMath,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      const mathRes = results.get('sb_up_mat');
      expect(mathRes?.isComplete).toBe(false);
      expect(mathRes?.status).toBe('INCOMPLETE (X)');
      expect(mathRes?.terminalPercentage).toBeNull();
    });

    it('3. An absence marked "Y" is not converted to 0', () => {
      const marksAbsent: Mark[] = subjects.map((sb) => ({
        id: `m_y_${sb.id}`,
        exam_id: 'exam_guard',
        student_id: 'st_e2e_alpha',
        subject_id: sb.id,
        marks: sb.subject_code === 'MATH' ? 0 : 75,
        raw_score: sb.subject_code === 'MATH' ? null : 75,
        out_of: 100,
        special_status: sb.subject_code === 'MATH' ? 'Y' : 'Normal',
      }));

      const results = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: [assessmentRef],
        marks: marksAbsent,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      const mathRes = results.get('sb_up_mat');
      expect(mathRes?.isComplete).toBe(false);
      expect(mathRes?.status).toBe('INCOMPLETE (Y)');
      expect(mathRes?.terminalPercentage).toBeNull();
    });

    it('4. Marks belonging to another learner cannot satisfy current learner missing mark', () => {
      // Mark for studentBeta, not studentAlpha
      const foreignMarks: Mark[] = [
        {
          id: 'm_foreign_1',
          exam_id: 'exam_guard',
          student_id: 'st_e2e_beta', // belongs to Beta!
          subject_id: 'sb_up_eng',
          marks: 85,
          raw_score: 85,
          out_of: 100,
          special_status: 'Normal',
        },
      ];

      const results = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha', // querying Alpha
        subjectIds: ['sb_up_eng'],
        contributingAssessments: [assessmentRef],
        marks: foreignMarks,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      const engRes = results.get('sb_up_eng');
      expect(engRes?.isComplete).toBe(false);
      expect(engRes?.status).toBe('INCOMPLETE (X)');
    });

    it('5. Incomplete learners do not receive fabricated totals or ranks in merit list', () => {
      const marksIncomplete: Mark[] = [
        { id: 'm_inc_1', exam_id: 'exam_guard', student_id: 'st_e2e_gamma', subject_id: 'sb_up_eng', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      ];

      const gammaResults = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_gamma',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: [assessmentRef],
        marks: marksIncomplete,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      const resultsMap = new Map();
      resultsMap.set('st_e2e_gamma', gammaResults);

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_e2e_g5_north',
        classes: [mockClassG5],
        students: [studentGammaIncomplete],
        subjects: initialSubjects,
        learnerResultsMap: resultsMap,
        contributingAssessments: [assessmentRef],
      });

      const gammaRow = dataset.learners[0];
      expect(gammaRow.isRankable).toBe(false);
      expect(gammaRow.terminalTotalMarks).toBeNull();
      expect(gammaRow.displayPosition).toBe('');
    });
  });

  // =========================================================================
  // 7. MIXED STRUCTURE SAFETY & ISOLATION
  // =========================================================================
  describe('Mixed Structure Incompatibility Audit', () => {
    const mixedExams: ContributingAssessmentRef[] = [
      { id: 'ex_c', exam_name: 'Composite Exam', assessment_structure: 'Composite' },
      { id: 'ex_s', exam_name: 'Standalone Exam', assessment_structure: 'Standalone' },
    ];

    it('identifies mixed structure and flags incompatibility', () => {
      const info = resolveContributingAssessmentsStructure(mixedExams);
      expect(info.isMixed).toBe(true);
      expect(info.isIncompatible).toBe(true);
      expect(info.structure).toBe('Mixed');
      expect(info.compositeCount).toBe(1);
      expect(info.standaloneCount).toBe(1);
    });

    it('prevents blended totals and keeps all learners unranked with null totals', () => {
      const results = calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: ['sb_up_eng', 'sb_up_mat'],
        contributingAssessments: mixedExams,
        marks: [],
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects: initialSubjects,
      });

      const res = results.get('sb_up_eng');
      expect(res?.incompatibleStructure).toBe(true);
      expect(res?.status).toBe('INCOMPATIBLE_STRUCTURE');
      expect(res?.isComplete).toBe(false);
      expect(res?.terminalPercentage).toBeNull();

      const cohortEntry: LearnerCohortEntry = {
        student: studentAlpha,
        classStream: mockClassG5,
        applicableSubjects: initialSubjects.slice(0, 6),
        resultsBySubject: results,
      };

      const rankings = calculateCohortTerminalRankings({
        learners: [cohortEntry],
      });

      const alphaRanking = rankings.get('st_e2e_alpha');
      expect(alphaRanking?.isRankable).toBe(false);
      expect(alphaRanking?.terminalTotalMarks).toBeNull();
      expect(alphaRanking?.streamPosition).toBeNull();
      expect(alphaRanking?.overallPosition).toBeNull();
    });
  });

  // =========================================================================
  // 8. DATA-LEVEL EXPORT INTEGRATION (CSV Dataset)
  // =========================================================================
  describe('Data-level Export Dataset Consistency', () => {
    const standalone8Assessments: ContributingAssessmentRef[] = [
      {
        id: 'exam_export_test',
        exam_name: 'Export Assessment',
        assessment_structure: 'Standalone',
        include_agriculture: true,
        out_of: 100,
      },
    ];

    const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standalone8Assessments);

    it('produces valid CSV dataset with all 8 subject columns and correct headers', () => {
      const alphaMarks: Mark[] = subjects.map((sb) => ({
        id: `m_exp_${sb.id}`,
        exam_id: 'exam_export_test',
        student_id: 'st_e2e_alpha',
        subject_id: sb.id,
        marks: 85,
        raw_score: 85,
        out_of: 100,
        special_status: 'Normal',
      }));

      const resultsMap = new Map();
      resultsMap.set('st_e2e_alpha', calculateLearnerTerminalResults({
        learnerId: 'st_e2e_alpha',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: standalone8Assessments,
        marks: alphaMarks,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      }));

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_e2e_g5_north',
        classes: [mockClassG5],
        students: [studentAlpha],
        subjects: initialSubjects,
        learnerResultsMap: resultsMap,
        contributingAssessments: standalone8Assessments,
      });

      const csvString = exportTerminalMeritListToCsv(dataset);
      expect(csvString).toContain('English (ENG)');
      expect(csvString).toContain('Kiswahili (KIS)');
      expect(csvString).toContain('Mathematics (MATH)');
      expect(csvString).toContain('Integrated Science (INT-SCI)');
      expect(csvString).toContain('Social Studies (SST)');
      expect(csvString).toContain('Christian Religious Education (CRE)');
      expect(csvString).toContain('Agriculture (AGN)');
      expect(csvString).toContain('Creative Arts and Sports (CAS)');
      expect(csvString).toContain('Alpha Mwangi');
      expect(csvString).toContain('680'); // 85 * 8
    });
  });
});
