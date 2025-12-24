import { I18n } from 'i18n-js'
import { en } from './en'
import { fr } from './fr'
import { es } from './es'
import { hr } from './hr'

const i18n = new I18n({ en, fr, es, hr })
i18n.enableFallback = true

export default i18n
