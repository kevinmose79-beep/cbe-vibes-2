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

  console.log('Total students:', students.length);
  console.log('Total exams:', exams.length);

  // Group exams by class/grade
  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6')) || exams.find(e => e.exam_name.toLowerCase().includes('third trial'));
  console.log('Using Third Trial:', ttExam?.id, ttExam?.exam_name);

  // Check ALL students for any calculations that produce 755
  for (const exam of exams) {
    const marks = await api.fetchMarksForExam(exam.id);
    if (!marks.length) continue;

    // Check calculateExamResults
    const examResults = calculateExamResults(exam.id, students, marks, CBE_8_POINT_GRADES, classes, subjects, exam);
    for (const r of examResults) {
      if (r.total_marks === 755 || (r.total_marks >= 750 && r.total_marks <= 760)) {
        const st = students.find(s => s.id === r.student_id);
        console.log(`FOUND in calculateExamResults: Exam ${exam.exam_name} -> Student ${st?.admission_number} ${st?.name}: total_marks=${r.total_marks}/${r.total_max_marks}`);
      }
    }
  }

  // Also check calculateSingleLearnerAssessmentRankings for each student for contributingAssessments in their grade!
  // In Grade 6:
  const g6Class = classes.find(c => (c as any).class_name === 'Grade 6' || (c as any).name === 'Grade 6');
  const g6Exams = exams.filter(e => e.exam_name.toLowerCase().includes('grade 6') || e.class_id === g6Class?.id);
  console.log('G6 Exams:', g6Exams.map(e => e.exam_name));

  const allG6Marks: any[] = [];
  for (const e of g6Exams) {
    const m = await api.fetchMarksForExam(e.id);
    allG6Marks.push(...m);
  }

  const g6Students = students.filter(s => s.class_id === g6Class?.id);
  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, g6Exams, { classObj: g6Class });

  for (const st of g6Students) {
    const stMarks = allG6Marks.filter(m => m.student_id === st.id);
    const resultsBySubject = calculateLearnerTerminalResults({
      learnerId: st.id,
      subjectIds: upSubjects.map(s => s.id),
      contributingAssessments: g6Exams,
      marks: stMarks,
      grades,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      subjects,
    });

    const singleR = calculateSingleLearnerAssessmentRankings({
      student: st,
      classStream: g6Class,
      resultsBySubject,
      contributingAssessments: g6Exams,
      applicableSubjects: upSubjects,
      isProvisionalMode: false,
    });

    for (const [eId, r] of Object.entries(singleR)) {
      if (r.totalMarks === 755 || (r.totalMarks && r.totalMarks >= 700)) {
        console.log(`FOUND in calculateSingleLearnerAssessmentRankings: Student ${st.admission_number} ${st.name} -> Exam ${r.examName}: ${r.totalMarks} / ${r.maxMarks}`);
      }
    }
  }
}

main().catch(console.error);
