import { performance } from 'perf_hooks';
import jsPDF from 'jspdf';
import {
  createReportCardPDFDoc,
  downloadAllReportCardsCombinedPDF,
  PDFReportData,
} from '../src/services/pdfReportGenerator';
import {
  calculateExamResults,
  calculateSubjectRank,
  rankingPerformanceStats,
  CBE_8_POINT_GRADES,
} from '../src/services/analysisEngine';
import { Student, School, Examination, ClassStream, Subject, Mark } from '../types';

const PDFClass = (jsPDF as any).jsPDF || (jsPDF as any).default || jsPDF;

const school: School = {
  id: 'sch_1',
  school_name: 'St. Teresa CBE Academy',
  motto: 'Strive for Excellence',
  address: 'P.O. Box 100, Nairobi',
  phone: '0712345678',
  email: 'info@stteresa.ac.ke',
  county: 'Nairobi',
};

const classes: ClassStream[] = [
  { id: 'c_g8_blue', class_name: 'Grade 8', stream: 'Blue', education_level: 'Junior School', stream_id: 'str_g8_blue' },
  { id: 'c_g8_red', class_name: 'Grade 8', stream: 'Red', education_level: 'Junior School', stream_id: 'str_g8_red' },
  { id: 'c_g5_blue', class_name: 'Grade 5', stream: 'Blue', education_level: 'Upper Primary', stream_id: 'str_g5_blue' },
];

const jsSubjects: Subject[] = [
  { id: 'sb_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_ss', subject_name: 'Social Studies', subject_code: 'SS', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_cre', subject_name: 'CRE', subject_code: 'CRE', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_agr', subject_name: 'Agriculture', subject_code: 'AGR', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_pre', subject_name: 'Pre-Technical Studies', subject_code: 'PRE-TECH', category: 'Core', education_level: 'Junior School' },
  { id: 'sb_cas', subject_name: 'Creative Arts & Sports', subject_code: 'CAS', category: 'Core', education_level: 'Junior School' },
];

const upSubjects: Subject[] = [
  { id: 'sb_up_eng', subject_name: 'English Language', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_comp', subject_name: 'English Composition', subject_code: 'COMP', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_kis', subject_name: 'Kiswahili Lugha', subject_code: 'KIS', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_insha', subject_name: 'Kiswahili Insha', subject_code: 'INSHA', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_cas', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_ss_cre', subject_name: 'Social Studies & CRE', subject_code: 'SS&CRE', category: 'Core', education_level: 'Upper Primary' },
];

const jsExam: Examination = {
  id: 'ex_js_opener_2026',
  exam_name: 'Opener Assessment Term 1 2026',
  term: 'Term 1',
  year: 2026,
  status: 'Approved',
  education_level: 'Junior School',
};

const upExam: Examination = {
  id: 'ex_up_opener_2026',
  exam_name: 'Opener Assessment Term 1 2026',
  term: 'Term 1',
  year: 2026,
  status: 'Approved',
  education_level: 'Upper Primary',
  assessment_structure: 'Composite',
};

function createMockStudentsAndMarks(count: number, isUpperPrimary = false) {
  const students: Student[] = [];
  const marks: Mark[] = [];
  const classObj = isUpperPrimary ? classes[2] : classes[0];
  const subjList = isUpperPrimary ? upSubjects : jsSubjects;
  const exam = isUpperPrimary ? upExam : jsExam;

  for (let i = 1; i <= count; i++) {
    const sId = `st_${isUpperPrimary ? 'up' : 'js'}_${i}`;
    const adm = `ADM-${isUpperPrimary ? '5' : '8'}${String(i).padStart(3, '0')}`;
    students.push({
      id: sId,
      admission_number: adm,
      first_name: `Student${i}`,
      last_name: isUpperPrimary ? 'UP' : 'JS',
      full_name: `Student${i} ${isUpperPrimary ? 'UP' : 'JS'}`,
      class_id: classObj.id,
      stream_id: classObj.stream_id,
      grade: classObj.class_name as any,
      active: true,
      enrolment_status: 'active',
    });

    subjList.forEach((sub, sIdx) => {
      const score = 35 + ((i * 7 + sIdx * 11) % 55);
      marks.push({
        id: `mk_${sId}_${sub.id}`,
        student_id: sId,
        subject_id: sub.id,
        exam_id: exam.id,
        score,
        marks: score,
        raw_score: score,
        out_of: 100,
        special_status: 'Normal',
      });
    });
  }

  if (!isUpperPrimary) {
    for (let i = 1; i <= count; i++) {
      const sId = `st_js_red_${i}`;
      const adm = `ADM-8R${String(i).padStart(3, '0')}`;
      students.push({
        id: sId,
        admission_number: adm,
        first_name: `Student${i}`,
        last_name: 'Red',
        full_name: `Student${i} Red`,
        class_id: classes[1].id,
        stream_id: classes[1].stream_id,
        grade: 'Grade 8',
        active: true,
        enrolment_status: 'active',
      });
      jsSubjects.forEach((sub, sIdx) => {
        const score = 30 + ((i * 9 + sIdx * 5) % 60);
        marks.push({
          id: `mk_${sId}_${sub.id}`,
          student_id: sId,
          subject_id: sub.id,
          exam_id: exam.id,
          score,
          marks: score,
          raw_score: score,
          out_of: 100,
          special_status: 'Normal',
        });
      });
    }
  }

  return { students, marks, targetStudents: students.filter((s) => s.stream_id === classObj.stream_id) };
}

async function runBenchmark() {
  console.log('=== MEASURED PERFORMANCE BENCHMARK (POST-FIX) ===');

  // 1. Junior School Batch of 45 students
  const jsData = createMockStudentsAndMarks(45, false);
  const jsPDFDataList: PDFReportData[] = jsData.targetStudents.map((std) => ({
    student: std,
    school,
    exam: jsExam,
    classes,
    subjects: jsSubjects,
    marks: jsData.marks,
    grades: CBE_8_POINT_GRADES,
    allStudents: jsData.students,
  }));

  rankingPerformanceStats.reset();
  const t0 = performance.now();
  await downloadAllReportCardsCombinedPDF(jsPDFDataList);
  const tJS = performance.now() - t0;
  console.log(`Junior School (45 learners batch):`);
  console.log(`  downloadAllReportCardsCombinedPDF elapsed: ${tJS.toFixed(2)} ms`);
  console.log(`  calculateSubjectRank calls during batch: ${rankingPerformanceStats.calculateSubjectRankCalls}`);
  console.log(`  batchCohortSubjectRanksCalls: ${rankingPerformanceStats.batchCohortSubjectRanksCalls}`);

  // 2. Upper Primary Batch of 45 students
  const upData = createMockStudentsAndMarks(45, true);
  const upPDFDataList: PDFReportData[] = upData.targetStudents.map((std) => ({
    student: std,
    school,
    exam: upExam,
    classes,
    subjects: upSubjects,
    marks: upData.marks,
    grades: CBE_8_POINT_GRADES,
    allStudents: upData.students,
  }));

  rankingPerformanceStats.reset();
  const t1 = performance.now();
  await downloadAllReportCardsCombinedPDF(upPDFDataList);
  const tUP = performance.now() - t1;
  console.log(`Upper Primary (45 learners batch):`);
  console.log(`  downloadAllReportCardsCombinedPDF elapsed: ${tUP.toFixed(2)} ms`);
  console.log(`  calculateSubjectRank calls during batch: ${rankingPerformanceStats.calculateSubjectRankCalls}`);
  console.log(`  batchCohortSubjectRanksCalls: ${rankingPerformanceStats.batchCohortSubjectRanksCalls}`);

  // 3. Verify single learner report card still calculates ranks correctly
  rankingPerformanceStats.reset();
  const singleStudentDoc = await createReportCardPDFDoc(jsPDFDataList[0]);
  console.log(`Single Learner Standalone Report Card:`);
  console.log(`  Pages generated: ${singleStudentDoc.getNumberOfPages()}`);
  console.log(`  calculateSubjectRank calls (fallback for standalone): ${rankingPerformanceStats.calculateSubjectRankCalls}`);
}

runBenchmark().catch(console.error);
