// PR Review Bot script
import fs from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const provider = process.env.LLM_PROVIDER;
const model = process.env.LLM_MODEL;

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

const diffText = files
  .map((f) => {
    const patch = f.patch ?? "(no patch available: binary file or too large)";
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

// Post inline comments first
const inlineComments = Array.isArray(review.inline_comments) ? review.inline_comments : [];
const failedInline = [];

for (const c of inlineComments) {
  try {
    if (!c?.path || !c?.line || !c?.body) throw new Error("Invalid inline comment payload");

    await github("POST", `/repos/${owner}/${repo}/pulls/${pull_number}/comments`, {
      commit_id: prData.head.sha,
      path: c.path,
      line: c.line,
      side: c.side || "RIGHT",
      body: c.body,
    });
  } catch (err) {
    failedInline.push({
      path: c?.path,
      line: c?.line,
      body: c?.body,
      error: err.message,
    });
  }
}

let body = review.summary_comment || "AI review completed.";
body += "\n\n## Decision tree\n";
for (const item of review.decision_tree || []) body += `- ${item}\n`;

if (review.blocking_issues?.length) {
  body += "\n## Blocking issues\n";
  for (const item of review.blocking_issues) body += `- ${item}\n`;
}

if (review.non_blocking_notes?.length) {
  body += "\n## Non-blocking notes\n";
  for (const item of review.non_blocking_notes) body += `- ${item}\n`;
}

if (failedInline.length) {
  body += "\n## Inline comments that could not be placed\n";
  for (const item of failedInline) {
    body += `- ${item.path}:${item.line} — ${item.body} (${item.error})\n`;
  }
}

await github("POST", `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
  body,
  event: reviewEvent,
});

console.log(`Submitted review: ${reviewEvent}`);

function normalizeDecision(d) {
  const v = String(d || "").toLowerCase();
  if (v.includes("approve")) return "approve";
  if (v.includes("request")) return "request_changes";
  return "comment";
}

function safeParseJson(text) {
  const trimmed = text.trim();

  // Remove markdown fences if the model accidentally adds them
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Model did not return valid JSON:\n${text}`);
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
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
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
      messages: [
        { role: "system", content: "Return valid JSON only. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`${provider} API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}