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
  MenuItem,
  TextField,
  Tooltip,
} from '@mui/material'
import {
  Download as StatementIcon,
  Paid as MarkPaidIcon,
  PlayArrow as GenerateIcon,
  FileDownload as SepaIcon,
} from '@mui/icons-material'
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid'
import { format } from 'date-fns'
import * as bookcarsTypes from ':bookcars-types'
import * as bookcarsHelper from ':bookcars-helper'
import Layout from '@/components/Layout'
import env from '@/config/env.config'
import { strings as commonStrings } from '@/lang/common'
import { strings } from '@/lang/payouts'
import * as helper from '@/utils/helper'
import * as PayoutService from '@/services/PayoutService'

import '@/assets/css/payouts.css'

const now = new Date()

const Payouts = () => {
  const [user, setUser] = useState<bookcarsTypes.User>()
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth())
  const [rows, setRows] = useState<bookcarsTypes.Payout[]>([])
  const [rowCount, setRowCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: env.PAGE_SIZE, page: 0 })
  const [selectedPayout, setSelectedPayout] = useState<bookcarsTypes.Payout>()
  const [openPaidDialog, setOpenPaidDialog] = useState(false)
  const [paymentReference, setPaymentReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const language = user?.language || 'en'

  const fetchData = useCallback(async (_page: number, _pageSize: number, _year: number, _month: number) => {
    try {
      setLoading(true)
      const data = await PayoutService.getPayouts({ year: _year, month: _month }, _page + 1, _pageSize)
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
      fetchData(paginationModel.page, paginationModel.pageSize, year, month)
    }
  }, [user, paginationModel, year, month, fetchData])

  const refresh = () => {
    fetchData(paginationModel.page, paginationModel.pageSize, year, month)
  }

  const generate = async () => {
    try {
      setSubmitting(true)
      const result = await PayoutService.generatePayouts(year, month)
      helper.info(`${result.generated} ${strings.GENERATED}${result.skippedPaid > 0 ? ` ${result.skippedPaid} ${strings.SKIPPED_PAID}` : ''}`)
      refresh()
    } catch (err) {
      helper.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportSepa = async () => {
    try {
      const blob = await PayoutService.exportSepaCsv(year, month)
      downloadBlob(blob, `sepa-payouts-${year}-${String(month).padStart(2, '0')}.csv`)
    } catch (err) {
      helper.error(err)
    }
  }

  const downloadStatement = async (payout: bookcarsTypes.Payout) => {
    try {
      const blob = await PayoutService.getPayoutStatement(payout._id)
      downloadBlob(blob, `statement-${(payout.host as bookcarsTypes.User).fullName}-${payout.year}-${String(payout.month).padStart(2, '0')}.pdf`)
    } catch (err) {
      helper.error(err)
    }
  }

  const markPaid = async () => {
    try {
      setOpenPaidDialog(false)
      if (!selectedPayout) {
        return
      }
      const status = await PayoutService.markPayoutPaid(selectedPayout._id, { reference: paymentReference.trim() || undefined })
      if (status === 200) {
        helper.info(strings.PAID)
        refresh()
      } else {
        helper.error()
      }
      setPaymentReference('')
    } catch (err) {
      helper.error(err)
    }
  }

  const eur = (value: number) => `${bookcarsHelper.formatNumber(value, language)} €`

  const columns: GridColDef<bookcarsTypes.Payout>[] = [
    {
      field: 'host',
      headerName: strings.HOST,
      flex: 1,
      sortable: false,
      valueGetter: (_value, row) => (row.host as bookcarsTypes.User)?.fullName || '',
    },
    {
      field: 'bookingsCount',
      headerName: strings.BOOKINGS,
      width: 100,
    },
    {
      field: 'grossTotal',
      headerName: strings.GROSS,
      width: 110,
      valueGetter: (_value, row) => eur(row.grossTotal),
    },
    {
      field: 'commissionTotal',
      headerName: strings.COMMISSION,
      width: 110,
      valueGetter: (_value, row) => eur(row.commissionTotal),
    },
    {
      field: 'shareTotal',
      headerName: strings.SHARE,
      width: 110,
      valueGetter: (_value, row) => eur(row.shareTotal),
    },
    {
      field: 'guaranteedMinimum',
      headerName: strings.MINIMUM,
      width: 130,
      valueGetter: (_value, row) => (row.guaranteedMinimum > 0 ? eur(row.guaranteedMinimum) : '—'),
    },
    {
      field: 'amount',
      headerName: strings.AMOUNT,
      width: 120,
      renderCell: ({ row }) => <strong>{eur(row.amount)}</strong>,
    },
    {
      field: 'status',
      headerName: strings.STATUS,
      width: 130,
      sortable: false,
      renderCell: ({ row }) => (
        <Chip
          size="small"
          label={row.status === bookcarsTypes.PayoutStatus.Paid ? strings.STATUS_PAID : strings.STATUS_PENDING}
          color={row.status === bookcarsTypes.PayoutStatus.Paid ? 'success' : 'warning'}
        />
      ),
    },
    {
      field: 'paidAt',
      headerName: strings.PAID_AT,
      width: 140,
      sortable: false,
      valueGetter: (_value, row) => (row.paidAt ? format(new Date(row.paidAt), 'dd.MM.yyyy HH:mm') : ''),
    },
    {
      field: 'action',
      headerName: '',
      width: 120,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <div className="actions">
          {row.statementFile && (
            <Tooltip title={strings.STATEMENT}>
              <IconButton onClick={() => downloadStatement(row)}>
                <StatementIcon />
              </IconButton>
            </Tooltip>
          )}
          {row.status === bookcarsTypes.PayoutStatus.Pending && (
            <Tooltip title={strings.MARK_PAID}>
              <IconButton
                onClick={() => {
                  setSelectedPayout(row)
                  setPaymentReference(row.reference || '')
                  setOpenPaidDialog(true)
                }}
              >
                <MarkPaidIcon />
              </IconButton>
            </Tooltip>
          )}
        </div>
      ),
    },
  ]

  const onLoad = (_user?: bookcarsTypes.User) => {
    setUser(_user)
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i)

  return (
    <Layout onLoad={onLoad} strict admin>
      {user && (
        <div className="payouts">
          <div className="payouts-toolbar">
            <FormControl margin="dense" className="period-field">
              <TextField
                select
                label={strings.PERIOD}
                variant="standard"
                value={month}
                onChange={(e) => {
                  setMonth(Number(e.target.value))
                  setPaginationModel({ ...paginationModel, page: 0 })
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <MenuItem key={m} value={m}>{String(m).padStart(2, '0')}</MenuItem>
                ))}
              </TextField>
            </FormControl>
            <FormControl margin="dense" className="period-field">
              <TextField
                select
                variant="standard"
                label=" "
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value))
                  setPaginationModel({ ...paginationModel, page: 0 })
                }}
              >
                {years.map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))}
              </TextField>
            </FormControl>
            <Button variant="contained" className="btn-primary" startIcon={<GenerateIcon />} disabled={submitting} onClick={generate}>
              {strings.GENERATE}
            </Button>
            <Button variant="outlined" startIcon={<SepaIcon />} onClick={exportSepa}>
              {strings.EXPORT_SEPA}
            </Button>
          </div>

          <DataGrid
            className="payouts-grid"
            rows={rows}
            columns={columns}
            getRowId={(row) => row._id}
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

          <Dialog disableEscapeKeyDown maxWidth="xs" open={openPaidDialog}>
            <DialogTitle className="dialog-header">{strings.MARK_PAID}</DialogTitle>
            <DialogContent>
              <FormControl fullWidth margin="dense">
                <TextField
                  label={strings.PAYMENT_REFERENCE}
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  variant="standard"
                />
              </FormControl>
            </DialogContent>
            <DialogActions className="dialog-actions">
              <Button onClick={() => setOpenPaidDialog(false)} variant="outlined" color="primary">
                {commonStrings.CANCEL}
              </Button>
              <Button onClick={markPaid} variant="contained" className="btn-primary">
                {strings.MARK_PAID}
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      )}
    </Layout>
  )
}

export default Payouts
