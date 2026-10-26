import { describe, it, expect } from 'vitest';
import { initialSubjects } from '../data/seedData';
import {
  Subject,
  Mark,
  Examination,
  Student,
  ClassStream,
  getApplicableSubjectsForGrade,
} from '../types';
import {
  getUpperPrimaryCompositeSubjectMarks,
} from '../utils/markUtils';
import { calculateExamResults, CBE_8_POINT_GRADES } from '../services/analysisEngine';
import { calculateCohortAssessmentRankings } from '../services/terminalRankingEngine';
import { resolveUpperPrimaryTerminalSubjects } from '../services/terminalResultsEngine';

describe('Phase 3 Direct SS&CRE Surgical Fix Regressions', () => {
  const g6Class: ClassStream = {
    id: 'cls_g6_blue',
    class_name: 'Grade 6',
    stream: 'Blue',
    education_level: 'Upper Primary',
  };

  const dennis: Student = {
    id: 'std_dennis_057',
    admission_number: 'ADM-057',
    full_name: 'Dennis Mwangi',
    first_name: 'Dennis',
    last_name: 'Mwangi',
    gender: 'M',
    grade: 'Grade 6',
    class_id: 'cls_g6_blue',
    stream_id: 'cls_g6_blue',
    active: true,
  };

  const g6OpenerExam: Examination = {
    id: 'exam_g6_opener_2026',
    exam_name: 'Grade 6 Opener Assessment Term 3 2026',
    term: 'Term 3',
    year: 2026,
    academic_year_id: 'ay_2026',
    education_level: 'Upper Primary',
    status: 'Approved',
    exam_type: 'Opener' as any,
    max_marks: 100,
    assessment_structure: 'Composite',
    // No ss_cre_structure specified
  };

  // Canonical 6 Upper Primary learning areas
  const canonicalOpenerSubjects: Subject[] = [
    { id: 'sb_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_cas', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_up_ss_cre', subject_name: 'Social Studies&CRE', subject_code: 'SS&CRE', category: 'Core', education_level: 'Upper Primary' },
  ];

  // Requirement 1 & 3: Direct SS&CRE mark 76 with no ss_cre_structure contributes exactly 76 once and does not create synthetic SST or CRE
  it('Requirement 1 & 3: direct SS&CRE mark 76 with no ss_cre_structure produces exactly one composite contribution and no synthetic SST or CRE', () => {
    const marks: Mark[] = [
      {
        id: 'm_ss_cre_direct',
        student_id: dennis.id,
        exam_id: g6OpenerExam.id,
        subject_id: 'sb_up_ss_cre',
        marks: 76,
        score: 76,
        raw_score: 76,
        out_of: 100,
        percentage: 76,
      },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(marks, canonicalOpenerSubjects, 'Upper Primary', g6OpenerExam);

    // Only one synthetic subject for SS&CRE
    expect(result.syntheticSubjects.length).toBe(1);
    expect(result.syntheticSubjects[0].subject_code).toBe('SS&CRE');

    // No synthetic SST or CRE in syntheticSubjects
    expect(result.syntheticSubjects.some((s) => s.subject_code === 'SST')).toBe(false);
    expect(result.syntheticSubjects.some((s) => s.subject_code === 'CRE')).toBe(false);

    // Only one mark in processedMarks
    expect(result.processedMarks.length).toBe(1);
    expect(result.processedMarks[0].score).toBe(76);
    expect(result.processedMarks[0].out_of).toBe(100);
    expect(result.processedMarks[0].percentage).toBe(76);

    // No synthetic SST or CRE marks in processedMarks
    expect(result.processedMarks.some((m) => m.subject_id === 'sb_up_sst' || m.id === 'synth_mark_sst')).toBe(false);
    expect(result.processedMarks.some((m) => m.subject_id === 'sb_up_cre' || m.id === 'synth_mark_cre')).toBe(false);
  });

  // Requirement 2: The affected six-area Opener example calculates 432/600, not 584/600
  it('Requirement 2: six-area Opener calculates exactly 432/600 (not 584/600) for Dennis Mwangi', () => {
    // Dennis's exact marks from Grade 6 Opener Assessment:
    // ENG: 70, KIS: 70, MAT: 72, SCI: 72, CAS: 72, SS&CRE: 76
    // Sum = 70 + 70 + 72 + 72 + 72 + 76 = 432 / 600
    const dennisMarks: Mark[] = [
      { id: 'm1', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_eng', marks: 70, score: 70, raw_score: 70, out_of: 100, percentage: 70 },
      { id: 'm2', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_kis', marks: 70, score: 70, raw_score: 70, out_of: 100, percentage: 70 },
      { id: 'm3', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_mat', marks: 72, score: 72, raw_score: 72, out_of: 100, percentage: 72 },
      { id: 'm4', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_sci', marks: 72, score: 72, raw_score: 72, out_of: 100, percentage: 72 },
      { id: 'm5', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_cas', marks: 72, score: 72, raw_score: 72, out_of: 100, percentage: 72 },
      { id: 'm6', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_up_ss_cre', marks: 76, score: 76, raw_score: 76, out_of: 100, percentage: 76 },
    ];

    const results = calculateExamResults(
      g6OpenerExam.id,
      [dennis],
      dennisMarks,
      CBE_8_POINT_GRADES,
      [g6Class],
      canonicalOpenerSubjects,
      g6OpenerExam as any
    );

    const dennisResult = results.find((r) => r.student_id === dennis.id);
    expect(dennisResult).toBeDefined();
    // Must be 432 totalMarks, 600 maxMarks, 6 assessedSubjects (NOT 584, NOT 800)
    expect(dennisResult?.total_marks).toBe(432);
    expect(dennisResult?.total_max_marks).toBe(600);
    expect(dennisResult?.subject_count).toBe(6);
    expect(dennisResult?.average).toBe(72);
  });

  // Requirement 4: Explicit component-based structure B still combines SST and CRE correctly
  it('Requirement 4: explicit component-based structure B (10:10 -> 20) still combines SST and CRE correctly', () => {
    const structBExam: Examination = {
      ...g6OpenerExam,
      id: 'exam_struct_b',
      ss_cre_structure: 'B',
    };
    const marks: Mark[] = [
      { id: 'm_sst', student_id: dennis.id, exam_id: structBExam.id, subject_id: 'sb_sst', score: 8, raw_score: 8, out_of: 10, marks: 8 },
      { id: 'm_cre', student_id: dennis.id, exam_id: structBExam.id, subject_id: 'sb_cre', score: 7, raw_score: 7, out_of: 10, marks: 7 },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(marks, canonicalOpenerSubjects, 'Upper Primary', structBExam);
    const ssCreMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');
    expect(ssCreMark).toBeDefined();
    expect(ssCreMark?.raw_score).toBe(15);
    expect(ssCreMark?.out_of).toBe(20);
    expect(ssCreMark?.percentage).toBe(75);
  });

  // Requirement 5: Explicit CUSTOM:25:15 structure still uses the configured ratio correctly
  it('Requirement 5: explicit CUSTOM:25:15 structure uses configured ratio correctly', () => {
    const customExam: Examination = {
      ...g6OpenerExam,
      id: 'exam_custom_ratio',
      ss_cre_structure: 'CUSTOM:25:15' as any,
    };
    const marks: Mark[] = [
      { id: 'm_sst', student_id: dennis.id, exam_id: customExam.id, subject_id: 'sb_sst', score: 20, raw_score: 20, out_of: 25, marks: 20 },
      { id: 'm_cre', student_id: dennis.id, exam_id: customExam.id, subject_id: 'sb_cre', score: 12, raw_score: 12, out_of: 15, marks: 12 },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(marks, canonicalOpenerSubjects, 'Upper Primary', customExam);
    const ssCreMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');
    expect(ssCreMark).toBeDefined();
    expect(ssCreMark?.raw_score).toBe(32);
    expect(ssCreMark?.out_of).toBe(40);
    expect(ssCreMark?.percentage).toBe(80);
  });

  // Requirement 6: Missing required component marks still produce the correct incomplete/X result
  it('Requirement 6: missing required component marks produce incomplete or X result', () => {
    const structAExam: Examination = {
      ...g6OpenerExam,
      id: 'exam_struct_a',
      ss_cre_structure: 'A', // 30:20
    };

    // Case A: Only SST entered, CRE missing completely
    const partialMarks: Mark[] = [
      { id: 'm_sst', student_id: dennis.id, exam_id: structAExam.id, subject_id: 'sb_sst', score: 25, raw_score: 25, out_of: 30, marks: 25 },
    ];
    const partialResult = getUpperPrimaryCompositeSubjectMarks(partialMarks, canonicalOpenerSubjects, 'Upper Primary', structAExam);
    // When a component is missing, no composite is synthesized
    expect(partialResult.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre')).toBeUndefined();

    // Case B: Both absent (X + X)
    const absentMarks: Mark[] = [
      { id: 'm_sst_x', student_id: dennis.id, exam_id: structAExam.id, subject_id: 'sb_sst', score: 0, raw_score: 0, out_of: 30, marks: 0, special_status: 'X' },
      { id: 'm_cre_x', student_id: dennis.id, exam_id: structAExam.id, subject_id: 'sb_cre', score: 0, raw_score: 0, out_of: 20, marks: 0, special_status: 'X' },
    ];
    const absentResult = getUpperPrimaryCompositeSubjectMarks(absentMarks, canonicalOpenerSubjects, 'Upper Primary', structAExam);
    const absentComposite = absentResult.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');
    expect(absentComposite).toBeDefined();
    expect(absentComposite?.special_status).toBe('X');
  });

  // Requirement 7: Upper Primary Standalone examinations retain their eight independent learning areas
  it('Requirement 7: Upper Primary Standalone examination retains 8 independent learning areas', () => {
    const standaloneExam: Examination = {
      id: 'exam_standalone_g6',
      exam_name: 'Grade 6 Standalone Exam 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Approved',
      exam_type: 'Regular' as any,
      max_marks: 100,
      assessment_structure: 'Standalone',
    };
    const standaloneSubjects: Subject[] = [
      { id: 'sb_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_sst', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_agn', subject_name: 'Agriculture', subject_code: 'AGN', category: 'Core', education_level: 'Upper Primary' },
      { id: 'sb_cas', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core', education_level: 'Upper Primary' },
    ];

    const standaloneMarks: Mark[] = [
      { id: 'm1', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_eng', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm2', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_kis', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm3', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_mat', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm4', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_sci', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm5', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_cas', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm6', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_sst', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm7', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_cre', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
      { id: 'm8', student_id: dennis.id, exam_id: standaloneExam.id, subject_id: 'sb_agn', marks: 80, score: 80, raw_score: 80, out_of: 100, percentage: 80 },
    ];

    const results = calculateExamResults(
      standaloneExam.id,
      [dennis],
      standaloneMarks,
      CBE_8_POINT_GRADES,
      [g6Class],
      standaloneSubjects,
      standaloneExam as any
    );

    const dennisResult = results.find((r) => r.student_id === dennis.id);
    expect(dennisResult).toBeDefined();
    expect(dennisResult?.total_marks).toBe(640);
    expect(dennisResult?.total_max_marks).toBe(800);
    expect(dennisResult?.subject_count).toBe(8);
  });

  // Requirement 8: Agriculture remains excluded for Opener when not applicable, and included for Third Trial when applicable
  it('Requirement 8: Agriculture is excluded for Opener (6 learning areas) and included for KPSEA Third Trial (7 learning areas)', () => {
    // Opener without Agriculture has 6 learning areas
    const openerResults = calculateExamResults(
      g6OpenerExam.id,
      [dennis],
      [
        { id: 'm1', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_eng', marks: 70, score: 70, raw_score: 70, out_of: 100 },
        { id: 'm2', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_kis', marks: 70, score: 70, raw_score: 70, out_of: 100 },
        { id: 'm3', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_mat', marks: 72, score: 72, raw_score: 72, out_of: 100 },
        { id: 'm4', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_sci', marks: 72, score: 72, raw_score: 72, out_of: 100 },
        { id: 'm5', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_cas', marks: 72, score: 72, raw_score: 72, out_of: 100 },
        { id: 'm6', student_id: dennis.id, exam_id: g6OpenerExam.id, subject_id: 'sb_up_ss_cre', marks: 76, score: 76, raw_score: 76, out_of: 100 },
      ],
      CBE_8_POINT_GRADES,
      [g6Class],
      canonicalOpenerSubjects,
      g6OpenerExam as any
    );
    expect(openerResults[0].total_max_marks).toBe(600);

    // Third Trial with Agriculture has 7 learning areas (max 700)
    const thirdTrialExam: Examination = {
      id: 'exam_g6_third_trial',
      exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Approved',
      exam_type: 'KPSEA' as any,
      max_marks: 100,
      assessment_structure: 'Composite',
      include_agriculture: true,
      applicable_classes: ['cls_g6_blue'],
    };
    const thirdTrialSubjects: Subject[] = [
      ...canonicalOpenerSubjects,
      { id: 'sb_agn', subject_name: 'Agriculture', subject_code: 'AGN', category: 'Core', education_level: 'Upper Primary' },
    ];
    const thirdTrialMarks: Mark[] = [
      { id: 'm1', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_eng', marks: 80, score: 80, raw_score: 80, out_of: 100 },
      { id: 'm2', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_kis', marks: 80, score: 80, raw_score: 80, out_of: 100 },
      { id: 'm3', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_mat', marks: 80, score: 80, raw_score: 80, out_of: 100 },
      { id: 'm4', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_sci', marks: 80, score: 80, raw_score: 80, out_of: 100 },
      { id: 'm5', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_cas', marks: 80, score: 80, raw_score: 80, out_of: 100 },
      { id: 'm6', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_agn', marks: 80, score: 80, raw_score: 80, out_of: 100 },
      { id: 'm7', student_id: dennis.id, exam_id: thirdTrialExam.id, subject_id: 'sb_up_ss_cre', marks: 80, score: 80, raw_score: 80, out_of: 100 },
    ];
    const thirdTrialResults = calculateExamResults(
      thirdTrialExam.id,
      [dennis],
      thirdTrialMarks,
      CBE_8_POINT_GRADES,
      [g6Class],
      thirdTrialSubjects,
      thirdTrialExam as any
    );
    expect(thirdTrialResults[0].total_max_marks).toBe(700);
    expect(thirdTrialResults[0].total_marks).toBe(560);
  });

  // Requirement 9: Cohort rankings and terminal rankings use the corrected calculation
  it('Requirement 9: cohort assessment rankings calculate 432/600 for Dennis in Opener', () => {
    const cohortRankings = calculateCohortAssessmentRankings({
      contributingAssessments: [g6OpenerExam],
      classes: [g6Class],
      applicableSubjects: canonicalOpenerSubjects,
      cohortLearners: [
        {
          student: dennis,
          resultsBySubject: new Map([
            ['sb_eng', { assessmentTrail: [{ examId: g6OpenerExam.id, rawScore: 70, outOf: 100, status: 'Normal' }] } as any],
            ['sb_kis', { assessmentTrail: [{ examId: g6OpenerExam.id, rawScore: 70, outOf: 100, status: 'Normal' }] } as any],
            ['sb_mat', { assessmentTrail: [{ examId: g6OpenerExam.id, rawScore: 72, outOf: 100, status: 'Normal' }] } as any],
            ['sb_sci', { assessmentTrail: [{ examId: g6OpenerExam.id, rawScore: 72, outOf: 100, status: 'Normal' }] } as any],
            ['sb_cas', { assessmentTrail: [{ examId: g6OpenerExam.id, rawScore: 72, outOf: 100, status: 'Normal' }] } as any],
            ['sb_up_ss_cre', { assessmentTrail: [{ examId: g6OpenerExam.id, rawScore: 76, outOf: 100, status: 'Normal' }] } as any],
          ]),
        } as any,
      ],
    });

    const dennisSummaries = cohortRankings.get(dennis.id);
    expect(dennisSummaries).toBeDefined();
    const dennisOpenerRanking = dennisSummaries?.[g6OpenerExam.id];
    expect(dennisOpenerRanking).toBeDefined();
    expect(dennisOpenerRanking?.totalMarks).toBe(432);
    expect(dennisOpenerRanking?.maxMarks).toBe(600);
  });

  // Requirement 10: Existing Grade 9 ranking and term-matching behaviour remains intact
  it('Requirement 10: Junior School Grade 9 nine-subject calculation remains intact and untouched', () => {
    const jsStudent: Student = {
      id: 'std_js_diana',
      admission_number: 'ADM-163',
      full_name: 'Diana JS',
      first_name: 'Diana',
      last_name: 'JS',
      gender: 'F',
      grade: 'Grade 9',
      class_id: 'cls_g9',
      stream_id: 'cls_g9',
      active: true,
    };
    const g9Class: ClassStream = {
      id: 'cls_g9',
      class_name: 'Grade 9',
      stream: 'East',
      education_level: 'Junior School',
    };
    const g9Exam: Examination = {
      id: 'exam_kjsea_trial3',
      exam_name: 'KJSEA Third Trial Term 3 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'KJSEA' as any,
      max_marks: 100,
    };
    const jsSubjects: Subject[] = [
      { id: 'sb_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_cas', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_sst', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_agn', subject_name: 'Agriculture', subject_code: 'AGN', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_pts', subject_name: 'Pre-Technical Studies', subject_code: 'PRE-TECH', category: 'Core', education_level: 'Junior School' },
    ];
    expect(jsSubjects.length).toBe(9);

    // Diana's marks across 9 subjects (75 in subject 0, 80 in remaining 8 = 715 / 900)
    const jsMarks: Mark[] = jsSubjects.map((s, idx) => ({
      id: `m_js_${idx}`,
      student_id: jsStudent.id,
      exam_id: g9Exam.id,
      subject_id: s.id,
      marks: idx === 0 ? 75 : 80,
      score: idx === 0 ? 75 : 80,
      raw_score: idx === 0 ? 75 : 80,
      out_of: 100,
    }));

    const results = calculateExamResults(
      g9Exam.id,
      [jsStudent],
      jsMarks,
      CBE_8_POINT_GRADES,
      [g9Class],
      jsSubjects,
      g9Exam as any
    );

    const dianaResult = results.find((r) => r.student_id === jsStudent.id);
    expect(dianaResult).toBeDefined();
    expect(dianaResult?.total_marks).toBe(715);
    expect(dianaResult?.total_max_marks).toBe(900);
    expect(dianaResult?.subject_count).toBe(9);
  });
});
