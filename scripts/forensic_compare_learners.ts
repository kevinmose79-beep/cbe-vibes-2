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
  const stMarks = await api.fetchMarksForExam(stExam!.id);
  const allMarks = [...ttMarks, ...opMarks, ...stMarks];

  const grade6Class = classes.find(c => {
    const cName = (c as any).name || (c as any).class_name || '';
    return cName.toLowerCase().includes('grade 6');
  });

  const grade6Students = students.filter(s => s.class_id === grade6Class?.id);
  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, contributing, { classObj: grade6Class });

  // For every student in Grade 6, compute calculateSingleLearnerAssessmentRankings
  for (const st of grade6Students) {
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

    const singleRankings = calculateSingleLearnerAssessmentRankings({
      student: st,
      classStream: grade6Class,
      resultsBySubject,
      contributingAssessments: contributing,
      applicableSubjects: upSubjects,
      isProvisionalMode: false,
    });

    const opTotal = singleRankings[opExam!.id]?.totalMarks;
    const stTotal = singleRankings[stExam!.id]?.totalMarks;
    const ttTotal = singleRankings[ttExam!.id]?.totalMarks;

    // Check if this student matches:
    // Opener: 584 / 600
    // Another assessment: 509 / 600
    // Third Trial: 755 / 700 OR any of these numbers
    if (opTotal === 584 || stTotal === 509 || ttTotal === 755 || (ttTotal && ttTotal > 600)) {
      console.log(`\nMATCHING STUDENT: Admission ${st.admission_number}, Name: ${st.name}, ID: ${st.id}`);
      console.log(`  Opener (${opExam?.exam_name}): ${opTotal} / ${singleRankings[opExam!.id]?.maxMarks}`);
      console.log(`  Second Trial (${stExam?.exam_name}): ${stTotal} / ${singleRankings[stExam!.id]?.maxMarks}`);
      console.log(`  Third Trial (${ttExam?.exam_name}): ${ttTotal} / ${singleRankings[ttExam!.id]?.maxMarks}`);

      console.log('  Detailed Marks for Third Trial:');
      const studentTtMarks = ttMarks.filter(m => m.student_id === st.id);
      for (const m of studentTtMarks) {
        const sub = subjects.find(s => s.id === m.subject_id);
        console.log(`    Subj: ${sub?.subject_code} (${sub?.name}) [${m.subject_id}]: raw=${m.raw_score}, marks=${m.marks}, out_of=${m.out_of}`);
      }

      console.log('  ResultsBySubject:');
      for (const [subId, res] of resultsBySubject.entries()) {
        const sub = subjects.find(s => s.id === subId);
        const trail = res.assessmentTrail?.find(t => t.examId === ttExam!.id);
        console.log(`    ${sub?.subject_code} (${sub?.name}): trail raw=${trail?.rawScore}, percentage=${trail?.percentage}, outOf=${trail?.outOf}`);
      }
    }
  }
}

main().catch(console.error);
