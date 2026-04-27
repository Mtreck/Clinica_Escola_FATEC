import { db } from "./firebase.js";

// Inicializa a aba de Recados
export function initRecados() {
    setupRecadosModal();
    loadRecadosList();
}

// Configura os botões do modal de recados
function setupRecadosModal() {
    const addBtn = document.getElementById('add-recado-btn');
    const cancelBtn = document.getElementById('modal-recado-cancel-btn');
    const saveBtn = document.getElementById('modal-recado-save-btn');
    const modal = document.getElementById('recado-modal');

    // Configura os botões de cores
    const colorBtns = document.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            colorBtns.forEach(b => b.style.border = '3px solid transparent');
            btn.style.border = '3px solid #1e293b';
            document.getElementById('modal-recado-cor-hidden').value = btn.getAttribute('data-color');
        });
    });

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            document.getElementById('recado-form').reset();
            document.getElementById('modal-recado-id').value = '';
            document.getElementById('modal-recado-cor-hidden').value = '#3b82f6';
            
            // Reseta botões de cor para o azul
            colorBtns.forEach(b => b.style.border = '3px solid transparent');
            document.querySelector('.color-btn[data-color="#3b82f6"]').style.border = '3px solid #1e293b';
            
            // Define data atual como valor padrão do calendário
            const today = new Date();
            document.getElementById('modal-recado-data').value = today.toISOString().split('T')[0];
            
            document.getElementById('modal-recado-error').textContent = '';
            modal.classList.remove('hidden');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', saveRecado);
    }
}

// Salva um recado no Firebase
async function saveRecado() {
    const titulo = document.getElementById('modal-recado-titulo').value.trim();
    const mensagem = document.getElementById('modal-recado-mensagem').value.trim();
    const dataStr = document.getElementById('modal-recado-data').value;
    const cor = document.getElementById('modal-recado-cor-hidden').value;
    const errorMsg = document.getElementById('modal-recado-error');
    
    if (!titulo || !mensagem || !dataStr) {
        errorMsg.textContent = 'Preencha os campos de Título, Mensagem e Data.';
        return;
    }

    errorMsg.textContent = '';
    // Ajusta o timezone da data inserida para que a expiração ocorra no final do dia
    const dateObj = new Date(dataStr + 'T23:59:59');

    const recadoData = {
        titulo,
        mensagem,
        dataExpiracao: firebase.firestore.Timestamp.fromDate(dateObj),
        dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
        cor
    };

    try {
        await db.collection('recados').add(recadoData);
        document.getElementById('recado-modal').classList.add('hidden');
        loadRecadosList();
    } catch (error) {
        console.error('Erro ao salvar recado:', error);
        errorMsg.textContent = 'Erro ao salvar recado. Verifique sua permissão.';
    }
}

// Deleta um recado do Firebase
export async function deleteRecado(id) {
    if (!confirm('Deseja realmente apagar este aviso permanentemente?')) return;
    
    try {
        await db.collection('recados').doc(id).delete();
        loadRecadosList();
    } catch (e) {
        console.error('Erro ao apagar recado:', e);
        alert('Erro ao apagar recado. Tente novamente.');
    }
}

// Carrega a lista de recados e constrói a UI no painel do administrador
export async function loadRecadosList() {
    const container = document.getElementById('admin-recados-list');
    if (!container) return;

    try {
        const snap = await db.collection('recados').orderBy('dataCriacao', 'desc').get();
        
        if (snap.empty) {
            container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 2rem;">Nenhum recado cadastrado.</p>';
            return;
        }

        container.innerHTML = '';
        const now = new Date();
        
        snap.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            
            let dtExpFormatted = 'Sem data';
            let expObj = null;
            if (data.dataExpiracao) {
                expObj = data.dataExpiracao.toDate ? data.dataExpiracao.toDate() : new Date(data.dataExpiracao);
                dtExpFormatted = expObj.toLocaleDateString('pt-BR');
            }

            // Se já expirou, a tag fica vermelha ou cinza
            const isExpired = expObj && expObj < now;
            const statusBadge = isExpired ? 
                `<span style="background: #fee2e2; color: #ef4444; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Expirado</span>` : 
                `<span style="background: #dcfce7; color: #10b981; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Ativo</span>`;

            const div = document.createElement('div');
            div.style.cssText = `
                background: white; 
                border: 1px solid #e2e8f0; 
                border-radius: 8px; 
                padding: 1.5rem; 
                margin-bottom: 1rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
                border-left: 6px solid ${data.cor || '#3b82f6'};
                position: relative;
                opacity: ${isExpired ? '0.6' : '1'};
            `;

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                            <h3 style="margin: 0; color: #1e293b; font-size: 1.25rem;">${data.titulo}</h3>
                            ${statusBadge}
                        </div>
                        <div style="font-size: 0.85rem; color: #64748b;">Expira no final do dia: <strong style="color: #475569;">${dtExpFormatted}</strong></div>
                    </div>
                    <button class="action-button btn-danger delete-recado-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.85rem; cursor: pointer;">Excluir</button>
                </div>
                <p style="color: #475569; margin-top: 1rem; white-space: pre-line; line-height: 1.6;">${data.mensagem}</p>
            `;

            container.appendChild(div);
        });

        // Adiciona listeners para os botões de excluir
        const delBtns = container.querySelectorAll('.delete-recado-btn');
        delBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.target.getAttribute('data-id');
                deleteRecado(docId);
            });
        });

    } catch (e) {
        console.error('Erro ao listar recados:', e);
        container.innerHTML = '<p class="error">Erro ao carregar lista de recados.</p>';
    }
}
