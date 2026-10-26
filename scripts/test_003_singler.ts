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
import { calculateLearnerTerminalResults } from '../src/services/terminalResultsEngine.ts';
import { calculateSingleLearnerAssessmentRankings } from '../src/services/terminalRankingEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();
  const grades = api.getGrades();

  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const stExam = exams.find(e => e.exam_name.toLowerCase().includes('second trial') && e.exam_name.toLowerCase().includes('grade 6'))!;

  const contributing = [opExam, stExam, ttExam].filter(Boolean) as any[];

  const ttMarks = await api.fetchMarksForExam(ttExam.id);
  const opMarks = await api.fetchMarksForExam(opExam.id);
  const secMarks = await api.fetchMarksForExam(stExam.id);
  const allMarks = [...ttMarks, ...opMarks, ...secMarks];

  const g6Class = classes.find(c => {
    const n = (c as any).class_name || (c as any).name || '';
    return n.toLowerCase().includes('grade 6');
  })!;

  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, contributing, { classObj: g6Class });

  // For Student 003:
  const st003 = students.find(s => s.admission_number === '003')!;
  const stMarks = allMarks.filter(m => m.student_id === st003.id);

  const resultsBySubject = calculateLearnerTerminalResults({
    learnerId: st003.id,
    subjectIds: upSubjects.map(s => s.id),
    contributingAssessments: contributing,
    marks: stMarks,
    grades,
    educationLevel: 'Upper Primary',
    gradeName: 'Grade 6',
    subjects,
  });

  const singleR = calculateSingleLearnerAssessmentRankings({
    student: st003,
    classStream: g6Class,
    resultsBySubject,
    contributingAssessments: contributing,
    applicableSubjects: upSubjects,
    isProvisionalMode: false,
  });

  console.log('SingleR for Student 003:', singleR);
}
main().catch(console.error);
