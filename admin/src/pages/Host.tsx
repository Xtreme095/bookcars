import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Paper,
  Button,
  Chip,
  TextField,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
} from '@mui/material'
import { format } from 'date-fns'
import * as bookcarsTypes from ':bookcars-types'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import NoMatch from './NoMatch'
import { strings as commonStrings } from '@/lang/common'
import { strings } from '@/lang/hosts'
import * as helper from '@/utils/helper'
import * as HostService from '@/services/HostService'

import '@/assets/css/host.css'

const Host = () => {
  const navigate = useNavigate()

  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [noMatch, setNoMatch] = useState(false)
  const [host, setHost] = useState<bookcarsTypes.User>()
  const [commissionPct, setCommissionPct] = useState<string>('')
  const [guaranteedMinimum, setGuaranteedMinimum] = useState<string>('')
  const [contractNumber, setContractNumber] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [openRejectDialog, setOpenRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionReasonError, setRejectionReasonError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const profile = host?.host

  const fetchHost = async (id: string) => {
    try {
      setLoading(true)
      const _host = await HostService.getHost(id)

      if (_host && _host.host) {
        setHost(_host)
        setCommissionPct(_host.host.commissionPct !== undefined && _host.host.commissionPct !== null ? String(_host.host.commissionPct) : '')
        setGuaranteedMinimum(_host.host.guaranteedMonthlyMinimum !== undefined && _host.host.guaranteedMonthlyMinimum !== null ? String(_host.host.guaranteedMonthlyMinimum) : '')
        setContractNumber(_host.host.contractNumber || '')
        setNotes(_host.host.notes || '')
        setVisible(true)
      } else {
        setNoMatch(true)
      }
    } catch (err) {
      helper.error(err)
    } finally {
      setLoading(false)
    }
  }

  const onLoad = async () => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('u')
    if (id && id !== '') {
      await fetchHost(id)
    } else {
      setLoading(false)
      setNoMatch(true)
    }
  }

  const viewDocument = async (type: bookcarsTypes.HostDocumentType) => {
    try {
      const blob = await HostService.getHostDocument(host!._id as string, type)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      helper.error(err)
    }
  }

  const buildPayload = (status: bookcarsTypes.HostStatus, reason?: string): bookcarsTypes.ReviewHostPayload => ({
    status,
    rejectionReason: reason,
    commissionPct: commissionPct !== '' ? Number(commissionPct) : undefined,
    guaranteedMonthlyMinimum: guaranteedMinimum !== '' ? Number(guaranteedMinimum) : undefined,
    contractNumber: contractNumber || undefined,
    notes: notes || undefined,
  })

  const review = async (status: bookcarsTypes.HostStatus, reason: string | undefined, successMessage: string) => {
    try {
      setSubmitting(true)
      const statusCode = await HostService.reviewHost(host!._id as string, buildPayload(status, reason))
      if (statusCode === 200) {
        helper.info(successMessage)
        await fetchHost(host!._id as string)
      } else {
        helper.error()
      }
    } catch (err) {
      helper.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setRejectionReasonError(true)
      return
    }
    setOpenRejectDialog(false)
    await review(bookcarsTypes.HostStatus.Rejected, rejectionReason.trim(), strings.HOST_REJECTED)
    setRejectionReason('')
  }

  return (
    <Layout onLoad={onLoad} strict admin>
      {visible && host && profile && (
        <div className="host-page">
          <Paper className="host-form" elevation={10}>
            <div className="host-header">
              <Avatar
                record={host}
                type={bookcarsTypes.RecordType.User}
                mode="update"
                size="large"
                readonly
                hideDelete
                color="disabled"
                className="avatar-ctn"
              />
              <div className="host-header-info">
                <h1>{host.fullName}</h1>
                <Link href={`mailto:${host.email}`}>{host.email}</Link>
                {host.phone && <span>{host.phone}</span>}
                <Chip size="small" className="status-chip" label={helper.getHostStatusLabel(profile.status)} />
                {profile.appliedAt && (
                  <span className="date-info">{`${strings.APPLIED_AT}: ${format(new Date(profile.appliedAt), 'dd.MM.yyyy HH:mm')}`}</span>
                )}
                {profile.reviewedAt && (
                  <span className="date-info">{`${strings.REVIEWED_AT}: ${format(new Date(profile.reviewedAt), 'dd.MM.yyyy HH:mm')}`}</span>
                )}
              </div>
            </div>

            <section>
              <h2>{strings.PERSONAL_DATA}</h2>
              <div className="fields">
                <div className="field">
                  <span className="label">{strings.ADDRESS}</span>
                  <span>{profile.address}</span>
                </div>
                <div className="field">
                  <span className="label">{strings.CITY}</span>
                  <span>{`${profile.postalCode} ${profile.city}, ${profile.countryCode}`}</span>
                </div>
                <div className="field">
                  <span className="label">{strings.OIB}</span>
                  <span>{profile.oib}</span>
                </div>
              </div>
            </section>

            <section>
              <h2>{strings.PAYOUT_DATA}</h2>
              <div className="fields">
                <div className="field">
                  <span className="label">{strings.IBAN}</span>
                  <span>{profile.iban}</span>
                </div>
                {profile.swiftBic && (
                  <div className="field">
                    <span className="label">{strings.SWIFT_BIC}</span>
                    <span>{profile.swiftBic}</span>
                  </div>
                )}
                <div className="field">
                  <span className="label">{strings.BANK_ACCOUNT_HOLDER}</span>
                  <span>{profile.bankAccountHolder}</span>
                </div>
              </div>
            </section>

            <section>
              <h2>{strings.DOCUMENTS}</h2>
              <div className="documents">
                <Button variant="outlined" onClick={() => viewDocument(bookcarsTypes.HostDocumentType.IdFront)}>
                  {`${strings.ID_DOC_FRONT} — ${strings.VIEW_DOCUMENT}`}
                </Button>
                <Button variant="outlined" onClick={() => viewDocument(bookcarsTypes.HostDocumentType.IdBack)}>
                  {`${strings.ID_DOC_BACK} — ${strings.VIEW_DOCUMENT}`}
                </Button>
              </div>
            </section>

            <section>
              <h2>{strings.CONTRACT}</h2>
              <FormControl fullWidth margin="dense">
                <TextField
                  label={strings.COMMISSION_PCT}
                  type="number"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  helperText={strings.COMMISSION_INFO}
                  inputProps={{ min: 0, max: 100 }}
                  variant="standard"
                />
              </FormControl>
              <FormControl fullWidth margin="dense">
                <TextField
                  label={strings.GUARANTEED_MINIMUM}
                  type="number"
                  value={guaranteedMinimum}
                  onChange={(e) => setGuaranteedMinimum(e.target.value)}
                  inputProps={{ min: 0 }}
                  variant="standard"
                />
              </FormControl>
              <FormControl fullWidth margin="dense">
                <TextField
                  label={strings.CONTRACT_NUMBER}
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  variant="standard"
                />
              </FormControl>
              <FormControl fullWidth margin="dense">
                <TextField
                  label={strings.NOTES}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  minRows={2}
                  variant="standard"
                />
              </FormControl>
            </section>

            {profile.status === bookcarsTypes.HostStatus.Rejected && profile.rejectionReason && (
              <section>
                <h2>{strings.REJECTION_REASON}</h2>
                <p>{profile.rejectionReason}</p>
              </section>
            )}

            <div className="buttons">
              {profile.status === bookcarsTypes.HostStatus.Pending && (
                <>
                  <Button variant="contained" className="btn-primary" disabled={submitting} onClick={() => review(bookcarsTypes.HostStatus.Approved, undefined, strings.HOST_APPROVED)}>
                    {strings.APPROVE}
                  </Button>
                  <Button variant="contained" color="error" disabled={submitting} onClick={() => setOpenRejectDialog(true)}>
                    {strings.REJECT}
                  </Button>
                </>
              )}
              {profile.status === bookcarsTypes.HostStatus.Approved && (
                <>
                  <Button variant="contained" className="btn-primary" disabled={submitting} onClick={() => review(bookcarsTypes.HostStatus.Approved, undefined, strings.SETTINGS_SAVED)}>
                    {strings.SAVE_REVIEW_SETTINGS}
                  </Button>
                  <Button variant="contained" color="warning" disabled={submitting} onClick={() => review(bookcarsTypes.HostStatus.Suspended, undefined, strings.HOST_SUSPENDED)}>
                    {strings.SUSPEND}
                  </Button>
                </>
              )}
              {profile.status === bookcarsTypes.HostStatus.Suspended && (
                <Button variant="contained" className="btn-primary" disabled={submitting} onClick={() => review(bookcarsTypes.HostStatus.Approved, undefined, strings.HOST_REACTIVATED)}>
                  {strings.REACTIVATE}
                </Button>
              )}
              {profile.status === bookcarsTypes.HostStatus.Rejected && (
                <Button variant="contained" className="btn-primary" disabled={submitting} onClick={() => review(bookcarsTypes.HostStatus.Approved, undefined, strings.HOST_APPROVED)}>
                  {strings.APPROVE}
                </Button>
              )}
              <Button variant="outlined" color="primary" onClick={() => navigate('/hosts')}>
                {strings.BACK}
              </Button>
            </div>
          </Paper>

          <Dialog disableEscapeKeyDown maxWidth="xs" open={openRejectDialog}>
            <DialogTitle className="dialog-header">{strings.REJECT}</DialogTitle>
            <DialogContent>
              <FormControl fullWidth margin="dense">
                <TextField
                  label={strings.REJECTION_REASON}
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value)
                    if (e.target.value.trim()) {
                      setRejectionReasonError(false)
                    }
                  }}
                  error={rejectionReasonError}
                  helperText={rejectionReasonError ? strings.REJECTION_REASON_REQUIRED : ''}
                  multiline
                  minRows={3}
                  variant="standard"
                  required
                />
              </FormControl>
            </DialogContent>
            <DialogActions className="dialog-actions">
              <Button onClick={() => setOpenRejectDialog(false)} variant="outlined" color="primary">
                {commonStrings.CANCEL}
              </Button>
              <Button onClick={handleReject} variant="contained" color="error">
                {strings.REJECT}
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      )}
      {!loading && noMatch && <NoMatch hideHeader />}
    </Layout>
  )
}

export default Host
