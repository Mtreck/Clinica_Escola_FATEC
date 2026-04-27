// js/alunos.js
import { db } from "./firebase.js";

let calendar;
let selectedRoom = null;

document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    fetchRecados();
    setupRoomCards();
});

function setupRoomCards() {
    const container = document.getElementById('rooms-card-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 1; i <= 7; i++) {
        const roomName = `Sala ${i}`;
        const card = document.createElement('div');
        card.className = 'room-card';
        card.innerHTML = `<h4>${roomName}</h4><p>Clique para ver a agenda detalhada</p>`;
        
        card.addEventListener('click', () => {
            showRoomCalendar(roomName);
        });
        
        container.appendChild(card);
    }
}

function setupTabs() {
    const buttons = document.querySelectorAll('.nav-button');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.module').forEach(m => {
                m.classList.add('hidden');
                if(m.id !== btn.getAttribute('data-target')) m.style.display = 'none';
            });
            
            const targetId = btn.getAttribute('data-target');
            const targetModule = document.getElementById(targetId);
            targetModule.classList.remove('hidden');
            targetModule.style.display = 'block';
            
            // Fix para o FullCalendar não renderizar cortado se abrir a aba depois de init
            if (targetId === 'modulo-agenda' && calendar) {
                setTimeout(() => calendar.updateSize(), 100);
            }
        });
    });
}

async function fetchRecados() {
    const container = document.getElementById('recados-list');
    if (!container) return;
    
    // Aplica o grid responsivo para ficar um do lado do outro (até 5 colunas se a tela for muito larga)
    container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;';
    
    try {
        const snap = await db.collection('recados').orderBy('dataCriacao', 'desc').get();
        if (snap.empty) {
            container.style.display = 'block';
            container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 2rem;">Nenhum recado ativo no momento.</div>';
            return;
        }
        
        container.innerHTML = '';
        const now = new Date();
        let ativosCount = 0;

        snap.forEach(doc => {
            const data = doc.data();
            
            // Verifica se está expirado
            if (data.dataExpiracao) {
                const expDate = data.dataExpiracao.toDate ? data.dataExpiracao.toDate() : new Date(data.dataExpiracao);
                if (expDate < now) {
                    return; // Ignora recados expirados
                }
            }
            
            ativosCount++;
            
            let dtPublicacao = '';
            if (data.dataCriacao) {
                const dObj = data.dataCriacao.toDate ? data.dataCriacao.toDate() : new Date(data.dataCriacao);
                dtPublicacao = dObj.toLocaleDateString('pt-BR');
            }
            
            const card = document.createElement('div');
            // Aplica a cor selecionada (padrão é azul se não tiver)
            const corDestaque = data.cor || '#3b82f6';
            
            card.style.cssText = `
                background: white; 
                border: 1px solid #e2e8f0; 
                border-radius: 8px; 
                padding: 1.5rem; 
                box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
                border-top: 5px solid ${corDestaque};
                display: flex;
                flex-direction: column;
            `;
            
            card.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 0.75rem; gap: 8px;">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background: ${corDestaque};"></div>
                    <h3 style="color: #1e293b; margin: 0; font-size: 1.1rem;">${data.titulo || 'Aviso'}</h3>
                </div>
                <p style="color: #475569; margin-bottom: 1.5rem; white-space: pre-line; line-height: 1.6; flex-grow: 1;">${data.mensagem || ''}</p>
                <div style="font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 0.75rem;">
                    Publicado em: ${dtPublicacao}
                </div>
            `;
            container.appendChild(card);
        });

        if (ativosCount === 0) {
            container.style.display = 'block';
            container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 2rem;">Nenhum recado ativo no momento.</div>';
        }
        
    } catch(e) {
        console.error('Erro ao buscar recados:', e);
        container.style.display = 'block';
        container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 2rem;">Nenhum recado disponível no momento.</div>';
    }
}

function showRoomCards() {
    selectedRoom = null;
    document.getElementById('rooms-card-container').classList.remove('hidden');
    document.getElementById('calendar-view').classList.add('hidden');
}

function showRoomCalendar(roomName) {
    selectedRoom = roomName;
    
    document.getElementById('rooms-card-container').classList.add('hidden');
    document.getElementById('calendar-view').classList.remove('hidden');
    
    document.getElementById('current-room-title').textContent = `📅 Horários Ocupados - ${roomName}`;

    if (!calendar) {
        initCalendar();
    } else {
        calendar.refetchEvents();
    }
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridWeek',
        locale: 'pt-br',
        customButtons: {
            voltarSalas: {
                text: '⬅ Voltar às Salas',
                click: function() {
                    showRoomCards();
                }
            }
        },
        headerToolbar: {
            left: 'voltarSalas',
            center: 'title',
            right: ''
        },
        height: 'auto',
        events: fetchAllEvents,
        
        // Customização do cabeçalho da data para exibir o nome do feriado embaixo do dia
        dayHeaderContent: function(arg) {
            const diaStr = arg.text.toUpperCase(); // ex: SEG. 27/04
            
            const y = arg.date.getFullYear();
            const m = String(arg.date.getMonth() + 1).padStart(2, '0');
            const d = String(arg.date.getDate()).padStart(2, '0');
            const dateFmt = `${y}-${m}-${d}`;
            
            let holidayName = '';
            if (cachedHolidays && cachedHolidays.data) {
                const h = cachedHolidays.data.find(x => x.date === dateFmt);
                if (h) {
                    holidayName = `<div style="color: #ef4444; font-size: 0.8rem; font-weight: 500; text-transform: capitalize; margin-top: 4px;">${h.name}</div>`;
                }
            }
            
            return {
                html: `<div style="line-height: 1.2;">
                         <div style="color: #3b82f6;">${diaStr}</div>
                         ${holidayName}
                       </div>`
            };
        },

        // Garante que se mudar de ano, baixa os feriados e re-renderiza o cabeçalho
        datesSet: async function(info) {
            const y = info.start.getFullYear();
            if (!cachedHolidays || cachedHolidays.year !== y) {
                await getHolidays(y);
                calendar.render(); // Força renderizar o cabeçalho novamente após buscar os feriados
            }
        },
        
        // Customização visual: Apenas o texto centralizado e animado, sem caixa de fundo
        eventContent: function(arg) {
            // Feriados usam o tipo background, desenhamos a marca d'água neles
            if (arg.event.display === 'background') {
                return { 
                    html: `
                    <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 10px 0;">
                        <div class="holiday-watermark">FERIADO</div>
                    </div>
                    ` 
                };
            }

            const hora = arg.event.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            // Cria um delay aleatório curto (0s a 0.3s) para dar um efeito de entrada em "cascata"
            const delay = (Math.random() * 0.3).toFixed(2);
            
            return {
                html: `
                <div class="event-animated" style="animation-delay: ${delay}s; font-size: 1.25rem; font-weight: 700; color: #1e293b; text-align: center; width: 100%; padding: 8px 0;">
                    ${hora}
                </div>
                `
            };
        },
        
        eventClick: function(info) {
            const hora = info.event.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            alert(`Horário indisponível: ${hora}\n\nEste horário já está reservado para a ${selectedRoom}.`);
        }
    });

    calendar.render();
}

// Cache de feriados para não ficar chamando a API toda hora
let cachedHolidays = null;

async function getHolidays(year) {
    if (cachedHolidays && cachedHolidays.year === year) return cachedHolidays.data;
    try {
        // Usa a Brasil API, que é pública e gratuita
        const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
        if (res.ok) {
            const data = await res.json();
            cachedHolidays = { year, data };
            return data;
        }
    } catch(e) {
        console.error("Erro ao buscar feriados da Brasil API:", e);
    }
    return [];
}

async function fetchAllEvents(fetchInfo, successCallback, failureCallback) {
    if (!selectedRoom) return successCallback([]);
    
    try {
        const start = firebase.firestore.Timestamp.fromDate(fetchInfo.start);
        const end = firebase.firestore.Timestamp.fromDate(fetchInfo.end);
        
        // Busca os feriados daquele ano
        const year = fetchInfo.start.getFullYear();
        const holidaysData = await getHolidays(year);
        
        // Cria um evento de fundo (para pintar a coluna)
        const holidayEvents = [];
        holidaysData.forEach(h => {
            holidayEvents.push({
                start: h.date,
                display: 'background',
                color: '#fee2e2' // Fundo vermelho clarinho (cor level leve)
            });
        });
        
        const snap = await db.collection('agendamentos')
            .where('sala', '==', selectedRoom)
            .where('data_hora', '>=', start)
            .where('data_hora', '<', end)
            .get();
            
        const events = snap.docs.map(doc => {
            const d = doc.data();
            const dt = d.data_hora.toDate();

            return {
                title: d.hora,
                start: dt,
                color: 'transparent',
                textColor: '#1e293b'
            };
        });
        
        // Retorna a combinação dos agendamentos + feriados
        successCallback([...events, ...holidayEvents]);
    } catch(e) {
        console.error('Erro ao buscar eventos do calendário:', e);
        failureCallback(e);
    }
}
