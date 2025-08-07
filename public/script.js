document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');

    let conversationHistory = [];
    let hasStarted = false; // Flag to track if the conversation has started

    // --- Display the initial placeholder message ---
    function displayOpeningMessage() {
        const openingMessage = document.createElement('div');
        openingMessage.id = 'opening-message';
        openingMessage.textContent = "AI Constantin here. Ask away.";
        chatWindow.insertBefore(openingMessage, typingIndicator);
    }

    displayOpeningMessage();

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        // --- If this is the first message, remove the opening text ---
        if (!hasStarted) {
            const openingMessage = document.getElementById('opening-message');
            if (openingMessage) {
                openingMessage.remove();
            }
            hasStarted = true; // Set the flag
        }

        const checkmarkElement = addMessageToUI(userMessage, 'user-message');
        const currentMessageHistory = [...conversationHistory, { role: 'user', content: userMessage }];
        messageInput.value = '';

        const historyParam = encodeURIComponent(JSON.stringify(currentMessageHistory));
        const eventSource = new EventSource(`/api/stream?history=${historyParam}`);

        eventSource.addEventListener('ack', (e) => {
            if (checkmarkElement) checkmarkElement.classList.add('visible');
        });

        eventSource.addEventListener('typing', (e) => {
            typingIndicator.classList.remove('hidden');
            chatWindow.scrollTop = chatWindow.scrollHeight;
        });

        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            const botReply = data.reply;

            conversationHistory.push({ role: 'user', content: userMessage });
            conversationHistory.push({ role: 'assistant', content: botReply });
            
            typingIndicator.classList.add('hidden');
            addMessageToUI(botReply, 'bot-message');
        });

        eventSource.addEventListener('done', (e) => {
            eventSource.close();
        });

        eventSource.addEventListener('error', (e) => {
            console.error('An error occurred in the stream:', e);
            typingIndicator.classList.add('hidden');
            addMessageToUI('Sorry, something went wrong. Please try again.', 'bot-message');
            eventSource.close();
        });
    });

    function addMessageToUI(text, className) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        
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
});
