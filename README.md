# Puja Donation Backend

Node.js + Express + MongoDB/Mongoose backend. Razorpay Checkout is implemented with server-side order creation, checkout signature verification, payment API verification, and webhook signature verification.

## 1. Install and run

```bash
npm install
cp .env.example .env
# edit .env values
npm run dev
```

API default: `http://localhost:5000`

## 2. Create first admin (one time)

Set a strong `ADMIN_BOOTSTRAP_KEY` in `.env`, then:

```http
POST /api/auth/bootstrap-admin
x-bootstrap-key: YOUR_ADMIN_BOOTSTRAP_KEY
Content-Type: application/json

{
  "name": "Administrator",
  "phone": "9999999999",
  "email": "admin@example.com",
  "password": "ChangeThisPassword123"
}
```

Remove/rotate `ADMIN_BOOTSTRAP_KEY` after creating admin. Admin login uses `/api/auth/login` like user login.

## 3. Razorpay setup (important)

1. In Razorpay Dashboard, switch to **Test Mode** and copy the Test Key ID and Key Secret into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Keep `RAZORPAY_CURRENCY=INR`.
3. Configure webhook URL: `https://YOUR_API_DOMAIN/api/donations/razorpay/webhook`.
4. Subscribe to `payment.captured` and `payment.failed` events. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET` (this is NOT the Key Secret).
5. Deploy/restart the backend after changing env credentials. Never expose `RAZORPAY_KEY_SECRET` or webhook secret in frontend.
6. Frontend loads Razorpay Checkout script `https://checkout.razorpay.com/v1/checkout.js`, calls create-order, opens Checkout using returned `razorpay.keyId`, and posts Checkout response fields to verify-payment.
7. Test success, failure, cancellation, duplicate webhook delivery, and amount mismatch in Test Mode. Use Live credentials only after account activation and your own compliance review.

### Frontend Checkout outline

```js
const orderResponse = await fetch(`${API}/api/donations/create-order`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ packageId, amount, amountOptionId })
});
const data = await orderResponse.json();
if (!data.success) throw new Error(data.message);

const options = {
  key: data.razorpay.keyId,
  amount: data.order.amount,
  currency: data.order.currency,
  name: "Your Puja Trust",
  description: "Puja Donation",
  order_id: data.order.id,
  prefill: data.donor,
  notes: { donationId: data.donationId },
  handler: async (response) => {
    const verify = await fetch(`${API}/api/donations/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ donationId: data.donationId, ...response })
    });
    const result = await verify.json();
    if (!result.success) throw new Error(result.message);
    // Show payment success and receipt/donation details.
  },
  modal: { ondismiss: () => console.log("Checkout closed") }
};
const checkout = new window.Razorpay(options);
checkout.open();
```

Load the script before the code above:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

**Important:** `payment.captured` webhook is the backup source of truth for asynchronous payment confirmation. Checkout handler alone is not proof of payment. This starter marks `receiptGenerated=true` after payment is captured/verified and allocates a unique receipt number at order creation; actual PDF/email receipt generation is not implemented.

## 4. Package payload examples

Static fixed-amount package:
```json
{
  "name": "Annadanam",
  "description": "Support community meal seva",
  "packageImg": "https://cdn.example.com/annadanam.jpg",
  "category": "static",
  "allowCustomAmount": false,
  "amounts": [
    { "amount": 501, "label": "Basic", "rules": ["One meal seva"] },
    { "amount": 1001, "label": "Family", "rules": ["Meal seva for family"] }
  ],
  "active": true
}
```

Static custom amount:
```json
{
  "name": "General Donation",
  "category": "static",
  "allowCustomAmount": true,
  "minAmt": 100,
  "maxAmt": 100000,
  "benefits": ["Support temple activities"],
  "active": true
}
```

Dynamic (date-limited) package:
```json
{
  "name": "Durga Puja Special",
  "category": "dynamic",
  "startDate": "2026-10-01T00:00:00.000Z",
  "endDate": "2026-10-31T23:59:59.999Z",
  "allowCustomAmount": true,
  "minAmt": 101,
  "maxAmt": 100000,
  "benefits": ["Special puja offering"],
  "active": true
}
```

## 5. API endpoints

- `POST /api/auth/register` user registration
- `POST /api/auth/login` `{identifier, password}` (phone or email)
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/bootstrap-admin` one-time protected admin bootstrap
- `GET /api/packages` public active packages; admin can view all with token
- `POST /api/packages` admin create; `PATCH/DELETE /api/packages/:id`
- `POST /api/donations/create-order` authenticated; server validates amount and creates Razorpay order
- `POST /api/donations/verify-payment` authenticated signature + payment API verification
- `POST /api/donations/razorpay/webhook` Razorpay webhook (raw body)
- `GET /api/donations/my` current user's donations
- `GET /api/donations/admin/all` admin donation list filters `status,userId,from,to`
- `GET /api/donations/summary` admin totals + donor aggregate
- `GET /api/donations/:id` owner or admin
- `POST /api/bookings`, `GET /api/bookings/my`; admin `/admin/all`, `PATCH /:id`
- `GET /api/puja-updates` published updates; admin create/edit/publish/delete
- `GET/PATCH /api/users/profile`; admin `GET /api/users`, `/api/admin/users`
- `GET /api/users/:userId/donations` owner or admin

## Production checklist

- Use HTTPS; set exact `FRONTEND_URL` origins and production cookie settings.
- Use a strong unique JWT secret and bootstrap key; remove bootstrap key after admin creation.
- Add schema validation/rate limiting/monitoring appropriate to deployment.
- Add receipt PDF + email delivery and a push provider (e.g. Firebase Cloud Messaging) before production launch.
- Keep Razorpay secrets server-only. Webhook endpoint must receive raw request bytes.
- Review tax/80G eligibility and receipt wording with your organization; don't claim tax exemption unless authorized.
