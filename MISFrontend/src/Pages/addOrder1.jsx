/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import { LoadingSpinner } from '../Components';
import { extractPhoneNumber, normalizeWhatsAppPhone, sendAdminAlertText } from '../utils/whatsapp.js';
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATES,
  buildOrderConfirmationParameters,
} from '../constants/whatsappTemplates';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  GlobalStyles,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';
import { fetchVendorMasters } from '../services/vendorService.js';

const createEmptyItem = () => ({
  Item: '',
  Item_uuid: '',
  Item_group: '',
  itemType: 'finished_item',
  Quantity: 1,
  Rate: 0,
  Amount: 0,
  Remark: '',
});

const createEmptyVendorAssignment = () => ({
  vendorCustomerUuid: '',
  vendorUuid: '',
  vendorName: '',
  workType: '',
  sequence: 1,
  inputItem: '',
  outputItem: '',
  jobMode: 'jobwork_only',
  note: '',
  qty: '',
  amount: '',
  advanceAmount: '',
  dueDate: '',
});

const inputLabelProps = { shrink: true };
const dateInputAfterDays = (days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

const DEFAULT_ORDER_ASSIGNEE_NAME = 'Sai';
const DEFAULT_ORDER_PRIORITY = 'medium';

const getUserSelectValue = (user = {}) => user.User_uuid || user._id || user.User_name || '';
const isOfficeUser = (user = {}) =>
  String(user.User_group || '').trim().toLowerCase() === 'office user';
const findDefaultOfficeAssignee = (users = []) => {
  const officeUsers = users.filter(isOfficeUser);
  const preferred = officeUsers.find(
    (user) => String(user.User_name || '').trim().toLowerCase() === DEFAULT_ORDER_ASSIGNEE_NAME.toLowerCase()
  );
  const saiFallback = users.find(
    (user) => String(user.User_name || '').trim().toLowerCase() === DEFAULT_ORDER_ASSIGNEE_NAME.toLowerCase()
  );
  return getUserSelectValue(preferred || saiFallback || officeUsers[0]) || DEFAULT_ORDER_ASSIGNEE_NAME;
};

const sortByName = (list = [], key = '') =>
  [...list].sort((a, b) =>
    String(a?.[key] || '').localeCompare(String(b?.[key] || ''), undefined, {
      sensitivity: 'base',
    })
  );

const sortStrings = (list = []) =>
  [...list].sort((a, b) =>
    String(a || '').localeCompare(String(b || ''), undefined, {
      sensitivity: 'base',
    })
  );

const getSuccessfulResultArray = (settledResult) => {
  if (settledResult?.status !== 'fulfilled') return [];
  const payload = settledResult.value?.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const getDriveMetaFromCustomer = (customer = {}) => {
  const sourceFileId =
    customer?.googleDriveSourceFileId ||
    customer?.googleDriveTemplateFileId ||
    customer?.driveSourceFileId ||
    customer?.driveTemplateFileId ||
    customer?.sourceFileId ||
    customer?.templateFileId ||
    '';
  const sourceFileName =
    customer?.googleDriveSourceFileName ||
    customer?.googleDriveTemplateFileName ||
    customer?.driveSourceFileName ||
    customer?.driveTemplateFileName ||
    customer?.sourceFileName ||
    customer?.templateFileName ||
    '';
  const folderId =
    customer?.googleDriveFolderId ||
    customer?.driveFolderId ||
    customer?.folderId ||
    '';
  const folderPath =
    customer?.googleDriveFolderPath ||
    customer?.driveFolderPath ||
    customer?.folderPath ||
    '';

  return {
    sourceFileId: String(sourceFileId || '').trim(),
    sourceFileName: String(sourceFileName || '').trim(),
    folderId: String(folderId || '').trim(),
    folderPath: String(folderPath || '').trim(),
  };
};

const buildDrivePayload = (driveMeta = {}) => {
  const payload = {};

  if (driveMeta.sourceFileId) {
    payload.createDriveFile = true;
    payload.driveAutoCopy = true;
    payload.driveTemplateFileId = driveMeta.sourceFileId;
    payload.driveSourceFileId = driveMeta.sourceFileId;
    payload.templateFileId = driveMeta.sourceFileId;
    payload.sourceFileId = driveMeta.sourceFileId;
  }

  if (driveMeta.sourceFileName) {
    payload.driveTemplateFileName = driveMeta.sourceFileName;
    payload.driveSourceFileName = driveMeta.sourceFileName;
  }

  if (driveMeta.folderId) {
    payload.targetFolderId = driveMeta.folderId;
    payload.driveFolderId = driveMeta.folderId;
    payload.folderId = driveMeta.folderId;
  }

  if (driveMeta.folderPath) {
    payload.driveFolderPath = driveMeta.folderPath;
  }

  if (Object.keys(payload).length > 0) {
    payload.googleDrive = {
      enabled: true,
      sourceFileId: driveMeta.sourceFileId || undefined,
      sourceFileName: driveMeta.sourceFileName || undefined,
      folderId: driveMeta.folderId || undefined,
      folderPath: driveMeta.folderPath || undefined,
    };
  }

  return payload;
};

export default function AddOrder1({ closeModal }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [entryType, setEntryType] = useState('Order');
  const [Customer_name, setCustomer_Name] = useState('');
  const [selectedCustomerUuid, setSelectedCustomerUuid] = useState('');
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [Remark, setRemark] = useState('');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [vendorMasterOptions, setVendorMasterOptions] = useState([]);
  const [accountCustomerOptions, setAccountCustomerOptions] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [itemGroupOptions, setItemGroupOptions] = useState([]);
  const [group, setGroup] = useState('');
  const [isAdvanceChecked, setIsAdvanceChecked] = useState(false);
  const [Amount, setAmount] = useState('');
  const [taskGroups, setTaskGroups] = useState([]);
  const [selectedTaskGroups, setSelectedTaskGroups] = useState([]);
  const [showProductionSteps, setShowProductionSteps] = useState(false);
  const [mobileToSend, setMobileToSend] = useState('');
  const [sendWhatsAppAfterSave, setSendWhatsAppAfterSave] = useState(false);
  const [isVendorChecked, setIsVendorChecked] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [latestOrderNumber, setLatestOrderNumber] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isDateChecked, setIsDateChecked] = useState(false);
  const [saveDate, setSaveDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState([createEmptyItem()]);
  const [vendorAssignments, setVendorAssignments] = useState([createEmptyVendorAssignment()]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showOwnershipDelivery, setShowOwnershipDelivery] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState(DEFAULT_ORDER_ASSIGNEE_NAME);
  const [orderDueDate, setOrderDueDate] = useState(dateInputAfterDays(0));
  const [orderPriority, setOrderPriority] = useState(DEFAULT_ORDER_PRIORITY);
  const [formErrors, setFormErrors] = useState({});
  const [savedOrderId, setSavedOrderId] = useState('');
  const [pendingCloseAfterAssignment, setPendingCloseAfterAssignment] = useState(false);

  const editOrderId = location.state?.orderId || location.state?.order?._id || '';
  const isEnquiryOnly = entryType === 'Enquiry';
  const isDetailedOrder = entryType === 'DetailedOrder';
  const isEmbeddedFlow = typeof closeModal === 'function';

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const logInUser = userNameFromState || localStorage.getItem('User_name');
    const userGroup = String(localStorage.getItem('User_group') || '').trim().toLowerCase();

    setIsAdminUser(
      userGroup === 'admin user' ||
      userGroup === 'admin' ||
      userGroup === 'super admin'
    );

    if (!logInUser) navigate('/login');
  }, [location.state, navigate]);

  const fetchData = async () => {
    setOptionsLoading(true);
    try {
      const [customerRes, taskRes, itemRes, itemResPaged, itemGroupRes, usersRes, vendorRes] = await Promise.allSettled([
        axios.get('/api/customers/GetCustomersList'),
        axios.get('/api/taskgroup/GetTaskgroupList'),
        axios.get('/api/items/GetItemList'),
        axios.get('/api/items/GetItemList?page=1&limit=1000'),
        axios.get('/api/itemgroup/GetItemgroupList'),
        axios.get('/api/users/GetUserList'),
        fetchVendorMasters(),
      ]);

      const customers = getSuccessfulResultArray(customerRes);
      const tasks = getSuccessfulResultArray(taskRes);
      const itemsList = getSuccessfulResultArray(itemRes).length
        ? getSuccessfulResultArray(itemRes)
        : getSuccessfulResultArray(itemResPaged);
      const itemGroups = getSuccessfulResultArray(itemGroupRes);
      const users = getSuccessfulResultArray(usersRes);
      const vendors = vendorRes?.status === 'fulfilled' && Array.isArray(vendorRes.value) ? vendorRes.value : [];

      setCustomerOptions(sortByName(customers, 'Customer_name'));
      setVendorMasterOptions(sortByName(vendors.filter((vendor) => vendor?.Active !== false), 'Vendor_name'));

      setAssignableUsers(
        sortByName(
          (users || []).filter((user) => user?.User_name && isOfficeUser(user)),
          'User_name'
        )
      );

      setAccountCustomerOptions(
        sortByName(
          customers.filter((item) => item.Customer_group === 'Bank and Account'),
          'Customer_name'
        )
      );

      setTaskGroups(tasks);
      setItemOptions(sortByName(itemsList, 'Item_name'));

      const groupNames = itemGroups.map((item) => item?.Item_group).filter(Boolean);
      setItemGroupOptions(sortStrings(groupNames));
    } catch (error) {
      console.error(error);
      toast.error('Error fetching data');
    } finally {
      setOptionsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (location.state?.refreshCustomers) {
      fetchData();
      navigate(location.pathname, {
        replace: true,
        state: {
          ...location.state,
          refreshCustomers: false,
        },
      });
    }
  }, [location, navigate]);

  useEffect(() => {
    const hydrateEditOrder = async () => {
      if (!editOrderId) return;
      try {
        const { data } = await axios.get(`/order/${editOrderId}`);
        const order = data?.result || data || null;
        if (!order) return;

        const note = order?.orderNote || order?.Remark || '';
        setCreatedOrder(order);
        setSavedOrderId(order?._id || '');
        setLatestOrderNumber(order?.Order_Number || order?.Order_number || '');
        setSelectedCustomerUuid(order?.Customer_uuid || '');
        setRemark(note);
        setOrderDueDate(order?.dueDate ? String(order.dueDate).split('T')[0] : dateInputAfterDays(0));
        setOrderPriority(String(order?.priority || DEFAULT_ORDER_PRIORITY).toLowerCase());
        setSelectedAssignee(order?.assignedTo?.User_uuid || order?.assignedTo?.User_name || order?.assignedTo || DEFAULT_ORDER_ASSIGNEE_NAME);
        setShowOwnershipDelivery(Boolean(order?.assignedTo || order?.dueDate || order?.priority));
        setShowProductionSteps(Array.isArray(order?.Steps) && order.Steps.length > 0);

        setEntryType(Array.isArray(order?.Items) && order.Items.length ? 'DetailedOrder' : 'Order');

        setItems(
          Array.isArray(order?.Items) && order.Items.length
            ? order.Items.map((row) => ({
                Item: row?.Item || '',
                Item_uuid: row?.Item_uuid || '',
                Item_group: row?.Item_group || '',
                itemType: row?.itemType || 'finished_item',
                Quantity: row?.Quantity || 1,
                Rate: row?.Rate || 0,
                Amount: row?.Amount || 0,
                Remark: row?.Remark || '',
              }))
            : [createEmptyItem()]
        );

        setVendorAssignments(
          Array.isArray(order?.vendorAssignments) && order.vendorAssignments.length
            ? order.vendorAssignments.map((row) => ({
                vendorCustomerUuid: row?.vendorUuid || row?.vendorCustomerUuid || '',
                vendorUuid: row?.vendorUuid || row?.vendorCustomerUuid || '',
                vendorName: row?.vendorName || '',
                workType: row?.workType || '',
                sequence: row?.sequence || 1,
                inputItem: row?.inputItem || '',
                outputItem: row?.outputItem || '',
                jobMode: row?.jobMode || 'jobwork_only',
                note: row?.note || '',
                qty: row?.qty || '',
                amount: row?.amount || '',
                advanceAmount: row?.advanceAmount || '',
                dueDate: row?.dueDate ? String(row.dueDate).split('T')[0] : '',
              }))
            : [createEmptyVendorAssignment()]
        );

        setSelectedTaskGroups(
          Array.isArray(order?.Steps) ? order.Steps.map((row) => row?.uuid).filter(Boolean) : []
        );
        setIsVendorChecked(Boolean(order?.vendorAssignments?.length));
      } catch (error) {
        console.error('Failed to hydrate order for edit', error);
        toast.error('Failed to load order for edit');
      }
    };

    hydrateEditOrder();
  }, [editOrderId]);

  const finishAndClose = () => {
    if (isEmbeddedFlow) closeModal();
    else navigate('/home');
  };

  const sortedCustomerOptions = useMemo(
    () => sortByName(customerOptions, 'Customer_name'),
    [customerOptions]
  );

  const selectedItemCatalogMap = useMemo(() => {
    const map = new Map();
    (itemOptions || []).forEach((option) => {
      map.set(String(option?.Item_name || ''), option);
    });
    return map;
  }, [itemOptions]);

  const selectedCustomer = useMemo(
    () =>
      sortedCustomerOptions.find(
        (c) =>
          (selectedCustomerUuid && String(c.Customer_uuid) === String(selectedCustomerUuid)) ||
          String(c.Customer_name || '') === String(Customer_name || '')
      ) || null,
    [sortedCustomerOptions, selectedCustomerUuid, Customer_name]
  );

  useEffect(() => {
    if (selectedCustomer?.Customer_name) {
      setCustomer_Name(selectedCustomer.Customer_name);
      setCustomerSearchInput(selectedCustomer.Customer_name);
    }
  }, [selectedCustomer?.Customer_name]);

  const selectedAssigneeName = useMemo(() => {
    const user = assignableUsers.find((item) =>
      [item.User_uuid, item._id, item.User_name].some((value) => String(value || '') === String(selectedAssignee || ''))
    );
    return user?.User_name || '';
  }, [assignableUsers, selectedAssignee]);

  const defaultOfficeAssigneeValue = useMemo(
    () => findDefaultOfficeAssignee(assignableUsers),
    [assignableUsers]
  );

  useEffect(() => {
    if (editOrderId || isEnquiryOnly || showOwnershipDelivery) return;

    setSelectedAssignee(defaultOfficeAssigneeValue);
    setOrderDueDate(dateInputAfterDays(0));
    setOrderPriority(DEFAULT_ORDER_PRIORITY);
    setFormErrors((prev) => ({ ...prev, assignedTo: '', dueDate: '' }));
  }, [defaultOfficeAssigneeValue, editOrderId, isEnquiryOnly, showOwnershipDelivery]);

  useEffect(() => {
    if (editOrderId || isEnquiryOnly) return;
    if (!selectedAssignee || selectedAssignee === DEFAULT_ORDER_ASSIGNEE_NAME) {
      setSelectedAssignee(defaultOfficeAssigneeValue);
    }
  }, [defaultOfficeAssigneeValue, editOrderId, isEnquiryOnly, selectedAssignee]);

  const stepCandidates = useMemo(
    () =>
      sortByName(
        taskGroups.filter((tg) => tg.Id === 1),
        'Task_group_name'
      ),
    [taskGroups]
  );

  const sortedPaymentModeOptions = useMemo(
    () => sortByName(accountCustomerOptions, 'Customer_name'),
    [accountCustomerOptions]
  );

  const vendorOptions = useMemo(
    () => sortByName(vendorMasterOptions.filter((vendor) => vendor?.Active !== false), 'Vendor_name'),
    [vendorMasterOptions]
  );

  const itemNameOptions = useMemo(
    () => sortByName(itemOptions, 'Item_name'),
    [itemOptions]
  );

  const selectMenuProps = useMemo(
    () => ({
      sx: { zIndex: 2605 },
      PaperProps: {
        sx: { zIndex: 2605 },
      },
    }),
    []
  );

  const autocompleteSlotProps = useMemo(
    () => ({
      popper: {
        sx: { zIndex: 2605 },
      },
    }),
    []
  );

  const normalizedItems = useMemo(
    () =>
      items
        .map((item) => {
          const quantity = Number(item.Quantity || 0);
          const rate = Number(item.Rate || 0);
          const amount = Number(item.Amount || quantity * rate || 0);

          return {
            ...item,
            Item: String(item.Item || '').trim(),
            Item_group: String(item.Item_group || '').trim(),
            Quantity: quantity,
            Rate: rate,
            Amount: amount,
            Remark: String(item.Remark || '').trim(),
          };
        })
        .filter((item) => item.Item),
    [items]
  );

  const normalizedVendorAssignments = useMemo(
    () =>
      vendorAssignments
        .map((row, index) => {
          const vendorUuid = String(row.vendorUuid || row.vendorCustomerUuid || '').trim();
          return {
            ...row,
            vendorCustomerUuid: vendorUuid,
            vendorUuid,
            vendorName: String(row.vendorName || '').trim(),
            workType: String(row.workType || '').trim(),
            sequence: Number(row.sequence || index + 1),
            inputItem: String(row.inputItem || '').trim(),
            outputItem: String(row.outputItem || '').trim(),
            jobMode: row.jobMode || 'jobwork_only',
            note: String(row.note || '').trim(),
            qty: Number(row.qty || 0),
            amount: Number(row.amount || 0),
            advanceAmount: Number(row.advanceAmount || 0),
          };
        })
        .filter((row) => row.vendorCustomerUuid && row.vendorName),
    [vendorAssignments]
  );

  const canSubmit = useMemo(() => {
    if (!selectedCustomer) return false;
    if (isEnquiryOnly) return true;

    const hasNote = Boolean(String(Remark || '').trim());
    const hasItems = isDetailedOrder ? normalizedItems.length > 0 : hasNote;
    const advanceOk = !isAdvanceChecked ? true : Number(Amount) > 0 && Boolean(group);

    return hasItems && advanceOk;
  }, [
    selectedCustomer,
    isEnquiryOnly,
    isDetailedOrder,
    normalizedItems.length,
    Remark,
    isAdvanceChecked,
    Amount,
    group,
  ]);

  const updateItemRow = (index, field, value) => {
    setItems((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, [field]: value };

        if (field === 'Item') {
          const selectedItem = itemOptions.find(
            (option) => String(option?.Item_name || '') === String(value || '')
          );
          if (selectedItem?.Item_group) next.Item_group = selectedItem.Item_group;
          if (selectedItem?.Item_uuid) next.Item_uuid = selectedItem.Item_uuid;
          if (selectedItem?.itemType) next.itemType = selectedItem.itemType;
          if (selectedItem?.defaultSaleRate && !Number(next.Rate || 0)) {
            next.Rate = Number(selectedItem.defaultSaleRate || 0);
          }
          if (selectedItem?.defaultSaleRate && field !== 'Amount') {
            next.Amount = Number(next.Quantity || 0) * Number(next.Rate || selectedItem.defaultSaleRate || 0);
          }
        }

        const quantity = Number(next.Quantity || 0);
        const rate = Number(next.Rate || 0);

        if (field !== 'Amount') {
          next.Amount = quantity * rate;
        }

        return next;
      })
    );
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  const removeItemRow = (index) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const updateVendorRow = (index, patch) => {
    setVendorAssignments((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  };

  const addVendorRow = () => {
    setVendorAssignments((prev) => [
      ...prev,
      { ...createEmptyVendorAssignment(), sequence: prev.length + 1 },
    ]);
  };

  const removeVendorRow = (index) => {
    setVendorAssignments((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const toggleTaskGroup = (taskGroupUuid) => {
    setSelectedTaskGroups((prev) =>
      prev.includes(taskGroupUuid)
        ? prev.filter((uuid) => uuid !== taskGroupUuid)
        : [...prev, taskGroupUuid]
    );
  };

  const handleEntryTypeChange = (_, next) => {
    if (!next) return;
    setEntryType(next);

    if (next === 'Enquiry') {
      setIsAdvanceChecked(false);
      setSendWhatsAppAfterSave(false);
      setIsVendorChecked(false);
      setShowProductionSteps(false);
      setAmount('');
      setGroup('');
      setSelectedTaskGroups([]);
    }
  };

  const openAddCustomerPage = () => {
    navigate('/addCustomer', {
      state: {
        from: '/addOrder1',
        returnTo: location.pathname,
        refreshCustomers: true,
      },
    });
  };

  const sendWhatsApp = async (phone = mobileToSend, customerData = null) => {
    if (!phone) {
      toast.error('Customer phone number is required');
      return;
    }

    setIsSendingWhatsApp(true);

    try {
      const customer = customerData || selectedCustomer;
      const customerLabel = customer?.Customer_name || Customer_name || 'Customer';
      const cleanPhone = normalizeWhatsAppPhone(phone);

      const payload = {
        to: cleanPhone,
        template_name: WHATSAPP_TEMPLATES.ORDER_CONFIRMATION,
        language: DEFAULT_TEMPLATE_LANGUAGE,
        components: [
          {
            type: 'body',
            parameters: buildOrderConfirmationParameters({
              customerName: customerLabel,
              orderNumber:
                latestOrderNumber ||
                createdOrder?.Order_Number ||
                createdOrder?.Order_number ||
                '-',
              date: new Date().toLocaleDateString('en-IN'),
              amount: String(Number(Amount || 0) || 0),
              details: isDetailedOrder
                ? normalizedItems[0]?.Item || 'Detailed order placed'
                : Remark || 'Order placed',
            }).map((text) => ({ type: 'text', text })),
          },
        ],
      };

      const { data } = await axios.post('/api/whatsapp/send-template', payload);

      if (!data?.success) {
        toast.error(data?.error || 'Failed to send WhatsApp template');
        return;
      }

      await sendAdminAlertText({
        axiosInstance: axios,
        message: `Order alert: ${customerLabel} | Amount: ₹${Number(Amount || 0) || 0} | ${
          isDetailedOrder ? normalizedItems[0]?.Item || 'Detailed order placed' : Remark || 'Order placed'
        }`,
      }).catch(() => null);

      toast.success('WhatsApp template sent');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to send WhatsApp template');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const openAssignmentFlow = (orderId) => {
    setSavedOrderId(orderId || '');
    setSelectedAssignee('');
    setShowAssignDialog(true);
    setPendingCloseAfterAssignment(true);
  };

  const completeAfterSave = (savedId) => {
    const shouldPromptAssignment = !isEnquiryOnly && isAdminUser && !editOrderId && !selectedAssignee;
    if (shouldPromptAssignment) {
      openAssignmentFlow(savedId);
    } else {
      finishAndClose();
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const customer = selectedCustomer;
      const effectiveAssignee = showOwnershipDelivery ? selectedAssignee : defaultOfficeAssigneeValue;
      const effectiveDueDate = showOwnershipDelivery ? orderDueDate : dateInputAfterDays(0);
      const effectivePriority = showOwnershipDelivery ? orderPriority : DEFAULT_ORDER_PRIORITY;
      const validationErrors = {};
      if (!isEnquiryOnly && showOwnershipDelivery && !effectiveAssignee) {
        validationErrors.assignedTo = 'Please assign this order to an office user';
      }
      if (!isEnquiryOnly && showOwnershipDelivery && !effectiveDueDate) {
        validationErrors.dueDate = 'Delivery date is required';
      }
      setFormErrors(validationErrors);
      if (Object.keys(validationErrors).length) {
        toast.error(Object.values(validationErrors)[0]);
        return;
      }

      if (!customer) {
        toast.error('Invalid customer selection');
        return;
      }

      const steps = showProductionSteps
        ? selectedTaskGroups.map((tgUuid) => {
            const taskGroup = taskGroups.find((t) => t.Task_group_uuid === tgUuid);
            return {
              uuid: tgUuid,
              label: taskGroup?.Task_group_name || taskGroup?.Task_group || 'Unnamed Group',
              checked: true,
            };
          })
        : [];

      const payloadItems = isDetailedOrder ? normalizedItems : [];
      const driveMeta = getDriveMetaFromCustomer(customer);
      const drivePayload = buildDrivePayload(driveMeta);

      const orderPayload = {
        Customer_uuid: customer.Customer_uuid,
        orderMode: isDetailedOrder ? 'items' : 'note',
        orderNote: isDetailedOrder ? '' : String(Remark || '').trim(),
        Remark: isDetailedOrder ? '' : String(Remark || '').trim(),
        vendorAssignments: isVendorChecked ? normalizedVendorAssignments : [],
        Steps: steps,
        productionStepsEnabled: showProductionSteps,
        Items: payloadItems,
        Type: isEnquiryOnly ? 'Enquiry' : 'Order',
        isEnquiry: isEnquiryOnly,
        customerName: customer.Customer_name || Customer_name || '',
        assignedTo: effectiveAssignee,
        assignToUserUuid: effectiveAssignee,
        dueDate: effectiveDueDate,
        priority: effectivePriority,
        ...drivePayload,
      };

      const orderRes = editOrderId
        ? await axios.put(`/order/updateOrder/${editOrderId}`, orderPayload)
        : await axios.post('/api/orders/addOrder', orderPayload);

      if (!orderRes.data?.success) {
        toast.error(editOrderId ? 'Failed to update order' : 'Failed to add order');
        return;
      }

      const savedOrder = orderRes.data.result || null;
      const savedId = savedOrder?._id || editOrderId || '';
      setCreatedOrder(savedOrder);
      setSavedOrderId(savedId);
      setLatestOrderNumber(
        savedOrder?.Order_Number || savedOrder?.Order_number || ''
      );

      const driveFile = orderRes.data?.driveFile || savedOrder?.driveFile;

      if (driveFile?.status === 'created') {
        toast.success('Order saved and Drive file created');
      } else if (driveFile?.status === 'failed') {
        toast.error(`Order saved, but Drive file failed: ${driveFile?.error || 'Unknown error'}`);
      } else {
        toast.success(editOrderId ? 'Order updated successfully' : 'Order saved successfully');
      }

      if (isEnquiryOnly) {
        toast.success('Enquiry saved');
        finishAndClose();
        return;
      }

      const phoneNumber = extractPhoneNumber(customer);
      setMobileToSend(phoneNumber);

      if (sendWhatsAppAfterSave) {
        await sendWhatsApp(phoneNumber, customer);
      }

      if (isAdvanceChecked && Amount && group) {
        const amt = Number(Amount || 0);

        if (Number.isNaN(amt) || amt <= 0) {
          toast.error('Enter a valid advance amount');
          return;
        }

        const payModeCustomer = sortedPaymentModeOptions.find((opt) => opt.Customer_uuid === group);
        const journal = [
          { Account_id: group, Type: 'Debit', Amount: amt },
          { Account_id: customer.Customer_uuid, Type: 'Credit', Amount: amt },
        ];

        try {
          const txnRes = await axios.post('/api/transaction/addTransaction', {
            Description: Remark || 'Advance received',
            Transaction_date:
              isAdminUser && isDateChecked
                ? saveDate || new Date().toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0],
            Total_Credit: amt,
            Total_Debit: amt,
            Payment_mode: payModeCustomer?.Customer_name || 'Advance',
            Journal_entry: journal,
          });

          if (txnRes.data?.success) {
            toast.success('Advance payment recorded');
          } else {
            toast.error('Transaction failed');
          }
        } catch {
          toast.error('Transaction failed');
        }
      }

      completeAfterSave(savedId);
    } catch (error) {
      console.error('Error during submit:', error);
      toast.error(error?.response?.data?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignLater = () => {
    setShowAssignDialog(false);
    if (pendingCloseAfterAssignment) {
      setPendingCloseAfterAssignment(false);
      finishAndClose();
    }
  };

  const handleAssignNow = async () => {
    try {
      await axios.patch(`/order/${savedOrderId}/assign`, {
        assignedTo: selectedAssignee,
        assignedBy: localStorage.getItem('User_name') || 'System',
      });

      toast.success('Design assigned successfully');
      setShowAssignDialog(false);

      if (pendingCloseAfterAssignment) {
        setPendingCloseAfterAssignment(false);
        finishAndClose();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to assign design');
    }
  };

  return (
    <>
      <GlobalStyles
        styles={{
          '#root': { isolation: 'isolate' },
          '.react-hot-toast, [data-sonner-toaster], .Toaster, [data-hot-toast]': {
            zIndex: '4000 !important',
          },
          '.MuiDialog-root': {
            zIndex: '3200 !important',
          },
          '.MuiPopover-root, .MuiPopper-root, .MuiAutocomplete-popper, .MuiMenu-root': {
            zIndex: '3300 !important',
          },
        }}
      />

      <Dialog
        open={showAssignDialog}
        onClose={handleAssignLater}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 3,
            zIndex: 3201,
          },
        }}
        BackdropProps={{
          sx: {
            zIndex: 3200,
          },
        }}
      >
        <DialogTitle>Assign design task</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Assign this order now so it appears in that user&apos;s pending design queue and attendance popup.
            </Typography>
            <TextField
              select
              label="Assign to Office User"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              size="small"
              fullWidth
              sx={compactFieldSx}
              SelectProps={{
                MenuProps: selectMenuProps,
              }}
            >
              <MenuItem value="">Select office user</MenuItem>
              {assignableUsers.length ? (
                assignableUsers.map((user) => (
                  <MenuItem key={user.User_uuid || user._id} value={user.User_uuid || user._id || user.User_name}>
                    {user.User_name}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="" disabled>
                  No office user found
                </MenuItem>
              )}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleAssignLater}>Later</Button>
          <Button
            variant="contained"
            disabled={!selectedAssignee || !savedOrderId}
            onClick={handleAssignNow}
          >
            Assign now
          </Button>
        </DialogActions>
      </Dialog>

      <FullscreenAddFormLayout
        onSubmit={submit}
        onClose={closeModal || (() => navigate('/home'))}
        submitLabel={
          isSubmitting
            ? isEnquiryOnly
              ? 'Saving Enquiry...'
              : 'Submitting...'
            : isEnquiryOnly
              ? 'Save Enquiry'
              : editOrderId
                ? 'Update Order'
                : 'Submit Order'
        }
        busy={isSubmitting}
        disableSubmit={optionsLoading || isSubmitting || !canSubmit}
      >
        <Stack spacing={1}>
          <Paper sx={compactCardSx}>
            <Stack spacing={1}>
              <ToggleButtonGroup
                value={entryType}
                exclusive
                size="small"
                fullWidth
                onChange={handleEntryTypeChange}
                sx={{
                  '& .MuiToggleButton-root': {
                    textTransform: 'none',
                    borderRadius: '10px !important',
                    py: 0.8,
                    fontSize: { xs: '0.74rem', sm: '0.82rem' },
                  },
                }}
              >
                <ToggleButton value="Order">Order</ToggleButton>
                <ToggleButton value="DetailedOrder">Detailed Order</ToggleButton>
                <ToggleButton value="Enquiry">Enquiry</ToggleButton>
              </ToggleButtonGroup>

              <Stack direction="row" spacing={1} alignItems="stretch">
                <Autocomplete
                  loading={optionsLoading}
                  options={sortedCustomerOptions}
                  value={selectedCustomer}
                  inputValue={customerSearchInput}
                  onInputChange={(_, value, reason) => {
                    setCustomerSearchInput(value || '');
                    if (reason === 'input') {
                      setSelectedCustomerUuid('');
                      setCustomer_Name(value || '');
                    }
                    if (reason === 'clear') {
                      setSelectedCustomerUuid('');
                      setCustomer_Name('');
                    }
                  }}
                  onChange={(_, value) => {
                    setCustomer_Name(value?.Customer_name || '');
                    setSelectedCustomerUuid(value?.Customer_uuid || '');
                    setCustomerSearchInput(value?.Customer_name || '');
                  }}
                  getOptionLabel={(option) => option?.Customer_name || ''}
                  isOptionEqualToValue={(option, value) =>
                    option?.Customer_uuid === value?.Customer_uuid
                  }
                  slotProps={autocompleteSlotProps}
                  sx={{ flex: 1, minWidth: 0 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Customer / Party"
                      placeholder="Search by name"
                      size="small"
                      sx={compactFieldSx}
                    />
                  )}
                />

                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={openAddCustomerPage}
                  sx={{
                    minWidth: 42,
                    width: 42,
                    flexShrink: 0,
                    borderRadius: 2,
                    px: 0,
                  }}
                >
                  <AddIcon />
                </Button>
              </Stack>

              {!isDetailedOrder ? (
                <TextField
                  label={isEnquiryOnly ? 'Enquiry Note' : 'Order Note'}
                  value={Remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Job description, size, delivery details, or work instructions"
                  multiline
                  minRows={2.5}
                  size="small"
                  fullWidth
                  sx={compactFieldSx}
                />
              ) : null}
            </Stack>
          </Paper>





          

          {isDetailedOrder ? (
            <Paper sx={compactCardSx}>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={700}>
                    Detailed Items
                  </Typography>
                  <Button
                    type="button"
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={addItemRow}
                    sx={{ borderRadius: 2 }}
                  >
                    Add Item
                  </Button>
                </Stack>

                {items.map((item, index) => (
                  <Paper
                    key={`item-${index}`}
                    variant="outlined"
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      boxShadow: 'none',
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          Item {index + 1}
                        </Typography>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeItemRow(index)}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Stack>

                      <Autocomplete
                        options={itemNameOptions}
                        freeSolo
                        slotProps={autocompleteSlotProps}
                        value={item.Item || ''}
                        getOptionLabel={(option) =>
                          typeof option === 'string' ? option : option?.Item_name || ''
                        }
                        onChange={(_, value) =>
                          updateItemRow(
                            index,
                            'Item',
                            typeof value === 'string' ? value : value?.Item_name || ''
                          )
                        }
                        inputValue={item.Item || ''}
                        onInputChange={(_, value) => updateItemRow(index, 'Item', value || '')}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Item Name"
                            size="small"
                            fullWidth
                            sx={compactFieldSx}
                          />
                        )}
                      />

                      <TextField
                        select
                        label="Item Group"
                        value={item.Item_group}
                        onChange={(e) => updateItemRow(index, 'Item_group', e.target.value)}
                        size="small"
                        fullWidth
                        sx={compactFieldSx}
                        MenuProps={selectMenuProps}
                      >
                        <MenuItem value="">Select Group</MenuItem>
                        {itemGroupOptions.map((option) => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </TextField>

                      {selectedItemCatalogMap.get(item.Item)?.itemType === 'finished_item' &&
                      (selectedItemCatalogMap.get(item.Item)?.bomCount || 0) > 0 ? (
                        <Alert severity="info" sx={{ borderRadius: 2 }}>
                          This finished item has {(selectedItemCatalogMap.get(item.Item)?.bomCount || 0)} BOM rows. Raw material and service work will be created automatically after saving the order. Vendor or user can be decided later.
                        </Alert>
                      ) : null}

                      {selectedItemCatalogMap.get(item.Item)?.itemType ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                          <TextField
                            label="Item Type"
                            value={selectedItemCatalogMap.get(item.Item)?.itemType || item.itemType || ''}
                            size="small"
                            fullWidth
                            disabled
                            sx={compactFieldSx}
                          />
                          <TextField
                            label="Execution"
                            value={selectedItemCatalogMap.get(item.Item)?.executionMode || '-'}
                            size="small"
                            fullWidth
                            disabled
                            sx={compactFieldSx}
                          />
                        </Stack>
                      ) : null}

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField
                          label="Qty"
                          type="number"
                          value={item.Quantity}
                          onChange={(e) => updateItemRow(index, 'Quantity', e.target.value)}
                          size="small"
                          fullWidth
                          sx={compactFieldSx}
                        />
                        <TextField
                          label="Rate"
                          type="number"
                          value={item.Rate}
                          onChange={(e) => updateItemRow(index, 'Rate', e.target.value)}
                          size="small"
                          fullWidth
                          sx={compactFieldSx}
                        />
                        <TextField
                          label="Amount"
                          type="number"
                          value={item.Amount}
                          onChange={(e) => updateItemRow(index, 'Amount', e.target.value)}
                          size="small"
                          fullWidth
                          sx={compactFieldSx}
                        />
                      </Stack>

                      <TextField
                        label="Remark"
                        value={item.Remark}
                        onChange={(e) => updateItemRow(index, 'Remark', e.target.value)}
                        size="small"
                        fullWidth
                        sx={compactFieldSx}
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ) : null}
{!isEnquiryOnly && showProductionSteps ? (
            <Paper sx={compactCardSx}>
              <Stack spacing={1}>
                <Typography variant="body2" fontWeight={700}>
                  Steps
                </Typography>

                {stepCandidates.length ? (
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {stepCandidates.map((tg) => {
                      const isSelected = selectedTaskGroups.includes(tg.Task_group_uuid);
                      return (
                        <Chip
                          key={tg.Task_group_uuid}
                          label={tg.Task_group_name || tg.Task_group}
                          clickable
                          color={isSelected ? 'primary' : 'default'}
                          variant={isSelected ? 'filled' : 'outlined'}
                          onClick={() => toggleTaskGroup(tg.Task_group_uuid)}
                          icon={
                            <Checkbox
                              size="small"
                              checked={isSelected}
                              sx={{ p: 0, ml: 0.5 }}
                            />
                          }
                          sx={{
                            height: 34,
                            borderRadius: 2,
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No production steps available
                  </Typography>
                )}
              </Stack>
            </Paper>
          ) : null}
          
          {!isEnquiryOnly ? (
            <Paper sx={compactCardSx}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        checked={isAdvanceChecked}
                        onChange={() => {
                          setIsAdvanceChecked((prev) => !prev);
                          setAmount('');
                          setGroup('');
                        }}
                      />
                    }
                    label="Advance"
                  />

                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        checked={sendWhatsAppAfterSave}
                        onChange={(e) => setSendWhatsAppAfterSave(e.target.checked)}
                      />
                    }
                    label="Send WhatsApp"
                  />

                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        checked={isVendorChecked}
                        onChange={(e) => setIsVendorChecked(e.target.checked)}
                      />
                    }
                    label="Vendor"
                  />

                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        checked={showProductionSteps}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setShowProductionSteps(checked);
                          if (!checked) setSelectedTaskGroups([]);
                        }}
                      />
                    }
                    label="Production Steps"
                  />

                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        checked={showOwnershipDelivery}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setShowOwnershipDelivery(checked);
                          if (!checked) {
                            setSelectedAssignee(defaultOfficeAssigneeValue);
                            setOrderDueDate(dateInputAfterDays(0));
                            setOrderPriority(DEFAULT_ORDER_PRIORITY);
                            setFormErrors((prev) => ({ ...prev, assignedTo: '', dueDate: '' }));
                          }
                        }}
                      />
                    }
                    label="Ownership & Delivery"
                  />
                </Stack>

                

                {!isEnquiryOnly && showOwnershipDelivery ? (
                  <Paper sx={compactCardSx}>
                    <Stack spacing={1}>
                      <Typography variant="body2" fontWeight={700}>Ownership & Delivery</Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField
                          select
                          required
                          label="Assigned To Office User"
                          value={selectedAssignee}
                          onChange={(e) => {
                            setSelectedAssignee(e.target.value);
                            setFormErrors((prev) => ({ ...prev, assignedTo: '' }));
                          }}
                          error={Boolean(formErrors.assignedTo)}
                          helperText={formErrors.assignedTo || 'Only Office User group is shown here'}
                          size="small"
                          fullWidth
                          sx={compactFieldSx}
                          SelectProps={{ MenuProps: selectMenuProps }}
                        >
                          <MenuItem value="">Select office user</MenuItem>
                          {assignableUsers.map((user) => (
                            <MenuItem key={user.User_uuid || user._id || user.User_name} value={user.User_uuid || user._id || user.User_name}>
                              {user.User_name} {user.User_group ? `(${user.User_group})` : ''}
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          required
                          label="Delivery Date"
                          type="date"
                          value={orderDueDate}
                          onChange={(e) => {
                            setOrderDueDate(e.target.value);
                            setFormErrors((prev) => ({ ...prev, dueDate: '' }));
                          }}
                          error={Boolean(formErrors.dueDate)}
                          helperText={formErrors.dueDate || 'Cannot select past date'}
                          inputProps={{ min: dateInputAfterDays(0) }}
                          size="small"
                          fullWidth
                          sx={compactFieldSx}
                          InputLabelProps={inputLabelProps}
                        />

                        <TextField
                          select
                          label="Priority"
                          value={orderPriority}
                          onChange={(e) => setOrderPriority(e.target.value)}
                          size="small"
                          fullWidth
                          sx={compactFieldSx}
                          SelectProps={{ MenuProps: selectMenuProps }}
                        >
                          <MenuItem value="low"><Chip size="small" color="success" label="Low" /></MenuItem>
                          <MenuItem value="medium"><Chip size="small" color="warning" label="Medium" /></MenuItem>
                          <MenuItem value="high"><Chip size="small" color="error" label="High" /></MenuItem>
                        </TextField>
                      </Stack>
                      <Alert severity="info" sx={{ py: 0, borderRadius: 2, '& .MuiAlert-message': { py: 0.75 } }}>
                        This order will be assigned to {selectedAssigneeName || '—'} | Due: {orderDueDate || '—'} | Priority: {orderPriority}
                      </Alert>
                    </Stack>
                  </Paper>
                ) : null}

                {isAdvanceChecked ? (
                  <Stack spacing={1}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField
                        label="Advance Amount (₹)"
                        type="number"
                        value={Amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputProps={{ min: 0, step: '0.01' }}
                        size="small"
                        fullWidth
                        sx={compactFieldSx}
                      />
                      <TextField
                        select
                        label="Payment Mode"
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                        size="small"
                        fullWidth
                        sx={compactFieldSx}
                        MenuProps={selectMenuProps}
                      >
                        <MenuItem value="">Select</MenuItem>
                        {sortedPaymentModeOptions.map((c) => (
                          <MenuItem key={c.Customer_uuid} value={c.Customer_uuid}>
                            {c.Customer_name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>

                    {isAdminUser ? (
                      <>
                        <FormControlLabel
                          sx={{ m: 0 }}
                          control={
                            <Checkbox
                              checked={isDateChecked}
                              onChange={() => {
                                setIsDateChecked((prev) => !prev);
                                setSaveDate(new Date().toISOString().split('T')[0]);
                              }}
                            />
                          }
                          label="Save custom advance date"
                        />

                        {isDateChecked ? (
                          <TextField
                            label="Advance Date"
                            type="date"
                            value={saveDate}
                            onChange={(e) => setSaveDate(e.target.value)}
                            size="small"
                            fullWidth
                            sx={compactFieldSx}
                            InputLabelProps={inputLabelProps}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </Stack>
                ) : null}

                {isVendorChecked ? (
                  <Stack spacing={1}>
                    <Alert
                      severity="info"
                      sx={{
                        py: 0,
                        borderRadius: 2,
                        '& .MuiAlert-message': { py: 0.75 },
                      }}
                    >
                      Pick any existing customer / party as vendor.
                    </Alert>

                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" fontWeight={700}>
                        Vendor Details
                      </Typography>
                      <Button
                        type="button"
                        variant="outlined"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={addVendorRow}
                        sx={{ borderRadius: 2 }}
                      >
                        Add Vendor
                      </Button>
                    </Stack>

                    {vendorAssignments.map((row, index) => (
                      <Paper
                        key={`vendor-${index}`}
                        variant="outlined"
                        sx={{
                          p: 1,
                          borderRadius: 2,
                          boxShadow: 'none',
                        }}
                      >
                        <Stack spacing={1}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                              Vendor {index + 1}
                            </Typography>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeVendorRow(index)}
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Stack>

                          <Autocomplete
                            options={vendorOptions}
                            slotProps={autocompleteSlotProps}
                            value={
                              vendorOptions.find(
                                (item) => item.Vendor_uuid === (row.vendorUuid || row.vendorCustomerUuid)
                              ) || null
                            }
                            onChange={(_, value) =>
                              updateVendorRow(index, {
                                vendorCustomerUuid: value?.Vendor_uuid || '',
                                vendorUuid: value?.Vendor_uuid || '',
                                vendorName: value?.Vendor_name || '',
                              })
                            }
                            getOptionLabel={(option) => option?.Vendor_name || ''}
                            isOptionEqualToValue={(option, value) =>
                              option?.Vendor_uuid === value?.Vendor_uuid
                            }
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Vendor / Job Worker"
                                size="small"
                                sx={compactFieldSx}
                              />
                            )}
                          />

                          <TextField
                            label="Work Type"
                            value={row.workType}
                            onChange={(e) => updateVendorRow(index, { workType: e.target.value })}
                            size="small"
                            fullWidth
                            sx={compactFieldSx}
                          />

                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              label="Stage No."
                              type="number"
                              value={row.sequence || index + 1}
                              onChange={(e) => updateVendorRow(index, { sequence: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            />
                            <TextField
                              select
                              label="Vendor Mode"
                              value={row.jobMode || 'jobwork_only'}
                              onChange={(e) => updateVendorRow(index, { jobMode: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            >
                              <MenuItem value="jobwork_only">Jobwork only</MenuItem>
                              <MenuItem value="own_material_sent">Own material sent</MenuItem>
                              <MenuItem value="vendor_with_material">Vendor with material</MenuItem>
                              <MenuItem value="mixed">Mixed</MenuItem>
                            </TextField>
                          </Stack>

                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              label="Input Item"
                              value={row.inputItem || ''}
                              onChange={(e) => updateVendorRow(index, { inputItem: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            />
                            <TextField
                              label="Output Item"
                              value={row.outputItem || ''}
                              onChange={(e) => updateVendorRow(index, { outputItem: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            />
                          </Stack>

                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              label="Qty"
                              type="number"
                              value={row.qty}
                              onChange={(e) => updateVendorRow(index, { qty: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            />
                            <TextField
                              label="Cost / Bill"
                              type="number"
                              value={row.amount}
                              onChange={(e) => updateVendorRow(index, { amount: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            />
                            <TextField
                              label="Advance Paid"
                              type="number"
                              value={row.advanceAmount || ''}
                              onChange={(e) => updateVendorRow(index, { advanceAmount: e.target.value })}
                              size="small"
                              fullWidth
                              sx={compactFieldSx}
                            />
                          </Stack>

                          <TextField
                            label="Due Date"
                            type="date"
                            value={row.dueDate}
                            onChange={(e) => updateVendorRow(index, { dueDate: e.target.value })}
                            size="small"
                            fullWidth
                            sx={compactFieldSx}
                            InputLabelProps={inputLabelProps}
                          />

                          <TextField
                            label="Note"
                            value={row.note}
                            onChange={(e) => updateVendorRow(index, { note: e.target.value })}
                            size="small"
                            fullWidth
                            sx={compactFieldSx}
                          />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </Paper>
          ) : null}

          {optionsLoading ? (
            <Paper sx={compactCardSx}>
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                <LoadingSpinner />
              </Box>
            </Paper>
          ) : null}
        </Stack>
      </FullscreenAddFormLayout>
    </>
  );
}