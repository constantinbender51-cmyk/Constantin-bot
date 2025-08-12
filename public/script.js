// This is the version that works aesthetically, but has no long-term memory.
document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    // This will now only hold the history for the CURRENT session.
    let conversationHistory = []; 

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        if (placeholder) placeholder.style.display = 'none';

        const checkmarkElement = addMessageToUI(userMessage, 'user-message');
        
        // Add user message to our temporary session history
        conversationHistory.push({ role: 'user', content: userMessage });
        
        messageInput.value = '';

        // Show typing indicator
        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // --- We will fix this part in the next step ---
        // For now, this will just send the temporary history
        const historyParam = encodeURIComponent(JSON.stringify(conversationHistory));
        const eventSource = new EventSource(`/api/stream?history=${historyParam}`);

        eventSource.addEventListener('ack', (e) => {
            if (checkmarkElement) checkmarkElement.classList.add('visible');
        });

        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            const botReply = data.reply;
            
            // Add bot's reply to our temporary session history
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
