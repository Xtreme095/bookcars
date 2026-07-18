import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    CREATE_USER_HEADING: 'Nouvelle utilisateur',
    BIRTH_DATE: 'Date de naissance',
  },
  en: {
    CREATE_USER_HEADING: 'New user',
    BIRTH_DATE: 'Birth date',
  },
  es: {
    CREATE_USER_HEADING: 'Nuevo usuario',
    BIRTH_DATE: 'Fecha de nacimiento',
  },
  hr: {
    CREATE_USER_HEADING: 'Novi korisnik',
    BIRTH_DATE: 'Datum rođenja',
  },
})

langHelper.setLanguage(strings)
export { strings }
