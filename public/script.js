document.addEventListener('DOMContentLoaded', () => {
    // --- Your original element references ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- The ONLY new variable we need ---
    let isNewSession = true;

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
        // THIS IS THE CRUCIAL LINE THAT I KEPT MESSING UP. IT IS CORRECT HERE.
        chatWindow.insertBefore(messageElement, typingIndicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return checkmark;
    }

    // --- Your submit listener, adapted for the new backend ---
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        if (placeholder && isNewSession) {
            placeholder.style.display = 'none';
        }

        const messageId = `msg-${Date.now()}`;
        const checkmarkElement = addMessageToUI(userMessage, 'user-message', messageId);
        
        messageInput.value = '';

        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // --- The new, simple communication logic ---
        const queryParams = new URLSearchParams({
            message: userMessage,
            isNewSession: isNewSession
        }).toString();
        
        isNewSession = false; // After this, it's an ongoing session.

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

    // --- NO history loading. The chat starts empty, just as you wanted. ---
});
