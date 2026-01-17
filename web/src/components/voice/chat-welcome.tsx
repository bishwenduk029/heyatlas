import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sparkles, Terminal, BookOpen, Code } from "lucide-react";

interface ChatWelcomeProps {
  onAction?: (text: string) => void;
}

export function ChatWelcome({ onAction }: ChatWelcomeProps) {
  const suggestions = [
    {
      icon: <Terminal className="h-4 w-4" />,
      label: "Run a system update",
      text: "Run a system update check on the computer",
    },
    {
      icon: <Code className="h-4 w-4" />,
      label: "Debug my code",
      text: "Help me debug the code I'm working on",
    },
    {
      icon: <BookOpen className="h-4 w-4" />,
      label: "Summarize docs",
      text: "Summarize the documentation for me",
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: "Create a project",
      text: "Help me scaffold a new project",
    },
  ];

  return (
    <div className="mx-auto mt-20 flex h-full max-w-2xl flex-col items-center justify-center space-y-8">
      <div className="flex flex-col items-center space-y-2">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-2xl font-semibold text-white">
          Hi, shall we start?
        </h2>
      </div>
    </div>
  );
}
