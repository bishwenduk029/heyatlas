import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";

const UPLOAD_EXTS = new Set([
  "docx", "xlsx", "pptx", "pdf", "html", "csv",
  "png", "jpg", "jpeg", "gif", "svg", "zip", "md", "txt",
]);

const FILE_PATH_RE = /(?:\/[\w.${},-]+)+\.(?:docx|xlsx|pptx|pdf|html|csv|png|jpg|jpeg|gif|svg|zip|md|txt)\b/gi;

export const UploadPlugin = async ({ directory }) => {
  const agentsDir = join(directory, "agents");
  const metaPath = join(agentsDir, "task-meta.json");
  const outputsPath = join(agentsDir, "outputs.json");
  const trackedFiles = new Set();

  return {
    "tool.execute.after": async (input, output) => {
      const result = typeof output === "string" ? output : JSON.stringify(output);
      const matches = result.match(FILE_PATH_RE);
      if (matches) {
        for (const fp of matches) {
          if (existsSync(fp)) trackedFiles.add(fp);
        }
      }
    },
    event: async ({ event }) => {
      if (event.type === "file.edited" && event.properties?.file) {
        const ext = event.properties.file.split(".").pop()?.toLowerCase();
        if (ext && UPLOAD_EXTS.has(ext)) trackedFiles.add(event.properties.file);
      }
      if (event.type === "session.idle" && trackedFiles.size > 0) {
        if (!existsSync(metaPath)) { trackedFiles.clear(); return; }
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
          if (!meta.publicUrl || !meta.bucket) return;
          const dest = "r2:" + meta.bucket + "/" + meta.userId + "/" + meta.taskId;
          const base = meta.publicUrl.replace(/\/$/, "");
          const urls = [];
          for (const fp of trackedFiles) {
            if (!existsSync(fp)) continue;
            const name = basename(fp);
            try {
              execSync("rclone copyto \"" + fp + "\" \"" + dest + "/" + name + "\"", { stdio: "pipe", timeout: 30000 });
              urls.push({ url: base + "/" + meta.userId + "/" + meta.taskId + "/" + name, filename: name });
            } catch {}
          }
          if (urls.length > 0) writeFileSync(outputsPath, JSON.stringify(urls));
          trackedFiles.clear();
        } catch {}
      }
    },
  };
};
