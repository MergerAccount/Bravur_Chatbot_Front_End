document.addEventListener("DOMContentLoaded", function() {
  console.log("GDPR Consent script loaded");

  const gdprModal = document.getElementById("gdpr-modal");
  const gdprContent = document.querySelector(".gdpr-content");
  const acceptBtn = document.getElementById("accept-btn");
  const withdrawBtn = document.getElementById("withdraw-btn");
  const viewBtn = document.getElementById("view-btn");
  const manageConsentBtn = document.getElementById("manage-consent-btn");
  const inputContainer = document.querySelector(".input-container");
  const chatBox = document.getElementById("chat-box");
  const sessionIdEl = document.getElementById("session-id");
  const consentStatus = document.getElementById("consent-status");
  const sessionId = sessionIdEl ? sessionIdEl.textContent.trim() : null;
  const privacyPolicyLink = document.getElementById("privacy-policy-link");
  const termsLink = document.getElementById("terms-link");
  const manageDataLink = document.getElementById("manage-data-link");

  let isViewingConsent = false;

  console.log("Current Session ID:", sessionId);

  if (gdprModal) {
    gdprModal.style.display = "flex";
    console.log("Modal shown");
  } else {
    console.error("GDPR modal not found in the DOM");
  }

  if (inputContainer) {
    inputContainer.style.pointerEvents = "none";
    inputContainer.style.opacity = "0.5";
    console.log("Chat disabled");
  }

  // Helper Functions
  function enableChat() {
    if (inputContainer) {
      inputContainer.style.pointerEvents = "auto";
      inputContainer.style.opacity = "1";
      console.log("Chat enabled");
    }
  }

  function hideModal() {
    if (gdprModal) {
      gdprModal.style.display = "none";
      console.log("Modal hidden");
    }
  }

  function showModal() {
    if (gdprModal) {
      gdprModal.style.display = "flex";
      console.log("Modal shown");
    }
  }

  function showConsentForm() {
    if (gdprContent) {
      gdprContent.innerHTML = `
        <h2>GDPR Consent</h2>
        <p>We use cookies and collect data to improve your experience. Please provide your consent to continue using the chatbot.</p>
        <div class="gdpr-buttons">
          <button id="accept-btn">Accept</button>
          <button id="withdraw-btn">Withdraw Consent</button>
          <button id="view-btn">View Consent</button>
        </div>
      `;

      document.getElementById("accept-btn").addEventListener("click", handleAcceptConsent);
      document.getElementById("withdraw-btn").addEventListener("click", handleWithdrawConsent);
      document.getElementById("view-btn").addEventListener("click", handleViewConsent);

      isViewingConsent = false;
    }
  }

  function addSystemMessage(text) {
    if (chatBox) {
      const messageEl = document.createElement("p");
      messageEl.className = "message system-message";
      messageEl.textContent = text;
      chatBox.appendChild(messageEl);
      chatBox.scrollTop = chatBox.scrollHeight;
      console.log("System message added:", text);
    }
  }

  function updateConsentStatusDisplay(hasConsent, isWithdrawn) {
    if (manageConsentBtn) {
      const existingBadge = manageConsentBtn.querySelector('.consent-status-badge');
      if (existingBadge) {
        existingBadge.remove();
      }

      const badge = document.createElement('span');
      badge.className = 'consent-status-badge';

      if (hasConsent && !isWithdrawn) {
        badge.textContent = 'Accepted';
        badge.classList.add('consent-accepted');
      } else {
        badge.textContent = 'Not Accepted';
        badge.classList.add('consent-withdrawn');
      }

      manageConsentBtn.appendChild(badge);
    }
  }

  if (sessionId && sessionId !== 'No session created yet' && sessionId !== 'None') {
    fetch(`/api/v1/consent/check/${sessionId}`)
      .then(response => response.json())
      .then(data => {
        console.log("Consent check response:", data);

        if (data.can_proceed) {
          hideModal();
          enableChat();
          updateConsentStatusDisplay(true, false);
          console.log("Consent found, chat enabled");
        } else {
          // Keep modal shown and chat disabled
          console.log("No consent found, keeping modal shown");
          updateConsentStatusDisplay(false, true);
        }
      })
      .catch(error => {
        console.error("Error checking consent:", error);
      });
  }

  function handleAcceptConsent() {
    if (!sessionId) {
      alert("No session ID available. Please refresh the page.");
      return;
    }

    fetch("/api/v1/consent/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session_id: sessionId })
    })
      .then(response => response.json())
      .then(data => {
        console.log("Accept consent response:", data);

        if (data.success) {
          hideModal();
          enableChat();
          updateConsentStatusDisplay(true, false);
          addSystemMessage("Consent accepted! You can now use the chatbot.");
        } else {
          alert(data.error || "Failed to accept consent");
        }
      })
      .catch(error => {
        console.error("Error accepting consent:", error);
        alert("Error accepting consent. Please try again.");
      });
  }

  function handleWithdrawConsent() {
    if (!sessionId) {
      alert("No session ID available. Please refresh the page.");
      return;
    }

    if (confirm("Are you sure you want to withdraw your consent? This will prevent you from using the chatbot.")) {
      fetch("/api/v1/consent/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ session_id: sessionId })
      })
        .then(response => response.json())
        .then(data => {
          console.log("Withdraw consent response:", data);

          if (data.success) {
            if (gdprModal) gdprModal.style.display = "flex";
            if (inputContainer) {
              inputContainer.style.pointerEvents = "none";
              inputContainer.style.opacity = "0.5";
            }
            updateConsentStatusDisplay(false, true);
            addSystemMessage("Your consent has been withdrawn. You cannot use the chatbot until you accept again.");

            if (isViewingConsent) {
              showConsentForm();
            }
          } else {
            alert(data.error || "Failed to withdraw consent");
          }
        })
        .catch(error => {
          console.error("Error withdrawing consent:", error);
          alert("Error withdrawing consent. Please try again.");
        });
    }
  }

  function handleViewConsent() {
    if (!sessionId) {
      alert("No session ID available. Please refresh the page.");
      return;
    }

    fetch(`/api/v1/consent/view/${sessionId}`)
      .then(response => response.json())
      .then(data => {
        console.log("View consent response:", data);

        if (data.success) {
          displayConsentInModal(data);
        } else {
          alert(data.error || "Failed to retrieve consent information");
        }
      })
      .catch(error => {
        console.error("Error viewing consent:", error);
        alert("Error retrieving consent information. Please try again.");
      });
  }

  if (acceptBtn) {
    acceptBtn.addEventListener("click", handleAcceptConsent);
  }

  if (withdrawBtn) {
    withdrawBtn.addEventListener("click", handleWithdrawConsent);
  }

  if (viewBtn) {
    viewBtn.addEventListener("click", handleViewConsent);
  }

  if (manageConsentBtn) {
    manageConsentBtn.addEventListener("click", function() {
      showModal();
      showConsentForm();
    });
  }

  if (privacyPolicyLink) {
    privacyPolicyLink.addEventListener("click", function(e) {
      e.preventDefault();
      alert("Privacy Policy would be displayed here.");
    });
  }

  if (termsLink) {
    termsLink.addEventListener("click", function(e) {
      e.preventDefault();
      alert("Terms of Use would be displayed here.");
    });
  }

  if (manageDataLink) {
    manageDataLink.addEventListener("click", function(e) {
      e.preventDefault();
      showModal();
      showConsentForm();
    });
  }

  function displayConsentInModal(data) {
    if (!gdprContent) {
      console.error("GDPR content container not found");
      return;
    }

    isViewingConsent = true;

    let content = `
      <div class="consent-view-header">
        <button id="back-to-consent" class="back-button">&larr; Back to Consent Form</button>
        <h2>Session Information</h2>
      </div>
    `;

    content += `
      <div class="info-section">
        <h3>Session Details</h3>
        <div class="info-row">
          <span class="info-label">Session ID:</span>
          <span class="info-value">${data.session_id}</span>
        </div>
    `;

    if (data.session && data.session.timestamp) {
      const creationTime = new Date(data.session.timestamp).toLocaleString();
      content += `
        <div class="info-row">
          <span class="info-label">Created:</span>
          <span class="info-value">${creationTime}</span>
        </div>
      `;
    }

    content += `</div>`;
    content += `<div class="info-section"><h3>Consent Status</h3>`;

    if (data.consent) {
      const consentStatus = data.consent.has_consent ? "Accepted" : "Not Accepted";
      const withdrawnStatus = data.consent.is_withdrawn ? "Yes" : "No";
      const timestamp = data.consent.timestamp ? new Date(data.consent.timestamp).toLocaleString() : "N/A";

      content += `
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value ${data.consent.has_consent ? 'status-accepted' : 'status-not-accepted'}">${consentStatus}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Withdrawn:</span>
          <span class="info-value ${data.consent.is_withdrawn ? 'status-withdrawn' : ''}">${withdrawnStatus}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Last Updated:</span>
          <span class="info-value">${timestamp}</span>
        </div>
      `;
    } else {
      content += `
        <div class="info-row">
          <span class="info-value">No consent information found for this session.</span>
        </div>
      `;
    }

    content += `</div>`;

    if (data.messages && data.messages.length > 0) {
      content += `
        <div class="info-section">
          <h3>Messages (${data.messages.length})</h3>
          <div class="messages-container">
      `;

      data.messages.forEach(msg => {
        const messageTime = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : "N/A";
        const messageClass = msg.type === "you" ? "user-msg" : (msg.type === "bot" ? "bot-msg" : "system-msg");

        content += `
          <div class="message-item ${messageClass}">
            <div class="message-header">
              <span class="message-type">${msg.type.toUpperCase()}</span>
              <span class="message-time">${messageTime}</span>
            </div>
            <div class="message-content">${msg.content}</div>
          </div>
        `;
      });

      content += `</div></div>`;
    }

    if (data.feedback && data.feedback.length > 0) {
      content += `
        <div class="info-section">
          <h3>Feedback</h3>
          <div class="feedback-container">
      `;

      data.feedback.forEach(fb => {
        const feedbackTime = fb.timestamp ? new Date(fb.timestamp).toLocaleString() : "N/A";
        const emojiRatings = ["😠", "😕", "😐", "🙂", "😍"];
        const ratingEmoji = fb.rating >= 1 && fb.rating <= 5 ? emojiRatings[fb.rating - 1] : "?";

        content += `
          <div class="feedback-item">
            <div class="feedback-rating">
              <span class="info-label">Rating:</span>
              <span class="info-value">${ratingEmoji} (${fb.rating}/5)</span>
            </div>
            <div class="feedback-comment">
              <span class="info-label">Comment:</span>
              <span class="info-value">${fb.comment || "No comment provided"}</span>
            </div>
            <div class="feedback-time">
              <span class="info-label">Submitted:</span>
              <span class="info-value">${feedbackTime}</span>
            </div>
          </div>
        `;
      });

      content += `</div></div>`;
    }

    content += `
      <div class="consent-actions">
        <button id="back-btn" class="secondary-btn">Back</button>
        <button id="accept-from-view" class="primary-btn">Accept Consent</button>
      </div>
    `;

    gdprContent.innerHTML = content;

    gdprContent.classList.add('expanded');

    document.getElementById("back-btn").addEventListener("click", function() {
      showConsentForm();
      gdprContent.classList.remove('expanded');
    });

    document.getElementById("back-to-consent").addEventListener("click", function() {
      showConsentForm();
      gdprContent.classList.remove('expanded');
    });

    document.getElementById("accept-from-view").addEventListener("click", handleAcceptConsent);
  }
});