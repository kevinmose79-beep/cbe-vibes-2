import { describe, it, expect } from 'vitest';
import { resolveBackNavigationAction } from '../utils/backNavigationHandler';
import { TabType } from '../components/Sidebar';

describe('Android Back Navigation Top-Level History Integration', () => {
  it('correctly pops from history stack on back press without jumping to dashboard', () => {
    const history: TabType[] = ['dashboard', 'students'];
    let activeTab: TabType = 'marks-entry';
    const defaultTab: TabType = 'dashboard';

    const getContext = () => {
      const hasHistory = history.length > 0;
      const canGoBack = hasHistory || activeTab !== defaultTab;

      return {
        isModalOpen: false,
        isDrawerOpen: false,
        canGoBack,
        onGoBack: () => {
          if (history.length > 0) {
            activeTab = history.pop()!;
          } else {
            activeTab = defaultTab;
          }
        },
        isRootView: !canGoBack,
      };
    };

    // Step 1: User is at marks-entry with history ['dashboard', 'students']
    let result = resolveBackNavigationAction(getContext());
    expect(result.action).toBe('NAVIGATE_BACK');
    expect(result.handled).toBe(true);
    expect(activeTab).toBe('students');
    expect(history).toEqual(['dashboard']);

    // Step 2: User is at students with history ['dashboard']
    result = resolveBackNavigationAction(getContext());
    expect(result.action).toBe('NAVIGATE_BACK');
    expect(result.handled).toBe(true);
    expect(activeTab).toBe('dashboard');
    expect(history).toEqual([]);

    // Step 3: User is at dashboard with empty history -> should exit/background app, NOT navigate
    result = resolveBackNavigationAction(getContext());
    expect(result.action).toBe('EXIT_APP');
    expect(result.handled).toBe(false);
    expect(activeTab).toBe('dashboard');
  });

  it('handles consecutive duplicates in history safely', () => {
    const history: TabType[] = ['dashboard', 'marks-entry'];
    let activeTab: TabType = history[history.length - 1];
    const defaultTab: TabType = 'dashboard';

    // Prune duplicates matching activeTab
    while (history.length > 0 && history[history.length - 1] === activeTab) {
      history.pop();
    }

    const hasHistory = history.length > 0;
    const canGoBack = hasHistory || activeTab !== defaultTab;

    expect(history).toEqual(['dashboard']);
    expect(canGoBack).toBe(true);

    const result = resolveBackNavigationAction({
      canGoBack,
      onGoBack: () => {
        activeTab = history.pop()!;
      },
      isRootView: !canGoBack,
    });

    expect(result.action).toBe('NAVIGATE_BACK');
    expect(activeTab).toBe('dashboard');
  });
});
