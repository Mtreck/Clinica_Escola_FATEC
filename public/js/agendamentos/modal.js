// js/agendamentos/modal.js
import { saveNewAppointment, deleteAppointment } from "./eventos.js";
import { loadTestOptions } from "./eventos.js"; 
// Fecha QUALQUER modal preso logo no começo
export function forceCloseConfirmModal() {
    const m = document.getElementById("custom-confirm-modal");
    if (m) m.classList.add("hidden");
}

export function setupAppointmentModal() {

    forceCloseConfirmModal(); // <<< IMPORTANTE

    const cancelBtn = document.getElementById('modal-cancel-button');
    const saveBtn = document.getElementById('modal-save-button');
    const deleteBtn = document.getElementById('modal-delete-button');

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            document.getElementById('appointment-modal').classList.add('hidden');
            document.getElementById('modal-error-message').textContent = '';
            document.getElementById('modal-appointment-doc-id').value = '';

            forceCloseConfirmModal(); // <<< evita modal preso
        };
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            forceCloseConfirmModal(); // <<< evita modal preso
            saveNewAppointment();
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            const docId = document.getElementById('modal-appointment-doc-id').value;
            if (docId) {
                document.getElementById('appointment-modal').classList.add('hidden');
                deleteAppointment(docId);
            }
        };
    }
}

// Abrir o modal principal
export function openManualAppointment() {
    forceCloseConfirmModal();
    loadRoomOptions();
    loadTestOptions(); 
    document.getElementById('modal-appointment-doc-id').value = '';
    document.getElementById('modal-estagiario').value = '';
    document.getElementById('modal-iniciais').value = '';
    document.getElementById('modal-date').value = '';
    document.getElementById('modal-time').value = '13:00';
    document.getElementById('modal-teste').value = 'NÃO USOU';
    document.getElementById('modal-error-message').textContent = '';
    document.getElementById('modal-appointment-type').value = 'Único'; // default

    // volta título e botão para "novo agendamento"
    document.querySelector('#appointment-modal h3').textContent = 'Agendar Novo Atendimento';
    document.getElementById('modal-save-button').textContent = 'Salvar Agendamento';
    document.getElementById('modal-delete-button').classList.add('hidden');

    document.getElementById('appointment-modal').classList.remove('hidden');
}

// Preenche as salas
export function loadRoomOptions() {
    const salaSelect = document.getElementById('modal-sala');
    if (!salaSelect) return;

    salaSelect.innerHTML = ""; // limpa

    for (let i = 1; i <= 7; i++) {
        const opt = document.createElement('option');
        opt.value = `Sala ${i}`;
        opt.textContent = `Sala ${i}`;
        salaSelect.appendChild(opt);
    }
}
