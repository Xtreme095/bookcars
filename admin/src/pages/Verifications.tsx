import React, { useCallback, useEffect, useState } from 'react'
import {
  Avatar as MuiAvatar,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  Link,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import { Visibility as ViewIcon, AccountCircle } from '@mui/icons-material'
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid'
import { format } from 'date-fns'
import * as bookcarsTypes from ':bookcars-types'
import * as bookcarsHelper from ':bookcars-helper'
import Layout from '@/components/Layout'
import env from '@/config/env.config'
import { strings as commonStrings } from '@/lang/common'
import { strings } from '@/lang/verifications'
import * as helper from '@/utils/helper'
import * as VerificationService from '@/services/VerificationService'
import Search from '@/components/Search'

import '@/assets/css/verifications.css'

const statusColor = (status?: bookcarsTypes.VerificationStatus): 'warning' | 'success' | 'error' | 'default' => {
  switch (status) {
    case bookcarsTypes.VerificationStatus.Pending:
      return 'warning'
    case bookcarsTypes.VerificationStatus.Approved:
      return 'success'
    case bookcarsTypes.VerificationStatus.Rejected:
      return 'error'
    default:
      return 'default'
  }
}

const statusLabel = (status?: bookcarsTypes.VerificationStatus): string => {
  switch (status) {
    case bookcarsTypes.VerificationStatus.Pending:
      return strings.STATUS_PENDING
    case bookcarsTypes.VerificationStatus.Approved:
      return strings.STATUS_APPROVED
    case bookcarsTypes.VerificationStatus.Rejected:
      return strings.STATUS_REJECTED
    default:
      return ''
  }
}

const Verifications = () => {
  const [user, setUser] = useState<bookcarsTypes.User>()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<bookcarsTypes.VerificationStatus | 'all'>(bookcarsTypes.VerificationStatus.Pending)
  const [rows, setRows] = useState<bookcarsTypes.User[]>([])
  const [rowCount, setRowCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: env.PAGE_SIZE, page: 0 })
  const [selected, setSelected] = useState<bookcarsTypes.User>()
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionReasonError, setRejectionReasonError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async (_page: number, _pageSize: number, _statusFilter: bookcarsTypes.VerificationStatus | 'all', _keyword: string) => {
    try {
      setLoading(true)

      const payload: bookcarsTypes.GetVerificationsBody = {
        statuses: _statusFilter === 'all' ? undefined : [_statusFilter],
      }

      const data = await VerificationService.getVerifications(payload, _keyword, _page + 1, _pageSize)
      const _data = data && data.length > 0 ? data[0] : { pageInfo: { totalRecords: 0 }, resultData: [] }
      if (!_data) {
        helper.error()
        return
      }
      const totalRecords = Array.isArray(_data.pageInfo) && _data.pageInfo.length > 0 ? _data.pageInfo[0].totalRecords : 0

      setRows(_data.resultData)
      setRowCount(totalRecords)
    } catch (err) {
      helper.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchData(paginationModel.page, paginationModel.pageSize, statusFilter, keyword)
    }
  }, [user, paginationModel, statusFilter, keyword, fetchData])

  const closeDialog = () => {
    setSelected(undefined)
    setRejectMode(false)
    setRejectionReason('')
    setRejectionReasonError(false)
  }

  const viewDocument = async (type: bookcarsTypes.RenterDocumentType) => {
    try {
      const blob = await VerificationService.getVerificationDocument(selected!._id as string, type)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      helper.error(err)
    }
  }

  const review = async (status: bookcarsTypes.VerificationStatus, reason: string | undefined, successMessage: string) => {
    try {
      setSubmitting(true)
      const statusCode = await VerificationService.reviewVerification(selected!._id as string, { status, rejectionReason: reason })
      if (statusCode === 200) {
        helper.info(successMessage)
        closeDialog()
        await fetchData(paginationModel.page, paginationModel.pageSize, statusFilter, keyword)
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
    await review(bookcarsTypes.VerificationStatus.Rejected, rejectionReason.trim(), strings.VERIFICATION_REJECTED)
  }

  const columns: GridColDef<bookcarsTypes.User>[] = [
    {
      field: 'fullName',
      headerName: strings.RENTER,
      flex: 1,
      renderCell: ({ row }) => (
        <div className="renter-cell">
          {row.avatar ? (
            <MuiAvatar src={bookcarsHelper.joinURL(env.CDN_USERS, row.avatar)} className="avatar-small" />
          ) : (
            <AccountCircle className="avatar-small" color="disabled" />
          )}
          <span>{row.fullName}</span>
        </div>
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      flex: 1,
    },
    {
      field: 'status',
      headerName: strings.STATUS,
      width: 140,
      sortable: false,
      valueGetter: (_value, row) => row.verification?.status,
      renderCell: ({ row }) => (
        row.verification ? <Chip size="small" label={statusLabel(row.verification.status)} color={statusColor(row.verification.status)} /> : null
      ),
    },
    {
      field: 'submittedAt',
      headerName: strings.SUBMITTED_AT,
      width: 160,
      sortable: false,
      valueGetter: (_value, row) => (row.verification?.submittedAt ? format(new Date(row.verification.submittedAt), 'dd.MM.yyyy HH:mm') : ''),
    },
    {
      field: 'action',
      headerName: '',
      width: 60,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <Tooltip title={strings.REVIEW}>
          <IconButton onClick={() => setSelected(row)}>
            <ViewIcon />
          </IconButton>
        </Tooltip>
      ),
    },
  ]

  const onLoad = (_user?: bookcarsTypes.User) => {
    setUser(_user)
  }

  const verification = selected?.verification

  return (
    <Layout onLoad={onLoad} strict admin>
      {user && (
        <div className="verifications">
          <div className="verifications-toolbar">
            <Search
              className="search"
              onSubmit={(_keyword) => {
                setKeyword(_keyword)
                setPaginationModel({ ...paginationModel, page: 0 })
              }}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={statusFilter}
              onChange={(_e, value) => {
                if (value !== null) {
                  setStatusFilter(value)
                  setPaginationModel({ ...paginationModel, page: 0 })
                }
              }}
            >
              <ToggleButton value={bookcarsTypes.VerificationStatus.Pending}>{strings.STATUS_PENDING}</ToggleButton>
              <ToggleButton value={bookcarsTypes.VerificationStatus.Approved}>{strings.STATUS_APPROVED}</ToggleButton>
              <ToggleButton value={bookcarsTypes.VerificationStatus.Rejected}>{strings.STATUS_REJECTED}</ToggleButton>
              <ToggleButton value="all">{commonStrings.ALL}</ToggleButton>
            </ToggleButtonGroup>
          </div>

          <DataGrid
            className="verifications-grid"
            rows={rows}
            columns={columns}
            getRowId={(row) => row._id as string}
            rowCount={rowCount}
            loading={loading}
            pagination
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[env.PAGE_SIZE, 50, 100]}
            disableRowSelectionOnClick
            localeText={{ noRowsLabel: strings.EMPTY_LIST }}
          />

          <Dialog disableEscapeKeyDown maxWidth="xs" fullWidth open={!!selected}>
            <DialogTitle className="dialog-header">{strings.REVIEW}</DialogTitle>
            <DialogContent className="verification-dialog">
              {selected && (
                <div className="verification-dialog">
                  <div className="renter-info">
                    <strong>{selected.fullName}</strong>
                    <Link href={`mailto:${selected.email}`}>{selected.email}</Link>
                    {selected.phone && <span>{selected.phone}</span>}
                    {selected.birthDate && <span>{`${strings.BIRTH_DATE}: ${format(new Date(selected.birthDate), 'dd.MM.yyyy')}`}</span>}
                    <span>
                      <Chip size="small" label={statusLabel(verification?.status)} color={statusColor(verification?.status)} />
                    </span>
                    {verification?.submittedAt && (
                      <span>{`${strings.SUBMITTED_AT}: ${format(new Date(verification.submittedAt), 'dd.MM.yyyy HH:mm')}`}</span>
                    )}
                    {verification?.reviewedAt && (
                      <span>{`${strings.REVIEWED_AT}: ${format(new Date(verification.reviewedAt), 'dd.MM.yyyy HH:mm')}`}</span>
                    )}
                    {verification?.status === bookcarsTypes.VerificationStatus.Rejected && verification.rejectionReason && (
                      <span>{`${strings.REJECTION_REASON}: ${verification.rejectionReason}`}</span>
                    )}
                  </div>

                  <div className="documents">
                    <h4>{strings.DOCUMENTS}</h4>
                    {selected.documents?.licenseFront && (
                      <Button variant="outlined" onClick={() => viewDocument(bookcarsTypes.RenterDocumentType.LicenseFront)}>
                        {`${strings.LICENSE_FRONT} — ${strings.VIEW_DOCUMENT}`}
                      </Button>
                    )}
                    {selected.documents?.licenseBack && (
                      <Button variant="outlined" onClick={() => viewDocument(bookcarsTypes.RenterDocumentType.LicenseBack)}>
                        {`${strings.LICENSE_BACK} — ${strings.VIEW_DOCUMENT}`}
                      </Button>
                    )}
                    {selected.documents?.idFront && (
                      <Button variant="outlined" onClick={() => viewDocument(bookcarsTypes.RenterDocumentType.IdFront)}>
                        {`${strings.ID_FRONT} — ${strings.VIEW_DOCUMENT}`}
                      </Button>
                    )}
                    {selected.documents?.idBack && (
                      <Button variant="outlined" onClick={() => viewDocument(bookcarsTypes.RenterDocumentType.IdBack)}>
                        {`${strings.ID_BACK} — ${strings.VIEW_DOCUMENT}`}
                      </Button>
                    )}
                  </div>

                  {rejectMode && (
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
                  )}
                </div>
              )}
            </DialogContent>
            <DialogActions className="dialog-actions">
              <Button onClick={closeDialog} variant="outlined" color="primary">
                {commonStrings.CLOSE}
              </Button>
              {verification?.status !== bookcarsTypes.VerificationStatus.Rejected && !rejectMode && (
                <Button onClick={() => setRejectMode(true)} variant="contained" color="error" disabled={submitting}>
                  {strings.REJECT}
                </Button>
              )}
              {rejectMode && (
                <Button onClick={handleReject} variant="contained" color="error" disabled={submitting}>
                  {strings.REJECT}
                </Button>
              )}
              {verification?.status !== bookcarsTypes.VerificationStatus.Approved && (
                <Button
                  onClick={() => review(bookcarsTypes.VerificationStatus.Approved, undefined, strings.VERIFICATION_APPROVED)}
                  variant="contained"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {strings.APPROVE}
                </Button>
              )}
            </DialogActions>
          </Dialog>
        </div>
      )}
    </Layout>
  )
}

export default Verifications
