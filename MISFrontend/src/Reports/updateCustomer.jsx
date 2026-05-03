import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { fetchCustomers } from '../services/customerService.js';
import { fetchPayments } from '../services/paymentService.js';
import { updateOrder } from '../services/orderService.js';
import AddCustomer from '../Pages/addCustomer';

export default function UpdateCustomer({order, onClose}) {
    const navigate = useNavigate();

    const [Customer_name, setCustomer_Name] = useState('');
    const [Customer_uuid, setCustomer_uuid] = useState('');
    const [userGroup, setUserGroup] = useState("");
    const [Remark, setRemark] = useState('');
    const [customerOptions, setCustomerOptions] = useState([]);
    const [filteredOptions, setFilteredOptions] = useState([]);
    const [showOptions, setShowOptions] = useState(false);
    const [isAdvanceChecked, setIsAdvanceChecked] = useState(false);
    const [Amount, setAmount] = useState('');
    const [cashPaymentModeUuid, setCashPaymentModeUuid] = useState(null);
    const [loggedInUser, setLoggedInUser] = useState('');
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [accountCustomerOptions, setAccountCustomerOptions] = useState([]);
    const [group, setGroup] = useState('');
     const [values, setValues] = useState({
        id: order?._id || '',
        Customer_name: order?.Customer_name || '',
        Order_Number: order?.Order_Number || '',
        Remark: order?.Remark || '',
        Order_uuid: order?.Order_uuid || '',  
        Item: order?.Item || '',
        Delivery_Date: order?.highestStatusTask?.Delivery_Date || '',
        Assigned: order?.highestStatusTask?.Assigned || '',
        Task: order?.highestStatusTask?.Task || '',
        CreatedAt: order?.highestStatusTask?.CreatedAt || new Date().toISOString().split("T")[0],
        Status: order?.Status || []
      });

    useEffect(() => {
        const userNameFromState = location.state?.id;
        const logInUser = userNameFromState || localStorage.getItem('User_name');
        if (logInUser) setLoggedInUser(logInUser);
        else navigate("/login");
    }, [location.state, navigate]);

    useEffect(() => {
        const group = localStorage.getItem("User_group");
        setUserGroup(group);
    }, []);

    useEffect(() => {
        fetchCustomers().then(res => {
            if (res.data.success) {
                setCustomerOptions(res.data.result);
                const accountOptions = res.data.result.filter(item => item.Customer_group === "Account");
                setAccountCustomerOptions(accountOptions);
            }
        }).catch(err => console.error("Error fetching customer options:", err));

        fetchPayments().then(res => {
            if (res.data.success) {
                const cashPaymentMode = res.data.result.find(mode => mode.Payment_name === "Cash");
                if (cashPaymentMode) {
                    setCashPaymentModeUuid(cashPaymentMode.Payment_mode_uuid);
                }
            }
        }).catch(err => console.error("Error fetching payment modes:", err));
    }, []);

    const handleSaveChanges = async (e) => {
        e.preventDefault();
        try {
            const customer = customerOptions.find(option => option.Customer_name === Customer_name);
           
            if (!customer) return alert("Invalid Customer selection.");

           await updateOrder(order.Order_uuid, {
                Customer_uuid: customer.Customer_uuid,
            })   .then(res => {
              if (res.data.success) {
                alert('Order updated successfully!');
                onClose(); 
                navigate("/allOrder");  
              }
            })

        } catch (e) {
            console.error("Error adding Order or Transaction:", e);
        }
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setCustomer_Name(value);
        if (value) {
            const filtered = customerOptions.filter(option =>
                option.Customer_name.toLowerCase().includes(value.toLowerCase()));
            setFilteredOptions(filtered);
            setShowOptions(true);
        } else {
            setShowOptions(false);
        }
    };

    const handleOptionClick = (option) => {
        setCustomer_Name(option.Customer_name);
        setCustomer_uuid(option.Customer_uuid);
        setShowOptions(false);
    };

    const handleAdvanceCheckboxChange = () => {
        setIsAdvanceChecked(prev => !prev);
        setAmount('');
    };

    const handleCustomer = () => setShowCustomerModal(true);
    const exitModal = () => setShowCustomerModal(false);

    const closeModal = () => {
        if (userGroup === "Office User") navigate("/home");
        else if (userGroup === "Admin User") navigate("/home");
    };

    return (
        <>
         <div className="w-4/4 h-full pt-10 flex flex-col">
        <div className="p-3 bg-blue-200 grid grid-cols-5 gap-1 items-center">
          <button type="button" onClick={onClose}>X</button>
          <div className="w-12 h-12 p-2 col-start-1 col-end-1 bg-gray-100 rounded-full flex items-center justify-center">
            <strong className="text-l text-gray-500">{values.Order_Number}</strong>
          </div>
          <div>
            <div className="p-2 col-start-2 col-end-4">
              <strong className="text-l text-gray-900">{values.Customer_name}</strong>
              <br />
            </div>        
          </div>
          <div>
            <div className="p-2 row-start-2 row-end-4">
              <button onClick={() => handleEditClick(order)} className="btn">
                <svg className="h-6 w-6 text-blue-500" width="12" height="12" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z"/>
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3l-11 11l-4 1l1 -4z"/>
                </svg>
              </button>
              <br />
            </div>       
          </div>
        </div>
        
        <div className="flex-1 overflow-y-scroll bg-gray-100 p-4">
          <div className="bg-blue-100 p-3 mb-2 text-right-xs rounded-lg shadow-lg w-3/4 ml-auto">
            <p className="text-sm text-gray-600">{values.Remark}</p>
          </div>
       
          <form onSubmit={handleSaveChanges}>
           

            <div className="pb-14 border-t border-gray-300">
              <div className="mb-4 relative">
              <input
          type="text"
          placeholder="Search by Customer Name"
          className="w-full p-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#25D366]"
          value={Customer_name}
          onChange={handleInputChange}
          onFocus={() => setShowOptions(true)}
        />
        {showOptions && filteredOptions.length > 0 && (
          <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md mt-1 shadow-md">
            {filteredOptions.map((option, index) => (
              <li
                key={index}
                className="px-4 py-2 hover:bg-[#f0f2f5] cursor-pointer"
                onClick={() => handleOptionClick(option)}
              >
                {option.Customer_name}
              </li>
            ))}
          </ul>
        )}
   
   <br /><br />
      <button onClick={handleCustomer} type="button" className="text-white p-2 rounded-full bg-blue-500 mb-3">
      <svg className="h-8 w-8" width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none">
                                <path stroke="none" d="M0 0h24v24H0z"/>  
                                <circle cx="12" cy="12" r="9" />  
                                <line x1="9" y1="12" x2="15" y2="12" />  
                                <line x1="12" y1="9" x2="12" y2="15" />
                            </svg>
      </button>
<br /><br />
                <button type="submit" className="ml-2 bg-blue-500 text-white p-2 rounded-lg">
                  UPDATE
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
           
       

     
{showCustomerModal && (
        <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
          <AddCustomer onClose={exitModal}/>
        </div>
      )}
            
        </>
    );
}
