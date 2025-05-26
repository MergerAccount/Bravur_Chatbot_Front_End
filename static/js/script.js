let selectedRating = null;
let recognition = null;
let isListening = false;
let currentAudio = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let selectedLanguage = "nl-NL";

// Voice chat button
const voiceChatBtn = document.getElementById("voice-chat-btn");
if (voiceChatBtn) {
    voiceChatBtn.addEventListener("click", function() {
        if (isListening) {
            stopSpeechRecognition();
            return;
        }
        isListening = true;
        voiceChatBtn.textContent = "🎙️ Listening...";
        voiceChatBtn.classList.add("listening");
        console.log("Using language for speech recognition:", selectedLanguage);
        const languageToSend = selectedLanguage === "nl-NL" ? "nl-NL" : "en-US";
        fetch("http://localhost:5001/api/v1/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: selectedLanguage })
        })
            .then(response => response.json())
            .then(result => {
                if (result.status === "success" && result.text) {
                    document.getElementById("user-input").value = result.text;
                    setTimeout(() => {
                        sendMessage();
                    }, 500);
                } else {
                    console.error("Speech recognition failed:", result.message || "Unknown error");
                    alert("Speech recognition failed: " + (result.message || "Unknown error"));
                }
            })
            .catch(error => {
                console.error("Speech recognition error:", error);
                alert("Speech recognition error. Please try again.");
            })
            .finally(() => {
                stopSpeechRecognition();
            });
    });
}

function stopSpeechRecognition() {
    isListening = false;
    const voiceChatBtn = document.getElementById("voice-chat-btn");
    if (voiceChatBtn) {
        voiceChatBtn.textContent = "🎤";
        voiceChatBtn.classList.remove("listening");
    }
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

// STS button
const stsButton = document.getElementById("sts-btn");
if (stsButton) {
    stsButton.innerHTML = "🤖";
    stsButton.title = "Use Voice Mode 🤖";
    stsButton.addEventListener("click", handleStsButtonClick);
}

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
        stsButton.innerHTML = "Start Talking";
        stsButton.title = "Click to start/stop recording";
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        mediaRecorder.onstop = processRecording;
        audioChunks = [];
        mediaRecorder.start(100);
        isRecording = true;
        console.log("Recording started successfully");
    } catch (error) {
        console.error("Failed to start recording:", error);
        isRecording = false;
        stsButton.innerHTML = "🤖";
        stsButton.title = "Use Voice Mode 🤖";
        stsButton.disabled = false;
        const errorMsg = document.createElement("p");
        errorMsg.className = "message system-message";
        errorMsg.textContent = "Unable to access microphone. Please check your permissions and try again.";
        document.getElementById("chat-box")?.appendChild(errorMsg);
    }
}

function stopRecordingProcess() {
    console.log("Stopping recording process");
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    } else {
        resetUI();
    }
}

function resetUI() {
    console.log("Resetting UI");
    isRecording = false;
    stsButton.innerHTML = "🤖";
    stsButton.title = "Use Voice Mode 🤖";
    stsButton.disabled = false;
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    mediaRecorder = null;
}

async function processRecording() {
    const spinner = document.getElementById("spinner");
    console.log("Processing recording");
    try {
        const audioBlob = new Blob(audioChunks);
        const formData = new FormData();
        formData.append('audio', audioBlob, 'input.webm');
        if (window.currentSessionId) {
            formData.append('session_id', window.currentSessionId);
        }
        spinner.style.display = "block";
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const placeholderMsg = document.createElement("p");
            placeholderMsg.className = "message user-message";
            placeholderMsg.id = "temp-user-message";
            placeholderMsg.textContent = "Processing your audio...";
            document.getElementById("chat-box")?.appendChild(placeholderMsg);
            showThinkingIndicator();
        }
        const response = await fetch('http://localhost:5001/api/v1/sts', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        const data = await response.json();
        hideThinkingIndicator();
        spinner.style.display = "none";
        const tempUserMsg = document.getElementById("temp-user-message");
        if (tempUserMsg) {
            tempUserMsg.textContent = data.user_text;
            tempUserMsg.id = "";
        } else {
            const userMsg = document.createElement("p");
            userMsg.className = "message user-message";
            userMsg.textContent = data.user_text;
            document.getElementById("chat-box")?.appendChild(userMsg);
        }
        const container = document.createElement("div");
        container.className = "bot-message-container";
        const botMsg = document.createElement("p");
        botMsg.className = "message bot-message";
        botMsg.textContent = data.bot_text;
        const speakButton = document.createElement("button");
        speakButton.className = "speak-btn";
        speakButton.innerHTML = "🔊";
        speakButton.onclick = () => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
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
        };
        container.appendChild(botMsg);
        container.appendChild(speakButton);
        document.getElementById("chat-box")?.appendChild(container);
        document.getElementById("chat-box").scrollTop = document.getElementById("chat-box").scrollHeight;
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
    } catch (error) {
        spinner.style.display = "none";
        hideThinkingIndicator();
        console.error("Error processing speech-to-speech:", error);
        const tempUserMsg = document.getElementById("temp-user-message");
        if (tempUserMsg) {
            tempUserMsg.remove();
        }
        const errorMsg = document.createElement("p");
        errorMsg.className = "message system-message";
        errorMsg.textContent = "Sorry, there was an error processing your speech. Please try again.";
        document.getElementById("chat-box")?.appendChild(errorMsg);
    } finally {
        resetUI();
    }
}

function sendMessage() {
    let userInputField = document.getElementById("user-input");
    let userInput = userInputField.value.trim();
    if (userInput === "") return;

    let chatBox = document.getElementById("chat-box");
    let spinner = document.getElementById("spinner");

    chatBox.innerHTML += `<p class="message user-message">${userInput}</p>`;
    userInputField.value = "";

    spinner.style.display = "block";
    let startTime = performance.now();
    let elapsed = 0;
    spinner.textContent = "⏳ Typing...";
    let timerInterval = setInterval(() => {
        elapsed = (performance.now() - startTime) / 1000;
        spinner.textContent = `⏳ Typing... ${elapsed.toFixed(1)}s`;
    }, 100);

    chatBox.scrollTop = chatBox.scrollHeight;

    const formData = new URLSearchParams({
        "user_input": userInput,
        "session_id": window.currentSessionId,
        "language": selectedLanguage
    });

    fetch("http://localhost:5001/api/v1/chat", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    })
        .then(response => {
            if (!response.body) throw new Error("ReadableStream not supported.");
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let container = document.createElement("div");
            container.className = "bot-message-container";

            let botMsg = document.createElement("p");
            botMsg.className = "message bot-message";
            botMsg.textContent = "";

            let speakButton = document.createElement("button");
            speakButton.className = "speak-btn";
            speakButton.innerHTML = "🔊";
            speakButton.onclick = () => {
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                fetch("http://localhost:5001/api/v1/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: botMsg.textContent, language: selectedLanguage })
                })
                    .then(res => res.blob())
                    .then(blob => {
                        const audioUrl = URL.createObjectURL(blob);
                        currentAudio = new Audio(audioUrl);
                        currentAudio.play();
                        currentAudio.onended = function() {
                            URL.revokeObjectURL(audioUrl);
                        };
                    })
                    .catch(err => console.error("TTS error:", err));
            };

            container.appendChild(botMsg);
            container.appendChild(speakButton);
            chatBox.appendChild(container);

            function readChunk() {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        clearInterval(timerInterval);
                        const finalTime = (performance.now() - startTime) / 1000;
                        spinner.textContent = `🕒 Responded in ${finalTime.toFixed(1)}s`;
                        setTimeout(() => {
                            spinner.style.display = "none";
                            spinner.textContent = "";
                        }, 2000);
                        chatBox.scrollTop = chatBox.scrollHeight;
                        return;
                    }
                    const chunk = decoder.decode(value);
                    botMsg.textContent += chunk;
                    return readChunk();
                });
            }

            return readChunk();
        })
        .catch(error => {
            console.error("Error:", error);
            clearInterval(timerInterval);
            spinner.style.display = "none";
            chatBox.innerHTML += `<p class="message bot-message">Something went wrong. Try again!</p>`;
        });
}

function detectDutchLanguage(text) {
    const dutchWords = ['de', 'het', 'een', 'ik', 'jij', 'hij', 'zij', 'wij', 'jullie',
                        'en', 'of', 'maar', 'want', 'dus', 'omdat', 'als', 'dan',
                        'hallo', 'goedemorgen', 'goedemiddag', 'goedenavond', 'doei'];
    const words = text.toLowerCase().split(/\s+/);
    let dutchWordCount = 0;
    for (const word of words) {
        if (dutchWords.includes(word)) {
            dutchWordCount++;
        }
    }
    return dutchWordCount / words.length > 0.1;
}

function addMessageToChat(type, text) {
    const messageDiv = document.createElement("p");
    messageDiv.className = `message ${type}-message`;
    messageDiv.innerText = text;
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function showThinkingIndicator() {
    hideThinkingIndicator();
    const thinkingDiv = document.createElement("div");
    thinkingDiv.id = "thinking-indicator";
    thinkingDiv.className = "message bot-message thinking";
    thinkingDiv.innerHTML = "<div class='thinking-dots'><span>.</span><span>.</span><span>.</span></div>";
    const chatContainer = document.querySelector(".chat-container");
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

function submitFeedback() {
    const commentBox = document.getElementById("feedback-comment");
    const comment = commentBox ? commentBox.value : "";
    const messageDiv = document.getElementById("feedback-message");

    if (!selectedRating) {
        if (messageDiv) {
            messageDiv.innerText = "Please select a rating before submitting.";
            messageDiv.style.color = "red";
        }
        return;
    }

    const formData = new URLSearchParams({
        "session_id": window.currentSessionId,
        "rating": selectedRating,
        "comment": comment
    });

    fetch("http://localhost:5001/api/v1/feedback", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    })
        .then(res => res.json())
        .then(data => {
            if (messageDiv) {
                messageDiv.innerText = data.message;
                messageDiv.style.color = "green";
            }
            if (commentBox) commentBox.disabled = true;
            const editFeedbackBtn = document.getElementById("edit-feedback-btn");
            if (editFeedbackBtn) editFeedbackBtn.style.display = "block";
        })
        .catch(() => {
            if (messageDiv) {
                messageDiv.innerText = "Feedback failed to submit. Try again later.";
                messageDiv.style.color = "red";
            }
        });
}

function loadMessageHistory() {
    fetch(`http://localhost:5001/api/v1/history?session_id=${window.currentSessionId}`)
        .then(res => res.json())
        .then(data => {
            const chatBox = document.getElementById("chat-box");
            if (!chatBox) return;
            data.messages.forEach(msg => {
                const p = document.createElement("p");
                p.className = "message";
                if (msg.type === "user") {
                    p.classList.add("user-message");
                    p.textContent = msg.content;
                } else if (msg.type === "bot") {
                    p.classList.add("bot-message");
                    if (msg.content) {
                        const container = document.createElement("div");
                        container.className = "bot-message-container";
                        p.className = "message bot-message";
                        p.textContent = msg.content;
                        const speakButton = document.createElement("button");
                        speakButton.className = "speak-btn";
                        speakButton.innerHTML = "🔊";
                        speakButton.onclick = () => {
                            if (currentAudio) {
                                currentAudio.pause();
                                currentAudio.currentTime = 0;
                            }
                            fetch("http://localhost:5001/api/v1/tts", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ text: msg.content })
                            })
                            .then(res => res.blob())
                            .then(blob => {
                                const audioUrl = URL.createObjectURL(blob);
                                currentAudio = new Audio(audioUrl);
                                currentAudio.play();
                                currentAudio.onended = function() {
                                    URL.revokeObjectURL(audioUrl);
                                };
                            })
                            .catch(err => console.error("TTS error:", err));
                        };
                        container.appendChild(p);
                        container.appendChild(speakButton);
                        chatBox.appendChild(container);
                        return;
                    }
                } else {
                    p.classList.add("system-message");
                    p.textContent = msg.content;
                }
                chatBox.appendChild(p);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        });
}

function selectSmiley(rating) {
    selectedRating = rating;
    const smileys = document.querySelectorAll(".smiley-row span");
    smileys.forEach((el, idx) => {
        el.classList.toggle("selected", idx + 1 === rating);
    });
}

function hideFeedback() {
    const feedbackContainer = document.getElementById("feedback-container");
    const showFeedbackBtn = document.getElementById("show-feedback-btn");
    if (feedbackContainer) feedbackContainer.style.display = "none";
    if (showFeedbackBtn) showFeedbackBtn.style.display = "block";
}

function showFeedback() {
    const feedbackContainer = document.getElementById("feedback-container");
    const showFeedbackBtn = document.getElementById("show-feedback-btn");
    if (feedbackContainer) feedbackContainer.style.display = "block";
    if (showFeedbackBtn) showFeedbackBtn.style.display = "none";
}

function showPolicy(event) {
    event.preventDefault();
    const dropdownContent = document.getElementById("dropdown-content");
    const dropdownContainer = document.getElementById("dropdown-content-container");
    if (dropdownContent) {
        dropdownContent.innerHTML = `
            <p>By using this website, you agree to use it for lawful purposes only and in a way that does not infringe on the rights of others. We reserve the right to modify content, suspend access, or terminate services without prior notice. All content on this site is owned or licensed by us. You may not reproduce or redistribute it without permission. Use of this site is at your own risk. We are not liable for any damages resulting from its use.</p>
        `;
    }
    if (dropdownContainer) dropdownContainer.style.display = "block";
}

function showTerms(event) {
    event.preventDefault();
    const dropdownContent = document.getElementById("dropdown-content");
    const dropdownContainer = document.getElementById("dropdown-content-container");
    if (dropdownContent) {
        dropdownContent.innerHTML = `
            <p>If you choose to withdraw your consent, we’ll delete all associated data from our systems. This means we won’t be able to provide you with a personalized experience or retain any preferences you’ve set.</p>
        `;
    }
    if (dropdownContainer) dropdownContainer.style.display = "block";
}

function showManageData(event) {
    event.preventDefault();
    const dropdownContent = document.getElementById("dropdown-content");
    const dropdownContainer = document.getElementById("dropdown-content-container");
    if (dropdownContent) {
        dropdownContent.innerHTML = `
            <p>We collect and use limited personal data (like cookies and usage statistics) to improve your experience, personalize content, and analyze our traffic. This may include sharing data with trusted analytics providers. We do not sell your data. You can withdraw your consent at any time, and we will delete your data from our systems upon request.</p>
            <button class="withdraw-btn" id="withdraw-btn">Withdraw Consent</button>
        `;
    }
    if (dropdownContainer) dropdownContainer.style.display = "block";
    const withdrawBtn = document.getElementById("withdraw-btn");
    if (withdrawBtn && window.handleWithdrawConsent) {
        withdrawBtn.addEventListener("click", window.handleWithdrawConsent);
    }
}

function hideDropdown() {
    const dropdownContainer = document.getElementById("dropdown-content");
    const dropdownContent = document.getElementById("dropdown-content");
    if (dropdownContainer) {
        dropdownContainer.style.display = "none";
    }
    if (dropdownContent) {
        dropdownContent.innerHTML = "";
    }
}

function enableEditMode() {
    const feedbackComment = document.getElementById("feedback-comment");
    const message = document.getElementById("feedback-message");
    if (feedbackComment) {
        feedbackComment.disabled = false;
    }
    if (message) {
        message.innerText = "You can now edit your comment. Submit again to update it.";
        message.style.color = "blue";
    }
}

function initializeLanguageButtons() {
    const engBtn = document.getElementById('eng-btn');
    const nlBtn = document.getElementById('nl-btn');
    let previousLanguage = "nl-NL";
    if (nlBtn) {
        nlBtn.classList.add('active');
        nlBtn.classList.remove('inactive');
    }
    if (engBtn) {
        engBtn.classList.add('inactive');
        engBtn.classList.remove('active');
    }
    selectedLanguage = "nl-NL";
    console.log("Initial language set to: selectedLanguage");
    if (engBtn) {
        engBtn.addEventListener('click', () => {
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
    }
    if (nlBtn) {
        nlBtn.addEventListener('click', () => {
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
}

function notifyLanguageChange(fromLang, toLang) {
    const formData = new URLSearchParams({
        "session_id": window.currentSessionId,
        "from_language": fromLang,
        "to_language": toLang
    });
    fetch("http://localhost:5001/api/v1/language_change", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    })
        .then(response => response.json())
        .then(data => {
            const chatBox = document.getElementById("chat-box");
            if (chatBox) {
                chatBox.innerHTML += `<p class="message system-message" style="font-size: 0.8em; color: #999;">Language switched to ${toLang === "nl-NL" ? "Dutch" : "English"}></p>`;
            }
        });
}

window.initializeChatbot = initializeChatbot;

if (window._chatbotScriptLoadedListeners) {
    window.dispatchEvent(new CustomEvent('chatbotScriptLoaded', {
        detail: { initializeChatbot: initializeChatbot }
    }));
} else {
    window._chatbotShouldDispatchLoadedEvent = true;
}

function initializeChatbot() {
    console.log('Initializing chatbot...');

    const toggleButton = document.getElementById('chatbox-toggle');
    const chatboxInner = document.getElementById('chatbox-inner');

    if (toggleButton && chatboxInner) {
        const newToggleButton = toggleButton.cloneNode(true);
        toggleButton.parentNode.replaceChild(newToggleButton, toggleButton);

        const freshToggle = document.getElementById('chatbox-toggle');
        const freshChatbox = document.getElementById('chatbox-inner');

        freshToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            freshChatbox.classList.toggle('chatbox-hidden');

            const icon = freshToggle.querySelector('#toggle-icon');
            if (icon) {
                icon.textContent = freshChatbox.classList.contains('chatbox-hidden') ? '+' : '−';
            }

            console.log('Chatbox visibility toggled:',
                freshChatbox.classList.contains('chatbox-hidden') ? 'hidden' : 'visible');
        });

        console.log('Toggle functionality initialized');
    }

    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
        chatBox.innerHTML += '<p class="message bot-message">Welcome to Bravur AI Chatbot! How can I help you today?</p>';
    }
}

window.initializeChatbot = initializeChatbot;

window.dispatchEvent(new CustomEvent('chatbotScriptLoaded', {
    detail: { initializeChatbot: initializeChatbot }
}));

document.addEventListener('DOMContentLoaded', function() {
    if (typeof initializeChatbot === 'function') {
        initializeChatbot();
    } else {
        console.error('initializeChatbot function not found');
    }
});