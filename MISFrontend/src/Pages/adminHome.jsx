import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import axios from '../apiClient.js';
import OrderUpdate from './OrderUpdate';
import AllOrder from "../Reports/allOrder";
import UserTask from "./userTask";
import { format } from 'date-fns';
import TaskUpdate from "./taskUpdate";
import { LoadingSpinner } from "../Components";

export default function AdminHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState('');
   const [userGroup, setUserGroup] = useState("");
  const [orders, setOrders] = useState([]); 
    const [attendance, setAttendance] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false); 
  const [selectedOrderId, setSelectedOrderId] = useState(null); 
     const [isLoading, setIsLoading] = useState(true);
     const [customers, setCustomers] = useState({});
     const [loggedInUser, setLoggedInUser] = useState(null);

     useEffect(() => {
           const group = localStorage.getItem("User_group");
           setUserGroup(group);
         }, []);

  useEffect(() => {
    setTimeout(() => {
    const userNameFromState = location.state?.id;
    const user = userNameFromState || localStorage.getItem('User_name');
    setLoggedInUser(user);
    if (user) {
      setUserName(user);
      fetchData(user); 
      fetchAttendanceData();
    } else {
      navigate("/login");
    }
  }, 2000);
  setTimeout(() => setIsLoading(false), 2000);
  }, [location.state, navigate]);

  const fetchUserNames = async () => {
    try {
      const response = await axios.get('/api/users/GetUserList');
      const data = response.data;

      if (data.success) {
        const userLookup = {};
        data.result.forEach(user => {
          userLookup[user.User_uuid] = user.User_name.trim();
        });
        return userLookup;
      } else {
        console.error('Failed to fetch user names:', data);
        return {};
      }
    } catch (error) {
      console.error('Error fetching user names:', error);
      return {};
    }
  };

 const fetchData = async (user) => {
     try {
         const [ordersRes, customersRes] = await Promise.all([
             axios.get("/api/orders/GetOrderList"),
             axios.get("/api/customers/GetCustomersList"),
         ]);
 
         if (ordersRes.data.success) {
             setOrders(ordersRes.data.result);
         } else {
             setOrders([]);
         }
 
         if (customersRes.data.success) {
             const customerMap = customersRes.data.result.reduce((acc, customer) => {
                 if (customer.Customer_uuid && customer.Customer_name) {
                     acc[customer.Customer_uuid] = customer.Customer_name;
                 } else {
                     console.warn("Invalid customer data:", customer);
                 }
                 return acc;
             }, {});
             setCustomers(customerMap);
         } else {
             setCustomers({});
         }
 
       
     } catch (err) {
         console.log('Error fetching data:', err);
     }
 };
 
   const filteredOrders = orders
     .map(order => {
       if (order.Status.length === 0) return order; 
   
       const highestStatusTask = order.Status.reduce((prev, current) => 
         (prev.Status_number > current.Status_number) ? prev : current
       );
   
       const customerName = customers[order.Customer_uuid] || "Unknown";
   
       return {
         ...order,
         highestStatusTask,
         Customer_name: customerName,
       };
     })
     .filter(order => order.highestStatusTask.Assigned === loggedInUser); 

  const fetchAttendanceData = async () => { 
    try {
      const userLookup = await fetchUserNames();
      
      const attendanceResponse = await axios.get('/api/attendance/GetAttendanceList');
      const attendanceRecords = attendanceResponse.data.result || [];
      const formattedData = processAttendanceData(attendanceRecords, userLookup);
      setAttendance(formattedData);

    } catch (error) {
      console.error("Error fetching attendance:", error);
    }
};

const processAttendanceData = (data, userLookup) => {
    const groupedData = new Map();
    const todayDate = new Date().toISOString().split("T")[0]; 

    data.forEach(({ Date: recordDate, User, Employee_uuid }) => {  
        if (!recordDate || isNaN(new Date(recordDate).getTime())) {
            console.error("Skipping invalid date:", recordDate);
            return;
        }

        const parsedDate = new Date(recordDate);
        const dateKey = parsedDate.toISOString().split("T")[0];

        if (dateKey !== todayDate) return; 

        const userName = userLookup[Employee_uuid.trim()] || 'Unknown';
        const userDateKey = `${userName}-${dateKey}`;

        if (!groupedData.has(userDateKey)) {
            groupedData.set(userDateKey, { 
                Date: dateKey, 
                User_name: userName,
                In: "N/A", 
                Break: "N/A", 
                Start: "N/A", 
                Out: "N/A", 
                TotalHours: "N/A"
            });
        }

        const record = groupedData.get(userDateKey);

        User.forEach(userEntry => {
            if (!userEntry.CreatedAt) return; 

            const formattedTime = format(new Date(userEntry.CreatedAt), "hh:mm a");

            switch (userEntry.Type) {
                case "In":
                    record.In = formattedTime;  
                    break;
                case "Break":
                    record.Break = formattedTime;
                    break;
                case "Start":
                    record.Start = formattedTime;
                    break;
                case "Out":
                    record.Out = formattedTime;
                    break;
                default:
                    console.warn("Unexpected Type:", userEntry.Type);
                    break;
            }
        });

    });

    return Array.from(groupedData.values()).map((record) => {
        record.TotalHours = calculateWorkingHours(record.In, record.Out, record.Break, record.Start);
        return record;
    });
};

const calculateWorkingHours = (inTime, outTime, breakTime, startTime) => {
    if (!inTime || !outTime) {
        return "N/A"; 
    }

    const parseTime = (timeStr) => {
        if (!timeStr || timeStr === "N/A") return null;
        const [time, period] = timeStr.split(" "); 
        const [hours, minutes] = time.split(":").map(Number);

        let hours24 = hours;
        if (period === "PM" && hours !== 12) hours24 += 12;
        if (period === "AM" && hours === 12) hours24 = 0;

        const now = new Date();
        now.setHours(hours24, minutes, 0, 0);
        return now;
    };

    const inDate = parseTime(inTime);
    const outDate = parseTime(outTime);
    const breakDate = parseTime(breakTime) || 0;
    const startDate = parseTime(startTime) || 0;

    if (!inDate || !outDate) {
        return "N/A";
    }

    let workDuration = (outDate - inDate) / 1000; 

    if (breakDate && startDate) {
        const breakDuration = (startDate - breakDate) / 1000;
        workDuration -= breakDuration; 
    }

    const hours = Math.floor(workDuration / 3600);
    const minutes = Math.floor((workDuration % 3600) / 60);
    const seconds = workDuration % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
};

  const handleOrderClick = (order) => {
    setSelectedOrderId(order); 
    setShowEditModal(true); 
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedOrderId(null); 
  };

 

  return (
    <>
      <AllOrder />
      <br /><br />
                 {isLoading ? (
                       <div className="flex justify-center py-4"><LoadingSpinner /></div>
                     ) : (
                 <div className="flex flex-col w-100 space-y-2 max-w-md mx-auto">
                       { filteredOrders.map((order, index) => (
                         <div key={index}>
                     <div onClick={() => handleOrderClick(order)} className="grid grid-cols-5 gap-1 flex items-center p-1 bg-white rounded-lg shadow-inner cursor-pointer">
                     <div className="w-12 h-12 p-2 col-start-1 col-end-1 bg-gray-100 rounded-full flex items-center justify-center">
                                   <strong className="text-l text-gray-500">
                                       {order.Order_Number}
                                   </strong>
                     </div>
                     <div className="p-2 col-start-2 col-end-8">
                           <strong className="text-l text-gray-900">{order.Customer_name}</strong><br />
                            <label className="text-xs">
                            {new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString()}{" "}  - {order.Items[i].Remark}
                           </label>
                       </div>
                       <div className="items-center justify-center text-right col-end-9 col-span-1">
                           <label className="text-xs pr-2">{order.highestStatusTask.Assigned}</label><br />
                            <label className="text-s text-blue-500 pr-2">{order.highestStatusTask.Task}</label>
                      </div> 
                    </div>
                    </div>
                   ))}
                </div>  
                )} 
               
               {isLoading ? (
  <div className="flex justify-center py-4"><LoadingSpinner /></div>
) : (
  <div className="flex flex-col w-100 space-y-2 max-w-md mx-auto">
  <table className="w-auto table-fixed border">
    <thead>
      <tr>
        <th className="border px-2 py-1 text-nowrap">Name</th>
        <th className="border px-2 py-1 text-nowrap">In</th>
        <th className="border px-2 py-1 text-nowrap">Break</th>
        <th className="border px-2 py-1 text-nowrap">Start</th>
        <th className="border px-2 py-1 text-nowrap">Out</th>
      </tr>
    </thead>
    <tbody>
      {attendance.map((row, index) => (
        <tr key={index}>
          <td className="border px-2 py-1">{row.User_name}</td>
          <td className="border px-2 py-1">{row.In}</td>
          <td className="border px-2 py-1">{row.Break}</td>
          <td className="border px-2 py-1">{row.Start}</td>
          <td className="border px-2 py-1">{row.Out}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
)}

      {showEditModal && (
                <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center w-full h-full">
                     <OrderUpdate order={selectedOrderId} onClose={closeEditModal} />
                </div>
            )}

    </>
  );
}
