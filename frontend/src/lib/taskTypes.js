import { CheckSquare, Bug, Sparkles, BookOpen, TrendingUp, HelpCircle } from "lucide-react";

// All bg classes use /15 opacity so they adapt to both light and dark mode
export const TASK_TYPES = [
  { value: "task",        label: "Task",        icon: CheckSquare, color: "text-slate-500 dark:text-slate-400",   bg: "bg-slate-500/15"   },
  { value: "bug",         label: "Bug",          icon: Bug,         color: "text-red-500 dark:text-red-400",       bg: "bg-red-500/15"     },
  { value: "feature",     label: "Feature",      icon: Sparkles,    color: "text-violet-500 dark:text-violet-400", bg: "bg-violet-500/15"  },
  { value: "story",       label: "Story",        icon: BookOpen,    color: "text-blue-500 dark:text-blue-400",     bg: "bg-blue-500/15"    },
  { value: "improvement", label: "Improvement",  icon: TrendingUp,  color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/15" },
  { value: "question",    label: "Question",     icon: HelpCircle,  color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-500/15"  },
];

export const getTaskType = (value) =>
  TASK_TYPES.find((t) => t.value === value) || TASK_TYPES[0];
