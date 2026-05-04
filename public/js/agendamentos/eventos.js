// js/agendamentos/eventos.js
import { db } from "../firebase.js";
import { showNotification } from "../utils/notificacao.js";
import { customConfirm } from "../utils/confirm.js";
import { refetchCalendar } from "./calendario.js";
import { formatDateTime } from "../utils/helpers.js";
import { invalidateDocumentationCache } from "../documentacao.js";

export async function loadTestOptions() {
    const select = document.getElementById('modal-teste');
    if (!select) return;
    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '';
    select.appendChild(defaultOption);
    try {
        const snap = await db.collection('estoque_testes').orderBy('nome_teste').get();
        snap.docs.forEach(doc => {
            const d = doc.data();
            const opt = document.createElement('option');
            opt.value = d.nome_teste;
            opt.textContent = d.nome_teste;
            select.appendChild(opt);
        });
    } catch (e) { console.error('loadTestOptions', e); }
}

export async function loadTodayAppointments() {
    const container = document.getElementById('today-summary-container');
    if (!container) return;
    container.innerHTML = '<div class="today-summary-card"><h4>Atendimentos de Hoje</h4><div id="today-summary-results"></div></div>';
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    try {
        const snap = await db.collection('agendamentos')
            .where('data_hora','>=',firebase.firestore.Timestamp.fromDate(today))
            .where('data_hora','<',firebase.firestore.Timestamp.fromDate(tomorrow))
            .orderBy('data_hora','asc').get();
        const results = snap.docs.map(d => ({id:d.id, ...d.data()}));
        const listContainer = document.getElementById('today-summary-results');
        if (results.length===0) {
            listContainer.innerHTML = '<p style="text-align:center;color:#555;">Nenhum agendamento para hoje.</p>';
            return;
        }
        let html = '<ul id="today-appointments-list">';
        results.forEach(r => {
            const { date:dt, time:tm } = formatDateTime(r.data_hora);
            const testeInfo = (r.teste_usado && r.teste_usado !== 'NÃO USOU') ? ` (${r.teste_usado})` : '';
            html += `<li><span style="font-weight:bold;min-width:50px;">${tm}</span> <span class="appointment-info">${r.estagiario_nome}${testeInfo}</span> <span style="font-weight:bold;color:#4F76C9;min-width:60px;text-align:right;">${r.sala}</span></li>`;
        });
        html += '</ul>';
        listContainer.innerHTML = html;
    } catch (e) {
        console.error('loadTodayAppointments', e);
    }
}

// salvar/editar
export async function saveNewAppointment() {
    const iniciais = document.getElementById('modal-iniciais').value.trim();
    const estagiario = document.getElementById('modal-estagiario').value.trim();
    const hora = document.getElementById('modal-time').value;
    const appointmentType = document.getElementById('modal-appointment-type').value;
    const sala = document.getElementById('modal-sala').value;
    const dataString = document.getElementById('modal-date').value;
    const docId = document.getElementById('modal-appointment-doc-id').value;
    const testeNome = document.getElementById('modal-teste').value;
    const isEditing = !!docId;

    const errorMessage = document.getElementById('modal-error-message');
    if (errorMessage) errorMessage.textContent = "";

    if (!estagiario || !hora || !sala || !dataString) {
        errorMessage.textContent = "Preencha todos os campos obrigatórios.";
        return;
    }

    // ==========================================
    // VERIFICAÇÃO DE CONFLITO DE AGENDA / SALA
    // ==========================================
    try {
        let datasParaVerificar = [dataString];

        if (appointmentType === "Fixo" && !isEditing) {
            const base = new Date(`${dataString}T${hora}`);
            const end = new Date(base);
            end.setMonth(end.getMonth() + 3);

            let next = new Date(base);
            next.setDate(next.getDate() + 7);

            while (next <= end) {
                datasParaVerificar.push(next.toISOString().slice(0, 10));
                next.setDate(next.getDate() + 7);
            }
        }

        let conflictDates = [];

        // Verifica cada data agendada para evitar choque de sala no mesmo horário
        for (const dateToCheck of datasParaVerificar) {
            const snap = await db.collection("agendamentos")
                .where("data", "==", dateToCheck)
                .get();

            snap.forEach(doc => {
                if (isEditing && doc.id === docId) return;
                
                const d = doc.data();
                if (d.sala === sala && d.hora === hora) {
                    conflictDates.push(dateToCheck);
                }
            });
        }

        if (conflictDates.length > 0) {
            const datasFormatadas = conflictDates.map(d => d.split('-').reverse().join('/'));
            errorMessage.textContent = `A Sala ${sala} já está ocupada às ${hora} na(s) data(s): ${datasFormatadas.join(' e ')}.`;
            return;
        }

    } catch (err) {
        console.error("Erro ao verificar conflito de agenda:", err);
        errorMessage.textContent = "Erro ao checar disponibilidade. Tente novamente.";
        return;
    }
    // ==========================================

    // Buscar ID do teste
    let testeId = null;
    if (testeNome && testeNome !== "" && testeNome !== "NÃO USOU") {
        const snap = await db.collection("estoque_testes")
            .where("nome_teste", "==", testeNome)
            .limit(1)
            .get();
        if (!snap.empty) testeId = snap.docs[0].id;
    }

    // Objeto base
    const dataParaSalvar = {
        estagiario_nome: estagiario,
        iniciais_paciente: iniciais,
        teste_usado: testeNome,
        teste_usado_id: testeId,
        data: dataString,
        hora: hora,
        data_hora: firebase.firestore.Timestamp.fromDate(new Date(`${dataString}T${hora}`)),
        tipo_agendamento: appointmentType,
        sala: sala
    };

    try {

        // =======================
        // EDITAR AGENDAMENTO
        // =======================
        if (isEditing) {
            await db.collection("agendamentos").doc(docId).update(dataParaSalvar);

            showNotification("Agendamento atualizado com sucesso!", "success");
            document.getElementById('appointment-modal').classList.add("hidden");
            document.getElementById('modal-appointment-doc-id').value = '';

            loadTodayAppointments();
            refetchCalendar();
            invalidateDocumentationCache();
            return;
        }

        // =======================
        // CRIAR AGENDAMENTO
         //=======================
        const ref = await db.collection("agendamentos").add({
            ...dataParaSalvar,
            presenca_aluno: false,
            doc_entregue: false,
            falta_registrada: false,
            estoque_baixado: false
        });

        // CRIAR SEMANAL POR 3 MESES
        if (appointmentType === "Fixo") {
            const base = new Date(`${dataString}T${hora}`);
            const end = new Date(base);
            end.setMonth(end.getMonth() + 3);

            let next = new Date(base);
            next.setDate(next.getDate() + 7);

            while (next <= end) {
                const nextDateStr = next.toISOString().slice(0,10);

                await db.collection("agendamentos").add({
                    ...dataParaSalvar,
                    data: nextDateStr,
                    data_hora: firebase.firestore.Timestamp.fromDate(new Date(`${nextDateStr}T${hora}`)),
                    presenca_aluno: false,
                    doc_entregue: false,
                    falta_registrada: false,
                    estoque_baixado: false
                });

                next.setDate(next.getDate() + 7);
            }
        }

        showNotification("Agendamento salvo com sucesso!", "success");
        document.getElementById('appointment-modal').classList.add("hidden");
        document.getElementById('modal-appointment-doc-id').value = '';

        loadTodayAppointments();
        refetchCalendar();
        invalidateDocumentationCache();

    } catch (e) {
        console.error("saveNewAppointment", e);
        errorMessage.textContent = "Erro ao salvar agendamento.";
        showNotification("Erro ao salvar agendamento.", "error");
    }
}

export async function editAppointment(docId) {
    try {
        const doc = await db.collection('agendamentos').doc(docId).get();
        if (!doc.exists) { 
            showNotification('Agendamento não encontrado.', 'error'); 
            return; 
        }

        const data = doc.data();

        document.getElementById('modal-iniciais').value = data.iniciais_paciente || '';
        document.getElementById('modal-appointment-doc-id').value = docId;
        document.getElementById('modal-estagiario').value = data.estagiario_nome || '';
        document.getElementById('modal-teste').value = (data.teste_usado === 'NÃO USOU') ? '' : (data.teste_usado || '');
        document.getElementById('modal-sala').value = data.sala || '';
        document.getElementById('modal-date').value = data.data || '';
        document.getElementById('modal-time').value = data.hora || '';

        // compat com registros antigos ("Recorrente")
        let tipo = data.tipo_agendamento || 'Único';
        if (tipo === 'Recorrente') tipo = 'Único';
        document.getElementById('modal-appointment-type').value = tipo;

        document.querySelector('#appointment-modal h3').textContent = 'Editar Agendamento';
        document.getElementById('modal-save-button').textContent = 'Salvar Edição';
        document.getElementById('modal-delete-button').classList.remove('hidden');

        document.getElementById('appointment-modal').classList.remove('hidden');
    } catch (e) {
        console.error('editAppointment', e);
        showNotification('Erro ao carregar agendamento para edição. Tente novamente.', 'error');
    }
}

export async function markAppointmentAsAbsent(docId) {
    const confirmed = await customConfirm('Deseja registrar FALTA para este agendamento?', 'Confirmação de Falta', 'Registrar Falta', '#ffc107');
    if (!confirmed) return;
    try {
        await db.collection('agendamentos').doc(docId).update({ falta_registrada: true, presenca_aluno: false });
        showNotification('Falta registrada com sucesso.', 'warning');
        loadTodayAppointments();
        refetchCalendar();
        invalidateDocumentationCache();
    } catch (e) {
        console.error('markAppointmentAsAbsent', e);
        showNotification('Erro ao registrar falta.', 'error');
    }
}

export async function deleteAppointment(docId) {
    const docSnap = await db.collection('agendamentos').doc(docId).get();
    const data = docSnap.data() || {};
    const estagiario = data.estagiario_nome || 'Estagiário';
    const dataHora = data.data_hora ? data.data_hora.toDate().toLocaleString('pt-BR') : 'Data desconhecida';
    const confirmed = await customConfirm(`Deseja realmente APAGAR o agendamento de ${estagiario} (${dataHora})?`, 'Confirmação de Exclusão', 'APAGAR', '#dc3545');
    if (!confirmed) return;
    try {
        await db.collection('agendamentos').doc(docId).delete();
        showNotification('Agendamento excluído.', 'success');
        loadTodayAppointments();
        refetchCalendar();
        invalidateDocumentationCache();
    } catch (e) {
        console.error('deleteAppointment', e);
        showNotification('Erro ao apagar o agendamento.', 'error');
    }
}

export async function markAppointmentAsPresent(docId) {
    try {
        await db.collection("agendamentos").doc(docId).update({
            presenca_aluno: true,
            falta_registrada: false
        });

        showNotification("Presença registrada.", "success");
        loadTodayAppointments();
        refetchCalendar();
        invalidateDocumentationCache();
    } catch (e) {
        console.error("markAppointmentAsPresent", e);
        showNotification("Erro ao registrar presença.", "error");
    }
}
