import React from "react";
import EditOrder from "./editOrder";
import Print from "./print";
import WhatsApp from "./whatsApp";
import Note from "./note";
import EditCustomer from "./editCustomer";

export default function OrderActionButtons({ order }) {
  return (
    <div className="flex flex-wrap gap-2 my-3">
      <EditOrder order={order} />
      <Print order={order} />
      <WhatsApp order={order} />
      <Note order={order} />
      <EditCustomer order={order} />
    </div>
  );
}
