document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent the form from reloading the page

        const userMessage = messageInput.value.trim();
        if (userMessage === '') {
            return; // Don't send empty messages
        }

        // 1. Display the user's message immediately
        addMessage(userMessage, 'user-message');
        messageInput.value = ''; // Clear the input field

        try {
            // 2. Send the message to our server's backend API
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

            // 3. Display the bot's response
            addMessage(botReply, 'bot-message');

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            addMessage('Sorry, something went wrong. Please try again.', 'bot-message');
        }
    });

    function addMessage(text, className) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        messageElement.textContent = text;
        chatWindow.appendChild(messageElement);

        // Scroll to the bottom to see the new message
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
