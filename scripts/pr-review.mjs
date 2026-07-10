// PR Review Bot script
import fs from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const provider = process.env.LLM_PROVIDER;
const model = process.env.LLM_MODEL;
const maxTokens = Number(process.env.LLM_MAX_TOKENS) || 4000; // tune without code edits

if (!token) throw new Error("GITHUB_TOKEN is required");
if (!provider) throw new Error("LLM_PROVIDER is required");
if (!model) throw new Error("LLM_MODEL is required");

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

// Get the PR number from the event payload (reliable for pull_request / pull_request_target events).
// GITHUB_REF_NAME is not the PR number, so don't derive it from there.
const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;
if (!pr) throw new Error("No pull_request in event payload");

const pull_number = pr.number;

// Minimal GitHub REST client over fetch — no SDK dependency.
// GITHUB_API_URL is set by Actions (defaults to https://api.github.com; differs on GHES).
const GITHUB_API = process.env.GITHUB_API_URL || "https://api.github.com";

async function github(method, path, body) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "storywriter-pr-review-bot", // GitHub rejects requests without a User-Agent
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

// The "files" endpoint is paginated (100/page); follow pages so large PRs aren't truncated.
async function listPullFiles() {
  const files = [];
  for (let page = 1; ; page++) {
    const batch = await github(
      "GET",
      `/repos/${owner}/${repo}/pulls/${pull_number}/files?per_page=100&page=${page}`
    );
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

// Get PR metadata + changed files
const [prData, files] = await Promise.all([
  github("GET", `/repos/${owner}/${repo}/pulls/${pull_number}`),
  listPullFiles(),
]);

const skill = await fs.readFile(".github/skills/pr-review.md", "utf8");

// Lockfiles are machine-generated and can dwarf the actual code change (a bump of one
// package can rewrite hundreds of lines of peer/libc metadata). Sending the full patch
// wastes context and dilutes model attention on the files that matter, so summarize instead.
const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
]);

const diffText = files
  .map((f) => {
    const isLockfile = LOCKFILE_NAMES.has(f.filename.split("/").pop());
    const patch = isLockfile
      ? "(lockfile: patch omitted from review — dependency version bumps only)"
      : f.patch ?? "(no patch available: binary file or too large)";
    return `FILE: ${f.filename}
STATUS: ${f.status}
CHANGES: +${f.additions} -${f.deletions}

PATCH:
${patch}`;
  })
  .join("\n\n---\n\n");

const prompt = `
${skill}

PR metadata:
- Title: ${prData.title}
- Author: ${prData.user.login}
- Base branch: ${prData.base.ref}
- Head branch: ${prData.head.ref}
- Head SHA: ${prData.head.sha}

PR body:
${prData.body || "(empty)"}

Changed files and patches:
${diffText}

Remember:
- Return JSON only.
- Use line numbers from the RIGHT side of the diff where possible.
- If a line number is uncertain, omit that inline comment and put the note in non_blocking_notes.
`;

const resultText = await callLLM({ provider, model, prompt });
const review = safeParseJson(resultText);

const decision = normalizeDecision(review.decision);
// The bot never auto-approves. PR text (title/body/diff) is attacker-influenceable
// (prompt injection), so a human must always gate the merge — map "approve" down to COMMENT.
const reviewEvent = decision === "request_changes" ? "REQUEST_CHANGES" : "COMMENT";

// Build the review body (summary + notes).
let body = `### 🤖 PR Review Bot\n\n${toText(review.summary_comment) || "AI review completed."}`;

if (review.blocking_issues?.length) {
  body += "\n## Blocking issues\n";
  for (const item of review.blocking_issues) body += `- ${toText(item)}\n`;
}

if (review.non_blocking_notes?.length) {
  body += "\n## Non-blocking notes\n";
  for (const item of review.non_blocking_notes) body += `- ${toText(item)}\n`;
}

// Record which provider/model produced this review — makes it possible to compare review
// quality across model swaps later without cross-referencing repo variable history.
body += `\n\n<sub>Reviewed by \`${provider}/${model}\`</sub>`;

// Attach inline comments to the SINGLE review (posting them individually would create a
// second, empty-bodied review). The reviews endpoint takes a `comments` array.
const inlineComments = Array.isArray(review.inline_comments) ? review.inline_comments : [];
const comments = inlineComments
  .map((c) => ({ path: c?.path, line: Number(c?.line), side: c?.side || "RIGHT", body: toText(c?.body) }))
  .filter((c) => c.path && Number.isFinite(c.line) && c.body);

try {
  await github("POST", `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
    commit_id: prData.head.sha,
    body,
    event: reviewEvent,
    comments,
  });
} catch (err) {
  // GitHub rejects the entire review (422) if any inline comment targets a line that
  // isn't part of the diff. Fall back to one review with no inline comments, folding the
  // notes into the body so no feedback is lost (still a single review, not two).
  if (!comments.length) throw err;
  let fallbackBody = body + "\n\n## Inline comments (could not attach to specific lines)\n";
  for (const c of comments) fallbackBody += `- ${c.path}:${c.line} — ${c.body}\n`;
  fallbackBody += `\n_(${err.message})_\n`;
  await github("POST", `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
    body: fallbackBody,
    event: reviewEvent,
  });
}

console.log(`Submitted review: ${reviewEvent}`);

// Weaker models sometimes don't follow the requested JSON schema and wrap a note/comment
// in an object (e.g. { note: "..." }) instead of returning a bare string. Left unguarded,
// naive `${item}` interpolation prints the literal text "[object Object]" into the posted
// GitHub review. Unwrap common field names, or fall back to JSON so nothing is silently lost.
function toText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const candidate = value.text ?? value.note ?? value.comment ?? value.body ?? value.message;
    if (typeof candidate === "string") return candidate;
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeDecision(d) {
  const v = String(d || "").toLowerCase();
  if (v.includes("approve")) return "approve";
  if (v.includes("request")) return "request_changes";
  return "comment";
}

function safeParseJson(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Model returned an empty response (nothing to parse).");

  // Remove markdown fences if the model accidentally adds them
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Model did not return valid JSON. Raw output (truncated):\n${trimmed.slice(0, 2000)}`);
  }
}

async function callLLM({ provider, model, prompt }) {
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = await res.json();

    const text = data.content?.[0]?.text?.trim();
    if (!text) {
      throw new Error(
        `Anthropic returned no text (model="${model}", stop_reason=${data.stop_reason ?? "?"}).\n` +
        `Raw response (truncated): ${JSON.stringify(data).slice(0, 2000)}`
      );
    }
    return text;
  }

  const apiKey =
    provider === "openai" ? process.env.OPENAI_API_KEY :
    provider === "together" ? process.env.TOGETHER_API_KEY :
    provider === "openrouter" ? process.env.OPENROUTER_API_KEY :
    null;

  if (!apiKey) throw new Error(`API key missing for provider ${provider}`);

  const baseUrl =
    provider === "openai" ? "https://api.openai.com/v1" :
    provider === "together" ? "https://api.together.xyz/v1" :
    provider === "openrouter" ? "https://openrouter.ai/api/v1" :
    null;

  if (!baseUrl) throw new Error(`Unsupported provider: ${provider}`);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(provider === "openrouter" ? {
        "HTTP-Referer": "https://github.com",
        "X-Title": "GitHub PR Review Bot",
      } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // Reasoning models (e.g. GLM-5.x) spend tokens on hidden reasoning; without a generous
      // budget the visible content comes back empty/truncated. Prefer a non-reasoning
      // instruct model for this JSON task; raise LLM_MAX_TOKENS if you keep a reasoning one.
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: "Return valid JSON only. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`${provider} API error: ${res.status} ${await res.text()}`);
  const data = await res.json();

  // Some OpenAI-compatible providers return HTTP 200 with an error object in the body
  // (e.g. an unknown model id), so a non-error status is not enough on its own.
  if (data.error) {
    throw new Error(`${provider} API returned an error for model="${model}": ${JSON.stringify(data.error)}`);
  }

  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (!content) {
    // Surface the raw response so a blank/failed completion is diagnosable, not a mystery.
    // Common causes: invalid/unavailable model id, or a reasoning model that put its output
    // in message.reasoning_content instead of message.content.
    throw new Error(
      `${provider} returned no usable content (model="${model}", ` +
      `finish_reason=${choice?.finish_reason ?? "?"}).\n` +
      `Raw response (truncated): ${JSON.stringify(data).slice(0, 2000)}`
    );
  }
  return content;
}