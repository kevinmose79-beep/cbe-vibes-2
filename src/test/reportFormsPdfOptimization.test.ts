import { describe, it, expect, vi } from 'vitest';
import jsPDF from 'jspdf';
import {
  createReportCardPDFDoc,
  getBase64ImageFromUrl,
  PDFReportData,
} from '../services/pdfReportGenerator';
import {
  buildTerminalReportDoc,
  convertImageToMonochromeDataUrl,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';
import { Student, School, Examination, ClassStream, Subject, Grade, Mark } from '../types';

// Mock file downloader
vi.mock('../utils/fileDownloader', () => ({
  savePdf: vi.fn().mockResolvedValue(undefined),
  saveFile: vi.fn().mockResolvedValue(undefined),
}));

describe('Report Forms PDF Performance & Size Optimization Audit', () => {
  const dummySchool: School = {
    id: 'sch-1',
    school_name: 'MUCHORWE COMPREHENSIVE SCHOOL',
    county: 'Bomet',
    email: 'info@muchorwe.ac.ke',
    motto: 'Strive for Excellence',
    logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  };

  const dummyExam: Examination = {
    id: 'exam-1',
    exam_name: 'Mid Term 1 Examination',
    term: 'Term 1',
    year: 2026,
    education_level: 'Junior School',
    status: 'Open',
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  const dummyClass: ClassStream = {
    id: 'cls-1',
    class_name: 'Grade 7',
    stream: 'A',
    education_level: 'Junior School',
  };

  const dummySubjects: Subject[] = [
    { id: 'sub-1', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core' },
    { id: 'sub-2', subject_name: 'English', subject_code: 'ENG', category: 'Core' },
    { id: 'sub-3', subject_name: 'Kiswahili', subject_code: 'KISW', category: 'Core' },
  ];

  const dummyGrades: Grade[] = CBE_8_POINT_GRADES;

  const dummyStudents: Student[] = Array.from({ length: 15 }, (_, i) => ({
    id: `std-${i + 1}`,
    admission_number: `ADM00${i + 1}`,
    full_name: `Learner Name ${i + 1}`,
    first_name: 'Learner',
    last_name: `Name ${i + 1}`,
    grade: 'Grade 7',
    class_id: 'cls-1',
    gender: i % 2 === 0 ? 'M' : 'F',
    active: true,
  }));

  const dummyMarks: Mark[] = dummyStudents.flatMap((std) =>
    dummySubjects.map((sub, sIdx) => ({
      id: `mark-${std.id}-${sub.id}`,
      student_id: std.id,
      exam_id: dummyExam.id,
      subject_id: sub.id,
      score: 70 + (sIdx * 5),
    }))
  );

  it('TEST 1: getBase64ImageFromUrl caches result in-memory and returns immediately on repeat calls', async () => {
    const testUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const firstCall = await getBase64ImageFromUrl(testUrl);
    expect(firstCall).not.toBeNull();
    expect(firstCall?.dataUrl).toBeTruthy();

    const t0 = performance.now();
    const secondCall = await getBase64ImageFromUrl(testUrl);
    const duration = performance.now() - t0;

    expect(secondCall).toBe(firstCall); // Same reference from Map cache
    expect(duration).toBeLessThan(15); // Instant synchronous/microtask resolution
  });

  it('TEST 2: convertImageToMonochromeDataUrl caches result and avoids repeated conversions', async () => {
    const testUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const firstCall = await convertImageToMonochromeDataUrl(testUrl);
    expect(firstCall).not.toBeNull();

    const t0 = performance.now();
    const secondCall = await convertImageToMonochromeDataUrl(testUrl);
    const duration = performance.now() - t0;

    expect(secondCall).toBe(firstCall);
    expect(duration).toBeLessThan(15);
  });

  it('TEST 3: Batch Combined Report Cards PDF generates in KB instead of MB', async () => {
    const dataList: PDFReportData[] = dummyStudents.map((std) => ({
      student: std,
      school: dummySchool,
      exam: dummyExam,
      classes: [dummyClass],
      subjects: dummySubjects,
      marks: dummyMarks,
      grades: dummyGrades,
      allStudents: dummyStudents,
      nextTermOpeningDate: '2026-05-04',
    }));

    const masterDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < dataList.length; i++) {
      if (i > 0) masterDoc.addPage('a4', 'portrait');
      await createReportCardPDFDoc(dataList[i], masterDoc);
    }

    const outputBuffer = masterDoc.output('arraybuffer');
    const sizeInKb = outputBuffer.byteLength / 1024;

    // 15 pages of report cards should be well under 300 KB
    expect(sizeInKb).toBeLessThan(300);
    // Average per page should be under 20 KB
    expect(sizeInKb / dataList.length).toBeLessThan(20);
  });

  it('TEST 4: Batch Terminal Reports PDF generates in KB instead of MB', async () => {
    const reportsData: TerminalReportPDFData[] = dummyStudents.map((std) => ({
      student: std,
      school: dummySchool,
      classStream: dummyClass,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: [
        { id: dummyExam.id, name: dummyExam.exam_name, exam_name: dummyExam.exam_name, weightPercentage: 100 },
      ],
      subjects: dummySubjects,
      resultsBySubject: new Map(),
      grades: dummyGrades,
      teachers: [],
      classes: [dummyClass],
    }));

    const masterDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < reportsData.length; i++) {
      if (i > 0) masterDoc.addPage('a4', 'portrait');
      await buildTerminalReportDoc(reportsData[i], masterDoc);
    }

    const outputBuffer = masterDoc.output('arraybuffer');
    const sizeInKb = outputBuffer.byteLength / 1024;

    // 15 pages of terminal reports should be well under 300 KB
    expect(sizeInKb).toBeLessThan(300);
    expect(sizeInKb / reportsData.length).toBeLessThan(20);
  });

  it('TEST 5: Image alias in jsPDF prevents duplicating image streams across pages', () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    
    // Document with alias
    const docWithAlias = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < 20; i++) {
      if (i > 0) docWithAlias.addPage();
      docWithAlias.addImage(tinyPng, 'PNG', 10, 10, 15, 15, 'school_logo', 'FAST');
    }
    const bytesWithAlias = docWithAlias.output('arraybuffer').byteLength;

    // Document without alias
    const docNoAlias = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < 20; i++) {
      if (i > 0) docNoAlias.addPage();
      docNoAlias.addImage(tinyPng, 'PNG', 10, 10, 15, 15);
    }
    const bytesNoAlias = docNoAlias.output('arraybuffer').byteLength;

    // Document with alias should be smaller or equal, and compact
    expect(bytesWithAlias).toBeLessThanOrEqual(bytesNoAlias);
    expect(bytesWithAlias / 1024).toBeLessThan(50);
  });
});
