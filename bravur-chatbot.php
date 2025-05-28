<?php
/*
Plugin Name: Bravur AI Chatbot
Description: Complete WordPress chatbot plugin with full GDPR, feedback, and voice features
Version: 2.1.0
Author: Bravur Team
*/

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class BravurChatbotPlugin {
    private $api_base_url;

    public function __construct() {
        // Change this to your Python API URL
        $this->api_base_url = 'http://localhost:5000/api/v1';
        
        add_action('wp_footer', array($this, 'add_chatbot_widget'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_chatbot_assets'));
    }

    public function enqueue_chatbot_assets() {
        // Enqueue custom CSS
        wp_add_inline_style('wp-block-library', $this->get_chatbot_css());
    }

    public function add_chatbot_widget() {
        $api_url = $this->api_base_url;
        ?>
        <!-- Bravur Chatbot Widget -->
        <div id="bravur-chatbot-widget">
            <div id="chatbot-toggle-btn">
                <span id="toggle-icon">💬</span>
            </div>
            
            <div id="chatbot-container" class="chatbot-hidden">
                <div class="chat-container">
                    <h1>Bravur AI Chatbot</h1>
                    
                    <div class="language-toggle-container">
                        <div class="language-toggle">
                            <button id="eng-btn" class="language-btn active" data-lang="en-US">ENG</button>
                            <button id="nl-btn" class="language-btn inactive" data-lang="nl-NL">NL</button>
                        </div>
                    </div>

                    <div id="chat-box" class="chat-box"></div>
                    <div class="spinner" id="spinner" style="display: none;">
                        <div class="typing-indicator">AI is typing...</div>
                    </div>

                    <!-- Consent Chat Bubble -->
                    <div id="consent-bubble" class="consent-bubble" style="display: none;">
                        <div class="consent-message">
                            <p>We use cookies and collect data to improve your experience. Please accept to continue using the chatbot.</p>
                            <button id="accept-consent-btn" class="accept-consent-btn">Accept</button>
                        </div>
                    </div>

                    <div class="input-container">
                        <button id="sts-btn" title="Use Voice Mode 🤖">🤖</button>
                        <button id="voice-chat-btn" title="Dictate 🎤">🎤</button>
                        <input type="text" id="user-input" placeholder="Type your question...">
                        <button id="send-btn">Send</button>
                    </div>

                    <div class="session-info">
                        Session ID: <span id="session-id">Loading...</span>
                    </div>

                    <div class="consent-status" id="consent-status"></div>

                    <div class="show-feedback-btn" id="show-feedback-btn" style="display: none;">
                        <button onclick="showFeedback()">Give Feedback</button>
                    </div>

                    <div class="feedback-container" id="feedback-container" style="display: none;">
                        <h3>Rate your experience</h3>
                        <div class="smiley-row" id="smiley-row">
                            <span onclick="selectSmiley(1)">😠</span>
                            <span onclick="selectSmiley(2)">😕</span>
                            <span onclick="selectSmiley(3)">😐</span>
                            <span onclick="selectSmiley(4)">🙂</span>
                            <span onclick="selectSmiley(5)">😍</span>
                        </div>
                        <textarea id="feedback-comment" rows="3" placeholder="Optional comment..."></textarea>
                        <div class="feedback-actions">
                            <button onclick="submitFeedback()">Submit Feedback</button>
                            <button onclick="hideFeedback()" style="background:#ccc;color:#000;">Hide</button>
                        </div>
                        <div id="edit-feedback-btn" style="margin-top: 10px; display: none;">
                            <button class="edit-feedback" onclick="enableEditMode()">Edit Feedback</button>
                        </div>
                        <div id="feedback-message" class="feedback-message"></div>
                    </div>

                    <div class="chat-footer">
                        <div class="footer-left">
                            <a href="#" id="privacy-policy-link" onclick="showPolicy(event)">Privacy Policy</a>
                            <a href="#" id="terms-link" onclick="showTerms(event)">Terms of Use</a>
                            <a href="#" id="manage-data-link" onclick="showManageData(event)">Manage My Data</a>
                        </div>
                    </div>

                    <div class="dropdown-content-container" id="dropdown-content-container" style="display: none;">
                        <div class="dropdown-content" id="dropdown-content"></div>
                        <div class="footer-actions">
                            <button onclick="hideDropdown()">Hide</button>
                            <button id="withdraw-btn" class="withdraw-btn" onclick="handleWithdrawConsent()">Withdraw Consent</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
        (function() {
            const apiUrl = '<?php echo esc_js($api_url); ?>';
            let sessionId = null;
            let currentLanguage = 'nl-NL'; // Default to Dutch like your original
            let consentGiven = false;
            let selectedRating = null;
            let feedbackSubmitted = false;

            // Initialize chatbot
            function initChatbot() {
                setupToggleButton();
                setupChatInterface();
                setupLanguageButtons();
                setupVoiceButtons();
                createSessionAndCheckConsent();
            }

            function setupToggleButton() {
                const toggleBtn = document.getElementById('chatbot-toggle-btn');
                const container = document.getElementById('chatbot-container');
                
                if (toggleBtn && container) {
                    toggleBtn.addEventListener('click', function() {
                        container.classList.toggle('chatbot-hidden');
                        const icon = document.getElementById('toggle-icon');
                        if (icon) {
                            icon.textContent = container.classList.contains('chatbot-hidden') ? '💬' : '×';
                        }
                    });
                }
            }

            function setupChatInterface() {
                const sendBtn = document.getElementById('send-btn');
                const userInput = document.getElementById('user-input');

                if (sendBtn) {
                    sendBtn.addEventListener('click', sendMessage);
                }

                if (userInput) {
                    userInput.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            sendMessage();
                        }
                    });
                }

                // Initially disable chat
                disableChat();
            }

            function setupLanguageButtons() {
                const engBtn = document.getElementById('eng-btn');
                const nlBtn = document.getElementById('nl-btn');

                if (engBtn) {
                    engBtn.addEventListener('click', function() {
                        switchLanguage('en-US', engBtn, nlBtn);
                    });
                }

                if (nlBtn) {
                    nlBtn.addEventListener('click', function() {
                        switchLanguage('nl-NL', nlBtn, engBtn);
                    });
                }
            }

            function switchLanguage(newLang, activeBtn, inactiveBtn) {
                const fromLanguage = currentLanguage;
                currentLanguage = newLang;
                
                activeBtn.classList.add('active');
                activeBtn.classList.remove('inactive');
                inactiveBtn.classList.add('inactive');
                inactiveBtn.classList.remove('active');
                
                handleLanguageChange(fromLanguage, newLang);
            }

            function setupVoiceButtons() {
                const voiceBtn = document.getElementById('voice-chat-btn');
                const stsBtn = document.getElementById('sts-btn');

                if (voiceBtn) {
                    voiceBtn.addEventListener('click', handleVoiceInput);
                }

                if (stsBtn) {
                    stsBtn.addEventListener('click', handleSpeechToSpeech);
                }
            }

            async function createSessionAndCheckConsent() {
                try {
                    const response = await fetch(`${apiUrl}/session/create`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        sessionId = data.session_id;
                        document.getElementById('session-id').textContent = sessionId;
                        console.log('Session created:', sessionId);
                        
                        // Check consent status
                        checkConsentStatus();
                    }
                } catch (error) {
                    console.error('Error creating session:', error);
                    document.getElementById('session-id').textContent = 'Error creating session';
                }
            }

            async function checkConsentStatus() {
                if (!sessionId) return;

                try {
                    const response = await fetch(`${apiUrl}/consent/check/${sessionId}`);
                    const data = await response.json();
                    
                    console.log("Consent check response:", data);

                    if (data.can_proceed) {
                        enableChat();
                        consentGiven = true;
                        console.log("Consent found, chat enabled");
                        addSystemMessage("Welcome! I'm your AI assistant. How can I help you today?");
                    } else {
                        showConsentBubble();
                        console.log("No consent found, showing consent bubble");
                    }
                } catch (error) {
                    console.error("Error checking consent:", error);
                }
            }

            function showConsentBubble() {
                const consentBubble = document.getElementById('consent-bubble');
                const acceptBtn = document.getElementById('accept-consent-btn');

                if (consentBubble) {
                    consentBubble.style.display = 'block';
                }

                if (acceptBtn) {
                    acceptBtn.addEventListener('click', handleAcceptConsent);
                }
            }

            async function handleAcceptConsent() {
                if (!sessionId) {
                    addSystemMessage("No session ID available. Please refresh the page.");
                    return;
                }

                try {
                    const response = await fetch(`${apiUrl}/consent/accept`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            session_id: sessionId
                        })
                    });

                    const data = await response.json();
                    console.log("Accept consent response:", data);

                    if (data.success) {
                        const consentBubble = document.getElementById('consent-bubble');
                        if (consentBubble) {
                            consentBubble.style.display = 'none';
                        }
                        enableChat();
                        consentGiven = true;
                        addSystemMessage("Thank you! Chat is now enabled. How can I help you today?");
                    } else {
                        addSystemMessage(data.error || "Failed to accept consent");
                    }
                } catch (error) {
                    console.error("Error accepting consent:", error);
                    addSystemMessage("Error accepting consent. Please try again.");
                }
            }

            function enableChat() {
                const inputContainer = document.querySelector('.input-container');
                if (inputContainer) {
                    inputContainer.style.pointerEvents = 'auto';
                    inputContainer.style.opacity = '1';
                    console.log("Chat enabled");
                }
            }

            function disableChat() {
                const inputContainer = document.querySelector('.input-container');
                if (inputContainer) {
                    inputContainer.style.pointerEvents = 'none';
                    inputContainer.style.opacity = '0.5';
                    console.log("Chat disabled");
                }
            }

            async function sendMessage() {
                const userInput = document.getElementById('user-input');
                const message = userInput.value.trim();
                
                if (!message || !consentGiven) return;

                addMessage(message, 'user');
                userInput.value = '';
                
                showSpinner();

                try {
                    const response = await fetch(`${apiUrl}/chat`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: message,
                            session_id: sessionId,
                            language: currentLanguage
                        })
                    });

                    hideSpinner();

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    addMessage(data.response || 'Sorry, I couldn\'t process your message.', 'bot');
                    
                    // Show feedback option after AI response
                    if (!feedbackSubmitted) {
                        document.getElementById('show-feedback-btn').style.display = 'block';
                    }
                    
                } catch (error) {
                    hideSpinner();
                    console.error('Error sending message:', error);
                    addMessage('Sorry, there was an error processing your message.', 'bot');
                }
            }

            async function handleLanguageChange(fromLanguage, toLanguage) {
                if (!sessionId) return;

                try {
                    const formData = new FormData();
                    formData.append('session_id', sessionId);
                    formData.append('language', toLanguage);
                    formData.append('from_language', fromLanguage);
                    formData.append('to_language', toLanguage);

                    await fetch(`${apiUrl}/language_change`, {
                        method: 'POST',
                        body: formData
                    });

                    const langName = toLanguage === 'nl-NL' ? 'Dutch' : 'English';
                    addSystemMessage(`Language changed to ${langName}`);
                } catch (error) {
                    console.error('Error changing language:', error);
                }
            }

            async function handleVoiceInput() {
                if (!consentGiven) return;

                const voiceBtn = document.getElementById('voice-chat-btn');
                voiceBtn.classList.add('listening');
                voiceBtn.disabled = true;

                try {
                    const response = await fetch(`${apiUrl}/stt`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            language: currentLanguage
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.text) {
                            document.getElementById('user-input').value = data.text;
                        }
                    }
                } catch (error) {
                    console.error('Error with voice input:', error);
                } finally {
                    voiceBtn.classList.remove('listening');
                    voiceBtn.disabled = false;
                }
            }

            async function handleSpeechToSpeech() {
                if (!consentGiven) return;

                const stsBtn = document.getElementById('sts-btn');
                stsBtn.classList.add('listening');
                stsBtn.disabled = true;

                try {
                    const formData = new FormData();
                    formData.append('language', currentLanguage);
                    formData.append('session_id', sessionId);

                    const response = await fetch(`${apiUrl}/sts`, {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.user_text) {
                            addMessage(data.user_text, 'user');
                        }
                        if (data.bot_text) {
                            addMessage(data.bot_text, 'bot');
                        }
                        if (data.audio_base64) {
                            playAudioFromBase64(data.audio_base64);
                        }
                    }
                } catch (error) {
                    console.error('Error with speech-to-speech:', error);
                } finally {
                    stsBtn.classList.remove('listening');
                    stsBtn.disabled = false;
                }
            }

            function playAudioFromBase64(audioBase64) {
                try {
                    const audioBlob = new Blob([Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))], { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);
                    audio.play();
                } catch (error) {
                    console.error('Error playing audio:', error);
                }
            }

            function addMessage(message, type) {
                const chatBox = document.getElementById('chat-box');
                if (!chatBox) return;

                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${type}-message`;
                messageDiv.textContent = message;
                
                chatBox.appendChild(messageDiv);
                chatBox.scrollTop = chatBox.scrollHeight;
            }

            function addSystemMessage(text) {
                const chatBox = document.getElementById('chat-box');
                if (!chatBox) return;

                const messageEl = document.createElement('div');
                messageEl.className = 'message system-message';
                messageEl.textContent = text;
                chatBox.appendChild(messageEl);
                chatBox.scrollTop = chatBox.scrollHeight;
                console.log("System message added:", text);
            }

            function showSpinner() {
                const spinner = document.getElementById('spinner');
                if (spinner) spinner.style.display = 'block';
            }

            function hideSpinner() {
                const spinner = document.getElementById('spinner');
                if (spinner) spinner.style.display = 'none';
            }

            // Feedback functions
            window.selectSmiley = function(rating) {
                selectedRating = rating;
                const smileys = document.querySelectorAll('.smiley-row span');
                smileys.forEach((smiley, index) => {
                    if (index + 1 === rating) {
                        smiley.classList.add('selected');
                    } else {
                        smiley.classList.remove('selected');
                    }
                });
            };

            window.showFeedback = function() {
                document.getElementById('feedback-container').style.display = 'block';
                document.getElementById('show-feedback-btn').style.display = 'none';
            };

            window.hideFeedback = function() {
                document.getElementById('feedback-container').style.display = 'none';
                if (!feedbackSubmitted) {
                    document.getElementById('show-feedback-btn').style.display = 'block';
                }
            };

            window.enableEditMode = function() {
                document.getElementById('feedback-container').style.display = 'block';
                document.getElementById('edit-feedback-btn').style.display = 'none';
            };

            window.submitFeedback = async function() {
                if (!selectedRating) {
                    alert('Please select a rating before submitting.');
                    return;
                }

                const comment = document.getElementById('feedback-comment').value;

                try {
                    const formData = new FormData();
                    formData.append('session_id', sessionId);
                    formData.append('rating', selectedRating);
                    formData.append('comment', comment);

                    const response = await fetch(`${apiUrl}/feedback`, {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        document.getElementById('feedback-message').textContent = data.message || 'Thank you for your feedback!';
                        document.getElementById('feedback-container').style.display = 'none';
                        document.getElementById('show-feedback-btn').style.display = 'none';
                        document.getElementById('edit-feedback-btn').style.display = 'block';
                        feedbackSubmitted = true;
                    }
                } catch (error) {
                    console.error('Error submitting feedback:', error);
                    document.getElementById('feedback-message').textContent = 'Error submitting feedback. Please try again.';
                }
            };

            // GDPR/Policy functions
            window.showPolicy = function(e) {
                e.preventDefault();
                const content = `
                    <h3>Privacy Policy</h3>
                    <p>We collect and process your chat data to provide AI assistance. Your data is stored securely and used only for improving our service.</p>
                    <p>You can withdraw consent at any time, which will delete all your data.</p>
                `;
                showDropdown(content);
            };

            window.showTerms = function(e) {
                e.preventDefault();
                const content = `
                    <h3>Terms of Use</h3>
                    <p>By using this chatbot, you agree to our terms of service. Please use the service responsibly and respectfully.</p>
                    <p>The AI responses are generated automatically and may not always be accurate.</p>
                `;
                showDropdown(content);
            };

            window.showManageData = function(e) {
                e.preventDefault();
                const content = `
                    <h3>Manage Your Data</h3>
                    <p>Your current session: <strong>${sessionId}</strong></p>
                    <p>To delete your data and withdraw consent, click the "Withdraw Consent" button below.</p>
                    <p>This will permanently delete all your chat history and feedback.</p>
                `;
                showDropdown(content);
            };

            function showDropdown(content) {
                const container = document.getElementById('dropdown-content-container');
                const contentDiv = document.getElementById('dropdown-content');
                if (container && contentDiv) {
                    contentDiv.innerHTML = content;
                    container.style.display = 'block';
                }
            }

            window.hideDropdown = function() {
                const container = document.getElementById('dropdown-content-container');
                if (container) {
                    container.style.display = 'none';
                }
            };

            window.handleWithdrawConsent = async function() {
                if (!sessionId) {
                    addSystemMessage("No session ID available. Please refresh the page.");
                    return;
                }

                if (!confirm("Are you sure you want to withdraw consent? This will delete all your data and disable the chat.")) {
                    return;
                }

                try {
                    const response = await fetch(`${apiUrl}/consent/withdraw`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            session_id: sessionId
                        })
                    });

                    const data = await response.json();
                    console.log("Withdraw consent response:", data);

                    if (data.success) {
                        disableChat();
                        showConsentBubble();
                        consentGiven = false;
                        feedbackSubmitted = false;
                        
                        // Clear chat
                        const chatBox = document.getElementById('chat-box');
                        if (chatBox) {
                            chatBox.innerHTML = '';
                        }
                        
                        addSystemMessage("Consent withdrawn. Chat disabled and data deleted.");
                        hideDropdown();
                    } else {
                        addSystemMessage(data.error || "Failed to withdraw consent");
                    }
                } catch (error) {
                    console.error("Error withdrawing consent:", error);
                    addSystemMessage("Error withdrawing consent. Please try again.");
                }
            };

            // Initialize when DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initChatbot);
            } else {
                initChatbot();
            }
        })();
        </script>
        <?php
    }

    private function get_chatbot_css() {
        return '
        /* Bravur Chatbot Widget Styles */
        #bravur-chatbot-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            font-family: Arial, sans-serif;
        }

        #chatbot-toggle-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #007bff;
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 4px 12px rgba(0,123,255,0.3);
            transition: all 0.3s ease;
        }

        #chatbot-toggle-btn:hover {
            background: #0056b3;
            transform: scale(1.1);
        }

        #chatbot-container {
            position: absolute;
            bottom: 70px;
            right: 0;
            transition: all 0.3s ease;
        }

        #chatbot-container.chatbot-hidden {
            display: none;
        }

        .chat-container {
            width: 400px;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            max-height: 600px;
        }

        .chat-container h1 {
            text-align: center;
            background: #007bff;
            color: white;
            padding: 15px;
            margin: 0;
            font-size: 18px;
        }

        .language-toggle-container {
            position: relative;
        }

        .language-toggle {
            display: flex;
            justify-content: flex-end;
            gap: 5px;
            padding: 10px;
            margin-top: 5px;
        }

        .language-btn {
            border-radius: 15px;
            padding: 5px 10px;
            font-size: 12px;
            border: 1px solid #ddd;
            cursor: pointer;
            transition: all 0.2s;
            background-color: white;
        }

        .language-btn.active {
            background-color: #007bff;
            color: white;
            border-color: #007bff;
        }

        .language-btn.inactive {
            background-color: white;
            color: #333;
        }

        .chat-box {
            height: 300px;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: #fafafa;
        }

        .message {
            max-width: 80%;
            padding: 10px 15px;
            border-radius: 20px;
            word-wrap: break-word;
            font-size: 14px;
        }

        .user-message {
            align-self: flex-end;
            background: #007bff;
            color: white;
        }

        .bot-message {
            align-self: flex-start;
            background: #e0e0e0;
            color: black;
        }

        .system-message {
            align-self: center;
            background: #fff3cd;
            color: #856404;
            font-style: italic;
            max-width: 90%;
            text-align: center;
        }

        .spinner {
            text-align: center;
            padding: 10px;
            background: #fafafa;
        }

        .typing-indicator {
            color: #666;
            font-style: italic;
        }

        .consent-bubble {
            padding: 0 20px;
            background: #fafafa;
        }

        .consent-message {
            display: flex;
            background-color: #f0f0f0;
            border-radius: 10px;
            padding: 15px;
            flex-direction: column;
            justify-content: space-between;
        }

        .consent-message p {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 14px;
            line-height: 1.4;
        }

        .accept-consent-btn {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        .accept-consent-btn:hover {
            background-color: #0056b3;
        }

        .input-container {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px;
            background: white;
            border-top: 1px solid #ddd;
        }

        .input-container input {
            flex: 1;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 20px;
            outline: none;
            min-width: 100px;
        }

        .input-container button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 20px;
            cursor: pointer;
            transition: 0.3s;
            white-space: nowrap;
        }

        .input-container button:hover {
            background: #0056b3;
        }

        .input-container button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .listening {
            animation: pulse 1.5s infinite;
            background-color: #ff000080 !important;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }

        .session-info {
            text-align: center;
            font-size: 12px;
            padding: 5px;
            background: #f1f1f1;
            color: #333;
        }

        .feedback-container {
            padding: 10px;
            border-top: 1px solid #ddd;
            background: #fff;
            text-align: center;
        }

        .feedback-container h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
        }

        .smiley-row span {
            font-size: 24px;
            margin: 0 5px;
            cursor: pointer;
            transition: transform 0.2s ease;
        }

        .smiley-row span.selected {
            transform: scale(1.3);
            border: 2px solid #007bff;
            border-radius: 50%;
            padding: 2px;
        }

        .feedback-container textarea {
            margin-top: 10px;
            width: 90%;
            padding: 8px;
            border-radius: 10px;
            border: 1px solid #ccc;
            resize: none;
        }

        .feedback-actions {
            margin-top: 10px;
            display: flex;
            justify-content: center;
            gap: 10px;
        }

        .feedback-actions button {
            padding: 8px 16px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            background-color: #007bff;
            color: white;
        }

        .feedback-actions button:hover {
            background-color: #0056b3;
        }

        .show-feedback-btn {
            text-align: center;
            margin: 10px;
        }

        .show-feedback-btn button {
            padding: 8px 16px;
            border-radius: 10px;
            border: none;
            background-color: #888;
            color: white;
            cursor: pointer;
        }

        .show-feedback-btn button:hover {
            background-color: #666;
        }

        .edit-feedback {
            background-color: #28a745;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 10px;
            cursor: pointer;
        }

        .edit-feedback:hover {
            background-color: #218838;
        }

        .feedback-message {
            font-size: 14px;
            margin-top: 10px;
            color: #28a745;
        }

        .chat-footer {
            margin-top: 15px;
            padding: 15px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: center;
        }

        .footer-left {
            display: flex;
            gap: 20px;
        }

        .footer-left a {
            color: #666;
            text-decoration: none;
            font-size: 13px;
            transition: color 0.2s;
        }

        .footer-left a:hover {
            color: #333;
            text-decoration: underline;
        }

        .dropdown-content-container {
            padding: 10px;
            background: #fff;
            margin-top: 5px;
            text-align: left;
        }

        .dropdown-content p {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #333;
        }

        .dropdown-content h3 {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #007bff;
        }

        .footer-actions {
            text-align: center;
            margin-top: 15px;
            display: flex;
            justify-content: center;
            gap: 10px;
        }

        .footer-actions button {
            padding: 8px 16px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            background-color: #007bff;
            color: white;
        }

        .footer-actions button:hover {
            background-color: #0056b3;
        }

        .withdraw-btn {
            background-color: #dc3545 !important;
            color: #ffffff;
        }

        .withdraw-btn:hover {
            background-color: #c82333 !important;
            transform: scale(1.05);
        }

        @media (max-width: 768px) {
            .chat-container {
                width: 320px;
                max-height: 500px;
            }
            
            .chat-box {
                height: 250px;
            }
            
            .footer-left {
                flex-direction: column;
                align-items: center;
                gap: 10px;
            }
        }
        ';
    }
}

new BravurChatbotPlugin();