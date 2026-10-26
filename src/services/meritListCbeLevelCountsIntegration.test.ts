import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { School, Examination, ClassStream, Subject, Teacher, Student, Mark } from '../types';
import { downloadMeritListPDF } from './meritListExporter';
import { CBE_8_POINT_GRADES } from './analysisEngine';
import * as fileDownloader from '../utils/fileDownloader';
import autoTable from 'jspdf-autotable';

// Mock autoTable spy to capture table parameters
vi.mock('jspdf-autotable', async () => {
  const actual = await vi.importActual<any>('jspdf-autotable');
  const mockAutoTable = vi.fn((doc: any, options: any) => {
    return actual.default(doc, options);
  });
  return {
    default: mockAutoTable,
  };
});

describe('Merit List PDF - CBE Level Counts Table Integration (Phase 3B-3)', () => {
  let capturedDoc: any = null;
  let savePdfCalled = false;

  beforeEach(() => {
    capturedDoc = null;
    savePdfCalled = false;
    vi.clearAllMocks();
    vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
      savePdfCalled = true;
    });
  });

  const mockSchool: School = {
    id: 'sch-1',
    school_name: 'Muchorwe Complex Academy',
    school_code: 'MCA001',
    county: 'Nakuru',
    email: 'info@school.ac.ke',
  };

  const mockJuniorExam: Examination = {
    id: 'ex-junior-1',
    exam_name: 'End Term 2 Exam',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Junior School',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockPrimaryExam: Examination = {
    id: 'ex-primary-1',
    exam_name: 'End Term 2 Exam',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Upper Primary',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockJuniorClasses: ClassStream[] = [
    { id: 'cls-j8-east', class_name: 'Grade 8', stream: 'East', education_level: 'Junior School' },
    { id: 'cls-j8-west', class_name: 'Grade 8', stream: 'West', education_level: 'Junior School' },
  ];

  const mockPrimaryClasses: ClassStream[] = [
    { id: 'cls-p6-east', class_name: 'Grade 6', stream: 'East', education_level: 'Upper Primary' },
    { id: 'cls-p6-west', class_name: 'Grade 6', stream: 'West', education_level: 'Upper Primary' },
  ];

  const mockJuniorSubjects: Subject[] = [
    { id: 'sub-mat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-eng', subject_name: 'English', subject_code: 'ENG', education_level: 'Junior School', category: 'Core' },
  ];

  const mockPrimarySubjects: Subject[] = [
    { id: 'sub-pmat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub-psci', subject_name: 'Science & Technology', subject_code: 'SCI', education_level: 'Upper Primary', category: 'Core' },
  ];

  it('1. Primary PDF exports CBE LEVEL COUNTS table with exact headers and column order', async () => {
    const students: Student[] = [
      { id: 'sp-1', admission_number: 'P001', full_name: 'Primary Learner 1', class_id: 'cls-p6-east', stream_id: 'cls-p6-east', grade: 'Grade 6', gender: 'F', active: true },
      { id: 'sp-2', admission_number: 'P002', full_name: 'Primary Learner 2', class_id: 'cls-p6-east', stream_id: 'cls-p6-east', grade: 'Grade 6', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'mp1', student_id: 'sp-1', subject_id: 'sub-pmat', exam_id: 'ex-primary-1', marks: 85, out_of: 100, special_status: 'Normal' },
      { id: 'mp2', student_id: 'sp-1', subject_id: 'sub-psci', exam_id: 'ex-primary-1', marks: 80, out_of: 100, special_status: 'Normal' },
      { id: 'mp3', student_id: 'sp-2', subject_id: 'sub-pmat', exam_id: 'ex-primary-1', marks: 60, out_of: 100, special_status: 'Normal' },
      { id: 'mp4', student_id: 'sp-2', subject_id: 'sub-psci', exam_id: 'ex-primary-1', marks: 65, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockPrimaryExam,
      selectedClassId: 'cls-p6-east',
      selectedStreamId: 'all',
      classes: mockPrimaryClasses,
      students,
      subjects: mockPrimarySubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(savePdfCalled).toBe(true);
    expect(capturedDoc).not.toBeNull();

    // Verify autoTable calls for the CBE counts table
    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return (
        opts &&
        opts.head &&
        opts.head[0] &&
        opts.head[0].includes('EE') &&
        opts.head[0].includes('TOTAL LEARNERS')
      );
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Non-negotiable Requirement 1: Exact headers in exact order
    expect(cbeOpts.head[0]).toEqual([
      'STREAM',
      'EE',
      'ME',
      'AE',
      'BE',
      'PROVISIONAL',
      'PENDING',
      'TOTAL LEARNERS',
    ]);

    // Non-negotiable Requirement 3: One row per represented stream, NO overall TOTAL row
    expect(cbeOpts.body).toHaveLength(1);
    const row = cbeOpts.body[0];
    expect(row[0]).toBe('EAST'); // Stream
    expect(row[1]).toBe('1'); // EE (sp-1: avg 82.5 -> EE)
    expect(row[2]).toBe('1'); // ME (sp-2: avg 62.5 -> ME)
    expect(row[3]).toBe('0'); // AE
    expect(row[4]).toBe('0'); // BE
    expect(row[5]).toBe('0'); // Provisional
    expect(row[6]).toBe('0'); // Pending
    expect(row[7]).toBe('2'); // Total Learners (1 + 1 = 2)

    // Ensure no row has 'TOTAL' as stream name
    const hasOverallTotalRow = cbeOpts.body.some((r: any[]) => r[0] === 'TOTAL');
    expect(hasOverallTotalRow).toBe(false);
  });

  it('2. Junior School PDF exports CBE LEVEL COUNTS table with exact 12 headers and column order', async () => {
    const students: Student[] = [
      { id: 'sj-1', admission_number: 'J001', full_name: 'Junior Learner 1', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'sj-2', admission_number: 'J002', full_name: 'Junior Learner 2', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'mj1', student_id: 'sj-1', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'mj2', student_id: 'sj-1', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 90, out_of: 100, special_status: 'Normal' },
      { id: 'mj3', student_id: 'sj-2', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 78, out_of: 100, special_status: 'Normal' },
      { id: 'mj4', student_id: 'sj-2', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 80, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'all',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(savePdfCalled).toBe(true);

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return (
        opts &&
        opts.head &&
        opts.head[0] &&
        opts.head[0].includes('EE1') &&
        opts.head[0].includes('TOTAL LEARNERS')
      );
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Non-negotiable Requirement 2: Exact 12 headers in exact order
    expect(cbeOpts.head[0]).toEqual([
      'STREAM',
      'EE1',
      'EE2',
      'ME1',
      'ME2',
      'AE1',
      'AE2',
      'BE1',
      'BE2',
      'PROVISIONAL',
      'PENDING',
      'TOTAL LEARNERS',
    ]);

    // One row per represented stream, NO overall TOTAL row
    expect(cbeOpts.body).toHaveLength(1);
    const row = cbeOpts.body[0];
    expect(row[0]).toBe('EAST'); // Stream
    expect(row[1]).toBe('1'); // EE1 (sj-1: avg 91 -> EE1)
    expect(row[2]).toBe('1'); // EE2 (sj-2: avg 79 -> EE2)
    expect(row[3]).toBe('0'); // ME1
    expect(row[4]).toBe('0'); // ME2
    expect(row[5]).toBe('0'); // AE1
    expect(row[6]).toBe('0'); // AE2
    expect(row[7]).toBe('0'); // BE1
    expect(row[8]).toBe('0'); // BE2
    expect(row[9]).toBe('0'); // Provisional
    expect(row[10]).toBe('0'); // Pending
    expect(row[11]).toBe('2'); // Total Learners (1 + 1 = 2)

    const hasOverallTotalRow = cbeOpts.body.some((r: any[]) => r[0] === 'TOTAL');
    expect(hasOverallTotalRow).toBe(false);
  });

  it('3. All Streams export groups multiple streams in established order (East -> West)', async () => {
    const students: Student[] = [
      { id: 'sw-1', admission_number: 'W001', full_name: 'West Learner', class_id: 'cls-j8-west', stream_id: 'cls-j8-west', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'se-1', admission_number: 'E001', full_name: 'East Learner', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'mw1', student_id: 'sw-1', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 70, out_of: 100, special_status: 'Normal' },
      { id: 'mw2', student_id: 'sw-1', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 70, out_of: 100, special_status: 'Normal' },
      { id: 'me1', student_id: 'se-1', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 95, out_of: 100, special_status: 'Normal' },
      { id: 'me2', student_id: 'se-1', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 95, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'all',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1');
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Established stream ordering: East (index 0) before West (index 1), followed by General Class aggregate
    expect(cbeOpts.body).toHaveLength(3);
    expect(cbeOpts.body[0][0]).toBe('EAST');
    expect(cbeOpts.body[0][11]).toBe('1');
    expect(cbeOpts.body[1][0]).toBe('WEST');
    expect(cbeOpts.body[1][11]).toBe('1');
    expect(['GRADE 8', 'GENERAL CLASS']).toContain(cbeOpts.body[2][0]);
    expect(cbeOpts.body[2][11]).toBe('2');
  });

  it('4. Single-stream export isolates to selected stream only', async () => {
    const students: Student[] = [
      { id: 'sw-1', admission_number: 'W001', full_name: 'West Learner', class_id: 'cls-j8-west', stream_id: 'cls-j8-west', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'se-1', admission_number: 'E001', full_name: 'East Learner', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'mw1', student_id: 'sw-1', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 70, out_of: 100, special_status: 'Normal' },
      { id: 'mw2', student_id: 'sw-1', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 70, out_of: 100, special_status: 'Normal' },
      { id: 'me1', student_id: 'se-1', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 95, out_of: 100, special_status: 'Normal' },
      { id: 'me2', student_id: 'se-1', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 95, out_of: 100, special_status: 'Normal' },
    ];

    // Select only East stream
    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'cls-j8-east',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1');
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Single-stream export must contain only the selected stream row
    expect(cbeOpts.body).toHaveLength(1);
    expect(cbeOpts.body[0][0]).toBe('EAST');
    expect(cbeOpts.body[0][11]).toBe('1');
  });

  it('5. Incomplete learners are correctly separated into PROVISIONAL and PENDING', async () => {
    const students: Student[] = [
      { id: 'sj-prov', admission_number: 'J010', full_name: 'Prov Learner', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'sj-pend', admission_number: 'J011', full_name: 'Pending Learner', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      // Only 1 subject assessed for sj-prov (incomplete, partial subjects -> PROVISIONAL)
      { id: 'm-prov', student_id: 'sj-prov', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 80, out_of: 100, special_status: 'Normal' },
      // 0 assessed subjects for sj-pend -> PENDING
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'all',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1');
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    expect(cbeOpts.body).toHaveLength(1);
    const row = cbeOpts.body[0];
    expect(row[9]).toBe('1'); // PROVISIONAL = 1
    expect(row[10]).toBe('1'); // PENDING = 1
    expect(row[11]).toBe('2'); // TOTAL LEARNERS = 2
  });

  it('6. Section placement: table renders with startY and measures lastAutoTable.finalY before notes', async () => {
    const students: Student[] = [
      { id: 'sp-1', admission_number: 'P001', full_name: 'Primary Learner', class_id: 'cls-p6-east', stream_id: 'cls-p6-east', grade: 'Grade 6', gender: 'F', active: true },
    ];

    const marks: Mark[] = [
      { id: 'mp1', student_id: 'sp-1', subject_id: 'sub-pmat', exam_id: 'ex-primary-1', marks: 85, out_of: 100, special_status: 'Normal' },
      { id: 'mp2', student_id: 'sp-1', subject_id: 'sub-psci', exam_id: 'ex-primary-1', marks: 80, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockPrimaryExam,
      selectedClassId: 'cls-p6-east',
      selectedStreamId: 'all',
      classes: mockPrimaryClasses,
      students,
      subjects: mockPrimarySubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE');
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Verify startY is provided and greater than 0
    expect(cbeOpts.startY).toBeGreaterThan(0);
    expect(cbeOpts.margin.bottom).toBe(12);

    // Verify raw page text contains the CBE headers, notes, and CLASS AVERAGE MARKS
    const page1 = capturedDoc.internal.pages[1];
    const pageText = Array.isArray(page1) ? page1.join('\n') : String(page1);

    expect(pageText).toContain('CLASS AVERAGE MARKS:');
    expect(pageText).toContain('Learner position is assigned using Total Marks');
  });

  it('7. Reconciliation failure halts PDF export cleanly without saving partial file', async () => {
    const students: Student[] = [
      { id: 's-dupe', admission_number: 'D001', full_name: 'Dupe Learner', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'm-dupe', student_id: 's-dupe', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 80, out_of: 100, special_status: 'Normal' },
    ];

    // Spy on cbeLevelCountsEngine to simulate reconciliation error during export
    const cbeEngine = await import('./cbeLevelCountsEngine');
    const spy = vi.spyOn(cbeEngine, 'calculateJuniorCbeLevelCounts').mockImplementationOnce(() => {
      throw new Error('Category counts reconciliation failed for stream "EAST": sum of categories !== totalLearners');
    });

    await expect(
      downloadMeritListPDF({
        school: mockSchool,
        exam: mockJuniorExam,
        selectedClassId: 'cls-j8-east',
        selectedStreamId: 'all',
        classes: mockJuniorClasses,
        students,
        subjects: mockJuniorSubjects,
        marks,
        grades: CBE_8_POINT_GRADES,
      })
    ).rejects.toThrow('Category counts reconciliation failed');

    // Verify savePdf was NOT called, preventing corrupt/partial PDF creation
    expect(savePdfCalled).toBe(false);

    spy.mockRestore();
  });

  it('8. Final summary cohesion: Subject Statistics table and CBE table render on the same page when space permits', async () => {
    const students: Student[] = [
      { id: 'sj-c1', admission_number: 'C001', full_name: 'Cohesion Learner 1', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'sj-c2', admission_number: 'C002', full_name: 'Cohesion Learner 2', class_id: 'cls-j8-east', stream_id: 'cls-j8-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'mc1', student_id: 'sj-c1', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 85, out_of: 100, special_status: 'Normal' },
      { id: 'mc2', student_id: 'sj-c1', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 80, out_of: 100, special_status: 'Normal' },
      { id: 'mc3', student_id: 'sj-c2', subject_id: 'sub-mat', exam_id: 'ex-junior-1', marks: 75, out_of: 100, special_status: 'Normal' },
      { id: 'mc4', student_id: 'sj-c2', subject_id: 'sub-eng', exam_id: 'ex-junior-1', marks: 70, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'all',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(savePdfCalled).toBe(true);
    expect(capturedDoc).not.toBeNull();

    // With only 2 learners, everything easily fits on Page 1
    const totalPages = capturedDoc.getNumberOfPages();
    expect(totalPages).toBe(1);

    // Verify both Subject Statistics ('LEARNING AREA') and CBE Table ('TOTAL LEARNERS') are on Page 1
    const page1 = capturedDoc.internal.pages[1];
    const pageText = Array.isArray(page1) ? page1.join('\n') : String(page1);

    expect(pageText).toContain('LEARNING AREA');
    expect(pageText).toContain('CLASS AVERAGE MARKS:');
    expect(pageText).toContain('TOTAL LEARNERS');
    expect(pageText).toContain('Learner position is assigned using Total Marks');

    // Verify autoTable calls: Subject Stats table and CBE Table were both executed on Page 1
    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const subjectStatsCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('LEARNING AREA');
    });
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1');
    });

    expect(subjectStatsCall).toBeDefined();
    expect(cbeTableCall).toBeDefined();

    // Verify CBE table startY is positioned after Subject Statistics table
    expect(cbeTableCall[1].startY).toBeGreaterThan(subjectStatsCall[1].startY);
  });
});
