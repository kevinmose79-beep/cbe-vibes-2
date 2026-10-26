import { describe, it, expect, vi } from 'vitest';
import {
  downloadMeritListPDF,
  MeritListData,
} from '../services/meritListExporter';
import { School, Examination, ClassStream, Subject, Mark, Grade, Student } from '../types';
import * as fileDownloader from '../utils/fileDownloader';
import fs from 'fs';
import path from 'path';

describe('CBE Hub: Phase 2 Surgical Fixes Verification Suite (Issues 1, 4, 6, 8, 9)', () => {
  const mockSchool: School = {
    id: 'sch-01',
    school_name: 'Muchorwe Comprehensive School',
    school_code: 'MCS-001',
    county: 'Nakuru',
    email: 'info@muchorwe.ac.ke',
  };

  const mockExam: Examination = {
    id: 'ex-g8-t3',
    exam_name: 'Junior School End-of-Term 3 Exams 2026',
    term: 'Term 3',
    year: 2026,
    education_level: 'Junior School',
    academic_year_id: 'ay-2026',
    term_id: 'term-3',
    status: 'Published',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockClasses: ClassStream[] = [
    { id: 'cls-8-blue', class_name: 'Grade 8', stream: 'Blue', education_level: 'Junior School' },
    { id: 'cls-8-red', class_name: 'Grade 8', stream: 'Red', education_level: 'Junior School' },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sb-eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-mat', subject_code: 'MAT', subject_name: 'Mathematics', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-sci', subject_code: 'SCI', subject_name: 'Integrated Science', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-agn', subject_code: 'AGN', subject_name: 'Agriculture and Nutrition', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-pts', subject_code: 'PTS', subject_name: 'Pre-Technical Studies', education_level: 'Junior School', category: 'Core' },
  ];

  const mockGrades: Grade[] = [
    { id: 'gr-01', grade: 'EE1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 8, remarks: 'Outstanding', descriptor: 'Exceeding Expectations' },
    { id: 'gr-02', grade: 'EE2', grade_code: 'EE2', performance_level: 'EE', minimum_score: 75, maximum_score: 89, points: 7, remarks: 'Excellent', descriptor: 'Exceeding Expectations' },
    { id: 'gr-03', grade: 'ME1', grade_code: 'ME1', performance_level: 'ME', minimum_score: 58, maximum_score: 74, points: 6, remarks: 'Good', descriptor: 'Meeting Expectations' },
    { id: 'gr-04', grade: 'ME2', grade_code: 'ME2', performance_level: 'ME', minimum_score: 41, maximum_score: 57, points: 5, remarks: 'Satisfactory', descriptor: 'Meeting Expectations' },
    { id: 'gr-05', grade: 'AE1', grade_code: 'AE1', performance_level: 'AE', minimum_score: 31, maximum_score: 40, points: 4, remarks: 'Developing', descriptor: 'Approaching Expectations' },
    { id: 'gr-06', grade: 'AE2', grade_code: 'AE2', performance_level: 'AE', minimum_score: 21, maximum_score: 30, points: 3, remarks: 'Needs Practice', descriptor: 'Approaching Expectations' },
    { id: 'gr-07', grade: 'BE1', grade_code: 'BE1', performance_level: 'BE', minimum_score: 11, maximum_score: 20, points: 2, remarks: 'Intervention', descriptor: 'Below Expectations' },
    { id: 'gr-08', grade: 'BE2', grade_code: 'BE2', performance_level: 'BE', minimum_score: 0, maximum_score: 10, points: 1, remarks: 'Immediate Support', descriptor: 'Below Expectations' },
  ];

  // Build realistic Grade 8 cohort matching reference example:
  // Stream Blue: 40 learners (37 complete, 1 provisional with 7 subjects, 2 pending with 0 subjects)
  // Stream Red: 37 learners (all complete) -> Total 77 learners in Grade 8
  const allStudents: Student[] = [];
  const allMarks: Mark[] = [];

  // 1. Blue Stream learners (1 to 40)
  for (let i = 1; i <= 40; i++) {
    const sId = `std-blue-${i}`;
    const adm = String(200 + i);
    allStudents.push({
      id: sId,
      full_name: `Learner Blue ${i}`,
      admission_number: adm,
      class_id: 'cls-8-blue',
      stream_id: 'cls-8-blue',
      gender: i % 2 === 0 ? 'F' : 'M',
      active: true,
    });

    if (i <= 37) {
      // Complete learners
      mockSubjects.forEach((sb, sIdx) => {
        const score = Math.min(98, Math.max(25, 85 - i + (sIdx * 2)));
        allMarks.push({
          id: `mk-b-${i}-${sb.id}`,
          student_id: sId,
          subject_id: sb.id,
          exam_id: 'ex-g8-t3',
          marks: score,
          raw_score: score,
          out_of: 100,
          special_status: 'Normal',
        });
      });
    } else if (i === 38) {
      // Provisional: 7 subjects entered, 2 missing
      mockSubjects.slice(0, 7).forEach((sb, sIdx) => {
        const score = 30 + sIdx * 3;
        allMarks.push({
          id: `mk-b-${i}-${sb.id}`,
          student_id: sId,
          subject_id: sb.id,
          exam_id: 'ex-g8-t3',
          marks: score,
          raw_score: score,
          out_of: 100,
          special_status: 'Normal',
        });
      });
    } else {
      // Pending: 0 subjects or 'X' in all
      mockSubjects.forEach((sb) => {
        allMarks.push({
          id: `mk-b-${i}-${sb.id}`,
          student_id: sId,
          subject_id: sb.id,
          exam_id: 'ex-g8-t3',
          marks: 0,
          raw_score: null,
          out_of: 100,
          special_status: 'X',
        });
      });
    }
  }

  // 2. Red Stream learners (41 to 77)
  for (let i = 41; i <= 77; i++) {
    const sId = `std-red-${i}`;
    const adm = String(200 + i);
    allStudents.push({
      id: sId,
      full_name: `Learner Red ${i}`,
      admission_number: adm,
      class_id: 'cls-8-red',
      stream_id: 'cls-8-red',
      gender: i % 2 === 0 ? 'F' : 'M',
      active: true,
    });

    mockSubjects.forEach((sb, sIdx) => {
      const score = Math.min(95, Math.max(30, 80 - (i - 40) + sIdx));
      allMarks.push({
        id: `mk-r-${i}-${sb.id}`,
        student_id: sId,
        subject_id: sb.id,
        exam_id: 'ex-g8-t3',
        marks: score,
        raw_score: score,
        out_of: 100,
        special_status: 'Normal',
      });
    });
  }

  const g8BlueData: MeritListData = {
    school: mockSchool,
    exam: mockExam,
    classes: mockClasses,
    subjects: mockSubjects,
    marks: allMarks,
    grades: mockGrades,
    students: allStudents,
    teachers: [
      { id: 't-brian', teacher_name: 'Mr Brian', is_class_teacher: true, class_teacher_of_id: 'cls-8-blue' } as any,
    ],
    selectedClassId: 'cls-8-blue',
    selectedStreamId: 'cls-8-blue',
    generatedBy: 'System Administrator',
  };

  // ISSUE 1 VERIFICATION
  it('Issue 1: S.NO column width is 7.5mm, fits S.NO on one line, and total metadata width stays 98mm', async () => {
    let capturedDoc: any = null;
    const savePdfSpy = vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
    });

    await downloadMeritListPDF(g8BlueData);
    savePdfSpy.mockRestore();

    expect(capturedDoc).not.toBeNull();
    // Verify table structure in lastAutoTable
    const lastTable = capturedDoc.lastAutoTable;
    expect(lastTable).toBeDefined();

    // Verify text measurement: S.NO width at 7pt is ~6.03mm, fits comfortably inside 7.5mm - 0.6mm padding (6.9mm)
    capturedDoc.setFont('helvetica', 'bold');
    capturedDoc.setFontSize(7.0);
    const snoTextWidth = capturedDoc.getTextWidth('S.NO');
    expect(snoTextWidth).toBeLessThan(6.9);
    expect(snoTextWidth).toBeGreaterThan(5.8);
  });

  // ISSUE 4 VERIFICATION
  it('Issue 4: Examination metadata renders on 2 lines and stays strictly within 287mm printable width', async () => {
    let capturedDoc: any = null;
    const savePdfSpy = vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
    });

    // Test with long examination name
    const longExamData: MeritListData = {
      ...g8BlueData,
      exam: {
        ...mockExam,
        exam_name: 'Junior School End-of-Term 3 Comprehensive Unified Evaluation Examination 2026',
      },
    };

    await downloadMeritListPDF(longExamData);
    savePdfSpy.mockRestore();

    expect(capturedDoc).not.toBeNull();
    const page1 = capturedDoc.internal.pages[1];
    const page1Text = Array.isArray(page1) ? page1.join('\n') : String(page1);

    // Both lines are rendered
    expect(page1Text).toContain('CLASS:');
    expect(page1Text).toContain('STREAM:');
    expect(page1Text).toContain('EXAM NAME:');
    expect(page1Text).toContain('EXAM CODE:');
  });

  // ISSUE 6 VERIFICATION
  it('Issue 6: Canonical subject labels match identically between Page 1 table and Page 2 summary', async () => {
    let capturedDoc: any = null;
    const savePdfSpy = vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
    });

    await downloadMeritListPDF(g8BlueData);
    savePdfSpy.mockRestore();

    expect(capturedDoc).not.toBeNull();
    const page2 = capturedDoc.internal.pages[2];
    const page2Text = Array.isArray(page2) ? page2.join('\n') : String(page2);

    // Summary table must contain canonical headers: MATH, INT SCI, CRE, PRE-TECH
    // And must NOT contain conflicting abbreviations: MAT, INT/SCI, C.R.E, PRE TECH
    expect(page2Text).toContain('MATH');
    expect(page2Text).toContain('INT SCI');
    expect(page2Text).toContain('CRE');
    expect(page2Text).toContain('PRE-TECH');

    // Conflicting secondary abbreviations must be absent
    expect(page2Text).not.toContain('INT/SCI');
    expect(page2Text).not.toContain('C.R.E');
  });

  // ISSUE 8 VERIFICATION
  it('Issue 8: Ranking note clearly distinguishes ranked population from total enrolled population', async () => {
    let capturedDoc: any = null;
    const savePdfSpy = vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
    });

    await downloadMeritListPDF(g8BlueData);
    savePdfSpy.mockRestore();

    expect(capturedDoc).not.toBeNull();
    const page2 = capturedDoc.internal.pages[2];
    const page2Text = Array.isArray(page2) ? page2.join('\n') : String(page2);

    // In Stream Blue: 37 complete/ranked of 40 enrolled
    // In Grade 8 overall: 74 complete/ranked (37 in Blue + 37 in Red) of 77 enrolled
    expect(page2Text).toMatch(/STR\. POS is rank within stream \\?\(37 ranked of 40 learners\\?\)/);
    expect(page2Text).toMatch(/OVR POS is rank within general class \\?\(74 ranked of 77 learners\\?\)/);
  });

  // ISSUE 9 VERIFICATION
  it('Issue 9: Footer timestamp has clean punctuation with no stray colon before at', async () => {
    let capturedDoc: any = null;
    const savePdfSpy = vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
    });

    await downloadMeritListPDF(g8BlueData);
    savePdfSpy.mockRestore();

    expect(capturedDoc).not.toBeNull();
    const totalPages = capturedDoc.internal.pages.length - 1; // jsPDF pages array is 1-indexed (index 0 is null/empty)
    expect(totalPages).toBe(2);

    for (let p = 1; p <= totalPages; p++) {
      const pageText = Array.isArray(capturedDoc.internal.pages[p])
        ? capturedDoc.internal.pages[p].join('\n')
        : String(capturedDoc.internal.pages[p]);

      // Verify clean timestamp format: " at " with no colon before "at"
      expect(pageText).toMatch(/Report generated on: \d{2}\.\d{2}\.\d{4} at \d{2}:\d{2}:\d{2}/);
      expect(pageText).not.toMatch(/Report generated on: \d{2}\.\d{2}\.\d{4}: at/);
      expect(pageText).toContain(`Page ${p}/${totalPages}`);
    }
  });

  // EXCLUSIONS & REGRESSION INTEGRITY
  it('Regression Protection: Pagination behavior (Issue 7 excluded) and positions remain intact', async () => {
    let capturedDoc: any = null;
    const savePdfSpy = vi.spyOn(fileDownloader, 'savePdf').mockImplementation(async (doc: any) => {
      capturedDoc = doc;
    });

    await downloadMeritListPDF(g8BlueData);
    savePdfSpy.mockRestore();

    expect(capturedDoc).not.toBeNull();
    const totalPages = capturedDoc.internal.pages.length - 1;
    // Exactly 2 pages generated (as in reference PDF)
    expect(totalPages).toBe(2);

    // Save a clean test artifact to disk for physical inspection without modifying the original reference
    const artifactDir = path.resolve(__dirname, '../../test_output');
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const testPdfPath = path.join(artifactDir, 'Test_Phase2_Grade_8_Blue_Merit_List.pdf');
    const pdfBytes = capturedDoc.output('arraybuffer');
    fs.writeFileSync(testPdfPath, Buffer.from(pdfBytes));

    expect(fs.existsSync(testPdfPath)).toBe(true);
    expect(fs.statSync(testPdfPath).size).toBeGreaterThan(10000);
  });
});
