import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    NEW_USER: 'Nouvel utilisateur',
  },
  en: {
    NEW_USER: 'New user',
  },
  es: {
    NEW_USER: 'Nuevo usuario',
  },
  hr: {
    NEW_USER: 'Novi korisnik',
  },
})

langHelper.setLanguage(strings)
export { strings }
