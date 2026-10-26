import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(url, key);

async function probeClassesAndStudents() {
  const { data: classes } = await supabase.from('classes').select('*');
  console.log('Classes count:', classes?.length);
  classes?.forEach(c => console.log(`Class: id=${c.id}, name="${c.class_name}", education_level="${c.education_level}"`));

  const { data: streams } = await supabase.from('streams').select('*');
  console.log('\nStreams count:', streams?.length);
  streams?.forEach(s => console.log(`Stream: id=${s.id}, class_id=${s.class_id}, name="${s.stream_name}"`));

  // Check unique values of grade or class_id in students table
  const { data: students } = await supabase.from('students').select('id, admission_number, full_name, grade, class_id, stream_id, active, enrolment_status');
  console.log('\nTotal students count:', students?.length);
  
  const gradeCounts = new Map<string, number>();
  const classIdCounts = new Map<string, number>();
  students?.forEach(s => {
    gradeCounts.set(s.grade, (gradeCounts.get(s.grade) || 0) + 1);
    classIdCounts.set(s.class_id, (classIdCounts.get(s.class_id) || 0) + 1);
  });
  console.log('\nStudent counts by s.grade:');
  for (const [grade, count] of gradeCounts.entries()) {
    console.log(`  "${grade}": ${count}`);
  }
  console.log('\nStudent counts by s.class_id:');
  for (const [classId, count] of classIdCounts.entries()) {
    const cls = classes?.find(c => c.id === classId);
    console.log(`  class_id="${classId}" (${cls?.class_name}): ${count}`);
  }

  // Check the approved_classes of Grade 9 exams:
  // From previous run:
  // Exam: id="d510e285-d5b9-4a42-9bd1-94ffbb3587ce", name="GRADE 9 KJSEA SECOND TRIAL TERM 3 2026", status="Approved", approved_classes=["95e8ff02-6d67-433f-a417-2d74e2012793","3d0ecb00-3e0f-425a-8d69-59f6c9f18b40"]
  // Exam: id="d6817f6e-16aa-415a-a985-fe139eb39582", name="GRADE 9 KJSEA THIRD TRIAL TERM 3 2026", status="Approved", approved_classes=["95e8ff02-6d67-433f-a417-2d74e2012793","3d0ecb00-3e0f-425a-8d69-59f6c9f18b40"]
  // Exam: id="0b7d0d82-2014-4d55-a067-d045b3b289e2", name="Grade 9 Opener Assessment Term 3 2026", status="Provisional", approved_classes=["95e8ff02-6d67-433f-a417-2d74e2012793","3d0ecb00-3e0f-425a-8d69-59f6c9f18b40","c061fdba-fa77-46d2-a63c-d6d8ec2e99c6"]

  console.log('\nCheck approved_classes streams:');
  const stream1 = streams?.find(s => s.id === '95e8ff02-6d67-433f-a417-2d74e2012793');
  const stream2 = streams?.find(s => s.id === '3d0ecb00-3e0f-425a-8d69-59f6c9f18b40');
  console.log('Stream 95e8ff02-6d67-433f-a417-2d74e2012793:', stream1, 'Class:', classes?.find(c => c.id === stream1?.class_id));
  console.log('Stream 3d0ecb00-3e0f-425a-8d69-59f6c9f18b40:', stream2, 'Class:', classes?.find(c => c.id === stream2?.class_id));

  // Check students in those streams:
  const stInStream1 = students?.filter(s => s.stream_id === '95e8ff02-6d67-433f-a417-2d74e2012793');
  const stInStream2 = students?.filter(s => s.stream_id === '3d0ecb00-3e0f-425a-8d69-59f6c9f18b40');
  console.log(`Students in stream 95e8ff02...: ${stInStream1?.length}`);
  if (stInStream1 && stInStream1.length > 0) {
    console.log('Sample student in stream 1:', stInStream1[0]);
  }
  console.log(`Students in stream 3d0ecb00...: ${stInStream2?.length}`);
  if (stInStream2 && stInStream2.length > 0) {
    console.log('Sample student in stream 2:', stInStream2[0]);
  }

  // Also check marks for these exam IDs:
  const examIds = ['d510e285-d5b9-4a42-9bd1-94ffbb3587ce', 'd6817f6e-16aa-415a-a985-fe139eb39582', '0b7d0d82-2014-4d55-a067-d045b3b289e2'];
  for (const exId of examIds) {
    const { count: exMarksCount } = await supabase.from('marks').select('*', { count: 'exact', head: true }).eq('exam_id', exId);
    console.log(`Marks count for exam ${exId}: ${exMarksCount}`);
  }
}

probeClassesAndStudents().catch(console.error);
