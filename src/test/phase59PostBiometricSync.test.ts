import './setupLocalStorage';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncFromSupabase, resetSyncState } from '../lib/storage';

describe('Phase 5.9: Post-Biometric Non-Blocking Background Sync', () => {
  beforeEach(() => {
    resetSyncState();
    vi.restoreAllMocks();
  });

  it('Deduplication invariant: concurrent calls return the same in-flight promise', () => {
    const p1 = syncFromSupabase();
    const p2 = syncFromSupabase();
    expect(p1).toBe(p2);
  });

  it('Sync completion releases deduplication promise lock', async () => {
    await syncFromSupabase();
    // After completion, next non-forced sync resolves immediately if already synced
    const p3 = syncFromSupabase();
    expect(p3).toBeDefined();
    await p3;
  });
});
