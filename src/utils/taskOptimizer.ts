import { Task } from '../types/tasks';

/**
 * A* Algorithm for Task Path Optimization
 *
 * This module uses A* pathfinding to optimize the execution order of tasks.
 * The algorithm considers:
 * - Task dependencies (e.g., must find before click)
 * - Page navigation costs (searches require page loads)
 * - DOM state changes (clicks may alter page structure)
 *
 * Future integration points:
 * - LLM integration: AI can suggest task sequences, and A* will optimize them
 * - DOM analysis: Extract actual DOM distances for more accurate heuristics
 * - Playwright integration: Use real browser states for path planning
 */

interface TaskNode {
  task: Task;
  index: number;
  gCost: number; // Actual cost from start
  hCost: number; // Heuristic cost to goal
  fCost: number; // Total cost (g + h)
  parent: TaskNode | null;
}

/**
 * Calculate heuristic cost for a task
 * Lower cost = higher priority
 */
function calculateHeuristic(task: Task, goalIndex: number, currentIndex: number): number {
  const distanceToGoal = Math.abs(goalIndex - currentIndex);

  // Base costs for different task types
  const typeCosts: Record<string, number> = {
    'search': 10, // Expensive: requires page navigation
    'find': 3,    // Medium: requires DOM traversal
    'click': 5,   // Medium-high: changes page state
    'extract-dom': 2, // Cheap: read-only operation
    'scroll': 1,  // Very cheap: visual change only
    'wait': 1,    // Cheap: just a delay
  };

  const baseCost = typeCosts[task.type] || 5;
  return baseCost + distanceToGoal;
}

/**
 * Calculate actual cost between two tasks
 * Considers dependencies and state changes
 */
function calculateActualCost(fromTask: Task | null, toTask: Task): number {
  if (!fromTask) return 0;

  let cost = 1; // Base transition cost

  // Search task always requires page reload - expensive
  if (toTask.type === 'search') {
    cost += 10;
  }

  // If previous task was a click, DOM might have changed
  if (fromTask.type === 'click' && (toTask.type === 'find' || toTask.type === 'extract-dom')) {
    cost += 3; // Need to wait for DOM updates
  }

  // Find before click is a common pattern - optimize it
  if (fromTask.type === 'find' && toTask.type === 'click') {
    cost -= 1; // Reduce cost for this efficient pattern
  }

  // Extract-dom should come after page is stable
  if (toTask.type === 'extract-dom' && fromTask.type === 'click') {
    cost += 2; // Wait for page to settle
  }

  return Math.max(cost, 1); // Minimum cost of 1
}

/**
 * A* Algorithm Implementation
 * Finds the optimal execution order for tasks
 */
export function optimizeTaskSequence(tasks: Task[]): Task[] {
  if (tasks.length <= 1) return tasks;

  // For now, we'll use A* to validate and optimize existing sequences
  // In the future, this can generate completely new orderings

  const openList: TaskNode[] = [];
  const closedList: TaskNode[] = [];

  // Start with the first task
  const startNode: TaskNode = {
    task: tasks[0],
    index: 0,
    gCost: 0,
    hCost: calculateHeuristic(tasks[0], tasks.length - 1, 0),
    fCost: 0,
    parent: null,
  };
  startNode.fCost = startNode.gCost + startNode.hCost;

  openList.push(startNode);

  while (openList.length > 0) {
    // Find node with lowest fCost
    openList.sort((a, b) => a.fCost - b.fCost);
    const currentNode = openList.shift()!;

    // Goal: we've processed all tasks
    if (currentNode.index === tasks.length - 1) {
      // Reconstruct path
      const optimizedTasks: Task[] = [];
      let node: TaskNode | null = currentNode;
      while (node) {
        optimizedTasks.unshift(node.task);
        node = node.parent;
      }
      return optimizedTasks;
    }

    closedList.push(currentNode);

    // Check next tasks
    for (let i = currentNode.index + 1; i < tasks.length; i++) {
      const nextTask = tasks[i];

      // Check if already in closed list
      if (closedList.some(n => n.index === i)) continue;

      const gCost = currentNode.gCost + calculateActualCost(currentNode.task, nextTask);
      const hCost = calculateHeuristic(nextTask, tasks.length - 1, i);
      const fCost = gCost + hCost;

      // Check if this path is better
      const existingNode = openList.find(n => n.index === i);
      if (existingNode && existingNode.gCost <= gCost) {
        continue; // Existing path is better
      }

      const newNode: TaskNode = {
        task: nextTask,
        index: i,
        gCost,
        hCost,
        fCost,
        parent: currentNode,
      };

      if (existingNode) {
        // Update existing node
        const idx = openList.indexOf(existingNode);
        openList[idx] = newNode;
      } else {
        openList.push(newNode);
      }
    }
  }

  // If A* fails, return original sequence
  return tasks;
}

/**
 * Analyze task sequence and provide optimization suggestions
 */
export function analyzeTaskSequence(tasks: Task[]): {
  isOptimal: boolean;
  suggestions: string[];
  estimatedCost: number;
} {
  const suggestions: string[] = [];
  let estimatedCost = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const prevTask = i > 0 ? tasks[i - 1] : null;
    const nextTask = i < tasks.length - 1 ? tasks[i + 1] : null;

    estimatedCost += calculateActualCost(prevTask, task);

    // Check for anti-patterns
    if (task.type === 'click' && nextTask?.type === 'find') {
      suggestions.push(`Task ${i + 1}: Consider adding a 'wait' after click before finding elements`);
    }

    if (task.type === 'extract-dom' && prevTask?.type === 'click') {
      suggestions.push(`Task ${i + 1}: Page may not be stable after click - consider waiting`);
    }

    if (task.type === 'search' && i > 0 && i < tasks.length - 1) {
      suggestions.push(`Task ${i + 1}: Search in middle of sequence may disrupt flow - consider reordering`);
    }

    // Check for missing configurations
    if (task.type === 'search' && !task.config.searchQuery) {
      suggestions.push(`Task ${i + 1}: Missing search query`);
    }

    if (task.type === 'find' && !task.config.selector && !task.config.text) {
      suggestions.push(`Task ${i + 1}: Missing selector or text to find`);
    }

    if (task.type === 'click' && !task.config.clickSelector) {
      suggestions.push(`Task ${i + 1}: Missing click selector`);
    }
  }

  const isOptimal = suggestions.length === 0;

  return {
    isOptimal,
    suggestions,
    estimatedCost,
  };
}
