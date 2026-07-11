import fs from 'node:fs'
import path from 'node:path'

fs.rmSync(path.join(process.cwd(), 'dist', 'main'), { recursive: true, force: true })
