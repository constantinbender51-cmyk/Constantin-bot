document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');

    // NEW: Array to store the conversation history
    let conversationHistory = [];

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') {
            return;
        }

        // 1. Add user message to UI and history
        addMessageToUI(userMessage, 'user-message');
        conversationHistory.push({ role: 'user', content: userMessage });
        
        messageInput.value = '';
        
        // 2. Show typing indicator
        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            // 3. Send the ENTIRE history to the server
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // Send the history array under the key 'history'
                body: JSON.stringify({ history: conversationHistory }), 
            });

            if (!response.ok) {
                // If the server sends an error, remove the last user message from history
                // so they can try sending it again without a broken history.
                conversationHistory.pop();
                throw new Error('Network response was not ok.');
            }

            const data = await response.json();
            const botReply = data.reply;

            // 4. Hide indicator, add bot reply to UI and history
            typingIndicator.classList.add('hidden');
            addMessageToUI(botReply, 'bot-message');
            conversationHistory.push({ role: 'assistant', content: botReply });

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            typingIndicator.classList.add('hidden');
            addMessageToUI('Sorry, something went wrong. Please try again.', 'bot-message');
        }
    });

    // Renamed to be more specific
    function addMessageToUI(text, className) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        messageElement.textContent = text;
        
        chatWindow.insertBefore(messageElement, typingIndicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
