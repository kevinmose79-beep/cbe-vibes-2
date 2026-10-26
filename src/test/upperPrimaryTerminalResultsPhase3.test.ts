import { describe, it, expect } from 'vitest';
import {
  resolveUpperPrimaryTerminalSubjects,
  getUpperPrimaryCanonicalSubjects,
  getUpperPrimaryStandaloneSubjects,
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import {
  generateTerminalMeritDataset,
} from '../services/terminalMeritListExporter';
import {
  calculateCohortTerminalRankings,
  calculateCohortAssessmentRankings,
  LearnerCohortEntry,
} from '../services/terminalRankingEngine';
import { Student, ClassStream, Subject, Mark, School } from '../types';
import { initialSubjects } from '../data/seedData';

const mockSchool: School = {
  id: 'sch_1',
  school_name: 'St. Jude Academy',
  school_code: 'SJA01',
  county: 'Nairobi',
  email: 'info@stjude.academy',
};

const mockClasses: ClassStream[] = [
  {
    id: 'cls_up_g5',
    stream_id: 'cs_up_g5_alpha',
    class_name: 'Grade 5',
    stream: 'Alpha',
    education_level: 'Upper Primary',
  },
];

const mockStudent1: Student = {
  id: 'st_1',
  admission_number: 'ADM-001',
  full_name: 'Alice Wanjiku',
  class_id: 'cls_up_g5',
  stream_id: 'cs_up_g5_alpha',
  grade: 'Grade 5',
  education_level: 'Upper Primary',
  gender: 'F',
  active: true,
  enrolment_status: 'active',
};

const mockStudent2: Student = {
  id: 'st_2',
  admission_number: 'ADM-002',
  full_name: 'Brian Kiprop',
  class_id: 'cls_up_g5',
  stream_id: 'cs_up_g5_alpha',
  grade: 'Grade 5',
  education_level: 'Upper Primary',
  gender: 'M',
  active: true,
  enrolment_status: 'active',
};

const mockStudent3Incomplete: Student = {
  id: 'st_3',
  admission_number: 'ADM-003',
  full_name: 'Chloe Chebet',
  class_id: 'cls_up_g5',
  stream_id: 'cs_up_g5_alpha',
  grade: 'Grade 5',
  education_level: 'Upper Primary',
  gender: 'F',
  active: true,
  enrolment_status: 'active',
};

describe('Upper Primary Terminal Results — Phase 3: Terminal UI, Ranking and Merit-List Integration', () => {
  describe('1. resolveUpperPrimaryTerminalSubjects Resolver', () => {
    it('resolves 8 Standalone subjects when assessment_structure is Standalone and Agriculture is included', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_sa_1',
          exam_name: 'Opener Exam 2026',
          assessment_structure: 'Standalone',
          include_agriculture: true,
        },
        {
          id: 'exam_sa_2',
          exam_name: 'Midterm Exam 2026',
          assessment_structure: 'Standalone',
          include_agriculture: true,
        },
      ];

      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, assessments);
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

    it('resolves 8 Standalone subjects as default fallback when include_agriculture is null or undefined', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_sa_default',
          exam_name: 'Opener Exam 2026',
          assessment_structure: 'Standalone',
          // include_agriculture is undefined
        },
      ];

      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, assessments);
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

    it('resolves 7 Standalone subjects when include_agriculture === false (omits Agriculture)', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_sa_no_ag',
          exam_name: 'Terminal Assessment 2026',
          assessment_structure: 'Standalone',
          include_agriculture: false,
        },
      ];

      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, assessments);
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

    it('resolves 6 Composite subjects when assessment_structure is Composite', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_comp_1',
          exam_name: 'Composite Exam 2026',
          assessment_structure: 'Composite',
        },
      ];

      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, assessments);
      expect(subjects).toHaveLength(6);
      expect(subjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'CAS',
        'SS&CRE',
      ]);
    });

    it('resolves 6 Composite subjects as legacy fallback when assessments list is empty or undefined', () => {
      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, []);
      expect(subjects).toHaveLength(6);
      expect(subjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'CAS',
        'SS&CRE',
      ]);
    });
  });

  describe('2. Merit-List Dataset for Standalone with Agriculture (/800 Max)', () => {
    const standalone8Assessments: ContributingAssessmentRef[] = [
      {
        id: 'exam_sa_8',
        exam_name: 'Grade 5 Standalone 2026',
        assessment_structure: 'Standalone',
        include_agriculture: true,
        out_of: 100,
      },
    ];

    const standalone8Subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standalone8Assessments);

    // Marks for Alice (all 8 complete: score 80 each -> total 640/800)
    const aliceMarks: Mark[] = standalone8Subjects.map((sb, i) => ({
      id: `m_sa8_st1_${sb.id}`,
      exam_id: 'exam_sa_8',
      student_id: 'st_1',
      subject_id: sb.id,
      marks: 80,
      raw_score: 80,
      score: 80,
      out_of: 100,
      special_status: 'Normal',
    }));

    // Marks for Brian (all 8 complete: score 70 each -> total 560/800)
    const brianMarks: Mark[] = standalone8Subjects.map((sb, i) => ({
      id: `m_sa8_st2_${sb.id}`,
      exam_id: 'exam_sa_8',
      student_id: 'st_2',
      subject_id: sb.id,
      marks: 70,
      raw_score: 70,
      score: 70,
      out_of: 100,
      special_status: 'Normal',
    }));

    // Marks for Chloe (missing Agriculture -> incomplete)
    const chloeMarks: Mark[] = standalone8Subjects
      .filter((sb) => sb.subject_code !== 'AGN')
      .map((sb, i) => ({
        id: `m_sa8_st3_${sb.id}`,
        exam_id: 'exam_sa_8',
        student_id: 'st_3',
        subject_id: sb.id,
        marks: 90,
        raw_score: 90,
        score: 90,
        out_of: 100,
        special_status: 'Normal',
      }));

    it('builds 8-subject merit-list dataset with /800 maximum and correct rankings', () => {
      const learnerResultsMap = new Map();
      learnerResultsMap.set(
        'st_1',
        calculateLearnerTerminalResults({
          learnerId: 'st_1',
          subjectIds: standalone8Subjects.map((s) => s.id),
          contributingAssessments: standalone8Assessments,
          marks: aliceMarks,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects: standalone8Subjects,
        })
      );
      learnerResultsMap.set(
        'st_2',
        calculateLearnerTerminalResults({
          learnerId: 'st_2',
          subjectIds: standalone8Subjects.map((s) => s.id),
          contributingAssessments: standalone8Assessments,
          marks: brianMarks,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects: standalone8Subjects,
        })
      );
      learnerResultsMap.set(
        'st_3',
        calculateLearnerTerminalResults({
          learnerId: 'st_3',
          subjectIds: standalone8Subjects.map((s) => s.id),
          contributingAssessments: standalone8Assessments,
          marks: chloeMarks,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects: standalone8Subjects,
        })
      );

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_up_g5_alpha',
        classes: mockClasses,
        students: [mockStudent1, mockStudent2, mockStudent3Incomplete],
        subjects: initialSubjects,
        learnerResultsMap,
        contributingAssessments: standalone8Assessments,
      });

      // 8 active subjects in canonical Standalone order
      expect(dataset.activeSubjects).toHaveLength(8);
      expect(dataset.activeSubjects.map((s) => s.subject_code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT-SCI',
        'SST',
        'CRE',
        'AGN',
        'CAS',
      ]);

      // Max curriculum score is 800
      expect(dataset.summaryStats.classCurriculumMax).toBe(800);

      // Alice is Rank 1 with 640 marks
      const aliceRow = dataset.learners.find((l) => l.student.id === 'st_1');
      expect(aliceRow?.isRankable).toBe(true);
      expect(aliceRow?.terminalTotalMarks).toBe(640);
      expect(aliceRow?.displayPosition).toBe('1');

      // Brian is Rank 2 with 560 marks
      const brianRow = dataset.learners.find((l) => l.student.id === 'st_2');
      expect(brianRow?.isRankable).toBe(true);
      expect(brianRow?.terminalTotalMarks).toBe(560);
      expect(brianRow?.displayPosition).toBe('2');

      // Chloe is incomplete: unranked, blank position string "", null total marks
      const chloeRow = dataset.learners.find((l) => l.student.id === 'st_3');
      expect(chloeRow?.isRankable).toBe(false);
      expect(chloeRow?.terminalTotalMarks).toBeNull();
      expect(chloeRow?.displayPosition).toBe('');
    });
  });

  describe('3. Merit-List Dataset for Standalone without Agriculture (/700 Max)', () => {
    const standalone7Assessments: ContributingAssessmentRef[] = [
      {
        id: 'exam_sa_7',
        exam_name: 'Grade 5 Standalone No Ag 2026',
        assessment_structure: 'Standalone',
        include_agriculture: false,
        out_of: 100,
      },
    ];

    const standalone7Subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, standalone7Assessments);

    const aliceMarks7: Mark[] = standalone7Subjects.map((sb) => ({
      id: `m_sa7_st1_${sb.id}`,
      exam_id: 'exam_sa_7',
      student_id: 'st_1',
      subject_id: sb.id,
      marks: 85,
      raw_score: 85,
      score: 85,
      out_of: 100,
      special_status: 'Normal',
    }));

    const brianMarks7: Mark[] = standalone7Subjects.map((sb) => ({
      id: `m_sa7_st2_${sb.id}`,
      exam_id: 'exam_sa_7',
      student_id: 'st_2',
      subject_id: sb.id,
      marks: 75,
      raw_score: 75,
      score: 75,
      out_of: 100,
      special_status: 'Normal',
    }));

    it('builds 7-subject merit-list dataset with /700 maximum and omits Agriculture', () => {
      const learnerResultsMap = new Map();
      learnerResultsMap.set(
        'st_1',
        calculateLearnerTerminalResults({
          learnerId: 'st_1',
          subjectIds: standalone7Subjects.map((s) => s.id),
          contributingAssessments: standalone7Assessments,
          marks: aliceMarks7,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects: standalone7Subjects,
        })
      );
      learnerResultsMap.set(
        'st_2',
        calculateLearnerTerminalResults({
          learnerId: 'st_2',
          subjectIds: standalone7Subjects.map((s) => s.id),
          contributingAssessments: standalone7Assessments,
          marks: brianMarks7,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects: standalone7Subjects,
        })
      );

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_up_g5_alpha',
        classes: mockClasses,
        students: [mockStudent1, mockStudent2],
        subjects: initialSubjects,
        learnerResultsMap,
        contributingAssessments: standalone7Assessments,
      });

      // Exactly 7 active subjects, without Agriculture
      expect(dataset.activeSubjects).toHaveLength(7);
      expect(dataset.activeSubjects.some((s) => s.subject_code === 'AGN')).toBe(false);

      // Max curriculum score is 700
      expect(dataset.summaryStats.classCurriculumMax).toBe(700);

      // Alice total: 85 * 7 = 595
      const aliceRow = dataset.learners.find((l) => l.student.id === 'st_1');
      expect(aliceRow?.isRankable).toBe(true);
      expect(aliceRow?.terminalTotalMarks).toBe(595);
      expect(aliceRow?.displayPosition).toBe('1');

      // Brian total: 75 * 7 = 525
      const brianRow = dataset.learners.find((l) => l.student.id === 'st_2');
      expect(brianRow?.isRankable).toBe(true);
      expect(brianRow?.terminalTotalMarks).toBe(525);
      expect(brianRow?.displayPosition).toBe('2');
    });
  });

  describe('4. Protection against Mixed Structures', () => {
    const mixedAssessments: ContributingAssessmentRef[] = [
      {
        id: 'exam_comp_mixed',
        exam_name: 'Midterm Composite',
        assessment_structure: 'Composite',
      },
      {
        id: 'exam_sa_mixed',
        exam_name: 'Endterm Standalone',
        assessment_structure: 'Standalone',
      },
    ];

    it('flags incompatible structure and preserves complete protection against false rankings', () => {
      const resultsMap = calculateLearnerTerminalResults({
        learnerId: 'st_1',
        subjectIds: ['sb_up_eng', 'sb_up_kis'],
        contributingAssessments: mixedAssessments,
        marks: [],
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects: initialSubjects,
      });

      const engRes = resultsMap.get('sb_up_eng');
      expect(engRes?.incompatibleStructure).toBe(true);
      expect(engRes?.status).toBe('INCOMPATIBLE_STRUCTURE');
      expect(engRes?.isComplete).toBe(false);
      expect(engRes?.terminalPercentage).toBeNull();

      // In ranking engine, mixed structure learner is unrankable
      const cohortEntry: LearnerCohortEntry = {
        student: mockStudent1,
        classStream: mockClasses[0],
        applicableSubjects: initialSubjects.slice(0, 6),
        resultsBySubject: resultsMap,
      };

      const rankings = calculateCohortTerminalRankings({
        learners: [cohortEntry],
      });

      const st1Ranking = rankings.get('st_1');
      expect(st1Ranking?.isRankable).toBe(false);
      expect(st1Ranking?.terminalTotalMarks).toBeNull();
      expect(st1Ranking?.streamPosition).toBeNull();
      expect(st1Ranking?.overallPosition).toBeNull();
    });
  });

  describe('5. Merit-List Dataset for Composite Structure (/600 Max)', () => {
    const compositeAssessments: ContributingAssessmentRef[] = [
      {
        id: 'exam_comp_term',
        exam_name: 'Grade 5 Composite Terminal 2026',
        assessment_structure: 'Composite',
        out_of: 100,
      },
    ];

    const compositeSubjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, compositeAssessments);

    const aliceCompMarks: Mark[] = [
      // English: Lang 40/50 + Comp 35/40
      { id: 'm_c_1', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_up_eng', marks: 40, raw_score: 40, out_of: 50, special_status: 'Normal' },
      { id: 'm_c_2', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_up_comp', marks: 35, raw_score: 35, out_of: 40, special_status: 'Normal' },
      // Kiswahili: Lugha 38/50 + Insha 36/40
      { id: 'm_c_3', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_up_kis', marks: 38, raw_score: 38, out_of: 50, special_status: 'Normal' },
      { id: 'm_c_4', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_up_insha', marks: 36, raw_score: 36, out_of: 40, special_status: 'Normal' },
      // Mathematics: 75/100
      { id: 'm_c_5', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_up_mat', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
      // Integrated Science: 80/100
      { id: 'm_c_6', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_sci', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      // SS&CRE: SST 25/30 + CRE 18/20
      { id: 'm_c_7', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_sst', marks: 25, raw_score: 25, out_of: 30, special_status: 'Normal' },
      { id: 'm_c_8', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_cre', marks: 18, raw_score: 18, out_of: 20, special_status: 'Normal' },
      // Creative Arts & Sports: 82/100
      { id: 'm_c_9', exam_id: 'exam_comp_term', student_id: 'st_1', subject_id: 'sb_up_cas', marks: 82, raw_score: 82, out_of: 100, special_status: 'Normal' },
    ];

    it('builds 6-subject Composite merit list with /600 maximum', () => {
      const learnerResultsMap = new Map();
      learnerResultsMap.set(
        'st_1',
        calculateLearnerTerminalResults({
          learnerId: 'st_1',
          subjectIds: compositeSubjects.map((s) => s.id),
          contributingAssessments: compositeAssessments,
          marks: aliceCompMarks,
          educationLevel: 'Upper Primary',
          gradeName: 'Grade 5',
          subjects: compositeSubjects,
        })
      );

      const dataset = generateTerminalMeritDataset({
        school: mockSchool,
        academicYear: 2026,
        term: 'Term 1',
        grade: 'Grade 5',
        selectedStreamId: 'cs_up_g5_alpha',
        classes: mockClasses,
        students: [mockStudent1],
        subjects: initialSubjects,
        learnerResultsMap,
        contributingAssessments: compositeAssessments,
      });

      // Exactly 6 active Composite learning areas
      expect(dataset.activeSubjects).toHaveLength(6);
      expect(dataset.summaryStats.classCurriculumMax).toBe(600);

      const aliceRow = dataset.learners.find((l) => l.student.id === 'st_1');
      expect(aliceRow?.isRankable).toBe(true);
      expect(aliceRow?.terminalTotalMarks).toBeGreaterThan(0);
      expect(aliceRow?.terminalTotalMarks).toBeLessThanOrEqual(600);
      expect(aliceRow?.displayPosition).toBe('1');
    });
  });

  describe('6. Assessment Ranking Pipeline with Dynamic Max Marks', () => {
    it('uses 800 max marks in calculateCohortAssessmentRankings for Standalone with Agriculture', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_cohort_sa8',
          exam_name: 'Terminal Standalone 8',
          assessment_structure: 'Standalone',
          include_agriculture: true,
          out_of: 100,
        },
      ];

      const subjects = resolveUpperPrimaryTerminalSubjects(initialSubjects, assessments);

      const resultsMap = new Map();
      const aliceResults = calculateLearnerTerminalResults({
        learnerId: 'st_1',
        subjectIds: subjects.map((s) => s.id),
        contributingAssessments: assessments,
        marks: subjects.map((s) => ({
          id: `m_eval_${s.id}`,
          exam_id: 'exam_cohort_sa8',
          student_id: 'st_1',
          subject_id: s.id,
          marks: 75,
          raw_score: 75,
          out_of: 100,
          special_status: 'Normal',
        })),
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
        subjects,
      });

      const cohortEntry: LearnerCohortEntry = {
        student: mockStudent1,
        classStream: mockClasses[0],
        applicableSubjects: subjects,
        resultsBySubject: aliceResults,
      };

      const assessmentRankings = calculateCohortAssessmentRankings({
        contributingAssessments: assessments,
        applicableSubjects: subjects,
        cohortLearners: [cohortEntry],
        classes: mockClasses,
      });

      const aliceSummary = assessmentRankings.get('st_1')?.['exam_cohort_sa8'];
      expect(aliceSummary).toBeDefined();
      expect(aliceSummary?.maxMarks).toBe(800);
      expect(aliceSummary?.totalMarks).toBeGreaterThan(0);
    });
  });
});
