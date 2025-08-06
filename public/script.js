document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');

    let conversationHistory = [];

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const userMessage = messageInput.value.trim();
        if (userMessage === '') {
            return;
        }

        // --- Stage 1: Display message and get instant acknowledgment ---

        const checkmarkElement = addMessageToUI(userMessage, 'user-message');
        const currentMessageHistory = [...conversationHistory, { role: 'user', content: userMessage }];
        
        messageInput.value = '';

        // Instantly acknowledge the message to show the checkmark
        fetch('/api/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage }) // Send the message just in case
        }).then(response => {
            if (response.ok && checkmarkElement) {
                checkmarkElement.classList.add('visible');
            }
        }).catch(err => console.error("Ack failed:", err)); // Don't disrupt flow if this fails

        // --- Stage 2: Get the actual chatbot response ---

        // Show typing indicator immediately after sending
        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: currentMessageHistory }), 
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok.');
            }
            return response.json();
        })
        .then(data => {
            const botReply = data.reply;
            
            // Update the official history only after a successful response
            conversationHistory = [...currentMessageHistory, { role: 'assistant', content: botReply }];

            typingIndicator.classList.add('hidden');
            addMessageToUI(botReply, 'bot-message');
        })
        .catch(error => {
            console.error('Error fetching chatbot response:', error);
            typingIndicator.classList.add('hidden');
            addMessageToUI('Sorry, something went wrong. Please try again.', 'bot-message');
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
