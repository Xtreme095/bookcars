import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Avatar as MuiAvatar,
  Chip,
  IconButton,
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
import { strings } from '@/lang/hosts'
import * as helper from '@/utils/helper'
import * as HostService from '@/services/HostService'
import Search from '@/components/Search'

import '@/assets/css/hosts.css'

const statusColor = (status: bookcarsTypes.HostStatus): 'warning' | 'success' | 'error' | 'default' => {
  switch (status) {
    case bookcarsTypes.HostStatus.Pending:
      return 'warning'
    case bookcarsTypes.HostStatus.Approved:
      return 'success'
    case bookcarsTypes.HostStatus.Rejected:
      return 'error'
    default:
      return 'default'
  }
}

const Hosts = () => {
  const navigate = useNavigate()

  const [user, setUser] = useState<bookcarsTypes.User>()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<bookcarsTypes.HostStatus | 'all'>(bookcarsTypes.HostStatus.Pending)
  const [rows, setRows] = useState<bookcarsTypes.User[]>([])
  const [rowCount, setRowCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: env.PAGE_SIZE, page: 0 })

  const fetchData = useCallback(async (_page: number, _pageSize: number, _statusFilter: bookcarsTypes.HostStatus | 'all', _keyword: string) => {
    try {
      setLoading(true)

      const payload: bookcarsTypes.GetHostsBody = {
        statuses: _statusFilter === 'all' ? undefined : [_statusFilter],
      }

      const data = await HostService.getHosts(payload, _keyword, _page + 1, _pageSize)
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

  const columns: GridColDef<bookcarsTypes.User>[] = [
    {
      field: 'fullName',
      headerName: strings.HOST,
      flex: 1,
      renderCell: ({ row }) => (
        <div className="host-cell">
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
      valueGetter: (_value, row) => row.host?.status,
      renderCell: ({ row }) => (
        row.host ? <Chip size="small" label={helper.getHostStatusLabel(row.host.status)} color={statusColor(row.host.status)} /> : null
      ),
    },
    {
      field: 'appliedAt',
      headerName: strings.APPLIED_AT,
      width: 160,
      sortable: false,
      valueGetter: (_value, row) => (row.host?.appliedAt ? format(new Date(row.host.appliedAt), 'dd.MM.yyyy HH:mm') : ''),
    },
    {
      field: 'action',
      headerName: '',
      width: 60,
      sortable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <Tooltip title={strings.REVIEW}>
          <IconButton onClick={() => navigate(`/host?u=${row._id}`)}>
            <ViewIcon />
          </IconButton>
        </Tooltip>
      ),
    },
  ]

  const onLoad = (_user?: bookcarsTypes.User) => {
    setUser(_user)
  }

  return (
    <Layout onLoad={onLoad} strict admin>
      {user && (
        <div className="hosts">
          <div className="hosts-toolbar">
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
              <ToggleButton value={bookcarsTypes.HostStatus.Pending}>{strings.STATUS_PENDING}</ToggleButton>
              <ToggleButton value={bookcarsTypes.HostStatus.Approved}>{strings.STATUS_APPROVED}</ToggleButton>
              <ToggleButton value={bookcarsTypes.HostStatus.Rejected}>{strings.STATUS_REJECTED}</ToggleButton>
              <ToggleButton value={bookcarsTypes.HostStatus.Suspended}>{strings.STATUS_SUSPENDED}</ToggleButton>
              <ToggleButton value="all">{commonStrings.ALL}</ToggleButton>
            </ToggleButtonGroup>
          </div>

          <DataGrid
            className="hosts-grid"
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
        </div>
      )}
    </Layout>
  )
}

export default Hosts
