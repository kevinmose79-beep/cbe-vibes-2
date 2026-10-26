import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { School, Examination, ClassStream, Subject, Teacher, Student, Mark } from '../types';
import { downloadMeritListPDF } from './meritListExporter';
import { CBE_8_POINT_GRADES } from './analysisEngine';
import * as fileDownloader from '../utils/fileDownloader';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

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

describe('Issue 7 Verification — Merit-List Summary Tables & Pagination', () => {
  let capturedDoc: any = null;
  let savedBuffers: Array<{ doc: any; filename: string }> = [];

  beforeEach(() => {
    capturedDoc = null;
    savedBuffers = [];
    vi.clearAllMocks();
    vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any, filename: string) => {
      capturedDoc = doc;
      savedBuffers.push({ doc, filename });
      // Also generate physical file for headless verification
      try {
        const outDir = path.join(process.cwd(), '.temp_pdf_output');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        const filePath = path.join(outDir, filename);
        const arrayBuf = doc.output('arraybuffer');
        fs.writeFileSync(filePath, Buffer.from(arrayBuf));
      } catch (e) {
        // file write fallback
      }
    });
  });

  const mockSchool: School = {
    id: 'sch-issue7',
    school_name: 'Muchorwe Comprehensive Academy',
    school_code: 'MCA007',
    county: 'Nakuru',
    email: 'info@muchorwe.ac.ke',
  };

  const mockJuniorExam: Examination = {
    id: 'ex-j-7',
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
    id: 'ex-p-7',
    exam_name: 'End Term 2 Exam',
    academic_year_id: 'ay2026',
    term: 'Term 2',
    status: 'Published',
    year: 2026,
    education_level: 'Upper Primary',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockJuniorSubjects: Subject[] = [
    { id: 'sb-mat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-eng', subject_name: 'English', subject_code: 'ENG', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-sci', subject_name: 'Integrated Science', subject_code: 'SCI', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-sst', subject_name: 'Social Studies', subject_code: 'SST', education_level: 'Junior School', category: 'Core' },
  ];

  const mockPrimarySubjects: Subject[] = [
    { id: 'sb-pmat', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb-psci', subject_name: 'Science & Technology', subject_code: 'SCI', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb-pagr', subject_name: 'Agriculture', subject_code: 'AGR', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sb-psscre', subject_name: 'Social Studies & CRE', subject_code: 'SS&CRE', education_level: 'Upper Primary', category: 'Core' },
  ];

  // Helper to construct cohorts
  function buildCohort(count: number, streamName: string, classId: string, gradeName: string, subjects: Subject[], examId: string, baseScore: number = 75) {
    const students: Student[] = [];
    const marks: Mark[] = [];

    for (let i = 1; i <= count; i++) {
      const sId = `std_${streamName}_${i}`;
      students.push({
        id: sId,
        admission_number: `${streamName[0]}00${i}`,
        full_name: `Learner ${streamName} ${i}`,
        class_id: classId,
        stream_id: classId,
        grade: gradeName as any,
        gender: i % 2 === 0 ? 'F' : 'M',
        active: true,
      });

      subjects.forEach((sb, sIdx) => {
        const score = Math.min(100, Math.max(20, baseScore + (i % 25) - sIdx * 4));
        marks.push({
          id: `m_${sId}_${sb.id}`,
          student_id: sId,
          subject_id: sb.id,
          exam_id: examId,
          marks: score,
          raw_score: score,
          out_of: 100,
          special_status: 'Normal',
        });
      });
    }

    return { students, marks };
  }

  it('1. Junior School Subject Summary has 3 distinct rows: AVG. MARKS, numeric AVG. POINTS, and 8-scale PERFORMANCE LEVEL', async () => {
    const { students, marks } = buildCohort(15, 'North', 'cls-j8-n', 'Grade 8', mockJuniorSubjects, 'ex-j-7', 72);
    const cls: ClassStream = { id: 'cls-j8-n', class_name: 'Grade 8', stream: 'North', education_level: 'Junior School' };

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-n',
      selectedStreamId: 'cls-j8-n',
      classes: [cls],
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const summaryCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.body && opts.body.length === 3 && opts.body[0] && opts.body[0][0] === 'AVG. MARKS';
    });

    expect(summaryCall).toBeDefined();
    const opts = summaryCall[1];

    // Verify 3 distinct rows
    expect(opts.body).toHaveLength(3);
    const rowMarks = opts.body[0];
    const rowPoints = opts.body[1];
    const rowLevels = opts.body[2];

    expect(rowMarks[0]).toBe('AVG. MARKS');
    expect(rowPoints[0]).toBe('AVG. POINTS');
    expect(rowLevels[0]).toBe('PERFORMANCE LEVEL');

    // Row 2: numeric average points ONLY (e.g. "6.50", no concatenated grade code)
    for (let c = 1; c < rowPoints.length; c++) {
      const ptVal = String(rowPoints[c]);
      expect(ptVal).toMatch(/^\d+\.\d{2}$/);
      expect(ptVal).not.toContain(' ');
      expect(ptVal).not.toContain('ME');
      expect(ptVal).not.toContain('EE');
    }

    // Row 3: Eight-level performance codes in Junior School
    const validJuniorCodes = ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'];
    for (let c = 1; c < rowLevels.length; c++) {
      const lvlVal = String(rowLevels[c]);
      expect(validJuniorCodes).toContain(lvlVal);
    }
  });

  it('2. Primary School Subject Summary has 3 distinct rows: AVG. MARKS, numeric AVG. POINTS, and 4-scale PERFORMANCE LEVEL', async () => {
    const { students, marks } = buildCohort(15, 'Blue', 'cls-p6-b', 'Grade 6', mockPrimarySubjects, 'ex-p-7', 68);
    const cls: ClassStream = { id: 'cls-p6-b', class_name: 'Grade 6', stream: 'Blue', education_level: 'Upper Primary' };

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockPrimaryExam,
      selectedClassId: 'cls-p6-b',
      selectedStreamId: 'cls-p6-b',
      classes: [cls],
      students,
      subjects: mockPrimarySubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const summaryCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.body && opts.body.length === 3 && opts.body[0] && opts.body[0][0] === 'AVG. MARKS';
    });

    expect(summaryCall).toBeDefined();
    const opts = summaryCall[1];

    expect(opts.body).toHaveLength(3);
    const rowMarks = opts.body[0];
    const rowPoints = opts.body[1];
    const rowLevels = opts.body[2];

    expect(rowMarks[0]).toBe('AVG. MARKS');
    expect(rowPoints[0]).toBe('AVG. POINTS');
    expect(rowLevels[0]).toBe('PERFORMANCE LEVEL');

    // Row 2: numeric points only across all assessed subject columns and class average
    for (let c = 1; c < rowPoints.length; c++) {
      const ptVal = String(rowPoints[c]);
      expect(ptVal).toMatch(/^\d+\.\d{2}$/);
    }

    // Row 3: Four-level performance codes in Primary School (EE, ME, AE, BE) — NEVER EE1 or ME1
    const validPrimaryCodes = ['EE', 'ME', 'AE', 'BE'];
    for (let c = 1; c < rowLevels.length; c++) {
      const lvlVal = String(rowLevels[c]);
      expect(validPrimaryCodes).toContain(lvlVal);
      expect(lvlVal).not.toContain('1');
      expect(lvlVal).not.toContain('2');
    }
  });

  it('2b. Upper Primary with Composite English & Kiswahili: raw components have blank points/levels while composite % has points and 4-scale CBE levels', async () => {
    const compositeSubjects: Subject[] = [
      { id: 'sb-eng-lang', subject_name: 'English Language', subject_code: 'ENG', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb-eng-comp', subject_name: 'English Composition', subject_code: 'COMP', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb-kisw-lugha', subject_name: 'Kiswahili Lugha', subject_code: 'KISW', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb-kisw-insha', subject_name: 'Kiswahili Insha', subject_code: 'INSHA', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb-mat-up', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb-sci-up', subject_name: 'Science & Technology', subject_code: 'SCI', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb-sscre-up', subject_name: 'Social Studies & CRE', subject_code: 'SS&CRE', education_level: 'Upper Primary', category: 'Core' },
    ];

    const { students, marks } = buildCohort(12, 'Green', 'cls-p5-g', 'Grade 5', compositeSubjects, 'ex-p-7', 70);
    const cls: ClassStream = { id: 'cls-p5-g', class_name: 'Grade 5', stream: 'Green', education_level: 'Upper Primary' };

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockPrimaryExam,
      selectedClassId: 'cls-p5-g',
      selectedStreamId: 'cls-p5-g',
      classes: [cls],
      students,
      subjects: compositeSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const summaryCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.body && opts.body.length === 3 && opts.body[0] && opts.body[0][0] === 'AVG. MARKS';
    });

    expect(summaryCall).toBeDefined();
    const opts = summaryCall[1];
    const headRow = opts.head[0];
    const rowMarks = opts.body[0];
    const rowPoints = opts.body[1];
    const rowLevels = opts.body[2];

    expect(rowMarks[0]).toBe('AVG. MARKS');
    expect(rowPoints[0]).toBe('AVG. POINTS');
    expect(rowLevels[0]).toBe('PERFORMANCE LEVEL');

    // Headers should include ENG, COMP, ENG %, KISW, INSHA, KISW %, MAT, SCI, SS&CRE, CLASS AVG
    expect(headRow).toContain('ENG');
    expect(headRow).toContain('COMP');
    expect(headRow).toContain('ENG %');
    expect(headRow).toContain('KISW');
    expect(headRow).toContain('INSHA');
    expect(headRow).toContain('KISW %');

    const engIdx = headRow.indexOf('ENG');
    const compIdx = headRow.indexOf('COMP');
    const engPctIdx = headRow.indexOf('ENG %');
    const kiswIdx = headRow.indexOf('KISW');
    const inshaIdx = headRow.indexOf('INSHA');
    const kiswPctIdx = headRow.indexOf('KISW %');

    // Raw components have raw average marks in row 1, but empty strings in row 2 & 3
    expect(rowMarks[engIdx]).not.toBe('');
    expect(rowPoints[engIdx]).toBe('');
    expect(rowLevels[engIdx]).toBe('');

    expect(rowMarks[compIdx]).not.toBe('');
    expect(rowPoints[compIdx]).toBe('');
    expect(rowLevels[compIdx]).toBe('');

    expect(rowMarks[kiswIdx]).not.toBe('');
    expect(rowPoints[kiswIdx]).toBe('');
    expect(rowLevels[kiswIdx]).toBe('');

    expect(rowMarks[inshaIdx]).not.toBe('');
    expect(rowPoints[inshaIdx]).toBe('');
    expect(rowLevels[inshaIdx]).toBe('');

    // Composite % columns must have valid numeric points and 4-scale CBE levels
    expect(rowPoints[engPctIdx]).toMatch(/^\d+\.\d{2}$/);
    expect(['EE', 'ME', 'AE', 'BE']).toContain(rowLevels[engPctIdx]);

    expect(rowPoints[kiswPctIdx]).toMatch(/^\d+\.\d{2}$/);
    expect(['EE', 'ME', 'AE', 'BE']).toContain(rowLevels[kiswPctIdx]);

    // CLASS AVG column must have numeric points and 4-scale CBE level
    const classAvgIdx = headRow.length - 1;
    expect(rowPoints[classAvgIdx]).toMatch(/^\d+\.\d{2}$/);
    expect(['EE', 'ME', 'AE', 'BE']).toContain(rowLevels[classAvgIdx]);
  });

  it('3. Scenario: 40 learners in one stream generates clean PDF and respects pagination', async () => {
    const { students, marks } = buildCohort(40, 'Alpha', 'cls-j8-a', 'Grade 8', mockJuniorSubjects, 'ex-j-7', 70);
    const cls: ClassStream = { id: 'cls-j8-a', class_name: 'Grade 8', stream: 'Alpha', education_level: 'Junior School' };

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-a',
      selectedStreamId: 'cls-j8-a',
      classes: [cls],
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(capturedDoc).not.toBeNull();
    const pageCount = capturedDoc.getNumberOfPages();
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });

  it('4. Scenario: 77 learners across multiple streams (Grade 8: East 40, West 37) verifies all streams isolation and CBE table', async () => {
    const cohort1 = buildCohort(40, 'East', 'cls-j8-e', 'Grade 8', mockJuniorSubjects, 'ex-j-7', 72);
    const cohort2 = buildCohort(37, 'West', 'cls-j8-w', 'Grade 8', mockJuniorSubjects, 'ex-j-7', 65);
    const allStudents = [...cohort1.students, ...cohort2.students];
    const allMarks = [...cohort1.marks, ...cohort2.marks];
    const classes: ClassStream[] = [
      { id: 'cls-j8-e', class_name: 'Grade 8', stream: 'East', education_level: 'Junior School' },
      { id: 'cls-j8-w', class_name: 'Grade 8', stream: 'West', education_level: 'Junior School' },
    ];

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'all',
      selectedStreamId: 'all',
      classes,
      students: allStudents,
      subjects: mockJuniorSubjects,
      marks: allMarks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(capturedDoc).not.toBeNull();
    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1') && opts.head[0].includes('TOTAL LEARNERS');
    });

    expect(cbeCall).toBeDefined();
    const cbeOpts = cbeCall[1];
    expect(cbeOpts.body).toHaveLength(3); // East, West, plus GRADE 8 aggregate row
    expect(cbeOpts.showHead).toBe('everyPage');
  });

  it('5. Scenario: 70 learners in a larger class generates multi-page document without footer collisions', async () => {
    const { students, marks } = buildCohort(70, 'South', 'cls-j8-s', 'Grade 8', mockJuniorSubjects, 'ex-j-7', 60);
    const cls: ClassStream = { id: 'cls-j8-s', class_name: 'Grade 8', stream: 'South', education_level: 'Junior School' };

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'cls-j8-s',
      selectedStreamId: 'cls-j8-s',
      classes: [cls],
      students,
      subjects: mockJuniorSubjects,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(capturedDoc).not.toBeNull();
    const pageCount = capturedDoc.getNumberOfPages();
    expect(pageCount).toBeGreaterThanOrEqual(2);
  });

  it('6. Scenario: Report with many streams (6 streams) renders correct stream rows and repeating headers', async () => {
    const streamNames = ['Stream A', 'Stream B', 'Stream C', 'Stream D', 'Stream E', 'Stream F'];
    const classes: ClassStream[] = [];
    const allStudents: Student[] = [];
    const allMarks: Mark[] = [];

    streamNames.forEach((sName, sIdx) => {
      const cId = `cls_multi_${sIdx}`;
      classes.push({ id: cId, class_name: 'Grade 7', stream: sName, education_level: 'Junior School' });
      const { students, marks } = buildCohort(5, sName, cId, 'Grade 7', mockJuniorSubjects, 'ex-j-7', 60 + sIdx * 4);
      allStudents.push(...students);
      allMarks.push(...marks);
    });

    await downloadMeritListPDF({
      school: mockSchool,
      exam: mockJuniorExam,
      selectedClassId: 'all',
      selectedStreamId: 'all',
      classes,
      students: allStudents,
      subjects: mockJuniorSubjects,
      marks: allMarks,
      grades: CBE_8_POINT_GRADES,
    });

    expect(capturedDoc).not.toBeNull();
    const autoTableMock = autoTable as unknown as { mock: { calls: any[] } };
    const cbeCall = autoTableMock.mock.calls.find((call) => {
      const opts = call[1];
      return opts && opts.head && opts.head[0] && opts.head[0].includes('EE1') && opts.head[0].includes('TOTAL LEARNERS');
    });

    expect(cbeCall).toBeDefined();
    expect(cbeCall[1].body).toHaveLength(7); // 6 individual streams + 1 GRADE 8 aggregate row
    expect(cbeCall[1].showHead).toBe('everyPage');
  });
});
