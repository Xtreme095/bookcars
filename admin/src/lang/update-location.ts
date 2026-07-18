import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    UPDATE_LOCATION: 'Modification du lieu',
    LOCATION_UPDATED: 'Lieu modifié avec succès.',
  },
  en: {
    UPDATE_LOCATION: 'Location update',
    LOCATION_UPDATED: 'Location updated successfully.',
  },
  es: {
    UPDATE_LOCATION: 'Actualización del lugar',
    LOCATION_UPDATED: 'Lugar actualizado correctamente.',
  },
  hr: {
    UPDATE_LOCATION: 'Izmjena lokacije',
    LOCATION_UPDATED: 'Lokacija je uspješno ažurirana.',
  },
})

langHelper.setLanguage(strings)
export { strings }
