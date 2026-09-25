import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsO89sOJP9xoQH0-b4Lyf2D_E9ku_JKc0",
  authDomain: "cepan-acesso.firebaseapp.com",
  projectId: "cepan-acesso",
  storageBucket: "cepan-acesso.firebasestorage.app",
  messagingSenderId: "179404408385",
  appId: "1:179404408385:web:6afff01f3b82ca6f2668c0"
};

const RECAPTCHA_V3_SITE_KEY = "";

export const app = initializeApp(firebaseConfig);

if (RECAPTCHA_V3_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

export const db = getFirestore(app);
export const auth = getAuth(app);

export const COLECAO = "solicitacoes_acesso";
export const COLECAO_PORTEIROS = "porteiros";
export const REGEX_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
