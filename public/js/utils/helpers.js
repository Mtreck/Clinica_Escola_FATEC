// js/utils/helpers.js
export function formatDateTime(ts) {
    if (!ts) return '';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return { date: d.toLocaleDateString('pt-BR'), time: d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) };
    } catch (e) {
        return { date: '', time: '' };
    }
}