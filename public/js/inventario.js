// js/inventario.js
import { db } from "./firebase.js";
import { showNotification } from "./utils/notificacao.js";
import { customConfirm } from "./utils/confirm.js";

// ======================================================
//                  LISTAGEM DO INVENTÁRIO
// ======================================================

export async function loadInventoryList() {
    const listContainer = document.getElementById('inventory-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="loading-message">Carregando inventário...</p>';

    try {
        const snap = await db.collection('estoque_testes').orderBy('nome_teste', 'asc').get();

        if (snap.empty) {
            listContainer.innerHTML = '<p class="empty-message">Nenhum teste cadastrado.</p>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Teste</th>
                        <th>Estoque Atual</th>
                        <th>Alerta Mínimo</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snap.docs.forEach(doc => {
            const d = doc.data();
            const id = doc.id;
            const hasComponents = d.tipo === "multiplo";

            let estoque = 0;
            let alerta = 0;

            if (hasComponents && Array.isArray(d.componentes)) {
                // Soma total de componentes (pode não ser a métrica ideal, mas serve de resumo)
                estoque = d.componentes.reduce((total, c) => total + (c.quantidade_atual ?? 0), 0);

                // Pega o menor alerta definido
                alerta = d.componentes.reduce((min, c) => {
                    const a = c.alerta_minimo ?? 0;
                    return min === null ? a : Math.min(min, a);
                }, null);
            } else {
                estoque = d.quantidade_atual || 0;
                alerta = d.alerta_minimo || 0;
            }

            let statusClass = 'status-ok';
            let statusText = 'OK';

            if (estoque <= alerta) {
                statusClass = 'status-expired';
                statusText = 'ALERTA!';
            }
            if (estoque === 0) {
                statusText = 'ESGOTADO!';
                statusClass = 'status-falta';
            }

            let actionsHtml = '';

            if (hasComponents) {
                actionsHtml = `
                    <button class="action-button action-manage-components" data-id="${id}">
                        Gerenciar Estoque
                    </button>
                    <button class="action-delete-test" data-id="${id}" data-nome="${d.nome_teste}">
                        Apagar
                    </button>
                `;
            } else {
                actionsHtml = `
                    <button class="action-adjust-stock add" data-id="${id}" data-nome="${d.nome_teste}" title="Adicionar">+ Add</button>
                    <button class="action-adjust-stock remove" data-id="${id}" data-nome="${d.nome_teste}" title="Remover">- Rem</button>
                    <button class="action-delete-test" data-id="${id}" data-nome="${d.nome_teste}">Apagar</button>
                `;
            }

            html += `
                <tr data-id="${id}">
                    <td data-label="Teste">
                        <strong>${d.nome_teste}</strong>
                        ${hasComponents ? '<br><small>(Multicomponente)</small>' : ''}
                    </td>
                    <td data-label="Estoque Atual"><span class="badge-stock">${estoque}</span></td>
                    <td data-label="Alerta">${alerta}</td>
                    <td data-label="Status"><span class="${statusClass}">${statusText}</span></td>
                    <td data-label="Ações">${actionsHtml}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        listContainer.innerHTML = html;

        // Delegação de eventos
        addInventoryEventListeners();

    } catch (e) {
        console.error('loadInventoryList', e);
        listContainer.innerHTML = '<p class="error-message">Erro ao carregar inventário.</p>';
    }
}

function addInventoryEventListeners() {
    // Ajuste Estoque Simples
    document.querySelectorAll('.action-adjust-stock').forEach(b =>
        b.addEventListener('click', handleStockAdjustment));

    // Apagar Teste
    document.querySelectorAll('.action-delete-test').forEach(b =>
        b.addEventListener('click', deleteTest));

    // Gerenciar Componentes
    document.querySelectorAll('.action-manage-components').forEach(b =>
        b.addEventListener('click', openComponentsModal));
}

// ======================================================
//                  NOVO TESTE (MODAL)
// ======================================================

export function showAddTestModal() {
    resetNewTestForm();
    document.getElementById('new-test-modal').classList.remove('hidden');

    // Configura listeners do modal apenas uma vez se possível, 
    // ou garante que não duplique (a inicialização em dashboard.js cuida disso, 
    // mas precisamos configurar o comportamento dinâmico aqui)
    setupDynamicComponents();
}

export function setupTestTypeToggle() {
    const oldSelect = document.getElementById("new-test-type");
    const simpleFields = document.getElementById("simple-test-fields");
    const multiFields = document.getElementById("multi-test-fields");

    if (!oldSelect || !simpleFields || !multiFields) return;

    // Clone para limpar listeners antigos
    const newSelect = oldSelect.cloneNode(true);
    oldSelect.parentNode.replaceChild(newSelect, oldSelect);

    const update = () => {
        if (newSelect.value === "multiplo") {
            simpleFields.classList.add("hidden");
            multiFields.classList.remove("hidden");
        } else {
            simpleFields.classList.remove("hidden");
            multiFields.classList.add("hidden");
        }
    };

    newSelect.addEventListener("change", update);

    // Inicializa estado atual
    update();
}

function setupDynamicComponents() {
    const container = document.getElementById("components-container");
    const addBtn = document.getElementById("add-component-btn");

    if (!container || !addBtn) return;

    // Garante que o container comece limpo ou com 1 linha
    if (container.children.length === 0) {
        addComponentRow();
    }

    // Listener do botão de adicionar
    // Usamos replace para remover listeners antigos
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);

    newBtn.addEventListener("click", addComponentRow);
}

function addComponentRow() {
    const container = document.getElementById("components-container");
    const row = document.createElement("div");
    row.classList.add("component-row");

    row.innerHTML = `
        <div class="component-grid">
            <div class="field">
                <label>Nome do componente</label>
                <input type="text" class="component-name" placeholder="Ex: Folha de Resposta" required>
            </div>
            <div class="field">
                <label>Quantidade Inicial</label>
                <input type="number" class="component-qty" min="0" value="0">
            </div>
            <div class="field">
                <label>Alerta Mínimo</label>
                <input type="number" class="component-alert" min="0" value="5">
            </div>
            <div class="field remove-field">
                <button type="button" class="action-delete remove-component-btn" title="Remover">✖</button>
            </div>
        </div>
    `;

    row.querySelector(".remove-component-btn").addEventListener("click", () => row.remove());
    container.appendChild(row);
}

export async function saveNewTest() {
    const nome = document.getElementById("new-test-name")?.value.trim();
    const tipo = document.getElementById("new-test-type")?.value;
    const errorMessage = document.getElementById('new-test-error');

    if (errorMessage) errorMessage.textContent = '';

    if (!nome) {
        errorMessage.textContent = "Digite um nome válido para o teste.";
        return;
    }

    try {
        // Validação de duplicidade
        const check = await db.collection("estoque_testes").where("nome_teste", "==", nome).limit(1).get();
        if (!check.empty) {
            errorMessage.textContent = "Já existe um teste cadastrado com esse nome.";
            return;
        }

        let dataToSave = { nome_teste: nome, tipo };

        if (tipo === "simples") {
            dataToSave.quantidade_atual = parseInt(document.getElementById("new-test-stock").value) || 0;
            dataToSave.alerta_minimo = parseInt(document.getElementById("new-test-alert").value) || 0;
        } else {
            // Teste Múltiplo
            const componentes = [];
            document.querySelectorAll("#components-container .component-row").forEach(row => {
                const cNome = row.querySelector(".component-name")?.value.trim();
                const cQtd = parseInt(row.querySelector(".component-qty")?.value) || 0;
                const cAlert = parseInt(row.querySelector(".component-alert")?.value) || 0;

                if (cNome) {
                    componentes.push({
                        nome: cNome,
                        quantidade_atual: cQtd,
                        alerta_minimo: cAlert
                    });
                }
            });

            if (componentes.length === 0) {
                errorMessage.textContent = "Adicione pelo menos um componente válido.";
                return;
            }
            dataToSave.componentes = componentes;
        }

        await db.collection("estoque_testes").add(dataToSave);

        showNotification(`Teste "${nome}" criado com sucesso!`, "success");
        document.getElementById("new-test-modal").classList.add("hidden");
        loadInventoryList();

    } catch (e) {
        console.error(e);
        errorMessage.textContent = "Erro ao salvar teste.";
        showNotification("Erro ao salvar.", "error");
    }
}

function resetNewTestForm() {
    document.getElementById("new-test-name").value = "";
    document.getElementById("new-test-type").value = "simples";
    document.getElementById("new-test-stock").value = 1;
    document.getElementById("new-test-alert").value = 5;
    document.getElementById("components-container").innerHTML = ""; // Limpa componentes
    document.getElementById("new-test-error").textContent = "";

    // Reinicializa visibilidade
    setupTestTypeToggle();
}

// ======================================================
//             AJUSTE DE ESTOQUE (SIMPLES)
// ======================================================

async function handleStockAdjustment(e) {
    const id = e.target.getAttribute('data-id');
    const nome = e.target.getAttribute('data-nome');
    const isAdding = e.target.classList.contains('add');

    let quantidade = prompt(`Quantas unidades deseja ${isAdding ? 'ADICIONAR' : 'REMOVER'} de "${nome}"?`);
    if (quantidade === null) return;

    quantidade = parseInt(quantidade);
    if (isNaN(quantidade) || quantidade <= 0) {
        showNotification('Quantidade inválida.', 'warning');
        return;
    }

    try {
        const ref = db.collection('estoque_testes').doc(id);

        if (isAdding) {
            await ref.update({
                quantidade_atual: firebase.firestore.FieldValue.increment(quantidade)
            });
            showNotification(`${quantidade} unidades adicionadas.`, 'success');
        } else {
            const doc = await ref.get();
            const current = doc.data().quantidade_atual || 0;

            if (current < quantidade) {
                const confirmed = await customConfirm(
                    `Estoque atual (${current}) é menor que a remoção (${quantidade}). Ficará negativo. Continuar?`,
                    'Estoque Negativo', 'Confirmar', '#ffc107'
                );
                if (!confirmed) return;
            }

            await ref.update({
                quantidade_atual: firebase.firestore.FieldValue.increment(-quantidade)
            });
            showNotification(`${quantidade} unidades removidas.`, 'success');
        }

        loadInventoryList();

    } catch (e) {
        console.error(e);
        showNotification('Erro ao ajustar estoque.', 'error');
    }
}

// ======================================================
//             GERENCIAR COMPONENTES (MODAL)
// ======================================================

async function openComponentsModal(e) {
    const id = e.target.closest('button').getAttribute('data-id');
    const modal = document.getElementById("components-modal");
    const container = document.getElementById("components-list");

    container.innerHTML = "Carregando componentes...";
    modal.classList.remove("hidden");

    try {
        const snap = await db.collection("estoque_testes").doc(id).get();
        if (!snap.exists) {
            container.innerHTML = "Erro: Teste não encontrado.";
            return;
        }

        const data = snap.data();
        document.getElementById("components-modal-title").textContent = `Gerenciar: ${data.nome_teste}`;

        if (!data.componentes || data.componentes.length === 0) {
            container.innerHTML = "<p>Sem componentes cadastrados.</p>";
            return;
        }

        let html = `
            <table class="components-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qtd Atual</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.componentes.forEach((c, idx) => {
            html += `
                <tr>
                    <td>${c.nome}</td>
                    <td><strong>${c.quantidade_atual}</strong></td>
                    <td>
                        <div class="adjust-group">
                            <input type="number" id="qtd-${idx}" value="1" min="1" style="width:60px;">
                            <button class="btn-primary comp-btn" data-idx="${idx}" data-action="add" data-doc="${id}">+</button>
                            <button class="btn-danger comp-btn" data-idx="${idx}" data-action="remove" data-doc="${id}">-</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Delegação para botões internos
        container.querySelectorAll('.comp-btn').forEach(btn => {
            btn.addEventListener('click', () => handleComponentAction(btn, data.componentes));
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = "Erro ao carregar dados.";
    }
}

async function handleComponentAction(btn, componentesAtuais) {
    const idx = parseInt(btn.dataset.idx);
    const docId = btn.dataset.doc;
    const action = btn.dataset.action;
    const input = document.getElementById(`qtd-${idx}`);
    const qtd = parseInt(input.value);

    if (isNaN(qtd) || qtd <= 0) {
        showNotification("Quantidade inválida.", "warning");
        return;
    }

    let novoVal = componentesAtuais[idx].quantidade_atual;
    if (action === "add") novoVal += qtd;
    else novoVal -= qtd;

    if (novoVal < 0) {
        showNotification("Estoque não pode ficar negativo.", "error");
        return;
    }

    // Atualiza localmente e salva
    componentesAtuais[idx].quantidade_atual = novoVal;

    try {
        await db.collection("estoque_testes").doc(docId).update({
            componentes: componentesAtuais
        });
        showNotification("Estoque atualizado!", "success");

        // Recarrega o modal para refletir mudanças
        openComponentsModal({ target: { closest: () => ({ getAttribute: () => docId }) } });

        // Atualiza a lista principal no fundo
        loadInventoryList();

    } catch (e) {
        console.error(e);
        showNotification("Erro ao atualizar.", "error");
    }
}

// ======================================================
//                  APAGAR TESTE
// ======================================================

async function deleteTest(e) {
    const id = e.target.getAttribute('data-id');
    const nome = e.target.getAttribute('data-nome');

    const confirmed = await customConfirm(
        `Tem certeza que deseja apagar o teste "${nome}" e todo seu histórico de estoque?`,
        "Apagar Teste", "Apagar Permanentemente", "#dc3545"
    );

    if (!confirmed) return;

    try {
        await db.collection('estoque_testes').doc(id).delete();
        showNotification("Teste apagado.", "success");
        loadInventoryList();
    } catch (e) {
        console.error(e);
        showNotification("Erro ao apagar.", "error");
    }
}

// ======================================================
//           ALERTA GERAL DE ESTOQUE BAIXO
// ======================================================

export async function checkLowStockAlerts() {
    try {
        const snap = await db.collection("estoque_testes").get();
        let alertas = [];

        snap.forEach(doc => {
            const d = doc.data();

            if (d.tipo === "simples") {
                const atual = Number(d.quantidade_atual);
                const min = Number(d.alerta_minimo); // Valor estipulado pelo usuário

                if (!isNaN(atual) && !isNaN(min) && atual <= min) {
                    alertas.push({
                        teste: d.nome_teste,
                        atual: atual
                    });
                }
            } else if (d.componentes && Array.isArray(d.componentes)) {
                d.componentes.forEach(c => {
                    const atual = Number(c.quantidade_atual);
                    const min = Number(c.alerta_minimo); // Valor estipulado pelo usuário

                    if (!isNaN(atual) && !isNaN(min) && atual <= min) {
                        alertas.push({
                            teste: d.nome_teste,
                            componente: c.nome,
                            atual: atual
                        });
                    }
                });
            }
        });

        console.log("Alertas de estoque encontrados:", alertas);
        return alertas;
    } catch (e) {
        console.error("Erro verificando alertas:", e);
        return [];
    }
}
