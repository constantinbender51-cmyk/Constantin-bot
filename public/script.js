document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');

    // Start with an empty conversation history
    let conversationHistory = [];

    // The old opening message functions have been completely removed.

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        const checkmarkElement = addMessageToUI(userMessage, 'user-message');
        // We now push to a temporary history to be sent
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

            // Update the main history only after a successful response
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
