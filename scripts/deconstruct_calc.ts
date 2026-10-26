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
import { evaluateMark, isUpperPrimaryCompOrInsha, getUpperPrimaryCompositeSubjectMarks } from '../src/utils/markUtils.ts';
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

  // Execute exact lines from calculateExamResults
  const isStandaloneExam = opExam?.assessment_structure === 'Standalone';
  console.log('isStandaloneExam:', isStandaloneExam);

  const compositeResult = getUpperPrimaryCompositeSubjectMarks(marks as any, upSubjects, 'Upper Primary', opExam);
  const effectiveStdMarks = compositeResult.processedMarks;
  const synthIds = new Set(compositeResult.syntheticSubjects.map(s => s.id));
  const hasSsCreSynth = synthIds.has('synth_ss_cre_composite') ||
                        synthIds.has('sb_up_ss_cre') ||
                        compositeResult.syntheticSubjects.some(s => s.id === 'f8255683-1d59-46a7-881a-04a25d45d972');
  const hasSsCreStructure = Boolean(opExam?.ss_cre_structure);

  console.log('hasSsCreSynth:', hasSsCreSynth);
  console.log('hasSsCreStructure:', hasSsCreStructure);

  const filteredBaseSubjects = upSubjects.filter(sb => {
    const code = (sb.subject_code || (sb as any).code || '').toUpperCase();
    const name = (sb.subject_name || (sb as any).name || '').toUpperCase();
    if (synthIds.has('synth_english_composite') && (code === 'ENG' || code === 'COMP' || name.includes('ENGLISH') || name.includes('COMPOSITION'))) {
      return false;
    }
    if (synthIds.has('synth_kiswahili_composite') && (code === 'KIS' || code === 'KISW' || code === 'INSHA' || name.includes('KISWAHILI') || name.includes('LUGHA') || name.includes('INSHA'))) {
      return false;
    }
    if (hasSsCreSynth && (code === 'SST' || code === 'CRE' || code === 'SS&CRE' || sb.id === 'f8255683-1d59-46a7-881a-04a25d45d972')) {
      return false;
    }
    return true;
  });

  console.log('filteredBaseSubjects:', filteredBaseSubjects.map(s => s.subject_code));
  console.log('syntheticSubjects:', compositeResult.syntheticSubjects.map(s => `${s.subject_code} (${s.id})`));

  const effectiveApplicableSubjects = [...filteredBaseSubjects, ...compositeResult.syntheticSubjects];
  console.log('effectiveApplicableSubjects:', effectiveApplicableSubjects.map(s => `${s.subject_code} (${s.id})`));

  let totalMarks = 0;
  effectiveApplicableSubjects.forEach((sb) => {
    const isCompInsha = isUpperPrimaryCompOrInsha(sb, g6Class, 'Upper Primary');
    const markObj = effectiveStdMarks.find(
      (m) =>
        String(m.subject_id) === String(sb.id) ||
        (sb.subject_code && String(m.subject_id) === String(sb.subject_code)) ||
        (sb.subject_code && getShortCbeCode(String(m.subject_id)) === getShortCbeCode(sb.subject_code)) ||
        (sb.subject_name && String(m.subject_id).toLowerCase() === sb.subject_name.toLowerCase()) ||
        (subjects.some((s) => s.id === m.subject_id && (s.id === sb.id || s.subject_code === sb.subject_code || getShortCbeCode(s.subject_code) === getShortCbeCode(sb.subject_code))))
    );
    const markInfo = evaluateMark(markObj, {
      isUpperPrimaryCompOrInsha: isCompInsha,
      subject: sb,
      classObj: g6Class,
      educationLevel: 'Upper Primary',
    });
    console.log(`Evaluated ${sb.subject_code} (${sb.id}): markObj=${markObj?.id} (subj=${markObj?.subject_id}), status=${markInfo.status}, pct=${markInfo.percentage}`);
    if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      totalMarks += Math.round(markInfo.percentage);
    }
  });

  console.log('Calculated totalMarks:', totalMarks);
}

main().catch(console.error);
