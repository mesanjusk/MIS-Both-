import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Table as MuiTable,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';

function Table({ columns = [], data = [] }) {
  const headerCells = useMemo(
    () => columns.map((col) => <TableCell key={col.accessor}>{col.Header}</TableCell>),
    [columns]
  );

  const rows = useMemo(
    () =>
      data.map((row, idx) => {
        const rowKey = row?._id || row?.id || row?.Order_id || row?.Order_uuid || idx;

        return (
          <TableRow key={rowKey} hover>
            {columns.map((col) => (
              <TableCell key={col.accessor}>{row[col.accessor]}</TableCell>
            ))}
          </TableRow>
        );
      }),
    [columns, data]
  );

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxWidth: '100%' }}>
      <MuiTable size="small" stickyHeader>
        <TableHead>
          <TableRow>{headerCells}</TableRow>
        </TableHead>
        <TableBody>{rows}</TableBody>
      </MuiTable>
    </TableContainer>
  );
}

Table.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      Header: PropTypes.node.isRequired,
      accessor: PropTypes.string.isRequired,
    })
  ),
  data: PropTypes.arrayOf(PropTypes.object),
};

const areTablePropsEqual = (prevProps, nextProps) => {
  const prevColumns = prevProps.columns || [];
  const nextColumns = nextProps.columns || [];
  const prevData = prevProps.data || [];
  const nextData = nextProps.data || [];

  if (prevColumns.length !== nextColumns.length || prevData.length !== nextData.length) {
    return false;
  }

  if (prevColumns !== nextColumns) {
    for (let i = 0; i < prevColumns.length; i += 1) {
      if (
        prevColumns[i]?.accessor !== nextColumns[i]?.accessor ||
        prevColumns[i]?.Header !== nextColumns[i]?.Header
      ) {
        return false;
      }
    }
  }

  if (prevData !== nextData) {
    return false;
  }

  return true;
};

export default React.memo(Table, areTablePropsEqual);
