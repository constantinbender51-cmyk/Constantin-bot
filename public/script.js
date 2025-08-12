document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const messageForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    let isNewSession = true; // Flag to track if this is the first message of the session

    // --- NEW: Function to load history on page start ---
    const loadHistory = async () => {
        try {
            const response = await fetch('/api/history');
            const history = await response.json();
            if (history.length > 0) {
                placeholder.style.display = 'none';
                history.forEach(msg => {
                    // Don't display the system-level session markers
                    if (msg.content !== '--- NEW SESSION ---') {
                        addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    };

    const addMessage = (text, sender, messageId = null) => {
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
    }// ... (addMessage function is the same) ...
    };

    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (!messageText) return;

        placeholder.style.display = 'none';
        const messageId = `msg-${Date.now()}`;
        addMessage(messageText, 'user', messageId);
        messageInput.value = '';
        typingIndicator.style.display = 'flex';

        // --- MODIFIED: We now send the message and the flag ---
        const queryParams = new URLSearchParams({
            message: messageText,
            isNewSession: isNewSession
        }).toString();

        const eventSource = new EventSource(`/api/stream?${queryParams}`);
        isNewSession = false; // After the first message, it's no longer a new session

        eventSource.addEventListener('ack', (event) => {
            const data = JSON.parse(event.data);
            if (data.status === 'received') {
                const sentMessage = document.getElementById(messageId);
                if (sentMessage) {
                    const checkmark = sentMessage.querySelector('.checkmark');
                    if (checkmark) checkmark.classList.add('visible');
                }
            }
        });

        eventSource.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            typingIndicator.style.display = 'none';
            addMessage(data.reply, 'bot');
        });

        eventSource.addEventListener('done', () => {
            eventSource.close();
        });

        eventSource.onerror = () => {
            typingIndicator.style.display = 'none';
            addMessage("Sorry, something went wrong. Please try again.", 'bot');
            eventSource.close();
        };
    });

    // --- NEW: Load history when the page loads ---
    loadHistory();
});
