process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';
import { calculateLearnerTerminalResults, resolveUpperPrimaryTerminalSubjects } from '../src/services/terminalResultsEngine.ts';
import { calculateCohortAssessmentRankings, LearnerCohortEntry } from '../src/services/terminalRankingEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();
  const grades = api.getGrades();

  const thirdTrial = exams.find(e => e.exam_name.toLowerCase().includes('third trial'));
  const opener = exams.find(e => e.exam_name.toLowerCase().includes('opener') && (e.exam_name.toLowerCase().includes('grade 6') || e.class_id === '6ed8a9ed-d33b-4976-9076-fd175d22f60e'));
  const secondTrial = exams.find(e => e.exam_name.toLowerCase().includes('second trial'));

  console.log('Third trial:', thirdTrial?.id, thirdTrial?.exam_name, 'assessment_structure:', thirdTrial?.assessment_structure, 'include_agri:', thirdTrial?.include_agriculture);
  console.log('Opener:', opener?.id, opener?.exam_name, 'assessment_structure:', opener?.assessment_structure, 'include_agri:', opener?.include_agriculture);
  console.log('Second trial:', secondTrial?.id, secondTrial?.exam_name, 'assessment_structure:', secondTrial?.assessment_structure, 'include_agri:', secondTrial?.include_agriculture);

  const contributing = [opener, secondTrial, thirdTrial].filter(Boolean) as any[];

  // Fetch all marks for these 3 exams
  const m1 = await api.fetchMarksForExam(thirdTrial!.id);
  const m2 = opener ? await api.fetchMarksForExam(opener.id) : [];
  const m3 = secondTrial ? await api.fetchMarksForExam(secondTrial.id) : [];
  const allMarks = [...m1, ...m2, ...m3];

  const grade6Class = classes.find(c => {
    const cName = (c as any).name || (c as any).class_name || '';
    return cName.toLowerCase().includes('grade 6');
  });

  const grade6Students = students.filter(s => s.class_id === grade6Class?.id);

  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, contributing, { classObj: grade6Class });
  console.log('Upper primary subjects resolved:', upSubjects.map(s => `${s.subject_code} (${s.id})`));

  // Build cohort entries
  const cohortEntries: LearnerCohortEntry[] = [];
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

    cohortEntries.push({
      student: st,
      classStream: grade6Class,
      applicableSubjects: upSubjects,
      resultsBySubject,
    });
  }

  // Now calculate cohort assessment rankings!
  const cohortRankings = calculateCohortAssessmentRankings({
    contributingAssessments: contributing,
    applicableSubjects: upSubjects,
    cohortLearners: cohortEntries,
    classes,
    isProvisionalMode: false,
  });

  console.log('Total learners ranked in cohortRankings:', cohortRankings.size);

  const ttScores: number[] = [];
  for (const [studentId, examMap] of cohortRankings.entries()) {
    const st = grade6Students.find(s => s.id === studentId);
    const ttRank = examMap[thirdTrial!.id];
    if (ttRank && typeof ttRank.totalMarks === 'number') {
      ttScores.push(ttRank.totalMarks);
    }
  }

  ttScores.sort((a, b) => b - a);
  console.log('Top 10 ttRank.totalMarks in cohortRankings:', ttScores.slice(0, 10));
  console.log('Lowest 5 ttRank.totalMarks in cohortRankings:', ttScores.slice(-5));

  for (const [studentId, examMap] of cohortRankings.entries()) {
    const st = grade6Students.find(s => s.id === studentId);
    const ttRank = examMap[thirdTrial!.id];
    if (ttRank && ttRank.totalMarks === ttScores[0]) {
      console.log(`\nHIGHEST STUDENT: ${st?.admission_number} ${st?.name}:`);
      console.log('  Third trial ranking:', ttRank);
      console.log('  Opener ranking:', examMap[opener?.id || '']);
      console.log('  Second trial ranking:', examMap[secondTrial?.id || '']);
      break;
    }
  }
}

main().catch(console.error);
