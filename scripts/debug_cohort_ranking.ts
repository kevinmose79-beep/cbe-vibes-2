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
import { calculateLearnerTerminalResults, resolveUpperPrimaryTerminalSubjects } from '../src/services/terminalResultsEngine.ts';
import { calculateCohortAssessmentRankings, LearnerCohortEntry } from '../src/services/terminalRankingEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();
  const grades = api.getGrades();

  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const st057 = students.find(s => s.admission_number === '057')!;
  const g6Class = classes.find(c => c.id === st057.class_id)!;

  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, [opExam], { classObj: g6Class });

  const opMarks = await api.fetchMarksForExam(opExam.id);
  const stMarks = opMarks.filter(m => m.student_id === st057.id);

  const resultsBySubject = calculateLearnerTerminalResults({
    learnerId: st057.id,
    subjectIds: upSubjects.map(s => s.id),
    contributingAssessments: [opExam],
    marks: stMarks,
    grades,
    educationLevel: 'Upper Primary',
    gradeName: 'Grade 6',
    subjects,
  });

  const singleCohortEntry: LearnerCohortEntry = {
    student: st057,
    classStream: g6Class,
    applicableSubjects: upSubjects,
    resultsBySubject,
  };

  // Let's manually run the steps inside calculateCohortAssessmentRankings!
  const effectiveApplicableSubjects = resolveUpperPrimaryTerminalSubjects(upSubjects, [opExam]);
  console.log('effectiveApplicableSubjects:', effectiveApplicableSubjects.map(s => `${s.subject_code} (${s.id})`));

  const marks: any[] = [];
  const seenMarkKeys = new Set<string>();

  for (const sb of effectiveApplicableSubjects) {
    const res = resultsBySubject.get(sb.id);
    if (!res) {
      console.log(`NO res for ${sb.subject_code} (${sb.id})!`);
      continue;
    }
    for (const trail of res.assessmentTrail || []) {
      const key = `m_${trail.examId}_${st057.id}_${sb.id}`;
      if (!seenMarkKeys.has(key)) {
        seenMarkKeys.add(key);
        marks.push({
          id: key,
          exam_id: trail.examId,
          student_id: st057.id,
          subject_id: sb.id,
          marks: trail.status === 'Normal' ? (trail.rawScore ?? 0) : 0,
          score: trail.rawScore ?? null,
          raw_score: trail.rawScore ?? null,
          out_of: trail.outOf,
          special_status: trail.status,
        });
      }
    }
  }

  console.log('\nReconstructed marks count:', marks.length);
  for (const m of marks) {
    const sub = subjects.find(s => s.id === m.subject_id);
    console.log(`  Mark: ${sub?.subject_code} (${m.subject_id}): score=${m.score}, raw=${m.raw_score}, out_of=${m.out_of}`);
  }

  const examResults = calculateExamResults(
    opExam.id,
    [st057],
    marks,
    CBE_8_POINT_GRADES,
    [g6Class],
    effectiveApplicableSubjects,
    opExam as any
  );

  console.log('\nexamResults result:', examResults[0]);
  console.log('\nsubject_results in examResult:');
  const subjRes = (examResults[0] as any).subject_results || {};
  for (const [subId, res] of Object.entries(subjRes)) {
    const s = subjects.find(sub => sub.id === subId);
    console.log(`  ${s?.subject_code || subId} (${s?.subject_name || subId}): score=${(res as any).score}, raw=${(res as any).raw_score}, marks=${(res as any).marks}`);
  }
}
main().catch(console.error);
