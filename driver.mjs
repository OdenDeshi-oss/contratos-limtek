import { _electron as electron } from 'playwright-core'
import { join, resolve } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_DIR   = resolve(__dirname)
const SHOT_DIR  = join(APP_DIR, 'screenshots')
mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = join(APP_DIR, 'node_modules/electron/dist/electron.exe')

async function main() {
  console.log('Launching Electron app...')

  // Remove ELECTRON_RUN_AS_NODE so Electron initializes as browser (not plain Node)
  const env = { ...process.env, NODE_ENV: 'production' }
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR],
    env,
    timeout: 30_000,
  })

  console.log('Windows:', app.windows().length)

  // Wait for renderer to load
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)

  // Screenshot of initial state
  const ss1 = join(SHOT_DIR, '01-inicio.png')
  await page.screenshot({ path: ss1, fullPage: true })
  console.log('Screenshot 1 (inicio):', ss1)

  // Check page title
  const title = await page.title()
  console.log('Title:', title)

  // Get visible text to verify content loaded
  const heading = await page.evaluate(() => document.querySelector('header')?.innerText?.trim())
  console.log('Header text:', heading)

  // Click "Nuevo Contrato" nav button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const btn = btns.find(b => b.textContent.includes('Nuevo Contrato'))
    btn?.click()
  })
  await page.waitForTimeout(500)

  const ss2 = join(SHOT_DIR, '02-nuevo-contrato.png')
  await page.screenshot({ path: ss2, fullPage: true })
  console.log('Screenshot 2 (nuevo contrato):', ss2)

  // Go back to Carga Masiva
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const btn = btns.find(b => b.textContent.includes('Carga Masiva'))
    btn?.click()
  })
  await page.waitForTimeout(300)

  const ss3 = join(SHOT_DIR, '03-carga-masiva.png')
  await page.screenshot({ path: ss3, fullPage: true })
  console.log('Screenshot 3 (carga masiva):', ss3)

  console.log('\nAll screenshots saved to:', SHOT_DIR)
  await app.close()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
