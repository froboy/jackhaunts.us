/**
 * Cloudflare Worker: Jack Haunts Us — Form → GitHub PR Pipeline
 *
 * Receives haunt request form POSTs, validates them, and opens a
 * GitHub Pull Request so maintainers can review before publishing.
 *
 * Required environment variables (set as Worker secrets):
 *   GITHUB_TOKEN        — GitHub PAT with repo access to froboy/jackhaunts.us
 *   TURNSTILE_SECRET_KEY — Cloudflare Turnstile secret key
 */

const GITHUB_REPO = "froboy/jackhaunts.us";
const GITHUB_API = "https://api.github.com";
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://jackhaunts.us",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    let formData;
    try {
      formData = await request.formData();
    } catch {
      return jsonResponse({ success: false, error: "Invalid form data" }, 400);
    }

    const name = formData.get("name") || "";
    const requestText = formData.get("request") || "";
    const notUndead = formData.get("notUndead");
    const gotcha = formData.get("_gotcha") || "";
    const turnstileToken = formData.get("cf-turnstile-response") || "";

    // 1. Honeypot check
    if (gotcha.trim() !== "") {
      // Silently accept to not tip off bots
      return jsonResponse({ success: true });
    }

    // 2. Undead check
    if (notUndead !== "on") {
      return jsonResponse({
        success: false,
        error: "You must confirm you are not undead.",
      });
    }

    // 3. Validate required fields
    if (!requestText.trim()) {
      return jsonResponse({
        success: false,
        error: "Haunt request text is required.",
      });
    }

    // 4. Verify Turnstile token
    const turnstileValid = await verifyTurnstile(
      turnstileToken,
      env.TURNSTILE_SECRET_KEY,
      request.headers.get("CF-Connecting-IP") || ""
    );
    if (!turnstileValid) {
      return jsonResponse({
        success: false,
        error: "Human verification failed. Please try again.",
      });
    }

    // 5. Sanitize inputs
    const sanitizedName = sanitize(name, 100);
    const sanitizedRequest = sanitize(requestText, 1000);
    const displayName = sanitizedName || "Anonymous";

    // 6. Generate slug
    const timestamp = Math.floor(Date.now() / 1000);
    const slugBase = sanitizedName
      ? toSlug(sanitizedName) + "-" + timestamp
      : "anonymous-" + timestamp;

    // 7. Build the markdown file content
    const today = new Date().toISOString().split("T")[0];
    const fileContent = buildMarkdown({
      name: displayName,
      slug: slugBase,
      request: sanitizedRequest,
      submitted: today,
    });

    // 8. Create branch and open PR
    try {
      await createBranchAndPR(
        env.GITHUB_TOKEN,
        slugBase,
        displayName,
        fileContent,
        sanitizedRequest
      );
    } catch (err) {
      console.error("GitHub error:", err.message);
      return jsonResponse({
        success: false,
        error: "Failed to submit your request. Please try again.",
      });
    }

    return jsonResponse({ success: true });
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function sanitize(str, maxLength) {
  if (!str) return "";
  // Strip HTML tags
  const stripped = str.replace(/<[^>]*>/g, "").trim();
  return stripped.slice(0, maxLength);
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function buildMarkdown({ name, slug, request, submitted }) {
  // Escape the request for YAML block scalar
  const escapedRequest = request.replace(/`/g, "'");
  return `---
title: "${escapeYaml(name)}'s Haunt Request"
requester: "${escapeYaml(name)}"
slug: "${slug}"
request: >
  ${escapedRequest.replace(/\n/g, "\n  ")}
submitted: ${submitted}
status: pending
---
`;
}

function escapeYaml(str) {
  return str.replace(/"/g, '\\"');
}

async function createBranchAndPR(
  token,
  slug,
  displayName,
  fileContent,
  requestPreview
) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "jackhaunts-worker/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Get the SHA of HEAD on main
  const refRes = await ghFetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/git/ref/heads/main`,
    { headers }
  );
  const mainSha = refRes.object.sha;

  const branchName = `haunt/${slug}`;

  // Create new branch
  await ghFetch(`${GITHUB_API}/repos/${GITHUB_REPO}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: mainSha,
    }),
  });

  // Encode file content as base64
  const encoded = btoa(unescape(encodeURIComponent(fileContent)));

  // Create the file on the new branch
  await ghFetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/contents/src/haunts/${slug}.md`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Add haunt request: ${displayName}`,
        content: encoded,
        branch: branchName,
      }),
    }
  );

  // Open the PR
  const teaser =
    requestPreview.length > 200
      ? requestPreview.slice(0, 200) + "…"
      : requestPreview;

  await ghFetch(`${GITHUB_API}/repos/${GITHUB_REPO}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `Haunt Request: ${displayName}`,
      head: branchName,
      base: "main",
      body: `## Haunt Request from ${displayName}\n\n> ${teaser}\n\n---\n\n- [ ] Request is genuine and in good spirit\n- [ ] No spam, abusive content, or personally identifying info that shouldn't be public\n- [ ] Requester confirmed they are not undead\n- [ ] \`status\` is set to \`approved\` before merging\n\n**To publish:** Change \`status: pending\` to \`status: approved\` in the frontmatter, then merge.`,
    }),
  });
}

async function ghFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }
  return res.json();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
