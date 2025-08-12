document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    let isNewSession = true; // Flag to track if this is the first message of the session

    // Function to load history on page start
    const loadHistory = async () => {
        try {
            const response = await fetch('/api/history');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const history = await response.json();

            if (history && history.length > 0) {
                placeholder.style.display = 'none';
                history.forEach(msg => {
                    // Don't display the system-level session markers to the user
                    if (msg.content !== '--- NEW SESSION ---') {
                        addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
            // Don't show an error to the user, just start fresh.
        }
    };

    // Function to add a message to the chat window
    const addMessage = (text, sender, messageId = null) => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        if (messageId) {
            messageElement.id = messageId;
        }

        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = text;

        if (sender === 'user') {
            const checkmark = document.createElement('span');
            checkmark.classList.add('checkmark');
            checkmark.innerHTML = '&#10003;'; // Checkmark symbol
            bubble.appendChild(checkmark);
        }

        messageElement.appendChild(bubble);
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll
    };

    // Event listener for the form submission
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (!messageText) return;

        if (placeholder) {
            placeholder.style.display = 'none';
        }
        
        const messageId = `msg-${Date.now()}`;
        addMessage(messageText, 'user', messageId);
        messageInput.value = '';
        typingIndicator.style.display = 'flex';

        // We now send the message and the flag
        const queryParams = new URLSearchParams({
            message: messageText,
            isNewSession: isNewSession
        }).toString();

        // After the first message, it's no longer a new session for this browser tab
        isNewSession = false; 

        const eventSource = new EventSource(`/api/stream?${queryParams}`);

        eventSource.addEventListener('ack', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.status === 'received') {
                    const sentMessage = document.getElementById(messageId);
                    if (sentMessage) {
                        const checkmark = sentMessage.querySelector('.checkmark');
                        if (checkmark) checkmark.classList.add('visible');
                    }
                }
            } catch (err) {
                console.error("Error parsing 'ack' event:", err);
            }
        });

        eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                typingIndicator.style.display = 'none';
                addMessage(data.reply, 'bot');
            } catch (err) {
                console.error("Error parsing 'message' event:", err);
            }
        });

        eventSource.addEventListener('done', () => {
            eventSource.close();
        });

        eventSource.onerror = (err) => {
            console.error("EventSource failed:", err);
            typingIndicator.style.display = 'none';
            addMessage("Sorry, I encountered a connection error. Please try again.", 'bot');
            eventSource.close();
        };
    });

    // Load history when the page loads
    loadHistory();
});
