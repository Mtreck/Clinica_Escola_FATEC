// js/utils/confirm.js
export function customConfirm(message, title = 'Confirmação', confirmText = 'Confirmar', confirmColor = '#dc3545') {
    const modal = document.getElementById('custom-confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-button');
    const cancelBtn = document.getElementById('confirm-cancel-button');

    if (!modal || !okBtn || !cancelBtn || !titleEl || !messageEl) {
        // fallback para window.confirm sem travar em ambientes que não possuem modal
        return Promise.resolve(window.confirm(message));
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = confirmText;
    okBtn.style.backgroundColor = confirmColor;

    modal.classList.remove('hidden');

    return new Promise(resolve => {
        const clean = () => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.classList.add('hidden');
        };
        const onOk = () => { clean(); resolve(true); };
        const onCancel = () => { clean(); resolve(false); };
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
    });
}