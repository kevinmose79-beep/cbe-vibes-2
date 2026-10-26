import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { School, Examination, ClassStream, Subject, Student, Mark } from '../types';
import { downloadMeritListPDF } from './meritListExporter';
import {
  calculateJuniorCbeLevelCounts,
  calculatePrimaryCbeLevelCounts,
  buildJuniorGeneralClassRow,
  buildPrimaryGeneralClassRow,
  JuniorCbeLevelCountsRow,
  PrimaryCbeLevelCountsRow,
} from './cbeLevelCountsEngine';
import { CBE_8_POINT_GRADES, CBE_4_POINT_GRADES } from './analysisEngine';
import * as fileDownloader from '../utils/fileDownloader';
import autoTable from 'jspdf-autotable';

// Mock autoTable spy to inspect table parameters
vi.mock('jspdf-autotable', async () => {
  const actual = await vi.importActual<any>('jspdf-autotable');
  const mockAutoTable = vi.fn((doc: any, options: any) => {
    return actual.default(doc, options);
  });
  return {
    default: mockAutoTable,
  };
});

import fs from 'fs';
import path from 'path';

describe('Issue 8 — General Class in CBE Performance-Level Counts for All Streams Merit Lists', () => {
  let capturedDoc: any = null;
  let savePdfCalled = false;

  beforeEach(() => {
    capturedDoc = null;
    savePdfCalled = false;
    vi.clearAllMocks();
    vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any, fileName?: string) => {
      capturedDoc = doc;
      savePdfCalled = true;
      if (fileName) {
        try {
          const buffer = Buffer.from(doc.output('arraybuffer'));
          fs.writeFileSync(path.resolve(process.cwd(), fileName), buffer);
        } catch (e) {
          // Ignore if filesystem restricted
        }
      }
    });
  });

  const mockSchool: School = {
    id: 'sch-1',
    school_name: 'St. Teresa Academy',
    school_code: 'STA001',
    county: 'Nairobi',
    email: 'info@stteresa.ac.ke',
  };

  const mockJuniorExam: Examination = {
    id: 'ex-j8-term2',
    exam_name: 'Mid Term 2 Exam',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Junior School',
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  const mockPrimaryExam: Examination = {
    id: 'ex-p5-term2',
    exam_name: 'Mid Term 2 Exam',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Upper Primary',
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  const mockJuniorClasses: ClassStream[] = [
    { id: 'cls-j8-alpha', class_name: 'Grade 8', stream: 'Alpha', education_level: 'Junior School' },
    { id: 'cls-j8-north', class_name: 'Grade 8', stream: 'North', education_level: 'Junior School' },
    { id: 'cls-j8-south', class_name: 'Grade 8', stream: 'South', education_level: 'Junior School' },
  ];

  const mockPrimaryClasses: ClassStream[] = [
    { id: 'cls-p5-east', class_name: 'Grade 5', stream: 'East', education_level: 'Upper Primary' },
    { id: 'cls-p5-west', class_name: 'Grade 5', stream: 'West', education_level: 'Upper Primary' },
  ];

  const mockJuniorSubjects: Subject[] = [
    { id: 'sub-mat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Junior School', category: 'Core' },
    { id: 'sub-eng', subject_name: 'English', subject_code: 'ENG', education_level: 'Junior School', category: 'Core' },
  ];

  const mockPrimarySubjects: Subject[] = [
    { id: 'sub-pmat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub-peng', subject_name: 'English', subject_code: 'ENG', education_level: 'Upper Primary', category: 'Core' },
  ];

  it('1. Junior School All Streams export includes each stream and exactly one General Class row with 8-scale sublevels', async () => {
    // 3 streams: Alpha, North, South
    const students: Student[] = [
      // Alpha: 1 EE1, 1 ME1
      { id: 'sa-1', admission_number: 'A001', full_name: 'Alpha One', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'sa-2', admission_number: 'A002', full_name: 'Alpha Two', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'F' },
      // North: 1 EE2, 1 AE1
      { id: 'sn-1', admission_number: 'N001', full_name: 'North One', class_id: 'cls-j8-north', stream_id: 'cls-j8-north', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'sn-2', admission_number: 'N002', full_name: 'North Two', class_id: 'cls-j8-north', stream_id: 'cls-j8-north', grade: 'Grade 8', active: true, gender: 'F' },
      // South: 1 BE1, 1 Provisional (partial marks), 1 Pending (0 marks)
      { id: 'ss-1', admission_number: 'S001', full_name: 'South One', class_id: 'cls-j8-south', stream_id: 'cls-j8-south', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'ss-2', admission_number: 'S002', full_name: 'South Two (Prov)', class_id: 'cls-j8-south', stream_id: 'cls-j8-south', grade: 'Grade 8', active: true, gender: 'F' },
      { id: 'ss-3', admission_number: 'S003', full_name: 'South Three (Pend)', class_id: 'cls-j8-south', stream_id: 'cls-j8-south', grade: 'Grade 8', active: true, gender: 'M' },
    ];

    const marks: Mark[] = [
      // sa-1: avg 92 -> EE1
      { id: 'm1', student_id: 'sa-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'sa-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      // sa-2: avg 65 -> ME1
      { id: 'm3', student_id: 'sa-2', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm4', student_id: 'sa-2', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 65, out_of: 100, special_status: 'Normal' },
      // sn-1: avg 82 -> EE2
      { id: 'm5', student_id: 'sn-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 82, out_of: 100, special_status: 'Normal' },
      { id: 'm6', student_id: 'sn-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 82, out_of: 100, special_status: 'Normal' },
      // sn-2: avg 35 -> AE1 (range 31-40)
      { id: 'm7', student_id: 'sn-2', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 35, out_of: 100, special_status: 'Normal' },
      { id: 'm8', student_id: 'sn-2', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 35, out_of: 100, special_status: 'Normal' },
      // ss-1: avg 15 -> BE1 (range 11-20)
      { id: 'm9', student_id: 'ss-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 15, out_of: 100, special_status: 'Normal' },
      { id: 'm10', student_id: 'ss-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 15, out_of: 100, special_status: 'Normal' },
      // ss-2: only math assessed -> PROVISIONAL
      { id: 'm11', student_id: 'ss-2', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 75, out_of: 100, special_status: 'Normal' },
      // ss-3: no marks -> PENDING
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-alpha',
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
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1');
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Headers: STREAM, EE1, EE2, ME1, ME2, AE1, AE2, BE1, BE2, PROVISIONAL, PENDING, TOTAL LEARNERS
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

    // Exactly 4 rows: North, South, Alpha, and GRADE 8
    expect(cbeOpts.body).toHaveLength(4);

    // Row 0: NORTH (ordered by getStreamOrderIndex)
    expect(cbeOpts.body[0][0]).toBe('NORTH');
    expect(cbeOpts.body[0][2]).toBe('1'); // EE2
    expect(cbeOpts.body[0][5]).toBe('1'); // AE1
    expect(cbeOpts.body[0][11]).toBe('2'); // Total Learners

    // Row 1: SOUTH
    expect(cbeOpts.body[1][0]).toBe('SOUTH');
    expect(cbeOpts.body[1][7]).toBe('1'); // BE1
    expect(cbeOpts.body[1][9]).toBe('1'); // Provisional
    expect(cbeOpts.body[1][10]).toBe('1'); // Pending
    expect(cbeOpts.body[1][11]).toBe('3'); // Total Learners

    // Row 2: ALPHA
    expect(cbeOpts.body[2][0]).toBe('ALPHA');
    expect(cbeOpts.body[2][1]).toBe('1'); // EE1
    expect(cbeOpts.body[2][3]).toBe('1'); // ME1
    expect(cbeOpts.body[2][11]).toBe('2'); // Total Learners

    // Row 3: GRADE 8 (aggregate of North + South + Alpha)
    const genClassRow = cbeOpts.body[3];
    expect(genClassRow[0]).toBe('GRADE 8');
    expect(genClassRow[1]).toBe('1'); // EE1 (1 from Alpha)
    expect(genClassRow[2]).toBe('1'); // EE2 (1 from North)
    expect(genClassRow[3]).toBe('1'); // ME1 (1 from Alpha)
    expect(genClassRow[4]).toBe('0'); // ME2
    expect(genClassRow[5]).toBe('1'); // AE1 (1 from North)
    expect(genClassRow[6]).toBe('0'); // AE2
    expect(genClassRow[7]).toBe('1'); // BE1 (1 from South)
    expect(genClassRow[8]).toBe('0'); // BE2
    expect(genClassRow[9]).toBe('1'); // Provisional (1 from South)
    expect(genClassRow[10]).toBe('1'); // Pending (1 from South)
    expect(genClassRow[11]).toBe('7'); // Total: 2 + 3 + 2 = 7
  });

  it('2. Primary School All Streams export includes each stream and exactly one Grade aggregate row with 4-scale levels', async () => {
    // 2 streams: East, West
    const students: Student[] = [
      // East: 1 EE, 1 ME
      { id: 'pe-1', admission_number: 'E001', full_name: 'East One', class_id: 'cls-p5-east', stream_id: 'cls-p5-east', grade: 'Grade 5', active: true, gender: 'M' },
      { id: 'pe-2', admission_number: 'E002', full_name: 'East Two', class_id: 'cls-p5-east', stream_id: 'cls-p5-east', grade: 'Grade 5', active: true, gender: 'F' },
      // West: 1 AE, 1 BE, 1 Provisional
      { id: 'pw-1', admission_number: 'W001', full_name: 'West One', class_id: 'cls-p5-west', stream_id: 'cls-p5-west', grade: 'Grade 5', active: true, gender: 'M' },
      { id: 'pw-2', admission_number: 'W002', full_name: 'West Two', class_id: 'cls-p5-west', stream_id: 'cls-p5-west', grade: 'Grade 5', active: true, gender: 'F' },
      { id: 'pw-3', admission_number: 'W003', full_name: 'West Three (Prov)', class_id: 'cls-p5-west', stream_id: 'cls-p5-west', grade: 'Grade 5', active: true, gender: 'M' },
    ];

    const marks: Mark[] = [
      // pe-1: avg 85 -> EE
      { id: 'mp1', student_id: 'pe-1', subject_id: 'sub-pmat', exam_id: 'ex-p5-term2', marks: 85, out_of: 100, special_status: 'Normal' },
      { id: 'mp2', student_id: 'pe-1', subject_id: 'sub-peng', exam_id: 'ex-p5-term2', marks: 85, out_of: 100, special_status: 'Normal' },
      // pe-2: avg 65 -> ME
      { id: 'mp3', student_id: 'pe-2', subject_id: 'sub-pmat', exam_id: 'ex-p5-term2', marks: 65, out_of: 100, special_status: 'Normal' },
      { id: 'mp4', student_id: 'pe-2', subject_id: 'sub-peng', exam_id: 'ex-p5-term2', marks: 65, out_of: 100, special_status: 'Normal' },
      // pw-1: avg 40 -> AE (26-50)
      { id: 'mp5', student_id: 'pw-1', subject_id: 'sub-pmat', exam_id: 'ex-p5-term2', marks: 40, out_of: 100, special_status: 'Normal' },
      { id: 'mp6', student_id: 'pw-1', subject_id: 'sub-peng', exam_id: 'ex-p5-term2', marks: 40, out_of: 100, special_status: 'Normal' },
      // pw-2: avg 20 -> BE (0-25)
      { id: 'mp7', student_id: 'pw-2', subject_id: 'sub-pmat', exam_id: 'ex-p5-term2', marks: 20, out_of: 100, special_status: 'Normal' },
      { id: 'mp8', student_id: 'pw-2', subject_id: 'sub-peng', exam_id: 'ex-p5-term2', marks: 20, out_of: 100, special_status: 'Normal' },
      // pw-3: only 1 subject assessed -> PROVISIONAL
      { id: 'mp9', student_id: 'pw-3', subject_id: 'sub-pmat', exam_id: 'ex-p5-term2', marks: 70, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockPrimaryExam,
      selectedClassId: 'cls-p5-east',
      selectedStreamId: 'all',
      classes: mockPrimaryClasses,
      students,
      subjects: mockPrimarySubjects,
      marks,
      grades: CBE_4_POINT_GRADES,
    });

    expect(savePdfCalled).toBe(true);

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE') && !opts.head[0].includes('EE1');
    });

    expect(cbeTableCall).toBeDefined();
    const cbeOpts = cbeTableCall[1];

    // Primary Headers: STREAM, EE, ME, AE, BE, PROVISIONAL, PENDING, TOTAL LEARNERS
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

    // Exactly 3 rows: East, West, and GRADE 5
    expect(cbeOpts.body).toHaveLength(3);

    // Row 0: EAST
    expect(cbeOpts.body[0][0]).toBe('EAST');
    expect(cbeOpts.body[0][1]).toBe('1'); // EE
    expect(cbeOpts.body[0][2]).toBe('1'); // ME
    expect(cbeOpts.body[0][7]).toBe('2'); // Total Learners

    // Row 1: WEST
    expect(cbeOpts.body[1][0]).toBe('WEST');
    expect(cbeOpts.body[1][3]).toBe('1'); // AE
    expect(cbeOpts.body[1][4]).toBe('1'); // BE
    expect(cbeOpts.body[1][5]).toBe('1'); // Provisional
    expect(cbeOpts.body[1][7]).toBe('3'); // Total Learners

    // Row 2: GRADE 5 (aggregate of East + West)
    const genClassRow = cbeOpts.body[2];
    expect(genClassRow[0]).toBe('GRADE 5');
    expect(genClassRow[1]).toBe('1'); // EE (1 from East)
    expect(genClassRow[2]).toBe('1'); // ME (1 from East)
    expect(genClassRow[3]).toBe('1'); // AE (1 from West)
    expect(genClassRow[4]).toBe('1'); // BE (1 from West)
    expect(genClassRow[5]).toBe('1'); // Provisional (1 from West)
    expect(genClassRow[6]).toBe('0'); // Pending
    expect(genClassRow[7]).toBe('5'); // Total: 2 + 3 = 5
  });

  it('3. Single-stream Junior School export does NOT append General Class row', async () => {
    const students: Student[] = [
      { id: 'sa-1', admission_number: 'A001', full_name: 'Alpha One', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'sn-1', admission_number: 'N001', full_name: 'North One', class_id: 'cls-j8-north', stream_id: 'cls-j8-north', grade: 'Grade 8', active: true, gender: 'F' },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'sa-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'sa-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'm3', student_id: 'sn-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 82, out_of: 100, special_status: 'Normal' },
      { id: 'm4', student_id: 'sn-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 82, out_of: 100, special_status: 'Normal' },
    ];

    // Filter strictly to Alpha stream
    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-alpha',
      selectedStreamId: 'cls-j8-alpha',
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

    // Must contain exactly 1 row (ALPHA) and no General Class row
    expect(cbeOpts.body).toHaveLength(1);
    expect(cbeOpts.body[0][0]).toBe('ALPHA');
    expect(cbeOpts.body[0][11]).toBe('1');
  });

  it('4. All Streams export with only 1 stream represented preserves single stream row without redundant General Class', async () => {
    // Only Alpha students exist in data
    const students: Student[] = [
      { id: 'sa-1', admission_number: 'A001', full_name: 'Alpha One', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'sa-2', admission_number: 'A002', full_name: 'Alpha Two', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'F' },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'sa-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'sa-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 92, out_of: 100, special_status: 'Normal' },
      { id: 'm3', student_id: 'sa-2', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 75, out_of: 100, special_status: 'Normal' },
      { id: 'm4', student_id: 'sa-2', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 75, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-alpha',
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

    // Single stream represented -> exactly 1 row (ALPHA)
    expect(cbeOpts.body).toHaveLength(1);
    expect(cbeOpts.body[0][0]).toBe('ALPHA');
  });

  it('5. buildJuniorGeneralClassRow and buildPrimaryGeneralClassRow calculate exact aggregates and mark isGeneralClass: true', () => {
    const juniorStreamRows: JuniorCbeLevelCountsRow[] = [
      { stream: 'Alpha', ee1: 2, ee2: 1, me1: 3, me2: 2, ae1: 1, ae2: 0, be1: 1, be2: 0, provisional: 1, pending: 0, totalLearners: 11 },
      { stream: 'Beta', ee1: 1, ee2: 2, me1: 1, me2: 1, ae1: 2, ae2: 1, be1: 0, be2: 1, provisional: 0, pending: 1, totalLearners: 10 },
    ];

    const juniorGen = buildJuniorGeneralClassRow(juniorStreamRows);
    expect(juniorGen.stream).toBe('General Class');
    expect(juniorGen.isGeneralClass).toBe(true);
    expect(juniorGen.ee1).toBe(3);
    expect(juniorGen.ee2).toBe(3);
    expect(juniorGen.me1).toBe(4);
    expect(juniorGen.me2).toBe(3);
    expect(juniorGen.ae1).toBe(3);
    expect(juniorGen.ae2).toBe(1);
    expect(juniorGen.be1).toBe(1);
    expect(juniorGen.be2).toBe(1);
    expect(juniorGen.provisional).toBe(1);
    expect(juniorGen.pending).toBe(1);
    expect(juniorGen.totalLearners).toBe(21);

    const juniorGrade8 = buildJuniorGeneralClassRow(juniorStreamRows, 'GRADE 8');
    expect(juniorGrade8.stream).toBe('GRADE 8');
    expect(juniorGrade8.isGeneralClass).toBe(true);
    expect(juniorGrade8.totalLearners).toBe(21);

    const primaryStreamRows: PrimaryCbeLevelCountsRow[] = [
      { stream: 'North', ee: 4, me: 5, ae: 2, be: 1, provisional: 1, pending: 0, totalLearners: 13 },
      { stream: 'South', ee: 3, me: 4, ae: 3, be: 2, provisional: 0, pending: 1, totalLearners: 13 },
    ];

    const primaryGen = buildPrimaryGeneralClassRow(primaryStreamRows);
    expect(primaryGen.stream).toBe('General Class');
    expect(primaryGen.isGeneralClass).toBe(true);
    expect(primaryGen.ee).toBe(7);
    expect(primaryGen.me).toBe(9);
    expect(primaryGen.ae).toBe(5);
    expect(primaryGen.be).toBe(3);
    expect(primaryGen.provisional).toBe(1);
    expect(primaryGen.pending).toBe(1);
    expect(primaryGen.totalLearners).toBe(26);

    const primaryGrade5 = buildPrimaryGeneralClassRow(primaryStreamRows, 'GRADE 5');
    expect(primaryGrade5.stream).toBe('GRADE 5');
    expect(primaryGrade5.isGeneralClass).toBe(true);
    expect(primaryGrade5.totalLearners).toBe(26);
  });

  it('6. Junior School 4-stream cohort covers all 8 CBE sublevels plus Provisional and Pending without double counting', async () => {
    const mockGrade7Exam: Examination = {
      id: 'ex-j7-term1',
      exam_name: 'Term 1 Exam',
      academic_year_id: 'ay2026',
      term: 'Term 1',
      status: 'Published',
      year: 2026,
      education_level: 'Junior School',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const mockGrade7Classes: ClassStream[] = [
      { id: 'cls-g7-blue', class_name: 'Grade 7', stream: 'Blue', education_level: 'Junior School' },
      { id: 'cls-g7-green', class_name: 'Grade 7', stream: 'Green', education_level: 'Junior School' },
      { id: 'cls-g7-red', class_name: 'Grade 7', stream: 'Red', education_level: 'Junior School' },
      { id: 'cls-g7-yellow', class_name: 'Grade 7', stream: 'Yellow', education_level: 'Junior School' },
    ];

    // 10 learners distributed across 4 streams covering all 8 sublevels + prov + pend
    // EE1: 95, EE2: 80, ME1: 65, ME2: 45, AE1: 35, AE2: 25, BE1: 15, BE2: 5
    const students: Student[] = [
      // Blue: EE1, EE2
      { id: 's-b1', admission_number: 'B01', full_name: 'Learner B1', class_id: 'cls-g7-blue', stream_id: 'cls-g7-blue', grade: 'Grade 7', active: true, gender: 'M' },
      { id: 's-b2', admission_number: 'B02', full_name: 'Learner B2', class_id: 'cls-g7-blue', stream_id: 'cls-g7-blue', grade: 'Grade 7', active: true, gender: 'F' },
      // Green: ME1, ME2
      { id: 's-g1', admission_number: 'G01', full_name: 'Learner G1', class_id: 'cls-g7-green', stream_id: 'cls-g7-green', grade: 'Grade 7', active: true, gender: 'M' },
      { id: 's-g2', admission_number: 'G02', full_name: 'Learner G2', class_id: 'cls-g7-green', stream_id: 'cls-g7-green', grade: 'Grade 7', active: true, gender: 'F' },
      // Red: AE1, AE2, Provisional
      { id: 's-r1', admission_number: 'R01', full_name: 'Learner R1', class_id: 'cls-g7-red', stream_id: 'cls-g7-red', grade: 'Grade 7', active: true, gender: 'M' },
      { id: 's-r2', admission_number: 'R02', full_name: 'Learner R2', class_id: 'cls-g7-red', stream_id: 'cls-g7-red', grade: 'Grade 7', active: true, gender: 'F' },
      { id: 's-r3', admission_number: 'R03', full_name: 'Learner R3 Prov', class_id: 'cls-g7-red', stream_id: 'cls-g7-red', grade: 'Grade 7', active: true, gender: 'M' },
      // Yellow: BE1, BE2, Pending
      { id: 's-y1', admission_number: 'Y01', full_name: 'Learner Y1', class_id: 'cls-g7-yellow', stream_id: 'cls-g7-yellow', grade: 'Grade 7', active: true, gender: 'F' },
      { id: 's-y2', admission_number: 'Y02', full_name: 'Learner Y2', class_id: 'cls-g7-yellow', stream_id: 'cls-g7-yellow', grade: 'Grade 7', active: true, gender: 'M' },
      { id: 's-y3', admission_number: 'Y03', full_name: 'Learner Y3 Pend', class_id: 'cls-g7-yellow', stream_id: 'cls-g7-yellow', grade: 'Grade 7', active: true, gender: 'F' },
    ];

    const marks: Mark[] = [
      // Blue
      { id: 'm-b1-1', student_id: 's-b1', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 95, out_of: 100, special_status: 'Normal' },
      { id: 'm-b1-2', student_id: 's-b1', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 95, out_of: 100, special_status: 'Normal' },
      { id: 'm-b2-1', student_id: 's-b2', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm-b2-2', student_id: 's-b2', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 80, out_of: 100, special_status: 'Normal' },
      // Green
      { id: 'm-g1-1', student_id: 's-g1', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm-g1-2', student_id: 's-g1', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm-g2-1', student_id: 's-g2', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 45, out_of: 100, special_status: 'Normal' },
      { id: 'm-g2-2', student_id: 's-g2', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 45, out_of: 100, special_status: 'Normal' },
      // Red
      { id: 'm-r1-1', student_id: 's-r1', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 35, out_of: 100, special_status: 'Normal' },
      { id: 'm-r1-2', student_id: 's-r1', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 35, out_of: 100, special_status: 'Normal' },
      { id: 'm-r2-1', student_id: 's-r2', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 25, out_of: 100, special_status: 'Normal' },
      { id: 'm-r2-2', student_id: 's-r2', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 25, out_of: 100, special_status: 'Normal' },
      { id: 'm-r3-1', student_id: 's-r3', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 70, out_of: 100, special_status: 'Normal' },
      // Yellow
      { id: 'm-y1-1', student_id: 's-y1', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 15, out_of: 100, special_status: 'Normal' },
      { id: 'm-y1-2', student_id: 's-y1', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 15, out_of: 100, special_status: 'Normal' },
      { id: 'm-y2-1', student_id: 's-y2', subject_id: 'sub-mat', exam_id: 'ex-j7-term1', marks: 5, out_of: 100, special_status: 'Normal' },
      { id: 'm-y2-2', student_id: 's-y2', subject_id: 'sub-eng', exam_id: 'ex-j7-term1', marks: 5, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockGrade7Exam,
      selectedClassId: 'cls-g7-blue',
      selectedStreamId: 'all',
      classes: mockGrade7Classes,
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

    // Total 5 rows: BLUE, GREEN, RED, YELLOW, and GRADE 7
    expect(cbeOpts.body).toHaveLength(5);

    // Stream ordering: Blue (0), Green (1), Red (2), Yellow (3) in PREFERRED_STREAMS
    expect(cbeOpts.body[0][0]).toBe('BLUE');
    expect(cbeOpts.body[1][0]).toBe('GREEN');
    expect(cbeOpts.body[2][0]).toBe('RED');
    expect(cbeOpts.body[3][0]).toBe('YELLOW');

    // Aggregate Row: GRADE 7
    const aggRow = cbeOpts.body[4];
    expect(aggRow[0]).toBe('GRADE 7');
    expect(aggRow[1]).toBe('1'); // EE1
    expect(aggRow[2]).toBe('1'); // EE2
    expect(aggRow[3]).toBe('1'); // ME1
    expect(aggRow[4]).toBe('1'); // ME2
    expect(aggRow[5]).toBe('1'); // AE1
    expect(aggRow[6]).toBe('1'); // AE2
    expect(aggRow[7]).toBe('1'); // BE1
    expect(aggRow[8]).toBe('1'); // BE2
    expect(aggRow[9]).toBe('1'); // PROVISIONAL
    expect(aggRow[10]).toBe('1'); // PENDING
    expect(aggRow[11]).toBe('10'); // Total learners = 10 exactly without double counting
  });

  it('7. Preserves Subject Summary Table rows (AVG. MARKS, AVG. POINTS, PERFORMANCE LEVEL) and repeated headers', async () => {
    const students: Student[] = [
      { id: 'sa-1', admission_number: 'A001', full_name: 'Alpha One', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'sn-1', admission_number: 'N001', full_name: 'North One', class_id: 'cls-j8-north', stream_id: 'cls-j8-north', grade: 'Grade 8', active: true, gender: 'F' },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'sa-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'sa-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm3', student_id: 'sn-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 60, out_of: 100, special_status: 'Normal' },
      { id: 'm4', student_id: 'sn-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 60, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-alpha',
      selectedStreamId: 'all',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    
    // Check Subject Summary table
    const summaryTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.body && opts.body.length === 3 && opts.body[0][0] === 'AVG. MARKS';
    });

    expect(summaryTableCall).toBeDefined();
    const summaryOpts = summaryTableCall[1];
    expect(summaryOpts.body[0][0]).toBe('AVG. MARKS');
    expect(summaryOpts.body[1][0]).toBe('AVG. POINTS');
    expect(summaryOpts.body[2][0]).toBe('PERFORMANCE LEVEL');

    // Check CBE table has showHead: 'everyPage' for multi-page safeguard
    const cbeTableCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1');
    });
    expect(cbeTableCall).toBeDefined();
    expect(cbeTableCall[1].showHead).toBe('everyPage');
  });

  it('8. Handles incomplete cohort data with pending learners and zero marks gracefully without crash', async () => {
    // 2 streams: Alpha (assessed learner), North (unassessed/pending learner)
    const students: Student[] = [
      { id: 'sa-1', admission_number: 'A001', full_name: 'Alpha One', class_id: 'cls-j8-alpha', stream_id: 'cls-j8-alpha', grade: 'Grade 8', active: true, gender: 'M' },
      { id: 'sn-1', admission_number: 'N001', full_name: 'North One', class_id: 'cls-j8-north', stream_id: 'cls-j8-north', grade: 'Grade 8', active: true, gender: 'F' },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'sa-1', subject_id: 'sub-mat', exam_id: 'ex-j8-term2', marks: 88, out_of: 100, special_status: 'Normal' },
      { id: 'm2', student_id: 'sa-1', subject_id: 'sub-eng', exam_id: 'ex-j8-term2', marks: 88, out_of: 100, special_status: 'Normal' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-alpha',
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
    // 3 rows: NORTH, ALPHA, GRADE 8
    expect(cbeOpts.body).toHaveLength(3);
    
    // North has 1 pending learner
    expect(cbeOpts.body[0][0]).toBe('NORTH');
    expect(cbeOpts.body[0][10]).toBe('1'); // Pending
    expect(cbeOpts.body[0][11]).toBe('1'); // Total

    // Alpha has 1 EE2 learner
    expect(cbeOpts.body[1][0]).toBe('ALPHA');
    expect(cbeOpts.body[1][2]).toBe('1'); // EE2
    expect(cbeOpts.body[1][11]).toBe('1'); // Total

    // Aggregate row: GRADE 8
    const aggRow = cbeOpts.body[2];
    expect(aggRow[0]).toBe('GRADE 8');
    expect(aggRow[2]).toBe('1'); // 1 EE2
    expect(aggRow[10]).toBe('1'); // 1 Pending
    expect(aggRow[11]).toBe('2'); // Total 2

    // Also verify export completes without crash when 0 marks exist in total
    await expect(downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-alpha',
      selectedStreamId: 'all',
      classes: mockJuniorClasses,
      students,
      subjects: mockJuniorSubjects,
      marks: [],
      grades: CBE_8_POINT_GRADES,
    })).resolves.not.toThrow();
  });
});
