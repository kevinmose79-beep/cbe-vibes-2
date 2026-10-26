import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Save,
  Check,
  RefreshCw,
  User as UserIcon,
  Calendar,
  Layers,
  Info,
  X,
  FileCheck,
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  UserCheck,
  Sparkles,
  ChevronRight,
  Plus,
  Download,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  KJSEAExamYear,
  KJSEASubjectCode,
  KJSEALearningAreaMeta,
  KJSEA_LEARNING_AREAS_META,
  KJSEAAchievementLevel,
  KJSEA_ACHIEVEMENT_LEVELS,
  KJSEA_LEVEL_POINTS_MAP,
  KJSEAEntryStatus,
  KJSEA_ENTRY_STATUSES,
  KJSEALevelEntry,
  KJSEADraftEntryPayload,
  KJSEAStudentResultWithEntries,
  getKJSEAPointsAdvisory,
  validateKJSEADraftEntries,
  validateMandatoryReason,
} from '../../types/kjsea';
import { kjseaService } from '../../services/kjseaService';
import { api } from '../../lib/storage';
import {
  exportKJSEAMeritListPDF,
  exportKJSEAMeritListExcel,
} from '../../services/kjseaMeritListExporter';

// ==============================================================================
// Constants & Metadata
// ==============================================================================

const LEARNING_AREA_DISPLAY_LABELS: Record<KJSEASubjectCode, string> = {
  ENG: '901 · ENGLISH',
  KIS: '902 · KISWAHILI',
  MATH: '903 · MATHEMATICS',
  'INT SCI': '905 · INTEGRATED SCIENCE',
  CAS: '911 · CREATIVE ARTS AND SPORTS',
  SST: '907 · SOCIAL STUDIES',
  CRE: '908 · CHRISTIAN RELIGIOUS EDUCATION (CRE)',
  AGN: '906 · AGRICULTURE',
  'PRE-TECH': '912 · PRE-TECHNICAL STUDIES',
};

interface LocalEntryState {
  subject_code: KJSEASubjectCode;
  status: KJSEAEntryStatus;
  achievement_level: KJSEAAchievementLevel | null;
  status_recorded: boolean;
}

interface Grade9Learner {
  id: string;
  admission_number: string;
  full_name: string;
  gender: 'M' | 'F';
  class_id: string;
  class_name: string;
  stream_id?: string;
  stream_name?: string;
  active: boolean;
}

interface UnsavedLearnerWork {
  entries: Record<KJSEASubjectCode, LocalEntryState>;
  isDirty: boolean;
  resultId: string | null;
  isFinalised: boolean;
  finalisedAt: string | null;
}

type PendingSwitch =
  | { type: 'student'; targetStudentId: string }
  | { type: 'stream'; targetStreamId: string }
  | { type: 'year'; targetYearId: string }
  | { type: 'nextStudent'; targetStudentId: string };

export const KjseaAdminManagement: React.FC = () => {
  // ----------------------------------------------------------------------------
  // 1. Two-Screen Navigation State: 'selection' (Screen 1) | 'entry' (Screen 2)
  // ----------------------------------------------------------------------------
  const [activeScreen, setActiveScreen] = useState<'selection' | 'entry'>('selection');

  // ----------------------------------------------------------------------------
  // 2. Core Selection State
  // ----------------------------------------------------------------------------
  const [examYears, setExamYears] = useState<KJSEAExamYear[]>([]);
  const [selectedExamYearId, setSelectedExamYearId] = useState<string>('');

  const [allLearners, setAllLearners] = useState<Grade9Learner[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // ----------------------------------------------------------------------------
  // 3. Loading & UI Status
  // ----------------------------------------------------------------------------
  const [isLoadingYears, setIsLoadingYears] = useState<boolean>(true);
  const [isLoadingLearners, setIsLoadingLearners] = useState<boolean>(true);
  const [isLoadingResult, setIsLoadingResult] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isFinalising, setIsFinalising] = useState<boolean>(false);

  // Status banners & feedback
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  // ----------------------------------------------------------------------------
  // 4. Active Result State
  // ----------------------------------------------------------------------------
  const [currentResultId, setCurrentResultId] = useState<string | null>(null);
  const [isFinalised, setIsFinalised] = useState<boolean>(false);
  const [finalisedAt, setFinalisedAt] = useState<string | null>(null);

  // Unsaved changes tracking
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // In-memory cache for unsaved learner entries across screen navigation
  const [unsavedLearnerMap, setUnsavedLearnerMap] = useState<Record<string, UnsavedLearnerWork>>({});

  // Confirmation modal state for switching with unsaved changes
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState<boolean>(false);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);

  // 9 learning areas local form state initialized in exact order with 'Normal' status
  const createEmptyFormEntries = (): Record<KJSEASubjectCode, LocalEntryState> => {
    const initial: Partial<Record<KJSEASubjectCode, LocalEntryState>> = {};
    KJSEA_LEARNING_AREAS_META.forEach((meta) => {
      initial[meta.code] = {
        subject_code: meta.code,
        status: 'Normal',
        achievement_level: null,
        status_recorded: false,
      };
    });
    return initial as Record<KJSEASubjectCode, LocalEntryState>;
  };

  const [formEntries, setFormEntries] = useState<Record<KJSEASubjectCode, LocalEntryState>>(
    createEmptyFormEntries
  );

  // ----------------------------------------------------------------------------
  // 5. Reopen Modal State
  // ----------------------------------------------------------------------------
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [isReopening, setIsReopening] = useState<boolean>(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // ----------------------------------------------------------------------------
  // 5b. Dynamic Academic Year & Examination Year Creation / Status State
  // ----------------------------------------------------------------------------
  const [activeAcademicYear, setActiveAcademicYear] = useState<number>(() => {
    try {
      const ay = api.getActiveAcademicYear();
      return ay?.year || new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  });

  useEffect(() => {
    const handleSessionChanged = () => {
      try {
        const ay = api.getActiveAcademicYear();
        if (ay?.year) {
          setActiveAcademicYear(ay.year);
        }
      } catch {
        // Safe fallback
      }
    };
    window.addEventListener('session-changed', handleSessionChanged);
    return () => window.removeEventListener('session-changed', handleSessionChanged);
  }, []);

  // Creation modal state
  const [showCreateYearModal, setShowCreateYearModal] = useState<boolean>(false);
  const [proposedYearInput, setProposedYearInput] = useState<number>(activeAcademicYear);
  const [initialStatusChoice, setInitialStatusChoice] = useState<'open' | 'closed'>('open');
  const [isCreatingYear, setIsCreatingYear] = useState<boolean>(false);
  const [createYearError, setCreateYearError] = useState<string | null>(null);

  // Examination year open/close status modal state
  const [showYearStatusModal, setShowYearStatusModal] = useState<boolean>(false);
  const [targetYearStatus, setTargetYearStatus] = useState<'open' | 'closed'>('open');
  const [yearStatusReason, setYearStatusReason] = useState<string>('');
  const [isUpdatingYearStatus, setIsUpdatingYearStatus] = useState<boolean>(false);
  const [yearStatusError, setYearStatusError] = useState<string | null>(null);

  // ----------------------------------------------------------------------------
  // 5c. KJSEA Merit List Export States
  // ----------------------------------------------------------------------------
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [activeExportAction, setActiveExportAction] = useState<string | null>(null);

  // ----------------------------------------------------------------------------
  // 5d. Live Results Tracking for Current Exam Year
  // ----------------------------------------------------------------------------
  const [yearResults, setYearResults] = useState<KJSEAStudentResultWithEntries[]>([]);

  const refreshYearResults = useCallback(async (examYearId: string) => {
    if (!examYearId) {
      setYearResults([]);
      return;
    }
    try {
      const res = await kjseaService.getResultsForExamYear(examYearId);
      if (res.success && res.data) {
        setYearResults(res.data);
      }
    } catch {
      // Safe fallback
    }
  }, []);

  useEffect(() => {
    if (selectedExamYearId) {
      refreshYearResults(selectedExamYearId);
    } else {
      setYearResults([]);
    }
  }, [selectedExamYearId, refreshYearResults]);

  // ----------------------------------------------------------------------------
  // 6. Initial Data Hydration
  // ----------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setIsLoadingYears(true);
      setIsLoadingLearners(true);

      const [yearsRes, learnersRes] = await Promise.all([
        kjseaService.listExamYears(),
        kjseaService.getGrade9Learners(),
      ]);

      if (!isMounted) return;

      if (yearsRes.success && yearsRes.data) {
        setExamYears(yearsRes.data);
      } else {
        setFeedback({
          type: 'error',
          message: yearsRes.error?.message || 'Failed to load examination years from Supabase.',
        });
      }
      setIsLoadingYears(false);

      if (learnersRes.success && learnersRes.data) {
        setAllLearners(learnersRes.data);
      } else {
        setFeedback({
          type: 'error',
          message: learnersRes.error?.message || 'Failed to load Grade 9 learners.',
        });
      }
      setIsLoadingLearners(false);
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // ----------------------------------------------------------------------------
  // 7. Derived Entities & Cascades
  // ----------------------------------------------------------------------------
  const selectedExamYear = useMemo(() => {
    return examYears.find((y) => y.id === selectedExamYearId) || null;
  }, [examYears, selectedExamYearId]);

  const isExamYearClosed = useMemo(() => {
    return selectedExamYear?.status === 'closed';
  }, [selectedExamYear]);

  // Extract distinct streams from active Grade 9 learners with live learner counts
  const distinctStreams = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    allLearners.forEach((l) => {
      const streamId = l.stream_id || l.class_id;
      const streamName = l.stream_name || l.class_name || 'Grade 9 Stream';
      if (!map.has(streamId)) {
        map.set(streamId, {
          id: streamId,
          name: streamName,
          count: 0,
        });
      }
      map.get(streamId)!.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allLearners]);

  // Filter learners by selected stream
  const eligibleLearners = useMemo(() => {
    if (!selectedStreamId) return [];
    return allLearners.filter((l) => (l.stream_id || l.class_id) === selectedStreamId);
  }, [allLearners, selectedStreamId]);

  // Currently selected learner entity
  const selectedStudent = useMemo(() => {
    return allLearners.find((l) => l.id === selectedStudentId) || null;
  }, [allLearners, selectedStudentId]);

  // Next learner in the same stream (for Screen 2 quick progression)
  const nextEligibleStudent = useMemo(() => {
    if (!selectedStudentId || eligibleLearners.length === 0) return null;
    const currentIndex = eligibleLearners.findIndex((l) => l.id === selectedStudentId);
    if (currentIndex >= 0 && currentIndex < eligibleLearners.length - 1) {
      return eligibleLearners[currentIndex + 1];
    }
    return null;
  }, [eligibleLearners, selectedStudentId]);

  // Selected stream entity
  const selectedStream = useMemo(() => {
    return distinctStreams.find((s) => s.id === selectedStreamId) || null;
  }, [distinctStreams, selectedStreamId]);

  // ----------------------------------------------------------------------------
  // 8. Load / Restore Result on Selection
  // ----------------------------------------------------------------------------
  const loadLearnerResult = useCallback(
    async (examYearId: string, studentId: string) => {
      // Check if learner has unsaved edits in memory state
      const unsaved = unsavedLearnerMap[studentId];
      if (unsaved && unsaved.isDirty) {
        setFormEntries(unsaved.entries);
        setIsDirty(true);
        setCurrentResultId(unsaved.resultId);
        setIsFinalised(unsaved.isFinalised);
        setFinalisedAt(unsaved.finalisedAt);
        return;
      }

      setIsLoadingResult(true);
      setFeedback(null);
      setIsDirty(false);

      try {
        // 1. Get or create parent result record via RPC
        const initRes = await kjseaService.getOrCreateStudentResult(examYearId, studentId);
        if (!initRes.success || !initRes.data) {
          setFeedback({
            type: 'error',
            message: initRes.error?.message || 'Failed to initialize student result.',
          });
          setIsLoadingResult(false);
          return;
        }

        const parentResult = initRes.data;
        setCurrentResultId(parentResult.id);
        const finalised = Boolean(parentResult.finalised_at);
        setIsFinalised(finalised);
        setFinalisedAt(parentResult.finalised_at || null);

        // 2. Fetch child level entries directly via optimized query
        const detailsRes = await kjseaService.getLevelEntries(parentResult.id);
        if (!detailsRes.success || !detailsRes.data) {
          setFeedback({
            type: 'error',
            message: detailsRes.error?.message || 'Failed to load learning area entries.',
          });
          setIsLoadingResult(false);
          return;
        }

        const loadedEntries = detailsRes.data || [];
        const entryMap = new Map<string, KJSEALevelEntry>();
        loadedEntries.forEach((e) => entryMap.set(e.subject_code, e));

        // 3. Hydrate form state in exact 9 learning areas order
        const newFormState: Partial<Record<KJSEASubjectCode, LocalEntryState>> = {};
        KJSEA_LEARNING_AREAS_META.forEach((meta) => {
          const existing = entryMap.get(meta.code);
          if (existing) {
            // Default to 'Normal' if status is missing or was 'Pending' so achievement level buttons are immediately visible
            const status = (!existing.status || existing.status === 'Pending') ? 'Normal' : existing.status;
            newFormState[meta.code] = {
              subject_code: meta.code,
              status,
              achievement_level: existing.achievement_level,
              status_recorded: Boolean(existing.achievement_level || status !== 'Normal'),
            };
          } else {
            newFormState[meta.code] = {
              subject_code: meta.code,
              status: 'Normal', // Default is Normal for direct achievement level entry
              achievement_level: null,
              status_recorded: false,
            };
          }
        });

        setFormEntries(newFormState as Record<KJSEASubjectCode, LocalEntryState>);
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err?.message || 'An unexpected error occurred while loading results.',
        });
      } finally {
        setIsLoadingResult(false);
      }
    },
    [unsavedLearnerMap]
  );

  // Trigger result loading when both exam year and student are chosen
  useEffect(() => {
    if (selectedExamYearId && selectedStudentId) {
      loadLearnerResult(selectedExamYearId, selectedStudentId);
    } else {
      setCurrentResultId(null);
      setIsFinalised(false);
      setFinalisedAt(null);
      setIsDirty(false);
      setFormEntries(createEmptyFormEntries());
    }
  }, [selectedExamYearId, selectedStudentId, loadLearnerResult]);

  // ----------------------------------------------------------------------------
  // 9. Unsaved Changes Safe Preservation & Switching Flow
  // ----------------------------------------------------------------------------
  // Cache the current learner's unsaved form state into component state
  const stashCurrentLearnerWork = useCallback(() => {
    if (selectedStudentId) {
      setUnsavedLearnerMap((prev) => ({
        ...prev,
        [selectedStudentId]: {
          entries: formEntries,
          isDirty: isDirty,
          resultId: currentResultId,
          isFinalised: isFinalised,
          finalisedAt: finalisedAt,
        },
      }));
    }
  }, [selectedStudentId, formEntries, isDirty, currentResultId, isFinalised, finalisedAt]);

  const handleExamYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYearId = e.target.value;
    if (newYearId === selectedExamYearId) return;

    if (isDirty) {
      setPendingSwitch({ type: 'year', targetYearId: newYearId });
      setShowUnsavedConfirmModal(true);
      return;
    }

    applyExamYearChange(newYearId);
  };

  const applyExamYearChange = (newYearId: string) => {
    setSelectedExamYearId(newYearId);
    setSelectedStreamId('');
    setSelectedStudentId('');
    setUnsavedLearnerMap({});
    setActiveScreen('selection');
    setFeedback(null);
  };

  const handleSelectStream = (newStreamId: string) => {
    if (!selectedExamYearId) {
      setFeedback({
        type: 'warning',
        message: 'Please select an examination year before choosing a stream.',
      });
      return;
    }
    if (newStreamId === selectedStreamId) return;

    if (isDirty) {
      setPendingSwitch({ type: 'stream', targetStreamId: newStreamId });
      setShowUnsavedConfirmModal(true);
      return;
    }

    applyStreamChange(newStreamId);
  };

  const applyStreamChange = (newStreamId: string) => {
    setSelectedStreamId(newStreamId);
    // Reset learner selection when stream changes
    setSelectedStudentId('');
    setFeedback(null);
  };

  const handleSelectStudent = (newStudentId: string) => {
    if (!selectedExamYearId || !selectedStreamId) {
      setFeedback({
        type: 'warning',
        message: 'Please select an examination year and stream before choosing a learner.',
      });
      return;
    }
    if (newStudentId === selectedStudentId) return;

    if (isDirty && selectedStudentId) {
      setPendingSwitch({ type: 'student', targetStudentId: newStudentId });
      setShowUnsavedConfirmModal(true);
      return;
    }

    applyStudentChange(newStudentId);
  };

  const applyStudentChange = (newStudentId: string) => {
    setSelectedStudentId(newStudentId);
    setFeedback(null);
  };

  // Switch between Screen 1 and Screen 2
  const handleContinueToResults = () => {
    if (!selectedExamYearId) {
      setFeedback({ type: 'warning', message: 'Please select an examination year first.' });
      return;
    }
    if (!selectedStreamId) {
      setFeedback({ type: 'warning', message: 'Please select a stream first.' });
      return;
    }
    if (!selectedStudentId) {
      setFeedback({ type: 'warning', message: 'Please select a learner to continue.' });
      return;
    }

    stashCurrentLearnerWork();
    setActiveScreen('entry');
  };

  const handleReturnToSelection = () => {
    stashCurrentLearnerWork();
    setActiveScreen('selection');
    if (isDirty) {
      setFeedback({
        type: 'info',
        message: `Returned to learner selection. Unsaved changes for ${selectedStudent?.full_name || 'selected learner'} are safely preserved in session.`,
      });
    }
  };

  const handleGoToNextLearner = () => {
    if (!nextEligibleStudent) return;

    if (isDirty) {
      setPendingSwitch({ type: 'nextStudent', targetStudentId: nextEligibleStudent.id });
      setShowUnsavedConfirmModal(true);
      return;
    }

    stashCurrentLearnerWork();
    setSelectedStudentId(nextEligibleStudent.id);
  };

  // ----------------------------------------------------------------------------
  // 10. Achievement Level & Status Mutation Handlers
  // ----------------------------------------------------------------------------
  const handleSelectLevel = (code: KJSEASubjectCode, level: KJSEAAchievementLevel) => {
    if (isFinalised || isExamYearClosed) return;

    setFormEntries((prev) => {
      const current = prev[code];
      return {
        ...prev,
        [code]: {
          ...current,
          status: 'Normal', // Selecting an achievement level implies Normal status
          achievement_level: level,
          status_recorded: true,
        },
      };
    });
    setIsDirty(true);
    setFeedback(null);
  };

  const handleClearLevel = (code: KJSEASubjectCode) => {
    if (isFinalised || isExamYearClosed) return;

    setFormEntries((prev) => {
      const current = prev[code];
      return {
        ...prev,
        [code]: {
          ...current,
          status: 'Normal',
          achievement_level: null,
          status_recorded: false,
        },
      };
    });
    setIsDirty(true);
    setFeedback(null);
  };

  const handleStatusChange = (code: KJSEASubjectCode, newStatus: KJSEAEntryStatus) => {
    if (isFinalised || isExamYearClosed) return;

    setFormEntries((prev) => {
      const current = prev[code];
      const isNormal = newStatus === 'Normal';

      return {
        ...prev,
        [code]: {
          ...current,
          status: newStatus,
          // Clear achievement level for non-Normal statuses
          achievement_level: isNormal ? current.achievement_level : null,
          status_recorded: isNormal ? Boolean(current.achievement_level) : (newStatus !== 'Pending'),
        },
      };
    });
    setIsDirty(true);
    setFeedback(null);
  };

  // ----------------------------------------------------------------------------
  // 11. Summary Calculations (Advisory Display & Contract Invariants)
  // ----------------------------------------------------------------------------
  // Count learning areas that have been entered (achievement level selected for Normal, or explicit non-Normal exception)
  const completedEntriesCount = useMemo(() => {
    let count = 0;
    KJSEA_LEARNING_AREAS_META.forEach((meta) => {
      const entry = formEntries[meta.code];
      if (!entry) return;
      if (entry.status === 'Normal') {
        if (entry.achievement_level) {
          count += 1;
        }
      } else if (entry.status === 'Absent' || entry.status === 'Irregularity' || entry.status === 'Not Released') {
        count += 1;
      }
    });
    return count;
  }, [formEntries]);

  // TOTAL POINTS: sum of points for valid Normal entries
  const totalPoints = useMemo(() => {
    let sum = 0;
    KJSEA_LEARNING_AREAS_META.forEach((meta) => {
      const entry = formEntries[meta.code];
      if (entry && entry.status === 'Normal' && entry.achievement_level) {
        const pts = KJSEA_LEVEL_POINTS_MAP[entry.achievement_level] || 0;
        sum += pts;
      }
    });
    return sum;
  }, [formEntries]);

  // ----------------------------------------------------------------------------
  // 11b. Live Cohort Candidate Progress Tracking (Accounted For: 9 Learning Areas)
  // ----------------------------------------------------------------------------
  const accountedCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    yearResults.forEach((r) => {
      if (!r.student_id || !r.entries) return;
      const accountedCount = r.entries.filter((e) =>
        e.status === 'Normal' ? Boolean(e.achievement_level) : (e.status !== 'Pending')
      ).length;
      if (accountedCount === 9) {
        ids.add(r.student_id);
      }
    });
    return ids;
  }, [yearResults]);

  const progressData = useMemo(() => {
    const cohortLearners = selectedStreamId ? eligibleLearners : allLearners;
    const totalCohort = cohortLearners.length;
    const enteredCount = cohortLearners.filter((l) => {
      if (accountedCandidateIds.has(l.id)) return true;
      if (l.id === selectedStudentId && completedEntriesCount === 9) return true;
      return false;
    }).length;
    return {
      enteredCount,
      totalCohort,
    };
  }, [selectedStreamId, eligibleLearners, allLearners, accountedCandidateIds, selectedStudentId, completedEntriesCount]);

  // ----------------------------------------------------------------------------
  // 12. Save Draft & Finalise Actions
  // ----------------------------------------------------------------------------
  const handleSaveDraft = async (): Promise<boolean> => {
    if (!currentResultId) {
      setFeedback({ type: 'error', message: 'No active student result selected to save.' });
      return false;
    }
    if (isExamYearClosed) {
      setFeedback({
        type: 'warning',
        message: 'This examination year is closed. Draft updates are prohibited.',
      });
      return false;
    }

    setIsSavingDraft(true);
    setFeedback(null);

    try {
      // Build sanitized payload: exclude client points!
      // If an area has status Normal but no level selected yet, serialize as Pending for draft storage
      const payload: KJSEADraftEntryPayload[] = KJSEA_LEARNING_AREAS_META.map((meta) => {
        const entry = formEntries[meta.code];
        const isNormalWithoutLevel = entry.status === 'Normal' && !entry.achievement_level;
        return {
          subject_code: meta.code,
          status: isNormalWithoutLevel ? 'Pending' : entry.status,
          achievement_level: entry.status === 'Normal' ? entry.achievement_level : null,
        };
      });

      // Client pre-validation
      const validation = validateKJSEADraftEntries(payload);
      if (!validation.isValid) {
        setFeedback({
          type: 'error',
          message: validation.error || 'Validation error in entries.',
        });
        setIsSavingDraft(false);
        return false;
      }

      // Execute verified RPC kjsea_save_draft
      const res = await kjseaService.saveDraft(currentResultId, payload);
      if (!res.success) {
        setFeedback({
          type: 'error',
          message: res.error?.message || 'Failed to save draft results.',
          details: res.error?.details,
        });
        setIsSavingDraft(false);
        return false;
      }

      // Fast in-place confirmation: update local state without blocking screen reload
      setIsDirty(false);
      setFormEntries((prev) => {
        const updated = { ...prev };
        KJSEA_LEARNING_AREAS_META.forEach((meta) => {
          const cur = updated[meta.code];
          if (cur) {
            updated[meta.code] = {
              ...cur,
              status_recorded: Boolean(cur.achievement_level || cur.status !== 'Normal'),
            };
          }
        });
        return updated;
      });

      // Remove stashed dirty copy since it is now safely in database
      if (selectedStudentId) {
        setUnsavedLearnerMap((prev) => {
          const next = { ...prev };
          delete next[selectedStudentId];
          return next;
        });
      }

      setFeedback({
        type: 'success',
        message: 'KJSEA draft results saved successfully to Supabase.',
      });

      if (selectedExamYearId) {
        refreshYearResults(selectedExamYearId);
      }

      return true;
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'An unexpected error occurred while saving draft.',
      });
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleFinaliseResult = async () => {
    if (!currentResultId) {
      setFeedback({ type: 'error', message: 'No active student result selected to finalise.' });
      return;
    }
    if (isExamYearClosed) {
      setFeedback({
        type: 'warning',
        message: 'This examination year is closed. Finalisation is prohibited.',
      });
      return;
    }

    // Validation: All 9 learning areas must be explicitly accounted for
    const missingAreas: string[] = [];
    KJSEA_LEARNING_AREAS_META.forEach((meta) => {
      const entry = formEntries[meta.code];
      const isComplete = entry.status === 'Normal' ? Boolean(entry.achievement_level) : (entry.status !== 'Pending');
      if (!isComplete) {
        missingAreas.push(`${meta.code} (${entry.status === 'Normal' ? 'Select achievement level' : 'status pending'})`);
      }
    });

    if (missingAreas.length > 0) {
      setFeedback({
        type: 'error',
        message: `Finalisation requires all 9 learning areas to be explicitly accounted for. Incomplete: ${missingAreas.join(', ')}`,
      });
      return;
    }

    setIsFinalising(true);
    setFeedback(null);

    try {
      // 1. If form has unsaved modifications, persist draft first
      if (isDirty) {
        const payload: KJSEADraftEntryPayload[] = KJSEA_LEARNING_AREAS_META.map((meta) => {
          const entry = formEntries[meta.code];
          const isNormalWithoutLevel = entry.status === 'Normal' && !entry.achievement_level;
          return {
            subject_code: meta.code,
            status: isNormalWithoutLevel ? 'Pending' : entry.status,
            achievement_level: entry.status === 'Normal' ? entry.achievement_level : null,
          };
        });

        const draftRes = await kjseaService.saveDraft(currentResultId, payload);
        if (!draftRes.success) {
          setFeedback({
            type: 'error',
            message: `Could not save pending entries prior to finalisation: ${draftRes.error?.message}`,
          });
          setIsFinalising(false);
          return;
        }
      }

      // 2. Execute verified RPC kjsea_finalise_result
      const finRes = await kjseaService.finaliseResult(currentResultId);
      if (!finRes.success) {
        setFeedback({
          type: 'error',
          message: finRes.error?.message || 'Failed to finalise result.',
          details: finRes.error?.details,
        });
        setIsFinalising(false);
        return;
      }

      // Fast in-place confirmation: lock result immediately
      const finalisedTimestamp = new Date().toISOString();
      setIsDirty(false);
      setIsFinalised(true);
      setFinalisedAt(finalisedTimestamp);

      setFormEntries((prev) => {
        const updated = { ...prev };
        KJSEA_LEARNING_AREAS_META.forEach((meta) => {
          const cur = updated[meta.code];
          if (cur) {
            updated[meta.code] = {
              ...cur,
              status_recorded: true,
            };
          }
        });
        return updated;
      });

      if (selectedStudentId) {
        setUnsavedLearnerMap((prev) => {
          const next = { ...prev };
          delete next[selectedStudentId];
          return next;
        });
      }

      setFeedback({
        type: 'success',
        message: 'KJSEA result has been finalised and locked successfully.',
      });

      if (selectedExamYearId) {
        refreshYearResults(selectedExamYearId);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'An unexpected error occurred while finalising result.',
      });
    } finally {
      setIsFinalising(false);
    }
  };

  // ----------------------------------------------------------------------------
  // 13. Unsaved Confirmation Handlers
  // ----------------------------------------------------------------------------
  const handleConfirmSaveAndSwitch = async () => {
    const saved = await handleSaveDraft();
    if (!saved) return; // Keep user informed if save failed

    setShowUnsavedConfirmModal(false);
    executePendingSwitch();
  };

  const handleConfirmDiscardAndSwitch = () => {
    // Clear unsaved work for current learner
    if (selectedStudentId) {
      setUnsavedLearnerMap((prev) => {
        const next = { ...prev };
        delete next[selectedStudentId];
        return next;
      });
    }
    setIsDirty(false);
    setShowUnsavedConfirmModal(false);
    executePendingSwitch();
  };

  const handleCancelSwitch = () => {
    setShowUnsavedConfirmModal(false);
    setPendingSwitch(null);
  };

  const executePendingSwitch = () => {
    if (!pendingSwitch) return;

    if (pendingSwitch.type === 'student') {
      applyStudentChange(pendingSwitch.targetStudentId);
    } else if (pendingSwitch.type === 'stream') {
      applyStreamChange(pendingSwitch.targetStreamId);
    } else if (pendingSwitch.type === 'year') {
      applyExamYearChange(pendingSwitch.targetYearId);
    } else if (pendingSwitch.type === 'nextStudent') {
      applyStudentChange(pendingSwitch.targetStudentId);
    }
    setPendingSwitch(null);
  };

  // ----------------------------------------------------------------------------
  // 14. Reopen Modal & Action (Admin Only)
  // ----------------------------------------------------------------------------
  const handleOpenReopenModal = () => {
    setReopenReason('');
    setReopenError(null);
    setShowReopenModal(true);
  };

  const handleConfirmReopen = async () => {
    if (!currentResultId) return;

    const validation = validateMandatoryReason(reopenReason, 'Reopening result');
    if (!validation.isValid) {
      setReopenError(validation.error || 'A valid reason is required.');
      return;
    }

    setIsReopening(true);
    setReopenError(null);

    try {
      const res = await kjseaService.reopenResult(currentResultId, reopenReason.trim());
      if (!res.success) {
        setReopenError(res.error?.message || 'Failed to reopen result via RPC.');
        setIsReopening(false);
        return;
      }

      setShowReopenModal(false);
      setIsFinalised(false);
      setFinalisedAt(null);
      setFeedback({
        type: 'success',
        message: 'Result has been successfully reopened for modification.',
      });

      if (selectedExamYearId) {
        refreshYearResults(selectedExamYearId);
      }
    } catch (err: any) {
      setReopenError(err?.message || 'Unexpected error while reopening result.');
    } finally {
      setIsReopening(false);
    }
  };

  // ----------------------------------------------------------------------------
  // 14b. Examination Year Creation & Status Actions (Admin Only)
  // ----------------------------------------------------------------------------
  const openCreateYearModal = () => {
    const currentActive = api.getActiveAcademicYear()?.year || activeAcademicYear;
    setActiveAcademicYear(currentActive);
    setProposedYearInput(currentActive);
    setInitialStatusChoice('open');
    setCreateYearError(null);
    setShowCreateYearModal(true);
  };

  const handleConfirmCreateYear = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCreateYearError(null);

    const yearToCreate = Number(proposedYearInput);
    if (!Number.isInteger(yearToCreate) || yearToCreate < 2020 || yearToCreate > 2050) {
      setCreateYearError('Invalid examination year. Must be a 4-digit calendar year between 2020 and 2050.');
      return;
    }

    // Client-side duplicate check
    if (examYears.some((y) => y.exam_year === yearToCreate)) {
      setCreateYearError(`Examination year ${yearToCreate} already exists.`);
      return;
    }

    setIsCreatingYear(true);
    try {
      // 1. Call existing kjseaService.createExamYear (executes verified database RPC)
      const createRes = await kjseaService.createExamYear(yearToCreate);
      if (!createRes.success || !createRes.data) {
        setIsCreatingYear(false);
        const errMsg = createRes.error?.message || `Failed to create examination year ${yearToCreate}.`;
        setCreateYearError(errMsg);
        return;
      }

      const createdYearId = createRes.data;

      // 2. Open examination year if requested by admin, tracking exact success/failure
      let openAttempted = false;
      let openSucceeded = false;
      let openErrorMessage: string | null = null;

      if (initialStatusChoice === 'open') {
        openAttempted = true;
        const openRes = await kjseaService.setExamYearStatus(
          createdYearId,
          'open',
          'Initial opening upon examination year creation by administrator'
        );
        if (openRes.success) {
          openSucceeded = true;
        } else {
          openSucceeded = false;
          openErrorMessage = openRes.error?.message || null;
          console.warn('[KJSEA] Year created but status update to open failed:', openRes.error);
        }
      }

      // 3. Reload examination years list from Supabase
      const yearsRes = await kjseaService.listExamYears();
      const refreshSucceeded = Boolean(yearsRes.success && yearsRes.data);

      if (refreshSucceeded && yearsRes.data) {
        setExamYears(yearsRes.data);
        const matched = yearsRes.data.find((y) => y.id === createdYearId || y.exam_year === yearToCreate);
        if (matched) {
          setSelectedExamYearId(matched.id);
        } else {
          setSelectedExamYearId(createdYearId);
        }

        // Truthful feedback based on actual database verification and operation outcomes
        if (openAttempted) {
          if (openSucceeded) {
            setFeedback({
              type: 'success',
              message: `Examination year ${yearToCreate} created successfully and opened for results entry.`,
            });
          } else {
            // Creation succeeded, but opening failed
            if (matched && matched.status === 'closed') {
              setFeedback({
                type: 'warning',
                message: `Examination year ${yearToCreate} was created successfully, but could not be opened and remains closed.`,
                details: openErrorMessage ? `Status update error: ${openErrorMessage}` : undefined,
              });
            } else {
              setFeedback({
                type: 'warning',
                message: `Examination year ${yearToCreate} was created, but opening failed and its status could not be verified as closed.`,
                details: openErrorMessage ? `Status update error: ${openErrorMessage}` : undefined,
              });
            }
          }
        } else {
          // Intentionally created as closed
          setFeedback({
            type: 'success',
            message: `Examination year ${yearToCreate} created successfully and remains closed.`,
          });
        }
      } else {
        // Failed database refresh
        setSelectedExamYearId(createdYearId);

        if (openAttempted) {
          if (openSucceeded) {
            setFeedback({
              type: 'warning',
              message: `Examination year ${yearToCreate} was created and opened, but the examination years list could not be refreshed from the database.`,
              details: yearsRes.error?.message || 'Database refresh failed.',
            });
          } else {
            setFeedback({
              type: 'warning',
              message: `Examination year ${yearToCreate} was created, but opening failed and current status could not be verified from the database.`,
              details: openErrorMessage
                ? `Opening error: ${openErrorMessage}`
                : (yearsRes.error?.message || 'Database refresh failed.'),
            });
          }
        } else {
          setFeedback({
            type: 'warning',
            message: `Examination year ${yearToCreate} was created, but the examination years list could not be refreshed from the database.`,
            details: yearsRes.error?.message || 'Database refresh failed.',
          });
        }
      }

      setShowCreateYearModal(false);
    } catch (err: any) {
      setCreateYearError(err?.message || 'An unexpected error occurred while creating examination year.');
    } finally {
      setIsCreatingYear(false);
    }
  };

  const handleOpenYearStatusModal = (target: 'open' | 'closed') => {
    setTargetYearStatus(target);
    setYearStatusReason('');
    setYearStatusError(null);
    setShowYearStatusModal(true);
  };

  const handleConfirmYearStatusChange = async () => {
    if (!selectedExamYear) return;
    const val = validateMandatoryReason(
      yearStatusReason,
      targetYearStatus === 'open' ? 'Reopening examination year' : 'Closing examination year'
    );
    if (!val.isValid) {
      setYearStatusError(val.error!);
      return;
    }

    setIsUpdatingYearStatus(true);
    setYearStatusError(null);
    try {
      const res = await kjseaService.setExamYearStatus(selectedExamYear.id, targetYearStatus, yearStatusReason);
      if (!res.success) {
        setYearStatusError(res.error?.message || `Failed to update status to ${targetYearStatus}.`);
        setIsUpdatingYearStatus(false);
        return;
      }

      const yearsRes = await kjseaService.listExamYears();
      if (yearsRes.success && yearsRes.data) {
        setExamYears(yearsRes.data);
      }

      setShowYearStatusModal(false);
      setFeedback({
        type: 'success',
        message: `Examination year ${selectedExamYear.exam_year} is now ${targetYearStatus.toUpperCase()}.`,
      });
    } catch (err: any) {
      setYearStatusError(err?.message || 'Failed to update examination year status.');
    } finally {
      setIsUpdatingYearStatus(false);
    }
  };

  // ----------------------------------------------------------------------------
  // 14c. KJSEA Merit List Export Handlers
  // ----------------------------------------------------------------------------
  const handleExportAllStreams = async (type: 'pdf' | 'excel') => {
    if (!selectedExamYearId || !selectedExamYear) {
      setFeedback({
        type: 'warning',
        message: 'Please select an examination year before exporting the All Streams Merit List.',
      });
      return;
    }
    if (isExporting) return;

    setIsExporting(true);
    setActiveExportAction(`all_${type}`);
    setFeedback({
      type: 'info',
      message: `Generating All Streams KJSEA ${selectedExamYear.exam_year} Merit List (${type.toUpperCase()})...`,
    });

    try {
      if (type === 'pdf') {
        await exportKJSEAMeritListPDF({
          examYearId: selectedExamYear.id,
          examYear: selectedExamYear.exam_year,
          generatedBy: 'System Administrator',
        });
      } else {
        await exportKJSEAMeritListExcel({
          examYearId: selectedExamYear.id,
          examYear: selectedExamYear.exam_year,
          generatedBy: 'System Administrator',
        });
      }
      setFeedback({
        type: 'success',
        message: `All Streams KJSEA ${selectedExamYear.exam_year} Merit List (${type.toUpperCase()}) exported successfully.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Failed to export All Streams Merit List: ${err?.message || 'Unexpected export error'}`,
      });
    } finally {
      setIsExporting(false);
      setActiveExportAction(null);
    }
  };

  const handleExportSelectedStream = async (type: 'pdf' | 'excel') => {
    if (!selectedExamYearId || !selectedExamYear) {
      setFeedback({
        type: 'warning',
        message: 'Please select an examination year first.',
      });
      return;
    }
    if (!selectedStreamId || !selectedStream) {
      setFeedback({
        type: 'warning',
        message: 'Please select a stream before exporting the Stream Merit List.',
      });
      return;
    }
    if (isExporting) return;

    setIsExporting(true);
    setActiveExportAction(`stream_${type}`);
    setFeedback({
      type: 'info',
      message: `Generating Stream ${selectedStream.name} KJSEA ${selectedExamYear.exam_year} Merit List (${type.toUpperCase()})...`,
    });

    try {
      if (type === 'pdf') {
        await exportKJSEAMeritListPDF({
          examYearId: selectedExamYear.id,
          examYear: selectedExamYear.exam_year,
          selectedStreamId: selectedStream.id,
          selectedStreamName: selectedStream.name,
          generatedBy: 'System Administrator',
        });
      } else {
        await exportKJSEAMeritListExcel({
          examYearId: selectedExamYear.id,
          examYear: selectedExamYear.exam_year,
          selectedStreamId: selectedStream.id,
          selectedStreamName: selectedStream.name,
          generatedBy: 'System Administrator',
        });
      }
      setFeedback({
        type: 'success',
        message: `Stream ${selectedStream.name} KJSEA ${selectedExamYear.exam_year} Merit List (${type.toUpperCase()}) exported successfully.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Failed to export Stream Merit List: ${err?.message || 'Unexpected export error'}`,
      });
    } finally {
      setIsExporting(false);
      setActiveExportAction(null);
    }
  };

  // ----------------------------------------------------------------------------
  // 15. Dynamic Screen Headings
  // ----------------------------------------------------------------------------
  const screenYearLabel = useMemo(() => {
    return selectedExamYear ? `${selectedExamYear.exam_year}` : '';
  }, [selectedExamYear]);

  const screen2Heading = useMemo(() => {
    return selectedExamYear
      ? `KJSEA ${selectedExamYear.exam_year} RESULTS`
      : 'KJSEA RESULTS';
  }, [selectedExamYear]);

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* ---------------------------------------------------------------------- */}
      {/* Global Module Header & Examination Year Selector */}
      {/* ---------------------------------------------------------------------- */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                Administrator Module
              </span>
              <span className="text-slate-300 dark:text-zinc-700">|</span>
              <span className="font-medium text-slate-600 dark:text-zinc-400">
                Grade 9 National Assessment
              </span>
              {selectedExamYear && (
                <>
                  <span className="text-slate-300 dark:text-zinc-700">|</span>
                  <span
                    className={`font-semibold ${
                      selectedExamYear.status === 'open'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    Year {selectedExamYear.exam_year} ({selectedExamYear.status.toUpperCase()})
                  </span>
                </>
              )}
            </div>

            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {activeScreen === 'entry' ? screen2Heading : `KJSEA ${screenYearLabel ? screenYearLabel + ' ' : ''}RESULTS ENTRY`}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              {activeScreen === 'entry'
                ? `Recording official CBE achievement levels for ${selectedStudent?.full_name || 'selected candidate'}.`
                : 'Follow the two-step workflow: Select Stream → Select Learner → Continue to Results Entry.'}
            </p>
          </div>

          {/* Dynamic Examination Year Selector Dropdown */}
          <div className="w-full md:w-80 bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-slate-200 dark:border-zinc-700">
            <label
              htmlFor="kjsea-exam-year-select"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1.5"
            >
              Examination Year
            </label>
            <div className="flex items-center gap-2">
              <select
                id="kjsea-exam-year-select"
                value={selectedExamYearId}
                onChange={handleExamYearChange}
                disabled={isLoadingYears}
                className="flex-1 min-h-[40px] rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 font-medium"
              >
                <option value="">Select examination year...</option>
                {examYears.map((yr) => (
                  <option key={yr.id} value={yr.id}>
                    {yr.exam_year} ({yr.status.toUpperCase()})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={openCreateYearModal}
                className="min-h-[40px] px-3 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
                title="Create Examination Year"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Year</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* Feedback Toast / Banner */}
      {/* ---------------------------------------------------------------------- */}
      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-lg flex items-start justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800'
              : feedback.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
              : 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />}
            {feedback.type === 'error' && <AlertOctagon className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />}
            {feedback.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />}
            {feedback.type === 'info' && <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />}
            <div>
              <p className="text-sm font-medium">{feedback.message}</p>
              {feedback.details && <p className="text-xs mt-1 opacity-90">{feedback.details}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Dismiss feedback"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* Closed Exam Year Warning */}
      {/* ---------------------------------------------------------------------- */}
      {isExamYearClosed && selectedExamYear && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Examination Year Closed:</span> Examination year {selectedExamYear.exam_year} is closed. All results for this cohort are locked and read-only.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenYearStatusModal('open')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 shadow-sm transition-colors cursor-pointer"
          >
            <Unlock className="w-3.5 h-3.5" />
            Open Year for Entry
          </button>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SCREEN 1: STREAM → LEARNER SELECTION                                   */}
      {/* ====================================================================== */}
      {activeScreen === 'selection' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Empty Examination Years Notice */}
          {examYears.length === 0 && !isLoadingYears && (
            <div className="bg-amber-50/70 dark:bg-amber-950/20 border-2 border-dashed border-amber-300 dark:border-amber-800 rounded-xl p-6 sm:p-8 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 flex items-center justify-center mx-auto">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  No examination years found. Create an examination year to begin.
                </h3>
                <p className="text-xs text-slate-600 dark:text-zinc-400">
                  KJSEA candidate registration and results entry require an examination year. Active academic year is currently {activeAcademicYear}.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateYearModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Examination Year
              </button>
            </div>
          )}

          {/* STEP 1: SELECT STREAM (Visible Radio Buttons / Selectable Options) */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    selectedExamYearId ? 'bg-emerald-800 text-white' : 'bg-slate-300 dark:bg-zinc-700 text-slate-600 dark:text-zinc-400'
                  }`}>
                    1
                  </span>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs sm:text-sm">
                    STEP 1: SELECT STREAM
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                  {!selectedExamYearId
                    ? 'Select an examination year above to view active streams.'
                    : 'Select a stream to load active Grade 9 candidates.'}
                </p>
              </div>
              {selectedExamYearId && selectedStream && (
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {selectedStream.name} Selected
                </span>
              )}
            </div>

            {!selectedExamYearId ? (
              <div className="py-6 sm:py-8 px-4 rounded-xl border border-dashed border-slate-300 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/40 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Select an examination year first
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                  Choose an examination year above to view available Grade 9 streams and candidates.
                </p>
              </div>
            ) : isLoadingLearners ? (
              <div className="py-8 text-center">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-zinc-400">Loading Grade 9 streams from database...</p>
              </div>
            ) : distinctStreams.length === 0 ? (
              <div className="p-6 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-center">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  No Grade 9 streams found in active student records.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Ensure Grade 9 learners are registered and allocated to streams in Student Registration.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {distinctStreams.map((st) => {
                  const isSelected = selectedStreamId === st.id;
                  return (
                    <label
                      key={st.id}
                      className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-600/30 shadow-sm'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="kjsea-stream-selection"
                          value={st.id}
                          checked={isSelected}
                          onChange={() => handleSelectStream(st.id)}
                          className="w-4 h-4 text-emerald-700 border-slate-300 focus:ring-emerald-600 focus:ring-offset-0 cursor-pointer"
                        />
                        <div>
                          <span className="block font-bold text-sm text-slate-900 dark:text-white">
                            {st.name}
                          </span>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isSelected
                          ? 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                      }`}>
                        {st.count} {st.count === 1 ? 'learner' : 'learners'}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* STEP 2: SELECT ONE LEARNER */}
          {selectedExamYearId && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedStreamId ? 'bg-emerald-800 text-white' : 'bg-slate-300 dark:bg-zinc-700 text-slate-600 dark:text-zinc-400'
                    }`}>
                      2
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs sm:text-sm">
                      STEP 2: SELECT ONE LEARNER
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                    {selectedStreamId
                      ? `Showing ${eligibleLearners.length} active candidates in ${selectedStream?.name || 'selected stream'}.`
                      : 'Select a stream first to display candidates.'}
                  </p>
                </div>
                {selectedStudent && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    ADM: {selectedStudent.admission_number}
                  </span>
                )}
              </div>

              {!selectedStreamId ? (
                // Display "Select a stream first" before stream selection
                <div className="py-6 sm:py-8 px-4 rounded-xl border border-dashed border-slate-300 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/40 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Select a stream first
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                    Choose an active Grade 9 stream in Step 1 above to view and select eligible learners.
                  </p>
                </div>
              ) : eligibleLearners.length === 0 ? (
                <div className="py-8 text-center bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    No active Grade 9 learners found in {selectedStream?.name}.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Please verify student stream allocations in Student Registration.
                  </p>
                </div>
              ) : (
              <div className="space-y-4">
                {/* Standard Dropdown Selector (Dropdown Integrity Specification compliant) */}
                <div>
                  <label
                    htmlFor="kjsea-learner-select"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1.5"
                  >
                    Select Grade 9 Learner
                  </label>
                  <select
                    id="kjsea-learner-select"
                    value={selectedStudentId}
                    onChange={(e) => handleSelectStudent(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select a learner...</option>
                    {eligibleLearners.map((lr) => (
                      <option key={lr.id} value={lr.id}>
                        {lr.admission_number} — {lr.full_name} ({lr.gender === 'M' ? 'Male' : 'Female'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Visible candidate cards list for quick, accessible selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1 pt-1">
                  {eligibleLearners.map((lr) => {
                    const isSelected = selectedStudentId === lr.id;
                    const hasUnsaved = Boolean(unsavedLearnerMap[lr.id]?.isDirty);

                    return (
                      <div
                        key={lr.id}
                        onClick={() => handleSelectStudent(lr.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition text-left ${
                          isSelected
                            ? 'border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/40 ring-1 ring-emerald-600'
                            : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 hover:bg-slate-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-emerald-800 text-white'
                              : 'bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                          }`}>
                            {lr.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="block font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                              {lr.full_name}
                            </span>
                            <span className="block text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                              ADM: {lr.admission_number}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {hasUnsaved && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" title="Unsaved changes in session">
                              Unsaved
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">
                            {lr.gender}
                          </span>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-emerald-700 bg-emerald-700 text-white'
                              : 'border-slate-300 dark:border-zinc-600'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Continue Action Card (Sticky above mobile bottom navigation bar) */}
        <div className="sticky bottom-16 md:bottom-4 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="w-full sm:w-auto">
            <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 block font-bold">
              Workflow Status
            </span>
            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mt-0.5">
              {!selectedExamYearId
                ? 'Waiting for Examination Year selection'
                : `Results Entered: ${progressData.enteredCount}/${progressData.totalCohort} candidates`}
            </p>
            {selectedStudent && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                Ready to enter results for: {selectedStudent.full_name} ({selectedStudent.admission_number})
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleContinueToResults}
            disabled={!selectedExamYearId || !selectedStreamId || !selectedStudentId}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold bg-emerald-800 hover:bg-emerald-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md focus:ring-2 focus:ring-emerald-600 focus:outline-none whitespace-nowrap"
          >
            <span>CONTINUE TO RESULTS ENTRY</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

          {/* ------------------------------------------------------------------ */}
          {/* KJSEA MERIT LIST EXPORT CONTROLS (Repositioned below workflow)    */}
          {/* ------------------------------------------------------------------ */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  KJSEA Merit List Exports
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Download official ranked merit lists in PDF or Excel.
                </p>
              </div>
              {selectedExamYear && (
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 self-start sm:self-auto">
                  Year {selectedExamYear.exam_year}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: All Streams Merit List */}
              <div className="p-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                      1. All Streams Merit List
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Overall Cohort
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mb-3">
                    Rank all Grade 9 candidates across all streams for the selected examination year.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleExportAllStreams('pdf')}
                    disabled={!selectedExamYearId || isExporting}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition-colors disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-400 dark:disabled:text-zinc-500 disabled:opacity-100 disabled:cursor-not-allowed cursor-pointer"
                    title={!selectedExamYearId ? 'Select an examination year first' : 'Download All Streams Merit List as PDF'}
                  >
                    {activeExportAction === 'all_pdf' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    <span>{activeExportAction === 'all_pdf' ? 'Generating...' : 'Export PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportAllStreams('excel')}
                    disabled={!selectedExamYearId || isExporting}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white text-xs font-semibold shadow-sm transition-colors disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-400 dark:disabled:text-zinc-500 disabled:opacity-100 disabled:cursor-not-allowed cursor-pointer"
                    title={!selectedExamYearId ? 'Select an examination year first' : 'Download All Streams Merit List as Excel'}
                  >
                    {activeExportAction === 'all_excel' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span>{activeExportAction === 'all_excel' ? 'Generating...' : 'Export Excel'}</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Selected Stream Merit List */}
              <div className="p-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                      2. Stream Merit List
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {selectedStream ? `Stream: ${selectedStream.name}` : 'Requires Stream'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mb-3">
                    {selectedStream
                      ? `Rank candidates belonging to stream ${selectedStream.name} at examination time.`
                      : 'Select a stream in Step 1 below to enable stream-specific merit list exports.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleExportSelectedStream('pdf')}
                    disabled={!selectedExamYearId || !selectedStreamId || isExporting}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition-colors disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-400 dark:disabled:text-zinc-500 disabled:opacity-100 disabled:cursor-not-allowed cursor-pointer"
                    title={
                      !selectedExamYearId
                        ? 'Select an examination year first'
                        : !selectedStreamId
                        ? 'Select a stream first'
                        : `Download ${selectedStream?.name} Stream Merit List as PDF`
                    }
                  >
                    {activeExportAction === 'stream_pdf' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    <span>{activeExportAction === 'stream_pdf' ? 'Generating...' : 'Export PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportSelectedStream('excel')}
                    disabled={!selectedExamYearId || !selectedStreamId || isExporting}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white text-xs font-semibold shadow-sm transition-colors disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-400 dark:disabled:text-zinc-500 disabled:opacity-100 disabled:cursor-not-allowed cursor-pointer"
                    title={
                      !selectedExamYearId
                        ? 'Select an examination year first'
                        : !selectedStreamId
                        ? 'Select a stream first'
                        : `Download ${selectedStream?.name} Stream Merit List as Excel`
                    }
                  >
                    {activeExportAction === 'stream_excel' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span>{activeExportAction === 'stream_excel' ? 'Generating...' : 'Export Excel'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SCREEN 2: DEDICATED RESULTS ENTRY VIEW                                */}
      {/* ====================================================================== */}
      {activeScreen === 'entry' && (
        <div className="space-y-6">
          {/* Top Return and Quick Navigation Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <button
              type="button"
              onClick={handleReturnToSelection}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-zinc-200 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-300 dark:border-zinc-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Learner Selection</span>
            </button>

            <div className="flex items-center justify-end gap-3">
              {nextEligibleStudent && (
                <button
                  type="button"
                  onClick={handleGoToNextLearner}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 transition"
                  title={`Proceed to next candidate: ${nextEligibleStudent.full_name}`}
                >
                  <span>Next: {nextEligibleStudent.full_name.split(' ')[0]}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Dedicated Result Context Card */}
          {selectedStudent && (
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xl shadow-sm shrink-0">
                    {selectedStudent.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 tracking-wider uppercase">
                      {screen2Heading}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                      <span>{selectedStudent.full_name}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded font-mono font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        ADM: {selectedStudent.admission_number}
                      </span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5 text-xs text-slate-600 dark:text-zinc-300">
                      <span>Class: <strong className="text-slate-900 dark:text-white">Grade 9</strong></span>
                      <span>Stream: <strong className="text-slate-900 dark:text-white">{selectedStream?.name || selectedStudent.stream_name || 'Assigned'}</strong></span>
                      <span>Gender: <strong className="text-slate-900 dark:text-white">{selectedStudent.gender === 'M' ? 'Male' : 'Female'}</strong></span>
                      <span>Exam Year: <strong className="text-slate-900 dark:text-white">{selectedExamYear?.exam_year}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Finalised / Draft Status Pill & Reopen Trigger */}
                <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                  {isFinalised ? (
                    <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 px-3.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-xs font-semibold">
                      <Lock className="w-3.5 h-3.5" />
                      <span>FINALISED & LOCKED</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold">
                      <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                      <span>DRAFT</span>
                    </div>
                  )}

                  {/* Reopen Action (Admin Only) */}
                  {isFinalised && !isExamYearClosed && (
                    <button
                      type="button"
                      onClick={handleOpenReopenModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700 transition"
                    >
                      <Unlock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reopen Result</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Live Progress Strip */}
          {selectedStudent && (
            <div
              data-testid="kjsea-live-progress-strip"
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 shadow-xs flex items-center justify-between text-xs sm:text-sm"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 text-slate-700 dark:text-zinc-300 font-medium">
                <span>
                  Subjects Completed: <strong className="text-slate-900 dark:text-white font-bold">{completedEntriesCount}/9</strong>
                </span>
                <span className="text-slate-400 dark:text-zinc-600">·</span>
                <span>
                  Total Points: <strong className="text-emerald-700 dark:text-emerald-400 font-bold">{totalPoints} pts</strong>
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 font-medium hidden sm:block">
                {completedEntriesCount === 9 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <Check className="w-3 h-3 stroke-[3]" /> All 9 recorded
                  </span>
                ) : (
                  <span>{9 - completedEntriesCount} remaining</span>
                )}
              </div>
            </div>
          )}

          {/* Nine Standard Learning Areas Form */}
          {isLoadingResult ? (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-12 text-center shadow-sm">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                Loading....
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs sm:text-sm">
                  Learning Areas
                </h2>
              </div>

              <div className="space-y-3">
                {KJSEA_LEARNING_AREAS_META.map((meta, index) => {
                  const entry = formEntries[meta.code];
                  const isRecorded = entry.status === 'Normal' ? Boolean(entry.achievement_level) : (entry.status !== 'Pending');
                  const isNormal = entry.status === 'Normal';
                  const advisoryPoints = getKJSEAPointsAdvisory(entry.achievement_level, entry.status);
                  const label = LEARNING_AREA_DISPLAY_LABELS[meta.code];

                  return (
                    <div
                      key={meta.code}
                      className={`bg-white dark:bg-zinc-900 rounded-xl border p-4 sm:p-5 transition shadow-sm ${
                        isRecorded
                          ? 'border-slate-300 dark:border-zinc-700'
                          : 'border-slate-200 dark:border-zinc-800 opacity-95'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        {/* Learning Area Title & Status Picker */}
                        <div className="min-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center text-xs font-bold shrink-0">
                              {index + 1}
                            </span>
                            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                              {label}
                            </h4>
                          </div>

                          {/* Status Selector Dropdown */}
                          <div className="mt-2.5 flex items-center gap-2">
                            <label
                              htmlFor={`status-select-${meta.code}`}
                              className="text-xs font-medium text-slate-500 dark:text-zinc-400"
                            >
                              Status:
                            </label>
                            <select
                              id={`status-select-${meta.code}`}
                              value={entry.status}
                              disabled={isFinalised || isExamYearClosed}
                              onChange={(e) =>
                                handleStatusChange(meta.code, e.target.value as KJSEAEntryStatus)
                              }
                              className="text-xs rounded-md border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 py-1 px-2.5 font-medium focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                            >
                              {KJSEA_ENTRY_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>

                            {/* Advisory Points or NO POINTS indicator */}
                            {isNormal ? (
                              entry.achievement_level ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                    Points: {advisoryPoints ?? 0}
                                  </span>
                                  {!isFinalised && !isExamYearClosed && (
                                    <button
                                      type="button"
                                      onClick={() => handleClearLevel(meta.code)}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                                      title={`Clear achievement level for ${meta.code}`}
                                      aria-label={`Clear achievement level for ${meta.code}`}
                                    >
                                      <X className="w-3 h-3" />
                                      <span>Clear</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                  Required
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                                NO POINTS
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Achievement Level Buttons (8 options) */}
                        <div className="flex-1">
                          {isNormal ? (
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2">
                              {KJSEA_ACHIEVEMENT_LEVELS.map((level) => {
                                const isSelected = entry.achievement_level === level;
                                const pts = KJSEA_LEVEL_POINTS_MAP[level];

                                return (
                                  <button
                                    key={level}
                                    type="button"
                                    disabled={isFinalised || isExamYearClosed}
                                    onClick={() => handleSelectLevel(meta.code, level)}
                                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-xs transition font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${
                                      isSelected
                                        ? 'bg-emerald-800 text-white border-emerald-900 shadow-sm ring-1 ring-emerald-700'
                                        : 'bg-slate-50 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700'
                                    }`}
                                  >
                                    <span className="font-bold text-xs">{level}</span>
                                    <span
                                      className={`text-[10px] mt-0.5 ${
                                        isSelected
                                          ? 'text-emerald-100 font-semibold'
                                          : 'text-slate-400 dark:text-zinc-400'
                                      }`}
                                    >
                                      {pts} pts
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-2.5 px-4 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-dashed border-slate-300 dark:border-zinc-700 text-center text-xs text-slate-500 dark:text-zinc-400">
                              Achievement level is locked to <strong className="text-slate-700 dark:text-zinc-200">NULL</strong> for {entry.status} status. (No points assigned).
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Bar (Save Draft, Finalise & Navigation) */}
              <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl border border-slate-300 dark:border-zinc-700 p-3 sm:p-4 shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-6 text-sm text-slate-600 dark:text-zinc-300">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-slate-400 block">Status</span>
                    {isFinalised ? (
                      <span className="font-bold text-slate-900 dark:text-white">Locked (Finalised)</span>
                    ) : isDirty ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Unsaved Changes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        All Changes Saved
                      </span>
                    )}
                  </div>
                  <div className="border-l border-slate-200 dark:border-zinc-700 pl-3 sm:pl-4">
                    <span className="text-xs uppercase tracking-wider text-slate-400 block">Subjects Entered</span>
                    <span className="font-bold text-slate-900 dark:text-white">{completedEntriesCount} / 9</span>
                  </div>
                  <div className="border-l border-slate-200 dark:border-zinc-700 pl-3 sm:pl-4">
                    <span className="text-xs uppercase tracking-wider text-slate-400 block">Total Points</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{totalPoints}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto justify-end">
                  {/* Save Draft Button */}
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isFinalised || isExamYearClosed || isSavingDraft || isFinalising}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm whitespace-nowrap shrink-0"
                  >
                    {isSavingDraft ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-500 shrink-0" />
                    ) : (
                      <Save className="w-4 h-4 text-slate-600 dark:text-zinc-300 shrink-0" />
                    )}
                    <span>Save Draft</span>
                  </button>

                  {/* Finalise Result Button */}
                  <button
                    type="button"
                    onClick={handleFinaliseResult}
                    disabled={isFinalised || isExamYearClosed || isSavingDraft || isFinalising}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-800 hover:bg-emerald-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md whitespace-nowrap shrink-0"
                  >
                    {isFinalising ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
                    ) : (
                      <FileCheck className="w-4 h-4 text-emerald-200 shrink-0" />
                    )}
                    <span>Finalise Result</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* Unsaved Changes Confirmation Modal                                     */}
      {/* ---------------------------------------------------------------------- */}
      {showUnsavedConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-md w-full border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6">
              <div className="flex items-center gap-3 text-amber-600 pb-3 border-b border-slate-200 dark:border-zinc-800">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Unsaved Changes Detected
                </h3>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">
                You have unsaved changes in the results form for{' '}
                <strong className="text-slate-900 dark:text-white">
                  {selectedStudent?.full_name || 'the current learner'}
                </strong>
                . How would you like to proceed before switching?
              </p>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleConfirmSaveAndSwitch}
                  disabled={isSavingDraft}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-800 hover:bg-emerald-700 text-white transition shadow-sm"
                >
                  {isSavingDraft ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Draft & Switch</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDiscardAndSwitch}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition"
                >
                  <span>Discard Changes & Switch</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelSwitch}
                  className="w-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition"
                >
                  Stay on Current Learner
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* Reopen Audit Modal (Restricted to Administrator)                       */}
      {/* ---------------------------------------------------------------------- */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-lg w-full border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-lg">
                  <Unlock className="w-5 h-5 text-amber-600" />
                  <h3>Reopen Finalised KJSEA Result</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">
                This result has already been finalised and locked. Reopening will unlock it for editing and record an entry in the authoritative <code className="bg-slate-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">kjsea_audit_logs</code> table.
              </p>

              {reopenError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-xs flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{reopenError}</span>
                </div>
              )}

              <div className="mt-4">
                <label
                  htmlFor="reopen-reason-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Mandatory Audit Reason (min 5 characters) *
                </label>
                <textarea
                  id="reopen-reason-input"
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g. Correction of Mathematics achievement level following review..."
                  className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 text-sm text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  disabled={isReopening}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReopen}
                  disabled={isReopening || reopenReason.trim().length < 5}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
                >
                  {isReopening ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                  <span>Confirm & Unlock Result</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* Create Examination Year Modal (Admin Only)                             */}
      {/* ---------------------------------------------------------------------- */}
      {showCreateYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-md w-full border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <form onSubmit={handleConfirmCreateYear} className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-lg">
                  <Calendar className="w-5 h-5 text-emerald-700" />
                  <h3>Create KJSEA Examination Year</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateYearModal(false)}
                  disabled={isCreatingYear}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">
                Initialize a new KJSEA national assessment cohort. The proposed year is dynamically derived from the active academic session.
              </p>

              {createYearError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-xs flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{createYearError}</span>
                </div>
              )}

              <div className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="proposed-year-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1"
                  >
                    Examination Calendar Year *
                  </label>
                  <input
                    id="proposed-year-input"
                    type="number"
                    min={2020}
                    max={2050}
                    value={proposedYearInput}
                    onChange={(e) => setProposedYearInput(Number(e.target.value))}
                    disabled={isCreatingYear}
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-sm font-semibold text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                    <span>Range: 2020 – 2050</span>
                    <span>Current Active Session: {activeAcademicYear}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1">
                    Initial Status
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                      initialStatusChoice === 'open'
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                    }`}>
                      <input
                        type="radio"
                        name="initial-year-status"
                        checked={initialStatusChoice === 'open'}
                        onChange={() => setInitialStatusChoice('open')}
                        className="text-emerald-700 focus:ring-emerald-500"
                      />
                      <span>Open for Entry</span>
                    </label>

                    <label className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                      initialStatusChoice === 'closed'
                        ? 'border-amber-600 bg-amber-50/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                        : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                    }`}>
                      <input
                        type="radio"
                        name="initial-year-status"
                        checked={initialStatusChoice === 'closed'}
                        onChange={() => setInitialStatusChoice('closed')}
                        className="text-amber-700 focus:ring-amber-500"
                      />
                      <span>Closed / Locked</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                    {initialStatusChoice === 'open'
                      ? 'The examination year will be active immediately so candidates can be assessed.'
                      : 'The year will be created locked. You can open it later when entry commences.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateYearModal(false)}
                  disabled={isCreatingYear}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingYear || !proposedYearInput}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {isCreatingYear ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>{isCreatingYear ? 'Creating Year...' : 'Confirm & Create Year'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* Examination Year Status Change Modal (Admin Only)                      */}
      {/* ---------------------------------------------------------------------- */}
      {showYearStatusModal && selectedExamYear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-lg w-full border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-lg">
                  {targetYearStatus === 'open' ? (
                    <Unlock className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Lock className="w-5 h-5 text-amber-600" />
                  )}
                  <h3>
                    {targetYearStatus === 'open' ? 'Open Examination Year' : 'Close Examination Year'} ({selectedExamYear.exam_year})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowYearStatusModal(false)}
                  disabled={isUpdatingYearStatus}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">
                {targetYearStatus === 'open'
                  ? `Opening examination year ${selectedExamYear.exam_year} allows authorized teachers and administrators to enter and update candidate results.`
                  : `Closing examination year ${selectedExamYear.exam_year} locks all candidate results and marks them read-only.`}
              </p>

              {yearStatusError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-xs flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{yearStatusError}</span>
                </div>
              )}

              <div className="mt-4">
                <label
                  htmlFor="year-status-reason-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Mandatory Audit Reason (min 5 characters) *
                </label>
                <textarea
                  id="year-status-reason-input"
                  rows={3}
                  value={yearStatusReason}
                  onChange={(e) => setYearStatusReason(e.target.value)}
                  placeholder={
                    targetYearStatus === 'open'
                      ? 'e.g. Opening for official Grade 9 KJSEA national assessment entries...'
                      : 'e.g. Concluding cohort entries following national assessment finalisation...'
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 text-sm text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowYearStatusModal(false)}
                  disabled={isUpdatingYearStatus}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmYearStatusChange}
                  disabled={isUpdatingYearStatus || yearStatusReason.trim().length < 5}
                  className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow ${
                    targetYearStatus === 'open'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {isUpdatingYearStatus ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : targetYearStatus === 'open' ? (
                    <Unlock className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>
                    {isUpdatingYearStatus
                      ? 'Updating...'
                      : targetYearStatus === 'open'
                      ? 'Confirm & Open Year'
                      : 'Confirm & Close Year'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KjseaAdminManagement;
