export {};

declare global {
  interface Window {
    database: {
      saveSequence: (name: string, tasks: any[]) => Promise<{ success: boolean; id?: number; error?: string }>;
      loadSequence: (name: string) => Promise<{ success: boolean; sequence?: any; error?: string }>;
      getAllSequences: () => Promise<{ success: boolean; sequences?: any[]; error?: string }>;
      deleteSequence: (name: string) => Promise<{ success: boolean; changes?: number; error?: string }>;
    };
    webviewAPI: {
      search: (query: string) => Promise<{ success: boolean; url?: string; error?: string }>;
      find: (selector: string) => Promise<{ success: boolean; selector?: string; error?: string }>;
      click: (selector: string) => Promise<{ success: boolean; selector?: string; error?: string }>;
      extractDOM: () => Promise<{ success: boolean; error?: string }>;
      scroll: (y: number) => Promise<{ success: boolean; y?: number; error?: string }>;
      execute: (code: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}
