import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    UNAUTHORIZED: 'Accès non autorisé',
  },
  en: {
    UNAUTHORIZED: 'Unauthorized access',
  },
  es: {
    UNAUTHORIZED: 'Acceso no autorizado',
  },
  hr: {
    UNAUTHORIZED: 'Neovlašteni pristup',
  },
})

langHelper.setLanguage(strings)
export { strings }
