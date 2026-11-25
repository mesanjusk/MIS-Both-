import { useEffect, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import api from '../apiClient';

export default function PrintSent({ showTitle = true } = {}) {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    api.get('/api/gmail/print-sent', { params: { page }, cache: false, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load sent print jobs. Refresh to retry.'); });
    return () => controller.abort();
  }, [page, refresh]);

  return <Stack spacing={1}>
    <Stack direction="row" alignItems="center" justifyContent={showTitle ? 'space-between' : 'flex-end'}>
      {showTitle && <Typography variant="h6" fontWeight={800}>Print Sent</Typography>}
      <Button size="small" onClick={() => { setPage(1); setRefresh((value) => value + 1); }}>Refresh</Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {!data && !error && <LinearProgress />}
    {data && <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Sent print attachments">
        <TableHead><TableRow><TableCell>Recipient</TableCell><TableCell>Attachment</TableCell><TableCell>Preview</TableCell></TableRow></TableHead>
        <TableBody>
          {data.result.map((row) => <TableRow key={row.id}>
            <TableCell sx={{ overflowWrap: 'anywhere' }}>{row.recipient}</TableCell>
            <TableCell sx={{ overflowWrap: 'anywhere' }}>{row.filename}</TableCell>
            <TableCell>
              {row.thumbnail ? <Box component="img" src={`data:image/jpeg;base64,${row.thumbnail}`} alt="" loading="lazy" sx={{ width: { xs: 48, sm: 72 }, height: 48, objectFit: 'contain', display: 'block' }} />
                : <InsertDriveFileOutlinedIcon aria-label="File preview unavailable" color="disabled" />}
            </TableCell>
          </TableRow>)}
          {data.result.length === 0 && <TableRow><TableCell colSpan={3}>No printer attachments have synced yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Paper>}
    {(page > 1 || data?.hasMore) && <Stack direction="row" spacing={1} justifyContent="flex-end">
      <Button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
      <Button disabled={!data?.hasMore || page >= 1000} onClick={() => setPage((value) => value + 1)}>Next</Button>
    </Stack>}
  </Stack>;
}
