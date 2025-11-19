import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Task, Sequence, ExecutionStatus, Tab } from '../types/tasks';

interface TaskStore {
  // Current sequence being built
  tasks: Task[];

  // Saved sequences
  savedSequences: Sequence[];

  // Execution status
  executionStatus: ExecutionStatus;

  // Tab management
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  addTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  reorderTasks: (startIndex: number, endIndex: number) => void;
  clearTasks: () => void;

  // Sequence management
  loadSequence: (sequence: Sequence) => void;
  setSavedSequences: (sequences: Sequence[]) => void;

  // Execution
  setExecutionStatus: (status: Partial<ExecutionStatus>) => void;
  addLog: (log: string) => void;
  clearLogs: () => void;

  // Tab management actions
  addTab: (url?: string) => string; // Returns new tab ID
  removeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  freezeTab: (tabId: string) => void;
  unfreezeTab: (tabId: string) => void;
}

export const useTaskStore = create<TaskStore>()(persist((set, get) => ({
  tasks: [],
  savedSequences: [],
  tabs: [
    {
      id: 'tab-1',
      title: 'New Tab',
      url: 'about:blank',
      isActive: true,
      isFrozen: false,
    },
  ],
  activeTabId: 'tab-1',
  executionStatus: {
    isExecuting: false,
    isPaused: false,
    currentTaskIndex: -1,
    totalTasks: 0,
    logs: [],
    extractedData: [],
  },

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    })),

  reorderTasks: (startIndex, endIndex) =>
    set((state) => {
      const result = Array.from(state.tasks);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { tasks: result };
    }),

  clearTasks: () => set({ tasks: [] }),

  loadSequence: (sequence) =>
    set({
      tasks: sequence.tasks.map(t => ({ ...t, status: 'pending' })),
    }),

  setSavedSequences: (sequences) =>
    set({ savedSequences: sequences }),

  setExecutionStatus: (status) =>
    set((state) => ({
      executionStatus: { ...state.executionStatus, ...status },
    })),

  addLog: (log) =>
    set((state) => ({
      executionStatus: {
        ...state.executionStatus,
        logs: [...state.executionStatus.logs, `[${new Date().toLocaleTimeString()}] ${log}`],
      },
    })),

  clearLogs: () =>
    set((state) => ({
      executionStatus: {
        ...state.executionStatus,
        logs: [],
      },
    })),

  // Tab management
  addTab: (url = 'about:blank') => {
    const newTabId = `tab-${Date.now()}`;
    set((state) => ({
      tabs: state.tabs.map(t => ({ ...t, isActive: false })).concat([
        {
          id: newTabId,
          title: 'New Tab',
          url,
          isActive: true,
          isFrozen: false,
        },
      ]),
      activeTabId: newTabId,
    }));
    return newTabId;
  },

  removeTab: (tabId) =>
    set((state) => {
      const remainingTabs = state.tabs.filter((t) => t.id !== tabId);
      if (remainingTabs.length === 0) {
        // Create a new default tab if all are closed
        const newTabId = `tab-${Date.now()}`;
        return {
          tabs: [
            {
              id: newTabId,
              title: 'New Tab',
              url: 'about:blank',
              isActive: true,
              isFrozen: false,
            },
          ],
          activeTabId: newTabId,
        };
      }
      // If removing active tab, activate another one
      const newActiveId =
        state.activeTabId === tabId
          ? remainingTabs[remainingTabs.length - 1].id
          : state.activeTabId;
      return {
        tabs: remainingTabs.map((t) => ({
          ...t,
          isActive: t.id === newActiveId,
        })),
        activeTabId: newActiveId,
      };
    }),

  switchTab: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) => ({
        ...t,
        isActive: t.id === tabId,
        metadata: t.isActive && t.id !== tabId
          ? { ...t.metadata, lastVisited: Date.now() }
          : t.metadata,
      })),
      activeTabId: tabId,
    })),

  updateTab: (tabId, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, ...updates } : t
      ),
    })),

  freezeTab: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, isFrozen: true, metadata: { ...t.metadata, lastVisited: Date.now() } }
          : t
      ),
    })),

  unfreezeTab: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, isFrozen: false } : t
      ),
    })),
}), {
  name: 'agentic-browser-tabs',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  } as any),
}));
