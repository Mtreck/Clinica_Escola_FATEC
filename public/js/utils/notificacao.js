// js/utils/notificacao.js
export function showNotification(message, type = "success") {
    const container = document.getElementById('notification-container');
    const msg = document.getElementById('notification-message');
    if (!container || !msg) return;

    container.className = "";
    container.classList.remove('hidden');
    container.classList.add(`notification-${type}`);
    msg.textContent = message;

    // animação: remove depois de 3.5s
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
    clearTimeout(container._timeout);
    container._timeout = setTimeout(() => {
        container.style.transform = 'translateY(-40px)';
        container.style.opacity = '0';
        setTimeout(() => container.classList.add('hidden'), 300);
    }, 3500);
}