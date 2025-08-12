document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- State ---
    // This is now the ONLY state we need. It's true when the page loads, false after the first message.
    let isNewSession = true;

    // --- Safety Check ---
    if (!chatWindow || !chatForm || !messageInput || !typingIndicator) {
        console.error("Essential chat elements are missing from the HTML. Aborting script.");
        alert("Error: Chat interface is not loaded correctly.");
        return;
    }

    // --- YOUR addMessageToUI function (UNTOUCHED) ---
    // This function is perfect as it is.
    function addMessageToUI(text, className, messageId = null) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        if (messageId) {
            messageElement.id = messageId;
        }

        const textNode = document.createElement('span');
        textNode.textContent = text;
        messageElement.appendChild(textNode);

        let checkmark = null;
        if (className === 'user-message') {
            checkmark = document.createElement('div');
            checkmark.classList.add('checkmark');
            messageElement.appendChild(checkmark);
        }

        chatWindow.insertBefore(messageElement, typingIndicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return checkmark;
    }

    // --- The working submit handler ---
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        // Hide the placeholder when the first message is sent
        if (placeholder && isNewSession) {
            placeholder.style.display = 'none';
        }

        const messageId = `msg-${Date.now()}`;
        const checkmarkElement = addMessageToUI(userMessage, 'user-message', messageId);
        
        messageInput.value = '';

        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // --- The SIMPLE communication logic ---
        // This correctly tells the backend if it's a new session,
        // allowing the AI to use its long-term memory appropriately.
        const queryParams = new URLSearchParams({
            message: userMessage,
            isNewSession: isNewSession
        }).toString();
        
        // After this message, it's no longer a new session for this user's visit.
        isNewSession = false; 

        const eventSource = new EventSource(`/api/stream?${queryParams}`);

        eventSource.addEventListener('ack', (e) => {
            if (checkmarkElement) checkmarkElement.classList.add('visible');
        });

        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            addMessageToUI(data.reply, 'bot-message');
        });

        eventSource.addEventListener('done', (e) => {
            typingIndicator.classList.add('hidden');
            eventSource.close();
        });

        eventSource.addEventListener('error', (e) => {
            typingIndicator.classList.add('hidden');
            addMessageToUI('Sorry, a connection error occurred.', 'bot-message');
            eventSource.close();
        });
    });

    // NO MORE loadHistory() call. The page will always start fresh.
});
