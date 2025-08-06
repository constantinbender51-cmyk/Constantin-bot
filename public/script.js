document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator'); // Get the indicator element

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') {
            return;
        }

        // 1. Display the user's message
        addMessage(userMessage, 'user-message');
        messageInput.value = '';
        
        // 2. Show the typing indicator
        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll down to show it

        try {
            // 3. Send the message to the server
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok.');
            }

            const data = await response.json();
            const botReply = data.reply;

            // 4. Hide the indicator and display the bot's response
            typingIndicator.classList.add('hidden');
            addMessage(botReply, 'bot-message');

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            // Also hide indicator on error and show an error message
            typingIndicator.classList.add('hidden');
            addMessage('Sorry, something went wrong. Please try again.', 'bot-message');
        }
    });

    function addMessage(text, className) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        messageElement.textContent = text;
        
        // Insert the new message *before* the typing indicator
        chatWindow.insertBefore(messageElement, typingIndicator);

        // Scroll to the bottom to see the new message
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
