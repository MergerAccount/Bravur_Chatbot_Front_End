from flask import request, jsonify, Response, stream_with_context
import logging
from app.chatbot import company_info_handler_streaming
from app.database import create_chat_session, store_message

# Handle user chat POST request and stream GPT response
def handle_chat():
    user_input = request.form["user_input"]
    session_id = request.form.get("session_id")
    language = request.form.get("language", "nl-NL")

    # Create session if none provided
    if session_id == "None" or not session_id:
        session_id = create_chat_session()
        if not session_id:
            return jsonify({
                "response": "Sorry, I'm having trouble with your session. Please try again.",
                "session_id": None
            })

    # Convert session_id to integer
    try:
        session_id = int(session_id)
    except (ValueError, TypeError):
        session_id = create_chat_session()
        if not session_id:
            return jsonify({
                "response": "Sorry, I'm having trouble with your session. Please try again.",
                "session_id": None
            })

    # Store user message before processing
    store_message(session_id, user_input, "user")

    # Stream GPT reply and capture for DB
    def generate():
        full_reply = ""
        try:
            for chunk in company_info_handler_streaming(user_input, session_id, language):
                full_reply += chunk
                yield chunk
        finally:
            if full_reply.strip():
                store_message(session_id, full_reply.strip(), "bot")

    return Response(stream_with_context(generate()), mimetype="text/plain")
