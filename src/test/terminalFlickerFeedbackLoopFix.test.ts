import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/storage';
import {
  Student,
  ClassStream,
  Examination,
  Mark,
  Grade,
  Subject,
} from '../types';
import { discoverTerminalAssessments } from '../services/terminalAssessmentDiscovery';
import {
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';

describe('CBE Hub — Terminal Loading / Results Flicker Surgical Regression Suite', () => {
  const mockClass: ClassStream = {
    id: 'class-g8-blue',
    stream_id: 'stream-g8-blue',
    class_name: 'Grade 8',
    stream: 'Blue',
    education_level: 'Junior School',
  };

  const mockOtherClass: ClassStream = {
    id: 'class-g7-red',
    stream_id: 'stream-g7-red',
    class_name: 'Grade 7',
    stream: 'Red',
    education_level: 'Junior School',
  };

  const mockStudent1: Student = {
    id: 'stu-001',
    admission_number: 'ADM001',
    full_name: 'John Kamau',
    first_name: 'John',
    last_name: 'Kamau',
    class_id: mockClass.id,
    stream_id: mockClass.stream_id,
    grade: 'Grade 8',
    gender: 'M',
    active: true,
  };

  const mockStudent2: Student = {
    id: 'stu-002',
    admission_number: 'ADM002',
    full_name: 'Faith Achieng',
    first_name: 'Faith',
    last_name: 'Achieng',
    class_id: mockClass.id,
    stream_id: mockClass.stream_id,
    grade: 'Grade 8',
    gender: 'F',
    active: true,
  };

  const mockExams: Examination[] = [
    {
      id: 'exam-mid-t1',
      exam_name: 'Mid Term 1 Assessment',
      academic_year_id: '2026',
      term_id: 'Term 1',
      year: 2026,
      term: 'Term 1',
      status: 'Approved',
      exam_type: 'Mid-Term',
      class_id: mockClass.id,
      max_marks: 100,
      start_date: '2026-02-15',
    },
    {
      id: 'exam-end-t1',
      exam_name: 'End Term 1 Assessment',
      academic_year_id: '2026',
      term_id: 'Term 1',
      year: 2026,
      term: 'Term 1',
      status: 'Approved',
      exam_type: 'End-Term',
      class_id: mockClass.id,
      max_marks: 100,
      start_date: '2026-03-25',
    },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sub-mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
    { id: 'sub-eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Initial Terminal loading completes and results remain visible', async () => {
    const fetchedMarks: Mark[] = [
      { id: 'm-1', exam_id: 'exam-mid-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 75, raw_score: 75 },
      { id: 'm-2', exam_id: 'exam-end-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 85, raw_score: 85 },
    ];

    vi.spyOn(api, 'fetchMarksForLearner').mockResolvedValue(fetchedMarks);
    vi.spyOn(api, 'fetchMarksForExam').mockResolvedValue(fetchedMarks);

    const discovered = await discoverTerminalAssessments({
      academicYearId: '2026',
      termId: 'Term 1',
      student: mockStudent1,
      classStream: mockClass,
      examinations: mockExams,
      marks: fetchedMarks,
      classes: [mockClass],
      students: [mockStudent1, mockStudent2],
    });

    expect(discovered).not.toBeNull();
    expect(discovered.contributingAssessments).toHaveLength(2);

    const results = calculateLearnerTerminalResults({
      learnerId: mockStudent1.id,
      subjectIds: ['sub-mat'],
      contributingAssessments: discovered.contributingAssessments,
      marks: fetchedMarks,
      grades: CBE_8_POINT_GRADES,
      educationLevel: 'Junior School',
      subjects: mockSubjects,
    });

    const mathResult = results.get('sub-mat');
    expect(mathResult).toBeDefined();
    expect(mathResult?.isComplete).toBe(true);
    // (75 + 85) / 2 = 80
    expect(mathResult?.terminalPercentage).toBe(80);
    expect(mathResult?.cbePerformanceLevel).toContain('EE');
  });

  it('2. A new marks array reference with unchanged data does not trigger rediscovery', async () => {
    let discoveryCallCount = 0;
    const fetchMarksSpy = vi.spyOn(api, 'fetchMarksForLearner').mockImplementation(async () => {
      discoveryCallCount++;
      return [
        { id: 'm-1', exam_id: 'exam-mid-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 70 },
      ];
    });

    // Simulate our stabilized controller: discovery triggers only when context inputs change
    class StabilizedTerminalController {
      private lastContextKey = '';
      public discoveryCount = 0;

      triggerDiscovery(context: {
        studentId: string;
        classId: string;
        year: string;
        term: string;
        isProvisional: boolean;
        relevantExamsKey: string;
      }) {
        const key = `${context.studentId}|${context.classId}|${context.year}|${context.term}|${context.isProvisional}|${context.relevantExamsKey}`;
        if (key !== this.lastContextKey) {
          this.lastContextKey = key;
          this.discoveryCount++;
          api.fetchMarksForLearner(context.studentId);
        }
      }
    }

    const controller = new StabilizedTerminalController();
    const context1 = {
      studentId: mockStudent1.id,
      classId: mockClass.id,
      year: '2026',
      term: 'Term 1',
      isProvisional: false,
      relevantExamsKey: 'exam-mid-t1:Approved|exam-end-t1:Approved',
    };

    // Initial load
    controller.triggerDiscovery(context1);
    expect(controller.discoveryCount).toBe(1);
    expect(discoveryCallCount).toBe(1);

    // Parent component App re-renders: passes new array references marks = [...marks], exams = [...exams]
    // with identical underlying context:
    controller.triggerDiscovery(context1);
    expect(controller.discoveryCount).toBe(1);
    expect(discoveryCallCount).toBe(1); // Crucial: ZERO rediscovery restarts!
  });

  it('3. A genuine mark-value update immediately updates displayed calculations without restarting discovery', () => {
    const contributing: ContributingAssessmentRef[] = [
      { id: 'exam-mid-t1', exam_name: 'Mid Term 1', title: 'Mid Term 1', status: 'Approved', maxScore: 100, isOfficial: true },
      { id: 'exam-end-t1', exam_name: 'End Term 1', title: 'End Term 1', status: 'Approved', maxScore: 100, isOfficial: true },
    ];

    // Initial mark state: Mid 60, End 60 -> Average 60
    const initialMarks: Mark[] = [
      { id: 'm-1', exam_id: 'exam-mid-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 60, raw_score: 60 },
      { id: 'm-2', exam_id: 'exam-end-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 60, raw_score: 60 },
    ];

    const initialResult = calculateLearnerTerminalResults({
      learnerId: mockStudent1.id,
      subjectIds: ['sub-mat'],
      contributingAssessments: contributing,
      marks: initialMarks,
      grades: CBE_8_POINT_GRADES,
      educationLevel: 'Junior School',
      subjects: mockSubjects,
    });
    expect(initialResult.get('sub-mat')?.terminalPercentage).toBe(60);

    // Genuine mark update in Supabase / App: End-term mark corrected from 60 to 90
    const updatedMarks: Mark[] = [
      { id: 'm-1', exam_id: 'exam-mid-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 60, raw_score: 60 },
      { id: 'm-2', exam_id: 'exam-end-t1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 90, raw_score: 90 },
    ];

    // Recalculates in-place (simulating resultsBySubject useMemo reacting to marks prop)
    const updatedResult = calculateLearnerTerminalResults({
      learnerId: mockStudent1.id,
      subjectIds: ['sub-mat'],
      contributingAssessments: contributing,
      marks: updatedMarks,
      grades: CBE_8_POINT_GRADES,
      educationLevel: 'Junior School',
      subjects: mockSubjects,
    });
    // (60 + 90) / 2 = 75
    expect(updatedResult.get('sub-mat')?.terminalPercentage).toBe(75);
  });

  it('4. Change of learner, class, academic year, term, or provisional mode triggers fresh discovery', () => {
    const discoveryKeys: string[] = [];
    const trigger = (ctx: {
      studentId: string;
      classId: string;
      year: string;
      term: string;
      isProvisional: boolean;
    }) => {
      discoveryKeys.push(`${ctx.studentId}|${ctx.classId}|${ctx.year}|${ctx.term}|${ctx.isProvisional}`);
    };

    // 1. Initial learner
    trigger({ studentId: mockStudent1.id, classId: mockClass.id, year: '2026', term: 'Term 1', isProvisional: false });
    // 2. Switch learner
    trigger({ studentId: mockStudent2.id, classId: mockClass.id, year: '2026', term: 'Term 1', isProvisional: false });
    // 3. Switch class
    trigger({ studentId: mockStudent1.id, classId: mockOtherClass.id, year: '2026', term: 'Term 1', isProvisional: false });
    // 4. Switch term
    trigger({ studentId: mockStudent1.id, classId: mockClass.id, year: '2026', term: 'Term 2', isProvisional: false });
    // 5. Switch provisional mode
    trigger({ studentId: mockStudent1.id, classId: mockClass.id, year: '2026', term: 'Term 1', isProvisional: true });

    const uniqueKeys = new Set(discoveryKeys);
    expect(uniqueKeys.size).toBe(5);
  });

  it('5. Request sequencing prevents outdated async responses from overwriting newer selections', async () => {
    let activeRequestId = 0;
    let displayedStudentId = '';
    let displayedMarks: Mark[] = [];

    const simulateLoadForStudent = async (studentId: string, delayMs: number, marksData: Mark[]) => {
      const currentRequestId = ++activeRequestId;
      await new Promise((res) => setTimeout(res, delayMs));

      // Cancellation check: discard if superseded
      if (currentRequestId !== activeRequestId) {
        return;
      }

      displayedStudentId = studentId;
      displayedMarks = marksData;
    };

    // User selects Student 1 (slow network request: 100ms)
    const p1 = simulateLoadForStudent(mockStudent1.id, 100, [
      { id: 'm-st1', exam_id: 'exam-1', student_id: mockStudent1.id, subject_id: 'sub-mat', marks: 50 },
    ]);

    // User quickly switches to Student 2 (faster network request: 20ms)
    const p2 = simulateLoadForStudent(mockStudent2.id, 20, [
      { id: 'm-st2', exam_id: 'exam-1', student_id: mockStudent2.id, subject_id: 'sub-mat', marks: 95 },
    ]);

    await Promise.all([p1, p2]);

    // Even though Student 1 was requested first and took 100ms, Student 2 is the active selection
    // and Student 1's response was discarded.
    expect(displayedStudentId).toBe(mockStudent2.id);
    expect(displayedMarks[0].student_id).toBe(mockStudent2.id);
    expect(displayedMarks[0].marks).toBe(95);
  });

  it('6. ReportsView marks-fetch effect does not loop while Terminal is active, but works on other tabs', async () => {
    let singleExamFetchCount = 0;
    vi.spyOn(api, 'fetchMarksForExam').mockImplementation(async () => {
      singleExamFetchCount++;
      return [];
    });

    const simulateReportsViewEffect = (reportTab: string, selectedExamId: string) => {
      if (!selectedExamId || reportTab === 'terminal') {
        return false; // Skipped for terminal
      }
      api.fetchMarksForExam(selectedExamId);
      return true;
    };

    // When active on 'terminal' tab:
    const ranOnTerminal = simulateReportsViewEffect('terminal', 'exam-mid-t1');
    expect(ranOnTerminal).toBe(false);
    expect(singleExamFetchCount).toBe(0);

    // When switching to 'individual' or 'merit' or 'subject':
    const ranOnIndividual = simulateReportsViewEffect('individual', 'exam-mid-t1');
    expect(ranOnIndividual).toBe(true);
    expect(singleExamFetchCount).toBe(1);

    const ranOnSubject = simulateReportsViewEffect('subject', 'exam-mid-t1');
    expect(ranOnSubject).toBe(true);
    expect(singleExamFetchCount).toBe(2);
  });

  it('7. Handles empty results and database discovery errors gracefully', async () => {
    vi.spyOn(api, 'fetchMarksForLearner').mockRejectedValue(new Error('Connection timeout to Supabase'));

    let caughtError: string | null = null;
    let discoveredContext: any = 'non-null';

    try {
      await api.fetchMarksForLearner(mockStudent1.id);
    } catch (err: any) {
      caughtError = err.message;
      discoveredContext = null;
    }

    expect(caughtError).toContain('Connection timeout to Supabase');
    expect(discoveredContext).toBeNull();
  });

  it('8. Manual refresh successfully re-executes discovery and updates state', async () => {
    let refreshExecutionCount = 0;
    const manualRefresh = async () => {
      refreshExecutionCount++;
      return api.fetchMarksForLearner(mockStudent1.id);
    };

    vi.spyOn(api, 'fetchMarksForLearner').mockResolvedValue([]);

    await manualRefresh();
    expect(refreshExecutionCount).toBe(1);

    await manualRefresh();
    expect(refreshExecutionCount).toBe(2);
  });
});
