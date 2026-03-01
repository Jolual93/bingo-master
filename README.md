# 🎱 Bingo Master — Multijugador Online

Juego de Bingo con multijugador en tiempo real usando Firebase y sistema de invitación por link.

---

## 🚀 Instalación rápida

### 1. Instala las dependencias
```bash
npm install
```

### 2. Configura Firebase

Ve a [https://console.firebase.google.com](https://console.firebase.google.com) y:

1. Crea un proyecto nuevo (o usa uno existente)
2. En el panel lateral: **Build → Authentication**
   - Haz clic en "Get started"
   - Activa el proveedor **Anónimo**
3. En el panel lateral: **Build → Firestore Database**
   - Haz clic en "Create database"
   - Selecciona **"Start in test mode"** (para empezar rápido)
   - Elige una región cercana
4. En **Project Settings** (engranaje ⚙️ arriba a la izquierda):
   - Baja hasta "Your apps" → clic en `</>`  (Web)
   - Registra la app con cualquier nombre
   - Copia el objeto `firebaseConfig`

5. Abre el archivo `src/firebaseConfig.js` y pega tus valores:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "mi-proyecto.firebaseapp.com",
  projectId: "mi-proyecto",
  storageBucket: "mi-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 3. Inicia el servidor de desarrollo
```bash
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en el navegador.

---

## 🌐 Cómo funciona el link de invitación

1. El anfitrión crea una sala → en el lobby aparece el panel **"Invita a tus amigos"**
2. Copia el **link completo** o usa el botón **"Compartir con..."** (en móvil abre WhatsApp, etc.)
3. El amigo abre el link → aparece un modal pidiendo su nombre → entra directo al lobby
4. ¡Listo! Sin necesidad de copiar códigos manualmente.

---

## 📦 Build para producción

```bash
npm run build
```

Los archivos quedan en la carpeta `dist/`. Puedes subirlos a:
- **Firebase Hosting** (`firebase deploy`)
- **Vercel** (`vercel --prod`)
- **Netlify** (arrastra la carpeta `dist`)

---

## 🎮 Modos de juego

| Modo | Condición | Costo | Premio |
|------|-----------|-------|--------|
| 1 Línea | Horizontal, vertical o diagonal | 10 🪙 | 50 🪙 |
| Cruz (+) | Fila 3 + Columna 3 | 20 🪙 | 120 🪙 |
| Equis (X) | Ambas diagonales | 20 🪙 | 120 🪙 |
| Cartón Lleno | Las 25 casillas | 50 🪙 | 400 🪙 |

## 🎁 Código promocional

Ingresa `JOLUAL` en el menú principal para obtener 10,000 monedas.
