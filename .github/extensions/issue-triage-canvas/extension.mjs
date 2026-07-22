import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CanvasError, createCanvas, joinSession } from "@github/copilot-sdk/extension";

const execFileAsync = promisify(execFile);
const PRIORITY_PREFIX = "priority:";
const PRIORITY_LEVELS = ["P0", "P1", "P2", "P3", "P4"];

const openSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        state: { type: "string", enum: ["open", "closed", "all"] },
        search: { type: "string" },
        labels: {
            type: "array",
            items: { type: "string", minLength: 1 },
        },
        priority: { type: "string", enum: ["", ...PRIORITY_LEVELS] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
    },
};

const getIssuesSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        state: { type: "string", enum: ["open", "closed", "all"] },
        search: { type: "string" },
        labels: {
            type: "array",
            items: { type: "string", minLength: 1 },
        },
        priority: { type: "string", enum: ["", ...PRIORITY_LEVELS] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
    },
};

const updatePrioritySchema = {
    type: "object",
    additionalProperties: false,
    required: ["issueNumber", "priority"],
    properties: {
        issueNumber: { type: "integer", minimum: 1 },
        priority: { type: "string", enum: ["", ...PRIORITY_LEVELS] },
    },
};

const applyLabelSchema = {
    type: "object",
    additionalProperties: false,
    required: ["issueNumber", "labels"],
    properties: {
        issueNumber: { type: "integer", minimum: 1 },
        labels: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
        },
        operation: { type: "string", enum: ["add", "remove", "set"] },
    },
};

const servers = new Map();
const defaultFiltersByInstance = new Map();

let sessionRef;
let cachedRepo;
let cachedGitCwd;

const extensionDir = dirname(fileURLToPath(import.meta.url));
const projectRootFromExtension = resolve(extensionDir, "..", "..", "..");

function normalizeIssueFilters(input) {
    const state = input?.state ?? "open";
    const search = input?.search ?? "";
    const labels = Array.isArray(input?.labels)
        ? input.labels.map((label) => String(label).trim()).filter(Boolean)
        : [];
    const priority = typeof input?.priority === "string" ? input.priority.trim().toUpperCase() : "";
    const limit = Number.isInteger(input?.limit) ? Math.min(Math.max(input.limit, 1), 200) : 50;

    return { state, search, labels, priority, limit };
}

function normalizeLabels(labels) {
    if (!Array.isArray(labels)) {
        return [];
    }

    const seen = new Set();
    const result = [];
    for (const rawLabel of labels) {
        const label = String(rawLabel ?? "").trim();
        if (!label) {
            continue;
        }
        const key = label.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(label);
    }

    return result;
}

function parseLabelText(input) {
    return normalizeLabels(String(input ?? "").split(","));
}

function isPriorityLabel(label) {
    return String(label).toLowerCase().startsWith(PRIORITY_PREFIX);
}

function priorityFromLabels(labels) {
    for (const label of labels ?? []) {
        const text = typeof label === "string" ? label : label?.name;
        if (typeof text !== "string") {
            continue;
        }
        if (!isPriorityLabel(text)) {
            continue;
        }
        return text.slice(PRIORITY_PREFIX.length).toUpperCase();
    }
    return "";
}

function toPriorityLabel(priority) {
    if (!priority) {
        return "";
    }
    return `${PRIORITY_PREFIX}${priority.toUpperCase()}`;
}

function toSearchQuery(filters) {
    const segments = [];
    if (filters.search) {
        segments.push(filters.search);
    }
    for (const label of filters.labels) {
        segments.push(`label:"${label.replace(/"/g, '\\"')}"`);
    }
    if (filters.priority) {
        segments.push(`label:"${toPriorityLabel(filters.priority)}"`);
    }
    return segments.join(" ").trim();
}

function serializeForScript(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

function json(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (chunks.length === 0) {
        return {};
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new CanvasError("invalid_json", "Request body must be valid JSON.");
    }
}

async function runGh(args) {
    const gitCwd = await resolveGitCwd();

    try {
        const { stdout } = await execFileAsync("gh", args, {
            cwd: gitCwd,
            maxBuffer: 1024 * 1024 * 5,
        });
        return stdout.trim();
    } catch (error) {
        const message = error?.stderr?.trim() || error?.message || "gh command failed.";
        throw new CanvasError("gh_command_failed", message);
    }
}

async function resolveGitCwd() {
    if (cachedGitCwd) {
        return cachedGitCwd;
    }

    const candidates = [
        sessionRef?.workspacePath,
        process.cwd(),
        projectRootFromExtension,
    ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

    for (const candidate of candidates) {
        try {
            const { stdout } = await execFileAsync(
                "git",
                ["-C", candidate, "rev-parse", "--is-inside-work-tree"],
                { maxBuffer: 1024 * 64 },
            );
            if (stdout.trim() === "true") {
                cachedGitCwd = candidate;
                return candidate;
            }
        } catch {
            // Keep checking other candidates.
        }
    }

    throw new CanvasError("workspace_unavailable", "Could not locate a git repository for GitHub issue commands.");
}

async function getRepoNameWithOwner() {
    if (cachedRepo) {
        return cachedRepo;
    }
    cachedRepo = await runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    return cachedRepo;
}

async function getIssue(issueNumber) {
    const fields = ["number", "title", "url", "state", "labels", "assignees", "updatedAt"];
    const raw = await runGh([
        "issue",
        "view",
        String(issueNumber),
        "--json",
        fields.join(","),
    ]);
    const issue = JSON.parse(raw);
    const labels = (issue.labels ?? []).map((label) => label.name);

    return {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state,
        assignees: (issue.assignees ?? []).map((item) => item.login),
        updatedAt: issue.updatedAt,
        labels,
        priority: priorityFromLabels(labels),
    };
}

async function getIssues(input) {
    const filters = normalizeIssueFilters(input);
    const fields = ["number", "title", "url", "state", "labels", "assignees", "updatedAt"];
    const args = [
        "issue",
        "list",
        "--state",
        filters.state,
        "--limit",
        String(filters.limit),
        "--json",
        fields.join(","),
    ];
    const query = toSearchQuery(filters);
    if (query) {
        args.push("--search", query);
    }

    const raw = await runGh(args);
    const items = JSON.parse(raw);

    const issues = items.map((issue) => {
        const labels = (issue.labels ?? []).map((label) => label.name);
        return {
            number: issue.number,
            title: issue.title,
            url: issue.url,
            state: issue.state,
            assignees: (issue.assignees ?? []).map((item) => item.login),
            updatedAt: issue.updatedAt,
            labels,
            priority: priorityFromLabels(labels),
        };
    });

    return {
        repository: await getRepoNameWithOwner(),
        filters,
        total: issues.length,
        issues,
    };
}

async function updatePriority(issueNumber, priority) {
    const normalized = String(priority ?? "").trim().toUpperCase();
    if (normalized && !PRIORITY_LEVELS.includes(normalized)) {
        throw new CanvasError("invalid_priority", `Priority must be one of: ${PRIORITY_LEVELS.join(", ")}.`);
    }

    const issue = await getIssue(issueNumber);
    const currentLabels = normalizeLabels(issue.labels);
    const removable = currentLabels.filter((label) => isPriorityLabel(label));
    const targetLabel = toPriorityLabel(normalized);

    if (removable.length > 0) {
        await runGh(["issue", "edit", String(issueNumber), "--remove-label", removable.join(",")]);
    }

    if (targetLabel) {
        await runGh(["issue", "edit", String(issueNumber), "--add-label", targetLabel]);
    }

    return getIssue(issueNumber);
}

async function applyLabels(issueNumber, labels, operation) {
    const normalizedLabels = normalizeLabels(labels);
    if (normalizedLabels.length === 0) {
        throw new CanvasError("invalid_labels", "At least one label is required.");
    }

    const mode = operation ?? "add";
    const current = await getIssue(issueNumber);
    const currentMap = new Map(current.labels.map((label) => [label.toLowerCase(), label]));

    if (mode === "set") {
        const incomingMap = new Map(normalizedLabels.map((label) => [label.toLowerCase(), label]));
        const removeLabels = current.labels.filter((label) => !incomingMap.has(label.toLowerCase()));
        const addLabels = normalizedLabels.filter((label) => !currentMap.has(label.toLowerCase()));

        if (removeLabels.length > 0) {
            await runGh(["issue", "edit", String(issueNumber), "--remove-label", removeLabels.join(",")]);
        }
        if (addLabels.length > 0) {
            await runGh(["issue", "edit", String(issueNumber), "--add-label", addLabels.join(",")]);
        }
    } else if (mode === "remove") {
        const removeLabels = normalizedLabels.filter((label) => currentMap.has(label.toLowerCase()));
        if (removeLabels.length > 0) {
            await runGh(["issue", "edit", String(issueNumber), "--remove-label", removeLabels.join(",")]);
        }
    } else {
        const addLabels = normalizedLabels.filter((label) => !currentMap.has(label.toLowerCase()));
        if (addLabels.length > 0) {
            await runGh(["issue", "edit", String(issueNumber), "--add-label", addLabels.join(",")]);
        }
    }

    return getIssue(issueNumber);
}

function renderHtml(defaultFilters) {
    const escapedDefaults = serializeForScript(defaultFilters);
    const escapedPriorities = serializeForScript(PRIORITY_LEVELS);

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Issue triage</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        padding: 16px;
        font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
        color: var(--text-color-default, #1f2328);
        background: var(--background-color-default, #fff);
      }
      .toolbar {
        display: grid;
        grid-template-columns: 140px 1fr 1fr 140px 100px auto;
        gap: 8px;
        align-items: end;
      }
      label { display: block; font-size: 12px; color: var(--text-color-muted, #57606a); margin-bottom: 4px; }
      input, select, button {
        box-sizing: border-box;
        width: 100%;
        border-radius: 6px;
        border: 1px solid var(--border-color-default, #d0d7de);
        padding: 6px 8px;
        background: transparent;
        color: inherit;
      }
      button { cursor: pointer; }
      #status { margin: 12px 0; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-bottom: 1px solid var(--border-color-default, #d0d7de); padding: 8px 6px; vertical-align: top; }
      th { text-align: left; font-weight: 600; }
      .labels { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
      .label {
        border: 1px solid var(--border-color-default, #d0d7de);
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 12px;
      }
      .priority-buttons {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        margin-top: 6px;
      }
      .priority-buttons button { padding: 4px 6px; font-size: 12px; }
      .label-editor {
        display: grid;
        grid-template-columns: 1fr repeat(3, auto);
        gap: 4px;
      }
      .label-editor button { width: auto; padding: 4px 8px; font-size: 12px; }
      a { color: var(--text-color-link, #0969da); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .muted { color: var(--text-color-muted, #57606a); }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div>
        <label for="state">State</label>
        <select id="state">
          <option value="open">open</option>
          <option value="closed">closed</option>
          <option value="all">all</option>
        </select>
      </div>
      <div>
        <label for="search">Search</label>
        <input id="search" placeholder="auth bug is:open" />
      </div>
      <div>
        <label for="labels">Labels (comma separated)</label>
        <input id="labels" placeholder="bug,needs-triage" />
      </div>
      <div>
        <label for="priority">Priority</label>
        <select id="priority">
          <option value="">Any</option>
        </select>
      </div>
      <div>
        <label for="limit">Limit</label>
        <input id="limit" type="number" min="1" max="200" />
      </div>
      <button id="refresh">Refresh</button>
    </div>

    <div id="status" class="muted">Loading issues...</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Issue</th>
          <th>Labels + Priority</th>
          <th>Quick actions</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>

    <script>
      const defaults = ${escapedDefaults};
      const priorities = ${escapedPriorities};
      const stateEl = document.getElementById("state");
      const searchEl = document.getElementById("search");
      const labelsEl = document.getElementById("labels");
      const priorityEl = document.getElementById("priority");
      const limitEl = document.getElementById("limit");
      const refreshEl = document.getElementById("refresh");
      const statusEl = document.getElementById("status");
      const rowsEl = document.getElementById("rows");

      for (const level of priorities) {
        const option = document.createElement("option");
        option.value = level;
        option.textContent = level;
        priorityEl.appendChild(option);
      }

      stateEl.value = defaults.state || "open";
      searchEl.value = defaults.search || "";
      labelsEl.value = (defaults.labels || []).join(",");
      priorityEl.value = defaults.priority || "";
      limitEl.value = String(defaults.limit || 50);

      function escapeHtml(value) {
        return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      }

      function currentFilters() {
        return {
          state: stateEl.value,
          search: searchEl.value.trim(),
          labels: labelsEl.value.split(",").map((item) => item.trim()).filter(Boolean),
          priority: priorityEl.value,
          limit: Number(limitEl.value) || 50,
        };
      }

      function setStatus(text, isError = false) {
        statusEl.textContent = text;
        statusEl.className = isError ? "" : "muted";
      }

      async function api(path, options = {}) {
        const response = await fetch(path, options);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      }

      async function refresh() {
        const filters = currentFilters();
        const params = new URLSearchParams();
        params.set("state", filters.state);
        params.set("search", filters.search);
        params.set("priority", filters.priority);
        params.set("limit", String(filters.limit));
        for (const label of filters.labels) {
          params.append("labels", label);
        }

        setStatus("Loading issues...");
        rowsEl.innerHTML = "";
        try {
          const result = await api("/api/issues?" + params.toString());
          setStatus(result.total + " issues in " + result.repository);
          renderRows(result.issues);
        } catch (error) {
          setStatus(error.message, true);
        }
      }

      function makePriorityButtons(issue) {
        const wrap = document.createElement("div");
        wrap.className = "priority-buttons";
        for (const level of [...priorities, ""]) {
          const button = document.createElement("button");
          button.textContent = level || "Clear";
          button.onclick = async () => {
            try {
              setStatus("Updating #" + issue.number + " priority...");
              await api("/api/issues/" + issue.number + "/priority", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ priority: level }),
              });
              await refresh();
            } catch (error) {
              setStatus(error.message, true);
            }
          };
          wrap.appendChild(button);
        }
        return wrap;
      }

      function makeLabelEditor(issue) {
        const wrap = document.createElement("div");
        wrap.className = "label-editor";

        const input = document.createElement("input");
        input.placeholder = "label-a,label-b";
        wrap.appendChild(input);

        const operations = [
          { key: "add", label: "Add" },
          { key: "remove", label: "Remove" },
          { key: "set", label: "Set" },
        ];

        for (const operation of operations) {
          const button = document.createElement("button");
          button.textContent = operation.label;
          button.onclick = async () => {
            try {
              const labels = input.value.split(",").map((item) => item.trim()).filter(Boolean);
              if (labels.length === 0) {
                setStatus("Enter at least one label.", true);
                return;
              }
              setStatus("Updating labels for #" + issue.number + "...");
              await api("/api/issues/" + issue.number + "/labels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ labels, operation: operation.key }),
              });
              await refresh();
            } catch (error) {
              setStatus(error.message, true);
            }
          };
          wrap.appendChild(button);
        }

        return wrap;
      }

      function renderRows(issues) {
        for (const issue of issues) {
          const row = document.createElement("tr");
          row.innerHTML = \`
            <td>\${issue.number}</td>
            <td>
              <a href="\${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(issue.title)}</a>
              <div class="muted">\${issue.state}</div>
            </td>
            <td>
              <div class="labels"></div>
              <div class="muted">Priority: \${escapeHtml(issue.priority || "none")}</div>
            </td>
            <td></td>
          \`;

          const labelsContainer = row.children[2].querySelector(".labels");
          for (const label of issue.labels) {
            const chip = document.createElement("span");
            chip.className = "label";
            chip.textContent = label;
            labelsContainer.appendChild(chip);
          }

          const actionsCell = row.children[3];
          actionsCell.appendChild(makePriorityButtons(issue));
          actionsCell.appendChild(makeLabelEditor(issue));
          rowsEl.appendChild(row);
        }
      }

      refreshEl.onclick = refresh;
      refresh();
    </script>
  </body>
</html>`;
}

async function startServer(instanceId) {
    const server = createServer(async (req, res) => {
        const defaults = defaultFiltersByInstance.get(instanceId) ?? normalizeIssueFilters();
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

        if (req.method === "GET" && requestUrl.pathname === "/") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(renderHtml(defaults));
            return;
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/issues") {
            try {
                const labels = requestUrl.searchParams.getAll("labels");
                const filters = normalizeIssueFilters({
                    state: requestUrl.searchParams.get("state") ?? defaults.state,
                    search: requestUrl.searchParams.get("search") ?? defaults.search,
                    labels: labels.length > 0 ? labels : defaults.labels,
                    priority: requestUrl.searchParams.get("priority") ?? defaults.priority,
                    limit: Number.parseInt(requestUrl.searchParams.get("limit") ?? String(defaults.limit), 10),
                });
                const result = await getIssues(filters);
                json(res, 200, result);
            } catch (error) {
                json(res, 400, { error: error?.message ?? "Failed to load issues." });
            }
            return;
        }

        const priorityMatch = requestUrl.pathname.match(/^\/api\/issues\/(\d+)\/priority$/);
        if (req.method === "POST" && priorityMatch) {
            try {
                const issueNumber = Number.parseInt(priorityMatch[1], 10);
                const body = await readRequestBody(req);
                const updated = await updatePriority(issueNumber, body.priority);
                json(res, 200, updated);
            } catch (error) {
                json(res, 400, { error: error?.message ?? "Failed to update priority." });
            }
            return;
        }

        const labelsMatch = requestUrl.pathname.match(/^\/api\/issues\/(\d+)\/labels$/);
        if (req.method === "POST" && labelsMatch) {
            try {
                const issueNumber = Number.parseInt(labelsMatch[1], 10);
                const body = await readRequestBody(req);
                const updated = await applyLabels(issueNumber, body.labels, body.operation);
                json(res, 200, updated);
            } catch (error) {
                json(res, 400, { error: error?.message ?? "Failed to update labels." });
            }
            return;
        }

        json(res, 404, { error: "Not found." });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "issue-triage-canvas",
            displayName: "Issue triage",
            description: "Triage GitHub issues with filters, label editing, and quick priority actions.",
            inputSchema: openSchema,
            actions: [
                {
                    name: "get_issues",
                    description: "Fetch issues using state, search, labels, and priority filters.",
                    inputSchema: getIssuesSchema,
                    handler: async (ctx) => getIssues(ctx.input),
                },
                {
                    name: "update_priority",
                    description: "Set or clear issue priority using priority labels.",
                    inputSchema: updatePrioritySchema,
                    handler: async (ctx) => updatePriority(ctx.input.issueNumber, ctx.input.priority),
                },
                {
                    name: "apply_label",
                    description: "Add, remove, or replace labels on an issue.",
                    inputSchema: applyLabelSchema,
                    handler: async (ctx) => applyLabels(ctx.input.issueNumber, ctx.input.labels, ctx.input.operation),
                },
            ],
            open: async (ctx) => {
                defaultFiltersByInstance.set(ctx.instanceId, normalizeIssueFilters(ctx.input));

                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }

                return {
                    title: "Issue triage",
                    status: "Ready",
                    url: entry.url,
                };
            },
            onClose: async (ctx) => {
                defaultFiltersByInstance.delete(ctx.instanceId);
                const entry = servers.get(ctx.instanceId);
                if (!entry) {
                    return;
                }

                servers.delete(ctx.instanceId);
                await new Promise((resolve) => entry.server.close(() => resolve()));
            },
        }),
    ],
});

sessionRef = session;
