// js/app.js
import { initAuth } from "./auth.js";

// Inicializa o processo de autenticação e listeners
// O redirecionamento e inicialização do dashboard ocorrem dentro do callback do auth.js
document.addEventListener("DOMContentLoaded", () => {
    initAuth();
});