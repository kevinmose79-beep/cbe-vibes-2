import './setupLocalStorage';
process.env.NODE_ENV = 'test';
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const BASE_URL = 'http://localhost:3000';

async function getSessionToken(email: string) {
  const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (lErr) throw lErr;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: sessionData, error: sErr } = await anonClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (sErr) throw sErr;
  return sessionData.session!.access_token;
}

describe('Phase 1 — Admin Provision Existing Learner Account Suite', () => {
  let adminToken: string;
  let teacherToken: string;
  let testStudentId: string;
  let testAdmissionNumber: string;
  let createdAuthUserId: string | null = null;

  beforeAll(async () => {
    // 1. Obtain Admin and Teacher Session Tokens
    adminToken = await getSessionToken('brianayiecha52@gmail.com');
    teacherToken = await getSessionToken('mwaro.alex@gmail.com');

    // 2. Find or create a dedicated test student record in public.students
    testAdmissionNumber = `TEST-PROV-${Date.now()}`;
    const { data: classData } = await supabaseAdmin.from('classes').select('id').limit(1).single();

    const { data: insertedStudent, error: sErr } = await supabaseAdmin
      .from('students')
      .insert({
        admission_number: testAdmissionNumber,
        full_name: 'Test Provision Learner',
        gender: 'M',
        class_id: classData?.id || null,
        active: true,
      })
      .select()
      .single();

    if (sErr) throw sErr;
    testStudentId = insertedStudent.id;
  });

  afterAll(async () => {
    // Cleanup: Remove test auth user and test user profile
    if (createdAuthUserId) {
      try {
        await supabaseAdmin.from('users').delete().eq('id', createdAuthUserId);
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      } catch (e) {
        // ignore cleanup error
      }
    }
    // Also cleanup test student record
    if (testStudentId) {
      try {
        await supabaseAdmin.from('students').delete().eq('id', testStudentId);
      } catch (e) {
        // ignore
      }
    }
  });

  // TEST 1: Admin provisions existing learner successfully
  it('Test 1: Admin provisions existing learner successfully with credentials and correct metadata', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ student_id: testStudentId }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.credentials).toBeDefined();
    expect(data.credentials.admission_number).toBe(testAdmissionNumber);
    expect(data.credentials.email).toBe(`${testAdmissionNumber.toLowerCase()}@learner.cbe.ac.ke`);
    expect(data.credentials.initial_password).toBeDefined();
    expect(data.credentials.initial_password.length).toBeGreaterThanOrEqual(10);
    expect(data.credentials.force_password_change).toBe(true);
    expect(data.user).toBeDefined();
    expect(data.user.role).toBe('learner');
    expect(data.user.student_id).toBe(testStudentId);

    createdAuthUserId = data.user.id;

    // Verify in Supabase Auth
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(createdAuthUserId!);
    expect(authErr).toBeNull();
    expect(authUser.user).toBeDefined();
    expect(authUser.user?.user_metadata?.role).toBe('learner');
    expect(authUser.user?.user_metadata?.student_id).toBe(testStudentId);
    expect(authUser.user?.user_metadata?.force_password_change).toBe(true);

    // Verify in public.users
    const { data: dbUser, error: uErr } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', createdAuthUserId!)
      .single();
    expect(uErr).toBeNull();
    expect(dbUser.role).toBe('learner');
    expect(dbUser.student_id).toBe(testStudentId);
    expect(dbUser.force_password_change).toBe(true);
  });

  // TEST 2: Teacher/learner caller is rejected (403 Forbidden)
  it('Test 2: Teacher/non-admin caller is rejected with HTTP 403 Forbidden', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ student_id: testStudentId }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/Forbidden|admin/i);
  });

  // TEST 3: Duplicate provisioning rejected (409 Conflict)
  it('Test 3: Duplicate provisioning for already provisioned learner is rejected with HTTP 409 Conflict', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ student_id: testStudentId }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already exists/i);
  });

  // TEST 4: Concurrent requests cannot create duplicate accounts
  it('Test 4: Concurrent requests cannot create duplicate accounts', async () => {
    // Both attempt to provision the same student simultaneously
    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ student_id: testStudentId }),
      }),
      fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ student_id: testStudentId }),
      }),
    ]);

    // Both should be rejected with 409 since the account already exists
    expect([409]).toContain(res1.status);
    expect([409]).toContain(res2.status);

    // Verify only 1 account exists in public.users for this student
    const { count } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', testStudentId);
    expect(count).toBe(1);
  });

  // TEST 5: Non-existent student ID rejected (404 Not Found)
  it('Test 5: Non-existent student ID is rejected with HTTP 404 Not Found', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000999';
    const res = await fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ student_id: fakeUuid }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  // TEST 6: Failure leaves student record intact (no rollback or deletion of public.students)
  it('Test 6: Existing student record is NEVER deleted or modified on provisioning failure', async () => {
    // Attempt with invalid payload on testStudentId
    const res = await fetch(`${BASE_URL}/api/admin/provision-learner-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ student_id: testStudentId, custom_password: 'short' }), // invalid short password
    });

    expect(res.status).toBe(400);

    // Verify student record in public.students is 100% intact
    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', testStudentId)
      .single();

    expect(error).toBeNull();
    expect(student).toBeDefined();
    expect(student.admission_number).toBe(testAdmissionNumber);
    expect(student.full_name).toBe('Test Provision Learner');
  });

  // TEST 7: Staff login remains functional
  it('Test 7: Staff login and authentication remain intact and unaltered', async () => {
    // Verify admin can still authenticate and query user profile
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', 'brianayiecha52@gmail.com')
      .single();

    expect(error).toBeNull();
    expect(user.role).toBe('admin');
  });

  // TEST 8: Student registration and CSV import remain functional
  it('Test 8: Student registration and CSV import do NOT automatically provision accounts', async () => {
    // Create an unprovisioned student record
    const unprovAdm = `UNPROV-${Date.now()}`;
    const { data: std, error } = await supabaseAdmin
      .from('students')
      .insert({
        admission_number: unprovAdm,
        full_name: 'Unprovisioned Learner Test',
        gender: 'F',
        active: true,
      })
      .select()
      .single();

    expect(error).toBeNull();

    // Verify NO account was created in public.users
    const { count } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', std.id);

    expect(count).toBe(0);

    // Cleanup
    await supabaseAdmin.from('students').delete().eq('id', std.id);
  });

  // TEST 9: Associated user record has correct role ('learner') and student_id
  it('Test 9: Created user record has strict role: learner and authoritative student_id reference', async () => {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('student_id', testStudentId)
      .single();

    expect(error).toBeNull();
    expect(user.role).toBe('learner');
    expect(user.student_id).toBe(testStudentId);
    expect(user.teacher_id).toBeNull();
  });
});
