// js/agendamentos/Busca_avancada.js
import { db } from "../firebase.js";
import { displaySearchResults } from "../documentacao.js";

export function setupAdvancedSearch() {
    const typeSelect = document.getElementById('search-type-select');
    const inputGroupField = document.getElementById('search-input-group-field');
    const searchButton = document.getElementById('search-agenda-btn');
    // ⛔ Não estamos na tela de agendamentos
    if (!typeSelect || !inputGroupField || !searchButton) return;

    function updateInputField(type) {
        inputGroupField.innerHTML = '';
        let html = '';
        switch (type) {
            case 'room':
                html = `<label for="advanced-search-value">Selecione a Sala:</label><select id="advanced-search-value"><option value="">-- Todas as Salas --</option></select>`;
                break;
            case 'student':
                html = `<label for="advanced-search-value">Nome do Estagiário (Parcial):</label><input id="advanced-search-value" type="text" placeholder="Ex: Maria">`;
                break;
            case 'date':
                html = `<label for="advanced-search-value">Selecione a Data:</label><input id="advanced-search-value" type="date">`;
                break;
            default:
                html = `<label style="color:#555;">Visualizando resumo de hoje</label>`;
        }
        inputGroupField.innerHTML = html;
        if (type === 'room') {
            const sel = document.getElementById('advanced-search-value');
            for (let i = 1; i <= 7; i++) {
                const opt = document.createElement('option'); opt.value = `Sala ${i}`; opt.textContent = `Sala ${i}`; sel.appendChild(opt);
            }
        }
    }

    updateInputField(typeSelect.value);
    typeSelect.addEventListener('change', e => updateInputField(e.target.value));
    searchButton.addEventListener('click', performAdvancedSearch);
}

async function performAdvancedSearch() {
    const type = document.getElementById('search-type-select').value;
    const resultsContainer = document.getElementById('search-results-table');
    const inputEl = document.getElementById('advanced-search-value');
    const value = inputEl ? inputEl.value.trim() : '';
    resultsContainer.innerHTML = '<p style="text-align:center;">Buscando resultados...</p>';

    try {
        let query = db.collection('agendamentos').orderBy('data_hora', 'asc');
        let start = null, end = null, title = 'Resultados da Pesquisa';

        switch (type) {
            case 'today':
                start = new Date(); start.setHours(0, 0, 0, 0);
                end = new Date(start); end.setDate(end.getDate() + 1);
                title = `Agenda de Hoje (${start.toLocaleDateString('pt-BR')})`;
                break;
            case 'date':
                start = new Date(value); start.setHours(0, 0, 0, 0); end = new Date(start); end.setDate(end.getDate() + 1);
                title = `Agendamentos na data: ${start.toLocaleDateString('pt-BR')}`;
                break;
            case 'room':
                if (value) query = query.where('sala', '==', value);
                const now = new Date(); start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                title = value ? `Agendamentos para a Sala: ${value}` : 'Agendamentos para Todas as Salas (Mês Atual)';
                break;
            case 'student':
                title = `Agendamentos do Estagiário: "${value}" (Histórico)`;
                break;
        }

        if (start && end) {
            query = query.where('data_hora', '>=', firebase.firestore.Timestamp.fromDate(start)).where('data_hora', '<', firebase.firestore.Timestamp.fromDate(end));
        }

        const snap = await query.get();
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (type === 'student' && value) {
            const searchLower = value.toLowerCase();
            results = results.filter(r => (r.estagiario_nome || '').toLowerCase().includes(searchLower));
        }

        displaySearchResults(results, title, resultsContainer);
    } catch (e) {
        console.error('performAdvancedSearch', e);
        resultsContainer.innerHTML = '<p style="color:red;">Erro ao executar a pesquisa.</p>';
    }
}