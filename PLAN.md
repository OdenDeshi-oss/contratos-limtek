# Gestión Integral de Contratos — plan del proyecto

Proyecto nuevo e independiente (no es parte de ARCA / Generador de Altas).
Creado el 22/10/2026 a pedido de César Pariona.

## Objetivo

Una sola aplicación de escritorio que reúne tres herramientas que hoy están separadas:

| Herramienta actual | Qué hace | Tecnología actual |
|---|---|---|
| Generador de Contratos (`Desktop/CONTRATOS SELECCION`, v1.5.8) | Genera contratos, DJ y cartas de compromiso desde el Excel PRELIMINAR de Selección | Electron + React (JavaScript), docxtemplater |
| Renombrador de Contratos (`Downloads/renombrar_contratos.exe`) | Pone DNI y fechas en el nombre de los contratos escaneados | Python 3.13 + Tkinter + Tesseract |
| BuscaContratos (`Desktop/BUSQUEDA DE CONTRATOS MASIVOS`) | Encuentra y copia los contratos que pide un cliente, por DNI + fecha | Python + Tkinter, con licencias y actualizaciones |

## Decisiones tomadas (usuario, 22/10/2026)

- **Tecnología: la del Generador de Contratos** (Electron + React, JavaScript). Todo se pasa a eso.
- **Dos perfiles, cada uno ve solo lo suyo:**
  - **Contratos:** renombrar y buscar.
  - **Selección:** generar contratos, DJ y cartas de compromiso.
- **El perfil viene en la licencia.** Cada persona instala la app en su PC y su licencia dice qué perfil tiene. Se reutiliza el sistema de licencias de BuscaContratos (firma Ed25519, la app solo tiene la clave pública).
- **El renombrador debe leer contratos de Lima y de Provincia**, mejorando la lectura en todo sentido.
- **El buscador debe trabajar sobre una carpeta de OneDrive** que la persona de Contratos hoy abre **solo desde el navegador** (tenerlos en el escritorio le llenaba el disco).

## Lo que ya se sabe (revisado sin ejecutar nada)

### Renombrador: el código fuente se perdió
- Solo existe el `.exe`. El `renombrar_contrato.spec` de OneDrive apunta a `renombrar_contrato.py`, que ya no está. El `add_renombrar_gui.py` de esa carpeta es OTRA app (renombra constancias del T-Registro).
- Lógica reconstruida leyendo el ejecutable por dentro (sin abrirlo):
  1. PDFs sueltos o una carpeta.
  2. Solo la **primera hoja** → imagen → gris + umbral → Tesseract en español.
  3. DNI: "DNI + 8 dígitos" **después del texto "LA EMPRESA"**; la letra O cuenta como 0; se descarta **08845760** (el representante que firma por la empresa).
  4. Nombre: "Sr(a) … con DNI".
  5. Fechas: "a partir del dd/mm/aaaa" (inicio) y "término final será el dd/mm/aaaa" (fin), cláusula QUINTO.
  6. Mueve a `RENOMBRADOS` / `FALLIDOS` y genera `log_renombrado.xlsx` (Renombrados / Fallidos: Archivo original, Nuevo nombre, Estado, DNI, Nombre trabajador extraído, Fecha inicio, Fecha fin).
- Pesa 270 MB casi todo por Tesseract (345 MB descomprimido, probablemente todos los idiomas cuando solo usa español).

### Problemas que ya se ven en el renombrador actual
- **Los contratos de Provincia fallarían:** escriben la fecha con punto (`22.10.2026`, `13.10.2026` — vistos en contratos reales que pasaron por ARCA) y el renombrador solo acepta barra (`22/10/2026`).
- Solo lee la primera hoja: si las fechas caen en la segunda, va a FALLIDOS.

### Las tres herramientas son una cadena
Generador → se firma y se escanea → Renombrador (le pone DNI y fecha) → BuscaContratos (encuentra por DNI + fecha).
BuscaContratos solo reconoce archivos llamados `DNI - dd-mm-aaaa.pdf` (también `DNI-ddmmaaaa.pdf` y `DNI - dd-mm-aaaa (1).pdf`). **Ese formato de nombre no se puede romper.** Pendiente confirmar contra un archivo ya renombrado que es exactamente lo que produce el renombrador.

### Lo que ya resolvimos en ARCA y sirve aquí
- El lector de contratos de ARCA (`GENERADOR DE ALTAS/agents/ocr_documentos.py::leer_contrato`) lee por cláusula: QUINTO (fechas) y OCTAVO (sueldo), ignora el DNI 08845760 del firmante, corrige errores típicos del OCR en fechas ("21662B26", "01/og/2o26") y lee **todas** las hojas. Si el PDF es digital, lee su texto directo (instantáneo y exacto).
- Lección de ARCA: el número de hoja que anota quien lee no es confiable; hay que contar las hojas del archivo.

## Pendientes antes de programar

1. **OneDrive solo en el navegador — decidir el camino:**
   - **Opción A (recomendada): sincronizar la carpeta en su PC con "Archivos a petición".** Los archivos se ven en el Explorador pero siguen en la nube y **no ocupan espacio** hasta que se abren; se pueden volver a liberar. Eso resuelve justo el problema del disco lleno. Buscar por nombre no descarga nada y solo se bajan los contratos que coinciden. No necesita a TI (salvo que la empresa bloquee la sincronización).
   - **Opción B: conectarse a OneDrive por internet (Microsoft Graph).** Hay que registrar la app en el Microsoft de la empresa y, para leer y renombrar archivos de una carpeta compartida, probablemente un administrador de TI tiene que dar el permiso. Mucho más trabajo.
   - **Opción C (propuesta del usuario, 22/10/2026, la más alineada con cómo trabaja ella): entrar a OneDrive por el navegador.** La app abre OneDrive en su propia ventana, ella inicia sesión una vez (con la aprobación del celular si la piden) y, en vez de hacer clics, la app usa ESA sesión para pedirle a OneDrive la lista de archivos y bajar solo los que coinciden — el mismo método probado en ARCA con Workin (cookies de la sesión del navegador + llamadas directas a sus servicios, `workin_cliente.sesion_desde_navegador`). Para OneDrive/SharePoint eso es su API REST (`/_api/web/...`): listar carpetas, descargar un archivo y renombrarlo en la nube sin bajarlo. No necesita a TI ni sincronizar. Cuidados: la sesión vence (se pide entrar de nuevo); con miles de contratos conviene guardar un índice de nombres y actualizarlo solo con lo nuevo; para leer un escaneo hay que bajarlo un momento y borrarlo después. **Hay que verificarlo en vivo con su cuenta.**
   - Carpeta (enlace recibido 22/10/2026): OneDrive personal de la cuenta `limtek_contratos@limtek.com.pe`, sitio `https://tawaconsulting-my.sharepoint.com/personal/limtek_contratos_limtek_com_pe`, ruta `Documents/Escritorio/CARPETA COMPARTIDA-2026`. Probado sin sesión: redirige al inicio de sesión de Microsoft (no es un enlace público) — confirma que hace falta la opción C. Llamadas previstas: `/_api/web/GetFolderByServerRelativeUrl('/personal/limtek_contratos_limtek_com_pe/Documents/Escritorio/CARPETA COMPARTIDA-2026')/Folders` y `/Files`. El enlace va en la configuración de la app, no en el código. Falta: el primer inicio de sesión con esa cuenta.
2. **Contratos reales para probar la lectura:** unos 10 de Lima y 10 de Provincia, incluidos algunos que hoy terminan en FALLIDOS.
3. **Elegir el OCR por resultado, no a ojo:** Tesseract.js, el OCR que trae Windows, o un ayudante en Python dentro de la app. Se prueban los tres con los mismos contratos.

## Etapas propuestas

1. Crear el proyecto tomando como base el Generador de Contratos (ya tiene interfaz, plantillas Word y actualizaciones).
2. Ingreso por perfil según la licencia (Contratos / Selección).
3. Pasar el buscador.
4. Rehacer el renombrador con la lectura mejorada, probada con los contratos reales.
