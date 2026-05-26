/* main.js — progressive enhancement only */
(function () {
  "use strict";

  const WORKER_URL = "https://worker.jackhaunts.us/submit";

  // ── Form submission ──────────────────────────────────────
  const form = document.getElementById("haunt-form");
  if (!form) return;

  const submitBtn = form.querySelector(".form-submit");
  const statusRegion = document.getElementById("form-status");
  const successMsg = document.getElementById("form-success");
  const errorMsg = document.getElementById("form-error-global");

  function setStatus(type, message) {
    statusRegion.className = "form-status is-visible form-status--" + type;
    if (type === "success") {
      successMsg.textContent = message;
      successMsg.parentElement.className =
        "form-status is-visible form-status--success";
    } else {
      errorMsg.textContent = message;
      errorMsg.parentElement.className =
        "form-status is-visible form-status--error";
    }
    statusRegion.setAttribute("aria-live", "polite");
    statusRegion.focus();
  }

  function clearFieldErrors() {
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
    });
    form.querySelectorAll(".form-error").forEach(function (el) {
      el.classList.remove("is-visible");
      el.textContent = "";
    });
  }

  function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + "-error");
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", fieldId + "-error");
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("is-visible");
    }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearFieldErrors();

    // Hide previous status
    if (statusRegion) {
      statusRegion.className = "form-status";
    }

    const data = new FormData(form);
    const request = data.get("request");

    if (!request || request.trim().length === 0) {
      showFieldError("request", "Your haunt request is required.");
      return;
    }

    if (!data.get("notUndead")) {
      showFieldError(
        "notUndead",
        "You must confirm you are not undead to submit a haunt request."
      );
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending your request to Jack…";

    try {
      const response = await fetch(WORKER_URL, {
        method: "POST",
        body: data,
      });

      const json = await response.json();

      if (json.success) {
        form.reset();
        if (successMsg) {
          successMsg.textContent =
            "Your haunt request has been received. Jack's team will review it.";
          successMsg.closest(".form-status").className =
            "form-status is-visible form-status--success";
          successMsg.closest(".form-status").focus();
        }
        form.style.display = "none";
      } else {
        if (errorMsg) {
          errorMsg.textContent =
            json.error || "Something went wrong. Please try again.";
          errorMsg.closest(".form-status").className =
            "form-status is-visible form-status--error";
          errorMsg.closest(".form-status").focus();
        }
      }
    } catch (err) {
      if (errorMsg) {
        errorMsg.textContent =
          "Could not reach the server. Please try again later.";
        errorMsg.closest(".form-status").className =
          "form-status is-visible form-status--error";
        errorMsg.closest(".form-status").focus();
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Haunt Request";
    }
  });
})();
