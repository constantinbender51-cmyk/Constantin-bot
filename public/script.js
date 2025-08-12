document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const chatWindow = document.getElementById('chat-window');
    // --- THE ONLY CHANGE IS ON THIS LINE ---
    const messageForm = document.getElementById('chat-form'); // Changed from 'message-form' to 'chat-form'
    // --- END OF CHANGE ---
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- State ---
    let isNewSession = true;

    // --- Safety Check ---
    if (!chatWindow || !messageForm || !messageInput) {
        console.error("Essential chat elements are missing from the HTML. Aborting script.");
        alert("Error: Chat interface is not loaded correctly.");
        return;
    }

    // --- Functions ---

    const loadHistory = async () => {
        try {
            const response = await fetch('/api/history');
            if (!response.ok) return;
            const history = await response.json();

            if (history && history.length > 0) {
                if (placeholder) placeholder.style.display = 'none';
                history.forEach(msg => {
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
        messageElement.classList.add('message', `${sender}-message`);
        if (messageId) messageElement.id = messageId;

        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = text;

        if (sender === 'user') {
            const checkmark = document.createElement('span');
            checkmark.classList.add('checkmark');
            checkmark.innerHTML = '&#10003;';
            bubble.appendChild(checkmark);
        }

        messageElement.appendChild(bubble);
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (!messageText) return;

        if (placeholder) placeholder.style.display = 'none';
        
        const messageId = `msg-${Date.now()}`;
        addMessage(messageText, 'user', messageId);
        messageInput.value = '';
        
        if (typingIndicator) typingIndicator.classList.remove('hidden');

        const queryParams = new URLSearchParams({
            message: messageText,
            isNewSession: isNewSession
        }).toString();

        isNewSession = false;

        const eventSource = new EventSource(`/api/stream?${queryParams}`);

        eventSource.addEventListener('ack', (event) => {
            const sentMessage = document.getElementById(messageId);
            if (sentMessage) {
                const checkmark = sentMessage.querySelector('.checkmark');
                if (checkmark) checkmark.classList.add('visible');
            }
        });

        eventSource.addEventListener('message', (event) => {
            if (typingIndicator) typingIndicator.classList.add('hidden');
            try {
                const data = JSON.parse(event.data);
                addMessage(data.reply, 'bot');
            } catch (err) {
                console.error("Error parsing message data:", err);
            }
        });

        eventSource.addEventListener('done', () => {
            eventSource.close();
        });

        eventSource.onerror = () => {
            if (typingIndicator) typingIndicator.classList.add('hidden');
            addMessage("Sorry, a connection error occurred.", 'bot');
            eventSource.close();
        };
    };

    // --- Event Listeners ---
    messageForm.addEventListener('submit', handleFormSubmit);

    // --- Initial Load ---
    loadHistory();
});
