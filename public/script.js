document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');

    let conversationHistory = [];

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        // 1. Add user message to UI and update history locally
        const checkmarkElement = addMessageToUI(userMessage, 'user-message');
        conversationHistory.push({ role: 'user', content: userMessage });
        messageInput.value = '';

        // 2. Create the URL with the history as a query parameter
        const historyParam = encodeURIComponent(JSON.stringify(conversationHistory));
        const eventSource = new EventSource(`/api/stream?history=${historyParam}`);

        // 3. Listen for events from the server
        eventSource.addEventListener('ack', (e) => {
            console.log('Acknowledgment received.');
            if (checkmarkElement) {
                checkmarkElement.classList.add('visible');
            }
        });

        eventSource.addEventListener('typing', (e) => {
            console.log('Typing event received.');
            const data = JSON.parse(e.data);
            if (data.status === true) {
                typingIndicator.classList.remove('hidden');
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
        });

        eventSource.addEventListener('message', (e) => {
            console.log('Message event received.');
            const data = JSON.parse(e.data);
            const botReply = data.reply;

            // Add the bot's reply to history and UI
            conversationHistory.push({ role: 'assistant', content: botReply });
            typingIndicator.classList.add('hidden');
            addMessageToUI(botReply, 'bot-message');
        });

        eventSource.addEventListener('done', (e) => {
            console.log('Stream finished.');
            eventSource.close(); // We're done, so close the connection
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
