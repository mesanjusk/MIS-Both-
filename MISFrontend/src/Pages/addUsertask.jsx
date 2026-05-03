import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast, { Toaster } from 'react-hot-toast';
import InvoiceModal from '../Components/InvoiceModal';
import {
  Autocomplete,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  TextField,
  Stack,
  Paper,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { extractPhoneNumber, sendTemplateWithTextFallback } from '../utils/whatsapp.js';
import {
  WHATSAPP_TEMPLATES,
  buildTaskAssignedParameters,
} from '../constants/whatsappTemplates';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

export default function AddUsertask() {
  const navigate = useNavigate();
  const previewRef = useRef();

  const [Usertask_name, setUsertask_Name] = useState('');
  const [User, setUser] = useState('');
  const [Deadline, setDeadline] = useState(new Date().toLocaleDateString('en-CA'));
  const [Remark, setRemark] = useState('');
  const [LinkedOrder, setLinkedOrder] = useState('');
  const [TaskStatus, setTaskStatus] = useState('pending');
  const [isDeadlineChecked, setIsDeadlineChecked] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [userOptions, setUserOptions] = useState([]);
  const [orderOptions, setOrderOptions] = useState([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [mobileToSend, setMobileToSend] = useState('');
  const [sendWhatsAppAfterSave, setSendWhatsAppAfterSave] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isTransactionSaved, setIsTransactionSaved] = useState(false);
  const inputLabelProps = { shrink: true };

  useEffect(() => {
    setIsAdminUser(localStorage.getItem('User_group') === 'Admin User');

    axios.get('/api/users/GetUserList')
      .then((res) => {
        if (res.data.success) {
          setUserOptions(res.data.result.filter((item) => item.User_group === 'Office User'));
        }
      })
      .catch((err) => console.error('Error fetching user options:', err));

    axios.get('/api/orders/GetOrderList?page=1&limit=200')
      .then((res) => {
        if (res?.data?.success) setOrderOptions(res?.data?.result || []);
      })
      .catch(() => setOrderOptions([]));
  }, []);

  const selectedUser = useMemo(() => userOptions.find((option) => option.User_name === User) || null, [userOptions, User]);

  const sendWhatsApp = async (phone = mobileToSend, userData = null) => {
    if (!phone) return toast.error('User phone number is required');
    setIsSendingWhatsApp(true);
    try {
      const selected = userData || selectedUser;
      const userLabel = selected?.User_name || User || 'User';
      const { data } = await sendTemplateWithTextFallback({
        axiosInstance: axios,
        phone,
        templateName: WHATSAPP_TEMPLATES.TASK_ASSIGNED,
        bodyParameters: buildTaskAssignedParameters({
          employeeName: userLabel,
          taskTitle: Usertask_name || 'New Task',
          assignedDate: new Date().toLocaleDateString('en-IN'),
          dueDate: Deadline || '-',
          assignedBy: localStorage.getItem('User_name') || 'Admin',
        }),
        fallbackMessage: `Hello ${userLabel}, a new task has been assigned to you: ${Usertask_name || 'New Task'}. Due date: ${Deadline || '-'}.`,
      });
      if (!data?.success) return toast.error(data?.error || 'Failed to send WhatsApp message');
      toast.success('WhatsApp message sent');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to send WhatsApp message');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!User || !Usertask_name) return toast.error('Please fill in both user and task fields.');

    const finalDeadline = isDeadlineChecked && Deadline ? Deadline : new Date().toLocaleDateString('en-CA');
    try {
      const res = await axios.post('/api/usertasks/addUsertask', { Usertask_name, User, Deadline: finalDeadline, Remark, LinkedOrder, TaskStatus });
      if (res.data === 'exist') return toast.error('Task already exists');
      if (res.data !== 'notexist') return toast.error('Something went wrong.');

      const phoneNumber = extractPhoneNumber(selectedUser);
      setMobileToSend(phoneNumber);
      setIsTransactionSaved(true);
      setInvoiceItems([{ Item: Usertask_name, Quantity: 1, Rate: 0, Amount: 0 }]);
      toast.success('Task added successfully');

      if (sendWhatsAppAfterSave) {
        await sendWhatsApp(phoneNumber, selectedUser);
      }

      setShowInvoiceModal(true);
    } catch (error) {
      toast.error('Something went wrong.');
      console.error(error);
    }
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <InvoiceModal
        open={showInvoiceModal}
        onClose={() => {
          setShowInvoiceModal(false);
          navigate('/home');
        }}
        invoiceRef={previewRef}
        customerName={User}
        customerMobile={mobileToSend}
        items={invoiceItems}
        remark={Remark}
        onSendWhatsApp={() => sendWhatsApp()}
      />

      <FullscreenAddFormLayout
        onSubmit={submit}
        onClose={() => navigate('/home')}
        submitLabel="Submit"
      >
        <Paper sx={compactCardSx}>
          <Stack spacing={1}>
            <Autocomplete
              options={userOptions}
              value={selectedUser}
              slotProps={{ popper: { sx: { zIndex: 2305 } } }}
              onChange={(_, value) => setUser(value?.User_name || '')}
              getOptionLabel={(option) => option?.User_name || ''}
              isOptionEqualToValue={(option, value) => option?.User_name === value?.User_name}
              renderInput={(params) => <TextField {...params} label="Select User" placeholder="Search user" size="small" sx={compactFieldSx} />}
            />

            <TextField label="Task" value={Usertask_name} onChange={(e) => setUsertask_Name(e.target.value)} placeholder="Enter task" size="small" sx={compactFieldSx} />

            <TextField select label="Linked Order" value={LinkedOrder} onChange={(e) => setLinkedOrder(e.target.value)} size="small" sx={compactFieldSx} MenuProps={{ sx: { zIndex: 2305 }, PaperProps: { sx: { zIndex: 2305 } } }}>
              <MenuItem value="">Select order</MenuItem>
              {orderOptions.map((option) => (
                <MenuItem key={option?._id || option?.Order_uuid} value={option?.Order_uuid || option?._id || ''}>
                  #{option?.Order_Number || '-'} - {option?.Customer_name || 'Unknown'}
                </MenuItem>
              ))}
            </TextField>

            <TextField select label="Task Status" value={TaskStatus} onChange={(e) => setTaskStatus(e.target.value)} size="small" sx={compactFieldSx} MenuProps={{ sx: { zIndex: 2305 }, PaperProps: { sx: { zIndex: 2305 } } }}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="in_progress">In Progress</MenuItem>
              <MenuItem value="done">Done</MenuItem>
            </TextField>

            <TextField label="Remark" value={Remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add remark" multiline minRows={2} size="small" sx={compactFieldSx} />

            <FormControlLabel sx={{ m: 0 }} control={<Checkbox checked={sendWhatsAppAfterSave} onChange={(e) => setSendWhatsAppAfterSave(e.target.checked)} />} label="Send WhatsApp after saving" />

            {isAdminUser ? (
              <>
                <FormControlLabel sx={{ m: 0 }} control={<Checkbox checked={isDeadlineChecked} onChange={() => setIsDeadlineChecked((prev) => !prev)} />} label="Save custom deadline" />
                {isDeadlineChecked ? <TextField label="Deadline" type="date" value={Deadline} onChange={(e) => setDeadline(e.target.value)} InputLabelProps={inputLabelProps} size="small" sx={compactFieldSx} /> : null}
              </>
            ) : null}

            {isTransactionSaved ? (
              <Button type="button" variant="contained" size="small" startIcon={<SendRoundedIcon />} onClick={() => sendWhatsApp()} disabled={isSendingWhatsApp} sx={{ borderRadius: 2 }}>
                {isSendingWhatsApp ? 'Sending WhatsApp...' : 'Send WhatsApp Task Alert'}
              </Button>
            ) : null}
          </Stack>
        </Paper>
      </FullscreenAddFormLayout>
    </>
  );
}
