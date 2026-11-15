import {useCallback,useEffect,useState} from 'react';
import {
  Alert,Box,Button,Chip,MenuItem,Paper,Stack,TextField,Typography
} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import apiClient from '../apiClient';
import {ROUTES} from '../constants/routes';

const money=paise=>'₹'+(Number(paise||0)/100).toLocaleString('en-IN');
export default function WebsiteOrders(){
  const navigate=useNavigate();
  const [rows,setRows]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(1);
  const [status,setStatus]=useState('new'),[busy,setBusy]=useState(false);
  const [configured,setConfigured]=useState(false);
  const [error,setError]=useState(''),[info,setInfo]=useState('');
  const [selected,setSelected]=useState(null),[orderNumber,setOrderNumber]=useState('');
  const [note,setNote]=useState('');
  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const {data}=await apiClient.get('/api/web-orders',{params:{page,limit:30,status}});
      setRows(Array.isArray(data.result)?data.result:[]);
      setTotal(data.total||0);
      setConfigured(Boolean(data.integrationConfigured));
    }catch(e){setError(e.response?.data?.message||'Website orders inbox is not yet available on the MIS backend.');}
    finally{setBusy(false);}
  },[page,status]);
  useEffect(()=>{load();},[load]);
  const choose=row=>{
    setSelected(row);setOrderNumber(row.linkedOrderNumber?String(row.linkedOrderNumber):'');
    setNote(row.internalNote||'');
  };
  async function action(kind,extras={}){
    if(!selected||busy)return;
    setBusy(true);setError('');setInfo('');
    try{
      const {data}=await apiClient.patch('/api/web-orders/'+selected._id,{action:kind,...extras});
      choose(data.result);
      setRows(prev=>prev.map(row=>row._id===data.result._id?data.result:row));
      setInfo(kind==='link'?'Linked to existing MIS order. No new ledger entry was posted.':'Review status updated.');
      await load();
    }catch(e){setError(e.response?.data?.message||'Could not update this website order.');}
    finally{setBusy(false);}
  }
  const wa=selected&&/^[6-9]\d{9}$/.test(String(selected.customer?.phone||''))
    ?'https://wa.me/91'+selected.customer.phone+'?text='+encodeURIComponent(
      'Namaste '+(selected.customer.name||'')+' ji, we received your SK Digital website request '+
      selected.externalOrderRef+'. Our studio will confirm pricing and artwork.') :null;
  return <Box sx={{p:{xs:1.5,sm:3},maxWidth:1180,mx:'auto',pb:8}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} mb={2}>
      <Box><Typography variant="h5" fontWeight={800}>Website orders</Typography>
        <Typography variant="body2" color="text.secondary">
          Secure inbox for sanjusk.in. Review requests before creating or linking a real MIS order.
        </Typography></Box>
      <Stack direction="row" gap={1}>
        <Button variant="outlined" disabled={busy} onClick={load}>Refresh</Button>
        <Button variant="contained" onClick={()=>navigate(ROUTES.ORDERS_NEW)}>New MIS order</Button>
      </Stack>
    </Stack>
    {!configured&&<Alert severity="warning" sx={{mb:2}}>
      Website order webhook is not configured on this MIS backend. A matching
      HMAC secret must be activated on both services before automatic syncing works.
    </Alert>}
    {error&&<Alert severity="error" sx={{mb:2}} onClose={()=>setError('')}>{error}</Alert>}
    {info&&<Alert severity="success" sx={{mb:2}} onClose={()=>setInfo('')}>{info}</Alert>}
    <Stack direction="row" gap={1} mb={2} flexWrap="wrap" alignItems="center">
      <TextField size="small" select label="Review status" sx={{minWidth:180}} value={status}
        onChange={e=>{setStatus(e.target.value);setPage(1);}}>
        <MenuItem value="">All</MenuItem>
        {['new','reviewed','linked','dismissed'].map(s=><MenuItem value={s} key={s}>{s}</MenuItem>)}
      </TextField>
      <Chip label={'Total '+total}/>
      <Button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button>
      <Typography variant="caption">Page {page}</Typography>
      <Button disabled={page*30>=total} onClick={()=>setPage(p=>p+1)}>Next</Button>
    </Stack>
    <Stack spacing={1.2}>
      {rows.map(row=><Paper key={row._id} variant="outlined" sx={{p:2,borderRadius:2}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
          <Box>
            <Typography fontWeight={800}>{row.title} · {row.quantity} pcs</Typography>
            <Typography variant="body2" color="text.secondary">
              {row.customer?.name} · {row.customer?.phone} · {new Date(row.createdAt).toLocaleString('en-IN')}
            </Typography>
            <Typography variant="caption" color="text.secondary">Website ref {row.externalOrderRef}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Chip label={row.reviewStatus} size="small"/>
            <Chip label={row.workflowStatus?.replaceAll('_',' ')} size="small" variant="outlined"/>
            <Button size="small" onClick={()=>choose(row)}>Review</Button>
          </Stack>
        </Stack>
      </Paper>)}
      {!busy&&!rows.length&&<Paper sx={{p:3,borderRadius:2}}>
        <Typography color="text.secondary">No website orders in this view.</Typography>
      </Paper>}
    </Stack>
    {selected&&<Paper variant="outlined" sx={{mt:3,p:2.5,borderRadius:2}}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Typography variant="h6" fontWeight={800}>Review website order</Typography>
        <Button onClick={()=>setSelected(null)}>Close</Button>
      </Stack>
      <Typography fontWeight={750}>{selected.title} × {selected.quantity}</Typography>
      <Typography variant="body2" sx={{mt:1}}>
        {selected.customer?.name} · {selected.customer?.phone} · {selected.customer?.address}
      </Typography>
      <Typography variant="body2" sx={{mt:1}}>Payment report: {selected.paymentStatus}.
        Display amount: {money(selected.amountPaise)}. Verify all collections before posting MIS receipts.
      </Typography>
      <Typography variant="body2" sx={{mt:1}}>Custom work: {[
        selected.customization?.size,selected.customization?.material,
        selected.customization?.deadline,selected.customization?.artworkNotes
      ].filter(Boolean).join(' · ')||'Not specified'}</Typography>
      <Typography variant="caption" sx={{display:'block',mt:1.5}}>
        Website payment status is an external report, not an MIS ledger entry. Link only to a separately verified MIS order.
      </Typography>
      <Stack direction={{xs:'column',sm:'row'}} gap={1} sx={{mt:2}} flexWrap="wrap">
        <Button variant="contained" disabled={busy} onClick={()=>action('review')}>Mark reviewed</Button>
        <Button variant="outlined" disabled={busy} onClick={()=>action('dismiss')}>Dismiss</Button>
        <Button variant="outlined" onClick={()=>navigate(ROUTES.ORDERS_NEW)}>Create MIS order</Button>
        {wa&&<Button variant="outlined" href={wa} target="_blank" rel="noopener noreferrer">
          WhatsApp customer
        </Button>}
      </Stack>
      <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={2}>
        <TextField size="small" label="Existing MIS order number" value={orderNumber}
          onChange={e=>setOrderNumber(e.target.value)} type="number"/>
        <Button variant="outlined" disabled={busy||!orderNumber}
          onClick={()=>action('link',{orderNumber:Number(orderNumber)})}>
          Link existing MIS order
        </Button>
      </Stack>
      <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={2}>
        <TextField size="small" multiline fullWidth maxRows={4} label="Internal note"
          value={note} onChange={e=>setNote(e.target.value)}/>
        <Button variant="outlined" disabled={busy}
          onClick={()=>action('note',{note})}>Save note</Button>
      </Stack>
    </Paper>}
  </Box>;
}
