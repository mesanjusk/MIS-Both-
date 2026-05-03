import React, { useState, useEffect} from 'react';
import axios from '../apiClient.js';

export default function WhatsApp({ order }) {
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
  

     const handleWhatsAppClick = async (order) => {
    const customerUUID = order.Customer_uuid;
    const customer = customers[customerUUID];
  
    if (!customer) {
      alert("Customer information not found.");
      return;
    }
  
    const customerName = customer.Customer_name?.trim() || "Customer";
    let phoneNumber = customer.Mobile_number?.toString().trim() || "";
  
    if (!phoneNumber) {
      alert("Phone number is missing.");
      return;
    }
  
    phoneNumber = phoneNumber.replace(/\D/g, "");
  
    if (phoneNumber.length !== 10) {
      alert("Phone number must be 10 digits.");
      return;
    }
  
    const payload = {
      userName: customerName,
      mobile: phoneNumber,
      type: "order_update",
    };
  
    console.log("Sending payload:", payload); 
  
    try {
      const { data: result } = await axios.post('/api/usertasks/send-message', payload);
      console.log("Message sent:", result);

      if (result.error) {
        alert("Failed to send: " + result.error);
      } else {
        alert("Message sent successfully.");
      }
    } catch (error) {
      console.error("Request failed:", error);
      alert("Failed to send message.");
    }
  };

    return (
      
        <div className="flex gap-2">
           
         <button onClick={() => handleWhatsAppClick(order)} className="p-2 rounded-full bg-white shadow hover:bg-gray-100">
        WP
        
      </button>
        </div>
        
    );
}

