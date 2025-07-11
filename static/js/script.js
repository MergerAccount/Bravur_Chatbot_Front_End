let isListening = false;
let isRecording = false;
let selectedLanguage = "nl-NL"; 
let selectedRating = null;
let currentAudio = null;
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let bravurFingerprint = null;
let recognition = null;

document.addEventListener("DOMContentLoaded", function () {
    console.log(" Bravur Chatbot WordPress script loaded");
    console.log(" Checking for potential conflicts...");
    console.log(" jQuery version:", typeof $ !== 'undefined' ? $.fn.jquery : 'Not loaded');
    console.log(" Other chatbots:", document.querySelectorAll('[id*="chat"], [class*="chat"]').length);

    // Check browser compatibility
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasSpeechRecognition = !!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
    
    console.log("Browser compatibility:", {
        mediaDevices: hasMediaDevices,
        speechRecognition: hasSpeechRecognition
    });

    // Disable voice features if not supported
    if (!hasMediaDevices) {
        const voiceBtn = document.querySelector('.bravur-chatbot-widget #voice-chat-btn');
        const stsBtn = document.querySelector('.bravur-chatbot-widget #sts-btn');
        if (voiceBtn) voiceBtn.style.display = 'none';
        if (stsBtn) stsBtn.style.display = 'none';
    }

    // Get WordPress localized variables SAFELY
    if (typeof bravurChatbot === 'undefined') {
        return;
    }

    const apiUrl = bravurChatbot.api_url;
    const ajaxUrl = bravurChatbot.ajax_url;
    const nonce = bravurChatbot.nonce;
    let currentSessionId = bravurChatbot.session_id;

    console.log("📊 Bravur Config:", {
        apiUrl: apiUrl,
        ajaxUrl: ajaxUrl,
        sessionId: currentSessionId
    });

    // Check if our chatbot elements exist
    const ourChatbot = document.querySelector('.bravur-chatbot-widget');
    if (!ourChatbot) {
        return;
    }

    // Set session ID as data attribute
    if (currentSessionId) {
        ourChatbot.dataset.sessionId = currentSessionId;
    }

    // Initialize chatbot with protection
    try {
        generateFingerprint().then(() => {
            initializeChatbot();
        });
    } catch (error) {
        console.error("💥 Error initializing Bravur chatbot:", error);
    }

    // 1. Load FingerprintJS v3 from CDN if not present
    if (!window.FingerprintJS) {
        const fpScript = document.createElement('script');
        fpScript.src = 'https://openfpcdn.io/fingerprintjs/v3.3.6/fingerprintjs.umd.min.js'; // UMD build for browsers
        fpScript.async = true;
        document.head.appendChild(fpScript);
    }

    let bravurFingerprint = null;

    // 2. Generate fingerprint and return a Promise
    function loadFingerprintJSScript() {
        return new Promise((resolve, reject) => {
            if (window.Fingerprint2) {
                resolve();
                return;
            }
            const fpScript = document.createElement('script');
            fpScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/fingerprintjs2/2.1.0/fingerprint2.min.js';
            fpScript.async = true;
            fpScript.onload = resolve;
            fpScript.onerror = reject;
            document.head.appendChild(fpScript);
        });
    }

    function generateFingerprint() {
        return loadFingerprintJSScript().then(() => {
            return new Promise((resolve) => {
                Fingerprint2.get(components => {
                    const values = components.map(component => component.value);
                    const murmur = Fingerprint2.x64hash128(values.join(''), 31);
                    bravurFingerprint = murmur;
                    window.bravurFingerprint = murmur;
                    console.log('🔑 FingerprintJS2 visitorId:', murmur);
                    resolve();
                });
            });
        });
    }

    function initializeChatbot() {
        setupEventListeners();
        initializeLanguageButtons();

        // Add welcome message
        const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
        if (chatBox) {
            chatBox.innerHTML += '<p class="message bot-message">Welcome to Bravur AI Chatbot! How can I help you today?</p>';
        }

        // Load message history if session exists
        if (currentSessionId) {
            loadMessageHistory();
        }
    }


    function initializeChatbot() {
        setupEventListeners();
        initializeLanguageButtons();

        const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
        if (chatBox) {
            chatBox.innerHTML += '<p class="message bot-message">How can I help you?</p>';
        }

    }


    function setupEventListeners() {
        const bravurWidget = document.querySelector('.bravur-chatbot-widget');
        if (!bravurWidget) {
            return;
        }

        const toggleBtn = bravurWidget.querySelector('#chatbot-toggle-btn'); // Fixed selector
        const container = bravurWidget.querySelector('#chatbot-container');

        if (toggleBtn && container) {
            toggleBtn.addEventListener('click', async function (e) {
                e.preventDefault();

                if (!currentSessionId) {
                    await createSessionAndCheckConsent();
                }

                container.classList.toggle('chatbot-hidden');
                const icon = toggleBtn.querySelector('#toggle-icon');
                if (icon) {
                    icon.textContent = container.classList.contains('chatbot-hidden') ? '💬' : '×';
                }
            });
        }

        const sendBtn = bravurWidget.querySelector('#send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopPropagation();

                // Ensure session exists before sending message
                if (!currentSessionId) {
                    await createSessionAndCheckConsent();
                }

                sendMessage();
            });
        }

        const userInput = bravurWidget.querySelector('#user-input');
        if (userInput) {
            userInput.addEventListener('keydown', async function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();

                    if (!currentSessionId) {
                        await createSessionAndCheckConsent();
                    }

                    sendMessage();
                }
            });
        }

        const voiceChatBtn = bravurWidget.querySelector('#voice-chat-btn');
        if (voiceChatBtn) {
            voiceChatBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopPropagation();

                // Ensure session exists before voice input
                if (!currentSessionId) {
                    await createSessionAndCheckConsent();
                }

                handleVoiceInput();
            });
        }

        const stsBtn = bravurWidget.querySelector('#sts-btn');
        if (stsBtn) {
            stsBtn.innerHTML = "🤖";
            stsBtn.title = "Use Voice Mode 🤖";
            stsBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopPropagation();

                if (!currentSessionId) {
                    console.log("🚀 Creating session before STS...");
                    await createSessionAndCheckConsent();
                }

                handleStsButtonClick();
            });
        }

        // Consent button
        const acceptConsentBtn = bravurWidget.querySelector('#accept-consent-btn');
        if (acceptConsentBtn) {
            acceptConsentBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                handleAcceptConsent();
            });
        }

        if (container && !container.classList.contains('chatbot-hidden')) {
            createSessionAndCheckConsent();
        }
    }


    async function createSessionAndCheckConsent() {
        if (currentSessionId) {
            return currentSessionId;
        }


        try {
            const sessionResponse = await makeWordPressAPICall('create_session', {});

            if (sessionResponse.success && sessionResponse.data.session_id) {
                currentSessionId = sessionResponse.data.session_id;
                const sessionEl = document.querySelector('.bravur-chatbot-widget #session-id');
                if (sessionEl) {
                    sessionEl.textContent = currentSessionId;
                }

                const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
                if (chatBox && chatBox.innerHTML.includes('Click to start chatting')) {
                    chatBox.innerHTML = '<p class="message bot-message">Welcome to Bravur AI Chatbot! How can I help you today?</p>';
                }

                await loadMessageHistory();

                await checkConsentStatus();

                return currentSessionId;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    function initializeLanguageButtons() {
        const engBtn = document.querySelector('.bravur-chatbot-widget #eng-btn');
        const nlBtn = document.querySelector('.bravur-chatbot-widget #nl-btn');

        if (!engBtn || !nlBtn) return;

        // Set initial state
        nlBtn.classList.add('active');
        nlBtn.classList.remove('inactive');
        engBtn.classList.add('inactive');
        engBtn.classList.remove('active');

        selectedLanguage = "nl-NL";
        console.log("Initial language set to:", selectedLanguage);

        engBtn.addEventListener('click', function () {
            if (!engBtn.classList.contains('active')) {
                if (selectedLanguage !== "en-US") {
                    const oldLanguage = selectedLanguage;

                    engBtn.classList.add('active');
                    engBtn.classList.remove('inactive');
                    nlBtn.classList.add('inactive');
                    nlBtn.classList.remove('active');
                    selectedLanguage = "en-US";

                    notifyLanguageChange(oldLanguage, "en-US");
                    console.log("Language changed to English:", selectedLanguage);
                }
            }
        });

        nlBtn.addEventListener('click', function () {
            if (!nlBtn.classList.contains('active')) {
                if (selectedLanguage !== "nl-NL") {
                    const oldLanguage = selectedLanguage;

                    nlBtn.classList.add('active');
                    nlBtn.classList.remove('inactive');
                    engBtn.classList.add('inactive');
                    engBtn.classList.remove('active');
                    selectedLanguage = "nl-NL";

                    notifyLanguageChange(oldLanguage, "nl-NL");
                    console.log("Language changed to Dutch:", selectedLanguage);
                }
            }
        });
    }

    async function createSessionAndCheckConsent() {
        console.log(' Starting session creation...');
        console.log(' Current URL:', window.location.href);
        console.log(' AJAX URL:', ajaxUrl);
        console.log(' Nonce:', nonce);

        try {
            console.log(' Making AJAX call to create session...');

            const sessionResponse = await makeWordPressAPICall('create_session', {});

            console.log(' Session response received:', sessionResponse);

            if (sessionResponse.success && sessionResponse.data.session_id) {
                currentSessionId = sessionResponse.data.session_id;
                const sessionEl = document.querySelector('.bravur-chatbot-widget #session-id');
                if (sessionEl) {
                    sessionEl.textContent = currentSessionId;
                }

                // Set session ID as data attribute
                const bravurWidget = document.querySelector('.bravur-chatbot-widget');
                if (bravurWidget) {
                    bravurWidget.dataset.sessionId = currentSessionId;
                }

                console.log('✅ Session created successfully:', currentSessionId);

                checkConsentStatus();
            } else {
                addSystemMessage('Failed to initialize chatbot. Please refresh the page.');
            }
        } catch (error) {
            console.error('💥 Error creating session:', error);
            console.error('Error details:', error.message);
            addSystemMessage('Error initializing chatbot. Please refresh the page.');
        }
    }

    async function checkConsentStatus() {
        if (!currentSessionId) return;

        try {
            const response = await makeWordPressAPICall('consent_check', { session_id: currentSessionId });

            if (response.success && response.data.can_proceed) {
                enableChat();
            } else {
                showConsentBubble();
            }
        } catch (error) {
            console.error('Error checking consent:', error);
            showConsentBubble();
        }
    }

    function showConsentBubble() {
        const consentBubble = document.querySelector('.bravur-chatbot-widget #consent-bubble');
        if (consentBubble) {
            consentBubble.style.display = 'block';
        }
        disableChat();
    }

    async function handleAcceptConsent() {
        if (!currentSessionId) {
            addSystemMessage("No session ID available. Please refresh the page.");
            return;
        }

        try {
            const response = await makeWordPressAPICall('consent_accept', { session_id: currentSessionId });

            if (response.success && response.data.success) {
                const consentBubble = document.querySelector('.bravur-chatbot-widget #consent-bubble');
                if (consentBubble) {
                    consentBubble.style.display = 'none';
                }
                enableChat();
                addSystemMessage("Thank you! Chat is now enabled.");
            } else {
                addSystemMessage("Failed to accept consent. Please try again.");
            }
        } catch (error) {
            console.error('Error accepting consent:', error);
            addSystemMessage("Error accepting consent. Please try again.");
        }
    }

    function sendMessage(message) {
        // Use scoped selectors to avoid conflicts
        const bravurWidget = document.querySelector('.bravur-chatbot-widget');
        if (!bravurWidget) {
            return;
        }

        var userInputField = bravurWidget.querySelector("#user-input");
        var chatBox = bravurWidget.querySelector("#chat-box");
        var spinner = bravurWidget.querySelector("#spinner");

        if (!userInputField || !chatBox || !spinner) {
            return;
        }

        // Use the provided message, or fall back to the input field
        var userInput = typeof message === "string" ? message.trim() : userInputField.value.trim();

        // Validate input length
        const wordCount = userInput.split(/\s+/).length;
        const charCount = userInput.length;

        if (wordCount >= 150 || charCount >= 1000) {
            var container = document.createElement("div");
            container.className = "bot-message-container";

            var botMsg = document.createElement("p");
            botMsg.className = "message bot-message";
            botMsg.textContent = "⚠️ Your message is too long. Please limit it to 150 words or 1000 characters.";

            container.appendChild(botMsg);
            chatBox.appendChild(container);

            chatBox.scrollTop = chatBox.scrollHeight;
            return;
        }

        if (userInput === "") return;

        spinner.style.display = "block";
        var startTime = performance.now();
        var elapsed = 0;
        spinner.textContent = "⏳ Typing...";
        var timerInterval = setInterval(function () {
            elapsed = (performance.now() - startTime) / 1000;
            spinner.textContent = "⏳ Typing... " + elapsed.toFixed(1) + "s";
        }, 100);

        chatBox.scrollTop = chatBox.scrollHeight;

        makeWordPressAPICall('chat', {
            user_input: userInput,
            session_id: currentSessionId,
            language: selectedLanguage,
            fingerprint: bravurFingerprint
        }).then(function (response) {
            clearInterval(timerInterval);
            var finalTime = (performance.now() - startTime) / 1000;

            // Handle CAPTCHA response
            if (response.data && response.data.captcha_required) {
                window.pendingMessage = userInput;
                spinner.style.display = "none";
                if (typeof checkAndMaybeTriggerCaptcha === 'function') {
                    checkAndMaybeTriggerCaptcha(response.data.count, response.data.limit);
                }
                return;
            }

            // Only now show the user message and clear the input
            chatBox.innerHTML += '<p class="message user-message">' + userInput + '</p>';
            userInputField.value = "";

            if (response.success && response.data.response) {
                spinner.textContent = "🕒 Responded in " + finalTime.toFixed(1) + "s";
                setTimeout(function () {
                    spinner.style.display = "none";
                    spinner.textContent = "";
                }, 2000);

                var container = document.createElement("div");
                container.className = "bot-message-container";

                var botMsg = document.createElement("p");
                botMsg.className = "message bot-message";
                botMsg.textContent = response.data.response;

                const speakButton = document.createElement("button");
                speakButton.className = "speak-btn";
                speakButton.innerHTML = "🔊";

                let audioUrl = null;
                let audioState = "idle"; // idle, playing, paused

                speakButton.onclick = function () {
                    if (!currentAudio || currentAudio.src !== audioUrl) {
                        // If no audio or a different audio, create new
                        if (currentAudio) {
                            currentAudio.pause();
                            currentAudio.currentTime = 0;
                        }
                        if (response.data.audio_base64) {
                            const audioBytes = Uint8Array.from(atob(response.data.audio_base64), c => c.charCodeAt(0));
                            const audioResponseBlob = new Blob([audioBytes], { type: "audio/wav" });
                            audioUrl = URL.createObjectURL(audioResponseBlob);
                            currentAudio = new Audio(audioUrl);
                        } else {
                            return;
                        }
                        currentAudio.onended = function() {
                            URL.revokeObjectURL(audioUrl);
                            speakButton.innerHTML = "🔊";
                            audioState = "idle";
                        };
                        currentAudio.onpause = function() {
                            if (!currentAudio.ended && currentAudio.currentTime > 0) {
                                speakButton.innerHTML = "▶️";
                                audioState = "paused";
                            }
                        };
                        currentAudio.onplay = function() {
                            speakButton.innerHTML = "⏸️";
                            audioState = "playing";
                        };
                        currentAudio.play();
                        speakButton.innerHTML = "⏸️";
                        audioState = "playing";
                    } else if (audioState === "playing") {
                        currentAudio.pause();
                        // onpause handler will update icon
                    } else if (audioState === "paused") {
                        currentAudio.play();
                        // onplay handler will update icon
                    } else {
                        // If idle, play again
                        currentAudio.currentTime = 0;
                        currentAudio.play();
                        speakButton.innerHTML = "⏸️";
                        audioState = "playing";
                    }
                };

                container.appendChild(botMsg);
                container.appendChild(speakButton);
                chatBox.appendChild(container);

                showFeedbackOption();
                // 🔐 After bot response, check if rate limit is near the threshold
                fetch(`${apiUrl}/ratelimit/check`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        fingerprint: bravurFingerprint
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && typeof checkAndMaybeTriggerCaptcha === 'function') {
                            checkAndMaybeTriggerCaptcha(data.count, data.limit);
                        }
                    })
                    .catch(err => console.warn("Rate limit check failed:", err));
            } else {
                spinner.style.display = "none";
                chatBox.innerHTML += '<p class="message bot-message">Sorry, I could not process your message. Please try again.</p>';
            }

            chatBox.scrollTop = chatBox.scrollHeight;
        }).catch(function (error) {
            console.error("Bravur chat error:", error);
            clearInterval(timerInterval);
            spinner.style.display = "none";

            // Handle CAPTCHA error response
            if (error.response && error.response.data && error.response.data.captcha_required) {
                if (typeof checkAndMaybeTriggerCaptcha === 'function') {
                    checkAndMaybeTriggerCaptcha(
                        error.response.data.count,
                        error.response.data.limit
                    );
                }
            } else {
                chatBox.innerHTML += '<p class="message bot-message">Something went wrong. Try again!</p>';
            }
        });
    }

    async function handleVoiceInput() {
        if (isRecording) {
            stopRecordingProcess();
            return;
        }

        try {
            console.log("Starting dictate recording process");

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Media devices not supported in this browser");
            }

            const voiceChatBtn = document.querySelector('.bravur-chatbot-widget #voice-chat-btn');
            if (voiceChatBtn) {
                voiceChatBtn.textContent = "🎙️ Recording...";
                voiceChatBtn.title = "Stop Recording";
                voiceChatBtn.style.backgroundColor = "#e53935"; // red
                voiceChatBtn.style.color = "#fff";
                voiceChatBtn.disabled = false;
                voiceChatBtn.onclick = function(e) {
                    e.preventDefault();
                    stopRecordingProcess();
                };
            }

            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const supportedTypes = [
                'audio/webm;codecs=opus',
                'audio/webm;codecs=vorbis',
                'audio/webm',
                'audio/mp4',
                'audio/wav'
            ];

            let selectedMimeType = null;
            for (const mimeType of supportedTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    console.log(`✅ Using MIME type: ${mimeType}`);
                    break;
                }
            }

            if (!selectedMimeType) {
                throw new Error("No supported audio format found");
            }

            mediaRecorder = new MediaRecorder(audioStream, {
                mimeType: selectedMimeType,
                audioBitsPerSecond: 128000
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = processDictateRecording;
            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                resetUI();
            };

            audioChunks = [];
            mediaRecorder.start();

            isRecording = true;
            console.log("Dictate recording started successfully with MIME type:", selectedMimeType);

        } catch (error) {
            console.error("Failed to start dictate recording:", error);

            isRecording = false;
            const voiceChatBtn = document.querySelector('.bravur-chatbot-widget #voice-chat-btn');
            if (voiceChatBtn) {
                voiceChatBtn.textContent = "🎤";
                voiceChatBtn.title = "Dictate 🎤";
                voiceChatBtn.style.backgroundColor = "";
                voiceChatBtn.style.color = "";
                voiceChatBtn.disabled = false;
                voiceChatBtn.onclick = handleVoiceInput;
            }

            const errorMsg = document.createElement("p");
            errorMsg.className = "message system-message";
            errorMsg.textContent = "Unable to access microphone. Please check your permissions and try again.";
            const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
            if (chatBox) {
                chatBox.appendChild(errorMsg);
            }
        }
    }

    async function processDictateRecording() {
        const spinner = document.querySelector('.bravur-chatbot-widget #spinner');
        const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
        console.log("Processing dictate recording");

        try {
            // Safely determine MIME type
            let mimeType = 'audio/webm;codecs=opus';
            if (mediaRecorder && mediaRecorder.mimeType) {
                mimeType = mediaRecorder.mimeType;
            } else if (audioChunks.length > 0 && audioChunks[0].type) {
                mimeType = audioChunks[0].type;
            }

            const audioBlob = new Blob(audioChunks, { type: mimeType });
            console.log(`Audio blob created: ${audioBlob.size} bytes, type: ${mimeType}`);

            // Validate blob size
            if (audioBlob.size < 1000) {
                throw new Error("Recording too short or empty");
            }

            // Create FormData
            const formData = new FormData();
            formData.append('action', 'bravur_api_proxy');
            formData.append('api_action', 'sts');
            formData.append('nonce', nonce);
            formData.append('audio', audioBlob, 'input.webm');
            formData.append('data[session_id]', currentSessionId);
            formData.append('data[language]', selectedLanguage);
            
            if (bravurFingerprint) {
                formData.append('data[fingerprint]', bravurFingerprint);
            }

            console.log("Sending dictate request...");

            if (spinner) {
                spinner.style.display = "block";
            }

            // Show processing message
            const placeholderMsg = document.createElement("p");
            placeholderMsg.className = "message user-message";
            placeholderMsg.id = "temp-user-message";
            placeholderMsg.textContent = "Processing your voice...";
            if (chatBox) {
                chatBox.appendChild(placeholderMsg);
            }

            const response = await fetch(ajaxUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }

            const data = await response.json();
            console.log("Dictate response:", data);

            // Hide spinner
            if (spinner) {
                spinner.style.display = "none";
            }

            // Update user message
            const tempUserMsg = document.getElementById("temp-user-message");
            if (tempUserMsg && data.user_text) {
                tempUserMsg.textContent = data.user_text;
                tempUserMsg.id = "";
            }

            // Add bot response (TEXT ONLY, NO AUDIO)
            if (data.bot_text && chatBox) {
                const container = document.createElement("div");
                container.className = "bot-message-container";

                const botMsg = document.createElement("p");
                botMsg.className = "message bot-message";
                botMsg.textContent = data.bot_text;

                // NO speak button - this is the key difference from STS
                container.appendChild(botMsg);
                chatBox.appendChild(container);
            }

            if (chatBox) {
                chatBox.scrollTop = chatBox.scrollHeight;
            }

        } catch (error) {
            console.error("Error processing dictate:", error);

            if (spinner) {
                spinner.style.display = "none";
            }

            const tempUserMsg = document.getElementById("temp-user-message");
            if (tempUserMsg) {
                tempUserMsg.remove();
            }

            const errorMsg = document.createElement("p");
            errorMsg.className = "message system-message";
            errorMsg.textContent = `Voice processing failed: ${error.message}`;
            if (chatBox) {
                chatBox.appendChild(errorMsg);
            }
        } finally {
            resetUI();
        }
    }

    function resetUI() {
        isRecording = false;

        // Reset Dictate (voice input) button
        const voiceChatBtn = document.querySelector('.bravur-chatbot-widget #voice-chat-btn');
        if (voiceChatBtn) {
            voiceChatBtn.textContent = "🎤";
            voiceChatBtn.title = "Dictate 🎤";
            voiceChatBtn.style.backgroundColor = "";
            voiceChatBtn.style.color = "";
            voiceChatBtn.disabled = false;
            voiceChatBtn.onclick = handleVoiceInput;
        }

        // Reset Voice Mode (voice mode) button
        const stsButton = document.querySelector('.bravur-chatbot-widget #sts-btn');
        if (stsButton) {
            stsButton.innerHTML = "🤖";
            stsButton.title = "Use Voice Mode 🤖";
            stsButton.style.backgroundColor = "";
            stsButton.style.color = "";
            stsButton.disabled = false;
            stsButton.onclick = handleStsButtonClick;
        }

        if (audioStream) {
            audioStream.getTracks().forEach(function (track) { track.stop(); });
            audioStream = null;
        }
        mediaRecorder = null;
    }

    const stsButton = document.getElementById("sts-btn");

    stsButton.innerHTML = "🤖";
    stsButton.title = "Use Voice Mode 🤖";

    stsButton.addEventListener("click", handleStsButtonClick);

    function handleStsButtonClick() {
        console.log("Button clicked, current state:", isRecording);

        if (!isRecording) {
            startRecordingProcess();
        } else {
            stopRecordingProcess();
        }
    }

    async function startRecordingProcess() {
        try {
            console.log("Starting recording process");

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Media devices not supported in this browser");
            }

            const stsButton = document.querySelector('.bravur-chatbot-widget #sts-btn');
            if (stsButton) {
                stsButton.innerHTML = "Stop Recording";
                stsButton.title = "Stop Recording";
                stsButton.style.backgroundColor = "#e53935"; // red
                stsButton.style.color = "#fff";
                stsButton.disabled = false;
                stsButton.onclick = function(e) {
                    e.preventDefault();
                    stopRecordingProcess();
                };
            }

            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const supportedTypes = [
                'audio/webm;codecs=opus',
                'audio/webm;codecs=vorbis',
                'audio/webm',
                'audio/mp4',
                'audio/wav'
            ];

            let selectedMimeType = null;
            for (const mimeType of supportedTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    console.log(`✅ Using MIME type: ${mimeType}`);
                    break;
                }
            }

            if (!selectedMimeType) {
                throw new Error("No supported audio format found");
            }

            mediaRecorder = new MediaRecorder(audioStream, {
                mimeType: selectedMimeType,
                audioBitsPerSecond: 128000
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = processRecording;
            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                resetUI();
            };

            audioChunks = [];
            mediaRecorder.start();

            isRecording = true;
            console.log("Recording started successfully with MIME type:", selectedMimeType);

        } catch (error) {
            console.error("Failed to start recording:", error);

            isRecording = false;
            const stsButton = document.querySelector('.bravur-chatbot-widget #sts-btn');
            if (stsButton) {
                stsButton.innerHTML = "🤖";
                stsButton.title = "Use Voice Mode 🤖";
                stsButton.style.backgroundColor = "";
                stsButton.style.color = "";
                stsButton.disabled = false;
                stsButton.onclick = handleStsButtonClick;
            }

            const errorMsg = document.createElement("p");
            errorMsg.className = "message system-message";
            errorMsg.textContent = "Unable to access microphone. Please check your permissions and try again.";
            const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
            if (chatBox) {
                chatBox.appendChild(errorMsg);
            }
        }
    }

    function stopRecordingProcess() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    }

    // Helper function to show a thinking indicator
    function showThinkingIndicator() {
        hideThinkingIndicator();

        const thinkingDiv = document.createElement("div");
        thinkingDiv.id = "thinking-indicator";
        thinkingDiv.className = "message bot-message thinking";
        thinkingDiv.innerHTML = "<div class='thinking-dots'><span>.</span><span>.</span><span>.</span></div>";

        const chatContainer = document.querySelector(".bravur-chatbot-widget .chat-container");
        if (chatContainer) {
            chatContainer.appendChild(thinkingDiv);
        }
    }


    function hideThinkingIndicator() {
        const thinkingDiv = document.getElementById("thinking-indicator");
        if (thinkingDiv) {
          thinkingDiv.remove();
        }
    }

    async function processRecording() {
        const spinner = document.querySelector('.bravur-chatbot-widget #spinner');
        const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
        console.log("Processing recording");

        try {
            // Safely determine MIME type
            let mimeType = 'audio/webm;codecs=opus';
            if (mediaRecorder && mediaRecorder.mimeType) {
                mimeType = mediaRecorder.mimeType;
            } else if (audioChunks.length > 0 && audioChunks[0].type) {
                mimeType = audioChunks[0].type;
            }

            const audioBlob = new Blob(audioChunks, { type: mimeType });
            console.log(`Audio blob created: ${audioBlob.size} bytes, type: ${mimeType}`);

            // Validate blob size
            if (audioBlob.size < 1000) {
                throw new Error("Recording too short or empty");
            }

            // Create FormData
            const formData = new FormData();
            formData.append('action', 'bravur_api_proxy');
            formData.append('api_action', 'sts');
            formData.append('nonce', nonce);
            formData.append('audio', audioBlob, 'input.webm');
            formData.append('data[session_id]', currentSessionId);
            formData.append('data[language]', selectedLanguage);
            
            if (bravurFingerprint) {
                formData.append('data[fingerprint]', bravurFingerprint);
            }

            console.log("Sending speech-to-speech request...");

            if (spinner) {
                spinner.style.display = "block";
            }

            // Show processing message
            const placeholderMsg = document.createElement("p");
            placeholderMsg.className = "message user-message";
            placeholderMsg.id = "temp-user-message";
            placeholderMsg.textContent = "Processing your voice...";
            if (chatBox) {
                chatBox.appendChild(placeholderMsg);
            }

            const response = await fetch(ajaxUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }

            const data = await response.json();
            console.log("STS response:", data);

            // Hide spinner
            if (spinner) {
                spinner.style.display = "none";
            }

            // Update user message
            const tempUserMsg = document.getElementById("temp-user-message");
            if (tempUserMsg && data.user_text) {
                tempUserMsg.textContent = data.user_text;
                tempUserMsg.id = "";
            }

            // Add bot response
            if (data.bot_text && chatBox) {
                const container = document.createElement("div");
                container.className = "bot-message-container";

                const botMsg = document.createElement("p");
                botMsg.className = "message bot-message";
                botMsg.textContent = data.bot_text;

                const speakButton = document.createElement("button");
                speakButton.className = "speak-btn";
                speakButton.innerHTML = "🔊";

                let audioUrl = null;
                let audioState = "idle"; // idle, playing, paused

                speakButton.onclick = function () {
                    if (!currentAudio || currentAudio.src !== audioUrl) {
                        // If no audio or a different audio, create new
                        if (currentAudio) {
                            currentAudio.pause();
                            currentAudio.currentTime = 0;
                        }
                        if (data.audio_base64) {
                            const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
                            const audioResponseBlob = new Blob([audioBytes], { type: "audio/wav" });
                            audioUrl = URL.createObjectURL(audioResponseBlob);
                            currentAudio = new Audio(audioUrl);
                        } else {
                            return;
                        }
                        currentAudio.onended = function() {
                            URL.revokeObjectURL(audioUrl);
                            speakButton.innerHTML = "🔊";
                            audioState = "idle";
                        };
                        currentAudio.onpause = function() {
                            if (!currentAudio.ended && currentAudio.currentTime > 0) {
                                speakButton.innerHTML = "▶️";
                                audioState = "paused";
                            }
                        };
                        currentAudio.onplay = function() {
                            speakButton.innerHTML = "⏸️";
                            audioState = "playing";
                        };
                        currentAudio.play();
                        speakButton.innerHTML = "⏸️";
                        audioState = "playing";
                    } else if (audioState === "playing") {
                        currentAudio.pause();
                        // onpause handler will update icon
                    } else if (audioState === "paused") {
                        currentAudio.play();
                        // onplay handler will update icon
                    } else {
                        // If idle, play again
                        currentAudio.currentTime = 0;
                        currentAudio.play();
                        speakButton.innerHTML = "⏸️";
                        audioState = "playing";
                    }
                };

                container.appendChild(botMsg);
                container.appendChild(speakButton);
                chatBox.appendChild(container);

                // Auto-play response
                if (data.audio_base64) {
                    const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
                    const audioResponseBlob = new Blob([audioBytes], { type: "audio/wav" });
                    const audioUrl = URL.createObjectURL(audioResponseBlob);
                    currentAudio = new Audio(audioUrl);
                    currentAudio.play();

                    currentAudio.onended = function() {
                        URL.revokeObjectURL(audioUrl);
                    };
                }
            }

            if (chatBox) {
                chatBox.scrollTop = chatBox.scrollHeight;
            }

        } catch (error) {
            console.error("Error processing speech-to-speech:", error);

            if (spinner) {
                spinner.style.display = "none";
            }

            const tempUserMsg = document.getElementById("temp-user-message");
            if (tempUserMsg) {
                tempUserMsg.remove();
            }

            const errorMsg = document.createElement("p");
            errorMsg.className = "message system-message";
            errorMsg.textContent = `Voice processing failed: ${error.message}`;
            if (chatBox) {
                chatBox.appendChild(errorMsg);
            }
        } finally {
            resetUI();
        }
    }

    async function notifyLanguageChange(fromLang, toLang) {
        try {
            const response = await makeWordPressAPICall('language_change', {
                session_id: currentSessionId,
                from_language: fromLang,
                to_language: toLang
            });

            if (response.success) {
                const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
                if (chatBox) {
                    chatBox.innerHTML += '<p class="message system-message" style="font-size: 0.8em; color: #999;">Language switched to ' + (toLang === "nl-NL" ? "Dutch" : "English") + '</p>';
                }
            }
        } catch (error) {
            console.error('Error notifying language change:', error);
        }
    }

    async function loadMessageHistory() {
        try {
            const response = await makeWordPressAPICall('history', { session_id: currentSessionId });

            if (response.success && response.data.messages) {
                const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
                response.data.messages.forEach(function (msg) {
                    const p = document.createElement("p");
                    p.className = "message";

                    if (msg.type === "user") {
                        p.classList.add("user-message");
                        p.textContent = msg.content;
                        chatBox.appendChild(p);
                    } else if (msg.type === "bot") {
                        const container = document.createElement("div");
                        container.className = "bot-message-container";

                        p.classList.add("bot-message");
                        p.textContent = msg.content;

                        const speakButton = document.createElement("button");
                        speakButton.className = "speak-btn";
                        speakButton.innerHTML = "🔊";

                        let audioUrl = null;
                        let audioState = "idle"; // idle, playing, paused

                        speakButton.onclick = function () {
                            if (!currentAudio || currentAudio.src !== audioUrl) {
                                // If no audio or a different audio, create new
                                if (currentAudio) {
                                    currentAudio.pause();
                                    currentAudio.currentTime = 0;
                                }
                                if (msg.content) {
                                    const audioBytes = Uint8Array.from(atob(msg.content), c => c.charCodeAt(0));
                                    const audioResponseBlob = new Blob([audioBytes], { type: "audio/wav" });
                                    audioUrl = URL.createObjectURL(audioResponseBlob);
                                    currentAudio = new Audio(audioUrl);
                                } else {
                                    return;
                                }
                                currentAudio.onended = function() {
                                    URL.revokeObjectURL(audioUrl);
                                    speakButton.innerHTML = "🔊";
                                    audioState = "idle";
                                };
                                currentAudio.onpause = function() {
                                    if (!currentAudio.ended && currentAudio.currentTime > 0) {
                                        speakButton.innerHTML = "▶️";
                                        audioState = "paused";
                                    }
                                };
                                currentAudio.onplay = function() {
                                    speakButton.innerHTML = "⏸️";
                                    audioState = "playing";
                                };
                                currentAudio.play();
                                speakButton.innerHTML = "⏸️";
                                audioState = "playing";
                            } else if (audioState === "playing") {
                                currentAudio.pause();
                                // onpause handler will update icon
                            } else if (audioState === "paused") {
                                currentAudio.play();
                                // onplay handler will update icon
                            } else {
                                // If idle, play again
                                currentAudio.currentTime = 0;
                                currentAudio.play();
                                speakButton.innerHTML = "⏸️";
                                audioState = "playing";
                            }
                        };

                        container.appendChild(p);
                        container.appendChild(speakButton);
                        chatBox.appendChild(container);
                    } else {
                        p.classList.add("system-message");
                        p.textContent = msg.content;
                        chatBox.appendChild(p);
                    }
                });
                chatBox.scrollTop = chatBox.scrollHeight;
            }
        } catch (error) {
            console.error('Error loading message history:', error);
        }
    }

    async function speakText(text) {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        try {
            const response = await makeWordPressAPICall('tts', {
                text: text,
                language: selectedLanguage
            });

            if (response.success && response.data) {
                const audioUrl = URL.createObjectURL(response.data);
                currentAudio = new Audio(audioUrl);
                currentAudio.play();

                currentAudio.onended = function () {
                    URL.revokeObjectURL(audioUrl);
                };
            }
        } catch (error) {
            console.error("TTS error:", error);
        }
    }

    async function makeWordPressAPICall(action, data) {
        const formData = new FormData();
        formData.append('action', 'bravur_api_proxy');
        formData.append('api_action', action);
        formData.append('nonce', nonce);

        Object.keys(data).forEach(function (key) {
            formData.append('data[' + key + ']', data[key]);
        });

        // In makeWordPressAPICall, add fingerprint to FormData if present
        if (bravurFingerprint) {
            formData.append('data[fingerprint]', bravurFingerprint);
        }

        try {
            const response = await fetch(ajaxUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                // Try to parse error response as JSON
                try {
                    const errorResponse = await response.json();
                    return Promise.reject({
                        response: {
                            status: response.status,
                            data: errorResponse
                        }
                    });
                } catch (e) {
                    // If JSON parse fails, throw generic error
                    throw new Error('HTTP error! status: ' + response.status);
                }
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    function addSystemMessage(text) {
        const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
        if (!chatBox) return;

        const messageEl = document.createElement('div');
        messageEl.className = 'message system-message';
        messageEl.textContent = text;
        chatBox.appendChild(messageEl);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    window.enableChat = function () {
        const inputContainer = document.querySelector('.bravur-chatbot-widget .input-container');
        if (inputContainer) {
            inputContainer.style.pointerEvents = 'auto';
            inputContainer.style.opacity = '1';
        }
        const input = document.querySelector('.input-container input, .input-container textarea');
        if (input) input.disabled = false;
    };

    function disableChat() {
        const inputContainer = document.querySelector('.bravur-chatbot-widget .input-container');
        if (inputContainer) {
            inputContainer.style.pointerEvents = 'none';
            inputContainer.style.opacity = '0.5';
        }
    }

    function showFeedbackOption() {
        const feedbackBtn = document.querySelector('.bravur-chatbot-widget #show-feedback-btn');
        if (feedbackBtn) {
            feedbackBtn.style.display = 'block';
        }
    }

    function playAudioFromBase64(audioBase64) {
        try {
            const audioBytes = Uint8Array.from(atob(audioBase64), function (c) { return c.charCodeAt(0); });
            const audioBlob = new Blob([audioBytes], { type: "audio/wav" });
            const audioUrl = URL.createObjectURL(audioBlob);
            currentAudio = new Audio(audioUrl);
            currentAudio.play();

            currentAudio.onended = function () {
                URL.revokeObjectURL(audioUrl);
            };
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }

    // Global functions for feedback and UI (called from HTML)
    window.selectSmiley = function (rating) {
        selectedRating = rating;
        const smileys = document.querySelectorAll(".bravur-chatbot-widget .smiley-row span");
        smileys.forEach(function (el, idx) {
            el.classList.toggle("selected", idx + 1 === rating);
        });
    };

    window.showFeedback = function () {
        const feedbackContainer = document.querySelector('.bravur-chatbot-widget #feedback-container');
        const showBtn = document.querySelector('.bravur-chatbot-widget #show-feedback-btn');
        if (feedbackContainer) feedbackContainer.style.display = "block";
        if (showBtn) showBtn.style.display = "none";
    };

    window.hideFeedback = function () {
        const feedbackContainer = document.querySelector('.bravur-chatbot-widget #feedback-container');
        const showBtn = document.querySelector('.bravur-chatbot-widget #show-feedback-btn');
        if (feedbackContainer) feedbackContainer.style.display = "none";
        if (showBtn) showBtn.style.display = "block";
    };

    window.enableEditMode = function () {
        const commentBox = document.querySelector('.bravur-chatbot-widget #feedback-comment');
        const message = document.querySelector('.bravur-chatbot-widget #feedback-message');
        if (commentBox) commentBox.disabled = false;
        if (message) {
            message.innerText = "You can now edit your comment. Submit again to update.";
            message.style.color = "blue";
        }
    };

    window.submitFeedback = async function () {
        const commentBox = document.querySelector('.bravur-chatbot-widget #feedback-comment');
        const messageDiv = document.querySelector('.bravur-chatbot-widget #feedback-message');
        const comment = commentBox ? commentBox.value : '';

        if (!selectedRating) {
            if (messageDiv) {
                messageDiv.innerText = "Please select a rating before submitting.";
                messageDiv.style.color = "red";
            }
            return;
        }

        try {
            const response = await makeWordPressAPICall('feedback', {
                session_id: currentSessionId,
                rating: selectedRating,
                comment: comment
            });

            if (response.success) {
                if (messageDiv) {
                    messageDiv.innerText = response.data.message || 'Thank you for your feedback!';
                    messageDiv.style.color = "green";
                }
                if (commentBox) commentBox.disabled = true;
                const editBtn = document.querySelector('.bravur-chatbot-widget #edit-feedback-btn');
                if (editBtn) editBtn.style.display = "block";
            } else {
                if (messageDiv) {
                    messageDiv.innerText = "Feedback failed. Try again later.";
                    messageDiv.style.color = "red";
                }
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
            if (messageDiv) {
                messageDiv.innerText = "Feedback failed. Try again later.";
                messageDiv.style.color = "red";
            }
        }
    };

    // Policy functions
    window.showPolicy = function (event) {
        event.preventDefault();
        const content = document.querySelector('.bravur-chatbot-widget #dropdown-content');
        const container = document.querySelector('.bravur-chatbot-widget #dropdown-content-container');
        if (content) {
            content.innerHTML = '<p>By using this website, you agree to use it for lawful purposes only and in a way that does not infringe on the rights of others. We reserve the right to modify content, suspend access, or terminate services without prior notice. All content on this site is owned or licensed by us. You may not reproduce or redistribute it without permission of this site is at your own risk. We are not liable for any damages resulting from its use.</p>';
        }
        if (container) {
            container.style.display = "block";
        }
    };

    window.showTerms = function (event) {
        event.preventDefault();
        const content = document.querySelector('.bravur-chatbot-widget #dropdown-content');
        const container = document.querySelector('.bravur-chatbot-widget #dropdown-content-container');
        if (content) {
            content.innerHTML = '<p>If you choose to withdraw your consent, we will delete all associated data from our systems. This means we will not be able to provide you with a personalized experience or retain any preferences you have set.</p>';
        }
        if (container) {
            container.style.display = "block";
        }
    };

    window.showManageData = function (event) {
        event.preventDefault();
        const content = document.querySelector('.bravur-chatbot-widget #dropdown-content');
        const container = document.querySelector('.bravur-chatbot-widget #dropdown-content-container');
        if (content) {
            content.innerHTML = '<p>We collect and use limited personal data (like cookies and usage statistics) to improve your experience, personalize content, and analyze our traffic. This may include sharing data with trusted analytics providers. We do not sell your data. You can withdraw your consent at any time, and we will delete your data from our systems upon request.</p><button class="withdraw-btn" id="withdraw-btn">Withdraw Consent</button>';
        }
        if (container) {
            container.style.display = "block";
        }

        const withdrawBtn = document.querySelector('.bravur-chatbot-widget #withdraw-btn');
        if (withdrawBtn) {
            withdrawBtn.addEventListener("click", window.handleWithdrawConsent);
        }
    };

    window.hideDropdown = function () {
        const content = document.querySelector('.bravur-chatbot-widget #dropdown-content');
        const container = document.querySelector('.bravur-chatbot-widget #dropdown-content-container');
        if (container) {
            container.style.display = "none";
        }
        if (content) {
            content.innerHTML = "";
        }
    };

    window.handleWithdrawConsent = async function () {
        if (!currentSessionId) {
            addSystemMessage("No session ID available. Please refresh the page.");
            return;
        }

        if (!confirm("Are you sure you want to withdraw consent? This will delete all your data and disable the chat.")) {
            return;
        }

        try {
            const response = await makeWordPressAPICall('consent_withdraw', {
                session_id: currentSessionId
            });

            if (response.success && response.data.success) {
                disableChat();
                showConsentBubble();

                const chatBox = document.querySelector('.bravur-chatbot-widget #chat-box');
                if (chatBox) {
                    chatBox.innerHTML = '';
                }

                addSystemMessage("Consent withdrawn. Chat disabled and data deleted.");
                window.hideDropdown();
            } else {
                addSystemMessage("Failed to withdraw consent. Please try again.");
            }
        } catch (error) {
            console.error("Error withdrawing consent:", error);
            addSystemMessage("Error withdrawing consent. Please try again.");
        }
    };

    window.checkAndMaybeTriggerCaptcha = function (current, limit) {
        if (current >= Math.floor(limit * 0.9)) {
            showCaptchaModal();
        }
    };
});