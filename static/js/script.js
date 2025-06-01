let selectedRating = null;
let recognition = null;
let isListening = false;
let currentAudio = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let selectedLanguage = "nl-NL";

// Highlight selected smiley and store the rating value
function selectSmiley(rating) {
  selectedRating = rating;
  const smileys = document.querySelectorAll(".smiley-row span");
  smileys.forEach((el, idx) => {
    el.classList.toggle("selected", idx + 1 === rating);
  });
}

function hideFeedback() {
  document.getElementById("feedback-container").style.display = "none";
  document.getElementById("show-feedback-btn").style.display = "block";
}

function showFeedback() {
  document.getElementById("feedback-container").style.display = "block";
  document.getElementById("show-feedback-btn").style.display = "none";
}
function showPolicy(event) {
  event.preventDefault();
    document.getElementById("dropdown-content").innerHTML = `
    <p>By using this website, you agree to use it for lawful purposes only and in a way that does not infringe on the rights of others. We reserve the right to modify content, suspend access, or terminate services without prior notice. All content on this site is owned or licensed by us. You may not reproduce or redistribute it without permission of this site is at your own risk. We are not liable for any damages resulting from its use.</p>
  `;
  document.getElementById("dropdown-content-container").style.display = "block";
}

function showTerms(event) {
  event.preventDefault();
    document.getElementById("dropdown-content").innerHTML = `
    <p>If you choose to withdraw your consent, we’ll delete all associated data from our systems. This means we won’t be able to provide you with a personalized experience or retain any preferences you’ve set.</p>
  `;
  document.getElementById("dropdown-content-container").style.display = "block";
}

function showManageData(event) {
  event.preventDefault();
    document.getElementById("dropdown-content").innerHTML = `
    <p>We collect and use limited personal data (like cookies and usage statistics) to improve your experience, personalize content, and analyze our traffic. This may include sharing data with trusted analytics providers. We do not sell your data. You can withdraw your consent at any time, and we will delete your data from our systems upon request.</p>
    <button class="withdraw-btn" id="withdraw-btn">Withdraw Consent</button>
  `;
  document.getElementById("dropdown-content-container").style.display = "block";

  const withdrawBtn = document.getElementById("withdraw-btn");

  if(withdrawBtn){
      withdrawBtn.addEventListener("click", window.handleWithdrawConsent);
  }
}

function hideDropdown() {
  document.getElementById("dropdown-content-container").style.display = "none";
  document.getElementById("dropdown-content").innerHTML = "";
}

function enableEditMode() {
  document.getElementById("feedback-comment").disabled = false;
  const message = document.getElementById("feedback-message");
  message.innerText = "You can now edit your comment. Submit again to update.";
  message.style.color = "blue";
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
    "session_id": currentSessionId,
      "language": selectedLanguage
  });

  fetch("/api/v1/chat", {
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
        // If there's already audio playing, stop it
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }

        // Detect if the text is likely Dutch
        const isLikelyDutch = detectDutchLanguage(botMsg.textContent);

        fetch("/api/v1/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: botMsg.textContent, language: selectedLanguage}),
        })
          .then(res => res.blob())
          .then(blob => {
            const audioUrl = URL.createObjectURL(blob);
            currentAudio = new Audio(audioUrl); // Assign to our global variable
            currentAudio.play();

            // Optional: clean up when audio finishes playing
            currentAudio.onended = function() {
              URL.revokeObjectURL(audioUrl); // Free up memory
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
      // This is a simple detection based on common Dutch words
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

         // If more than 10% of words are Dutch, consider it Dutch
         return dutchWordCount / words.length > 0.1;
}

function addMessageToChat(type, text) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}-message`;
    messageDiv.innerText = text;

    const chatContainer = document.querySelector(".chat-container");
    chatContainer.appendChild(messageDiv);

    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Helper function to show a thinking indicator
function showThinkingIndicator() {
    hideThinkingIndicator();

    const thinkingDiv = document.createElement("div");
    thinkingDiv.id = "thinking-indicator";
    thinkingDiv.className = "message bot-message thinking";
    thinkingDiv.innerHTML = "<div class='thinking-dots'><span>.</span><span>.</span><span>.</span></div>";

    const chatContainer = document.querySelector(".chat-container");
    chatContainer.appendChild(thinkingDiv);
}


function hideThinkingIndicator() {
    const thinkingDiv = document.getElementById("thinking-indicator");
    if (thinkingDiv) {
        thinkingDiv.remove();
    }
}

function submitFeedback() {
  const commentBox = document.getElementById("feedback-comment");
  const comment = commentBox.value;
  const messageDiv = document.getElementById("feedback-message");

  if (!selectedRating) {
    messageDiv.innerText = "Please select a rating before submitting.";
    messageDiv.style.color = "red";
    return;
  }

  const formData = new URLSearchParams({
    "session_id": currentSessionId,
    "rating": selectedRating,
    "comment": comment
  });

  fetch("/api/v1/feedback", {
    method: "POST",
    body: formData,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  })
    .then(res => res.json())
    .then(data => {
      messageDiv.innerText = data.message;
      messageDiv.style.color = "green";
      commentBox.disabled = true;
      document.getElementById("edit-feedback-btn").style.display = "block";
    })
    .catch(() => {
      messageDiv.innerText = "Feedback failed. Try again later.";
      messageDiv.style.color = "red";
    });
}

function loadMessageHistory() {
  fetch(`/api/v1/history?session_id=${currentSessionId}`)
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById("chat-box");
      data.messages.forEach(msg => {
        const p = document.createElement("p");
        p.className = "message";
        if (msg.type === "user") {
          p.classList.add("user-message");
        } else if (msg.type === "bot") {
          p.classList.add("bot-message");

          if (msg.content) {
            const container = document.createElement("div");
            container.className = "bot-message-container";

            p.className = "message bot-message";

            const speakButton = document.createElement("button");
            speakButton.className = "speak-btn";
            speakButton.innerHTML = "🔊";
            speakButton.onclick = () => {
              if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
              }

              fetch("/api/v1/tts", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ text: msg.content }),
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
        }

        if (msg.type !== "bot" || !msg.content) {
          chatBox.appendChild(p);
        }
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });
}

document.getElementById("voice-chat-btn").addEventListener("click", function() {
    if (isListening) {
        stopSpeechRecognition();
        return;
    }

    isListening = true;
    const voiceChatBtn = document.getElementById("voice-chat-btn");
    voiceChatBtn.textContent = "🎙️ Listening...";
    voiceChatBtn.classList.add("listening");

    console.log("Using language for speech recognition:", selectedLanguage);

     const languageToSend = selectedLanguage === "nl-NL" ? "nl-NL" : "en-US";

    fetch("/api/v1/stt", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            language: selectedLanguage
        })
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

function stopSpeechRecognition() {
    isListening = false;
    const voiceChatBtn = document.getElementById("voice-chat-btn");
    voiceChatBtn.textContent = "🎤";
    voiceChatBtn.classList.remove("listening");

    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
        }
    }
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

        stsButton.innerHTML = "Start Talking";
        stsButton.title = "Click to start/stop recording";

        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm'
        });

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
        document.getElementById("chat-box").appendChild(errorMsg);
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

        // Fixed: Remove 'window.' prefix and add debugging
        console.log("Current session ID:", currentSessionId);
        if (currentSessionId) {
            formData.append('session_id', currentSessionId);
            console.log("Session ID added to FormData:", currentSessionId);
        } else {
            console.error("WARNING: No session ID available!");
        }

        formData.append('language', selectedLanguage);
        console.log("Sending speech-to-speech request with language:", selectedLanguage);

        spinner.style.display = "block";

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const placeholderMsg = document.createElement("p");
            placeholderMsg.className = "message user-message";
            placeholderMsg.id = "temp-user-message";
            placeholderMsg.textContent = "Processing your audio...";
            document.getElementById("chat-box").appendChild(placeholderMsg);

            showThinkingIndicator();
        }

        const response = await fetch('/api/v1/sts', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
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
            document.getElementById("chat-box").appendChild(userMsg);
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
        document.getElementById("chat-box").appendChild(container);

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
        document.getElementById("chat-box").appendChild(errorMsg);
    } finally {
        resetUI();
    }
}

window.onload = function () {
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML += '<p class="message bot-message">Welcome to Bravur AI Chatbot! How can I help you today?</p>';
  
  document.getElementById("user-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  initializeLanguageButtons()

  console.log("Current Session ID:", currentSessionId);
  loadMessageHistory();

};

function initializeLanguageButtons() {
    const engBtn = document.getElementById('eng-btn');
    const nlBtn = document.getElementById('nl-btn');

    // Remember the previous language for changes
    let previousLanguage = "nl-NL"; // Initial default

    nlBtn.classList.add('active');
    nlBtn.classList.remove('inactive');
    engBtn.classList.add('inactive');
    engBtn.classList.remove('active');

    selectedLanguage = "nl-NL";
    console.log("Initial language set to:", selectedLanguage);

    engBtn.addEventListener('click', () => {
        if (!engBtn.classList.contains('active')) {
            // Check language BEFORE changing the active state and selectedLanguage
            if (selectedLanguage !== "en-US") {
                const oldLanguage = selectedLanguage;

                // Now update UI and selectedLanguage
                engBtn.classList.add('active');
                engBtn.classList.remove('inactive');
                nlBtn.classList.add('inactive');
                nlBtn.classList.remove('active');
                selectedLanguage = "en-US";

                // Notify about the change
                notifyLanguageChange(oldLanguage, "en-US");
                console.log("Language changed to English:", selectedLanguage);
            }
        }
    });

    nlBtn.addEventListener('click', () => {
        if (!nlBtn.classList.contains('active')) {
            // Check language BEFORE changing the active state and selectedLanguage
            if (selectedLanguage !== "nl-NL") {
                const oldLanguage = selectedLanguage;

                // Now update UI and selectedLanguage
                nlBtn.classList.add('active');
                nlBtn.classList.remove('inactive');
                engBtn.classList.add('inactive');
                engBtn.classList.remove('active');
                selectedLanguage = "nl-NL";

                // Notify about the change
                notifyLanguageChange(oldLanguage, "nl-NL");
                console.log("Language changed to Dutch:", selectedLanguage);
            }
        }
    });
}

function notifyLanguageChange(fromLang, toLang) {
    // Add a language change message to the conversation
    const formData = new URLSearchParams({
        "session_id": currentSessionId,
        "from_language": fromLang,
        "to_language": toLang
    });

    fetch("/api/v1/language_change", {
        method: "POST",
        body: formData,
        headers: {"Content-Type": "application/x-www-form-urlencoded"}
    })
    .then(response => response.json())
    .then(data => {
        const chatBox = document.getElementById("chat-box");
        chatBox.innerHTML += `<p class="message system-message" style="font-size: 0.8em; color: #999;">Language switched to ${toLang === "nl-NL" ? "Dutch" : "English"}</p>`;
    });
}

