/**
 * Cloudflare Worker: Jack Haunts Us — Form → GitHub PR Pipeline
 *
 * Receives haunt request form POSTs, validates them, and opens a
 * GitHub Pull Request so maintainers can review before publishing.
 * Also sends email notifications to approvers and handles reply-to-approve.
 *
 * Required environment variables (set as Worker secrets):
 *   GITHUB_TOKEN         — GitHub PAT with repo access to froboy/jackhaunts.us
 *   TURNSTILE_SECRET_KEY — Cloudflare Turnstile secret key
 *
 * Optional environment variables for email notifications:
 *   APPROVER_EMAILS      — comma-separated list of approver email addresses
 *   APPROVAL_EMAIL       — email address for approval replies (e.g., approve@jackhaunts.us)
 *   FROM_EMAIL           — sender address for notifications (e.g., haunt@jackhaunts.us)
 *
 * Worker bindings (configure in wrangler.toml):
 *   SEND_EMAIL           — Cloudflare send_email binding for outbound notifications
 *   HAUNT_KV             — KV namespace for storing pending approval tokens
 */

import { EmailMessage } from "cloudflare:email";

const GITHUB_REPO = "froboy/jackhaunts.us";
const GITHUB_API = "https://api.github.com";
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const APPROVAL_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

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
    let prInfo;
    try {
      prInfo = await createBranchAndPR(
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

    // 9. Send email notifications to approvers (non-blocking — don't fail the
    //    submission if email delivery fails)
    try {
      await sendNotificationEmails(env, {
        displayName,
        sanitizedRequest,
        prUrl: prInfo.html_url,
        prNumber: prInfo.number,
      });
    } catch (err) {
      console.error("Email notification error:", err.message);
    }

    return jsonResponse({ success: true });
  },

  // Inbound email handler — receives replies sent to approve+{token}@<domain>.
  // Cloudflare Email Routing must be configured to deliver mail for the approval
  // address to this Worker.
  async email(message, env) {
    const toAddress = message.to;

    // Expect the approval address format: approve+{token}@<domain>
    const match = toAddress.match(/^approve\+([^@]+)@/);
    if (!match) {
      // Not addressed to the approval handler — nothing to do
      return;
    }

    const token = match[1];
    const senderEmail = message.from.toLowerCase().trim();

    // Verify that the sender is an authorized approver
    const approverEmails = (env.APPROVER_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!approverEmails.includes(senderEmail)) {
      console.log(`Unauthorized approval attempt from: ${senderEmail}`);
      return;
    }

    // Look up the pending approval in KV
    if (!env.HAUNT_KV) {
      console.error("HAUNT_KV binding is not configured");
      return;
    }

    const pendingData = await env.HAUNT_KV.get(`pending:${token}`, "json");
    if (!pendingData) {
      console.log(`No pending approval found for token: ${token}`);
      return;
    }

    // Merge the GitHub PR to publish the haunt request
    try {
      await mergePR(env.GITHUB_TOKEN, pendingData.prNumber);
      await env.HAUNT_KV.delete(`pending:${token}`);
      console.log(
        `Approved haunt request: merged PR #${pendingData.prNumber} (approved by ${senderEmail})`
      );
    } catch (err) {
      console.error(
        `Failed to merge PR #${pendingData.prNumber}: ${err.message}`
      );
    }
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
  // Encode characters that have special meaning in HTML/YAML rather than
  // attempting to strip tags (stripping is incomplete and bypassable).
  const encoded = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
  return encoded.slice(0, maxLength);
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
status: approved
---
`;
}

function escapeYaml(str) {
  // Escape backslashes first, then double quotes, to avoid double-escaping.
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

  const prData = await ghFetch(`${GITHUB_API}/repos/${GITHUB_REPO}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `Haunt Request: ${displayName}`,
      head: branchName,
      base: "main",
      body: `## Haunt Request from ${displayName}\n\n> ${teaser}\n\n---\n\n- [ ] Request is genuine and in good spirit\n- [ ] No spam, abusive content, or personally identifying info that shouldn't be public\n- [ ] Requester confirmed they are not undead\n\n**To publish:** Merge this PR.`,
    }),
  });

  return { number: prData.number, html_url: prData.html_url };
}

async function mergePR(token, prNumber) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "jackhaunts-worker/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  await ghFetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        merge_method: "squash",
        commit_title: `Approve haunt request (#${prNumber})`,
      }),
    }
  );
}

async function sendNotificationEmails(
  env,
  { displayName, sanitizedRequest, prUrl, prNumber }
) {
  if (!env.APPROVER_EMAILS || !env.APPROVAL_EMAIL || !env.FROM_EMAIL) {
    return; // Email notifications not configured — skip silently
  }

  const approverEmails = env.APPROVER_EMAILS.split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (approverEmails.length === 0) return;

  // Generate a unique token, store it in KV so the inbound email handler can
  // look up the PR number when an approver replies.
  const token = crypto.randomUUID().replace(/-/g, "");
  if (env.HAUNT_KV) {
    await env.HAUNT_KV.put(
      `pending:${token}`,
      JSON.stringify({ prNumber, prUrl, displayName }),
      { expirationTtl: APPROVAL_TOKEN_TTL }
    );
  }

  const [, approvalDomain] = env.APPROVAL_EMAIL.split("@");
  const replyTo = `approve+${token}@${approvalDomain}`;

  const subject = `New Haunt Request from ${displayName}`;
  const body = [
    `A new haunt request has been submitted.`,
    ``,
    `Requester: ${displayName}`,
    ``,
    `Request:`,
    sanitizedRequest,
    ``,
    `GitHub PR: ${prUrl}`,
    ``,
    `To approve: Reply to this email from your authorized approver address.`,
    `To reject: Close the GitHub PR without merging.`,
  ].join("\n");

  if (!env.SEND_EMAIL) return;

  for (const toEmail of approverEmails) {
    try {
      const rawEmail = buildMimeMessage({
        from: env.FROM_EMAIL,
        to: toEmail,
        replyTo,
        subject,
        body,
      });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(rawEmail));
          controller.close();
        },
      });
      const emailMessage = new EmailMessage(env.FROM_EMAIL, toEmail, stream);
      await env.SEND_EMAIL.send(emailMessage);
    } catch (err) {
      console.error(`Failed to send notification to ${toEmail}: ${err.message}`);
    }
  }
}

function buildMimeMessage({ from, to, replyTo, subject, body }) {
  return [
    `MIME-Version: 1.0`,
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    body,
  ].join("\r\n");
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
