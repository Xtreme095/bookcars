import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  FormControl,
  FormControlLabel,
  Checkbox,
  FormHelperText,
  Alert,
} from '@mui/material'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as bookcarsTypes from ':bookcars-types'
import Layout from '@/components/Layout'
import Footer from '@/components/Footer'
import HostDocument from '@/components/HostDocument'
import { strings as commonStrings } from '@/lang/common'
import { strings } from '@/lang/host'
import { strings as hostCarsStrings } from '@/lang/host-cars'
import * as HostService from '@/services/HostService'
import * as helper from '@/utils/helper'
import { schema, FormFields } from '@/models/HostApplicationForm'

import '@/assets/css/host-application.css'

const HostApplication = () => {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [hostProfile, setHostProfile] = useState<bookcarsTypes.HostProfile | null>(null)
  const [editing, setEditing] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [idDocFront, setIdDocFront] = useState<string>()
  const [idDocBack, setIdDocBack] = useState<string>()
  const [idDocFrontError, setIdDocFrontError] = useState(false)
  const [idDocBackError, setIdDocBackError] = useState(false)
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)

  const steps = [strings.STEP_PERSONAL, strings.STEP_PAYOUT, strings.STEP_DOCUMENTS]

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    trigger,
    reset,
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
  })

  const startEditing = (profile: bookcarsTypes.HostProfile | null) => {
    if (profile) {
      reset({
        address: profile.address || '',
        city: profile.city || '',
        postalCode: profile.postalCode || '',
        oib: profile.oib || '',
        iban: profile.iban || '',
        swiftBic: profile.swiftBic || '',
        bankAccountHolder: profile.bankAccountHolder || '',
      })
      setIdDocFront(profile.idDocFront)
      setIdDocBack(profile.idDocBack)
    }
    setActiveStep(0)
    setEditing(true)
  }

  const onLoad = async () => {
    try {
      const profile = await HostService.getHostApplication()
      setHostProfile(profile)
      if (!profile) {
        setEditing(true)
      }
      setVisible(true)
    } catch (err) {
      helper.error(err)
    }
  }

  const handleNext = async () => {
    let valid = false
    if (activeStep === 0) {
      valid = await trigger(['address', 'city', 'postalCode', 'oib'])
    } else if (activeStep === 1) {
      valid = await trigger(['iban', 'swiftBic', 'bankAccountHolder'])
    }
    if (valid) {
      setActiveStep((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    setActiveStep((prev) => prev - 1)
  }

  const onSubmit = async (data: FormFields) => {
    try {
      let invalid = false
      if (!idDocFront) {
        setIdDocFrontError(true)
        invalid = true
      }
      if (!idDocBack) {
        setIdDocBackError(true)
        invalid = true
      }
      if (!consent) {
        setConsentError(true)
        invalid = true
      }
      if (invalid) {
        return
      }

      const payload: bookcarsTypes.ApplyToHostPayload = {
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        countryCode: 'HR',
        oib: data.oib,
        iban: data.iban.replace(/\s/g, '').toUpperCase(),
        swiftBic: data.swiftBic || undefined,
        bankAccountHolder: data.bankAccountHolder,
        idDocFront: idDocFront!,
        idDocBack: idDocBack!,
      }

      const status = await HostService.apply(payload)

      if (status === 200) {
        const profile = await HostService.getHostApplication()
        setHostProfile(profile)
        setEditing(false)
        helper.info(strings.APPLICATION_SENT)
      } else {
        helper.error()
      }
    } catch (err) {
      helper.error(err)
    }
  }

  const statusView = () => {
    if (!hostProfile) {
      return null
    }

    return (
      <Paper className="host-application-form" elevation={10}>
        <h1 className="host-application-form-title">{strings.STATUS_TITLE}</h1>

        {hostProfile.status === bookcarsTypes.HostStatus.Pending && (
          <>
            <Alert severity="info">{strings.STATUS_PENDING}</Alert>
            <p>{strings.STATUS_PENDING_INFO}</p>
            <Button variant="contained" className="btn-primary" onClick={() => startEditing(hostProfile)}>
              {strings.EDIT_APPLICATION}
            </Button>
          </>
        )}

        {hostProfile.status === bookcarsTypes.HostStatus.Approved && (
          <>
            <Alert severity="success">{strings.STATUS_APPROVED}</Alert>
            <Button variant="contained" className="btn-primary" onClick={() => navigate('/host/cars')}>
              {hostCarsStrings.MY_VEHICLES}
            </Button>
          </>
        )}

        {hostProfile.status === bookcarsTypes.HostStatus.Rejected && (
          <>
            <Alert severity="error">{strings.STATUS_REJECTED}</Alert>
            {hostProfile.rejectionReason && (
              <p>
                {`${strings.STATUS_REJECTION_REASON}: ${hostProfile.rejectionReason}`}
              </p>
            )}
            <p>{strings.STATUS_REJECTED_INFO}</p>
            <Button variant="contained" className="btn-primary" onClick={() => startEditing(hostProfile)}>
              {strings.EDIT_APPLICATION}
            </Button>
          </>
        )}

        {hostProfile.status === bookcarsTypes.HostStatus.Suspended && (
          <>
            <Alert severity="warning">{strings.STATUS_SUSPENDED}</Alert>
            <p>{strings.STATUS_SUSPENDED_INFO}</p>
          </>
        )}
      </Paper>
    )
  }

  const wizardView = () => (
    <Paper className="host-application-form" elevation={10}>
      <h1 className="host-application-form-title">{strings.APPLICATION_TITLE}</h1>

      <Stepper activeStep={activeStep} className="host-application-stepper">
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <form onSubmit={handleSubmit(onSubmit)}>
        {activeStep === 0 && (
          <div className="step-content">
            <p className="documents-info">{strings.PUBLIC_PROFILE_INFO}</p>
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.ADDRESS}
                variant="standard"
                {...register('address')}
                error={!!errors.address}
                helperText={errors.address?.message}
                required
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.CITY}
                variant="standard"
                {...register('city')}
                error={!!errors.city}
                helperText={errors.city?.message}
                required
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.POSTAL_CODE}
                variant="standard"
                {...register('postalCode')}
                error={!!errors.postalCode}
                helperText={errors.postalCode?.message}
                required
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.OIB}
                variant="standard"
                {...register('oib')}
                error={!!errors.oib}
                helperText={errors.oib?.message}
                required
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
          </div>
        )}

        {activeStep === 1 && (
          <div className="step-content">
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.IBAN}
                variant="standard"
                placeholder="HR.................."
                {...register('iban')}
                error={!!errors.iban}
                helperText={errors.iban?.message}
                required
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.SWIFT_BIC}
                variant="standard"
                {...register('swiftBic')}
                error={!!errors.swiftBic}
                helperText={errors.swiftBic?.message}
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
            <FormControl fullWidth margin="dense">
              <TextField
                label={strings.BANK_ACCOUNT_HOLDER}
                variant="standard"
                {...register('bankAccountHolder')}
                error={!!errors.bankAccountHolder}
                helperText={errors.bankAccountHolder?.message}
                required
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
          </div>
        )}

        {activeStep === 2 && (
          <div className="step-content">
            <p className="documents-info">{strings.DOCUMENTS_INFO}</p>

            <FormControl fullWidth margin="dense" error={idDocFrontError}>
              <HostDocument
                type={bookcarsTypes.HostDocumentType.IdFront}
                label={strings.ID_DOC_FRONT}
                filename={idDocFront}
                onUpload={(filename) => {
                  setIdDocFront(filename)
                  setIdDocFrontError(false)
                }}
                onDelete={() => setIdDocFront(undefined)}
              />
              {idDocFrontError && <FormHelperText>{strings.DOCUMENT_REQUIRED}</FormHelperText>}
            </FormControl>

            <FormControl fullWidth margin="dense" error={idDocBackError}>
              <HostDocument
                type={bookcarsTypes.HostDocumentType.IdBack}
                label={strings.ID_DOC_BACK}
                filename={idDocBack}
                onUpload={(filename) => {
                  setIdDocBack(filename)
                  setIdDocBackError(false)
                }}
                onDelete={() => setIdDocBack(undefined)}
              />
              {idDocBackError && <FormHelperText>{strings.DOCUMENT_REQUIRED}</FormHelperText>}
            </FormControl>

            <FormControl fullWidth margin="dense" error={consentError}>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={consent}
                    onChange={(e) => {
                      setConsent(e.target.checked)
                      if (e.target.checked) {
                        setConsentError(false)
                      }
                    }}
                    color="primary"
                  />
                )}
                label={strings.CONSENT}
              />
              {consentError && <FormHelperText>{strings.CONSENT_ERROR}</FormHelperText>}
            </FormControl>
          </div>
        )}

        <div className="buttons">
          {activeStep > 0 && (
            <Button variant="outlined" color="primary" className="btn-margin-bottom" onClick={handleBack}>
              {strings.BACK}
            </Button>
          )}
          {activeStep < steps.length - 1 && (
            <Button variant="contained" className="btn-primary btn-margin-bottom" onClick={handleNext}>
              {strings.NEXT}
            </Button>
          )}
          {activeStep === steps.length - 1 && (
            <Button type="submit" variant="contained" className="btn-primary btn-margin-bottom" disabled={isSubmitting}>
              {strings.SUBMIT}
            </Button>
          )}
          {hostProfile && (
            <Button
              variant="outlined"
              color="primary"
              className="btn-margin-bottom"
              onClick={() => {
                setEditing(false)
                setActiveStep(0)
              }}
            >
              {commonStrings.CANCEL}
            </Button>
          )}
        </div>
      </form>
    </Paper>
  )

  return (
    <Layout onLoad={onLoad} strict>
      {visible && (
        <>
          <div className="host-application">
            {editing ? wizardView() : statusView()}
          </div>
          <Footer />
        </>
      )}
    </Layout>
  )
}

export default HostApplication
