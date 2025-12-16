"use client";

import { useState, useRef } from "react";
import { VncScreen, VncScreenHandle } from "react-vnc";
import { Button } from "@/components/ui/button";
import { Minimize2, Maximize2, X } from "lucide-react";

interface VncDisplayProps {
  vncUrl: string;
  onClose: () => void;
}

export function VncDisplay({ vncUrl, onClose }: VncDisplayProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const vncRef = useRef<VncScreenHandle>(null);

  // Convert HTTP URL to WebSocket URL for VNC
  const getWebSocketUrl = (url: string) => {
    // E2B VNC URLs are typically HTTP and need to be converted to WebSocket
    if (url.startsWith('http://')) {
      return url.replace('http://', 'ws://').replace('https://', 'wss://');
    }
    return url;
  };

  return (
    <div className={`fixed bg-black border border-gray-300 rounded-lg shadow-2xl ${
      isMaximized ? 'inset-0 rounded-none' : 'bottom-4 right-4 w-96 h-64'
    } z-50`}>
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-2 rounded-t-lg">
        <span className="text-sm font-medium">Desktop Stream</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMaximized(!isMaximized)}
            className="h-6 w-6 p-0 text-white hover:bg-gray-700"
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-white hover:bg-red-600"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* VNC Content */}
      <div className="relative w-full h-full bg-black">
        <VncScreen
          ref={vncRef}
          url={getWebSocketUrl(vncUrl)}
          scaleViewport
          background="#000000"
          style={{
            width: '100%',
            height: '100%',
          }}
          viewOnly={false}
        />
      </div>
    </div>
  );
}
