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
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        overflow-x: hidden;
        position: relative;
        font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
        color: var(--text-color-default, #1f2328);
        background:
          radial-gradient(1200px 500px at -10% -10%, rgba(86, 110, 255, 0.24), transparent 60%),
          radial-gradient(900px 500px at 110% 10%, rgba(233, 75, 221, 0.2), transparent 60%),
          radial-gradient(800px 400px at 50% 120%, rgba(48, 196, 255, 0.16), transparent 60%),
          var(--background-color-default, #0b1020);
      }
      .sparkles {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
      }
      .sparkles span {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.8), 0 0 22px rgba(147, 197, 253, 0.45);
        animation: twinkle 3.5s ease-in-out infinite;
      }
      @keyframes twinkle {
        0%, 100% { opacity: 0.25; transform: scale(0.7); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      .shell {
        position: relative;
        z-index: 1;
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px 16px 24px 16px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        margin-bottom: 14px;
      }
      .hero h1 {
        margin: 0;
        letter-spacing: -0.3px;
        font-size: 29px;
        font-weight: var(--font-weight-semibold, 600);
      }
      .hero p {
        margin: 4px 0 0 0;
        font-size: 14px;
        color: var(--text-color-muted, #6e7781);
      }
      .hero-pill {
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(146, 161, 185, 0.35);
        background: linear-gradient(130deg, rgba(88, 166, 255, 0.2), rgba(238, 130, 238, 0.17));
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
      .panel {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.09));
        border: 1px solid rgba(145, 158, 180, 0.35);
        border-radius: 16px;
        backdrop-filter: blur(10px) saturate(150%);
        box-shadow:
          0 18px 35px rgba(0, 0, 0, 0.18),
          inset 0 1px 0 rgba(255, 255, 255, 0.28);
      }
      .toolbar {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 10px;
        align-items: end;
        padding: 14px;
      }
      .field-state { grid-column: span 2; }
      .field-search { grid-column: span 3; }
      .field-labels { grid-column: span 3; }
      .field-priority { grid-column: span 2; }
      .field-limit { grid-column: span 1; }
      .field-refresh { grid-column: span 1; }
      label {
        display: block;
        font-size: 12px;
        color: var(--text-color-muted, #57606a);
        margin-bottom: 5px;
        font-weight: 600;
      }
      input, select, button {
        width: 100%;
        min-height: 36px;
        border-radius: 10px;
        border: 1px solid rgba(129, 146, 173, 0.45);
        padding: 7px 10px;
        background: rgba(245, 248, 255, 0.55);
        color: inherit;
        outline: none;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
      }
      input:focus, select:focus, button:focus {
        border-color: var(--color-focus-outline, #2f81f7);
        box-shadow: 0 0 0 3px rgba(47, 129, 247, 0.24);
      }
      button {
        cursor: pointer;
        font-weight: 600;
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.78), rgba(239, 246, 255, 0.66));
      }
      button:hover { transform: translateY(-1px); }
      button:active { transform: translateY(0); }
      button.primary {
        color: #ffffff;
        border-color: rgba(92, 107, 255, 0.68);
        background: linear-gradient(140deg, #5f6bff, #7f56d9 45%, #c34ad8 100%);
        box-shadow: 0 10px 20px rgba(127, 86, 217, 0.35);
      }
      button.primary:hover {
        box-shadow: 0 12px 24px rgba(127, 86, 217, 0.46);
      }
      .status {
        margin: 12px 0;
        padding: 9px 12px;
        border-radius: 11px;
        font-size: 13px;
        border: 1px solid rgba(125, 143, 171, 0.4);
      }
      .status-ok {
        color: var(--text-color-muted, #57606a);
        background: rgba(233, 240, 252, 0.45);
      }
      .status-error {
        color: #9a2f2f;
        background: rgba(255, 227, 227, 0.82);
        border-color: rgba(203, 73, 73, 0.44);
      }
      .table-wrap {
        overflow: auto;
        padding: 8px 10px 10px 10px;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0 8px;
        font-size: 13px;
      }
      th {
        text-align: left;
        font-weight: 600;
        color: var(--text-color-muted, #57606a);
        padding: 6px 8px;
      }
      tbody tr {
        background: rgba(255, 255, 255, 0.66);
        border: 1px solid rgba(143, 157, 183, 0.3);
        box-shadow: 0 10px 16px rgba(20, 33, 61, 0.12);
      }
      tbody tr:hover {
        background: rgba(255, 255, 255, 0.78);
        transform: translateY(-1px);
      }
      td {
        padding: 10px 8px;
        vertical-align: top;
      }
      tbody tr td:first-child {
        border-top-left-radius: 10px;
        border-bottom-left-radius: 10px;
        width: 62px;
        font-weight: 700;
      }
      tbody tr td:last-child {
        border-top-right-radius: 10px;
        border-bottom-right-radius: 10px;
      }
      .empty-row td {
        text-align: center;
        color: var(--text-color-muted, #57606a);
      }
      .labels {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: 7px;
      }
      .label {
        border: 1px solid rgba(126, 141, 168, 0.42);
        border-radius: 999px;
        padding: 2px 9px;
        font-size: 12px;
        background: rgba(248, 250, 255, 0.82);
      }
      .priority-badge {
        display: inline-block;
        border-radius: 999px;
        border: 1px solid rgba(124, 99, 255, 0.42);
        background: linear-gradient(120deg, rgba(92, 107, 255, 0.21), rgba(206, 92, 255, 0.24));
        padding: 2px 9px;
        font-size: 12px;
        font-weight: 600;
      }
      .muted { color: var(--text-color-muted, #57606a); }
      .priority-buttons {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        margin-bottom: 6px;
      }
      .priority-buttons button {
        min-height: 30px;
        padding: 4px 6px;
        font-size: 12px;
      }
      .priority-buttons button.active {
        color: #fff;
        border-color: rgba(92, 107, 255, 0.76);
        background: linear-gradient(145deg, #5f6bff, #8d47d8);
      }
      .label-editor {
        display: grid;
        grid-template-columns: 1fr repeat(3, auto);
        gap: 4px;
      }
      .label-editor button {
        width: auto;
        min-height: 30px;
        padding: 4px 8px;
        font-size: 12px;
      }
      a {
        color: var(--text-color-link, #0969da);
        text-decoration: none;
        font-weight: 600;
      }
      a:hover { text-decoration: underline; }
      @media (max-width: 1120px) {
        .field-state, .field-search, .field-labels, .field-priority, .field-limit, .field-refresh { grid-column: span 6; }
      }
      @media (max-width: 740px) {
        .field-state, .field-search, .field-labels, .field-priority, .field-limit, .field-refresh { grid-column: span 12; }
        .hero { flex-direction: column; align-items: flex-start; }
      }
      @media (prefers-reduced-motion: reduce) {
        .sparkles span, button, tbody tr { animation: none !important; transition: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="sparkles" aria-hidden="true">
      <span style="left:6%; top:8%; animation-delay:0.1s;"></span>
      <span style="left:19%; top:22%; animation-delay:1.2s;"></span>
      <span style="left:31%; top:6%; animation-delay:2.1s;"></span>
      <span style="left:44%; top:18%; animation-delay:0.6s;"></span>
      <span style="left:58%; top:11%; animation-delay:1.9s;"></span>
      <span style="left:72%; top:24%; animation-delay:0.4s;"></span>
      <span style="left:86%; top:9%; animation-delay:2.4s;"></span>
      <span style="left:10%; top:62%; animation-delay:0.8s;"></span>
      <span style="left:24%; top:76%; animation-delay:2.9s;"></span>
      <span style="left:39%; top:67%; animation-delay:1.4s;"></span>
      <span style="left:53%; top:81%; animation-delay:0.2s;"></span>
      <span style="left:67%; top:70%; animation-delay:2.6s;"></span>
      <span style="left:81%; top:84%; animation-delay:1.1s;"></span>
      <span style="left:93%; top:63%; animation-delay:0.7s;"></span>
    </div>

    <div class="shell">
      <div class="hero">
        <div>
          <h1>Issue triage</h1>
          <p>Filter, prioritize, and label issues with fast modern workflows.</p>
        </div>
        <div id="repoSummary" class="hero-pill">GitHub issues</div>
      </div>

      <div class="panel">
        <div class="toolbar">
          <div class="field-state">
            <label for="state">State</label>
            <select id="state">
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="all">all</option>
            </select>
          </div>
          <div class="field-search">
            <label for="search">Search</label>
            <input id="search" placeholder="auth bug is:open" />
          </div>
          <div class="field-labels">
            <label for="labels">Labels (comma separated)</label>
            <input id="labels" placeholder="bug,needs-triage" />
          </div>
          <div class="field-priority">
            <label for="priority">Priority</label>
            <select id="priority">
              <option value="">Any</option>
            </select>
          </div>
          <div class="field-limit">
            <label for="limit">Limit</label>
            <input id="limit" type="number" min="1" max="200" />
          </div>
          <div class="field-refresh">
            <label>&nbsp;</label>
            <button id="refresh" class="primary">Refresh</button>
          </div>
        </div>
      </div>

      <div id="status" class="status status-ok">Loading issues...</div>

      <div class="panel table-wrap">
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
      </div>
    </div>

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
      const repoSummaryEl = document.getElementById("repoSummary");

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
        statusEl.className = isError ? "status status-error" : "status status-ok";
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
          repoSummaryEl.textContent = result.repository;
          setStatus(result.total + " issues in " + result.repository);
          renderRows(result.issues);
        } catch (error) {
          repoSummaryEl.textContent = "GitHub issues";
          setStatus(error.message, true);
        }
      }

      function makePriorityButtons(issue) {
        const wrap = document.createElement("div");
        wrap.className = "priority-buttons";
        for (const level of [...priorities, ""]) {
          const button = document.createElement("button");
          button.textContent = level || "Clear";
          if (level && level === issue.priority) {
            button.className = "active";
          }
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
        if (issues.length === 0) {
          const row = document.createElement("tr");
          row.className = "empty-row";
          row.innerHTML = '<td colspan="4">No issues match the current filters.</td>';
          rowsEl.appendChild(row);
          return;
        }

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
              <div class="priority-badge">Priority: \${escapeHtml(issue.priority || "none")}</div>
            </td>
            <td></td>
          \`;

          const labelsContainer = row.children[2].querySelector(".labels");
          if (issue.labels.length === 0) {
            const chip = document.createElement("span");
            chip.className = "label muted";
            chip.textContent = "no labels";
            labelsContainer.appendChild(chip);
          } else {
            for (const label of issue.labels) {
              const chip = document.createElement("span");
              chip.className = "label";
              chip.textContent = label;
              labelsContainer.appendChild(chip);
            }
          }

          const actionsCell = row.children[3];
          actionsCell.appendChild(makePriorityButtons(issue));
          actionsCell.appendChild(makeLabelEditor(issue));
          rowsEl.appendChild(row);
        }
      }

      refreshEl.onclick = refresh;
      searchEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          refresh();
        }
      });
      labelsEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          refresh();
        }
      });
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
