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
        $this->api_base_url = 'http://localhost:5001/api/v1';
        
        // Try multiple hooks for asset loading
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_head', [$this, 'enqueue_assets']); // Backup hook
        add_action('init', [$this, 'enqueue_assets']); // Early hook
        
        // Try multiple hooks to ensure loading
        add_action('wp_footer', [$this, 'render_chatbot']);
        add_action('wp_head', [$this, 'add_early_chatbot']); // Backup hook
        add_action('init', [$this, 'force_chatbot_everywhere']); // Force hook
        
        add_shortcode('bravur_chatbot', [$this, 'shortcode']);
        
        // Add AJAX handlers for API proxy
        add_action('wp_ajax_bravur_api_proxy', [$this, 'handle_api_proxy']);
        add_action('wp_ajax_nopriv_bravur_api_proxy', [$this, 'handle_api_proxy']);
        
        // Add AJAX handlers for reCAPTCHA verification
        add_action('wp_ajax_bravur_verify_captcha', 'bravur_verify_captcha');
        add_action('wp_ajax_nopriv_bravur_verify_captcha', 'bravur_verify_captcha');
    }

    public function enqueue_assets() {
        // Only skip on admin pages
        if (is_admin()) return;
        
        // DEBUG: Log what type of page this is
        error_log('🏠 Bravur Chatbot Loading on: ' . $_SERVER['REQUEST_URI']);
        error_log('📍 is_front_page: ' . (is_front_page() ? 'YES' : 'NO'));
        error_log('📍 is_home: ' . (is_home() ? 'YES' : 'NO'));
        error_log('📍 is_page: ' . (is_page() ? 'YES' : 'NO'));
        
        // Add visible debug for assets
        if (current_user_can('administrator')) {
            echo '<script>console.log("💾 Bravur: Assets enqueued on ' . $_SERVER['REQUEST_URI'] . '");</script>';
        }
        
        // CSS - load your styles.css file
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
            'session_id' => $this->generate_session_id(),
            'plugin_url' => plugins_url('', __FILE__)
        ]);
        
        error_log('✅ Bravur Chatbot assets enqueued');
    }

    public function render_chatbot() {
        // Only skip on admin pages
        if (is_admin()) return;
        
        error_log('🤖 Bravur Chatbot rendering on: ' . $_SERVER['REQUEST_URI']);
        error_log('🔍 Template: ' . get_page_template());
        error_log('🎯 Theme: ' . get_template());
        error_log('📄 is_404: ' . (is_404() ? 'YES' : 'NO'));
        
        
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
            // For shortcode usage - use embedded template
            $template_file = plugin_dir_path(__FILE__) . 'static/templates/embedded.html';
        } else {
            // For floating widget - use widget template  
            $template_file = plugin_dir_path(__FILE__) . 'static/templates/index.html';
        }
        
        if (file_exists($template_file)) {
            $session_id = $this->generate_session_id();
            $content = file_get_contents($template_file);
            
            // Replace any session ID placeholders
            $content = str_replace('{{SESSION_ID}}', esc_html($session_id), $content);
            $content = str_replace('Loading...', esc_html($session_id), $content);
            
            return $content;
        }
        
        // If no template found, show error
        return '<div class="bravur-chatbot-error">Bravur Chatbot: Template file not found at ' . $template_file . '</div>';
    }
    
    private function get_fallback_html($embedded = false) {
        $session_id = $this->generate_session_id();
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
                        Session ID: <span id="session-id">' . esc_html($session_id) . '</span>
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

    public function add_early_chatbot() {
        // Only add if not already added
        if (!is_admin()) {
            echo '<script>console.log("🔧 Bravur: Early hook fired on ' . $_SERVER['REQUEST_URI'] . '");</script>';
        }
    }
    
    public function force_chatbot_everywhere() {
        // Force render via JavaScript injection if normal hooks fail
        if (!is_admin()) {
            add_action('wp_print_footer_scripts', function() {
                echo '<script>
                console.log("🚀 Bravur: Force hook fired on ' . $_SERVER['REQUEST_URI'] . '");
                
                // Check if our script loaded
                if (typeof bravurChatbot === "undefined") {
                    console.log("⚠️ Bravur: Script not loaded, forcing manual load...");
                    
                    // Force load CSS
                    var css = document.createElement("link");
                    css.rel = "stylesheet";
                    css.href = "' . plugins_url('static/css/styles.css', __FILE__) . '?v=' . time() . '";
                    document.head.appendChild(css);
                    
                    // Force load JS
                    var script = document.createElement("script");
                    script.src = "' . plugins_url('static/js/script.js', __FILE__) . '?v=' . time() . '";
                    script.onload = function() {
                        console.log("✅ Bravur: Script force-loaded");
                        // Set up variables manually
                        window.bravurChatbot = {
                            api_url: "' . $this->api_base_url . '",
                            ajax_url: "' . admin_url('admin-ajax.php') . '",
                            nonce: "' . wp_create_nonce('bravur_chatbot_nonce') . '",
                            session_id: "' . $this->generate_session_id() . '",
                            plugin_url: "' . plugins_url('', __FILE__) . '"
                        };
                    };
                    document.head.appendChild(script);
                } else {
                    console.log("✅ Bravur: Script already loaded properly");
                }
                </script>';
            });
        }
    }

    /**
     * Generate a unique session ID
     */
    private function generate_session_id() {
        return 'wp_' . uniqid() . '_' . time();
    }
    
    /**
     * Get file version for cache busting
     */
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
        // Log the request for debugging
        error_log('🚀 Bravur API Proxy called');
        error_log('📍 Request URI: ' . $_SERVER['REQUEST_URI']);
        error_log('📡 POST data: ' . print_r($_POST, true));
        
        // Verify nonce for security
        if (!wp_verify_nonce($_POST['nonce'], 'bravur_chatbot_nonce')) {
            error_log('❌ Nonce verification failed');
            wp_die('Security check failed');
        }
        
        $action = sanitize_text_field($_POST['api_action']);
        $data = $_POST['data'] ?? [];
        
        error_log('🎯 API Action: ' . $action);
        error_log('📦 Data: ' . print_r($data, true));
        
        // Determine which API endpoint to call
        $endpoint = $this->get_api_endpoint($action);
        if (!$endpoint) {
            error_log('❌ Invalid API endpoint for action: ' . $action);
            wp_send_json_error(['message' => 'Invalid API action']);
            return;
        }
        
        error_log('🎯 Using endpoint: ' . $endpoint);
        
        // Make the API call
        $response = $this->make_api_call($endpoint, $data);
        
        error_log('📨 API Response: ' . print_r($response, true));
        
        if (is_wp_error($response)) {
            error_log('💥 WP Error: ' . $response->get_error_message());
            wp_send_json_error(['message' => 'API call failed: ' . $response->get_error_message()]);
        } else {
            $body = wp_remote_retrieve_body($response);
            $response_code = wp_remote_retrieve_response_code($response);
            
            error_log('📊 Response Code: ' . $response_code);
            error_log('📄 Response Body: ' . $body);
            
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
            'create_session' => '/session/create',
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
        
        // Handle different HTTP methods based on endpoint
        if (in_array($endpoint, ['/session/create', '/chat', '/consent/accept', '/consent/withdraw', '/feedback'])) {
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
        $flask_url = 'http://localhost:5001/api/v1/ratelimit/captcha-solved';
        $flask_response = wp_remote_post($flask_url, [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode(['session_id' => $session_id])
        ]);
        wp_send_json_success(['message' => 'CAPTCHA verified']);
    } else {
        wp_send_json_error(['message' => 'CAPTCHA verification failed']);
    }
}