import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  drawReportBackgroundWatermark,
  generateJuniorSchoolReportPDF,
  generateUpperPrimaryReportPDF,
  generateLowerPrimaryReportPDF,
  generatePrePrimaryReportPDF,
  createReportCardPDFDoc,
  PDFReportData,
} from '../services/pdfReportGenerator';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Grade,
  Mark,
} from '../types';

describe('School-Logo PDF Watermark Specification & Invariant Audit', () => {
  const sampleLogoDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const mockSchool: School = {
    id: 'sch-001',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Knowledge to Excel',
    logo_url: sampleLogoDataUrl,
    county: 'Nakuru',
    postal_code: 'P.O. Box 100',
    address: 'Muchorwe',
    email: 'info@muchorwe.ac.ke',
  };

  const mockStudent: Student = {
    id: 'std-001',
    admission_number: '115',
    full_name: 'Faith Wamuguru',
    first_name: 'Faith',
    last_name: 'Wamuguru',
    gender: 'F',
    grade: 'Grade 9',
    class_id: 'cls-g9',
    stream_id: 'cls-g9',
    active: true,
  };

  const mockExamJS: Examination = {
    id: 'ex-g9',
    exam_name: 'GRADE 9 KJSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    max_marks: 100,
    exam_type: 'End-Term',
    education_level: 'Junior School',
    status: 'Approved',
  };

  const mockExamUP: Examination = {
    id: 'ex-g6',
    exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    max_marks: 100,
    exam_type: 'End-Term',
    education_level: 'Upper Primary',
    status: 'Approved',
  };

  const mockExamLP: Examination = {
    id: 'ex-g3',
    exam_name: 'GRADE 3 ASSESSMENT TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    max_marks: 100,
    exam_type: 'End-Term',
    education_level: 'Lower Primary',
    status: 'Approved',
  };

  const mockExamPP: Examination = {
    id: 'ex-pp2',
    exam_name: 'PP2 ASSESSMENT TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    max_marks: 100,
    exam_type: 'End-Term',
    education_level: 'Pre-Primary',
    status: 'Approved',
  };

  const mockClasses: ClassStream[] = [
    { id: 'cls-g9', class_name: 'Grade 9', stream: 'BLUE' },
    { id: 'cls-g6', class_name: 'Grade 6', stream: 'BLUE' },
    { id: 'cls-g3', class_name: 'Grade 3', stream: 'BLUE' },
    { id: 'cls-pp2', class_name: 'PP2', stream: 'BLUE' },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sb-eng', subject_name: 'English', subject_code: 'ENG', category: 'Core' },
    { id: 'sb-kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core' },
    { id: 'sb-mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core' },
  ];

  const mockGrades: Grade[] = [
    { id: 'gr-1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 8, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'gr-2', grade_code: 'ME1', performance_level: 'ME', minimum_score: 58, maximum_score: 74, points: 6, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
  ];

  const mockMarks: Mark[] = [
    { id: 'm-1', student_id: 'std-001', subject_id: 'sb-eng', exam_id: 'ex-g9', marks: 94 },
    { id: 'm-2', student_id: 'std-001', subject_id: 'sb-kis', exam_id: 'ex-g9', marks: 87 },
  ];

  it('1. Calculates centered coordinates and preserves aspect ratio within 95mm box', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const addedImages: any[] = [];
    doc.addImage = ((dataUrl: any, format: any, x: any, y: any, w: any, h: any, alias: any) => {
      addedImages.push({ dataUrl, format, x, y, w, h, alias });
      return doc;
    }) as any;

    // Landscape image (width > height, e.g. 200 x 100)
    drawReportBackgroundWatermark(doc, {
      dataUrl: sampleLogoDataUrl,
      width: 200,
      height: 100,
      format: 'PNG',
    }, 210, 297);

    expect(addedImages).toHaveLength(1);
    expect(addedImages[0].w).toBe(95);
    expect(addedImages[0].h).toBe(47.5);
    // Centered horizontally: (210 - 95) / 2 = 57.5mm
    expect(addedImages[0].x).toBeCloseTo(57.5, 1);
    // Centered vertically: (297 - 47.5) / 2 = 124.75mm
    expect(addedImages[0].y).toBeCloseTo(124.75, 1);

    // Portrait image (height > width, e.g. 100 x 200)
    addedImages.length = 0;
    drawReportBackgroundWatermark(doc, {
      dataUrl: sampleLogoDataUrl,
      width: 100,
      height: 200,
      format: 'PNG',
    }, 210, 297);

    expect(addedImages).toHaveLength(1);
    expect(addedImages[0].h).toBe(95);
    expect(addedImages[0].w).toBe(47.5);
    expect(addedImages[0].x).toBeCloseTo((210 - 47.5) / 2, 1);
    expect(addedImages[0].y).toBeCloseTo((297 - 95) / 2, 1);
  });

  it('2. Sets faint opacity (~14% for B&W print/digital legibility) and restores graphics state reliably via try/finally', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const gStatesSet: any[] = [];
    let savedState = 0;
    let restoredState = 0;

    (doc as any).saveGraphicsState = () => { savedState++; };
    (doc as any).restoreGraphicsState = () => { restoredState++; };
    (doc as any).setGState = (g: any) => { gStatesSet.push(g); };
    (doc as any).GState = class MockGState {
      opacity: number;
      constructor(opts: any) { this.opacity = opts?.opacity; }
    };

    drawReportBackgroundWatermark(doc, {
      dataUrl: sampleLogoDataUrl,
      width: 100,
      height: 100,
      format: 'PNG',
    }, 210, 297);

    expect(savedState).toBe(1);
    expect(restoredState).toBe(1);
    // Calibrated watermark opacity set to 0.14
    expect(gStatesSet[0]?.opacity).toBe(0.14);
  });

  it('3. Safely handles missing, empty, or invalid logo without throwing or altering state', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    expect(() => drawReportBackgroundWatermark(doc, null)).not.toThrow();
    expect(() => drawReportBackgroundWatermark(doc, undefined as any)).not.toThrow();
    expect(() => drawReportBackgroundWatermark(doc, { dataUrl: '', width: 0, height: 0, format: 'PNG' })).not.toThrow();
  });

  it('4. Applies watermark in Junior School Report PDF before content', async () => {
    const imagesCalled: Array<{ alias?: string; y?: number }> = [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const origAddImage = doc.addImage.bind(doc);
    (doc as any).addImage = function (...args: any[]) {
      imagesCalled.push({ alias: args[6], y: args[3] });
      return origAddImage.apply(doc, args as any);
    };

    const pdfData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam: mockExamJS,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '2027-01-05',
    };

    await generateJuniorSchoolReportPDF(pdfData, doc);

    // Watermark alias 'school_report_watermark' is drawn first
    expect(imagesCalled.some((img) => img.alias === 'school_report_watermark')).toBe(true);
    // Header logo alias 'school_report_logo' is also drawn
    expect(imagesCalled.some((img) => img.alias === 'school_report_logo')).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('5. Applies watermark in Upper Primary Report PDF', async () => {
    const imagesCalled: string[] = [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const origAddImage = doc.addImage.bind(doc);
    (doc as any).addImage = function (...args: any[]) {
      if (args[6]) imagesCalled.push(args[6]);
      return origAddImage.apply(doc, args as any);
    };

    const pdfData: PDFReportData = {
      student: { ...mockStudent, grade: 'Grade 6', class_id: 'cls-g6', stream_id: 'cls-g6' },
      school: mockSchool,
      exam: mockExamUP,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '2027-01-05',
    };

    await generateUpperPrimaryReportPDF(pdfData, doc);
    expect(imagesCalled).toContain('school_report_watermark');
    expect(imagesCalled).toContain('school_report_logo');
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('6. Applies watermark in Lower Primary Report PDF', async () => {
    const imagesCalled: string[] = [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const origAddImage = doc.addImage.bind(doc);
    (doc as any).addImage = function (...args: any[]) {
      if (args[6]) imagesCalled.push(args[6]);
      return origAddImage.apply(doc, args as any);
    };

    const pdfData: PDFReportData = {
      student: { ...mockStudent, grade: 'Grade 3', class_id: 'cls-g3', stream_id: 'cls-g3' },
      school: mockSchool,
      exam: mockExamLP,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '2027-01-05',
    };

    await generateLowerPrimaryReportPDF(pdfData, doc);
    expect(imagesCalled).toContain('school_report_watermark');
    expect(imagesCalled).toContain('school_report_logo');
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('7. Applies watermark in Pre-Primary Report PDF', async () => {
    const imagesCalled: string[] = [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const origAddImage = doc.addImage.bind(doc);
    (doc as any).addImage = function (...args: any[]) {
      if (args[6]) imagesCalled.push(args[6]);
      return origAddImage.apply(doc, args as any);
    };

    const pdfData: PDFReportData = {
      student: { ...mockStudent, grade: 'PP2', class_id: 'cls-pp2', stream_id: 'cls-pp2' },
      school: mockSchool,
      exam: mockExamPP,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '2027-01-05',
    };

    await generatePrePrimaryReportPDF(pdfData, doc);
    expect(imagesCalled).toContain('school_report_watermark');
    expect(imagesCalled).toContain('school_report_logo');
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('8. In combined batch generation, exactly 1 watermark is drawn per learner page', async () => {
    const masterDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    let watermarkCount = 0;
    const origAddImage = masterDoc.addImage.bind(masterDoc);
    (masterDoc as any).addImage = function (...args: any[]) {
      if (args[6] === 'school_report_watermark') {
        watermarkCount++;
      }
      return origAddImage.apply(masterDoc, args as any);
    };

    for (let i = 0; i < 3; i++) {
      if (i > 0) masterDoc.addPage('a4', 'portrait');
      await createReportCardPDFDoc(
        {
          student: { ...mockStudent, id: `std-${i + 1}`, admission_number: `${100 + i}` },
          school: mockSchool,
          exam: mockExamJS,
          classes: mockClasses,
          subjects: mockSubjects,
          marks: mockMarks,
          grades: mockGrades,
          teachers: [],
          allStudents: [mockStudent],
          nextTermOpeningDate: '2027-01-05',
        },
        masterDoc
      );
    }

    expect(masterDoc.getNumberOfPages()).toBe(3);
    // Exactly 1 watermark per learner page (3 total)
    expect(watermarkCount).toBe(3);
  });

  it('9. Restores opacity to 1.0 in fallback branch if saveGraphicsState/restoreGraphicsState are not present', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const gStatesSet: any[] = [];

    (doc as any).setGState = (g: any) => { gStatesSet.push(g); };
    (doc as any).GState = class MockGState {
      opacity: number;
      constructor(opts: any) { this.opacity = opts?.opacity; }
    };
    // Deliberately no saveGraphicsState or restoreGraphicsState
    delete (doc as any).saveGraphicsState;
    delete (doc as any).restoreGraphicsState;

    drawReportBackgroundWatermark(doc, {
      dataUrl: sampleLogoDataUrl,
      width: 100,
      height: 100,
      format: 'PNG',
    }, 210, 297);

    // Initial opacity set to 0.14
    expect(gStatesSet[0]?.opacity).toBe(0.14);
    // Finally block resets opacity to 1.0 so subsequent text/tables are not faint
    expect(gStatesSet[1]?.opacity).toBe(1.0);
  });

  it('10. Header logo is preserved with full opacity, original asset, and 14mm dimension', async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const addedImages: any[] = [];
    const origAddImage = doc.addImage.bind(doc);
    (doc as any).addImage = function (...args: any[]) {
      addedImages.push({
        dataUrl: args[0],
        format: args[1],
        x: args[2],
        y: args[3],
        w: args[4],
        h: args[5],
        alias: args[6],
      });
      return origAddImage.apply(doc, args as any);
    };

    const pdfData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam: mockExamJS,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '2027-01-05',
    };

    await generateJuniorSchoolReportPDF(pdfData, doc);

    const watermarkImg = addedImages.find((img) => img.alias === 'school_report_watermark');
    const headerLogoImg = addedImages.find((img) => img.alias === 'school_report_logo');

    // Watermark uses 95mm maximum bounding box
    expect(watermarkImg).toBeDefined();
    expect(watermarkImg.w).toBe(95);
    expect(watermarkImg.h).toBe(95);

    // Header logo remains strictly 14mm x 14mm at the top
    expect(headerLogoImg).toBeDefined();
    expect(headerLogoImg.w).toBe(14);
    expect(headerLogoImg.h).toBe(14);
    expect(headerLogoImg.y).toBeLessThan(20);
    expect(headerLogoImg.dataUrl).toBe(mockSchool.logo_url);
  });
});

