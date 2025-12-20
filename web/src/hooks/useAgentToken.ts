import { useCallback, useEffect, useState } from "react";

interface AgentTokenResponse {
  token: string;
  userId: string;
}

export default function useAgentToken() {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/token");
      if (!res.ok) {
        throw new Error(`Failed to fetch agent token: ${res.statusText}`);
      }
      const data: AgentTokenResponse = await res.json();
      setToken(data.token);
      setUserId(data.userId);
    } catch (err) {
      console.error("Error fetching agent token:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return { token, userId, error, isLoading, refreshToken: fetchToken };
}
