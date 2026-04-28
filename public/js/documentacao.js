// js/documentacao.js
import { db } from "./firebase.js";
import { customConfirm } from "./utils/confirm.js";
import { showNotification } from "./utils/notificacao.js";

let _delegationInitialized = false;

// Variáveis de Cache e Paginação
let cachedSnapshot = null;
let lastFetchTime = 0;
let currentPage = 1;
const itemsPerPage = 50;

// ======================================================
//                  CARREGAR LISTA
// ======================================================
export async function loadDocumentationList(searchQuery = "", forceRefresh = false) {
    const listContainer = document.getElementById("documentation-list");
    if (!listContainer) return;

    if (!cachedSnapshot || forceRefresh) {
        listContainer.innerHTML = "<p style='text-align:center; padding: 2rem; color: #64748b;'>Carregando dados do banco...</p>";
    }

    try {
        const now = Date.now();
        // Busca no banco APENAS se não tiver cache, se for forçado, ou se passou 5 minutos
        if (forceRefresh || !cachedSnapshot || (now - lastFetchTime > 300000)) {
            cachedSnapshot = await db
                .collection("agendamentos")
                .orderBy("data_hora", "desc")
                .limit(500) // Traz os 500 mais recentes de uma vez e guarda na memória
                .get();
            lastFetchTime = now;
        }

        let filtered = cachedSnapshot.docs;

        // ======================================================
        // FILTRAGEM POR ABA
        // ======================================================
        const activeTabBtn = document.querySelector(".doc-tab-btn.active");
        const activeFilter = activeTabBtn ? activeTabBtn.getAttribute("data-filter") : "pendente_presenca";

        filtered = filtered.filter(doc => {
            const data = doc.data();
            if (activeFilter === "pendente_presenca") {
                return !data.presenca_aluno;
            } else if (activeFilter === "doc_pendente") {
                return data.presenca_aluno && !data.doc_entregue;
            } else if (activeFilter === "concluido") {
                return data.presenca_aluno && data.doc_entregue;
            }
            return true;
        });

        // ======================================================
        // FILTRAGEM POR MÊS
        // ======================================================
        const monthSelect = document.getElementById("documentation-month-filter");
        
        if (monthSelect) {
            // Extrair meses únicos dentro dos itens que passaram pelo filtro de Aba
            const availableMonths = new Set();
            filtered.forEach(doc => {
                const dt = doc.data().data_hora?.toDate();
                if (dt) availableMonths.add(`${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`);
            });
            const sortedMonths = Array.from(availableMonths).sort((a, b) => {
                const [mA, yA] = a.split('/');
                const [mB, yB] = b.split('/');
                return new Date(yB, mB - 1) - new Date(yA, mA - 1); // mais recente primeiro
            });

            // Guardar mês que estava selecionado
            let currentSelectedMonth = monthSelect.value;

            if (!monthSelect.hasAttribute("data-user-changed")) {
                const now = new Date();
                currentSelectedMonth = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
            }
            
            // Recriar lista de opções
            monthSelect.innerHTML = '<option value="all">Todos os Meses</option>';
            sortedMonths.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                if (m === currentSelectedMonth) opt.selected = true;
                monthSelect.appendChild(opt);
            });

            // Aplicar o filtro na variavel filtered, usando o mês que acabou ficando selecionado
            if (monthSelect.value !== "all") {
                filtered = filtered.filter(doc => {
                    const dt = doc.data().data_hora?.toDate();
                    if (!dt) return false;
                    const mesAno = `${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
                    return mesAno === monthSelect.value;
                });
            }
        }

        // ======================================================
        // 🔍 BUSCA INTELIGENTE: NOME OU DATA NO MESMO INPUT
        // ======================================================
        if (searchQuery) {
            let termo = searchQuery.trim().toLowerCase();

            // normaliza separador de data: transforma "-" em "/"
            const termoNormalizado = termo.replace(/-/g, "/");

            const temLetra = /[a-zA-Z]/.test(termoNormalizado);

            if (temLetra) {
                // -------- BUSCA POR NOME DO ESTAGIÁRIO --------
                filtered = filtered.filter(doc => {
                    const nome = (doc.data().estagiario_nome || "").toLowerCase();
                    return nome.includes(termoNormalizado);
                });
            } else {
                // -------- BUSCA POR DATA --------
                // exemplo: 11/12, 11/12/2025, 11-12, 11-12-2025
                filtered = filtered.filter(doc => {
                    const dataHora = doc.data().data_hora;
                    if (!dataHora) return false;

                    const dt = dataHora.toDate();
                    const dataStr = dt
                        .toLocaleDateString("pt-BR") // ex: "11/12/2025"
                        .toLowerCase();

                    // compara apenas por "includes" (permite 11/12 ou 11/12/2025)
                    return dataStr.includes(termoNormalizado);
                });
            }
        }
        // ======================================================

        if (filtered.length === 0) {
            listContainer.innerHTML = `<p style='text-align:center; padding: 2rem; color: #64748b;'>Nenhum resultado encontrado.</p>`;
            return;
        }

        // ======================================================
        // PAGINAÇÃO (Corta a lista para mostrar apenas 50)
        // ======================================================
        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

        // montar tabela
        let html = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: #64748b;">
            <span>Mostrando <b>${paginated.length}</b> de <b>${totalItems}</b> registros (Página ${currentPage} de ${totalPages})</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Estagiário</th>
                    <th>Sala</th>
                    <th>Data</th>
                    <th>Teste</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>`;

        paginated.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            const dt = data.data_hora?.toDate();
            const dataFormatada = dt ? dt.toLocaleDateString("pt-BR") : "N/A";

            let statusClass = "status-default";
            let statusText = "Pendente";
            let actions = "";

            if (!data.presenca_aluno) {
                statusClass = "status-nao-atendido";
                statusText = "Não Atendido";

                actions = `
                    <button class="action-mark-presence" data-id="${id}">Presença</button>
                    <button class="action-mark-absence" data-id="${id}">Falta</button>
                    <button class="action-delete" data-id="${id}">Excluir</button>
                `;
            } else {
                if (data.doc_entregue) {
                    statusClass = "status-ok";
                    statusText = "Entregue";
                    actions = `
                        <button class="action-delete-completed" data-id="${id}">Apagar</button>
                    `;
                } else {
                    statusClass = "status-pending";
                    statusText = "Doc. Pendente";

                    actions = `
                        <button class="action-mark-delivered" data-id="${id}">Entregue</button>
                        <button class="action-delete" data-id="${id}">Excluir</button>
                    `;
                }
            }

            html += `
                <tr>
                    <td data-label="Estagiário">${data.estagiario_nome}</td>
                    <td data-label="Sala">${data.sala || "N/A"}</td>
                    <td data-label="Data">${dataFormatada}</td>
                    <td data-label="Teste">${data.teste_usado || ""}</td>
                    <td data-label="Status"><span class="${statusClass}">${statusText}</span></td>
                    <td data-label="Ações">${actions}</td>
                </tr>
            `;
        });

        html += "</tbody></table>";

        // ======================================================
        // CONTROLES DE PAGINAÇÃO (Botões Anterior e Próximo)
        // ======================================================
        if (totalPages > 1) {
            html += `
            <div style="display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem;">
                <button id="btn-prev-page" class="nav-button" ${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : 'style="background:#f1f5f9; color:#334155;"'}>⬅ Anterior</button>
                <span style="align-self: center; font-weight: 500; color: #475569;">Página ${currentPage}</span>
                <button id="btn-next-page" class="nav-button" ${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : 'style="background:#f1f5f9; color:#334155;"'}>Próxima ➡</button>
            </div>`;
        }

        listContainer.innerHTML = html;

        // Adiciona eventos aos botões de paginação recém-criados
        const btnPrev = document.getElementById("btn-prev-page");
        const btnNext = document.getElementById("btn-next-page");

        if (btnPrev && currentPage > 1) {
            btnPrev.addEventListener("click", () => {
                currentPage--;
                loadDocumentationList(searchQuery, false);
            });
        }
        if (btnNext && currentPage < totalPages) {
            btnNext.addEventListener("click", () => {
                currentPage++;
                loadDocumentationList(searchQuery, false);
            });
        }

    } catch (err) {
        console.error(err);
        listContainer.innerHTML = "<p style='color:red'>Erro ao carregar.</p>";
    }
}
// ======================================================
//   Export para busca avançada (mantido se necessário)
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

        if (r.doc_entregue && !r.falta_registrada) {
            statusText = "Concluído";
            statusClass = "status-ok";
        } else if (r.falta_registrada) {
            statusText = "FALTA (Encerrado)";
            statusClass = "status-falta";
        } else if (r.presenca_aluno) {
            statusText = "Doc. Pendente";
            statusClass = "status-pending";
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

// ======================================================
//      DELEGAÇÃO DE EVENTOS DOS BOTÕES
// ======================================================
export function initDocumentation() {
    if (_delegationInitialized) return;

    const container = document.getElementById("documentation-list");
    if (!container) return;


    container.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button");
        if (!btn) return;

        const id = btn.dataset.id;
        if (!id) return;

        // ===== PRESENÇA =====
        if (btn.classList.contains("action-mark-presence")) {
            const ok = await customConfirm(
                "Deseja registrar PRESENÇA?",
                "Confirmação de Presença",
                "Registrar Presença",
                "#28a745"
            );

            if (ok) {
                const mod = await import("./agendamentos/eventos.js");
                await handlePresenceWithStock(id);
                await loadDocumentationList("", true); // forceRefresh
                showNotification("Presença registrada!", "success");
            }
            return;
        }

        // ===== FALTA =====
        if (btn.classList.contains("action-mark-absence")) {
            const ok = await customConfirm(
                "Deseja registrar FALTA?",
                "Confirmação de Falta",
                "Registrar Falta",
                "#ffc107"
            );

            if (ok) {
                const mod = await import("./agendamentos/eventos.js");
                await mod.markAppointmentAsAbsent(id);
                await loadDocumentationList("", true); // forceRefresh
                showNotification("Falta registrada!", "warning");
            }
            return;
        }

        // ===== ENTREGUE =====
        if (btn.classList.contains("action-mark-delivered")) {
            const ok = await customConfirm(
                "Confirmar que o documento foi entregue?",
                "Confirmação",
                "Marcar Entregue",
                "#007bff"
            );

            if (ok) {
                await db.collection("agendamentos").doc(id).update({
                    doc_entregue: true
                });
                await loadDocumentationList("", true); // forceRefresh
                showNotification("Documento marcado como entregue!", "success");
            }
            return;
        }

        // ===== EXCLUIR =====
        if (btn.classList.contains("action-delete")) {
            const ok = await customConfirm(
                "Deseja excluir este agendamento?",
                "Excluir Registro",
                "Excluir",
                "#dc3545"
            );

            if (ok) {
                const mod = await import("./agendamentos/eventos.js");
                await mod.deleteAppointment(id);
                await loadDocumentationList("", true); // forceRefresh
                showNotification("Agendamento excluído!", "success");
            }
            return;
        }

        // ===== EXCLUIR CONCLUÍDO =====
        if (btn.classList.contains("action-delete-completed")) {
            const ok = await customConfirm(
                "Deseja apagar este registro concluído?",
                "Apagar Registro",
                "Apagar",
                "#dc3545"
            );

            if (ok) {
                await db.collection("agendamentos").doc(id).delete();
                await loadDocumentationList("", true); // forceRefresh
                showNotification("Registro apagado!", "success");
            }
            return;
        }
    });
    // ===== BUSCA POR ESTAGIÁRIO =====
    const searchInput = document.getElementById("documentation-search-input");
    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const termo = searchInput.value.trim();
                currentPage = 1; // Reseta para a primeira página ao buscar
                loadDocumentationList(termo, false);
            }, 600); // Aguarda 600ms após parar de digitar
        });
    }

    // ===== FILTRO POR MÊS =====
    const monthFilter = document.getElementById("documentation-month-filter");
    if (monthFilter) {
        monthFilter.addEventListener("change", () => {
            monthFilter.setAttribute("data-user-changed", "true");
            const termo = searchInput ? searchInput.value.trim() : "";
            currentPage = 1; // Reseta a paginação
            loadDocumentationList(termo, false);
        });
    }

    // ===== GERAR CSV =====
    const csvButton = document.getElementById("generate-general-report");
    if (csvButton) {
        csvButton.addEventListener("click", generateDocumentationCSV);
    }

    // ===== ABAS =====
    const tabBtns = document.querySelectorAll(".doc-tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => {
                b.classList.remove("active");
                b.style.color = "#64748b";
                b.style.borderBottom = "none";
                b.style.fontWeight = "500";
            });
            btn.classList.add("active");
            btn.style.color = "#4F76C9";
            btn.style.borderBottom = "3px solid #4F76C9";
            btn.style.fontWeight = "600";
            
            const searchInput = document.getElementById("documentation-search-input");
            currentPage = 1; // Reseta a paginação
            loadDocumentationList(searchInput ? searchInput.value.trim() : "", false);
        });
    });

    _delegationInitialized = true;
}
// ======================================================
//      GERAR CSV COMPLETO
// ======================================================
export async function generateDocumentationCSV() {
    try {
        const snapshot = await db
            .collection("agendamentos")
            .orderBy("data_hora", "desc")
            .get();

        if (snapshot.empty) {
            showNotification("Nenhum registro encontrado para gerar CSV.", "warning");
            return;
        }

        let csv = "Estagiário;Sala;Data;Teste;Status\n";

        snapshot.forEach(doc => {
            const data = doc.data();
            const dt = data.data_hora?.toDate();
            const dataFormatada = dt ? dt.toLocaleDateString("pt-BR") : "N/A";

            let status = "Pendente";

            if (!data.presenca_aluno) {
                status = "Não Atendido";
            } else if (data.doc_entregue) {
                status = "Entregue";
            } else {
                status = "Doc. Pendente";
            }

            csv += `${data.estagiario_nome || ""};${data.sala || ""};${dataFormatada};${data.teste_usado || ""};${status}\n`;
        });

        // Criar arquivo
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        // criar link
        const link = document.createElement("a");
        link.href = url;
        link.download = `relatorio-geral-${Date.now()}.csv`;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();

        // limpar
        URL.revokeObjectURL(url);
        link.remove();

        showNotification("Relatório CSV gerado com sucesso!", "success");

    } catch (err) {
        console.error(err);
        showNotification("Erro ao gerar CSV.", "error");
    }
}

async function handlePresenceWithStock(appointmentId) {
    const agRef = db.collection("agendamentos").doc(appointmentId);
    const agSnap = await agRef.get();
    const ag = agSnap.data();

    if (!ag || ag.presenca_aluno) return;

    // Sem teste
    if (!ag.teste_usado_id) {
        await agRef.update({ presenca_aluno: true });
        return;
    }

    const testeRef = db.collection("estoque_testes").doc(ag.teste_usado_id);
    const testeSnap = await testeRef.get();
    const teste = testeSnap.data();

    if (!teste) {
        await agRef.update({ presenca_aluno: true });
        return;
    }

    if (teste.tipo === "simples") {
        await descontarTesteSimples(testeRef, agRef);
    } else {
        abrirModalDescontoComponentes(testeRef, teste, agRef);
    }
}

async function descontarTesteSimples(testeRef, agRef) {
    await testeRef.update({
        quantidade_atual: firebase.firestore.FieldValue.increment(-1)
    });

    await agRef.update({
        presenca_aluno: true,
        estoque_baixado: true
    });

    showNotification("Presença registrada e estoque atualizado.", "success");
}

function abrirModalDescontoComponentes(testeRef, teste, agRef) {
    const modal = document.getElementById("use-components-modal");
    const list = document.getElementById("use-components-list");

    list.innerHTML = "";

    teste.componentes.forEach((c, idx) => {
        list.innerHTML += `
            <div class="component-use-row">
                <label>
                    ${c.nome} (estoque: ${c.quantidade_atual})
                </label>
                <input 
                    type="number"
                    min="0"
                    max="${c.quantidade_atual}"
                    value="0"
                    data-index="${idx}">
            </div>
        `;
    });

    modal.classList.remove("hidden");

    document.getElementById("cancel-use-components").onclick = () => {
        modal.classList.add("hidden");
    };

    document.getElementById("confirm-use-components").onclick =
        () => confirmarDescontoComponentes(testeRef, teste, agRef);
}

async function confirmarDescontoComponentes(testeRef, teste, agRef) {
    const inputs = document.querySelectorAll("#use-components-list input");

    const novosComponentes = teste.componentes.map(c => ({ ...c }));

    for (const input of inputs) {
        const idx = parseInt(input.dataset.index);
        const usado = parseInt(input.value) || 0;

        if (usado > novosComponentes[idx].quantidade_atual) {
            showNotification("Quantidade usada maior que o estoque disponível.", "error");
            return;
        }

        novosComponentes[idx].quantidade_atual -= usado;
    }

    await testeRef.update({
        componentes: novosComponentes
    });

    await agRef.update({
        presenca_aluno: true,
        estoque_baixado: true
    });

    document.getElementById("use-components-modal").classList.add("hidden");

    showNotification("Presença registrada e estoque atualizado.", "success");
}
