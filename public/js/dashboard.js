// js/dashboard.js

// -------- IMPORTS --------
import { auth } from "./firebase.js";
import { loadTodayAppointments, loadTestOptions } from "./agendamentos/eventos.js";
import { setupAppointmentModal, openManualAppointment } from "./agendamentos/modal.js";
import { setupRoomCards, showRoomCards } from "./agendamentos/calendario.js";
import { loadInventoryList, checkLowStockAlerts, showAddTestModal, saveNewTest } from "./inventario.js";
import { loadDocumentationList, initDocumentation } from "./documentacao.js";
import { setupAdvancedSearch } from "./agendamentos/Busca_avancada.js";

// -------- FUNÇÃO PRINCIPAL --------
export async function initializeDashboard() {
    console.log("🚀 Inicializando Dashboard...");

    // ========== LOGOUT ==========
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        const newBtn = logoutButton.cloneNode(true);
        logoutButton.parentNode.replaceChild(newBtn, logoutButton);
        newBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }

    // ========== BOTÃO DE REGISTRAR ATENDIMENTO (HEADER) ==========
    const registerBtn = document.getElementById('register-appointment-btn');
    if (registerBtn) {
        registerBtn.addEventListener("click", () => openManualAppointment());
    }

    // ========== NAVEGAÇÃO ENTRE MÓDULOS ==========
    setupNavigation();

    // ========== CONFIGURAÇÃO DE MODAIS ==========
    setupModals();

    // ========== INICIALIZAÇÕES ESPECÍFICAS ==========
    setupRoomCards();
    setupAdvancedSearch();
    initDocumentation();

    // Carrega opções de testes
    loadTestOptions();

    // ========== VERIFICAÇÃO DE ESTOQUE BAIXO (MODAL) ==========
    setTimeout(async () => {
        const alertas = await checkLowStockAlerts();
        console.log("Alertas retornados para o dashboard:", alertas);

        if (alertas && alertas.length > 0) {
            const modal = document.getElementById('low-stock-modal');
            const list = document.getElementById('low-stock-list');
            const closeBtn = document.getElementById('close-stock-alert');

            if (modal && list && closeBtn) {
                list.innerHTML = '';

                alertas.forEach(a => {
                    const li = document.createElement('li');
                    li.style.cssText = "margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.25rem;";

                    if (a.componente) {
                        li.innerHTML = `<strong>${a.teste}</strong> <span style="color:#64748b;">(${a.componente})</span>: <span style="color:#dc2626; font-weight:bold;">${a.atual} unid.</span>`;
                    } else {
                        li.innerHTML = `<strong>${a.teste}</strong>: <span style="color:#dc2626; font-weight:bold;">${a.atual} unid.</span>`;
                    }
                    list.appendChild(li);
                });

                // Força exibição com "força bruta" para garantir que apareça
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                modal.style.opacity = '1';
                modal.style.visibility = 'visible';
                modal.style.zIndex = '9999'; // Z-index máximo
                modal.style.pointerEvents = 'auto';

                // Configura botão de fechar
                const newCloseBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

                newCloseBtn.addEventListener('click', () => {
                    modal.classList.add('hidden');
                    modal.style.display = ''; // Limpa inline style ao fechar
                });
            } else {
                console.error("Elementos do modal de estoque não encontrados no DOM.");
            }
        }
    }, 2000); // Aumentei um pouco o delay para garantir carregamento total
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-button');
    const modules = document.querySelectorAll('.module');
    const backBtn = document.getElementById('back-to-cards-btn');

    // Botão Voltar
    if (backBtn) {
        backBtn.addEventListener("click", () => showRoomCards());
    }

    navButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetModuleId = button.getAttribute('data-module');

            // 1. Esconde tudo
            modules.forEach(m => {
                m.classList.add('hidden');
                m.style.display = "none";
            });

            // 2. Mostra alvo
            const module = document.getElementById(targetModuleId);
            if (module) {
                module.classList.remove('hidden');
                module.style.display = "block";
            }

            // 3. Atualiza abas
            navButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');

            // 4. Ações ao entrar
            if (targetModuleId === "agendamentos") {
                showRoomCards();
                loadTodayAppointments();
            } else if (targetModuleId === "documentacao") {
                loadDocumentationList("");
            } else if (targetModuleId === "inventario") {
                loadInventoryList();
            }
        });
    });

    // Aba inicial
    const initialTab = document.querySelector('.nav-button[data-module="agendamentos"]');
    if (initialTab) initialTab.click();
}

function setupModals() {
    setupAppointmentModal();

    // Novo Teste
    const addTestBtn = document.getElementById("add-test-button");
    if (addTestBtn) {
        const newBtn = addTestBtn.cloneNode(true);
        addTestBtn.parentNode.replaceChild(newBtn, addTestBtn);
        newBtn.addEventListener("click", showAddTestModal);
    }

    const newTestCancel = document.getElementById("new-test-cancel-button");
    if (newTestCancel) {
        newTestCancel.addEventListener("click", () => {
            document.getElementById("new-test-modal").classList.add("hidden");
        });
    }

    const newTestSave = document.getElementById("new-test-save-button");
    if (newTestSave) {
        const newBtn = newTestSave.cloneNode(true);
        newTestSave.parentNode.replaceChild(newBtn, newTestSave);
        newBtn.addEventListener("click", saveNewTest);
    }

    // Fechar Gerenciamento Componentes
    const compCloseBtn = document.getElementById("components-close-button");
    const compModal = document.getElementById("components-modal");
    if (compCloseBtn && compModal) {
        compCloseBtn.addEventListener("click", () => {
            compModal.classList.add("hidden");
        });
    }
}
