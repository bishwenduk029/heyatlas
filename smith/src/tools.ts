import { createTool } from "@voltagent/core";
import { z } from "zod";

// Tool to send task updates back to Atlas (which broadcasts to voice agent)
export const sendTaskUpdateTool = createTool({
	name: "send_task_update",
	description:
		"Send a task progress update or completion message back to the voice agent. Use this to keep the user informed about task status.",
	parameters: z.object({
		message: z.string().describe("The update message to send to the user"),
		status: z
			.enum(["running", "completed", "error"])
			.describe("The status of the task"),
	}),
	execute: async ({ message, status }) => {
		const callbackToken = process.env.SANDBOX_CALLBACK_TOKEN;
		const userId = process.env.SANDBOX_USER_ID;
		const atlasCallbackUrl = process.env.ATLAS_CALLBACK_URL;

		if (!callbackToken || !userId || !atlasCallbackUrl) {
			return { success: false, error: "Missing callback configuration" };
		}

		// POST to Atlas agent endpoint: {ATLAS_CALLBACK_URL}/agents/atlas-agent/{userId}
		const url = `${atlasCallbackUrl}/agents/atlas-agent/${userId}`;

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${callbackToken}`,
				},
				body: JSON.stringify({
					type: "task-update",
					content: message,
					status,
					source: "sandbox",
				}),
			});

			if (!response.ok) {
				return { success: false, error: `HTTP ${response.status}` };
			}

			return { success: true, message: "Update sent to Atlas" };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	},
});
