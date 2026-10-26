process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';
import { getApplicableSubjectsForGrade } from '../src/types.ts';
import { resolveUpperPrimaryTerminalSubjects } from '../src/services/terminalResultsEngine.ts';

async function main() {
  await syncFromSupabase();
  const subjects = api.getSubjects();
  const exams = api.getExaminations();
  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'));
  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'));
  const stExam = exams.find(e => e.exam_name.toLowerCase().includes('second trial') && e.exam_name.toLowerCase().includes('grade 6'));

  const contributing = [opExam, stExam, ttExam].filter(Boolean) as any[];

  const applicable = getApplicableSubjectsForGrade('Grade 6', subjects);
  console.log('getApplicableSubjectsForGrade(Grade 6):', applicable.map(s => `${s.subject_code} (${s.id})`));

  const resolved = resolveUpperPrimaryTerminalSubjects(applicable, contributing);
  console.log('resolveUpperPrimaryTerminalSubjects:', resolved.map(s => `${s.subject_code} (${s.id})`));
}
main().catch(console.error);
