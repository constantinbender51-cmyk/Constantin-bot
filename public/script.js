document.addEventListener('DOMContentLoaded', () => {
    // --- Your original element references ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- Simple, single-session history ---
    let conversationHistory = [];
    let hasStarted = false;

    // --- YOUR addMessageToUI function (UNTOUCHED AND PERFECT) ---
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
        return checkmark; // Return only the checkmark element for user messages
    }

    // --- Your original submit listener, simplified for single-session ---
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        if (!hasStarted) {
            if (placeholder) placeholder.style.display = 'none';
            hasStarted = true;
        }

        const messageId = `msg-${Date.now()}`;
        const checkmarkElement = addMessageToUI(userMessage, 'user-message', messageId);
        
        // Add user message to the temporary session history
        conversationHistory.push({ role: 'user', content: userMessage });
        
        messageInput.value = '';

        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // --- The original, simple communication logic ---
        // It sends the current session's history to the backend.
        const historyParam = encodeURIComponent(JSON.stringify(conversationHistory));
        const eventSource = new EventSource(`/api/stream?history=${historyParam}`);

        eventSource.addEventListener('ack', (e) => {
            if (checkmarkElement) checkmarkElement.classList.add('visible');
        });

        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            const botReply = data.reply;
            
            // Add bot's reply to the temporary session history
            conversationHistory.push({ role: 'assistant', content: botReply });
            
            addMessageToUI(botReply, 'bot-message');
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
});
