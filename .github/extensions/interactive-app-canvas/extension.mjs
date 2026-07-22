import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CanvasError, createCanvas, joinSession } from "@github/copilot-sdk/extension";

const PROJECT_CANVAS_ID = "interactive-app-canvas";
const CANVAS_TITLE = "StormReady Interactive Lab";
const EDITABLE_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".json", ".md", ".html"]);
const TOP_LEVEL_EDITABLE_FILES = new Set([
    "index.html",
    "package.json",
    "vite.config.ts",
    "tsconfig.json",
    "README.md",
]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
const MAX_LOG_LINES = 200;
const DEV_SERVER_START_TIMEOUT_MS = 45_000;
const EXTENSION_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_FROM_EXTENSION = path.resolve(EXTENSION_DIRECTORY, "..", "..", "..");

const canvasServers = new Map();
const openInstances = new Set();
const devServerLogs = [];

let workspaceRoot = normalizeWorkspaceRoot(PROJECT_ROOT_FROM_EXTENSION);
let devServerProcess = null;
let devServerPort = null;
let devServerStartPromise = null;

function normalizeWorkspaceRoot(rootPath) {
    if (typeof rootPath !== "string" || !rootPath) {
        return path.resolve(process.cwd());
    }

    let normalizedPath = rootPath;
    if (normalizedPath.startsWith("file://")) {
        normalizedPath = fileURLToPath(normalizedPath);
    }

    if (process.platform === "win32" && normalizedPath.startsWith("\\\\?\\")) {
        normalizedPath = normalizedPath.slice(4);
    }

    return path.resolve(normalizedPath);
}

async function rootHasPackageJson(rootPath) {
    try {
        const packageJsonPath = path.join(rootPath, "package.json");
        const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonRaw);
        return typeof packageJson === "object" && packageJson !== null;
    } catch {
        return false;
    }
}

async function selectWorkspaceRoot(preferredRoot) {
    const seen = new Set();
    const candidates = [preferredRoot, process.cwd(), PROJECT_ROOT_FROM_EXTENSION]
        .map((candidate) => normalizeWorkspaceRoot(candidate))
        .filter((candidate) => {
            if (seen.has(candidate)) {
                return false;
            }
            seen.add(candidate);
            return true;
        });

    for (const candidate of candidates) {
        if (await rootHasPackageJson(candidate)) {
            return candidate;
        }
    }

    return candidates[0] ?? normalizeWorkspaceRoot(PROJECT_ROOT_FROM_EXTENSION);
}

function appendDevLog(source, chunk) {
    const lines = chunk
        .toString()
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
    for (const line of lines) {
        devServerLogs.push(`[${source}] ${line}`);
    }

    if (devServerLogs.length > MAX_LOG_LINES) {
        devServerLogs.splice(0, devServerLogs.length - MAX_LOG_LINES);
    }
}

function getRecentDevLogs() {
    return devServerLogs.join("\n");
}

function isDevServerRunning() {
    return Boolean(devServerProcess && devServerProcess.exitCode === null && !devServerProcess.killed);
}

async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRelativePath(inputPath) {
    if (typeof inputPath !== "string") {
        throw new Error("A file path string is required.");
    }
    const normalized = inputPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("\u0000")) {
        throw new Error("Invalid file path.");
    }
    return normalized;
}

function resolveWorkspacePath(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    const absolutePath = path.resolve(workspaceRoot, normalized);
    const rootWithSeparator = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
    if (absolutePath !== workspaceRoot && !absolutePath.startsWith(rootWithSeparator)) {
        throw new Error("The requested path is outside the workspace.");
    }
    return { normalized, absolutePath };
}

async function walkFiles(baseAbsolutePath, baseRelativePath) {
    const entries = await fs.readdir(baseAbsolutePath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name.startsWith(".")) {
            continue;
        }

        const entryAbsolutePath = path.join(baseAbsolutePath, entry.name);
        const entryRelativePath = baseRelativePath
            ? `${baseRelativePath}/${entry.name}`
            : entry.name.replace(/\\/g, "/");

        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.has(entry.name)) {
                continue;
            }
            files.push(...(await walkFiles(entryAbsolutePath, entryRelativePath)));
            continue;
        }

        const extension = path.extname(entry.name).toLowerCase();
        if (EDITABLE_EXTENSIONS.has(extension)) {
            files.push(entryRelativePath);
        }
    }

    return files;
}

async function listEditableFiles() {
    const files = new Set();
    const srcAbsolutePath = path.join(workspaceRoot, "src");

    try {
        const srcStat = await fs.stat(srcAbsolutePath);
        if (srcStat.isDirectory()) {
            const srcFiles = await walkFiles(srcAbsolutePath, "src");
            for (const srcFile of srcFiles) {
                files.add(srcFile);
            }
        }
    } catch {
        // No src directory means only top-level files are editable.
    }

    for (const fileName of TOP_LEVEL_EDITABLE_FILES) {
        try {
            const topLevelFilePath = path.join(workspaceRoot, fileName);
            const stat = await fs.stat(topLevelFilePath);
            if (stat.isFile()) {
                files.add(fileName);
            }
        } catch {
            // Ignore missing optional files.
        }
    }

    return Array.from(files).sort((left, right) => left.localeCompare(right));
}

async function assertEditablePath(relativePath) {
    const { normalized, absolutePath } = resolveWorkspacePath(relativePath);
    const editableFiles = await listEditableFiles();
    if (!editableFiles.includes(normalized)) {
        throw new Error(`'${normalized}' is not an editable app file.`);
    }
    return { normalized, absolutePath };
}

async function getFreePort() {
    return await new Promise((resolve, reject) => {
        const probeServer = net.createServer();
        probeServer.listen(0, "127.0.0.1");
        probeServer.on("listening", () => {
            const address = probeServer.address();
            if (typeof address === "object" && address && address.port) {
                probeServer.close(() => resolve(address.port));
                return;
            }
            probeServer.close(() => reject(new Error("Failed to allocate an ephemeral port.")));
        });
        probeServer.on("error", reject);
    });
}

async function waitForHttpReady(url, timeoutMs) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        if (!isDevServerRunning()) {
            throw new Error("The Vite process exited before the dev server became ready.");
        }

        try {
            const response = await fetch(url, {
                method: "GET",
                redirect: "manual",
            });
            if (response.status >= 200 && response.status < 500) {
                return;
            }
        } catch {
            // Keep polling until timeout or process exit.
        }

        await delay(400);
    }
    throw new Error(`Timed out waiting for ${url} after ${Math.floor(timeoutMs / 1000)}s.`);
}

async function stopDevServer() {
    if (!devServerProcess) {
        return;
    }

    const processToStop = devServerProcess;
    devServerProcess = null;
    devServerPort = null;

    processToStop.kill("SIGTERM");

    const wasClosed = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5_000);
        processToStop.once("exit", () => {
            clearTimeout(timeout);
            resolve(true);
        });
    });

    if (!wasClosed) {
        processToStop.kill("SIGKILL");
    }
}

async function ensureDevServer() {
    if (isDevServerRunning() && devServerPort) {
        return `http://127.0.0.1:${devServerPort}/`;
    }

    if (devServerStartPromise) {
        return devServerStartPromise;
    }

    devServerStartPromise = (async () => {
        const port = await getFreePort();
        const args = ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
        const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
        appendDevLog("config", `workspaceRoot=${resolvedWorkspaceRoot}`);

        const child =
            process.platform === "win32"
                ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
                      cwd: resolvedWorkspaceRoot,
                      env: { ...process.env },
                      stdio: ["ignore", "pipe", "pipe"],
                      windowsHide: true,
                  })
                : spawn("npm", args, {
                      cwd: resolvedWorkspaceRoot,
                      env: { ...process.env },
                      stdio: ["ignore", "pipe", "pipe"],
                      windowsHide: true,
                  });

        child.stdout?.on("data", (chunk) => appendDevLog("stdout", chunk));
        child.stderr?.on("data", (chunk) => appendDevLog("stderr", chunk));

        devServerProcess = child;
        devServerPort = port;

        child.once("exit", (code, signal) => {
            appendDevLog("process", `dev server exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
            if (devServerProcess === child) {
                devServerProcess = null;
                devServerPort = null;
            }
        });

        const previewUrl = `http://127.0.0.1:${port}/`;
        await waitForHttpReady(previewUrl, DEV_SERVER_START_TIMEOUT_MS);
        return previewUrl;
    })();

    try {
        return await devServerStartPromise;
    } catch (error) {
        await stopDevServer();
        const recentLogs = getRecentDevLogs();
        const message = error instanceof Error ? error.message : "Failed to start the app dev server.";
        throw new Error(
            [
                `${message}`,
                "Run 'npm install' in the workspace if dependencies are missing.",
                recentLogs ? `Recent dev-server logs:\n${recentLogs}` : "",
            ]
                .filter(Boolean)
                .join("\n\n"),
        );
    } finally {
        devServerStartPromise = null;
    }
}

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
    const chunks = [];
    let receivedBytes = 0;

    for await (const chunk of req) {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_JSON_BODY_BYTES) {
            throw new Error("Request body is too large.");
        }
        chunks.push(chunk);
    }

    if (!chunks.length) {
        return {};
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");
    try {
        return JSON.parse(rawBody);
    } catch {
        throw new Error("Request body must be valid JSON.");
    }
}

function renderHtml(instanceId) {
    const serializedInstanceId = JSON.stringify(instanceId);
    const pageTitle = JSON.stringify(CANVAS_TITLE);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${CANVAS_TITLE}</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        background: var(--background-color-default, #ffffff);
        color: var(--text-color-default, #1f2328);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(420px, 40%) 1fr;
        height: 100vh;
      }
      .panel {
        border-right: 1px solid var(--border-color-default, #d0d7de);
        display: flex;
        flex-direction: column;
        min-width: 360px;
      }
      .toolbar {
        padding: 12px;
        border-bottom: 1px solid var(--border-color-default, #d0d7de);
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        align-items: center;
      }
      .status {
        font-size: 12px;
        color: var(--text-color-muted, #59636e);
      }
      .body {
        display: grid;
        grid-template-columns: 170px 1fr;
        min-height: 0;
        flex: 1;
      }
      .files {
        border-right: 1px solid var(--border-color-default, #d0d7de);
        overflow: auto;
      }
      .file-button {
        width: 100%;
        border: 0;
        border-bottom: 1px solid var(--border-color-default, #d0d7de);
        background: transparent;
        text-align: left;
        padding: 8px 10px;
        font-size: 12px;
        color: inherit;
        cursor: pointer;
      }
      .file-button.active {
        background: var(--true-color-blue-muted, rgba(9, 105, 218, 0.15));
        font-weight: 600;
      }
      .editor-wrap {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      #editor {
        flex: 1;
        border: 0;
        outline: none;
        resize: none;
        width: 100%;
        padding: 12px;
        box-sizing: border-box;
        font-family: var(--font-mono, "SFMono-Regular", Consolas, "Liberation Mono", monospace);
        font-size: 12px;
        line-height: 1.5;
        background: var(--background-color-default, #ffffff);
        color: var(--text-color-default, #1f2328);
      }
      .editor-actions {
        border-top: 1px solid var(--border-color-default, #d0d7de);
        display: grid;
        grid-template-columns: auto auto 1fr;
        gap: 8px;
        padding: 8px 12px;
        align-items: center;
      }
      button {
        border: 1px solid var(--border-color-default, #d0d7de);
        background: var(--background-color-default, #ffffff);
        color: inherit;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
      }
      button:focus-visible {
        outline: 2px solid var(--color-focus-outline, #0969da);
        outline-offset: 2px;
      }
      button.primary {
        border-color: transparent;
        background: var(--true-color-blue, #0969da);
        color: var(--color-white, #ffffff);
      }
      .hint {
        font-size: 12px;
        color: var(--text-color-muted, #59636e);
        justify-self: end;
      }
      .preview-panel {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .preview-header {
        border-bottom: 1px solid var(--border-color-default, #d0d7de);
        padding: 10px 12px;
        font-size: 12px;
        color: var(--text-color-muted, #59636e);
        display: flex;
        justify-content: space-between;
      }
      #preview {
        border: 0;
        width: 100%;
        height: 100%;
      }
      .collab {
        border-top: 1px solid var(--border-color-default, #d0d7de);
        padding: 8px 12px;
        font-size: 12px;
        color: var(--text-color-muted, #59636e);
      }
      .error {
        color: var(--true-color-red, #d1242f);
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <section class="panel">
        <div class="toolbar">
          <strong id="title"></strong>
          <button id="refresh-files">Refresh files</button>
          <button id="refresh-preview">Reload preview</button>
          <div id="status" class="status">Starting…</div>
        </div>
        <div class="body">
          <nav id="files" class="files"></nav>
          <div class="editor-wrap">
            <textarea id="editor" spellcheck="false" aria-label="Editable source file"></textarea>
            <div class="editor-actions">
              <button id="save-file" class="primary">Save (Ctrl+S)</button>
              <button id="collab-brief">Get collaboration brief</button>
              <span id="editor-hint" class="hint">No file selected</span>
            </div>
          </div>
        </div>
        <div id="collab-output" class="collab"></div>
      </section>
      <section class="preview-panel">
        <div class="preview-header">
          <span>Live app preview</span>
          <span id="preview-url"></span>
        </div>
        <iframe id="preview" title="Live app preview"></iframe>
      </section>
    </div>
    <script>
      const INSTANCE_ID = ${serializedInstanceId};
      const TITLE = ${pageTitle};
      const state = {
        files: [],
        activeFile: null,
        originalContent: "",
        previewUrl: "",
      };

      const els = {
        title: document.getElementById("title"),
        status: document.getElementById("status"),
        files: document.getElementById("files"),
        editor: document.getElementById("editor"),
        save: document.getElementById("save-file"),
        hint: document.getElementById("editor-hint"),
        preview: document.getElementById("preview"),
        previewUrl: document.getElementById("preview-url"),
        collabOutput: document.getElementById("collab-output"),
        refreshFiles: document.getElementById("refresh-files"),
        refreshPreview: document.getElementById("refresh-preview"),
        collabBrief: document.getElementById("collab-brief"),
      };

      function setStatus(message, isError) {
        els.status.textContent = message;
        els.status.className = isError ? "status error" : "status";
      }

      function isDirty() {
        return state.activeFile !== null && els.editor.value !== state.originalContent;
      }

      function renderHint() {
        if (!state.activeFile) {
          els.hint.textContent = "No file selected";
          return;
        }
        const dirtyLabel = isDirty() ? "unsaved changes" : "saved";
        els.hint.textContent = state.activeFile + " (" + dirtyLabel + ")";
      }

      async function fetchJson(url, options) {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || ("Request failed with " + response.status));
        }
        return payload;
      }

      async function loadStatus() {
        const payload = await fetchJson("/api/status");
        state.previewUrl = payload.previewUrl;
        els.preview.src = payload.previewUrl;
        els.previewUrl.textContent = payload.previewUrl;
      }

      function renderFiles() {
        els.files.innerHTML = "";
        for (const filePath of state.files) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = filePath;
          button.className = "file-button" + (state.activeFile === filePath ? " active" : "");
          button.addEventListener("click", () => openFile(filePath));
          els.files.appendChild(button);
        }
      }

      async function loadFiles() {
        const payload = await fetchJson("/api/files");
        state.files = payload.files || [];
        if (!state.files.length) {
          state.activeFile = null;
          els.editor.value = "";
          state.originalContent = "";
          renderFiles();
          renderHint();
          setStatus("No editable files were found in this workspace.", true);
          return;
        }

        if (!state.activeFile || !state.files.includes(state.activeFile)) {
          state.activeFile = payload.activeFile && state.files.includes(payload.activeFile)
            ? payload.activeFile
            : state.files[0];
        }

        renderFiles();
        await openFile(state.activeFile, true);
      }

      async function openFile(filePath, skipDirtyCheck) {
        if (!skipDirtyCheck && isDirty()) {
          const shouldDiscard = window.confirm("Discard unsaved changes in " + state.activeFile + "?");
          if (!shouldDiscard) {
            return;
          }
        }

        const payload = await fetchJson("/api/file?path=" + encodeURIComponent(filePath));
        state.activeFile = payload.path;
        state.originalContent = payload.content;
        els.editor.value = payload.content;
        renderFiles();
        renderHint();
        setStatus("Editing " + state.activeFile, false);
      }

      async function saveActiveFile() {
        if (!state.activeFile) {
          return;
        }
        const content = els.editor.value;
        const payload = await fetchJson("/api/file", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: state.activeFile, content }),
        });
        state.originalContent = content;
        renderHint();
        setStatus("Saved " + payload.path + ". Vite preview updates automatically.", false);
      }

      async function loadCollaborationBrief() {
        const payload = await fetchJson("/api/collaboration-brief");
        els.collabOutput.textContent = payload.brief;
      }

      function reloadPreview() {
        if (!state.previewUrl) {
          return;
        }
        els.preview.src = state.previewUrl + "?t=" + Date.now();
      }

      async function initialize() {
        els.title.textContent = TITLE + " (" + INSTANCE_ID + ")";
        setStatus("Loading app workspace…", false);
        try {
          await loadStatus();
          await loadFiles();
          setStatus("Ready", false);
        } catch (error) {
          setStatus(error.message || "Failed to initialize the interactive canvas.", true);
        }
      }

      els.editor.addEventListener("input", renderHint);
      els.save.addEventListener("click", () => {
        saveActiveFile().catch((error) => setStatus(error.message || "Save failed", true));
      });
      els.refreshFiles.addEventListener("click", () => {
        loadFiles().catch((error) => setStatus(error.message || "Failed to refresh files", true));
      });
      els.refreshPreview.addEventListener("click", reloadPreview);
      els.collabBrief.addEventListener("click", () => {
        loadCollaborationBrief().catch((error) => setStatus(error.message || "Failed to build collaboration brief", true));
      });
      window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          saveActiveFile().catch((error) => setStatus(error.message || "Save failed", true));
        }
      });

      initialize();
    </script>
  </body>
</html>`;
}

async function closeHttpServer(server) {
    await new Promise((resolve) => server.close(resolve));
}

async function startCanvasServer(instanceId) {
    const state = {
        selectedFile: null,
        saveCount: 0,
        lastSavedAt: null,
    };

    const server = createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
            const method = req.method ?? "GET";

            if (method === "GET" && requestUrl.pathname === "/") {
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.end(renderHtml(instanceId));
                return;
            }

            if (method === "GET" && requestUrl.pathname === "/api/status") {
                const previewUrl = await ensureDevServer();
                sendJson(res, 200, {
                    instanceId,
                    previewUrl,
                    activeFile: state.selectedFile,
                    saveCount: state.saveCount,
                    lastSavedAt: state.lastSavedAt,
                });
                return;
            }

            if (method === "GET" && requestUrl.pathname === "/api/files") {
                const files = await listEditableFiles();
                if (!state.selectedFile || !files.includes(state.selectedFile)) {
                    state.selectedFile = files[0] ?? null;
                }
                sendJson(res, 200, {
                    files,
                    activeFile: state.selectedFile,
                });
                return;
            }

            if (method === "GET" && requestUrl.pathname === "/api/file") {
                const requestedPath = requestUrl.searchParams.get("path");
                const { normalized, absolutePath } = await assertEditablePath(requestedPath ?? "");
                const content = await fs.readFile(absolutePath, "utf8");
                state.selectedFile = normalized;
                sendJson(res, 200, {
                    path: normalized,
                    content,
                });
                return;
            }

            if (method === "PUT" && requestUrl.pathname === "/api/file") {
                const body = await readJsonBody(req);
                const content = body?.content;
                const { normalized, absolutePath } = await assertEditablePath(body?.path ?? "");
                if (typeof content !== "string") {
                    throw new Error("File content must be a string.");
                }
                await fs.writeFile(absolutePath, content, "utf8");
                state.selectedFile = normalized;
                state.saveCount += 1;
                state.lastSavedAt = new Date().toISOString();
                sendJson(res, 200, {
                    path: normalized,
                    bytes: Buffer.byteLength(content, "utf8"),
                    saveCount: state.saveCount,
                    lastSavedAt: state.lastSavedAt,
                });
                return;
            }

            if (method === "GET" && requestUrl.pathname === "/api/collaboration-brief") {
                const previewUrl = isDevServerRunning() && devServerPort ? `http://127.0.0.1:${devServerPort}/` : null;
                const selectedFileText = state.selectedFile ?? "no file selected";
                const brief = [
                    "Collaboration brief:",
                    `- Active file: ${selectedFileText}`,
                    `- Saves in this canvas: ${state.saveCount}`,
                    `- Live preview: ${previewUrl ?? "not running yet"}`,
                    "- Ask the agent for focused improvements, then validate the result in this preview.",
                ].join("\n");
                sendJson(res, 200, { brief });
                return;
            }

            sendJson(res, 404, { error: `No route for ${method} ${requestUrl.pathname}` });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown server error.";
            sendJson(res, 400, { error: message });
        }
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || !address || !address.port) {
        throw new Error("Failed to bind an HTTP server for the canvas instance.");
    }

    return {
        server,
        state,
        url: `http://127.0.0.1:${address.port}/`,
    };
}

function asCanvasError(error, defaultCode = "interactive_canvas_error") {
    if (error instanceof CanvasError) {
        return error;
    }

    const message = error instanceof Error ? error.message : "Unknown canvas error.";
    return new CanvasError(defaultCode, message);
}

function getInstanceEntry(instanceId) {
    const entry = canvasServers.get(instanceId);
    if (!entry) {
        throw new CanvasError("instance_not_open", `Canvas instance '${instanceId}' is not open.`);
    }
    return entry;
}

async function disposeAllResources() {
    const entries = Array.from(canvasServers.values());
    canvasServers.clear();
    openInstances.clear();
    await Promise.all(entries.map((entry) => closeHttpServer(entry.server)));
    await stopDevServer();
}

let shutdownInProgress = false;
async function shutdownAndExit(exitCode) {
    if (shutdownInProgress) {
        return;
    }
    shutdownInProgress = true;
    try {
        await disposeAllResources();
    } finally {
        process.exit(exitCode);
    }
}

process.once("SIGINT", () => {
    void shutdownAndExit(0);
});
process.once("SIGTERM", () => {
    void shutdownAndExit(0);
});

const session = await joinSession({
    canvases: [
        createCanvas({
            id: PROJECT_CANVAS_ID,
            displayName: "Interactive app canvas",
            description:
                "Runs StormReady in a live preview and provides in-canvas editing so users and the agent can improve the app together.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    activeFile: { type: "string", description: "Optional file to open first (for example src/App.tsx)." },
                },
            },
            actions: [
                {
                    name: "get_app_status",
                    description: "Return app runtime status, preview URL, and canvas editing metadata.",
                    handler: async (ctx) => {
                        try {
                            const previewUrl = await ensureDevServer();
                            const entry = getInstanceEntry(ctx.instanceId);
                            return {
                                running: isDevServerRunning(),
                                previewUrl,
                                workspaceRoot,
                                activeFile: entry.state.selectedFile,
                                saves: entry.state.saveCount,
                                lastSavedAt: entry.state.lastSavedAt,
                            };
                        } catch (error) {
                            throw asCanvasError(error, "app_status_failed");
                        }
                    },
                },
                {
                    name: "list_editable_files",
                    description: "List files editable in the interactive canvas.",
                    handler: async () => {
                        try {
                            const files = await listEditableFiles();
                            return { files, count: files.length };
                        } catch (error) {
                            throw asCanvasError(error, "list_files_failed");
                        }
                    },
                },
                {
                    name: "read_file",
                    description: "Read a file currently editable in the canvas.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["path"],
                        properties: {
                            path: { type: "string", description: "Relative file path to read." },
                        },
                    },
                    handler: async (ctx) => {
                        try {
                            const requestedPath = ctx?.input?.path;
                            const { normalized, absolutePath } = await assertEditablePath(requestedPath ?? "");
                            const content = await fs.readFile(absolutePath, "utf8");
                            return { path: normalized, content };
                        } catch (error) {
                            throw asCanvasError(error, "read_file_failed");
                        }
                    },
                },
                {
                    name: "write_file",
                    description: "Write updated content to a file editable in the canvas.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["path", "content"],
                        properties: {
                            path: { type: "string", description: "Relative file path to write." },
                            content: { type: "string", description: "Full replacement file content." },
                        },
                    },
                    handler: async (ctx) => {
                        try {
                            const requestedPath = ctx?.input?.path;
                            const content = ctx?.input?.content;
                            if (typeof content !== "string") {
                                throw new Error("The 'content' field must be a string.");
                            }
                            const { normalized, absolutePath } = await assertEditablePath(requestedPath ?? "");
                            await fs.writeFile(absolutePath, content, "utf8");
                            const entry = getInstanceEntry(ctx.instanceId);
                            entry.state.selectedFile = normalized;
                            entry.state.saveCount += 1;
                            entry.state.lastSavedAt = new Date().toISOString();
                            return {
                                path: normalized,
                                bytes: Buffer.byteLength(content, "utf8"),
                                saveCount: entry.state.saveCount,
                                lastSavedAt: entry.state.lastSavedAt,
                            };
                        } catch (error) {
                            throw asCanvasError(error, "write_file_failed");
                        }
                    },
                },
                {
                    name: "get_collaboration_brief",
                    description: "Provide a concise collaboration context for follow-up enhancement prompts.",
                    handler: async (ctx) => {
                        try {
                            const entry = getInstanceEntry(ctx.instanceId);
                            const previewUrl = isDevServerRunning() && devServerPort ? `http://127.0.0.1:${devServerPort}/` : null;
                            return {
                                summary: {
                                    activeFile: entry.state.selectedFile,
                                    saveCount: entry.state.saveCount,
                                    lastSavedAt: entry.state.lastSavedAt,
                                    previewUrl,
                                },
                                promptHint:
                                    "Describe the behavior you want changed, name the target file, and ask the agent to implement and verify it while you watch the live preview.",
                            };
                        } catch (error) {
                            throw asCanvasError(error, "collaboration_brief_failed");
                        }
                    },
                },
            ],
            open: async (ctx) => {
                try {
                    await ensureDevServer();
                    let entry = canvasServers.get(ctx.instanceId);
                    if (!entry) {
                        entry = await startCanvasServer(ctx.instanceId);
                        canvasServers.set(ctx.instanceId, entry);
                    }
                    openInstances.add(ctx.instanceId);

                    const requestedFile = ctx?.input?.activeFile;
                    if (requestedFile) {
                        const { normalized } = await assertEditablePath(requestedFile);
                        entry.state.selectedFile = normalized;
                    }

                    const status = isDevServerRunning()
                        ? "Live preview running"
                        : "Starting live preview";

                    return {
                        title: CANVAS_TITLE,
                        status,
                        url: entry.url,
                    };
                } catch (error) {
                    throw asCanvasError(error, "open_failed");
                }
            },
            onClose: async (ctx) => {
                const entry = canvasServers.get(ctx.instanceId);
                if (entry) {
                    canvasServers.delete(ctx.instanceId);
                    openInstances.delete(ctx.instanceId);
                    await closeHttpServer(entry.server);
                }

                if (openInstances.size === 0) {
                    await stopDevServer();
                }
            },
        }),
    ],
});

workspaceRoot = await selectWorkspaceRoot(session.workspacePath ?? process.cwd());
await session.log(`Interactive canvas loaded for workspace: ${workspaceRoot}`, {
    level: "info",
    ephemeral: true,
});
