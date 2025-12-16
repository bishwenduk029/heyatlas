import env from "@/env";
import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  inferAdditionalFields,
  deviceAuthorizationClient,
} from "better-auth/client/plugins";
import { dodopaymentsClient } from "@dodopayments/better-auth";
import type { auth } from "./server";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  plugins: [
    magicLinkClient(),
    inferAdditionalFields<typeof auth>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dodopaymentsClient() as any,
    deviceAuthorizationClient(),
  ],
});

// Export commonly used methods with type assertions to work around plugin type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = authClient as any;
export const signIn = client.signIn;
export const signOut = client.signOut;
export const signUp = client.signUp;
export const useSession = client.useSession;
export const getSession = client.getSession;
