import React, { useEffect, useState } from 'react'
import { Alert, Button, FormControl, FormHelperText } from '@mui/material'
import * as bookcarsTypes from ':bookcars-types'
import { strings } from '@/lang/verification'
import * as VerificationService from '@/services/VerificationService'
import * as helper from '@/utils/helper'
import VerificationDocument from '@/components/VerificationDocument'

interface VerificationProps {
  language?: string
}

const Verification = ({ language }: VerificationProps) => {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<bookcarsTypes.RenterVerificationInfo | null>(null)
  const [licenseFront, setLicenseFront] = useState('')
  const [licenseBack, setLicenseBack] = useState('')
  const [idFront, setIdFront] = useState('')
  const [idBack, setIdBack] = useState('')
  const [licenseFrontError, setLicenseFrontError] = useState(false)
  const [licenseBackError, setLicenseBackError] = useState(false)
  const [idFrontError, setIdFrontError] = useState(false)
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
      setLicenseFrontError(!licenseFront)
      setLicenseBackError(!licenseBack)
      setIdFrontError(!idFront)
      if (!licenseFront || !licenseBack || !idFront) {
        return
      }

      setSubmitting(true)

      const payload: bookcarsTypes.SubmitVerificationPayload = {
        licenseFront,
        licenseBack,
        idFront,
        idBack: idBack || undefined,
      }
      const _verification = await VerificationService.submitVerification(payload)
      setInfo({ documents: info?.documents || {}, verification: _verification })
      helper.info(strings.SUBMITTED)
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
    <div className="verification">
      {status === bookcarsTypes.VerificationStatus.Approved && (
        <Alert severity="success">{strings.STATUS_APPROVED}</Alert>
      )}

      {status === bookcarsTypes.VerificationStatus.Pending && (
        <Alert severity="info">
          {strings.STATUS_PENDING}
          {verification?.submittedAt && (
            <>
              {' '}
              {`${strings.SUBMITTED_AT} ${new Date(verification.submittedAt).toLocaleDateString(language)}`}
            </>
          )}
        </Alert>
      )}

      {status === bookcarsTypes.VerificationStatus.Rejected && (
        <Alert severity="warning">
          {strings.STATUS_REJECTED}
          {' '}
          {verification?.rejectionReason}
          <br />
          {strings.RESUBMIT_INFO}
        </Alert>
      )}

      {showForm && (
        <>
          <p>{strings.VERIFICATION_INFO}</p>

          <FormControl fullWidth margin="dense" error={licenseFrontError}>
            <VerificationDocument
              type={bookcarsTypes.RenterDocumentType.LicenseFront}
              label={strings.LICENSE_FRONT}
              filename={info?.documents?.licenseFront}
              onUpload={(filename) => {
                setLicenseFront(filename)
                setLicenseFrontError(false)
              }}
              onDelete={() => setLicenseFront('')}
            />
            <FormHelperText>{licenseFrontError ? strings.DOCUMENT_REQUIRED : ''}</FormHelperText>
          </FormControl>

          <FormControl fullWidth margin="dense" error={licenseBackError}>
            <VerificationDocument
              type={bookcarsTypes.RenterDocumentType.LicenseBack}
              label={strings.LICENSE_BACK}
              filename={info?.documents?.licenseBack}
              onUpload={(filename) => {
                setLicenseBack(filename)
                setLicenseBackError(false)
              }}
              onDelete={() => setLicenseBack('')}
            />
            <FormHelperText>{licenseBackError ? strings.DOCUMENT_REQUIRED : ''}</FormHelperText>
          </FormControl>

          <FormControl fullWidth margin="dense" error={idFrontError}>
            <VerificationDocument
              type={bookcarsTypes.RenterDocumentType.IdFront}
              label={strings.ID_FRONT}
              filename={info?.documents?.idFront}
              onUpload={(filename) => {
                setIdFront(filename)
                setIdFrontError(false)
              }}
              onDelete={() => setIdFront('')}
            />
            <FormHelperText>{idFrontError ? strings.DOCUMENT_REQUIRED : ''}</FormHelperText>
          </FormControl>

          <FormControl fullWidth margin="dense">
            <VerificationDocument
              type={bookcarsTypes.RenterDocumentType.IdBack}
              label={strings.ID_BACK}
              filename={info?.documents?.idBack}
              onUpload={(filename) => setIdBack(filename)}
              onDelete={() => setIdBack('')}
            />
          </FormControl>

          <FormHelperText>{strings.DOCUMENTS_INFO}</FormHelperText>

          <Button
            variant="contained"
            className="btn-primary btn-margin-bottom"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {strings.SUBMIT}
          </Button>
        </>
      )}
    </div>
  )
}

export default Verification
