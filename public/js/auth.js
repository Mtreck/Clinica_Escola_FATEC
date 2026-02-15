// js/auth.js

import { auth } from "./firebase.js";
import { initializeDashboard } from "./dashboard.js";

// Removido o DOMContentLoaded wrapper. A chamada initAuth() no HTML já é suficiente.
export function initAuth() {
    console.log("🔥 initAuth iniciado");
    const path = window.location.pathname;
    console.log("📍 Caminho atual:", path);

    // Identificação mais robusta da página
    const isDashboard = path.includes("dashboard.html");
    const isIndex = path.includes("index.html") || path.endsWith("/") || path.endsWith("public/") || !isDashboard;

    // 1. Configura o Listener de Autenticação
    auth.onAuthStateChanged(user => {
        console.log("bust👀 Estado da autenticação mudou. Usuário:", user ? user.email : "Nenhum");

        // Se está no dashboard e NÃO tem login → manda pro index
        if (isDashboard) {
            if (!user) {
                console.warn("🚫 Acesso negado. Redirecionando para login...");
                window.location.href = "index.html";
            } else {
                console.log("✅ Usuário autorizado no Dashboard.");
                // Inicializa o dashboard
                initializeDashboard();
            }
        }

        // Se está no index e JÁ logou → manda pro dashboard
        if (isIndex && user) {
            console.log("🔄 Usuário já logado. Redirecionando para Dashboard...");
            window.location.href = "dashboard.html";
        }
    });

    // 2. Configura o Botão de Login 
    const loginButton = document.getElementById("login-button");

    if (loginButton) {
        loginButton.addEventListener("click", handleLogin);
    }
}


async function handleLogin(event) {
    // ESSENCIAL: Impede o comportamento padrão do formulário (que recarregaria a página)
    if (event) {
        event.preventDefault();
    }

    const emailInput = document.getElementById("email-input");
    const passwordInput = document.getElementById("password-input");
    const errorMessage = document.getElementById("error-message");

    const email = emailInput ? emailInput.value : '';
    const senha = passwordInput ? passwordInput.value : '';

    if (errorMessage) errorMessage.textContent = "";

    if (!email || !senha) {
        if (errorMessage) errorMessage.textContent = "Por favor, insira e-mail e senha.";
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, senha);
        // O onAuthStateChanged (configurado acima) irá agora redirecionar a página.
    }
    catch (error) {
        console.error("Erro de Login:", error);

        let message = "Erro ao fazer login. Verifique suas credenciais.";

        if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") message = "Usuário ou senha inválidos.";
        else if (error.code === "auth/wrong-password") message = "Senha incorreta.";
        else if (error.code === "auth/invalid-email") message = "E-mail inválido.";
        else if (error.code === "auth/operation-not-allowed") message = "Login por email/senha não habilitado no Firebase.";

        if (errorMessage) errorMessage.textContent = message;
    }
}
