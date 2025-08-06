document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');

    let conversationHistory = [];

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') {
            return;
        }

        // 1. Add user message to UI. The function now returns the checkmark element.
        const checkmarkElement = addMessageToUI(userMessage, 'user-message');
        conversationHistory.push({ role: 'user', content: userMessage });
        
        messageInput.value = '';
        
        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ history: conversationHistory }), 
            });

            if (!response.ok) {
                conversationHistory.pop();
                throw new Error('Network response was not ok.');
            }

            // SUCCESS! The message was received and processed.
            // 2. Make the checkmark visible.
            if (checkmarkElement) {
                checkmarkElement.classList.add('visible');
            }

            const data = await response.json();
            const botReply = data.reply;

            typingIndicator.classList.add('hidden');
            addMessageToUI(botReply, 'bot-message');
            conversationHistory.push({ role: 'assistant', content: botReply });

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            typingIndicator.classList.add('hidden');
            // We don't show a checkmark on error, but we add an error message.
            addMessageToUI('Sorry, something went wrong. Please try again.', 'bot-message');
        }
    });

    function addMessageToUI(text, className) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        
        // Use textContent to prevent HTML injection issues
        const textNode = document.createElement('span');
        textNode.textContent = text;
        messageElement.appendChild(textNode);

        let checkmark = null;
        // Only add a checkmark to user messages
        if (className === 'user-message') {
            checkmark = document.createElement('div');
            checkmark.classList.add('checkmark');
            messageElement.appendChild(checkmark);
        }
        
        chatWindow.insertBefore(messageElement, typingIndicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // Return the checkmark element so we can modify it later
        return checkmark;
    }
});
