<?php
/*
Plugin Name: Bravur AI Chatbot
Description: Complete WordPress chatbot plugin with full GDPR, feedback, and voice features  
Version: 2.1.0
Author: Bravur Team
*/

if (!defined('ABSPATH')) exit;

class BravurChatbotPlugin {
    private $api_base_url;

    public function __construct() {
        $this->api_base_url = 'https://bravur-chatbot-api-bwepc9bna4fvg8fn.westeurope-01.azurewebsites.net/api/v1/ratelimit/captcha-solved';
        
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_footer', [$this, 'render_chatbot']);
        add_shortcode('bravur_chatbot', [$this, 'shortcode']);
        
        add_action('wp_ajax_bravur_api_proxy', [$this, 'handle_api_proxy']);
        add_action('wp_ajax_nopriv_bravur_api_proxy', [$this, 'handle_api_proxy']);
        
        // Add AJAX handlers for reCAPTCHA verification
        add_action('wp_ajax_bravur_verify_captcha', 'bravur_verify_captcha');
        add_action('wp_ajax_nopriv_bravur_verify_captcha', 'bravur_verify_captcha');
    }

    public function enqueue_assets() {
        if (is_admin()) return;
        
        // CSS
        wp_enqueue_style(
            'bravur-chatbot-css', 
            plugins_url('static/css/styles.css', __FILE__),
            [],
            $this->get_file_version('static/css/styles.css')
        );
        
        // Main Script JS
        wp_enqueue_script(
            'bravur-chatbot-script',
            plugins_url('static/js/script.js', __FILE__),
            ['jquery'],
            $this->get_file_version('static/js/script.js'),
            true
        );
        
        // Enqueue captcha.js after script.js
        wp_enqueue_script(
            'bravur-captcha',
            plugins_url('static/js/captcha.js', __FILE__),
            [],
            $this->get_file_version('static/js/captcha.js'),
            true
        );

        // Localize variables for JavaScript
        wp_localize_script('bravur-chatbot-script', 'bravurChatbot', [
            'api_url' => $this->api_base_url,
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('bravur_chatbot_nonce'),
            'session_id' => null, // Start with null, create when needed
            'plugin_url' => plugins_url('', __FILE__)
        ]);
        
        error_log('✅ Bravur Chatbot assets enqueued (no session created yet)');
    }

    public function render_chatbot() {
        if (is_admin()) return;
        echo $this->get_chatbot_html();
    }

    public function shortcode($atts) {
        $atts = shortcode_atts([
            'embedded' => 'false'
        ], $atts);
        
        return $this->get_chatbot_html($atts['embedded'] === 'true');
    }

    private function get_chatbot_html($embedded = false) {
        if ($embedded) {
            $template_file = plugin_dir_path(__FILE__) . 'static/templates/embedded.html';
        } else {
            $template_file = plugin_dir_path(__FILE__) . 'static/templates/index.html';
        }
        
        if (file_exists($template_file)) {
            $content = file_get_contents($template_file);
            
            // FIXED: Use placeholder that JavaScript will replace
            $content = str_replace('{{SESSION_ID}}', 'loading...', $content);
            $content = str_replace('Loading...', 'loading...', $content);
            
            return $content;
        }
        
        // Fallback HTML with placeholder
        return $this->get_fallback_html($embedded);
    }
    
    private function get_fallback_html($embedded = false) {
        $widget_class = $embedded ? 'bravur-chatbot-embedded' : 'bravur-chatbot-widget';
        
        return '
        <div class="' . $widget_class . '" id="bravur-chatbot-widget">
            <div id="chatbot-toggle-btn" style="' . ($embedded ? 'display:none;' : '') . '">
                <span id="toggle-icon">💬</span>
            </div>
            
            <div id="chatbot-container" class="' . ($embedded ? '' : 'chatbot-hidden') . '">
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
                        Session ID: <span id="session-id">loading...</span>
                    </div>

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
                        <div id="feedback-message" class="feedback-message"></div>
                    </div>

                    <div class="chat-footer">
                        <div class="footer-left">
                            <a href="#" onclick="showPolicy(event)">Privacy Policy</a>
                            <a href="#" onclick="showTerms(event)">Terms of Use</a>
                            <a href="#" onclick="showManageData(event)">Manage My Data</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>';
    }

    private function create_session_via_api() {
        error_log('🔄 Creating session via API...');
        
        $response = wp_remote_post($this->api_base_url . '/session/create', [
            'timeout' => 15,
            'headers' => [
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode([]),
            'sslverify' => false
        ]);
        
        if (is_wp_error($response)) {
            error_log('❌ Session creation failed: ' . $response->get_error_message());
            return null;
        }
        
        $response_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        error_log('📊 Session API Response Code: ' . $response_code);
        error_log('📄 Session API Response Body: ' . $body);
        
        if ($response_code === 200) {
            $data = json_decode($body, true);
            if ($data && isset($data['session_id'])) {
                error_log('✅ Session created: ' . $data['session_id']);
                return $data['session_id'];
            }
        }
        
        error_log('❌ Session creation failed');
        return null;
    }
    
    private function get_file_version($file_path) {
        $full_path = plugin_dir_path(__FILE__) . $file_path;
        if (file_exists($full_path)) {
            return filemtime($full_path);
        }
        return '2.1.0';
    }
    
    /**
     * Handle API proxy requests from JavaScript
     */
    public function handle_api_proxy() {
        error_log('🚀 Bravur API Proxy called');
        error_log('📡 POST data: ' . print_r($_POST, true));
        
        if (!wp_verify_nonce($_POST['nonce'], 'bravur_chatbot_nonce')) {
            error_log('❌ Nonce verification failed');
            wp_die('Security check failed');
        }
        
        $action = sanitize_text_field($_POST['api_action']);
        $data = $_POST['data'] ?? [];
        
        error_log('🎯 API Action: ' . $action);
        
        // Handle session creation separately
        if ($action === 'create_session') {
            $session_id = $this->create_session_via_api();
            if ($session_id) {
                wp_send_json_success(['session_id' => $session_id]);
            } else {
                wp_send_json_error(['message' => 'Failed to create session']);
            }
            return;
        }
        
        // Handle other API calls
        $endpoint = $this->get_api_endpoint($action);
        if (!$endpoint) {
            error_log('❌ Invalid API endpoint for action: ' . $action);
            wp_send_json_error(['message' => 'Invalid API action']);
            return;
        }
        
        $response = $this->make_api_call($endpoint, $data);
        
        if (is_wp_error($response)) {
            error_log('💥 WP Error: ' . $response->get_error_message());
            wp_send_json_error(['message' => 'API call failed: ' . $response->get_error_message()]);
        } else {
            $body = wp_remote_retrieve_body($response);
            $response_code = wp_remote_retrieve_response_code($response);
            
            error_log('📊 Response Code: ' . $response_code);
            
            $decoded = json_decode($body, true);
            
            if ($decoded) {
                wp_send_json_success($decoded);
            } else {
                error_log('❌ Failed to decode JSON response');
                wp_send_json_error(['message' => 'Invalid API response', 'raw_response' => $body]);
            }
        }
    }
    
    private function get_api_endpoint($action) {
        $endpoints = [
            'chat' => '/chat',
            'consent_check' => '/consent/check',
            'consent_accept' => '/consent/accept',
            'consent_withdraw' => '/consent/withdraw',
            'feedback' => '/feedback',
            'language_change' => '/language_change',
            'stt' => '/stt',
            'sts' => '/sts',
            'tts' => '/tts',
            'history' => '/history'
        ];
        
        return isset($endpoints[$action]) ? $endpoints[$action] : null;
    }
    
    /**
     * Make HTTP request to Python API
     */
    private function make_api_call($endpoint, $data) {
        $url = $this->api_base_url . $endpoint;
        
        $args = [
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress/Bravur-Chatbot-Plugin'
            ]
        ];
        
        if (in_array($endpoint, ['/chat', '/consent/accept', '/consent/withdraw', '/feedback'])) {
            $args['method'] = 'POST';
            $args['body'] = json_encode($data);
        } else if (strpos($endpoint, '/consent/check/') === 0) {
            $args['method'] = 'GET';
            $url = $this->api_base_url . '/consent/check/' . $data['session_id'];
        } else {
            $args['method'] = 'POST';
            $args['body'] = json_encode($data);
        }
        
        return wp_remote_request($url, $args);
    }
}

// Initialize the plugin
new BravurChatbotPlugin();

add_action('wp_ajax_nopriv_bravur_verify_captcha', 'bravur_verify_captcha');
add_action('wp_ajax_bravur_verify_captcha', 'bravur_verify_captcha');

function bravur_verify_captcha() {
    $secret = '6LfAUlsrAAAAADly6RZplT5H6pzmw78MmSac3q3q'; // your secret key
    $token = isset($_POST['recaptcha_token']) ? $_POST['recaptcha_token'] : '';
    $session_id = isset($_POST['session_id']) ? sanitize_text_field($_POST['session_id']) : '';

    if (!$token) {
        wp_send_json_error(['message' => 'Missing token']);
    }

    // Verify with Google
    $response = wp_remote_post('https://www.google.com/recaptcha/api/siteverify', [
        'body' => [
            'secret' => $secret,
            'response' => $token,
            'remoteip' => $_SERVER['REMOTE_ADDR']
        ]
    ]);
    $result = json_decode(wp_remote_retrieve_body($response), true);

    if (!empty($result['success'])) {
        // Notify Flask backend
        $flask_url = 'https://bravur-chatbot-api-bwepc9bna4fvg8fn.westeurope-01.azurewebsites.net/api/v1/ratelimit/captcha-solved';
        $flask_response = wp_remote_post($flask_url, [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode(['session_id' => $session_id])
        ]);
        wp_send_json_success(['message' => 'CAPTCHA verified']);
    } else {
        wp_send_json_error(['message' => 'CAPTCHA verification failed']);
    }
}