/**
 * dsh-seedance-studio — 语言包加载（动态 i18n）
 *
 * 语言包目录：platforms/web/public/locales/<lang>.json（键集一致）。
 * 新增语言 = 往目录放一个 <lang>.json 文件；服务端/面板自动读取，界面语言切换列表自动增加。
 * @module dsh-seedance-studio/server/locales
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 语言包目录（随 Web/面板静态资源一起分发）。 */
export const LOCALES_DIR = path.resolve(HERE, '..', 'platforms', 'web', 'public', 'locales')

/** 读取全部语言包：{ locales: [codes], dictionaries: { code: {key: text} } }。 */
export function readLocales(dir = LOCALES_DIR) {
  let files = []
  try { files = fs.readdirSync(dir).filter((name) => /\.json$/i.test(name)) } catch (error) { files = [] }
  const locales = []
  const dictionaries = {}
  for (const name of files) {
    if (name.toLowerCase() === 'languages.json') continue
    const code = name.replace(/\.json$/i, '')
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue
      locales.push(code)
      dictionaries[code] = data
    } catch (error) { /* 跳过损坏语言文件 */ }
  }
  locales.sort((a, b) => {
    const order = ['zh', 'en', 'ru']
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b)
  })
  return { locales, dictionaries }
}
