// js/agendamentos/eventos.js
import { db } from "../firebase.js";
import { showNotification } from "../utils/notificacao.js";
import { customConfirm } from "../utils/confirm.js";
import { refetchCalendar } from "./calendario.js";
import { formatDateTime } from "../utils/helpers.js";

// Atualiza todas as visões que dependem de agendamentos (usado após criar/editar/excluir)
function refreshAllViews() {
    loadTodayAppointments();
    refetchCalendar();
}

// Espelho público (sem dados sensíveis) usado pela Área do Aluno, que não exige login.
// Só sala/data/hora vão para cá — nome do estagiário e iniciais do paciente nunca saem de "agendamentos".
function syncAgendaPublica(id, dataParaSalvar) {
    return db.collection('agenda_publica').doc(id).set({
        sala: dataParaSalvar.sala,
        data: dataParaSalvar.data,
        hora: dataParaSalvar.hora,
        data_hora: dataParaSalvar.data_hora
    });
}

function deleteAgendaPublica(id) {
    return db.collection('agenda_publica').doc(id).delete();
}

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

    // Identificador da série, usado para agrupar todas as ocorrências de um agendamento Fixo
    const serieIdExistente = document.getElementById('modal-appointment-serie-id').value;
    if (isEditing && serieIdExistente) {
        dataParaSalvar.serie_id = serieIdExistente;
    } else if (!isEditing && appointmentType === "Fixo") {
        dataParaSalvar.serie_id = db.collection("agendamentos").doc().id;
    }

    try {

        // =======================
        // EDITAR AGENDAMENTO
        // =======================
        if (isEditing) {
            await db.collection("agendamentos").doc(docId).update(dataParaSalvar);
            await syncAgendaPublica(docId, dataParaSalvar);

            showNotification("Agendamento atualizado com sucesso!", "success");
            document.getElementById('appointment-modal').classList.add("hidden");
            document.getElementById('modal-appointment-doc-id').value = '';
            document.getElementById('modal-appointment-serie-id').value = '';

            refreshAllViews();
            return;
        }

        // =======================
        // CRIAR AGENDAMENTO
         //=======================
        const ref = db.collection("agendamentos").doc(); // gera o ID antes de salvar p/ espelhar na coleção pública
        await ref.set({
            ...dataParaSalvar,
            presenca_aluno: false,
            doc_entregue: false,
            falta_registrada: false,
            estoque_baixado: false
        });
        await syncAgendaPublica(ref.id, dataParaSalvar);

        // CRIAR SEMANAL POR 3 MESES
        if (appointmentType === "Fixo") {
            const base = new Date(`${dataString}T${hora}`);
            const end = new Date(base);
            end.setMonth(end.getMonth() + 3);

            let next = new Date(base);
            next.setDate(next.getDate() + 7);

            while (next <= end) {
                const nextDateStr = next.toISOString().slice(0,10);
                const nextDataParaSalvar = {
                    ...dataParaSalvar,
                    data: nextDateStr,
                    data_hora: firebase.firestore.Timestamp.fromDate(new Date(`${nextDateStr}T${hora}`))
                };

                const nextRef = db.collection("agendamentos").doc();
                await nextRef.set({
                    ...nextDataParaSalvar,
                    presenca_aluno: false,
                    doc_entregue: false,
                    falta_registrada: false,
                    estoque_baixado: false
                });
                await syncAgendaPublica(nextRef.id, nextDataParaSalvar);

                next.setDate(next.getDate() + 7);
            }
        }

        showNotification("Agendamento salvo com sucesso!", "success");
        document.getElementById('appointment-modal').classList.add("hidden");
        document.getElementById('modal-appointment-doc-id').value = '';
        document.getElementById('modal-appointment-serie-id').value = '';

        refreshAllViews();

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
        document.getElementById('modal-appointment-serie-id').value = data.serie_id || '';
        document.getElementById('modal-estagiario').value = data.estagiario_nome || '';
        document.getElementById('modal-teste').value = (data.teste_usado === 'NÃO USOU') ? '' : (data.teste_usado || '');
        document.getElementById('modal-sala').value = data.sala || '';
        document.getElementById('modal-date').value = data.data || '';
        document.getElementById('modal-time').value = data.hora || '';

        // compat com registros antigos ("Recorrente")
        let tipo = data.tipo_agendamento || 'Único';
        if (tipo === 'Recorrente') tipo = 'Único';
        document.getElementById('modal-appointment-type').value = tipo;

        const statusRow = document.getElementById('modal-status-row');
        const statusBadge = document.getElementById('modal-status-badge');
        if (statusRow && statusBadge) {
            statusRow.classList.remove('hidden');
            if (data.falta_registrada) {
                statusBadge.textContent = 'Falta registrada';
                statusBadge.className = 'status-falta';
            } else if (data.presenca_aluno) {
                statusBadge.textContent = 'Presença confirmada';
                statusBadge.className = 'status-ok';
            } else {
                statusBadge.textContent = 'Aguardando atendimento';
                statusBadge.className = 'status-default';
            }
        }

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
    if (!confirmed) return false;
    try {
        await db.collection('agendamentos').doc(docId).update({ falta_registrada: true, presenca_aluno: false });
        showNotification('Falta registrada com sucesso.', 'warning');
        refreshAllViews();
        return true;
    } catch (e) {
        console.error('markAppointmentAsAbsent', e);
        showNotification('Erro ao registrar falta.', 'error');
        return false;
    }
}

export async function deleteAppointment(docId) {
    const docSnap = await db.collection('agendamentos').doc(docId).get();
    const data = docSnap.data() || {};

    // Agendamentos Fixos têm várias ocorrências semanais: em vez de apagar só a clicada,
    // abre o modal de gerenciamento da série para escolher quais futuras remover.
    if (data.tipo_agendamento === 'Fixo') {
        await openDeleteSeriesModal(data);
        return;
    }

    const estagiario = data.estagiario_nome || 'Estagiário';
    const dataHora = data.data_hora ? data.data_hora.toDate().toLocaleString('pt-BR') : 'Data desconhecida';
    const confirmed = await customConfirm(`Deseja realmente APAGAR o agendamento de ${estagiario} (${dataHora})?`, 'Confirmação de Exclusão', 'APAGAR', '#dc3545');
    if (!confirmed) return;
    try {
        await db.collection('agendamentos').doc(docId).delete();
        await deleteAgendaPublica(docId);
        showNotification('Agendamento excluído.', 'success');
        refreshAllViews();
    } catch (e) {
        console.error('deleteAppointment', e);
        showNotification('Erro ao apagar o agendamento.', 'error');
    }
}

// ======================================================
//   EXCLUSÃO EM LOTE DE AGENDAMENTOS FIXOS (SÉRIE)
// ======================================================

// Busca as ocorrências futuras (data_hora >= agora) da mesma série de um agendamento Fixo.
// Usa serie_id quando disponível; para registros antigos sem esse campo, agrupa por
// estagiário + sala + horário como aproximação razoável.
async function getFutureSeriesDocs(data) {
    const now = new Date();
    let snap;

    if (data.serie_id) {
        snap = await db.collection('agendamentos').where('serie_id', '==', data.serie_id).get();
    } else {
        snap = await db.collection('agendamentos')
            .where('tipo_agendamento', '==', 'Fixo')
            .where('estagiario_nome', '==', data.estagiario_nome)
            .where('sala', '==', data.sala)
            .where('hora', '==', data.hora)
            .get();
    }

    return snap.docs
        .filter(d => {
            const dt = d.data().data_hora?.toDate();
            return dt && dt >= now;
        })
        .sort((a, b) => a.data().data_hora.toMillis() - b.data().data_hora.toMillis());
}

async function openDeleteSeriesModal(data) {
    const modal = document.getElementById('delete-series-modal');
    const list = document.getElementById('delete-series-list');
    const title = document.getElementById('delete-series-title');
    const deleteAllBtn = document.getElementById('delete-series-all-btn');
    const closeBtn = document.getElementById('delete-series-close-btn');
    if (!modal || !list) return;

    title.textContent = `Atendimentos Fixos: ${data.estagiario_nome || ''} — ${data.sala || ''} às ${data.hora || ''}`;
    list.innerHTML = '<p style="text-align:center;color:#64748b;padding:1rem 0;">Carregando...</p>';
    modal.classList.remove('hidden');

    try {
        const docs = await getFutureSeriesDocs(data);
        renderSeriesModalList(docs, list);
    } catch (e) {
        console.error('openDeleteSeriesModal', e);
        list.innerHTML = '<p style="text-align:center;color:#dc3545;padding:1rem 0;">Erro ao carregar os atendimentos da série.</p>';
    }

    // Clona os botões para remover listeners de aberturas anteriores do modal
    const newDeleteAllBtn = deleteAllBtn.cloneNode(true);
    deleteAllBtn.parentNode.replaceChild(newDeleteAllBtn, deleteAllBtn);
    newDeleteAllBtn.addEventListener('click', () => deleteAllSeriesItems(list));

    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
}

function renderSeriesModalList(docs, list) {
    if (docs.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#64748b;padding:1rem 0;">Nenhum atendimento futuro restante nesta série.</p>';
        return;
    }

    list.innerHTML = docs.map(doc => {
        const d = doc.data();
        const dt = d.data_hora.toDate();
        const dataFmt = dt.toLocaleDateString('pt-BR');
        return `
            <div class="series-item-row" data-id="${doc.id}" style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.9rem;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:0.5rem;">
                <span><strong>${dataFmt}</strong> às ${d.hora} — ${d.sala}</span>
                <button type="button" class="series-item-remove" data-id="${doc.id}" title="Remover este atendimento" style="background:#ef4444;color:white;border:none;border-radius:4px;width:28px;height:28px;cursor:pointer;font-weight:bold;">✖</button>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.series-item-remove').forEach(btn => {
        btn.addEventListener('click', () => deleteSingleSeriesItem(btn.dataset.id, list));
    });
}

async function deleteSingleSeriesItem(docId, list) {
    try {
        await db.collection('agendamentos').doc(docId).delete();
        await deleteAgendaPublica(docId);

        const row = list.querySelector(`.series-item-row[data-id="${docId}"]`);
        if (row) row.remove();
        if (!list.querySelector('.series-item-row')) {
            list.innerHTML = '<p style="text-align:center;color:#64748b;padding:1rem 0;">Nenhum atendimento futuro restante nesta série.</p>';
        }

        showNotification('Atendimento removido.', 'success');
        refreshAllViews();
    } catch (e) {
        console.error('deleteSingleSeriesItem', e);
        showNotification('Erro ao remover atendimento.', 'error');
    }
}

async function deleteAllSeriesItems(list) {
    const rows = list.querySelectorAll('.series-item-row');
    if (rows.length === 0) return;

    const confirmed = await customConfirm(
        `Deseja realmente apagar TODOS os ${rows.length} atendimentos futuros desta série?`,
        'Apagar Série Completa', 'Apagar Todos', '#dc3545'
    );
    if (!confirmed) return;

    try {
        const batch = db.batch();
        rows.forEach(row => {
            batch.delete(db.collection('agendamentos').doc(row.dataset.id));
            batch.delete(db.collection('agenda_publica').doc(row.dataset.id));
        });
        await batch.commit();

        list.innerHTML = '<p style="text-align:center;color:#64748b;padding:1rem 0;">Nenhum atendimento futuro restante nesta série.</p>';
        showNotification('Atendimentos futuros da série apagados com sucesso.', 'success');
        refreshAllViews();
    } catch (e) {
        console.error('deleteAllSeriesItems', e);
        showNotification('Erro ao apagar os atendimentos da série.', 'error');
    }
}

export async function markAppointmentAsPresent(docId) {
    const confirmed = await customConfirm('Deseja registrar PRESENÇA para este agendamento?', 'Confirmação de Presença', 'Registrar Presença', '#28a745');
    if (!confirmed) return false;

    try {
        const agRef = db.collection('agendamentos').doc(docId);
        const agSnap = await agRef.get();
        const ag = agSnap.data();

        if (!ag || ag.presenca_aluno) return true;

        // Sem teste vinculado: só marca presença, sem baixa de estoque
        if (!ag.teste_usado_id) {
            await agRef.update({ presenca_aluno: true, falta_registrada: false });
            showNotification('Presença registrada.', 'success');
            refreshAllViews();
            return true;
        }

        const testeRef = db.collection('estoque_testes').doc(ag.teste_usado_id);
        const testeSnap = await testeRef.get();
        const teste = testeSnap.data();

        if (!teste) {
            await agRef.update({ presenca_aluno: true, falta_registrada: false });
            showNotification('Presença registrada.', 'success');
            refreshAllViews();
            return true;
        }

        if (teste.tipo === 'simples') {
            await descontarTesteSimples(testeRef, agRef);
        } else {
            abrirModalDescontoComponentes(testeRef, teste, agRef);
        }
        return true;
    } catch (e) {
        console.error('markAppointmentAsPresent', e);
        showNotification('Erro ao registrar presença.', 'error');
        return false;
    }
}

async function descontarTesteSimples(testeRef, agRef) {
    await testeRef.update({
        quantidade_atual: firebase.firestore.FieldValue.increment(-1)
    });

    await agRef.update({
        presenca_aluno: true,
        falta_registrada: false,
        estoque_baixado: true
    });

    showNotification('Presença registrada e estoque atualizado.', 'success');
    refreshAllViews();
}

function abrirModalDescontoComponentes(testeRef, teste, agRef) {
    const modal = document.getElementById('use-components-modal');
    const list = document.getElementById('use-components-list');

    list.innerHTML = '';

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

    modal.classList.remove('hidden');

    document.getElementById('cancel-use-components').onclick = () => {
        modal.classList.add('hidden');
    };

    document.getElementById('confirm-use-components').onclick =
        () => confirmarDescontoComponentes(testeRef, teste, agRef);
}

async function confirmarDescontoComponentes(testeRef, teste, agRef) {
    const inputs = document.querySelectorAll('#use-components-list input');

    const novosComponentes = teste.componentes.map(c => ({ ...c }));

    for (const input of inputs) {
        const idx = parseInt(input.dataset.index);
        const usado = parseInt(input.value) || 0;

        if (usado > novosComponentes[idx].quantidade_atual) {
            showNotification('Quantidade usada maior que o estoque disponível.', 'error');
            return;
        }

        novosComponentes[idx].quantidade_atual -= usado;
    }

    await testeRef.update({
        componentes: novosComponentes
    });

    await agRef.update({
        presenca_aluno: true,
        falta_registrada: false,
        estoque_baixado: true
    });

    document.getElementById('use-components-modal').classList.add('hidden');

    showNotification('Presença registrada e estoque atualizado.', 'success');
    refreshAllViews();
}
