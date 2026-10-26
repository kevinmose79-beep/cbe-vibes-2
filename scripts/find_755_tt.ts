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
  const stMarks = await api.fetchMarksForExam(stExam.id);
  const allMarks = [...ttMarks, ...opMarks, ...stMarks];

  const g6Class = classes.find(c => {
    const n = (c as any).class_name || (c as any).name || '';
    return n.toLowerCase().includes('grade 6');
  })!;

  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, contributing, { classObj: g6Class });

  for (const st of students.filter(s => s.class_id === g6Class.id)) {
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

    // Let's reconstruct marks exactly as calculateCohortAssessmentRankings does:
    const marks: any[] = [];
    const seenMarkKeys = new Set<string>();

    for (const sb of upSubjects) {
      const res = resultsBySubject.get(sb.id);
      if (!res) continue;
      for (const trail of res.assessmentTrail || []) {
        if (trail.notApplicable || (trail as any).isApplicable === false) continue;
        const key = `m_${trail.examId}_${st.id}_${sb.id}`;
        if (!seenMarkKeys.has(key)) {
          seenMarkKeys.add(key);
          marks.push({
            id: key,
            exam_id: trail.examId,
            student_id: st.id,
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

    // Now test calculateExamResults on Third Trial using these marks:
    const examClass = g6Class;
    const examApplicableSubjects = resolveUpperPrimaryTerminalSubjects(upSubjects, [ttExam], { classObj: examClass });

    const examResults = calculateExamResults(
      ttExam.id,
      [st],
      marks,
      CBE_8_POINT_GRADES,
      [g6Class],
      examApplicableSubjects,
      ttExam as any
    );

    const r = examResults[0];
    if (r && r.total_marks > 500) {
      console.log(`Adm ${st.admission_number}: total=${r.total_marks}/${r.total_max_marks}, subj_count=${r.subject_count}`);
    }
  }
}
main().catch(console.error);
