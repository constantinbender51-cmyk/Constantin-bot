document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    let conversationHistory = [];
    let hasStarted = false;
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        if (placeholder && isNewSession) {
            placeholder.style.display = 'none';
        }

        const messageId = `msg-${Date.now()}`;
        const checkmarkElement = addMessageToUI(userMessage, 'user-message', messageId);
        
        messageInput.value = '';

        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        const queryParams = new URLSearchParams({
            message: userMessage,
            isNewSession: isNewSession
        }).toString();
        
        isNewSession = false;

        const eventSource = new EventSource(`/api/stream?${queryParams}`);

        eventSource.addEventListener('ack', (e) => {
            if (checkmarkElement) checkmarkElement.classList.add('visible');
        });

        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            addMessageToUI(data.reply, 'bot-message');
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

        // --- This is the correct way to handle the end of the stream ---
        eventSource.addEventListener('done', (e) => {
            typingIndicator.classList.add('hidden');
            eventSource.close(); // Simply close the connection.
            console.log("Stream finished and connection closed.");
        });

        eventSource.addEventListener('error', (e) => {
            typingIndicator.classList.add('hidden');
            addMessageToUI('Sorry, a connection error occurred.', 'bot-message');
            eventSource.close(); // Close on error to prevent retries.
            console.error('EventSource failed:', e);
        });
    });

    function addRelayButton(messageElement, messageToRelay) {
        const button = document.createElement('button');
        button.textContent = 'Confirm: Send Message';
        button.className = 'relay-button';
        
        button.onclick = async () => {
            button.disabled = true; // Disable immediately on click
            try {
                const response = await fetch('/api/confirm-relay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageToRelay: messageToRelay })
                });
                
                if (response.ok) {
                    button.textContent = '✓ Message Sent';
                    button.classList.add('sent');
                } else {
                    button.textContent = 'Error - Try Again';
                    button.disabled = false;
                }
            } catch (error) {
                console.error('Failed to relay message:', error);
                button.textContent = 'Error - Network Issue';
                button.disabled = false;
            }
        };
        
        messageElement.appendChild(button);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

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
        return className === 'user-message' ? checkmark : messageElement;
    }
    const loadHistory = async () => {
        try {
            const response = await fetch('/api/history');
            if (!response.ok) return;
            const history = await response.json();

            if (history && Array.isArray(history) && history.length > 0) {
                if (placeholder) placeholder.style.display = 'none';
                
                // Process the history array in the correct order.
                for (const msg of history) {
                    if (msg.content !== '--- NEW SESSION ---') {
                        addMessageToUI(msg.content, msg.role === 'user' ? 'user-message' : 'bot-message');
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    };
    
    loadHistory();
});
