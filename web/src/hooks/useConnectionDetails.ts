import { useCallback, useEffect, useState } from "react";
import { decodeJwt } from "jose";
import type { ConnectionDetails } from "@/app/api/voice/token/route";

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

export default function useConnectionDetails() {
  const [connectionDetails, setConnectionDetails] =
    useState<ConnectionDetails | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const fetchConnectionDetails = useCallback(async () => {
    setConnectionDetails(null);
    setError(null);
    const url = "/api/voice/token";

    let data: ConnectionDetails;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch token: ${res.statusText}`);
      }

      data = await res.json();
      setConnectionDetails(data);
      return data;
    } catch (error) {
      console.error("Error fetching connection details:", error);
      const err = new Error("Error fetching connection details!");
      setError(err);
      throw err;
    }
  }, []);

  useEffect(() => {
    // Don't fetch on mount, wait for user to start session
  }, []);

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) {
      return true;
    }

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) {
      return true;
    }
    const expiresAt = new Date(
      jwtPayload.exp * 1000 - ONE_MINUTE_IN_MILLISECONDS
    );

    const now = new Date();
    return expiresAt <= now;
  }, [connectionDetails?.participantToken]);

  const existingOrRefreshConnectionDetails = useCallback(async () => {
    if (isConnectionDetailsExpired() || !connectionDetails) {
      return fetchConnectionDetails();
    } else {
      return connectionDetails;
    }
  }, [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]);

  return {
    connectionDetails,
    error,
    refreshConnectionDetails: fetchConnectionDetails,
    existingOrRefreshConnectionDetails,
  };
}
