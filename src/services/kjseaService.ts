/**
 * KJSEA (Kenya Junior School Education Assessment) Service Layer
 * 
 * Provides typed access to the live Supabase KJSEA tables and verified RPC functions.
 * 
 * CRITICAL ARCHITECTURAL CONTRACT:
 * 1. Single source of truth: Supabase database is authoritative.
 * 2. All privileged lifecycle mutations run strictly through verified RPC functions.
 *    No direct table inserts, updates, or deletes are performed from the frontend.
 * 3. Reuses the existing Supabase singleton client (getSupabaseClient) from '../lib/storage'.
 * 4. Database enforces security definer permissions, immutability, and calculations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/storage';
import {
  KJSEAExamYear,
  KJSEAExamYearStatus,
  KJSEALearningArea,
  KJSEAStudentResult,
  KJSEALevelEntry,
  KJSEAStudentResultWithEntries,
  KJSEAAuditLog,
  KJSEADraftEntryPayload,
  KJSEAServiceResponse,
  validateKJSEADraftEntries,
  validateMandatoryReason,
} from '../types/kjsea';

export class KJSEAService {
  /**
   * Helper to resolve the authenticated Supabase client singleton.
   */
  private getClient(): SupabaseClient {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client is not initialized. Please verify database connectivity.');
    }
    return client;
  }

  /**
   * Translates PostgreSQL / Supabase errors into consistent human-readable responses.
   */
  private handleError(error: unknown, fallbackMessage: string): KJSEAServiceResponse<never> {
    const err = error as { code?: string; message?: string; details?: string };
    const rawMessage = err?.message || fallbackMessage;
    const code = err?.code;

    let userFriendlyMessage = rawMessage;

    if (code === '42501' || rawMessage.toLowerCase().includes('permission denied')) {
      userFriendlyMessage = 'You do not have administrative permission to perform this KJSEA action.';
    } else if (code === '23505' || rawMessage.toLowerCase().includes('unique constraint')) {
      userFriendlyMessage = 'A duplicate record already exists in the KJSEA database.';
    } else if (rawMessage.includes('Could not find the function')) {
      userFriendlyMessage = 'Database function signature mismatch. Please contact system administrator.';
    }

    return {
      success: false,
      error: {
        code,
        message: userFriendlyMessage,
        details: err?.details || rawMessage,
      },
    };
  }

  // ==============================================================================
  // 1. Examination Years
  // ==============================================================================

  /**
   * Lists all KJSEA examination years ordered by calendar year descending.
   */
  async listExamYears(): Promise<KJSEAServiceResponse<KJSEAExamYear[]>> {
    try {
      const client = this.getClient();
      const { data, error } = await client
        .from('kjsea_exam_years')
        .select('*')
        .order('exam_year', { ascending: false });

      if (error) {
        return this.handleError(error, 'Failed to fetch examination years.');
      }

      return {
        success: true,
        data: (data || []) as KJSEAExamYear[],
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error fetching examination years.');
    }
  }

  /**
   * Creates a new examination year via the verified RPC kjsea_create_exam_year.
   */
  async createExamYear(examYear: number): Promise<KJSEAServiceResponse<string>> {
    try {
      if (!Number.isInteger(examYear) || examYear < 2020 || examYear > 2050) {
        return {
          success: false,
          error: {
            message: 'Invalid examination year. Must be a 4-digit calendar year between 2020 and 2050.',
          },
        };
      }

      const client = this.getClient();
      const { data, error } = await client.rpc('kjsea_create_exam_year', {
        p_exam_year: examYear,
      });

      if (error) {
        return this.handleError(error, `Failed to create examination year ${examYear}.`);
      }

      return {
        success: true,
        data: typeof data === 'string' ? data : String(data ?? ''),
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error creating examination year.');
    }
  }

  /**
   * Updates an examination year status (lowercase 'open' or 'closed').
   * Reopening or closing requires an audit reason in the database function.
   */
  async setExamYearStatus(
    examYearId: string,
    status: KJSEAExamYearStatus,
    reason?: string
  ): Promise<KJSEAServiceResponse<boolean>> {
    try {
      if (status !== 'open' && status !== 'closed') {
        return {
          success: false,
          error: { message: 'Invalid status. Examination year status must be "open" or "closed".' },
        };
      }

      // Check reason if reopening a closed year
      if (status === 'open' && reason) {
        const reasonVal = validateMandatoryReason(reason, 'Reopening examination year');
        if (!reasonVal.isValid) {
          return { success: false, error: { message: reasonVal.error! } };
        }
      }

      const client = this.getClient();
      const { data, error } = await client.rpc('kjsea_set_exam_year_status', {
        p_exam_year_id: examYearId,
        p_status: status,
        p_reason: reason ? reason.trim() : '',
      });

      if (error) {
        return this.handleError(error, `Failed to update examination year status to ${status}.`);
      }

      return {
        success: true,
        data: Boolean(data ?? true),
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error setting examination year status.');
    }
  }

  // ==============================================================================
  // 2. Learning Areas
  // ==============================================================================

  /**
   * Lists active KJSEA learning areas ordered by display_order.
   */
  async listLearningAreas(): Promise<KJSEAServiceResponse<KJSEALearningArea[]>> {
    try {
      const client = this.getClient();
      const { data, error } = await client
        .from('kjsea_learning_areas')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        return this.handleError(error, 'Failed to fetch KJSEA learning areas.');
      }

      return {
        success: true,
        data: (data || []) as KJSEALearningArea[],
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error fetching learning areas.');
    }
  }

  // ==============================================================================
  // 3. Grade 9 Learners & Stream Context
  // ==============================================================================

  /**
   * Retrieves active Grade 9 learners using the established authorized data-access patterns.
   * Joins public.students with public.classes and public.streams where classes.grade_level = 9.
   */
  async getGrade9Learners(): Promise<
    KJSEAServiceResponse<
      Array<{
        id: string;
        admission_number: string;
        full_name: string;
        gender: 'M' | 'F';
        class_id: string;
        class_name: string;
        stream_id?: string;
        stream_name?: string;
        active: boolean;
      }>
    >
  > {
    try {
      const client = this.getClient();
      const { data, error } = await client
        .from('students')
        .select(`
          id,
          admission_number,
          full_name,
          gender,
          class_id,
          stream_id,
          active,
          classes:class_id (
            id,
            class_name,
            grade_level
          ),
          streams:stream_id (
            id,
            stream_name
          )
        `)
        .eq('active', true)
        .order('full_name', { ascending: true });

      if (error) {
        return this.handleError(error, 'Failed to fetch students.');
      }

      // Filter in-memory to ensure classes.grade_level = 9
      const grade9Students = (data || [])
        .filter((row: any) => {
          const cls = row.classes;
          if (!cls) return false;
          return Number(cls.grade_level) === 9;
        })
        .map((row: any) => ({
          id: row.id,
          admission_number: row.admission_number,
          full_name: row.full_name,
          gender: row.gender,
          class_id: row.class_id,
          class_name: row.classes?.class_name || 'Grade 9',
          stream_id: row.stream_id || undefined,
          stream_name: row.streams?.stream_name || 'Unassigned',
          active: Boolean(row.active),
        }));

      return {
        success: true,
        data: grade9Students,
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error fetching Grade 9 learners.');
    }
  }

  // ==============================================================================
  // 4. Student Results Lifecycle & RPC Operations
  // ==============================================================================

  /**
   * Gets or initializes a learner's result record for a given examination year.
   * If a record already exists, it is returned.
   * Otherwise, calls the verified RPC kjsea_create_student_result.
   */
  async getOrCreateStudentResult(
    examYearId: string,
    studentId: string
  ): Promise<KJSEAServiceResponse<KJSEAStudentResult>> {
    try {
      const client = this.getClient();

      // 1. Check if record already exists
      const { data: existing, error: fetchErr } = await client
        .from('kjsea_student_results')
        .select('*')
        .eq('exam_year_id', examYearId)
        .eq('student_id', studentId)
        .maybeSingle();

      if (fetchErr) {
        return this.handleError(fetchErr, 'Failed checking existing student result.');
      }

      if (existing) {
        return {
          success: true,
          data: existing as KJSEAStudentResult,
        };
      }

      // 2. Initialize via verified RPC kjsea_create_student_result
      const { data: createdId, error: rpcErr } = await client.rpc('kjsea_create_student_result', {
        p_exam_year_id: examYearId,
        p_student_id: studentId,
      });

      if (rpcErr) {
        return this.handleError(rpcErr, 'Failed to create student result via RPC.');
      }

      // 3. Fetch newly created record
      const resultId = typeof createdId === 'string' ? createdId : String(createdId);
      const { data: newRow, error: verifyErr } = await client
        .from('kjsea_student_results')
        .select('*')
        .eq('id', resultId)
        .single();

      if (verifyErr || !newRow) {
        return this.handleError(verifyErr, 'Student result was created but could not be retrieved.');
      }

      return {
        success: true,
        data: newRow as KJSEAStudentResult,
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error getting or creating student result.');
    }
  }

  /**
   * Retrieves a student result along with all associated learning area level entries.
   */
  async getResultWithEntries(
    resultId: string
  ): Promise<KJSEAServiceResponse<KJSEAStudentResultWithEntries>> {
    try {
      const client = this.getClient();

      // 1. Fetch parent result and child entries concurrently in parallel
      const [resResult, entriesResult] = await Promise.all([
        client.from('kjsea_student_results').select('*').eq('id', resultId).single(),
        client.from('kjsea_level_entries').select('*').eq('student_result_id', resultId),
      ]);

      if (resResult.error || !resResult.data) {
        return this.handleError(resResult.error, `Student result ${resultId} not found.`);
      }

      if (entriesResult.error) {
        return this.handleError(entriesResult.error, 'Failed to fetch learning area level entries.');
      }

      const result = resResult.data;
      const entries = entriesResult.data;

      // 2. Fetch learner demographic details
      const { data: student } = await client
        .from('students')
        .select(`
          id,
          admission_number,
          full_name,
          gender,
          class_id,
          stream_id,
          streams:stream_id (stream_name)
        `)
        .eq('id', result.student_id)
        .maybeSingle();

      const composite: KJSEAStudentResultWithEntries = {
        ...(result as KJSEAStudentResult),
        entries: (entries || []) as KJSEALevelEntry[],
        student: student
          ? {
              id: student.id,
              admission_number: student.admission_number,
              full_name: student.full_name,
              gender: student.gender,
              class_id: student.class_id,
              stream_id: student.stream_id || undefined,
              stream_name: (student.streams as any)?.stream_name,
            }
          : undefined,
      };

      return {
        success: true,
        data: composite,
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error retrieving student result with entries.');
    }
  }

  /**
   * Directly retrieves child level entries for a given student result.
   * Highly optimized: executes a single fast indexed query without redundant parent/student lookups.
   */
  async getLevelEntries(
    resultId: string
  ): Promise<KJSEAServiceResponse<KJSEALevelEntry[]>> {
    try {
      const client = this.getClient();
      const { data: entries, error } = await client
        .from('kjsea_level_entries')
        .select('*')
        .eq('student_result_id', resultId);

      if (error) {
        return this.handleError(error, 'Failed to fetch learning area level entries.');
      }

      return {
        success: true,
        data: (entries || []) as KJSEALevelEntry[],
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error fetching level entries.');
    }
  }

  /**
   * Retrieves all results for an examination year with their level entries.
   * Used for merit list generation and stream performance tables.
   */
  async getResultsForExamYear(
    examYearId: string
  ): Promise<KJSEAServiceResponse<KJSEAStudentResultWithEntries[]>> {
    try {
      const client = this.getClient();

      // 1. Fetch all parent results for this year
      const { data: results, error: resErr } = await client
        .from('kjsea_student_results')
        .select('*')
        .eq('exam_year_id', examYearId);

      if (resErr) {
        return this.handleError(resErr, 'Failed fetching student results for exam year.');
      }

      if (!results || results.length === 0) {
        return { success: true, data: [] };
      }

      const resultIds = results.map((r) => r.id);

      // 2. Fetch all child entries for these results in one query
      const { data: allEntries, error: entriesErr } = await client
        .from('kjsea_level_entries')
        .select('*')
        .in('student_result_id', resultIds);

      if (entriesErr) {
        return this.handleError(entriesErr, 'Failed fetching entries for student results.');
      }

      // Map entries to parent results
      const entriesByResultId = new Map<string, KJSEALevelEntry[]>();
      (allEntries || []).forEach((e: any) => {
        const list = entriesByResultId.get(e.student_result_id) || [];
        list.push(e as KJSEALevelEntry);
        entriesByResultId.set(e.student_result_id, list);
      });

      const composites: KJSEAStudentResultWithEntries[] = results.map((r: any) => ({
        ...(r as KJSEAStudentResult),
        entries: entriesByResultId.get(r.id) || [],
      }));

      return {
        success: true,
        data: composites,
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error fetching results for examination year.');
    }
  }

  /**
   * Saves draft entries via verified RPC kjsea_save_draft.
   * Input payload is strictly validated client-side first.
   * The database validates and calculates points authoritatively.
   */
  async saveDraft(
    resultId: string,
    entries: KJSEADraftEntryPayload[]
  ): Promise<KJSEAServiceResponse<boolean>> {
    try {
      // 1. Client-side input validation
      const validation = validateKJSEADraftEntries(entries);
      if (!validation.isValid) {
        return {
          success: false,
          error: { message: validation.error! },
        };
      }

      // 2. Format payload: Do NOT send points! Database calculates & validates points.
      const sanitizedEntries = entries.map((e) => ({
        subject_code: e.subject_code,
        status: e.status,
        achievement_level: e.status === 'Normal' ? e.achievement_level : null,
      }));

      // 3. Call verified RPC kjsea_save_draft
      const client = this.getClient();
      const { data, error } = await client.rpc('kjsea_save_draft', {
        p_result_id: resultId,
        p_entries: sanitizedEntries,
      });

      if (error) {
        return this.handleError(error, 'Failed to save draft entries via RPC.');
      }

      return {
        success: true,
        data: Boolean(data ?? true),
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error saving draft entries.');
    }
  }

  /**
   * Finalises a result via verified RPC kjsea_finalise_result.
   * A finalised result is locked and cannot be discarded as a draft.
   */
  async finaliseResult(resultId: string): Promise<KJSEAServiceResponse<boolean>> {
    try {
      const client = this.getClient();
      const { data, error } = await client.rpc('kjsea_finalise_result', {
        p_result_id: resultId,
      });

      if (error) {
        return this.handleError(error, 'Failed to finalise student result via RPC.');
      }

      return {
        success: true,
        data: Boolean(data ?? true),
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error finalising result.');
    }
  }

  /**
   * Reopens a finalised result via verified RPC kjsea_reopen_result.
   * Requires a non-empty audit reason.
   */
  async reopenResult(resultId: string, reason: string): Promise<KJSEAServiceResponse<boolean>> {
    try {
      const reasonVal = validateMandatoryReason(reason, 'Reopening a finalised result');
      if (!reasonVal.isValid) {
        return {
          success: false,
          error: { message: reasonVal.error! },
        };
      }

      const client = this.getClient();
      const { data, error } = await client.rpc('kjsea_reopen_result', {
        p_result_id: resultId,
        p_reason: reason.trim(),
      });

      if (error) {
        return this.handleError(error, 'Failed to reopen student result via RPC.');
      }

      return {
        success: true,
        data: Boolean(data ?? true),
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error reopening result.');
    }
  }

  /**
   * Discards an unfinalised draft via verified RPC kjsea_discard_draft.
   * Requires a non-empty audit reason. Finalised results cannot be discarded.
   */
  async discardDraft(resultId: string, reason: string): Promise<KJSEAServiceResponse<boolean>> {
    try {
      const reasonVal = validateMandatoryReason(reason, 'Discarding a draft');
      if (!reasonVal.isValid) {
        return {
          success: false,
          error: { message: reasonVal.error! },
        };
      }

      const client = this.getClient();
      const { data, error } = await client.rpc('kjsea_discard_draft', {
        p_result_id: resultId,
        p_reason: reason.trim(),
      });

      if (error) {
        return this.handleError(error, 'Failed to discard draft via RPC.');
      }

      return {
        success: true,
        data: Boolean(data ?? true),
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error discarding draft.');
    }
  }

  // ==============================================================================
  // 5. Audit Trail
  // ==============================================================================

  /**
   * Retrieves audit log history where user permissions permit.
   */
  async getAuditLogs(entityId?: string): Promise<KJSEAServiceResponse<KJSEAAuditLog[]>> {
    try {
      const client = this.getClient();
      let query = client
        .from('kjsea_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (entityId) {
        query = query.eq('entity_id', entityId);
      }

      const { data, error } = await query;

      if (error) {
        return this.handleError(error, 'Failed fetching audit logs.');
      }

      return {
        success: true,
        data: (data || []) as KJSEAAuditLog[],
      };
    } catch (err) {
      return this.handleError(err, 'Unexpected error fetching audit logs.');
    }
  }
}

// Export singleton service instance
export const kjseaService = new KJSEAService();
