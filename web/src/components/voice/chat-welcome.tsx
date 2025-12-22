import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sparkles, Terminal, BookOpen, Code } from "lucide-react";

interface ChatWelcomeProps {
  onAction?: (text: string) => void;
}

export function ChatWelcome({ onAction }: ChatWelcomeProps) {
  const suggestions = [
    { icon: <Terminal className="h-4 w-4" />, label: "Run a system update", text: "Run a system update check on the computer" },
    { icon: <Code className="h-4 w-4" />, label: "Debug my code", text: "Help me debug the code I'm working on" },
    { icon: <BookOpen className="h-4 w-4" />, label: "Summarize docs", text: "Summarize the documentation for me" },
    { icon: <Sparkles className="h-4 w-4" />, label: "Create a project", text: "Help me scaffold a new project" },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto space-y-8 mt-20">
      <div className="flex flex-col items-center space-y-2">
        <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-2xl font-semibold text-white">Hi, how can I help?</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        {suggestions.map((s, i) => (
          <Button
            key={i}
            variant="outline"
            className="h-auto py-4 px-6 flex flex-col items-start gap-2 bg-muted/10 border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left"
            onClick={() => onAction?.(s.text)}
          >
            <div className="p-2 rounded-lg bg-white/5 text-white/80">
              {s.icon}
            </div>
            <span className="text-sm font-medium text-white/90">{s.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
