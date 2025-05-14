  document.addEventListener("DOMContentLoaded", function () {
    console.log("GDPR Consent script loaded");

    const withdrawBtn = document.getElementById("withdraw-btn");
    const inputContainer = document.querySelector(".input-container");
    const chatBox = document.getElementById("chat-box");
    const sessionIdEl = document.getElementById("session-id");
    const sessionId = sessionIdEl ? sessionIdEl.textContent.trim() : null;
    const privacyPolicyLink = document.getElementById("privacy-policy-link");
    const termsLink = document.getElementById("terms-link");
    const manageDataLink = document.getElementById("manage-data-link");
    const manageConsentBtn = document.getElementById("manage-consent-btn");
    const consentBubble = document.getElementById('consent-bubble');
    const acceptConsentBtn = document.getElementById("accept-consent-btn");


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
          enableChat();
          updateConsentStatusDisplay(true, false);
          console.log("Consent found, chat enabled");
        } else {
          // Show consent bubble and keep chat disabled
          console.log("No consent found, showing consent bubble");
          if (consentBubble) {
            consentBubble.style.display = "block";
          }
          updateConsentStatusDisplay(false, true);
        }
      })
      .catch(error => {
        console.error("Error checking consent:", error);
      });
  }

  function handleAcceptConsent() {
    if (!sessionId) {
      addSystemMessage("No session ID available. Please refresh the page.");
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
          if (consentBubble) {
            consentBubble.style.display = "none";
          }
          enableChat();
          updateConsentStatusDisplay(true, false);
          addSystemMessage("Consent accepted! You can now use the chatbot.");
        } else {
          addSystemMessage(data.error || "Failed to accept consent");
        }
      })
      .catch(error => {
        console.error("Error accepting consent:", error);
        addSystemMessage("Error accepting consent. Please try again.");
      });
  }

  if (acceptConsentBtn) {
    acceptConsentBtn.addEventListener("click", handleAcceptConsent);
  }

  if (manageConsentBtn) {
    manageConsentBtn.addEventListener("click", function() {
      addSystemMessage("Your current consent status:");
      addSystemMessage("To withdraw consent, please contact support.");
    });
  }
});