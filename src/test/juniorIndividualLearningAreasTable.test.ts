import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { School, Examination, ClassStream, Subject, Teacher, Student, Mark } from '../types';
import { downloadMeritListPDF, getFullLearningAreaName } from '../services/meritListExporter';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';
import * as fileDownloader from '../utils/fileDownloader';
import autoTable from 'jspdf-autotable';

// Mock autoTable spy to capture table parameters and inspect doc calls
vi.mock('jspdf-autotable', async () => {
  const actual = await vi.importActual<any>('jspdf-autotable');
  const mockAutoTable = vi.fn((doc: any, options: any) => {
    // Maintain mock finalY to mimic jsPDF autoTable state
    doc.lastAutoTable = { finalY: (options.startY || 50) + (options.body ? options.body.length * 5 : 20) };
    return actual.default(doc, options);
  });
  return {
    default: mockAutoTable,
  };
});

describe('Junior School - INDIVIDUAL LEARNING AREAS PERFORMANCE LEVELS COUNT Table', () => {
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
    id: 'sch-01',
    school_name: 'St. Teresa Academy',
    school_code: 'STA001',
    county: 'Nairobi',
    email: 'info@st-teresa.edu',
  };

  const mockJuniorExam: Examination = {
    id: 'ex-junior-term2',
    exam_name: 'Term 2 End-Term Assessment',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Junior School',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockPrimaryExam: Examination = {
    id: 'ex-primary-term2',
    exam_name: 'Term 2 End-Term Assessment',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Upper Primary',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockJuniorClasses: ClassStream[] = [
    { id: 'cls-j8-east', class_name: 'Grade 8', stream: 'East', stream_id: 'str-east', education_level: 'Junior School' },
    { id: 'cls-j8-west', class_name: 'Grade 8', stream: 'West', stream_id: 'str-west', education_level: 'Junior School' },
  ];

  const mockJuniorSubjects: Subject[] = [
    { id: 'sub-mat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-eng', subject_name: 'English', subject_code: 'ENG', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-pts', subject_name: 'Pre-Technical Studies', subject_code: 'PRE-TECH', education_level: 'Junior School', category: 'Core' },
  ];

  it('1. Correctly resolves full learning-area names', () => {
    expect(getFullLearningAreaName({ subject_code: 'MAT', subject_name: 'Mathematics' })).toBe('Mathematics');
    expect(getFullLearningAreaName({ subject_code: 'ENG', subject_name: 'English' })).toBe('English');
    expect(getFullLearningAreaName({ subject_code: 'PRE-TECH', subject_name: 'Pre-Technical Studies' })).toBe('Pre-Technical Studies');
    expect(getFullLearningAreaName({ subject_code: 'CAS', subject_name: 'Creative Arts & Sports' })).toBe('Creative Arts and Sports');
    expect(getFullLearningAreaName({ subject_code: 'INT-SCI', subject_name: 'Integrated Science' })).toBe('Integrated Science');
    expect(getFullLearningAreaName({ subject_code: 'AGN', subject_name: 'Agriculture' })).toBe('Agriculture and Nutrition');
  });

  it('2. Junior School PDF exports INDIVIDUAL LEARNING AREAS table with exact 15 headers in exact order', async () => {
    const students: Student[] = [
      { id: 'std-1', admission_number: 'J001', full_name: 'Learner Alpha', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'std-2', admission_number: 'J002', full_name: 'Learner Beta', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'M', active: true },
      { id: 'std-3', admission_number: 'J003', full_name: 'Learner Gamma', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'std-4', admission_number: 'J004', full_name: 'Learner Delta', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'M', active: true },
    ];

    // std-1: Math 92 (EE1), Eng 80 (EE2), PTS 65 (ME1)
    // std-2: Math 70 (ME1), Eng X, PTS 45 (ME2)
    // std-3: Math Y (Absent), Eng 35 (AE1), PTS blank (unentered)
    // std-4: Math 15 (BE1), Eng 5 (BE2), PTS blank (unentered)
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std-1', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'std-1', subject_id: 'sub-eng', exam_id: 'ex-junior-term2', marks: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm3', student_id: 'std-1', subject_id: 'sub-pts', exam_id: 'ex-junior-term2', marks: 65, out_of: 100, special_status: 'Normal' },

      { id: 'm4', student_id: 'std-2', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: 70, out_of: 100, special_status: 'Normal' },
      { id: 'm5', student_id: 'std-2', subject_id: 'sub-eng', exam_id: 'ex-junior-term2', marks: null, out_of: 100, special_status: 'X' },
      { id: 'm6', student_id: 'std-2', subject_id: 'sub-pts', exam_id: 'ex-junior-term2', marks: 45, out_of: 100, special_status: 'Normal' },

      { id: 'm7', student_id: 'std-3', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: null, out_of: 100, special_status: 'Y', irregularity_reason: 'Medical' },
      { id: 'm8', student_id: 'std-3', subject_id: 'sub-eng', exam_id: 'ex-junior-term2', marks: 35, out_of: 100, special_status: 'Normal' },

      { id: 'm9', student_id: 'std-4', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: 15, out_of: 100, special_status: 'Normal' },
      { id: 'm10', student_id: 'std-4', subject_id: 'sub-eng', exam_id: 'ex-junior-term2', marks: 5, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'str-east',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(savePdfCalled).toBe(true);

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const learningAreaTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return (
        opts &&
        opts.head &&
        opts.head[0] &&
        opts.head[0].includes('Learning Area') &&
        opts.head[0].includes('Entries') &&
        opts.head[0].includes('Subject Performance Level')
      );
    });

    expect(learningAreaTableCall).toBeDefined();
    const opts = learningAreaTableCall[1];

    // Non-negotiable Requirement: Exact 15 columns in exact order
    expect(opts.head[0]).toEqual([
      'Learning Area',
      'EE1',
      'EE2',
      'ME1',
      'ME2',
      'AE1',
      'AE2',
      'BE1',
      'BE2',
      'X',
      'Y',
      'Entries',
      'Average Marks',
      'Average Points',
      'Subject Performance Level',
    ]);

    // Check rows in body (English, Mathematics, Pre-Technical Studies)
    expect(opts.body).toHaveLength(3);

    // Verify row 0: English (orderMap: ENG is 1)
    const engRow = opts.body.find((r: string[]) => r[0] === 'English');
    expect(engRow).toBeDefined();
    // English marks:
    // std-1: 80 -> EE2 (1)
    // std-2: X (1)
    // std-3: 35 -> AE1 (1)
    // std-4: 5 -> BE2 (1)
    // EE1: 0, EE2: 1, ME1: 0, ME2: 0, AE1: 1, AE2: 0, BE1: 0, BE2: 1, X: 1, Y: 0, Entries: 4
    expect(engRow[1]).toBe('0'); // EE1
    expect(engRow[2]).toBe('1'); // EE2
    expect(engRow[3]).toBe('0'); // ME1
    expect(engRow[4]).toBe('0'); // ME2
    expect(engRow[5]).toBe('1'); // AE1
    expect(engRow[6]).toBe('0'); // AE2
    expect(engRow[7]).toBe('0'); // BE1
    expect(engRow[8]).toBe('1'); // BE2
    expect(engRow[9]).toBe('1'); // X (std-2)
    expect(engRow[10]).toBe('0'); // Y
    expect(engRow[11]).toBe('4'); // Entries = 4 eligible learners
    // Average marks across assessed (std-1: 80, std-3: 35, std-4: 5) = (80 + 35 + 5)/3 = 40.00
    expect(engRow[12]).toBe('40.00');
    // Average points: std-1 (7), std-3 (4), std-4 (1) = 12 / 3 = 4.00
    expect(engRow[13]).toBe('4.00');
    // 40.00% -> AE1
    expect(engRow[14]).toBe('AE1');

    // Verify Mathematics row:
    // std-1: 92 (EE1)
    // std-2: 70 (ME1)
    // std-3: Y (Medical)
    // std-4: 15 (BE1)
    const mathRow = opts.body.find((r: string[]) => r[0] === 'Mathematics');
    expect(mathRow).toBeDefined();
    expect(mathRow[1]).toBe('1'); // EE1 (std-1)
    expect(mathRow[2]).toBe('0'); // EE2
    expect(mathRow[3]).toBe('1'); // ME1 (std-2)
    expect(mathRow[4]).toBe('0'); // ME2
    expect(mathRow[5]).toBe('0'); // AE1
    expect(mathRow[6]).toBe('0'); // AE2
    expect(mathRow[7]).toBe('1'); // BE1 (std-4)
    expect(mathRow[8]).toBe('0'); // BE2
    expect(mathRow[9]).toBe('0'); // X
    expect(mathRow[10]).toBe('1'); // Y (std-3)
    expect(mathRow[11]).toBe('4'); // Entries = 4 eligible learners
    // Average marks across assessed (std-1: 92, std-2: 70, std-4: 15) = 177 / 3 = 59.00
    expect(mathRow[12]).toBe('59.00');
    // Points: 8 + 6 + 2 = 16 / 3 = 5.33
    expect(mathRow[13]).toBe('5.33');
    // 59.00% -> ME1
    expect(mathRow[14]).toBe('ME1');

    // Verify Pre-Technical Studies row:
    // std-1: 65 (ME1)
    // std-2: 45 (ME2)
    // std-3: unentered/blank
    // std-4: unentered/blank
    const ptsRow = opts.body.find((r: string[]) => r[0] === 'Pre-Technical Studies');
    expect(ptsRow).toBeDefined();
    expect(ptsRow[1]).toBe('0'); // EE1
    expect(ptsRow[2]).toBe('0'); // EE2
    expect(ptsRow[3]).toBe('1'); // ME1
    expect(ptsRow[4]).toBe('1'); // ME2
    expect(ptsRow[5]).toBe('0'); // AE1
    expect(ptsRow[6]).toBe('0'); // AE2
    expect(ptsRow[7]).toBe('0'); // BE1
    expect(ptsRow[8]).toBe('0'); // BE2
    expect(ptsRow[9]).toBe('0'); // X (blank is NOT counted in X)
    expect(ptsRow[10]).toBe('0'); // Y (blank is NOT counted in Y)
    expect(ptsRow[11]).toBe('4'); // Entries = 4 (all eligible learners counted in Entries)
    // Average marks across assessed (std-1: 65, std-2: 45) = 110 / 2 = 55.00
    expect(ptsRow[12]).toBe('55.00');
    // Average points: std-1 (6), std-2 (5) = 11 / 2 = 5.50
    expect(ptsRow[13]).toBe('5.50');
    // 55.00% -> ME2
    expect(ptsRow[14]).toBe('ME2');
  });

  it('3. Learning area with 0 assessed learners displays "-" for averages and performance level', async () => {
    const students: Student[] = [
      { id: 'std-1', admission_number: 'J001', full_name: 'Learner Alpha', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'F', active: true },
    ];

    // Only English has marks, Math and PTS have zero marks (blank)
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std-1', subject_id: 'sub-eng', exam_id: 'ex-junior-term2', marks: 80, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'str-east',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const learningAreaTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('Learning Area') && opts.head[0].includes('Entries');
    });

    expect(learningAreaTableCall).toBeDefined();
    const opts = learningAreaTableCall[1];

    const mathRow = opts.body.find((r: string[]) => r[0] === 'Mathematics');
    expect(mathRow).toBeDefined();
    expect(mathRow[11]).toBe('1'); // Entries
    expect(mathRow[12]).toBe('-'); // Average Marks
    expect(mathRow[13]).toBe('-'); // Average Points
    expect(mathRow[14]).toBe('-'); // Subject Performance Level
  });

  it('4. All Streams export aggregates learners across all streams into Entries and level counts', async () => {
    const students: Student[] = [
      { id: 'std-e1', admission_number: 'J001', full_name: 'East Learner 1', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'F', active: true },
      { id: 'std-w1', admission_number: 'J002', full_name: 'West Learner 1', class_id: 'cls-j8-west', stream_id: 'str-west', grade: 'Grade 8', gender: 'M', active: true },
    ];

    const marks: Mark[] = [
      { id: 'me1', student_id: 'std-e1', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: 95, out_of: 100, special_status: 'Normal' },
      { id: 'mw1', student_id: 'std-w1', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: 77, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'all', // All Streams
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const learningAreaTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('Learning Area') && opts.head[0].includes('Entries');
    });

    expect(learningAreaTableCall).toBeDefined();
    const opts = learningAreaTableCall[1];

    const mathRow = opts.body.find((r: string[]) => r[0] === 'Mathematics');
    expect(mathRow).toBeDefined();
    expect(mathRow[1]).toBe('1'); // EE1 (std-e1: 95)
    expect(mathRow[2]).toBe('1'); // EE2 (std-w1: 77)
    expect(mathRow[11]).toBe('2'); // Entries = 2 (both streams)
    expect(mathRow[12]).toBe('86.00'); // (95 + 77) / 2 = 86.00
    expect(mathRow[13]).toBe('7.50'); // (8 + 7) / 2 = 7.50
    expect(mathRow[14]).toBe('EE2');
  });

  it('5. Primary School export does NOT render the INDIVIDUAL LEARNING AREAS table', async () => {
    const students: Student[] = [
      { id: 'sp-1', admission_number: 'P001', full_name: 'Primary Learner', class_id: 'cls-p6', stream_id: 'cls-p6', grade: 'Grade 6', gender: 'F', active: true },
    ];
    const classes: ClassStream[] = [
      { id: 'cls-p6', class_name: 'Grade 6', stream: 'East', education_level: 'Upper Primary' },
    ];
    const subjects: Subject[] = [
      { id: 'sb-pmat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Upper Primary', category: 'Core' },
    ];
    const marks: Mark[] = [
      { id: 'mp1', student_id: 'sp-1', subject_id: 'sb-pmat', exam_id: 'ex-primary-term2', marks: 80, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockPrimaryExam,
      selectedClassId: 'cls-p6',
      selectedStreamId: 'all',
      classes,
      students,
      subjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const learningAreaTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('Learning Area') && opts.head[0].includes('Entries');
    });

    // Must be undefined because Primary School export was untouched
    expect(learningAreaTableCall).toBeUndefined();
  });

  it('6. The table is rendered immediately after CBE table on the same page', async () => {
    const students: Student[] = [
      { id: 'std-1', admission_number: 'J001', full_name: 'Learner Alpha', class_id: 'cls-j8-east', stream_id: 'str-east', grade: 'Grade 8', gender: 'F', active: true },
    ];
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std-1', subject_id: 'sub-mat', exam_id: 'ex-junior-term2', marks: 88, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-east',
      selectedStreamId: 'str-east',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCallIndex = autoTableMock.mock.calls.findIndex((call) => {
      const opts = call[1];
      return opts?.head?.[0]?.includes('STREAM') && opts?.head?.[0]?.includes('TOTAL LEARNERS');
    });

    const indTableCallIndex = autoTableMock.mock.calls.findIndex((call) => {
      const opts = call[1];
      return opts?.head?.[0]?.includes('Learning Area') && opts?.head?.[0]?.includes('Subject Performance Level');
    });

    expect(cbeTableCallIndex).toBeGreaterThan(-1);
    expect(indTableCallIndex).toBeGreaterThan(cbeTableCallIndex);
    // Table is rendered immediately following the CBE summary table
    expect(indTableCallIndex).toBe(cbeTableCallIndex + 1);

    // Verify startY is sequentially positioned after the CBE summary table
    const cbeCall = autoTableMock.mock.calls[cbeTableCallIndex];
    const indCall = autoTableMock.mock.calls[indTableCallIndex];
    expect(indCall[1].startY).toBeGreaterThan(cbeCall[1].startY);
  });

  it('7. Verifies CBE PERFORMANCE LEVELS COUNTS title is left-aligned (align: "left" at marginX) in both Junior and Primary exports', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/services/meritListExporter.ts', 'utf-8');

    // Matches doc.text('CBE PERFORMANCE LEVELS COUNTS', marginX, summaryY, { align: 'left' });
    const matches = source.match(/doc\.text\(\s*['"]CBE PERFORMANCE LEVELS COUNTS['"],\s*marginX,\s*summaryY,\s*\{\s*align:\s*['"]left['"]\s*\}\s*\)/g);
    expect(matches).not.toBeNull();
    // Must be present in both Junior and Primary exports (at least 2 occurrences)
    expect(matches?.length).toBeGreaterThanOrEqual(2);

    // Confirm no centered occurrences remain for this title
    const centeredMatches = source.match(/doc\.text\(\s*['"]CBE PERFORMANCE LEVELS COUNTS['"],\s*[^,]+,\s*[^,]+,\s*\{\s*align:\s*['"]center['"]\s*\}\s*\)/g);
    expect(centeredMatches).toBeNull();
  });
});
