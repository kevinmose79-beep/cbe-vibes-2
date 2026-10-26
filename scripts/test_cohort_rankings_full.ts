process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';
import { calculateCohortAssessmentRankings, LearnerCohortEntry } from '../src/services/terminalRankingEngine.ts';
import { calculateLearnerTerminalResults, resolveUpperPrimaryTerminalSubjects } from '../src/services/terminalResultsEngine.ts';
import { getLearnerReportSubjects } from '../src/services/analysisEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();
  const grades = api.getGrades();
  const teachers = api.getTeachers();

  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const stExam = exams.find(e => e.exam_name.toLowerCase().includes('second trial') && e.exam_name.toLowerCase().includes('grade 6'))!;

  const contributing = [opExam, stExam, ttExam].filter(Boolean) as any[];

  const ttMarks = await api.fetchMarksForExam(ttExam.id);
  const opMarks = await api.fetchMarksForExam(opExam.id);
  const stMarks = await api.fetchMarksForExam(stExam.id);
  const allMarks = [...ttMarks, ...opMarks, ...stMarks];

  const g6Class = classes.find(c => {
    const n = (c as any).class_name || (c as any).name || '';
    return n.toLowerCase().includes('grade 6');
  })!;

  const grade6Students = students.filter(s => s.class_id === g6Class.id);

  // Exact replication of TerminalResultsView gradeCohortEntries:
  const gradeCohortEntries: LearnerCohortEntry[] = [];
  for (const st of grade6Students) {
    const rawScoped = getLearnerReportSubjects(st, g6Class, subjects, teachers);
    const seenIds = new Set<string>();
    const uniqueSubjs: any[] = [];
    for (const sb of rawScoped) {
      if (sb && sb.id && !seenIds.has(sb.id)) {
        seenIds.add(sb.id);
        uniqueSubjs.push(sb);
      }
    }
    const stSubjects = resolveUpperPrimaryTerminalSubjects(uniqueSubjs.length > 0 ? uniqueSubjs : subjects, contributing);

    const candidateMarks = allMarks.filter(m => m.student_id === st.id);
    const stResults = calculateLearnerTerminalResults({
      learnerId: st.id,
      subjectIds: stSubjects.map(s => s.id),
      contributingAssessments: contributing,
      marks: candidateMarks,
      grades,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      subjects,
    });

    gradeCohortEntries.push({
      student: st,
      classStream: g6Class,
      applicableSubjects: stSubjects,
      resultsBySubject: stResults,
    });
  }

  const applicableSubjects = resolveUpperPrimaryTerminalSubjects(subjects, contributing);

  // Call calculateCohortAssessmentRankings:
  const cohortAssessmentRankings = calculateCohortAssessmentRankings({
    contributingAssessments: contributing,
    applicableSubjects,
    cohortLearners: gradeCohortEntries,
    classes,
    isProvisionalMode: false,
  });

  console.log('cohortAssessmentRankings calculated for', cohortAssessmentRankings.size, 'learners');

  for (const st of grade6Students) {
    const r = cohortAssessmentRankings.get(st.id);
    if (!r) continue;
    const tt = r[ttExam.id];
    const op = r[opExam.id];
    const st_ = r[stExam.id];

    if (op?.totalMarks === 584 || tt?.totalMarks === 755 || tt?.totalMarks === 584 || (tt?.totalMarks && tt?.totalMarks > 600)) {
      console.log(`Student ${st.admission_number}: Opener=${op?.totalMarks}/${op?.maxMarks}, 2ndTrial=${st_?.totalMarks}/${st_?.maxMarks}, 3rdTrial=${tt?.totalMarks}/${tt?.maxMarks}`);
    }
  }
}
main().catch(console.error);
