/*
 * Configuración del aplicativo.
 *
 * API_URL: pega aquí la URL de la aplicación web de Google Apps Script
 * (termina en /exec). Los pasos están en el README.
 *
 * Mientras API_URL esté vacía, el aplicativo funciona en "modo demostración":
 * los datos se guardan solo en este navegador y no se envían correos.
 */
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxsgDgtrqCzBJp7FzeRPZ1jBVkcAhyEvptRmD8rFGVCpO6bTbJh2AhxOWI1bHw9J_Xi/exec',

  // Solo para el modo demostración. En modo Google Sheets el usuario y la
  // contraseña viven en las propiedades del script, no en este archivo.
  DEMO_USUARIO: 'admin.ninosdepaz',
  DEMO_SALT: 'ee6076bc51ccda504f1f6f52d020728c',
  DEMO_HASH: '363bf6a1a95d84be901afb345e3f2be6928c738d8574abd1a0b2665662223296'
};
