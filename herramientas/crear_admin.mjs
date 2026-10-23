// Crea el Administrador integrado de la app (resources/admin.json).
//
// La contraseña se escribe sin que se vea y NUNCA se guarda: en el archivo solo
// queda su huella (scrypt + sal), la misma que usa usuarios_nucleo.js.
// resources/admin.json NO se sube a GitHub (.gitignore), pero sí va dentro del
// instalador (extraResources), así que el Administrador entra en todas las PCs.
// Para cambiar la contraseña: correr esto de nuevo y publicar una versión nueva.
//
// Uso:  node herramientas/crear_admin.mjs

import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { CLAVE_MINIMA, huella, normalizarUsuario, revisarUsuario } from '../src/main/usuarios_nucleo.js'

const MINIMO_ADMIN = Math.max(CLAVE_MINIMA, 12)

function preguntar(texto, oculto = false) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (oculto) {
      rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); else rl.output.write('*'.repeat(s.length ? 1 : 0)) }
    }
    rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write('\n'); resolver(r) })
  })
}

const usuario = normalizarUsuario(await preguntar('Usuario del Administrador: '))
revisarUsuario(usuario)
const nombre = (await preguntar('Nombre completo: ')).trim() || usuario
const clave = await preguntar(`Contraseña (mínimo ${MINIMO_ADMIN} caracteres): `, true)
if (clave.length < MINIMO_ADMIN) { console.error(`La contraseña debe tener al menos ${MINIMO_ADMIN} caracteres.`); process.exit(1) }
const otra = await preguntar('Repite la contraseña: ', true)
if (otra !== clave) { console.error('Las contraseñas no coinciden. No se guardó nada.'); process.exit(1) }

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'admin.json')
writeFileSync(destino, JSON.stringify({ usuario, nombre, ...huella(clave), creado: new Date().toISOString() }, null, 1), 'utf8')
console.log(`Listo: Administrador "${usuario}" guardado en resources/admin.json (solo la huella, no la contraseña).`)
