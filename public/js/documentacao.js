// js/documentacao.js
import { db } from "./firebase.js";
import { customConfirm } from "./utils/confirm.js";
import { showNotification } from "./utils/notificacao.js";

// ======================================================
//   CONTROLE DE DOCUMENTAÇÃO — POR DUPLA
// ======================================================
// Substitui o antigo modelo (1 registro de documentação por atendimento).
// A secretaria lança manualmente cada atendimento contra a dupla responsável;
// agendar uma sessão no calendário não cria mais nada aqui automaticamente.

let cachedDuplas = null; // [{ id, nome, ativo, lancamentos: [...] }]
const expandedIds = new Set();
let editingNomeId = null;
let _delegationInitialized = false;

export async function initDuplasControl() {
    setupToolbar();
    setupNovaDupla();
    setupCsvButton();
    if (!_delegationInitialized) {
        setupListDelegation();
        _delegationInitialized = true;
    }
    await loadDuplasList();
}

// ======================================================
//                  CARREGAR DADOS
// ======================================================
export async function loadDuplasList() {
    const container = document.getElementById('duplas-list');
    if (!container) return;

    if (!cachedDuplas) {
        container.innerHTML = '<p class="duplas-empty-state">Carregando duplas...</p>';
    }

    try {
        const [duplasSnap, lancamentosSnap] = await Promise.all([
            db.collection('duplas').get(),
            db.collectionGroup('lancamentos').get()
        ]);

        const lancamentosPorDupla = {};
        lancamentosSnap.forEach(doc => {
            const duplaId = doc.ref.parent.parent.id;
            if (!lancamentosPorDupla[duplaId]) lancamentosPorDupla[duplaId] = [];
            lancamentosPorDupla[duplaId].push({ id: doc.id, ...doc.data() });
        });

        cachedDuplas = duplasSnap.docs.map(doc => {
            const lancamentos = (lancamentosPorDupla[doc.id] || [])
                .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
            return { id: doc.id, ...doc.data(), lancamentos };
        });

        renderDuplasList();
    } catch (e) {
        console.error('loadDuplasList', e);
        container.innerHTML = '<p class="duplas-empty-state">Erro ao carregar as duplas. Verifique sua conexão ou permissões.</p>';
    }
}

// ======================================================
//                  RENDERIZAÇÃO
// ======================================================
function renderDuplasList() {
    const container = document.getElementById('duplas-list');
    const summary = document.getElementById('duplas-summary');
    if (!container || !cachedDuplas) return;

    const searchInput = document.getElementById('duplas-search-input');
    const showArchived = document.getElementById('duplas-show-archived');
    const termo = (searchInput?.value || '').trim().toLowerCase();
    const mostrarArquivadas = showArchived?.checked || false;

    let lista = cachedDuplas.filter(d => mostrarArquivadas || d.ativo !== false);
    if (termo) {
        lista = lista.filter(d => (d.nome || '').toLowerCase().includes(termo));
    }

    lista = lista.map(d => {
        const pendentes = d.lancamentos.filter(l => !l.entregue).length;
        const entregues = d.lancamentos.length - pendentes;
        return { ...d, pendentes, entregues };
    });

    // Quem ainda tem pendência sobe para o topo; empate resolvido por ordem alfabética
    lista.sort((a, b) => {
        if (b.pendentes !== a.pendentes) return b.pendentes - a.pendentes;
        return (a.nome || '').localeCompare(b.nome || '');
    });

    if (summary) {
        const totalAtivas = cachedDuplas.filter(d => d.ativo !== false).length;
        const totalPendentes = cachedDuplas
            .filter(d => d.ativo !== false)
            .reduce((sum, d) => sum + d.lancamentos.filter(l => !l.entregue).length, 0);

        summary.textContent = totalAtivas === 0
            ? ''
            : `${totalAtivas} dupla${totalAtivas === 1 ? '' : 's'} ativa${totalAtivas === 1 ? '' : 's'} · ${totalPendentes} atendimento${totalPendentes === 1 ? '' : 's'} pendente${totalPendentes === 1 ? '' : 's'} de documentação`;
    }

    if (lista.length === 0) {
        container.innerHTML = `<p class="duplas-empty-state">${termo
            ? 'Nenhuma dupla encontrada para essa busca.'
            : 'Nenhuma dupla cadastrada ainda. Use "+ Nova Dupla" acima para começar.'
            }</p>`;
        return;
    }

    container.innerHTML = lista.map(renderDuplaItem).join('');
}

function renderDuplaItem(dupla) {
    const isExpanded = expandedIds.has(dupla.id);
    const isEditingNome = editingNomeId === dupla.id;
    const isArchived = dupla.ativo === false;

    const badges = [];
    if (dupla.pendentes > 0) {
        badges.push(`<span class="status-pending">${dupla.pendentes} pendente${dupla.pendentes === 1 ? '' : 's'}</span>`);
    } else {
        badges.push('<span class="status-ok">Em dia</span>');
    }
    if (dupla.entregues > 0) {
        badges.push(`<span class="status-default">${dupla.entregues} entregue${dupla.entregues === 1 ? '' : 's'}</span>`);
    }

    const nomeHtml = isEditingNome
        ? `<input type="text" class="dupla-nome-input" data-id="${dupla.id}" value="${escapeAttr(dupla.nome || '')}">`
        : `<span class="dupla-nome">${escapeHtml(dupla.nome || '')}</span>`;

    const nomeActionsHtml = isEditingNome
        ? `<button type="button" class="dupla-nome-save" data-id="${dupla.id}" title="Salvar nome">✔</button>
           <button type="button" class="dupla-nome-cancel" title="Cancelar">✖</button>`
        : `<button type="button" class="dupla-rename" data-id="${dupla.id}" title="Renomear dupla">✎</button>
           <button type="button" class="dupla-archive" data-id="${dupla.id}" data-ativo="${dupla.ativo !== false}" title="${isArchived ? 'Reativar dupla' : 'Arquivar dupla'}">${isArchived ? '↺' : '🗄'}</button>`;

    return `
        <div class="dupla-item ${isExpanded ? 'expanded' : ''} ${isArchived ? 'arquivada' : ''}" data-id="${dupla.id}">
            <div class="dupla-header" data-id="${dupla.id}">
                <span class="dupla-chevron">▶</span>
                ${nomeHtml}
                <div class="dupla-badges">${badges.join('')}</div>
                <div class="dupla-actions">${nomeActionsHtml}</div>
            </div>
            <div class="dupla-panel-wrapper">
                <div class="dupla-panel">
                    <div class="dupla-panel-inner">
                        <form class="add-lancamento-form" data-id="${dupla.id}">
                            <input type="date" class="add-lancamento-date" value="${todayStr()}" required>
                            <input type="text" class="add-lancamento-obs" placeholder="Observação (opcional)">
                            <button type="submit" class="btn-secondary">+ Lançar Atendimento</button>
                        </form>
                        ${renderLancamentosList(dupla)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderLancamentosList(dupla) {
    if (!dupla.lancamentos || dupla.lancamentos.length === 0) {
        return '<p class="dupla-panel-empty">Nenhum atendimento lançado ainda. Use o campo acima para começar.</p>';
    }

    const rows = dupla.lancamentos.map(l => `
        <div class="lancamento-row" data-dupla-id="${dupla.id}" data-id="${l.id}">
            <label>
                <input type="checkbox" class="lancamento-check" data-dupla-id="${dupla.id}" data-id="${l.id}" ${l.entregue ? 'checked' : ''}>
                Entregue
            </label>
            <span class="lancamento-date">${formatDataStr(l.data)}</span>
            <span class="lancamento-obs">${escapeHtml(l.observacao || '')}</span>
            <button type="button" class="lancamento-remove" data-dupla-id="${dupla.id}" data-id="${l.id}" title="Remover lançamento">✖</button>
        </div>
    `).join('');

    return `<div class="lancamentos-list">${rows}</div>`;
}

// ======================================================
//                  TOOLBAR (busca / arquivadas)
// ======================================================
function setupToolbar() {
    const searchInput = document.getElementById('duplas-search-input');
    const showArchived = document.getElementById('duplas-show-archived');

    let searchTimeout;
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => renderDuplasList(), 300);
        });
    }

    if (showArchived && !showArchived.dataset.bound) {
        showArchived.dataset.bound = 'true';
        showArchived.addEventListener('change', () => renderDuplasList());
    }
}

// ======================================================
//                  CRIAR NOVA DUPLA (INLINE)
// ======================================================
function setupNovaDupla() {
    const toggleBtn = document.getElementById('nova-dupla-toggle-btn');
    const form = document.getElementById('nova-dupla-form');
    const cancelBtn = document.getElementById('nova-dupla-cancel-btn');
    const nomeInput = document.getElementById('nova-dupla-nome');
    if (!toggleBtn || !form || !cancelBtn || !nomeInput) return;

    if (toggleBtn.dataset.bound) return;
    toggleBtn.dataset.bound = 'true';

    toggleBtn.addEventListener('click', () => {
        form.classList.remove('hidden');
        toggleBtn.classList.add('hidden');
        nomeInput.focus();
    });

    cancelBtn.addEventListener('click', () => {
        form.reset();
        form.classList.add('hidden');
        toggleBtn.classList.remove('hidden');
    });

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = nomeInput.value.trim();
        if (!nome) return;

        try {
            await db.collection('duplas').add({
                nome,
                ativo: true,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            form.reset();
            form.classList.add('hidden');
            toggleBtn.classList.remove('hidden');
            showNotification('Dupla adicionada.', 'success');
            await loadDuplasList();
        } catch (e) {
            console.error('criar dupla', e);
            showNotification('Erro ao adicionar dupla.', 'error');
        }
    });
}

// ======================================================
//   DELEGAÇÃO DE EVENTOS DA LISTA (expandir, renomear,
//   arquivar, lançar/alternar/remover atendimento)
// ======================================================
function setupListDelegation() {
    const container = document.getElementById('duplas-list');
    if (!container) return;

    container.addEventListener('click', async (ev) => {
        // Digitar no campo de renomear não deve expandir/colapsar o painel
        if (ev.target.closest('.dupla-nome-input')) return;

        const renameBtn = ev.target.closest('.dupla-rename');
        const archiveBtn = ev.target.closest('.dupla-archive');
        const saveBtn = ev.target.closest('.dupla-nome-save');
        const cancelBtn = ev.target.closest('.dupla-nome-cancel');
        const removeBtn = ev.target.closest('.lancamento-remove');
        const header = ev.target.closest('.dupla-header');

        if (renameBtn) {
            editingNomeId = renameBtn.dataset.id;
            renderDuplasList();
            return;
        }

        if (cancelBtn) {
            editingNomeId = null;
            renderDuplasList();
            return;
        }

        if (saveBtn) {
            const id = saveBtn.dataset.id;
            const input = container.querySelector(`.dupla-nome-input[data-id="${id}"]`);
            const novoNome = input ? input.value.trim() : '';
            if (!novoNome) {
                showNotification('Digite um nome válido.', 'warning');
                return;
            }
            try {
                await db.collection('duplas').doc(id).update({ nome: novoNome });
                editingNomeId = null;
                showNotification('Nome atualizado.', 'success');
                await loadDuplasList();
            } catch (e) {
                console.error('renomear dupla', e);
                showNotification('Erro ao renomear a dupla.', 'error');
            }
            return;
        }

        if (archiveBtn) {
            const id = archiveBtn.dataset.id;
            const estaAtiva = archiveBtn.dataset.ativo === 'true';
            const confirmed = await customConfirm(
                estaAtiva
                    ? 'Deseja arquivar esta dupla? O histórico de lançamentos é mantido e ela pode ser reativada depois.'
                    : 'Deseja reativar esta dupla?',
                estaAtiva ? 'Arquivar Dupla' : 'Reativar Dupla',
                estaAtiva ? 'Arquivar' : 'Reativar',
                estaAtiva ? '#f59e0b' : '#10b981'
            );
            if (!confirmed) return;
            try {
                await db.collection('duplas').doc(id).update({ ativo: !estaAtiva });
                showNotification(estaAtiva ? 'Dupla arquivada.' : 'Dupla reativada.', 'success');
                await loadDuplasList();
            } catch (e) {
                console.error('arquivar dupla', e);
                showNotification('Erro ao atualizar a dupla.', 'error');
            }
            return;
        }

        if (removeBtn) {
            const duplaId = removeBtn.dataset.duplaId;
            const lancId = removeBtn.dataset.id;
            const confirmed = await customConfirm('Deseja remover este lançamento?', 'Remover Lançamento', 'Remover', '#dc3545');
            if (!confirmed) return;
            try {
                await db.collection('duplas').doc(duplaId).collection('lancamentos').doc(lancId).delete();
                showNotification('Lançamento removido.', 'success');
                await loadDuplasList();
            } catch (e) {
                console.error('remover lançamento', e);
                showNotification('Erro ao remover o lançamento.', 'error');
            }
            return;
        }

        // O clique no cabeçalho só expande/colapsa se nenhuma ação acima já tratou o evento
        if (header) {
            const id = header.dataset.id;
            if (expandedIds.has(id)) expandedIds.delete(id);
            else expandedIds.add(id);
            header.closest('.dupla-item').classList.toggle('expanded');
        }
    });

    container.addEventListener('change', async (ev) => {
        const check = ev.target.closest('.lancamento-check');
        if (!check) return;

        const duplaId = check.dataset.duplaId;
        const lancId = check.dataset.id;
        const entregue = check.checked;

        try {
            await db.collection('duplas').doc(duplaId).collection('lancamentos').doc(lancId).update({
                entregue,
                dataEntrega: entregue ? firebase.firestore.FieldValue.serverTimestamp() : null
            });
            await loadDuplasList();
        } catch (e) {
            console.error('atualizar status do lançamento', e);
            showNotification('Erro ao atualizar o status.', 'error');
            check.checked = !entregue;
        }
    });

    container.addEventListener('submit', async (ev) => {
        const form = ev.target.closest('.add-lancamento-form');
        if (!form) return;
        ev.preventDefault();

        const duplaId = form.dataset.id;
        const data = form.querySelector('.add-lancamento-date').value;
        const observacao = form.querySelector('.add-lancamento-obs').value.trim();
        if (!data) return;

        try {
            expandedIds.add(duplaId); // mantém o painel aberto após o recarregamento
            await db.collection('duplas').doc(duplaId).collection('lancamentos').add({
                data,
                observacao,
                entregue: false,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            showNotification('Atendimento lançado.', 'success');
            await loadDuplasList();
        } catch (e) {
            console.error('lançar atendimento', e);
            showNotification('Erro ao lançar o atendimento.', 'error');
        }
    });
}

// ======================================================
//                  RELATÓRIO CSV
// ======================================================
function setupCsvButton() {
    const btn = document.getElementById('generate-duplas-report');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', generateDuplasCSV);
}

function generateDuplasCSV() {
    if (!cachedDuplas || cachedDuplas.length === 0) {
        showNotification('Nenhum dado para gerar o relatório.', 'warning');
        return;
    }

    let csv = 'Dupla;Data;Status;Observação\n';
    let linhas = 0;

    cachedDuplas.forEach(dupla => {
        if (!dupla.lancamentos || dupla.lancamentos.length === 0) return;
        dupla.lancamentos
            .slice()
            .sort((a, b) => (a.data || '').localeCompare(b.data || ''))
            .forEach(l => {
                const status = l.entregue ? 'Entregue' : 'Pendente';
                const obs = (l.observacao || '').replace(/;/g, ',');
                csv += `${dupla.nome || ''};${formatDataStr(l.data)};${status};${obs}\n`;
                linhas++;
            });
    });

    if (linhas === 0) {
        showNotification('Nenhum atendimento lançado para gerar o relatório.', 'warning');
        return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `controle-documentacao-${todayStr()}.csv`;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(url);
    link.remove();

    showNotification('Relatório CSV gerado com sucesso!', 'success');
}

// ======================================================
//                  HELPERS
// ======================================================
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDataStr(dataStr) {
    if (!dataStr) return '';
    const [y, m, d] = dataStr.split('-');
    return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function escapeAttr(str) {
    return escapeHtml(str);
}

// ======================================================
//   Export para a Pesquisa Avançada de Agenda (aba
//   Agendamentos) — não relacionado ao controle por dupla.
// ======================================================
export function displaySearchResults(results, title, container) {
    if (!container) container = document.getElementById("search-results-table");

    let html = `<h4>${title} (${results.length} resultados)</h4>`;

    if (results.length === 0) {
        container.innerHTML = html + "<p>Nenhum agendamento encontrado.</p>";
        return;
    }

    html += `
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Hora</th>
                    <th>Estagiário</th>
                    <th>Sala</th>
                    <th>Teste</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach((r) => {
        const d = r.data_hora?.toDate() || new Date();
        const dataFormatada = d.toLocaleDateString("pt-BR");
        const horaFormatada = d.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        });

        let statusText = "Pendente";
        let statusClass = "status-default";

        if (r.falta_registrada) {
            statusText = "FALTA";
            statusClass = "status-falta";
        } else if (r.presenca_aluno) {
            statusText = "Presença confirmada";
            statusClass = "status-ok";
        }

        html += `
            <tr>
                <td data-label="Data">${dataFormatada}</td>
                <td data-label="Hora">${horaFormatada}</td>
                <td data-label="Estagiário">${r.estagiario_nome}</td>
                <td data-label="Sala">${r.sala || "N/A"}</td>
                <td data-label="Teste">${r.teste_usado || ""}</td>
                <td data-label="Status"><span class="${statusClass}">${statusText}</span></td>
            </tr>
        `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}
