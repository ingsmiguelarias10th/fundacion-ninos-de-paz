# Fundación Niños de Paz | Panel de administración

Aplicativo web para registrar a los jóvenes de la Fundación Niños de Paz con el formato oficial del "Formulario de inscripción".

- Inicio de sesión de un único administrador (no se pueden crear cuentas).
- Recuperación de contraseña con un código enviado al correo asociado.
- Lista de jóvenes con buscador y paginación. Cada joven se puede ver, editar o eliminar.
- Botón "Ver hoja de cálculo" que abre la hoja de Google Sheets.
- Formulario con todos los apartados de la plantilla: datos del participante con foto, información académica, salud y seguridad, datos del acudiente y autorización con firma. La firma se hace en pantalla o se sube como imagen.
- "Vista previa" muestra la información sobre la plantilla oficial.
- "Exportar" descarga el PDF y guarda el registro en una hoja de Google Sheets. El PDF, la foto y la firma quedan en una carpeta de Google Drive.

## Cómo funciona

| Parte | Dónde vive |
| --- | --- |
| Sitio web | GitHub Pages (esta carpeta) |
| Base de datos | Una hoja de cálculo de Google Sheets, pestaña "Inscritos" |
| PDF, fotos y firmas | Carpeta de Google Drive "Fundación Niños de Paz - Inscripciones" |
| Lógica del servidor | Google Apps Script (`apps-script/Code.gs`) |

Mientras no se configure la conexión con Google, el sitio funciona en "modo demostración": los datos se guardan solo en el navegador que se esté usando y no se envían correos.

## Conectar con Google Sheets (una sola vez, unos 10 minutos)

1. Entra a [sheets.new](https://sheets.new) con la cuenta de Google de la fundación y ponle de nombre "Fundación Niños de Paz - Inscritos".
2. En la hoja, abre "Extensiones" y luego "Apps Script".
3. Borra el contenido de `Código.gs`, pega todo el contenido de [`apps-script/Code.gs`](apps-script/Code.gs) y guarda.
4. En la barra de arriba elige la función `configurarInicial` y pulsa "Ejecutar". Google pedirá permisos (hoja de cálculo, Drive y envío de correo). Acepta. Si aparece "Google no verificó esta app", entra en "Configuración avanzada" y luego "Ir a ... (no seguro)". Es normal porque el script es tuyo.
5. Pulsa "Implementar", luego "Nueva implementación". En el engranaje elige "Aplicación web" y configura:
   - Ejecutar como: "Yo"
   - Quién tiene acceso: "Cualquier usuario"
6. Pulsa "Implementar" y copia la URL que termina en `/exec`.
7. En GitHub abre [`js/config.js`](js/config.js), pulsa el lápiz para editar, pega la URL entre las comillas de `API_URL` y guarda con "Commit changes". En uno o dos minutos el sitio queda conectado.
8. Entra al sitio con el usuario y la contraseña iniciales. El aplicativo pedirá crear una contraseña nueva y asociar el correo de recuperación.

"Cualquier usuario" significa que el sitio puede comunicarse con el script. Los datos siguen protegidos: cada petición exige haber iniciado sesión con la contraseña del administrador, y la hoja y la carpeta de Drive solo las ve el dueño de la cuenta.

## Actualizar el script

Cada vez que cambie `apps-script/Code.gs` en este repositorio:

1. Abre el proyecto de Apps Script, borra el código de `Código.gs`, pega el nuevo y guarda.
2. Ve a "Implementar", "Administrar las implementaciones", pulsa el lápiz y en "Versión" elige "Nueva versión".
3. Revisa que "Usuarios con acceso" siga en "Cualquier persona" y pulsa "Implementar".

Así la URL no cambia y no hay que tocar `js/config.js`. No uses "Nueva implementación", porque crea otra URL.

## Si se pierde la contraseña

- Con correo asociado: en el inicio de sesión pulsa "¿Olvidaste tu contraseña?" y usa el código que llega al correo.
- Sin correo asociado: en el editor de Apps Script ejecuta la función `restablecerAdministrador`. La cuenta vuelve a las credenciales iniciales y el aplicativo pedirá cambiarlas al entrar.

## Seguridad

- La contraseña se guarda como hash SHA-256 con sal en las propiedades del script, nunca en texto plano ni en este repositorio.
- Las sesiones duran 6 horas y se cierran todas al cambiar la contraseña.
- Después de 5 intentos fallidos el inicio de sesión se bloquea 15 minutos.
- El código de recuperación vence en 15 minutos y admite 5 intentos.
- Los textos que empiezan por `=`, `+`, `-` o `@` se guardan como texto para que la hoja no los ejecute como fórmulas.

Los formularios contienen datos personales y de salud de menores de edad. En Colombia su tratamiento se rige por la Ley 1581 de 2012 (Habeas Data). Conviene no compartir la hoja ni la carpeta de Drive con personas ajenas a la fundación.

## Estructura

```
index.html            Pantallas del aplicativo
css/styles.css        Estilos
js/config.js          URL de Google Apps Script
js/api.js             Conexión con Google Sheets o modo demostración
js/plantilla.js       Dibuja la inscripción sobre la plantilla y genera el PDF
js/app.js             Lógica de la interfaz
assets/plantilla.jpg  Plantilla oficial del formulario
apps-script/Code.gs   Servidor en Google Apps Script
```
