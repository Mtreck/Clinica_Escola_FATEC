// js/agendamentos/calendario.js
import { editAppointment } from "./eventos.js";
import { db } from "../firebase.js";
import { openManualAppointment } from "./modal.js";


let calendar = null;
export let selectedRoom = null;
export let selectedDate = null;

export function setupRoomCards() {
    const container = document.getElementById('rooms-card-container');
    if (!container) return;
    container.innerHTML = '';
    for (let i=1;i<=7;i++) {
        const room = `Sala ${i}`;
        const card = document.createElement('div');
        card.className = 'room-card';
        card.innerHTML = `<h4>${room}</h4><p>Clique para ver a agenda detalhada</p>`;
        card.dataset.room = room;
        card.addEventListener('click', () => showRoomCalendar(room));
        container.appendChild(card);
    }
}

export function showRoomCalendar(roomName) {
    selectedRoom = roomName;
    document.getElementById('rooms-card-container').classList.add('hidden');
    document.getElementById('today-summary-container').classList.add('hidden');
    document.getElementById('advanced-search-container').classList.add('hidden');
    document.getElementById('room-calendar-view').classList.remove('hidden');
    document.getElementById('back-to-cards-btn').classList.remove('hidden');
    document.getElementById('current-room-title').textContent = `Agenda Detalhada da ${roomName}`;

    const calendarEl = document.getElementById('calendar');
    if (calendar) { calendar.destroy(); calendar=null; }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridWeek',
        locale: 'pt-br',
        weekends: false,
        headerToolbar: { left:'prev,next today', center:'title', right:'dayGridWeek,dayGridMonth' },
        selectable: true,
        height: 'auto',
        dateClick: info => {
            // 1 — limpar modal completamente
            openManualAppointment();

            // 2 — preencher apenas os campos específicos da data
            selectedDate = info.date;

            document.getElementById('modal-date-display').textContent =
                `Agendando para: ${selectedDate.toLocaleDateString('pt-BR')}`;

            document.getElementById('modal-date').value =
                selectedDate.toISOString().substring(0, 10);

            document.getElementById('modal-sala').value = selectedRoom;

            // 3 — abrir modal (openManualAppointment já abriu, mas garantimos)
            document.getElementById('appointment-modal').classList.remove('hidden');
        },
        eventClick: info => {
            // 1 — limpar tudo antes
            openManualAppointment();

            // 2 — agora sim carregar os dados do agendamento selecionado
            editAppointment(info.event.extendedProps.docId);
        },
        events: fetchEvents
    });

    calendar.render();
}

async function fetchEvents(fetchInfo, successCallback, failureCallback) {
    if (!selectedRoom) return successCallback([]);
    try {
        const start = firebase.firestore.Timestamp.fromDate(fetchInfo.start);
        const end = firebase.firestore.Timestamp.fromDate(fetchInfo.end);
        const snap = await db.collection('agendamentos').where('sala','==',selectedRoom)
            .where('data_hora','>=',start).where('data_hora','<',end).get();
        const events = snap.docs.map(doc => {
            const d = doc.data();
            const dt = d.data_hora.toDate();
            let color = '#4F76C9';
            if (d.falta_registrada) color = '#dc3545';
            else if (d.doc_entregue) color = '#28a745';
            else if (d.presenca_aluno) color = '#ffc107';
            return { title: d.estagiario_nome, start: dt, color, extendedProps:{docId: doc.id, teste_usado: d.teste_usado} };
        });
        successCallback(events);
    } catch(e) {
        console.error('Erro fetch events', e);
        failureCallback(e);
    }
}

export function showRoomCards() {
    selectedRoom = null;
    document.getElementById('rooms-card-container').classList.remove('hidden');
    document.getElementById('today-summary-container').classList.remove('hidden');
    document.getElementById('advanced-search-container').classList.remove('hidden');
    document.getElementById('room-calendar-view').classList.add('hidden');
    document.getElementById('back-to-cards-btn').classList.add('hidden');
}

export function refetchCalendar() { if (calendar) calendar.refetchEvents(); }