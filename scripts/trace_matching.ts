process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';
import { calculateExamResults, CBE_8_POINT_GRADES } from '../src/services/analysisEngine.ts';
import { resolveUpperPrimaryTerminalSubjects } from '../src/services/terminalResultsEngine.ts';
import { getUpperPrimaryCompositeSubjectMarks, evaluateMark } from '../src/utils/markUtils.ts';
import { getShortCbeCode } from '../src/types.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();

  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const st057 = students.find(s => s.admission_number === '057')!;
  const g6Class = classes.find(c => c.id === st057.class_id)!;

  const marks = [
    { id: 'm1', exam_id: opExam.id, student_id: st057.id, subject_id: '823eba35-ac51-4ac8-be57-fcbeee88151c', marks: 70, score: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
    { id: 'm2', exam_id: opExam.id, student_id: st057.id, subject_id: 'f00b5334-fa16-4640-b19c-733ec4530318', marks: 74, score: 74, raw_score: 74, out_of: 100, special_status: 'Normal' },
    { id: 'm3', exam_id: opExam.id, student_id: st057.id, subject_id: '4441b054-2d20-4d5c-852d-f31d16fbc145', marks: 70, score: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
    { id: 'm4', exam_id: opExam.id, student_id: st057.id, subject_id: 'b65c16d5-a38c-478e-ab46-085170ee31da', marks: 72, score: 72, raw_score: 72, out_of: 100, special_status: 'Normal' },
    { id: 'm5', exam_id: opExam.id, student_id: st057.id, subject_id: 'b2ee51ad-3d6e-458c-8a1e-f5b9b79a0d83', marks: 70, score: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
    { id: 'm6', exam_id: opExam.id, student_id: st057.id, subject_id: 'f8255683-1d59-46a7-881a-04a25d45d972', marks: 76, score: 76, raw_score: 76, out_of: 100, special_status: 'Normal' },
  ];

  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, [opExam]);

  // Step A: run getUpperPrimaryCompositeSubjectMarks on marks
  const compositeResult = getUpperPrimaryCompositeSubjectMarks(marks as any, upSubjects, 'Upper Primary', opExam);
  console.log('compositeResult.processedMarks count:', compositeResult.processedMarks.length);
  for (const m of compositeResult.processedMarks) {
    console.log(`  processedMark: subj=${m.subject_id}, score=${m.score}, raw=${m.raw_score}, out_of=${m.out_of}, is_synth=${m.is_synthetic}`);
  }
  console.log('compositeResult.syntheticSubjects count:', compositeResult.syntheticSubjects.length);
  for (const s of compositeResult.syntheticSubjects) {
    console.log(`  synthSubj: id=${s.id}, code=${s.subject_code}, name=${s.subject_name}`);
  }

  // Step B: calculateExamResults logic
  const synthIds = new Set(compositeResult.syntheticSubjects.map(s => s.id));
  const filteredBaseSubjects = upSubjects.filter(sb => {
    const code = (sb.subject_code || (sb as any).code || '').toUpperCase();
    const name = (sb.subject_name || (sb as any).name || '').toUpperCase();
    if (synthIds.has('synth_english_composite') && (code === 'ENG' || code === 'COMP' || name.includes('ENGLISH') || name.includes('COMPOSITION'))) {
      return false;
    }
    if (synthIds.has('synth_kiswahili_composite') && (code === 'KIS' || code === 'KISW' || code === 'INSHA' || name.includes('KISWAHILI') || name.includes('LUGHA') || name.includes('INSHA'))) {
      return false;
    }
    return true;
  });

  const effectiveApplicableSubjects = [...filteredBaseSubjects, ...compositeResult.syntheticSubjects];
  console.log('\neffectiveApplicableSubjects count:', effectiveApplicableSubjects.length);
  for (const s of effectiveApplicableSubjects) {
    console.log(`  effSubj: id=${s.id}, code=${s.subject_code}, name=${s.subject_name}`);
  }

  console.log('\nMatching marks to effectiveApplicableSubjects:');
  for (const sb of effectiveApplicableSubjects) {
    const markObj = compositeResult.processedMarks.find(
      (m) =>
        String(m.subject_id) === String(sb.id) ||
        (sb.subject_code && String(m.subject_id) === String(sb.subject_code)) ||
        (sb.subject_code && getShortCbeCode(String(m.subject_id)) === getShortCbeCode(sb.subject_code)) ||
        (sb.subject_name && String(m.subject_id).toLowerCase() === sb.subject_name.toLowerCase()) ||
        (subjects.some((s) => s.id === m.subject_id && (s.id === sb.id || s.subject_code === sb.subject_code || getShortCbeCode(s.subject_code) === getShortCbeCode(sb.subject_code))))
    );
    const evalM = evaluateMark(markObj);
    console.log(`  Subj ${sb.subject_code} (${sb.id}): matched mark=${markObj?.id} (subj_id=${markObj?.subject_id}), raw=${evalM.rawScore}, pct=${evalM.percentage}`);
  }
}

main().catch(console.error);
