document.addEventListener("DOMContentLoaded", function () {
    // Support both widget and embedded containers
    const bravurWidget = document.querySelector('.bravur-chatbot-widget') || document.querySelector('.bravur-chatbot-embedded');
    if (!bravurWidget) return;

    let captchaSolved = false;
    let currentSessionId = bravurWidget.dataset.sessionId || null;

    // Load Google reCAPTCHA v2 script if not already present
    if (!document.getElementById('recaptcha-api')) {
        const recaptchaScript = document.createElement('script');
        recaptchaScript.id = 'recaptcha-api';
        recaptchaScript.src = "https://www.google.com/recaptcha/api.js";
        recaptchaScript.async = true;
        recaptchaScript.defer = true;
        document.head.appendChild(recaptchaScript);
    }

    window.showCaptchaModal = function () {
        if (document.getElementById('captcha-modal')) return;

        const modal = document.createElement("div");
        modal.id = "captcha-modal";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0,0,0,0.6)";
        modal.style.zIndex = "10001";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";

        const box = document.createElement("div");
        box.style.backgroundColor = "#fff";
        box.style.padding = "30px";
        box.style.borderRadius = "12px";
        box.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";
        box.style.textAlign = "center";
        box.innerHTML = `
<h3>Please verify you're human</h3>
<div id="recaptcha-container"></div>
<br>
<button id="captcha-submit-btn" style="padding: 10px 20px;">Submit</button>
`;

        modal.appendChild(box);
        document.body.appendChild(modal);

        // Render reCAPTCHA widget after modal is in DOM
        function renderRecaptcha() {
            if (typeof grecaptcha !== "undefined" && grecaptcha.render) {
                grecaptcha.render("recaptcha-container", {
                    sitekey: "6LfAUlsrAAAAANEftLmyVeY8y2gBOBYEC6nQ7jJK"
                });
            } else {
                setTimeout(renderRecaptcha, 100);
            }
        }
        renderRecaptcha();

        document.getElementById("captcha-submit-btn").onclick = async function () {
            const response = grecaptcha.getResponse();
            if (!response) {
                alert("Please complete the CAPTCHA.");
                return;
            }

            // Get current session ID
            const sessionId = bravurWidget.dataset.sessionId || currentSessionId;
            if (!sessionId) {
                console.error("No session ID for CAPTCHA verification");
                return;
            }

            // Send the token to your backend for verification
            const verifyResponse = await fetch("/wp-admin/admin-ajax.php?action=bravur_verify_captcha", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    session_id: sessionId,
                    recaptcha_token: response
                }),
            });

            if (verifyResponse.ok) {
                captchaSolved = true;
                modal.remove();
                grecaptcha.reset();
                console.log("✅ reCAPTCHA solved, limit increased");

                // Notify Flask backend
                const flaskUrl = 'http://localhost:5001/api/v1/ratelimit/captcha-solved';
                const flaskResponse = await fetch(flaskUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ session_id: sessionId }),
                });

                if (!flaskResponse.ok) {
                    console.error("Failed to notify Flask backend");
                }
            } else {
                alert("CAPTCHA verification failed. Please try again.");
                grecaptcha.reset();
            }
        };
    };

    window.checkAndMaybeTriggerCaptcha = function (current, limit) {
        if (!captchaSolved && current >= Math.floor(limit * 0.9)) {
            showCaptchaModal();
        }
    };

    // Make testCaptcha globally available for the button
    window.testCaptcha = function () {
        if (typeof window.checkAndMaybeTriggerCaptcha === 'function') {
            window.checkAndMaybeTriggerCaptcha(4, 5);
        } else {
            alert("CAPTCHA function not loaded!");
        }
    };

    // Add the TEST CAPTCHA button inside .chat-container
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        const captchaButton = document.createElement("button");
        captchaButton.innerText = "TEST CAPTCHA";
        captchaButton.onclick = testCaptcha;
        captchaButton.style.margin = "10px 0";
        captchaButton.style.padding = "10px";
        captchaButton.style.background = "#ff0000";
        captchaButton.style.color = "white";
        captchaButton.style.width = "100%";
        // Append at the very end of chat-container
        chatContainer.appendChild(captchaButton);
    }
});