import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 1. IMPORTAR MÓDULOS DE AUTENTICACIÓN
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDoNK2C7ZLgIeys4_pkeeA4tu5MWhnEe90",
    authDomain: "rrhh-app-db86a.firebaseapp.com",
    projectId: "rrhh-app-db86a",
    storageBucket: "rrhh-app-db86a.firebasestorage.app",
    messagingSenderId: "581054831697",
    appId: "1:581054831697:web:4a973e6c519502fe062c70"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// 2. INICIALIZAR AUTH
const auth = getAuth(app);

// Referencias DOM Generales y Auth
const loadingContainer = document.getElementById('loading-container'); // NUEVO
const linkBoleta = document.getElementById('link-boleta');
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const formLogin = document.getElementById('form-login');
const btnLogout = document.getElementById('btn-logout');
const loginError = document.getElementById('login-error');
const btnForgotPassword = document.getElementById('btn-forgot-password');

// Referencias DOM CRUD
const formEmpleado = document.getElementById('form-empleado');
const listaEmpleados = document.getElementById('lista-empleados');
const zonaImpresion = document.getElementById('zona-impresion');

let editStatus = false;
let idEdicion = '';

// Variables para controlar las escuchas de Firestore
let unsubEmpleados = null;
let unsubAusencias = null;

// ==========================================
// 0. CONTROL DE SESIÓN (LOGIN / LOGOUT)
// ==========================================

onAuthStateChanged(auth, (user) => {
    console.log("Estado de sesión detectado. Usuario:", user ? user.email : "Ninguno");

    // 1. Blindaje: Solo intentamos ocultar la carga si el contenedor existe
    if (loadingContainer) {
        loadingContainer.classList.add('hidden');
    } else {
        console.error("FALTA EL ID: 'loading-container' en el HTML");
    }

    if (user) {
        // Hay sesión activa
        if (loginContainer) loginContainer.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');

        // Verificamos que la función exista antes de llamarla
        if (typeof iniciarListenersFirestore === 'function') {
            iniciarListenersFirestore();
        }
    } else {
        // No hay sesión (o acabas de cerrar sesión)
        if (appContainer) appContainer.classList.add('hidden');
        if (loginContainer) loginContainer.classList.remove('hidden');

        // Verificamos que la función exista antes de llamarla
        if (typeof detenerListenersFirestore === 'function') {
            detenerListenersFirestore();
        }
    }
    // Evento: Restablecer Contraseña
    if (btnForgotPassword) {
        btnForgotPassword.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value;

            // Validación preliminar: El usuario debe escribir el correo primero
            if (!email) {
                if (loginError) {
                    loginError.className = "text-red-500 text-sm text-center font-semibold";
                    loginError.classList.remove('hidden');
                    loginError.innerText = "Por favor, escribe tu correo electrónico en el campo de arriba para enviarte el enlace de recuperación.";
                }
                return;
            }

            try {
                // Se invoca el método nativo de Firebase enviando el correo capturado
                await sendPasswordResetEmail(auth, email);

                if (loginError) {
                    // Reutilizamos el contenedor de errores cambiando el color a verde para indicar éxito
                    loginError.className = "text-green-600 text-sm text-center font-semibold bg-green-50 p-2 rounded border border-green-200";
                    loginError.classList.remove('hidden');
                    loginError.innerText = "¡Enlace enviado! Revisa tu bandeja de entrada o la carpeta de spam para restablecer tu contraseña.";
                }
            } catch (error) {
                console.error("Error al solicitar restablecimiento de contraseña:", error);
                if (loginError) {
                    loginError.className = "text-red-500 text-sm text-center font-semibold";
                    loginError.classList.remove('hidden');

                    // Errores comunes de Firebase Auth
                    if (error.code === 'auth/invalid-email') {
                        loginError.innerText = "El formato del correo electrónico no es válido.";
                    } else if (error.code === 'auth/user-not-found') {
                        loginError.innerText = "No existe ninguna cuenta registrada con este correo.";
                    } else {
                        loginError.innerText = "Ocurrió un error al intentar enviar el correo. Inténtalo más tarde.";
                    }
                }
            }
        });
    }
});

// Evento: Iniciar Sesión
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        formLogin.reset();
        loginError.classList.add('hidden');
    } catch (error) {
        loginError.className = "text-red-500 text-sm text-center font-semibold";
        loginError.classList.remove('hidden');
        loginError.innerText = "Error: Credenciales incorrectas o usuario no encontrado.";
        console.error(error);
    }
});

// Evento: Cerrar Sesión
btnLogout.addEventListener('click', () => {
    signOut(auth);
});
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            // 1. Volvemos a mostrar la pantalla de carga para una transición suave
            loadingContainer.classList.remove('hidden');

            // 2. Cerramos la sesión en Firebase
            await signOut(auth);

            // 3. Forzamos la recarga de la página para limpiar toda la memoria caché
            window.location.reload();
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("Hubo un problema al cerrar la sesión.");
        }
    });
}


// Función para detener listeners al cerrar sesión
function detenerListenersFirestore() {
    if (unsubEmpleados) unsubEmpleados();
    if (unsubAusencias) unsubAusencias();
}
// ==========================================
// 1. LECTURA DE EMPLEADOS Y SINCRONIZACIÓN
// ==========================================
function iniciarListenersFirestore() {
    // IMPORTANTE: Se asigna a la variable unsubEmpleados el onSnapshot de empleados
    unsubEmpleados = onSnapshot(collection(db, "empleados"), (snapshot) => {
        listaEmpleados.innerHTML = '';
        if (selectEmpleado) selectEmpleado.innerHTML = '<option value="">Seleccione un empleado...</option>';

        snapshot.forEach((doco) => {
            const emp = doco.data();
            const id = doco.id;

            onSnapshot(collection(db, "empleados"), (snapshot) => {
                listaEmpleados.innerHTML = '';
                // Limpiar el select de ausencias y dejar la opción por defecto
                if (selectEmpleado) selectEmpleado.innerHTML = '<option value="">Seleccione un empleado...</option>';

                snapshot.forEach((doco) => {
                    const emp = doco.data();
                    const id = doco.id;

                    // Llenar lista de gestión
                    const li = document.createElement('li');
                    li.className = "flex justify-between items-center p-3 bg-gray-50 border rounded shadow-sm";
                    li.innerHTML = `
            <div class="flex-1">
                <p class="font-bold text-sm">${emp.nombre}</p>
                <p class="text-xs text-gray-500">${emp.cargo} - $${emp.salario.toFixed(2)}</p>
            </div>
            <div class="flex gap-1">
                <button class="btn-calc bg-green-500 text-white px-2 py-1 print:hidden flex items-center justify-center" style="border-radius: 50px;" title="Generar Boleta">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://w3.org">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg></button>
                <button class="btn-edit flex items-center justify-center bg-blue-500 text-white px-2 py-1 rounded text-xs print:hidden" style="border-radius: 50px;" title="Editar">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                </svg></button>
                <button class="btn-del bg-red-500 text-white px-2 py-1 rounded text-xs print:hidden" style="border-radius: 50px;" title="Eliminar">✖︎</button>
            </div>
        `;

                    li.querySelector('.btn-calc').addEventListener('click', () => generarBoleta(emp));
                    li.querySelector('.btn-del').addEventListener('click', () => borrarEmpleado(id));
                    li.querySelector('.btn-edit').addEventListener('click', () => cargarParaEdicion(id, emp));
                    listaEmpleados.appendChild(li);

                    // Llenar el select del Módulo 3
                    if (selectEmpleado) {
                        const option = document.createElement('option');
                        option.value = emp.nombre;
                        option.text = emp.nombre;
                        selectEmpleado.appendChild(option);
                    }
                });
            });
        });
    });
    // ESCUCHAR CAMBIOS EN TIEMPO REAL (HISTORIAL)
    onSnapshot(collection(db, "ausencias"), (snapshot) => {
        listaAusencias.innerHTML = '';
        snapshot.forEach((doco) => {
            const aus = doco.data();
            const id = doco.id;

            const li = document.createElement('li');
            li.className = "p-3 bg-gray-50 border-l-4 border-black rounded text-sm shadow-sm flex justify-between items-start";
            li.innerHTML = `
            <div class="flex-1">
                <div class="flex justify-between font-bold mb-1 mr-4">
                    <span class="text-blue-800">${aus.empleado}</span>
                    <span class="text-xs bg-gray-200 px-2 py-1 rounded text-gray-700">${aus.tipo}</span>
                </div>
                <p class="text-gray-600">Del: ${aus.inicio} al ${aus.fin}</p>
                <p class="text-gray-400 italic text-xs">"${aus.motivo}"</p>
            </div>
            <div class="flex flex-col gap-1 print:hidden">
                <button class="btn-edit-aus flex items-center justify-center bg-blue-400 text-white px-2 py-1 rounded text-[10px] hover:bg-blue-500" style="border-radius: 50px;" title="Editar">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                <button class="btn-del-aus bg-red-400 text-white px-2 py-1 rounded text-[10px] hover:bg-red-500" style="border-radius: 50px;" title="Eliminar">✖︎</button>
            </div>
        `;

            // Eventos para los nuevos botones
            li.querySelector('.btn-edit-aus').addEventListener('click', () => cargarParaEdicionAusencia(id, aus));
            li.querySelector('.btn-del-aus').addEventListener('click', () => borrarAusencia(id));

            listaAusencias.appendChild(li);
        });
    });

    // ==========================================
    // 2. GESTIÓN DE EMPLEADOS (CRUD)
    // ==========================================
    formEmpleado.addEventListener('submit', async (e) => {
        e.preventDefault();
        const empleado = {
            nombre: document.getElementById('nombre').value,
            dui: document.getElementById('dui').value,
            cargo: document.getElementById('cargo').value,
            fechaIngreso: document.getElementById('fecha-ingreso').value,
            salario: parseFloat(document.getElementById('salario').value)
        };

        try {
            if (!editStatus) {
                await addDoc(collection(db, "empleados"), empleado);
            } else {
                await updateDoc(doc(db, "empleados", idEdicion), empleado);
                resetForm();
            }
            formEmpleado.reset();
        } catch (err) {
            console.error("Error:", err);
        }
    });

    async function borrarEmpleado(id) {
        if (confirm("¿Borrar empleado?")) {
            await deleteDoc(doc(db, "empleados", id));
        }
        if (linkBoleta) linkBoleta.classList.add('hidden');
        zonaImpresion.classList.add('hidden');
    }

    function cargarParaEdicion(id, emp) {
        document.getElementById('nombre').value = emp.nombre;
        document.getElementById('dui').value = emp.dui;
        document.getElementById('cargo').value = emp.cargo;
        document.getElementById('fecha-ingreso').value = emp.fechaIngreso || '';
        document.getElementById('salario').value = emp.salario;
        editStatus = true;
        idEdicion = id;
        const btn = formEmpleado.querySelector('button[type="submit"]');
        btn.innerText = "🔃 Actualizar Empleado";
        btn.className = "w-full bg-purple-600 text-white p-2 rounded font-bold";
        btn.title = "Actualizar Empleado";
    }

    function resetForm() {
        editStatus = false;
        idEdicion = '';
        const btn = formEmpleado.querySelector('button[type="submit"]');
        btn.innerText = "💾 Guardar Empleado";
        btn.className = "w-full bg-blue-600 text-white p-2 rounded";
        btn.title = "Guardar Empleado";
        if (linkBoleta) linkBoleta.classList.add('hidden');
        zonaImpresion.classList.add('hidden');
    }

    // ==========================================
    // 3. GESTIÓN DE AUSENCIAS (MÓDULO 3)
    // ==========================================

    // Referencias Módulo 3
    const formAusencia = document.getElementById('form-ausencia');
    const selectEmpleado = document.getElementById('aus-empleado');
    const listaAusencias = document.getElementById('lista-ausencias');
    // Variables para controlar la edición de ausencias
    let editStatusAusencia = false;
    let idEdicionAusencia = '';

    // GUARDAR O ACTUALIZAR AUSENCIA
    formAusencia.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ausencia = {
            empleado: document.getElementById('aus-empleado').value,
            inicio: document.getElementById('aus-inicio').value,
            fin: document.getElementById('aus-fin').value,
            tipo: document.getElementById('aus-tipo').value,
            motivo: document.getElementById('aus-motivo').value,
            fechaActualizacion: new Date().toISOString()
        };

        try {
            if (!editStatusAusencia) {
                // Crear nuevo registro
                await addDoc(collection(db, "ausencias"), ausencia);
                alert("Ausencia registrada con éxito.");
            } else {
                // Actualizar registro existente
                await updateDoc(doc(db, "ausencias", idEdicionAusencia), ausencia);
                alert("Registro de ausencia actualizado.");
                resetFormAusencia();
            }
            formAusencia.reset();
        } catch (err) {
            console.error("Error al procesar ausencia:", err);
        }
    });



    // FUNCIÓN PARA ELIMINAR
    async function borrarAusencia(id) {
        if (confirm("¿Deseas eliminar este registro de ausencia permanentemente?")) {
            try {
                await deleteDoc(doc(db, "ausencias", id));
            } catch (err) {
                console.error("Error al eliminar ausencia:", err);
            }
        }
    }

    // FUNCIÓN PARA CARGAR DATOS EN EL FORMULARIO
    function cargarParaEdicionAusencia(id, aus) {
        document.getElementById('aus-empleado').value = aus.empleado;
        document.getElementById('aus-inicio').value = aus.inicio;
        document.getElementById('aus-fin').value = aus.fin;
        document.getElementById('aus-tipo').value = aus.tipo;
        document.getElementById('aus-motivo').value = aus.motivo;

        editStatusAusencia = true;
        idEdicionAusencia = id;

        // Cambiar aspecto del botón para indicar edición
        const btn = formAusencia.querySelector('button[type="submit"]');
        btn.innerText = "🔃 Actualizar Registro";
        btn.className = "w-full bg-orange-600 text-white p-2 rounded font-bold hover:bg-orange-700";
        btn.title = "Actualizar Registro";
    }

    // FUNCIÓN PARA RESETEAR EL ESTADO DEL FORMULARIO
    function resetFormAusencia() {
        editStatusAusencia = false;
        idEdicionAusencia = '';
        const btn = formAusencia.querySelector('button[type="submit"]');
        btn.innerText = "💾 Guardar Registro";
        btn.className = "w-full bg-yellow-600 text-white p-2 rounded hover:bg-yellow-700 font-bold";
        btn.title = "Guardar Registro";
    }


    // 4. CÁLCULO DE BOLETA (Incluye Aguinaldo y Quincena 25)
    function generarBoleta(emp) {
        const salario = emp.salario;

        // Cálculos de deducciones estándar de ley
        const isss = salario > 1000 ? 30 : salario * 0.03;
        const afp = salario * 0.0725;
        const baseRenta = salario - isss - afp;
        let isr = 0;

        if (baseRenta > 2038.10) isr = (baseRenta - 2038.10) * 0.30 + 288.57;
        else if (baseRenta > 895.24) isr = (baseRenta - 895.24) * 0.20 + 60.00;
        else if (baseRenta > 550.00) isr = (baseRenta - 550.00) * 0.10 + 17.67;

        let liquido = salario - isss - afp - isr;

        // ==========================================
        // LÓGICA DE AGUINALDO 
        // ==========================================
        let aguinaldo = 0;
        const chkAguinaldo = document.getElementById('chk-aguinaldo');
        const containerAguinaldo = document.getElementById('bol-container-aguinaldo');

        if (chkAguinaldo && chkAguinaldo.checked && emp.fechaIngreso) {
            const [year, month, day] = emp.fechaIngreso.split('-');
            const fechaIngreso = new Date(year, month - 1, day);
            const anioActual = new Date().getFullYear();
            const fechaCorte = new Date(anioActual, 9, 20);

            const milisegundosPorDia = 1000 * 60 * 60 * 24;
            const diasTrabajados = Math.floor((fechaCorte - fechaIngreso) / milisegundosPorDia);

            if (diasTrabajados > 0) {
                const salarioDiario = salario / 30;
                const aniosAntiguedad = diasTrabajados / 365;

                if (aniosAntiguedad >= 10) aguinaldo = salarioDiario * 21;
                else if (aniosAntiguedad >= 3) aguinaldo = salarioDiario * 19;
                else if (aniosAntiguedad >= 1) aguinaldo = salarioDiario * 15;
                else aguinaldo = (salarioDiario * 15 / 365) * diasTrabajados;
            }

            liquido += aguinaldo;
            document.getElementById('bol-aguinaldo').innerText = aguinaldo.toFixed(2);
            containerAguinaldo.classList.remove('hidden');
        } else {
            if (containerAguinaldo) containerAguinaldo.classList.add('hidden');
        }

        // ==========================================
        // LÓGICA DE QUINCENA 25 
        // ==========================================
        let quincena25 = 0;
        const chkQuincena25 = document.getElementById('chk-quincena25');
        const containerQuincena25 = document.getElementById('bol-container-quincena25');

        // Solo se ejecuta si la casilla está marcada
        if (chkQuincena25 && chkQuincena25.checked) {
            // Regla: Solo aplica para salarios menores o iguales a $1500.00
            if (salario <= 1500.00) {
                quincena25 = salario * 0.50; // Exactamente el 50% del salario nominal

                // Se suma al líquido sin afectarse por descuentos de ley
                liquido += quincena25;

                document.getElementById('bol-quincena25').innerText = quincena25.toFixed(2);
                containerQuincena25.classList.remove('hidden');
            } else {
                // Si el empleado gana más de $1500, se oculta el contenedor aunque marquen la casilla
                if (containerQuincena25) containerQuincena25.classList.add('hidden');
                alert(`Aviso: El empleado ${emp.nombre} no aplica para la Quincena 25 porque su salario ($${salario.toFixed(2)}) supera el límite legal de $1,500.00.`);
            }
        } else {
            if (containerQuincena25) containerQuincena25.classList.add('hidden');
        }

        // ==========================================
        // LLENADO DEL DOM PARA IMPRESIÓN
        // ==========================================
        document.getElementById('bol-nombre').innerText = emp.nombre;
        document.getElementById('bol-dui').innerText = emp.dui;
        document.getElementById('bol-cargo').innerText = emp.cargo;
        document.getElementById('bol-fecha-ingreso').innerText = emp.fechaIngreso;
        document.getElementById('bol-salario').innerText = salario.toFixed(2);
        document.getElementById('bol-isss').innerText = isss.toFixed(2);
        document.getElementById('bol-afp').innerText = afp.toFixed(2);
        document.getElementById('bol-isr').innerText = isr.toFixed(2);
        document.getElementById('bol-liquido').innerText = liquido.toFixed(2);

        document.getElementById('pat-isss').innerText = (salario > 1000 ? 75 : salario * 0.075).toFixed(2);
        document.getElementById('pat-afp').innerText = (salario * 0.0875).toFixed(2);

        zonaImpresion.classList.remove('hidden');
        window.location.hash = 'zona-impresion';
        if (linkBoleta) linkBoleta.classList.remove('hidden');
    }


    // VALIDACIONES EN TIEMPO REAL (MÓDULO 1)
    const inputNombre = document.getElementById('nombre');
    const inputDui = document.getElementById('dui');
    const inputCargo = document.getElementById('cargo');
    const inputFechaIngreso = document.getElementById('fecha-ingreso');
    const inputSalario = document.getElementById('salario');

    // Bloquear números y símbolos en Nombre (solo permite letras, tildes y espacios)
    inputNombre.addEventListener('input', function () {
        this.value = this.value.replace(/[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/g, '');
    });

    // Bloquear letras y símbolos en DUI (solo permite números)
    inputDui.addEventListener('input', function () {
        this.value = this.value.replace(/[^0-9]/g, '');
    });

    // Bloquear números y símbolos en Cargo
    inputCargo.addEventListener('input', function () {
        this.value = this.value.replace(/[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/g, '');
    });

    // Bloquear el signo negativo en el salario
    inputSalario.addEventListener('keydown', function (e) {
        // Si la tecla presionada es el signo menos (-), bloqueamos la acción
        if (e.key === '-') {
            e.preventDefault();
        }
    });

    // Validación extra por si copian y pegan un número negativo
    inputSalario.addEventListener('input', function () {
        if (this.value < 0) {
            this.value = ''; // Borra el campo si detecta un valor menor a cero
        }
    });
}

// ==========================================
// REFERENCIAS Y LÓGICA DEL MENÚ RESPONSIVO
// ==========================================
const btnMenu = document.getElementById('btn-menu');
const btnCloseMenu = document.getElementById('btn-close-menu');
const sidebar = document.getElementById('sidebar');
const mobileOverlay = document.getElementById('mobile-overlay');

// Función para abrir y cerrar el menú deslizable
function toggleMenu() {
    sidebar.classList.toggle('-translate-x-full');
    mobileOverlay.classList.toggle('hidden');
}

// Escuchar clics en los botones y en el fondo oscuro
if (btnMenu) btnMenu.addEventListener('click', toggleMenu);
if (btnCloseMenu) btnCloseMenu.addEventListener('click', toggleMenu);
if (mobileOverlay) mobileOverlay.addEventListener('click', toggleMenu);

// Ocultar menú automáticamente al hacer clic en cualquier opción (solo en móviles)
const sidebarLinks = sidebar.querySelectorAll('a');
sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        // Verifica si la pantalla es menor a 768px (breakpoint 'md' de Tailwind)
        if (window.innerWidth < 768) {
            toggleMenu();
        }
    });
});