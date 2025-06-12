document.addEventListener("DOMContentLoaded", function () {
    const bravurWidget = document.querySelector('.bravur-chatbot-widget') || document.querySelector('.bravur-chatbot-embedded');
    if (!bravurWidget) return;

    let captchaWidgetId = null;
    let currentSessionId = bravurWidget.dataset.sessionId || null;

    if (!document.getElementById('recaptcha-api')) {
        const recaptchaScript = document.createElement('script');
        recaptchaScript.id = 'recaptcha-api';
        recaptchaScript.src = "https://www.google.com/recaptcha/api.js";
        recaptchaScript.async = true;
        recaptchaScript.defer = true;
        document.head.appendChild(recaptchaScript);
    }

    window.showCaptchaModal = function () {
        // Prevent duplicate modals
        if (document.getElementById('captcha-modal')) return;

        // Find the chat container (works for both widget and embedded)
        const chatContainer = bravurWidget.querySelector('.chat-container');
        if (!chatContainer) return;

        // Create modal overlay inside the chatbot
        const modal = document.createElement("div");
        modal.id = "captcha-modal";
        modal.className = "captcha-modal";

        const box = document.createElement("div");
        box.className = "captcha-modal-box captcha-animate-in";
        box.innerHTML = `
        <div class="captcha-modal-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="24" fill="#007bff"/>
            <path d="M16 32c0-4 8-4 8-8V16" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="24" cy="36" r="2" fill="#fff"/>
          </svg>
        </div>
        <button class="captcha-modal-close" title="Close">&times;</button>
        <h3>Please verify you're human</h3>
        <div id="recaptcha-container"></div>
        <br>
        <button id="captcha-submit-btn" class="btn btn-primary">Submit</button>
        `;

        modal.appendChild(box);
        chatContainer.appendChild(modal);

        function renderRecaptcha() {
            if (typeof grecaptcha !== "undefined" && grecaptcha.render) {
                captchaWidgetId = grecaptcha.render("recaptcha-container", {
                    sitekey: "6LfAUlsrAAAAANEftLmyVeY8y2gBOBYEC6nQ7jJK"
                });
            } else {
                setTimeout(renderRecaptcha, 100);
            }
        }
        renderRecaptcha();

        document.getElementById("captcha-submit-btn").onclick = async function () {
            const response = grecaptcha.getResponse(captchaWidgetId);
            if (!response) {
                alert("Please complete the CAPTCHA.");
                return;
            }

            const sessionId = bravurWidget.dataset.sessionId || currentSessionId;
            if (!sessionId) {
                console.error("No session ID for CAPTCHA verification");
                return;
            }

            const verifyResponse = await fetch("/wp-admin/admin-ajax.php?action=bravur_verify_captcha", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    session_id: sessionId,
                    recaptcha_token: response
                }),
            });

            if (verifyResponse.ok) {
                modal.remove();
                grecaptcha.reset(captchaWidgetId);

                // Resend the blocked message if there is one
                if (window.pendingMessage) {
                    if (typeof window.sendMessage === 'function') {
                        window.sendMessage(window.pendingMessage);
                    }
                    window.pendingMessage = null;
                }
            } else {
                alert("CAPTCHA verification failed. Please try again.");
                grecaptcha.reset(captchaWidgetId);
            }
        };

        // Add close button event
        box.querySelector('.captcha-modal-close').onclick = function() {
            modal.remove();
        };
    };

    window.checkAndMaybeTriggerCaptcha = function (current, limit) {
        if (current >= Math.floor(limit * 0.9)) {
            showCaptchaModal();
        }
    };
});
