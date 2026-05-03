import React, { useState,useEffect, useRef} from 'react';
import OrderPrint from "../Pages/orderPrint";
import axios from '../apiClient.js';

export default function Print({ order }) {
   const printRef = useRef();
    const [showPrintModal, setShowPrintModal] = useState(false); 
    const [selectedOrder, setSelectedOrder] = useState(null);
     const [latestDeliveryDate, setLatestDeliveryDate] = useState("");
     const [customers, setCustomers] = useState({});

      useEffect(() => {
    axios.get("/api/customers/GetCustomersList")
      .then(res => {
        if (res.data.success) {
          const customerMap = res.data.result.reduce((acc, customer) => {
            if (customer.Customer_uuid && customer.Customer_name && customer.Mobile_number) {
              acc[customer.Customer_uuid] = {
                Customer_name: customer.Customer_name,
                Mobile_number: customer.Mobile_number,
              };
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
     
 useEffect(() => {
    if (order?.Status?.length) {
      const maxDeliveryDate = order.Status.reduce((latest, current) => {
        return new Date(current.Delivery_Date) > new Date(latest.Delivery_Date) ? current : latest;
      }, order.Status[0]);
      setLatestDeliveryDate(maxDeliveryDate.Delivery_Date);
    }
  }, [order]);

     const handlePrintClick = (order) => {
    setSelectedOrder(order); 
    setShowPrintModal(true);  
  };
const closePrintModal = () => {
    setShowPrintModal(false); 
    setSelectedOrder(null); 
  };
    return (
        <>
        <div className="flex gap-2">
           
          <button onClick={() => handlePrintClick(order)} className="p-2 rounded-full bg-white shadow hover:bg-gray-100">
        Pr
        
      </button>
        </div>
        <div ref={printRef} style={{ display: "none", position: "absolute", left: "-9999px", top: "-9999px" }}>
            <OrderPrint order={order} latestDeliveryDate={latestDeliveryDate} customerDetails={customers[order.Customer_uuid]} />
          </div>
        {showPrintModal && (
    <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
      <OrderPrint order={selectedOrder} onClose={closePrintModal} />
    </div>
  )}
    </>
    );
}

