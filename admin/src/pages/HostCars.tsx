import React, { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import { Visibility as ViewIcon, Description as DocumentIcon } from '@mui/icons-material'
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid'
import { format } from 'date-fns'
import * as bookcarsTypes from ':bookcars-types'
import * as bookcarsHelper from ':bookcars-helper'
import Layout from '@/components/Layout'
import env from '@/config/env.config'
import { strings as commonStrings } from '@/lang/common'
import { strings } from '@/lang/hosts'
import * as helper from '@/utils/helper'
import * as HostCarService from '@/services/HostCarService'
import Search from '@/components/Search'

import '@/assets/css/host-cars.css'

const carStatusColor = (status?: bookcarsTypes.CarStatus): 'default' | 'warning' | 'success' | 'error' => {
  switch (status) {
    case bookcarsTypes.CarStatus.PendingReview:
      return 'warning'
    case bookcarsTypes.CarStatus.Active:
      return 'success'
    case bookcarsTypes.CarStatus.Rejected:
      return 'error'
    default:
      return 'default'
  }
}

const carStatusLabel = (status?: bookcarsTypes.CarStatus): string => {
  switch (status) {
    case bookcarsTypes.CarStatus.Draft:
      return strings.CAR_STATUS_DRAFT
    case bookcarsTypes.CarStatus.PendingReview:
      return strings.CAR_STATUS_PENDING_REVIEW
    case bookcarsTypes.CarStatus.Active:
      return strings.CAR_STATUS_ACTIVE
    case bookcarsTypes.CarStatus.Rejected:
      return strings.CAR_STATUS_REJECTED
    default:
      return strings.CAR_STATUS_SUSPENDED
  }
}

const HostCars = () => {
  const [user, setUser] = useState<bookcarsTypes.User>()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<bookcarsTypes.CarStatus | 'all'>(bookcarsTypes.CarStatus.PendingReview)
  const [rows, setRows] = useState<bookcarsTypes.Car[]>([])
  const [rowCount, setRowCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: env.PAGE_SIZE, page: 0 })
  const [selectedCar, setSelectedCar] = useState<bookcarsTypes.Car>()
  const [openRejectDialog, setOpenRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionReasonError, setRejectionReasonError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async (_page: number, _pageSize: number, _statusFilter: bookcarsTypes.CarStatus | 'all', _keyword: string) => {
    try {
      setLoading(true)

      const payload: bookcarsTypes.GetHostCarsBody = {
        statuses: _statusFilter === 'all' ? undefined : [_statusFilter],
      }

      const data = await HostCarService.getHostCars(payload, _keyword, _page + 1, _pageSize)
      const _data = data && data.length > 0 ? data[0] : undefined
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

  const refresh = () => {
    fetchData(paginationModel.page, paginationModel.pageSize, statusFilter, keyword)
  }

  const viewRegistration = async (car: bookcarsTypes.Car) => {
    try {
      const blob = await HostCarService.getCarRegistrationDocument(car._id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      helper.error(err)
    }
  }

  const review = async (car: bookcarsTypes.Car, status: bookcarsTypes.CarStatus, reason: string | undefined, successMessage: string) => {
    try {
      setSubmitting(true)
      const statusCode = await HostCarService.reviewHostCar(car._id, { status, rejectionReason: reason })
      if (statusCode === 200) {
        helper.info(successMessage)
        refresh()
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
    if (selectedCar) {
      await review(selectedCar, bookcarsTypes.CarStatus.Rejected, rejectionReason.trim(), strings.CAR_REJECTED)
    }
    setRejectionReason('')
  }

  const columns: GridColDef<bookcarsTypes.Car>[] = [
    {
      field: 'image',
      headerName: '',
      width: 90,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        row.image ? <img className="car-thumb" alt={row.name} src={bookcarsHelper.joinURL(env.CDN_CARS, row.image)} /> : null
      ),
    },
    {
      field: 'name',
      headerName: strings.CAR,
      flex: 1,
    },
    {
      field: 'licensePlate',
      headerName: strings.LICENSE_PLATE,
      width: 130,
    },
    {
      field: 'supplier',
      headerName: strings.HOST,
      flex: 1,
      sortable: false,
      valueGetter: (_value, row) => (row.supplier as bookcarsTypes.User)?.fullName || '',
    },
    {
      field: 'dailyPrice',
      headerName: strings.DAILY_PRICE,
      width: 110,
      valueGetter: (_value, row) => `${bookcarsHelper.formatNumber(row.dailyPrice, 'en')} €`,
    },
    {
      field: 'status',
      headerName: strings.STATUS,
      width: 170,
      sortable: false,
      renderCell: ({ row }) => <Chip size="small" label={carStatusLabel(row.status)} color={carStatusColor(row.status)} />,
    },
    {
      field: 'updatedAt',
      headerName: strings.SUBMITTED_AT,
      width: 150,
      sortable: false,
      valueGetter: (_value, row) => ((row as any).updatedAt ? format(new Date((row as any).updatedAt), 'dd.MM.yyyy HH:mm') : ''),
    },
    {
      field: 'action',
      headerName: '',
      width: 260,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <div className="actions">
          {row.registrationDocument && (
            <Tooltip title={strings.VIEW_REGISTRATION}>
              <IconButton onClick={() => viewRegistration(row)}>
                <DocumentIcon />
              </IconButton>
            </Tooltip>
          )}
          {row.image && (
            <Tooltip title={strings.CAR}>
              <IconButton onClick={() => window.open(bookcarsHelper.joinURL(env.CDN_CARS, row.image!), '_blank')}>
                <ViewIcon />
              </IconButton>
            </Tooltip>
          )}
          {row.status === bookcarsTypes.CarStatus.PendingReview && (
            <>
              <Button size="small" variant="contained" className="btn-primary" disabled={submitting} onClick={() => review(row, bookcarsTypes.CarStatus.Active, undefined, strings.CAR_APPROVED)}>
                {strings.APPROVE_CAR}
              </Button>
              <Button
                size="small"
                variant="contained"
                color="error"
                disabled={submitting}
                onClick={() => {
                  setSelectedCar(row)
                  setOpenRejectDialog(true)
                }}
              >
                {strings.REJECT_CAR}
              </Button>
            </>
          )}
          {row.status === bookcarsTypes.CarStatus.Active && (
            <Button size="small" variant="contained" color="warning" disabled={submitting} onClick={() => review(row, bookcarsTypes.CarStatus.Suspended, undefined, strings.CAR_SUSPENDED)}>
              {strings.SUSPEND_CAR}
            </Button>
          )}
          {row.status === bookcarsTypes.CarStatus.Suspended && (
            <Button size="small" variant="contained" className="btn-primary" disabled={submitting} onClick={() => review(row, bookcarsTypes.CarStatus.Active, undefined, strings.CAR_REACTIVATED)}>
              {strings.REACTIVATE_CAR}
            </Button>
          )}
        </div>
      ),
    },
  ]

  const onLoad = (_user?: bookcarsTypes.User) => {
    setUser(_user)
  }

  return (
    <Layout onLoad={onLoad} strict admin>
      {user && (
        <div className="admin-host-cars">
          <div className="host-cars-toolbar">
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
              <ToggleButton value={bookcarsTypes.CarStatus.PendingReview}>{strings.CAR_STATUS_PENDING_REVIEW}</ToggleButton>
              <ToggleButton value={bookcarsTypes.CarStatus.Active}>{strings.CAR_STATUS_ACTIVE}</ToggleButton>
              <ToggleButton value={bookcarsTypes.CarStatus.Rejected}>{strings.CAR_STATUS_REJECTED}</ToggleButton>
              <ToggleButton value={bookcarsTypes.CarStatus.Suspended}>{strings.CAR_STATUS_SUSPENDED}</ToggleButton>
              <ToggleButton value={bookcarsTypes.CarStatus.Draft}>{strings.CAR_STATUS_DRAFT}</ToggleButton>
              <ToggleButton value="all">{commonStrings.ALL}</ToggleButton>
            </ToggleButtonGroup>
          </div>

          <DataGrid
            className="host-cars-grid"
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
            localeText={{ noRowsLabel: strings.EMPTY_CAR_LIST }}
          />

          <Dialog disableEscapeKeyDown maxWidth="xs" open={openRejectDialog}>
            <DialogTitle className="dialog-header">{strings.REJECT_CAR}</DialogTitle>
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
                {strings.REJECT_CAR}
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      )}
    </Layout>
  )
}

export default HostCars
