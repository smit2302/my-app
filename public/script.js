    // Utility functions for the chat app

    // Format timestamp
    function formatTime(date) {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }

    // Generate random color based on string
    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const colors = [
            '#667eea', '#764ba2', '#f093fb', '#f5576c',
            '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
            '#fa709a', '#fee140', '#a8edea', '#fed6e3'
        ];
        
        return colors[Math.abs(hash) % colors.length];
    }

    // Debounce function for search
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Validate username
    function isValidUsername(username) {
        return /^[a-zA-Z0-9_]{3,20}$/.test(username);
    }

    // Validate password
    function isValidPassword(password) {
        return password.length >= 6;
    }

    // Export for use in other files
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            formatTime,
            stringToColor,
            debounce,
            isValidUsername,
            isValidPassword
        };
    }