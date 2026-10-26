import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  KJSEA_MERIT_HEADERS,
  ROTATED_HEADER_INDICES,
  ROTATED_HEADER_NAMES,
  formatSubjectCell,
  processKJSEAMeritCandidates,
  generateKJSEAMeritPDFDocument,
  buildKJSEAMeritExcelBuffer,
  injectExcelHeaderRotation,
  KJSEAMeritExportData,
  KJSEAMeritCandidate,
  getKJSEAMeritExportData,
  KJSEA_SUBJECT_STATS_HEADERS,
  computeKJSEAClassAveragePoints,
  computeKJSEASubjectStats,
  formatPdfDisplayText,
} from '../services/kjseaMeritListExporter';
import { Student, ClassStream, School } from '../types';
import {
  KJSEAStudentResultWithEntries,
  KJSEALevelEntry,
  KJSEA_LEARNING_AREAS_META,
} from '../types/kjsea';
import { kjseaService } from '../services/kjseaService';
import { api } from '../lib/storage';

describe('KJSEA Merit List PDF & Excel Exporter — Focused Verification Suite', () => {
  const mockSchool: Partial<School> = {
    school_name: 'St. Jude Junior Academy',
    county: 'Nairobi',
  };

  const mockClasses: ClassStream[] = [
    { id: 'cls-9a', class_name: 'Grade 9', stream: 'North', stream_id: 'str-north', education_level: 'Junior School' },
    { id: 'cls-9b', class_name: 'Grade 9', stream: 'South', stream_id: 'str-south', education_level: 'Junior School' },
    { id: 'cls-10a', class_name: 'Grade 10', stream: 'East', stream_id: 'str-east', education_level: 'Senior School' as any },
  ];

  // Helper to create 9 standard level entries
  const createNineEntries = (
    resultId: string,
    overrides?: Partial<Record<string, { status: string; level?: string | null; points?: number | null }>>
  ): KJSEALevelEntry[] => {
    return KJSEA_LEARNING_AREAS_META.map((meta, idx) => {
      const custom = overrides?.[meta.code];
      const status = (custom?.status || 'Normal') as any;
      const level = custom !== undefined ? custom.level : (status === 'Normal' ? 'ME1' : null);
      const points = status === 'Normal' && level ? 6 : null;

      return {
        id: `entry-${resultId}-${idx}`,
        student_result_id: resultId,
        subject_code: meta.code,
        status,
        achievement_level: level as any,
        points,
        status_recorded: true,
        created_at: '2026-10-24T00:00:00Z',
        updated_at: '2026-10-24T00:00:00Z',
      };
    });
  };

  // ----------------------------------------------------------------------------
  // 1. Exact 18-Column Order & Uppercase Headers
  // ----------------------------------------------------------------------------
  it('1. Verifies exact 18-column order and all uppercase headers', () => {
    expect(KJSEA_MERIT_HEADERS).toHaveLength(18);
    expect(KJSEA_MERIT_HEADERS).toEqual([
      'S.NO',
      'ADMISSION NO',
      'LEARNER NAME',
      'STREAM',
      'STR POS',
      'OVR POS',
      'ENG',
      'KIS',
      'MATH',
      'INT SCI',
      'CAS',
      'SST',
      'CRE',
      'AGN',
      'PRE-TECH',
      'SUB ENTRY',
      'TOTAL POINTS',
      'AVG POINTS',
    ]);

    // All uppercase check
    KJSEA_MERIT_HEADERS.forEach((h) => {
      expect(h).toBe(h.toUpperCase());
    });

    // Exactly 5 rotated headers
    expect(ROTATED_HEADER_INDICES).toEqual([4, 5, 15, 16, 17]);
    expect(ROTATED_HEADER_NAMES).toEqual([
      'STR POS',
      'OVR POS',
      'SUB ENTRY',
      'TOTAL POINTS',
      'AVG POINTS',
    ]);
  });

  // ----------------------------------------------------------------------------
  // 2. Dynamic Examination-Year Title
  // ----------------------------------------------------------------------------
  it('2. Verifies dynamic examination-year title is never hardcoded', () => {
    const data2026: KJSEAMeritExportData = {
      examYear: 2026,
      examYearId: 'yr-2026',
      isAllStreams: true,
      school: mockSchool,
      candidates: [],
      totalCandidates: 0,
      rankedCount: 0,
      generatedAt: '24 Oct 2026',
    };
    const doc2026 = generateKJSEAMeritPDFDocument(data2026);
    expect(doc2026).toBeDefined();

    const data2027: KJSEAMeritExportData = {
      examYear: 2027,
      examYearId: 'yr-2027',
      isAllStreams: false,
      selectedStreamName: 'North',
      school: mockSchool,
      candidates: [],
      totalCandidates: 0,
      rankedCount: 0,
      generatedAt: '24 Oct 2027',
    };
    const doc2027 = generateKJSEAMeritPDFDocument(data2027);
    expect(doc2027).toBeDefined();
  });

  // ----------------------------------------------------------------------------
  // 3. Subject Order & Status Conventions ("EE1", "X", "Y", "—", "NR")
  // ----------------------------------------------------------------------------
  it('3. Verifies approved subject display conventions without raw marks or percentages', () => {
    // Normal with valid achievement level
    const normalEntry: KJSEALevelEntry = {
      id: 'e1',
      student_result_id: 'r1',
      subject_code: 'ENG',
      status: 'Normal',
      achievement_level: 'EE1',
      points: 8,
      status_recorded: true,
      created_at: '',
      updated_at: '',
    };
    expect(formatSubjectCell(normalEntry)).toEqual({
      displayText: 'EE1',
      isEntered: true,
      points: 8,
      isNormalWithLevel: true,
    });

    // Absent -> "X"
    const absentEntry: KJSEALevelEntry = { ...normalEntry, status: 'Absent', achievement_level: null, points: null };
    expect(formatSubjectCell(absentEntry)).toEqual({
      displayText: 'X',
      isEntered: true,
      points: 0,
      isNormalWithLevel: false,
    });

    // Irregularity -> "Y"
    const irregEntry: KJSEALevelEntry = { ...normalEntry, status: 'Irregularity', achievement_level: null, points: null };
    expect(formatSubjectCell(irregEntry)).toEqual({
      displayText: 'Y',
      isEntered: true,
      points: 0,
      isNormalWithLevel: false,
    });

    // Not Released -> "NR"
    const nrEntry: KJSEALevelEntry = { ...normalEntry, status: 'Not Released', achievement_level: null, points: null };
    expect(formatSubjectCell(nrEntry)).toEqual({
      displayText: 'NR',
      isEntered: true,
      points: 0,
      isNormalWithLevel: false,
    });

    // Pending -> "—"
    const pendingEntry: KJSEALevelEntry = { ...normalEntry, status: 'Pending', achievement_level: null, points: null };
    expect(formatSubjectCell(pendingEntry)).toEqual({
      displayText: '—',
      isEntered: false,
      points: 0,
      isNormalWithLevel: false,
    });

    // Untouched / Undefined -> "—"
    expect(formatSubjectCell(undefined)).toEqual({
      displayText: '—',
      isEntered: false,
      points: 0,
      isNormalWithLevel: false,
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Exact SUB ENTRY Counting Rules
  // ----------------------------------------------------------------------------
  it('4. Verifies SUB ENTRY counting rule: Pending and untouched count as 0, Absent/Irreg/NR count as 1', () => {
    // Student with 7 Normal ME1 (6 pts each = 42), 1 Absent ('X'), 1 Pending ('—')
    const mixedEntries = createNineEntries('r-mixed', {
      AGN: { status: 'Absent', level: null, points: null },
      'PRE-TECH': { status: 'Pending', level: null, points: null },
    });

    const mockResult: KJSEAStudentResultWithEntries = {
      id: 'res-mixed',
      exam_year_id: 'yr-2026',
      student_id: 'std-mixed',
      created_at: '',
      updated_at: '',
      entries: mixedEntries,
    };

    const mockLearner: Student = {
      id: 'std-mixed',
      admission_number: 'ADM-001',
      full_name: 'Faith Chebet',
      gender: 'F',
      class_id: 'cls-9a',
      stream_id: 'str-north',
      active: true,
    };

    const { allCandidates } = processKJSEAMeritCandidates(
      [mockResult],
      [mockLearner],
      mockClasses,
      2026
    );

    expect(allCandidates).toHaveLength(1);
    const candidate = allCandidates[0];

    // 7 Normal + 1 Absent + 0 Pending = 8 SUB ENTRY
    expect(candidate.subEntry).toBe(8);
    expect(candidate.subjects['AGN']).toBe('X');
    expect(candidate.subjects['PRE-TECH']).toBe('—');
    expect(candidate.totalPoints).toBe(42); // 7 * 6
    expect(candidate.qualifiesForRanking).toBe(false); // Ineligible because not all 9 Normal with level
    expect(candidate.strPos).toBe('—');
    expect(candidate.ovrPos).toBe('—');
    expect(candidate.averagePoints).toBe('—');
  });

  // ----------------------------------------------------------------------------
  // 5 & 6. Correct Total Points & Average Points (Two Decimal Places)
  // ----------------------------------------------------------------------------
  it('5 & 6. Verifies total points sum and average points formatted to two decimal places for eligible candidate', () => {
    // 9 Normal subjects: 4 EE1 (4*8=32) + 5 ME1 (5*6=30) = 62 total points
    const fullEntries = createNineEntries('r-full', {
      ENG: { status: 'Normal', level: 'EE1' },
      KIS: { status: 'Normal', level: 'EE1' },
      MATH: { status: 'Normal', level: 'EE1' },
      'INT SCI': { status: 'Normal', level: 'EE1' },
      CAS: { status: 'Normal', level: 'ME1' },
      SST: { status: 'Normal', level: 'ME1' },
      CRE: { status: 'Normal', level: 'ME1' },
      AGN: { status: 'Normal', level: 'ME1' },
      'PRE-TECH': { status: 'Normal', level: 'ME1' },
    });

    const mockResult: KJSEAStudentResultWithEntries = {
      id: 'res-full',
      exam_year_id: 'yr-2026',
      student_id: 'std-full',
      created_at: '',
      updated_at: '',
      entries: fullEntries,
    };

    const mockLearner: Student = {
      id: 'std-full',
      admission_number: 'ADM-002',
      full_name: 'Kevin Mutua',
      gender: 'M',
      class_id: 'cls-9a',
      stream_id: 'str-north',
      active: true,
    };

    const { allCandidates } = processKJSEAMeritCandidates(
      [mockResult],
      [mockLearner],
      mockClasses,
      2026
    );

    const c = allCandidates[0];
    expect(c.subEntry).toBe(9);
    expect(c.totalPoints).toBe(62);
    expect(c.qualifiesForRanking).toBe(true);
    // 62 / 9 = 6.8888... -> "6.89"
    expect(c.averagePoints).toBe('6.89');
    expect(c.ovrPos).toBe('1');
    expect(c.strPos).toBe('1');
  });

  // ----------------------------------------------------------------------------
  // 7 & 8. Standard Competition Ranking (1, 2, 2, 4)
  // ----------------------------------------------------------------------------
  it('7 & 8. Verifies standard competition ranking: ties produce "1, 2, 2, 4" and ineligible learners receive "—"', () => {
    // 4 eligible learners: Scores 64, 58, 58, 50, and 1 ineligible learner
    const makeStudentWithScore = (
      id: string,
      adm: string,
      name: string,
      pointsPerSubject: number
    ): [KJSEAStudentResultWithEntries, Student] => {
      const level = pointsPerSubject === 8 ? 'EE1' : pointsPerSubject === 6 ? 'ME1' : 'ME2';
      const entries = createNineEntries(id, {
        ENG: { status: 'Normal', level },
        KIS: { status: 'Normal', level },
        MATH: { status: 'Normal', level },
        'INT SCI': { status: 'Normal', level },
        CAS: { status: 'Normal', level },
        SST: { status: 'Normal', level },
        CRE: { status: 'Normal', level },
        AGN: { status: 'Normal', level },
        'PRE-TECH': { status: 'Normal', level },
      });

      return [
        {
          id: `res-${id}`,
          exam_year_id: 'yr-2026',
          student_id: id,
          created_at: '',
          updated_at: '',
          entries,
        },
        {
          id,
          admission_number: adm,
          full_name: name,
          gender: 'M',
          class_id: 'cls-9a',
          stream_id: 'str-north',
          active: true,
        },
      ];
    };

    // Candidate 1: 9 * 8 = 72 pts
    const [r1, s1] = makeStudentWithScore('s1', 'ADM-01', 'Alice A', 8);

    // Candidate 2 & 3: tied at 9 * 6 = 54 pts
    const [r2, s2] = makeStudentWithScore('s2', 'ADM-02', 'Bob B', 6);
    const [r3, s3] = makeStudentWithScore('s3', 'ADM-03', 'Charlie C', 6);

    // Candidate 4: 9 * 5 = 45 pts
    const [r4, s4] = makeStudentWithScore('s4', 'ADM-04', 'David D', 5);

    // Candidate 5: Incomplete (8 subjects normal, 1 absent)
    const incompEntries = createNineEntries('r5', {
      AGN: { status: 'Absent', level: null, points: null },
    });
    const r5: KJSEAStudentResultWithEntries = {
      id: 'res-s5',
      exam_year_id: 'yr-2026',
      student_id: 's5',
      created_at: '',
      updated_at: '',
      entries: incompEntries,
    };
    const s5: Student = {
      id: 's5',
      admission_number: 'ADM-05',
      full_name: 'Eva E',
      gender: 'F',
      class_id: 'cls-9a',
      stream_id: 'str-north',
      active: true,
    };

    const { allCandidates } = processKJSEAMeritCandidates(
      [r1, r2, r3, r4, r5],
      [s1, s2, s3, s4, s5],
      mockClasses,
      2026
    );

    // Sequential S.NO check
    expect(allCandidates.map((c) => c.sNo)).toEqual([1, 2, 3, 4, 5]);

    // Ranks check: 1, 2, 2, 4, and "—" for incomplete
    const alice = allCandidates.find((c) => c.studentId === 's1')!;
    const bob = allCandidates.find((c) => c.studentId === 's2')!;
    const charlie = allCandidates.find((c) => c.studentId === 's3')!;
    const david = allCandidates.find((c) => c.studentId === 's4')!;
    const eva = allCandidates.find((c) => c.studentId === 's5')!;

    expect(alice.ovrPos).toBe('1');
    expect(alice.strPos).toBe('1');

    expect(bob.ovrPos).toBe('2');
    expect(bob.strPos).toBe('2');

    expect(charlie.ovrPos).toBe('2');
    expect(charlie.strPos).toBe('2');

    expect(david.ovrPos).toBe('4');
    expect(david.strPos).toBe('4');

    expect(eva.ovrPos).toBe('—');
    expect(eva.strPos).toBe('—');
    expect(eva.averagePoints).toBe('—');
  });

  // ----------------------------------------------------------------------------
  // 9. Stream Ranking vs Overall Ranking Independent Calculation
  // ----------------------------------------------------------------------------
  it('9. Verifies stream ranking and overall ranking are calculated independently across streams', () => {
    // Stream North: Candidate N1 (54 pts)
    const [rN1, sN1] = [
      {
        id: 'r-n1',
        exam_year_id: 'yr-2026',
        student_id: 's-n1',
        created_at: '',
        updated_at: '',
        entries: createNineEntries('r-n1', {}), // 9 * 6 = 54
      },
      {
        id: 's-n1',
        admission_number: 'ADM-N1',
        full_name: 'North One',
        gender: 'M' as const,
        class_id: 'cls-9a',
        stream_id: 'str-north',
        active: true,
      },
    ];

    // Stream South: Candidate S1 (72 pts), Candidate S2 (54 pts)
    const [rS1, sS1] = [
      {
        id: 'r-s1',
        exam_year_id: 'yr-2026',
        student_id: 's-s1',
        created_at: '',
        updated_at: '',
        entries: KJSEA_LEARNING_AREAS_META.map((m, i) => ({
          id: `e-s1-${i}`,
          student_result_id: 'r-s1',
          subject_code: m.code,
          status: 'Normal' as const,
          achievement_level: 'EE1' as const, // 8 pts
          points: 8,
          status_recorded: true,
          created_at: '',
          updated_at: '',
        })), // 9 * 8 = 72
      },
      {
        id: 's-s1',
        admission_number: 'ADM-S1',
        full_name: 'South Top',
        gender: 'F' as const,
        class_id: 'cls-9b',
        stream_id: 'str-south',
        active: true,
      },
    ];

    const [rS2, sS2] = [
      {
        id: 'r-s2',
        exam_year_id: 'yr-2026',
        student_id: 's-s2',
        created_at: '',
        updated_at: '',
        entries: createNineEntries('r-s2', {}), // 9 * 6 = 54
      },
      {
        id: 's-s2',
        admission_number: 'ADM-S2',
        full_name: 'South Second',
        gender: 'M' as const,
        class_id: 'cls-9b',
        stream_id: 'str-south',
        active: true,
      },
    ];

    const { allCandidates } = processKJSEAMeritCandidates(
      [rN1, rS1, rS2],
      [sN1, sS1, sS2],
      mockClasses,
      2026
    );

    const southTop = allCandidates.find((c) => c.studentId === 's-s1')!;
    const northOne = allCandidates.find((c) => c.studentId === 's-n1')!;
    const southSecond = allCandidates.find((c) => c.studentId === 's-s2')!;

    // Overall: South Top is 1 (72 pts), North One & South Second tied at 2 (54 pts)
    expect(southTop.ovrPos).toBe('1');
    expect(northOne.ovrPos).toBe('2');
    expect(southSecond.ovrPos).toBe('2');

    // Stream:
    // In South: South Top is 1, South Second is 2
    expect(southTop.strPos).toBe('1');
    expect(southSecond.strPos).toBe('2');

    // In North: North One is 1 (top of North stream!)
    expect(northOne.strPos).toBe('1');
  });

  // ----------------------------------------------------------------------------
  // 10 & 11. Historical Candidate Preservation & Stream Resolution
  // ----------------------------------------------------------------------------
  it('10 & 11. Preserves historical candidates promoted to Grade 10 and prevents silent stream leakage', () => {
    // Learner was in Grade 9 North in 2026, promoted to Grade 10 East in 2027
    const promotedLearner: Student = {
      id: 'std-promoted',
      admission_number: 'ADM-HIST-01',
      full_name: 'Mary Auma',
      gender: 'F',
      class_id: 'cls-10a', // Current live class is Grade 10!
      stream_id: 'str-east', // Current live stream is East!
      active: true,
      promotion_history: [
        {
          id: 'promo-1',
          student_id: 'std-promoted',
          from_grade: 'Grade 9',
          to_grade: 'Grade 10' as any,
          from_class_id: 'cls-9a', // Grade 9 North
          to_class_id: 'cls-10a',
          date_promoted: '2027-01-05T08:00:00Z',
        },
      ],
    };

    const res2026: KJSEAStudentResultWithEntries = {
      id: 'res-hist-2026',
      exam_year_id: 'yr-2026',
      student_id: 'std-promoted',
      created_at: '2026-10-24T00:00:00Z',
      updated_at: '2026-10-24T00:00:00Z',
      entries: createNineEntries('res-hist-2026'),
    };

    const { allCandidates } = processKJSEAMeritCandidates(
      [res2026],
      [promotedLearner],
      mockClasses,
      2026 // Examination year 2026 (prior to promotion in 2027)
    );

    expect(allCandidates).toHaveLength(1);
    const candidate = allCandidates[0];

    // Must resolve to historical stream North, NOT current Grade 10 East!
    expect(candidate.streamName).toBe('North');
    expect(candidate.isStreamResolved).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 12. Stream-Specific Export Excludes Unverified Stream Members
  // ----------------------------------------------------------------------------
  it('12. Stream-specific export excludes candidates whose stream cannot be verified or belongs to another stream', () => {
    const studentNorth: Student = {
      id: 's-north',
      admission_number: 'ADM-N',
      full_name: 'North Learner',
      gender: 'M',
      class_id: 'cls-9a',
      stream_id: 'str-north',
      active: true,
    };

    const studentSouth: Student = {
      id: 's-south',
      admission_number: 'ADM-S',
      full_name: 'South Learner',
      gender: 'F',
      class_id: 'cls-9b',
      stream_id: 'str-south',
      active: true,
    };

    const studentUnresolved: Student = {
      id: 's-unres',
      admission_number: 'ADM-U',
      full_name: 'Unresolved Learner',
      gender: 'M',
      class_id: '',
      active: true,
    };

    const results = [
      { id: 'r1', exam_year_id: 'y1', student_id: 's-north', entries: createNineEntries('r1'), created_at: '', updated_at: '' },
      { id: 'r2', exam_year_id: 'y1', student_id: 's-south', entries: createNineEntries('r2'), created_at: '', updated_at: '' },
      { id: 'r3', exam_year_id: 'y1', student_id: 's-unres', entries: createNineEntries('r3'), created_at: '', updated_at: '' },
    ];

    // Stream-specific export for "North"
    const { filteredCandidates, allCandidates } = processKJSEAMeritCandidates(
      results,
      [studentNorth, studentSouth, studentUnresolved],
      mockClasses,
      2026,
      'str-north',
      'North'
    );

    // All streams includes all 3 (with unresolved clearly marked)
    expect(allCandidates).toHaveLength(3);
    const unresInAll = allCandidates.find((c) => c.studentId === 's-unres')!;
    expect(unresInAll.streamName).toBe('Unresolved');

    // Stream-specific contains ONLY North
    expect(filteredCandidates).toHaveLength(1);
    expect(filteredCandidates[0].studentId).toBe('s-north');
    expect(filteredCandidates[0].streamName).toBe('North');
  });

  // ----------------------------------------------------------------------------
  // 13. Empty Dataset Graceful Handling
  // ----------------------------------------------------------------------------
  it('13. Empty dataset is handled safely without errors in PDF and Excel', async () => {
    const emptyData: KJSEAMeritExportData = {
      examYear: 2026,
      examYearId: 'yr-empty',
      isAllStreams: true,
      school: mockSchool,
      candidates: [],
      totalCandidates: 0,
      rankedCount: 0,
      generatedAt: '24 Oct 2026',
    };

    // PDF handles empty candidates cleanly
    expect(() => generateKJSEAMeritPDFDocument(emptyData)).not.toThrow();

    // Excel handles empty candidates cleanly
    const excelBuffer = await buildKJSEAMeritExcelBuffer(emptyData);
    expect(excelBuffer).toBeInstanceOf(Uint8Array);
    expect(excelBuffer.length).toBeGreaterThan(0);
  });

  // ----------------------------------------------------------------------------
  // 14 & 15. Excel OpenXML 90° Header Rotation & ZIP Package Integrity
  // ----------------------------------------------------------------------------
  it('14 & 15. Verifies genuine 90° header rotation in OpenXML package for exactly the 5 required columns', async () => {
    const testData: KJSEAMeritExportData = {
      examYear: 2026,
      examYearId: 'yr-2026',
      isAllStreams: true,
      school: mockSchool,
      candidates: [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: 'ADM-101',
          learnerName: 'Test Student',
          streamName: 'North',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: {
            ENG: 'EE1',
            KIS: 'EE1',
            MATH: 'EE1',
            'INT SCI': 'EE1',
            CAS: 'EE1',
            SST: 'EE1',
            CRE: 'EE1',
            AGN: 'EE1',
            'PRE-TECH': 'EE1',
          },
          subEntry: 9,
          totalPoints: 72,
          averagePoints: '8.00',
          qualifiesForRanking: true,
        },
      ],
      totalCandidates: 1,
      rankedCount: 1,
      generatedAt: '24 Oct 2026',
    };

    // Generate complete XLSX buffer
    const finalBuffer = await buildKJSEAMeritExcelBuffer(testData);

    // 1. Open generated XLSX ZIP package with JSZip
    const zip = await JSZip.loadAsync(finalBuffer);

    // 2. Inspect xl/styles.xml
    const stylesXml = await zip.file('xl/styles.xml')?.async('text');
    expect(stylesXml).toBeDefined();

    // Verify xl/styles.xml contains genuine textRotation="90"
    expect(stylesXml).toContain('textRotation="90"');
    expect(stylesXml).toContain('applyAlignment="1"');

    // Extract the index of the rotated <xf> style
    const countMatch = stylesXml!.match(/<cellXfs[^>]*count="(\d+)"[^>]*>/);
    expect(countMatch).not.toBeNull();
    const totalXfs = parseInt(countMatch![1], 10);
    const expectedRotatedStyleIndex = totalXfs - 1; // Last inserted <xf>
    expect(expectedRotatedStyleIndex).toBeGreaterThanOrEqual(1);

    // 3. Inspect worksheet XML (sheet1.xml)
    const sheetFiles = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
    const sheetXml = await (sheetFiles.length > 0 ? sheetFiles[0] : zip.file('xl/worksheets/sheet1.xml'))?.async('text');
    expect(sheetXml).toBeDefined();

    // The five required columns on Row 5:
    // Col 5: E5 ("STR POS")
    // Col 6: F5 ("OVR POS")
    // Col 16: P5 ("SUB ENTRY")
    // Col 17: Q5 ("TOTAL POINTS")
    // Col 18: R5 ("AVG POINTS")
    const rotatedCells = ['E5', 'F5', 'P5', 'Q5', 'R5'];

    for (const cell of rotatedCells) {
      // Cell must reference the rotated style index: s="INDEX"
      const cellTagRegex = new RegExp(`<c\\b[^>]*\\br="${cell}"[^>]*\\bs="${expectedRotatedStyleIndex}"`);
      const matches = cellTagRegex.test(sheetXml!);
      expect(
        matches,
        `Expected cell ${cell} on header row 5 to reference rotated style index ${expectedRotatedStyleIndex}`
      ).toBe(true);
    }

    // 4. Verify the workbook remains structurally valid and opens through SheetJS parser
    const parsedWorkbook = XLSX.read(finalBuffer, { type: 'array' });
    expect(parsedWorkbook).toBeDefined();
    expect(parsedWorkbook.SheetNames).toContain('Merit List');

    const sheet = parsedWorkbook.Sheets['Merit List'];
    expect(sheet).toBeDefined();
    // Verify Row 5 headers in parsed sheet
    expect(sheet['A5']?.v).toBe('S.NO');
    expect(sheet['B5']?.v).toBe('ADMISSION NO');
    expect(sheet['C5']?.v).toBe('LEARNER NAME');
    expect(sheet['D5']?.v).toBe('STREAM');
    expect(sheet['E5']?.v).toBe('STR POS');
    expect(sheet['F5']?.v).toBe('OVR POS');
    expect(sheet['P5']?.v).toBe('SUB ENTRY');
    expect(sheet['Q5']?.v).toBe('TOTAL POINTS');
    expect(sheet['R5']?.v).toBe('AVG POINTS');
  });

  // ----------------------------------------------------------------------------
  // 16. Body Row Styles Match Regular Junior School CBE Merit List
  // ----------------------------------------------------------------------------
  it('16. Verifies PDF body row styles match Regular CBE: fontSize 7.2, minCellHeight 3.6, cellPadding top/bottom 0.25', () => {
    const singleData: KJSEAMeritExportData = {
      examYear: 2026,
      examYearId: 'yr-2026',
      isAllStreams: true,
      school: mockSchool,
      candidates: [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: 'ADM-001',
          learnerName: 'Faith Chebet Long Name Testing For Padding And Width',
          streamName: 'North',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: {
            ENG: 'EE1',
            KIS: 'EE1',
            MATH: 'EE1',
            'INT SCI': 'EE1',
            CAS: 'EE1',
            SST: 'EE1',
            CRE: 'EE1',
            AGN: 'EE1',
            'PRE-TECH': 'EE1',
          },
          subEntry: 9,
          totalPoints: 72,
          averagePoints: '8.00',
          qualifiesForRanking: true,
        },
      ],
      totalCandidates: 1,
      rankedCount: 1,
      generatedAt: '24 Oct 2026',
    };

    const doc = generateKJSEAMeritPDFDocument(singleData);
    const lastTable = (doc as any).lastAutoTable;
    expect(lastTable).toBeDefined();

    // Verify table styles match Regular Junior School CBE
    expect(lastTable.styles.styles.fontSize).toBe(7.2);
    expect(lastTable.styles.styles.minCellHeight).toBe(3.6);
    expect(lastTable.styles.styles.cellPadding.top).toBe(0.25);
    expect(lastTable.styles.styles.cellPadding.bottom).toBe(0.25);

    // Verify learner name column padding (column index 2)
    const nameColStyle = lastTable.styles.columnStyles['2'];
    expect(nameColStyle.cellPadding.top).toBe(0.25);
    expect(nameColStyle.cellPadding.bottom).toBe(0.25);
    expect(nameColStyle.cellPadding.left).toBe(1.2);
    expect(nameColStyle.cellPadding.right).toBe(0.4);

    // Verify headStyles minCellHeight is 22mm
    expect(lastTable.styles.headStyles.minCellHeight).toBe(22);
  });

  // ----------------------------------------------------------------------------
  // 17. Runtime Pagination: 42 Learners Fit on Page 1, 43rd Learner Moves to Page 2
  // ----------------------------------------------------------------------------
  it('17. Runtime verification: 42 candidates fit on page 1, 43 candidates trigger a page break', () => {
    const generateCandidates = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        sNo: i + 1,
        studentId: `s-${i + 1}`,
        admissionNumber: `ADM-${String(i + 1).padStart(3, '0')}`,
        learnerName: `Candidate ${i + 1} Full Name`,
        streamName: i % 2 === 0 ? 'North' : 'South',
        isStreamResolved: true,
        strPos: `${Math.floor(i / 2) + 1}`,
        ovrPos: `${i + 1}`,
        subjects: {
          ENG: 'EE1',
          KIS: 'EE1',
          MATH: 'ME1',
          'INT SCI': 'ME1',
          CAS: 'EE1',
          SST: 'EE1',
          CRE: 'EE1',
          AGN: 'ME1',
          'PRE-TECH': 'ME1',
        },
        subEntry: 9,
        totalPoints: 60,
        averagePoints: '6.67',
        qualifiesForRanking: true,
      }));

    // Test with 42 candidates
    const data42: KJSEAMeritExportData = {
      examYear: 2026,
      examYearId: 'yr-2026',
      isAllStreams: true,
      school: mockSchool,
      candidates: generateCandidates(42),
      totalCandidates: 42,
      rankedCount: 42,
      generatedAt: '24 Oct 2026',
    };

    const doc42 = generateKJSEAMeritPDFDocument(data42);
    // Exactly 42 candidates fit on Page 1; summary section moves cleanly to Page 2
    expect(doc42.getNumberOfPages()).toBe(2);

    const table42 = (doc42 as any).lastAutoTable;
    // Exactly 42 rows in table body
    expect(table42.body).toHaveLength(42);
    // Final Y coordinate must be <= 200 mm (210mm page height - 10mm bottom margin)
    expect(table42.finalY).toBeLessThanOrEqual(200);
    // Row 42 (index 41) is positioned on page 1 above the 200mm margin
    expect(table42.body[41].cells[0].y).toBeGreaterThan(180);
    expect(table42.body[41].cells[0].y).toBeLessThan(200);

    // Test with 43 candidates
    const data43: KJSEAMeritExportData = {
      examYear: 2026,
      examYearId: 'yr-2026',
      isAllStreams: true,
      school: mockSchool,
      candidates: generateCandidates(43),
      totalCandidates: 43,
      rankedCount: 43,
      generatedAt: '24 Oct 2026',
    };

    const doc43 = generateKJSEAMeritPDFDocument(data43);
    // Document must now have 2 pages
    expect(doc43.getNumberOfPages()).toBe(2);

    const table43 = (doc43 as any).lastAutoTable;
    expect(table43.body).toHaveLength(43);
    // Row 42 (index 41) remains on page 1 near bottom (Y > 180mm)
    expect(table43.body[41].cells[0].y).toBeGreaterThan(180);
    // Row 43 (index 42) is on page 2, starting directly below page 2 repeated header at Y = 34mm
    expect(table43.body[42].cells[0].y).toBeLessThan(40);
    expect(table43.body[42].cells[0].y).toBeGreaterThanOrEqual(34);
    // Final Y of table on page 2 reflects single row below repeated header (34 + 3.6 = 37.6mm)
    expect(table43.finalY).toBeCloseTo(37.6, 1);
  });

  // ----------------------------------------------------------------------------
  // Phase 2 — Complete Cohort Candidate Assembly & Fallback Verification
  // ----------------------------------------------------------------------------
  describe('Phase 2 — Complete Cohort Candidate Assembly & Safety Verification', () => {
    const mock76Learners = Array.from({ length: 76 }, (_, i) => {
      const isRed = i < 38;
      return {
        id: `std-g9-${i + 1}`,
        admission_number: String(100 + i + 1),
        full_name: `Learner ${i + 1} Name`,
        gender: (i % 2 === 0 ? 'M' : 'F') as 'M' | 'F',
        class_id: 'cls-9',
        class_name: 'Grade 9',
        stream_id: isRed ? 'str-red' : 'str-blue',
        stream_name: isRed ? 'Red' : 'Blue',
        active: true,
      };
    });

    const mock7Results: KJSEAStudentResultWithEntries[] = [
      // 1 from Red: Tabitha (std-g9-1), 1 subject Normal EE1 (8 pts), 8 Pending
      {
        id: 'res-1',
        exam_year_id: 'yr-2026',
        student_id: 'std-g9-1',
        created_at: '',
        updated_at: '',
        entries: createNineEntries('res-1', {
          ENG: { status: 'Normal', level: 'EE1', points: 8 },
          KIS: { status: 'Pending', level: null, points: null },
          MATH: { status: 'Pending', level: null, points: null },
          'INT SCI': { status: 'Pending', level: null, points: null },
          CAS: { status: 'Pending', level: null, points: null },
          SST: { status: 'Pending', level: null, points: null },
          CRE: { status: 'Pending', level: null, points: null },
          AGN: { status: 'Pending', level: null, points: null },
          'PRE-TECH': { status: 'Pending', level: null, points: null },
        }),
      },
      // 6 from Blue: std-g9-39 to std-g9-44 (all 9 Pending)
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `res-${idx + 2}`,
        exam_year_id: 'yr-2026',
        student_id: `std-g9-${39 + idx}`,
        created_at: '',
        updated_at: '',
        entries: createNineEntries(`res-${idx + 2}`, {
          ENG: { status: 'Pending', level: null, points: null },
          KIS: { status: 'Pending', level: null, points: null },
          MATH: { status: 'Pending', level: null, points: null },
          'INT SCI': { status: 'Pending', level: null, points: null },
          CAS: { status: 'Pending', level: null, points: null },
          SST: { status: 'Pending', level: null, points: null },
          CRE: { status: 'Pending', level: null, points: null },
          AGN: { status: 'Pending', level: null, points: null },
          'PRE-TECH': { status: 'Pending', level: null, points: null },
        }),
      })),
    ];

    const mockGrade9Classes: ClassStream[] = [
      { id: 'cls-9', class_name: 'Grade 9', stream: 'Red', stream_id: 'str-red', education_level: 'Junior School', status: 'Active' },
      { id: 'cls-9', class_name: 'Grade 9', stream: 'Blue', stream_id: 'str-blue', education_level: 'Junior School', status: 'Active' },
    ];

    it('18 & 19. A cohort of 76 learners with only 7 existing result records produces 76 candidates with saved entries preserved', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue(mockGrade9Classes);

      const allData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
      });

      expect(allData.totalCandidates).toBe(76);
      expect(allData.candidates).toHaveLength(76);

      // Verify the 7 existing results are preserved with their saved entries
      const tabitha = allData.candidates.find((c) => c.studentId === 'std-g9-1')!;
      expect(tabitha).toBeDefined();
      expect(tabitha.admissionNumber).toBe('101');
      expect(tabitha.streamName).toBe('Red');
      expect(tabitha.subjects['ENG']).toBe('EE1');
      expect(tabitha.subEntry).toBe(1);
      expect(tabitha.totalPoints).toBe(8);

      // Verify a Blue student with existing result
      const blueSaved = allData.candidates.find((c) => c.studentId === 'std-g9-39')!;
      expect(blueSaved).toBeDefined();
      expect(blueSaved.streamName).toBe('Blue');
      expect(blueSaved.subjects['ENG']).toBe('—');
      expect(blueSaved.subEntry).toBe(0);

      vi.restoreAllMocks();
    });

    it('20. Verifies the other 69 candidates are virtual and unsaved with zero database writes or write RPC calls', async () => {
      const getResultsSpy = vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      const getLearnersSpy = vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue(mockGrade9Classes);

      // Spies to ensure zero mutations occur
      const saveDraftSpy = vi.spyOn(kjseaService, 'saveDraft');
      const createStudentResultSpy = vi.spyOn(kjseaService, 'getOrCreateStudentResult');

      const allData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
      });

      expect(allData.candidates).toHaveLength(76);
      // Zero database write methods were called
      expect(saveDraftSpy).not.toHaveBeenCalled();
      expect(createStudentResultSpy).not.toHaveBeenCalled();

      // Check that unentered learner 2 (std-g9-2) is present as an unsaved virtual candidate
      const unentered = allData.candidates.find((c) => c.studentId === 'std-g9-2')!;
      expect(unentered).toBeDefined();
      expect(unentered.admissionNumber).toBe('102');
      expect(unentered.subEntry).toBe(0);
      expect(unentered.totalPoints).toBe(0);

      vi.restoreAllMocks();
    });

    it('21. All-stream export contains 76 learners across two PDF pages (Page 1: 42, Page 2: 34)', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue(mockGrade9Classes);

      const allData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
      });

      const doc = generateKJSEAMeritPDFDocument(allData);
      // Candidate table spans 2 pages (Page 1: 42, Page 2: 34); summary section renders on Page 3
      expect(doc.getNumberOfPages()).toBe(3);

      const table = (doc as any).lastAutoTable;
      expect(table.body).toHaveLength(76);

      // Page 1 ends at Row 42 (index 41)
      expect(table.body[41].cells[0].y).toBeGreaterThan(180);
      expect(table.body[41].cells[0].y).toBeLessThan(200);

      // Page 2 starts at Row 43 (index 42) below repeated header at Y = 34mm
      expect(table.body[42].cells[0].y).toBeGreaterThanOrEqual(34);
      expect(table.body[42].cells[0].y).toBeLessThan(40);

      // Last row 76 (index 75) renders safely on Page 2
      expect(table.body[75].cells[0].y).toBeGreaterThan(140);
      expect(table.body[75].cells[0].y).toBeLessThan(170);

      vi.restoreAllMocks();
    });

    it('22. Stream Red contains 38 learners and Stream Blue contains 38 learners on single pages', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue(mockGrade9Classes);

      // Stream Red
      const redData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
        selectedStreamId: 'str-red',
        selectedStreamName: 'Red',
      });
      expect(redData.totalCandidates).toBe(38);
      expect(redData.candidates).toHaveLength(38);
      redData.candidates.forEach((c) => {
        expect(c.streamName).toBe('Red');
      });
      const redDoc = generateKJSEAMeritPDFDocument(redData);
      // Candidate table fits on Page 1 (38 learners); summary section renders on Page 2
      expect(redDoc.getNumberOfPages()).toBe(2);

      // Stream Blue
      const blueData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
        selectedStreamId: 'str-blue',
        selectedStreamName: 'Blue',
      });
      expect(blueData.totalCandidates).toBe(38);
      expect(blueData.candidates).toHaveLength(38);
      blueData.candidates.forEach((c) => {
        expect(c.streamName).toBe('Blue');
      });
      const blueDoc = generateKJSEAMeritPDFDocument(blueData);
      // Candidate table fits on Page 1 (38 learners); summary section renders on Page 2
      expect(blueDoc.getNumberOfPages()).toBe(2);

      vi.restoreAllMocks();
    });

    it('23 & 24. A learner without a result has nine "—" subject cells, zero entries, zero total points, and unranked position', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue(mockGrade9Classes);

      const allData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
      });

      // Find an unentered learner
      const unentered = allData.candidates.find((c) => c.studentId === 'std-g9-10')!;
      expect(unentered).toBeDefined();

      // All 9 subjects must display "—"
      KJSEA_LEARNING_AREAS_META.forEach((meta) => {
        expect(unentered.subjects[meta.code]).toBe('—');
      });

      expect(unentered.subEntry).toBe(0);
      expect(unentered.totalPoints).toBe(0);
      expect(unentered.averagePoints).toBe('—');
      expect(unentered.strPos).toBe('—');
      expect(unentered.ovrPos).toBe('—');
      expect(unentered.qualifiesForRanking).toBe(false);

      vi.restoreAllMocks();
    });

    it('25. An empty local classes cache uses authoritative database fallback successfully', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      // Simulate completely empty local class cache
      vi.spyOn(api, 'getClasses').mockReturnValue([]);

      // Mock Supabase fallback
      const mockClient = {
        from: (table: string) => ({
          select: () => {
            if (table === 'classes') {
              return Promise.resolve({
                data: [
                  { id: 'cls-9', class_name: 'Grade 9', grade_level: 9, capacity: 50 },
                ],
                error: null,
              });
            }
            if (table === 'streams') {
              return Promise.resolve({
                data: [
                  { id: 'str-red', class_id: 'cls-9', stream_name: 'Red', capacity: 50 },
                  { id: 'str-blue', class_id: 'cls-9', stream_name: 'Blue', capacity: 50 },
                ],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
      };
      (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

      const allData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
      });

      expect(allData.candidates).toHaveLength(76);
      const redMembers = allData.candidates.filter((c) => c.streamName === 'Red');
      const blueMembers = allData.candidates.filter((c) => c.streamName === 'Blue');
      expect(redMembers).toHaveLength(38);
      expect(blueMembers).toHaveLength(38);

      delete (globalThis as any).__TEST_SUPABASE_CLIENT__;
      vi.restoreAllMocks();
    });

    it('26. An actual class/stream fetch failure produces an explicit error rather than silently excluding candidates', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue([]);

      const mockClientWithError = {
        from: (table: string) => ({
          select: () => {
            if (table === 'classes') {
              return Promise.resolve({
                data: null,
                error: { message: 'Database connectivity timeout' },
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
      };
      (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClientWithError;

      await expect(
        getKJSEAMeritExportData({
          examYearId: 'yr-2026',
          examYear: 2026,
        })
      ).rejects.toThrow('Failed to load authoritative class/stream data');

      delete (globalThis as any).__TEST_SUPABASE_CLIENT__;
      vi.restoreAllMocks();
    });

    it('27. Excel uses the same 76-candidate dataset and retains its rotated headers', async () => {
      vi.spyOn(kjseaService, 'getResultsForExamYear').mockResolvedValue({
        success: true,
        data: mock7Results,
      });
      vi.spyOn(kjseaService, 'getGrade9Learners').mockResolvedValue({
        success: true,
        data: mock76Learners,
      });
      vi.spyOn(api, 'getClasses').mockReturnValue(mockGrade9Classes);

      const allData = await getKJSEAMeritExportData({
        examYearId: 'yr-2026',
        examYear: 2026,
      });

      const excelBuffer = await buildKJSEAMeritExcelBuffer(allData);
      expect(excelBuffer).toBeInstanceOf(Uint8Array);

      // Verify workbook structure via SheetJS
      const wb = XLSX.read(excelBuffer, { type: 'array' });
      const ws = wb.Sheets['Merit List'];
      expect(ws).toBeDefined();

      // Total Candidates metadata check
      expect(ws['A3']?.v).toContain('Total Candidates: 76');

      // Candidate rows start at Row 6 and end at Row 81 (6 + 76 - 1 = 81)
      expect(ws['A6']?.v).toBe(1); // S.NO 1
      expect(ws['B6']?.v).toBeDefined(); // ADM NO
      expect(ws['A81']?.v).toBe(76); // S.NO 76

      // Verify 90° rotated XML header styles
      const zip = await JSZip.loadAsync(excelBuffer);
      const stylesXml = await zip.file('xl/styles.xml')?.async('text');
      expect(stylesXml).toContain('textRotation="90"');

      vi.restoreAllMocks();
    });

    it('28. Phase 1 Verification: Column headers are vertically centered, 5 rotated titles have symmetric clearance, and repeat on all pages', () => {
      const generateCandidates = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
          sNo: i + 1,
          studentId: `s-${i + 1}`,
          admissionNumber: `ADM-${String(i + 1).padStart(3, '0')}`,
          learnerName: `Learner ${i + 1} Name`,
          streamName: i % 2 === 0 ? 'North' : 'South',
          isStreamResolved: true,
          strPos: `${Math.floor(i / 2) + 1}`,
          ovrPos: `${i + 1}`,
          subjects: {
            ENG: 'EE1',
            KIS: 'EE1',
            MATH: 'ME1',
            'INT SCI': 'ME1',
            CAS: 'EE1',
            SST: 'EE1',
            CRE: 'EE1',
            AGN: 'ME1',
            'PRE-TECH': 'ME1',
          },
          subEntry: 9,
          totalPoints: 60,
          averagePoints: '6.67',
          qualifiesForRanking: true,
        }));

      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: true,
        school: mockSchool,
        candidates: generateCandidates(76),
        totalCandidates: 76,
        rankedCount: 76,
        generatedAt: '25 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testData);
      const lastTable = (doc as any).lastAutoTable;
      expect(lastTable).toBeDefined();

      // 1. Verify headStyles configuration
      expect(lastTable.styles.headStyles.valign).toBe('middle');
      expect(lastTable.styles.headStyles.halign).toBe('center');
      expect(lastTable.styles.headStyles.minCellHeight).toBe(22);

      // 2. Verify header repetition across multiple pages
      expect(lastTable.settings.showHead).toBe('everyPage');
      expect(doc.getNumberOfPages()).toBe(3);

      // 3. Verify exactly 18 headers in correct order
      expect(KJSEA_MERIT_HEADERS).toHaveLength(18);
      expect(KJSEA_MERIT_HEADERS[0]).toBe('S.NO');
      expect(KJSEA_MERIT_HEADERS[1]).toBe('ADMISSION NO');
      expect(KJSEA_MERIT_HEADERS[2]).toBe('LEARNER NAME');
      expect(KJSEA_MERIT_HEADERS[3]).toBe('STREAM');
      expect(KJSEA_MERIT_HEADERS[4]).toBe('STR POS');
      expect(KJSEA_MERIT_HEADERS[5]).toBe('OVR POS');
      expect(KJSEA_MERIT_HEADERS[15]).toBe('SUB ENTRY');
      expect(KJSEA_MERIT_HEADERS[16]).toBe('TOTAL POINTS');
      expect(KJSEA_MERIT_HEADERS[17]).toBe('AVG POINTS');

      // 4. Verify 42/34 pagination distribution
      expect(lastTable.body).toHaveLength(76);
      // Row 42 (index 41) is the last learner on Page 1 (Y ~ 195.6mm <= 200mm)
      expect(lastTable.body[41].cells[0].y).toBeGreaterThan(180);
      expect(lastTable.body[41].cells[0].y).toBeLessThan(200);
      // Row 43 (index 42) breaks to Page 2 at Y = 34mm (below repeated 22mm header)
      expect(lastTable.body[42].cells[0].y).toBeGreaterThanOrEqual(34);
      expect(lastTable.body[42].cells[0].y).toBeLessThan(40);
    });

    it('29. Phase 2 Verification: Institutional colour scheme, white table header, royal blue accents, red X/Y, and footer rule', () => {
      const candidates = [
        {
          sNo: 1,
          studentId: 's-1',
          admissionNumber: 'ADM-001',
          learnerName: 'Jane Doe',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: {
            ENG: 'EE1',
            KIS: 'ME1',
            MATH: 'X',
            'INT SCI': 'Y',
            CAS: '—',
            SST: 'EE2',
            CRE: 'ME2',
            AGN: 'AE1',
            'PRE-TECH': 'BE1',
          },
          subEntry: 8,
          totalPoints: 50,
          averagePoints: '6.25',
          qualifiesForRanking: true,
        },
        {
          sNo: 2,
          studentId: 's-2',
          admissionNumber: 'ADM-002',
          learnerName: 'Unranked Student',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '—',
          ovrPos: '—',
          subjects: {
            ENG: '—',
            KIS: '—',
            MATH: '—',
            'INT SCI': '—',
            CAS: '—',
            SST: '—',
            CRE: '—',
            AGN: '—',
            'PRE-TECH': '—',
          },
          subEntry: 0,
          totalPoints: 0,
          averagePoints: '—',
          qualifiesForRanking: false,
        },
      ];

      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: false,
        selectedStreamName: 'Red',
        school: { school_name: 'St. Jude Junior Academy' },
        candidates,
        totalCandidates: 2,
        rankedCount: 1,
        generatedAt: '25 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testData);
      const lastTable = (doc as any).lastAutoTable;
      expect(lastTable).toBeDefined();

      // 1. Table Header Chrome
      expect(lastTable.styles.headStyles.fillColor).toEqual([255, 255, 255]); // White background
      expect(lastTable.styles.headStyles.textColor).toEqual([0, 0, 0]); // Pure black
      expect(lastTable.styles.headStyles.lineColor).toEqual([0, 0, 0]); // Pure black grid

      // 2. Table Body Chrome
      expect(lastTable.styles.styles.textColor).toEqual([0, 0, 0]); // Pure black text
      expect(lastTable.styles.styles.lineColor).toEqual([0, 0, 0]); // Pure black grid
      expect(lastTable.styles.styles.fillColor).toEqual([255, 255, 255]); // White body

      // 3. Important values / column styles
      expect(lastTable.styles.columnStyles['5'].textColor).toEqual([0, 85, 204]); // OVR POS bold blue
      expect(lastTable.styles.columnStyles['5'].fontStyle).toBe('bold');
      expect(lastTable.styles.columnStyles['16'].textColor).toEqual([0, 85, 204]); // TOTAL POINTS bold blue
      expect(lastTable.styles.columnStyles['16'].fontStyle).toBe('bold');
      // AVG POINTS inherits regular weight and dark black text from default table styles
      expect(lastTable.styles.columnStyles['17'].cellWidth).toBe(16);
      expect(lastTable.styles.columnStyles['17'].textColor).toBeUndefined();
      expect(lastTable.styles.columnStyles['17'].fontStyle).toBeUndefined();

      // 4. Achievement levels, special statuses, and dashes in didParseCell
      const row1 = lastTable.body[0];
      // Col 6 (ENG: 'EE1') -> Royal Blue [0, 85, 204] regular weight (not bold)
      expect(row1.cells[6].styles.textColor).toEqual([0, 85, 204]);
      expect(row1.cells[6].styles.fontStyle).toBe('normal');

      // Col 7 (KIS: 'ME1') -> Royal Blue [0, 85, 204] regular weight (not bold)
      expect(row1.cells[7].styles.textColor).toEqual([0, 85, 204]);
      expect(row1.cells[7].styles.fontStyle).toBe('normal');

      // Col 8 (MATH: 'X') -> Crimson Red [220, 38, 38] bold
      expect(row1.cells[8].styles.textColor).toEqual([220, 38, 38]);
      expect(row1.cells[8].styles.fontStyle).toBe('bold');

      // Col 9 (INT SCI: 'Y') -> Crimson Red [220, 38, 38] bold
      expect(row1.cells[9].styles.textColor).toEqual([220, 38, 38]);
      expect(row1.cells[9].styles.fontStyle).toBe('bold');

      // Col 10 (CAS: '—') -> Muted Medium Grey [140, 140, 140] normal
      expect(row1.cells[10].styles.textColor).toEqual([140, 140, 140]);
      expect(row1.cells[10].styles.fontStyle).toBe('normal');

      // Col 17 (AVG POINTS: '6.25') -> Dark Black [0, 0, 0] regular weight (not bold, not blue)
      expect(row1.cells[17].text).toEqual(['6.25']);
      expect(row1.cells[17].styles.textColor).toEqual([0, 0, 0]);
      expect(row1.cells[17].styles.fontStyle).toBe('normal');

      // Unranked candidate dashes
      const row2 = lastTable.body[1];
      expect(row2.cells[5].styles.textColor).toEqual([140, 140, 140]); // OVR POS '—'
      expect(row2.cells[17].styles.textColor).toEqual([140, 140, 140]); // AVG POINTS '—'
      expect(row2.cells[17].styles.fontStyle).toBe('normal');

      // 5. Stream Name in Block Letters (e.g. RED, BLUE) aligning with learners
      expect(row1.cells[3].text).toEqual(['RED']);
      expect(row2.cells[3].text).toEqual(['RED']);
    });
  });

  // ----------------------------------------------------------------------------
  // Phase 4 — KJSEA Merit List Post-Learner Statistics Verification Suite
  // ----------------------------------------------------------------------------
  describe('Phase 4 — KJSEA Merit List Post-Learner Statistics Verification Suite', () => {
    // 1 & 2. Correct class average using ranking-eligible learners only, excluding incomplete / ineligible
    it('30. Correct class average points using ranking-eligible learners only, strictly excluding ineligible learners', () => {
      const candidates: KJSEAMeritCandidate[] = [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: '101',
          learnerName: 'Eligible One',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: { ENG: 'EE1', KIS: 'EE1', MATH: 'EE1', 'INT SCI': 'EE1', CAS: 'EE1', SST: 'EE1', CRE: 'EE1', AGN: 'EE1', 'PRE-TECH': 'EE1' },
          subEntry: 9,
          totalPoints: 72,
          averagePoints: '8.00',
          qualifiesForRanking: true,
        },
        {
          sNo: 2,
          studentId: 's2',
          admissionNumber: '102',
          learnerName: 'Eligible Two',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '2',
          ovrPos: '2',
          subjects: { ENG: 'ME1', KIS: 'ME1', MATH: 'ME1', 'INT SCI': 'ME1', CAS: 'ME1', SST: 'ME1', CRE: 'ME1', AGN: 'ME1', 'PRE-TECH': 'ME1' },
          subEntry: 9,
          totalPoints: 54,
          averagePoints: '6.00',
          qualifiesForRanking: true,
        },
        {
          sNo: 3,
          studentId: 's3',
          admissionNumber: '103',
          learnerName: 'Incomplete Candidate',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '—',
          ovrPos: '—',
          subjects: { ENG: 'EE1', KIS: 'EE1', MATH: 'X', 'INT SCI': '—', CAS: '—', SST: '—', CRE: '—', AGN: '—', 'PRE-TECH': '—' },
          subEntry: 3,
          totalPoints: 16,
          averagePoints: '—',
          qualifiesForRanking: false, // Ineligible!
        },
      ];

      const res = computeKJSEAClassAveragePoints(candidates);
      expect(res.eligibleCount).toBe(2);
      expect(res.sumPoints).toBe(126); // 72 + 54 = 126
      expect(res.classAverageStr).toBe('63.00'); // 126 / 2 = 63.00
      expect(res.bannerText).toBe('CLASS AVERAGE POINTS: 63.00 (OUT OF 72)');
    });

    // 3. Empty eligible set displays an em dash, not zero or 'NaN'
    it('31. Empty eligible set displays an em dash instead of 0 or NaN', () => {
      const candidates: KJSEAMeritCandidate[] = [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: '101',
          learnerName: 'Unassessed Learner',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '—',
          ovrPos: '—',
          subjects: { ENG: '—', KIS: '—', MATH: '—', 'INT SCI': '—', CAS: '—', SST: '—', CRE: '—', AGN: '—', 'PRE-TECH': '—' },
          subEntry: 0,
          totalPoints: 0,
          averagePoints: '—',
          qualifiesForRanking: false,
        },
      ];

      const res = computeKJSEAClassAveragePoints(candidates);
      expect(res.eligibleCount).toBe(0);
      expect(res.classAverageStr).toBe('—');
      expect(res.bannerText).toBe('CLASS AVERAGE POINTS: — (OUT OF 72)');
    });

    // 4. Correct ordering and presence of all 15 statistics columns
    it('32. Correct ordering and presence of all 15 statistics columns in Option A geometry', () => {
      expect(KJSEA_SUBJECT_STATS_HEADERS).toHaveLength(15);
      expect(KJSEA_SUBJECT_STATS_HEADERS).toEqual([
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
        'NR',
        '-',
        'Entries',
        'Average Points',
      ]);
    });

    // 5, 6, 7. Correct counts for EE1..BE2, X, Y, NR, and —, with Entries counting valid levels only
    it('33. Correct counts for EE1..BE2, independent X, Y, NR, —, and Entries counting valid levels only', () => {
      const statuses = ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2', 'X', 'Y', 'NR', '—'];
      const candidates: KJSEAMeritCandidate[] = statuses.map((st, idx) => ({
        sNo: idx + 1,
        studentId: `std-${idx + 1}`,
        admissionNumber: `ADM-${idx + 1}`,
        learnerName: `Candidate ${idx + 1}`,
        streamName: 'Red',
        isStreamResolved: true,
        strPos: '—',
        ovrPos: '—',
        subjects: { ENG: st },
        subEntry: st === '—' ? 0 : 1,
        totalPoints: ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'].includes(st) ? 5 : 0,
        averagePoints: '—',
        qualifiesForRanking: false,
      }));

      const stats = computeKJSEASubjectStats(candidates);
      const eng = stats.find((s) => s.subjectCode === 'ENG')!;
      expect(eng).toBeDefined();
      expect(eng.ee1).toBe(1);
      expect(eng.ee2).toBe(1);
      expect(eng.me1).toBe(1);
      expect(eng.me2).toBe(1);
      expect(eng.ae1).toBe(1);
      expect(eng.ae2).toBe(1);
      expect(eng.be1).toBe(1);
      expect(eng.be2).toBe(1);
      expect(eng.x).toBe(1);
      expect(eng.y).toBe(1);
      expect(eng.nr).toBe(1);
      expect(eng.pending).toBe(1);

      // Entries counts valid achievement levels EE1..BE2 only (8 entries), strictly excluding X, Y, NR, and —
      expect(eng.entries).toBe(8);
      // Valid points sum: 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1 = 36
      // Average points: 36 / 8 = 4.50
      expect(eng.averagePoints).toBe('4.50');
    });

    // 8 & 9. Correct subject average points, two-decimal formatting, and em dash for zero entries
    it('34. Correct subject average points formatting and zero-entry state displays em dash', () => {
      const candidates: KJSEAMeritCandidate[] = [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: '101',
          learnerName: 'Absent All',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '—',
          ovrPos: '—',
          subjects: { ENG: 'X', MATH: '—' },
          subEntry: 1,
          totalPoints: 0,
          averagePoints: '—',
          qualifiesForRanking: false,
        },
      ];

      const stats = computeKJSEASubjectStats(candidates);
      const eng = stats.find((s) => s.subjectCode === 'ENG')!;
      expect(eng.entries).toBe(0);
      expect(eng.averagePoints).toBe('—'); // Zero valid entries -> em dash

      const math = stats.find((s) => s.subjectCode === 'MATH')!;
      expect(math.entries).toBe(0);
      expect(math.averagePoints).toBe('—');
    });

    // 10 & 11. Missing entries, virtual candidates, invalid levels, unsupported statuses do not crash and reconcile
    it('35. Missing entries, virtual candidates, invalid levels, and unsupported statuses do not crash and reconcile to cohort size', () => {
      const candidates: KJSEAMeritCandidate[] = [
        { sNo: 1, studentId: 'c1', admissionNumber: '1', learnerName: 'Valid', streamName: 'Red', isStreamResolved: true, strPos: '1', ovrPos: '1', subjects: { KIS: 'ME1' }, subEntry: 1, totalPoints: 6, averagePoints: '—', qualifiesForRanking: false },
        { sNo: 2, studentId: 'c2', admissionNumber: '2', learnerName: 'Invalid Level', streamName: 'Red', isStreamResolved: true, strPos: '—', ovrPos: '—', subjects: { KIS: 'EE3' }, subEntry: 0, totalPoints: 0, averagePoints: '—', qualifiesForRanking: false },
        { sNo: 3, studentId: 'c3', admissionNumber: '3', learnerName: 'Unsupported Status', streamName: 'Red', isStreamResolved: true, strPos: '—', ovrPos: '—', subjects: { KIS: 'Medical' }, subEntry: 0, totalPoints: 0, averagePoints: '—', qualifiesForRanking: false },
        { sNo: 4, studentId: 'c4', admissionNumber: '4', learnerName: 'Empty Subject', streamName: 'Red', isStreamResolved: true, strPos: '—', ovrPos: '—', subjects: {}, subEntry: 0, totalPoints: 0, averagePoints: '—', qualifiesForRanking: false },
      ];

      const stats = computeKJSEASubjectStats(candidates);
      const kis = stats.find((s) => s.subjectCode === 'KIS')!;
      expect(kis.me1).toBe(1);
      expect(kis.pending).toBe(3); // EE3, Medical, and empty all safely fall to pending '—'
      expect(kis.entries).toBe(1);

      // 12-category reconciliation invariant strictly holds
      stats.forEach((st) => {
        const sumCategories = st.ee1 + st.ee2 + st.me1 + st.me2 + st.ae1 + st.ae2 + st.be1 + st.be2 + st.x + st.y + st.nr + st.pending;
        expect(sumCategories).toBe(candidates.length);
        expect(st.entries).toBe(st.ee1 + st.ee2 + st.me1 + st.me2 + st.ae1 + st.ae2 + st.be1 + st.be2);
      });
    });

    // 12. Statistics section remains together and clear of footer boundary
    it('36. Rendered statistics table in PDF matches Option A widths (sum = 277mm), accents, and stays clear of footer', () => {
      const candidates: KJSEAMeritCandidate[] = [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: '101',
          learnerName: 'Test Student',
          streamName: 'Red',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: { ENG: 'EE1', KIS: 'ME1', MATH: 'X', 'INT SCI': 'Y', CAS: 'NR', SST: 'AE1', CRE: 'EE2', AGN: 'BE1', 'PRE-TECH': 'BE2' },
          subEntry: 9,
          totalPoints: 31,
          averagePoints: '—',
          qualifiesForRanking: false,
        },
      ];

      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: false,
        selectedStreamId: 'str-red',
        selectedStreamName: 'Red',
        school: mockSchool,
        candidates,
        totalCandidates: 1,
        rankedCount: 0,
        generatedAt: '25 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testData);
      expect(doc.getNumberOfPages()).toBe(1); // 1 candidate + summary section easily fits on 1 page

      const summaryTable = (doc as any).summaryAutoTable;
      expect(summaryTable).toBeDefined();

      // Verify Option A widths: 53 + (8 * 14 = 112) + (4 * 13 = 52) + 24 + 36 = 277mm
      const colStyles = summaryTable.styles.columnStyles;
      expect(colStyles['0'].cellWidth).toBe(53);
      for (let i = 1; i <= 8; i++) {
        expect(colStyles[String(i)].cellWidth).toBe(14);
      }
      for (let i = 9; i <= 12; i++) {
        expect(colStyles[String(i)].cellWidth).toBe(13);
      }
      expect(colStyles['13'].cellWidth).toBe(24);
      expect(colStyles['14'].cellWidth).toBe(36);

      // Verify sum of widths
      let totalW = colStyles['0'].cellWidth + colStyles['13'].cellWidth + colStyles['14'].cellWidth;
      for (let i = 1; i <= 8; i++) totalW += colStyles[String(i)].cellWidth;
      for (let i = 9; i <= 12; i++) totalW += colStyles[String(i)].cellWidth;
      expect(totalW).toBe(277);

      // Verify final Y stays comfortably above footer rule (202.5mm)
      expect(summaryTable.finalY).toBeLessThan(198.0);
    });

    // 13. Full cohort assembly: 76 learners produces 3 pages with summary cleanly on Page 3
    it('37. Full cohort assembly with 76 candidates renders candidate table on Pages 1-2 and summary on Page 3', () => {
      const candidates76: KJSEAMeritCandidate[] = Array.from({ length: 76 }, (_, idx) => ({
        sNo: idx + 1,
        studentId: `s-${idx + 1}`,
        admissionNumber: `ADM-${100 + idx + 1}`,
        learnerName: `Candidate ${idx + 1}`,
        streamName: idx < 38 ? 'RED' : 'BLUE',
        isStreamResolved: true,
        strPos: `${(idx % 38) + 1}`,
        ovrPos: `${idx + 1}`,
        subjects: {
          ENG: 'EE1',
          KIS: 'EE2',
          MATH: 'ME1',
          'INT SCI': 'ME2',
          CAS: 'AE1',
          SST: 'AE2',
          CRE: 'BE1',
          AGN: 'BE2',
          'PRE-TECH': 'ME1',
        },
        subEntry: 9,
        totalPoints: 42,
        averagePoints: '4.67',
        qualifiesForRanking: true,
      }));

      const allData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: true,
        school: mockSchool,
        candidates: candidates76,
        totalCandidates: 76,
        rankedCount: 76,
        generatedAt: '25 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(allData);
      expect(doc.getNumberOfPages()).toBe(3);

      const candidateTable = (doc as any).candidateAutoTable;
      const summaryTable = (doc as any).summaryAutoTable;

      expect(candidateTable.body).toHaveLength(76);
      expect(summaryTable.body).toHaveLength(9); // exactly 9 approved learning areas

      // Verification of footer loop on all 3 pages
      expect(doc.getNumberOfPages()).toBe(3);
    });
  });

  // ----------------------------------------------------------------------------
  // Phase 5 — Global KJSEA Merit List Display Correction (Underscore to Hyphen)
  // ----------------------------------------------------------------------------
  describe('Phase 5 — Global KJSEA Merit List Display Correction & Underscore-to-Hyphen Invariant', () => {
    it('38. formatPdfDisplayText replaces all underscores with hyphens and handles edge cases safely', () => {
      expect(formatPdfDisplayText('ADM_2026_001_NORTH')).toBe('ADM-2026-001-NORTH');
      expect(formatPdfDisplayText('ST_JUDE_ACADEMY')).toBe('ST-JUDE-ACADEMY');
      expect(formatPdfDisplayText('STREAM_RED_A')).toBe('STREAM-RED-A');
      expect(formatPdfDisplayText('JOHN_DOE')).toBe('JOHN-DOE');
      expect(formatPdfDisplayText('_')).toBe('-');
      expect(formatPdfDisplayText('___')).toBe('---');
      expect(formatPdfDisplayText('NO-UNDERSCORE')).toBe('NO-UNDERSCORE');
      expect(formatPdfDisplayText(123)).toBe('123');
      expect(formatPdfDisplayText(null)).toBe('');
      expect(formatPdfDisplayText(undefined)).toBe('');
    });

    it('39. The 12th category in KJSEA_SUBJECT_STATS_HEADERS displays as "-" and all 15 columns maintain exact sequence', () => {
      expect(KJSEA_SUBJECT_STATS_HEADERS).toHaveLength(15);
      expect(KJSEA_SUBJECT_STATS_HEADERS[12]).toBe('-');
      expect(KJSEA_SUBJECT_STATS_HEADERS).toEqual([
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
        'NR',
        '-',
        'Entries',
        'Average Points',
      ]);
    });

    it('40. PDF rendering replaces every user-visible underscore with a hyphen across headings, candidate cells, stats, and notes', () => {
      const candidateWithUnderscores: KJSEAMeritCandidate = {
        sNo: 1,
        studentId: 'std_uuid_123',
        admissionNumber: 'ADM_G9_001',
        learnerName: 'FAITH_CHEBET_AUMA',
        streamName: 'STREAM_NORTH_A',
        isStreamResolved: true,
        strPos: '1',
        ovrPos: '1',
        subjects: {
          ENG: 'EE1',
          KIS: 'ME1',
          MATH: 'X',
          'INT SCI': 'Y',
          CAS: 'NR',
          SST: 'AE1',
          CRE: 'EE2',
          AGN: 'BE1',
          'PRE-TECH': 'BE2',
        },
        subEntry: 9,
        totalPoints: 31,
        averagePoints: '3.44',
        qualifiesForRanking: true,
      };

      const testExportData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: false,
        selectedStreamId: 'stream_id_north',
        selectedStreamName: 'STREAM_NORTH_A',
        school: {
          school_name: 'ST_JUDE_JUNIOR_ACADEMY',
          county: 'NAIROBI_COUNTY',
        },
        candidates: [candidateWithUnderscores],
        totalCandidates: 1,
        rankedCount: 1,
        generatedAt: '25 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testExportData);
      expect(doc).toBeDefined();

      // 1. Inspect candidate table autoTable cells
      const candTable = (doc as any).candidateAutoTable;
      expect(candTable).toBeDefined();
      const firstRow = candTable.body[0];

      // Admission number displays with hyphen
      expect(firstRow.cells[1].text[0]).toBe('ADM-G9-001');
      // Learner name displays with hyphen
      expect(firstRow.cells[2].text.join('')).toBe('FAITH-CHEBET-AUMA');
      // Stream name displays with hyphen
      expect(firstRow.cells[3].text.join('')).toBe('STREAM-NORTH-A');

      // 2. Inspect stats table autoTable headers and cells
      const statsTable = (doc as any).summaryAutoTable;
      expect(statsTable).toBeDefined();

      // Check header row of stats table: column 12 must be '-'
      const statsHeaderCells = statsTable.head[0].cells;
      expect(statsHeaderCells[12].text[0]).toBe('-');

      // Check all cells across candidate table and stats table: ZERO underscores
      candTable.body.forEach((row: any) => {
        Object.values(row.cells).forEach((cell: any) => {
          (cell.text || []).forEach((t: string) => {
            expect(t, `Candidate cell text "${t}" must not contain underscore`).not.toContain('_');
          });
        });
      });

      statsTable.body.forEach((row: any) => {
        Object.values(row.cells).forEach((cell: any) => {
          (cell.text || []).forEach((t: string) => {
            expect(t, `Stats cell text "${t}" must not contain underscore`).not.toContain('_');
          });
        });
      });

      // 3. Inspect raw PDF output streams: all visible text elements rendered must not contain underscores
      const pdfText = doc.output();
      // Verifies transformed strings are present with hyphens
      expect(pdfText).toContain('ST-JUDE-JUNIOR-ACADEMY');
      expect(pdfText).toContain('STREAM-NORTH-A');
      expect(pdfText).toContain('ADM-G9-001');
      expect(pdfText).toContain('FAITH-CHEBET-AUMA');

      // Verifies that neither ST_JUDE nor STREAM_NORTH nor ADM_G9 nor FAITH_CHEBET are present as text
      expect(pdfText).not.toContain('ST_JUDE');
      expect(pdfText).not.toContain('STREAM_NORTH');
      expect(pdfText).not.toContain('ADM_G9');
      expect(pdfText).not.toContain('FAITH_CHEBET');

      // 4. Invariant: Original candidate data is never mutated by export
      expect(candidateWithUnderscores.studentId).toBe('std_uuid_123');
      expect(candidateWithUnderscores.admissionNumber).toBe('ADM_G9_001');
      expect(candidateWithUnderscores.learnerName).toBe('FAITH_CHEBET_AUMA');
      expect(candidateWithUnderscores.streamName).toBe('STREAM_NORTH_A');
    });

    it('41. Subject statistics, ranking eligibility, and average calculations remain completely unchanged', () => {
      const candidates: KJSEAMeritCandidate[] = [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: '101',
          learnerName: 'Top Student',
          streamName: 'North',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: {
            ENG: 'EE1',
            KIS: 'EE1',
            MATH: 'EE1',
            'INT SCI': 'EE1',
            CAS: 'EE1',
            SST: 'EE1',
            CRE: 'EE1',
            AGN: 'EE1',
            'PRE-TECH': 'EE1',
          },
          subEntry: 9,
          totalPoints: 72,
          averagePoints: '8.00',
          qualifiesForRanking: true,
        },
      ];

      const avg = computeKJSEAClassAveragePoints(candidates);
      expect(avg.classAverageStr).toBe('72.00');
      expect(avg.eligibleCount).toBe(1);
      expect(avg.sumPoints).toBe(72);
      const stats = computeKJSEASubjectStats(candidates);
      expect(stats).toHaveLength(9);
      const eng = stats.find((s) => s.subjectCode === 'ENG')!;
      expect(eng.ee1).toBe(1);
      expect(eng.entries).toBe(1);
      expect(eng.averagePoints).toBe('8.00');
    });
  });

  // ----------------------------------------------------------------------------
  // Phase 6 — KJSEA Merit List PDF Header (Page 1 Three-Column Centered Layout)
  // ----------------------------------------------------------------------------
  describe('Phase 6 — KJSEA Merit List PDF Page 1 Three-Column Centered Header', () => {
    const dummyLogoUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('42. Renders symmetrical dual logos capped at 18mm on both sides with centered text and divider', () => {
      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: true,
        school: {
          school_name: 'MUCHORWE COMPREHENSIVE SCHOOL',
          logo_url: dummyLogoUri,
        },
        candidates: [],
        totalCandidates: 0,
        rankedCount: 0,
        generatedAt: '26 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testData);
      expect(doc).toBeDefined();

      const pdfOutput = doc.output();

      // 1. Dual logos rendered using exact coordinate matrices
      // 18mm dimension = 51.0236 pt
      // Left logo at marginX (10mm = 28.346 pt), Y = 4.5mm (531.500 pt baseline)
      expect(pdfOutput).toContain('28.3464566929133888 531.5004724409448045 cm');
      // Right logo at (297 - 10 - 18 = 269mm = 762.520 pt), Y = 4.5mm (531.500 pt baseline)
      expect(pdfOutput).toContain('762.5199212598424765 531.5004724409448045 cm');
      // Scaled bounding dimension (51.0236 pt = 18.0 mm)
      expect(pdfOutput).toContain('51.0236220472441033');

      // 2. Centered text block in uppercase, bold, correct copy
      expect(pdfOutput).toContain('(MUCHORWE COMPREHENSIVE SCHOOL) Tj');
      expect(pdfOutput).toContain('(Report: KJSEA 2026 RESULTS) Tj');
      expect(pdfOutput).toContain('(CLASS: GRADE 9 | STREAM: ALL STREAMS) Tj');

      // 3. Thin divider line at Y = 23.0mm (530.083 pt) from X = 10mm (28.346 pt) to X = 287mm (813.543 pt)
      expect(pdfOutput).toContain('28.3464566929133888 530.0831496062991164 m');
      expect(pdfOutput).toContain('813.5435433070865656 530.0831496062991164 l');

      // 4. Verify no underline line is drawn under stream name (old underline was at Y=22.6mm = 531.217 pt)
      expect(pdfOutput).not.toContain('531.217');
    });

    it('43. Fallback: missing logo preserves mathematically centered text without errors', () => {
      const testDataNoLogo: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: false,
        selectedStreamName: 'Red',
        school: {
          school_name: 'Muchorwe Comprehensive School',
          logo_url: undefined, // No logo
        },
        candidates: [],
        totalCandidates: 0,
        rankedCount: 0,
        generatedAt: '26 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testDataNoLogo);
      expect(doc).toBeDefined();

      const pdfOutput = doc.output();

      // Neither left nor right logo matrix is present
      expect(pdfOutput).not.toContain('28.3464566929133888 531.5004724409448045 cm');
      expect(pdfOutput).not.toContain('762.5199212598424765 531.5004724409448045 cm');

      // Text block is cleanly rendered
      expect(pdfOutput).toContain('(MUCHORWE COMPREHENSIVE SCHOOL) Tj');
      expect(pdfOutput).toContain('(Report: KJSEA 2026 RESULTS) Tj');
      expect(pdfOutput).toContain('(CLASS: GRADE 9 | STREAM: RED) Tj');

      // Divider line is still rendered cleanly
      expect(pdfOutput).toContain('28.3464566929133888 530.0831496062991164 m');
      expect(pdfOutput).toContain('813.5435433070865656 530.0831496062991164 l');
    });

    it('44. Full document header executes only on Page 1; table starts cleanly at 26mm without overlap', () => {
      // 76 candidates across 2 streams
      const mockCandidates: KJSEAMeritCandidate[] = Array.from({ length: 76 }, (_, i) => ({
        sNo: i + 1,
        studentId: `s-${i + 1}`,
        admissionNumber: String(100 + i + 1),
        learnerName: `Candidate ${i + 1}`,
        streamName: i < 38 ? 'Red' : 'Blue',
        isStreamResolved: true,
        strPos: String(i + 1),
        ovrPos: String(i + 1),
        subjects: {
          ENG: 'EE1',
          KIS: 'ME1',
          MATH: 'ME1',
          'INT SCI': 'AE1',
          CAS: 'AE1',
          SST: 'BE1',
          CRE: 'EE2',
          AGN: 'ME2',
          'PRE-TECH': 'AE2',
        },
        subEntry: 9,
        totalPoints: 50,
        averagePoints: '5.56',
        qualifiesForRanking: true,
      }));

      const doc = generateKJSEAMeritPDFDocument({
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: true,
        school: {
          school_name: 'Muchorwe Comprehensive School',
          logo_url: dummyLogoUri,
        },
        candidates: mockCandidates,
        totalCandidates: 76,
        rankedCount: 76,
        generatedAt: '26 Oct 2026',
      });

      expect(doc.getNumberOfPages()).toBe(3);

      const pdfOutput = doc.output();

      // Header divider line (at Y=23.0) occurs exactly ONCE across the entire 3-page document
      const dividerMatches = pdfOutput.match(/28\.3464566929133888 530\.0831496062991164 m/g);
      expect(dividerMatches).not.toBeNull();
      expect(dividerMatches!.length).toBe(1);

      // Table startY remains 26mm, exactly 3.0mm below the 23.0mm divider
      const candidateTable = (doc as any).candidateAutoTable;
      expect(candidateTable.settings.startY).toBe(26);

      // Page 2 continues candidate rows with repeated headers, Page 3 has summary without header duplication
      expect(candidateTable.body).toHaveLength(76);
      const summaryTable = (doc as any).summaryAutoTable;
      expect(summaryTable).toBeDefined();
    });
  });

  // ----------------------------------------------------------------------------
  // Phase 7 — Empty Values & Subject Entries Forensic Verification
  // ----------------------------------------------------------------------------
  describe('Phase 7 — Empty Values & Subject Entries Forensic Verification', () => {
    it('45. Genuinely unassessed learner displays "—" for Sub Entry, Total Points, and Avg Points without misleading zeroes', async () => {
      const unassessedCandidate: KJSEAMeritCandidate = {
        sNo: 1,
        studentId: 'std-empty-1',
        admissionNumber: 'ADM-101',
        learnerName: 'Unassessed Learner',
        streamName: 'Red',
        isStreamResolved: true,
        strPos: '—',
        ovrPos: '—',
        subjects: {
          ENG: '—',
          KIS: '—',
          MATH: '—',
          'INT SCI': '—',
          CAS: '—',
          SST: '—',
          CRE: '—',
          AGN: '—',
          'PRE-TECH': '—',
        },
        subEntry: 0,
        totalPoints: 0,
        averagePoints: '—',
        qualifiesForRanking: false,
      };

      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: false,
        selectedStreamName: 'Red',
        school: { school_name: 'Muchorwe Comprehensive School' },
        candidates: [unassessedCandidate],
        totalCandidates: 1,
        rankedCount: 0,
        generatedAt: '26 Oct 2026',
      };

      // 1. PDF Verification
      const doc = generateKJSEAMeritPDFDocument(testData);
      const candTable = (doc as any).candidateAutoTable;
      expect(candTable).toBeDefined();
      const row = candTable.body[0];

      // Col 15: SUB ENTRY displays '—', NOT 0
      expect(row.cells[15].text).toEqual(['—']);
      expect(row.cells[15].styles.textColor).toEqual([140, 140, 140]); // Muted grey

      // Col 16: TOTAL POINTS displays '—', NOT 0
      expect(row.cells[16].text).toEqual(['—']);
      expect(row.cells[16].styles.textColor).toEqual([140, 140, 140]); // Muted grey

      // Col 17: AVG POINTS displays '—', NOT 0
      expect(row.cells[17].text).toEqual(['—']);
      expect(row.cells[17].styles.textColor).toEqual([140, 140, 140]); // Muted grey

      // 2. Excel Verification
      const excelBuffer = await buildKJSEAMeritExcelBuffer(testData);
      const wb = XLSX.read(excelBuffer, { type: 'array' });
      const ws = wb.Sheets['Merit List'];
      expect(ws).toBeDefined();

      // Row 6 (first candidate row after headers on Row 5):
      // Col 16 = P6 (SUB ENTRY)
      // Col 17 = Q6 (TOTAL POINTS)
      // Col 18 = R6 (AVG POINTS)
      expect(ws['P6']?.v).toBe('—');
      expect(ws['Q6']?.v).toBe('—');
      expect(ws['R6']?.v).toBe('—');

      // 3. Invariant: Candidate underlying data model retains numeric values
      expect(unassessedCandidate.subEntry).toBe(0);
      expect(unassessedCandidate.totalPoints).toBe(0);
      expect(unassessedCandidate.averagePoints).toBe('—');
    });

    it('46. Learners with accounted-for statuses retain existing Sub Entry behaviour and genuine 0 total points', async () => {
      const absentCandidate: KJSEAMeritCandidate = {
        sNo: 1,
        studentId: 'std-absent-1',
        admissionNumber: 'ADM-102',
        learnerName: 'All Absent Learner',
        streamName: 'Blue',
        isStreamResolved: true,
        strPos: '—',
        ovrPos: '—',
        subjects: {
          ENG: 'X',
          KIS: 'X',
          MATH: 'X',
          'INT SCI': 'X',
          CAS: 'X',
          SST: 'X',
          CRE: 'X',
          AGN: 'X',
          'PRE-TECH': 'X',
        },
        subEntry: 9, // All 9 accounted for as Absent
        totalPoints: 0, // Legitimate calculated 0
        averagePoints: '—',
        qualifiesForRanking: false,
      };

      const partialAccountedCandidate: KJSEAMeritCandidate = {
        sNo: 2,
        studentId: 'std-partial-1',
        admissionNumber: 'ADM-103',
        learnerName: 'Partial Status Learner',
        streamName: 'Blue',
        isStreamResolved: true,
        strPos: '—',
        ovrPos: '—',
        subjects: {
          ENG: 'X',
          KIS: 'Y',
          MATH: 'NR',
          'INT SCI': '—',
          CAS: '—',
          SST: '—',
          CRE: '—',
          AGN: '—',
          'PRE-TECH': '—',
        },
        subEntry: 3, // 3 accounted-for statuses
        totalPoints: 0,
        averagePoints: '—',
        qualifiesForRanking: false,
      };

      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: false,
        selectedStreamName: 'Blue',
        school: { school_name: 'Muchorwe Comprehensive School' },
        candidates: [absentCandidate, partialAccountedCandidate],
        totalCandidates: 2,
        rankedCount: 0,
        generatedAt: '26 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testData);
      const candTable = (doc as any).candidateAutoTable;
      expect(candTable).toBeDefined();

      // Absent Candidate:
      const row1 = candTable.body[0];
      expect(row1.cells[15].text).toEqual(['9']); // Sub Entry = 9
      expect(row1.cells[16].text).toEqual(['0']); // Total Points = 0 (legitimate calculated 0 preserved)
      expect(row1.cells[17].text).toEqual(['—']); // Avg Points = '—' (unranked)

      // Partial Candidate:
      const row2 = candTable.body[1];
      expect(row2.cells[15].text).toEqual(['3']); // Sub Entry = 3
      expect(row2.cells[16].text).toEqual(['0']); // Total Points = 0 preserved
      expect(row2.cells[17].text).toEqual(['—']); // Avg Points = '—'

      // Excel Verification
      const excelBuffer = await buildKJSEAMeritExcelBuffer(testData);
      const wb = XLSX.read(excelBuffer, { type: 'array' });
      const ws = wb.Sheets['Merit List'];
      expect(ws['P6']?.v).toBe(9);
      expect(ws['Q6']?.v).toBe(0);
      expect(ws['P7']?.v).toBe(3);
      expect(ws['Q7']?.v).toBe(0);
    });

    it('47. Existing valid achievement levels retain their correct points, averages, and sub entry counts', async () => {
      const assessedCandidate: KJSEAMeritCandidate = {
        sNo: 1,
        studentId: 'std-valid-1',
        admissionNumber: 'ADM-104',
        learnerName: 'Top Learner',
        streamName: 'Red',
        isStreamResolved: true,
        strPos: '1',
        ovrPos: '1',
        subjects: {
          ENG: 'EE1',
          KIS: 'EE2',
          MATH: 'ME1',
          'INT SCI': 'ME2',
          CAS: 'AE1',
          SST: 'AE2',
          CRE: 'BE1',
          AGN: 'BE2',
          'PRE-TECH': 'EE1',
        },
        subEntry: 9,
        totalPoints: 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1 + 8, // = 44
        averagePoints: (44 / 9).toFixed(2), // = '4.89'
        qualifiesForRanking: true,
      };

      const testData: KJSEAMeritExportData = {
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: true,
        school: { school_name: 'Muchorwe Comprehensive School' },
        candidates: [assessedCandidate],
        totalCandidates: 1,
        rankedCount: 1,
        generatedAt: '26 Oct 2026',
      };

      const doc = generateKJSEAMeritPDFDocument(testData);
      const candTable = (doc as any).candidateAutoTable;
      const row = candTable.body[0];

      expect(row.cells[15].text).toEqual(['9']);
      expect(row.cells[16].text).toEqual(['44']);
      expect(row.cells[17].text).toEqual(['4.89']);

      // Excel Verification
      const excelBuffer = await buildKJSEAMeritExcelBuffer(testData);
      const wb = XLSX.read(excelBuffer, { type: 'array' });
      const ws = wb.Sheets['Merit List'];
      expect(ws['P6']?.v).toBe(9);
      expect(ws['Q6']?.v).toBe(44);
      expect(ws['R6']?.v).toBe('4.89');
    });

    it('48. With no valid achievement levels entered, every subject summary reports Entries = 0 and all level counts remain zero', () => {
      // 76 genuinely unassessed candidates
      const emptyCandidates: KJSEAMeritCandidate[] = Array.from({ length: 76 }, (_, i) => ({
        sNo: i + 1,
        studentId: `s-${i + 1}`,
        admissionNumber: String(100 + i + 1),
        learnerName: `Candidate ${i + 1}`,
        streamName: i < 38 ? 'Red' : 'Blue',
        isStreamResolved: true,
        strPos: '—',
        ovrPos: '—',
        subjects: {
          ENG: '—',
          KIS: '—',
          MATH: '—',
          'INT SCI': '—',
          CAS: '—',
          SST: '—',
          CRE: '—',
          AGN: '—',
          'PRE-TECH': '—',
        },
        subEntry: 0,
        totalPoints: 0,
        averagePoints: '—',
        qualifiesForRanking: false,
      }));

      const stats = computeKJSEASubjectStats(emptyCandidates);
      expect(stats).toHaveLength(9);

      // Verify every learning area has Entries = 0 and all levels = 0
      stats.forEach((st) => {
        expect(st.entries, `${st.subjectCode} entries must be 0`).toBe(0);
        expect(st.ee1).toBe(0);
        expect(st.ee2).toBe(0);
        expect(st.me1).toBe(0);
        expect(st.me2).toBe(0);
        expect(st.ae1).toBe(0);
        expect(st.ae2).toBe(0);
        expect(st.be1).toBe(0);
        expect(st.be2).toBe(0);
        expect(st.x).toBe(0);
        expect(st.y).toBe(0);
        expect(st.nr).toBe(0);
        expect(st.pending).toBe(76); // all 76 correctly accounted for as pending
        expect(st.averagePoints).toBe('—');
      });

      // Verify PDF summary table rendering
      const doc = generateKJSEAMeritPDFDocument({
        examYear: 2026,
        examYearId: 'yr-2026',
        isAllStreams: true,
        school: { school_name: 'Muchorwe Comprehensive School' },
        candidates: emptyCandidates,
        totalCandidates: 76,
        rankedCount: 0,
        generatedAt: '26 Oct 2026',
      });

      const summaryTable = (doc as any).summaryAutoTable;
      expect(summaryTable).toBeDefined();
      expect(summaryTable.body).toHaveLength(9);

      // Inspect every row in summary table: Entries column (col 13) must be '0'
      summaryTable.body.forEach((row: any) => {
        expect(row.cells[13].text).toEqual(['0']); // Entries column
        expect(row.cells[14].text).toEqual(['—']); // Average points column
      });
    });

    it('49. Existing populated-result and ranking behaviour remains completely unchanged', () => {
      const candidates: KJSEAMeritCandidate[] = [
        {
          sNo: 1,
          studentId: 's1',
          admissionNumber: '101',
          learnerName: 'Ranked Student 1',
          streamName: 'North',
          isStreamResolved: true,
          strPos: '1',
          ovrPos: '1',
          subjects: {
            ENG: 'EE1',
            KIS: 'EE1',
            MATH: 'EE1',
            'INT SCI': 'EE1',
            CAS: 'EE1',
            SST: 'EE1',
            CRE: 'EE1',
            AGN: 'EE1',
            'PRE-TECH': 'EE1',
          },
          subEntry: 9,
          totalPoints: 72,
          averagePoints: '8.00',
          qualifiesForRanking: true,
        },
        {
          sNo: 2,
          studentId: 's2',
          admissionNumber: '102',
          learnerName: 'Ranked Student 2',
          streamName: 'North',
          isStreamResolved: true,
          strPos: '2',
          ovrPos: '2',
          subjects: {
            ENG: 'ME1',
            KIS: 'ME1',
            MATH: 'ME1',
            'INT SCI': 'ME1',
            CAS: 'ME1',
            SST: 'ME1',
            CRE: 'ME1',
            AGN: 'ME1',
            'PRE-TECH': 'ME1',
          },
          subEntry: 9,
          totalPoints: 54,
          averagePoints: '6.00',
          qualifiesForRanking: true,
        },
      ];

      const classAvg = computeKJSEAClassAveragePoints(candidates);
      expect(classAvg.eligibleCount).toBe(2);
      expect(classAvg.sumPoints).toBe(126);
      expect(classAvg.classAverageStr).toBe('63.00');
      expect(classAvg.bannerText).toBe('CLASS AVERAGE POINTS: 63.00 (OUT OF 72)');
    });
  });
});



