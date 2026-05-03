import React, { useState, useEffect } from 'react';
import axios from '../apiClient.js';
import { useNavigate } from 'react-router-dom';
import UpdateDelivery from '../Pages/updateDelivery';
import EditOrder from '../Components/editOrder';
import Print from '../Components/print';
import EditCustomer from '../Components/editCustomer';

export default function BillUpdate({ order, onClose }) {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState({});
  const [taskOptions, setTaskOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false); 
  const [selectedOrder, setSelectedOrder] = useState(null);  
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
    axios.get("/api/taskgroup/GetTaskgroupList")
      .then(res => {
        if (res.data.success) {
          const options = res.data.result.map(item => item.Task_group);
          setTaskOptions(options);
        }
      })
      .catch(err => {
        console.error("Error fetching task options:", err);
      });
  }, []);

  useEffect(() => {
    axios.get("/api/users/GetUserList")
      .then(res => {
        if (res.data.success) {
          const options = res.data.result.map(item => item.User_name);
          setUserOptions(options);
        }
      })
      .catch(err => {
        console.error("Error fetching user options:", err);
      });
  }, []);

  useEffect(() => {
    axios.get("/api/orders/GetOrderList")
      .then(res => {
        if (res.data.success) {
          setOrders(res.data.result);
        } else {
          setOrders([]);
        }
      })
      .catch(err => console.log('Error fetching order list:', err));
  }, []);

  useEffect(() => {
    axios.get("/api/customers/GetCustomersList")
      .then(res => {
        if (res.data.success) {
          const customerMap = res.data.result.reduce((acc, customer) => {
            if (customer.Customer_uuid && customer.Customer_name) {
              acc[customer.Customer_uuid] = customer.Customer_name;
            }
            return acc;
          }, {});
          setCustomers(customerMap);
        } else {
          setCustomers({});
        }
      })
      .catch(err => console.log('Error fetching customers list:', err));
  }, []);

  const handleSaveChanges = (e) => {
    e.preventDefault();

    if (!values.Task || !values.Assigned || !values.Delivery_Date) {
      alert('All fields are required.');
      return;
    }

    axios.post('/api/vendors/addVendor', {
      orderId: values.id,
      Order_Number: values.Order_Number,
      Order_uuid: values.Order_uuid,
      Item_uuid: values.Item
    })
      .then(res => {
        if (res.data.success) {
          alert('Vendor Save successfully!');
          onClose(); 
          navigate("/allOrder");  
        }
      })
      .catch(err => {
        console.log('Error updating vendor:', err);
      });
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
            <div className="flex gap-2">
              <EditOrder order={order} />
               <Print order={order} />
              <EditCustomer order={order} />
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
              <div className="flex items-center">
                <input
                  type="date"
                  value={values.Delivery_Date}
                  onChange={(e) => setValues({ ...values, Delivery_Date: e.target.value })}
                  placeholder="Delivery Date"
                  className="flex-grow p-2 border border-gray-300 rounded-lg"
                />
                <button type="submit" className="ml-2 bg-blue-500 text-white p-2 rounded-lg">
                  UPDATE
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

    </>
  );
}
