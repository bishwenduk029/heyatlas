"use client";

import { useEffect, useRef, useState } from "react";

interface MatrixLogsProps {
  logsUrl?: string;
}

export function MatrixLogs({ logsUrl }: MatrixLogsProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!logsUrl) return;

    // Convert https://host:9001 to wss://host:9001/ws
    const wsUrl = logsUrl.replace(/^https?:/, logsUrl.startsWith('https') ? 'wss:' : 'ws:') + '/ws';

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Logdy sends: {"message_type":"log_bulk","messages":[...]}
            if (data.message_type === 'log_bulk' && Array.isArray(data.messages)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const newLogs = data.messages.map((msg: any) => msg.content || msg.log || JSON.stringify(msg));
              setLogs((prev) => [...prev, ...newLogs].slice(-500));
            } 
            // Single log message: {"message_type":"log","content":"..."}
            else if (data.message_type === 'log' && data.content) {
              setLogs((prev) => [...prev, data.content].slice(-500));
            }
          } catch {
            // If not JSON, just add raw text
            setLogs((prev) => [...prev, event.data].slice(-500));
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          setTimeout(connect, 3000);
        };
      } catch (error) {
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [logsUrl]);

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!logsUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="text-center font-mono" style={{ color: '#00ff41' }}>
          <div className="text-xl mb-2">●</div>
          <div>NO SIGNAL</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#000000' }}>
      {/* Simple header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b font-mono text-xs" style={{ borderColor: '#00ff4120', color: '#00ff41' }}>
        <div 
          className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
          style={{ 
            backgroundColor: isConnected ? '#00ff41' : '#ff0000',
            boxShadow: isConnected ? '0 0 8px #00ff41' : '0 0 8px #ff0000'
          }}
        />
        <span>{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-auto p-3 font-mono text-sm" style={{ color: '#00ff41' }}>
        {logs.length === 0 ? (
          <div className="opacity-60">
            <span className="animate-pulse">▓</span> WAITING FOR DATA...
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap" style={{ textShadow: '0 0 2px #00ff4160' }}>
              {log}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
