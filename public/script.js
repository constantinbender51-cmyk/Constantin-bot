document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const chatWindow = document.getElementById('chat-window');
    const messageForm = document.getElementById('chat-form'); // Correctly targets your form ID
    const messageInput = document.getElementById('message-input');
    const placeholder = document.getElementById('placeholder');
    const typingIndicator = document.getElementById('typing-indicator'); // Assuming this exists and is correctly hidden/shown

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
                        // Use the correct addMessage function for historical messages
                        addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    };

    // --- YOUR PREFERRED addMessage FUNCTION, ADAPTED ---
    // This function now correctly handles the class names and insertion order.
    const addMessage = (text, sender, messageId = null) => {
        const messageElement = document.createElement('div');
        // Use the 'sender' variable to set the correct class name
        messageElement.classList.add('message', `${sender}-message`); 
        if (messageId) {
            messageElement.id = messageId;
        }

        const bubble = document.createElement('div'); // Create a bubble for the text
        bubble.classList.add('bubble'); // Add bubble class
        bubble.textContent = text;
        messageElement.appendChild(bubble); // Append bubble to message element

        if (sender === 'user') {
            const checkmark = document.createElement('span'); // Use span for checkmark
            checkmark.classList.add('checkmark');
            checkmark.innerHTML = '&#10003;'; // Checkmark symbol
            bubble.appendChild(checkmark); // Append checkmark inside the bubble
        }

        // Insert the new message BEFORE the typing indicator
        // This ensures messages appear above the indicator, and the indicator stays at the bottom.
        chatWindow.insertBefore(messageElement, typingIndicator); 
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (!messageText) return;

        if (placeholder) placeholder.style.display = 'none';
        
        const messageId = `msg-${Date.now()}`;
        addMessage(messageText, 'user', messageId); // Add user message to UI
        messageInput.value = ''; // Clear input field
        
        // Show typing indicator
        if (typingIndicator) typingIndicator.classList.remove('hidden');

        const queryParams = new URLSearchParams({
            message: messageText,
            isNewSession: isNewSession
        }).toString();

        isNewSession = false; // After the first message, it's no longer a new session

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
                addMessage(data.reply, 'bot'); // Add bot's reply to UI
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
