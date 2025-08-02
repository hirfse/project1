// public/js/preventBack.js
document.addEventListener('DOMContentLoaded', () => {
    if (window.preventBack) {
        console.log('Preventing back navigation');
        history.pushState(null, null, window.location.href);
        window.onpopstate = function () {
            console.log('Back button detected, redirecting to login');
            history.pushState(null, null, window.location.href);
            window.location.replace('/login?error=Session expired');
        };
    } else {
        console.log('preventBack flag not set');
    }
});