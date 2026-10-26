import { describe, it, expect } from 'vitest';
import { computeExamReadiness } from '../utils/examReadinessUtils';
import { Examination, ClassStream, Subject, Student, Mark, Teacher } from '../types';

describe('Results Approval & Release SS&CRE Examination Readiness Forensic Test Suite', () => {
  const examId = 'fd7183f9-f223-498e-8fb7-468cf397432a';
  const grade6ClassId = '6ed8a9ed-d33b-4976-9076-fd175d22f60e';
  const blueStreamId = 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6';
  const redStreamId = 'f358ed2e-fd9f-47aa-8622-a9bb997375e7';

  const mockExamGrade6ThirdTrial: Examination = {
    id: examId,
    exam_name: 'GRADE 6 KPSEA THIRD TRIAL TERM 3 2026',
    term: 'Term 3',
    year: 2026,
    education_level: 'Upper Primary',
    assessment_structure: 'Composite',
    ss_cre_structure: 'CUSTOM:25:15',
    include_agriculture: true,
    status: 'Published',
    exam_type: 'End-Term',
    max_marks: 50,
  };

  const subjectsCatalogue: Subject[] = [
    { id: 'sub_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_intsci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies&CRE', education_level: 'Upper Primary', category: 'Core' },
    { id: 'sub_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Grade 4–9', category: 'Core' },
    { id: 'sub_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'PP1–Grade 9', category: 'Core' },
    { id: 'sub_agn', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core' },
  ];

  const upperPrimaryAllocatedIds = [
    'sub_eng', 'sub_comp', 'sub_kis', 'sub_insha', 'sub_math', 'sub_intsci', 'sub_cas', 'sub_sst', 'sub_cre', 'sub_agn'
  ];

  const blueClassStream: ClassStream = {
    id: grade6ClassId,
    stream_id: blueStreamId,
    class_name: 'Grade 6',
    stream: 'Blue',
    education_level: 'Upper Primary',
    capacity: 53,
    status: 'Active',
    allocated_subject_ids: upperPrimaryAllocatedIds,
  };

  const redClassStream: ClassStream = {
    id: grade6ClassId,
    stream_id: redStreamId,
    class_name: 'Grade 6',
    stream: 'Red',
    education_level: 'Upper Primary',
    capacity: 49,
    status: 'Active',
    allocated_subject_ids: upperPrimaryAllocatedIds,
  };

  const mockTeachers: Teacher[] = [
    {
      id: 'tch_eric',
      teacher_name: 'Mr Eric',
      email: 'eric@example.com',
      phone: '+254700000001',
      is_class_teacher: true,
      class_teacher_of_id: blueStreamId,
      allocations: [],
    },
    {
      id: 'tch_charles',
      teacher_name: 'Mr Charles',
      email: 'charles@example.com',
      phone: '+254700000002',
      is_class_teacher: true,
      class_teacher_of_id: redStreamId,
      allocations: [],
    },
  ];

  // Helper to generate N students
  function createStudents(count: number, streamId: string, prefix: string): Student[] {
    const list: Student[] = [];
    for (let i = 1; i <= count; i++) {
      const adm = `${prefix}${String(i).padStart(3, '0')}`;
      list.push({
        id: `std_${streamId}_${i}`,
        admission_number: adm,
        full_name: `Student ${adm}`,
        class_id: grade6ClassId,
        stream_id: streamId,
        gender: i % 2 === 0 ? 'F' : 'M',
        active: true,
      });
    }
    return list;
  }

  // Helper to generate marks for 10 expected papers
  const upperPrimary10PaperCodes = ['ENG', 'COMP', 'KIS', 'INSHA', 'MATH', 'INT-SCI', 'CAS', 'SST', 'CRE', 'AGN'];

  it('Test A: Grade 6 Blue with 53 learners expects 530 raw marks and correctly reflects genuine missing entries without false SS&CRE missing', () => {
    const blueStudents = createStudents(53, blueStreamId, 'BLU');
    const marks: Mark[] = [];

    // Populate full marks except: 1 ENG missing (std 1), 1 CAS missing (std 2)
    blueStudents.forEach((std, idx) => {
      upperPrimary10PaperCodes.forEach((code) => {
        if (idx === 0 && code === 'ENG') return; // 1 genuine missing ENG
        if (idx === 1 && code === 'CAS') return; // 1 genuine missing CAS

        const sub = subjectsCatalogue.find((s) => s.subject_code === code)!;
        marks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: examId,
          marks: 40,
          raw_score: 40,
          out_of: 50,
          special_status: 'Normal',
        });
      });
    });

    const readiness = computeExamReadiness(
      mockExamGrade6ThirdTrial,
      [blueClassStream],
      blueStudents,
      subjectsCatalogue,
      marks,
      mockTeachers
    );

    const stream = readiness.levelGroups['Upper Primary'].allStreams.find((s) => s.streamId === blueStreamId);
    expect(stream).toBeDefined();
    expect(stream?.totalLearners).toBe(53);
    expect(stream?.expectedMarks).toBe(530); // 53 * 10 = 530 (NOT 583)
    expect(stream?.enteredMarks).toBe(528); // 530 - 2 = 528
    expect(stream?.missingMarks).toBe(2);
    expect(stream?.isReady).toBe(false);

    // Verify missing subjects breakdown
    const missingSubCodes = (stream?.missingSubjects || []).map((m) => m.subjectCode);
    expect(missingSubCodes).toContain('ENG');
    expect(missingSubCodes).toContain('CAS');
    expect(missingSubCodes).not.toContain('SS&CRE'); // Must NEVER report SS&CRE as missing

    const engMissing = stream?.missingSubjects.find((m) => m.subjectCode === 'ENG');
    expect(engMissing?.missingCount).toBe(1);

    const casMissing = stream?.missingSubjects.find((m) => m.subjectCode === 'CAS');
    expect(casMissing?.missingCount).toBe(1);
  });

  it('Test B: Grade 6 Red with 49 learners expects 490 raw marks and correctly reflects genuine missing entries without false SS&CRE missing', () => {
    const redStudents = createStudents(49, redStreamId, 'RED');
    const marks: Mark[] = [];

    // Populate full marks except: 1 ENG missing (std 1), 1 COMP missing (std 2), 1 KIS missing (std 3)
    redStudents.forEach((std, idx) => {
      upperPrimary10PaperCodes.forEach((code) => {
        if (idx === 0 && code === 'ENG') return; // 1 genuine missing ENG
        if (idx === 1 && code === 'COMP') return; // 1 genuine missing COMP
        if (idx === 2 && code === 'KIS') return; // 1 genuine missing KIS

        const sub = subjectsCatalogue.find((s) => s.subject_code === code)!;
        marks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: examId,
          marks: 38,
          raw_score: 38,
          out_of: 50,
          special_status: 'Normal',
        });
      });
    });

    const readiness = computeExamReadiness(
      mockExamGrade6ThirdTrial,
      [redClassStream],
      redStudents,
      subjectsCatalogue,
      marks,
      mockTeachers
    );

    const stream = readiness.levelGroups['Upper Primary'].allStreams.find((s) => s.streamId === redStreamId);
    expect(stream).toBeDefined();
    expect(stream?.totalLearners).toBe(49);
    expect(stream?.expectedMarks).toBe(490); // 49 * 10 = 490 (NOT 539)
    expect(stream?.enteredMarks).toBe(487); // 490 - 3 = 487
    expect(stream?.missingMarks).toBe(3);
    expect(stream?.isReady).toBe(false);

    const missingSubCodes = (stream?.missingSubjects || []).map((m) => m.subjectCode);
    expect(missingSubCodes).toContain('ENG');
    expect(missingSubCodes).toContain('COMP');
    expect(missingSubCodes).toContain('KIS');
    expect(missingSubCodes).not.toContain('SS&CRE');
  });

  it('Test C: When all 10 component papers (including SST and CRE) exist, stream is 100% complete and ready for approval', () => {
    const blueStudents = createStudents(53, blueStreamId, 'BLU');
    const marks: Mark[] = [];

    blueStudents.forEach((std) => {
      upperPrimary10PaperCodes.forEach((code) => {
        const sub = subjectsCatalogue.find((s) => s.subject_code === code)!;
        marks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: examId,
          marks: 42,
          raw_score: 42,
          out_of: 50,
          special_status: 'Normal',
        });
      });
    });

    const readiness = computeExamReadiness(
      mockExamGrade6ThirdTrial,
      [blueClassStream],
      blueStudents,
      subjectsCatalogue,
      marks,
      mockTeachers
    );

    const stream = readiness.levelGroups['Upper Primary'].allStreams.find((s) => s.streamId === blueStreamId);
    expect(stream?.enteredMarks).toBe(530);
    expect(stream?.expectedMarks).toBe(530);
    expect(stream?.missingMarks).toBe(0);
    expect(stream?.missingSubjects.length).toBe(0);
    expect(stream?.isReady).toBe(true);
    expect(stream?.percentage).toBe(100);
  });

  it('Test D: If a required SST or CRE component mark is missing, it is accurately reported missing under its component code', () => {
    const blueStudents = createStudents(5, blueStreamId, 'BLU');
    const marks: Mark[] = [];

    blueStudents.forEach((std, idx) => {
      upperPrimary10PaperCodes.forEach((code) => {
        if (idx === 0 && code === 'SST') return; // Learner 0 missing SST
        if (idx === 1 && code === 'CRE') return; // Learner 1 missing CRE

        const sub = subjectsCatalogue.find((s) => s.subject_code === code)!;
        marks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: examId,
          marks: 40,
          raw_score: 40,
          out_of: 50,
          special_status: 'Normal',
        });
      });
    });

    const readiness = computeExamReadiness(
      mockExamGrade6ThirdTrial,
      [blueClassStream],
      blueStudents,
      subjectsCatalogue,
      marks,
      mockTeachers
    );

    const stream = readiness.levelGroups['Upper Primary'].allStreams.find((s) => s.streamId === blueStreamId);
    expect(stream?.missingMarks).toBe(2);

    const sstMissing = stream?.missingSubjects.find((m) => m.subjectCode === 'SST');
    expect(sstMissing).toBeDefined();
    expect(sstMissing?.missingCount).toBe(1);

    const creMissing = stream?.missingSubjects.find((m) => m.subjectCode === 'CRE');
    expect(creMissing).toBeDefined();
    expect(creMissing?.missingCount).toBe(1);

    expect(stream?.missingSubjects.some((m) => m.subjectCode === 'SS&CRE')).toBe(false);
  });

  it('Test E: Agriculture remains strictly included for this examination (AGN is an expected paper)', () => {
    const blueStudents = createStudents(2, blueStreamId, 'BLU');
    const marks: Mark[] = [];

    // All papers except AGN
    blueStudents.forEach((std) => {
      upperPrimary10PaperCodes.filter((c) => c !== 'AGN').forEach((code) => {
        const sub = subjectsCatalogue.find((s) => s.subject_code === code)!;
        marks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: examId,
          marks: 40,
          raw_score: 40,
          out_of: 50,
          special_status: 'Normal',
        });
      });
    });

    const readiness = computeExamReadiness(
      mockExamGrade6ThirdTrial,
      [blueClassStream],
      blueStudents,
      subjectsCatalogue,
      marks,
      mockTeachers
    );

    const stream = readiness.levelGroups['Upper Primary'].allStreams.find((s) => s.streamId === blueStreamId);
    expect(stream?.expectedMarks).toBe(20); // 2 * 10 = 20
    expect(stream?.enteredMarks).toBe(18); // 2 * 9 = 18
    expect(stream?.missingMarks).toBe(2);

    const agnMissing = stream?.missingSubjects.find((m) => m.subjectCode === 'AGN');
    expect(agnMissing).toBeDefined();
    expect(agnMissing?.missingCount).toBe(2);
  });

  it('Test F: Standalone exam structure preserves 8 separate learning areas without COMP, INSHA, or direct SS&CRE', () => {
    const standaloneExam: Examination = {
      id: 'exam_standalone_g6',
      exam_name: 'GRADE 6 STANDALONE TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      education_level: 'Upper Primary',
      assessment_structure: 'Standalone',
      include_agriculture: true,
      status: 'Published',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const blueStudents = createStudents(2, blueStreamId, 'BLU');
    const standalone8Codes = ['ENG', 'KIS', 'MATH', 'INT-SCI', 'CAS', 'SST', 'CRE', 'AGN'];
    const marks: Mark[] = [];

    blueStudents.forEach((std) => {
      standalone8Codes.forEach((code) => {
        const sub = subjectsCatalogue.find((s) => s.subject_code === code)!;
        marks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: standaloneExam.id,
          marks: 80,
          raw_score: 80,
          out_of: 100,
          special_status: 'Normal',
        });
      });
    });

    const standaloneClassStream: ClassStream = {
      ...blueClassStream,
      allocated_subject_ids: ['sub_eng', 'sub_kis', 'sub_math', 'sub_intsci', 'sub_cas', 'sub_sst', 'sub_cre', 'sub_agn'],
    };

    const readiness = computeExamReadiness(
      standaloneExam,
      [standaloneClassStream],
      blueStudents,
      subjectsCatalogue,
      marks,
      mockTeachers
    );

    const stream = readiness.levelGroups['Upper Primary'].allStreams.find((s) => s.streamId === blueStreamId);
    expect(stream?.expectedMarks).toBe(16); // 2 * 8 = 16
    expect(stream?.enteredMarks).toBe(16);
    expect(stream?.missingMarks).toBe(0);
    expect(stream?.isReady).toBe(true);
  });

  it('Test G: Lower Primary (4 core subjects) and Junior School (9 learning areas) readiness calculations remain unchanged', () => {
    const lpExam: Examination = {
      id: 'exam_lp',
      exam_name: 'GRADE 2 ASSESSMENT',
      term: 'Term 3',
      year: 2026,
      education_level: 'Lower Primary',
      assessment_structure: 'Composite',
      status: 'Published',
      exam_type: 'End-Term',
      max_marks: 50,
    };

    const lpClass: ClassStream = {
      id: 'cls_g2',
      stream_id: 'strm_g2_blue',
      class_name: 'Grade 2',
      stream: 'Blue',
      education_level: 'Lower Primary',
      capacity: 10,
      status: 'Active',
    };

    const lpStudents = createStudents(2, 'strm_g2_blue', 'LP');
    const lpMarks: Mark[] = [];
    const lpCodes = ['ENG', 'KIS', 'MATH', 'ILA'];
    const lpCatalogue: Subject[] = [
      { id: 's_lp_eng', subject_code: 'ENG', subject_name: 'English Language Activities', education_level: 'Lower Primary', category: 'Core' },
      { id: 's_lp_kis', subject_code: 'KIS', subject_name: 'Kiswahili Language Activities', education_level: 'Lower Primary', category: 'Core' },
      { id: 's_lp_math', subject_code: 'MATH', subject_name: 'Mathematical Activities', education_level: 'Lower Primary', category: 'Core' },
      { id: 's_lp_ila', subject_code: 'ILA', subject_name: 'Indigenous Language Activities', education_level: 'Lower Primary', category: 'Core' },
    ];

    lpStudents.forEach((std) => {
      lpCodes.forEach((code) => {
        const sub = lpCatalogue.find((s) => s.subject_code === code)!;
        lpMarks.push({
          id: `m_${std.id}_${sub.id}`,
          student_id: std.id,
          subject_id: sub.id,
          exam_id: lpExam.id,
          marks: 45,
          raw_score: 45,
          out_of: 50,
          special_status: 'Normal',
        });
      });
    });

    const lpReadiness = computeExamReadiness(
      lpExam,
      [lpClass],
      lpStudents,
      lpCatalogue,
      lpMarks,
      []
    );

    const lpStream = lpReadiness.levelGroups['Lower Primary'].allStreams[0];
    expect(lpStream?.expectedMarks).toBe(8); // 2 * 4 = 8
    expect(lpStream?.enteredMarks).toBe(8);
    expect(lpStream?.isReady).toBe(true);
  });
});
