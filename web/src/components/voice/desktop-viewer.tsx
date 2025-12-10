"use client";

import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { MatrixLogs } from "./matrix-logs";

interface DesktopViewerProps {
  vncUrl?: string;
  logUrl?: string;
  mobileChatContent?: React.ReactNode; // New prop for mobile chat
}

export function DesktopViewer({ vncUrl, logUrl, mobileChatContent }: DesktopViewerProps) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const defaultTab = mobileChatContent && isMobile ? "chat" : "computer";
  const renderDesktopPane = () => {
    if (!vncUrl) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-muted/30">
          <Monitor className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Desktop Viewer</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Agent workspace will appear here
          </p>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={vncUrl}
          className="h-full w-full border-0"
          title="Agent Desktop"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
        />
      </div>
    );
  };

  const renderLogsPane = () => {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg">
        <MatrixLogs logsUrl={logUrl} />
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs defaultValue={defaultTab} className="flex h-full w-full flex-col">
        <TabsList className={`grid w-full ${mobileChatContent ? "grid-cols-3 md:grid-cols-2" : "grid-cols-2"}`}>
          <TabsTrigger value="computer">Computer</TabsTrigger>
          <TabsTrigger value="logs">Under Hood</TabsTrigger>
          {mobileChatContent && (
             <TabsTrigger value="chat" className="md:hidden">Chat</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="computer" className="flex-1 overflow-hidden h-full">
          {renderDesktopPane()}
        </TabsContent>
        <TabsContent value="logs" className="flex-1 overflow-hidden h-full">
          {renderLogsPane()}
        </TabsContent>
        {mobileChatContent && (
           <TabsContent value="chat" className="flex-1 overflow-hidden h-full md:hidden">
             {mobileChatContent}
           </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
