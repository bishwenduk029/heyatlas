"use client";

import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MatrixLogs } from "./matrix-logs";
import { toast } from "sonner";

interface DesktopViewerProps {
  vncUrl?: string;
  logUrl?: string;
  mobileChatContent?: React.ReactNode;
}

export function DesktopViewer({
  vncUrl,
  logUrl,
  mobileChatContent,
}: DesktopViewerProps) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const defaultTab = mobileChatContent && isMobile ? "chat" : "computer";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const renderDesktopPane = () => {
    if (!vncUrl) {
      return (
        <div className="bg-muted/30 flex h-full w-full flex-col items-center justify-center">
          <Monitor className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-sm">Desktop Viewer</p>
          <p className="text-muted-foreground mt-1 text-xs">
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

  const renderTabs = () => {
    const getGridColsClass = () => {
      if (isMobile) return mobileChatContent ? "grid-cols-3" : "grid-cols-2";
      return "grid-cols-2";
    };

    return (
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full w-full flex-col"
      >
        <TabsList className={`grid w-full ${getGridColsClass()}`}>
          <TabsTrigger value="computer">Computer</TabsTrigger>
          {mobileChatContent && (
            <TabsTrigger value="chat" className="md:hidden">
              Chat
            </TabsTrigger>
          )}
          <TabsTrigger value="logs">Under Hood</TabsTrigger>
        </TabsList>

        <TabsContent value="computer" className="h-full flex-1 overflow-hidden">
          {renderDesktopPane()}
        </TabsContent>

        {mobileChatContent && (
          <TabsContent value="chat" className="h-full flex-1 overflow-hidden md:hidden">
            {mobileChatContent}
          </TabsContent>
        )}

        <TabsContent value="logs" className="h-full flex-1 overflow-hidden">
          <MatrixLogs logsUrl={logUrl} />
        </TabsContent>
      </Tabs>
    );
  };

  return <div className="flex h-full w-full flex-col">{renderTabs()}</div>;
}
