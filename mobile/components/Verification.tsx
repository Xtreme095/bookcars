import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as bookcarsTypes from ':bookcars-types'
import i18n from '@/lang/i18n'
import * as VerificationService from '@/services/VerificationService'
import * as helper from '@/utils/helper'
import Button from '@/components/Button'
import VerificationDocument from '@/components/VerificationDocument'

interface VerificationProps {
  style?: object
}

/**
 * Renter identity verification section (P2P): document upload, submission and
 * status. Shown in Settings.
 */
const Verification = ({ style }: VerificationProps) => {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<bookcarsTypes.RenterVerificationInfo | null>(null)
  const [licenseFront, setLicenseFront] = useState('')
  const [licenseBack, setLicenseBack] = useState('')
  const [idFront, setIdFront] = useState('')
  const [idBack, setIdBack] = useState('')
  const [documentsRequired, setDocumentsRequired] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const verification = info?.verification
  const status = verification?.status
  // the upload form is shown before the first submission and after a rejection
  const showForm = !status || status === bookcarsTypes.VerificationStatus.Rejected

  useEffect(() => {
    const fetchVerification = async () => {
      try {
        const _info = await VerificationService.getVerification()
        setInfo(_info)
        // re-submission keeps the previously uploaded documents by default
        setLicenseFront(_info?.documents?.licenseFront || '')
        setLicenseBack(_info?.documents?.licenseBack || '')
        setIdFront(_info?.documents?.idFront || '')
        setIdBack(_info?.documents?.idBack || '')
      } catch (err) {
        helper.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchVerification()
  }, [])

  const handleSubmit = async () => {
    try {
      if (!licenseFront || !licenseBack || !idFront) {
        setDocumentsRequired(true)
        return
      }
      setDocumentsRequired(false)
      setSubmitting(true)

      const payload: bookcarsTypes.SubmitVerificationPayload = {
        licenseFront,
        licenseBack,
        idFront,
        idBack: idBack || undefined,
      }
      const _verification = await VerificationService.submitVerification(payload)
      setInfo({ documents: info?.documents || {}, verification: _verification })
      helper.toast(i18n.t('VERIFICATION_SUBMITTED'))
    } catch (err) {
      helper.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return null
  }

  return (
    <View style={{ ...styles.container, ...style }}>
      <Text style={styles.title}>{i18n.t('VERIFICATION_TITLE')}</Text>

      {status === bookcarsTypes.VerificationStatus.Approved && (
        <Text style={styles.approved}>{i18n.t('VERIFICATION_STATUS_APPROVED')}</Text>
      )}

      {status === bookcarsTypes.VerificationStatus.Pending && (
        <Text style={styles.pending}>{i18n.t('VERIFICATION_STATUS_PENDING')}</Text>
      )}

      {status === bookcarsTypes.VerificationStatus.Rejected && (
        <Text style={styles.rejected}>
          {`${i18n.t('VERIFICATION_STATUS_REJECTED')} ${verification?.rejectionReason || ''}`}
          {'\n'}
          {i18n.t('VERIFICATION_RESUBMIT_INFO')}
        </Text>
      )}

      {showForm && (
        <>
          <Text style={styles.info}>{i18n.t('VERIFICATION_INFO')}</Text>

          <VerificationDocument
            type={bookcarsTypes.RenterDocumentType.LicenseFront}
            label={i18n.t('LICENSE_FRONT')}
            filename={info?.documents?.licenseFront}
            style={styles.document}
            onUpload={(filename) => setLicenseFront(filename)}
            onDelete={() => setLicenseFront('')}
          />
          <VerificationDocument
            type={bookcarsTypes.RenterDocumentType.LicenseBack}
            label={i18n.t('LICENSE_BACK')}
            filename={info?.documents?.licenseBack}
            style={styles.document}
            onUpload={(filename) => setLicenseBack(filename)}
            onDelete={() => setLicenseBack('')}
          />
          <VerificationDocument
            type={bookcarsTypes.RenterDocumentType.IdFront}
            label={i18n.t('ID_FRONT')}
            filename={info?.documents?.idFront}
            style={styles.document}
            onUpload={(filename) => setIdFront(filename)}
            onDelete={() => setIdFront('')}
          />
          <VerificationDocument
            type={bookcarsTypes.RenterDocumentType.IdBack}
            label={i18n.t('ID_BACK')}
            filename={info?.documents?.idBack}
            style={styles.document}
            onUpload={(filename) => setIdBack(filename)}
            onDelete={() => setIdBack('')}
          />

          {documentsRequired && <Text style={styles.error}>{i18n.t('VERIFICATION_DOCUMENTS_REQUIRED')}</Text>}

          <Button
            style={styles.button}
            label={i18n.t('SUBMIT_VERIFICATION')}
            onPress={submitting ? undefined : handleSubmit}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
    marginRight: 10,
    marginLeft: 10,
  },
  info: {
    color: '#676767',
    fontSize: 12,
    marginBottom: 15,
    marginRight: 10,
    marginLeft: 10,
  },
  approved: {
    color: '#1f9201',
    fontSize: 13,
    margin: 10,
  },
  pending: {
    color: '#ef6c00',
    fontSize: 13,
    margin: 10,
  },
  rejected: {
    color: '#d32f2f',
    fontSize: 13,
    margin: 10,
  },
  error: {
    color: '#d32f2f',
    fontSize: 12,
    margin: 10,
  },
  document: {
    marginBottom: 20,
  },
  button: {
    marginTop: 5,
    marginRight: 10,
    marginLeft: 10,
  },
})

export default Verification
