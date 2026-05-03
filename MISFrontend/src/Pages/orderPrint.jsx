import React, { useRef, useState, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import axios from '../apiClient.js';



const OrderPrint = ({ order, onClose }) => {
  const [customers, setCustomers] = useState({});
  const [latestDeliveryDate, setLatestDeliveryDate] = useState("");
  const componentRef = useRef();

  useEffect(() => {
    axios.get("/api/customers/GetCustomersList").then((res) => {
      if (res.data.success) {
        const customerMap = res.data.result.reduce((acc, customer) => {
          acc[customer.Customer_uuid] = {
            Customer_name: customer.Customer_name,
            Mobile_number: customer.Mobile_number,
          };
          return acc;
        }, {});
        setCustomers(customerMap);
      }
    });
  }, []);

  useEffect(() => {
    if (order?.Status?.length) {
      const maxDeliveryDate = order.Status.reduce((latest, current) => {
        return new Date(current.Delivery_Date) > new Date(latest.Delivery_Date) ? current : latest;
      }, order.Status[0]);
      setLatestDeliveryDate(maxDeliveryDate.Delivery_Date);
    }
  }, [order]);

  const handlePrint = useReactToPrint({ contentRef: componentRef });

  const handleDownloadPDF = () => {
    const element = componentRef.current;
    const opt = {
      margin: 0.3,
      filename: `invoice-${order.Order_Number}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
    };
    html2pdf().set(opt).from(element).save();
  };

  const customerDetails = customers[order?.Customer_uuid] || {};

  const logoUrl = "https://res.cloudinary.com/dadcprflr/image/upload/v1746623937/mern-images/yecehdut0oz4fnieubyx.jpg";
  const qrCodeUrl = "https://res.cloudinary.com/dadcprflr/image/upload/v1746623937/mern-images/yecehdut0oz4fnieubyx.jpg"; // Replace with actual QR later

  return (
    <div className="p-4 text-center">
      <div className="flex flex-wrap justify-center gap-3 mb-4">
        <button onClick={handlePrint} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Print</button>
        <button onClick={handleDownloadPDF} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Download PDF</button>
        <button onClick={onClose} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Cancel</button>
      </div>

      <div ref={componentRef} className="bg-white p-4 max-w-3xl mx-auto shadow-md rounded-md text-sm md:text-base">
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <div>
            <img src={logoUrl} alt="Company Logo" className="h-14 rounded-md" />
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold">S.K. DIGITAL</h1>
            <p className="text-xs md:text-sm">
              In Front of Santoshi Mata Mandir, Krishnapura Ward, Gondia<br />
              Email: skgondia@gmail.com | Mob: 9372633633
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <p><strong>Party:</strong> {customerDetails.Customer_name}</p>
            <p><strong>Mobile:</strong> {customerDetails.Mobile_number}</p>
          </div>
          <div className="text-right">
            <p><strong>Bill No.:</strong> {order.Order_Number}</p>
            <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString()}</p>
            <p><strong>Delivery:</strong> {new Date(latestDeliveryDate).toLocaleDateString()}</p>
          </div>
        </div>

        <table className="w-full border text-left text-xs md:text-sm">
          <thead className="bg-gray-200 text-gray-700 uppercase">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item, index) => (
              <tr key={index} className="border-b">
                <td className="px-3 py-1">{item.item_title}</td>
                <td className="px-3 py-1">{item.units}</td>
                <td className="px-3 py-1">{item.price}</td>
                <td className="px-3 py-1">{item.item_total}</td>
              </tr>
            ))}
            <tr>
              <td colSpan="3" className="px-3 py-1 text-right font-semibold">Total</td>
              <td className="px-3 py-1 font-semibold">{order?.Amount}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 text-sm">
          <p className="font-medium">UPI: sbi@ybl</p>
          <p className="font-medium">GPAY: 9372633633</p>
        </div>

        <div className="mt-4">
          <img src={qrCodeUrl} alt="QR Code" className="h-32 mx-auto" />
          <p className="text-center text-xs mt-2">Scan to Pay</p>
        </div>
      </div>
    </div>
  );
};

export default OrderPrint;
