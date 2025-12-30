"use client";

import { Terminal, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { AtlasTask } from "./hooks/use-atlas-agent";

interface TaskListProps {
  tasks: AtlasTask[];
  onTaskClick?: (task: AtlasTask) => void;
}

function getTaskDescription(task: AtlasTask): string {
  // Priority: description > summary > first message > fallback
  if (task.description) return task.description;
  if (task.summary) return task.summary;
  const first = task.context?.[0] as any;
  const firstMessage = first?.content || first?.data?.text;
  if (firstMessage) return firstMessage;
  return `Task ${task.id.slice(0, 8)}`;
}

function getLiveOutput(task: AtlasTask): string | null {
  // For in-progress/pending tasks, just show "Processing..."
  if (task.state === "in-progress" || task.state === "pending" || task.state === "new") {
    return "Processing...";
  }
  return null;
}

function getStatusStyle(state: AtlasTask["state"]) {
  switch (state) {
    case "in-progress":
      return "bg-blue-500/10 text-blue-600";
    case "completed":
    case "pending-user-feedback":
      return "bg-green-500/10 text-green-600";
    case "failed":
      return "bg-red-500/10 text-red-600";
    default:
      return "bg-muted/50 text-muted-foreground";
  }
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  return (
    <div className="my-2 h-[calc(100vh-250px)] w-full overflow-y-auto transition-all duration-300 ease-in-out">
      <div className="mx-auto w-full max-w-4xl space-y-3 px-4 pb-4">
        <AnimatePresence mode="popLayout">
          {tasks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-muted-foreground flex flex-col items-center justify-center py-20 opacity-50"
            >
              <p>No active tasks</p>
            </motion.div>
          ) : (
            tasks.map((task, index) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { delay: index * 0.05 },
                }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onTaskClick?.(task)}
                className={cn(
                  "group border-border bg-card hover:bg-muted/30 relative flex flex-col gap-2 rounded-lg border p-4 shadow-sm transition-colors",
                  onTaskClick && "cursor-pointer",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="icon-glow flex h-8 w-8 items-center justify-center rounded-lg">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {task.agentId}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {task.id.slice(0, 8)}
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs capitalize",
                      getStatusStyle(task.state),
                    )}
                  >
                    {task.state.replace("-", " ")}
                  </div>
                </div>

                <div className="text-muted-foreground line-clamp-2 pl-10 text-sm">
                  <p className="text-muted-foreground">
                    {getTaskDescription(task)}
                  </p>
                  {(task.state === "in-progress" || task.state === "pending") &&
                    getLiveOutput(task) && (
                      <div className="mt-1 animate-pulse overflow-hidden text-xs text-green-600">
                        <Shimmer>{getLiveOutput(task)!}</Shimmer>
                      </div>
                    )}
                </div>

                {/* Click indicator */}
                {onTaskClick && (
                  <div className="absolute right-3 bottom-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
