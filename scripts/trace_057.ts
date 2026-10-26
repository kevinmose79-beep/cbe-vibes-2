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
import { calculateSingleLearnerAssessmentRankings } from '../src/services/terminalRankingEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();
  const grades = api.getGrades();

  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'));
  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'));
  const stExam = exams.find(e => e.exam_name.toLowerCase().includes('second trial') && e.exam_name.toLowerCase().includes('grade 6'));

  const contributing = [opExam, stExam, ttExam].filter(Boolean) as any[];

  const ttMarks = await api.fetchMarksForExam(ttExam!.id);
  const opMarks = await api.fetchMarksForExam(opExam!.id);
  const secMarks = await api.fetchMarksForExam(stExam!.id);
  const allMarks = [...ttMarks, ...opMarks, ...secMarks];

  const st = students.find(s => s.admission_number === '057')!;
  const g6Class = classes.find(c => c.id === st.class_id);
  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, contributing, { classObj: g6Class });

  const stMarks = allMarks.filter(m => m.student_id === st.id);
  const resultsBySubject = calculateLearnerTerminalResults({
    learnerId: st.id,
    subjectIds: upSubjects.map(s => s.id),
    contributingAssessments: contributing,
    marks: stMarks,
    grades,
    educationLevel: 'Upper Primary',
    gradeName: 'Grade 6',
    subjects,
  });

  console.log('ResultsBySubject size:', resultsBySubject.size);
  for (const [subId, res] of resultsBySubject.entries()) {
    const sub = subjects.find(s => s.id === subId);
    console.log(`Subj: ${sub?.subject_code} (${sub?.name || 'unknown'}) [${subId}]:`);
    for (const trail of res.assessmentTrail || []) {
      console.log(`  exam=${trail.examName} (${trail.examId}): raw=${trail.rawScore}, outOf=${trail.outOf}, pct=${trail.percentage}, status=${trail.status}`);
    }
  }

  // Now trace calculateCohortAssessmentRankings
  console.log('\nNow calling calculateSingleLearnerAssessmentRankings...');
  const singleR = calculateSingleLearnerAssessmentRankings({
    student: st,
    classStream: g6Class,
    resultsBySubject,
    contributingAssessments: contributing,
    applicableSubjects: upSubjects,
    isProvisionalMode: false,
  });
  console.log('singleR:', singleR);
}

main().catch(console.error);
