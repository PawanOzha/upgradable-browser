import React from 'react';
import { Search, Eye, MousePointerClick, Code, Clock, X, GripVertical, CheckCircle, Keyboard, Repeat, CornerDownLeft } from 'lucide-react';
import { Task, TaskType } from '../types/tasks';

interface TaskCardProps {
  task: Task;
  index: number;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
  onRemove: (taskId: string) => void;
  dragHandleProps?: any;
}

const taskIcons: Record<TaskType, React.ReactNode> = {
  'search': <Search className="w-4 h-4" />,
  'find': <Eye className="w-4 h-4" />,
  'click': <MousePointerClick className="w-4 h-4" />,
  'extract-dom': <Code className="w-4 h-4" />,
  'scroll': <Code className="w-4 h-4" />,
  'wait': <Clock className="w-4 h-4" />,
  'type': <Keyboard className="w-4 h-4" />,
  'enter': <CornerDownLeft className="w-4 h-4" />,
  'loop': <Repeat className="w-4 h-4" />,
};

const taskColors: Record<TaskType, string> = {
  'search': 'bg-blue-500/20 border-blue-500/40',
  'find': 'bg-purple-500/20 border-purple-500/40',
  'click': 'bg-green-500/20 border-green-500/40',
  'extract-dom': 'bg-orange-500/20 border-orange-500/40',
  'scroll': 'bg-yellow-500/20 border-yellow-500/40',
  'wait': 'bg-gray-500/20 border-gray-500/40',
  'type': 'bg-cyan-500/20 border-cyan-500/40',
  'enter': 'bg-indigo-500/20 border-indigo-500/40',
  'loop': 'bg-pink-500/20 border-pink-500/40',
};

const statusBorders: Record<string, string> = {
  'pending': 'border-gray-600',
  'running': 'border-blue-500 shadow-lg shadow-blue-500/50',
  'completed': 'border-green-500',
  'failed': 'border-red-500',
};

export default function TaskCard({ task, index, onUpdate, onRemove, dragHandleProps }: TaskCardProps) {
  const updateConfig = (key: string, value: any) => {
    onUpdate(task.id, {
      config: { ...task.config, [key]: value },
    });
  };

  const borderClass = task.status ? statusBorders[task.status] : 'border-gray-600';

  return (
    <div
      className={`relative rounded-lg border-2 p-3 ${taskColors[task.type]} ${borderClass} transition-all`}
      style={{ backgroundColor: '#2d2d2b' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div {...dragHandleProps} className="cursor-move text-gray-500 hover:text-gray-300">
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            {taskIcons[task.type]}
            <span className="text-sm font-semibold text-gray-200">
              {index + 1}. {task.type.toUpperCase().replace('-', ' ')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {task.status && (
            <>
              {task.status === 'completed' && (
                <CheckCircle className="w-5 h-5 text-green-400" />
              )}
              {task.status === 'running' && (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              {task.status === 'failed' && (
                <span className="text-xs font-bold text-red-400">✗</span>
              )}
            </>
          )}
          <button
            onClick={() => onRemove(task.id)}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Configuration Inputs */}
      <div className="space-y-2">
        {task.type === 'search' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Search Query</label>
            <input
              type="text"
              placeholder="e.g., Gojo Satoru"
              value={task.config.searchQuery || ''}
              onChange={(e) => updateConfig('searchQuery', e.target.value)}
              className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-blue-500"
            />
          </div>
        )}

        {task.type === 'find' && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">CSS Selector</label>
              <input
                type="text"
                placeholder="e.g., .search-button"
                value={task.config.selector || ''}
                onChange={(e) => updateConfig('selector', e.target.value)}
                className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Or Text Content</label>
              <input
                type="text"
                placeholder="e.g., Click here"
                value={task.config.text || ''}
                onChange={(e) => updateConfig('text', e.target.value)}
                className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-purple-500"
              />
            </div>
          </>
        )}

        {task.type === 'click' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Element Selector</label>
            <input
              type="text"
              placeholder="e.g., button.submit"
              value={task.config.clickSelector || ''}
              onChange={(e) => updateConfig('clickSelector', e.target.value)}
              className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-green-500"
            />
          </div>
        )}

        {task.type === 'scroll' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Scroll Amount (px)</label>
            <input
              type="number"
              placeholder="e.g., 500"
              value={task.config.scrollAmount || 0}
              onChange={(e) => updateConfig('scrollAmount', parseInt(e.target.value) || 0)}
              className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-yellow-500"
            />
          </div>
        )}

        {task.type === 'wait' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Wait Time (ms)</label>
            <input
              type="number"
              placeholder="e.g., 2000"
              value={task.config.waitTime || 1000}
              onChange={(e) => updateConfig('waitTime', parseInt(e.target.value) || 1000)}
              className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-gray-500"
            />
          </div>
        )}

        {task.type === 'extract-dom' && (
          <div className="text-xs text-gray-400 italic">
            This will extract all visible text content from the page
          </div>
        )}

        {task.type === 'type' && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Text to Type</label>
              <input
                type="text"
                placeholder="e.g., john@example.com"
                value={task.config.typeText || ''}
                onChange={(e) => updateConfig('typeText', e.target.value)}
                className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Target Field (Optional)</label>
              <input
                type="text"
                placeholder="e.g., username, password, email"
                value={task.config.targetField || ''}
                onChange={(e) => updateConfig('targetField', e.target.value)}
                className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-cyan-500"
              />
            </div>
            <div className="text-xs text-gray-400 italic mt-1">
              💡 Specify 'username', 'password', 'email' etc. to target specific inputs
            </div>
          </>
        )}

        {task.type === 'enter' && (
          <div className="text-xs text-gray-400 italic">
            ↵ Press Enter key on the focused element or submit form
          </div>
        )}

        {task.type === 'loop' && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Repeat Count</label>
              <input
                type="number"
                placeholder="e.g., 3"
                min="1"
                max="100"
                value={task.config.loopCount || 1}
                onChange={(e) => updateConfig('loopCount', parseInt(e.target.value) || 1)}
                className="w-full bg-[#1f1f1f] text-sm text-gray-200 px-3 py-1.5 rounded border border-[#3c3c3c] outline-none focus:border-pink-500"
              />
            </div>
            <div className="text-xs text-gray-400 italic mt-1">
              ⚠️ Loop should be placed LAST - it repeats the entire sequence
            </div>
          </>
        )}
      </div>

      {/* Error Display */}
      {task.error && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
          Error: {task.error}
        </div>
      )}
    </div>
  );
}
