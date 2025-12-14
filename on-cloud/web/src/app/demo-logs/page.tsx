"use client";

import { MatrixLogs } from "@/components/voice/matrix-logs";

export default function DemoLogsPage() {
  return (
    <div className="h-screen w-screen">
      <MatrixLogs logsUrl="http://localhost:8090" />
    </div>
  );
}
