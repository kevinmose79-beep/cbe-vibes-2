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
import { calculateSingleLearnerAssessmentRankings } from '../src/services/terminalRankingEngine.ts';
import { calculateLearnerTerminalResults } from '../src/services/terminalResultsEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();
  const grades = api.getGrades();

  const g9Exams = exams.filter(e => e.exam_name.toLowerCase().includes('grade 9') || e.exam_name.toLowerCase().includes('kjsea'));
  const st163 = students.find(s => s.admission_number === '163');
  console.log('Student 163:', st163?.id, st163?.admission_number, st163?.name);

  const allG9Marks: any[] = [];
  for (const e of g9Exams) {
    const marks = await api.fetchMarksForExam(e.id);
    allG9Marks.push(...marks);
    const results = calculateExamResults(e.id, students, marks, CBE_8_POINT_GRADES, classes, subjects, e);
    const r = results.find(res => res.student_id === st163?.id);
    console.log(`Exam ${e.exam_name}: total=${r?.total_marks} / ${r?.total_max_marks}, subject_count=${r?.subject_count}`);
  }

  // Also check if Student 163 is viewed in Terminal Results:
  const g9Class = classes.find(c => c.id === st163?.class_id);
  const g9Subjects = subjects.filter(s => s.education_level === 'Junior School');

  const resBySub = calculateLearnerTerminalResults({
    learnerId: st163!.id,
    subjectIds: g9Subjects.map(s => s.id),
    contributingAssessments: g9Exams,
    marks: allG9Marks.filter(m => m.student_id === st163!.id),
    grades,
    educationLevel: 'Junior School',
    gradeName: 'Grade 9',
    subjects,
  });

  const singleR = calculateSingleLearnerAssessmentRankings({
    student: st163!,
    classStream: g9Class,
    resultsBySubject: resBySub,
    contributingAssessments: g9Exams,
    applicableSubjects: g9Subjects,
    isProvisionalMode: false,
  });

  console.log('\nStudent 163 Single Rankings:');
  for (const [eId, r] of Object.entries(singleR)) {
    console.log(`  ${r.examName}: ${r.totalMarks} / ${r.maxMarks}`);
  }
}
main().catch(console.error);
