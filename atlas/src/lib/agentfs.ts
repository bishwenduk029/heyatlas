/**
 * AgentFS Integration for Atlas Agent
 *
 * Provides a virtual filesystem for storing notes, facts, and data
 * using AgentFS with Cloudflare Durable Objects SQLite storage.
 *
 * NOTE: We cannot use agentfs-sdk/just-bash because it imports from
 * index_node.js which has Node.js dependencies (createRequire) that
 * don't work in Cloudflare Workers. This is a local implementation
 * of the AgentFsWrapper that uses only agentfs-sdk/cloudflare.
 */
import { createBashTool } from "bash-tool";
import { Bash, type IFileSystem } from "just-bash";
import { AgentFS, type CloudflareStorage } from "agentfs-sdk/cloudflare";

export type { CloudflareStorage };

const FS_INSTRUCTIONS = `You have a persistent virtual filesystem for storing notes, facts, and research.

## Directory Structure (pre-created)
- /notes/ - Conversation summaries, user preferences, personal observations
- /facts/ - Key facts: user's name, job, projects, interests, people mentioned
- /research/ - Web search results, article summaries, reference material

## Commands
- ls [path] - List directory
- cat <file> - Read file
- echo "content" > file - Write/overwrite file
- echo "content" >> file - Append to file  
- mkdir -p <path> - Create directory
- rm <file> - Delete file
- grep "text" <path> - Search files

## Best Practices
1. After learning user's name: echo "Name: Alice" >> /facts/user.md
2. After web search: echo "# Topic Summary\n..." > /research/topic.md
3. Note preferences: echo "Prefers concise answers" >> /notes/prefs.md
4. Before asking personal questions: grep or cat to check if you already know
5. Use dated filenames for logs: /notes/2026-01-11.md

Files persist across sessions - use this memory wisely.`;

/**
 * Wrapper that adapts AgentFS to just-bash IFileSystem interface.
 * This is needed because AgentFS uses different method signatures.
 */
class AgentFsWrapper implements IFileSystem {
  constructor(private readonly agentFs: AgentFS) {}

  async readFile(path: string): Promise<string> {
    const data = await this.agentFs.readFile(path, "utf-8");
    return data;
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const data = await this.agentFs.readFile(path);
    return new Uint8Array(data);
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const str = typeof content === "string" ? content : new TextDecoder().decode(content);
    await this.agentFs.writeFile(path, str);
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<void> {
    let existing = "";
    try {
      existing = await this.readFile(path);
    } catch {
      // File doesn't exist, start empty
    }
    const str = typeof content === "string" ? content : new TextDecoder().decode(content);
    await this.writeFile(path, existing + str);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.agentFs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string) {
    const stats = await this.agentFs.stat(path);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      mode: stats.mode,
      size: stats.size,
      mtime: new Date(stats.mtime * 1000),
    };
  }

  async lstat(path: string) {
    return this.stat(path);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      const parts = path.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current += "/" + part;
        try {
          await this.agentFs.mkdir(current);
        } catch {
          // Directory may already exist
        }
      }
    } else {
      await this.agentFs.mkdir(path);
    }
  }

  async readdir(path: string): Promise<string[]> {
    return this.agentFs.readdir(path);
  }

  async rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void> {
    try {
      await this.agentFs.rm(path, options);
    } catch (e) {
      if (!options?.force) throw e;
    }
  }

  async cp(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    const srcStat = await this.stat(src);
    if (srcStat.isFile) {
      await this.agentFs.copyFile(src, dest);
    } else if (srcStat.isDirectory && options?.recursive) {
      await this.mkdir(dest, { recursive: true });
      const children = await this.readdir(src);
      for (const child of children) {
        await this.cp(`${src}/${child}`, `${dest}/${child}`, options);
      }
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.agentFs.rename(src, dest);
  }

  resolvePath(base: string, path: string): string {
    if (path.startsWith("/")) return path;
    return base === "/" ? `/${path}` : `${base}/${path}`;
  }

  getAllPaths(): string[] {
    return [];
  }

  async chmod(): Promise<void> {
    // No-op for AgentFS
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.agentFs.symlink(target, linkPath);
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    await this.agentFs.copyFile(existingPath, newPath);
  }

  async readlink(path: string): Promise<string> {
    return this.agentFs.readlink(path);
  }
}

export async function createFSTools(storage: CloudflareStorage) {
  const agentFs = AgentFS.create(storage);
  const bashFs = new AgentFsWrapper(agentFs);

  // Ensure root directory structure exists
  try {
    await bashFs.mkdir("/notes", { recursive: true });
    await bashFs.mkdir("/facts", { recursive: true });
    await bashFs.mkdir("/research", { recursive: true });
  } catch {
    // Directories may already exist
  }

  const bash = new Bash({ fs: bashFs, cwd: "/" });

  const { tools } = await createBashTool({
    sandbox: bash,
    destination: "/",
    extraInstructions: FS_INSTRUCTIONS,
  });

  return { bash: tools.bash };
}
