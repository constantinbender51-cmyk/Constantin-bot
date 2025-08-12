document.addEventListener('DOMContentLoaded', () => {
    // --- Element References from your code ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form'); // Using your ID
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- State from the new logic ---
    let isNewSession = true;

    // --- Safety Check ---
    if (!chatWindow || !chatForm || !messageInput || !typingIndicator) {
        console.error("Essential chat elements are missing from the HTML. Aborting script.");
        alert("Error: Chat interface is not loaded correctly.");
        return;
    }

    // --- YOUR addMessageToUI function (UNTOUCHED) ---
    function addMessageToUI(text, className, messageId = null) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', className);
        if (messageId) {
            messageElement.id = messageId;
        }

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
        return checkmark; // Return only the checkmark element for user messages
    }

    // --- NEW function to load persistent history ---
    const loadHistory = async () => {
        try {
            const response = await fetch('/api/history');
            if (!response.ok) return;
            const history = await response.json();

            if (history && history.length > 0) {
                if (placeholder) placeholder.style.display = 'none';
                history.forEach(msg => {
                    if (msg.content !== '--- NEW SESSION ---') {
                        addMessageToUI(msg.content, msg.role === 'user' ? 'user-message' : 'bot-message');
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    };

    // --- MERGED Event Listener ---
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage === '') return;

        if (placeholder) placeholder.style.display = 'none';

        const messageId = `msg-${Date.now()}`;
        const checkmarkElement = addMessageToUI(userMessage, 'user-message', messageId);
        
        messageInput.value = '';

        // Show typing indicator immediately
        typingIndicator.classList.remove('hidden');
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // --- Use the new backend communication method ---
        const queryParams = new URLSearchParams({
            message: userMessage,
            isNewSession: isNewSession
        }).toString();
        
        isNewSession = false; // It's no longer a new session after the first message

        const eventSource = new EventSource(`/api/stream?${queryParams}`);

        eventSource.addEventListener('ack', (e) => {
            // Use the checkmarkElement returned by your function
            if (checkmarkElement) checkmarkElement.classList.add('visible');
        });

        eventSource.addEventListener('message', (e) => {
            try {
                const data = JSON.parse(e.data);
                addMessageToUI(data.reply, 'bot-message');
            } catch (err) {
                console.error("Error parsing message data:", err);
            }
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

    // --- Initial Load ---
    loadHistory();
});
