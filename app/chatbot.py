import logging
import re
import json
import threading
from functools import lru_cache
from hashlib import sha256

from openai import OpenAI
from fuzzywuzzy import fuzz

from app.config import OPENAI_API_KEY
from app.database import (
    get_session_messages, store_message,
    hybrid_search, semantic_search, embed_query
)
from app.agentConnector import AgentConnector

client = OpenAI(api_key=OPENAI_API_KEY)
agent_connector = AgentConnector()

embedding_cache = {}

# Common prompts to recall past questions
memory_prompts = [
    "what was my last question",
    "what was my previous question",
    "can you remind me my last question",
    "what did I ask before",
    "what was my earlier question",
    "show me my previous question",
    "tell me my last question",
    "repeat my last question",
    "what did I say last"
]

def log_async(fn, *args):
    threading.Thread(target=fn, args=args).start()

def is_last_question_request(user_input):
    return any(fuzz.partial_ratio(user_input.lower(), prompt) > 80 for prompt in memory_prompts)

def strip_html_paragraphs(text):
    return re.sub(r"^<p>(.*?)</p>$", r"\1", text.strip(), flags=re.DOTALL)

def estimate_tokens(text):
    return max(1, int(len(text.split()) * 0.75))

def get_recent_conversation(session_id, max_tokens=400):
    latest_language_message = None

    if not session_id:
        return []

    messages = get_session_messages(session_id)
    formatted = []

    for _, content, _, msg_type in messages:
        if msg_type == "user":
            formatted.append({"role": "user", "content": content})
        elif msg_type == "bot":
            formatted.append({"role": "assistant", "content": content})
        elif msg_type == "system":
            formatted.append({"role": "system", "content": content})

    total_tokens = 0
    selected = []

    for msg in reversed(formatted):
        tokens = estimate_tokens(msg["content"])
        if total_tokens + tokens > max_tokens:
            break
        selected.insert(0, msg)
        total_tokens += tokens

    if latest_language_message:
        # Remove any existing instances first to avoid duplication
        selected = [msg for msg in selected if "[SYSTEM] Language changed" not in msg.get("content", "")]
        selected.insert(0, latest_language_message)

    return selected

def classify_intent(user_input: str) -> str:
    text = user_input.lower()

    if any(word in text for word in ["contact", "human", "support", "agent", "real person"]):
        return "Human Support Service Request"

    if any(word in text for word in ["cloud", "ai", "software", "tech", "cybersecurity", "trend", "machine learning", "python", "network"]):
        return "IT Services & Trends"

    if any(word in text for word in ["company", "bravur", "mission", "vision", "history", "location", "services", "employees", "profile"]):
        return "Company Info"

    return "Unknown"

def embed_query_cached(query):
    key = sha256(query.encode()).hexdigest()
    if key in embedding_cache:
        return embedding_cache[key]

    def do_embed():
        embedding = embed_query(query)
        if embedding:
            embedding_cache[key] = embedding

    threading.Thread(target=do_embed).start()
    return None

def handle_meta_questions(user_input, session_id):
    if not session_id:
        return "I don't have any previous conversation to refer to."

    messages = get_session_messages(session_id)
    if not messages:
        return "I don't remember anything yet."

    messages.reverse()
    if is_last_question_request(user_input):
        skip_current = True
        for _, content, _, msg_type in messages:
            if msg_type == "user":
                if skip_current:
                    skip_current = False
                    continue
                return f"Your last question was: \"{content}\""
        return "I couldn't find your last question."

    elif "last answer" in user_input.lower():
        for _, content, _, msg_type in messages:
            if msg_type == "bot":
                return f"My last answer was: \"{content}\""
        return "I couldn't find my last answer."

    elif "summarize" in user_input.lower():
        all_msgs = get_session_messages(session_id)
        formatted = []
        for _, content, _, msg_type in all_msgs:
            if msg_type == "user":
                formatted.append({"role": "user", "content": content})
            elif msg_type == "bot":
                formatted.append({"role": "assistant", "content": content})

        summary_prompt = [{"role": "system", "content": "Summarize the following conversation briefly:"}] + formatted
        return gpt_cached_response("gpt-4o-mini", summary_prompt).strip()

    return "I'm not sure what you're referring to. Could you clarify?"

def company_info_handler(user_input, session_id=None, language="nl-NL"):
    if is_last_question_request(user_input) or "last answer" in user_input.lower() or "summarize" in user_input.lower():
        return handle_meta_questions(user_input, session_id)

    detected_intent = classify_intent(user_input)

    if detected_intent == "Human Support Service Request":
        reply = (
            "For human support, contact us on WhatsApp at +31 6 12345678 or email support@bravur.com."
        )
        if session_id:
            reply += f" When contacting support, please mention your session ID: {session_id}"
            log_async(store_message, session_id, user_input, "user")
            log_async(store_message, session_id, reply, "bot")
        return reply

    recent_convo = get_recent_conversation(session_id)

    if detected_intent == "Unknown":
        return "I'm here to answer questions about Bravur and IT services. How can I help?"

    if detected_intent == "IT Services & Trends":
        it_prompt = [
                        {"role": "system", "content": (
                            "You are a knowledgeable assistant providing insights on IT services and trends. "
                            "Avoid repeating unless asked. Be clear and helpful."
                        )}
                    ] + recent_convo + [{"role": "user", "content": user_input}]

        reply = gpt_cached_response("gpt-4o-mini", it_prompt).strip()
        reply = strip_html_paragraphs(reply)

        if session_id:
            log_async(store_message, session_id, user_input, "user")
            log_async(store_message, session_id, reply, "bot")
        return reply

    # --- Search logic ---
    search_results = hybrid_search(user_input, top_k=5)
    if not search_results:
        embedding = embed_query_cached(user_input)
        if embedding:
            search_results = semantic_search(embedding, top_k=5)

    if not search_results:
        return "I couldn't find anything relevant in Bravur's data. Try rephrasing your question."

    semantic_context = "\n\n".join([
        f"Row ID: {row_id}\nTitle: {title}\nContent: {content}"
        for row_id, title, content, _ in search_results
    ])

    language_instruction = ""
    if language == "nl-NL":
        language_instruction = "Je moet altijd in het Nederlands antwoorden, ongeacht in welke taal de gebruiker spreekt."
    elif language == "en-US":
        language_instruction = "You must always respond in English, regardless of the language the user speaks in."

    system_prompt = (
        f"You are a helpful assistant for Bravur. {language_instruction}"
        f"Answer the user based on this information. Cite Row IDs used:\n\n{semantic_context}"
    )

    gpt_prompt = [{"role": "system", "content": system_prompt}] + recent_convo + [{"role": "user", "content": user_input}]
    reply = gpt_cached_response("gpt-4o-mini", gpt_prompt).strip()
    reply = strip_html_paragraphs(reply)

    if session_id:
        log_async(store_message, session_id, user_input, "user")
        log_async(store_message, session_id, reply, "bot")

    return reply


def company_info_handler_streaming(user_input, session_id=None, language="nl-NL"):
    detected_intent = classify_intent(user_input)

    if detected_intent == "Human Support Service Request":
        reply = (
            "For human support, contact us on WhatsApp at +31 6 12345678 or email support@bravur.com."
        )
        if session_id:
            reply += f" When contacting support, please mention your session ID: {session_id}"
            log_async(store_message, session_id, user_input, "user")
            log_async(store_message, session_id, reply, "bot")
        yield reply
        return

    recent_convo = get_recent_conversation(session_id)

    search_results = hybrid_search(user_input, top_k=5)
    if not search_results:
        embedding = embed_query_cached(user_input)
        if embedding:
            search_results = semantic_search(embedding, top_k=5)

    semantic_context = "\n\n".join([
        f"Row ID: {row_id}\nTitle: {title}\nContent: {content}"
        for row_id, title, content, _ in search_results
    ])


    #Language instruction based on selectedLanguage
    language_instruction = ""
    if language == "nl-NL":
        language_instruction = "Je moet altijd in het Nederlands antwoorden, ongeacht in welke taal de gebruiker spreekt."
    elif language == "en-US":
        language_instruction = "You must always respond in English, regardless of the language the user speaks in."

    system_prompt = (
        f"You are a helpful assistant for Bravur. {language_instruction}. "
        f"Answer the user based on this information. Cite Row IDs used:\n\n{semantic_context}"
    )

    gpt_prompt = [{"role": "system", "content": system_prompt}] + recent_convo + [{"role": "user", "content": user_input}]

    try:
        stream = client.chat.completions.create(
            model="gpt-4o",
            messages=gpt_prompt,
            stream=True
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    except Exception as e:
        logging.error(f"Streaming error: {e}")
        yield "\n[Error generating response]"



agent_connector.register_agent("Bravur_Information_Agent", company_info_handler)

@lru_cache(maxsize=256)
def gpt_cached_response(model, messages_as_tuple):
    messages = json.loads(json.dumps(messages_as_tuple))
    response = client.chat.completions.create(
        model=model,
        messages=messages
    )
    return response.choices[0].message.content
