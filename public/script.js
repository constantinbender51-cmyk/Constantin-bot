document.addEventListener('DOMContentLoaded', () => {
    // ... (keep variable declarations at the top) ...
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');

    let conversationHistory = [];
    let hasStarted = false;

    // ... (chatForm.addEventListener is mostly the same) ...
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        if (!hasStarted) {
            if (placeholder) placeholder.classList.add('hidden-placeholder');
            hasStarted = true;
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
            document.getElementById('typing-indicator').classList.remove('hidden');
            chatWindow.scrollTop = chatWindow.scrollHeight;
        });

        // --- MODIFIED: This now handles the 'execution' command ---
        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            const botReply = data.reply;
            const execution = data.execution;
            const originalUserMessage = data.originalUserMessage;

            conversationHistory.push({ role: 'user', content: userMessage });
            conversationHistory.push({ role: 'assistant', content: botReply });
            
            document.getElementById('typing-indicator').classList.add('hidden');
            
            // Add the bot's message to the UI
            const botMessageElement = addMessageToUI(botReply, 'bot-message');

            // --- NEW: If the execution is 'propose_relay', add the button ---
            if (execution === 'propose_relay') {
                addRelayButton(botMessageElement, originalUserMessage);
            }
        });

        // ... (rest of eventSource listeners are the same) ...
    });

    // --- NEW: Function to create and handle the relay button ---
    function addRelayButton(messageElement, messageToRelay) {
        const button = document.createElement('button');
        button.textContent = 'Confirm: Send Message';
        button.className = 'relay-button';
        
        button.onclick = async () => {
            try {
                const response = await fetch('/api/confirm-relay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageToRelay: messageToRelay })
                });
                
                if (response.ok) {
                    button.textContent = '✓ Message Sent';
                    button.disabled = true; // Prevent multiple clicks
                    button.classList.add('sent');
                } else {
                    button.textContent = 'Error - Try Again';
                }
            } catch (error) {
                console.error('Failed to relay message:', error);
                button.textContent = 'Error - Network Issue';
            }
        };
        
        messageElement.appendChild(button);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // ... (addMessageToUI function is the same) ...
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
        chatWindow.insertBefore(messageElement, document.getElementById('typing-indicator'));
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return className === 'user-message' ? checkmark : messageElement;
    }
});
