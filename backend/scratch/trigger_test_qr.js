const API_URL = 'https://pos-qr-production-5142.up.railway.app';

async function sendTestQrOrder() {
  const payload = {
    tableId: '839E06CB-21CB-424B-A519-47A228A79EB4', // Table D21
    orderType: 'DINE_IN',
    entryStatus: 'q',
    items: [
      {
        id: '998F6E51-0063-4910-9D5A-5C25E4D3F93F', // red sauce pasta
        name: 'red sauce pasta (Test QR)',
        qty: 1,
        price: 8.50,
        status: 'SENT',
      },
      {
        id: 'DCF98AC7-699D-4F99-B34A-E1627F4F87CE', // Non-Veg Biriyani
        name: 'Non-Veg Biriyani (Test QR)',
        qty: 1,
        price: 12.00,
        status: 'SENT',
      }
    ]
  };

  console.log('Sending test QR order to Railway...');
  const res = await fetch(`${API_URL}/api/orders/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('Response:', data);
}

sendTestQrOrder().catch(console.error);
