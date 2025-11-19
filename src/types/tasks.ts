export type TaskType = 'search' | 'find' | 'click' | 'extract-dom' | 'scroll' | 'wait' | 'type' | 'enter' | 'loop';

export interface TaskConfig {
  // Search task config
  searchQuery?: string;

  // Find task config
  selector?: string;
  text?: string;

  // Click task config
  clickSelector?: string;

  // Scroll config
  scrollAmount?: number;

  // Wait config
  waitTime?: number;

  // Type config
  typeText?: string;
  targetField?: string; // Optional field identifier

  // Loop config
  loopCount?: number;
}

export interface Task {
  id: string;
  type: TaskType;
  config: TaskConfig;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  result?: any;
  // Context from previous task (for chaining)
  contextFromPrevious?: {
    foundText?: string;
    foundElement?: any;
    searchQuery?: string;
    clickedElement?: any;
    inputField?: any;
    extractedData?: any[];
  };
}

export interface Sequence {
  id?: number;
  name: string;
  tasks: Task[];
  created_at?: string;
  updated_at?: string;
}

export interface ExecutionStatus {
  isExecuting: boolean;
  isPaused: boolean;
  currentTaskIndex: number;
  totalTasks: number;
  logs: string[];
  currentLoop?: number;
  totalLoops?: number;
  extractedData?: ExtractedItem[];
}

export interface ExtractedItem {
  title: string;
  url?: string;
  snippet?: string;
  type?: string;
}

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isActive: boolean;
  isFrozen: boolean;
  // Metadata for frozen tabs (to restore state)
  metadata?: {
    scrollPosition?: { x: number; y: number };
    lastVisited?: number;
    canGoBack?: boolean;
    canGoForward?: boolean;
  };
}
